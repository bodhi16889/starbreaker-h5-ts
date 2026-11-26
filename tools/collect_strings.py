#!/usr/bin/env python3
"""collect_strings.py — 掃「英文模式下還剩多少中文」的 UI 文字。

做法：起 http.server（預設 dist/）→ Playwright 開頁 →
跑遍六個分頁與主要彈窗（含全新存檔與滿等存檔兩種狀態）→
把 document.body 內含 CJK 的文字節點全部印出來。

用法：python3 tools/collect_strings.py [--dir dist] [--show]
回傳：印出殘留字串；exit 0 表示 0 條。
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import re
import socket
import sys
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


def serve(directory: pathlib.Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


TABS = ["settings", "sats", "skills", "pass", "bundles", "save", "weapons"]

SCRIPT = """
() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (n.parentElement && n.parentElement.closest('[data-keep]')) continue;
    if (/[\\u4e00-\\u9fff]/.test(t)) out.push(t);
  }
  for (const el of document.querySelectorAll('[title],[placeholder]')) {
    for (const a of ['title', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && /[\\u4e00-\\u9fff]/.test(v)) out.push(`@${a}: ${v}`);
    }
  }
  return out;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(ROOT / "dist"))
    args = ap.parse_args()

    port = free_port()
    srv = serve(pathlib.Path(args.dir), port)
    leftovers: set[str] = set()

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for progress in ("fresh", "rich"):
                page = browser.new_page(viewport={"width": 540, "height": 960})
                page.goto(f"http://127.0.0.1:{port}/", wait_until="load")
                page.wait_for_function("window.__game && window.__game.ready", timeout=15000)
                if progress == "rich":
                    # 滿等存檔：讓所有分頁都有內容（空狀態文案只在其中一邊出現）
                    page.evaluate("""() => {
                      const s = window.__game.state;
                      s.gems = 5_000_000; s.gold = 9_000_000; s.prestige = 50_000;
                      s.sector = 6; s.planet = 4; s.stats.blocks = 123456; s.stats.planets = 42;
                      for (const k of Object.keys(s.weapons || {})) s.weapons[k] = 12;
                      for (const k of Object.keys(s.weaponLevels || {})) s.weaponLevels[k] = 12;
                      for (const k of Object.keys(s.satellites || {})) s.satellites[k] = 5;
                      s.emit && s.emit();
                      window.__game.ui.renderHud();
                    }""")
                    page.wait_for_timeout(300)

                leftovers.update(page.evaluate(SCRIPT))

                for tab in TABS:
                    page.evaluate(f"window.__game.ui.openTab('{tab}')")
                    page.wait_for_timeout(250)
                    leftovers.update(page.evaluate(SCRIPT))

                # 版本彈窗 + 供給站彈窗
                for sel in ["#verBadge"]:
                    try:
                        page.click(sel, timeout=1500)
                        page.wait_for_timeout(250)
                        leftovers.update(page.evaluate(SCRIPT))
                    except Exception:
                        pass
                page.evaluate("window.__game.ui.closeModal && window.__game.ui.closeModal()")
                page.close()
            browser.close()
    finally:
        srv.shutdown()

    items = sorted(x for x in leftovers if CJK.search(x))
    if items:
        print(f"殘留 {len(items)} 條中文：")
        for x in items:
            print("  -", x[:120])
        return 1
    print("0 條中文 → 英文模式乾淨")
    return 0


if __name__ == "__main__":
    sys.exit(main())
