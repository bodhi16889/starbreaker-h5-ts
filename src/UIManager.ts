/* UIManager.ts — 對齊 Auto Drill: Galaxy 的 HUD：
   頂部 CR 計數 + 倍率 + 星球進度、左側圖示列、右側瞄準鈕、底部裝備列與武器升級卡 */
import { BUNDLES, PASS_TIERS, SAT, SATELLITES, VERSION, WEAPONS } from './config';
import { fmt, gameState } from './GameState';

type Tab = 'settings' | 'sats' | 'skills' | 'pass' | 'bundles' | 'save' | 'weapons';

const RAIL: { id: Tab; icon: string; title: string }[] = [
  { id: 'settings', icon: '⚙', title: '設定' },
  { id: 'sats', icon: '🛰', title: '衛星' },
  { id: 'skills', icon: '🎲', title: '技能' },
  { id: 'pass', icon: '🎫', title: '通行證' },
  { id: 'bundles', icon: '🎁', title: '禮包' },
  { id: 'save', icon: '💾', title: '存檔' },
];

const WEAPON_ICON: Record<string, string> = {
  lance: '🗡', gatling: '🔫', mortar: '💣', chain: '⚡', saw: '🪚',
  laser: '🔆', missile: '🚀', gravity: '🕳', cryo: '❄', buster: '☄',
};

export class UIManager {
  private root: HTMLElement;
  private modalEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private bottomEl!: HTMLElement;
  private thumb!: HTMLCanvasElement;

  constructor(private onRefresh: () => void, private onAim: () => string) {
    this.root = document.getElementById('ui-layer') as HTMLElement;
    this.build();
    gameState.on(() => this.renderHud());
    this.renderHud();
  }

  /* ---------------- 骨架 ---------------- */
  private build(): void {
    const app = document.getElementById('app') as HTMLElement;
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    app.appendChild(overlay);

    overlay.innerHTML = `
      <div class="topbar">
        <span class="coin" title="寶石"><i>💎</i><b id="hGems">0</b></span>
        <div class="credits">
          <div class="cr"><b id="hCredits">0</b><span>CR</span></div>
          <div class="mult" id="hMult">×1.00</div>
        </div>
        <div class="planetbox">
          <canvas id="planetThumb" width="46" height="46"></canvas>
          <div class="pinfo">
            <span id="hGalaxy">Galaxy 1</span>
            <span id="hPlanetNo">Planet 1</span>
            <b id="hBlocks">0/0</b>
          </div>
        </div>
        <button class="ver-badge" id="verBadge" type="button">v${VERSION}</button>
      </div>

      <div class="rail">
        ${RAIL.map((r) => `<button data-tab="${r.id}" title="${r.title}">${r.icon}<span class="badge" data-badge="${r.id}"></span></button>`).join('')}
      </div>

      <button class="aim" id="btnAim" title="切換鎖定目標">🎯<span id="aimLabel">最近</span></button>`;

    this.root.innerHTML = `<div class="bottom" id="bottom"></div>`;
    this.bottomEl = this.root.querySelector('#bottom') as HTMLElement;
    this.thumb = overlay.querySelector('#planetThumb') as HTMLCanvasElement;

    overlay.querySelectorAll<HTMLButtonElement>('.rail button').forEach((b) => {
      b.addEventListener('click', () => this.openTab(b.dataset.tab as Tab));
    });
    (overlay.querySelector('#btnAim') as HTMLButtonElement).addEventListener('click', () => {
      const label = this.onAim();
      (overlay.querySelector('#aimLabel') as HTMLElement).textContent = label;
      this.toast('鎖定模式：' + label);
    });
    (overlay.querySelector('#verBadge') as HTMLButtonElement).addEventListener('click', () => this.showVersion());
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal hidden';
    this.modalEl.innerHTML = `<div class="modal-card"><div class="modal-head"><h2 id="mTitle"></h2><button id="modalClose">✕</button></div><div class="modal-body" id="mBody"></div></div>`;
    app.appendChild(this.modalEl);
    (this.modalEl.querySelector('#modalClose') as HTMLButtonElement).addEventListener('click', () => this.closeModal());

    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    app.appendChild(this.toastEl);
  }

