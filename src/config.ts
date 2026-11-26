/* config.ts — 全部平衡參數集中在這裡（其他檔案不得硬編碼數字） */

export const VERSION = '1.3.2';

export interface WeaponDef {
  id: string; name: string; color: string;
  dmg: number; interval: number; range: number;
  kind: 'melee' | 'bullet' | 'splash' | 'chain' | 'orbit' | 'beam' | 'missile' | 'blackhole' | 'nova' | 'buster';
  desc: string;
}

export const PLANET = {
  gridMin: 11,
  gridMax: 23,
  hpBase: 150,
  hpPerSector: 1.35,   // 1.85 會讓第 5 星區就打不動（實測 6 秒 0 擊破）
  hpPerPlanet: 1.05,
  coreMul: 16,        // 核心要真的打一段時間，否則星球 0.2 秒就通關
  goldMul: 3.2,
  energyMul: 1.6,
  bombMul: 1.25,
};

export type BlockKind = 'normal' | 'gold' | 'energy' | 'bomb' | 'core';

export const BLOCK: Record<BlockKind, { color: string; edge: string; drop: number; gemChance: number }> = {
  normal: { color: '#2a4a6e', edge: '#5fd6ff', drop: 1, gemChance: 0.02 },
  gold: { color: '#6b4a12', edge: '#ffd23f', drop: 10, gemChance: 0.06 },
  energy: { color: '#14513f', edge: '#5cffa8', drop: 2, gemChance: 0.02 },
  bomb: { color: '#5e1f1a', edge: '#ff7a45', drop: 2, gemChance: 0.02 },
  core: { color: '#3a1660', edge: '#c46bff', drop: 40, gemChance: 0.5 },
};

export const ECON = {
  coinBase: 4,
  coinPerSector: 2.4,
  prestigePerPlanet: 3,
  autoCollectRadius: 260,
};

export const RARITY = [
  { key: 'common', name: '普通', color: '#9fb0c8', mul: 1 },
  { key: 'rare', name: '稀有', color: '#5aa9ff', mul: 2 },
  { key: 'epic', name: '史詩', color: '#b06bff', mul: 4 },
  { key: 'legend', name: '傳奇', color: '#ff9f43', mul: 8 },
  { key: 'myth', name: '神話', color: '#ff5470', mul: 16 },
];

export const SKILLS = [
  { id: 'dmg', name: '額外傷害', per: 0.15, kind: 'damage', desc: '全武器傷害提升' },
  { id: 'coin', name: '金幣掉落', per: 0.25, kind: 'coin', desc: '金幣掉落提升' },
  { id: 'bomb', name: '易爆生成', per: 0.04, kind: 'bombRate', desc: '易爆方塊生成率提升' },
  { id: 'chain', name: '連鎖範圍', per: 0.4, kind: 'chain', desc: '連鎖爆炸半徑提升' },
  { id: 'atkSpd', name: '攻速', per: 0.12, kind: 'atkSpeed', desc: '全武器攻速提升' },
  { id: 'crit', name: '暴擊率', per: 0.04, kind: 'crit', desc: '暴擊率提升' },
  { id: 'critDmg', name: '暴擊傷害', per: 0.4, kind: 'critDmg', desc: '暴擊傷害提升' },
  { id: 'pierce', name: '穿透', per: 0.2, kind: 'pierce', desc: '子彈穿透提升' },
  { id: 'collect', name: '採集範圍', per: 0.2, kind: 'collect', desc: '資源吸附範圍提升' },
  { id: 'gem', name: '寶石掉落', per: 0.2, kind: 'gemChance', desc: '寶石掉落提升' },
] as const;

export const DICE = { tenCost: 220, hundredCost: 2000 };

export const WEAPONS: WeaponDef[] = [
  { id: 'lance', name: '鑽頭長矛', color: '#7ad7ff', dmg: 0.7, interval: 0.16, range: 96, kind: 'melee', desc: '近距離高頻穿透刺擊' },
  { id: 'gatling', name: '電漿機槍', color: '#8ef0a8', dmg: 0.5, interval: 0.1, range: 460, kind: 'bullet', desc: '高速單體，越射越快' },
  { id: 'mortar', name: '重型迫擊炮', color: '#ffb36b', dmg: 1.8, interval: 1.3, range: 500, kind: 'splash', desc: '拋物線範圍爆炸' },
  { id: 'chain', name: '連鎖電弧', color: '#a9d4ff', dmg: 0.7, interval: 0.85, range: 320, kind: 'chain', desc: '命中後在方塊間彈跳' },
  { id: 'saw', name: '軌道圓鋸', color: '#d9e6ff', dmg: 0.9, interval: 0.35, range: 70, kind: 'orbit', desc: '繞飛船旋轉持續切割' },
  { id: 'laser', name: '聚能雷射', color: '#ff7ad9', dmg: 0.45, interval: 0.12, range: 560, kind: 'beam', desc: '持續照射同目標傷害翻倍' },
  { id: 'missile', name: '追蹤微飛彈', color: '#ffd166', dmg: 0.65, interval: 0.7, range: 600, kind: 'missile', desc: '發射多枚追蹤飛彈' },
  { id: 'gravity', name: '重力黑洞砲', color: '#b48cff', dmg: 1.1, interval: 1.6, range: 420, kind: 'blackhole', desc: '黑洞集中碾壓' },
  { id: 'cryo', name: '冰霜新星', color: '#9be7ff', dmg: 0.5, interval: 1.1, range: 300, kind: 'nova', desc: '凍結範圍，受創提升' },
  { id: 'buster', name: '殲星主砲', color: '#ff6b6b', dmg: 12, interval: 6, range: 940, kind: 'buster', desc: '貫穿整顆星球的毀滅光束' },
];

