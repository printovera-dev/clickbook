#!/usr/bin/env python3
"""Copy existing ClickBook local storage to S3 without deleting local files.

Safe by default: dry-run unless --apply is supplied. Existing objects are
verified; identical objects are skipped and conflicting objects stop the run.
Run from the backend directory or set STORAGE_BASE explicitly.
"""
import argparse
import hashlib
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_stream(stream) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Upload files (default is dry-run)")
    args = parser.parse_args()

    base = Path(os.environ.get("STORAGE_BASE", "/data/storage")).resolve()
    bucket = os.environ.get("S3_BUCKET", "").strip()
    access = os.environ.get("S3_ACCESS_KEY", "").strip()
    secret = os.environ.get("S3_SECRET_KEY", "").strip()
    endpoint = os.environ.get("S3_ENDPOINT", "").strip() or None
    region = os.environ.get("S3_REGION", "us-east-1").strip()

    missing = [name for name, value in (
        ("S3_BUCKET", bucket), ("S3_ACCESS_KEY", access), ("S3_SECRET_KEY", secret)
    ) if not value]
    if missing:
        parser.error("Missing required environment variables: " + ", ".join(missing))
    if not base.is_dir():
        parser.error(f"STORAGE_BASE directory does not exist: {base}")

    client = boto3.client(
        "s3", aws_access_key_id=access, aws_secret_access_key=secret,
        region_name=region, endpoint_url=endpoint,
    )
    files = sorted(path for path in base.rglob("*") if path.is_file())
    print(f"Source: {base}\nBucket: {bucket}\nFiles found: {len(files)}")
    print("Mode: APPLY (uploads enabled)" if args.apply else "Mode: DRY-RUN (no uploads)")
    uploaded = skipped = planned = 0

    for path in files:
        key = path.relative_to(base).as_posix()
        local_hash = sha256_file(path)
        try:
            head = client.head_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code not in {"404", "NoSuchKey", "NotFound"} and status != 404:
                raise RuntimeError(f"Cannot check s3://{bucket}/{key}: {exc}") from exc
            head = None

        if head is not None:
            if head.get("ContentLength") != path.stat().st_size:
                raise RuntimeError(
                    f"CONFLICT: s3://{bucket}/{key} exists with a different size. "
                    "No object was overwritten; investigate this key before continuing."
                )
            obj = client.get_object(Bucket=bucket, Key=key)
            try:
                remote_hash = sha256_stream(obj["Body"])
            finally:
                obj["Body"].close()
            if remote_hash != local_hash:
                raise RuntimeError(
                    f"CONFLICT: s3://{bucket}/{key} has different content. "
                    "No object was overwritten; investigate this key before continuing."
                )
            print(f"VERIFIED existing: {key}")
            skipped += 1
            continue

        if args.apply:
            import mimetypes
            content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
            with path.open("rb") as stream:
                client.put_object(
                    Bucket=bucket, Key=key, Body=stream,
                    ContentLength=path.stat().st_size, ContentType=content_type,
                    Metadata={"sha256": local_hash},
                )
            # Verify upload by reading it back and comparing the checksum.
            obj = client.get_object(Bucket=bucket, Key=key)
            try:
                uploaded_hash = sha256_stream(obj["Body"])
            finally:
                obj["Body"].close()
            if uploaded_hash != local_hash:
                raise RuntimeError(f"Upload verification failed for s3://{bucket}/{key}")
            print(f"UPLOADED and verified: {key}")
            uploaded += 1
        else:
            print(f"WOULD UPLOAD: {key}")
            planned += 1

    print(f"Complete. Uploaded={uploaded}, already_verified={skipped}, planned={planned}")
    if not args.apply:
        print("No files were uploaded. Re-run with --apply only after reviewing this list.")
    print("Local source files were not deleted or modified.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
