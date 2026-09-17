"""Builds the print-facility package for a paid order into Downloads/<order>/ on VPS storage:
Album.pdf, Cover/cover.jpg, Print/page_001.jpg …, manifest.json. Triggered on payment, re-runnable by admin."""
import asyncio
from starlette.concurrency import run_in_threadpool

from core import db, now_iso, logger
from pdf_renderer import render_production_package
from storage_manager import save_production_package, public_url, safe_folder_name


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
        rendered = await run_in_threadpool(render_production_package, album, layouts_by_id)
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
                                       rendered["cover"], rendered["pages"], manifest)
        pkg = {
            "status": "ready",
            "dir": meta["dir"],
            "pdf_url": public_url(meta["pdf_path"]),
            "cover_url": public_url(meta["cover_path"]),
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
        logger.exception("Production package failed for order %s", order_id)
        pkg = {"status": "failed", "error": str(e), "failed_at": now_iso()}
        await db.orders.update_one({"id": order_id}, {"$set": {"production_package": pkg}})
        return pkg


def schedule_production_package(order_id: str) -> None:
    asyncio.create_task(build_production_package(order_id))
