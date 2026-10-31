from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Any, Dict
import secrets

from core import db, now_utc, now_iso, new_id, get_current_customer
from routers.catalog import compute_price
from routers.notifications import notify
from production import schedule_production_package
from otp_provider import send_payment_confirmation
import razorpay_provider as rzp

router = APIRouter(tags=["orders"])


INDIA_STATES_AND_UTS = {
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
}

_BAD_GIFT_TERMS = (
 "fuck","fucking","motherfucker","shit","bullshit","bitch","bastard","asshole","arsehole","dickhead","cunt",
 "chutiya","chutiye","chutia","bhenchod","behenchod","madarchod","madharchod","gaand","gand","bhosdi","bhosdike","bhosad","lund","lauda","lawda","randi","harami","kamina","kamine","kutti","kutte",
 "चूतिया","चूतिये","भेनचोद","बहनचोद","मादरचोद","मदरचोद","भोसड़ी","भोसड़ीके","गांड","लंड","रंडी","हरामी","कमीना","कुत्ता",
)
def _compact_text(value: str) -> str:
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFKC", value or "").casefold() if ch.isalnum())

def _contains_abusive_gift_note(value: str) -> bool:
    compact = _compact_text(value)
    return any(_compact_text(term) in compact for term in _BAD_GIFT_TERMS)

def _validate_checkout_address(address: dict) -> None:
    import re
    name = str(address.get("name") or "").strip()
    line1 = str(address.get("line1") or "").strip()
    city = str(address.get("city") or "").strip()
    state = str(address.get("state") or "").strip()
    pin = str(address.get("pincode") or address.get("pin") or "").strip()
    words = re.findall(r"[A-Za-z\u0900-\u097F]+", line1)
    if len(name) < 2 or not any(ch.isalpha() for ch in name):
        raise HTTPException(400, "Please enter a valid recipient name.")
    if len(line1) < 15 or len(words) < 2 or (len(words) < 3 and not any(ch.isdigit() for ch in line1)):
        raise HTTPException(400, "Please enter a complete delivery address with house/building details and a street or locality.")
    if len(city) < 2 or not any(ch.isalpha() for ch in city):
        raise HTTPException(400, "Please enter a valid city.")
    if state not in INDIA_STATES_AND_UTS:
        raise HTTPException(400, "Please select a valid Indian state or union territory from the list.")
    if not re.fullmatch(r"\d{6}", pin):
        raise HTTPException(400, "Please enter a valid 6-digit Indian PIN code.")




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
        # WhatsApp is best-effort: provider failure must not affect the verified payment.
        await send_payment_confirmation(order)
        schedule_production_package(order["id"])


@router.post("/orders")
async def create_order(payload: OrderCreate, customer: dict = Depends(get_current_customer)):
    _validate_checkout_address(payload.address or {})
    if payload.gift_wrap and payload.gift_note and _contains_abusive_gift_note(payload.gift_note):
        raise HTTPException(400, "Please remove abusive or inappropriate language from the gift message.")
    if payload.gift_wrap and len(payload.gift_note or "") > 160:
        raise HTTPException(400, "Gift message must be 160 characters or fewer.")

    album = await db.albums.find_one({"id": payload.album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    if not album.get("pages"):
        raise HTTPException(400, "Album not designed yet")
    sheets = album.get("sheets") or ((len(album["pages"]) + 1) // 2)
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
