"""Build a versioned first-launch catalog from Riot Data Dragon public assets."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zipfile import ZIP_DEFLATED, ZipFile
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/desktop/src-tauri/resources/catalog"
SOURCE = "https://ddragon.leagueoflegends.com"

def fetch(path, max_bytes=8 * 1024 * 1024):
    for attempt in range(4):
        try:
            request = Request(SOURCE + "/" + path, headers={"User-Agent": "LAAP-Catalog-Packager/1"})
            with urlopen(request, timeout=25) as response:
                if response.url.split("/")[2] != "ddragon.leagueoflegends.com":
                    raise ValueError("Unexpected catalog origin")
                data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError("Catalog resource exceeded its size limit")
            return data
        except HTTPError as error:
            if error.code in (403, 404):
                raise
            if attempt == 3:
                raise
            time.sleep(0.75 * (attempt + 1))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(0.75 * (attempt + 1))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_bytes(value)
    os.replace(temp, path)

def build(refresh=False):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    if manifest_path.exists() and not refresh:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        complete = all((OUTPUT / name).is_file() and
                       sha256((OUTPUT / name).read_bytes()).hexdigest() == digest
                       for name, digest in manifest["files"].items())
        if complete:
            if "metadataSkins" not in manifest:
                total = 0
                for name in manifest["files"]:
                    if name.endswith(".zip"):
                        with ZipFile(OUTPUT / name) as pack:
                            total += len(json.loads(pack.read("detail.json"))["data"]["skins"])
                manifest["metadataSkins"] = total
                manifest["unavailablePreviews"] = total - manifest["skins"]
                write(manifest_path, json.dumps(manifest, indent=2).encode())
            print("Bundled catalog verified", manifest["version"], manifest["champions"], "champions", manifest["skins"], "previews")
            return
    version = next(value for value in json.loads(fetch("api/versions.json"))
                   if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value))
    source = json.loads(fetch(f"cdn/{version}/data/en_US/champion.json"))["data"]
    ids = sorted(key for key in source if re.fullmatch(r"[A-Za-z0-9]{1,64}", key))
    if len(ids) < 100:
        raise ValueError("Incomplete champion index")
    snapshot = {"version": version, "locale": "en_US", "cached": True, "bundled": True,
                "data": [{"id": key, "name": source[key]["name"], "title": source[key]["title"],
                          "tags": source[key]["tags"]} for key in ids]}
    index_bytes = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode()
    hashes = {}
    skins = 0

    def champion(key):
        existing = OUTPUT / f"{key}.zip"
        if existing.exists():
            try:
                with ZipFile(existing) as cached:
                    prior = json.loads(cached.read("detail.json"))
                    if prior["version"] == version and prior["data"]["id"] == key:
                        data = existing.read_bytes()
                        count = len([name for name in cached.namelist() if name.startswith("skin-")])
                        return existing.name, sha256(data).hexdigest(), count, len(data)
            except Exception:
                pass
        payload = json.loads(fetch(f"cdn/{version}/data/en_US/champion/{key}.json"))["data"][key]
        detail = {name: payload[name] for name in ["id", "name", "title", "tags", "lore", "skins"]}
        if detail["id"] != key:
            raise ValueError("Champion response identity mismatch")
        archive = BytesIO()
        with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=6) as pack:
            pack.writestr("detail.json", json.dumps({**snapshot, "data": detail}, ensure_ascii=False).encode())
            portrait = fetch(f"cdn/{version}/img/champion/{key}.png", 2 * 1024 * 1024)
            if not portrait.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid portrait")
            pack.writestr("portrait.png", portrait)
            def preview(skin):
                number = skin["num"]
                if not isinstance(number, int) or number < 0:
                    raise ValueError("Invalid skin number")
                try:
                    image = fetch(f"cdn/img/champion/loading/{key}_{number}.jpg", 2 * 1024 * 1024)
                    if not image.startswith(b"\xff\xd8"):
                        raise ValueError("Invalid cosmetic preview")
                    return number, image
                except ValueError as error:
                    if "size limit" not in str(error):
                        raise
                    return number, None
                except HTTPError as error:
                    if error.code not in (403, 404):
                        raise
                    return number, None
            missing = []
            with ThreadPoolExecutor(max_workers=4) as images:
                for number, image in images.map(preview, payload["skins"]):
                    if image is None:
                        missing.append(number)
                    else:
                        pack.writestr(f"skin-{number}.jpg", image)
            pack.writestr("unavailable-previews.json", json.dumps(missing))
        name = f"{key}.zip"
        data = archive.getvalue()
        write(OUTPUT / name, data)
        return name, sha256(data).hexdigest(), sum(1 for entry in ZipFile(BytesIO(data)).namelist() if entry.startswith("skin-")), len(data)

    with ThreadPoolExecutor(max_workers=6) as pool:
        for number, (name, digest, count, size) in enumerate(pool.map(champion, ids), 1):
            hashes[name] = digest
            skins += count
            if number % 10 == 0 or number == len(ids):
                print(f"Bundling champions {number}/{len(ids)}, {skins} cosmetic previews", flush=True)
    write(OUTPUT / "champions-en_US.json", index_bytes)
    hashes["champions-en_US.json"] = sha256(index_bytes).hexdigest()
    total_skin_records = 0
    for key in ids:
        with ZipFile(OUTPUT / f"{key}.zip") as pack:
            total_skin_records += len(json.loads(pack.read("detail.json"))["data"]["skins"])
    manifest = {"schemaVersion": 1, "version": version, "locale": "en_US", "source": SOURCE,
                "champions": len(ids), "skins": skins, "metadataSkins": total_skin_records,
                "unavailablePreviews": total_skin_records - skins, "files": hashes}
    write(manifest_path, json.dumps(manifest, indent=2).encode())
    print("First-launch catalog ready", version, len(ids), "champions", skins, "previews",
          sum((OUTPUT / name).stat().st_size for name in hashes), "bytes", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    build(parser.parse_args().refresh)
