"""VPS-style file storage abstraction. Base path configurable via STORAGE_BASE."""
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

STORAGE_BASE = Path(os.environ.get("STORAGE_BASE", "/app/backend/storage"))
PUBLIC_BASE_URL = os.environ.get("STORAGE_PUBLIC_URL", "/api/files")


def _customer_root(customer_id: str, album_id: str) -> Path:
    return STORAGE_BASE / "clickbook" / "customers" / customer_id / "albums" / album_id


def ensure_dirs(customer_id: str, album_id: str) -> None:
    for sub in ("originals", "thumbnails", "previews", "print", "pdf"):
        (_customer_root(customer_id, album_id) / sub).mkdir(parents=True, exist_ok=True)


def save_original(customer_id: str, album_id: str, filename: str, data: bytes) -> dict:
    ensure_dirs(customer_id, album_id)
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    key = f"{uuid.uuid4().hex}{ext}"
    root = _customer_root(customer_id, album_id)
    orig_path = root / "originals" / key
    orig_path.write_bytes(data)
    # For MVP: copy same file to thumbnails/previews/print (real impl would resize)
    for sub in ("thumbnails", "previews", "print"):
        shutil.copy(orig_path, root / sub / key)
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}"
    return {
        "storage_key": key,
        "original_path": f"{rel}/originals/{key}",
        "thumbnail_path": f"{rel}/thumbnails/{key}",
        "preview_path": f"{rel}/previews/{key}",
        "print_path": f"{rel}/print/{key}",
        "size_bytes": len(data),
    }


def resolve_path(rel_path: str) -> Optional[Path]:
    # Security: no path traversal
    if ".." in rel_path.split("/"):
        return None
    p = STORAGE_BASE / rel_path
    if not p.exists() or not p.is_file():
        return None
    return p


def public_url(rel_path: str) -> str:
    return f"{PUBLIC_BASE_URL}/{rel_path}"


def save_pdf(customer_id: str, album_id: str, data: bytes) -> dict:
    ensure_dirs(customer_id, album_id)
    key = f"{uuid.uuid4().hex}.pdf"
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}/pdf/{key}"
    (STORAGE_BASE / rel).write_bytes(data)
    return {"pdf_path": rel, "size_bytes": len(data)}
