"""Shared infrastructure: env, Mongo client, auth dependencies, helpers."""
import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
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


# ---- Admin auth (bcrypt + JWT). Completely separate from customer OTP sessions. ----
JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("ADMIN_JWT_SECRET")
if not JWT_SECRET:
    # Generated per process only in dev when unset; production MUST set JWT_SECRET in .env.
    JWT_SECRET = uuid.uuid4().hex + uuid.uuid4().hex
    logger.warning("JWT_SECRET not set — using an ephemeral secret (admin sessions reset on restart)")
JWT_ALGORITHM = "HS256"
ADMIN_JWT_EXPIRE_MINUTES = int(os.environ.get("ADMIN_JWT_EXPIRE_MINUTES", "480"))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def make_admin_token(username: str) -> tuple[str, int]:
    now = now_utc()
    exp = timedelta(minutes=ADMIN_JWT_EXPIRE_MINUTES)
    payload = {"sub": username, "role": "admin", "iat": now, "exp": now + exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM), int(exp.total_seconds())


async def admin_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"require": ["sub", "exp", "iat"]})
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired admin session")
    if payload.get("role") != "admin" or not isinstance(payload.get("sub"), str):
        raise HTTPException(401, "Invalid admin token")
    admin = await db.admins.find_one({"username": payload["sub"], "active": {"$ne": False}}, {"_id": 0, "password_hash": 0})
    if not admin:
        raise HTTPException(401, "Admin not found")
    return admin


async def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    return await admin_from_token(_bearer(authorization, "Missing admin token"))


async def get_settings_doc() -> dict:
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        s = {"id": "default", "price_per_sheet": 90, "gst_percent": 18,
             "min_sheets": 20, "max_sheets": 75, "size": "8x8", "gift_wrap_fee": 150}
        await db.settings.insert_one(dict(s))
    if "gift_wrap_fee" not in s:
        s["gift_wrap_fee"] = 150
        await db.settings.update_one({"id": "default"}, {"$set": {"gift_wrap_fee": 150}})
    if "support_whatsapp" not in s:
        s["support_whatsapp"] = "9999117810"
        await db.settings.update_one({"id": "default"}, {"$set": {"support_whatsapp": "9999117810"}})
    return s
