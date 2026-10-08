"""Builds the print-facility package for a paid order into Downloads/<order>/ on VPS storage:
Album.pdf, Cover/cover.jpg, Print/page_001.jpg …, manifest.json. Triggered on payment, re-runnable by admin."""
import asyncio
from datetime import datetime, timezone
from starlette.concurrency import run_in_threadpool

from core import db, now_iso, logger
from pdf_renderer import render_production_package
from storage_manager import save_production_package, public_url, safe_folder_name, get_file_bytes

DEFAULT_LAST_PAGE_URL = "/api/files/home/last-page.webp"


def package_folder(order: dict) -> str:
    return safe_folder_name(f"{order['order_no']}_{order.get('album_name') or order.get('client_name') or ''}")


async def build_production_package(order_id: str) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return {"status": "failed", "error": "Order not found"}
    await db.orders.update_one({"id": order_id}, {"$set": {"production_package": {"status": "building", "started_at": now_iso()}}})
    try:
        album = order.get("album_snapshot") or {}
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
            "size": "8x8 in @ 300 dpi",
            "design_style": album.get("design_style"),
            "cover_style": (album.get("cover_design") or {}).get("style"),
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
            "print_urls": [public_url(p) for p in meta["print_paths"]],
            "pages": len(meta["print_paths"]),
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
