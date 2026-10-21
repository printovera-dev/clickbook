"""Shared helper: 'Build production files' is asynchronous (202 + polling) since iteration 15."""
import time


def build_package(session, base_api: str, order_id: str, headers: dict, timeout_s: int = 180) -> dict:
    """POST /admin/orders/{id}/pdf then poll /downloads until the package is ready.
    Returns the legacy synchronous shape: {"package", "pdf_url", "pages" (incl. cover), "size_bytes"}."""
    r = session.post(f"{base_api}/admin/orders/{order_id}/pdf", headers=headers)
    assert r.status_code in (200, 202), r.text
    deadline = time.time() + timeout_s
    pkg = r.json().get("package", {})
    while time.time() < deadline:
        d = session.get(f"{base_api}/admin/orders/{order_id}/downloads", headers=headers)
        assert d.status_code == 200, d.text
        pkg = d.json()["package"]
        if pkg.get("status") in ("ready", "failed"):
            break
        time.sleep(2)
    assert pkg.get("status") == "ready", pkg
    return {"package": pkg, "pdf_url": pkg["pdf_url"], "pages": pkg["pages"] + 1, "size_bytes": pkg["size_bytes"]}
