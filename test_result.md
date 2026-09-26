#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 5 (main agent, 2026-09-11)
- Razorpay test-mode keys configured in backend/.env (provider now "razorpay", not mock).
- Server-side image derivatives via Pillow (image_processor.py): thumbnail 400px / preview 1200px / print 3000px JPEGs; original kept untouched.
- server.py split into core.py + seed.py + routers/{auth,catalog,albums,orders,payments,admin,files}.py. Route table identical (49 routes).
- Backend suites: 89/89 passing (test_iteration3_features.py must run with -n 0, it restarts the backend).
- Frontend unchanged; needs regression pass of upload -> generate -> preview -> editor -> checkout (Razorpay WebView opens).
- Fix after iteration_5 report: razorpay-checkout.tsx now loads Razorpay Standard Checkout JS directly on web (Platform.OS==="web"), native keeps WebView; start() moved to useEffect([visible]) to stop double order creation.

## Iteration 7 (main agent, 2026-09-13) — design system overhaul
- Backend: design.py (model + styles + cover styles), pdf_renderer.py (Pillow 8x8in@300dpi from design model, fonts in backend/fonts), albums: POST /albums/{id}/generate accepts {style}, PUT /albums/{id} (name/design_style/cover_design), 409 when album locked (after payment). Orders: design_versions kind "approved" on order creation; album locked on payment. Admin: POST /admin/images upload; covers have `style`. Seed: 3 cover styles (Signature Full Bleed / Classic Portrait / Editorial Frame).
- Frontend: create/style.tsx (Elegant/Balanced/Gallery), src/design.ts, src/components/page-canvas.tsx, app/album/[id]/page.tsx (full-screen page/cover editor: Adjust Image pan/pinch/zoom/fit/fill/reset, Change Image, + Add Text with fonts/size/bold/italic/align/color/dup/delete/drag/resize, Change Layout, Background, Cover Style, Undo/Redo, Save & Preview/Cancel). BookPreview double-tap opens page editor; cover renders cover_design. Fonts via expo-font (assets/fonts).
- Expo Go upload fix: expo-file-system File in FormData.
- Razorpay LIVE keys set. Deployment package in backend/deploy (+ Dockerfile, README).
- Backend suites 70/70 (+19 in iteration3 suite run serially).

## Iteration 8 (main agent) — cover photo picker, admin bot image upload, drag reorder, snap guides
- create/style.tsx: cover photo thumbnails (testID cover-photo-{id}) -> generate {style, cover_photo_id}.
- admin/bots.tsx: Upload/Replace/Remove image (bot-upload-image), BotUpdate.image_url; order tracking shows bot image.
- src/components/page-order-list.tsx: drag handle page-{i}-drag (long-press 120ms then drag vertically), rows page-row-{i}; commits via existing editor history (undo/redo).
- page.tsx: snap guides while dragging text (centre 0.5, margins 0.05/0.95, other text edges/centres), guide lines rendered.

## Iteration 9 (main agent) — production Downloads package + notification system
- Backend: production.py builds Downloads/<order_no>_<album>/ {Album.pdf, Cover/cover.jpg, Print/page_NNN.jpg (2400x2400 @300dpi), manifest.json} automatically when an order is paid (mark_order_paid -> asyncio task; order.production_package {status building|ready|failed, dir, pdf_url, cover_url, print_urls, pages, size_bytes}). Admin: POST /admin/orders/{id}/pdf rebuilds package synchronously; GET /admin/orders/{id}/downloads lists files; GET /admin/orders/{id}/downloads.zip?token=<admin token> zips folder.
- routers/notifications.py: GET /notifications (+unread_count), POST /notifications/{id}/read, POST /notifications/read-all; admin POST /admin/notifications {title, body, type general|offer|correction|status|order, customer_id (null = broadcast fan-out), order_id}, GET /admin/notifications (history, broadcasts collapsed). System notifications: payment confirmed (type order) and every admin status change (type status, body = process bot message or note).
- Frontend: home bell + unread badge (home-notifications-bell / home-notifications-badge) -> /notifications (notification-{id}, tap marks read + opens linked order; notifications-read-all). Admin dashboard -> Notifications (admin-nav-notifications) compose screen (notify-target-all / notify-target-one + customer picker customer-pick-{id}, notify-type-*, notify-title, notify-body, notify-send, notify-result) + history. Admin order modal: "Message customer" (admin-notify-customer) prefilled compose, "Production files" card (admin-production-package, admin-file-pdf/cover/print, admin-download-zip, admin-generate-pdf = build/rebuild).
- Backend test suite tests/test_iteration9_downloads_notifications.py 9/9 passing (run with -n 0 — admin login rotates the token).

## Iteration 10 (main agent) — large catalog / Expo Go memory fix
- ROOT CAUSE of the ~30-photo crash: expo-image-picker was called with `quality: 0.85` + `allowsMultipleSelection` (+ `selectionLimit: 30`). quality<1 forces the picker to decode AND re-encode every selected asset in memory before returning (≈48 MB per 12 MP frame) → Expo Go is jetsam/OOM-killed at ~30 selections. Fixed in create/upload.tsx and album/[id]/page.tsx: quality 1, exif/base64 false, preferredAssetRepresentationMode Current, no selection limit. Uploads stay sequential (one body in memory), grid updates optimistically, progress "Uploading X of N" (testID upload-progress).
- Virtualization: upload grid → FlatList numColumns=3 (upload-photo-grid); editor Photos tab → FlatList (editor-photos-list); Choose Cover → FlatList + useInfiniteQuery (cover-list, GET /covers?offset&limit, next_offset); Choose Style cover strip + page editor Change Image strip → horizontal FlatList; My Books → FlatList. New src/components/thumb.tsx (recyclingKey, memory-disk cache, allowDownscaling). PageCanvas picks thumbnail_url for renders ≤130pt, preview_url otherwise; originals never loaded by the app.
- Backend: thumbnail (400px) + preview (1200px) derivatives are now WebP (print stays JPEG for PDF); /api/files serves correct content-type via mimetypes. Catalog endpoints paginated: GET /covers|/layouts|/backgrounds?offset=&limit= → {items, total, offset, limit, next_offset}; assets enriched with thumbnail_url (admin uploads → stored 400px derivative). Album cover_snapshot includes thumbnail_url.
- Stress fixture: customer mobile 9876500777 has album 09fdba3e1551453ca11fd0b9b881dae1 with 120 photos / 80 pages ("Stress 120"). Backend suites 89/89.

