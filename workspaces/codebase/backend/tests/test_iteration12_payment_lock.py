"""Iteration 12: payment-only album lock (server-side), album lifecycle fields, WhatsApp setting."""
import os, re
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://memories-album.preview.emergentagent.com").rstrip("/")
ASSETS = "/app/backend/tests/assets"
MOBILE = "9876500555"


@pytest.fixture(scope="module")
def h():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/otp/send", json={"mobile": MOBILE, "channel": "whatsapp"}).json()
    otp = re.search(r"(\d{6})", str(r.get("dev_hint") or "123456")).group(1)
    tok = s.post(f"{BASE}/api/auth/otp/verify", json={"mobile": MOBILE, "otp": otp}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def album(h):
    cover = requests.get(f"{BASE}/api/covers").json()["covers"][0]["id"]
    a = requests.post(f"{BASE}/api/albums", headers=h, json={"cover_id": cover, "name": "Lock test"}).json()["album"]
    assert a["state"] == "creating" and a["is_complete"] is False
    for i in (1, 2, 3):
        with open(f"{ASSETS}/test_photo_{i}.jpg", "rb") as f:
            assert requests.post(f"{BASE}/api/albums/{a['id']}/photos", headers=h, files={"file": (f"p{i}.jpg", f, "image/jpeg")}).status_code == 200
    mid = requests.get(f"{BASE}/api/albums/{a['id']}", headers=h).json()["album"]
    assert mid["state"] == "uploading" and mid["is_complete"] is False  # crash here → not a finished album
    g = requests.post(f"{BASE}/api/albums/{a['id']}/generate", headers=h, json={"allow_short": True, "style": "balanced"})
    assert g.status_code == 200
    a = g.json()["album"]
    return a


def _edit_calls(h, a):
    pages = a["pages"]
    pages[0]["background"] = "#EEEEEE"
    yield requests.put(f"{BASE}/api/albums/{a['id']}/pages", headers=h, json={"pages": pages})
    yield requests.put(f"{BASE}/api/albums/{a['id']}", headers=h, json={"name": "Renamed"})
    with open(f"{ASSETS}/test_photo_1.jpg", "rb") as f:
        yield requests.post(f"{BASE}/api/albums/{a['id']}/photos", headers=h, files={"file": ("x.jpg", f, "image/jpeg")})
    yield requests.post(f"{BASE}/api/albums/{a['id']}/generate", headers=h, json={"allow_short": True, "style": "elegant"})


def test_lifecycle_and_cover_thumbnail(h, album):
    got = requests.get(f"{BASE}/api/albums/{album['id']}", headers=h).json()["album"]
    assert got["state"] == "draft" and got["is_complete"] is True
    cover_photo = next(p for p in got["photos"] if p["id"] == got["cover_design"]["photo_id"])
    assert got["cover_thumbnail_url"] == cover_photo["thumbnail_url"]
    lst = requests.get(f"{BASE}/api/albums", headers=h).json()["albums"]
    assert all("state" in a and "is_complete" in a for a in lst)


def test_order_alone_does_not_lock(h, album):
    o = requests.post(f"{BASE}/api/orders", headers=h, json={"album_id": album["id"], "address": {"name": "T", "line1": "1", "city": "P", "state": "M", "pincode": "411001", "mobile": MOBILE}})
    assert o.status_code == 200, o.text
    order = o.json()["order"]
    assert order["payment_status"] == "pending" and order.get("cover_thumbnail_url")
    got = requests.get(f"{BASE}/api/albums/{album['id']}", headers=h).json()["album"]
    assert not got.get("locked") and got["state"] == "draft"
    a = requests.get(f"{BASE}/api/albums/{album['id']}", headers=h).json()["album"]
    for r in _edit_calls(h, a):
        assert r.status_code == 200, f"edit before payment must work: {r.status_code} {r.text}"
    album["order_id"] = order["id"]


def test_payment_success_locks_every_mutation_api(h, album):
    p = requests.post(f"{BASE}/api/orders/pay", headers=h, json={"order_id": album["order_id"], "payment_method": "mock"})
    assert p.status_code == 200
    a = requests.get(f"{BASE}/api/albums/{album['id']}", headers=h).json()["album"]
    assert a["locked"] is True and a["state"] == "locked"
    for r in _edit_calls(h, a):
        assert r.status_code == 409, f"expected 409 after payment, got {r.status_code}: {r.text}"
        assert "locked because payment has been completed" in r.json()["detail"]
    d = requests.delete(f"{BASE}/api/albums/{album['id']}/photos/{a['photos'][0]['id']}", headers=h)
    assert d.status_code == 409


def test_support_whatsapp_setting():
    s = requests.get(f"{BASE}/api/settings").json()["settings"]
    assert s["support_whatsapp"] == "9999117810"
