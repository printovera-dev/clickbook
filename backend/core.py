"""Shared infrastructure: env, Mongo client, auth dependencies, helpers."""
import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("clickbook")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def _bearer(authorization: Optional[str], msg: str) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, msg)
    return authorization.replace("Bearer ", "").strip()


async def get_current_customer(authorization: Optional[str] = Header(None)) -> dict:
    token = _bearer(authorization, "Missing token")
    session = await db.sessions.find_one({"token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid token")
    customer = await db.customers.find_one({"id": session["customer_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(401, "Customer not found")
    return customer


async def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    token = _bearer(authorization, "Missing admin token")
    admin = await db.admins.find_one({"token": token}, {"_id": 0})
    if not admin:
        raise HTTPException(401, "Invalid admin token")
    return admin


async def get_settings_doc() -> dict:
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        s = {"id": "default", "price_per_sheet": 90, "gst_percent": 18,
             "min_sheets": 20, "max_sheets": 75, "size": "8x8", "gift_wrap_fee": 150}
        await db.settings.insert_one(dict(s))
    if "gift_wrap_fee" not in s:
        s["gift_wrap_fee"] = 150
        await db.settings.update_one({"id": "default"}, {"$set": {"gift_wrap_fee": 150}})
    return s
