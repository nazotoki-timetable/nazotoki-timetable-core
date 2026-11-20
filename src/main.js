import { StaticJsonAdapter } from './adapters/StaticJsonAdapter.js';
import { GasAdapter } from './adapters/GasAdapter.js';
import { MockAdapter } from './adapters/MockAdapter.js';
import { Parser } from './core/Parser.js';
import { ConflictDetector } from './core/ConflictDetector.js';
import { Storage } from './core/Storage.js';
import { Analytics } from './core/Analytics.js';
import { TimetableView } from './ui/TimetableView.js';
import { SelectionBar } from './ui/SelectionBar.js';
import { SpecPopup } from './ui/SpecPopup.js';
import { FilterModal } from './ui/FilterModal.js';
import { TicketView } from './ui/TicketView.js';
import { MyScheduleDialog } from './ui/MyScheduleDialog.js';
import { RouteView } from './ui/RouteView.js';
import { VenueRouter } from './core/VenueRouter.js';
import { closeTopLayer, runDirectionalTransition } from './ui/motion.js';
import { HeroMotion } from './ui/heroMotion.js';
import { ColTitleStrip } from './ui/ColTitleStrip.js';

console.info('Universal Timetable Core — Developed by テレスコープ (https://x.com/kizunan)');

let heroMotion = null;

const urlParams = new URLSearchParams(window.location.search);
const EVENT_KEY = urlParams.get('event') || 'default';
const GAS_API_URL = urlParams.get('api') || (import.meta.env && import.meta.env.VITE_GAS_API_URL) || '';
/**
 * ?mock=1 … 架空のサンプル会館、?mock=sample … 屋外の周辺地図つきのサンプル会場、
 * ?mock=sample2 … ビルの 3〜5 階と、駅前の広場までの広めの周辺地図（どれもサンプルの公演）。/sample/・/sample2/ はそれぞれへ転送
 */
const MOCK_SOURCES = { 1: './mock_data.json', sample: './samples/sample-hall.json', sample2: './samples/sample-hall2.json' };
const MOCK_URL = MOCK_SOURCES[urlParams.get('mock')] || null;
const FORCE_MOCK = Boolean(MOCK_URL);
/** 表示用キャッシュの鍵：サンプルは本番と分ける（サンプルを開いた後に本番を開くと、一瞬サンプルが出てしまうため） */
const CACHE_KEY = FORCE_MOCK ? `${EVENT_KEY}:mock-${urlParams.get('mock')}` : EVENT_KEY;

const state = {
  config: {},
  allShows: [],
  showsMap: new Map(),
  currentDayNum: 1,
  selectedIds: [],
  conflictIds: new Set(),
  unlockedShows: new Set(),
  unlockedUrls: {},
  isSharePreviewMode: false,
  eventStorageId: EVENT_KEY
};

const ticketView = new TicketView();
const routeView = new RouteView();
const specPopup = new SpecPopup();

let timetableView;
let selectionBar;
let filterModal;
let scheduleDialog;

/**
 * 南京錠パスワード暗号文の Base64 + XOR 復号
 */