## Iteration 11 (main agent) — CMS-driven Home Page
- Assets: all 15 images pulled from the user's Google Drive CLICKBOOKHOME folder into backend/storage/home (sl1-1..4, sl2-1..3 [only 3 exist], sl3-1..3, hero-1..4, logo) → served at /api/files/home/*. FAQ / Refund / Shipping docx content imported into policies (keys faq, refund, shipping).
- Backend routers/home.py: GET /home (public) → {content:{sliders{slider1..3{slides[{id,image_url,title,subtitle,cta_label,cta_route,active,order}]}}, heroes[key pricing|steps|privacy|final], videos[url,title,description], steps, texts, logo_url}, pricing:{min_sheets, price_per_sheet, gst_percent, base_price}}; GET/PUT /admin/home (whole-doc update, admin); POST /admin/home/reset. Only active items returned publicly. Images uploaded through existing POST /admin/images.
- Frontend: app/(tabs)/home.tsx rewritten (public landing, sections rendered via FlatList for lazy mounting): splash logo (home-splash) → header (home-menu hamburger, logo, bell) → Slider 1 (home-slider1, auto 4.5s, swipe, dots home-slider1-dots) → inline login (home-login1-mobile / home-login1-continue → existing /verify OTP flow; when signed in shows home-login1-start CTA → /create/cover) → pricing (home-pricing, home-base-price uses backend settings) → 5 steps (home-steps, home-step-1..5) → Why ClickBook 16:9 video cards (video-play-{id} opens embedded player, video-close) → Slider 2 → privacy (home-privacy, home-privacy-link → /policy/privacy) → login2 → Slider 3 → final hero → login3 → footer (footer-faq/privacy/terms/refund/shipping). Signed-in users also get "Your ClickBooks" (drafts + active order, home-see-all-albums → /(tabs)/albums).
- Side menu (side-menu, menu-home/menu-faq/menu-refund-cancellation/menu-shipping-delivery/menu-terms-conditions, menu-close). Tabs now Home | Chat (notifications inbox, guarded) | Orders | Profile; albums tab hidden (href null) but reachable; guests tapping guarded tabs are sent to /login. app/index.tsx always → /(tabs)/home.
- Admin → Home Page (admin-nav-home → /admin/home): tabs admin-home-tab-slider1..3/heroes/videos; per slide replace image (admin-slide-replace-{id}), reorder, delete, enable switch, title/subtitle/CTA/destination; add slide (admin-slide-add); heroes replace; videos add/edit/remove; admin-home-save → PUT /admin/home. Changes appear in app on next fetch (no rebuild).
- Backend tests: tests/test_iteration11_home_cms.py 4/4.

## Iteration 12 (main agent) — bug-fix batch
- Fixed duplicate Home mount after OTP: verify.tsx now `router.dismissTo("/(tabs)/home")` (pops back to the existing tabs tree); home.tsx re-reads token on focus (useFocusEffect); tab guard re-reads token at tap time.
- Logo 2× (264×88 contain) in home header.
- Chat tab (app/(tabs)/chat.tsx): WhatsApp support to settings.support_whatsapp (9999117810, admin-editable via PUT /admin/settings). 0 orders → chat-whatsapp-general; exactly 1 order → auto-opens wa.me with "Hello ClickBook, I have a question regarding Order #<order_no>." (+ chat-whatsapp-single button); >1 orders → chat-pick-order list (chat-order-{id}) then opens WhatsApp with selected order. Also chat-messages → in-app inbox.
- Payment-only lock (server): _ensure_locked now guards pages/update/generate/upload/delete-photo with message "This album has been locked because payment has been completed. Further editing is not available." (409). Order creation does NOT lock; only mark_order_paid (Razorpay verify/webhook or mock pay) sets locked=true. Frontend: preview shows preview-locked-banner + preview-view-orders, hides edit buttons; editor/page editor redirect to preview when album.locked.
- Album lifecycle fields (GET /albums, /albums/{id}, create/generate/pages responses): state creating|uploading|draft|locked|delivered, is_complete (pages + cover_design exist), cover_thumbnail_url / cover_preview_url (actual designed front-cover photo). My ClickBooks lists complete albums first; incomplete ones labelled "incomplete · continue" (opens upload). Home drafts only show complete drafts. Orders cards show front-cover thumb (order-thumb-{id}); orders store cover_thumbnail_url.
- Single tap on a page/cover in 3D preview opens the page editor (double-tap no longer required); page editor title "Edit Page X of N" (page-editor-title); editor tab "photos" labelled "Swap Images".
- Upload: duplicate detection (same fileName+fileSize vs selection and already-uploaded) → confirm "Duplicate images found… skip?" (Skip duplicates / Keep all); pending tiles rendered as non-interactive spinners (pointerEvents none) until the server confirms the photo → tapping while uploading is a no-op.
- Backend: tests/test_iteration12_payment_lock.py 4/4; full regression 93/93.
