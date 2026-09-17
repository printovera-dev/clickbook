# Regression test for the "not uploading images" bug (iteration 4)
# Covers: OTP login -> create album -> multipart photo upload x3 -> GET album -> auto-generate
# Verifies photos array length, URL fields present, and file URLs return HTTP 200 image bytes.
import os
import random
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")

ASSETS = os.path.join(os.path.dirname(__file__), "assets")


class TestPhotoUploadFlow:
    """End-to-end backend flow for the image-upload bug fix"""

    state = {}

    def test_01_send_otp(self):
        mobile = "98" + "".join(random.choice("0123456789") for _ in range(8))
        r = requests.post(f"{BASE_URL}/api/auth/otp/send", json={"mobile": mobile, "channel": "whatsapp"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # mock mode -> success True, OTP is 123456; aoc mode w/ unapproved template -> dev_hint carries OTP
        otp = "123456" if data.get("provider") == "mock" else data.get("dev_hint")
        assert otp, f"no OTP obtainable: {data}"
        TestPhotoUploadFlow.state["mobile"] = mobile
        TestPhotoUploadFlow.state["otp"] = otp

    def test_02_verify_otp_and_get_token(self):
        mobile = self.state["mobile"]
        r = requests.post(f"{BASE_URL}/api/auth/otp/verify", json={"mobile": mobile, "otp": self.state["otp"]}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data.get("customer", {}).get("mobile") == mobile
        self.state["token"] = data["token"]

    def test_03_list_covers(self):
        r = requests.get(f"{BASE_URL}/api/covers", timeout=15)
        assert r.status_code == 200, r.text
        covers = r.json().get("covers", [])
        assert len(covers) > 0
        self.state["cover_id"] = covers[0]["id"]

    def test_04_create_album(self):
        r = requests.post(
            f"{BASE_URL}/api/albums",
            json={"cover_id": self.state["cover_id"], "name": "TEST Upload Bug Regression"},
            headers={"Authorization": f"Bearer {self.state['token']}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        album = r.json()["album"]
        assert album["photos"] == []
        assert album["pages"] == []
        assert "_id" not in album
        self.state["album_id"] = album["id"]

    def test_05_upload_three_photos_multipart(self):
        token = self.state["token"]
        album_id = self.state["album_id"]
        photo_ids = []
        for i in (1, 2, 3):
            path = os.path.join(ASSETS, f"test_photo_{i}.jpg")
            with open(path, "rb") as f:
                r = requests.post(
                    f"{BASE_URL}/api/albums/{album_id}/photos",
                    files={"file": (f"test_photo_{i}.jpg", f, "image/jpeg")},
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=60,
                )
            assert r.status_code == 200, f"photo {i} upload failed: {r.status_code} {r.text}"
            photo = r.json()["photo"]
            for field in ("id", "preview_url", "thumbnail_url", "original_url"):
                assert photo.get(field), f"photo {i} missing {field}: {photo}"
            photo_ids.append(photo["id"])
        self.state["photo_ids"] = photo_ids

    def test_06_get_album_persists_three_photos(self):
        r = requests.get(
            f"{BASE_URL}/api/albums/{self.state['album_id']}",
            headers={"Authorization": f"Bearer {self.state['token']}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        album = r.json()["album"]
        assert len(album["photos"]) == 3, f"expected 3 photos, got {len(album['photos'])}"
        self.state["album_before_generate"] = album

    def test_07_photo_file_urls_return_200_image_bytes(self):
        album = self.state["album_before_generate"]
        for p in album["photos"]:
            for field in ("preview_url", "thumbnail_url", "original_url"):
                url = p[field]
                if url.startswith("/"):
                    url = f"{BASE_URL}{url}"
                r = requests.get(url, timeout=30)
                assert r.status_code == 200, f"{field} {url} returned {r.status_code}"
                assert len(r.content) > 500, f"{field} returned too few bytes ({len(r.content)})"
                ctype = r.headers.get("Content-Type", "")
                assert "image" in ctype or r.content[:3] == b"\xff\xd8\xff" or r.content[:8] == b"\x89PNG\r\n\x1a\n", \
                    f"{field} not an image: {ctype}"

    def test_08_auto_generate_pages(self):
        r = requests.post(
            f"{BASE_URL}/api/albums/{self.state['album_id']}/generate",
            json={"allow_short": True, },
            headers={"Authorization": f"Bearer {self.state['token']}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        album = r.json()["album"]
        assert len(album["pages"]) > 0, "pages empty after auto-generate"
        all_ids = {pid for page in album["pages"] for pid in page.get("photo_ids", [])}
        assert all(pid in all_ids for pid in self.state["photo_ids"]), "not all uploaded photos placed on pages"
        self.state["album_final"] = album

    def test_09_get_album_after_generate_still_has_three_photos(self):
        r = requests.get(
            f"{BASE_URL}/api/albums/{self.state['album_id']}",
            headers={"Authorization": f"Bearer {self.state['token']}"},
            timeout=15,
        )
        assert r.status_code == 200
        album = r.json()["album"]
        assert len(album["photos"]) == 3
        assert len(album["pages"]) > 0
