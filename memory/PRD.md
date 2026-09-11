# ClickBook — Product Requirements Document

## Overview
ClickBook is a premium photo-album service that lets customers create beautifully printed 8×8 inch photobooks in ~60 seconds — upload, auto-design, edit, review in 3D, order, and track. This is the React Native (Expo) + FastAPI mobile MVP built on the ClickBook.world brand.

## MVP Scope (Delivered)
### Customer flow
- Mobile-first login with mock **WhatsApp OTP** (`123456`) — provider abstraction ready to plug WhatsApp/SMS.
- Home dashboard with hero CTA, drafts, active order, and public offers.
- Create flow: Choose cover (3 options) → Upload photos (gallery, multi-select) → Auto-generate album → 3D page-flip preview.
- Editor: change background color, layout (1-photo / 2-photo), page order (move / delete), text captions, undo/redo — live preview updates immediately.
- Final review with "I have reviewed my ClickBook" gate.
- Checkout: coupon apply, delivery address, transparent price breakdown (₹90/sheet + 18% GST, server-side recalculated).
- Mock "Pay Now" flow that creates a real order and freezes the design version.
- Order tracking with 5-stage timeline (Processing → Printing → Packaging → Out for Delivery → Delivered) and editable **process bot** messages per stage.

### Admin console (in-app, admin/clickbook@2026)
- Dashboard KPIs (orders, revenue, customers, drafts, by-status).
- Orders: filter by status, update production status, add tracking number + note, **generate print PDF** (8×8″).
- Covers CRUD, Offers CRUD (percentage/fixed, min order, max cap, end date, active), Pricing settings, Process Bots message editor, Customers list.

### Backend
- FastAPI + MongoDB, all routes under `/api/*`.
- **VPS-style local storage** at `/app/backend/storage/clickbook/customers/{cid}/albums/{aid}/{originals,thumbnails,previews,print,pdf}/`, served via `/api/files/{path}`. Base path via `STORAGE_BASE` env.
- Design versioning (every generate/edit creates a version snapshot).
- Server-side price calc (never trusted from client), customer isolation (can't access others' albums).
- Seeded: 3 covers, 2 layouts, 6 backgrounds, 3 coupons (WELCOME2026 / COUPLE20 / FLAT200), 5 process bots, admin account, pricing settings.
- Backend regression suite: **47/47 tests passing**.

## Design language
- "Editorial Mobile LIGHT" — ivory `#FAFAF8`, charcoal `#1C1917`, terracotta `#C56A47`, serif display + system sans body. Photography-first, magazine-like spacing, 1px borders (no shadows).

## Tech
- Frontend: Expo Router, React Query, Reanimated (page flip), Gesture Handler, expo-image-picker, expo-image, expo-linear-gradient, `@react-native-vector-icons/feather`.
- Backend: FastAPI, motor (MongoDB), reportlab (PDF), pillow.

## Feature updates (2026-09-11, iteration 2)
- **Photo rearrangement in editor**: new "Photos" tool tab — tap a photo slot to select, tap any other slot (same or different page) to swap; swaps persist via `PUT /albums/{id}/pages`.
- **Gift wrap add-on**: `gift_wrap_fee` in settings (₹150 default), toggle card on checkout, server-side price calc adds fee before GST, order stores `gift_wrap` flag, gift wrap line shown in checkout/order summary/admin orders, editable in Admin → Pricing.
- **Storage abstraction upgrade**: `STORAGE_DRIVER` env — `local` (VPS-style, default) or `s3` (Emergent Object Storage / any S3-compatible bucket, set `S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET`/`S3_ENDPOINT`).

## Feature updates (2026-09-11, iteration 3)
- **Multi-Photo Layouts (3 & 4 photo)**: seeded in DB; auto-generator uses a `[2,1,3,2,4,1,2]` rhythm and gracefully falls back to smaller layouts for short albums. Editor "Layout" tab shows correct thumbnails for all 4 layouts. BookPreview and PDF renderer both handle 1/2/3/4-photo pages.
- **Gift Note Preview**: checkout now shows a live handwritten-style gift-card preview when gift wrap is enabled; note is stored on order (max 160 chars), shown to customer on order tracking and to admin in order detail.
- **Razorpay integration (WebView)**: `POST /payments/razorpay/order`, hosted HTML checkout shell at `/payments/razorpay/checkout/{id}`, `POST /payments/razorpay/verify` with HMAC-SHA256 signature check, `/payments/razorpay/webhook` with signature verification and idempotency. Falls back to mock provider when keys aren't configured. Frontend uses `react-native-webview` (works in Expo Go).
- **WhatsApp OTP live**: provider abstraction (`otp_provider.py`) with aoc-portal HTTP driver; env-configurable (`WHATSAPP_PROVIDER`, `WHATSAPP_API_KEY`, `WHATSAPP_FROM`, `WHATSAPP_TEMPLATE`). When provider fails (e.g. template not yet approved), backend exposes the generated OTP as `dev_hint` so tests aren't blocked; front verify screen surfaces this in a small dev message.
- **Policies mirror (Privacy / Terms / Refund / Shipping)**: `GET /policies` + `GET /policies/{key}`. Content mirrors clickbook.world (Terms + Privacy + Shipping fetched live; Refund/Cancellation composed from Terms). Accessible from the Profile tab and from a legal footer on the checkout screen — this is what Razorpay expects for account activation.
- **Critical fix**: moved `load_dotenv()` above provider imports so env vars are honored on cold start.

## Deferred (roadmap)
- Real WhatsApp/SMS provider (playbook-driven), real Razorpay integration, ML-driven auto-layout selection (currently rhythm-based), image cropping/zoom inside placeholders, 3+ photo layouts, print-resolution image processing (currently the same file is copied to preview/print — swap in Pillow resize when needed), Lottie process-bot animations.
