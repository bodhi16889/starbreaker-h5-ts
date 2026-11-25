# StarBreaker: Unlimited Drill — H5（Vite + TypeScript + Canvas 2D）

零遊戲引擎依賴的直向放置採礦射擊遊戲。`npm run build` 產出的 `dist/` 就是可直接上架的靜態站。

## 指令

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # 預覽 dist
/usr/bin/python3 tests/smoke.py   # 25 項 E2E（需先 build）
/usr/bin/python3 tests/save.py    # 21 項存檔／跨裝置
```

## 專案結構

```
index.html              canvas（上）+ #ui-layer（下）
src/main.ts             主迴圈、Canvas 2D 霓虹渲染、輸入、開機
src/GameState.ts        經濟、大數格式、補給站、50 階通行證、技能融合、localStorage
src/PlanetSystem.ts     圓形網格星球、5 種方塊、連鎖爆炸（限深度 3）
src/ShipAndWeapons.ts   自動巡航／虛擬搖桿、10 種武器、6 顆衛星、彈幕與掉落
src/UIManager.ts        HUD、五個分頁、無限補給站、版本徽章
src/config.ts           全部平衡參數（其他檔案不得硬編碼數字）
tests/smoke.py          Playwright 25 項
```

## v1.2.1 版面校正

- 星球放大到接近滿版（飛船改成貼著星球邊緣繞，軌道 0.94R），畫面空白帶變少
- 衛星軌道半徑縮小一半，六顆都留在畫面內
- 飛船／衛星夾在可視範圍內，不會鑽到左側圖示列底下
- 矮螢幕（≤640px 高）壓縮卡片、640×480 iframe 直接收掉卡片：canvas 從 215px 回到 425px
- 底部卡片升級鈕 40 → 44px 觸控目標

## 體積

| 檔案 | 原始 | gzip |
|---|---|---|
| `assets/index-*.js` | 41 KB | 14.9 KB |
| `assets/style-*.css` | 4.0 KB | 1.5 KB |

## 玩法重點

- **雙模式操控**：不觸控時自動繞星球巡航並鎖定最近方塊；按住拖曳出現虛擬搖桿，放手 1.5 秒回到自動巡航。
- **5 種方塊**：普通／黃金（10 倍金幣）／能量（5 秒 2.5 倍攻速 OVERDRIVE）／易爆（60ms 後 3x3 連鎖）／核心（擊破直接躍遷下一顆星球）。
- **10 種武器**：鑽頭光錐、電漿連發、迫擊炮、連鎖電弧、環繞圓鋸、聚能雷射、追蹤飛彈、重力黑洞、冰霜新星、殲星主砲；同時出戰 4 把。
- **6 顆衛星**：採集（抽金幣）、爆破（核彈）、雷射（連線切割）、複製（複製傷害）、暴擊（暴率暴傷）、時空（攻速爆發）。
- **沙盒系統**：無限補給站、50 階通行證全解鎖、3 個 FREE 禮包、技能十連／百連與 3 合 1 融合。

## UI 對齊 Auto Drill: Galaxy（v1.2.0）

依 `<https://mobilegamehelper.com/product/auto-drill-galaxy/>` 參考的實際遊戲畫面（Google Play 截圖）重做 HUD：

| 參考畫面 | 本作 |
|---|---|
| 頂部中央大數字 + `CR` + `×倍率` | `#hCredits` + `#hMult`（倍率＝轉生倍率） |
| 左上小貨幣 | 💎 寶石 |
| 右上星球縮圖 + `Galaxy N / Planet M / 271/3.31K` | 程序化畫的進度環 + 剩餘/總方塊 |
| 左側垂直圖示列（設定/任務/錦標賽/通行證/商店） | ⚙ 設定、🛰 衛星、🎲 技能、🎫 通行證、🎁 禮包、💾 存檔（帶紅點數） |
| 右側準心鈕 | 🎯 鎖定模式：最近／補刀／肥羊 |
| 底部 7 格裝備列（加速 + 3 武器 + 3 技能，帶等級徽章） | 同配置，武器粉框、技能綠框 |
| 底部武器卡 `Lv. / DPS / 花費 CR` | 三張出戰武器卡 + `UNLOCK WEAPON … CR` |
| 傷害跳字 `+18.12K CR` | 每一下都帶 `CR`，暴擊加 `✷` 與金色 |

原本的底部五分頁改成左側圖示列；「無限補給站」移到 ⚙ 設定裡。

## 存檔備份與跨裝置

「存檔」分頁（第六個）提供四條路：

| 方式 | 用途 |
|---|---|
| 存檔碼 `SB1.<base64>.<8碼校驗>` | 複製後貼到另一台裝置的「匯入存檔碼」 |
| 分享連結 `<網址>#save=<存檔碼>` | 另一台開連結 → 跳出「星區 X-Y / 擊破 N」預覽 → 按載入 |
| 下載 `starbreaker-save-YYYYMMDD-HHMM.json` | 存到檔案 App／雲端硬碟，另一台用「匯入存檔檔」 |
| localStorage | 同裝置自動存（每次升級、領取、通關都寫） |

- 匯入前會清空本機欄位再套用，壞碼／截斷碼會被 FNV-1a 校驗擋下，不會蓋掉原本的進度。
- 存檔碼含時間戳，同一份存檔可以在多台裝置間來回搬。
- 分享連結不會自動載入，一定先問（避免點到別人的連結就覆蓋）。

## 版本

畫面右下角徽章 `v1.1.0`（點開看版本與內容數量）；線上 `version.json` 可直接查。徽章文字由 `VERSION` 常數渲染，不會與程式不同步。

## 測試

```
25 PASS / 0 FAIL：載入、戰鬥、六個分頁、+1/+10、衛星 +5、補給站五項、
通行證 50 階單領與全領、三個 FREE 禮包、百連與融合、存檔重載、
640×480 無溢出、觸控進入手動模式、零 pageerror／console error
tests/save.py 21 PASS：存檔碼格式與校驗、下載 JSON、另一台裝置匯入、
重整後保留、檔案匯入、壞碼不動本機進度、分享連結預覽與確認載入
```
