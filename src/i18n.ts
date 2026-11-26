/* i18n.ts — 英文預設、?lang=zh 才中文（GamePix 規則：未支援語系一律 fallback 英文）
 *
 * 做法：不改 128 個呼叫點，而是在 DOM 邊界做「最長字串優先」替換，
 * 搭配 MutationObserver 攔住動態 render（HUD、彈窗、toast）。
 * 只翻譯中文→英文；已經是英文的字串原樣保留。
 */

export type Lang = 'en' | 'zh';

function pickLang(): Lang {
  try {
    return new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export const LANG: Lang = pickLang();

/** 完全比對用（含標點） */
const EXACT: Record<string, string> = {
  // 圖示列 / 標題
  設定: 'Settings',
  衛星: 'Satellites',
  技能: 'Skills',
  通行證: 'Pass',
  禮包: 'Bundles',
  存檔: 'Save',
  '⚡ 指揮官無限補給站': '⚡ Commander Supply Station',
  武器庫: 'Armory',
  技能融合: 'Skill Fusion',
  星際通行證: 'Star Pass',
  特惠禮包: 'Bundles',
  存檔備份: 'Save & Backup',
  版本資訊: 'Version',
  '偵測到分享的存檔': 'Shared save detected',
  // HUD
  寶石: 'Gems',
  切換鎖定目標: 'Switch target',
  最近: 'Nearest',
  補刀: 'Weakest',
  肥羊: 'Richest',
  擊破: 'Destroyed',
  通關星球: 'Planets cleared',
  武器: 'Weapons',
  星級上限: 'Max stars',
  星塵: 'Stardust',
  待領: 'Claimable',
  領取: 'Claim',
  '✔ 已領': '✔ Claimed',
  未解鎖: 'Locked',
  已滿級: 'MAX',
  出戰: 'Deployed',
  重置存檔: 'Reset save',
  再按一次確認重置: 'Tap again to confirm reset',
  '複製存檔碼': 'Copy save code',
  '複製分享連結': 'Copy share link',
  '下載存檔檔（.json）': 'Download save (.json)',
  匯入: 'Import',
  '匯入存檔碼': 'Import save code',
  '載入這個存檔': 'Load this save',
  '先不要（保留本機進度）': 'Not now (keep local progress)',
  // toast / 狀態
  'CR 不足': 'Not enough CR',
  寶石不足: 'Not enough gems',
  '寶石不足或已滿級': 'Not enough gems or already maxed',
  存檔已重置: 'Save reset',
  已發放: 'Claimed',
  '沒有可融合的技能': 'Nothing to fuse',
  '已下載存檔檔': 'Save file downloaded',
  '複製失敗，請長按選取': 'Copy failed — long-press to select',
  '請先貼上存檔碼': 'Paste a save code first',
  '存檔碼格式不對（要 SB1.xxx.yyyy）': 'Invalid save code format (expected SB1.xxx.yyyy)',
  '存檔碼解不開（可能被截斷）': 'Save code could not be decoded (truncated?)',
  '存檔碼校驗失敗（複製不完整）': 'Save code checksum failed (incomplete copy)',
  '存檔內容不是 JSON': 'Save payload is not JSON',
  '存檔內容缺少資料': 'Save payload is missing data',
  '檔案不是 JSON': 'File is not JSON',
  '檔案裡沒有存檔資料': 'File contains no save data',
  // 稀有度
  普通: 'Common',
  稀有: 'Rare',
  史詩: 'Epic',
  傳奇: 'Legendary',
  神話: 'Mythic',
  // 技能
  額外傷害: 'Bonus Damage',
  金幣掉落: 'Coin Drop',
  易爆生成: 'Volatile Rate',
  連鎖範圍: 'Chain Radius',
  攻速: 'Attack Speed',
  暴擊率: 'Crit Chance',
  暴擊傷害: 'Crit Damage',
  穿透: 'Pierce',
  採集範圍: 'Collect Radius',
  寶石掉落: 'Gem Drop',
  '全武器傷害提升': 'All weapon damage up',
  '金幣掉落提升': 'Coin drop rate up',
  '易爆方塊生成率提升': 'Volatile block rate up',
  '連鎖爆炸半徑提升': 'Chain explosion radius up',
  '全武器攻速提升': 'All weapon speed up',
  '暴擊率提升': 'Crit chance up',
  '暴擊傷害提升': 'Crit damage up',
  '子彈穿透提升': 'Bullet pierce up',
  '資源吸附範圍提升': 'Pickup radius up',
  '寶石掉落提升': 'Gem drop rate up',
  // 武器
  鑽頭長矛: 'Drill Lance',
  電漿機槍: 'Plasma Gatling',
  重型迫擊炮: 'Heavy Mortar',
  連鎖電弧: 'Chain Arc',
  軌道圓鋸: 'Orbital Saw',
  聚能雷射: 'Focus Laser',
  追蹤微飛彈: 'Micro Missiles',
  重力黑洞砲: 'Gravity Cannon',
  冰霜新星: 'Cryo Nova',
  殲星主砲: 'Planet Buster',
  '近距離高頻穿透刺擊': 'Fast piercing melee stabs',
  '高速單體，越射越快': 'Fast single target, ramps up',
  '拋物線範圍爆炸': 'Arcing area explosion',
  '命中後在方塊間彈跳': 'Bounces between blocks',
  '繞飛船旋轉持續切割': 'Orbits the ship, constant cutting',
  '持續照射同目標傷害翻倍': 'Sustained beam doubles damage',
  '發射多枚追蹤飛彈': 'Fires homing missiles',
  '黑洞集中碾壓': 'Black hole crushes blocks',
  '凍結範圍，受創提升': 'Freezes and amplifies damage',
  '貫穿整顆星球的毀滅光束': 'Planet-wide destruction beam',
  // 衛星
  採集衛星: 'Collector',
  爆破衛星: 'Bomber',
  雷射衛星: 'Beam',
  複製衛星: 'Mirror',
  暴擊衛星: 'Crit Amp',
  時空衛星: 'Chrono',
  '定期抽取金幣與寶石': 'Periodically extracts coins and gems',
  '定期投擲高爆核彈': 'Drops high-explosive bombs',
  '連線切割沿途方塊': 'Cuts blocks along its beam',
  '複製主武器彈幕': 'Mirrors main weapon fire',
  暴擊率暴擊傷害: 'Crit chance and damage',
  '週期性攻速爆發': 'Periodic attack speed burst',
  // 模組
  船體: 'Hull',
  反應爐核心: 'Reactor Core',
  引擎: 'Engine',
  '碰撞傷害與吸附範圍': 'Collision damage and pickup range',
  '全武器攻擊力': 'All weapon power',
  '環繞速度與攻速': 'Orbit speed and attack speed',
  // 禮包
  '🎁 新手啟航至尊禮包': '🎁 Starter Voyage Pack',
  '⚔️ 全武器精通禮包': '⚔️ Weapon Mastery Pack',
  '🛰️ 衛星艦隊滿編禮包': '🛰️ Full Satellite Fleet Pack',
};

/** 帶數字的句型：先比對，再交給 EXACT／詞表 */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^鎖定模式：(.+)$/, (m) => `Target: ${m[1]}`],
  [/^解鎖 (.+)$/, (m) => `Unlocked ${m[1]}`],
  [/^融合 (\d+) 次$/, (m) => `Fused ×${m[1]}`],
  [/^已載入：星區 ([\d-]+) · 擊破 (.+)$/, (m) => `Loaded: Galaxy ${m[1]} · Destroyed ${m[2]}`],
  [/^存檔版本較新（v(.+)），請重新整理更新遊戲$/, (m) => `Save is from a newer version (v${m[1]}) — reload the game`],
  [/^第 (\d+) 階：(.+) 寶石 \+ (.+) 星塵$/, (m) => `Tier ${m[1]}: ${m[2]} gems + ${m[3]} stardust`],
  [/^最近寫入：(.+)$/, (m) => `Last saved: ${m[1]}`],
  [/^連結裡的存檔碼無效：(.+)$/, (m) => `Invalid save code in link: ${m[1]}`],
  [/^星區 (.+)$/, (m) => `Galaxy ${m[1]}`],
  [/^星球進度 (.+)$/, (m) => `Planet ${m[1]}`],
  [/^版本 v(.+) · 存檔 v(.+) · 星球進度 (.+)$/, (m) => `v${m[1]} · save v${m[2]} · planet ${m[3]}`],
  [/^版本 v(.+) · 存檔 v(.+)$/, (m) => `v${m[1]} · save v${m[2]}`],
];

