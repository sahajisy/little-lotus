"""Check that every text file holds exactly the caption lines of its VTT file.

Independent of the converter: from the raw VTT it removes only the WEBVTT
header block, NOTE/STYLE/REGION blocks, cue identifier lines (the line right
before a timing line) and timing lines, then requires the text file to be
identical line for line. Usage: python3 -I verify_text.py <base_dir>
"""
import pathlib
import sys

base = pathlib.Path(sys.argv[1])
ok, bad = 0, []
for v in sorted((base / "vtt").glob("*.vtt")):
    vid, lang = v.name[:-4].rsplit(".", 1)
    src = [l.rstrip("\r") for l in v.read_text(encoding="utf-8").splitlines()]
    # Split into blank-line separated blocks.
    blocks, cur = [], []
    for l in src:
        if l.strip() == "":
            if cur:
                blocks.append(cur)
            cur = []
        else:
            cur.append(l)
    if cur:
        blocks.append(cur)
    exp = []
    for blk in blocks:
        t = next((i for i, l in enumerate(blk) if "-->" in l), None)
        if t is None:
            continue  # header, NOTE, STYLE or REGION block: no caption text
        exp.extend(blk[t + 1:])  # lines before the timing line are the cue identifier
    got = (base / "text" / lang / f"{vid}.txt").read_text(encoding="utf-8").splitlines()
    if exp == got:
        ok += 1
    else:
        bad.append(v.name)
print(f"verified {ok} files identical to their captions; {len(bad)} different")
for name in bad[:20]:
    print("  different:", name)
