"""Iteration 14 — Profile address/GST, Razorpay 502 surfacing, transparent-PNG flatten to white,
back-cover handling in production package & Album.pdf."""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://memories-album.preview.emergentagent.com").rstrip("/")
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "clickbook@2026"

# Test customer with existing stress album (seeded)
CUSTOMER_MOBILE = "9876500777"


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/admin/login",
                 json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_token(api):
    # Send OTP
    r = api.post(f"{BASE_URL}/api/auth/otp/send", json={"mobile": CUSTOMER_MOBILE, "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    body = r.json()
    otp = body.get("dev_hint") or "123456"
    # Verify
    r2 = api.post(f"{BASE_URL}/api/auth/otp/verify", json={"mobile": CUSTOMER_MOBILE, "otp": otp})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="module")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


# ============================================================================
# Profile: address + GST
# ============================================================================

class TestProfileAddressGST:
    def test_put_me_address_and_gst(self, api, customer_headers):
        payload = {
            "address": {
                "name": "Test User",
                "line1": "Flat 101, Palm Grove",
                "line2": "MG Road",
                "city": "Pune",
                "state": "MH",
                "pincode": "411001",
                "phone": "9876500777",
            },
            "gst_no": "27ABCDE1234F1Z5",
        }
        r = requests.put(f"{BASE_URL}/api/me", headers=customer_headers, json=payload)
        assert r.status_code == 200, r.text
        c = r.json()["customer"]
        assert c.get("gst_no") == "27ABCDE1234F1Z5"
        assert (c.get("address") or {}).get("city") == "Pune"
        assert (c.get("address") or {}).get("pincode") == "411001"

    def test_get_me_returns_saved(self, api, customer_headers):
        r = requests.get(f"{BASE_URL}/api/me", headers=customer_headers)
        assert r.status_code == 200
        c = r.json()["customer"]
        assert c.get("gst_no") == "27ABCDE1234F1Z5"
        addr = c.get("address") or {}
        assert addr.get("line1") == "Flat 101, Palm Grove"
        assert addr.get("city") == "Pune"
        # Since customer HAS a saved address, address_from_order should NOT be true
        assert c.get("address_from_order") is not True


# ============================================================================
# Razorpay: 502 on invalid gateway auth (not blank, not 500)
# ============================================================================

class TestRazorpayGatewayError:
    def _get_or_create_unpaid_order(self, customer_headers):
        r = requests.get(f"{BASE_URL}/api/orders", headers=customer_headers)
        orders = r.json().get("orders", [])
        unpaid = [o for o in orders if o.get("payment_status") not in ("paid",)]
        if unpaid:
            return unpaid[0]["id"]
        # Create one on the stress album
        body = {
            "album_id": "09fdba3e1551453ca11fd0b9b881dae1",
            "address": {"name": "Test User", "line1": "Flat 101", "line2": "MG Rd",
                        "city": "Pune", "state": "MH", "pincode": "411001", "phone": "9876500777"},
        }
        r2 = requests.post(f"{BASE_URL}/api/orders", headers=customer_headers, json=body)
        if r2.status_code != 200:
            pytest.skip(f"Could not create unpaid order: {r2.status_code} {r2.text[:200]}")
        return r2.json()["order"]["id"]

    def test_internal_backend_returns_502_with_message(self, customer_headers):
        """Backend MUST return 502 with 'Payment gateway authentication failed' when keys are invalid.
        Verified via localhost to bypass edge-level 5xx body stripping."""
        oid = self._get_or_create_unpaid_order(customer_headers)
        r = requests.post("http://localhost:8001/api/payments/razorpay/order",
                          headers=customer_headers, json={"order_id": oid}, timeout=60)
        assert r.status_code == 502, f"expected 502 got {r.status_code}: {r.text[:300]}"
        assert "Payment gateway authentication failed" in r.json().get("detail", ""), r.text[:300]

    def test_public_edge_returns_502_status(self, customer_headers):
        """Public URL may strip 5xx body (edge serves generic HTML); status code still 502."""
        oid = self._get_or_create_unpaid_order(customer_headers)
        r = requests.post(f"{BASE_URL}/api/payments/razorpay/order",
                          headers=customer_headers, json={"order_id": oid}, timeout=60)
        assert r.status_code == 502, f"expected 502 got {r.status_code}"
        # Known-limitation check: if the edge strips the body, our detail message will NOT reach the browser.
        # Document the behaviour so the main agent is aware.
        ct = r.headers.get("content-type", "")
        body_has_detail = "Payment gateway authentication failed" in r.text
        print(f"\n[rzp-edge] content-type={ct} body_passthrough={body_has_detail}")


# ============================================================================
# Admin image upload: transparent PNG must flatten to white (not black)
# ============================================================================

def _make_transparent_png_bytes():
    """Create a 400x400 PNG with transparent corners and a red circle in the center."""
    img = Image.new("RGBA", (400, 400), (0, 0, 0, 0))  # fully transparent
    # Draw a red filled rectangle in the middle, keep corners transparent
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    draw.rectangle((100, 100, 300, 300), fill=(255, 0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestTransparentPngFlatten:
    def test_upload_transparent_png_corner_is_white(self, admin_token):
        png_bytes = _make_transparent_png_bytes()
        files = {"file": ("transparent_test.png", png_bytes, "image/png")}
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{BASE_URL}/api/admin/images", files=files, headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        thumb_url = data.get("thumbnail_url") or data.get("image", {}).get("thumbnail_url")
        assert thumb_url, f"no thumbnail_url in response: {data}"
        # Download thumbnail
        url = thumb_url if thumb_url.startswith("http") else f"{BASE_URL}{thumb_url}"
        r2 = requests.get(url)
        assert r2.status_code == 200
        img = Image.open(io.BytesIO(r2.content)).convert("RGB")
        # Check corner pixel (which was transparent in original) is white
        corner = img.getpixel((2, 2))
        # Allow slight JPEG compression artifacts
        for ch in corner:
            assert ch >= 240, f"corner pixel {corner} is not white (should flatten transparent → white)"
        other_corner = img.getpixel((img.width - 3, img.height - 3))
        for ch in other_corner:
            assert ch >= 240, f"other corner {other_corner} is not white"


# ============================================================================
# Production: back cover (separate from inner pages)
# ============================================================================

class TestBackCoverProduction:
    def test_pdf_has_back_cover_and_pages_count_correct(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/orders", headers=admin_headers)
        assert r.status_code == 200
        orders = r.json()["orders"]
        paid = [o for o in orders if o.get("payment_status") == "paid" and o.get("album_snapshot")]
        if not paid:
            pytest.skip("No paid order with album_snapshot available")
        order = paid[0]
        oid = order["id"]
        snapshot_pages = len(order["album_snapshot"].get("pages") or [])

        r2 = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/pdf", headers=admin_headers)
        assert r2.status_code == 200, r2.text
        pkg = r2.json()
        inner = pkg.get("package", {})

        # Iteration 14: package.pages == len(album_snapshot.pages) (NO extra page)
        pages_in_pkg = inner.get("pages")
        assert pages_in_pkg == snapshot_pages, (
            f"expected package.pages == {snapshot_pages} (len album pages, no extra); got {pages_in_pkg}"
        )

        # back_cover_url present and downloadable
        back_url = inner.get("back_cover_url") or pkg.get("back_cover_url")
        assert back_url, f"back_cover_url missing in package: {inner}"
        url = back_url if back_url.startswith("http") else f"{BASE_URL}{back_url}"
        r3 = requests.get(url)
        assert r3.status_code == 200, f"back cover URL not downloadable: {url}"
        ct = r3.headers.get("content-type", "")
        assert "image/jpeg" in ct or "image/webp" in ct, f"unexpected content-type: {ct}"
        assert len(r3.content) > 1000

    def test_album_pdf_page_count(self, admin_headers):
        """Album.pdf page count must be pages + 2 (front cover + back cover)."""
        try:
            from pypdf import PdfReader
        except Exception:
            pytest.skip("pypdf not installed")

        r = requests.get(f"{BASE_URL}/api/admin/orders", headers=admin_headers)
        assert r.status_code == 200
        orders = r.json()["orders"]
        paid = [o for o in orders if o.get("payment_status") == "paid" and o.get("album_snapshot")]
        if not paid:
            pytest.skip("No paid order with album_snapshot available")
        order = paid[0]
        oid = order["id"]
        snapshot_pages = len(order["album_snapshot"].get("pages") or [])

        r2 = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/pdf", headers=admin_headers)
        assert r2.status_code == 200, r2.text
        pkg = r2.json()
        inner = pkg.get("package", {})
        pdf_url = inner.get("pdf_url") or pkg.get("pdf_url")
        assert pdf_url
        url = pdf_url if pdf_url.startswith("http") else f"{BASE_URL}{pdf_url}"
        r3 = requests.get(url)
        assert r3.status_code == 200
        reader = PdfReader(io.BytesIO(r3.content))
        expected = snapshot_pages + 2  # front cover + inner pages + back cover
        assert len(reader.pages) == expected, (
            f"expected PDF page count = {expected} (cover+{snapshot_pages}+back); got {len(reader.pages)}"
        )


# ============================================================================
# Apple touch icon for iOS PWA
# ============================================================================

class TestAppleTouchIcon:
    def test_apple_touch_icon_served(self):
        r = requests.get(f"{BASE_URL}/icons/apple-touch-icon.png")
        assert r.status_code == 200, f"apple-touch-icon.png not served: {r.status_code}"
        assert len(r.content) > 0
        # Validate it's a valid PNG and 180x180
        img = Image.open(io.BytesIO(r.content))
        assert img.format == "PNG"
        assert img.size == (180, 180), f"expected 180x180 got {img.size}"
