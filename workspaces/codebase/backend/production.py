"""Builds the print-facility package for a paid order into Downloads/<order>/ on VPS storage:
Album.pdf, Cover/cover.jpg, Print/page_001.jpg …, manifest.json. Triggered on payment, re-runnable by admin."""
import asyncio
from datetime import datetime, timezone
from starlette.concurrency import run_in_threadpool

from core import db, now_iso, logger
from pdf_renderer import render_production_package, page_dimensions, pixel_dimensions
from storage_manager import save_production_package, public_url, safe_folder_name, get_file_bytes

DEFAULT_LAST_PAGE_URL = "/api/files/home/last-page.webp"


def package_folder(order: dict) -> str:
    return safe_folder_name(f"{order['order_no']}_{order.get('album_name') or order.get('client_name') or ''}")


def validate_print_handoff(album: dict) -> dict:
    """Validate the frozen album snapshot before producing files; legacy ClickBooks keep their existing path."""
    config = album.get("album_config") or {}
    if not config:
        return {"status": "legacy", "warnings": []}

    size = config.get("size") or album.get("size")
    paper_finish = config.get("paper_finish") or album.get("paper_finish")
    cover_material = config.get("cover_material") or album.get("cover_material")
    if size not in {"12x18", "12x12"}:
        raise ValueError("Wedding print handoff has an unsupported album size.")
    if paper_finish not in {"gloss", "matte"}:
        raise ValueError("Wedding print handoff is missing a valid paper finish.")
    if cover_material not in {"digital", "acrylic"}:
        raise ValueError("Wedding print handoff is missing a valid cover material.")

    pages = sorted(album.get("pages") or [], key=lambda p: p.get("order", 0))
    page_count = len(pages)
    if not 30 <= page_count <= 50:
        raise ValueError(f"Wedding print handoff requires 30–50 pages; this album has {page_count}.")
    if not album.get("cover_design"):
        raise ValueError("Wedding print handoff is missing the approved cover design.")

    photo_ids = {p.get("id") for p in album.get("photos", [])}
    missing_refs = [
        {"page": index + 1, "photo_id": photo_id}
        for index, page in enumerate(pages)
        for photo_id in (page.get("photo_ids") or [])
        if photo_id not in photo_ids
    ]
    if missing_refs:
        raise ValueError(f"Wedding print handoff contains {len(missing_refs)} missing photo reference(s).")

    blank_pages = [index + 1 for index, page in enumerate(pages) if not (page.get("photo_ids") or [])]
    low_resolution = 0
    for photo in album.get("photos", []):
        try:
            width = int(photo.get("width") or photo.get("width_px") or 0)
            height = int(photo.get("height") or photo.get("height_px") or 0)
        except (TypeError, ValueError):
            continue
        if width > 0 and height > 0 and min(width, height) < 1200:
            low_resolution += 1

    warnings = []
    if blank_pages:
        warnings.append({
            "code": "blank_pages",
            "message": "Some pages contain no photo references; inspect these pages before printing.",
            "page_numbers": blank_pages,
        })
    if low_resolution:
        warnings.append({
            "code": "low_resolution_photos",
            "message": "Some source photos have a smallest dimension below 1200 pixels; inspect sharpness at print size.",
            "photo_count": low_resolution,
        })
    width_px, height_px = pixel_dimensions({**album, "size": size, "album_config": {**config, "size": size}})
    return {
        "status": "passed_with_warnings" if warnings else "passed",
        "page_count": page_count,
        "size": size,
        "paper_finish": paper_finish,
        "cover_material": cover_material,
        "pixel_dimensions": {"width": width_px, "height": height_px},
        "warnings": warnings,
    }


