"""Admin console: login, dashboard, orders, covers, offers, settings, process bots, customers, PDF."""
import secrets
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional

from core import db, now_iso, new_id, get_current_admin, get_settings_doc
from storage_manager import save_original, public_url, list_dir_files, zip_dir
from production import build_production_package
from routers.notifications import notify_order_status

router = APIRouter(prefix="/admin", tags=["admin"])

PRODUCTION_STATUSES = {"processing", "printing", "packaging", "out_for_delivery", "delivered", "cancelled", "refunded"}


class AdminLogin(BaseModel):
    username: str
    password: str


class CoverIn(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: str
    style: Optional[str] = None  # signature | classic | editorial
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
    image_url: Optional[str] = None
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
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        if payload.production_status == "delivered":
            await db.albums.update_one({"id": order["album_id"]}, {"$set": {"status": "delivered"}})
        await notify_order_status(order, payload.production_status, payload.note or "")
    return {"success": True}


@router.post("/orders/{order_id}/pdf")
async def generate_pdf(order_id: str, admin: dict = Depends(get_current_admin)):
    """(Re)builds the full print package from the frozen album_snapshot:
    Downloads/<order>/Album.pdf + Cover/cover.jpg + Print/page_NNN.jpg + manifest.json."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "id": 1, "album_snapshot": 1})
    if not order:
        raise HTTPException(404, "Order not found")
    pkg = await build_production_package(order_id)
    if pkg.get("status") != "ready":
        raise HTTPException(500, f"Render failed: {pkg.get('error', 'unknown error')}")
    return {"pdf_url": pkg["pdf_url"], "size_bytes": pkg["size_bytes"], "pages": pkg["pages"] + 1, "package": pkg}


@router.get("/orders/{order_id}/downloads")
async def order_downloads(order_id: str, admin: dict = Depends(get_current_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "order_no": 1, "production_package": 1})
    if not order:
        raise HTTPException(404, "Order not found")
    pkg = order.get("production_package") or {"status": "none"}
    files = list_dir_files(pkg["dir"]) if pkg.get("dir") else []
    return {"package": pkg, "files": [{**f, "url": public_url(f["path"])} for f in files]}


@router.get("/orders/{order_id}/downloads.zip", include_in_schema=False)
async def order_downloads_zip(order_id: str, token: str = ""):
    """Zip of the whole Downloads/<order>/ folder. Token passed as query so it can open in a browser tab."""
    if not token or not await db.admins.find_one({"token": token}, {"_id": 1}):
        raise HTTPException(401, "Invalid admin token")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "order_no": 1, "production_package": 1})
    if not order or not (order.get("production_package") or {}).get("dir"):
        raise HTTPException(404, "Production package not built yet")
    data = await run_in_threadpool(zip_dir, order["production_package"]["dir"])
    if data is None:
        raise HTTPException(404, "Package folder missing")
    name = order["production_package"]["dir"].split("/")[-1]
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}.zip"'})


# ---- Admin-managed images (covers, backgrounds, process bots, promos) ----

@router.post("/images")
async def admin_upload_image(file: UploadFile = File(...), admin: dict = Depends(get_current_admin)):
    """Upload a replacement image for any admin-managed asset. Returns stable URLs (preview + original)."""
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20MB)")
    try:
        meta = await run_in_threadpool(save_original, "admin", "assets", file.filename or "image.jpg", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    doc = {"id": new_id(), "filename": file.filename, "uploaded_by": admin["username"], "created_at": now_iso(), **meta,
           "url": public_url(meta["preview_path"]), "thumbnail_url": public_url(meta["thumbnail_path"]),
           "original_url": public_url(meta["original_path"])}
    await db.admin_images.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"image": doc}


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
