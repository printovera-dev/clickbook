"""
ClickBook NEW features test suite (iteration 2):
Feature 1: Photo rearrangement in editor - PUT /api/albums/{id}/pages persists
           swapped photo_ids across pages and within a page.
Feature 2: Gift wrap add-on at checkout - settings, pricing, orders, admin.

Runs against public EXPO_PUBLIC_BACKEND_URL with /api prefix.
Ordered tests share state via `state` dict - run with default pytest ordering.
"""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

state: dict = {}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _mk_image(color) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (600, 600), color).save(buf, format="JPEG", quality=80)
    return buf.getvalue()


# ---------- Feature 2a: settings expose gift_wrap_fee ----------
def test_settings_include_gift_wrap_fee(s):
    r = s.get(f"{API}/settings", timeout=15)
    assert r.status_code == 200
    st = r.json()["settings"]
    assert "gift_wrap_fee" in st, "gift_wrap_fee missing from /api/settings"
    assert st["gift_wrap_fee"] == 150, f"expected default 150, got {st['gift_wrap_fee']}"


# ---------- Feature 2b: pricing with gift wrap ----------
def test_pricing_gift_wrap_true(s):
    r = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "gift_wrap": True})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["subtotal"] == 900
    assert b["gift_wrap_fee"] == 150
    assert b["gift_wrap"] is True
    assert b["taxable"] == 1050
    assert b["gst"] == 189
    assert b["total"] == 1239


def test_pricing_gift_wrap_false(s):
    r = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "gift_wrap": False})
    assert r.status_code == 200
    b = r.json()
    assert b["subtotal"] == 900
    assert b["gift_wrap_fee"] == 0
    assert b["gift_wrap"] is False
    assert b["taxable"] == 900
    assert b["gst"] == 162
    assert b["total"] == 1062


