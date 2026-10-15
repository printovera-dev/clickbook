"""Regression tests for preventing the cover photo from repeating as interior page 1."""
import pdf_renderer


def test_render_frames_skips_first_cover_only_page(monkeypatch):
    monkeypatch.setattr(pdf_renderer, "render_cover", lambda album, photos: "cover")
    monkeypatch.setattr(pdf_renderer, "render_page", lambda page, photos, layouts: page["id"])
    monkeypatch.setattr(pdf_renderer, "_load_last_page", lambda *args: "back")

    album = {
        "photos": [{"id": "cover-photo"}, {"id": "inside-photo"}],
        "cover_design": {"photo_id": "cover-photo"},
        "pages": [
            {
                "id": "duplicate-cover",
                "order": 0,
                "layout_photo_count": 1,
                "photo_ids": ["cover-photo"],
                "images": {"0": {"photo_id": "cover-photo"}},
            },
            {
                "id": "interior-page",
                "order": 1,
                "layout_photo_count": 1,
                "photo_ids": ["inside-photo"],
                "images": {"0": {"photo_id": "inside-photo"}},
            },
        ],
    }

    cover, pages, back = pdf_renderer.render_frames(album, {})

    assert cover == "cover"
    assert pages == ["interior-page"]
    assert back == "back"


def test_render_frames_keeps_first_page_when_it_contains_multiple_photos(monkeypatch):
    monkeypatch.setattr(pdf_renderer, "render_cover", lambda album, photos: "cover")
    monkeypatch.setattr(pdf_renderer, "render_page", lambda page, photos, layouts: page["id"])
    monkeypatch.setattr(pdf_renderer, "_load_last_page", lambda *args: "back")

    album = {
        "photos": [{"id": "cover-photo"}, {"id": "other-photo"}],
        "cover_design": {"photo_id": "cover-photo"},
        "pages": [
            {
                "id": "mixed-page",
                "order": 0,
                "layout_photo_count": 2,
                "photo_ids": ["cover-photo", "other-photo"],
                "images": {
                    "0": {"photo_id": "cover-photo"},
                    "1": {"photo_id": "other-photo"},
                },
            },
        ],
    }

    _, pages, _ = pdf_renderer.render_frames(album, {})

    assert pages == ["mixed-page"]
