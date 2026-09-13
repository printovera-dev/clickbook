"""Iteration 7 backend tests: style-aware generation, page editor persistence,
cover editor, design lock after payment, admin PDF and admin image upload.
Uses production public endpoint (EXPO_PUBLIC_BACKEND_URL). Does NOT restart backend.
Uses POST /api/orders/pay (mock) — never touches Razorpay LIVE keys."""
import os
import io
import pytest
import requests

BASE = "https://memories-album.preview.emergentagent.com".rstrip("/")
ASSETS = "/app/backend/tests/assets"
MOBILE = "9876500777"  # dedicated user for this iteration


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def customer_token(sess):
    r = sess.post(f"{BASE}/api/auth/otp/send", json={"mobile": MOBILE, "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    body = r.json()
    otp = body.get("dev_hint") or body.get("otp") or "123456"
    import re
    m = re.search(r"(\d{6})", str(otp))
    otp_val = m.group(1) if m else otp
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
    assert len(covers) >= 3, f"expected 3 cover styles, got {len(covers)}"
    return covers[0]["id"]


@pytest.fixture(scope="module")
def album(sess, auth_h, cover_id):
    r = sess.post(f"{BASE}/api/albums", headers=auth_h, json={"cover_id": cover_id, "name": "Iter7 Album"})
    assert r.status_code == 200, r.text
    a = r.json()["album"]
    # upload 3 photos
    for i in (1, 2, 3):
        with open(f"{ASSETS}/test_photo_{i}.jpg", "rb") as f:
            up = sess.post(f"{BASE}/api/albums/{a['id']}/photos", headers=auth_h,
                           files={"file": (f"test_photo_{i}.jpg", f, "image/jpeg")})
            assert up.status_code == 200, up.text
    r2 = sess.get(f"{BASE}/api/albums/{a['id']}", headers=auth_h)
    return r2.json()["album"]


# ---------- Style-aware generation ----------

class TestStyleAwareGeneration:
    def test_generate_with_gallery_style(self, sess, auth_h, album):
        r = sess.post(f"{BASE}/api/albums/{album['id']}/generate", headers=auth_h, json={"style": "gallery"})
        assert r.status_code == 200, r.text
        a = r.json()["album"]
        assert a["design_style"] == "gallery"
        assert len(a["pages"]) >= 1
        # cover_design must be auto-created
        assert a.get("cover_design") is not None
        assert a["cover_design"]["photo_id"] == a["photos"][0]["id"]

    def test_generate_invalid_style_400(self, sess, auth_h, album):
        r = sess.post(f"{BASE}/api/albums/{album['id']}/generate", headers=auth_h, json={"style": "bogus"})
        assert r.status_code == 400


# ---------- Page editor persistence via PUT /pages ----------

class TestPageEditorPersistence:
    def test_put_pages_persists_text_and_transform(self, sess, auth_h, album):
        # regenerate to ensure we have pages
        sess.post(f"{BASE}/api/albums/{album['id']}/generate", headers=auth_h, json={"style": "balanced"})
        r = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h)
        a = r.json()["album"]
        pages = a["pages"]
        # inject a text + image transform into page[0]
        pages[0]["texts"] = [{
            "id": "t1", "text": "Summer in Goa", "x": 0.1, "y": 0.2, "w": 0.8, "h": 0.15,
            "font": "dancing", "size": 0.06, "weight": "bold", "italic": False,
            "color": "#C56A47", "align": "center", "z": 1,
        }]
        pages[0]["images"] = {"0": {"photo_id": pages[0]["photo_ids"][0], "scale": 1.4, "ox": 0.2, "oy": -0.1, "fit": "fill"}}
        r2 = sess.put(f"{BASE}/api/albums/{album['id']}/pages", headers=auth_h, json={"pages": pages})
        assert r2.status_code == 200, r2.text
        # GET back and verify persistence
        r3 = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h)
        got = r3.json()["album"]["pages"][0]
        assert got["texts"][0]["text"] == "Summer in Goa"
        assert got["texts"][0]["font"] == "dancing"
        assert got["images"]["0"]["scale"] == 1.4
        assert got["images"]["0"]["ox"] == 0.2

    def test_layout_change_persists(self, sess, auth_h, album):
        r = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h)
        pages = r.json()["album"]["pages"]
        # change page[0] to 2-photo layout
        photos = r.json()["album"]["photos"]
        pages[0]["layout_photo_count"] = 2
        pages[0]["photo_ids"] = [photos[0]["id"], photos[1]["id"]]
        pages[0]["images"] = {
            "0": {"photo_id": photos[0]["id"], "scale": 1, "ox": 0, "oy": 0, "fit": "fill"},
            "1": {"photo_id": photos[1]["id"], "scale": 1, "ox": 0, "oy": 0, "fit": "fill"},
        }
        r2 = sess.put(f"{BASE}/api/albums/{album['id']}/pages", headers=auth_h, json={"pages": pages})
        assert r2.status_code == 200
        got = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h).json()["album"]["pages"][0]
        assert got["layout_photo_count"] == 2
        assert len(got["photo_ids"]) == 2


