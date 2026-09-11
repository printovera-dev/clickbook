"""Public catalog: covers, layouts, backgrounds, settings, offers, pricing, policies."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from core import db, now_utc, now_iso, get_settings_doc
from policies import POLICIES

router = APIRouter(tags=["catalog"])


@router.get("/covers")
async def list_covers(admin: bool = False):
    q = {} if admin else {"active": True}
    covers = await db.covers.find(q, {"_id": 0}).sort("display_order", 1).to_list(50)
    return {"covers": covers}


@router.get("/layouts")
async def list_layouts():
    layouts = await db.layouts.find({"active": True}, {"_id": 0}).sort("photo_count", 1).to_list(50)
    return {"layouts": layouts}


@router.get("/backgrounds")
async def list_backgrounds():
    bgs = await db.backgrounds.find({"active": True}, {"_id": 0}).to_list(100)
    return {"backgrounds": bgs}


@router.get("/settings")
async def get_settings():
    return {"settings": await get_settings_doc()}


# ---------------- Pricing ----------------

class PriceRequest(BaseModel):
    sheets: int
    coupon_code: Optional[str] = None
    gift_wrap: bool = False


async def compute_price(sheets: int, coupon_code: Optional[str], gift_wrap: bool = False) -> dict:
    settings = await get_settings_doc()
    price_per_sheet = settings["price_per_sheet"]
    gst_percent = settings["gst_percent"]
    gift_wrap_fee = float(settings.get("gift_wrap_fee", 0) or 0)
    subtotal = round(sheets * price_per_sheet, 2)
    discount = 0.0
    coupon_applied: Optional[dict] = None
    error: Optional[str] = None
    if coupon_code:
        code = coupon_code.strip().upper()
        offer = await db.offers.find_one({"code": code, "active": True}, {"_id": 0})
        if not offer:
            error = "Invalid coupon code"
        else:
            now = now_utc()
            if offer.get("start_at") and datetime.fromisoformat(offer["start_at"]) > now:
                error = "Coupon not started yet"
            elif offer.get("end_at") and datetime.fromisoformat(offer["end_at"]) < now:
                error = "Coupon expired"
            elif subtotal < offer.get("min_order", 0):
                error = f"Min order ₹{offer['min_order']} required"
            else:
                if offer["discount_type"] == "percentage":
                    discount = round(subtotal * offer["value"] / 100, 2)
                else:
                    discount = float(offer["value"])
                if offer.get("max_discount"):
                    discount = min(discount, float(offer["max_discount"]))
                discount = min(discount, subtotal)
                coupon_applied = offer
    applied_gift_fee = gift_wrap_fee if gift_wrap else 0.0
    taxable = max(0, subtotal - discount) + applied_gift_fee
    gst = round(taxable * gst_percent / 100, 2)
    total = round(taxable + gst, 2)
    return {
        "sheets": sheets,
        "price_per_sheet": price_per_sheet,
        "gst_percent": gst_percent,
        "subtotal": subtotal,
        "discount": discount,
        "coupon": coupon_applied,
        "coupon_error": error,
        "gift_wrap": gift_wrap,
        "gift_wrap_fee": applied_gift_fee,
        "taxable": taxable,
        "gst": gst,
        "total": total,
    }


@router.post("/pricing/calculate")
async def calculate_price(payload: PriceRequest):
    return await compute_price(payload.sheets, payload.coupon_code, payload.gift_wrap)


@router.get("/offers")
async def list_offers():
    now_s = now_iso()
    offers = await db.offers.find({"active": True, "public": True}, {"_id": 0}).to_list(50)
    return {"offers": [o for o in offers if not (o.get("end_at") and o["end_at"] < now_s)]}


# ---------------- Policies ----------------

@router.get("/policies")
async def list_policies():
    return {"policies": [{"key": k, "title": v["title"], "updated": v["updated"]} for k, v in POLICIES.items()]}


@router.get("/policies/{key}")
async def get_policy(key: str):
    if key not in POLICIES:
        raise HTTPException(404, "Policy not found")
    return {"policy": {"key": key, **POLICIES[key]}}
