from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
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
    address: Optional[Dict[str, Any]] = None  # {name, line1, line2, city, state, pincode, phone}
    gst_no: Optional[str] = None  # optional GSTIN for business invoices


@router.post("/auth/otp/send")
async def send_otp(payload: OTPRequest):
    if not payload.mobile or len(payload.mobile) < 8:
        raise HTTPException(400, "Invalid mobile")

    otp = generate_otp()
    result = await provider_send_otp(payload.mobile, otp, payload.channel)

    # Never persist an OTP or reveal it to the client when the live provider fails.
    if not result.get("success"):
        raise HTTPException(502, "Unable to send OTP right now. Please try again later.")

    await db.otps.update_one(
        {"mobile": payload.mobile},
        {"$set": {"mobile": payload.mobile, "otp": otp, "channel": payload.channel,
                  "created_at": now_iso(),
                  "expires_at": (now_utc() + timedelta(minutes=10)).isoformat()}},
        upsert=True,
    )
    resp = {
        "success": True,
        "provider": result.get("provider"),
        "message": result.get("message", "OTP sent"),
    }
    # Demo hint is intentionally available only when explicitly running mock mode.
    if result.get("provider") == "mock":
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
    # Customers who ordered before saving an address see their most recent delivery address in Profile.
    if not customer.get("address"):
        last = await db.orders.find_one({"customer_id": customer["id"], "address": {"$ne": None}},
                                        {"_id": 0, "address": 1}, sort=[("created_at", -1)])
        if last and last.get("address"):
            customer = {**customer, "address": last["address"], "address_from_order": True}
    return {"customer": customer}


@router.put("/me")
async def update_me(payload: ProfileUpdate, customer: dict = Depends(get_current_customer)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.customers.update_one({"id": customer["id"]}, {"$set": update})
    updated = await db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    return {"customer": updated}
