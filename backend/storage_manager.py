"""Storage abstraction for ClickBook uploads.

Two drivers:
- local (default): VPS-style on-disk layout at STORAGE_BASE — for self-hosted servers.
- s3: S3-compatible object storage (Emergent Object Storage / AWS / any S3 bucket).
  Enabled when S3_ACCESS_KEY + S3_SECRET_KEY + S3_BUCKET are set, or STORAGE_DRIVER=s3.

Driver selection: env `STORAGE_DRIVER` ("local" | "s3"). Default "local".
"""
import io
import json
import logging
import os
import re
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Optional

STORAGE_DRIVER = os.environ.get("STORAGE_DRIVER", "local").strip().lower()
if STORAGE_DRIVER not in {"local", "s3"}:
    raise RuntimeError("STORAGE_DRIVER must be either 'local' or 's3'.")

STORAGE_BASE = Path(os.environ.get("STORAGE_BASE", "/app/backend/storage"))
PUBLIC_BASE_URL = os.environ.get("STORAGE_PUBLIC_URL", "/api/files")

# S3-compatible config (Emergent Object Storage or any S3)
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")  # optional, for S3-compatible stores
S3_REGION = os.environ.get("S3_REGION", "us-east-1")

_s3_client = None
logger = logging.getLogger(__name__)


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
    if STORAGE_DRIVER != "s3":
        return False
    missing = [name for name, value in (
        ("S3_ACCESS_KEY", S3_ACCESS_KEY),
        ("S3_SECRET_KEY", S3_SECRET_KEY),
        ("S3_BUCKET", S3_BUCKET),
    ) if not value]
    if missing:
        raise RuntimeError("STORAGE_DRIVER=s3 requires: " + ", ".join(missing))
    return True


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


def _current_package_prefix(rel_dir: str) -> Optional[str]:
    """Return the published version prefix for a Downloads/<order> package."""
    parts = rel_dir.strip("/").split("/")
    if len(parts) != 2 or parts[0] != DOWNLOADS_DIR:
        return None
    pointer_key = f"{rel_dir.rstrip('/')}/.current.json"
    if _use_s3():
        try:
            obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=pointer_key)
            payload = json.loads(obj["Body"].read().decode("utf-8"))
        except Exception as exc:
            code = getattr(exc, "response", {}).get("Error", {}).get("Code")
            if code in {"NoSuchKey", "404", "NotFound"}:
                return None
            logger.exception("Unable to read production package pointer %s", pointer_key)
            raise
    else:
        pointer_path = STORAGE_BASE / pointer_key
        if not pointer_path.is_file():
            return None
        payload = json.loads(pointer_path.read_text(encoding="utf-8"))

    prefix = payload.get("prefix")
    expected = f"{rel_dir.rstrip('/')}/versions/"
    if not isinstance(prefix, str) or not prefix.startswith(expected) or ".." in prefix.split("/"):
        raise RuntimeError(f"Invalid production package pointer: {pointer_key}")
    return prefix.rstrip("/")


def _resolve_package_key(rel_path: str) -> str:
    """Resolve stable package URLs to the active version without changing their public paths."""
    parts = rel_path.strip("/").split("/")
    if len(parts) < 3 or parts[0] != DOWNLOADS_DIR or parts[2] in {".current.json", "versions"}:
        return rel_path
    prefix = _current_package_prefix("/".join(parts[:2]))
    if not prefix:
        return rel_path
    return prefix + "/" + "/".join(parts[2:])


