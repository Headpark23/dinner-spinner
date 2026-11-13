"""
Fetch freely licensed dish photos from Wikimedia Commons.

For each recipe it looks up the lead image of the matching Wikipedia article,
keeps it only if the file lives on Commons under CC0 / public domain / CC BY /
CC BY-SA, then saves a 960px WebP to public/photos/<id>.webp and records the
author, licence and source page in src/data/photoCredits.json.

Usage:  python -I scripts/fetch_photos.py [--only id1,id2] [--override id=Wiki_or_File:Name ...]
Re-running skips photos that already exist unless they are named in --only.
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "photos"
CREDITS = ROOT / "src" / "data" / "photoCredits.json"
UA = "DinnerSpinner/0.2 (local development; recipe photo credits)"
ALLOWED = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? \d(\.\d)?)", re.I)

STARTER_WIKI = {
    "meal_1": "Penne all'arrabbiata",
    "meal_2": "Dopiaza",
    "meal_3": "Chow mein",
    "meal_4": "Bangers and mash",
    "meal_5": "File:Baked salmon with vegetables.jpg",
    "meal_6": "Chili con carne",
    "meal_7": "Shepherd's pie",
    "meal_8": "Halloumi",
    "meal_9": "Green curry",
    "meal_10": "Yorkshire pudding",
    "meal_11": "Pork belly",
    "meal_12": "File:Mushroom wellington.jpg",
}


def fetch(url, timeout=60):
    """GET with polite retries: Wikimedia answers 429 when we go too fast."""
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 5 * (2 ** attempt)
            time.sleep(min(wait, 90))


def get_json(url):
    return json.loads(fetch(url, 30).decode("utf-8"))


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def lead_file(title):
    if title.startswith("File:"):
        return title
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "pageimages", "piprop": "name",
        "redirects": 1, "titles": title,
    })
    data = get_json(f"https://en.wikipedia.org/w/api.php?{q}")
    for page in data.get("query", {}).get("pages", {}).values():
        if page.get("pageimage"):
            return "File:" + page["pageimage"]
    return None


def commons_info(file_title):
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "imageinfo", "titles": file_title,
        "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 1000,
    })
    data = get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
    for page in data.get("query", {}).get("pages", {}).values():
        info = (page.get("imageinfo") or [None])[0]
        if info:
            return info
    return None


def main():
    args = sys.argv[1:]
    only = set()
    overrides = {}
    i = 0
    while i < len(args):
        if args[i] == "--only":
            only = set(args[i + 1].split(","))
            i += 2
        elif args[i] == "--override":
            i += 1
            while i < len(args) and not args[i].startswith("--"):
                k, v = args[i].split("=", 1)
                overrides[k] = v
                only.add(k)
                i += 1
        else:
            i += 1

    src = (ROOT / "src" / "data" / "worldRecipes.ts").read_text(encoding="utf-8")
    wiki = dict(re.findall(r"\{ id: '(w_[a-z0-9_]+)'.*?w: '([^']+)'", src))
    wiki.update(STARTER_WIKI)
    wiki.update(overrides)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    credits = json.loads(CREDITS.read_text(encoding="utf-8")) if CREDITS.exists() else {}
    skipped = []

    for rid, title in wiki.items():
        if only and rid not in only:
            continue
        dest = OUT_DIR / f"{rid}.webp"
        if dest.exists() and rid not in only:
            continue
        try:
            ftitle = lead_file(title)
            if not ftitle:
                skipped.append((rid, "no lead image"))
                continue
            info = commons_info(ftitle)
            time.sleep(0.2)
            if not info:
                skipped.append((rid, "not on Commons (likely non-free)"))
                continue
            meta = info.get("extmetadata", {})
            lic = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
            if not ALLOWED.match(lic):
                skipped.append((rid, f"licence {lic!r}"))
                continue
            if info.get("width", 0) < 640 or not info.get("mime", "").startswith("image/"):
                skipped.append((rid, "too small"))
                continue
            raw = fetch(info.get("thumburl") or info["url"])
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            img.thumbnail((960, 960))
            img.save(dest, "WEBP", quality=78, method=6)
            credits[rid] = {
                "file": ftitle,
                "author": strip_html(meta.get("Artist", {}).get("value", "")) or "Unknown",
                "license": lic,
                "licenseUrl": meta.get("LicenseUrl", {}).get("value", ""),
                "source": info.get("descriptionurl", ""),
            }
            print(f"ok   {rid:28} {lic:14} {ftitle}")
            time.sleep(1.5)
        except Exception as e:  # keep going; report at the end
            skipped.append((rid, f"error {e}"))

    CREDITS.write_text(json.dumps(dict(sorted(credits.items())), indent=2, ensure_ascii=False), encoding="utf-8")
    for rid, why in skipped:
        print(f"skip {rid:28} {why}")
    print(f"\n{len(credits)} credited photos; {len(skipped)} skipped")


if __name__ == "__main__":
    main()
