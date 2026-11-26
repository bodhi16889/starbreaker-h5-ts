from playwright.sync_api import sync_playwright
import functools, http.server, socket, threading, pathlib, re

d = pathlib.Path("dist").resolve()
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port),
                                      functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(d)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

out = pathlib.Path("artifacts"); out.mkdir(exist_ok=True)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    p = ctx.new_page()
    p.goto(f"http://127.0.0.1:{port}/", wait_until="load")
    p.wait_for_function("window.__game && window.__game.ready", timeout=20000)
    info = p.evaluate("""() => {
      const g = window.__game, s = g.state;
      s.sector = 752; s.planet = 5;
      s.gold = 3.98537923637945e26; s.gems = 9.46e7;
      s.weapons.laser = 878; s.weapons.cryo = 877; s.weapons.gravity = 876;
      g.planet.build(752, 5); g.combat.reset(); g.ui.renderHud();
      return { laser: s.weaponLevel('laser'), cr: document.getElementById('hCredits').textContent,
               hp: Math.max(...g.planet.blocks.map(b => b.maxHp)) };
    }""")
    print("夾上限後 laser 等級:", info["laser"], "| HUD CR:", info["cr"], "| 最大單塊HP:", f"{info['hp']:.3e}")
    p.wait_for_timeout(2500)
    p.screenshot(path=str(out / "deep-hud.png"))

    p.evaluate("window.__game.ui.openTab('weapons')")
    p.wait_for_timeout(500)
    body = p.evaluate("document.querySelector('.modal-card').innerText")
    p.screenshot(path=str(out / "deep-armory.png"))
    print("卡片原始 e+ 字串:", len(re.findall(r"e\+\d+", body)))
    print("含 MAX:", "MAX" in body, "| 含長數字串(>20 位):", bool(re.search(r"\d{20,}", body)))
    print("節錄:", " | ".join(body.split("\n")[:8]))
    b.close()
srv.shutdown()
