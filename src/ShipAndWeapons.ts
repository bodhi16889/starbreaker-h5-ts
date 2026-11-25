/* ShipAndWeapons.ts — 飛船自動巡航／虛擬搖桿、10 種武器、6 顆衛星、彈幕與掉落 */
import { BALANCE, SATELLITES, SAT, WEAPONS, WeaponDef } from './config';
import type { GameState } from './GameState';
import type { PlanetSystem, Block } from './PlanetSystem';

export interface Vec { x: number; y: number }

interface Proj {
  alive: boolean; x: number; y: number; vx: number; vy: number;
  life: number; dmg: number; color: string; r: number;
  kind: 'bullet' | 'missile' | 'mortar'; target: Block | null;
}

interface Drop {
  alive: boolean; x: number; y: number; vx: number; vy: number;
  kind: 'coin' | 'gem' | 'core'; value: number; life: number;
}

interface Floater { alive: boolean; x: number; y: number; text: string; color: string; life: number }

interface Fx {
  alive: boolean; kind: 'ring' | 'ringFixed' | 'line';
  x: number; y: number; r: number; x2: number; y2: number;
  color: string; life: number; max: number; width: number;
}

const FLOATER_MAX = 14;   // 六衛星＋十武器同時打會洗版，超過就併進現有數字
const ORBIT_DIST = 74;

export class Combat {
  ship: Vec = { x: 0, y: 0 };
  angle = 0;
  target: Block | null = null;

  manual = false;
  pointerId: number | null = null;
  joyBase: Vec = { x: 0, y: 0 };
  joyVec: Vec = { x: 0, y: 0 };
  private releaseTimer = 0;

  projs: Proj[] = [];
  drops: Drop[] = [];
  floaters: Floater[] = [];
  fx: Fx[] = [];

  private cd: Record<string, number> = {};
  private satTimer: Record<string, number> = {};
  private satAngle: Record<string, number> = {};
  satSpin = 0;
  beamTick = 0;
  private laserStack = 0;
  private laserTarget: Block | null = null;
  private sawAngle = 0;

  constructor(private state: GameState, private planet: PlanetSystem) {
    SATELLITES.forEach((s, i) => { this.satAngle[s.id] = (i / SATELLITES.length) * Math.PI * 2; });
  }

  reset(): void {
    this.projs = [];
    this.drops = [];
    this.floaters = [];
    this.fx = [];
    this.target = null;
    this.laserStack = 0;
    this.laserTarget = null;
    this.cd = {};
    SATELLITES.forEach((s) => { this.satTimer[s.id] = 0; });
  }

  /* ---------------- 輸入 ---------------- */
  pointerDown(x: number, y: number, id: number): void {
    this.manual = true;
    this.pointerId = id;
    this.joyBase = { x, y };
    this.joyVec = { x: 0, y: 0 };
    this.releaseTimer = 0;
  }

  pointerMove(x: number, y: number, id: number): void {
    if (this.pointerId !== id) return;
    const dx = x - this.joyBase.x;
    const dy = y - this.joyBase.y;
    const len = Math.hypot(dx, dy);
    const max = 56;
    const k = len > max ? max / len : 1;
    this.joyVec = { x: dx * k, y: dy * k };
  }

  pointerUp(id: number): void {
    if (this.pointerId !== id) return;
    this.pointerId = null;
    this.joyVec = { x: 0, y: 0 };
    this.releaseTimer = BALANCE.joystickIdle;
  }

