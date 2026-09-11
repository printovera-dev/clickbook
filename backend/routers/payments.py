from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel

from core import db, now_iso, get_current_customer
from routers.orders import mark_order_paid
import razorpay_provider as rzp

router = APIRouter(prefix="/payments", tags=["payments"])


class RazorpayOrderCreate(BaseModel):
    order_id: str  # internal ClickBook order id


class RazorpayVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("/config")
async def payments_config():
    live = rzp.is_configured()
    return {"provider": "razorpay" if live else "mock", "razorpay_key_id": rzp.public_key_id() if live else ""}


@router.post("/razorpay/order")
async def create_razorpay_order(payload: RazorpayOrderCreate, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": payload.order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("payment_status") == "paid":
        raise HTTPException(400, "Order already paid")
    amount_paise = int(round(float(order["price"]["total"]) * 100))
    rp = rzp.create_order(amount_paise, receipt=order["order_no"],
                          notes={"clickbook_order_id": order["id"], "customer_id": customer["id"]})
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"razorpay_order_id": rp["id"], "payment_provider": rp["provider"], "amount_paise": amount_paise,
                  "updated_at": now_iso()}},
    )
    return {
        "razorpay_order_id": rp["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": rzp.public_key_id(),
        "provider": rp["provider"],
        "checkout_url": f"/api/payments/razorpay/checkout/{rp['id']}",
    }


@router.post("/razorpay/verify")
async def verify_razorpay_payment(payload: RazorpayVerify, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"razorpay_order_id": payload.razorpay_order_id,
                                       "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if not rzp.verify_signature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature):
        raise HTTPException(400, "Invalid payment signature")
    await mark_order_paid(order, payload.razorpay_payment_id, "razorpay",
                          {"razorpay_payment_id": payload.razorpay_payment_id,
                           "razorpay_signature": payload.razorpay_signature})
    return {"success": True, "payment_id": payload.razorpay_payment_id, "order_id": order["id"]}


@router.get("/razorpay/checkout/{rzp_order_id}", include_in_schema=False)
async def razorpay_checkout_shell(rzp_order_id: str):
    """HTML shell loaded by the WebView. Exposes only key_id + amount + order_id."""
    order = await db.orders.find_one({"razorpay_order_id": rzp_order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order unavailable")
    amount = int(order.get("amount_paise") or round(float(order["price"]["total"]) * 100))
    key_id = rzp.public_key_id() or "rzp_test_placeholder"
    snap = order.get("customer_snapshot") or {}
    prefill_name = snap.get("name") or ""
    prefill_email = snap.get("email") or ""
    prefill_contact = snap.get("mobile") or ""
    desc = f"Order {order['order_no']}"
    html = f"""<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClickBook Checkout</title>
<style>body{{margin:0;background:#FAFAF8;font-family:-apple-system,system-ui,sans-serif;color:#1C1917;text-align:center;padding:32px}}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body>
<p id="status">Opening secure checkout…</p>
<script>
(function () {{
  function send(v) {{ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(v)); }}
  var options = {{
    key: {key_id!r},
    amount: {amount},
    currency: "INR",
    name: "ClickBook",
    description: {desc!r},
    order_id: {rzp_order_id!r},
    prefill: {{ name: {prefill_name!r}, email: {prefill_email!r}, contact: {prefill_contact!r} }},
    theme: {{ color: "#C56A47" }},
    handler: function (r) {{ send({{type: "success", payload: r}}); }},
    modal: {{ ondismiss: function () {{ send({{type: "dismissed"}}); }} }}
  }};
  var rp = new Razorpay(options);
  rp.on("payment.failed", function (r) {{ send({{type: "failed", payload: r.error || {{}}}}); }});
  rp.open();
}})();
</script></body></html>"""
    return Response(content=html, media_type="text/html")


@router.post("/razorpay/webhook", include_in_schema=False)
async def razorpay_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("x-razorpay-signature", "")
    if not rzp.verify_webhook(raw, sig):
        raise HTTPException(400, "Invalid webhook signature")
    payload = await request.json()
    event = payload.get("event", "")
    entity = ((payload.get("payload") or {}).get("payment") or {}).get("entity") or {}
    rzp_order_id = entity.get("order_id")
    payment_id = entity.get("id")
    if not rzp_order_id:
        return {"received": True}
    order = await db.orders.find_one({"razorpay_order_id": rzp_order_id}, {"_id": 0})
    if not order:
        return {"received": True}
    if event in {"payment.captured", "order.paid"}:
        await mark_order_paid(order, payment_id, "razorpay", {"razorpay_payment_id": payment_id})
    elif event == "payment.failed":
        await db.orders.update_one(
            {"razorpay_order_id": rzp_order_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "failed", "updated_at": now_iso()}},
        )
    return {"received": True}
