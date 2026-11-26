from playwright.sync_api import sync_playwright
import functools, http.server, socket, threading, pathlib, re

d = pathlib.Path("dist").resolve()
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port),
                                      functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(d)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 390, "height": 844})
    p.goto(f"http://127.0.0.1:{port}/", wait_until="load")
    p.wait_for_function("window.__game && window.__game.ready", timeout=20000)
    vals = p.evaluate("""() => {
      const g = window.__game, s = g.state;
      s.gold = 1.5090021635538357e71;
      s.gems = 7.55e68;
      s.weapons.laser = 878; s.weapons.cryo = 877; s.weapons.gravity = 876;
      g.ui.renderHud();
      return { cr: document.getElementById('hCredits').textContent,
               gems: document.getElementById('hGems').textContent };
    }""")
    print("HUD CR:", vals["cr"], "｜Gems:", vals["gems"])
    p.evaluate("window.__game.ui.openTab('weapons')")
    p.wait_for_timeout(400)
    body = p.evaluate("document.querySelector('.modal-card').innerText")
    raw = re.findall(r"e\+\d+", body)
    print("卡片原始 e+ 字串:", len(raw), raw[:3])
    costs = re.findall(r"^([\d.]+[a-z]{0,2})\s*$", body, re.M)[:5]
    print("成本樣本:", costs)
    print("卡片節錄:", " | ".join(body.split("\n")[:6]))
    b.close()
srv.shutdown()