function xorDecryptB64(b64Str, key) {
  try {
    const binStr = atob(b64Str);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const keyBytes = new TextEncoder().encode(key);
    if (keyBytes.length === 0) return '';
    const dec = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      dec[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(dec);
  } catch (_) {
    return '';
  }
}

function getActiveDayStr() {
  return `${state.currentDayNum}日目`;
}

function parseDayNum(dayVal) {
  const m = String(dayVal ?? '1').match(/\d+/);
  return m ? parseInt(m[0], 10) : 1;
}

/**
 * 着せ替え用 CSS カスタムプロパティとヒーローヘッダーを適用
 */
function applyThemeConfig(config) {
  const root = document.documentElement;
  const mainColor = config.mainColor || '#5b21b6';
  const accentColor = config.accentColor || '#facc15';

  root.style.setProperty('--fes-main', mainColor);
  root.style.setProperty('--main-color', mainColor);
  root.style.setProperty('--fes-accent', accentColor);
  root.style.setProperty('--accent-color', accentColor);

  if (config.themeTokens && config.themeTokens.bg) {
    root.style.setProperty('--fes-bg', config.themeTokens.bg);
  }
  if (config.themeTokens && config.themeTokens.surface) {
    root.style.setProperty('--fes-surface', config.themeTokens.surface);
  }

  // チケットの配色（箔・文字・紙）。色として解釈できない値は無視して既定色のままにする
  const ticketColors = config.ticketColors || {};
  const isColor = (v) => Boolean(v) && (typeof CSS === 'undefined' || CSS.supports('color', v));
  [['foil', '--pass-foil'], ['ink', '--pass-ink'], ['paper', '--pass-paper']].forEach(([key, prop]) => {
    if (isColor(ticketColors[key])) root.style.setProperty(prop, ticketColors[key]);
    else root.style.removeProperty(prop);
  });

  const titleEl = document.getElementById('fes-title');
  const subtitleEl = document.getElementById('fes-subtitle');
  const headerEl = document.getElementById('header-bg');

  if (titleEl) {
    titleEl.textContent = config.title || 'タイムテーブル';
    document.title = `${config.title || 'タイムテーブル'} | ハシゴ計画作成ツール`;
  }
  if (subtitleEl) {
    subtitleEl.textContent = config.subtitle || config.displayDate || '';
  }
  if (headerEl) {
    if (config.headerUrl) {
      const imgUrl = Parser.convertDriveUrl(config.headerUrl);
      headerEl.classList.add('has-custom-bg');
      headerEl.style.backgroundImage = `linear-gradient(135deg, rgba(17, 19, 26, 0.8), rgba(91, 33, 182, 0.72)), url("${imgUrl}")`;
      headerEl.style.backgroundSize = 'cover';
      headerEl.style.backgroundPosition = 'center';
    } else {
      headerEl.classList.remove('has-custom-bg');
      headerEl.style.backgroundImage = '';
      headerEl.style.backgroundSize = '';
      headerEl.style.backgroundPosition = '';
    }
    // 題字の後ろの「予定のコマ」。文字の範囲を測るので、書体が揃ってから置き直す
    if (!heroMotion) heroMotion = new HeroMotion(headerEl);
    heroMotion.start();
    document.fonts?.ready.then(() => heroMotion.start());
  }
}

/**
 * 日程ステッパー UI の更新
 */
function updateDayStepper() {
  const numDays = Math.max(1, state.config.numDays || 1);
  if (state.currentDayNum > numDays) state.currentDayNum = numDays;
  if (state.currentDayNum < 1) state.currentDayNum = 1;

  const badgeEl = document.getElementById('day-badge');
  const dateTextEl = document.getElementById('day-date-text');
  const prevBtn = document.getElementById('day-prev-btn');
  const nextBtn = document.getElementById('day-next-btn');

  if (badgeEl) {
    badgeEl.textContent = `DAY ${state.currentDayNum}`;
  }
  if (dateTextEl) {
    const labels = Array.isArray(state.config.dayLabels) ? state.config.dayLabels : [];
    dateTextEl.textContent = labels[state.currentDayNum - 1] || `${state.currentDayNum}日目`;
  }
  if (prevBtn) {
    prevBtn.disabled = state.currentDayNum <= 1;
    prevBtn.style.opacity = state.currentDayNum <= 1 ? '0.32' : '1';
  }
  if (nextBtn) {
    nextBtn.disabled = state.currentDayNum >= numDays;
    nextBtn.style.opacity = state.currentDayNum >= numDays ? '0.32' : '1';
  }
}

/**
 * 選択状態・重複・下部バー・モーダルの同期更新
 */
function syncSelectionState() {
  const { conflictIds } = ConflictDetector.findConflicts(
    state.selectedIds,
    state.showsMap,
    Boolean(state.config.allowZeroMinTransfer)
  );
  state.conflictIds = conflictIds;

  timetableView.updateSelectionVisuals(state.selectedIds, state.conflictIds);
  selectionBar.render(state.selectedIds, state.showsMap, state.conflictIds, getActiveDayStr());
  ticketView.setContext(state.config, state.allShows, state.selectedIds);
  scheduleDialog.updateState({
    config: state.config,
    allShows: state.allShows,
    selectedIds: state.selectedIds,
    conflictIds: state.conflictIds,
    activeDay: state.currentDayNum,
    unlockedShows: state.unlockedShows,
    unlockedUrls: state.unlockedUrls,
    isTitleExcludedFn: (title) => filterModal.isTitleExcluded(title),
    // スキマ候補にも難易度・タグの絞り込みを効かせる（開いた時点の絞り込みをその場で読む）
    isMatchFn: (show) => (filterModal ? filterModal.doesShowMatchFilter(show) : true),
    isFilterActiveFn: () => (filterModal ? filterModal.hasMatchFilter() : false)
  });
}

/**
 * 会場マップ（設定シートの「会場マップURL」）を読み込む。未設定・失敗なら null のまま（機能は出ない）
 * 判定には使わないので、重なり警告・スキマ提案の結果は地図の有無で変わらない
 */
let venueMapUrlLoaded = null;
function loadVenueMap(url, shows) {
  if (url === venueMapUrlLoaded) return;
  venueMapUrlLoaded = url;
  if (!url) {
    state.venueRouter = null;
    scheduleDialog.updateState({ venueRouter: null });
    return;
  }
  VenueRouter.load(url).then((router) => {
    if (venueMapUrlLoaded !== url) return;
    state.venueRouter = router;
    if (router) {
      const unknown = router.unknownRooms(shows.map((s) => s.room));
      if (unknown.length) console.warn('会場マップに結び付けられない部屋があります:', unknown);
    }
    scheduleDialog.updateState({ venueRouter: router });
  });
}

function persistSelectionIfEditable() {
  if (!state.isSharePreviewMode) {
    Storage.savePlan(state.eventStorageId, state.selectedIds);
  }
}

/**
 * 全体タイムテーブルの本描画（日程・除外公演・絞り込み反映）
 */
function renderTimetable() {
  updateDayStepper();

  const dayShows = state.allShows.filter(s => {
    if (parseDayNum(s.day) !== state.currentDayNum) return false;
    if (filterModal && filterModal.isTitleExcluded(s.title)) return false;
    return true;
  });

  timetableView.render(dayShows, {
    unlockedShows: state.unlockedShows,
    unlockedUrls: state.unlockedUrls,
    selectedIds: state.selectedIds,
    conflictIds: state.conflictIds,
    isMatchFn: (show) => (filterModal ? filterModal.doesShowMatchFilter(show) : true)
  });
}

function handleToggleShow(showId) {
  const show = state.showsMap.get(showId);
  if (!show) return;

  const idx = state.selectedIds.indexOf(showId);
  if (idx >= 0) {
    state.selectedIds.splice(idx, 1);
  } else {
    if (show.isSoldOut && !state.config.allowSoldOutSelect) {
      return;
    }
    state.selectedIds.push(showId);
  }

  persistSelectionIfEditable();
  syncSelectionState();
  if (!state.isSharePreviewMode) {
    Analytics.schedulePlanSync(state.selectedIds);
  }
}

function handleAddShow(showId) {
  const show = state.showsMap.get(showId);
  if (!show) return;
  if (show.isSoldOut && !state.config.allowSoldOutSelect) return;

  if (!state.selectedIds.includes(showId)) {
    state.selectedIds.push(showId);
    persistSelectionIfEditable();
    syncSelectionState();
    if (!state.isSharePreviewMode) {
      Analytics.track('add_gap_show', {
        selectedIds: state.selectedIds,
        showId,
        showTitle: show.title
      });
    }
  }
}

function handleRemoveShow(showId) {
  const idx = state.selectedIds.indexOf(showId);
  if (idx >= 0) {
    state.selectedIds.splice(idx, 1);
    persistSelectionIfEditable();
    syncSelectionState();
    if (!state.isSharePreviewMode) {
      Analytics.schedulePlanSync(state.selectedIds);
    }
  }
}

function handleClearAll() {
  if (state.selectedIds.length === 0) return;
  state.selectedIds = [];
  persistSelectionIfEditable();
  syncSelectionState();
  if (!state.isSharePreviewMode) {
    Analytics.schedulePlanSync(state.selectedIds);
  }
}

function handlePromptLock(groupKey, encrypted) {
  const input = window.prompt('ロック解除パスワード（合言葉）を入力してください');
  if (input === null) return;
  const trimmed = input.trim();
  if (!trimmed) return;

  let unlocked = false;
  const decrypted = xorDecryptB64(encrypted, trimmed);
  if (decrypted && (decrypted.startsWith('http://') || decrypted.startsWith('https://'))) {
    unlocked = true;
    state.unlockedUrls[groupKey] = decrypted;
  } else if (trimmed === encrypted) {
    unlocked = true;
  }

  if (!unlocked) {
    window.alert('パスワードが正しくありません。');
    return;
  }

  state.unlockedShows.add(groupKey);
  renderTimetable();
  syncSelectionState();
}

function clearPlanQueryFromUrl() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('plan');
  window.history.replaceState({}, '', nextUrl.toString());
}

