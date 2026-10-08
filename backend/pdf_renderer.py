"""Print-ready PDF renderer (8x8 in @ 300 dpi) built from the saved design model — same crop/offset
math and text model as the app's PageCanvas. Uses print-resolution derivatives, never the preview."""
import gc
import io
from pathlib import Path
from typing import Optional
from PIL import Image, ImageDraw, ImageFont, ImageColor

from design import DEFAULT_POSITIONS, FONT_FILES, default_transform, image_draw_rect
from storage_manager import get_file_bytes

DPI = 300
PAGE_PX = 8 * DPI
FONT_DIR = Path(__file__).parent / "fonts"


def _font(font_key: str, weight: str, px: int) -> ImageFont.FreeTypeFont:
    fam = FONT_FILES.get(font_key, "Lora")
    w = "Bold" if weight == "bold" else "Regular"
    try:
        return ImageFont.truetype(str(FONT_DIR / f"{fam}-{w}.ttf"), max(8, int(px)))
    except OSError:
        return ImageFont.load_default(size=max(8, int(px)))


def _color(c: Optional[str], fallback="#1C1917"):
    try:
        return ImageColor.getrgb(c or fallback)
    except ValueError:
        return ImageColor.getrgb(fallback)


def _open_photo(photo: dict, tr: Optional[dict] = None) -> Optional[Image.Image]:
    data = get_file_bytes(photo.get("print_path") or "") or get_file_bytes(photo.get("original_path") or "")
    if not data:
        return None
    img = Image.open(io.BytesIO(data)).convert("RGB")
    rot = int((tr or {}).get("rotate", 0) or 0) % 360
    if rot:  # same 90° steps as the app's rotate tool
        img = img.rotate(-rot, expand=True)
    return img


def _load_last_page(size_px: int, last_page_bytes: Optional[bytes]) -> Image.Image:
    """Fixed closing page for every ClickBook (branding page, admin-replaceable via Home CMS)."""
    canvas = Image.new("RGB", (size_px, size_px), (255, 255, 255))
    if not last_page_bytes:
        return canvas
    try:
        img = Image.open(io.BytesIO(last_page_bytes)).convert("RGB")
    except Exception:  # noqa: BLE001
        return canvas
    r = min(size_px / img.width, size_px / img.height)
    w, h = max(1, int(img.width * r)), max(1, int(img.height * r))
    canvas.paste(img.resize((w, h), Image.LANCZOS), ((size_px - w) // 2, (size_px - h) // 2))
    return canvas


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int):
    lines = []
    for para in (text or "").split("\n"):
        words = para.split(" ")
        cur = ""
        for w in words:
            trial = (cur + " " + w).strip()
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def draw_texts(canvas: Image.Image, texts: list, size_px: int):
    draw = ImageDraw.Draw(canvas)
    for t in sorted(texts or [], key=lambda x: x.get("z", 0)):
        if not (t.get("text") or "").strip():
            continue
        x, y = int(t.get("x", 0.1) * size_px), int(t.get("y", 0.1) * size_px)
        w, h = int(t.get("w", 0.8) * size_px), int(t.get("h", 0.2) * size_px)
        px = float(t.get("size", 0.05)) * size_px
        font = _font(t.get("font", "lora"), t.get("weight", "regular"), px)
        lines = _wrap(draw, t["text"], font, w)
        line_h = px * 1.25
        align = t.get("align", "left")
        color = _color(t.get("color"))
        for i, line in enumerate(lines):
            ly = y + i * line_h
            if ly + line_h > y + h + line_h:  # allow slight overflow of the last line only
                break
            lw = draw.textlength(line, font=font)
            lx = x if align == "left" else x + (w - lw) / 2 if align == "center" else x + w - lw
            draw.text((lx, ly), line, font=font, fill=color)


def render_page(page: dict, photos_by_id: dict, layouts_by_id: dict, size_px: int = PAGE_PX) -> Image.Image:
    canvas = Image.new("RGB", (size_px, size_px), _color(page.get("background"), "#FFFFFF"))
    photo_ids = page.get("photo_ids", [])
    layout = layouts_by_id.get(page.get("layout_id"))
    positions = (layout or {}).get("positions") or DEFAULT_POSITIONS.get(len(photo_ids)) or DEFAULT_POSITIONS[1]
    images = page.get("images") or {}
    for i, pid in enumerate(photo_ids[: len(positions)]):
        photo = photos_by_id.get(pid)
        if not photo:
            continue
        pos = positions[i]
        sx, sy = int(pos["x"] * size_px), int(pos["y"] * size_px)
        sw, sh = max(1, int(pos["w"] * size_px)), max(1, int(pos["h"] * size_px))
        tr = images.get(str(i)) or default_transform()
        img = _open_photo(photo, tr)
        if img is None:
            continue
        dx, dy, dw, dh = image_draw_rect(sw, sh, img.width, img.height, tr)
        scaled = img.resize((max(1, int(dw)), max(1, int(dh))), Image.LANCZOS)
        slot = Image.new("RGB", (sw, sh), _color(page.get("background"), "#FFFFFF"))
        slot.paste(scaled, (int(dx), int(dy)))
        canvas.paste(slot, (sx, sy))
    draw_texts(canvas, page.get("texts") or [], size_px)
    # legacy single caption
    if page.get("text") and not page.get("texts"):
        draw_texts(canvas, [{"text": page["text"], "x": 0.06, "y": 0.9, "w": 0.88, "h": 0.08, "size": 0.035,
                             "font": "playfair", "align": "left"}], size_px)
    return canvas


def render_cover(album: dict, photos_by_id: dict, size_px: int = PAGE_PX) -> Image.Image:
    """Cover: uses album.cover_design when present (photo + transform + texts), else brand fallback."""
    cd = album.get("cover_design") or {}
    canvas = Image.new("RGB", (size_px, size_px), _color(cd.get("background"), "#C56A47"))
    photo = photos_by_id.get(cd.get("photo_id"))
    if photo:
        img = _open_photo(photo, cd.get("image"))
        if img is not None:
            frame = cd.get("frame") or {"x": 0, "y": 0, "w": 1, "h": 1}
            sx, sy = int(frame["x"] * size_px), int(frame["y"] * size_px)
            sw, sh = max(1, int(frame["w"] * size_px)), max(1, int(frame["h"] * size_px))
            dx, dy, dw, dh = image_draw_rect(sw, sh, img.width, img.height, cd.get("image") or default_transform())
            slot = Image.new("RGB", (sw, sh), _color(cd.get("background"), "#C56A47"))
            slot.paste(img.resize((max(1, int(dw)), max(1, int(dh))), Image.LANCZOS), (int(dx), int(dy)))
            canvas.paste(slot, (sx, sy))
    texts = cd.get("texts")
    if texts is None:
        texts = [{"text": "ClickBook", "x": 0.08, "y": 0.78, "w": 0.84, "h": 0.05, "size": 0.03, "font": "inter",
                  "color": "#FFFFFF"},
                 {"text": album.get("name", "My Album"), "x": 0.08, "y": 0.83, "w": 0.84, "h": 0.1, "size": 0.06,
                  "font": "playfair", "color": "#FFFFFF"}]
    draw_texts(canvas, texts, size_px)
    return canvas


def render_frames(album: dict, layouts_by_id: dict, back_cover_bytes: Optional[bytes] = None):
    """Returns (cover_image, [page_images], back_cover_image) at 8x8 in @ 300 dpi.
    The back cover is the fixed ClickBook branding artwork (admin-replaceable)."""
    photos_by_id = {p["id"]: p for p in album.get("photos", [])}
    pages_sorted = sorted(album.get("pages", []), key=lambda p: p.get("order", 0))
    cover = render_cover(album, photos_by_id)
    pages = [render_page(p, photos_by_id, layouts_by_id) for p in pages_sorted]
    back = _load_last_page(PAGE_PX, back_cover_bytes)
    return cover, pages, back


def frames_to_pdf(cover: Image.Image, pages: list) -> bytes:
    buf = io.BytesIO()
    cover.save(buf, "PDF", save_all=True, append_images=pages, resolution=DPI, quality=92)
    return buf.getvalue()


def frame_to_jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0)
    return buf.getvalue()


