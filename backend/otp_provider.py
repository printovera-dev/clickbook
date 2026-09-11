"""OTP messaging providers. Clean abstraction so WhatsApp/SMS providers can be swapped later."""
import os
import logging
import secrets
import httpx

logger = logging.getLogger(__name__)

PROVIDER = os.environ.get("WHATSAPP_PROVIDER", "mock")
API_URL = os.environ.get("WHATSAPP_API_URL", "")
API_KEY = os.environ.get("WHATSAPP_API_KEY", "")
FROM = os.environ.get("WHATSAPP_FROM", "")
TEMPLATE = os.environ.get("WHATSAPP_TEMPLATE", "clickbook")
CAMPAIGN = os.environ.get("WHATSAPP_CAMPAIGN", "clickbook-otp")


def generate_otp(length: int = 6) -> str:
    if PROVIDER == "mock" or not API_KEY:
        return "123456"
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def _format_to(mobile: str) -> str:
    m = mobile.strip()
    if m.startswith("+"):
        return m
    # naive: assume Indian if 10 digits
    digits = "".join(ch for ch in m if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    return f"+{digits}" if digits else m


async def send_otp(mobile: str, otp: str, channel: str = "whatsapp") -> dict:
    """Send OTP via configured provider. Returns {success, provider, message, raw}."""
    if PROVIDER == "mock" or not (API_KEY and API_URL):
        logger.info(f"[MOCK OTP] {channel} to {mobile}: {otp}")
        return {"success": True, "provider": "mock", "message": "OTP delivered (mock)"}

    to = _format_to(mobile)
    payload = {
        "from": FROM,
        "campaignName": CAMPAIGN,
        "to": to,
        "templateName": TEMPLATE,
        "components": {"body": {"params": [otp]}},
        "type": "template",
    }
    headers = {"apikey": API_KEY, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(API_URL, headers=headers, json=payload)
        ok = r.status_code < 400
        logger.info(f"[WA] {to} status={r.status_code} body={r.text[:200]}")
        return {
            "success": ok,
            "provider": PROVIDER,
            "message": "OTP sent via WhatsApp" if ok else f"Provider error: {r.text[:120]}",
            "raw_status": r.status_code,
        }
    except Exception as e:
        logger.warning(f"[WA] send failed: {e}")
        return {"success": False, "provider": PROVIDER, "message": str(e)}