def _put_atomic(rel_path: str, data: bytes, content_type: str = "application/json") -> None:
    """Atomically replace a pointer file: S3 object writes and local os.replace are atomic."""
    if _use_s3():
        _put(rel_path, data, content_type)
        return
    path = STORAGE_BASE / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        temp_path.write_bytes(data)
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def _get_bytes(rel_path: str) -> Optional[bytes]:
    if _use_s3():
        key = _resolve_package_key(rel_path)
        try:
            obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=key)
            try:
                return obj["Body"].read()
            finally:
                obj["Body"].close()
        except Exception as exc:
            code = getattr(exc, "response", {}).get("Error", {}).get("Code")
            if code in {"NoSuchKey", "404", "NotFound"}:
                return None
            logger.exception("S3 read failed for key %s", key)
            raise
    key = _resolve_package_key(rel_path)
    p = resolve_path(key)
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
    webp_key = f"{base}.webp"
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}"
    content_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "application/octet-stream"
    derivs = make_derivatives(data)
    _put(f"{rel}/originals/{key}", data, content_type)
    _put(f"{rel}/thumbnails/{webp_key}", derivs["thumbnail"], "image/webp")
    _put(f"{rel}/previews/{webp_key}", derivs["preview"], "image/webp")
    _put(f"{rel}/print/{jpg_key}", derivs["print"], "image/jpeg")
    return {
        "storage_key": key,
        "original_path": f"{rel}/originals/{key}",
        "thumbnail_path": f"{rel}/thumbnails/{webp_key}",
        "preview_path": f"{rel}/previews/{webp_key}",
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


# ---- Production package: Downloads/<order folder>/{Album.pdf, Cover/, Print/, manifest.json} ----

DOWNLOADS_DIR = "Downloads"


def safe_folder_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", (name or "").strip()).strip("_")
    return cleaned[:80] or "album"


def _delete_prefix(rel_dir: str) -> None:
    """Delete an existing package prefix before rebuilding so stale pages cannot ship."""
    if ".." in rel_dir.split("/"):
        raise ValueError("Invalid storage path")
    current_prefix = _current_package_prefix(rel_dir)
    if current_prefix:
        rel_dir = current_prefix
    if _use_s3():
        prefix = rel_dir.rstrip("/") + "/"
        paginator = _get_s3().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
            objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            for start in range(0, len(objects), 1000):
                batch = objects[start:start + 1000]
                if batch:
                    _get_s3().delete_objects(Bucket=S3_BUCKET, Delete={"Objects": batch, "Quiet": True})
    else:
        shutil.rmtree(STORAGE_BASE / rel_dir, ignore_errors=True)


def save_production_package(folder: str, pdf: bytes, cover_jpg: bytes, page_jpgs: list, manifest: dict,
                            back_cover_jpg: bytes = None) -> dict:
    """Stage a complete package, verify its file list, then atomically publish a pointer.

    A failed upload leaves the previously published package intact. Stable Downloads paths
    continue to resolve to the published version via get_file_bytes/list_dir_files.
    """
    rel = f"{DOWNLOADS_DIR}/{safe_folder_name(folder)}"
    old_prefix = _current_package_prefix(rel)
    version_prefix = f"{rel}/versions/{uuid.uuid4().hex}"

    pdf_path = f"{rel}/Album.pdf"
    cover_path = f"{rel}/Cover/cover.jpg"
    _put(f"{version_prefix}/Album.pdf", pdf, "application/pdf")
    _put(f"{version_prefix}/Cover/cover.jpg", cover_jpg, "image/jpeg")
    if back_cover_jpg:
        _put(f"{version_prefix}/Cover/back_cover.jpg", back_cover_jpg, "image/jpeg")
    print_paths = []
    for i, data in enumerate(page_jpgs, start=1):
        _put(f"{version_prefix}/Print/page_{i:03d}.jpg", data, "image/jpeg")
        print_paths.append(f"{rel}/Print/page_{i:03d}.jpg")
    _put(f"{version_prefix}/manifest.json", json.dumps(manifest, indent=2).encode("utf-8"), "application/json")

    expected_count = 3 + len(page_jpgs) + (1 if back_cover_jpg else 0)
    staged_files = list_dir_files(version_prefix)
    if len(staged_files) != expected_count:
        raise RuntimeError(
            f"Production package verification failed: expected {expected_count} files, found {len(staged_files)}"
        )

    pointer = json.dumps({"prefix": version_prefix, "file_count": expected_count}).encode("utf-8")
    _put_atomic(f"{rel}/.current.json", pointer, "application/json")

    # The new package is now published. A cleanup failure must not invalidate that success.
    if old_prefix and old_prefix != version_prefix:
        try:
            _delete_prefix(old_prefix)
        except Exception:
            logger.warning("Published package %s but could not remove old version %s", rel, old_prefix, exc_info=True)

    total = len(pdf) + len(cover_jpg) + sum(len(d) for d in page_jpgs)
    if back_cover_jpg:
        total += len(back_cover_jpg)
    return {"dir": rel, "pdf_path": pdf_path, "cover_path": cover_path, "print_paths": print_paths,
            "manifest_path": f"{rel}/manifest.json", "size_bytes": total}


def list_dir_files(rel_dir: str) -> list:
    """Relative file paths (with sizes) under a local or S3-backed storage folder."""
    if ".." in rel_dir.split("/"):
        return []
    if _use_s3():
        prefix = rel_dir.rstrip("/") + "/"
        paginator = _get_s3().get_paginator("list_objects_v2")
        out = []
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                if key.endswith("/"):
                    continue
                out.append({
                    "path": key,
                    "name": key[len(prefix):],
                    "size_bytes": item.get("Size", 0),
                })
        return sorted(out, key=lambda item: item["name"])
    root = STORAGE_BASE / rel_dir
    if not root.is_dir():
        return []
    out = []
    for p in sorted(root.rglob("*")):
        if p.is_file():
            out.append({"path": str(p.relative_to(STORAGE_BASE)), "name": str(p.relative_to(root)), "size_bytes": p.stat().st_size})
    return out


def zip_dir(rel_dir: str) -> Optional[bytes]:
    """Create a ZIP for either local or S3 storage. ZIP output is currently buffered in memory."""
    if ".." in rel_dir.split("/"):
        return None
    buf = io.BytesIO()
    current_prefix = _current_package_prefix(rel_dir)
    if current_prefix:
        rel_dir = current_prefix
    if _use_s3():
        files = list_dir_files(rel_dir)
        if not files:
            return None
        prefix = rel_dir.rstrip("/") + "/"
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in files:
                obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=item["path"])
                with zf.open(item["name"], "w") as member:
                    shutil.copyfileobj(obj["Body"], member)
                obj["Body"].close()
    else:
        root = STORAGE_BASE / rel_dir
        if not root.is_dir():
            return None
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in sorted(root.rglob("*")):
                if p.is_file():
                    zf.write(p, arcname=str(p.relative_to(root)))
    return buf.getvalue()
