#!/usr/bin/env python3
"""verify_lang.py — 驗證語言切換：預設英文 → 切中文 → 切回英文，版本徽章一直在。

用法：python3 tools/verify_lang.py [--url 線上網址]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import re
import socket
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
CJK = re.compile(r"[\u4e00-\u9fff]")


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def serve(d: pathlib.Path, port: int):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(d))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def ui_text(page) -> str:
    return page.evaluate("document.body.innerText")


def open_settings(page) -> None:
    page.evaluate("window.__game.ui.openTab('settings')")
    page.wait_for_timeout(350)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="")
    args = ap.parse_args()

    port = free_port()
    srv = None if args.url else serve(ROOT / "dist", port)
    target = args.url or f"http://127.0.0.1:{port}/"
    ok = True
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.goto(target, wait_until="load")
            page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
            page.wait_for_timeout(700)

            t = ui_text(page)
            en_ok = not CJK.search(t)
            badge = page.evaluate("document.getElementById('verBadge')?.textContent || ''")
            print(f"預設：英文={en_ok}｜版本徽章={badge!r}")
            ok &= en_ok and badge.startswith("v")

            open_settings(page)
            page.click("[data-lang='zh']")
            page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
            page.wait_for_timeout(900)
            t2 = ui_text(page)
            zh_ok = bool(CJK.search(t2))
            badge2 = page.evaluate("document.getElementById('verBadge')?.textContent || ''")
            lang_attr = page.evaluate("document.documentElement.lang")
            url2 = page.url
            print(f"切中文：中文介面={zh_ok}｜lang={lang_attr}｜版本={badge2!r}｜url 含 lang=zh={'lang=zh' in url2}")
            ok &= zh_ok and lang_attr.startswith("zh") and badge2.startswith("v")

            open_settings(page)
            page.click("[data-lang='en']")
            page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
            page.wait_for_timeout(900)
            t3 = ui_text(page)
            en2 = not CJK.search(t3)
            print(f"切回英文：英文介面={en2}")
            ok &= en2

            b.close()
    finally:
        if srv:
            srv.shutdown()

    print("✓ 全部通過" if ok else "✗ 有項目失敗")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
