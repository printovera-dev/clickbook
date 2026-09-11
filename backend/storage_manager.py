"""Storage abstraction for ClickBook uploads.

Two drivers:
- local (default): VPS-style on-disk layout at STORAGE_BASE — for self-hosted servers.
- s3: S3-compatible object storage (Emergent Object Storage / AWS / any S3 bucket).
  Enabled when S3_ACCESS_KEY + S3_SECRET_KEY + S3_BUCKET are set, or STORAGE_DRIVER=s3.

Driver selection: env `STORAGE_DRIVER` ("local" | "s3"). Default "local".
"""
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

STORAGE_DRIVER = os.environ.get("STORAGE_DRIVER", "local")

STORAGE_BASE = Path(os.environ.get("STORAGE_BASE", "/app/backend/storage"))
PUBLIC_BASE_URL = os.environ.get("STORAGE_PUBLIC_URL", "/api/files")

# S3-compatible config (Emergent Object Storage or any S3)
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")  # optional, for S3-compatible stores
S3_REGION = os.environ.get("S3_REGION", "us-east-1")

_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        kwargs = {
            "aws_access_key_id": S3_ACCESS_KEY,
            "aws_secret_access_key": S3_SECRET_KEY,
            "region_name": S3_REGION,
        }
        if S3_ENDPOINT:
            kwargs["endpoint_url"] = S3_ENDPOINT
        _s3_client = boto3.client("s3", **kwargs)
    return _s3_client


def _use_s3() -> bool:
    return STORAGE_DRIVER == "s3" and bool(S3_ACCESS_KEY and S3_SECRET_KEY and S3_BUCKET)


def _customer_root(customer_id: str, album_id: str) -> Path:
    return STORAGE_BASE / "clickbook" / "customers" / customer_id / "albums" / album_id


def ensure_dirs(customer_id: str, album_id: str) -> None:
    if _use_s3():
        return
    for sub in ("originals", "thumbnails", "previews", "print", "pdf"):
        (_customer_root(customer_id, album_id) / sub).mkdir(parents=True, exist_ok=True)


def _put(rel_path: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    if _use_s3():
        _get_s3().put_object(Bucket=S3_BUCKET, Key=rel_path, Body=data, ContentType=content_type)
    else:
        p = STORAGE_BASE / rel_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


def _get_bytes(rel_path: str) -> Optional[bytes]:
    if _use_s3():
        try:
            obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=rel_path)
            return obj["Body"].read()
        except Exception:
            return None
    p = resolve_path(rel_path)
    if not p:
        return None
    return p.read_bytes()


def save_original(customer_id: str, album_id: str, filename: str, data: bytes) -> dict:
    """Stores the untouched original plus resized JPEG derivatives (thumbnail / preview / print)."""
    from image_processor import make_derivatives

    ensure_dirs(customer_id, album_id)
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    base = uuid.uuid4().hex
    key = f"{base}{ext}"
    jpg_key = f"{base}.jpg"
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}"
    content_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "application/octet-stream"
    derivs = make_derivatives(data)
    _put(f"{rel}/originals/{key}", data, content_type)
    _put(f"{rel}/thumbnails/{jpg_key}", derivs["thumbnail"], "image/jpeg")
    _put(f"{rel}/previews/{jpg_key}", derivs["preview"], "image/jpeg")
    _put(f"{rel}/print/{jpg_key}", derivs["print"], "image/jpeg")
    return {
        "storage_key": key,
        "original_path": f"{rel}/originals/{key}",
        "thumbnail_path": f"{rel}/thumbnails/{jpg_key}",
        "preview_path": f"{rel}/previews/{jpg_key}",
        "print_path": f"{rel}/print/{jpg_key}",
        "size_bytes": len(data),
        "width": derivs["width"],
        "height": derivs["height"],
        "derivative_bytes": {
            "thumbnail": len(derivs["thumbnail"]),
            "preview": len(derivs["preview"]),
            "print": len(derivs["print"]),
        },
    }


def resolve_path(rel_path: str) -> Optional[Path]:
    # Security: no path traversal
    if ".." in rel_path.split("/"):
        return None
    p = STORAGE_BASE / rel_path
    if not p.exists() or not p.is_file():
        return None
    return p


def get_file_bytes(rel_path: str) -> Optional[bytes]:
    return _get_bytes(rel_path)


def public_url(rel_path: str) -> str:
    return f"{PUBLIC_BASE_URL}/{rel_path}"


def save_pdf(customer_id: str, album_id: str, data: bytes) -> dict:
    ensure_dirs(customer_id, album_id)
    key = f"{uuid.uuid4().hex}.pdf"
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}/pdf/{key}"
    _put(rel, data, "application/pdf")
    return {"pdf_path": rel, "size_bytes": len(data)}
