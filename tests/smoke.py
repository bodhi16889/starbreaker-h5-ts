#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""StarBreaker H5 (Vite + TS) smoke 测试

用法：
  npm run build && /usr/bin/python3 tests/smoke.py
"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
PORT = 8911
PASS, FAIL = [], []


def ok(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=DIST))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()


def main():
    if not os.path.exists(os.path.join(DIST, "index.html")):
        print("先跑 npm run build（找不到 dist/index.html）")
        return 1
    serve()
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        p = ctx.new_page()
        errs, console_errs = [], []
        p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.on("console", lambda m: console_errs.append(m.text[:200]) if m.type == "error" else None)

        p.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
        p.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(1.2)

        info = p.evaluate("({ver: __game.version, blocks: __game.blocks().length, alive: __game.blocks().filter(b=>b.alive).length, fps: __game.fps()})")
        ok("載入完成、星球已生成", info["blocks"] > 50, json.dumps(info))
        ok("版本徽章顯示版本", p.eval_on_selector("#verBadge", "e => e.textContent.trim()") == "v" + info["ver"])

        # 戰鬥：6 秒內要有方塊被擊破、金幣要進帳
        killed0 = p.evaluate("__game.state.stats.blocks")
        gold0 = p.evaluate("__game.state.gold")
        time.sleep(6)
        after = p.evaluate("({killed: __game.state.stats.blocks, planets: __game.state.stats.planets, gold: __game.state.gold, fps: __game.fps()})")
        ok("6 秒內有方塊被擊破", after["killed"] > killed0, f"{killed0} → {after['killed']} 顆")
        ok("戰鬥會推進星球進度", after["planets"] >= 1 or after["killed"] > killed0, f"planets={after['planets']}")
        ok("金幣有進帳", after["gold"] > gold0, f"{gold0} → {after['gold']}")
        ok("FPS ≥ 30", after["fps"] >= 30, f"{after['fps']} fps")

        # 五個分頁
        tabs = p.eval_on_selector_all("#tabs button", "els => els.map(e => e.dataset.tab)")
        ok("五個分頁", tabs == ["weapons", "sats", "skills", "pass", "bundles"], str(tabs))

        # 武器 +1 / +10
        p.evaluate("__game.state.gold = 1e9; __game.state.emit()")
        p.evaluate("__game.ui.openTab('weapons')")
        time.sleep(0.4)
        ok("每把武器有 +1 與 +10", p.eval_on_selector_all("[data-upw]", "e=>e.length") == 10
           and p.eval_on_selector_all("[data-upw10]", "e=>e.length") == 10)
        lv0 = p.evaluate("__game.state.weaponLevel('gatling')")
        p.click('[data-upw10="gatling"]')
        time.sleep(0.3)
        lv1 = p.evaluate("__game.state.weaponLevel('gatling')")
        ok("連升 +10 加 10 級", lv1 - lv0 == 10, f"{lv0} → {lv1}")

        # 衛星 +5
        p.evaluate("__game.state.gems = 1e8; __game.ui.openTab('sats')")
        time.sleep(0.4)
        p.click('[data-ups5="beam"]')
        time.sleep(0.3)
        ok("衛星升 +5 到滿星", p.evaluate("__game.state.satLevel('beam')") == 5,
           str(p.evaluate("__game.state.satLevel('beam')")))

        # 補給站（五項）
        p.evaluate("__game.ui.closeModal()")
        time.sleep(0.2)
        p.click("#btnSupply")
        time.sleep(0.4)
        kinds = p.eval_on_selector_all("[data-sup]", "els=>els.map(e=>e.dataset.sup)")
        ok("補給站五項", kinds == ["gems", "prestige", "weapons", "satellites", "all"], str(kinds))
        p.evaluate("__game.state.gems = 0; __game.state.prestige = 0; __game.state.gold = 0")
        p.click('[data-sup="all"]')
        time.sleep(0.5)
        sup = p.evaluate("({g: __game.state.gems, p: __game.state.prestige, gold: __game.state.gold, sats: Object.values(__game.state.satellites).filter(v=>v>=5).length, w: Math.min(...Object.values(__game.state.weapons))})")
        ok("All-In-One 拉滿資源與等級",
           sup["g"] >= 1e6 and sup["p"] >= 1e6 and sup["gold"] >= 1e8 and sup["sats"] == 6 and sup["w"] >= 10,
           json.dumps(sup))

        # 通行證 50 階
        p.evaluate("__game.state.passClaimed = {}; __game.ui.openTab('pass')")
        time.sleep(0.4)
        ok("通行證列 50 階", p.eval_on_selector_all("[data-pass]", "e=>e.length") == 50)
        p.click('[data-pass="7"]')
        time.sleep(0.3)
        ok("可單階領取", p.evaluate("__game.state.passClaimed['7'] === true") is True)
        p.click("#btnPassAll")
        time.sleep(0.5)
        ok("一鍵全領 50 階", p.evaluate("Object.keys(__game.state.passClaimed).length") == 50)

        # 禮包
        p.evaluate("__game.state.bundles = {}; __game.ui.openTab('bundles')")
        time.sleep(0.4)
        ids = p.eval_on_selector_all("[data-bundle]", "els=>els.map(e=>e.dataset.bundle)")
        ok("三個 FREE 禮包", ids == ["starter_pack", "unlimited_drill_pack", "all_satellites_pack"], str(ids))
        p.evaluate("__game.state.weapons = {}", )
        p.click('[data-bundle="unlimited_drill_pack"]')
        time.sleep(0.4)
        ok("全武器精通禮包 → 每把 +25", p.evaluate("Math.min(...Object.values(__game.state.weapons))") == 25,
           str(p.evaluate("Object.values(__game.state.weapons)")))

        # 技能：百連 + 一鍵融合
        p.evaluate("__game.state.gems = 1e7; __game.state.skills = {}; __game.ui.openTab('skills')")
        time.sleep(0.4)
        p.click("#btnRoll100")
        time.sleep(0.5)
        n0 = p.evaluate("Object.values(__game.state.skills).reduce((a,b)=>a+b,0)")
        ok("百連抽有技能", n0 >= 1, str(n0))
        p.click("#btnFuse")
        time.sleep(0.4)
        n1 = p.evaluate("Object.values(__game.state.skills).reduce((a,b)=>a+b,0)")
        ok("融合後總數下降", n1 < n0, f"{n0} → {n1}")

        # 存檔：重新載入要保留（localStorage）
        before = p.evaluate("({g: __game.state.gold, w: __game.state.weaponLevel('gatling')})")
        p.reload(wait_until="load")
        p.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(0.8)
        after2 = p.evaluate("({g: __game.state.gold, w: __game.state.weaponLevel('gatling')})")
        ok("重新整理後讀回存檔", abs(after2["g"] - before["g"]) < max(5000, before["g"] * 0.2) and after2["w"] == before["w"],
           json.dumps({"before": before, "after": after2}))

        # 640×480（GamePix iframe）可玩、無橫向溢出
        p.set_viewport_size({"width": 640, "height": 480})
        time.sleep(0.8)
        over = p.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        ok("640×480 無橫向溢出", over <= 0, f"+{over}px")
        # 清空星球到重生之間會有 0.2 秒空窗，最多等 3 秒
        alive640 = 0
        for _ in range(15):
            alive640 = p.evaluate("__game.blocks().filter(b=>b.alive).length")
            if alive640 > 0:
                break
            time.sleep(0.2)
        ok("640×480 可玩（有方塊）", alive640 > 0, f"{alive640} blocks")

        # 觸控拖曳 → 手動模式
        p.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.4)
        active = p.evaluate("""(() => { __game.combat.pointerDown(0, 0, 1); __game.combat.pointerMove(40, 20, 1);
            const m = __game.combat.manual; __game.combat.pointerUp(1); return m; })()""")
        ok("按下拖曳會進入手動模式", active is True)

        ok("零 pageerror", len(errs) == 0, str(errs[:2]))
        ok("零 console error", len(console_errs) == 0, str(console_errs[:2]))

        p.evaluate("__game.state.gold = 1e6; __game.state.gems = 1e6")
        time.sleep(1.5)
        p.screenshot(path=os.path.join(ROOT, "artifacts", "ts-game.png"))
        b.close()

    print(f"\n{'='*46}\n{len(PASS)} PASS / {len(FAIL)} FAIL")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