/** 內嵌片段（長字串先換，避免換出半套詞） */
const TOKENS: [string, string][] = [
  ['無限補給站（全資源）', 'Unlimited Supply Station'],
  ['存檔備份／跨裝置', 'Save & Cross-device'],
  ['重置會清掉本機進度；要保留就先把存檔碼複製出去。', 'Reset clears local progress. Copy your save code first.'],
  ['同時出戰 4 把（依等級自動挑選），其餘只提供解鎖加成。', '4 weapons deploy at once (auto-picked by level); the rest give unlock bonuses.'],
  ['最多 6 顆環繞；每顆 5 星上限。', 'Up to 6 satellites orbit; 5 stars each.'],
  ['全 6 顆衛星解鎖並升至滿星', 'Unlock all 6 satellites to max stars'],
  ['背包尚無技能，點下方抽卡。', 'No skills yet — roll below.'],
  ['3 個同名同稀有度 → 自動合成高一階', '3 identical skills auto-merge one tier up'],
  ['十連抽', 'Roll ×10'],
  ['百連抽', 'Roll ×100'],
  ['一鍵全部融合', 'Fuse All'],
  ['一鍵領取全部 50 階', 'Claim all 50 tiers'],
  ['豪華版', 'Deluxe'],
  ['已永久解鎖', 'permanently unlocked'],
  ['已領', 'claimed'],
  ['全部', 'All'],
  ['點即發放。', 'tap to claim.'],
  ['無需付費或外部修改，點擊即可無限領取全資源。', 'No payment or external edits needed — claim unlimited resources.'],
  ['領取 +1,000,000 寶石', 'Claim +1,000,000 gems'],
  ['領取 +1,000,000 轉生點（立即提升倍率）', 'Claim +1,000,000 prestige (boosts multiplier)'],
  ['全 10 種武器立即解鎖', 'Unlock all 10 weapons'],
  ['全 6 顆衛星解鎖並升至滿星', 'Unlock all 6 satellites to max stars'],
  ['一鍵拉滿所有資源與等級（All-In-One）', 'Max everything at once (All-In-One)'],
  ['這個網址帶有另一台裝置的存檔，載入會覆蓋本機進度。', 'This link carries a save from another device; loading it overwrites local progress.'],
  ['換裝置：左側 💾 存檔 → 複製存檔碼或分享連結。', 'Cross-device: 💾 Save → copy the save code or share link.'],
  ['特惠禮包', 'Bundles'],
  ['星際通行證', 'Star Pass'],
  ['暴擊率、暴擊傷害', 'Crit chance and damage'],
  ['匯入存檔檔（.json）', 'Import save (.json）'],
  ['普通 → 稀有 → 史詩 → 傳奇 → 神話', 'Common → Rare → Epic → Legendary → Mythic'],
  ['星區', 'Galaxy'],
  ['擊破', 'Destroyed'],
  ['通關星球', 'Planets cleared'],
  ['星球進度', 'Planet'],
  ['倍率', 'Multiplier'],
  ['星級上限', 'Max stars'],
  ['全武器', 'All weapons'],
  ['衛星滿星', 'Max satellites'],
  ['出戰', 'Deployed'],
  ['未解鎖', 'Locked'],
  ['已滿級', 'MAX'],
  ['待領', 'Claimable'],
  ['領取', 'Claim'],
  ['存檔碼', 'save code'],
  ['分享連結', 'share link'],
  ['存檔', 'Save'],
  ['寶石', 'gems'],
  ['轉生點', 'prestige'],
  ['星塵', 'stardust'],
  ['武器', 'Weapons'],
  ['衛星', 'Satellites'],
  ['技能', 'Skills'],
  ['通行證', 'Pass'],
  ['禮包', 'Bundles'],
  ['版本', 'Version'],
  ['已複製', 'copied'],
];

