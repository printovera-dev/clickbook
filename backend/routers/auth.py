from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import secrets

from core import db, now_utc, now_iso, new_id, get_current_customer
from otp_provider import send_otp as provider_send_otp, generate_otp

router = APIRouter(tags=["auth"])


class OTPRequest(BaseModel):
    mobile: str
    channel: str = "whatsapp"  # whatsapp | sms


class OTPVerify(BaseModel):
    mobile: str
    otp: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


@router.post("/auth/otp/send")
async def send_otp(payload: OTPRequest):
    if not payload.mobile or len(payload.mobile) < 8:
        raise HTTPException(400, "Invalid mobile")
    otp = generate_otp()
    result = await provider_send_otp(payload.mobile, otp, payload.channel)
    await db.otps.update_one(
        {"mobile": payload.mobile},
        {"$set": {"mobile": payload.mobile, "otp": otp, "channel": payload.channel,
                  "created_at": now_iso(),
                  "expires_at": (now_utc() + timedelta(minutes=10)).isoformat()}},
        upsert=True,
    )
    resp = {
        "success": bool(result.get("success")),
        "provider": result.get("provider"),
        "message": result.get("message", "OTP sent"),
    }
    # Expose OTP for demo/dev: mock provider, or provider failure (so testers aren't stuck).
    if result.get("provider") == "mock" or not result.get("success"):
        resp["dev_hint"] = otp
    return resp


@router.post("/auth/otp/verify")
async def verify_otp(payload: OTPVerify):
    record = await db.otps.find_one({"mobile": payload.mobile}, {"_id": 0})
    if not record:
        raise HTTPException(400, "OTP not found")
    if record["otp"] != payload.otp:
        raise HTTPException(400, "Invalid OTP")
    if datetime.fromisoformat(record["expires_at"]) < now_utc():
        raise HTTPException(400, "OTP expired")
    customer = await db.customers.find_one({"mobile": payload.mobile}, {"_id": 0})
    if not customer:
        customer = {"id": new_id(), "mobile": payload.mobile, "name": "", "email": "", "created_at": now_iso()}
        await db.customers.insert_one(dict(customer))
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({"token": token, "customer_id": customer["id"], "created_at": now_iso()})
    await db.otps.delete_one({"mobile": payload.mobile})
    return {"token": token, "customer": customer}


@router.get("/me")
async def get_me(customer: dict = Depends(get_current_customer)):
    return {"customer": customer}


@router.put("/me")
async def update_me(payload: ProfileUpdate, customer: dict = Depends(get_current_customer)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.customers.update_one({"id": customer["id"]}, {"$set": update})
    updated = await db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    return {"customer": updated}
