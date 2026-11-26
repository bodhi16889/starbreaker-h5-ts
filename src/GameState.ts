/* GameState.ts — 經濟、大數、技能融合、補給站、通行證、禮包與 localStorage 存檔 */
import {
  BALANCE, BUNDLES, DICE, GEAR, PASS_TIERS, PLANET, RARITY, SAT, SKILLS, SATELLITES,
  SUPPLY, VERSION, WEAPONS,
} from './config';

const SAVE_KEY = 'starbreaker_h5_ts_save_v1';
const SAVE_VERSION = 1;
/* 數字後綴：K/M/B/T 之後用兩位字母遞增（aa…zz），最多支援到 1e300，
   不會再出現 2.92e+71ah 這種 toFixed 溢出的原始浮點字串 */
const BASE_SUFFIX = ['', 'K', 'M', 'B', 'T'];
const MAX_TIER = 100;

function suffixFor(tier: number): string {
  if (tier < BASE_SUFFIX.length) return BASE_SUFFIX[tier];
  const i = tier - BASE_SUFFIX.length;          // 0 → 'aa'
  return String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
}

export interface SaveData {
  v: number;
  gold: number;
  gems: number;
  prestige: number;
  cores: number;
  sector: number;
  planet: number;
  weapons: Record<string, number>;
  satellites: Record<string, number>;
  gear: Record<string, number>;
  skills: Record<string, number>;
  passClaimed: Record<string, boolean>;
  bundles: Record<string, boolean>;
  stats: { blocks: number; planets: number; bestSector: number };
  overdriveUntil: number;
}

export function fmt(n: number): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '0';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();
  const tier = Math.min(Math.floor(Math.log10(n) / 3), MAX_TIER);
  const v = n / Math.pow(1000, tier);
  /* 三個有效位：100 以上不留小數，避免 878.32K 這種塞不進卡片的字串 */
  const body = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return body + suffixFor(tier);
}

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '==='.slice((norm.length + 3) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** 簡單校驗碼（FNV-1a 32bit），避免貼到截斷的存檔碼還原成壞檔 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : def;
}

export class GameState {
  gold = 800;
  gems = 400;
  prestige = 0;      // 起手不給轉生點，否則 prestigeMult=5 會 0.2 秒清一顆星球
  cores = 0;
  sector = 1;
  planet = 1;

  weapons: Record<string, number> = {};
  satellites: Record<string, number> = {};
  gear: Record<string, number> = {};
  skills: Record<string, number> = {};
  passClaimed: Record<string, boolean> = {};
  bundles: Record<string, boolean> = {};

  stats = { blocks: 0, planets: 0, bestSector: 1 };
  overdriveUntil = 0;
  lastSavedAt = 0;

  private listeners = new Set<() => void>();

  constructor() {
    this.resetDefaults();
    this.load();
  }

  private resetDefaults() {
    WEAPONS.forEach((w, i) => { this.weapons[w.id] = i < 2 ? 1 : 0; });
    SATELLITES.forEach((s, i) => { this.satellites[s.id] = i < 2 ? 1 : 0; });
    GEAR.forEach((g) => { this.gear[g.id] = 1; });
  }

  /* ---------- 訂閱 ---------- */
  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void { this.listeners.forEach((f) => f()); }

  /* ---------- 存檔 ---------- */
  toSaveData(): SaveData {
    return {
      v: SAVE_VERSION, gold: this.gold, gems: this.gems, prestige: this.prestige, cores: this.cores,
      sector: this.sector, planet: this.planet, weapons: this.weapons, satellites: this.satellites,
      gear: this.gear, skills: this.skills, passClaimed: this.passClaimed, bundles: this.bundles,
      stats: this.stats, overdriveUntil: 0,
    };
  }

