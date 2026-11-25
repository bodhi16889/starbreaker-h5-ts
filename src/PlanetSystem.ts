/* PlanetSystem.ts — 圓形網格星球、5 種方塊、連鎖爆炸、掉落 */
import { BALANCE, BLOCK, BlockKind, PLANET } from './config';
import type { GameState } from './GameState';

export interface Block {
  x: number;
  y: number;
  size: number;
  kind: BlockKind;
  hp: number;
  maxHp: number;
  alive: boolean;
  flash: number;
  frozenUntil: number;
  chainDepth: number;      // 這顆方塊是被第幾層連鎖炸到的（限制連鎖深度）
}

export interface PlanetHooks {
  onDeath: (b: Block) => void;
  onDrop: (x: number, y: number, kind: 'coin' | 'gem' | 'core', value: number) => void;
  onFloater: (x: number, y: number, text: string, color: string) => void;
  onShake: (power: number) => void;
  onOverdrive: () => void;
  onCleared: () => void;
}

interface PendingBlast { t: number; x: number; y: number; dmg: number; radius: number; depth: number }

/** 連鎖深度上限：沒有上限的話 8% 易爆方塊會把整顆星球連鎖炸光（實測 5 秒通關）。 */
const MAX_CHAIN_DEPTH = 3;

export class PlanetSystem {
  blocks: Block[] = [];
  radius = 150;
  cell = 26;
  centerX = 0;
  centerY = 0;
  private pending: PendingBlast[] = [];
  private cleared = false;

  constructor(private state: GameState, private hooks: PlanetHooks) {}

  build(sector: number, planet: number): void {
    const n = Math.min(PLANET.gridMax, PLANET.gridMin + (sector - 1) * 2);
    const cell = Math.max(18, Math.min(30, 300 / n));
    const radius = (n * cell) / 2;
    this.cell = cell;
    this.radius = radius;
    this.blocks = [];
    this.pending = [];
    this.cleared = false;

    const hpBase = PLANET.hpBase
      * Math.pow(PLANET.hpPerSector, sector - 1)
      * Math.pow(PLANET.hpPerPlanet, planet - 1);

    const half = (n - 1) / 2;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const dx = gx - half;
        const dy = gy - half;
        const dist = Math.hypot(dx, dy) / half;
        if (dist > 1.02) continue;

        const isCore = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        const r = Math.random();
        let kind: BlockKind = 'normal';
        if (isCore) kind = 'core';
        else if (r < this.state.bombRate()) kind = 'bomb';
        else if (r < this.state.bombRate() + 0.07) kind = 'gold';
        else if (r < this.state.bombRate() + 0.14) kind = 'energy';

        const mul = kind === 'core' ? PLANET.coreMul
          : kind === 'gold' ? PLANET.goldMul
          : kind === 'energy' ? PLANET.energyMul
          : kind === 'bomb' ? PLANET.bombMul : 1;

        const hp = Math.round(hpBase * mul);
        this.blocks.push({
          x: dx * cell, y: dy * cell, size: cell * 0.92, kind,
          hp, maxHp: hp, alive: true, flash: 0, frozenUntil: 0, chainDepth: 0,
        });
      }
    }
  }

  aliveCount(): number {
    let n = 0;
    for (const b of this.blocks) if (b.alive) n++;
    return n;
  }

  alive(): Block[] {
    return this.blocks.filter((b) => b.alive);
  }

  nearest(x: number, y: number, maxDist = 1e9): Block | null {
    let best: Block | null = null;
    let bestD = maxDist;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** 回傳實際造成的傷害（含暴擊） */
  hit(b: Block, amount: number, opts?: { crit?: boolean; silent?: boolean }): number {
    if (!b.alive) return 0;
    const crit = opts?.crit ?? Math.random() < this.state.critChance();
    let dmg = amount * (crit ? this.state.critMult() : 1);
    if (b.frozenUntil > performance.now()) dmg *= BALANCE.novaAmp;
    b.hp -= dmg;
    b.flash = 0.12;
    if (!opts?.silent) {
      this.hooks.onFloater(b.x, b.y, (crit ? '✷' : '') + this.fmt(dmg) + ' CR', crit ? '#ffd166' : '#eaf6ff');
    }
    if (b.hp <= 0) this.kill(b);
    return dmg;
  }

  private fmt(n: number): string {
    return n >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.max(1, Math.round(n)));
  }

  private kill(b: Block): void {
    if (!b.alive) return;
    b.alive = false;
    this.state.stats.blocks += 1;
    this.hooks.onDeath(b);

    /* 掉落 */
    const drop = BLOCK[b.kind].drop;
    const sector = this.state.sector;
    const coins = Math.max(1, Math.round(drop * 4 * Math.pow(1.5, sector - 1) * this.state.coinMul()));
    this.hooks.onDrop(b.x, b.y, 'coin', coins);
    if (Math.random() < BLOCK[b.kind].gemChance + this.state.gemChance()) this.hooks.onDrop(b.x, b.y, 'gem', 1 + Math.floor(sector / 2));
    if (b.kind === 'core') this.hooks.onDrop(b.x, b.y, 'core', 3);

    if (b.kind === 'energy') this.hooks.onOverdrive();

    if (b.kind === 'bomb' && b.chainDepth < MAX_CHAIN_DEPTH) {
      const depth = b.chainDepth + 1;
      this.pending.push({
        t: BALANCE.chainDelay * depth,
        x: b.x, y: b.y,
        dmg: b.maxHp * BALANCE.bombPercent * Math.pow(0.7, depth - 1),
        radius: (this.state.chainRadius() + 1) * this.cell * 1.6,
        depth,
      });
      this.hooks.onShake(4);
    }

    if (b.kind === 'core' && !this.cleared) {
      this.cleared = true;
      this.hooks.onShake(12);
      setTimeout(() => this.hooks.onCleared(), 220);
    }
  }

  splash(x: number, y: number, radius: number, amount: number, depth = 0): void {
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - x, b.y - y) <= radius) {
        if (depth > b.chainDepth) b.chainDepth = depth;
        this.hit(b, amount, { silent: false });
      }
    }
  }

  freeze(x: number, y: number, radius: number, ms: number): void {
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - x, b.y - y) <= radius) b.frozenUntil = performance.now() + ms;
    }
  }

  /** 連鎖爆炸計時器（60ms 延遲、可遞迴） */
  update(dt: number): void {
    if (!this.pending.length) return;
    const ready = this.pending.filter((p) => (p.t -= dt) <= 0);
    if (!ready.length) return;
    this.pending = this.pending.filter((p) => p.t > 0);
    ready.forEach((p) => {
      this.hooks.onShake(6);
      this.splash(p.x, p.y, p.radius, p.dmg, p.depth);
    });
  }

  /** 每顆方塊自帶的視覺殘光衰減 */
  tickVisuals(dt: number): void {
    for (const b of this.blocks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
  }
}