def test_pricing_gift_wrap_with_coupon(s):
    r = s.post(f"{API}/pricing/calculate",
               json={"sheets": 10, "gift_wrap": True, "coupon_code": "WELCOME2026"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["subtotal"] == 900
    assert b["discount"] == 90.0
    assert b["gift_wrap_fee"] == 150
    assert b["taxable"] == 960
    assert b["gst"] == 172.8
    assert b["total"] == 1132.8


# ---------- Setup: customer + album with 4 photos ----------
def test_customer_auth(s):
    mobile = f"96{int(time.time()) % 100000000:08d}"
    state["mobile"] = mobile
    r = s.post(f"{API}/auth/otp/send", json={"mobile": mobile, "channel": "sms"})
    assert r.status_code == 200
    otp = r.json().get("dev_hint") or "123456"
    r = s.post(f"{API}/auth/otp/verify", json={"mobile": mobile, "otp": otp})
    assert r.status_code == 200, r.text
    state["auth"] = {"Authorization": f"Bearer {r.json()['token']}"}


def test_create_album_with_photos(s):
    r = s.get(f"{API}/covers")
    cover_id = r.json()["covers"][0]["id"]
    r = s.post(f"{API}/albums", headers=state["auth"],
               json={"cover_id": cover_id, "name": "TEST GiftWrap Album"})
    assert r.status_code == 200, r.text
    state["album_id"] = r.json()["album"]["id"]
    colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
    for i, c in enumerate(colors):
        files = {"file": (f"gw_{i}.jpg", _mk_image(c), "image/jpeg")}
        r = s.post(f"{API}/albums/{state['album_id']}/photos", headers=state["auth"], files=files)
        assert r.status_code == 200, r.text


def test_auto_generate_album(s):
    r = s.post(f"{API}/albums/{state['album_id']}/generate", headers=state["auth"])
    assert r.status_code == 200, r.text
    pages = r.json()["album"]["pages"]
    assert len(pages) >= 2, "need at least 2 pages for cross-page swap"
    state["pages"] = pages
    state["sheets"] = r.json()["album"]["sheets"]


# ---------- Feature 1: photo rearrangement ----------
def test_swap_photos_across_pages(s):
    pages = state["pages"]
    p0_ids = list(pages[0]["photo_ids"])
    p1_ids = list(pages[1]["photo_ids"])
    # swap first photo of page 0 with first photo of page 1
    p0_ids[0], p1_ids[0] = p1_ids[0], p0_ids[0]
    new_pages = [dict(pages[0], photo_ids=p0_ids), dict(pages[1], photo_ids=p1_ids)] + pages[2:]
    r = s.put(f"{API}/albums/{state['album_id']}/pages", headers=state["auth"],
              json={"pages": new_pages})
    assert r.status_code == 200, r.text
    # verify persistence via GET
    r2 = s.get(f"{API}/albums/{state['album_id']}", headers=state["auth"])
    assert r2.status_code == 200
    got = r2.json()["album"]["pages"]
    assert got[0]["photo_ids"] == p0_ids, f"page0 photo_ids not persisted: {got[0]['photo_ids']}"
    assert got[1]["photo_ids"] == p1_ids, f"page1 photo_ids not persisted: {got[1]['photo_ids']}"
    state["pages"] = got


def test_swap_photos_within_two_photo_page(s):
    pages = state["pages"]
    two_photo_idx = next((i for i, p in enumerate(pages) if len(p["photo_ids"]) == 2), None)
    assert two_photo_idx is not None, "no 2-photo page found to test within-page swap"
    original = list(pages[two_photo_idx]["photo_ids"])
    reversed_ids = list(reversed(original))
    new_pages = list(pages)
    new_pages[two_photo_idx] = dict(pages[two_photo_idx], photo_ids=reversed_ids)
    r = s.put(f"{API}/albums/{state['album_id']}/pages", headers=state["auth"],
              json={"pages": new_pages})
    assert r.status_code == 200, r.text
    # verify persistence via GET
    r2 = s.get(f"{API}/albums/{state['album_id']}", headers=state["auth"])
    got = r2.json()["album"]["pages"]
    assert got[two_photo_idx]["photo_ids"] == reversed_ids
    assert got[two_photo_idx]["photo_ids"] != original
    state["pages"] = got


# ---------- Feature 2c: orders with gift wrap ----------
def test_order_with_gift_wrap_and_coupon(s):
    payload = {
        "album_id": state["album_id"],
        "coupon_code": "WELCOME2026",
        "gift_wrap": True,
        "address": {"name": "Test", "line1": "1 Test Rd", "city": "Bengaluru",
                    "pin": "560001", "phone": state["mobile"]},
    }
    r = s.post(f"{API}/orders", headers=state["auth"], json=payload)
    assert r.status_code == 200, r.text
    order = r.json()["order"]
    assert order["gift_wrap"] is True, "order.gift_wrap should be true"
    price = order["price"]
    # album sheets=10 (min) -> subtotal 900, discount 90, fee 150, taxable 960, gst 172.8, total 1132.8
    sheets = state["sheets"]
    assert price["subtotal"] == round(sheets * 90, 2)
    assert price["gift_wrap_fee"] == 150
    assert price["discount"] == round(price["subtotal"] * 0.10, 2)
    assert price["taxable"] == round(price["subtotal"] - price["discount"] + 150, 2)
    assert price["gst"] == round(price["taxable"] * 0.18, 2)
    assert price["total"] == round(price["taxable"] + price["gst"], 2)
    # exact expected numbers when sheets == 10
    if sheets == 10:
        assert price["subtotal"] == 900
        assert price["discount"] == 90.0
        assert price["taxable"] == 960
        assert price["gst"] == 172.8
        assert price["total"] == 1132.8
    state["order_gw_id"] = order["id"]
    # verify persistence via GET
    r2 = s.get(f"{API}/orders/{order['id']}", headers=state["auth"])
    assert r2.status_code == 200
    assert r2.json()["order"]["gift_wrap"] is True


def test_order_without_gift_wrap(s):
    payload = {
        "album_id": state["album_id"],
        "gift_wrap": False,
        "address": {"name": "Test", "line1": "1 Test Rd", "city": "Bengaluru",
                    "pin": "560001", "phone": state["mobile"]},
    }
    r = s.post(f"{API}/orders", headers=state["auth"], json=payload)
    assert r.status_code == 200, r.text
    order = r.json()["order"]
    assert order["gift_wrap"] is False
    assert order["price"]["gift_wrap_fee"] == 0
    sheets = state["sheets"]
    assert order["price"]["total"] == round(sheets * 90 * 1.18, 2)
    state["order_nogw_id"] = order["id"]


# ---------- Feature 2d: admin settings + admin orders gift_wrap ----------
def test_admin_login(s):
    r = s.post(f"{API}/admin/login", json={"username": "admin", "password": "clickbook@2026"})
    assert r.status_code == 200, r.text
    state["admin_auth"] = {"Authorization": f"Bearer {r.json()['token']}"}


def test_admin_update_gift_wrap_fee_and_revert(s):
    # set to 200
    r = s.put(f"{API}/admin/settings", headers=state["admin_auth"], json={"gift_wrap_fee": 200})
    assert r.status_code == 200, r.text
    assert r.json()["settings"]["gift_wrap_fee"] == 200
    # verify pricing reflects 200
    r2 = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "gift_wrap": True})
    b = r2.json()
    assert b["gift_wrap_fee"] == 200
    assert b["taxable"] == 1100
    assert b["gst"] == 198
    assert b["total"] == 1298
    # revert to 150
    r3 = s.put(f"{API}/admin/settings", headers=state["admin_auth"], json={"gift_wrap_fee": 150})
    assert r3.status_code == 200
    assert r3.json()["settings"]["gift_wrap_fee"] == 150
    r4 = s.post(f"{API}/pricing/calculate", json={"sheets": 10, "gift_wrap": True})
    assert r4.json()["gift_wrap_fee"] == 150


def test_admin_orders_include_gift_wrap(s):
    r = s.get(f"{API}/admin/orders", headers=state["admin_auth"])
    assert r.status_code == 200
    orders = r.json()["orders"]
    gw = [o for o in orders if o["id"] == state["order_gw_id"]]
    nogw = [o for o in orders if o["id"] == state["order_nogw_id"]]
    assert gw, "gift-wrap order not in admin orders list"
    assert nogw, "non-gift-wrap order not in admin orders list"
    assert gw[0]["gift_wrap"] is True
    assert nogw[0]["gift_wrap"] is False
    for o in orders:
        assert "gift_wrap" in o, f"order {o['id']} missing gift_wrap field in admin list"
