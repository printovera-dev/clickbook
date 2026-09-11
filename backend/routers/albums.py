from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Optional, Any, Dict

from core import db, now_utc, now_iso, new_id, get_current_customer, get_settings_doc
from storage_manager import save_original, public_url

router = APIRouter(tags=["albums"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXT = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")


class AlbumCreate(BaseModel):
    cover_id: str
    name: Optional[str] = None


class PagesUpdate(BaseModel):
    pages: List[Dict[str, Any]]


async def _owned_album(album_id: str, customer: dict) -> dict:
    album = await db.albums.find_one({"id": album_id, "customer_id": customer["id"]}, {"_id": 0})
    if not album:
        raise HTTPException(404, "Album not found")
    return album


async def _save_design(album: dict, pages: list, kind: str) -> dict:
    settings = await get_settings_doc()
    sheets = max(settings.get("min_sheets", 10), (len(pages) + 1) // 2)
    version = album.get("version", 1) + 1
    await db.albums.update_one(
        {"id": album["id"]},
        {"$set": {"pages": pages, "sheets": sheets, "updated_at": now_iso(), "version": version}},
    )
    await db.design_versions.insert_one({
        "id": new_id(), "album_id": album["id"], "version": version, "kind": kind,
        "snapshot": {"pages": pages, "sheets": sheets}, "created_at": now_iso(),
    })
    return await db.albums.find_one({"id": album["id"]}, {"_id": 0})


@router.post("/albums")
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
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.albums.insert_one(dict(album))
    return {"album": album}


@router.get("/albums")
async def list_my_albums(customer: dict = Depends(get_current_customer)):
    albums = await db.albums.find({"customer_id": customer["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {"albums": albums}


@router.get("/albums/{album_id}")
async def get_album(album_id: str, customer: dict = Depends(get_current_customer)):
    return {"album": await _owned_album(album_id, customer)}


@router.post("/albums/{album_id}/photos")
async def upload_photo(album_id: str, file: UploadFile = File(...), customer: dict = Depends(get_current_customer)):
    await _owned_album(album_id, customer)
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
    await db.albums.update_one(
        {"id": album_id, "customer_id": customer["id"]},
        {"$pull": {"photos": {"id": photo_id}}, "$set": {"updated_at": now_iso()}},
    )
    return {"success": True}


@router.post("/albums/{album_id}/generate")
async def auto_generate(album_id: str, customer: dict = Depends(get_current_customer)):
    album = await _owned_album(album_id, customer)
    photos = album.get("photos", [])
    if not photos:
        raise HTTPException(400, "No photos uploaded")
    layouts = await db.layouts.find({"active": True}, {"_id": 0}).to_list(50)
    layouts_by_count = {l["photo_count"]: l for l in layouts}
    bgs = await db.backgrounds.find({"active": True}, {"_id": 0}).to_list(100)
    default_bg = bgs[0]["color"] if bgs else "#FFFFFF"

    # Rhythm mixing 1/2/3/4-photo layouts; falls back to smaller layouts near the end.
    pages = []
    i = 0
    idx = 0
    rhythm = [2, 1, 3, 2, 4, 1, 2]
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
            "background": default_bg,
            "text": "",
            "order": idx,
        })
        i += count
        idx += 1

    return {"album": await _save_design(album, pages, "auto")}


@router.put("/albums/{album_id}/pages")
async def update_pages(album_id: str, payload: PagesUpdate, customer: dict = Depends(get_current_customer)):
    album = await _owned_album(album_id, customer)
    for i, p in enumerate(payload.pages):
        p["order"] = i
    return {"album": await _save_design(album, payload.pages, "edit")}