async def build_production_package(order_id: str) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return {"status": "failed", "error": "Order not found"}
    await db.orders.update_one({"id": order_id}, {"$set": {"production_package": {"status": "building", "started_at": now_iso()}}})
    try:
        album = order.get("album_snapshot") or {}
        print_readiness = validate_print_handoff(album)
        layouts = await db.layouts.find({}, {"_id": 0}).to_list(50)
        layouts_by_id = {l["id"]: l for l in layouts}
        home = await db.home_content.find_one({"id": "default"}, {"_id": 0, "last_page_url": 1}) or {}
        last_page_url = home.get("last_page_url") or DEFAULT_LAST_PAGE_URL
        last_page_bytes = await run_in_threadpool(get_file_bytes, last_page_url.replace("/api/files/", "", 1))
        rendered = await run_in_threadpool(render_production_package, album, layouts_by_id, last_page_bytes)
        manifest = {
            "order_no": order["order_no"],
            "album_name": order.get("album_name"),
            "client_name": order.get("client_name"),
            "mobile": (order.get("customer_snapshot") or {}).get("mobile"),
            "sheets": order.get("sheets"),
            "pages": len(rendered["pages"]),
            "size": f"{page_dimensions(album)[0]:g}x{page_dimensions(album)[1]:g} in",
            "resolution_ppi": 300,
            "source_resolution_policy": {"minimum_effective_ppi": 200, "target_effective_ppi": 300},
            "output_formats": ["PDF", "JPEG"],
            "jpeg_quality": 95,
            "pixel_dimensions": {"width": pixel_dimensions(album)[0], "height": pixel_dimensions(album)[1]},
            "paper_finish": album.get("paper_finish"),
            "cover_material": album.get("cover_material"),
            "design_style": album.get("design_style"),
            "cover_style": (album.get("cover_design") or {}).get("style"),
            "print_readiness": print_readiness,
            "gift_wrap": order.get("gift_wrap", False),
            "gift_note": order.get("gift_note", ""),
            "address": order.get("address"),
            "generated_at": now_iso(),
        }
        meta = await run_in_threadpool(save_production_package, package_folder(order), rendered["pdf"],
                                       rendered["cover"], rendered["pages"], manifest, rendered.get("back_cover"))
        pkg = {
            "status": "ready",
            "dir": meta["dir"],
            "pdf_url": public_url(meta["pdf_path"]),
            "cover_url": public_url(meta["cover_path"]),
            "back_cover_url": public_url(meta["cover_path"].replace("cover.jpg", "back_cover.jpg")),
            "manifest_url": public_url(meta["manifest_path"]),
            "print_urls": [public_url(p) for p in meta["print_paths"]],
            "pages": len(meta["print_paths"]),
            "print_readiness": print_readiness,
            "size_bytes": meta["size_bytes"],
            "built_at": now_iso(),
        }
        await db.orders.update_one({"id": order_id}, {"$set": {"production_package": pkg, "pdf_path": meta["pdf_path"],
                                                                "pdf_url": pkg["pdf_url"], "updated_at": now_iso()}})
        logger.info("Production package ready for %s at %s (%d pages)", order["order_no"], meta["dir"], pkg["pages"])
        return pkg
    except Exception as e:  # noqa: BLE001 — never let a render error break payment confirmation
        # Full technical detail stays in the server log; the console only gets a safe, actionable message.
        logger.exception("Production package failed for order %s: %s", order_id, e)
        pkg = {"status": "failed", "error": "Production file generation failed. Please try again.",
               "error_code": type(e).__name__, "failed_at": now_iso()}
        await db.orders.update_one({"id": order_id}, {"$set": {"production_package": pkg}})
        return pkg


STALE_BUILD_MESSAGE = "Production file generation did not finish (the server restarted during rendering). Please try again."
STALE_AFTER_SECONDS = 15 * 60


def production_build_is_stale(pkg: dict) -> bool:
    """A 'building' package older than STALE_AFTER_SECONDS means the worker died mid-render (OOM / restart)."""
    started = pkg.get("started_at")
    if not started:
        return True
    try:
        t = datetime.fromisoformat(started.replace("Z", "+00:00"))
    except ValueError:
        return True
    return (datetime.now(timezone.utc) - t).total_seconds() > STALE_AFTER_SECONDS


_tasks: set = set()


def schedule_production_package(order_id: str) -> None:
    task = asyncio.create_task(build_production_package(order_id))
    _tasks.add(task)  # keep a strong reference so the task is never garbage-collected mid-render
    task.add_done_callback(_tasks.discard)
