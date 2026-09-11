"""
ClickBook NEW features test suite (iteration 3):
1. Legal policies API (/api/policies, /api/policies/{key}, 404)
2. WhatsApp OTP provider abstraction (provider field, aoc no-crash, mock flow)
3. Razorpay payments (mock mode) - order create, checkout HTML, verify
4. Regression: gift_note field persists on orders

Ordered tests share state via `state` dict. Run with default pytest ordering.

Note: this suite temporarily flips WHATSAPP_PROVIDER=mock in /app/backend/.env,
restarts backend, runs OTP flow with 123456, then restores WHATSAPP_PROVIDER=aoc.
"""
import io
import os
import re
import subprocess
import time
from pathlib import Path

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ENV_PATH = Path("/app/backend/.env")
state: dict = {}


def _read_env() -> str:
    return ENV_PATH.read_text()


def _set_provider(new_val: str):
    txt = _read_env()
    new_txt = re.sub(
        r'^WHATSAPP_PROVIDER=.*$',
        f'WHATSAPP_PROVIDER="{new_val}"',
        txt,
        flags=re.MULTILINE,
    )
    ENV_PATH.write_text(new_txt)
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"],
                   check=True, capture_output=True)
    # wait for backend to come back
    for _ in range(30):
        try:
            r = requests.get(f"{API}/settings", timeout=3)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Backend did not come back after restart")


