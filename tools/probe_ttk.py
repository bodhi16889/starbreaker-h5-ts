#!/usr/bin/env python3
"""probe_ttk.py — 量各星區「每顆方塊要打多久」（找平衡牆在哪）。

用法：python3 tools/probe_ttk.py [--sectors 1,5,10,15,20,30,38] [--secs 8]
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
DIST = ROOT / "dist"


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


SETUP = """([sector, planet, wlv]) => {
  const g = window.__game, s = g.state;
  s.sector = sector; s.planet = planet;
  s.gems = 1e9; s.gold = 1e12; s.prestige = s.prestige || 0;
  for (const k of Object.keys(s.weapons)) s.weapons[k] = wlv;
  g.planet.build(sector, planet);
  g.combat.reset();
  g.ui.renderHud();
  return {
    hp: Math.max(...g.planet.blocks.map(b => b.maxHp)),
    blocks: g.planet.blocks.length,
    dps: g.state.estimatedDps ? g.state.estimatedDps() : null,
  };
}"""

SAMPLE = """() => ({ alive: window.__game.planet.aliveCount(), total: window.__game.planet.blocks.length })"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sectors", default="1,5,10,15,20,25,30,38")
    ap.add_argument("--secs", type=float, default=8.0)
    ap.add_argument("--wlv", type=int, default=0, help="0 = 依星區自動給合理等級")
    ap.add_argument("--wlv-formula", default="10+4*(s-1)", help="例如 8+1.6*(s-1)")
    args = ap.parse_args()

    sectors = [int(x) for x in args.sectors.split(",")]
    port = free_port()
    srv = serve(DIST, port)

    print(f"{'星區':>4} {'武器Lv':>6} {'方塊數':>6} {'單塊HP':>14} {'擊破':>8} {'每顆星球':>10}")
    print("-" * 56)
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            page = b.new_page(viewport={"width": 540, "height": 960})
            page.goto(f"http://127.0.0.1:{port}/", wait_until="load")
            page.wait_for_function("window.__game && window.__game.ready", timeout=15000)

            for sec in sectors:
                wlv = args.wlv or int(eval(args.wlv_formula, {"s": sec}))  # noqa: S307
                info = page.evaluate(SETUP, [sec, 1, wlv])
                page.wait_for_timeout(400)
                # 核心一死就自動進下一顆星球，所以量「每分鐘清幾顆」而不是等 aliveCount=0
                t0 = page.evaluate("performance.now()")
                p0 = page.evaluate("window.__game.state.stats.planets")
                b0 = page.evaluate("window.__game.state.stats.blocks")
                page.wait_for_timeout(args.secs * 1000)
                p1 = page.evaluate("window.__game.state.stats.planets")
                b1 = page.evaluate("window.__game.state.stats.blocks")
                planets = p1 - p0
                kills = b1 - b0
                per = (args.secs / planets) if planets else float("inf")
                print(f"{sec:>4} {wlv:>6} {info['blocks']:>6} {info['hp']:>14,} {kills:>8} "
                      f"{('∞' if planets == 0 else f'{per:.0f}s'):>10}")
            b.close()
    finally:
        srv.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
