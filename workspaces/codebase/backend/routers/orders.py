from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Any, Dict
import secrets

from core import db, now_utc, now_iso, new_id, get_current_customer
from routers.catalog import compute_price
from routers.notifications import notify
from production import schedule_production_package
import razorpay_provider as rzp

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
    """Idempotent: only flips pending/failed orders to paid, then locks the album, notifies the customer
    and kicks off the print-facility package (Downloads/<order>/) in the background."""
    r = await db.orders.update_one(
        {"id": order["id"], "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "payment_id": payment_id, "payment_method": method,
                  "paid_at": now_iso(), "updated_at": now_iso(), **(extra or {})}},
    )
    await db.albums.update_one({"id": order["album_id"]}, {"$set": {"status": "ordered", "locked": True, "locked_at": now_iso()}})
    if r.modified_count:
        await notify(order["customer_id"], f"Order {order['order_no']} confirmed",
                     f"Payment received. Your {order.get('sheets', '')}-sheet ClickBook is now in production.",
                     "order", order["id"])
        schedule_production_package(order["id"])


@router.post("/orders")
async def create_order(payload: OrderCreate, customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": payload.album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    if not album.get("pages"):
        raise HTTPException(400, "Album not designed yet")
    page_count = len(album["pages"])
    if album.get("album_config"):
        if not 30 <= page_count <= 50:
            raise HTTPException(
                422,
                detail={
                    "code": "wedding_page_count_out_of_range",
                    "message": "Wedding albums must contain 30–50 pages before ordering. Please return to the editor and adjust the page count.",
                    "pages": page_count,
                    "min_pages": 30,
                    "max_pages": 50,
                },
            )
        if not album.get("cover_design"):
            raise HTTPException(
                422,
                detail={
                    "code": "wedding_cover_missing",
                    "message": "Please finish designing the wedding album cover before ordering.",
                },
            )
        photo_ids = {photo.get("id") for photo in album.get("photos", [])}
        missing_photo_refs = sum(
            1 for page in album.get("pages", [])
            for photo_id in (page.get("photo_ids") or [])
            if photo_id not in photo_ids
        )
        if missing_photo_refs:
            raise HTTPException(
                422,
                detail={
                    "code": "wedding_missing_photos",
                    "message": "Some album pages refer to photos that are no longer available. Please correct those pages before ordering.",
                    "missing_photo_references": missing_photo_refs,
                },
            )
    sheets = album.get("sheets") or ((page_count + 1) // 2)
    album_config = album.get("album_config") or {}
    if album_config:
        price = await compute_price(
            sheets, payload.coupon_code, payload.gift_wrap,
            album_config.get("paper_finish") or album.get("paper_finish") or "gloss",
            album_config.get("cover_material") or album.get("cover_material") or "digital",
        )
    else:
        # Preserve legacy ClickBook pricing for non-wedding albums.
        price = await compute_price(sheets, payload.coupon_code, payload.gift_wrap)
    if price.get("coupon_error"):
        raise HTTPException(400, price["coupon_error"])

    # Album/production name: "Cover Title / dd-mm-yyyy", else "Client Name / dd-mm-yyyy"
    cover_texts = ((album.get("cover_design") or {}).get("texts") or [])
    cover_title = next((t.get("text", "").strip() for t in cover_texts if t.get("text", "").strip()), "")
    client_name = (customer.get("name") or "").strip() or customer.get("mobile", "Customer")
    created = now_utc()
    production_name = f"{cover_title or client_name} / {created.strftime('%d-%m-%Y')}"
    order = {
        "id": new_id(),
        "order_no": f"CB{now_utc().strftime('%y%m%d')}{secrets.randbelow(9000) + 1000}",
        "client_name": client_name,
        "cover_title": cover_title,
        "album_name": production_name,
        "customer_id": customer["id"],
        "customer_snapshot": {"name": customer.get("name"), "mobile": customer.get("mobile"), "email": customer.get("email")},
        "album_id": album["id"],
        "album_snapshot": album,  # design version freeze
        "sheets": sheets,
        "cover_snapshot": album.get("cover_snapshot"),
        "cover_thumbnail_url": next((p.get("thumbnail_url") for p in album.get("photos", []) if p.get("id") == (album.get("cover_design") or {}).get("photo_id")), None),
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
    # Remember the delivery address on the customer so it pre-fills Profile and future checkouts.
    await db.customers.update_one({"id": customer["id"]}, {"$set": {"address": payload.address}})
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
    """Mock instant-pay fallback is available only outside production."""
    if rzp.is_production():
        raise HTTPException(503, "Mock payments are disabled in production. Configure live Razorpay credentials.")
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
