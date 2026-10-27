"""Storage abstraction for ClickBook uploads.

Two drivers:
- local (default): VPS-style on-disk layout at STORAGE_BASE — for self-hosted servers.
- s3: S3-compatible object storage (Emergent Object Storage / AWS / any S3 bucket).
  Enabled only when STORAGE_DRIVER=s3; required settings are validated and never silently fall back.

Driver selection: env `STORAGE_DRIVER` ("local" | "s3"). Default "local".
"""
import io
import json
import os
import re
import shutil
import uuid
import zipfile
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
        from botocore.config import Config

        kwargs = {
            "aws_access_key_id": S3_ACCESS_KEY,
            "aws_secret_access_key": S3_SECRET_KEY,
            "region_name": S3_REGION,
        }
        if S3_ENDPOINT:
            # Keep the configured addressing behavior for explicitly configured
            # S3-compatible providers/endpoints.
            kwargs["endpoint_url"] = S3_ENDPOINT
            s3_config = Config(
                signature_version="s3v4",
                s3={"addressing_style": "auto"},
            )
        else:
            # AWS requires the bucket's regional virtual-hosted endpoint for
            # presigned uploads. Without this, Boto3 may emit bucket.s3.amazonaws.com,
            # which redirects (307) for buckets outside us-east-1 and breaks browser CORS.
            s3_config = Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
            )
        kwargs["config"] = s3_config
        _s3_client = boto3.client("s3", **kwargs)
    return _s3_client


def _use_s3() -> bool:
    """Return whether S3 is active; never silently fall back to ephemeral disk.

    When STORAGE_DRIVER=s3 is explicitly selected, missing credentials or bucket
    configuration must fail the storage operation rather than write files locally.
    """
    if STORAGE_DRIVER != "s3":
        return False

    missing = [
        name for name, value in (
            ("S3_ACCESS_KEY", S3_ACCESS_KEY),
            ("S3_SECRET_KEY", S3_SECRET_KEY),
            ("S3_BUCKET", S3_BUCKET),
        )
        if not value.strip()
    ]
    if missing:
        raise RuntimeError(
            "STORAGE_DRIVER=s3 but required storage settings are missing: "
            + ", ".join(missing)
        )
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


def create_presigned_upload(customer_id: str, album_id: str, filename: str) -> Optional[dict]:
    """Create a short-lived direct-to-S3 upload URL. Return None for local storage."""
    if STORAGE_DRIVER != "s3":
        return None
    _use_s3()  # validate required configuration; never silently fall back to local disk
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    base = uuid.uuid4().hex
    key = f"clickbook/customers/{customer_id}/albums/{album_id}/originals/{base}{ext}"
    url = _get_s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=900,
    )
    return {"upload_url": url, "key": key}


def finalize_presigned_upload(customer_id: str, album_id: str, filename: str, key: str,
                              max_bytes: int = 20 * 1024 * 1024) -> dict:
    """Validate a direct S3 upload and create only its derived assets (original already exists)."""
    from image_processor import make_derivatives

    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    expected_prefix = f"clickbook/customers/{customer_id}/albums/{album_id}/originals/"
    basename = os.path.basename(key)
    base, key_ext = os.path.splitext(basename)
    if (not _use_s3() or not key.startswith(expected_prefix) or "/" in basename
            or not re.fullmatch(r"[0-9a-f]{32}", base) or key_ext.lower() != ext):
        raise ValueError("Invalid upload key")
    try:
        head = _get_s3().head_object(Bucket=S3_BUCKET, Key=key)
    except Exception as exc:
        # Avoid treating storage outages/permission errors as a valid or missing upload.
        from botocore.exceptions import ClientError
        if isinstance(exc, ClientError):
            code = str(exc.response.get("Error", {}).get("Code", ""))
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code in {"NoSuchKey", "NotFound", "404"} or status == 404:
                raise ValueError("Uploaded file not found in storage")
        raise
    if int(head.get("ContentLength", 0)) > max_bytes:
        raise ValueError("File too large (max 20MB)")
    data = _get_bytes(key)
    if data is None:
        raise ValueError("Uploaded file not found in storage")
    try:
        derivs = make_derivatives(data)
    except ValueError:
        raise
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}"
    jpg_key = f"{base}.jpg"
    webp_key = f"{base}.webp"
    _put(f"{rel}/thumbnails/{webp_key}", derivs["thumbnail"], "image/webp")
    _put(f"{rel}/previews/{webp_key}", derivs["preview"], "image/webp")
    _put(f"{rel}/print/{jpg_key}", derivs["print"], "image/jpeg")
    return {
        "storage_key": basename,
        "original_path": key,
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


def _get_bytes(rel_path: str) -> Optional[bytes]:
    if ".." in rel_path.split("/"):
        return None
    if _use_s3():
        from botocore.exceptions import ClientError
        try:
            obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=rel_path)
            return obj["Body"].read()
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code in {"NoSuchKey", "NotFound", "404"} or status == 404:
                return None
            # Surface permission, credentials, and service failures instead of
            # disguising an S3 outage as a missing file.
            raise
    p = resolve_path(rel_path)
    if not p:
        return None
    return p.read_bytes()