/**
 * 生データを受け取って正規化・状態復元・初回描画を行う
 */
function applyLoadedData(rawData) {
  const config = Parser.normalizeConfig(rawData.config || {});
  const shows = Array.isArray(rawData.shows)
    ? rawData.shows.map((s, i) => Parser.normalizeShow(s, i))
    : [];

  state.config = config;
  state.allShows = shows;
  loadVenueMap(config.venueMapUrl, shows);
  state.showsMap = new Map(shows.map(s => [s.id, s]));
  state.eventStorageId = EVENT_KEY !== 'default'
    ? EVENT_KEY
    : `${config.date || 'fes'}_${config.title || 'default'}`;

  // メンテナンスモード判定（?preview=1 時はバイパス可）
  const allowPreview = urlParams.get('preview') === '1';
  if (config.isMaintenance && !allowPreview) {
    const maintScreen = document.getElementById('maintenance-screen');
    const maintMsg = document.getElementById('maintenance-message');
    const appContainer = document.getElementById('app-container');
    if (maintMsg) maintMsg.textContent = config.maintenanceMessage;
    if (maintScreen) maintScreen.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    return;
  }

  applyThemeConfig(config);
  timetableView.setConfig(config);
  specPopup.setShows(shows);

  const savedExcluded = Storage.loadExcludedTitles(state.eventStorageId);
  filterModal.setContext(shows, savedExcluded);

  const sharedPlanIds = Storage.decodeSharePlan(window.location.search);
  const shareBanner = document.getElementById('share-preview-banner');

  if (sharedPlanIds !== null) {
    state.isSharePreviewMode = true;
    state.selectedIds = sharedPlanIds.filter(id => state.showsMap.has(id));
    if (shareBanner) shareBanner.classList.remove('hidden');
  } else {
    state.isSharePreviewMode = false;
    const savedIds = Storage.loadPlan(state.eventStorageId);
    state.selectedIds = savedIds.filter(id => state.showsMap.has(id));
    if (shareBanner) shareBanner.classList.add('hidden');
  }

  document.getElementById('loading-msg')?.classList.add('hidden');
  document.getElementById('error-msg')?.classList.add('hidden');
  document.getElementById('timetable-section')?.classList.remove('hidden');

  syncSelectionState();
  renderTimetable();
  Analytics.init({
    config,
    eventId: state.eventStorageId,
    fallbackGasUrl: GAS_API_URL,
    allShows: shows,
    showsMap: state.showsMap
  });
}