export const SATELLITES = [
  { id: 'collector', name: '採集衛星', color: '#33f28c', radius: 30, speed: 2.4, desc: '定期抽取金幣與寶石' },
  { id: 'bomber', name: '爆破衛星', color: '#ff6626', radius: 38, speed: 1.8, desc: '定期投擲高爆核彈' },
  { id: 'beam', name: '雷射衛星', color: '#26d9ff', radius: 42, speed: 2.1, desc: '連線切割沿途方塊' },
  { id: 'mirror', name: '複製衛星', color: '#d959ff', radius: 34, speed: -2.2, desc: '複製主武器彈幕' },
  { id: 'crit', name: '暴擊衛星', color: '#ffd933', radius: 47, speed: 1.5, desc: '暴擊率、暴擊傷害' },
  { id: 'chrono', name: '時空衛星', color: '#8cbfff', radius: 47, speed: -1.5, desc: '週期性攻速爆發' },
];

export const SAT = {
  dmgBase: 18,
  dmgGrow: 1.24,
  sectorGrow: 1.35,
  collector: { interval: 1.5, minInterval: 0.35, perLv: 0.02, gold: 25, gemChance: 0.25 },
  bomber: { interval: 1.8, minInterval: 0.45, perLv: 0.025, radius: 42, dmgMult: 12 },
  mirror: { interval: 0.28, ratioBase: 0.5, ratioPerLv: 0.01, dmgMult: 2.2 },
  beam: { tick: 0.1, width: 26, dmgMult: 3 },
  ring: { interval: 4, radius: 36 },
  maxLevel: 5,
};

export const GEAR = [
  { id: 'hull', name: '船體', per: 0.1, desc: '碰撞傷害與吸附範圍' },
  { id: 'reactor', name: '反應爐核心', per: 0.12, desc: '全武器攻擊力' },
  { id: 'engine', name: '引擎', per: 0.08, desc: '環繞速度與攻速' },
];

export interface PassTier { tier: number; gems: number; prestige: number; cores: number }

export const PASS_TIERS: PassTier[] = Array.from({ length: 50 }, (_, i) => {
  const tier = i + 1;
  const big = tier % 10 === 0;
  return {
    tier,
    gems: Math.round(50000 * tier * (big ? 2 : 1)),
    prestige: 10000 * tier,
    cores: 500,
  };
});

export interface BundleDef {
  id: string; name: string; gems: number; prestige: number; cores: number;
  gold?: number; weaponLevels?: number; satLevels?: number;
}

export const BUNDLES: BundleDef[] = [
  { id: 'starter_pack', name: '🎁 新手啟航至尊禮包', gems: 500_000, prestige: 10_000, cores: 5_000, gold: 10_000_000 },
  { id: 'unlimited_drill_pack', name: '⚔️ 全武器精通禮包', gems: 1_000_000, prestige: 50_000, cores: 20_000, weaponLevels: 25 },
  { id: 'all_satellites_pack', name: '🛰️ 衛星艦隊滿編禮包', gems: 1_500_000, prestige: 80_000, cores: 30_000, satLevels: 5 },
];

export const SUPPLY = { gems: 1_000_000, prestige: 1_000_000, weaponLevels: 10, cores: 100_000 };

export const BALANCE = {
  atkBase: 12,
  sectorPower: 1.15,   // 每星區戰力倍率，必須跟得上 HP 曲線
  critBase: 0.05,
  critDmgBase: 1.6,
  chainJump: 5,
  missileCount: 6,
  blackholeDuration: 2.2,
  novaDuration: 3,
  novaAmp: 3,
  bombPercent: 0.6,      // Step 5 規格 85% 實測會連鎖清空整顆星球 → 降到 60% 並限深度 3
  chainDelay: 0.06,      // Step 5 規格：延遲 60ms 引爆
  planetClearBonus: 12,
  weaponSlots: 4,
  overdriveSec: 5,
  overdriveMul: 2.5,     // Step 5 規格：能量方塊 → 5 秒 2.5 倍攻速
  joystickIdle: 1.5,     // 放手 1.5 秒回到自動巡航
};
