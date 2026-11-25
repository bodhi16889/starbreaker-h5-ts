/* main.ts — 遊戲主迴圈、Canvas 2D 渲染、輸入與開機 */
import './style.css';
import { BALANCE, BLOCK, PLANET, VERSION } from './config';
import { fmt, gameState } from './GameState';
import { PlanetSystem, type Block } from './PlanetSystem';
import { Combat } from './ShipAndWeapons';
import { UIManager } from './UIManager';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: true })!;

let W = 390, H = 640, DPR = 1;
let shake = 0;
let last = performance.now();
let fps = 60;
let fpsAcc = 0, fpsFrames = 0;
let bgStars: { x: number; y: number; r: number; a: number }[] = [];

const state = gameState;

const planet = new PlanetSystem(state, {
  onDeath: () => { /* 掉落由 onDrop 處理 */ },
  onDrop: (x, y, kind, value) => combat.addDrop(x, y, kind, value),
  onFloater: (x, y, text, color) => combat.floater(x, y, text, color),
  onShake: (p) => { shake = Math.max(shake, p); },
  onOverdrive: () => { state.overdriveUntil = performance.now() + BALANCE.overdriveSec * 1000; },
  onCleared: () => nextPlanet(),
});

const combat = new Combat(state, planet);

const ui = new UIManager(() => {
  /* 補給站發放後刷新星球（武器/衛星變強要立刻反映） */
  if (!planet.aliveCount()) nextPlanet();
});

/* ---------------- 星球推進 ---------------- */
function nextPlanet(): void {
  state.clearPlanet();
  planet.build(state.sector, state.planet);
  combat.reset();
  ui.renderHud();
}

/* ---------------- 尺寸 ---------------- */
function resize(): void {
  const rect = canvas.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(rect.width));
  H = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  bgStars = Array.from({ length: 90 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.3 + 0.3, a: Math.random() * 0.5 + 0.2,
  }));
}

/* ---------------- 輸入 ---------------- */
function pos(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left - W / 2, y: e.clientY - r.top - H / 2 };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  const p = pos(e);
  combat.pointerDown(p.x, p.y, e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = pos(e);
  combat.pointerMove(p.x, p.y, e.pointerId);
});
canvas.addEventListener('pointerup', (e) => combat.pointerUp(e.pointerId));
canvas.addEventListener('pointercancel', (e) => combat.pointerUp(e.pointerId));
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') combat.pointerUp(e.pointerId); });

/* ---------------- 主迴圈 ---------------- */
function loop(now: number): void {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, Math.max(0.001, rawDt));
  last = now;

  fpsAcc += rawDt; fpsFrames++;
  if (fpsAcc >= 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

  combat.update(dt);
  planet.tickVisuals(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 40);

  draw();
  requestAnimationFrame(loop);
}

function draw(): void {
  ctx.clearRect(0, 0, W, H);

  /* 星空 */
  ctx.fillStyle = '#05070f';
  ctx.fillRect(0, 0, W, H);
  bgStars.forEach((st) => {
    ctx.globalAlpha = st.a;
    ctx.fillStyle = '#9fd0ff';
    ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  const cx = W / 2 + (Math.random() - 0.5) * shake;
  const cy = H * 0.47 + (Math.random() - 0.5) * shake;
  /* 星球 + 飛船軌道 + 最外圈衛星都要在同一個縮放下才進得了畫面 */
  const worldRadius = planet.radius + 74 + 100;
  const scale = Math.min(1, (Math.min(W, H) * 0.94) / (worldRadius * 2));

  /* 星球外環 */
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(90, 150, 230, .28)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, planet.radius * scale + 8, 0, Math.PI * 2); ctx.stroke();

  ctx.scale(scale, scale);
  drawBlocks();
  combat.render(ctx, 0, 0, scale);
  ctx.restore();

  /* 左上角資訊 */
  ctx.fillStyle = 'rgba(180, 210, 255, .5)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${fmt(state.gold)} coins · ${planet.aliveCount()} blocks · ${fps} fps`, 10, 16);

  if (state.overdriveUntil > performance.now()) {
    ctx.fillStyle = 'rgba(92, 255, 168, .9)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⚡ OVERDRIVE ×${BALANCE.overdriveMul}`, W / 2, H - 12);
  }
}

function drawBlocks(): void {
  const blocks = planet.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.alive) continue;
    const def = BLOCK[b.kind];
    const s = b.size;
    const frozen = b.frozenUntil > performance.now();

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.shadowColor = def.edge;
    ctx.shadowBlur = b.kind === 'core' ? 22 : 6;
    ctx.fillStyle = def.color;
    roundRect(-s / 2, -s / 2, s, s, Math.min(6, s * 0.22));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = b.flash > 0 ? '#ffffff' : def.edge;
    ctx.lineWidth = b.kind === 'core' ? 2.2 : 1.2;
    roundRect(-s / 2, -s / 2, s, s, Math.min(6, s * 0.22));
    ctx.stroke();

    if (frozen) {
      ctx.fillStyle = 'rgba(155, 231, 255, .35)';
      roundRect(-s / 2, -s / 2, s, s, Math.min(6, s * 0.22));
      ctx.fill();
    }

    /* 血量條（受傷才顯示） */
    if (b.hp < b.maxHp) {
      const w = s * 0.8;
      const p = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(-w / 2, s / 2 - 3.5, w, 2.5);
      ctx.fillStyle = p > 0.5 ? '#5cffa8' : p > 0.2 ? '#ffd23f' : '#ff6b6b';
      ctx.fillRect(-w / 2, s / 2 - 3.5, w * p, 2.5);
    }
    ctx.restore();
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ---------------- 開機 ---------------- */
function boot(): void {
  resize();
  planet.build(state.sector, state.planet);
  ui.renderHud();
  window.addEventListener('resize', resize);
  new ResizeObserver(() => resize()).observe(canvas);
  requestAnimationFrame(loop);
}

/* 測試與除錯用 */
declare global {
  interface Window {
    __game: {
      ready: boolean;
      version: string;
      state: typeof state;
      planet: PlanetSystem;
      combat: Combat;
      ui: UIManager;
      nextPlanet: () => void;
      fps: () => number;
      blocks: () => Block[];
      planetMeta: typeof PLANET;
    };
  }
}

window.__game = {
  ready: false,
  version: VERSION,
  state,
  planet,
  combat,
  ui,
  nextPlanet,
  fps: () => fps,
  blocks: () => planet.blocks,
  planetMeta: PLANET,
};

boot();
window.__game.ready = true;