/**
 * SWR（キャッシュ即時描画 + 最新データフェッチ）によるデータ取得
 */
async function fetchLatestRawData() {
  if (FORCE_MOCK) {
    return await new MockAdapter(MOCK_URL).fetchData();
  }

  try {
    return await new StaticJsonAdapter('./data.json').fetchData();
  } catch (staticErr) {
    console.warn('StaticJsonAdapter failed, trying fallback:', staticErr);
  }

  if (GAS_API_URL) {
    try {
      return await new GasAdapter(GAS_API_URL).fetchData();
    } catch (gasErr) {
      console.warn('GasAdapter failed, falling back to MockAdapter:', gasErr);
    }
  }

  return await new MockAdapter('./mock_data.json').fetchData();
}

function bindGlobalUiEvents() {
  // 日程ステッパー（方向付き View Transition）
  document.getElementById('day-prev-btn')?.addEventListener('click', () => {
    if (state.currentDayNum > 1) {
      runDirectionalTransition('backward', () => {
        state.currentDayNum -= 1;
        renderTimetable();
        syncSelectionState();
      }, '#timetable-section');
    }
  });

  document.getElementById('day-next-btn')?.addEventListener('click', () => {
    const numDays = Math.max(1, state.config.numDays || 1);
    if (state.currentDayNum < numDays) {
      runDirectionalTransition('forward', () => {
        state.currentDayNum += 1;
        renderTimetable();
        syncSelectionState();
      }, '#timetable-section');
    }
  });

  // 使い方ガイドモーダル
  const howtoDialog = document.getElementById('howto-dialog');
  document.getElementById('howto-open-btn')?.addEventListener('click', () => {
    if (howtoDialog && !howtoDialog.open) howtoDialog.showModal();
  });
  document.getElementById('howto-close-btn')?.addEventListener('click', () => {
    if (howtoDialog?.open) closeTopLayer(howtoDialog);
  });

  // 絞り込み・便利機能モーダル
  document.getElementById('tools-open-btn')?.addEventListener('click', () => {
    filterModal.open();
  });

  // 全 dialog 向けバックドロップクリック閉じフォールバック
  ['howto-dialog', 'filter-dialog'].forEach(id => {
    const dlg = document.getElementById(id);
    if (dlg) {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) closeTopLayer(dlg);
      });
    }
  });

  // 共有プレビューバナー操作
  document.getElementById('share-import-btn')?.addEventListener('click', () => {
    state.isSharePreviewMode = false;
    Storage.savePlan(state.eventStorageId, state.selectedIds);
    clearPlanQueryFromUrl();
    document.getElementById('share-preview-banner')?.classList.add('hidden');
  });

  document.getElementById('share-exit-btn')?.addEventListener('click', () => {
    state.isSharePreviewMode = false;
    const savedIds = Storage.loadPlan(state.eventStorageId);
    state.selectedIds = savedIds.filter(id => state.showsMap.has(id));
    clearPlanQueryFromUrl();
    document.getElementById('share-preview-banner')?.classList.add('hidden');
    syncSelectionState();
    renderTimetable();
  });
}

