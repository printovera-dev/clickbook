from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Optional, Any, Dict

from core import db, now_utc, now_iso, new_id, get_current_customer, get_settings_doc
from storage_manager import save_original, public_url
from routers.catalog import with_thumbnails
from design import STYLE_RHYTHMS, DEFAULT_STYLE, default_transform, default_cover_design

router = APIRouter(tags=["albums"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXT = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")


class AlbumCreate(BaseModel):
    cover_id: str
    name: Optional[str] = None


class PagesUpdate(BaseModel):
    pages: List[Dict[str, Any]]


class GenerateRequest(BaseModel):
    style: Optional[str] = None  # elegant | balanced | gallery
    cover_photo_id: Optional[str] = None
    allow_short: bool = False  # admin/test escape hatch only


class AlbumUpdate(BaseModel):
    name: Optional[str] = None
    design_style: Optional[str] = None
    cover_design: Optional[Dict[str, Any]] = None


async def _owned_album(album_id: str, customer: dict) -> dict:
    album = await db.albums.find_one({"id": album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    return album


def _ensure_locked(album: dict) -> None:
    """Server-side payment lock: only a *paid* order locks the album (set by mark_order_paid). Placing an order,
    or a pending/failed/cancelled payment, leaves the album fully editable."""
    if album.get("locked") or album.get("status") in ("ordered", "delivered"):
        raise HTTPException(409, "This album has been locked because payment has been completed. Further editing is not available.")


async def _save_design(album: dict, pages: list, kind: str, extra: Optional[dict] = None) -> dict:
    _ensure_locked(album)
    settings = await get_settings_doc()
    sheets = max(settings.get("min_sheets", 10), (len(pages) + 1) // 2)
    version = album.get("version", 1) + 1
    await db.albums.update_one(
        {"id": album["id"]},
        {"$set": {"pages": pages, "sheets": sheets, "updated_at": now_iso(), "version": version, **(extra or {})}},
    )
    await db.design_versions.insert_one({
        "id": new_id(), "album_id": album["id"], "version": version, "kind": kind,
        "snapshot": {"pages": pages, "sheets": sheets, **(extra or {})}, "created_at": now_iso(),
    })
    return _decorate(await db.albums.find_one({"id": album["id"]}, {"_id": 0}))


@router.post("/albums")
async def create_album(payload: AlbumCreate, customer: dict = Depends(get_current_customer)):
    cover = await db.covers.find_one({"id": payload.cover_id, "active": True}, {"_id": 0})
    if not cover:
        raise HTTPException(400, "Invalid cover")
    cover = (await with_thumbnails([cover]))[0]
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
        "design_style": None,
        "cover_design": None,
        "locked": False,
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.albums.insert_one(dict(album))
    return {"album": _decorate(album)}


def _decorate(album: dict) -> dict:
    """Derived fields the app relies on: lifecycle `state` and the real front-cover thumbnail."""
    photos = album.get("photos") or []
    pages = album.get("pages") or []
    if album.get("locked"):
        state = "delivered" if album.get("status") == "delivered" else "locked"
    elif not photos:
        state = "creating"
    elif not pages:
        state = "uploading"
    else:
        state = "draft"
    album["state"] = state
    album["is_complete"] = bool(pages) and bool(album.get("cover_design"))
    cd = album.get("cover_design") or {}
    photo = next((p for p in photos if p.get("id") == cd.get("photo_id")), None)
    album["cover_thumbnail_url"] = (photo or {}).get("thumbnail_url") or (album.get("cover_snapshot") or {}).get("thumbnail_url") or (album.get("cover_snapshot") or {}).get("image_url")
    album["cover_preview_url"] = (photo or {}).get("preview_url") or (album.get("cover_snapshot") or {}).get("image_url")
    return album


@router.get("/albums")
async def list_my_albums(customer: dict = Depends(get_current_customer)):
    albums = await db.albums.find({"customer_id": customer["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {"albums": [_decorate(a) for a in albums]}


@router.get("/albums/{album_id}")
async def get_album(album_id: str, customer: dict = Depends(get_current_customer)):
    return {"album": _decorate(await _owned_album(album_id, customer))}


@router.put("/albums/{album_id}")
async def update_album(album_id: str, payload: AlbumUpdate, customer: dict = Depends(get_current_customer)):
    album = await _owned_album(album_id, customer)
    _ensure_locked(album)
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if "design_style" in update and update["design_style"] not in STYLE_RHYTHMS:
        raise HTTPException(400, "Invalid style")
    if update:
        update["updated_at"] = now_iso()
        await db.albums.update_one({"id": album_id}, {"$set": update})
        if "cover_design" in update:
            await db.design_versions.insert_one({
                "id": new_id(), "album_id": album_id, "version": album.get("version", 1), "kind": "cover",
                "snapshot": {"cover_design": update["cover_design"]}, "created_at": now_iso(),
            })
    return {"album": _decorate(await db.albums.find_one({"id": album_id}, {"_id": 0}))}


@router.post("/albums/{album_id}/photos")
async def upload_photo(album_id: str, file: UploadFile = File(...), customer: dict = Depends(get_current_customer)):
    _ensure_locked(await _owned_album(album_id, customer))
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File too large (max 20MB)")
    filename = file.filename or "photo.jpg"
    if not filename.lower().endswith(ALLOWED_EXT):
        raise HTTPException(400, "Unsupported file type")
    try:
        # Pillow resize is CPU-bound: keep the event loop free while generating derivatives.
        meta = await run_in_threadpool(save_original, customer["id"], album_id, filename, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    photo = {
        "id": new_id(),
        "filename": filename,
        "uploaded_at": now_iso(),
        **meta,
        "thumbnail_url": public_url(meta["thumbnail_path"]),
        "preview_url": public_url(meta["preview_path"]),
        "original_url": public_url(meta["original_path"]),
    }
    await db.albums.update_one(
        {"id": album_id},
        {"$push": {"photos": photo}, "$set": {"updated_at": now_iso()}},
    )
    return {"photo": photo}


@router.delete("/albums/{album_id}/photos/{photo_id}")
async def delete_photo(album_id: str, photo_id: str, customer: dict = Depends(get_current_customer)):
    _ensure_locked(await _owned_album(album_id, customer))
    await db.albums.update_one(
        {"id": album_id, "customer_id": customer["id"]},
        {"$pull": {"photos": {"id": photo_id}}, "$set": {"updated_at": now_iso()}},
    )
    return {"success": True}


@router.post("/albums/{album_id}/generate")
async def auto_generate(album_id: str, payload: Optional[GenerateRequest] = None,
                        customer: dict = Depends(get_current_customer)):
    album = await _owned_album(album_id, customer)
    style = (payload.style if payload and payload.style else None) or album.get("design_style") or DEFAULT_STYLE
    if style not in STYLE_RHYTHMS:
        raise HTTPException(400, "Invalid style")
    photos = album.get("photos", [])
    if not photos:
        raise HTTPException(400, "No photos uploaded")
    layouts = await db.layouts.find({"active": True}, {"_id": 0}).to_list(50)
    layouts_by_count = {l["photo_count"]: l for l in layouts}
    bgs = await db.backgrounds.find({"active": True}, {"_id": 0}).to_list(100)
    default_bg = bgs[0]["color"] if bgs else "#FFFFFF"

    # Style rhythm (photos per page); falls back to smaller layouts near the end.
    pages = []
    i = 0
    idx = 0
    rhythm = STYLE_RHYTHMS[style]
    while i < len(photos):
        want = rhythm[idx % len(rhythm)]
        chosen = None
        for count in (want, 2, 1):
            if count <= (len(photos) - i) and layouts_by_count.get(count):
                chosen = layouts_by_count[count]
                break
        if not chosen:
            chosen = layouts_by_count.get(1)
            count = 1
        else:
            count = chosen["photo_count"]
        pages.append({
            "id": new_id(),
            "layout_id": chosen["id"] if chosen else "",
            "layout_photo_count": count,
            "photo_ids": [photos[i + k]["id"] for k in range(count)],
            "images": {str(k): {"photo_id": photos[i + k]["id"], **default_transform()} for k in range(count)},
            "texts": [],
            "background": default_bg,
            "text": "",
            "order": idx,
        })
        i += count
        idx += 1

    extra = {"design_style": style}
    cover_pid = payload.cover_photo_id if payload and payload.cover_photo_id else None
    if cover_pid and not any(p["id"] == cover_pid for p in photos):
        raise HTTPException(400, "Cover photo not in this album")
    if not album.get("cover_design"):
        cover_style = (album.get("cover_snapshot") or {}).get("style") or "signature"
        extra["cover_design"] = default_cover_design(cover_style, cover_pid or photos[0]["id"], album.get("name", "My Album"))
    elif cover_pid:
        extra["cover_design"] = {**album["cover_design"], "photo_id": cover_pid, "image": default_transform()}
    # Minimum-sheet rule (2 pages per sheet): never present an under-filled design as ready.
    settings = await get_settings_doc()
    min_sheets = int(settings.get("min_sheets", 20))
    required_pages = min_sheets * 2
    if len(pages) < required_pages and not (payload and payload.allow_short):
        avg = sum(rhythm) / len(rhythm)
        need_more = max(1, int(round((required_pages - len(pages)) * avg)))
        raise HTTPException(status_code=422, detail={
            "code": "insufficient_photos",
            "message": f"A ClickBook needs at least {min_sheets} sheets ({required_pages} pages). "
                       f"Your {len(photos)} photos fill {len(pages)} pages in the {style.title()} style — "
                       f"please add about {need_more} more photos.",
            "pages": len(pages), "required_pages": required_pages, "min_sheets": min_sheets,
            "photos": len(photos), "need_more": need_more, "style": style,
        })
    return {"album": await _save_design(album, pages, "auto", extra)}


@router.put("/albums/{album_id}/pages")
async def update_pages(album_id: str, payload: PagesUpdate, customer: dict = Depends(get_current_customer)):
    album = await _owned_album(album_id, customer)
    for i, p in enumerate(payload.pages):
        p["order"] = i
    return {"album": await _save_design(album, payload.pages, "edit")}
