/* ads.ts — GamePix SDK v3 門面（沒有 SDK 時全部 no-op，遊戲照常跑）
 *
 * 合規要點：
 * - SDK 由 index.html 的 <head> 靜態載入，且 window.GamePixConfig = { lifecycle: 'manual' } 在它前面
 * - lifecycle：loading(pct) 只能遞增 → loaded() → gameStart()
 * - pause / resume 必須註冊且冪等（SDK 會自動呼叫）
 * - 廣告只在關卡之間呼叫；且只在真 Player（iframe 或 gamepix.com）才允許
 */

type Lifecycle = {
  loading?: (pct: number) => void;
  loaded?: () => Promise<void>;
  gameStart?: () => void;
};

type GPMaybe = {
  lifecycle?: Lifecycle;
  events?: { on?: (name: string, cb: () => void) => void };
  ads?: {
    interstitial?: () => Promise<{ success?: boolean }>;
    reward?: () => Promise<{ success?: boolean }>;
  };
};

const gp = (): GPMaybe | undefined => (window as unknown as { GamePix?: GPMaybe }).GamePix;

/** 只有真的在 GamePix Player（iframe／自家網域）或本機加了 ?gpx_ads=1 才允許廣告 */
export function adsAllowed(): boolean {
  try {
    if (window.self !== window.top) return true;
    if (/(^|\.)gamepix\.com$/i.test(location.hostname)) return true;
    return /[?&]gpx_ads=1\b/.test(location.search);
  } catch {
    return false; // 跨網域取 window.top 會丟錯 → 當成不在 Player
  }
}

/** 冷卻：同一局不要連兩顆星球都彈廣告 */
const AD_COOLDOWN_MS = 120_000;

let lastAdAt = 0;
let loadingDone = false;
let lastPct = 0;
let started = false;

export const ADS = {
  log: [] as string[],

  get hasSdk(): boolean {
    return !!gp();
  },

  /** 對外也提供（測試與除錯用） */
  adsAllowed(): boolean {
    return adsAllowed();
  },

  /** 載入進度（只送遞增值，SDK 會丟棄倒退） */
  loading(pct: number): void {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    if (loadingDone || v <= lastPct) return;
    lastPct = v;
    try {
      gp()?.lifecycle?.loading?.(v);
      ADS.log.push(`loading:${v}`);
    } catch {
      /* SDK 壞掉不影響遊戲 */
    }
  },

  /** 收掉載入畫面 */
  async loaded(): Promise<void> {
    if (loadingDone) return;
    loadingDone = true;
    try {
      ADS.loading(100);
      await gp()?.lifecycle?.loaded?.();
      ADS.log.push('loaded');
    } catch {
      ADS.log.push('loaded:error');
    }
    hideLoading();
  },

  /** 真正開始遊玩（只送一次） */
  gameStart(): void {
    if (started) return;
    started = true;
    try {
      gp()?.lifecycle?.gameStart?.();
      ADS.log.push('gameStart');
    } catch {
      /* noop */
    }
  },

  /** 註冊 pause / resume；handler 必須冪等 */
  bind(onPause: () => void, onResume: () => void): void {
    let pausedBySdk = false;
    try {
      gp()?.events?.on?.('pause', () => {
        if (pausedBySdk) return;
        pausedBySdk = true;
        ADS.log.push('pause');
        onPause();
      });
      gp()?.events?.on?.('resume', () => {
        if (!pausedBySdk) return;
        pausedBySdk = false;
        ADS.log.push('resume');
        onResume();
      });
      if (gp()?.events?.on) ADS.log.push('events bound');
    } catch {
      ADS.log.push('events:error');
    }
  },

  /** 插頁廣告：只在星球之間；回傳是否真的播了 */
  async interstitial(): Promise<boolean> {
    const now = Date.now();
    if (!adsAllowed() || now - lastAdAt < AD_COOLDOWN_MS) return false;
    const sdk = gp()?.ads?.interstitial;
    if (!sdk) return false;
    lastAdAt = now;
    try {
      const r = await sdk();
      ADS.log.push(`ad:${r?.success ? 'ok' : 'fail'}`);
      return !!r?.success;
    } catch {
      ADS.log.push('ad:error');
      return false;
    }
  },
};

/** 載入畫面：index.html 內建的 #loading overlay */
export function hideLoading(): void {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.add('hide');
  window.setTimeout(() => el.remove(), 400);
}
