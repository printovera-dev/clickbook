"""Iteration 13 — Admin JWT auth, dashboard, payments, albums, customers, layouts/backgrounds CRUD,
home CMS last_page_url, production package with last-page sheet, and PWA static assets."""
import os
import pytest
import requests
import sys, os as _os; sys.path.insert(0, _os.path.dirname(__file__))
from _pdf_helper import build_package

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://memories-album.preview.emergentagent.com").rstrip("/")
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "clickbook@2026"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and "expires_in" in body and "admin" in body
    assert body["admin"]["username"] == "admin"
    return body["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---- Admin auth ----

class TestAdminAuth:
    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/admin/login", json={"username": "admin", "password": "wrong-pass"})
        assert r.status_code == 401

    def test_me_with_token(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["admin"]["username"] == "admin"

    def test_me_without_token(self, api):
        r = requests.get(f"{BASE_URL}/api/admin/me")
        assert r.status_code == 401

    def test_me_bad_token(self, api):
        r = requests.get(f"{BASE_URL}/api/admin/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401

    def test_password_wrong_current(self, api, auth_headers):
        r = api.put(f"{BASE_URL}/api/admin/password", headers=auth_headers,
                    json={"current_password": "wrong", "new_password": "newpassword123"})
        assert r.status_code == 400

    def test_password_change_same_value(self, api, auth_headers):
        # Keep password unchanged: re-set it to clickbook@2026
        r = api.put(f"{BASE_URL}/api/admin/password", headers=auth_headers,
                    json={"current_password": ADMIN_PASSWORD, "new_password": ADMIN_PASSWORD})
        assert r.status_code == 200
        # Verify still able to login with original password
        r2 = api.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
        assert r2.status_code == 200


# ---- Dashboard & reports ----

class TestDashboard:
    def test_dashboard_shape(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/dashboard", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("revenue", "total_orders", "paid_orders", "pending_payments", "sheets_sold", "customers", "albums", "daily"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["daily"], list) and len(d["daily"]) == 14

    def test_payments(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/payments", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert "payments" in body and isinstance(body["payments"], list)
        s = body["summary"]
        for k in ("collected", "paid", "pending", "pending_amount"):
            assert k in s

    def test_albums(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/albums", headers=auth_headers)
        assert r.status_code == 200
        albums = r.json()["albums"]
        assert isinstance(albums, list)
        if albums:
            a = albums[0]
            for k in ("photo_count", "customer_name", "cover_thumbnail_url"):
                assert k in a

    def test_customers(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/customers", headers=auth_headers)
        assert r.status_code == 200
        rows = r.json()["customers"]
        if rows:
            c = rows[0]
            for k in ("order_count", "total_spent", "album_count"):
                assert k in c


# ---- Layouts CRUD ----

class TestLayouts:
    def test_layout_full_crud(self, api, auth_headers):
        # create (valid)
        payload = {"name": "TEST_LAYOUT_A", "photo_count": 2,
                   "positions": [{"x": 0, "y": 0, "w": 50, "h": 100}, {"x": 50, "y": 0, "w": 50, "h": 100}]}
        r = api.post(f"{BASE_URL}/api/admin/layouts", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        lid = r.json()["layout"]["id"]
        try:
            # list contains it
            r2 = api.get(f"{BASE_URL}/api/admin/layouts", headers=auth_headers)
            assert any(l["id"] == lid for l in r2.json()["layouts"])
            # update
            payload_u = {**payload, "name": "TEST_LAYOUT_A_UPDATED"}
            r3 = api.put(f"{BASE_URL}/api/admin/layouts/{lid}", headers=auth_headers, json=payload_u)
            assert r3.status_code == 200
            r4 = api.get(f"{BASE_URL}/api/admin/layouts", headers=auth_headers)
            assert any(l["id"] == lid and l["name"] == "TEST_LAYOUT_A_UPDATED" for l in r4.json()["layouts"])
        finally:
            r5 = api.delete(f"{BASE_URL}/api/admin/layouts/{lid}", headers=auth_headers)
            assert r5.status_code == 200

    def test_layout_photo_count_mismatch(self, api, auth_headers):
        payload = {"name": "TEST_LAYOUT_BAD", "photo_count": 3,
                   "positions": [{"x": 0, "y": 0, "w": 100, "h": 100}]}  # only 1 position
        r = api.post(f"{BASE_URL}/api/admin/layouts", headers=auth_headers, json=payload)
        assert r.status_code == 400


# ---- Backgrounds CRUD ----

class TestBackgrounds:
    def test_background_full_crud(self, api, auth_headers):
        payload = {"name": "TEST_BG_X", "color": "#ABCDEF", "active": True}
        r = api.post(f"{BASE_URL}/api/admin/backgrounds", headers=auth_headers, json=payload)
        assert r.status_code == 200
        bid = r.json()["background"]["id"]
        try:
            r2 = api.get(f"{BASE_URL}/api/admin/backgrounds", headers=auth_headers)
            assert any(b["id"] == bid for b in r2.json()["backgrounds"])
            r3 = api.put(f"{BASE_URL}/api/admin/backgrounds/{bid}", headers=auth_headers,
                         json={**payload, "color": "#123456"})
            assert r3.status_code == 200
            r4 = api.get(f"{BASE_URL}/api/admin/backgrounds", headers=auth_headers)
            assert any(b["id"] == bid and b["color"] == "#123456" for b in r4.json()["backgrounds"])
        finally:
            r5 = api.delete(f"{BASE_URL}/api/admin/backgrounds/{bid}", headers=auth_headers)
            assert r5.status_code == 200


# ---- Home CMS last-page ----

class TestHomeLastPage:
    def test_public_home_last_page(self, api):
        r = api.get(f"{BASE_URL}/api/home")
        assert r.status_code == 200
        content = r.json().get("content", {})
        assert content.get("last_page_url") == "/api/files/home/last-page.webp"

    def test_last_page_file_served(self, api):
        r = requests.get(f"{BASE_URL}/api/files/home/last-page.webp")
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_admin_home_includes(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/home", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        # Could be top-level or inside 'content'
        last = body.get("last_page_url") or (body.get("content") or {}).get("last_page_url")
        assert last == "/api/files/home/last-page.webp", f"got body: {body}"

    def test_admin_home_put(self, api, auth_headers):
        r = api.put(f"{BASE_URL}/api/admin/home", headers=auth_headers,
                    json={"last_page_url": "/api/files/home/last-page.webp"})
        assert r.status_code in (200, 204)


# ---- Production package (append last page) ----

class TestProduction:
    def test_pdf_appends_last_page(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/orders", headers=auth_headers)
        assert r.status_code == 200
        orders = r.json()["orders"]
        paid = [o for o in orders if o.get("payment_status") == "paid" and o.get("album_snapshot")]
        if not paid:
            pytest.skip("No paid order with album_snapshot available for production test")
        order = paid[0]
        oid = order["id"]
        snapshot_pages = len(order["album_snapshot"].get("pages") or [])
        pkg = build_package(api, f"{BASE_URL}/api", oid, auth_headers)
        # Iteration 14 change: back cover is now a SEPARATE file (back_cover.jpg),
        # so package.pages equals len(album_snapshot.pages) (no extra inner page).
        inner = pkg.get("package", {})
        pages_in_pkg = inner.get("pages")
        assert pages_in_pkg == snapshot_pages, f"expected {snapshot_pages} got {pages_in_pkg}"
        pdf_url = pkg.get("pdf_url") or inner.get("pdf_url")
        assert pdf_url
        # Download
        url = pdf_url if pdf_url.startswith("http") else f"{BASE_URL}{pdf_url}"
        r3 = requests.get(url)
        assert r3.status_code == 200
        assert len(r3.content) > 1000  # at least some content


# ---- PWA static assets ----

class TestPWA:
    def test_manifest(self, api):
        r = requests.get(f"{BASE_URL}/manifest.json")
        assert r.status_code == 200
        m = r.json()
        assert m.get("display") == "standalone"
        sizes = {ic.get("sizes") for ic in (m.get("icons") or [])}
        assert "192x192" in sizes
        assert "512x512" in sizes

    def test_service_worker(self, api):
        r = requests.get(f"{BASE_URL}/sw.js")
        assert r.status_code == 200
        assert len(r.text) > 0

    def test_head_contains_pwa_tags(self, api):
        r = requests.get(f"{BASE_URL}/")
        assert r.status_code == 200
        html = r.text.lower()
        assert 'rel="manifest"' in html or "rel='manifest'" in html or "rel=manifest" in html
        assert 'apple-mobile-web-app-capable' in html
        assert 'theme-color' in html