def _jpeg_size(data: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(data)) as im:
        return im.size


def jpegs_to_pdf(jpegs: list, page_in: float = 8.0) -> bytes:
    """Low-memory PDF writer: embeds the already-encoded JPEG pages as DCTDecode image XObjects, one 8×8 in page
    each, without decoding them again. Pillow's PDF writer needs every decoded frame in RAM at once (≈17 MB/page →
    ~1 GB for a 40-page album), which exceeded the production container's memory and killed the worker."""
    pt = page_in * 72
    objs: list = []  # list of bytes bodies; object number = index + 1

    def add(body: bytes) -> int:
        objs.append(body)
        return len(objs)

    page_refs: list = []
    pages_obj_no = 2  # reserved: 1 = catalog, 2 = pages
    add(b"")  # placeholder catalog
    add(b"")  # placeholder pages
    for data in jpegs:
        w, h = _jpeg_size(data)
        img_no = add(b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 "
                     b"/Filter /DCTDecode /Length %d >>\nstream\n" % (w, h, len(data)) + data + b"\nendstream")
        content = b"q %.2f 0 0 %.2f 0 0 cm /Im0 Do Q" % (pt, pt)
        content_no = add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        page_no = add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /XObject << /Im0 %d 0 R >> >> "
                      b"/Contents %d 0 R >>" % (pages_obj_no, pt, pt, img_no, content_no))
        page_refs.append(page_no)
    objs[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objs[1] = b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % n for n in page_refs) + b"] /Count %d >>" % len(page_refs)

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref))
    return out.getvalue()


def render_album_pdf(album: dict, layouts_by_id: dict, back_cover_bytes: Optional[bytes] = None) -> bytes:
    return render_production_package(album, layouts_by_id, back_cover_bytes)["pdf"]


def render_production_package(album: dict, layouts_by_id: dict, back_cover_bytes: Optional[bytes] = None) -> dict:
    """Everything the print facility needs: Album.pdf (front cover, pages, back cover) + full-res cover JPEGs
    (Cover/cover.jpg + Cover/back_cover.jpg) + sequential inner page JPEGs.
    Streams page by page: each frame is encoded to JPEG and released before the next one is rendered."""
    photos_by_id = {p["id"]: p for p in album.get("photos", [])}
    pages_sorted = sorted(album.get("pages", []), key=lambda p: p.get("order", 0))

    cover_jpg = frame_to_jpeg(render_cover(album, photos_by_id))
    page_jpgs = []
    for p in pages_sorted:
        frame = render_page(p, photos_by_id, layouts_by_id)
        page_jpgs.append(frame_to_jpeg(frame))
        frame.close()
        del frame
        gc.collect()
    back_jpg = frame_to_jpeg(_load_last_page(PAGE_PX, back_cover_bytes))
    return {
        "pdf": jpegs_to_pdf([cover_jpg, *page_jpgs, back_jpg]),
        "cover": cover_jpg,
        "back_cover": back_jpg,
        "pages": page_jpgs,
    }
