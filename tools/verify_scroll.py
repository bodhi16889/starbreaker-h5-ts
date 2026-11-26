#!/usr/bin/env python3
"""verify_scroll.py — 用「真實 touch 事件」驗證彈窗可捲動（手機滑不動的守門測試）。

Playwright 的 touchscreen.tap() 不能拖曳，所以走 CDP Input.dispatchTouchEvent。
斷言：.modal-card 的 scrollTop 在 touchStart → 10×touchMove → touchEnd 之後有增加。

用法：python3 tools/verify_scroll.py [--sdk on|off]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import socket
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


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


def swipe_up(cdp, x: int, y0: int, y1: int, steps: int = 10) -> None:
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart",
                                          "touchPoints": [{"x": x, "y": y0}]})
    for i in range(1, steps + 1):
        y = y0 + (y1 - y0) * i / steps
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove",
                                              "touchPoints": [{"x": x, "y": int(y)}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sdk", default="on", choices=["on", "off"])
    ap.add_argument("--height", type=int, default=700, help="模擬有網址列的 iPhone 可見高度")
    args = ap.parse_args()

    port = free_port()
    srv = serve(ROOT / "dist", port)
    ok_all = True
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 390, "height": args.height}, is_mobile=True, has_touch=True)
            if args.sdk == "off":
                ctx.route("**/gamepix.sdk.js", lambda r: r.abort())
            page = ctx.new_page()
            page.goto(f"http://127.0.0.1:{port}/", wait_until="load")
            page.wait_for_function("window.__game && window.__game.ready", timeout=15000)
            page.wait_for_timeout(900)

            # 開 Armory（10 把武器，內容一定超過一屏）
            page.evaluate("window.__game.ui.openTab('weapons')")
            page.wait_for_timeout(400)

            ta = page.evaluate("getComputedStyle(document.querySelector('.modal-card')).touchAction")
            scrollable = page.evaluate(
                "(() => { const e = document.querySelector('.modal-card');"
                " return e.scrollHeight - e.clientHeight; })()")
            cdp = ctx.new_cdp_session(page)
            before = page.evaluate("document.querySelector('.modal-card').scrollTop")
            swipe_up(cdp, 195, args.height - 120, 180)
            page.wait_for_timeout(500)
            after = page.evaluate("document.querySelector('.modal-card').scrollTop")

            print(f"SDK={args.sdk}  .modal-card touch-action = {ta}")
            print(f"可捲動距離 = {scrollable}px ｜ 手勢前 {before} → 後 {after}")
            if scrollable <= 0:
                print("✓ 內容不足一屏（沒有可捲動距離，不算失敗）")
                good = True
            else:
                good = after > before + 20
                print(f"{'✓' if good else '✗'} 真實手勢可捲動")
            ok_all &= good
            b.close()
    finally:
        srv.shutdown()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
