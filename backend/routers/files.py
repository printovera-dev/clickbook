"""Serves VPS/S3 stored assets at /api/files/{path}. Supports HTTP Range requests so uploaded MP4 slider videos
stream (and seek) in iOS Safari, which refuses to play media from servers that ignore Range."""
import mimetypes
import os
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from storage_manager import resolve_path, get_file_bytes

router = APIRouter(tags=["files"])

CACHE = {"Cache-Control": "public, max-age=31536000, immutable"}  # keys are content-addressed UUIDs
CHUNK = 1024 * 1024


def _iter_file(path: str, start: int, end: int):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = f.read(min(CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


@router.get("/files/{full_path:path}")
async def serve_file(full_path: str, request: Request):
    p = resolve_path(full_path)
    if p:
        ct = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
        size = os.path.getsize(p)
        rng = request.headers.get("range")
        if rng and rng.startswith("bytes="):
            spec = rng[6:].split(",")[0].strip()
            s, _, e = spec.partition("-")
            start = int(s) if s else max(0, size - int(e or 0))
            end = min(int(e), size - 1) if (e and s) else size - 1
            if start > end or start >= size:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            headers = {**CACHE, "Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes",
                       "Content-Length": str(end - start + 1)}
            return StreamingResponse(_iter_file(str(p), start, end), status_code=206, media_type=ct, headers=headers)
        return FileResponse(str(p), headers={**CACHE, "Accept-Ranges": "bytes"}, media_type=ct)
    data = get_file_bytes(full_path)
    if data is None:
        raise HTTPException(404, "File not found")
    ct = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
    return Response(content=data, media_type=ct, headers=CACHE)