  /* ---------------- HUD + 底部面板 ---------------- */
  renderHud(): void {
    const s = gameState;
    const set = (id: string, v: string) => {
      const el = document.querySelector('#' + id);
      if (el) el.textContent = v;
    };
    set('hCredits', fmt(s.gold));
    set('hMult', '×' + s.prestigeMult.toFixed(2));
    set('hGems', fmt(s.gems));
    set('hGalaxy', `Galaxy ${s.sector}`);
    set('hPlanetNo', `Planet ${s.planet}`);

    const alive = this.aliveBlocks;
    const total = this.totalBlocks;
    set('hBlocks', `${alive}/${fmt(total)}`);

    /* 左側圖示上的小徽章：衛星已解鎖數、可領通行證數 */
    const satN = SATELLITES.filter((x) => s.satLevel(x.id) > 0).length;
    const passN = PASS_TIERS.filter((t) => !s.passClaimed[String(t.tier)]).length;
    const badge = (k: string, v: string) => {
      const el = document.querySelector(`[data-badge="${k}"]`) as HTMLElement | null;
      if (el) { el.textContent = v; el.style.display = v ? 'block' : 'none'; }
    };
    badge('sats', satN ? String(satN) : '');
    badge('pass', passN ? String(passN) : '');
    badge('skills', Object.values(s.skills).reduce((a, b) => a + b, 0) > 0 ? '' : '');

    this.renderBottom();
    this.drawThumb();
  }

  aliveBlocks = 0;
  totalBlocks = 0;

