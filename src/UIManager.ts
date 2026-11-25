/* UIManager.ts — DOM 疊加層：HUD、五個分頁、無限補給站、版本徽章 */
import { BUNDLES, PASS_TIERS, SAT, SATELLITES, VERSION, WEAPONS } from './config';
import { fmt, gameState } from './GameState';

type Tab = 'weapons' | 'sats' | 'skills' | 'pass' | 'bundles';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'weapons', icon: '🔫', label: '武器' },
  { id: 'sats', icon: '🛰', label: '衛星' },
  { id: 'skills', icon: '🎲', label: '技能' },
  { id: 'pass', icon: '🎫', label: '通行證' },
  { id: 'bundles', icon: '🎁', label: '禮包' },
];

export class UIManager {
  private root: HTMLElement;
  private modalEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private tab: Tab = 'weapons';

  constructor(private onRefresh: () => void) {
    this.root = document.getElementById('ui-layer') as HTMLElement;
    this.build();
    gameState.on(() => this.renderHud());
    this.renderHud();
  }

  /* ---------------- 骨架 ---------------- */
  private build(): void {
    this.root.innerHTML = `
      <div class="hud">
        <div class="res">
          <span class="chip"><i>🪙</i><b id="hGold">0</b></span>
          <span class="chip"><i>💎</i><b id="hGems">0</b></span>
          <span class="chip"><i>✨</i><b id="hPrestige">0</b></span>
          <span class="chip"><i>🧩</i><b id="hCores">0</b></span>
        </div>
        <span class="sector" id="hSector">星區 1-1</span>
        <button class="btn gold supply-btn" id="btnSupply">⚡ 補給</button>
      </div>
      <nav id="tabs">
        ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.id === this.tab ? 'on' : ''}">${t.icon}<span>${t.label}</span></button>`).join('')}
      </nav>`;

    this.root.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      b.addEventListener('click', () => this.openTab(b.dataset.tab as Tab));
    });
    (this.root.querySelector('#btnSupply') as HTMLButtonElement).addEventListener('click', () => this.openSupply());

    const app = document.getElementById('app') as HTMLElement;
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal hidden';
    this.modalEl.innerHTML = `<div class="modal-card"><div class="modal-head"><h2 id="mTitle"></h2><button id="modalClose">✕</button></div><div class="modal-body" id="mBody"></div></div>`;
    app.appendChild(this.modalEl);
    (this.modalEl.querySelector('#modalClose') as HTMLButtonElement)
      .addEventListener('click', () => this.closeModal());

    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    app.appendChild(this.toastEl);

    const badge = document.createElement('button');
    badge.className = 'ver-badge';
    badge.id = 'verBadge';
    badge.textContent = 'v' + VERSION;
    badge.addEventListener('click', () => this.showVersion());
    app.appendChild(badge);
  }

  /* ---------------- HUD ---------------- */
  renderHud(): void {
    const s = gameState;
    const set = (id: string, v: string) => {
      const el = this.root.querySelector('#' + id);
      if (el) el.textContent = v;
    };
    set('hGold', fmt(s.gold));
    set('hGems', fmt(s.gems));
    set('hPrestige', fmt(s.prestige));
    set('hCores', fmt(s.cores));
    set('hSector', `星區 ${s.sector}-${s.planet}`);
  }

  /* ---------------- 彈窗 ---------------- */
  modal(title: string, html: string): void {
    (this.modalEl.querySelector('#mTitle') as HTMLElement).textContent = title;
    (this.modalEl.querySelector('#mBody') as HTMLElement).innerHTML = html;
    this.modalEl.classList.remove('hidden');
    this.bindBody();
  }

  closeModal(): void { this.modalEl.classList.add('hidden'); }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    setTimeout(() => this.toastEl.classList.remove('on'), 1400);
  }

  /* ---------------- 分頁 ---------------- */
  openTab(tab: Tab): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    if (tab === 'weapons') this.renderWeapons();
    else if (tab === 'sats') this.renderSats();
    else if (tab === 'skills') this.renderSkills();
    else if (tab === 'pass') this.renderPass();
    else this.renderBundles();
  }

  private renderWeapons(): void {
    const s = gameState;
    const equipped = s.equipped();
    const rows = WEAPONS.map((w) => {
      const lv = s.weaponLevel(w.id);
      const cost = s.weaponCost(w.id);
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${w.color}">${w.name} <span class="lv">Lv ${lv}${equipped.includes(w.id) ? ' · 出戰' : ''}</span></div>
          <div class="sub">${w.desc}</div>
        </div>
        <button class="btn gem" data-upw="${w.id}" ${s.gold < cost ? 'disabled' : ''}>+1<br><span class="sub">${fmt(cost)}</span></button>
        <button class="btn" data-upw10="${w.id}" ${s.gold < cost * 10 ? 'disabled' : ''}>+10</button>
      </div>`;
    }).join('');

    const gear = ['hull', 'reactor', 'engine'].map((id) => {
      const def = [{ id: 'hull', name: '船體', desc: '碰撞傷害與吸附範圍' }, { id: 'reactor', name: '反應爐核心', desc: '全武器攻擊力' }, { id: 'engine', name: '引擎', desc: '環繞速度與攻速' }].find((x) => x.id === id)!;
      const lv = s.gear[id] ?? 1;
      const cost = s.gearCost(id);
      return `<div class="row">
        <div class="grow"><div class="name">${def.name} <span class="lv">Lv ${lv}</span></div><div class="sub">${def.desc}</div></div>
        <button class="btn gem" data-upg="${id}" ${s.gold < cost ? 'disabled' : ''}>${fmt(cost)}</button>
      </div>`;
    }).join('');

    this.modal('武器庫', `
      <div class="stat-row">
        <span class="stat">ATK <b>${fmt(s.atk())}</b></span>
        <span class="stat">攻速 <b>×${s.attackSpeed().toFixed(2)}</b></span>
        <span class="stat">暴擊 <b>${(s.critChance() * 100).toFixed(0)}%</b></span>
        <span class="stat">轉生倍率 <b>×${s.prestigeMult.toFixed(2)}</b></span>
      </div>
      <div class="hint">同時出戰 ${equipped.length}/4 把（依等級自動挑），其餘提供升級加成。</div>
      ${rows}
      <h3 style="font-size:13px;margin:12px 0 4px">裝備</h3>
      ${gear}`);
  }

  private renderSats(): void {
    const s = gameState;
    const rows = SATELLITES.map((st) => {
      const lv = s.satLevel(st.id);
      const cost = s.satCost(st.id);
      const maxed = lv >= SAT.maxLevel;
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${st.color}">🛰 ${st.name} <span class="lv">${'★'.repeat(lv)}${'☆'.repeat(SAT.maxLevel - lv)}</span></div>
          <div class="sub">${st.desc}</div>
        </div>
        <button class="btn gem" data-ups="${st.id}" ${maxed || s.gems < cost ? 'disabled' : ''}>${maxed ? '已滿級' : fmt(cost) + ' 💎'}</button>
        <button class="btn" data-ups5="${st.id}" ${maxed ? 'disabled' : ''}>+5</button>
      </div>`;
    }).join('');
    this.modal('衛星', `<div class="hint">最多 6 顆同時環繞；每顆 5 星上限。</div>${rows}
      <button class="btn wide primary" id="btnSatAll">全 6 顆衛星解鎖並升至滿星</button>`);
  }

  private renderSkills(): void {
    const s = gameState;
    const list = s.skillList();
    const cells = list.length
      ? list.map((sk) => `<div class="skill" style="border-color:${sk.color}">
          <b style="color:${sk.color}">[${sk.rarityName}] ${sk.name} ×${sk.count}</b>
          <span class="sub">${sk.desc}</span></div>`).join('')
      : '<div class="hint">背包尚無技能，點上方按鈕抽取。</div>';
    this.modal('技能融合', `
      <div class="hint">3 個同名同稀有度 → 自動合成高一階（普通 → 稀有 → 史詩 → 傳奇 → 神話）。</div>
      <div class="skill-grid" style="margin:8px 0">${cells}</div>
      <button class="btn wide" id="btnRoll10">🎲 技能十連抽 · 220 💎</button>
      <button class="btn wide" id="btnRoll100">🔥 技能百連抽 · 2,000 💎</button>
      <button class="btn wide primary" id="btnFuse">✨ 一鍵全部融合</button>`);
  }

  private renderPass(): void {
    const s = gameState;
    const done = Object.keys(s.passClaimed).length;
    const rows = PASS_TIERS.map((t) => {
      const claimed = !!s.passClaimed[String(t.tier)];
      return `<div class="row">
        <div class="grow"><div class="sub" style="color:${claimed ? '#8fa9cf' : '#e8f1ff'}">
          第 ${String(t.tier).padStart(2, '0')} 階：${fmt(t.gems)} 寶石 + ${fmt(t.prestige)} 星塵</div></div>
        <span class="lv" style="color:${claimed ? '#5cffa8' : '#ffd23f'}">${claimed ? '✔ 已領取' : '待領取'}</span>
        ${claimed ? '' : `<button class="btn" data-pass="${t.tier}">領取</button>`}
      </div>`;
    }).join('');
    this.modal('星際通行證', `
      <div class="hint">豪華版 <b style="color:#5cffa8">已永久解鎖</b>：50 階全部可領（已領 ${done}/50）。</div>
      <button class="btn wide primary" id="btnPassAll">一鍵領取全部 50 階獎勵</button>
      <div style="margin-top:8px">${rows}</div>`);
  }

  private renderBundles(): void {
    const s = gameState;
    const rows = BUNDLES.map((b) => {
      const got = !!s.bundles[b.id];
      const bits = [`${fmt(b.gems)} 💎`, `${fmt(b.prestige)} ✨`];
      if (b.gold) bits.push(`${fmt(b.gold)} 🪙`);
      if (b.weaponLevels) bits.push(`全武器 +${b.weaponLevels} 級`);
      if (b.satLevels) bits.push('衛星全滿星');
      return `<div class="row">
        <div class="grow"><div class="name">${b.name}</div><div class="sub">${bits.join(' · ')}</div></div>
        <button class="btn ${got ? '' : 'primary'}" data-bundle="${b.id}" ${got ? 'disabled' : ''}>${got ? '✔ 已領取' : 'FREE 領取'}</button>
      </div>`;
    }).join('');
    this.modal('特惠禮包', `<div class="hint">沙盒設計：所有禮包都是 <b style="color:#5cffa8">FREE</b>，點即發放。</div>${rows}`);
  }

  /* ---------------- 補給站 ---------------- */
  openSupply(): void {
    this.modal('⚡ 指揮官無限補給站', `
      <div class="hint">無需付費或外部修改，點擊即可無限領取全資源。</div>
      <button class="btn wide primary" data-sup="gems">💎 領取 +1,000,000 寶石</button>
      <button class="btn wide primary" data-sup="prestige">🌌 領取 +1,000,000 轉生點（立即提升倍率）</button>
      <button class="btn wide" data-sup="weapons">🔫 全 10 種武器立即解鎖</button>
      <button class="btn wide" data-sup="satellites">🛰 全 6 顆衛星解鎖並升至滿星</button>
      <button class="btn wide gold" data-sup="all">👑 一鍵拉滿所有資源與等級（All-In-One）</button>`);
  }

  showVersion(): void {
    const s = gameState;
    this.modal('版本資訊', `
      <div class="row"><div class="grow"><div class="name">StarBreaker: Unlimited Drill</div>
        <div class="sub">版本 <b style="color:#9fc0ff">v${VERSION}</b> · 存檔 v1</div></div></div>
      <div class="stat-row">
        <span class="stat">武器 <b>${WEAPONS.length}</b></span>
        <span class="stat">衛星 <b>${SATELLITES.length}</b></span>
        <span class="stat">通行證 <b>${PASS_TIERS.length}</b></span>
        <span class="stat">星級上限 <b>${SAT.maxLevel}★</b></span>
      </div>
      <div class="hint">星區 ${s.sector}-${s.planet} ｜ 已擊破 ${fmt(s.stats.blocks)} ｜ 通關星球 ${s.stats.planets}</div>
      <div class="hint">線上版本檔：<a href="version.json" target="_blank" rel="noopener" style="color:#5cffa8">version.json</a></div>
      <div class="hint">要確認線上是不是最新版：重新整理後看右下角徽章，或開 version.json。</div>`);
  }

  /* ---------------- 事件綁定 ---------------- */
  private bindBody(): void {
    const body = this.modalEl.querySelector('#mBody') as HTMLElement;
    const s = gameState;

    body.querySelectorAll<HTMLElement>('[data-upw]').forEach((b) => b.addEventListener('click', () => {
      s.upgradeWeapon(b.dataset.upw!); this.renderWeapons();
    }));
    body.querySelectorAll<HTMLElement>('[data-upw10]').forEach((b) => b.addEventListener('click', () => {
      if (!s.upgradeWeaponBulk(b.dataset.upw10!, 10)) this.toast('金幣不足');
      this.renderWeapons();
    }));
    body.querySelectorAll<HTMLElement>('[data-upg]').forEach((b) => b.addEventListener('click', () => {
      s.upgradeGear(b.dataset.upg!); this.renderWeapons();
    }));
    body.querySelectorAll<HTMLElement>('[data-ups]').forEach((b) => b.addEventListener('click', () => {
      s.upgradeSatellite(b.dataset.ups!); this.renderSats();
    }));
    body.querySelectorAll<HTMLElement>('[data-ups5]').forEach((b) => b.addEventListener('click', () => {
      if (!s.upgradeSatelliteBulk(b.dataset.ups5!, 5)) this.toast('寶石不足或已滿級');
      this.renderSats();
    }));
    body.querySelectorAll<HTMLElement>('[data-pass]').forEach((b) => b.addEventListener('click', () => {
      s.passClaim(Number(b.dataset.pass)); this.renderPass();
    }));
    body.querySelectorAll<HTMLElement>('[data-bundle]').forEach((b) => b.addEventListener('click', () => {
      s.bundleClaim(b.dataset.bundle!); this.renderBundles();
    }));
    body.querySelectorAll<HTMLElement>('[data-sup]').forEach((b) => b.addEventListener('click', () => {
      s.supply(b.dataset.sup as 'gems' | 'prestige' | 'weapons' | 'satellites' | 'all');
      this.toast('已發放');
      this.onRefresh();
    }));

    const byId = (id: string) => body.querySelector('#' + id) as HTMLButtonElement | null;
    byId('btnRoll10')?.addEventListener('click', () => {
      if (!s.rollSkills(10)) this.toast('寶石不足');
      this.renderSkills();
    });
    byId('btnRoll100')?.addEventListener('click', () => {
      if (!s.rollSkills(100)) this.toast('寶石不足');
      this.renderSkills();
    });
    byId('btnFuse')?.addEventListener('click', () => {
      const n = s.fuseSkills();
      this.toast(n ? `融合 ${n} 次` : '沒有可融合的技能');
      this.renderSkills();
    });
    byId('btnPassAll')?.addEventListener('click', () => {
      s.passClaimAll(); this.renderPass();
    });
    byId('btnSatAll')?.addEventListener('click', () => {
      s.supply('satellites'); this.renderSats();
    });
  }
}
