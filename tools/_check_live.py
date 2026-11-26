from playwright.sync_api import sync_playwright

URL = "https://bodhi16889.github.io/starbreaker-h5-ts/"
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 700}, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)[:80]))
    p.goto(URL, wait_until="load")
    p.wait_for_function("window.__game && window.__game.ready", timeout=25000)
    p.wait_for_timeout(900)
    print("version:", p.evaluate("window.__game.version"))
    print("sdk log:", " ".join(p.evaluate("window.__game.ads.log"))[:80])
    p.evaluate("window.__game.ui.openTab('weapons')")
    p.wait_for_timeout(400)
    body = p.evaluate("document.querySelector('.modal-card').innerText")
    cjk = [c for c in body if "\u4e00" <= c <= "\u9fff"]
    print("Armory 含中文:", bool(cjk), sorted(set(cjk))[:8])
    print("含 Crit:", "Crit" in body)
    print("errors:", errs[:2] if errs else "none")
    b.close()
