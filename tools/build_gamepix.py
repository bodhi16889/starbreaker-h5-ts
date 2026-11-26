#!/usr/bin/env python3
"""build_gamepix.py — 把 Vite 的 dist/ 打成 GamePix 送審 ZIP。

規則（任一不過就非 0 結束）：
  1. index.html 必須在 ZIP 根目錄
  2. 外部網址只允許 integration.gamepix.com（GamePix SDK）
  3. 不得有 alert( / confirm( / prompt(
  4. 不得引用 version.json / manifest / serviceWorker（平台 iframe 內會 404）
  5. Title 字串必須存在

用法：python3 tools/build_gamepix.py
"""
from __future__ import annotations

import hashlib
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = DIST / "starbreaker-gamepix.zip"
TITLE = "StarBreaker: Unlimited Drill"
ALLOWED_HOSTS = {"integration.gamepix.com"}

TEXT_EXT = {".html", ".js", ".css", ".json", ".svg"}

problems: list[str] = []


def files_to_pack() -> list[pathlib.Path]:
    out = [DIST / "index.html"]
    out += sorted(p for p in (DIST / "assets").rglob("*") if p.is_file())
    # version.json 不進包（平台 iframe 內無用，還會多一筆 404）
    return out


def check_urls(name: str, text: str) -> None:
    for m in re.finditer(r"https?://([a-zA-Z0-9._-]+)", text):
        host = m.group(1).lower()
        if host in ALLOWED_HOSTS or host.endswith("www.w3.org"):
            continue
        problems.append(f"{name}: 外部網址 http://{host}")


def check_file(name: str, text: str) -> None:
    check_urls(name, text)
    for bad in ("alert(", "confirm(", "prompt("):
        if bad in text:
            problems.append(f"{name}: 含禁用 API {bad}")
    if re.search(r"version\.json|manifest\.webmanifest|serviceWorker", text):
        problems.append(f"{name}: 引用 version.json / manifest / serviceWorker")


def main() -> int:
    if not (DIST / "index.html").exists():
        print("找不到 dist/index.html，先跑 npm run build")
        return 1

    idx = (DIST / "index.html").read_text(encoding="utf-8")
    if TITLE not in idx:
        problems.append(f"index.html: 找不到 Title「{TITLE}」")
    if "integration.gamepix.com/sdk/v3/gamepix.sdk.js" not in idx:
        problems.append("index.html: 沒載入 GamePix SDK v3")
    if "GamePixConfig" not in idx:
        problems.append("index.html: 缺 window.GamePixConfig（lifecycle: manual）")

    for p in files_to_pack():
        if p.suffix in TEXT_EXT:
            check_file(p.name, p.read_text(encoding="utf-8", errors="ignore"))

    if problems:
        print("打包失敗：")
        for x in problems:
            print("  -", x)
        return 1

    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files_to_pack():
            z.write(p, p.relative_to(DIST).as_posix())

    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        if "index.html" not in names:
            print("ZIP 根目錄沒有 index.html")
            return 1
        # 解壓後再驗一次網址（不是只看來源檔）
        for n in names:
            if pathlib.Path(n).suffix in TEXT_EXT:
                check_urls(f"zip:{n}", z.read(n).decode("utf-8", errors="ignore"))
        bad = z.testzip()
        if bad:
            print("ZIP 損壞於", bad)
            return 1

    sha = hashlib.sha256(OUT.read_bytes()).hexdigest()
    print(f"✓ {OUT.relative_to(ROOT)}  {OUT.stat().st_size:,} bytes")
    print(f"  sha256 {sha}")
    print(f"  entries {len(names)}: index.html + {len(names)-1} 個 assets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
