#!/usr/bin/env python3
"""Rebuild DEVINE_MASTER_Trinity_standalone.html from modular sources.
Always run this after editing any css/js or DEVINE_MASTER.html.
Usage (from lab folder):
  python rebuild_standalone.py
"""
from pathlib import Path
import re

LAB = Path(__file__).resolve().parent

def main():
    html = (LAB / "DEVINE_MASTER.html").read_text(encoding="utf-8")
    for name in [
        "00-tokens.css",
        "module-devine-master.css",
        "module-sourcecast.css",
        "module-studiocraft.css",
    ]:
        css = (LAB / "css" / name).read_text(encoding="utf-8")
        html = html.replace(
            f'<link rel="stylesheet" href="css/{name}" />',
            f'<style id="{name}">\n{css}\n</style>',
            1,
        )
    for name in [
        "00-core.js",
        "module-devine-master.js",
        "module-sourcecast.js",
        "module-studiocraft.js",
    ]:
        js = (LAB / "js" / name).read_text(encoding="utf-8")
        html = html.replace(
            f'<script src="js/{name}"></script>',
            f'<script id="{name}">\n{js}\n</script>',
            1,
        )
    out = LAB / "DEVINE_MASTER_Trinity_standalone.html"
    out.write_text(html, encoding="utf-8")
    left_css = html.count('href="css/')
    left_js = html.count('src="js/')
    print(f"Wrote {out.name} ({out.stat().st_size} bytes)")
    if left_css or left_js:
        print(f"WARNING: remaining external refs css={left_css} js={left_js}")
    else:
        print("OK: fully inlined (no external css/js refs)")

if __name__ == "__main__":
    main()
