from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Any, Dict
import secrets

from core import db, now_utc, now_iso, new_id, get_current_customer
from routers.catalog import compute_price

router = APIRouter(tags=["orders"])


class OrderCreate(BaseModel):
    album_id: str
    coupon_code: Optional[str] = None
    gift_wrap: bool = False
    gift_note: Optional[str] = None
    address: Dict[str, Any]


class PaymentConfirm(BaseModel):
    order_id: str
    payment_method: str = "mock"


async def mark_order_paid(order: dict, payment_id: str, method: str, extra: Optional[dict] = None) -> None:
    """Idempotent: only flips pending/failed orders to paid, then locks the album."""
    await db.orders.update_one(
        {"id": order["id"], "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "payment_id": payment_id, "payment_method": method,
                  "paid_at": now_iso(), "updated_at": now_iso(), **(extra or {})}},
    )
    await db.albums.update_one({"id": order["album_id"]}, {"$set": {"status": "ordered", "locked": True, "locked_at": now_iso()}})


@router.post("/orders")
async def create_order(payload: OrderCreate, customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": payload.album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    if not album.get("pages"):
        raise HTTPException(400, "Album not designed yet")
    sheets = album.get("sheets") or ((len(album["pages"]) + 1) // 2)
    price = await compute_price(sheets, payload.coupon_code, payload.gift_wrap)
    if price.get("coupon_error"):
        raise HTTPException(400, price["coupon_error"])

    order = {
        "id": new_id(),
        "order_no": f"CB{now_utc().strftime('%y%m%d')}{secrets.randbelow(9000) + 1000}",
        "customer_id": customer["id"],
        "customer_snapshot": {"name": customer.get("name"), "mobile": customer.get("mobile"), "email": customer.get("email")},
        "album_id": album["id"],
        "album_snapshot": album,  # design version freeze
        "sheets": sheets,
        "cover_snapshot": album.get("cover_snapshot"),
        "gift_wrap": payload.gift_wrap,
        "gift_note": (payload.gift_note or "").strip()[:200] if payload.gift_wrap else "",
        "price": price,
        "address": payload.address,
        "payment_status": "pending",
        "production_status": "processing",
        "status_history": [{"status": "processing", "at": now_iso(), "note": "Order received"}],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(dict(order))
    order.pop("_id", None)
    # Final Approved Version: the design the customer approved for this order (frozen in album_snapshot).
    await db.design_versions.insert_one({
        "id": new_id(), "album_id": album["id"], "version": album.get("version", 1), "kind": "approved",
        "order_id": order["id"], "snapshot": {"pages": album.get("pages"), "sheets": sheets,
                                               "cover_design": album.get("cover_design"),
                                               "design_style": album.get("design_style")},
        "created_at": now_iso(),
    })
    return {"order": order, "amount": price["total"]}


@router.post("/orders/pay")
async def pay_order(payload: PaymentConfirm, customer: dict = Depends(get_current_customer)):
    """Mock instant-pay fallback used when Razorpay isn't configured."""
    order = await db.orders.find_one({"id": payload.order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    payment_id = f"MOCK_{secrets.token_hex(6).upper()}"
    await mark_order_paid(order, payment_id, payload.payment_method)
    return {"success": True, "payment_id": payment_id, "message": "Payment successful (mock)"}


@router.get("/orders")
async def list_my_orders(customer: dict = Depends(get_current_customer)):
    orders = await db.orders.find({"customer_id": customer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"orders": orders}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    bots = await db.process_bots.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(20)
    return {"order": order, "process_bots": bots}
