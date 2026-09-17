"""Idempotent seed data: settings, covers, layouts, backgrounds, offers, process bots, admin."""
from core import db, now_iso, new_id
from design import COVER_STYLES


async def seed():
    if not await db.settings.find_one({"id": "default"}):
        await db.settings.insert_one({
            "id": "default", "price_per_sheet": 90, "gst_percent": 18,
            "min_sheets": 20, "max_sheets": 75, "size": "8x8", "gift_wrap_fee": 150,
        })
    # Cover styles (editable image + text model). Legacy covers without a style are retired.
    style_images = {
        "signature": "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop",
        "classic": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&auto=format&fit=crop",
        "editorial": "https://images.unsplash.com/photo-1519791883288-dc8bd696e667?w=800&auto=format&fit=crop",
    }
    for i, (key, st) in enumerate(COVER_STYLES.items()):
        await db.covers.update_one(
            {"style": key},
            {"$setOnInsert": {"id": new_id(), "style": key, "image_url": style_images[key], "created_at": now_iso()},
             "$set": {"name": st["name"], "description": st["description"], "active": True, "display_order": i + 1}},
            upsert=True,
        )
    await db.covers.update_many({"style": {"$exists": False}}, {"$set": {"active": False}})
    existing = {l["photo_count"] for l in await db.layouts.find({}, {"_id": 0, "photo_count": 1}).to_list(50)}
    layouts = {
        1: ("One Photo", [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.9}]),
        2: ("Two Photos", [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.44}, {"x": 0.05, "y": 0.51, "w": 0.9, "h": 0.44}]),
        3: ("Three Photos", [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.55}, {"x": 0.05, "y": 0.63, "w": 0.44, "h": 0.32},
                             {"x": 0.51, "y": 0.63, "w": 0.44, "h": 0.32}]),
        4: ("Four Photos", [{"x": 0.05, "y": 0.05, "w": 0.44, "h": 0.44}, {"x": 0.51, "y": 0.05, "w": 0.44, "h": 0.44},
                            {"x": 0.05, "y": 0.51, "w": 0.44, "h": 0.44}, {"x": 0.51, "y": 0.51, "w": 0.44, "h": 0.44}]),
    }
    to_add = [{"id": new_id(), "name": name, "photo_count": n, "active": True, "positions": pos}
              for n, (name, pos) in layouts.items() if n not in existing]
    if to_add:
        await db.layouts.insert_many(to_add)
    if await db.backgrounds.count_documents({}) == 0:
        await db.backgrounds.insert_many([
            {"id": new_id(), "name": "Ivory", "color": "#FAFAF8", "active": True},
            {"id": new_id(), "name": "Cream", "color": "#F0EFEA", "active": True},
            {"id": new_id(), "name": "Blush", "color": "#F2D8CE", "active": True},
            {"id": new_id(), "name": "Charcoal", "color": "#1C1917", "active": True},
            {"id": new_id(), "name": "Sage", "color": "#D6DBC2", "active": True},
            {"id": new_id(), "name": "Terracotta", "color": "#C56A47", "active": True},
        ])
    if await db.offers.count_documents({}) == 0:
        await db.offers.insert_many([
            {"id": new_id(), "name": "Welcome 2026", "code": "WELCOME2026", "discount_type": "percentage",
             "value": 10, "min_order": 0, "max_discount": 500, "active": True, "public": True,
             "usage_count": 0, "created_at": now_iso(), "start_at": None, "end_at": "2026-12-30T23:59:59+00:00"},
            {"id": new_id(), "name": "Couple Special", "code": "COUPLE20", "discount_type": "percentage",
             "value": 20, "min_order": 1000, "max_discount": 800, "active": True, "public": True,
             "usage_count": 0, "created_at": now_iso(), "start_at": None, "end_at": None},
            {"id": new_id(), "name": "Flat ₹200 Off", "code": "FLAT200", "discount_type": "fixed",
             "value": 200, "min_order": 1500, "active": True, "public": True,
             "usage_count": 0, "created_at": now_iso()},
        ])
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
    await db.admins.update_one(
        {"username": "admin"},
        {"$setOnInsert": {"username": "admin", "password": "clickbook@2026", "role": "super", "created_at": now_iso()}},
        upsert=True,
    )
