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

## Feature updates (2026-09-11, iteration 4 — bug fix)
- **Fixed "images not uploading" on web preview**: `expo-image-picker` returns `blob:` URIs in browsers and RN's `{uri,name,type}` FormData shim is native-only. `api.uploadPhoto` now uses a real `File`/`Blob` on web (via `asset.file` or `fetch(uri).blob()`) and keeps the native shim on iOS/Android. Errors surface in the UI instead of being swallowed. Also fixed deprecated `ImagePicker.MediaTypeOptions` → `["images"]`, and the auto-generate screen now shows a retry button on failure instead of silently navigating back. Verified end-to-end by testing agent (3 JPGs uploaded through the real picker path on web, 100% pass).

## Feature updates (2026-09-11, iteration 3)
- **Multi-Photo Layouts (3 & 4 photo)**: seeded in DB; auto-generator uses a `[2,1,3,2,4,1,2]` rhythm and gracefully falls back to smaller layouts for short albums. Editor "Layout" tab shows correct thumbnails for all 4 layouts. BookPreview and PDF renderer both handle 1/2/3/4-photo pages.
- **Gift Note Preview**: checkout now shows a live handwritten-style gift-card preview when gift wrap is enabled; note is stored on order (max 160 chars), shown to customer on order tracking and to admin in order detail.
- **Razorpay integration (WebView)**: `POST /payments/razorpay/order`, hosted HTML checkout shell at `/payments/razorpay/checkout/{id}`, `POST /payments/razorpay/verify` with HMAC-SHA256 signature check, `/payments/razorpay/webhook` with signature verification and idempotency. Falls back to mock provider when keys aren't configured. Frontend uses `react-native-webview` (works in Expo Go).
- **WhatsApp OTP live**: provider abstraction (`otp_provider.py`) with aoc-portal HTTP driver; env-configurable (`WHATSAPP_PROVIDER`, `WHATSAPP_API_KEY`, `WHATSAPP_FROM`, `WHATSAPP_TEMPLATE`). When provider fails (e.g. template not yet approved), backend exposes the generated OTP as `dev_hint` so tests aren't blocked; front verify screen surfaces this in a small dev message.
- **Policies mirror (Privacy / Terms / Refund / Shipping)**: `GET /policies` + `GET /policies/{key}`. Content mirrors clickbook.world (Terms + Privacy + Shipping fetched live; Refund/Cancellation composed from Terms). Accessible from the Profile tab and from a legal footer on the checkout screen — this is what Razorpay expects for account activation.
- **Critical fix**: moved `load_dotenv()` above provider imports so env vars are honored on cold start.

## Feature updates (2026-09-11, iteration 5)
- **Razorpay live keys configured** (test-mode key `rzp_test_TaeOBeX1L1gDcd` + secret + webhook secret in `backend/.env`). `GET /payments/config` now reports `provider: razorpay`; real orders are created on Razorpay; forged signatures are rejected (400). Webhook URL for dashboard: `https://clickbook.world/api/payments/razorpay/webhook`.
- **Server-side image derivatives** (`image_processor.py`, Pillow + pillow-heif): every upload stores the untouched original plus EXIF-corrected JPEG derivatives — thumbnail ≤400px (q80, editor grid), preview ≤1200px (q85, 3D book), print ≤3000px (q92, PDF). A 12MP/11.7MB upload → 16KB thumb / 389KB preview / 4.3MB print. Processing runs in a threadpool; invalid files return 400. Photo docs now include `width`, `height`, `derivative_bytes`.
- **Backend refactor**: `server.py` (1050 lines) → thin app assembly + `core.py` (env, db, auth deps, settings) + `seed.py` + `routers/{auth,catalog,albums,orders,payments,admin,files}.py`. Route table verified identical (49 routes). `/api/files` responses carry immutable cache headers.
- Test suites updated for random OTP (`dev_hint`) and live Razorpay mode; 89/89 passing. Note: `test_iteration3_features.py` restarts the backend, run it with `-n 0` separately from the other suites.