  /* ---------------- 每幀 ---------------- */
  update(dt: number): void {
    this.updateShip(dt);
    this.updateTarget();
    this.updateWeapons(dt);
    this.updateSatellites(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.updateFloaters(dt);
    this.updateFx(dt);
    this.planet.update(dt);
  }

  private updateShip(dt: number): void {
    const speedMul = 1 + 0.08 * ((this.state.gear.engine ?? 1) - 1);
    if (this.manual) {
      const j = this.joyVec;
      const mag = Math.hypot(j.x, j.y);
      if (mag > 2) {
        const v = 260 * speedMul;
        this.ship.x += (j.x / Math.max(mag, 1)) * v * dt;
        this.ship.y += (j.y / Math.max(mag, 1)) * v * dt;
        /* 限制在軌道環附近，避免飛出畫面 */
        const d = Math.hypot(this.ship.x, this.ship.y);
        const minD = this.planet.radius + 18;
        const maxD = this.planet.radius + 190;
        if (d < minD) { const k = minD / (d || 1); this.ship.x *= k; this.ship.y *= k; }
        if (d > maxD) { const k = maxD / d; this.ship.x *= k; this.ship.y *= k; }
      }
    } else {
      if (this.releaseTimer > 0) {
        this.releaseTimer -= dt;
        if (this.releaseTimer <= 0) { this.manual = false; this.pointerId = null; }
      }
      this.angle += dt * 0.85 * speedMul;
      const r = this.planet.radius + ORBIT_DIST;
      this.ship.x = Math.cos(this.angle) * r;
      this.ship.y = Math.sin(this.angle) * r;
    }
  }

  private updateTarget(): void {
    this.target = this.planet.nearest(this.ship.x, this.ship.y, 1e9);
  }

  /* ---------------- 武器 ---------------- */
  private updateWeapons(dt: number): void {
    const speed = this.state.attackSpeed() * this.overdriveMul();
    const atk = this.state.atk();
    this.sawAngle += dt * 3.2;

    for (const id of this.state.equipped()) {
      const def = WEAPONS.find((w) => w.id === id)!;
      const lv = this.state.weaponLevel(id);
      const cd = (this.cd[id] ?? 0) - dt * speed;
      if (cd > 0) { this.cd[id] = cd; continue; }
      this.cd[id] = def.interval;
      this.fire(def, lv, atk);
    }

    /* 軌道圓鋸：不吃冷卻，持續切割 */
    if (this.state.weaponLevel('saw') > 0) {
      const radius = 52 + this.state.weaponLevel('saw');
      const sx = this.ship.x + Math.cos(this.sawAngle) * radius;
      const sy = this.ship.y + Math.sin(this.sawAngle) * radius;
      this.planet.blocks.forEach((b) => {
        if (b.alive && Math.hypot(b.x - sx, b.y - sy) < this.planet.cell * 0.8) {
          this.planet.hit(b, atk * 0.9 * dt * 6, { silent: true });
        }
      });
    }
  }

  private overdriveMul(): number {
    return this.state.overdriveUntil > performance.now() ? BALANCE.overdriveMul : 1;
  }

  private fire(def: WeaponDef, lv: number, atk: number): void {
    const t = this.target;
    if (!t) return;
    const dmg = atk * def.dmg * (1 + lv * 0.12);
    const ang = Math.atan2(t.y - this.ship.y, t.x - this.ship.x);

    switch (def.kind) {
      case 'melee': {
        if (Math.hypot(t.x - this.ship.x, t.y - this.ship.y) > def.range) break;
        this.planet.hit(t, dmg);
        this.line(this.ship.x, this.ship.y, t.x, t.y, def.color, 0.1, 5);
        break;
      }
      case 'bullet': {
        this.spawnProj(this.ship.x, this.ship.y, Math.cos(ang) * 620, Math.sin(ang) * 620, dmg, def.color, 'bullet', t);
        break;
      }
      case 'missile': {
        for (let i = 0; i < Math.min(6, BALANCE.missileCount); i++) {
          const a = ang + (Math.random() - 0.5) * 0.9;
          this.spawnProj(this.ship.x, this.ship.y, Math.cos(a) * 420, Math.sin(a) * 420, dmg, def.color, 'missile', t);
        }
        break;
      }
      case 'splash': {
        this.spawnProj(this.ship.x, this.ship.y, Math.cos(ang) * 340, Math.sin(ang) * 340, dmg, def.color, 'mortar', t);
        break;
      }
      case 'chain': {
        let cur: Block | null = t;
        let prevX = this.ship.x;
        let prevY = this.ship.y;
        const hitSet = new Set<Block>();
        for (let i = 0; i < BALANCE.chainJump + lv; i++) {
          if (!cur) break;
          hitSet.add(cur);
          this.planet.hit(cur, dmg * Math.pow(0.82, i));
          this.line(prevX, prevY, cur.x, cur.y, def.color, 0.12, 2);
          prevX = cur.x; prevY = cur.y;
          const from = cur;
          let next: Block | null = null;
          let best = def.range;
          this.planet.blocks.forEach((b) => {
            if (!b.alive || hitSet.has(b)) return;
            const d = Math.hypot(b.x - from.x, b.y - from.y);
            if (d < best) { best = d; next = b; }
          });
          cur = next;
        }
        break;
      }
      case 'beam': {
        if (this.laserTarget !== t) { this.laserTarget = t; this.laserStack = 0; }
        this.laserStack = Math.min(6, this.laserStack + 1);
        this.planet.hit(t, dmg * (1 + this.laserStack * 0.35));
        this.line(this.ship.x, this.ship.y, t.x, t.y, def.color, 0.1, 4);
        break;
      }
      case 'blackhole': {
        this.planet.splash(t.x, t.y, def.range * 0.5, dmg);
        this.ring(t.x, t.y, 30, def.color, 0.6);
        break;
      }
      case 'nova': {
        this.planet.splash(t.x, t.y, def.range, dmg);
        this.planet.freeze(t.x, t.y, def.range, BALANCE.novaDuration * 1000);
        this.ring(t.x, t.y, def.range, def.color, 0.5);
        break;
      }
      case 'buster': {
        this.planet.blocks.forEach((b) => {
          if (!b.alive) return;
          if (Math.abs(Math.hypot(b.x - this.ship.x, b.y - this.ship.y) - Math.hypot(t.x - this.ship.x, t.y - this.ship.y)) < 70) {
            this.planet.hit(b, dmg);
          }
        });
        this.line(this.ship.x, this.ship.y, Math.cos(ang) * 900, Math.sin(ang) * 900, def.color, 0.35, 14);
        break;
      }
      default:
        break;
    }
  }

  /* ---------------- 衛星 ---------------- */
  private satDamage(lv: number, mult: number): number {
    return mult * Math.pow(SAT.dmgGrow, Math.max(0, lv - 1)) * SAT.dmgBase
      * this.state.prestigeMult * Math.pow(SAT.sectorGrow, this.state.sector - 1);
  }

  private updateSatellites(dt: number): void {
    const speed = this.state.attackSpeed() * this.overdriveMul();
    const t = this.target;
    const pos = new Map<string, Vec>();

    SATELLITES.forEach((s) => {
      const lv = this.state.satLevel(s.id);
      if (lv <= 0) return;
      this.satAngle[s.id] += s.speed * dt;
      const p = { x: this.ship.x + Math.cos(this.satAngle[s.id]) * s.radius, y: this.ship.y + Math.sin(this.satAngle[s.id]) * s.radius };
      pos.set(s.id, p);
      if (!t) return;

      this.satTimer[s.id] = (this.satTimer[s.id] ?? 0) - dt * speed;
      if (this.satTimer[s.id] > 0) return;

      switch (s.id) {
        case 'collector': {
          this.satTimer[s.id] = Math.max(SAT.collector.minInterval, SAT.collector.interval - lv * SAT.collector.perLv);
          const bonus = Math.round(SAT.collector.gold * lv * this.state.planet * this.state.prestigeMult);
          this.state.gold += bonus;
          this.state.emit();
          this.floater(p.x, p.y, '+' + bonus, s.color);
          this.line(p.x, p.y, t.x, t.y, s.color, 0.12, 2);
          if (Math.random() < SAT.collector.gemChance) this.state.gems += 1 + Math.floor(lv / 3);
          break;
        }
        case 'bomber': {
          this.satTimer[s.id] = Math.max(SAT.bomber.minInterval, SAT.bomber.interval - lv * SAT.bomber.perLv);
          this.ring(t.x, t.y, SAT.bomber.radius, s.color, 0.3);
          this.planet.splash(t.x, t.y, SAT.bomber.radius, this.satDamage(lv, SAT.bomber.dmgMult));
          break;
        }
        case 'mirror': {
          this.satTimer[s.id] = SAT.mirror.interval;
          const ratio = Math.min(1, SAT.mirror.ratioBase + lv * SAT.mirror.ratioPerLv);
          this.planet.hit(t, this.satDamage(lv, SAT.mirror.dmgMult) * ratio);
          this.line(p.x, p.y, t.x, t.y, s.color, 0.08, 2);
          break;
        }
        case 'crit':
        case 'chrono': {
          this.satTimer[s.id] = SAT.ring.interval;
          this.ring(p.x, p.y, SAT.ring.radius, s.color, 0.22);
          if (s.id === 'chrono') this.state.overdriveUntil = performance.now() + 1200;
          break;
        }
        default:
          break;
      }
    });

    /* 雷射衛星：衛星 → 目標 的持續切割光束 */
    const beam = pos.get('beam');
    if (beam && t) {
      const lv = this.state.satLevel('beam');
      this.beamSeg = { x1: beam.x, y1: beam.y, x2: t.x, y2: t.y, width: Math.min(4 + lv * 0.12, 10) };
      this.beamTick -= dt * speed;
      if (this.beamTick <= 0) {
        this.beamTick = SAT.beam.tick;
        const dmg = this.satDamage(lv, SAT.beam.dmgMult);
        this.planet.blocks.forEach((b) => {
          if (!b.alive) return;
          if (this.distToSeg(b.x, b.y, beam.x, beam.y, t.x, t.y) <= SAT.beam.width) this.planet.hit(b, dmg, { silent: true });
        });
      }
    } else {
      this.beamSeg = null;
    }
  }

  beamSeg: { x1: number; y1: number; x2: number; y2: number; width: number } | null = null;

  private distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /* ---------------- 物件池 ---------------- */
  private spawnProj(x: number, y: number, vx: number, vy: number, dmg: number, color: string, kind: Proj['kind'], target: Block | null): void {
    let p = this.projs.find((q) => !q.alive);
    if (!p) { p = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0, color: '', r: 3, kind: 'bullet', target: null }; this.projs.push(p); }
    Object.assign(p, { alive: true, x, y, vx, vy, life: kind === 'mortar' ? 1.4 : 1.1, dmg, color, r: kind === 'missile' ? 3 : 2.5, kind, target });
  }

