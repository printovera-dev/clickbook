"""Regression tests for legacy and Wedding Album print dimensions."""
import io

from PIL import Image

from pdf_renderer import jpegs_to_pdf, page_dimensions, pixel_dimensions


def _tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (3, 2), (255, 255, 255)).save(buf, "JPEG")
    return buf.getvalue()


def test_legacy_album_stays_eight_square():
    album = {}
    assert page_dimensions(album) == (8.0, 8.0)
    assert pixel_dimensions(album) == (2400, 2400)


def test_twelve_by_eighteen_is_300_dpi():
    album = {"album_config": {"size": "12x18"}}
    assert page_dimensions(album) == (12.0, 18.0)
    assert pixel_dimensions(album) == (3600, 5400)


def test_twelve_by_twelve_is_300_dpi():
    album = {"album_config": {"size": "12x12"}}
    assert page_dimensions(album) == (12.0, 12.0)
    assert pixel_dimensions(album) == (3600, 3600)


def test_pdf_media_box_uses_selected_physical_size():
    pdf = jpegs_to_pdf([_tiny_jpeg()], (12.0, 18.0))
    assert b"/MediaBox [0 0 864.00 1296.00]" in pdf
    assert pdf.startswith(b"%PDF-1.4")
