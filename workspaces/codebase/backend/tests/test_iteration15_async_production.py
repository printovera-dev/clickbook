"""Iteration 15 — async 'Build production files' flow.

Verifies that POST /admin/orders/{id}/pdf returns 202 immediately and the package
builds in the background. Also verifies stale-build handling, idempotent restart,
and 404/400 error cases."""
import io
import os
import time
import zipfile

import pytest
import requests
from PIL import Image
from pymongo import MongoClient
from pypdf import PdfReader

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN_USER = "admin"
ADMIN_PASS = "clickbook@2026"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_headers(session):
    r = session.post(f"{API}/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["token"]


@pytest.fixture(scope="module")
def paid_order(session, admin_headers):
    headers, _ = admin_headers
    r = session.get(f"{API}/admin/orders", headers=headers)
    assert r.status_code == 200, r.text
    orders = r.json()["orders"]
    candidate = next((o for o in orders
                       if o.get("payment_status") == "paid" and o.get("album_snapshot")
                       and (o["album_snapshot"].get("pages") or [])), None)
    assert candidate, "No paid order with album_snapshot found; cannot test production build"
    return candidate


@pytest.fixture(scope="module")
def mongo_db():
    url = _read_env("MONGO_URL")
    name = _read_env("DB_NAME")
    client = MongoClient(url)
    yield client[name]
    client.close()


def _read_env(key: str) -> str:
    """Load MONGO_URL / DB_NAME directly from backend/.env (not exported to this process)."""
    env_path = "/app/backend/.env"
    with open(env_path) as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError(f"{key} missing from {env_path}")


# ---------- async build happy path ----------

class TestAsyncBuild:

    def test_post_pdf_returns_202_quickly(self, session, admin_headers, paid_order):
        headers, _ = admin_headers
        t0 = time.time()
        r = session.post(f"{API}/admin/orders/{paid_order['id']}/pdf", headers=headers)
        elapsed = time.time() - t0
        assert r.status_code == 202, r.text
        body = r.json()
        assert body.get("status") == "building"
        assert body.get("package", {}).get("status") == "building"
        assert body["package"].get("started_at")
        assert elapsed < 3.0, f"POST took {elapsed:.2f}s, expected < 3s"

    def test_second_post_is_idempotent(self, session, admin_headers, paid_order):
        headers, _ = admin_headers
        r = session.post(f"{API}/admin/orders/{paid_order['id']}/pdf", headers=headers)
        assert r.status_code == 202, r.text
        body = r.json()
        assert body["status"] == "building"
        # Must indicate it is already being rendered (safe message, no stack trace)
        assert "already" in (body.get("message") or "").lower()

    def test_polling_until_ready(self, session, admin_headers, paid_order):
        headers, _ = admin_headers
        deadline = time.time() + 180
        pkg = None
        while time.time() < deadline:
            r = session.get(f"{API}/admin/orders/{paid_order['id']}/downloads", headers=headers)
            assert r.status_code == 200, r.text
            pkg = r.json()["package"]
            if pkg.get("status") in ("ready", "failed"):
                break
            time.sleep(2)
        assert pkg and pkg.get("status") == "ready", f"Package did not become ready: {pkg}"
        pages_expected = len(paid_order["album_snapshot"]["pages"])
        assert pkg["pages"] == pages_expected
        assert len(pkg["print_urls"]) == pages_expected
        assert pkg.get("pdf_url") and pkg.get("cover_url") and pkg.get("back_cover_url")
        assert pkg.get("size_bytes", 0) > 0


# ---------- download verification ----------

class TestDownloads:

    def test_album_pdf(self, session, admin_headers, paid_order):
        headers, _ = admin_headers
        r = session.get(f"{API}/admin/orders/{paid_order['id']}/downloads", headers=headers)
        pkg = r.json()["package"]
        pdf_url = pkg["pdf_url"]
        if pdf_url.startswith("/"):
            pdf_url = BASE + pdf_url
        resp = session.get(pdf_url)
        assert resp.status_code == 200, pdf_url
        assert resp.headers.get("content-type", "").startswith("application/pdf")
        reader = PdfReader(io.BytesIO(resp.content))
        pages_expected = len(paid_order["album_snapshot"]["pages"])
        assert len(reader.pages) == pages_expected + 2, f"PDF has {len(reader.pages)} pages, expected {pages_expected + 2}"
        p0 = reader.pages[0]
        box = p0.mediabox
        # mediabox 576 x 576 pt
        assert abs(float(box.width) - 576.0) < 0.5
        assert abs(float(box.height) - 576.0) < 0.5
        # First page must contain an image 2400x2400
        resources = p0.get("/Resources") or {}
        xobjects = resources.get("/XObject") if hasattr(resources, "get") else None
        if xobjects is not None:
            xobj = xobjects.get_object()
            found = False
            for name in xobj:
                obj = xobj[name].get_object()
                if obj.get("/Subtype") == "/Image":
                    if int(obj.get("/Width", 0)) == 2400 and int(obj.get("/Height", 0)) == 2400:
                        found = True
                        break
            assert found, "No 2400x2400 image found on cover page"

    def test_cover_images(self, session, admin_headers, paid_order):
        headers, _ = admin_headers
        r = session.get(f"{API}/admin/orders/{paid_order['id']}/downloads", headers=headers)
        pkg = r.json()["package"]
        for key in ("cover_url", "back_cover_url"):
            url = pkg[key]
            if url.startswith("/"):
                url = BASE + url
            resp = session.get(url)
            assert resp.status_code == 200, url
            assert resp.headers.get("content-type", "").startswith("image/jpeg")
            with Image.open(io.BytesIO(resp.content)) as im:
                assert im.size == (2400, 2400), f"{key} is {im.size}, expected (2400, 2400)"

    def test_downloads_zip(self, session, admin_headers, paid_order):
        _, token = admin_headers
        url = f"{API}/admin/orders/{paid_order['id']}/downloads.zip?token={token}"
        resp = session.get(url)
        assert resp.status_code == 200, resp.text[:200]
        assert resp.headers.get("content-type") == "application/zip"
        z = zipfile.ZipFile(io.BytesIO(resp.content))
        names = z.namelist()
        rels = names  # archive paths are relative to the package folder (Album.pdf, Cover/..., Print/...)
        assert any(r == "Album.pdf" for r in rels), rels
        assert any(r == "Cover/back_cover.jpg" for r in rels), rels
        assert any(r.startswith("Print/page_") and r.endswith(".jpg") for r in rels), rels
        assert any(r == "manifest.json" for r in rels), rels


# ---------- stale build handling ----------

class TestStaleBuild:

    def test_stale_build_marked_failed_then_restart(self, session, admin_headers, paid_order, mongo_db):
        headers, _ = admin_headers
        # Snapshot the current good package so we can restore from it afterwards
        order_doc = mongo_db.orders.find_one({"id": paid_order["id"]}, {"production_package": 1})
        prior_pkg = order_doc.get("production_package")

        # Force stale 'building' status
        mongo_db.orders.update_one({"id": paid_order["id"]}, {"$set": {"production_package": {
            "status": "building", "started_at": "2026-01-01T00:00:00+00:00"}}})

        r = session.get(f"{API}/admin/orders/{paid_order['id']}/downloads", headers=headers)
        assert r.status_code == 200
        pkg = r.json()["package"]
        assert pkg["status"] == "failed", pkg
        err = (pkg.get("error") or "")
        assert "did not finish" in err.lower(), err
        # safe message — no stack trace or file paths
        assert "/app" not in err and "Traceback" not in err

        # POST /pdf should restart and eventually complete
        t0 = time.time()
        r = session.post(f"{API}/admin/orders/{paid_order['id']}/pdf", headers=headers)
        assert r.status_code == 202, r.text
        assert "Rendering started" in (r.json().get("message") or "")
        assert time.time() - t0 < 3.0

        # Poll to ready
        deadline = time.time() + 180
        pkg = None
        while time.time() < deadline:
            d = session.get(f"{API}/admin/orders/{paid_order['id']}/downloads", headers=headers)
            pkg = d.json()["package"]
            if pkg.get("status") in ("ready", "failed"):
                break
            time.sleep(2)
        assert pkg and pkg["status"] == "ready", pkg

        # Restore safety: if restart failed to produce a good package, write prior one back.
        # (We only reach here if the new package is ready, but we keep this as a no-op fallback.)
        if prior_pkg and pkg.get("status") != "ready":
            mongo_db.orders.update_one({"id": paid_order["id"]}, {"$set": {"production_package": prior_pkg}})


# ---------- error cases ----------

class TestErrorCases:

    def test_pdf_unknown_order_404(self, session, admin_headers):
        headers, _ = admin_headers
        r = session.post(f"{API}/admin/orders/does-not-exist/pdf", headers=headers)
        assert r.status_code == 404, r.text

    def test_pdf_unpaid_or_no_snapshot_400(self, session, admin_headers):
        headers, _ = admin_headers
        r = session.get(f"{API}/admin/orders", headers=headers)
        orders = r.json()["orders"]
        # An order without album_snapshot is any order where that field is missing/empty
        candidate = next((o for o in orders if not o.get("album_snapshot")), None)
        if not candidate:
            pytest.skip("No order without album_snapshot available to test 400 case")
        r = session.post(f"{API}/admin/orders/{candidate['id']}/pdf", headers=headers)
        assert r.status_code == 400, r.text
        assert "snapshot" in r.text.lower()
