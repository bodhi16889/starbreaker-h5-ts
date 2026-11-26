# GamePix 送審資料 — StarBreaker: Unlimited Drill

最後更新：2026-11-26 ｜ 版本 **1.3.3** ｜ 上架包 `dist/starbreaker-gamepix.zip`

> 後台：`my.gamepix.com` → Games → 本遊戲 → **Info / Assets / Editorial / Build** 四個頁籤。
> 紅字沒消掉前，後面填了也不能存（Orientation、Desktop/Mobile Friendly 兩個最常漏）。

---

## 1. Info 頁

| 欄位 | 值 |
|---|---|
| Game title | `StarBreaker: Unlimited Drill` |
| Orientation | **Portrait** |
| Desktop friendly | ✅ 勾 |
| Mobile friendly | ✅ 勾 |
| Main tag | `idle`（清單沒有就選 `casual`） |
| Extra tags | `idle`, `incremental`, `clicker`, `space` |
| Does your game save progress? | **Yes — localStorage** |
| Game Id | 建檔後由後台產生（`il9S20` 這類短碼，SDK 的 JWT `aud` 會是 `gpx:game:<id>`） |

**Title 三處必須逐字一致**：後台名稱、`<title>`／遊戲內載入畫面標題、封面大圖。
本包三處都是 `StarBreaker: Unlimited Drill`（無版本號）。

---

## 2. Editorial 頁（英文字數已實測，不要超）

### Description（451 字元，限制 100–500）

```
StarBreaker: Unlimited Drill is an idle space-mining game. Your ship circles a planet packed with crystal blocks and drills it automatically, even while you are away. Shatter blocks to earn credits, chain-blast volatile crystals, and clear whole planets to reach deeper galaxies. Unlock 10 weapons, launch 6 orbiting satellites, fuse skill cards and claim a 50-tier star pass. Prestige to boost every credit, then watch your fleet shred bigger worlds.
```

### How to Play – Instructions（470 字元，上限 500）

> ⚠ 這個框**預填的是官方範例**（`W / Up Arrow key = Jump` 那類），不是 placeholder。
> 一定要**整段覆蓋**，否則等於把別款遊戲的操作說明送上審。

```
1) Your ship mines automatically. Tap anywhere on the planet to aim it.
2) Tap the target button to switch between nearest, weakest and richest blocks.
3) Spend credits on the weapon cards at the bottom to raise damage and speed.
4) Open the left rail to unlock satellites, roll skill cards, claim the star pass and grab free packs.
5) Clear every block to fly to the next planet. Bigger galaxies pay more.
6) Use Save to copy a save code and continue on another device.
```

---

## 3. Assets 頁

| 檔案 | 規格 | 路徑 |
|---|---|---|
| Icon | 256×256、≤1 MB | `gamepix/assets/icon.png`（62 KB） |
| Cover | 1360×850、≤1.5 MB | `gamepix/assets/cover.png`（609 KB） |
| Screenshot 1–4 | 1080×1920、3–5 張 | `gamepix/assets/screenshot-1..4.png`（332–480 KB） |

- 封面只有遊戲名稱（沒有標語、沒有平台 logo、沒有「FREE」字樣）。
- 四張截圖都是實機畫面：星球中段、後期高倍率、技能融合、衛星面板。
- 介面已切英文（預設語言），截圖語言與 Title 一致。

---

## 4. Build 頁

| 項目 | 值 |
|---|---|
| 上傳檔 | `dist/starbreaker-gamepix.zip` |
| 大小 | 27,246 bytes |
| sha256 | `2dc8147b185a71ae95f96f522ea5e50f219ef517da1765eab2fb5aef67a9b26d` |
| 內容 | `index.html`（根目錄）＋ `assets/index-*.js` ＋ `assets/style-*.css` |
| 外部網址 | 只有 `integration.gamepix.com`（SDK v3） |

**不要上傳 GitHub 的 Download ZIP**（會多一層 `<repo>-main/`，後台會報 `No index.html found in the main root`）。
**不要**在 Finder 對資料夾按「壓縮」。一律用 `python3 tools/build_gamepix.py` 產的那一包。

---

## 5. SDK 與合規（本包已做）

- SDK v3 在 `<head>` **靜態載入**，且 `window.GamePixConfig = { lifecycle: 'manual' }` 在它之前。
- lifecycle：`loading(15) → (45) → (80) → (100) → loaded() → gameStart()`，進度只遞增。
- `pause` / `resume` 已註冊且冪等（停模擬、不停繪製），SDK 自動觸發。
- 插頁廣告：**每清空 5 顆星球**才可能觸發，且 120 秒冷卻；只在真 Player（iframe／`gamepix.com`）才允許，
  公開頁（GitHub Pages）`adsAllowed === false`，不會出現假廣告蓋版。
- 載入畫面：`#loading` overlay，`loaded()` 後淡出並移除。
- 無 `alert` / `confirm` / `prompt`；無外部連結、無第三方 SDK、無 analytics。
- 英文預設：介面全部英文；玩家可在 ⚙ Settings 用「English / 中文」切換（記在 localStorage，僅玩家主動選擇才覆寫預設）。

---

## 6. 送審前自檢指令（重跑用）

```bash
cd ~/work/starbreaker-h5-ts
npm run build                                   # tsc --noEmit && vite build
/usr/bin/python3 tools/build_gamepix.py         # 出 ZIP＋合規掃描（外部網址／禁用 API／version.json）
/usr/bin/python3 tools/verify_zip.py            # 對「解壓後的 ZIP」實跑 12 項
/usr/bin/python3 tools/collect_strings.py       # 英文模式殘留中文必須 0 條
/usr/bin/python3 tools/make_assets.py           # 重產 6 張素材並驗尺寸
/usr/bin/python3 tests/smoke.py                 # 27 項
/usr/bin/python3 tests/save.py                  # 21 項
```

最近一次結果：build ✓、ZIP 3 entries、verify 12/12、collect_strings 0 條、
smoke 27 PASS、save 21 PASS、素材 6/6 尺寸與檔案大小合格。

---

## 7. 送出後

- 狀態（In Review / Approved / Live）**只有後台看得到**，不要用網址探測判斷。
- 結果通常 1–3 個工作日，同時寄到註冊信箱。
- 被打回：把原文貼回來 → 對照 §5 逐條找根因 → 重打包 → 覆蓋 Build → Resubmit。