async function bootstrap() {
  timetableView = new TimetableView({
    onToggleShow: handleToggleShow,
    onPromptLock: handlePromptLock,
    onOpenSpec: (showId, invoker) => specPopup.openFrom(showId, invoker)
  });

  selectionBar = new SelectionBar({
    onRemoveShow: handleRemoveShow,
    onClearAll: handleClearAll,
    onOpenSchedule: () => {
      Analytics.track('open_schedule', { selectedIds: state.selectedIds });
      scheduleDialog.open();
    }
  });

  filterModal = new FilterModal({
    onFilterChange: () => renderTimetable(),
    onExcludeChange: (excludedTitlesSet) => {
      Storage.saveExcludedTitles(state.eventStorageId, excludedTitlesSet);
      renderTimetable();
      scheduleDialog.updateState({
        isTitleExcludedFn: (title) => filterModal.isTitleExcluded(title)
      });
    }
  });

  scheduleDialog = new MyScheduleDialog({
    ticketView,
    routeView,
    onAddShow: handleAddShow,
    onRemoveShow: handleRemoveShow
  });

  bindGlobalUiEvents();

  // 表を下へ送った時に、上部バーの真下へ公演名の帯を出す
  const stickyNav = document.querySelector('.sticky-controls');
  const ttScroller = document.getElementById('timetable-scroller');
  const ttGrid = document.getElementById('timetable-grid');
  const ttSection = document.getElementById('timetable-section');
  if (stickyNav && ttScroller && ttGrid && ttSection) {
    new ColTitleStrip({ nav: stickyNav, scroller: ttScroller, grid: ttGrid, section: ttSection });
  }

  // 1. キャッシュがあれば即時表示（SWR）
  const cachedRaw = Storage.loadTimetableCache(CACHE_KEY);
  let hasRenderedInitial = false;
  if (cachedRaw && cachedRaw.shows) {
    try {
      applyLoadedData(cachedRaw);
      hasRenderedInitial = true;
    } catch (cacheErr) {
      console.warn('Cache render skipped:', cacheErr);
    }
  }

  // 2. バックグラウンドで最新データを取得して差分反映
  try {
    const latestRaw = await fetchLatestRawData();
    const serializedLatest = JSON.stringify(latestRaw);
    const serializedCached = cachedRaw ? JSON.stringify(cachedRaw) : '';

    if (!hasRenderedInitial || serializedLatest !== serializedCached) {
      Storage.saveTimetableCache(latestRaw, CACHE_KEY);
      applyLoadedData(latestRaw);
    }
  } catch (err) {
    console.error('Data bootstrap failed:', err);
    if (!hasRenderedInitial) {
      const loadingEl = document.getElementById('loading-msg');
      const errorEl = document.getElementById('error-msg');
      if (loadingEl) loadingEl.classList.add('hidden');
      if (errorEl) {
        errorEl.textContent = `データの読み込みに失敗しました: ${err.message || err}`;
        errorEl.classList.remove('hidden');
      }
    }
  }
}

bootstrap();
