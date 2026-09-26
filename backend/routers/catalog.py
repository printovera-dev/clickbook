"""Public catalog: covers, layouts, backgrounds, settings, offers, pricing, policies."""
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from core import db, now_utc, now_iso, get_settings_doc
from policies import POLICIES

router = APIRouter(tags=["catalog"])

MAX_PAGE = 100


def _small_variant(url: str, width: int = 400) -> str:
    """Best-effort small version of a remote catalog image (Unsplash-style w= param)."""
    if not url or "w=" not in url:
        return url
    return re.sub(r"([?&])w=\d+", rf"\g<1>w={width}", url)


async def with_thumbnails(items: list) -> list:
    """Adds thumbnail_url to catalog assets so grids never decode the full-size image.
    Admin-uploaded images resolve to their stored 400px derivative; remote URLs get a width hint."""
    urls = [i.get("image_url") for i in items if i.get("image_url") and not i.get("thumbnail_url")]
    lookup = {}
    if urls:
        async for img in db.admin_images.find({"url": {"$in": urls}}, {"_id": 0, "url": 1, "thumbnail_url": 1}):
            lookup[img["url"]] = img.get("thumbnail_url")
    for i in items:
        if i.get("image_url") and not i.get("thumbnail_url"):
            i["thumbnail_url"] = lookup.get(i["image_url"]) or _small_variant(i["image_url"])
    return items


def _page(items: list, total: int, offset: int, limit: int, key: str) -> dict:
    nxt = offset + len(items)
    return {key: items, "total": total, "offset": offset, "limit": limit, "next_offset": nxt if nxt < total else None}


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_PAGE))


@router.get("/covers")
async def list_covers(admin: bool = False, offset: int = 0, limit: int = 20):
    q = {} if admin else {"active": True}
    limit = _clamp(limit)
    total = await db.covers.count_documents(q)
    covers = await db.covers.find(q, {"_id": 0}).sort("display_order", 1).skip(max(0, offset)).limit(limit).to_list(limit)
    return _page(await with_thumbnails(covers), total, offset, limit, "covers")


@router.get("/layouts")
async def list_layouts(offset: int = 0, limit: int = 50):
    limit = _clamp(limit)
    total = await db.layouts.count_documents({"active": True})
    layouts = await db.layouts.find({"active": True}, {"_id": 0}).sort("photo_count", 1).skip(max(0, offset)).limit(limit).to_list(limit)
    return _page(await with_thumbnails(layouts), total, offset, limit, "layouts")


@router.get("/backgrounds")
async def list_backgrounds(offset: int = 0, limit: int = 50):
    limit = _clamp(limit)
    total = await db.backgrounds.count_documents({"active": True})
    bgs = await db.backgrounds.find({"active": True}, {"_id": 0}).skip(max(0, offset)).limit(limit).to_list(limit)
    return _page(await with_thumbnails(bgs), total, offset, limit, "backgrounds")


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
