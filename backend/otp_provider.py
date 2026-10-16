"""OTP and WhatsApp notification providers for ClickBook."""
import os
import logging
import secrets
import httpx

logger = logging.getLogger(__name__)

PROVIDER = os.environ.get("WHATSAPP_PROVIDER", "mock").strip().lower()
API_URL = os.environ.get("WHATSAPP_API_URL", "").strip()
API_KEY = os.environ.get("WHATSAPP_API_KEY", "").strip()
FROM = os.environ.get("WHATSAPP_FROM", "").strip()
TEMPLATE = os.environ.get("WHATSAPP_TEMPLATE", "authentication").strip()
CAMPAIGN = os.environ.get("WHATSAPP_CAMPAIGN", "clickbook-otp").strip()
PAYMENT_TEMPLATE = os.environ.get("WHATSAPP_PAYMENT_TEMPLATE", "sucessful_payment").strip()
PAYMENT_CAMPAIGN = os.environ.get("WHATSAPP_PAYMENT_CAMPAIGN", "clickbook-payment-confirmation").strip()


def generate_otp(length: int = 6) -> str:
    """Use predictable demo OTPs only in explicit mock mode."""
    if PROVIDER == "mock":
        return "123456"
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def _format_to(mobile: str) -> str:
    m = (mobile or "").strip()
    if m.startswith("+"):
        return m
    digits = "".join(ch for ch in m if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    return f"+{digits}" if digits else m


def _aoc_headers() -> dict:
    return {"apikey": API_KEY, "Content-Type": "application/json"}


async def send_otp(mobile: str, otp: str, channel: str = "whatsapp") -> dict:
    """Send OTP through the configured provider. Never silently fall back to mock."""
    if PROVIDER == "mock":
        logger.info("[MOCK OTP] provider=mock channel=%s", channel)
        return {"success": True, "provider": "mock", "message": "OTP delivered (mock)"}

    if PROVIDER != "aoc":
        logger.error("Unsupported WhatsApp provider configured: %s", PROVIDER)
        return {"success": False, "provider": PROVIDER, "message": "WhatsApp provider is not configured correctly"}

    missing = [
        name for name, value in (
            ("WHATSAPP_API_URL", API_URL),
            ("WHATSAPP_API_KEY", API_KEY),
            ("WHATSAPP_FROM", FROM),
            ("WHATSAPP_TEMPLATE", TEMPLATE),
        ) if not value
    ]
    if missing:
        logger.error("WhatsApp provider configuration missing: %s", ", ".join(missing))
        return {"success": False, "provider": PROVIDER, "message": "WhatsApp provider configuration is incomplete"}

    payload = {
        "from": FROM,
        "campaignName": CAMPAIGN,
        "to": _format_to(mobile),
        "templateName": TEMPLATE,
        "otp": otp,
        "type": "template",
        "language": {"code": "en"},
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(API_URL, headers=_aoc_headers(), json=payload)
        ok = 200 <= response.status_code < 300
        logger.info("WhatsApp OTP provider response status=%s", response.status_code)
        if not ok:
            logger.warning("WhatsApp OTP provider rejected request (HTTP %s)", response.status_code)
        return {
            "success": ok,
            "provider": PROVIDER,
            "message": "OTP sent via WhatsApp" if ok else "WhatsApp provider rejected the request",
            "raw_status": response.status_code,
        }
    except Exception as exc:
        logger.warning("WhatsApp OTP request failed (%s)", type(exc).__name__)
        return {"success": False, "provider": PROVIDER, "message": "WhatsApp delivery failed"}


async def send_payment_confirmation(order: dict) -> dict:
    """Send the approved AOC payment template after an order is confirmed as paid.
    Delivery failures must never roll back or fail a verified payment.
    """
    if PROVIDER != "aoc":
        logger.info("Skipping WhatsApp payment confirmation: provider is not configured for AOC")
        return {"success": False, "reason": "provider_not_aoc"}

    missing = [
        name for name, value in (
            ("WHATSAPP_API_URL", API_URL),
            ("WHATSAPP_API_KEY", API_KEY),
            ("WHATSAPP_FROM", FROM),
            ("WHATSAPP_PAYMENT_TEMPLATE", PAYMENT_TEMPLATE),
        ) if not value
    ]
    if missing:
        logger.warning("WhatsApp payment confirmation configuration missing: %s", ", ".join(missing))
        return {"success": False, "reason": "configuration_incomplete"}

    customer = order.get("customer_snapshot") or {}
    mobile = customer.get("mobile") or ""
    if not mobile:
        logger.warning("Skipping WhatsApp payment confirmation: order %s has no customer mobile", order.get("order_no", "unknown"))
        return {"success": False, "reason": "customer_mobile_missing"}

    try:
        total = float(((order.get("price") or {}).get("total")) or 0)
        amount_text = f"INR {total:,.2f}"
        order_label = (order.get("album_name") or order.get("cover_title") or order.get("order_no") or "ClickBook order").strip()
        payload = {
            "from": FROM,
            "campaignName": PAYMENT_CAMPAIGN,
            "to": _format_to(mobile),
            "templateName": PAYMENT_TEMPLATE,
            "components": {"body": {"params": [amount_text, order_label]}},
            "type": "template",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(API_URL, headers=_aoc_headers(), json=payload)
        ok = 200 <= response.status_code < 300
        if ok:
            logger.info("WhatsApp payment confirmation accepted by provider for order %s", order.get("order_no", "unknown"))
        else:
            logger.warning("WhatsApp payment confirmation rejected for order %s (HTTP %s)",
                           order.get("order_no", "unknown"), response.status_code)
        return {"success": ok, "raw_status": response.status_code}
    except Exception as exc:
        logger.warning("WhatsApp payment confirmation failed for order %s (%s)",
                       order.get("order_no", "unknown"), type(exc).__name__)
        return {"success": False, "reason": "provider_request_failed"}
