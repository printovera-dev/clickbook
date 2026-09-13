"""Shared design model helpers (used by generation + PDF).

Page:  {id, layout_id, layout_photo_count, photo_ids[], background, order, text,
        images: {slot_index: {photo_id, scale, ox, oy, fit}},   # non-destructive crop per slot
        texts:  [{id, text, x, y, w, h, font, size, weight, italic, color, align, z}]}
Fractions are relative to the page (0..1); text `size` is a fraction of page width.
"""

# Default slot rectangles by photo count (mirrors seeded layouts); x,y,w,h fractions of page.
DEFAULT_POSITIONS = {
    1: [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.9}],
    2: [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.44}, {"x": 0.05, "y": 0.51, "w": 0.9, "h": 0.44}],
    3: [{"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.55}, {"x": 0.05, "y": 0.63, "w": 0.44, "h": 0.32},
        {"x": 0.51, "y": 0.63, "w": 0.44, "h": 0.32}],
    4: [{"x": 0.05, "y": 0.05, "w": 0.44, "h": 0.44}, {"x": 0.51, "y": 0.05, "w": 0.44, "h": 0.44},
        {"x": 0.05, "y": 0.51, "w": 0.44, "h": 0.44}, {"x": 0.51, "y": 0.51, "w": 0.44, "h": 0.44}],
}

# Album styles -> layout rhythm (photos per page, repeating)
STYLE_RHYTHMS = {
    "elegant": [1, 1, 1, 2, 1, 1],
    "balanced": [1, 2, 1, 2, 2, 1],
    "gallery": [2, 3, 2, 3, 4, 2],
}
DEFAULT_STYLE = "balanced"

FONT_FILES = {
    "playfair": "PlayfairDisplay",
    "cormorant": "CormorantGaramond",
    "lora": "Lora",
    "inter": "Inter",
    "montserrat": "Montserrat",
    "dancing": "DancingScript",
}


def default_transform():
    return {"scale": 1.0, "ox": 0.0, "oy": 0.0, "fit": "fill"}


def image_draw_rect(slot_w: float, slot_h: float, img_w: int, img_h: int, tr: dict):
    """Returns (dx, dy, dw, dh): where to draw the image relative to the slot's top-left so that
    the same scale/offset produce the same crop in the app and in print."""
    r = img_w / max(1, img_h)
    fit = tr.get("fit", "fill") == "fit"
    if (r > slot_w / slot_h) != fit:
        dh, dw = slot_h, slot_h * r
    else:
        dw, dh = slot_w, slot_w / r
    s = max(0.2, float(tr.get("scale", 1.0)))
    dw, dh = dw * s, dh * s
    ox_max = max(0.0, (dw - slot_w) / 2)
    oy_max = max(0.0, (dh - slot_h) / 2)
    ox = max(-1.0, min(1.0, float(tr.get("ox", 0.0)))) * ox_max
    oy = max(-1.0, min(1.0, float(tr.get("oy", 0.0)))) * oy_max
    dx = (slot_w - dw) / 2 + ox
    dy = (slot_h - dh) / 2 + oy
    return dx, dy, dw, dh


# Cover styles: image frame + default text placement. Same model as pages (photo + transform + texts).
COVER_STYLES = {
    "signature": {
        "name": "Signature Full Bleed",
        "description": "One photograph fills the complete cover, edge to edge.",
        "frame": {"x": 0, "y": 0, "w": 1, "h": 1}, "background": "#1C1917",
        "texts": [
            {"text": "{name}", "x": 0.08, "y": 0.74, "w": 0.84, "h": 0.14, "font": "playfair", "size": 0.075,
             "weight": "bold", "color": "#FFFFFF", "align": "left"},
            {"text": "A ClickBook", "x": 0.08, "y": 0.88, "w": 0.84, "h": 0.05, "font": "inter", "size": 0.028,
             "weight": "regular", "color": "#FFFFFF", "align": "left"},
        ],
    },
    "classic": {
        "name": "Classic Portrait",
        "description": "Main photograph centred with an elegant border and your title below.",
        "frame": {"x": 0.14, "y": 0.1, "w": 0.72, "h": 0.6}, "background": "#FAFAF8",
        "texts": [
            {"text": "{name}", "x": 0.1, "y": 0.75, "w": 0.8, "h": 0.1, "font": "cormorant", "size": 0.07,
             "weight": "bold", "color": "#1C1917", "align": "center"},
            {"text": "Memories to keep", "x": 0.1, "y": 0.85, "w": 0.8, "h": 0.05, "font": "inter", "size": 0.026,
             "weight": "regular", "color": "#78716C", "align": "center"},
        ],
    },
    "editorial": {
        "name": "Editorial Frame",
        "description": "Large central image with a refined editorial composition and side-set title.",
        "frame": {"x": 0.08, "y": 0.08, "w": 0.84, "h": 0.6}, "background": "#F0EFEA",
        "texts": [
            {"text": "{name}", "x": 0.08, "y": 0.73, "w": 0.6, "h": 0.14, "font": "playfair", "size": 0.062,
             "weight": "regular", "color": "#1C1917", "align": "left"},
            {"text": "VOL. 01", "x": 0.7, "y": 0.75, "w": 0.22, "h": 0.05, "font": "montserrat", "size": 0.026,
             "weight": "bold", "color": "#C56A47", "align": "right"},
        ],
    },
}


def default_cover_design(style: str, photo_id: str, name: str) -> dict:
    import uuid
    st = COVER_STYLES.get(style) or COVER_STYLES["signature"]
    return {
        "style": style if style in COVER_STYLES else "signature",
        "photo_id": photo_id,
        "image": default_transform(),
        "frame": dict(st["frame"]),
        "background": st["background"],
        "texts": [{"id": uuid.uuid4().hex[:8], "italic": False, "z": i + 1, **t, "text": t["text"].replace("{name}", name)}
                  for i, t in enumerate(st["texts"])],
    }
