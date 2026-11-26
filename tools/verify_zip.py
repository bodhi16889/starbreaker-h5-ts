#!/usr/bin/env python3
"""verify_zip.py — 對「要送審的那一包」實跑驗證（不是只看來源檔）。

流程：解壓 → 起 http.server → Playwright 開頁 → 斷言
  1. __game.ready 且版本正確
  2. 0 pageerror / 0 console error
  3. GamePix lifecycle 序列含 loading:100 → loaded → gameStart
  4. 載入畫面已移除
  5. 非 Player 環境 adsAllowed() === false（公開頁不會亂彈假廣告）
  6. 連續 clearing 星球時畫面仍有進展（blocks 會減少）

用法：python3 tools/verify_zip.py [--zip dist/starbreaker-gamepix.zip] [--shots 目錄]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import socket
import sys
import tempfile
import threading
import zipfile

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, bool(ok), detail))
    print(f"{'✓' if ok else '✗'} {name}{('  — ' + detail) if detail else ''}")


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def serve(directory: pathlib.Path, port: int) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", default=str(ROOT / "dist" / "starbreaker-gamepix.zip"))
    ap.add_argument("--shots", default="")
    args = ap.parse_args()

    zpath = pathlib.Path(args.zip)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="sb-gpx-"))
    with zipfile.ZipFile(zpath) as z:
        z.extractall(tmp)
    check("ZIP 解壓成功", (tmp / "index.html").exists(), str(zpath.name))

    port = free_port()
    srv = serve(tmp, port)
    url = f"http://127.0.0.1:{port}/"

    errors: list[str] = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={"width": 540, "height": 960}, device_scale_factor=2)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

            page.goto(url, wait_until="load")
            page.wait_for_function("window.__game && window.__game.ready", timeout=15000)

            check("__game.ready", True)
            ver = page.evaluate("window.__game.version")
            check("版本字串", bool(ver), str(ver))

            page.wait_for_timeout(1200)  # 等 loaded() 與 gameStart
            log = page.evaluate("window.__game.ads.log")
            joined = " ".join(log)
            check("lifecycle loading:100", "loading:100" in joined, joined[:120])
            check("lifecycle loaded", "loaded" in joined)
            check("lifecycle gameStart", "gameStart" in joined)
            check("pause/resume 已註冊", "events bound" in joined, joined[-60:])
            check("載入畫面已移除", page.evaluate("!!document.getElementById('loading')") is False)

            allowed = page.evaluate("window.__game.ads.adsAllowed()")
            check("非 Player 環境 adsAllowed=false", allowed is False, f"adsAllowed={allowed}")

            # 遊戲真的在跑：擊破數會增加
            before = page.evaluate("window.__game.state.stats.blocks")
            page.wait_for_timeout(1500)
            after = page.evaluate("window.__game.state.stats.blocks")
            check("戰鬥有進展（blocks 增加）", after > before, f"{before} → {after}")

            fps = page.evaluate("window.__game.fps()")
            check("FPS ≥ 40", fps >= 40, f"{fps} fps")

            check("0 頁面錯誤", not errors, "; ".join(errors[:3]))

            if args.shots:
                out = pathlib.Path(args.shots)
                out.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(out / "fps-check.png"))
            browser.close()
    finally:
        srv.shutdown()

    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
