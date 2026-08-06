"""Build the minimal Cloudflare Pages static output."""

from __future__ import annotations

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def main() -> int:
    DIST.mkdir(exist_ok=True)
    shutil.copy2(ROOT / "index.html", DIST / "index.html")
    print(f"Built {DIST / 'index.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
