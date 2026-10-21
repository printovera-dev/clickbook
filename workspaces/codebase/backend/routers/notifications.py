"""Customer notifications: admin-sent (offers, corrections, updates) + system-generated (order status)."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from core import db, now_iso, new_id, get_current_customer, get_current_admin

router = APIRouter(tags=["notifications"])

TYPES = {"general", "offer", "correction", "status", "order"}


class NotificationSend(BaseModel):
    title: str
    body: str
    type: str = "general"
    customer_id: Optional[str] = None  # None → broadcast to every customer
    order_id: Optional[str] = None


async def notify(customer_id: str, title: str, body: str, type: str = "general", order_id: Optional[str] = None,
                 created_by: str = "system", broadcast_id: Optional[str] = None) -> dict:
    doc = {"id": new_id(), "customer_id": customer_id, "title": title.strip(), "body": body.strip(), "type": type,
           "order_id": order_id, "created_by": created_by, "broadcast_id": broadcast_id, "read": False,
           "created_at": now_iso()}
    await db.notifications.insert_one(dict(doc))
    return doc


async def notify_order_status(order: dict, status: str, note: str = "") -> None:
    bot = await db.process_bots.find_one({"stage": status}, {"_id": 0})
    label = (bot or {}).get("label") or status.replace("_", " ").title()
    body = note.strip() or (bot or {}).get("message") or f"Your order is now {label.lower()}."
    if order.get("tracking_number") and status == "out_for_delivery":
        body += f" Tracking: {order['tracking_number']}"
    await notify(order["customer_id"], f"Order {order['order_no']} · {label}", body, "status", order["id"])


# ---- Customer ----

@router.get("/notifications")
async def list_notifications(customer: dict = Depends(get_current_customer)):
    items = await db.notifications.find({"customer_id": customer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = await db.notifications.count_documents({"customer_id": customer["id"], "read": False})
    return {"notifications": items, "unread_count": unread}


@router.post("/notifications/read-all")
async def read_all(customer: dict = Depends(get_current_customer)):
    r = await db.notifications.update_many({"customer_id": customer["id"], "read": False},
                                           {"$set": {"read": True, "read_at": now_iso()}})
    return {"success": True, "updated": r.modified_count}


@router.post("/notifications/{notification_id}/read")
async def read_one(notification_id: str, customer: dict = Depends(get_current_customer)):
    r = await db.notifications.update_one({"id": notification_id, "customer_id": customer["id"]},
                                          {"$set": {"read": True, "read_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"success": True}


# ---- Admin ----

@router.post("/admin/notifications")
async def admin_send(payload: NotificationSend, admin: dict = Depends(get_current_admin)):
    if payload.type not in TYPES:
        raise HTTPException(400, "Invalid type")
    if not payload.title.strip() or not payload.body.strip():
        raise HTTPException(400, "Title and message are required")
    if payload.customer_id:
        if not await db.customers.find_one({"id": payload.customer_id}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Customer not found")
        targets = [payload.customer_id]
        broadcast_id = None
    else:
        targets = [c["id"] async for c in db.customers.find({}, {"_id": 0, "id": 1})]
        broadcast_id = new_id()
    for cid in targets:
        await notify(cid, payload.title, payload.body, payload.type, payload.order_id,
                     created_by=admin["username"], broadcast_id=broadcast_id)
    return {"success": True, "sent": len(targets), "broadcast": broadcast_id is not None}


@router.get("/admin/notifications")
async def admin_list(admin: dict = Depends(get_current_admin)):
    """Recent sends, broadcasts collapsed to one row with recipient count."""
    items = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    customers = {c["id"]: c async for c in db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "mobile": 1})}
    rows, seen = [], {}
    for n in items:
        if n.get("broadcast_id"):
            if n["broadcast_id"] in seen:
                seen[n["broadcast_id"]]["recipients"] += 1
                seen[n["broadcast_id"]]["read_count"] += 1 if n.get("read") else 0
                continue
            row = {**n, "recipients": 1, "read_count": 1 if n.get("read") else 0, "customer": None}
            seen[n["broadcast_id"]] = row
        else:
            c = customers.get(n["customer_id"]) or {}
            row = {**n, "recipients": 1, "read_count": 1 if n.get("read") else 0,
                   "customer": {"name": c.get("name"), "mobile": c.get("mobile")}}
        rows.append(row)
    return {"notifications": rows[:200]}
