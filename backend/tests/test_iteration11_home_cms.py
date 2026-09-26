"""Iteration 11: home page CMS (GET /home public, PUT /admin/home) + FAQ/refund/shipping policies."""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://memories-album.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE}/api/admin/login", json={"username": "admin", "password": "clickbook@2026"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_home_public_shape():
    r = requests.get(f"{BASE}/api/home")
    assert r.status_code == 200
    d = r.json()
    c, p = d["content"], d["pricing"]
    assert {len(c["sliders"][k]["slides"]) for k in ("slider1", "slider2", "slider3")} == {4, 3}
    assert [h["key"] for h in c["heroes"]] == ["pricing", "steps", "privacy", "final"]
    assert len(c["videos"]) == 3 and len(c["steps"]) == 5
    assert p["min_sheets"] == 20 and p["base_price"] == round(20 * p["price_per_sheet"] * (1 + p["gst_percent"] / 100))
    # every seeded asset is actually served from VPS storage
    for url in [s["image_url"] for s in c["sliders"]["slider1"]["slides"]] + [h["image_url"] for h in c["heroes"]] + [c["logo_url"]]:
        img = requests.get(f"{BASE}{url}")
        assert img.status_code == 200 and img.headers["content-type"].startswith("image/"), url


def test_admin_edit_slide_is_live_without_rebuild(admin_h):
    doc = requests.get(f"{BASE}/api/admin/home", headers=admin_h).json()["content"]
    sliders = doc["sliders"]
    slides = sliders["slider1"]["slides"]
    original = [dict(s) for s in slides]
    try:
        slides[1]["title"] = "Test title"; slides[1]["cta_label"] = "Create Now"; slides[1]["cta_route"] = "/create/cover"
        slides[2]["active"] = False
        slides.append({"image_url": slides[0]["image_url"], "title": "New slide", "active": True, "order": 99})
        r = requests.put(f"{BASE}/api/admin/home", headers=admin_h, json={"sliders": sliders})
        assert r.status_code == 200, r.text
        pub = requests.get(f"{BASE}/api/home").json()["content"]["sliders"]["slider1"]["slides"]
        titles = [s.get("title") for s in pub]
        assert "Test title" in titles and "New slide" in titles
        assert len(pub) == len(original)  # one hidden, one added
        assert all(s.get("id") for s in pub)
        assert next(s for s in pub if s["title"] == "Test title")["cta_route"] == "/create/cover"
    finally:
        sliders["slider1"]["slides"] = original
        requests.put(f"{BASE}/api/admin/home", headers=admin_h, json={"sliders": sliders})


def test_admin_home_requires_auth_and_validates():
    assert requests.get(f"{BASE}/api/admin/home").status_code == 401
    assert requests.put(f"{BASE}/api/admin/home", json={}).status_code == 401


def test_policies_include_supplied_docs():
    keys = {p["key"]: p["title"] for p in requests.get(f"{BASE}/api/policies").json()["policies"]}
    assert keys["faq"] == "FAQ" and "Refund" in keys["refund"] and "Shipping" in keys["shipping"]
    faq = requests.get(f"{BASE}/api/policies/faq").json()["policy"]
    assert "What is ClickBook?" in faq["body"] and len(faq["body"]) > 2000
