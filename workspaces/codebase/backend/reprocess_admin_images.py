"""One-off: regenerate WebP/JPEG derivatives for admin-uploaded assets so transparent PNGs get a white
(not black) background. Safe to re-run."""
import asyncio
from core import db
from storage_manager import get_file_bytes, _put  # noqa
from image_processor import make_derivatives


async def main():
    n = 0
    async for doc in db.admin_images.find({}, {"_id": 0}):
        data = get_file_bytes(doc.get("original_path") or "")
        if not data:
            continue
        try:
            d = make_derivatives(data)
        except ValueError:
            continue
        _put(doc["thumbnail_path"], d["thumbnail"], "image/webp")
        _put(doc["preview_path"], d["preview"], "image/webp")
        if doc.get("print_path"):
            _put(doc["print_path"], d["print"], "image/jpeg")
        n += 1
    print("reprocessed", n)

asyncio.run(main())
