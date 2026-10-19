"""Convert WebVTT caption files to plain text, word for word.

Only structural VTT lines are dropped (the WEBVTT header, NOTE blocks, cue
numbers and timing lines). Every caption line is copied unchanged, one per
line, in the original order. Nothing is rewritten, merged or corrected.

Usage: python3 -I vtt_to_text.py <vtt_dir> <out_dir>
Writes <out_dir>/<lang>/<video_id>.txt for every <video_id>.<lang>.vtt.
"""
import pathlib
import re
import sys

TIMING = re.compile(r"^\s*(\d+:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+")


def caption_lines(text):
    lines = text.splitlines()
    i = 0
    if lines and lines[0].lstrip("﻿").startswith("WEBVTT"):
        i = 1
    out = []
    in_cue = False
    skipping_block = False
    for raw in lines[i:]:
        line = raw.rstrip("\r")
        if line.strip() == "":
            in_cue = False
            skipping_block = False
            continue
        if skipping_block:
            continue
        if not in_cue and line.startswith(("NOTE", "STYLE", "REGION")):
            skipping_block = True
            continue
        if TIMING.match(line):
            in_cue = True
            continue
        if in_cue:
            out.append(line)
        # Anything else outside a cue is a cue identifier; drop it.
    return out


def main(vtt_dir, out_dir):
    vtt_dir, out_dir = pathlib.Path(vtt_dir), pathlib.Path(out_dir)
    count = 0
    for vtt in sorted(vtt_dir.rglob("*.vtt")):
        stem = vtt.name[: -len(".vtt")]
        video_id, _, lang = stem.rpartition(".")
        if not video_id:
            continue
        lines = caption_lines(vtt.read_text(encoding="utf-8", errors="strict"))
        dest = out_dir / lang / f"{video_id}.txt"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
        count += 1
    print(f"wrote {count} text files to {out_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
