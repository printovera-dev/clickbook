"""Server-side image derivatives: thumbnail (editor grid), preview (3D book), print (hi-res).

All derivatives are EXIF-orientation corrected, converted to RGB JPEG. HEIC is decoded via pillow-heif.
"""
import io
import logging
from PIL import Image, ImageOps, ImageFilter, ImageEnhance

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:  # pragma: no cover
    pass

logger = logging.getLogger(__name__)

THUMB_MAX = 400      # editor grid / photo strip
PREVIEW_MAX = 1200   # 3D book preview
PRINT_MAX = 3000     # 8x8" @ ~300dpi + bleed


def _encode(img: Image.Image, max_side: int, quality: int, fmt: str = "JPEG", sharpen: bool = False) -> bytes:
    out = img.copy()
    out.thumbnail((max_side, max_side), Image.LANCZOS)
    if sharpen:
        # Gentle output sharpening improves print crispness; it cannot restore detail
        # from a genuinely out-of-focus source.
        out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
    buf = io.BytesIO()
    if fmt == "WEBP":
        # ~30% smaller than JPEG at equal quality; decoded natively by expo-image on iOS/Android/web.
        out.save(buf, "WEBP", quality=quality, method=4)
    else:
        out.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def make_derivatives(data: bytes) -> dict:
    """Returns alpha-preserving WebP thumbnail/preview and an opaque JPEG print file."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        rgba = img.convert("RGBA")
        alpha = rgba.getchannel("A")
        rgb = Image.new("RGB", rgba.size, (255, 255, 255))
        rgb.paste(rgba, mask=alpha)
    except Exception as e:
        raise ValueError(f"Not a valid image: {e}")

    w, h = img.size
    rgb.thumbnail((PRINT_MAX, PRINT_MAX), Image.Resampling.LANCZOS)
    alpha = alpha.resize(rgb.size, Image.Resampling.LANCZOS)

    enhanced = ImageOps.autocontrast(rgb, cutoff=0.3)
    enhanced = ImageEnhance.Color(enhanced).enhance(1.03)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.02)
    enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=4))

    # Preserve the source alpha channel for browser/editor assets.
    preview_rgba = enhanced.copy()
    preview_rgba.putalpha(alpha)
    thumb = preview_rgba.copy()
    thumb.thumbnail((THUMB_MAX, THUMB_MAX), Image.Resampling.LANCZOS)
    preview = preview_rgba.copy()
    preview.thumbnail((PREVIEW_MAX, PREVIEW_MAX), Image.Resampling.LANCZOS)

    return {
        "thumbnail": _encode(thumb, THUMB_MAX, 80, "WEBP"),
        "preview": _encode(preview, PREVIEW_MAX, 85, "WEBP"),
        "print": _encode(enhanced, PRINT_MAX, 92, sharpen=True),
        "width": w,
        "height": h,
    }
