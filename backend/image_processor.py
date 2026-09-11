"""Server-side image derivatives: thumbnail (editor grid), preview (3D book), print (hi-res).

All derivatives are EXIF-orientation corrected, converted to RGB JPEG. HEIC is decoded via pillow-heif.
"""
import io
import logging
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:  # pragma: no cover
    pass

logger = logging.getLogger(__name__)

THUMB_MAX = 400      # editor grid / photo strip
PREVIEW_MAX = 1200   # 3D book preview
PRINT_MAX = 3000     # 8x8" @ ~300dpi + bleed


def _encode(img: Image.Image, max_side: int, quality: int) -> bytes:
    out = img.copy()
    out.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def make_derivatives(data: bytes) -> dict:
    """Returns {thumbnail, preview, print, width, height} as JPEG bytes.
    Raises ValueError if the file is not a decodable image."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif img.mode == "L":
            img = img.convert("RGB")
    except Exception as e:
        raise ValueError(f"Not a valid image: {e}")
    w, h = img.size
    return {
        "thumbnail": _encode(img, THUMB_MAX, 80),
        "preview": _encode(img, PREVIEW_MAX, 85),
        "print": _encode(img, PRINT_MAX, 92),
        "width": w,
        "height": h,
    }
