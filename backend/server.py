"""ClickBook backend - FastAPI. All routes are /api/*."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Request
from fastapi.responses import FileResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import logging
import uuid
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

from storage_manager import save_original, resolve_path, public_url, save_pdf, get_file_bytes, STORAGE_BASE

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="ClickBook API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


# ---------------- Auth (Mock OTP + simple token) ----------------

class OTPRequest(BaseModel):
    mobile: str
    channel: str = "whatsapp"  # whatsapp | sms


class OTPVerify(BaseModel):
    mobile: str
    otp: str


async def get_current_customer(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.replace("Bearer ", "").strip()
    session = await db.sessions.find_one({"token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid token")
    customer = await db.customers.find_one({"id": session["customer_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(401, "Customer not found")
    return customer


async def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing admin token")
    token = authorization.replace("Bearer ", "").strip()
    admin = await db.admins.find_one({"token": token}, {"_id": 0})
    if not admin:
        raise HTTPException(401, "Invalid admin token")
    return admin


@api.post("/auth/otp/send")
async def send_otp(payload: OTPRequest):
    if not payload.mobile or len(payload.mobile) < 8:
        raise HTTPException(400, "Invalid mobile")
    # Mock provider abstraction - always uses fixed OTP 123456
    await db.otps.update_one(
        {"mobile": payload.mobile},
        {"$set": {"mobile": payload.mobile, "otp": "123456", "channel": payload.channel,
                  "created_at": now_utc().isoformat(), "expires_at": (now_utc() + timedelta(minutes=10)).isoformat()}},
        upsert=True,
    )
    logger.info(f"[MOCK OTP] {payload.channel} to {payload.mobile}: 123456")
    return {"success": True, "message": f"OTP sent via {payload.channel}", "dev_hint": "123456"}


@api.post("/auth/otp/verify")
async def verify_otp(payload: OTPVerify):
    record = await db.otps.find_one({"mobile": payload.mobile}, {"_id": 0})
    if not record:
        raise HTTPException(400, "OTP not found")
    if record["otp"] != payload.otp:
        raise HTTPException(400, "Invalid OTP")
    if datetime.fromisoformat(record["expires_at"]) < now_utc():
        raise HTTPException(400, "OTP expired")
    # find or create customer
    customer = await db.customers.find_one({"mobile": payload.mobile}, {"_id": 0})
    if not customer:
        customer = {
            "id": new_id(),
            "mobile": payload.mobile,
            "name": "",
            "email": "",
            "created_at": now_utc().isoformat(),
        }
        await db.customers.insert_one(dict(customer))
        customer.pop("_id", None)
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({"token": token, "customer_id": customer["id"], "created_at": now_utc().isoformat()})
    await db.otps.delete_one({"mobile": payload.mobile})
    return {"token": token, "customer": {k: v for k, v in customer.items() if k != "_id"}}


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


@api.get("/me")
async def get_me(customer: dict = Depends(get_current_customer)):
    return {"customer": customer}


@api.put("/me")
async def update_me(payload: ProfileUpdate, customer: dict = Depends(get_current_customer)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.customers.update_one({"id": customer["id"]}, {"$set": update})
    updated = await db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    return {"customer": updated}


# ---------------- Catalog: Covers / Layouts / Backgrounds ----------------

@api.get("/covers")
async def list_covers(admin: bool = False):
    q = {} if admin else {"active": True}
    covers = await db.covers.find(q, {"_id": 0}).sort("display_order", 1).to_list(50)
    return {"covers": covers}


class CoverIn(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: str
    active: bool = True
    display_order: int = 0


@api.post("/admin/covers")
async def create_cover(payload: CoverIn, admin: dict = Depends(get_current_admin)):
    doc = {"id": new_id(), **payload.dict(), "created_at": now_utc().isoformat()}
    await db.covers.insert_one(dict(doc))
    return {"cover": {k: v for k, v in doc.items() if k != "_id"}}


@api.put("/admin/covers/{cover_id}")
async def update_cover(cover_id: str, payload: CoverIn, admin: dict = Depends(get_current_admin)):
    await db.covers.update_one({"id": cover_id}, {"$set": payload.dict()})
    return {"success": True}


@api.delete("/admin/covers/{cover_id}")
async def delete_cover(cover_id: str, admin: dict = Depends(get_current_admin)):
    await db.covers.delete_one({"id": cover_id})
    return {"success": True}


@api.get("/layouts")
async def list_layouts():
    layouts = await db.layouts.find({"active": True}, {"_id": 0}).sort("photo_count", 1).to_list(50)
    return {"layouts": layouts}


@api.get("/backgrounds")
async def list_backgrounds():
    bgs = await db.backgrounds.find({"active": True}, {"_id": 0}).to_list(100)
    return {"backgrounds": bgs}


# ---------------- Albums ----------------

class AlbumCreate(BaseModel):
    cover_id: str
    name: Optional[str] = None


@api.post("/albums")
async def create_album(payload: AlbumCreate, customer: dict = Depends(get_current_customer)):
    cover = await db.covers.find_one({"id": payload.cover_id, "active": True}, {"_id": 0})
    if not cover:
        raise HTTPException(400, "Invalid cover")
    album = {
        "id": new_id(),
        "customer_id": customer["id"],
        "cover_id": payload.cover_id,
        "cover_snapshot": cover,
        "name": payload.name or f"My ClickBook {now_utc().strftime('%b %d')}",
        "status": "draft",  # draft | ordered | delivered
        "photos": [],
        "pages": [],
        "size": "8x8",
        "version": 1,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.albums.insert_one(dict(album))
    return {"album": {k: v for k, v in album.items() if k != "_id"}}


@api.get("/albums")
async def list_my_albums(customer: dict = Depends(get_current_customer)):
    albums = await db.albums.find({"customer_id": customer["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {"albums": albums}


@api.get("/albums/{album_id}")
async def get_album(album_id: str, customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    return {"album": album}


@api.post("/albums/{album_id}/photos")
async def upload_photo(album_id: str, file: UploadFile = File(...), customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20MB)")
    if not (file.filename or "").lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".heic")):
        raise HTTPException(400, "Unsupported file type")
    meta = save_original(customer["id"], album_id, file.filename or "photo.jpg", data)
    photo = {
        "id": new_id(),
        "filename": file.filename,
        "uploaded_at": now_utc().isoformat(),
        **meta,
        "thumbnail_url": public_url(meta["thumbnail_path"]),
        "preview_url": public_url(meta["preview_path"]),
        "original_url": public_url(meta["original_path"]),
    }
    await db.albums.update_one(
        {"id": album_id},
        {"$push": {"photos": photo}, "$set": {"updated_at": now_utc().isoformat()}},
    )
    return {"photo": photo}


@api.delete("/albums/{album_id}/photos/{photo_id}")
async def delete_photo(album_id: str, photo_id: str, customer: dict = Depends(get_current_customer)):
    await db.albums.update_one(
        {"id": album_id, "customer_id": customer["id"]},
        {"$pull": {"photos": {"id": photo_id}}, "$set": {"updated_at": now_utc().isoformat()}},
    )
    return {"success": True}


class GenerateRequest(BaseModel):
    pass


@api.post("/albums/{album_id}/generate")
async def auto_generate(album_id: str, customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    photos = album.get("photos", [])
    if not photos:
        raise HTTPException(400, "No photos uploaded")
    layouts = await db.layouts.find({"active": True}, {"_id": 0}).to_list(50)
    layouts_by_count = {l["photo_count"]: l for l in layouts}
    one = layouts_by_count.get(1)
    two = layouts_by_count.get(2)
    bgs = await db.backgrounds.find({"active": True}, {"_id": 0}).to_list(100)
    default_bg = bgs[0]["color"] if bgs else "#FFFFFF"

    # Simple algorithm: pair up when possible with a rhythm - alternate 2-photo then 1-photo
    pages = []
    i = 0
    idx = 0
    while i < len(photos):
        use_two = two and (idx % 3 != 0) and (i + 1 < len(photos))
        if use_two:
            pages.append({
                "id": new_id(),
                "layout_id": two["id"],
                "layout_photo_count": 2,
                "photo_ids": [photos[i]["id"], photos[i + 1]["id"]],
                "background": default_bg,
                "text": "",
                "order": idx,
            })
            i += 2
        else:
            pages.append({
                "id": new_id(),
                "layout_id": one["id"] if one else "",
                "layout_photo_count": 1,
                "photo_ids": [photos[i]["id"]],
                "background": default_bg,
                "text": "",
                "order": idx,
            })
            i += 1
        idx += 1

    # sheet count: 2 pages per sheet (double sided), minimum from settings
    settings = await get_settings_doc()
    min_sheets = settings.get("min_sheets", 10)
    sheets = max(min_sheets, (len(pages) + 1) // 2)

    await db.albums.update_one(
        {"id": album_id},
        {"$set": {"pages": pages, "sheets": sheets, "updated_at": now_utc().isoformat(),
                  "version": album.get("version", 1) + 1}},
    )
    # store design version
    await db.design_versions.insert_one({
        "id": new_id(),
        "album_id": album_id,
        "version": album.get("version", 1) + 1,
        "kind": "auto",
        "snapshot": {"pages": pages, "sheets": sheets},
        "created_at": now_utc().isoformat(),
    })
    updated = await db.albums.find_one({"id": album_id}, {"_id": 0})
    return {"album": updated}


class PagesUpdate(BaseModel):
    pages: List[Dict[str, Any]]


@api.put("/albums/{album_id}/pages")
async def update_pages(album_id: str, payload: PagesUpdate, customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    for i, p in enumerate(payload.pages):
        p["order"] = i
    settings = await get_settings_doc()
    min_sheets = settings.get("min_sheets", 10)
    sheets = max(min_sheets, (len(payload.pages) + 1) // 2)
    await db.albums.update_one(
        {"id": album_id},
        {"$set": {"pages": payload.pages, "sheets": sheets, "updated_at": now_utc().isoformat(),
                  "version": album.get("version", 1) + 1}},
    )
    await db.design_versions.insert_one({
        "id": new_id(),
        "album_id": album_id,
        "version": album.get("version", 1) + 1,
        "kind": "edit",
        "snapshot": {"pages": payload.pages, "sheets": sheets},
        "created_at": now_utc().isoformat(),
    })
    updated = await db.albums.find_one({"id": album_id}, {"_id": 0})
    return {"album": updated}


# ---------------- Pricing & Coupons ----------------

async def get_settings_doc() -> dict:
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        s = {"id": "default", "price_per_sheet": 90, "gst_percent": 18,
             "min_sheets": 10, "max_sheets": 75, "size": "8x8",
             "gift_wrap_fee": 150}
        await db.settings.insert_one(dict(s))
    if "gift_wrap_fee" not in s:
        s["gift_wrap_fee"] = 150
        await db.settings.update_one({"id": "default"}, {"$set": {"gift_wrap_fee": 150}})
    return s


@api.get("/settings")
async def get_settings():
    return {"settings": await get_settings_doc()}


class SettingsUpdate(BaseModel):
    price_per_sheet: Optional[float] = None
    gst_percent: Optional[float] = None
    min_sheets: Optional[int] = None
    max_sheets: Optional[int] = None
    gift_wrap_fee: Optional[float] = None


@api.put("/admin/settings")
async def update_settings(payload: SettingsUpdate, admin: dict = Depends(get_current_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.settings.update_one({"id": "default"}, {"$set": update}, upsert=True)
    return {"settings": await get_settings_doc()}


class PriceRequest(BaseModel):
    sheets: int
    coupon_code: Optional[str] = None
    gift_wrap: bool = False


async def _compute_price(sheets: int, coupon_code: Optional[str], gift_wrap: bool = False) -> dict:
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


@api.post("/pricing/calculate")
async def calculate_price(payload: PriceRequest):
    return await _compute_price(payload.sheets, payload.coupon_code, payload.gift_wrap)


@api.get("/offers")
async def list_offers():
    now_iso = now_utc().isoformat()
    offers = await db.offers.find(
        {"active": True, "public": True},
        {"_id": 0},
    ).to_list(50)
    active = []
    for o in offers:
        if o.get("end_at") and o["end_at"] < now_iso:
            continue
        active.append(o)
    return {"offers": active}


class OfferIn(BaseModel):
    name: str
    code: str
    discount_type: str  # percentage | fixed
    value: float
    min_order: float = 0
    max_discount: Optional[float] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    active: bool = True
    public: bool = True
    usage_limit: Optional[int] = None


@api.get("/admin/offers")
async def admin_offers(admin: dict = Depends(get_current_admin)):
    offers = await db.offers.find({}, {"_id": 0}).to_list(200)
    return {"offers": offers}


@api.post("/admin/offers")
async def create_offer(payload: OfferIn, admin: dict = Depends(get_current_admin)):
    doc = {"id": new_id(), **payload.dict(), "code": payload.code.upper(), "usage_count": 0,
           "created_at": now_utc().isoformat()}
    await db.offers.insert_one(dict(doc))
    return {"offer": {k: v for k, v in doc.items() if k != "_id"}}


@api.put("/admin/offers/{offer_id}")
async def update_offer(offer_id: str, payload: OfferIn, admin: dict = Depends(get_current_admin)):
    update = payload.dict()
    update["code"] = update["code"].upper()
    await db.offers.update_one({"id": offer_id}, {"$set": update})
    return {"success": True}


# ---------------- Orders / Payment (mock) ----------------

class OrderCreate(BaseModel):
    album_id: str
    coupon_code: Optional[str] = None
    gift_wrap: bool = False
    address: Dict[str, Any]


@api.post("/orders")
async def create_order(payload: OrderCreate, customer: dict = Depends(get_current_customer)):
    album = await db.albums.find_one({"id": payload.album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    if not album.get("pages"):
        raise HTTPException(400, "Album not designed yet")
    sheets = album.get("sheets") or ((len(album["pages"]) + 1) // 2)
    price = await _compute_price(sheets, payload.coupon_code, payload.gift_wrap)
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
        "price": price,
        "address": payload.address,
        "payment_status": "pending",
        "production_status": "processing",
        "status_history": [{"status": "processing", "at": now_utc().isoformat(), "note": "Order received"}],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.orders.insert_one(dict(order))
    return {"order": {k: v for k, v in order.items() if k != "_id"}, "amount": price["total"]}


class PaymentConfirm(BaseModel):
    order_id: str
    payment_method: str = "mock"


@api.post("/orders/pay")
async def pay_order(payload: PaymentConfirm, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": payload.order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    payment_id = f"MOCK_{secrets.token_hex(6).upper()}"
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"payment_status": "paid", "payment_id": payment_id, "payment_method": payload.payment_method,
                  "paid_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()}},
    )
    await db.albums.update_one({"id": order["album_id"]}, {"$set": {"status": "ordered"}})
    return {"success": True, "payment_id": payment_id, "message": "Payment successful (mock)"}


@api.get("/orders")
async def list_my_orders(customer: dict = Depends(get_current_customer)):
    orders = await db.orders.find({"customer_id": customer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"orders": orders}


@api.get("/orders/{order_id}")
async def get_order(order_id: str, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    bots = await db.process_bots.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(20)
    return {"order": order, "process_bots": bots}


# ---------------- Files (VPS storage serve) ----------------

@api.get("/files/{full_path:path}")
async def serve_file(full_path: str):
    # local driver: serve from disk; s3 driver: stream bytes
    p = resolve_path(full_path)
    if p:
        return FileResponse(str(p))
    data = get_file_bytes(full_path)
    if data is None:
        raise HTTPException(404, "File not found")
    ct = "application/pdf" if full_path.endswith(".pdf") else "image/jpeg"
    return Response(content=data, media_type=ct)


# ---------------- Admin ----------------

class AdminLogin(BaseModel):
    username: str
    password: str


@api.post("/admin/login")
async def admin_login(payload: AdminLogin):
    admin = await db.admins.find_one({"username": payload.username}, {"_id": 0})
    if not admin or admin.get("password") != payload.password:
        raise HTTPException(401, "Invalid admin credentials")
    token = secrets.token_urlsafe(32)
    await db.admins.update_one({"username": payload.username}, {"$set": {"token": token}})
    admin["token"] = token
    return {"token": token, "admin": {"username": admin["username"], "role": admin.get("role", "super")}}


@api.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(get_current_admin)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    total_orders = len(orders)
    revenue = sum(o["price"]["total"] for o in orders if o.get("payment_status") == "paid")
    by_status = {}
    for o in orders:
        by_status[o.get("production_status", "processing")] = by_status.get(o.get("production_status", "processing"), 0) + 1
    customers = await db.customers.count_documents({})
    drafts = await db.albums.count_documents({"status": "draft"})
    return {
        "total_orders": total_orders,
        "revenue": round(revenue, 2),
        "by_status": by_status,
        "customers": customers,
        "drafts": drafts,
        "recent_orders": orders[-5:][::-1],
    }


@api.get("/admin/orders")
async def admin_orders(admin: dict = Depends(get_current_admin), status: Optional[str] = None):
    q = {}
    if status:
        q["production_status"] = status
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"orders": orders}


class StatusUpdate(BaseModel):
    production_status: str
    note: Optional[str] = ""
    tracking_number: Optional[str] = None


@api.put("/admin/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: StatusUpdate, admin: dict = Depends(get_current_admin)):
    valid = {"processing", "printing", "packaging", "out_for_delivery", "delivered", "cancelled", "refunded"}
    if payload.production_status not in valid:
        raise HTTPException(400, "Invalid status")
    update = {"production_status": payload.production_status, "updated_at": now_utc().isoformat()}
    if payload.tracking_number:
        update["tracking_number"] = payload.tracking_number
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update,
         "$push": {"status_history": {"status": payload.production_status, "at": now_utc().isoformat(),
                                       "note": payload.note or ""}}},
    )
    if payload.production_status == "delivered":
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            await db.albums.update_one({"id": order["album_id"]}, {"$set": {"status": "delivered"}})
    return {"success": True}


@api.get("/admin/process-bots")
async def list_process_bots(admin: dict = Depends(get_current_admin)):
    bots = await db.process_bots.find({}, {"_id": 0}).sort("order", 1).to_list(20)
    return {"process_bots": bots}


class BotUpdate(BaseModel):
    label: Optional[str] = None
    message: Optional[str] = None
    icon: Optional[str] = None
    active: Optional[bool] = None


@api.put("/admin/process-bots/{bot_id}")
async def update_bot(bot_id: str, payload: BotUpdate, admin: dict = Depends(get_current_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.process_bots.update_one({"id": bot_id}, {"$set": update})
    return {"success": True}


@api.get("/admin/customers")
async def admin_customers(admin: dict = Depends(get_current_admin)):
    customers = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"customers": customers}


# PDF generation (basic - real print-ready would use hi-res assets)
@api.post("/admin/orders/{order_id}/pdf")
async def generate_pdf(order_id: str, admin: dict = Depends(get_current_admin)):
    from reportlab.lib.pagesizes import inch
    from reportlab.pdfgen import canvas
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    buf = io.BytesIO()
    page_size = (8 * inch, 8 * inch)
    c = canvas.Canvas(buf, pagesize=page_size)
    album = order.get("album_snapshot", {})
    photos_by_id = {p["id"]: p for p in album.get("photos", [])}
    # Cover
    c.setFillColorRGB(0.77, 0.42, 0.28)
    c.rect(0, 0, 8 * inch, 8 * inch, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 32)
    c.drawCentredString(4 * inch, 4 * inch, "ClickBook")
    c.setFont("Helvetica", 14)
    c.drawCentredString(4 * inch, 3.5 * inch, album.get("name", "My Album"))
    c.showPage()
    # Pages
    for page in album.get("pages", []):
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, 8 * inch, 8 * inch, fill=1)
        photo_ids = page.get("photo_ids", [])
        n = len(photo_ids)
        for i, pid in enumerate(photo_ids):
            photo = photos_by_id.get(pid)
            if not photo:
                continue
            img_bytes = get_file_bytes(photo.get("print_path", ""))
            if not img_bytes:
                continue
            try:
                from reportlab.lib.utils import ImageReader
                img = ImageReader(io.BytesIO(img_bytes))
                if n == 1:
                    c.drawImage(img, 0.5 * inch, 0.5 * inch, 7 * inch, 7 * inch, preserveAspectRatio=True, anchor="c")
                elif n == 2:
                    x = 0.5 * inch
                    y = 0.5 * inch + (3.5 * inch * i)
                    c.drawImage(img, x, y, 7 * inch, 3.2 * inch, preserveAspectRatio=True, anchor="c")
            except Exception as e:
                logger.warning(f"pdf draw err: {e}")
        c.showPage()
    c.save()
    pdf_bytes = buf.getvalue()
    meta = save_pdf(order["customer_id"], order["album_id"], pdf_bytes)
    await db.orders.update_one({"id": order_id}, {"$set": {"pdf_path": meta["pdf_path"], "pdf_url": public_url(meta["pdf_path"])}})
    return {"pdf_url": public_url(meta["pdf_path"]), "size_bytes": meta["size_bytes"]}


# ---------------- Seed data ----------------

async def seed():
    # Settings
    if not await db.settings.find_one({"id": "default"}):
        await db.settings.insert_one({
            "id": "default", "price_per_sheet": 90, "gst_percent": 18,
            "min_sheets": 10, "max_sheets": 75, "size": "8x8",
        })
    # Covers
    if await db.covers.count_documents({}) == 0:
        covers = [
            {"id": new_id(), "name": "Linen Ivory", "description": "Textured linen finish in warm ivory",
             "image_url": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&auto=format&fit=crop",
             "active": True, "display_order": 1, "created_at": now_utc().isoformat()},
            {"id": new_id(), "name": "Classic Hardcover", "description": "Premium hardcover with matte lamination",
             "image_url": "https://images.unsplash.com/photo-1519791883288-dc8bd696e667?w=800&auto=format&fit=crop",
             "active": True, "display_order": 2, "created_at": now_utc().isoformat()},
            {"id": new_id(), "name": "Photo Cover", "description": "Full-bleed photo cover printed edge to edge",
             "image_url": "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop",
             "active": True, "display_order": 3, "created_at": now_utc().isoformat()},
        ]
        await db.covers.insert_many(covers)
    # Layouts
    if await db.layouts.count_documents({}) == 0:
        await db.layouts.insert_many([
            {"id": new_id(), "name": "One Photo", "photo_count": 1, "active": True,
             "positions": [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.9}]},
            {"id": new_id(), "name": "Two Photos", "photo_count": 2, "active": True,
             "positions": [
                 {"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.44},
                 {"x": 0.05, "y": 0.51, "w": 0.9, "h": 0.44},
             ]},
        ])
    # Backgrounds
    if await db.backgrounds.count_documents({}) == 0:
        await db.backgrounds.insert_many([
            {"id": new_id(), "name": "Ivory", "color": "#FAFAF8", "active": True},
            {"id": new_id(), "name": "Cream", "color": "#F0EFEA", "active": True},
            {"id": new_id(), "name": "Blush", "color": "#F2D8CE", "active": True},
            {"id": new_id(), "name": "Charcoal", "color": "#1C1917", "active": True},
            {"id": new_id(), "name": "Sage", "color": "#D6DBC2", "active": True},
            {"id": new_id(), "name": "Terracotta", "color": "#C56A47", "active": True},
        ])
    # Offers
    if await db.offers.count_documents({}) == 0:
        await db.offers.insert_many([
            {"id": new_id(), "name": "Welcome 2026", "code": "WELCOME2026", "discount_type": "percentage",
             "value": 10, "min_order": 0, "max_discount": 500, "active": True, "public": True,
             "usage_count": 0, "created_at": now_utc().isoformat(),
             "start_at": None, "end_at": "2026-12-30T23:59:59+00:00"},
            {"id": new_id(), "name": "Couple Special", "code": "COUPLE20", "discount_type": "percentage",
             "value": 20, "min_order": 1000, "max_discount": 800, "active": True, "public": True,
             "usage_count": 0, "created_at": now_utc().isoformat(),
             "start_at": None, "end_at": None},
            {"id": new_id(), "name": "Flat ₹200 Off", "code": "FLAT200", "discount_type": "fixed",
             "value": 200, "min_order": 1500, "active": True, "public": True,
             "usage_count": 0, "created_at": now_utc().isoformat()},
        ])
    # Process bots
    if await db.process_bots.count_documents({}) == 0:
        await db.process_bots.insert_many([
            {"id": new_id(), "stage": "processing", "label": "Processing", "icon": "check-circle",
             "message": "We're preparing your ClickBook.", "active": True, "order": 1},
            {"id": new_id(), "stage": "printing", "label": "Printing", "icon": "printer",
             "message": "Your memories are being printed.", "active": True, "order": 2},
            {"id": new_id(), "stage": "packaging", "label": "Packaging", "icon": "package",
             "message": "Your ClickBook is being carefully packed.", "active": True, "order": 3},
            {"id": new_id(), "stage": "out_for_delivery", "label": "Out for Delivery", "icon": "truck",
             "message": "Your ClickBook is on its way!", "active": True, "order": 4},
            {"id": new_id(), "stage": "delivered", "label": "Delivered", "icon": "heart",
             "message": "Your memories have arrived.", "active": True, "order": 5},
        ])
    # Admin - upsert to keep credentials fixed
    await db.admins.update_one(
        {"username": "admin"},
        {"$setOnInsert": {"username": "admin", "password": "clickbook@2026", "role": "super",
                          "created_at": now_utc().isoformat()}},
        upsert=True,
    )


@app.on_event("startup")
async def on_startup():
    STORAGE_BASE.mkdir(parents=True, exist_ok=True)
    await seed()
    logger.info("ClickBook API ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/health")
async def health():
    return {"ok": True, "service": "clickbook", "time": now_utc().isoformat()}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
