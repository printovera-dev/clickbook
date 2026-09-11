"""Serves VPS/S3 stored assets at /api/files/{path}."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from storage_manager import resolve_path, get_file_bytes

router = APIRouter(tags=["files"])

CACHE = {"Cache-Control": "public, max-age=31536000, immutable"}  # keys are content-addressed UUIDs


@router.get("/files/{full_path:path}")
async def serve_file(full_path: str):
    p = resolve_path(full_path)
    if p:
        return FileResponse(str(p), headers=CACHE)
    data = get_file_bytes(full_path)
    if data is None:
        raise HTTPException(404, "File not found")
    ct = "application/pdf" if full_path.endswith(".pdf") else "image/jpeg"
    return Response(content=data, media_type=ct, headers=CACHE)
