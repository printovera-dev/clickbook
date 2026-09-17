"""Iteration 8 backend tests: Cover photo picker, Admin bot image upload, drag-reorder
(via PUT /pages), snap guides are frontend-only. Uses production public endpoint.
Never touches Razorpay LIVE keys — uses POST /api/orders/pay mock only when needed."""
import os
import re
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://memories-album.preview.emergentagent.com").rstrip("/")
ASSETS = "/app/backend/tests/assets"
# Use worker-specific mobile so parallel workers don't race on the same OTP
_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
_WORKER_NUM = "".join(c for c in _WORKER if c.isdigit()) or "0"
MOBILE = f"987650088{_WORKER_NUM}"


@pytest.fixture(scope="module")
def sess():
    return requests.Session()


@pytest.fixture(scope="module")
def customer_token(sess):
    r = sess.post(f"{BASE}/api/auth/otp/send", json={"mobile": MOBILE, "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    body = r.json()
    otp = body.get("dev_hint") or body.get("otp") or "123456"
    m = re.search(r"(\d{6})", str(otp))
    otp_val = m.group(1) if m else str(otp)
    r2 = sess.post(f"{BASE}/api/auth/otp/verify", json={"mobile": MOBILE, "otp": otp_val})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="module")
def auth_h(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


@pytest.fixture(scope="module")
def admin_h(sess):
    r = sess.post(f"{BASE}/api/admin/login", json={"username": "admin", "password": "clickbook@2026"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def cover_id(sess):
    r = sess.get(f"{BASE}/api/covers")
    assert r.status_code == 200
    covers = r.json()["covers"]
    sig = [c for c in covers if c.get("style") == "signature" and c.get("active", True)]
    return (sig[0] if sig else covers[0])["id"]


@pytest.fixture(scope="module")
def album(sess, auth_h, cover_id):
    r = sess.post(f"{BASE}/api/albums", headers=auth_h,
                  json={"cover_id": cover_id, "name": "Iter8 Cover Photo Album"})
    assert r.status_code == 200, r.text
    a = r.json()["album"]
    for i in (1, 2, 3):
        with open(f"{ASSETS}/test_photo_{i}.jpg", "rb") as f:
            up = sess.post(f"{BASE}/api/albums/{a['id']}/photos", headers=auth_h,
                           files={"file": (f"test_photo_{i}.jpg", f, "image/jpeg")})
            assert up.status_code == 200, up.text
    return sess.get(f"{BASE}/api/albums/{a['id']}", headers=auth_h).json()["album"]


# ---------- Feature 1: Cover Photo Picker (backend contract) ----------

class TestCoverPhotoPicker:
    def test_generate_with_third_photo_as_cover(self, sess, auth_h, album):
        third = album["photos"][2]["id"]
        r = sess.post(f"{BASE}/api/albums/{album['id']}/generate",
                      headers=auth_h, json={"allow_short": True, "style": "balanced", "cover_photo_id": third})
        assert r.status_code == 200, r.text
        a = r.json()["album"]
        assert a["cover_design"] is not None
        assert a["cover_design"]["photo_id"] == third, \
            f"expected cover photo_id={third}, got {a['cover_design']['photo_id']}"
        # Verify persistence via fresh GET
        got = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h).json()["album"]
        assert got["cover_design"]["photo_id"] == third

    def test_regenerate_updates_cover_photo(self, sess, auth_h, album):
        """cover_photo_id is respected on subsequent generate calls too."""
        first = album["photos"][0]["id"]
        r = sess.post(f"{BASE}/api/albums/{album['id']}/generate",
                      headers=auth_h, json={"allow_short": True, "style": "elegant", "cover_photo_id": first})
        assert r.status_code == 200
        got = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h).json()["album"]
        assert got["cover_design"]["photo_id"] == first

    def test_generate_with_foreign_photo_id_returns_400(self, sess, auth_h, album, cover_id):
        """Cover photo id belonging to another album must be rejected (400)."""
        # Create another album with a photo
        r = sess.post(f"{BASE}/api/albums", headers=auth_h,
                      json={"cover_id": cover_id, "name": "Iter8 Other"})
        other = r.json()["album"]
        with open(f"{ASSETS}/test_photo_1.jpg", "rb") as f:
            up = sess.post(f"{BASE}/api/albums/{other['id']}/photos", headers=auth_h,
                           files={"file": ("x.jpg", f, "image/jpeg")})
        foreign_pid = up.json()["photo"]["id"]
        r2 = sess.post(f"{BASE}/api/albums/{album['id']}/generate", headers=auth_h, json={"allow_short": True, "style": "balanced", "cover_photo_id": foreign_pid})
        assert r2.status_code == 400, f"expected 400, got {r2.status_code}: {r2.text}"


# ---------- Feature 2: Admin Process Bot image upload + expose in order tracking ----------

class TestAdminBotImage:
    def test_upload_and_attach_image_to_bot(self, sess, auth_h, admin_h, album):
        # 1) admin lists bots
        r = sess.get(f"{BASE}/api/admin/process-bots", headers=admin_h)
        assert r.status_code == 200
        bots = r.json()["process_bots"]
        assert len(bots) > 0, "no process bots seeded"
        # Pick the 'processing' stage bot (first active stage after order/pay)
        processing_bot = next((b for b in bots if b.get("stage") == "processing"), bots[0])
        bot_id = processing_bot["id"]
        original_image_url = processing_bot.get("image_url", "")

        # 2) admin upload an image
        with open(f"{ASSETS}/test_photo_2.jpg", "rb") as f:
            up = sess.post(f"{BASE}/api/admin/images", headers=admin_h,
                           files={"file": ("bot_img.jpg", f, "image/jpeg")})
        assert up.status_code == 200, up.text
        image_url = up.json()["image"]["url"]

        # 3) PUT the bot with new image_url
        r2 = sess.put(f"{BASE}/api/admin/process-bots/{bot_id}", headers=admin_h,
                      json={"image_url": image_url})
        assert r2.status_code == 200, r2.text

        # 4) Verify persisted (via admin list)
        r3 = sess.get(f"{BASE}/api/admin/process-bots", headers=admin_h)
        got = next(b for b in r3.json()["process_bots"] if b["id"] == bot_id)
        assert got["image_url"] == image_url, f"bot image_url not persisted"

        # 5) Create an order (paid via mock) so the customer has an order to fetch
        # Ensure the album has pages (generate is idempotent, worker-safe)
        sess.post(f"{BASE}/api/albums/{album['id']}/generate", headers=auth_h, json={"allow_short": True, "style": "balanced"})
        addr = {"name": "Iter8", "line1": "1 Test", "city": "Mumbai",
                "state": "MH", "pincode": "400001", "mobile": MOBILE}
        r_ord = sess.post(f"{BASE}/api/orders", headers=auth_h,
                          json={"album_id": album["id"], "address": addr, "gift_wrap": False})
        assert r_ord.status_code == 200, r_ord.text
        order = r_ord.json()["order"]
        rp = sess.post(f"{BASE}/api/orders/pay", headers=auth_h,
                       json={"order_id": order["id"], "payment_method": "mock"})
        assert rp.status_code == 200, rp.text

        # 6) GET /api/orders/{id} as customer — process_bots should include image_url
        r_get = sess.get(f"{BASE}/api/orders/{order['id']}", headers=auth_h)
        assert r_get.status_code == 200, r_get.text
        body = r_get.json()
        assert "process_bots" in body, "process_bots not returned on order fetch"
        got_bot = next((b for b in body["process_bots"] if b["id"] == bot_id), None)
        assert got_bot is not None, "target bot missing from order.process_bots"
        assert got_bot.get("image_url") == image_url, "bot image_url not visible in order"

        # 7) Cleanup — reset image_url to original (usually "")
        sess.put(f"{BASE}/api/admin/process-bots/{bot_id}", headers=admin_h,
                 json={"image_url": original_image_url or ""})


# ---------- Feature 3: Drag-to-reorder pages (backend contract via PUT /pages) ----------

class TestPagesReorderPersistence:
    def test_swap_first_two_pages_persists(self, sess, auth_h, cover_id):
        """Simulate the drag-reorder commit: PUT /pages with reordered array persists new order."""
        # fresh album, 3 photos, generated pages
        r = sess.post(f"{BASE}/api/albums", headers=auth_h,
                      json={"cover_id": cover_id, "name": "Iter8 Reorder"})
        aid = r.json()["album"]["id"]
        for i in (1, 2, 3):
            with open(f"{ASSETS}/test_photo_{i}.jpg", "rb") as f:
                sess.post(f"{BASE}/api/albums/{aid}/photos", headers=auth_h,
                          files={"file": (f"p{i}.jpg", f, "image/jpeg")})
        sess.post(f"{BASE}/api/albums/{aid}/generate", headers=auth_h, json={"allow_short": True, "style": "gallery"})
        got = sess.get(f"{BASE}/api/albums/{aid}", headers=auth_h).json()["album"]
        pages = got["pages"]
        if len(pages) < 2:
            pytest.skip("gallery generated only 1 page, cannot reorder")
        p0_id = pages[0]["id"]
        p1_id = pages[1]["id"]
        # swap
        reordered = [pages[1], pages[0]] + pages[2:]
        r2 = sess.put(f"{BASE}/api/albums/{aid}/pages", headers=auth_h,
                      json={"pages": reordered})
        assert r2.status_code == 200, r2.text
        got2 = sess.get(f"{BASE}/api/albums/{aid}", headers=auth_h).json()["album"]
        assert got2["pages"][0]["id"] == p1_id
        assert got2["pages"][1]["id"] == p0_id
        # `order` field should reflect new positions
        assert got2["pages"][0]["order"] == 0
        assert got2["pages"][1]["order"] == 1


# ---------- Regression: covers, coupon, policies ----------

class TestRegression:
    def test_covers(self, sess):
        r = sess.get(f"{BASE}/api/covers")
        assert r.status_code == 200
        assert len(r.json()["covers"]) >= 3

    def test_coupon(self, sess):
        r = sess.post(f"{BASE}/api/pricing/calculate",
                      json={"sheets": 10, "coupon_code": "WELCOME2026"})
        assert r.status_code == 200
        assert r.json().get("discount", 0) > 0

    @pytest.mark.parametrize("k", ["privacy", "terms", "refund", "shipping"])
    def test_policies(self, sess, k):
        r = sess.get(f"{BASE}/api/policies/{k}")
        assert r.status_code == 200
        assert r.json().get("policy", {}).get("body")
