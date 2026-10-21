"""Isolated Printovera Print Studio assets and artwork endpoints.
This router is deliberately separate from album and ClickBook order workflows.
"""
from pathlib import Path
from typing import Optional, Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from core import db, get_current_admin, get_current_customer, new_id, now_iso
from storage_manager import _put, public_url

router = APIRouter(prefix="/print-studio", tags=["print-studio"])

PRODUCTS = {"Visiting Cards", "Wedding Cards", "Brochures", "Letterheads"}
SIDES = {"front", "back", "page"}
ARTWORK_TYPES = {"base", "uv"}
MAX_BYTES = 30 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}


class TemplateIn(BaseModel):
    product: Literal["Visiting Cards", "Wedding Cards", "Brochures", "Letterheads"]
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    language: Literal["English", "Hindi", "Both"] = "Both"
    size_label: str = Field(default="Standard", max_length=80)
    sides: list[str] = Field(default_factory=lambda: ["front"])
    preview_image_url: str = Field(min_length=1, max_length=2048)
    active: bool = True
    display_order: int = 0


@router.get("/templates")
async def list_templates(product: Optional[str] = None, language: Optional[str] = None):
    query = {"active": True}
    if product:
        if product not in PRODUCTS:
            raise HTTPException(400, "Unsupported Print Studio product")
        query["product"] = product
    if language in {"English", "Hindi"}:
        query["language"] = {"$in": [language, "Both"]}
    docs = await db.print_studio_templates.find(query, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"templates": docs}


@router.get("/admin/templates")
async def admin_list_templates(admin: dict = Depends(get_current_admin)):
    docs = await db.print_studio_templates.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"templates": docs}


@router.post("/admin/templates")
async def create_template(payload: TemplateIn, admin: dict = Depends(get_current_admin)):
    if not payload.sides or any(s not in SIDES for s in payload.sides):
        raise HTTPException(400, "Sides must be front, back, or page")
    doc = {"id": new_id(), **payload.dict(), "created_at": now_iso(), "updated_at": now_iso(),
           "updated_by": admin.get("username")}
    await db.print_studio_templates.insert_one(dict(doc))
    return {"template": doc}


@router.put("/admin/templates/{template_id}")
async def update_template(template_id: str, payload: TemplateIn, admin: dict = Depends(get_current_admin)):
    if not payload.sides or any(s not in SIDES for s in payload.sides):
        raise HTTPException(400, "Sides must be front, back, or page")
    update = {**payload.dict(), "updated_at": now_iso(), "updated_by": admin.get("username")}
    result = await db.print_studio_templates.update_one({"id": template_id}, {"$set": update})
    if not result.matched_count:
        raise HTTPException(404, "Template not found")
    return {"template": {"id": template_id, **update}}


@router.delete("/admin/templates/{template_id}")
async def delete_template(template_id: str, admin: dict = Depends(get_current_admin)):
    result = await db.print_studio_templates.delete_one({"id": template_id})
    if not result.deleted_count:
        raise HTTPException(404, "Template not found")
    return {"success": True}


@router.post("/artwork")
async def upload_artwork(
    product: str = Form(...),
    side: str = Form(...),
    artwork_type: str = Form("base"),
    file: UploadFile = File(...),
    customer: dict = Depends(get_current_customer),
):
    """Upload customer artwork or a matching spot-UV mask to configured storage."""
    if product not in PRODUCTS:
        raise HTTPException(400, "Unsupported Print Studio product")
    if side not in SIDES:
        raise HTTPException(400, "Side must be front, back, or page")
    if artwork_type not in ARTWORK_TYPES:
        raise HTTPException(400, "Artwork type must be base or uv")
    filename = Path(file.filename or "").name
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Upload a PDF, PNG, JPG, or WebP file")
    if artwork_type == "uv" and ext not in {".pdf", ".png"}:
        raise HTTPException(400, "UV artwork must be a separate PDF or PNG spot mask")
    content = await file.read(MAX_BYTES + 1)
    if not content or len(content) > MAX_BYTES:
        raise HTTPException(400, "File is empty or exceeds the 30 MB limit")
    content_type = (file.content_type or "").lower()
    if ext == ".pdf" and content_type not in {"application/pdf", "application/octet-stream", ""}:
        raise HTTPException(400, "PDF content type does not match the file extension")
    asset_id = new_id()
    rel = f"print-studio/artwork/{customer['id']}/{asset_id}{ext}"
    await _put(rel, content, content_type or ("application/pdf" if ext == ".pdf" else "application/octet-stream"))
    doc = {
        "id": asset_id, "customer_id": customer["id"], "product": product, "side": side,
        "artwork_type": artwork_type, "filename": filename, "extension": ext,
        "size_bytes": len(content), "content_type": content_type, "path": rel,
        "url": public_url(rel), "created_at": now_iso(), "status": "uploaded",
    }
    await db.print_studio_artwork.insert_one(dict(doc))
    return {"artwork": doc}


@router.get("/artwork")
async def list_my_artwork(customer: dict = Depends(get_current_customer)):
    docs = await db.print_studio_artwork.find({"customer_id": customer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"artwork": docs}