/* 完全比對表也要進片段表，否則「🛰 採集衛星」這種前後有圖示的字串，
   會先被短詞（衛星→Satellites）吃掉，留下半套翻譯 */
const byLength = [...TOKENS, ...Object.entries(EXACT)].sort((a, b) => b[0].length - a[0].length);

const CJK = /[\u4e00-\u9fff]/;

/** 把一段中文翻成英文；已是英文就原樣回傳 */
export function translate(text: string): string {
  if (LANG === 'zh' || !CJK.test(text)) return text;
  const trimmed = text.trim();

  if (EXACT[trimmed]) return text.replace(trimmed, EXACT[trimmed]);

  for (const [re, fn] of PATTERNS) {
    const m = trimmed.match(re);
    if (m) return text.replace(trimmed, fn(m));
  }

  let out = text;
  for (const [zh, en] of byLength) out = out.split(zh).join(en);
  return out;
}

const ATTRS = ['title', 'placeholder', 'aria-label'];

/** 翻譯一棵子樹的文字節點與常見屬性 */
export function localize(root: ParentNode = document.body): void {
  if (LANG === 'zh' || !root) return;

  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n = walker.nextNode();
  while (n) {
    nodes.push(n as Text);
    n = walker.nextNode();
  }
  for (const t of nodes) {
    if (CJK.test(t.nodeValue || '')) {
      const v = translate(t.nodeValue || '');
      if (v !== t.nodeValue) t.nodeValue = v;
    }
  }

  const el = root as unknown as Element;
  const all = el.querySelectorAll ? el.querySelectorAll('*') : [];
  for (const node of Array.from(all)) {
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (v && CJK.test(v)) node.setAttribute(a, translate(v));
    }
    const ph = (node as HTMLInputElement).placeholder;
    if (ph && CJK.test(ph)) (node as HTMLInputElement).placeholder = translate(ph);
  }
}

let started = false;

/** 開機後呼叫：先翻一次，再監看後續 render（HUD／彈窗／toast） */
export function startLocalize(): void {
  if (LANG === 'zh' || started) return;
  started = true;
  localize(document.body);
  const obs = new MutationObserver(() => localize(document.body));
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
}
