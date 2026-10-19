"""Fetch the public YouTube title and channel for every talk with English captions.

Resumable: results are cached in <base>/meta/titles.json after every request.
Usage: python3 -I fetch_titles.py <base_dir>
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

base = pathlib.Path(sys.argv[1])
out = base / "meta" / "titles.json"
out.parent.mkdir(parents=True, exist_ok=True)
cache = json.loads(out.read_text()) if out.exists() else {}

ids = sorted(p.name[: -len(".txt")] for p in (base / "text" / "en").glob("*.txt"))
todo = [i for i in ids if i not in cache]
print(f"{len(ids)} talks, {len(todo)} to fetch", flush=True)

for n, vid in enumerate(todo, 1):
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
        f"https://www.youtube.com/watch?v={vid}", safe="")
    entry = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                d = json.load(r)
            entry = {"title": d.get("title", ""), "channel": d.get("author_name", "")}
            break
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):  # private, removed or embedding disabled
                entry = {"title": "", "channel": "", "error": e.code}
                break
            time.sleep(5 * (attempt + 1))
        except Exception:
            time.sleep(5 * (attempt + 1))
    if entry is not None:
        cache[vid] = entry
        out.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    if n % 100 == 0:
        print(f"{n}/{len(todo)}", flush=True)
    time.sleep(0.3)

missing = [i for i in ids if not cache.get(i, {}).get("title")]
print(f"done; {len(ids) - len(missing)} titled, {len(missing)} without title", flush=True)
