"""Print-ready PDF renderer (8x8 in @ 300 dpi) built from the saved design model — same crop/offset
math and text model as the app's PageCanvas. Uses print-resolution derivatives, never the preview."""
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


def _open_photo(photo: dict) -> Optional[Image.Image]:
    data = get_file_bytes(photo.get("print_path") or "") or get_file_bytes(photo.get("original_path") or "")
    if not data:
        return None
    img = Image.open(io.BytesIO(data))
    return img.convert("RGB")


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
        img = _open_photo(photo)
        if img is None:
            continue
        pos = positions[i]
        sx, sy = int(pos["x"] * size_px), int(pos["y"] * size_px)
        sw, sh = max(1, int(pos["w"] * size_px)), max(1, int(pos["h"] * size_px))
        tr = images.get(str(i)) or default_transform()
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
        img = _open_photo(photo)
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


def render_album_pdf(album: dict, layouts_by_id: dict) -> bytes:
    photos_by_id = {p["id"]: p for p in album.get("photos", [])}
    pages_sorted = sorted(album.get("pages", []), key=lambda p: p.get("order", 0))
    frames = [render_cover(album, photos_by_id)]
    frames += [render_page(p, photos_by_id, layouts_by_id) for p in pages_sorted]
    buf = io.BytesIO()
    frames[0].save(buf, "PDF", save_all=True, append_images=frames[1:], resolution=DPI, quality=92)
    return buf.getvalue()
