#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""存檔備份／跨裝置測試

用法：npm run build && /usr/bin/python3 tests/save.py
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
PORT = 8921
BASE = f"http://127.0.0.1:{PORT}/index.html"
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


def boot(page, url=BASE, pause=True):
    page.goto(url, wait_until="load")
    page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
    time.sleep(0.4)
    if pause:
        page.evaluate("__game.setPaused(true)")


def main():
    serve()
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])

        # ---------- 裝置 A ----------
        ctxA = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pA = ctxA.new_page()
        errs = []
        pA.on("pageerror", lambda e: errs.append(str(e)[:200]))
        boot(pA)

        ok("有『存檔』分頁", pA.eval_on_selector_all("#tabs button", "els=>els.map(e=>e.dataset.tab)")[-1] == "save")

        # 造一個可辨識的進度
        pA.evaluate("""(() => { const s = __game.state;
            s.gold = 1234567; s.gems = 89012; s.prestige = 4321; s.cores = 777;
            s.sector = 4; s.planet = 3; s.weapons.gatling = 17; s.satellites.beam = 4;
            s.skills = { dmg_epic: 2, crit_rare: 1 };
            s.passClaimed = { '1': true, '2': true };
            s.bundles = { starter_pack: true };
            s.stats.blocks = 24680; s.stats.planets = 13;
            s.save(); s.emit(); })()""")
        pA.evaluate("__game.ui.openTab('save')")
        time.sleep(0.5)
        code = pA.eval_on_selector("#saveCode", "e=>e.value")
        ok("匯出存檔碼格式 SB1.<base64>.<8碼>", code.startswith("SB1.") and len(code.split(".")) == 3,
           f"len={len(code)}")
        ok("存檔碼長度合理（<2000 字）", len(code) < 2000, str(len(code)))
        ok("存檔分頁有複製／下載／匯入按鈕",
           all(pA.eval_on_selector(sel, "e=>!!e") for sel in ["#btnCopyCode", "#btnDownloadSave", "#btnImportCode", "#importCode"]))
        ok("存檔碼可貼回驗證（校驗碼正確）",
           pA.evaluate("(c) => __game.state.previewCode(c).ok", code) is True)

        # 下載檔案（攔截 blob 內容）
        with pA.expect_download(timeout=8000) as dl_info:
            pA.click("#btnDownloadSave")
        dl = dl_info.value
        fname = dl.suggested_filename
        tmp = os.path.join(ROOT, "artifacts", fname)
        dl.save_as(tmp)
        payload = json.load(open(tmp, encoding="utf-8"))
        ok("下載的存檔檔是 JSON 且含資料",
           fname.endswith(".json") and "d" in payload and payload["d"]["sector"] == 4
           and payload["d"]["weapons"]["gatling"] == 17, fname)

        # ---------- 裝置 B：全新 context（模擬另一台） ----------
        ctxB = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pB = ctxB.new_page()
        pB.on("pageerror", lambda e: errs.append("B:" + str(e)[:200]))
        boot(pB)
        pB.evaluate("__game.setPaused(true)")
        before = pB.evaluate("({g: __game.state.gold, sector: __game.state.sector})")
        ok("新裝置一開始是本機預設進度", before["g"] != 1234567, json.dumps(before))

        res = pB.evaluate("(c) => __game.state.importCode(c)", code)
        time.sleep(0.6)
        after = pB.evaluate("""(() => ({g: __game.state.gold, gems: __game.state.gems, sector: __game.state.sector,
            planet: __game.state.planet, gatling: __game.state.weapons.gatling,
            beam: __game.state.satellites.beam, skills: __game.state.skills,
            pass: Object.keys(__game.state.passClaimed).length,
            bundles: Object.keys(__game.state.bundles).length,
            blocks: __game.state.stats.blocks}))()""")
        ok("裝置 B 匯入存檔碼成功", res["ok"] is True, res["msg"])
        ok("金幣／寶石／星區還原",
           after["g"] == 1234567 and after["gems"] == 89012 and after["sector"] == 4 and after["planet"] == 3,
           json.dumps(after))
        ok("武器／衛星等級還原", after["gatling"] == 17 and after["beam"] == 4, json.dumps(after))
        ok("技能／通行證／禮包還原",
           after["skills"].get("dmg_epic") == 2 and after["pass"] == 2 and after["bundles"] == 1, json.dumps(after))
        ok("戰績還原", after["blocks"] >= 24680, str(after["blocks"]))

        # 重整後仍在
        pB.reload(wait_until="load")
        pB.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(0.5)
        ok("裝置 B 重整後存檔還在", pB.evaluate("__game.state.sector") == 4
           and pB.evaluate("__game.state.weapons.gatling") == 17)

        # ---------- 檔案匯入 ----------
        ctxC = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pC = ctxC.new_page()
        boot(pC)
        pC.evaluate("__game.setPaused(true)")
        res_file = pC.evaluate("(t) => __game.state.importFileText(t)", open(tmp, encoding="utf-8").read())
        ok("用下載的 .json 檔匯入成功",
           res_file["ok"] is True and pC.evaluate("__game.state.sector") == 4
           and pC.evaluate("__game.state.weapons.gatling") == 17,
           res_file["msg"])

        # ---------- 壞存檔碼 ----------
        gold_before_bad = pA.evaluate("__game.state.gold")
        bad = pA.evaluate("__game.state.importCode('SB1.abc.12345678')")
        ok("無效存檔碼會被拒絕", bad["ok"] is False, bad["msg"])
        trunc = pA.evaluate("(c) => __game.state.importCode(c.slice(0, Math.floor(c.length/2)))", code)
        ok("截斷的存檔碼會校驗失敗", trunc["ok"] is False, trunc["msg"])
        ok("壞存檔碼不會動到本機進度", pA.evaluate("__game.state.gold") == gold_before_bad,
           f"{gold_before_bad} → {pA.evaluate('__game.state.gold')}")

        # ---------- 分享連結 ----------
        link = pA.evaluate("__game.state.shareUrl()")
        ok("分享連結帶 #save=", "#save=SB1." in link, link[:60] + "…")
        ctxD = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pD = ctxD.new_page()
        pD.on("pageerror", lambda e: errs.append("D:" + str(e)[:200]))
        boot(pD, link)
        time.sleep(0.9)
        has_modal = pD.evaluate("!document.querySelector('.modal').classList.contains('hidden')")
        body = pD.eval_on_selector(".modal-card", "e=>e.innerText") if has_modal else ""
        ok("開分享連結會問要不要載入", has_modal and "載入這個存檔" in body and "星區" in body,
           body.replace("\n", " | ")[:80])
        pD.click("[data-import-now]")
        time.sleep(0.8)
        ok("確認後載入分享的存檔", pD.evaluate("__game.state.sector") == 4
           and pD.evaluate("__game.state.weapons.gatling") == 17,
           str(pD.evaluate("({s:__game.state.sector, g:__game.state.weapons.gatling})")))

        ok("零 pageerror", len(errs) == 0, str(errs[:2]))
        pA.screenshot(path=os.path.join(ROOT, "artifacts", "save-tab.png"))
        b.close()

    print(f"\n{'='*46}\n{len(PASS)} PASS / {len(FAIL)} FAIL")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
