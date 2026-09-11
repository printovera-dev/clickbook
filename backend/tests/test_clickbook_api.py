"""
ClickBook end-to-end backend test suite.
Uses public EXPO_PUBLIC_BACKEND_URL to exercise the /api routes.
Ordered tests build shared state (auth token -> album -> photo -> order -> admin actions).
"""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend .env value (loaded outside CI)
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


# --------- Shared state across ordered tests ---------
state: dict = {}


def _forbid_mongo_id(obj):
    """Recursively assert no '_id' key leaks out of MongoDB."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"MongoDB _id leaked: {obj}"
        for v in obj.values():
            _forbid_mongo_id(v)
    elif isinstance(obj, list):
        for it in obj:
            _forbid_mongo_id(it)


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    return sess


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert body.get("service") == "clickbook"


# ---------- Auth ----------
def test_send_otp(s):
    mobile = f"98{int(time.time()) % 100000000:08d}"
    state["mobile"] = mobile
    r = s.post(f"{API}/auth/otp/send", json={"mobile": mobile, "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    state["otp"] = r.json().get("dev_hint") or "123456"


def test_verify_otp_wrong(s):
    r = s.post(f"{API}/auth/otp/verify", json={"mobile": state["mobile"], "otp": "000000"})
    assert r.status_code == 400


def test_verify_otp_success(s):
    # OTP was consumed by previous test? No - verify only deletes on success.
    r = s.post(f"{API}/auth/otp/verify", json={"mobile": state["mobile"], "otp": state["otp"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and "customer" in body
    _forbid_mongo_id(body)
    state["token"] = body["token"]
    state["customer_id"] = body["customer"]["id"]
    state["auth"] = {"Authorization": f"Bearer {body['token']}"}


def test_me_get(s):
    r = s.get(f"{API}/me", headers=state["auth"])
    assert r.status_code == 200
    body = r.json()
    assert body["customer"]["id"] == state["customer_id"]
    _forbid_mongo_id(body)


def test_me_update(s):
    r = s.put(f"{API}/me", headers=state["auth"], json={"name": "Test User", "email": "TEST_user@example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body["customer"]["name"] == "Test User"
    assert body["customer"]["email"] == "TEST_user@example.com"


def test_me_no_token(s):
    r = s.get(f"{API}/me")
    assert r.status_code == 401


# ---------- Catalog ----------
def test_covers(s):
    r = s.get(f"{API}/covers")
    assert r.status_code == 200
    covers = r.json()["covers"]
    assert len(covers) >= 3
    _forbid_mongo_id(covers)
    state["cover_id"] = covers[0]["id"]


def test_layouts(s):
    r = s.get(f"{API}/layouts")
    assert r.status_code == 200
    layouts = r.json()["layouts"]
    names = {l["name"] for l in layouts}
    assert "One Photo" in names and "Two Photos" in names
    _forbid_mongo_id(layouts)


def test_backgrounds(s):
    r = s.get(f"{API}/backgrounds")
    assert r.status_code == 200
    bgs = r.json()["backgrounds"]
    assert len(bgs) >= 3
    _forbid_mongo_id(bgs)


def test_offers_public(s):
    r = s.get(f"{API}/offers")
    assert r.status_code == 200
    offers = r.json()["offers"]
    codes = {o["code"] for o in offers}
    assert {"WELCOME2026", "COUPLE20", "FLAT200"}.issubset(codes)
    _forbid_mongo_id(offers)


def test_settings(s):
    r = s.get(f"{API}/settings")
    assert r.status_code == 200
    st = r.json()["settings"]
    assert st["price_per_sheet"] == 90
    assert st["gst_percent"] == 18
    assert st["min_sheets"] == 10
    assert st["max_sheets"] == 75


# ---------- Pricing ----------
def test_pricing_no_coupon(s):
    r = s.post(f"{API}/pricing/calculate", json={"sheets": 10})
    assert r.status_code == 200
    b = r.json()
    assert b["subtotal"] == 900
    assert b["gst"] == 162
    assert b["total"] == 1062
    assert b["coupon"] is None
    assert b["coupon_error"] is None


def test_pricing_welcome(s):
    r = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "coupon_code": "WELCOME2026"})
    assert r.status_code == 200
    b = r.json()
    # 10% off 900 = 90 discount; taxable=810; gst=145.8; total=955.8
    assert b["discount"] == 90.0
    assert b["taxable"] == 810
    assert b["gst"] == 145.8
    assert b["total"] == 955.8


def test_pricing_invalid_coupon(s):
    r = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "coupon_code": "NOPE"})
    assert r.status_code == 200
    b = r.json()
    assert b["coupon_error"] == "Invalid coupon code"


def test_pricing_min_order_fail(s):
    # COUPLE20 requires min ₹1000; sheets=10 subtotal=900 -> fail
    r = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "coupon_code": "COUPLE20"})
    b = r.json()
    assert b["coupon_error"] is not None and "Min order" in b["coupon_error"]


# ---------- Albums ----------
def test_create_album(s):
    r = s.post(f"{API}/albums", headers=state["auth"], json={"cover_id": state["cover_id"], "name": "TEST Album"})
    assert r.status_code == 200, r.text
    album = r.json()["album"]
    assert album["customer_id"] == state["customer_id"]
    assert album["status"] == "draft"
    _forbid_mongo_id(album)
    state["album_id"] = album["id"]


def test_create_album_invalid_cover(s):
    r = s.post(f"{API}/albums", headers=state["auth"], json={"cover_id": "bad-cover-id"})
    assert r.status_code == 400


def _mk_image(color=(255, 100, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (600, 600), color).save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def test_upload_photos(s):
    for i, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]):
        files = {"file": (f"test_{i}.jpg", _mk_image(color), "image/jpeg")}
        r = s.post(f"{API}/albums/{state['album_id']}/photos", headers=state["auth"], files=files)
        assert r.status_code == 200, r.text
        photo = r.json()["photo"]
        assert photo["id"] and photo["thumbnail_url"] and photo["preview_url"]
        _forbid_mongo_id(photo)
        state.setdefault("photo_ids", []).append(photo["id"])
        state.setdefault("photo_urls", []).append(photo["thumbnail_url"])


def test_upload_bad_extension(s):
    files = {"file": ("bad.txt", b"hello", "text/plain")}
    r = s.post(f"{API}/albums/{state['album_id']}/photos", headers=state["auth"], files=files)
    assert r.status_code == 400


def test_file_serving(s):
    url = state["photo_urls"][0]
    # thumbnail_url is a full path like /api/files/...
    if url.startswith("/"):
        url = BASE_URL + url
    r = s.get(url)
    assert r.status_code == 200
    assert len(r.content) > 100
    assert r.headers.get("content-type", "").startswith("image/")


def test_auto_generate(s):
    r = s.post(f"{API}/albums/{state['album_id']}/generate", headers=state["auth"])
    assert r.status_code == 200, r.text
    album = r.json()["album"]
    assert len(album["pages"]) >= 2
    assert album["sheets"] >= 10  # min_sheets
    _forbid_mongo_id(album)
    state["pages"] = album["pages"]


def test_get_album(s):
    r = s.get(f"{API}/albums/{state['album_id']}", headers=state["auth"])
    assert r.status_code == 200
    _forbid_mongo_id(r.json())


def test_update_pages(s):
    pages = list(reversed(state["pages"]))
    # change background of first page
    pages[0]["background"] = "#111111"
    r = s.put(f"{API}/albums/{state['album_id']}/pages", headers=state["auth"], json={"pages": pages})
    assert r.status_code == 200, r.text
    album = r.json()["album"]
    assert album["pages"][0]["background"] == "#111111"
    assert album["pages"][0]["order"] == 0


def test_list_albums(s):
    r = s.get(f"{API}/albums", headers=state["auth"])
    assert r.status_code == 200
    ids = [a["id"] for a in r.json()["albums"]]
    assert state["album_id"] in ids


def test_delete_photo(s):
    photo_id = state["photo_ids"][-1]
    r = s.delete(f"{API}/albums/{state['album_id']}/photos/{photo_id}", headers=state["auth"])
    assert r.status_code == 200
    # verify persistence
    r2 = s.get(f"{API}/albums/{state['album_id']}", headers=state["auth"])
    remaining = {p["id"] for p in r2.json()["album"]["photos"]}
    assert photo_id not in remaining


# ---------- Auth isolation (customer B cannot access customer A's album) ----------
def test_auth_isolation(s):
    mobile_b = f"77{int(time.time()) % 100000000:08d}"
    r = s.post(f"{API}/auth/otp/send", json={"mobile": mobile_b, "channel": "sms"})
    otp_b = r.json().get("dev_hint") or "123456"
    r = s.post(f"{API}/auth/otp/verify", json={"mobile": mobile_b, "otp": otp_b})
    assert r.status_code == 200
    token_b = r.json()["token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    # Try to fetch customer A's album
    r = s.get(f"{API}/albums/{state['album_id']}", headers=headers_b)
    assert r.status_code == 404
    # Try to upload photo to A's album
    files = {"file": ("hack.jpg", _mk_image((0, 0, 0)), "image/jpeg")}
    r = s.post(f"{API}/albums/{state['album_id']}/photos", headers=headers_b, files=files)
    assert r.status_code == 404


# ---------- Orders ----------
def test_create_order(s):
    payload = {
        "album_id": state["album_id"],
        "coupon_code": "WELCOME2026",
        "address": {"name": "Test", "line1": "1 Test Rd", "city": "Bengaluru", "pin": "560001", "phone": state["mobile"]},
    }
    r = s.post(f"{API}/orders", headers=state["auth"], json=payload)
    assert r.status_code == 200, r.text
    order = r.json()["order"]
    _forbid_mongo_id(order)
    assert order["payment_status"] == "pending"
    assert order["production_status"] == "processing"
    assert order["price"]["discount"] > 0
    assert order["order_no"].startswith("CB")
    state["order_id"] = order["id"]


def test_pay_order(s):
    r = s.post(f"{API}/orders/pay", headers=state["auth"], json={"order_id": state["order_id"], "payment_method": "mock"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["payment_id"].startswith("MOCK_")


def test_get_order(s):
    r = s.get(f"{API}/orders/{state['order_id']}", headers=state["auth"])
    assert r.status_code == 200
    body = r.json()
    assert body["order"]["payment_status"] == "paid"
    assert isinstance(body["process_bots"], list) and len(body["process_bots"]) >= 5
    _forbid_mongo_id(body)


def test_list_orders(s):
    r = s.get(f"{API}/orders", headers=state["auth"])
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()["orders"]]
    assert state["order_id"] in ids


# ---------- Admin ----------
def test_admin_login_wrong(s):
    r = s.post(f"{API}/admin/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_admin_login(s):
    r = s.post(f"{API}/admin/login", json={"username": "admin", "password": "clickbook@2026"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body
    state["admin_auth"] = {"Authorization": f"Bearer {body['token']}"}


def test_admin_dashboard(s):
    r = s.get(f"{API}/admin/dashboard", headers=state["admin_auth"])
    assert r.status_code == 200
    body = r.json()
    for k in ("total_orders", "revenue", "by_status", "customers", "drafts", "recent_orders"):
        assert k in body
    assert body["total_orders"] >= 1
    assert body["revenue"] >= 1  # we paid one order


def test_admin_orders(s):
    r = s.get(f"{API}/admin/orders", headers=state["admin_auth"])
    assert r.status_code == 200
    orders = r.json()["orders"]
    _forbid_mongo_id(orders)
    assert any(o["id"] == state["order_id"] for o in orders)


@pytest.mark.parametrize("status", ["processing", "printing", "packaging", "out_for_delivery", "delivered"])
def test_admin_status_transitions(s, status):
    r = s.put(f"{API}/admin/orders/{state['order_id']}/status", headers=state["admin_auth"],
              json={"production_status": status, "note": f"moved to {status}"})
    assert r.status_code == 200
    # verify persistence
    r2 = s.get(f"{API}/orders/{state['order_id']}", headers=state["auth"])
    assert r2.json()["order"]["production_status"] == status


def test_admin_status_invalid(s):
    r = s.put(f"{API}/admin/orders/{state['order_id']}/status", headers=state["admin_auth"],
              json={"production_status": "flying"})
    assert r.status_code == 400


def test_admin_generate_pdf(s):
    r = s.post(f"{API}/admin/orders/{state['order_id']}/pdf", headers=state["admin_auth"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("pdf_url")
    assert body.get("size_bytes", 0) > 100
    # PDF should be accessible
    pdf_url = body["pdf_url"]
    if pdf_url.startswith("/"):
        pdf_url = BASE_URL + pdf_url
    r2 = s.get(pdf_url)
    assert r2.status_code == 200
    assert r2.content[:4] == b"%PDF"


def test_admin_update_settings(s):
    r = s.put(f"{API}/admin/settings", headers=state["admin_auth"], json={"price_per_sheet": 100})
    assert r.status_code == 200
    assert r.json()["settings"]["price_per_sheet"] == 100
    # verify calculate uses new price
    r2 = s.post(f"{API}/pricing/calculate", json={"sheets": 10})
    assert r2.json()["subtotal"] == 1000
    # revert
    r3 = s.put(f"{API}/admin/settings", headers=state["admin_auth"], json={"price_per_sheet": 90})
    assert r3.status_code == 200
    assert r3.json()["settings"]["price_per_sheet"] == 90


def test_admin_offer_crud(s):
    # list
    r = s.get(f"{API}/admin/offers", headers=state["admin_auth"])
    assert r.status_code == 200
    initial = len(r.json()["offers"])
    # create
    payload = {"name": "TEST Deal", "code": "TESTDEAL", "discount_type": "fixed",
               "value": 50, "min_order": 500, "active": True, "public": False}
    r = s.post(f"{API}/admin/offers", headers=state["admin_auth"], json=payload)
    assert r.status_code == 200
    offer = r.json()["offer"]
    assert offer["code"] == "TESTDEAL"
    oid = offer["id"]
    # update
    payload["value"] = 75
    r = s.put(f"{API}/admin/offers/{oid}", headers=state["admin_auth"], json=payload)
    assert r.status_code == 200
    # verify list count
    r = s.get(f"{API}/admin/offers", headers=state["admin_auth"])
    assert len(r.json()["offers"]) == initial + 1


def test_admin_process_bot_update(s):
    r = s.get(f"{API}/admin/process-bots", headers=state["admin_auth"])
    assert r.status_code == 200
    bots = r.json()["process_bots"]
    assert bots
    bot_id = bots[0]["id"]
    r = s.put(f"{API}/admin/process-bots/{bot_id}", headers=state["admin_auth"],
              json={"message": "TEST updated message"})
    assert r.status_code == 200
    # verify
    r2 = s.get(f"{API}/admin/process-bots", headers=state["admin_auth"])
    updated = [b for b in r2.json()["process_bots"] if b["id"] == bot_id][0]
    assert updated["message"] == "TEST updated message"


def test_admin_customers(s):
    r = s.get(f"{API}/admin/customers", headers=state["admin_auth"])
    assert r.status_code == 200
    _forbid_mongo_id(r.json())


def test_admin_requires_auth(s):
    r = s.get(f"{API}/admin/dashboard")
    assert r.status_code == 401