  private renderBottom(): void {
    const s = gameState;
    const eq = s.equipped();
    const topSkills = s.skillList().slice(0, 3);

    const slots = [
      `<button class="slot boost" data-open="settings"><span class="ic">⚡</span><span class="lvl">${s.overdriveUntil > performance.now() ? 'ON' : '×1'}</span></button>`,
      ...eq.map((id) => {
        return `<button class="slot weapon" data-open="weapons"><span class="ic">${WEAPON_ICON[id] ?? '🔫'}</span><span class="lvl">${s.weaponLevel(id)}</span></button>`;
      }),
      ...Array.from({ length: Math.max(0, 3 - eq.length) }, () => `<button class="slot empty" data-open="weapons"><span class="ic">＋</span></button>`),
      ...topSkills.map((sk) => `<button class="slot skill" data-open="skills"><span class="ic">✦</span><span class="lvl">${sk.count}</span></button>`),
      ...Array.from({ length: Math.max(0, 3 - topSkills.length) }, () => `<button class="slot empty" data-open="skills"><span class="ic">＋</span></button>`),
    ].join('');

    const cards = eq.slice(0, 3).map((id) => {
      const w = WEAPONS.find((x) => x.id === id)!;
      const lv = s.weaponLevel(id);
      const cost = s.weaponCost(id);
      const dps = this.dps(id);
      return `<div class="wcard">
        <div class="wname">${w.name}<span>Lv. ${lv}</span></div>
        <div class="wdps">DPS ${fmt(dps)}/s</div>
        <button class="wbuy" data-upw="${id}" ${s.gold < cost ? 'disabled' : ''}>${fmt(cost)}<span>CR</span></button>
      </div>`;
    }).join('');

    const locked = WEAPONS.filter((w) => s.weaponLevel(w.id) === 0)
      .map((w) => ({ w, cost: 3000 * Math.pow(6, WEAPONS.indexOf(w)) }))
      .sort((a, b) => a.cost - b.cost)[0];

    this.bottomEl.innerHTML = `
      <div class="slots">${slots}</div>
      <div class="wcards">${cards}</div>
      ${locked ? `<button class="btn unlock" id="btnUnlock" ${s.gold < locked.cost ? 'disabled' : ''}>
        UNLOCK WEAPON ${fmt(locked.cost)} CR · ${locked.w.name}</button>` : ''}`;

    this.bottomEl.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => {
      b.addEventListener('click', () => this.openTab(b.dataset.open as Tab));
    });
    this.bottomEl.querySelectorAll<HTMLElement>('[data-upw]').forEach((b) => {
      b.addEventListener('click', () => {
        if (!s.upgradeWeapon(b.dataset.upw!)) this.toast('CR 不足');
        this.renderHud();
      });
    });
    const unlock = this.bottomEl.querySelector('#btnUnlock') as HTMLButtonElement | null;
    unlock?.addEventListener('click', () => {
      if (!locked) return;
      if (s.gold < locked.cost) return this.toast('CR 不足');
      s.gold -= locked.cost;
      s.weapons[locked.w.id] = 1;
      s.save(); s.emit();
      this.renderHud();
      this.toast(`解鎖 ${locked.w.name}`);
    });
  }

  private dps(id: string): number {
    const w = WEAPONS.find((x) => x.id === id)!;
    const lv = gameState.weaponLevel(id);
    const per = gameState.atk() * w.dmg * (1 + lv * 0.12);
    const critFactor = 1 + gameState.critChance() * (gameState.critMult() - 1);
    return (per / w.interval) * gameState.attackSpeed() * critFactor;
  }

  /** 右上角星球縮圖（程序化畫，不用外部素材） */
  private drawThumb(): void {
    const c = this.thumb;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#0a1220';
    g.beginPath(); g.arc(23, 23, 21, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a4a6e'; g.lineWidth = 1; g.stroke();
    const total = Math.max(1, this.totalBlocks);
    const alive = Math.max(0, this.aliveBlocks);
    const ratio = alive / total;
    g.strokeStyle = ratio > 0.5 ? '#5fd6ff' : ratio > 0.2 ? '#ffd23f' : '#ff6b6b';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(23, 23, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    g.stroke();
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
    if (tab === 'weapons') this.renderWeapons();
    else if (tab === 'sats') this.renderSats();
    else if (tab === 'skills') this.renderSkills();
    else if (tab === 'pass') this.renderPass();
    else if (tab === 'bundles') this.renderBundles();
    else if (tab === 'save') this.renderSave();
    else this.renderSettings();
  }

  private renderSettings(): void {
    const s = gameState;
    this.modal('設定', `
      <div class="row"><div class="grow"><div class="name">StarBreaker: Unlimited Drill</div>
        <div class="sub">版本 v${VERSION} · 存檔 v1 · 星球進度 ${this.aliveBlocks}/${fmt(this.totalBlocks)}</div></div></div>
      <div class="stat-row">
        <span class="stat">CR <b>${fmt(s.gold)}</b></span>
        <span class="stat">倍率 <b>×${s.prestigeMult.toFixed(2)}</b></span>
        <span class="stat">星區 <b>${s.sector}-${s.planet}</b></span>
      </div>
      <button class="btn wide gold" id="btnSupply">⚡ 無限補給站（全資源）</button>
      <button class="btn wide" data-open="save">💾 存檔備份／跨裝置</button>
      <button class="btn wide" data-open="sats">🛰 衛星</button>
      <button class="btn wide" data-open="pass">🎫 星際通行證</button>
      <button class="btn wide" data-open="bundles">🎁 特惠禮包</button>
      <button class="btn wide danger" id="btnReset">重置存檔</button>
      <div class="hint">重置會清掉本機進度；要保留就先把存檔碼複製出去。</div>`);
    const body = this.modalEl.querySelector('#mBody') as HTMLElement;
    body.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => {
      b.addEventListener('click', () => this.openTab(b.dataset.open as Tab));
    });
    (body.querySelector('#btnSupply') as HTMLButtonElement | null)?.addEventListener('click', () => this.renderSupply());
    (body.querySelector('#btnReset') as HTMLButtonElement | null)?.addEventListener('click', () => {
      if ((body.querySelector('#btnReset') as HTMLElement).dataset.armed === '1') {
        gameState.reset();
        this.onRefresh();
        this.renderHud();
        this.closeModal();
        this.toast('存檔已重置');
      } else {
        (body.querySelector('#btnReset') as HTMLElement).dataset.armed = '1';
        (body.querySelector('#btnReset') as HTMLElement).textContent = '再按一次確認重置';
        setTimeout(() => {
          const b = body.querySelector('#btnReset') as HTMLElement | null;
          if (b) { b.dataset.armed = ''; b.textContent = '重置存檔'; }
        }, 4000);
      }
    });
  }

  private renderWeapons(): void {
    const s = gameState;
    const eq = s.equipped();
    const rows = WEAPONS.map((w) => {
      const lv = s.weaponLevel(w.id);
      const cost = s.weaponCost(w.id);
      const locked = lv === 0;
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${w.color}">${WEAPON_ICON[w.id]} ${w.name} <span class="lv">${locked ? '未解鎖' : 'Lv ' + lv}${eq.includes(w.id) ? ' · 出戰' : ''}</span></div>
          <div class="sub">${w.desc}${locked ? '' : ' · DPS ' + fmt(this.dps(w.id)) + '/s'}</div>
        </div>
        ${locked ? '' : `<button class="btn gem" data-upw="${w.id}" ${s.gold < cost ? 'disabled' : ''}>+1<br><span class="sub">${fmt(cost)}</span></button>
        <button class="btn" data-upw10="${w.id}" ${s.gold < cost * 8 ? 'disabled' : ''}>+10</button>`}
      </div>`;
    }).join('');
    this.modal('武器庫', `
      <div class="stat-row">
        <span class="stat">ATK <b>${fmt(s.atk())}</b></span>
        <span class="stat">攻速 <b>×${s.attackSpeed().toFixed(2)}</b></span>
        <span class="stat">暴擊 <b>${(s.critChance() * 100).toFixed(0)}%</b></span>
      </div>
      <div class="hint">同時出戰 4 把（依等級自動挑選），其餘只提供解鎖加成。</div>
      ${rows}`);
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
    this.modal('衛星', `<div class="hint">最多 6 顆環繞；每顆 5 星上限。</div>${rows}
      <button class="btn wide primary" id="btnSatAll">全 6 顆衛星解鎖並升至滿星</button>`);
  }

  private renderSkills(): void {
    const s = gameState;
    const list = s.skillList();
    const cells = list.length
      ? list.map((sk) => `<div class="skill" style="border-color:${sk.color}">
          <b style="color:${sk.color}">[${sk.rarityName}] ${sk.name} ×${sk.count}</b>
          <span class="sub">${sk.desc}</span></div>`).join('')
      : '<div class="hint">背包尚無技能，點下方抽卡。</div>';
    this.modal('技能融合', `
      <div class="hint">3 個同名同稀有度 → 自動合成高一階（普通 → 稀有 → 史詩 → 傳奇 → 神話）。</div>
      <div class="skill-grid" style="margin:8px 0">${cells}</div>
      <button class="btn wide" id="btnRoll10">🎲 十連抽 · 220 💎</button>
      <button class="btn wide" id="btnRoll100">🔥 百連抽 · 2,000 💎</button>
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
        <span class="lv" style="color:${claimed ? '#5cffa8' : '#ffd23f'}">${claimed ? '✔' : '待領'}</span>
        ${claimed ? '' : `<button class="btn" data-pass="${t.tier}">領取</button>`}
      </div>`;
    }).join('');
    this.modal('星際通行證', `
      <div class="hint">豪華版 <b style="color:#5cffa8">已永久解鎖</b>（已領 ${done}/50）。</div>
      <button class="btn wide primary" id="btnPassAll">一鍵領取全部 50 階</button>
      <div style="margin-top:8px">${rows}</div>`);
  }

  private renderBundles(): void {
    const s = gameState;
    const rows = BUNDLES.map((b) => {
      const got = !!s.bundles[b.id];
      const bits = [`${fmt(b.gems)} 💎`, `${fmt(b.prestige)} ✨`];
      if (b.gold) bits.push(`${fmt(b.gold)} CR`);
      if (b.weaponLevels) bits.push(`全武器 +${b.weaponLevels}`);
      if (b.satLevels) bits.push('衛星滿星');
      return `<div class="row">
        <div class="grow"><div class="name">${b.name}</div><div class="sub">${bits.join(' · ')}</div></div>
        <button class="btn ${got ? '' : 'primary'}" data-bundle="${b.id}" ${got ? 'disabled' : ''}>${got ? '✔ 已領' : 'FREE'}</button>
      </div>`;
    }).join('');
    this.modal('特惠禮包', `<div class="hint">全部 <b style="color:#5cffa8">FREE</b>，點即發放。</div>${rows}`);
  }

  private renderSupply(): void {
    this.modal('⚡ 指揮官無限補給站', `
      <div class="hint">無需付費或外部修改，點擊即可無限領取全資源。</div>
      <button class="btn wide primary" data-sup="gems">💎 領取 +1,000,000 寶石</button>
      <button class="btn wide primary" data-sup="prestige">🌌 領取 +1,000,000 轉生點（立即提升倍率）</button>
      <button class="btn wide" data-sup="weapons">🔫 全 10 種武器立即解鎖</button>
      <button class="btn wide" data-sup="satellites">🛰 全 6 顆衛星解鎖並升至滿星</button>
      <button class="btn wide gold" data-sup="all">👑 一鍵拉滿所有資源與等級（All-In-One）</button>`);
  }

  /* ---------------- 存檔 ---------------- */
  private renderSave(): void {
    const s = gameState;
    const code = s.exportCode();
    const when = s.lastSavedAt ? new Date(s.lastSavedAt).toLocaleString() : '—';
    this.modal('存檔備份', `
      <div class="stat-row">
        <span class="stat">CR <b>${fmt(s.gold)}</b></span>
        <span class="stat">星區 <b>${s.sector}-${s.planet}</b></span>
        <span class="stat">擊破 <b>${fmt(s.stats.blocks)}</b></span>
      </div>
      <div class="hint">最近寫入：${when}</div>
      <textarea id="saveCode" readonly rows="4" style="width:100%;font-size:11px;background:#0a1220;color:#9fc0ff;border:1px solid #24395f;border-radius:8px;padding:8px;font-family:ui-monospace,monospace">${code}</textarea>
      <button class="btn wide primary" id="btnCopyCode">複製存檔碼</button>
      <button class="btn wide" id="btnCopyLink">複製分享連結</button>
      <button class="btn wide" id="btnDownloadSave">下載存檔檔（.json）</button>
      <h3 style="font-size:13px;margin:14px 0 4px">匯入</h3>
      <textarea id="importCode" rows="3" placeholder="SB1.xxxx.yyyy" style="width:100%;font-size:11px;background:#0a1220;color:#e8f1ff;border:1px solid #24395f;border-radius:8px;padding:8px;font-family:ui-monospace,monospace"></textarea>
      <button class="btn wide gem" id="btnImportCode">匯入存檔碼</button>
      <label class="btn wide" style="display:flex;align-items:center;justify-content:center;cursor:pointer">
        匯入存檔檔（.json）<input id="importFile" type="file" accept=".json,application/json" style="display:none" />
      </label>
      <div id="importMsg" class="hint"></div>`);
  }

  private copyText(text: string, label: string): void {
    const done = () => this.toast(label + ' 已複製');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else this.fallbackCopy(text, done);
  }

  private fallbackCopy(text: string, done: () => void): void {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { this.toast('複製失敗，請長按選取'); }
    ta.remove();
  }

  private afterImport(res: { ok: boolean; msg: string }): void {
    const el = this.modalEl.querySelector('#importMsg') as HTMLElement | null;
    if (el) {
      el.textContent = (res.ok ? '✔ ' : '✕ ') + res.msg;
      el.style.color = res.ok ? '#5cffa8' : '#ff8a8a';
    }
    if (res.ok) {
      this.onRefresh();
      this.renderHud();
      this.toast(res.msg);
    } else this.toast(res.msg);
  }

  confirmImport(code: string): void {
    const prev = gameState.previewCode(code);
    if (!prev.ok || !prev.info) { this.toast('連結裡的存檔碼無效：' + prev.msg); return; }
    const i = prev.info;
    this.modal('偵測到分享的存檔', `
      <div class="hint">這個網址帶有另一台裝置的存檔，載入會覆蓋本機進度。</div>
      <div class="stat-row">
        <span class="stat">星區 <b>${i.sector}-${i.planet}</b></span>
        <span class="stat">擊破 <b>${fmt(i.blocks)}</b></span>
        <span class="stat">CR <b>${fmt(i.gold)}</b></span>
      </div>
      <button class="btn wide primary" data-import-now="1">載入這個存檔</button>
      <button class="btn wide" data-import-cancel="1">先不要（保留本機進度）</button>`);
    (this.modalEl.querySelector('[data-import-now]') as HTMLElement | null)?.addEventListener('click', () => {
      this.afterImport(gameState.importCode(code));
    });
    (this.modalEl.querySelector('[data-import-cancel]') as HTMLElement | null)?.addEventListener('click', () => {
      history.replaceState(null, '', location.pathname + location.search);
      this.closeModal();
    });
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
      <div class="hint">星區 ${s.sector}-${s.planet} ｜ 擊破 ${fmt(s.stats.blocks)} ｜ 通關星球 ${s.stats.planets}</div>
      <div class="hint">線上版本檔：<a href="version.json" target="_blank" rel="noopener" style="color:#5cffa8">version.json</a></div>
      <div class="hint">換裝置：左側 💾 存檔 → 複製存檔碼或分享連結。</div>`);
  }

  /* ---------------- 事件綁定 ---------------- */
  private bindBody(): void {
    const body = this.modalEl.querySelector('#mBody') as HTMLElement;
    const s = gameState;

    body.querySelectorAll<HTMLElement>('[data-upw]').forEach((b) => b.addEventListener('click', () => {
      s.upgradeWeapon(b.dataset.upw!); this.renderWeapons(); this.renderHud();
    }));
    body.querySelectorAll<HTMLElement>('[data-upw10]').forEach((b) => b.addEventListener('click', () => {
      if (!s.upgradeWeaponBulk(b.dataset.upw10!, 10)) this.toast('CR 不足');
      this.renderWeapons(); this.renderHud();
    }));
    body.querySelectorAll<HTMLElement>('[data-ups]').forEach((b) => b.addEventListener('click', () => {
      s.upgradeSatellite(b.dataset.ups!); this.renderSats(); this.renderHud();
    }));
    body.querySelectorAll<HTMLElement>('[data-ups5]').forEach((b) => b.addEventListener('click', () => {
      if (!s.upgradeSatelliteBulk(b.dataset.ups5!, 5)) this.toast('寶石不足或已滿級');
      this.renderSats(); this.renderHud();
    }));
    body.querySelectorAll<HTMLElement>('[data-pass]').forEach((b) => b.addEventListener('click', () => {
      s.passClaim(Number(b.dataset.pass)); this.renderPass(); this.renderHud();
    }));
    body.querySelectorAll<HTMLElement>('[data-bundle]').forEach((b) => b.addEventListener('click', () => {
      s.bundleClaim(b.dataset.bundle!); this.renderBundles(); this.renderHud();
    }));
    body.querySelectorAll<HTMLElement>('[data-sup]').forEach((b) => b.addEventListener('click', () => {
      s.supply(b.dataset.sup as 'gems' | 'prestige' | 'weapons' | 'satellites' | 'all');
      this.toast('已發放');
      this.onRefresh();
      this.renderHud();
    }));

    const byId = (id: string) => body.querySelector('#' + id) as HTMLButtonElement | null;
    byId('btnRoll10')?.addEventListener('click', () => {
      if (!s.rollSkills(10)) this.toast('寶石不足');
      this.renderSkills(); this.renderHud();
    });
    byId('btnRoll100')?.addEventListener('click', () => {
      if (!s.rollSkills(100)) this.toast('寶石不足');
      this.renderSkills(); this.renderHud();
    });
    byId('btnFuse')?.addEventListener('click', () => {
      const n = s.fuseSkills();
      this.toast(n ? `融合 ${n} 次` : '沒有可融合的技能');
      this.renderSkills(); this.renderHud();
    });
    byId('btnPassAll')?.addEventListener('click', () => {
      s.passClaimAll(); this.renderPass(); this.renderHud();
    });
    byId('btnSatAll')?.addEventListener('click', () => {
      s.supply('satellites'); this.renderSats(); this.renderHud();
    });
    byId('btnCopyCode')?.addEventListener('click', () => this.copyText(s.exportCode(), '存檔碼'));
    byId('btnCopyLink')?.addEventListener('click', () => this.copyText(s.shareUrl(), '分享連結'));
    byId('btnDownloadSave')?.addEventListener('click', () => { s.downloadSave(); this.toast('已下載存檔檔'); });
    byId('btnImportCode')?.addEventListener('click', () => {
      const ta = body.querySelector('#importCode') as HTMLTextAreaElement | null;
      this.afterImport(s.importCode(ta?.value ?? ''));
    });
    const fileInput = body.querySelector('#importFile') as HTMLInputElement | null;
    fileInput?.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      this.afterImport(s.importFileText(await f.text()));
      fileInput.value = '';
    });
  }
}
