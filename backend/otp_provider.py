"""OTP messaging providers. Clean abstraction so WhatsApp/SMS providers can be swapped later."""
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


def generate_otp(length: int = 6) -> str:
    """Use predictable demo OTPs only in explicit mock mode."""
    if PROVIDER == "mock":
        return "123456"
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def _format_to(mobile: str) -> str:
    m = mobile.strip()
    if m.startswith("+"):
        return m
    digits = "".join(ch for ch in m if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    return f"+{digits}" if digits else m


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

    to = _format_to(mobile)
    # Match the AOC portal's documented template request shape.
    payload = {
        "from": FROM,
        "campaignName": CAMPAIGN,
        "to": to,
        "templateName": TEMPLATE,
        "otp": otp,
        "type": "template",
        "language": {"code": "en"},
    }
    headers = {"apikey": API_KEY, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(API_URL, headers=headers, json=payload)
        ok = 200 <= response.status_code < 300
        logger.info("WhatsApp OTP provider response status=%s", response.status_code)
        if not ok:
            # Do not log provider response bodies: they may contain sensitive account data.
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
