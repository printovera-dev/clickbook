"""Iteration 9: production Downloads package on payment + notification system.
Uses mock pay (POST /api/orders/pay) only — never touches Razorpay live keys."""
import os
import re
import time
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://memories-album.preview.emergentagent.com").rstrip("/")
ASSETS = "/app/backend/tests/assets"
_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
_WORKER_NUM = "".join(c for c in _WORKER if c.isdigit()) or "0"
MOBILE = f"987650099{_WORKER_NUM}"


@pytest.fixture(scope="module")
def sess():
    return requests.Session()


def _login(sess, mobile):
    r = sess.post(f"{BASE}/api/auth/otp/send", json={"mobile": mobile, "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_hint") or "123456"
    m = re.search(r"(\d{6})", str(otp))
    r2 = sess.post(f"{BASE}/api/auth/otp/verify", json={"mobile": mobile, "otp": m.group(1) if m else otp})
    assert r2.status_code == 200, r2.text
    return r2.json()


@pytest.fixture(scope="module")
def customer(sess):
    return _login(sess, MOBILE)


@pytest.fixture(scope="module")
def auth_h(customer):
    return {"Authorization": f"Bearer {customer['token']}"}


@pytest.fixture(scope="module")
def admin_token(sess):
    r = sess.post(f"{BASE}/api/admin/login", json={"username": "admin", "password": "clickbook@2026"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def paid_order(sess, auth_h):
    cover_id = sess.get(f"{BASE}/api/covers").json()["covers"][0]["id"]
    a = sess.post(f"{BASE}/api/albums", headers=auth_h, json={"cover_id": cover_id, "name": "Iter9 Print Pack"}).json()["album"]
    for i in (1, 2, 3):
        with open(f"{ASSETS}/test_photo_{i}.jpg", "rb") as f:
            up = sess.post(f"{BASE}/api/albums/{a['id']}/photos", headers=auth_h, files={"file": (f"p{i}.jpg", f, "image/jpeg")})
            assert up.status_code == 200, up.text
    g = sess.post(f"{BASE}/api/albums/{a['id']}/generate", headers=auth_h, json={"allow_short": True, "style": "balanced"})
    assert g.status_code == 200, g.text
    o = sess.post(f"{BASE}/api/orders", headers=auth_h, json={
        "album_id": a["id"], "gift_wrap": False,
        "address": {"name": "Iter Nine", "line1": "1 Print St", "city": "Pune", "state": "MH", "pincode": "411001", "mobile": MOBILE}})
    assert o.status_code == 200, o.text
    order = o.json()["order"]
    p = sess.post(f"{BASE}/api/orders/pay", headers=auth_h, json={"order_id": order["id"], "payment_method": "mock"})
    assert p.status_code == 200, p.text
    return order


def _wait_package(sess, admin_h, order_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = sess.get(f"{BASE}/api/admin/orders/{order_id}/downloads", headers=admin_h)
        assert r.status_code == 200, r.text
        body = r.json()
        if body["package"].get("status") in ("ready", "failed"):
            return body
        time.sleep(2)
    pytest.fail("production package did not finish building in time")


class TestProductionPackage:
    def test_payment_builds_downloads_folder(self, sess, admin_h, paid_order):
        body = _wait_package(sess, admin_h, paid_order["id"])
        pkg = body["package"]
        assert pkg["status"] == "ready", pkg
        assert pkg["dir"].startswith("Downloads/")
        assert paid_order["order_no"] in pkg["dir"]
        names = {f["name"] for f in body["files"]}
        assert "Album.pdf" in names
        assert "Cover/cover.jpg" in names
        assert "manifest.json" in names
        pages = sorted(n for n in names if n.startswith("Print/page_"))
        assert pages == [f"Print/page_{i:03d}.jpg" for i in range(1, pkg["pages"] + 1)]
        assert pkg["pages"] == len(paid_order["album_snapshot"]["pages"])

    def test_files_are_served_and_print_res(self, sess, admin_h, paid_order):
        body = _wait_package(sess, admin_h, paid_order["id"])
        pkg = body["package"]
        pdf = sess.get(f"{BASE}{pkg['pdf_url']}")
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        cover = sess.get(f"{BASE}{pkg['cover_url']}")
        assert cover.status_code == 200
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(cover.content))
        assert img.size == (2400, 2400)  # 8in @ 300dpi
        page1 = sess.get(f"{BASE}{pkg['print_urls'][0]}")
        assert Image.open(io.BytesIO(page1.content)).size == (2400, 2400)

    def test_order_record_has_pdf_url(self, sess, auth_h, admin_h, paid_order):
        _wait_package(sess, admin_h, paid_order["id"])
        o = sess.get(f"{BASE}/api/orders/{paid_order['id']}", headers=auth_h).json()["order"]
        assert o["production_package"]["status"] == "ready"
        assert o["pdf_url"].endswith("/Album.pdf")

    def test_admin_rebuild_and_zip(self, sess, admin_h, admin_token, paid_order):
        r = sess.post(f"{BASE}/api/admin/orders/{paid_order['id']}/pdf", headers=admin_h)
        assert r.status_code == 200, r.text
        assert r.json()["package"]["status"] == "ready"
        z = sess.get(f"{BASE}/api/admin/orders/{paid_order['id']}/downloads.zip", params={"token": admin_token})
        assert z.status_code == 200 and z.content[:2] == b"PK"
        import zipfile, io
        zf = zipfile.ZipFile(io.BytesIO(z.content))
        assert "Album.pdf" in zf.namelist() and "Cover/cover.jpg" in zf.namelist()
        bad = sess.get(f"{BASE}/api/admin/orders/{paid_order['id']}/downloads.zip", params={"token": "nope"})
        assert bad.status_code == 401


class TestNotifications:
    def test_payment_creates_order_confirmed_notification(self, sess, auth_h, paid_order):
        r = sess.get(f"{BASE}/api/notifications", headers=auth_h)
        assert r.status_code == 200
        items = r.json()["notifications"]
        conf = [n for n in items if n["type"] == "order" and n["order_id"] == paid_order["id"]]
        assert conf, items
        assert r.json()["unread_count"] >= 1

    def test_status_change_notifies_customer(self, sess, auth_h, admin_h, paid_order):
        r = sess.put(f"{BASE}/api/admin/orders/{paid_order['id']}/status", headers=admin_h,
                     json={"production_status": "printing", "note": ""})
        assert r.status_code == 200
        items = sess.get(f"{BASE}/api/notifications", headers=auth_h).json()["notifications"]
        st = [n for n in items if n["type"] == "status" and n["order_id"] == paid_order["id"]]
        assert st and "Printing" in st[0]["title"]

    def test_admin_targeted_send_and_read(self, sess, auth_h, admin_h, customer):
        cid = customer["customer"]["id"]
        r = sess.post(f"{BASE}/api/admin/notifications", headers=admin_h,
                      json={"customer_id": cid, "title": "Correction needed", "body": "Page 3 photo is low-res.", "type": "correction"})
        assert r.status_code == 200 and r.json()["sent"] == 1
        lst = sess.get(f"{BASE}/api/notifications", headers=auth_h).json()
        n = next(x for x in lst["notifications"] if x["title"] == "Correction needed")
        assert n["read"] is False
        before = lst["unread_count"]
        rr = sess.post(f"{BASE}/api/notifications/{n['id']}/read", headers=auth_h)
        assert rr.status_code == 200
        after = sess.get(f"{BASE}/api/notifications", headers=auth_h).json()["unread_count"]
        assert after == before - 1

    def test_broadcast_reaches_everyone_and_read_all(self, sess, auth_h, admin_h):
        other = _login(sess, f"987650098{_WORKER_NUM}")
        r = sess.post(f"{BASE}/api/admin/notifications", headers=admin_h,
                      json={"title": "Offer ends soon", "body": "WELCOME2026 expires tonight.", "type": "offer"})
        assert r.status_code == 200 and r.json()["broadcast"] is True and r.json()["sent"] >= 2
        for h in (auth_h, {"Authorization": f"Bearer {other['token']}"}):
            items = sess.get(f"{BASE}/api/notifications", headers=h).json()["notifications"]
            assert any(n["title"] == "Offer ends soon" for n in items)
        ra = sess.post(f"{BASE}/api/notifications/read-all", headers=auth_h)
        assert ra.status_code == 200
        assert sess.get(f"{BASE}/api/notifications", headers=auth_h).json()["unread_count"] == 0
        hist = sess.get(f"{BASE}/api/admin/notifications", headers=admin_h).json()["notifications"]
        row = next(x for x in hist if x["title"] == "Offer ends soon")
        assert row["recipients"] >= 2 and row["customer"] is None

    def test_validation(self, sess, admin_h, auth_h):
        assert sess.post(f"{BASE}/api/admin/notifications", headers=admin_h, json={"title": "x", "body": "y", "type": "bogus"}).status_code == 400
        assert sess.post(f"{BASE}/api/admin/notifications", headers=admin_h, json={"title": " ", "body": "y"}).status_code == 400
        assert sess.post(f"{BASE}/api/admin/notifications", headers=admin_h, json={"title": "x", "body": "y", "customer_id": "nope"}).status_code == 404
        assert sess.post(f"{BASE}/api/notifications/nope/read", headers=auth_h).status_code == 404
        assert sess.get(f"{BASE}/api/notifications").status_code == 401