  private updateProjectiles(dt: number): void {
    this.projs.forEach((p) => {
      if (!p.alive) return;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; return; }

      if (p.kind === 'missile' && p.target && p.target.alive) {
        const ang = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        p.vx += Math.cos(ang) * 900 * dt;
        p.vy += Math.sin(ang) * 900 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 520) { p.vx *= 520 / sp; p.vy *= 520 / sp; }
      }

      const steps = Math.max(1, Math.ceil(Math.hypot(p.vx * dt, p.vy * dt) / 6));
      for (let i = 0; i < steps; i++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        const hit = this.planet.blocks.find((b) => b.alive && Math.hypot(b.x - p.x, b.y - p.y) < b.size * 0.55 + p.r);
        if (hit) {
          if (p.kind === 'mortar') this.planet.splash(p.x, p.y, this.planet.cell * 2.2, p.dmg);
          else this.planet.hit(hit, p.dmg);
          p.alive = false;
          return;
        }
      }

      const d = Math.hypot(p.x, p.y);
      if (d > this.planet.radius + 340) p.alive = false;
    });
  }

  /* ---------------- 掉落 ---------------- */
  private updateDrops(dt: number): void {
    const radius = this.state.collectRadius();
    this.drops.forEach((d) => {
      if (!d.alive) return;
      d.life -= dt;
      const dx = this.ship.x - d.x;
      const dy = this.ship.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        const k = 1 + (1 - dist / radius) * 9;
        d.vx += (dx / (dist || 1)) * 520 * k * dt;
        d.vy += (dy / (dist || 1)) * 520 * k * dt;
      }
      d.vx *= 0.94; d.vy *= 0.94;
      d.x += d.vx * dt; d.y += d.vy * dt;

      if (dist < 14) {
        d.alive = false;
        if (d.kind === 'coin') this.state.gold += d.value;
        else if (d.kind === 'gem') this.state.gems += d.value;
        else this.state.cores += d.value;
      } else if (d.life <= 0) {
        d.alive = false;
        if (d.kind === 'coin') this.state.gold += d.value;
        else if (d.kind === 'gem') this.state.gems += d.value;
        else this.state.cores += d.value;
      }
    });
  }

  addDrop(x: number, y: number, kind: 'coin' | 'gem' | 'core', value: number): void {
    let d = this.drops.find((q) => !q.alive);
    if (!d) { d = { alive: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'coin', value: 0, life: 0 }; this.drops.push(d); }
    Object.assign(d, {
      alive: true, x, y, kind, value, life: 14,
      vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80,
    });
  }

  /* ---------------- 跳字與特效 ---------------- */
  floater(x: number, y: number, text: string, color: string): void {
    const alive = this.floaters.filter((f) => f.alive);
    if (alive.length >= FLOATER_MAX) {
      const f0 = alive[(Math.random() * alive.length) | 0];
      const n0 = parseFloat(f0.text.replace(/[^\d.]/g, ''));
      const n1 = parseFloat(text.replace(/[^\d.]/g, ''));
      if (isFinite(n0) && isFinite(n1)) f0.text = '✷+' + Math.round(n0 + n1).toLocaleString('en-US');
      return;
    }
    let f = this.floaters.find((q) => !q.alive);
    if (!f) { f = { alive: false, x: 0, y: 0, text: '', color: '', life: 0 }; this.floaters.push(f); }
    Object.assign(f, { alive: true, x, y, text, color, life: 0.85 });
  }

  private updateFloaters(dt: number): void {
    this.floaters.forEach((f) => { if (f.alive) { f.y -= 46 * dt; f.life -= dt; if (f.life <= 0) f.alive = false; } });
  }

  ring(x: number, y: number, r: number, color: string, life: number): void {
    this.pushFx({ alive: true, kind: 'ringFixed', x, y, r, x2: 0, y2: 0, color, life, max: life, width: 2 });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, life: number, width: number): void {
    this.pushFx({ alive: true, kind: 'line', x: x1, y: y1, r: 0, x2, y2, color, life, max: life, width });
  }

  private pushFx(f: Fx): void {
    let slot = this.fx.find((q) => !q.alive);
    if (!slot) { slot = { ...f }; this.fx.push(slot); return; }
    Object.assign(slot, f);
  }

  private updateFx(dt: number): void {
    this.fx.forEach((f) => { if (f.alive) { f.life -= dt; if (f.life <= 0) f.alive = false; } });
  }

  /* ---------------- 渲染 ---------------- */
  render(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale = 1): void {
    ctx.save();
    ctx.translate(cx, cy);

    /* 掉落物 */
    this.drops.forEach((d) => {
      if (!d.alive) return;
      ctx.fillStyle = d.kind === 'coin' ? '#ffd23f' : d.kind === 'gem' ? '#5fd6ff' : '#c46bff';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.kind === 'gem' ? 4 : d.kind === 'core' ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });

    /* 特效 */
    ctx.globalCompositeOperation = 'lighter';
    this.fx.forEach((f) => {
      if (!f.alive) return;
      const a = Math.max(0, f.life / f.max);
      ctx.globalAlpha = a;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.width;
      ctx.beginPath();
      if (f.kind === 'line') {
        ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2);
      } else {
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* 彈幕 */
    this.projs.forEach((p) => {
      if (!p.alive) return;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    /* 衛星（六邊形 + 白核 + 自轉） */
    ctx.save();
    ctx.translate(this.ship.x, this.ship.y);
    SATELLITES.forEach((s) => {
      const lv = this.state.satLevel(s.id);
      if (lv <= 0) return;
      const x = Math.cos(this.satAngle[s.id]) * s.radius;
      const y = Math.sin(this.satAngle[s.id]) * s.radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.satSpin);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * 10, py = Math.sin(a) * 10;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * 4.5, py = Math.sin(a) * 4.5;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    });

    /* 飛船 */
    const ship = this.ship;
    const aim = this.target ? Math.atan2(this.target.y - ship.y, this.target.x - ship.x) : this.angle;
    ctx.rotate(aim);
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-10, 8); ctx.lineTo(-5, 0); ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5fd6ff';
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* 雷射衛星光束 */
    if (this.beamSeg) {
      const b = this.beamSeg;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(38,217,255,.9)';
      ctx.lineWidth = b.width;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1, b.width * 0.35);
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* 跳字 */
    this.floaters.forEach((f) => {
      if (!f.alive) return;
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.6));
      ctx.fillStyle = f.color;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;

    /* 虛擬搖桿 */
    if (this.manual && this.pointerId !== null) {
      ctx.strokeStyle = 'rgba(120,180,255,.45)';
      ctx.lineWidth = 2;
      const jx = this.joyBase.x / scale;
      const jy = this.joyBase.y / scale;
      const vx = this.joyVec.x / scale;
      const vy = this.joyVec.y / scale;
      ctx.beginPath(); ctx.arc(jx, jy, 46 / scale, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(120,180,255,.5)';
      ctx.beginPath(); ctx.arc(jx + vx, jy + vy, 18 / scale, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }
}