# ---------- Cover editor ----------

class TestCoverEditor:
    def test_update_cover_design_editorial(self, sess, auth_h, album):
        r = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h)
        a = r.json()["album"]
        cd = a["cover_design"]
        cd["style"] = "editorial"
        cd["background"] = "#F0EFEA"
        cd["frame"] = {"x": 0.08, "y": 0.08, "w": 0.84, "h": 0.6}
        cd["texts"] = [{"id": "ct", "text": "Our Story", "x": 0.1, "y": 0.75, "w": 0.8, "h": 0.12,
                        "font": "playfair", "size": 0.07, "weight": "bold", "italic": False,
                        "color": "#1C1917", "align": "center", "z": 1}]
        r2 = sess.put(f"{BASE}/api/albums/{album['id']}", headers=auth_h, json={"cover_design": cd})
        assert r2.status_code == 200, r2.text
        got = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h).json()["album"]
        assert got["cover_design"]["style"] == "editorial"
        assert got["cover_design"]["texts"][0]["text"] == "Our Story"


# ---------- Design lock after payment ----------

class TestDesignLock:
    def test_pay_locks_album_and_puts_return_409(self, sess, auth_h, album, admin_h):
        # Create order
        addr = {"name": "Iter7", "line1": "1 Test", "city": "Mumbai", "state": "MH", "pincode": "400001",
                "mobile": MOBILE}
        r = sess.post(f"{BASE}/api/orders", headers=auth_h,
                      json={"album_id": album["id"], "address": addr, "gift_wrap": False})
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        # Pay via mock
        rp = sess.post(f"{BASE}/api/orders/pay", headers=auth_h,
                       json={"order_id": order["id"], "payment_method": "mock"})
        assert rp.status_code == 200, rp.text
        # Album is now locked
        got = sess.get(f"{BASE}/api/albums/{album['id']}", headers=auth_h).json()["album"]
        assert got["status"] == "ordered"
        assert got["locked"] is True
        # PUT pages must 409
        r409 = sess.put(f"{BASE}/api/albums/{album['id']}/pages", headers=auth_h,
                        json={"pages": got["pages"]})
        assert r409.status_code == 409, f"expected 409 lock, got {r409.status_code}"
        # Admin PDF works with frozen album_snapshot
        r_pdf = sess.post(f"{BASE}/api/admin/orders/{order['id']}/pdf", headers=admin_h)
        assert r_pdf.status_code == 200, r_pdf.text
        body = r_pdf.json()
        assert "pdf_url" in body
        # pages should be len(pages)+1 (cover)
        assert body["pages"] == len(got["pages"]) + 1
        # Actually GET the file (pdf_url may be relative)
        url = body["pdf_url"]
        if url.startswith("/"):
            url = BASE + url
        pdf_resp = sess.get(url)
        assert pdf_resp.status_code == 200, f"pdf fetch failed: {pdf_resp.status_code}"
        assert pdf_resp.content[:4] == b"%PDF", "PDF magic bytes missing"
        # Verify order visible in admin listing + album_snapshot frozen
        r_ord = sess.get(f"{BASE}/api/admin/orders", headers=admin_h)
        assert r_ord.status_code == 200
        orders = r_ord.json()["orders"]
        target = [o for o in orders if o["id"] == order["id"]]
        assert target, "order not found in admin listing"
        assert target[0].get("album_snapshot", {}).get("pages"), "album_snapshot not frozen"


# ---------- Admin image upload ----------

class TestAdminImageUpload:
    def test_upload_jpg_returns_url(self, sess, admin_h):
        with open(f"{ASSETS}/test_photo_1.jpg", "rb") as f:
            r = sess.post(f"{BASE}/api/admin/images", headers=admin_h,
                          files={"file": ("admin_upload.jpg", f, "image/jpeg")})
        assert r.status_code == 200, r.text
        img = r.json()["image"]
        assert "url" in img
        # URL should be resolvable
        url = img["url"]
        if url.startswith("/"):
            url = BASE + url
        r2 = sess.get(url)
        assert r2.status_code == 200


# ---------- Covers listing (regression: exactly 3 active) ----------

class TestCoversCatalog:
    def test_three_active_styles(self, sess):
        r = sess.get(f"{BASE}/api/covers")
        assert r.status_code == 200
        covers = r.json()["covers"]
        styles = {c.get("style") for c in covers if c.get("active", True)}
        assert {"signature", "classic", "editorial"}.issubset(styles), f"styles={styles}"


# ---------- Coupon regression ----------

class TestCouponRegression:
    def test_welcome_coupon(self, sess):
        r = sess.post(f"{BASE}/api/pricing/calculate", json={"sheets": 10, "coupon_code": "WELCOME2026"})
        assert r.status_code == 200
        p = r.json()
        assert p.get("discount", 0) > 0


# ---------- Policies regression ----------

class TestPolicies:
    @pytest.mark.parametrize("key", ["privacy", "terms", "refund", "shipping"])
    def test_policy(self, sess, key):
        r = sess.get(f"{BASE}/api/policies/{key}")
        assert r.status_code == 200
        assert r.json().get("policy", {}).get("body")
