"""Admin console: login, dashboard, orders, covers, offers, settings, process bots, customers, PDF."""
import io
import secrets
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from core import db, now_iso, new_id, get_current_admin, get_settings_doc, logger
from storage_manager import save_pdf, get_file_bytes, public_url

router = APIRouter(prefix="/admin", tags=["admin"])

PRODUCTION_STATUSES = {"processing", "printing", "packaging", "out_for_delivery", "delivered", "cancelled", "refunded"}


class AdminLogin(BaseModel):
    username: str
    password: str


class CoverIn(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: str
    active: bool = True
    display_order: int = 0


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


class SettingsUpdate(BaseModel):
    price_per_sheet: Optional[float] = None
    gst_percent: Optional[float] = None
    min_sheets: Optional[int] = None
    max_sheets: Optional[int] = None
    gift_wrap_fee: Optional[float] = None


class StatusUpdate(BaseModel):
    production_status: str
    note: Optional[str] = ""
    tracking_number: Optional[str] = None


class BotUpdate(BaseModel):
    label: Optional[str] = None
    message: Optional[str] = None
    icon: Optional[str] = None
    active: Optional[bool] = None


@router.post("/login")
async def admin_login(payload: AdminLogin):
    admin = await db.admins.find_one({"username": payload.username}, {"_id": 0})
    if not admin or admin.get("password") != payload.password:
        raise HTTPException(401, "Invalid admin credentials")
    token = secrets.token_urlsafe(32)
    await db.admins.update_one({"username": payload.username}, {"$set": {"token": token}})
    return {"token": token, "admin": {"username": admin["username"], "role": admin.get("role", "super")}}


@router.get("/dashboard")
async def admin_dashboard(admin: dict = Depends(get_current_admin)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    revenue = sum(o["price"]["total"] for o in orders if o.get("payment_status") == "paid")
    by_status: dict = {}
    for o in orders:
        st = o.get("production_status", "processing")
        by_status[st] = by_status.get(st, 0) + 1
    return {
        "total_orders": len(orders),
        "revenue": round(revenue, 2),
        "by_status": by_status,
        "customers": await db.customers.count_documents({}),
        "drafts": await db.albums.count_documents({"status": "draft"}),
        "recent_orders": orders[-5:][::-1],
    }


# ---- Orders ----

@router.get("/orders")
async def admin_orders(admin: dict = Depends(get_current_admin), status: Optional[str] = None):
    q = {"production_status": status} if status else {}
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"orders": orders}


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: StatusUpdate, admin: dict = Depends(get_current_admin)):
    if payload.production_status not in PRODUCTION_STATUSES:
        raise HTTPException(400, "Invalid status")
    update = {"production_status": payload.production_status, "updated_at": now_iso()}
    if payload.tracking_number:
        update["tracking_number"] = payload.tracking_number
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update,
         "$push": {"status_history": {"status": payload.production_status, "at": now_iso(), "note": payload.note or ""}}},
    )
    if payload.production_status == "delivered":
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            await db.albums.update_one({"id": order["album_id"]}, {"$set": {"status": "delivered"}})
    return {"success": True}