  save(): void {
    this.lastSavedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.toSaveData())); } catch { /* 私密模式 */ }
  }

  /* ---------- 存檔匯出／匯入（跨裝置） ---------- */
  /** 存檔碼：SB1.<base64url>.<8碼校驗> — 貼到另一台裝置的「匯入」就能接手 */
  exportCode(): string {
    const payload = JSON.stringify({ ts: Date.now(), d: this.toSaveData() });
    const b64 = b64encode(payload);
    return 'SB1.' + b64 + '.' + fnv1a(payload).toString(16).padStart(8, '0');
  }

  private decodeCode(code: string): { ok: true; ts: number; d: Partial<SaveData> } | { ok: false; msg: string } {
    const raw = (code || '').trim().replace(/\s+/g, '');
    if (!raw) return { ok: false, msg: '請先貼上存檔碼' };
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== 'SB1') return { ok: false, msg: '存檔碼格式不對（要 SB1.xxx.yyyy）' };

    let payload: string;
    try { payload = b64decode(parts[1]); } catch { return { ok: false, msg: '存檔碼解不開（可能被截斷）' }; }
    if (fnv1a(payload).toString(16).padStart(8, '0') !== parts[2]) return { ok: false, msg: '存檔碼校驗失敗（複製不完整）' };

    let parsed: { ts?: number; d?: Partial<SaveData> };
    try { parsed = JSON.parse(payload) as { ts?: number; d?: Partial<SaveData> }; } catch { return { ok: false, msg: '存檔內容不是 JSON' }; }
    const d = parsed.d;
    if (!d || typeof d !== 'object') return { ok: false, msg: '存檔內容缺少資料' };
    if (num(d.v, 0) > SAVE_VERSION) return { ok: false, msg: `存檔版本較新（v${d.v}），請重新整理更新遊戲` };
    return { ok: true, ts: num(parsed.ts, 0), d };
  }

  /** 只讀預覽（不覆蓋本機），給「分享連結」的確認視窗用 */
  previewCode(code: string): { ok: boolean; msg: string; info?: { sector: number; planet: number; blocks: number; gold: number; ts: number } } {
    const r = this.decodeCode(code);
    if (!r.ok) return { ok: false, msg: r.msg };
    return {
      ok: true,
      msg: 'ok',
      info: {
        sector: Math.max(1, num(r.d.sector, 1)),
        planet: Math.max(1, num(r.d.planet, 1)),
        blocks: num(r.d.stats?.blocks, 0),
        gold: num(r.d.gold, 0),
        ts: r.ts,
      },
    };
  }

  importCode(code: string): { ok: boolean; msg: string } {
    const r = this.decodeCode(code);
    if (!r.ok) return { ok: false, msg: r.msg };
    this.resetFields();
    this.applySaveData(r.d);
    this.save();
    this.emit();
    return { ok: true, msg: `已載入：星區 ${this.sector}-${this.planet} · 擊破 ${this.stats.blocks}` };
  }

  /** 存檔碼可以直接塞進網址分享：<url>#save=<code> */
  shareUrl(): string {
    const base = location.origin + location.pathname;
    return `${base}#save=${encodeURIComponent(this.exportCode())}`;
  }

  /** 下載成檔案（給檔案 App／雲端硬碟搬運用） */
  downloadSave(): void {
    const payload = JSON.stringify({ name: 'StarBreaker: Unlimited Drill', ts: Date.now(), d: this.toSaveData() }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`;
    a.href = URL.createObjectURL(blob);
    a.download = `starbreaker-save-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** 匯入 .json 檔（下載的存檔檔可直接讀） */
  importFileText(text: string): { ok: boolean; msg: string } {
    let parsed: { d?: Partial<SaveData> } | Partial<SaveData>;
    try { parsed = JSON.parse(text) as { d?: Partial<SaveData> } | Partial<SaveData>; } catch { return { ok: false, msg: '檔案不是 JSON' }; }
    const d = (parsed as { d?: Partial<SaveData> }).d ?? (parsed as Partial<SaveData>);
    if (!d || typeof d !== 'object' || num(d.v, 0) === 0) return { ok: false, msg: '檔案裡沒有存檔資料' };
    this.resetFields();
    this.applySaveData(d);
    this.save();
    this.emit();
    return { ok: true, msg: `已載入：星區 ${this.sector}-${this.planet} · 擊破 ${this.stats.blocks}` };
  }

  load(): void {
    let raw: string | null = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { return; }
    if (!raw) return;
    let d: Partial<SaveData>;
    try { d = JSON.parse(raw) as Partial<SaveData>; } catch { return; }
    if (!d || typeof d !== 'object') return;
    this.applySaveData(d);
  }

  private applySaveData(d: Partial<SaveData>): void {
    this.gold = num(d.gold, this.gold);
    this.gems = num(d.gems, this.gems);
    this.prestige = num(d.prestige, this.prestige);
    this.cores = num(d.cores, this.cores);
    this.sector = Math.max(1, num(d.sector, 1));
    this.planet = Math.max(1, num(d.planet, 1));
    /* 舊存檔可能超過上限（v1.3.2 前沒封頂）→ 夾回 WEAPON_MAX，避免成本／DPS 無限膨脹 */
    WEAPONS.forEach((w) => {
      this.weapons[w.id] = Math.min(GameState.WEAPON_MAX,
        Math.max(0, num(d.weapons?.[w.id], this.weapons[w.id] ?? 0)));
    });
    SATELLITES.forEach((s) => { this.satellites[s.id] = Math.min(SAT.maxLevel, Math.max(0, num(d.satellites?.[s.id], this.satellites[s.id] ?? 0))); });
    GEAR.forEach((g) => { this.gear[g.id] = Math.max(1, num(d.gear?.[g.id], 1)); });
    this.skills = {};
    Object.entries(d.skills ?? {}).forEach(([k, v]) => {
      if (/^[a-z]+_[a-z]+$/.test(k)) this.skills[k] = Math.max(0, num(v));
    });
    this.passClaimed = {};
    Object.entries(d.passClaimed ?? {}).forEach(([k, v]) => { if (v) this.passClaimed[k] = true; });
    this.bundles = {};
    Object.entries(d.bundles ?? {}).forEach(([k, v]) => { if (v) this.bundles[k] = true; });
    if (d.stats) this.stats = { blocks: num(d.stats.blocks), planets: num(d.stats.planets), bestSector: Math.max(1, num(d.stats.bestSector, 1)) };
  }

  private resetFields(): void {
    this.skills = {}; this.passClaimed = {}; this.bundles = {};
    WEAPONS.forEach((w) => { this.weapons[w.id] = 0; });
    SATELLITES.forEach((s) => { this.satellites[s.id] = 0; });
    GEAR.forEach((g) => { this.gear[g.id] = 1; });
  }

  reset(): void {
    this.gold = 800; this.gems = 400; this.prestige = 0; this.cores = 0;
    this.sector = 1; this.planet = 1;
    this.weapons = {}; this.satellites = {}; this.gear = {}; this.skills = {};
    this.passClaimed = {}; this.bundles = {};
    this.stats = { blocks: 0, planets: 0, bestSector: 1 };
    this.resetDefaults();
    this.save(); this.emit();
  }

  /* ---------- 數值 ---------- */
  get prestigeMult(): number { return 1 + Math.log10(1 + this.prestige) * 0.8; }

  satLevel(id: string): number { return this.satellites[id] ?? 0; }
  weaponLevel(id: string): number { return this.weapons[id] ?? 0; }

  /** 已解鎖武器（等級 > 0），取戰力最高 4 把出戰 */
  equipped(): string[] {
    return WEAPONS
      .filter((w) => this.weaponLevel(w.id) > 0)
      .sort((a, b) => this.weaponLevel(b.id) - this.weaponLevel(a.id))
      .slice(0, BALANCE.weaponSlots)
      .map((w) => w.id);
  }

  /** 技能加成（每個稀有度權重不同） */
  skillTotals(): Record<string, number> {
    const out: Record<string, number> = {};
    Object.entries(this.skills).forEach(([key, count]) => {
      if (!count) return;
      const [id, rk] = key.split('_');
      const def = SKILLS.find((s) => s.id === id);
      const rar = RARITY.find((r) => r.key === rk);
      if (!def || !rar) return;
      out[def.kind] = (out[def.kind] ?? 0) + def.per * rar.mul * count;
    });
    return out;
  }

  atk(): number {
    const sk = this.skillTotals();
    const reactor = 1 + GEAR[1].per * (this.gear.reactor ?? 1);
    /* 星區戰力：HP 隨星區指數成長，攻擊若只隨武器等級線性成長，第 5 星區就會卡死 */
    const sectorPower = Math.pow(BALANCE.sectorPower, this.sector - 1);
    return BALANCE.atkBase * reactor * (1 + (sk.damage ?? 0)) * this.prestigeMult * sectorPower;
  }

  attackSpeed(): number {
    const sk = this.skillTotals();
    const engine = 1 + GEAR[2].per * (this.gear.engine ?? 1);
    return engine * (1 + (sk.atkSpeed ?? 0));
  }

  critChance(): number {
    const sk = this.skillTotals();
    const crit = this.satLevel('crit') > 0 ? 0.5 : 0;
    return Math.min(0.85, BALANCE.critBase + (sk.crit ?? 0) + crit);
  }

  critMult(): number {
    const sk = this.skillTotals();
    const critDmg = this.satLevel('crit') > 0 ? 3 : 0;
    return BALANCE.critDmgBase + (sk.critDmg ?? 0) + critDmg;
  }

  coinMul(): number {
    const sk = this.skillTotals();
    return (1 + (sk.coin ?? 0)) * (1 + 0.1 * (this.sector - 1));
  }

  collectRadius(): number { return 260 * (1 + GEAR[0].per * (this.gear.hull ?? 1)) * (1 + (this.skillTotals().collect ?? 0)); }
  chainRadius(): number { return 1 + Math.floor(this.skillTotals().chain ?? 0); }
  pierce(): number { return 1 + Math.floor((this.skillTotals().pierce ?? 0) * 2); }
  bombRate(): number { return Math.min(0.35, 0.08 + (this.skillTotals().bombRate ?? 0)); }
  gemChance(): number { return 0.02 + (this.skillTotals().gemChance ?? 0); }

  /* ---------- 成本與升級 ---------- */
  weaponCost(id: string): number { return Math.round(40 * Math.pow(1.32, this.weaponLevel(id))); }
  static readonly WEAPON_MAX = 500;

  /** +N 的實際總價（不要把「單價×8」當估算，誤差很大） */
  weaponCostBulk(id: string, n = 10): number {
    let sum = 0;
    const lv0 = this.weaponLevel(id);
    for (let i = 0; i < n; i++) {
      const lv = lv0 + i;
      if (lv >= GameState.WEAPON_MAX) break;
      sum += Math.round(40 * Math.pow(1.32, lv));
    }
    return sum;
  }
  upgradeWeapon(id: string): boolean {
    if (this.weaponLevel(id) >= GameState.WEAPON_MAX) return false;   // 上限：避免等級與成本無限膨脹
    const cost = this.weaponCost(id);
    if (this.gold < cost) return false;
    this.gold -= cost; this.weapons[id] = this.weaponLevel(id) + 1;
    this.save(); this.emit(); return true;
  }
  upgradeWeaponBulk(id: string, n: number): number {
    let k = 0;
    for (let i = 0; i < n; i++) { if (!this.upgradeWeapon(id)) break; k++; }
    return k;
  }

  satCost(id: string): number { return Math.round(250 * Math.pow(2.4, this.satLevel(id))); }
  upgradeSatellite(id: string): boolean {
    if (this.satLevel(id) >= SAT.maxLevel) return false;
    const cost = this.satCost(id);
    if (this.gems < cost) return false;
    this.gems -= cost; this.satellites[id] = this.satLevel(id) + 1;
    this.save(); this.emit(); return true;
  }
  upgradeSatelliteBulk(id: string, n = 5): number {
    let k = 0;
    for (let i = 0; i < n; i++) { if (!this.upgradeSatellite(id)) break; k++; }
    return k;
  }

  gearCost(id: string): number { return Math.round(200 * Math.pow(1.22, (this.gear[id] ?? 1) - 1)); }
  upgradeGear(id: string): boolean {
    const cost = this.gearCost(id);
    if (this.gold < cost) return false;
    this.gold -= cost; this.gear[id] = (this.gear[id] ?? 1) + 1;
    this.save(); this.emit(); return true;
  }

  /* ---------- 骰子與技能融合 ---------- */
  rollSkills(times: number): number {
    const cost = times >= 100 ? DICE.hundredCost : DICE.tenCost;
    if (this.gems < cost) return 0;
    this.gems -= cost;
    for (let i = 0; i < times; i++) {
      const def = SKILLS[(Math.random() * SKILLS.length) | 0];
      const r = Math.random();
      const ri = r < 0.03 ? 3 : r < 0.12 ? 2 : r < 0.35 ? 1 : 0;
      const key = `${def.id}_${RARITY[ri].key}`;
      this.skills[key] = (this.skills[key] ?? 0) + 1;
    }
    this.save(); this.emit();
    return times;
  }

  /** 3 個同名同稀有度 → 高一階（最高神話），由低到高掃描 */
  fuseSkills(): number {
    let fused = 0;
    for (let ri = 0; ri < RARITY.length - 1; ri++) {
      let again = true;
      while (again) {
        again = false;
        SKILLS.forEach((def) => {
          const key = `${def.id}_${RARITY[ri].key}`;
          const n = this.skills[key] ?? 0;
          if (n >= 3) {
            const up = `${def.id}_${RARITY[ri + 1].key}`;
            this.skills[key] = n - 3;
            this.skills[up] = (this.skills[up] ?? 0) + 1;
            fused++; again = true;
          }
        });
      }
    }
    if (fused) { this.save(); this.emit(); }
    return fused;
  }

  skillList(): { key: string; name: string; rarityName: string; color: string; count: number; desc: string }[] {
    return Object.entries(this.skills)
      .filter(([, n]) => n > 0)
      .map(([key, count]) => {
        const [id, rk] = key.split('_');
        const def = SKILLS.find((s) => s.id === id);
        const rar = RARITY.find((r) => r.key === rk) ?? RARITY[0];
        return { key, name: def?.name ?? id, rarityName: rar.name, color: rar.color, count, desc: def?.desc ?? '' };
      })
      .sort((a, b) => b.count - a.count);
  }

  /* ---------- 補給站 ---------- */
  supply(kind: 'gems' | 'prestige' | 'weapons' | 'satellites' | 'all'): void {
    if (kind === 'gems' || kind === 'all') this.gems += SUPPLY.gems;
    if (kind === 'prestige' || kind === 'all') this.prestige += SUPPLY.prestige;
    if (kind === 'weapons' || kind === 'all') {
      WEAPONS.forEach((w) => { this.weapons[w.id] = Math.max(SUPPLY.weaponLevels, this.weaponLevel(w.id)); });
    }
    if (kind === 'satellites' || kind === 'all') {
      SATELLITES.forEach((s) => { this.satellites[s.id] = SAT.maxLevel; });
      this.cores += SUPPLY.cores;
    }
    if (kind === 'all') {
      this.gold += 1e8;
      this.cores += SUPPLY.cores;
      GEAR.forEach((g) => { this.gear[g.id] = Math.max(25, this.gear[g.id] ?? 1); });
    }
    this.save(); this.emit();
  }

  /* ---------- 通行證與禮包 ---------- */
  passClaim(tier: number): boolean {
    const t = PASS_TIERS.find((x) => x.tier === tier);
    if (!t || this.passClaimed[String(tier)]) return false;
    this.passClaimed[String(tier)] = true;
    this.gems += t.gems; this.prestige += t.prestige; this.cores += t.cores;
    this.save(); this.emit(); return true;
  }
  passClaimAll(): number {
    let n = 0;
    PASS_TIERS.forEach((t) => { if (this.passClaim(t.tier)) n++; });
    return n;
  }

  bundleClaim(id: string): boolean {
    const b = BUNDLES.find((x) => x.id === id);
    if (!b || this.bundles[id]) return false;
    this.bundles[id] = true;
    this.gems += b.gems; this.prestige += b.prestige; this.cores += b.cores;
    if (b.gold) this.gold += b.gold;
    if (b.weaponLevels) WEAPONS.forEach((w) => { this.weapons[w.id] = this.weaponLevel(w.id) + b.weaponLevels!; });
    if (b.satLevels) SATELLITES.forEach((s) => { this.satellites[s.id] = Math.max(b.satLevels!, this.satLevel(s.id)); });
    this.save(); this.emit(); return true;
  }

  /* ---------- 星球推進 ---------- */
  clearPlanet(): void {
    this.stats.planets += 1;
    const bonus = Math.round(PLANET.hpBase * BALANCE.planetClearBonus * this.coinMul() * this.sector);
    this.gold += bonus;
    this.prestige += Math.round(3 * this.sector * this.prestigeMult);
    this.planet += 1;
    if (this.planet > 5) { this.planet = 1; this.sector += 1; }
    this.stats.bestSector = Math.max(this.stats.bestSector, this.sector);
    this.save(); this.emit();
  }

  get version(): string { return VERSION; }

  /** 給 UI 的戰力估算 */
  power(): number {
    return Math.round(this.atk() * this.attackSpeed() * (1 + this.critChance() * (this.critMult() - 1)) * 100);
  }
}

export const gameState = new GameState();
