/* main.ts — 遊戲主迴圈、Canvas 2D 渲染、輸入與開機 */
import './style.css';
import { BALANCE, BLOCK, PLANET, VERSION } from './config';
import { gameState } from './GameState';
import { PlanetSystem, type Block } from './PlanetSystem';
import { Combat } from './ShipAndWeapons';
import { UIManager } from './UIManager';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: true })!;

let W = 390, H = 640, DPR = 1;
let shake = 0;
let last = performance.now();
let fps = 60;
let paused = false;   // 測試用：暫停模擬但仍持續繪製
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

const AIM_MODES: { key: 'nearest' | 'weakest' | 'richest'; label: string }[] = [
  { key: 'nearest', label: '最近' },
  { key: 'weakest', label: '補刀' },
  { key: 'richest', label: '肥羊' },
];
let aimIdx = 0;

const ui = new UIManager(
  () => rebuildWorld(),
  () => {
    aimIdx = (aimIdx + 1) % AIM_MODES.length;
    combat.setTargetMode(AIM_MODES[aimIdx].key);
    return AIM_MODES[aimIdx].label;
  },
);

/** 補給站／匯入存檔後：用目前星區重建世界 */
function rebuildWorld(): void {
  planet.build(state.sector, state.planet);
  combat.reset();
  ui.renderHud();
}

/* ---------------- 星球推進 ---------------- */
function nextPlanet(): void {
  state.clearPlanet();
  rebuildWorld();
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

  if (!paused) {
    combat.update(dt);
    planet.tickVisuals(dt);
  }
  ui.aliveBlocks = planet.aliveCount();
  ui.totalBlocks = planet.blocks.length;
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
  const cy = H * 0.42 + (Math.random() - 0.5) * shake;
  /* 對照 Auto Drill: Galaxy：星球要撐滿畫面寬度，衛星貼在最外圈 */
  const worldRadius = planet.radius + 74 + 52;
  const scale = Math.min(1.15, (Math.min(W * 0.98, H * 0.92)) / (worldRadius * 2));

  /* 星球外環 */
  ctx.save();
  ctx.translate(cx, cy);
  /* 星球邊界 */
  ctx.strokeStyle = 'rgba(90, 150, 230, .28)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, planet.radius * scale + 6, 0, Math.PI * 2); ctx.stroke();
  /* 飛船巡航軌道（虛線），畫在世界縮放前才不會跟著縮 */
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(120, 170, 255, .18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, (planet.radius + 74) * scale, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  ctx.scale(scale, scale);
  drawBlocks();
  combat.render(ctx, 0, 0, scale);
  ctx.restore();

  /* 左上角資訊 */
  ctx.fillStyle = 'rgba(140, 170, 210, .4)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${fps} fps`, 10, H - 10);

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
      setPaused: (v: boolean) => void;
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
  setPaused: (v) => { paused = v; },
  blocks: () => planet.blocks,
  planetMeta: PLANET,
};

boot();
window.__game.ready = true;

/* 分享連結：#save=<存檔碼> → 問使用者要不要載入（不自動覆蓋本機存檔） */
if (location.hash.startsWith('#save=')) {
  const code = decodeURIComponent(location.hash.slice(6));
  setTimeout(() => ui.confirmImport(code), 400);
}
