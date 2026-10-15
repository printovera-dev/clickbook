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
    """Returns {thumbnail, preview, print, width, height} as JPEG bytes.
    Raises ValueError if the file is not a decodable image."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P") and ("transparency" in img.info or img.mode != "P"):
            # Flatten transparency onto white — converting straight to RGB turns transparent pixels black,
            # which showed up as black backgrounds behind admin-uploaded hero/slider PNGs.
            rgba = img.convert("RGBA")
            bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            img = Image.alpha_composite(bg, rgba).convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")
    except Exception as e:
        raise ValueError(f"Not a valid image: {e}")
    w, h = img.size
    # Every generated derivative is capped at PRINT_MAX (3000px). Downsample the
    # working copy once before enhancement so full-resolution camera files do not
    # create several huge in-memory copies during each upload. The untouched original
    # is already stored separately in S3 and remains available for future reprocessing.
    img.thumbnail((PRINT_MAX, PRINT_MAX), Image.Resampling.LANCZOS)

    # Gentle non-destructive auto-enhancement for generated previews/print derivatives.
    # The uploaded original remains untouched for the customer.
    enhanced = ImageOps.autocontrast(img, cutoff=0.3)
    enhanced = ImageEnhance.Color(enhanced).enhance(1.03)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.02)
    enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=4))

    return {
        "thumbnail": _encode(enhanced, THUMB_MAX, 80, "WEBP"),
        "preview": _encode(enhanced, PREVIEW_MAX, 85, "WEBP"),
        "print": _encode(enhanced, PRINT_MAX, 92, sharpen=True),  # gentle sharpening for print only
        "width": w,
        "height": h,
    }
