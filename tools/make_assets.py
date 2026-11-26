#!/usr/bin/env python3
"""make_assets.py — 產 GamePix 送審素材（實拍遊戲畫面 + 程序化封面／Icon）。

輸出到 gamepix/assets/：
  screenshot-1..4.png   1080×1920（viewport 540×960, dsf=2）
  cover.png             1360×850   ≤1.5 MB（只有遊戲名稱）
  icon.png              256×256    ≤1 MB

用法：python3 tools/make_assets.py
"""
from __future__ import annotations

import functools
import http.server
import pathlib
import socket
import threading

from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = ROOT / "gamepix" / "assets"
TITLE = "StarBreaker: Unlimited Drill"

COVER_HTML = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ width: 1360px; height: 850px; overflow: hidden;
    background: radial-gradient(120% 120% at 22% 18%, #16284d 0%, #0a1020 42%, #05070f 100%);
    font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif; color: #eaf4ff; }}
  .glow {{ position: absolute; border-radius: 50%; filter: blur(90px); opacity: .55; }}
  .g1 {{ width: 620px; height: 620px; left: -160px; top: -220px; background: #2f7bff; }}
  .g2 {{ width: 520px; height: 520px; right: -120px; bottom: -180px; background: #7a3dff; }}
  .wrap {{ position: relative; height: 100%; display: flex; align-items: center; gap: 46px; padding: 0 58px; }}
  .left {{ width: 700px; }}
  h1 {{ font-size: 92px; line-height: 1.02; letter-spacing: -.02em; font-weight: 800;
       text-shadow: 0 0 42px rgba(90,160,255,.45); }}
  h1 em {{ font-style: normal; color: #7ef0ff; }}
  .rule {{ width: 118px; height: 4px; border-radius: 2px; margin-top: 30px;
    background: linear-gradient(90deg, #4da3ff, #7ef0ff); }}
  .shot {{ position: relative; width: 470px; height: 790px; border-radius: 26px; overflow: hidden;
    border: 1px solid rgba(120,170,255,.35);
    box-shadow: 0 0 70px rgba(50,120,255,.45), inset 0 0 0 1px rgba(255,255,255,.05);
    background: #05070f; }}
  .shot img {{ width: 100%; height: 100%; object-fit: cover; object-position: center top; }}
  .planet {{ position: absolute; width: 560px; height: 560px; left: -190px; bottom: -300px; border-radius: 50%;
    background: radial-gradient(circle at 62% 30%, #4a9dff 0%, #1c4f9e 45%, #0a1a36 78%, #05070f 100%);
    box-shadow: 0 0 120px rgba(70,150,255,.45), inset -30px -40px 90px rgba(0,0,0,.65); opacity: .9; }}
  .ring {{ position: absolute; width: 820px; height: 250px; left: -420px; bottom: -140px;
    border: 2px solid rgba(126,240,255,.35); border-radius: 50%; transform: rotate(-14deg);
    box-shadow: 0 0 40px rgba(126,240,255,.25); }}
  .stars {{ position: absolute; inset: 0;
    background-image:
      radial-gradient(1.6px 1.6px at 18% 22%, #cfe4ff 40%, transparent 41%),
      radial-gradient(1.4px 1.4px at 42% 68%, #9fc8ff 40%, transparent 41%),
      radial-gradient(1.2px 1.2px at 66% 30%, #ffffff 40%, transparent 41%),
      radial-gradient(1.5px 1.5px at 12% 78%, #a9d4ff 40%, transparent 41%),
      radial-gradient(1.2px 1.2px at 30% 46%, #dbeaff 40%, transparent 41%);
    opacity: .55; }}
</style></head>
<body>
  <div class="stars"></div><div class="planet"></div><div class="ring"></div>
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="wrap">
    <div class="left"><h1>StarBreaker:<br><em>Unlimited Drill</em></h1><div class="rule"></div></div>
    <div class="shot"><img src="shot.png" alt=""></div>
  </div>
</body></html>"""

ICON_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 256px; height: 256px; overflow: hidden;
    background: radial-gradient(120% 120% at 50% 40%, #14264a 0%, #070b16 70%, #05070f 100%);
    display: grid; place-items: center; }
  .p { position: relative; width: 168px; height: 168px; border-radius: 50%;
    background: radial-gradient(circle at 38% 32%, #3fa7ff 0%, #1b4c9e 55%, #0b1c3a 100%);
    box-shadow: 0 0 44px rgba(70,150,255,.75), inset -10px -14px 26px rgba(0,0,0,.55); }
  .p::after { content: ""; position: absolute; inset: -20px; border-radius: 50%;
    border: 3px solid rgba(126,240,255,.55); transform: rotate(-18deg) scaleX(1.22);
    box-shadow: 0 0 22px rgba(126,240,255,.55); }
  .core { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px;
    border-radius: 12px; background: linear-gradient(160deg, #fff2b0, #ffb84d);
    box-shadow: 0 0 26px rgba(255,190,80,.95); transform: rotate(45deg); }
</style></head>
<body><div class="p"><div class="core"></div></div></body></html>"""


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


def seed(page, *, gems: int, gold: int, sector: int, planet: int) -> None:
    page.evaluate(
        """([gems, gold, sector, planet]) => {
          const s = window.__game.state;
          s.gems = gems; s.gold = gold; s.sector = sector; s.planet = planet;
          window.__game.planet.build(sector, planet);
          window.__game.ui.renderHud();
        }""",
        [gems, gold, sector, planet],
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    port = free_port()
    srv = serve(DIST, port)
    url = f"http://127.0.0.1:{port}/"

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()

            # ---------- 遊戲截圖 1080×1920 ----------
            page = browser.new_page(viewport={"width": 540, "height": 960}, device_scale_factor=2)
            page.goto(url, wait_until="load")
            page.wait_for_function("window.__game && window.__game.ready", timeout=15000)
            page.wait_for_timeout(1500)

            # 1) 早期星球：方塊密集、衛星環繞
            seed(page, gems=4820, gold=1_240_000, sector=2, planet=5)
            page.wait_for_timeout(2200)
            page.screenshot(path=str(OUT / "screenshot-1.png"))
            page.evaluate("window.__game.ads && (void 0)")

            # 2) 後期星球：打擊特效多、數字大
            seed(page, gems=128_400, gold=8_960_000, sector=7, planet=12)
            page.wait_for_timeout(2600)
            page.screenshot(path=str(OUT / "screenshot-2.png"))

            # 3) 技能融合
            page.evaluate("window.__game.state.gems = 48000; window.__game.ui.openTab('skills')")
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / "screenshot-3.png"))

            # 4) 衛星
            page.evaluate("window.__game.ui.openTab('sats')")
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / "screenshot-4.png"))
            page.close()

            # ---------- 封面 1360×850 ----------
            tmp = ROOT / "gamepix"
            (tmp / "shot.png").write_bytes((OUT / "screenshot-1.png").read_bytes())
            (tmp / "cover.html").write_text(COVER_HTML, encoding="utf-8")
            (tmp / "icon.html").write_text(ICON_HTML, encoding="utf-8")

            cpage = browser.new_page(viewport={"width": 1360, "height": 850}, device_scale_factor=1)
            cpage.goto(f"file://{tmp / 'cover.html'}", wait_until="load")
            cpage.wait_for_timeout(600)
            cpage.screenshot(path=str(OUT / "cover.png"))
            cpage.close()

            ipage = browser.new_page(viewport={"width": 256, "height": 256}, device_scale_factor=1)
            ipage.goto(f"file://{tmp / 'icon.html'}", wait_until="load")
            ipage.wait_for_timeout(400)
            ipage.screenshot(path=str(OUT / "icon.png"))
            ipage.close()

            browser.close()
    finally:
        srv.shutdown()

    # ---------- 規格驗證 ----------
    expect = {
        "screenshot-1.png": (1080, 1920),
        "screenshot-2.png": (1080, 1920),
        "screenshot-3.png": (1080, 1920),
        "screenshot-4.png": (1080, 1920),
        "cover.png": (1360, 850),
        "icon.png": (256, 256),
    }
    ok = True
    for name, (w, h) in expect.items():
        p = OUT / name
        im = Image.open(p)
        kb = p.stat().st_size / 1024
        limit = 1536 if name == "cover.png" else 1024 if name == "icon.png" else 10240
        good = im.size == (w, h) and kb <= limit
        ok &= good
        print(f"{'✓' if good else '✗'} {name:<18} {im.size[0]}×{im.size[1]}  {kb:7.1f} KB")
    print("\n素材輸出：", OUT)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