@router.post("/orders/{order_id}/pdf")
async def generate_pdf(order_id: str, admin: dict = Depends(get_current_admin)):
    from reportlab.lib.pagesizes import inch
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(8 * inch, 8 * inch))
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
    for page in album.get("pages", []):
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, 8 * inch, 8 * inch, fill=1)
        photo_ids = page.get("photo_ids", [])
        n = len(photo_ids)
        for i, pid in enumerate(photo_ids):
            photo = photos_by_id.get(pid)
            img_bytes = get_file_bytes(photo.get("print_path", "")) if photo else None
            if not img_bytes:
                continue
            try:
                img = ImageReader(io.BytesIO(img_bytes))
                if n == 1:
                    c.drawImage(img, 0.5 * inch, 0.5 * inch, 7 * inch, 7 * inch, preserveAspectRatio=True, anchor="c")
                elif n == 2:
                    c.drawImage(img, 0.5 * inch, 0.5 * inch + 3.5 * inch * i, 7 * inch, 3.2 * inch, preserveAspectRatio=True, anchor="c")
                elif n == 3:
                    if i == 0:
                        c.drawImage(img, 0.5 * inch, 3.6 * inch, 7 * inch, 3.9 * inch, preserveAspectRatio=True, anchor="c")
                    else:
                        c.drawImage(img, 0.5 * inch + (i - 1) * 3.6 * inch, 0.5 * inch, 3.4 * inch, 3.0 * inch, preserveAspectRatio=True, anchor="c")
                else:
                    col, row = i % 2, i // 2
                    c.drawImage(img, 0.5 * inch + col * 3.6 * inch, 4.1 * inch - row * 3.6 * inch, 3.4 * inch, 3.4 * inch, preserveAspectRatio=True, anchor="c")
            except Exception as e:
                logger.warning(f"pdf draw err: {e}")
        c.showPage()
    c.save()
    meta = save_pdf(order["customer_id"], order["album_id"], buf.getvalue())
    await db.orders.update_one({"id": order_id}, {"$set": {"pdf_path": meta["pdf_path"], "pdf_url": public_url(meta["pdf_path"])}})
    return {"pdf_url": public_url(meta["pdf_path"]), "size_bytes": meta["size_bytes"]}


# ---- Covers ----

@router.post("/covers")
async def create_cover(payload: CoverIn, admin: dict = Depends(get_current_admin)):
    doc = {"id": new_id(), **payload.dict(), "created_at": now_iso()}
    await db.covers.insert_one(dict(doc))
    return {"cover": doc}


@router.put("/covers/{cover_id}")
async def update_cover(cover_id: str, payload: CoverIn, admin: dict = Depends(get_current_admin)):
    await db.covers.update_one({"id": cover_id}, {"$set": payload.dict()})
    return {"success": True}


@router.delete("/covers/{cover_id}")
async def delete_cover(cover_id: str, admin: dict = Depends(get_current_admin)):
    await db.covers.delete_one({"id": cover_id})
    return {"success": True}


# ---- Offers ----

@router.get("/offers")
async def admin_offers(admin: dict = Depends(get_current_admin)):
    return {"offers": await db.offers.find({}, {"_id": 0}).to_list(200)}


@router.post("/offers")
async def create_offer(payload: OfferIn, admin: dict = Depends(get_current_admin)):
    doc = {"id": new_id(), **payload.dict(), "code": payload.code.upper(), "usage_count": 0, "created_at": now_iso()}
    await db.offers.insert_one(dict(doc))
    return {"offer": doc}


@router.put("/offers/{offer_id}")
async def update_offer(offer_id: str, payload: OfferIn, admin: dict = Depends(get_current_admin)):
    update = payload.dict()
    update["code"] = update["code"].upper()
    await db.offers.update_one({"id": offer_id}, {"$set": update})
    return {"success": True}


# ---- Settings / bots / customers ----

@router.put("/settings")
async def update_settings(payload: SettingsUpdate, admin: dict = Depends(get_current_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.settings.update_one({"id": "default"}, {"$set": update}, upsert=True)
    return {"settings": await get_settings_doc()}


@router.get("/process-bots")
async def list_process_bots(admin: dict = Depends(get_current_admin)):
    return {"process_bots": await db.process_bots.find({}, {"_id": 0}).sort("order", 1).to_list(20)}


@router.put("/process-bots/{bot_id}")
async def update_bot(bot_id: str, payload: BotUpdate, admin: dict = Depends(get_current_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.process_bots.update_one({"id": bot_id}, {"$set": update})
    return {"success": True}


@router.get("/customers")
async def admin_customers(admin: dict = Depends(get_current_admin)):
    return {"customers": await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)}