def save_original(customer_id: str, album_id: str, filename: str, data: bytes) -> dict:
    """Stores the untouched original plus resized JPEG derivatives (thumbnail / preview / print)."""
    from image_processor import make_derivatives

    ensure_dirs(customer_id, album_id)
    # Trust the decoded file format, not a possibly missing/wrong browser filename.
    try:
        from PIL import Image
        detected = Image.open(io.BytesIO(data)).format
    except Exception as exc:
        raise ValueError(f"Not a valid image: {exc}")
    detected_ext = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "GIF": ".gif", "TIFF": ".tif"}.get(detected)
    if not detected_ext:
        raise ValueError(f"Unsupported image format: {detected}")
    ext = detected_ext
    base = uuid.uuid4().hex
    key = f"{base}{ext}"
    jpg_key = f"{base}.jpg"
    webp_key = f"{base}.webp"
    rel = f"clickbook/customers/{customer_id}/albums/{album_id}"
    content_type = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif", "TIFF": "image/tiff"}[detected]
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


def get_s3_file_range(rel_path: str, start: int, end: int):
    """Return (bytes, total_size) for an inclusive byte range, or None if absent."""
    if ".." in rel_path.split("/"):
        return None
    if not _use_s3():
        return None
    from botocore.exceptions import ClientError
    client = _get_s3()
    try:
        head = client.head_object(Bucket=S3_BUCKET, Key=rel_path)
        total = int(head["ContentLength"])
        if start < 0 or end < start or start >= total:
            return (b"", total)
        end = min(end, total - 1)
        obj = client.get_object(
            Bucket=S3_BUCKET, Key=rel_path,
            Range=f"bytes={start}-{end}",
        )
        try:
            return (obj["Body"].read(), total)
        finally:
            obj["Body"].close()
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code in {"NoSuchKey", "NotFound", "404"} or status == 404:
            return None
        raise


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


def save_production_package(folder: str, pdf: bytes, cover_jpg: bytes, page_jpgs: list, manifest: dict,
                            back_cover_jpg: bytes = None) -> dict:
    rel = f"{DOWNLOADS_DIR}/{safe_folder_name(folder)}"
    if not _use_s3():
        # rebuilds replace the folder so stale pages from an older render never ship to print
        shutil.rmtree(STORAGE_BASE / rel, ignore_errors=True)
    pdf_path = f"{rel}/Album.pdf"
    cover_path = f"{rel}/Cover/cover.jpg"
    _put(pdf_path, pdf, "application/pdf")
    _put(cover_path, cover_jpg, "image/jpeg")
    if back_cover_jpg:
        _put(f"{rel}/Cover/back_cover.jpg", back_cover_jpg, "image/jpeg")
    print_paths = []
    for i, data in enumerate(page_jpgs, start=1):
        p = f"{rel}/Print/page_{i:03d}.jpg"
        _put(p, data, "image/jpeg")
        print_paths.append(p)
    _put(f"{rel}/manifest.json", json.dumps(manifest, indent=2).encode("utf-8"), "application/json")
    total = len(pdf) + len(cover_jpg) + sum(len(d) for d in page_jpgs)
    return {"dir": rel, "pdf_path": pdf_path, "cover_path": cover_path, "print_paths": print_paths,
            "manifest_path": f"{rel}/manifest.json", "size_bytes": total}



def delete_storage_dir(rel_dir: str) -> int:
    """Delete every file beneath a storage directory; returns the number of deleted objects/files."""
    if not rel_dir or ".." in rel_dir.split("/") or rel_dir.startswith("/"):
        raise ValueError("Invalid storage directory")
    if _use_s3():
        prefix = rel_dir.strip("/") + "/"
        client = _get_s3()
        paginator = client.get_paginator("list_objects_v2")
        deleted = 0
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
            keys = [{"Key": obj["Key"]} for obj in page.get("Contents", []) if obj.get("Key")]
            for start in range(0, len(keys), 1000):
                batch = keys[start:start + 1000]
                if batch:
                    result = client.delete_objects(Bucket=S3_BUCKET, Delete={"Objects": batch, "Quiet": True})
                    errors = result.get("Errors", [])
                    if errors:
                        raise RuntimeError(f"S3 delete failed for {len(errors)} object(s)")
                    deleted += len(batch)
        return deleted
    root = STORAGE_BASE / rel_dir
    if not root.exists():
        return 0
    if not root.is_dir():
        raise ValueError("Storage path is not a directory")
    count = sum(1 for p in root.rglob("*") if p.is_file())
    shutil.rmtree(root)
    return count


def list_dir_files(rel_dir: str) -> list:
    """List relative file paths and sizes under a storage folder (local or S3)."""
    if ".." in rel_dir.split("/"):
        return []
    if _use_s3():
        prefix = rel_dir.strip("/") + "/"
        paginator = _get_s3().get_paginator("list_objects_v2")
        out = []
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj.get("Key", "")
                if not key or key.endswith("/"):
                    continue
                out.append({
                    "path": key,
                    "name": key[len(prefix):],
                    "size_bytes": int(obj.get("Size", 0)),
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
    """Create a ZIP of a package folder from local storage or S3 objects."""
    if ".." in rel_dir.split("/"):
        return None
    buf = io.BytesIO()
    if _use_s3():
        prefix = rel_dir.strip("/") + "/"
        paginator = _get_s3().get_paginator("list_objects_v2")
        found = False
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
                for obj in page.get("Contents", []):
                    key = obj.get("Key", "")
                    if not key or key.endswith("/"):
                        continue
                    found = True
                    response = _get_s3().get_object(Bucket=S3_BUCKET, Key=key)
                    body = response["Body"]
                    try:
                        zf.writestr(key[len(prefix):], body.read())
                    finally:
                        body.close()
        return buf.getvalue() if found else None
    root = STORAGE_BASE / rel_dir
    if not root.is_dir():
        return None
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(root.rglob("*")):
            if p.is_file():
                zf.write(p, arcname=str(p.relative_to(root)))
    return buf.getvalue()
