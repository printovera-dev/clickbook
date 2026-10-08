"""Home page content (CMS): sliders, hero images, videos, steps, graphics. Admin-editable without an app rebuild.
Single document `home_content/default`; GET /home is public, PUT /admin/home replaces it. Images are uploaded via
POST /admin/images (VPS storage) and referenced by URL."""
import re
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from core import db, now_iso, new_id, get_current_admin, get_settings_doc

router = APIRouter(tags=["home"])

HOME_ASSET = "/api/files/home"  # seeded ClickBook assets (Google Drive CLICKBOOKHOME folder) stored on the VPS


def _slide(img: str, order: int, title: str = "", subtitle: str = "", cta_label: str = "", cta_route: str = "") -> dict:
    return {"id": new_id(), "image_url": f"{HOME_ASSET}/{img}", "title": title, "subtitle": subtitle,
            "cta_label": cta_label, "cta_route": cta_route, "active": True, "order": order}


def default_home_content() -> dict:
    return {
        "id": "default",
        "sliders": {
            "slider1": {"interval_ms": 4500, "slides": [_slide(f"sl1-{i}.png", i) for i in range(1, 5)]},
            "slider2": {"interval_ms": 4500, "slides": [_slide(f"sl2-{i}.png", i) for i in range(1, 4)]},
            "slider3": {"interval_ms": 4500, "slides": [_slide(f"sl3-{i}.png", i) for i in range(1, 4)]},
        },
        "heroes": [
            {"id": new_id(), "key": "pricing", "image_url": f"{HOME_ASSET}/hero-1.png", "active": True, "order": 1},
            {"id": new_id(), "key": "steps", "image_url": f"{HOME_ASSET}/hero-2.png", "active": True, "order": 2},
            {"id": new_id(), "key": "privacy", "image_url": f"{HOME_ASSET}/hero-3.png", "active": True, "order": 3},
            {"id": new_id(), "key": "final", "image_url": f"{HOME_ASSET}/hero-4.png", "active": True, "order": 4},
        ],
        "videos": [
            {"id": new_id(), "url": "https://www.youtube.com/shorts/J8B6B4r845o", "title": "Spill-Proof",
             "description": "Accidents happen, your memories stay safe.", "active": True, "order": 1},
            {"id": new_id(), "url": "https://www.youtube.com/shorts/dom3Ss9PLrI", "title": "Family Time",
             "description": "Made for every family moment.", "active": True, "order": 2},
            {"id": new_id(), "url": "https://www.youtube.com/shorts/dom3Ss9PLrI", "title": "How to Make",
             "description": "Your ClickBook in 60 seconds.", "active": True, "order": 3},
        ],
        "steps": [
            {"n": "01", "title": "Upload Your Images"}, {"n": "02", "title": "Choose Cover Design"},
            {"n": "03", "title": "Choose Design Style"}, {"n": "04", "title": "Preview Your ClickBook"},
            {"n": "05", "title": "Order Your ClickBook"},
        ],
        "logo_url": f"{HOME_ASSET}/logo.png",
        "last_page_url": f"{HOME_ASSET}/last-page.webp",
        "texts": {
            "login_title": "Your Most Beautiful Memories,",
            "login_accent": "Beautifully Preserved.",
            "login_sub": "Sign in with your phone number — we'll send a passcode over WhatsApp.",
            "steps_title": "Making ClickBook Super Easy!",
            "why_title": "Why ClickBook?",
            "privacy_title": "We Care About Your Privacy",
            "privacy_sub": "Your photos are used only to print your book and deleted after 30 days.",
            "cta_title": "Start Making Your ClickBook",
            "final_quote": "More than just a Book",
            "final_sub": "Premium quality, lasting forever.",
        },
        "updated_at": now_iso(),
    }


async def get_home_doc() -> dict:
    doc = await db.home_content.find_one({"id": "default"}, {"_id": 0})
    if not doc:
        doc = default_home_content()
        await db.home_content.insert_one(dict(doc))
        doc.pop("_id", None)
    doc.setdefault("last_page_url", f"{HOME_ASSET}/last-page.webp")
    return doc


def _public_view(doc: dict) -> dict:
    """Only active items, sorted — the app never filters."""
    out = dict(doc)
    out["sliders"] = {k: {**v, "slides": sorted([s for s in v.get("slides", []) if s.get("active", True)], key=lambda s: s.get("order", 0))}
                      for k, v in (doc.get("sliders") or {}).items()}
    out["heroes"] = sorted([h for h in doc.get("heroes", []) if h.get("active", True)], key=lambda h: h.get("order", 0))
    out["videos"] = sorted([v for v in doc.get("videos", []) if v.get("active", True)], key=lambda v: v.get("order", 0))
    return out


@router.get("/home")
async def home_content():
    doc = await get_home_doc()
    settings = await get_settings_doc()
    min_sheets = int(settings.get("min_sheets", 20))
    per_sheet = float(settings.get("price_per_sheet", 90))
    gst = float(settings.get("gst_percent", 18))
    base = round(min_sheets * per_sheet * (1 + gst / 100))
    return {"content": _public_view(doc),
            "pricing": {"min_sheets": min_sheets, "price_per_sheet": per_sheet, "gst_percent": gst,
                        "base_price": base, "size": settings.get("size", "8x8"), "free_delivery": True}}


@router.get("/home/video/{video_id}", include_in_schema=False)
async def video_player(video_id: str, provider: str = "youtube"):
    """Embedded player page. YouTube refuses to play when the embed URL is loaded directly in a WebView (no
    referer/origin → 'Video unavailable, watch on YouTube'), so the app loads this page from our own origin."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,}", video_id):
        raise HTTPException(404, "Unknown video")
    src = (f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1&playsinline=1&rel=0&modestbranding=1"
           if provider == "youtube" else f"https://player.vimeo.com/video/{video_id}?autoplay=1")
    html = f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{{margin:0;height:100%;background:#000}}iframe{{position:absolute;inset:0;width:100%;height:100%;border:0}}</style></head>
<body><iframe src="{src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>"""
    return Response(content=html, media_type="text/html")


class HomeUpdate(BaseModel):
    sliders: Optional[Dict[str, Any]] = None
    heroes: Optional[List[Dict[str, Any]]] = None
    videos: Optional[List[Dict[str, Any]]] = None
    steps: Optional[List[Dict[str, Any]]] = None
    texts: Optional[Dict[str, str]] = None
    logo_url: Optional[str] = None
    last_page_url: Optional[str] = None


@router.get("/admin/home")
async def admin_home(admin: dict = Depends(get_current_admin)):
    return {"content": await get_home_doc()}


@router.put("/admin/home")
async def admin_update_home(payload: HomeUpdate, admin: dict = Depends(get_current_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    for k in ("heroes", "videos"):
        for item in update.get(k, []) or []:
            item.setdefault("id", new_id())
    for sl in (update.get("sliders") or {}).values():
        for s in sl.get("slides", []):
            s.setdefault("id", new_id())
    update["updated_at"] = now_iso()
    await db.home_content.update_one({"id": "default"}, {"$set": update}, upsert=True)
    return {"content": await get_home_doc()}


@router.post("/admin/home/reset")
async def admin_reset_home(admin: dict = Depends(get_current_admin)):
    await db.home_content.delete_one({"id": "default"})
    return {"content": await get_home_doc()}
