# StarBreaker: Unlimited Drill — H5（Vite + TypeScript + Canvas 2D）

零遊戲引擎依賴的直向放置採礦射擊遊戲。`npm run build` 產出的 `dist/` 就是可直接上架的靜態站。

## 指令

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # 預覽 dist
/usr/bin/python3 tests/smoke.py   # 25 項 E2E（需先 build）
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

## 版本

畫面右下角徽章 `v1.0.0`（點開看版本與內容數量）；線上 `version.json` 可直接查。徽章文字由 `VERSION` 常數渲染，不會與程式不同步。

## 測試

```
25 PASS / 0 FAIL：載入、戰鬥、五個分頁、+1/+10、衛星 +5、補給站五項、
通行證 50 階單領與全領、三個 FREE 禮包、百連與融合、存檔重載、
640×480 無溢出、觸控進入手動模式、零 pageerror／console error
```
