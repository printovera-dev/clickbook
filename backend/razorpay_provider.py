"""Razorpay payments with mock fallback restricted to non-production environments."""
import os
import hmac
import hashlib
import logging
import secrets

logger = logging.getLogger(__name__)

APP_ENV = os.environ.get("APP_ENV", "").strip().lower()
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()

_client = None


def is_production() -> bool:
    return APP_ENV in {"production", "prod"}


def is_live_configured() -> bool:
    return (
        RAZORPAY_KEY_ID.startswith("rzp_live_")
        and len(RAZORPAY_KEY_SECRET) >= 16
        and len(set(RAZORPAY_KEY_SECRET.lower())) > 1
        and not RAZORPAY_KEY_SECRET.startswith("YOUR_")
    )


def is_configured() -> bool:
    if is_production():
        return is_live_configured()
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) and not RAZORPAY_KEY_ID.startswith("YOUR_")


def get_client():
    global _client
    if _client is None and is_configured():
        import razorpay
        _client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    return _client


def create_order(amount_paise: int, receipt: str, notes: dict = None) -> dict:
    """Returns a Razorpay order, or a mock only outside production."""
    if not is_configured():
        if is_production():
            raise RuntimeError("Live Razorpay credentials are not configured for production.")
        rid = f"order_mock_{secrets.token_hex(6)}"
        return {"id": rid, "amount": amount_paise, "currency": "INR", "receipt": receipt,
                "provider": "mock", "status": "created"}
    client = get_client()
    remote = client.order.create(data={
        "amount": int(amount_paise),
        "currency": "INR",
        "receipt": receipt,
        "notes": notes or {},
    })
    remote["provider"] = "razorpay"
    return remote


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    if not is_configured():
        return bool(payment_id and signature) and not is_production()
    msg = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook(raw_body: bytes, received_signature: str) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_signature or "")


def public_key_id() -> str:
    return RAZORPAY_KEY_ID if is_configured() else ""
