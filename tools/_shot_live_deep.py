from playwright.sync_api import sync_playwright
import pathlib

URL = "https://bodhi16889.github.io/starbreaker-h5-ts/"
out = pathlib.Path("artifacts")
out.mkdir(exist_ok=True)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    p = ctx.new_page()
    p.goto(URL, wait_until="load")
    p.wait_for_function("window.__game && window.__game.ready", timeout=30000)
    info = p.evaluate("""() => {
      const g = window.__game, s = g.state;
      s.sector = 752; s.planet = 5;
      s.gold = 3.98e26; s.gems = 9.46e7;
      s.weapons.laser = 500; s.weapons.cryo = 500; s.weapons.gravity = 500;
      g.planet.build(752, 5); g.combat.reset(); g.ui.renderHud();
      return { ver: g.version, cr: document.getElementById('hCredits').textContent,
               hp: Math.max(...g.planet.blocks.map(x => x.maxHp)) };
    }""")
    p.wait_for_timeout(2500)
    p.screenshot(path=str(out / "live-deep-1.3.4.png"))
    print("版本:", info["ver"], "| HUD CR:", info["cr"], "| HP:", f"{info['hp']:.2e}")
    p.evaluate("window.__game.ui.openTab('weapons')")
    p.wait_for_timeout(600)
    p.screenshot(path=str(out / "live-armory-1.3.4.png"))
    print("screenshot ok")
    b.close()
