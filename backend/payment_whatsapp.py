"""AOC Portal WhatsApp payment confirmation notifications.

Kept separate from OTP delivery so payment messaging cannot change authentication.
"""
import logging
import os

import httpx

from core import logger

API_URL = os.environ.get("WHATSAPP_API_URL", "https://api.aoc-portal.com/v1/whatsapp").strip()
API_KEY = os.environ.get("WHATSAPP_API_KEY", "").strip()
FROM = os.environ.get("WHATSAPP_FROM", "").strip()
TEMPLATE = os.environ.get("WHATSAPP_PAYMENT_TEMPLATE", "sucessful_payment").strip()
CAMPAIGN = os.environ.get("WHATSAPP_PAYMENT_CAMPAIGN", "clickbook-payment-confirmation").strip()


def _format_to(mobile: str) -> str:
    value = (mobile or "").strip()
    if value.startswith("+"):
        return value
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    return f"+{digits}" if digits else ""


async def send_payment_confirmation(order: dict) -> bool:
    """Send the approved two-variable template; failures never undo a paid order."""
    if not all((API_URL, API_KEY, FROM, TEMPLATE, CAMPAIGN)):
        logger.warning("WhatsApp payment confirmation skipped: provider configuration is incomplete")
        return False

    snapshot = order.get("customer_snapshot") or {}
    recipient = _format_to(snapshot.get("mobile", ""))
    if not recipient:
        logger.warning("WhatsApp payment confirmation skipped: no customer mobile for order %s",
                       order.get("order_no", "unknown"))
        return False

    try:
        total = float(((order.get("price") or {}).get("total")) or 0)
        amount = f"₹{total:,.2f}"
        order_number = str(order.get("order_no") or order.get("id") or "")
        payload = {
            "from": FROM,
            "campaignName": CAMPAIGN,
            "to": recipient,
            "templateName": TEMPLATE,
            "components": {"body": {"params": [amount, order_number]}},
            "type": "template",
        }
        headers = {"apikey": API_KEY, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(API_URL, headers=headers, json=payload)
        if 200 <= response.status_code < 300:
            logger.info("WhatsApp payment confirmation accepted for order %s (HTTP %s)",
                        order_number, response.status_code)
            return True
        logger.warning("WhatsApp payment confirmation rejected for order %s (HTTP %s)",
                       order_number, response.status_code)
        return False
    except Exception as exc:
        logger.warning("WhatsApp payment confirmation failed for order %s (%s)",
                       order.get("order_no", "unknown"), type(exc).__name__)
        return False