## Feature updates (2026-09-18, iteration 9)
- **Production Downloads package** (`backend/production.py`): when an order is paid, the backend renders the frozen design into `STORAGE_BASE/Downloads/<order_no>_<album>/` → `Album.pdf`, `Cover/cover.jpg`, `Print/page_001.jpg…` (2400×2400 px = 8×8 in @ 300 dpi, q95), `manifest.json` (order/client/sheets/address/style). Stored on `order.production_package` (status building/ready/failed). Admin order modal shows the folder, file chips, "Download all (ZIP)" (`GET /admin/orders/{id}/downloads.zip?token=`) and Build/Rebuild (`POST /admin/orders/{id}/pdf`).
- **Notification system** (`routers/notifications.py`): admin composes to one customer or broadcasts to all (types general/offer/correction/status), history with read counts; system auto-notifies on payment confirmation and on every admin status change (process bot message or admin note as body). Customers: Home bell + unread badge, `/notifications` inbox (tap = read + open linked order, mark all read). Admin order modal has "Message customer" (prefilled).
- Tests: `tests/test_iteration9_downloads_notifications.py` (9), frontend E2E iteration_9 all pass.

## Deferred (roadmap)
- Real WhatsApp/SMS provider (playbook-driven), real Razorpay integration, ML-driven auto-layout selection (currently rhythm-based), image cropping/zoom inside placeholders, 3+ photo layouts, Lottie process-bot animations.

## Feature updates (2026-09-11, iteration 6 — 3D preview rebuilt)
- `BookPreview` is now a real two-page open book: leaves pivot around the spine with perspective (front face rotates 0→-90°, back face lands on the left -90°→-180°), drag-to-turn follows the finger with snap/velocity, arrow controls, cast shadows, spine gradient, page-block thickness and a slight book tilt. Faces = cover, pages, (blank filler), back cover.
- Entry points: after auto-generate (`/album/[id]/preview`), Home drafts (opens preview when the album has pages), editor header book icon (`editor-3d-preview`), review screen.

## Feature updates (2026-09-13, iteration 7 — design system overhaul)
- **Album style chooser** (`/create/style`): Elegant / Balanced / Gallery, stored as `album.design_style` + in design versions; generator rhythms per style (`backend/design.py`).
- **Unified design model** (`src/design.ts` ⇄ `backend/design.py`): per-slot non-destructive image transform `{scale, ox, oy, fit}`, text objects `{text,x,y,w,h,font,size,weight,italic,color,align,z}`, cover design `{style, photo_id, image, frame, background, texts}`. Same math renders in `PageCanvas` (editor + 3D preview + final review) and in `pdf_renderer.py` (Pillow, 8×8 in @ 300 dpi, print derivatives, bundled Google fonts).
- **Full-screen page editor** (`/album/[id]/page?index=N|cover`), opened by double-tapping a page/cover in the 3D preview: Adjust Image (drag / pinch / zoom / Fit / Fill / Reset), Change Image, + Add Text (6 fonts, size, bold, italic, align, colour, duplicate, delete, drag, resize handle — glyphs never distorted), Change Layout (Single/Duo/Trio/Quad, keeps photos & crops), Background, Cover Style, Undo/Redo, Save & Preview / Cancel.
- **Cover system**: Signature Full Bleed / Classic Portrait / Editorial Frame (seeded covers with `style`), default cover design created at generation from the first photo + album name.
- **Design lock**: order creation writes an `approved` design version; payment locks the album (`locked`, status `ordered`) → design edits return 409; PDF renders from the frozen `album_snapshot`.
- **Admin**: `POST /admin/images` upload; Admin → Covers has Upload/Replace image.
- **Expo Go upload fix**: FormData now uses `expo-file-system` `File` (SDK 57 fetch rejects `{uri}` parts).
- **Razorpay LIVE keys** configured (`rzp_live_TbRScBYEKSdUbH`). Webhook secret unchanged (user supplied a URL instead of a secret).
- **Production deployment package**: `backend/Dockerfile`, `backend/deploy/` (docker-compose: mongo + gunicorn/uvicorn API + nginx TLS + certbot, systemd unit, `deploy.sh install|update|logs|status|backup`, README).
- Not yet: drag-to-reorder pages (still move up/down), snapping guides, admin upload UI for backgrounds/bots (endpoint exists), italic in PDF (rendered upright).

## Feature updates (2026-09-13, iteration 8)
- **Cover photo picker** on the Choose Style screen (thumbnails; `generate` accepts `cover_photo_id`, validated against the album).
- **Admin image uploads**: Admin → Process Bots has Upload/Replace/Remove image (`image_url`); customers see the image in the active stage bubble on order tracking. Covers already had upload.
- **Drag-to-reorder pages** (`PageOrderList`): hold the ≡ handle and drag; commits through the editor's undo/redo history; page numbers update live.
- **Snap guides** in the page editor: text boxes snap to page centre, 5 % margins and other text objects' edges/centres with a terracotta guide line while dragging.