def _mk_image(color) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (600, 600), color).save(buf, format="JPEG", quality=80)
    return buf.getvalue()


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ============ 1. Legal policies API ============
def test_policies_list(s):
    r = s.get(f"{API}/policies", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "policies" in body, f"expected 'policies' wrapper, got {body}"
    items = body["policies"]
    assert isinstance(items, list)
    keys = {p["key"] for p in items}
    assert keys == {"privacy", "terms", "refund", "shipping"}, f"unexpected keys: {keys}"
    for p in items:
        assert p.get("title"), f"missing title for {p['key']}"
        assert p.get("updated"), f"missing updated for {p['key']}"


@pytest.mark.parametrize("key", ["privacy", "terms", "refund", "shipping"])
def test_policy_detail(s, key):
    r = s.get(f"{API}/policies/{key}", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "policy" in body
    pol = body["policy"]
    assert pol["key"] == key
    assert pol.get("title")
    assert pol.get("updated")
    assert isinstance(pol.get("body"), str) and len(pol["body"]) > 200, \
        f"policy body for {key} too short: {len(pol.get('body') or '')}"


def test_policy_404(s):
    r = s.get(f"{API}/policies/nonexistent", timeout=15)
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


# ============ 2a. OTP send with aoc provider (initial state) ============
def test_otp_send_with_aoc_provider_no_crash(s):
    """Even if outbound WhatsApp call fails (aoc-portal unreachable in preview),
    endpoint must return success:true with provider field, and store OTP in DB."""
    # Confirm current provider is aoc as per repo state
    env_txt = _read_env()
    assert 'WHATSAPP_PROVIDER="aoc"' in env_txt, \
        f"repo state expected WHATSAPP_PROVIDER=aoc, got env:\n{env_txt}"

    mobile = f"97{int(time.time()) % 100000000:08d}"
    state["aoc_mobile"] = mobile
    r = s.post(f"{API}/auth/otp/send", json={"mobile": mobile, "channel": "whatsapp"},
               timeout=30)
    assert r.status_code == 200, f"OTP send crashed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("provider") == "aoc", f"expected provider=aoc, got {body}"
    # Template not yet approved on aoc-portal -> success False but dev_hint exposed so testers aren't blocked.
    if not body.get("success"):
        assert body.get("dev_hint"), f"provider failed without dev_hint fallback: {body}"


# ============ 2b. Flip to mock, do full OTP flow with 123456 ============
def test_switch_to_mock_provider():
    _set_provider("mock")
    state["provider_flipped"] = True


def test_otp_send_mock_returns_provider(s):
    mobile = f"98{int(time.time()) % 100000000:08d}"
    state["mobile"] = mobile
    r = s.post(f"{API}/auth/otp/send", json={"mobile": mobile, "channel": "sms"},
               timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    # mock provider -> dev_hint 123456; aoc provider w/ unapproved template -> success False + random dev_hint
    assert body.get("dev_hint"), f"no OTP obtainable: {body}"
    state["otp"] = body["dev_hint"]


def test_otp_verify_with_fallback_code(s):
    mobile = state["mobile"]
    r = s.post(f"{API}/auth/otp/verify", json={"mobile": mobile, "otp": state["otp"]},
               timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("token"), "no token returned"
    assert body.get("customer", {}).get("mobile") == mobile
    state["auth"] = {"Authorization": f"Bearer {body['token']}"}


# ============ 3a. Payments config ============
def test_payments_config_mock(s):
    r = s.get(f"{API}/payments/config", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("provider") in ("mock", "razorpay"), body
    state["pay_provider"] = body["provider"]
    if body["provider"] == "razorpay":
        assert body.get("razorpay_key_id", "").startswith("rzp_"), body
    else:
        assert body.get("razorpay_key_id") == "", body


# ============ 3b. Set up album for order tests ============
def test_create_album_with_photos(s):
    r = s.get(f"{API}/covers")
    assert r.status_code == 200
    cover_id = r.json()["covers"][0]["id"]
    r = s.post(f"{API}/albums", headers=state["auth"],
               json={"cover_id": cover_id, "name": "TEST Iter3 Razorpay Album"})
    assert r.status_code == 200, r.text
    state["album_id"] = r.json()["album"]["id"]
    for i, c in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]):
        files = {"file": (f"iter3_{i}.jpg", _mk_image(c), "image/jpeg")}
        r = s.post(f"{API}/albums/{state['album_id']}/photos",
                   headers=state["auth"], files=files)
        assert r.status_code == 200, r.text
    r = s.post(f"{API}/albums/{state['album_id']}/generate", headers=state["auth"])
    assert r.status_code == 200, r.text
    state["sheets"] = r.json()["album"]["sheets"]


def test_create_order_with_gift_note(s):
    """Regression: gift_note stored when gift_wrap=true."""
    payload = {
        "album_id": state["album_id"],
        "gift_wrap": True,
        "gift_note": "Happy Birthday!",
        "address": {"name": "T", "line1": "1 Rd", "city": "Bengaluru",
                    "pin": "560001", "phone": state["mobile"]},
    }
    r = s.post(f"{API}/orders", headers=state["auth"], json=payload)
    assert r.status_code == 200, r.text
    order = r.json()["order"]
    state["order_id"] = order["id"]
    state["order_no"] = order["order_no"]
    state["order_total"] = order["price"]["total"]
    assert order["gift_wrap"] is True
    assert order["gift_note"] == "Happy Birthday!", \
        f"gift_note not stored, got: {order.get('gift_note')!r}"
    # verify persistence via GET
    r2 = s.get(f"{API}/orders/{order['id']}", headers=state["auth"])
    assert r2.status_code == 200
    got = r2.json()["order"]
    assert got["gift_note"] == "Happy Birthday!"
    assert got["gift_wrap"] is True


# ============ 3c. Razorpay order create (mock) ============
def test_razorpay_order_create_mock(s):
    r = s.post(f"{API}/payments/razorpay/order",
               headers=state["auth"],
               json={"order_id": state["order_id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["razorpay_order_id"].startswith("order_"), body["razorpay_order_id"]
    assert body["provider"] == state["pay_provider"]
    expected_paise = int(round(float(state["order_total"]) * 100))
    assert body["amount"] == expected_paise, \
        f"amount mismatch: got {body['amount']} expected {expected_paise}"
    assert body["currency"] == "INR"
    assert body["checkout_url"] == f"/api/payments/razorpay/checkout/{body['razorpay_order_id']}"
    state["rzp_order_id"] = body["razorpay_order_id"]


# ============ 3d. Checkout HTML shell ============
def test_razorpay_checkout_html(s):
    r = s.get(f"{API}/payments/razorpay/checkout/{state['rzp_order_id']}", timeout=15)
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
    assert "text/html" in r.headers.get("content-type", ""), \
        f"expected text/html, got {r.headers.get('content-type')}"
    html = r.text
    assert "ClickBook" in html, "ClickBook name missing from checkout shell"
    assert "checkout.razorpay.com/v1/checkout.js" in html, \
        "razorpay checkout.js script tag missing"
    assert state["rzp_order_id"] in html, "order_id not embedded in shell"


# ============ 3e. Razorpay verify (mock accepts anything; live requires a valid HMAC) ============
def test_razorpay_verify_mock(s):
    payload = {"razorpay_order_id": state["rzp_order_id"], "razorpay_payment_id": "pay_mocktest",
               "razorpay_signature": "anysig"}
    if state["pay_provider"] == "razorpay":
        r = s.post(f"{API}/payments/razorpay/verify", headers=state["auth"], json=payload)
        assert r.status_code == 400, f"live mode must reject a forged signature: {r.status_code} {r.text}"
        # Now sign correctly with the key secret so the rest of the flow (paid -> ordered) is exercised.
        import hmac, hashlib
        secret = next(l.split("=", 1)[1].strip().strip('"') for l in _read_env().splitlines()
                      if l.startswith("RAZORPAY_KEY_SECRET="))
        msg = f"{state['rzp_order_id']}|pay_mocktest".encode()
        payload["razorpay_signature"] = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    r = s.post(f"{API}/payments/razorpay/verify", headers=state["auth"], json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["payment_id"] == "pay_mocktest"
    assert body["order_id"] == state["order_id"]
    # verify order marked paid via GET
    r2 = s.get(f"{API}/orders/{state['order_id']}", headers=state["auth"])
    assert r2.status_code == 200
    got = r2.json()["order"]
    assert got["payment_status"] == "paid", \
        f"expected paid, got {got.get('payment_status')}"
    assert got.get("payment_method") == "razorpay"
    assert got.get("razorpay_payment_id") == "pay_mocktest"


def test_razorpay_verify_rejects_empty_signature(s):
    """Mock accepts any non-empty signature - empty must be rejected."""
    # create a fresh order to verify against (previous one already paid)
    r = s.post(f"{API}/orders", headers=state["auth"], json={
        "album_id": state["album_id"], "gift_wrap": False,
        "address": {"name": "T", "line1": "1 Rd", "city": "Bengaluru",
                    "pin": "560001", "phone": state["mobile"]},
    })
    assert r.status_code == 200, r.text
    ord_id = r.json()["order"]["id"]
    r2 = s.post(f"{API}/payments/razorpay/order", headers=state["auth"],
                json={"order_id": ord_id})
    rzp_id = r2.json()["razorpay_order_id"]
    r3 = s.post(f"{API}/payments/razorpay/verify", headers=state["auth"], json={
        "razorpay_order_id": rzp_id,
        "razorpay_payment_id": "",
        "razorpay_signature": "",
    })
    assert r3.status_code == 400, f"expected 400 for empty sig, got {r3.status_code}"
    state["unpaid_order_id"] = ord_id


# ============ 3f. Legacy /orders/pay still works ============
def test_legacy_orders_pay_still_works(s):
    # use the unpaid order from previous test
    ord_id = state.get("unpaid_order_id")
    assert ord_id, "no unpaid order set up"
    r = s.post(f"{API}/orders/pay", headers=state["auth"],
               json={"order_id": ord_id, "payment_method": "mock"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["payment_id"].startswith("MOCK_"), \
        f"expected MOCK_ prefix, got {body['payment_id']}"
    # verify persistence
    r2 = s.get(f"{API}/orders/{ord_id}", headers=state["auth"])
    assert r2.status_code == 200
    got = r2.json()["order"]
    assert got["payment_status"] == "paid"
    assert got.get("payment_id", "").startswith("MOCK_")


# ============ Cleanup: restore aoc provider ============
def test_zzz_restore_aoc_provider():
    """Final teardown - restore WHATSAPP_PROVIDER=aoc as documented."""
    if state.get("provider_flipped"):
        _set_provider("aoc")
        # confirm
        env_txt = _read_env()
        assert 'WHATSAPP_PROVIDER="aoc"' in env_txt
