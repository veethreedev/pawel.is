// Port of MainActivity.kt, Settings.kt, HistoryStore and ui/theme/Theme.kt.
import {
  evaluate, display, subtract, decimal, isWhole, randomAverage,
  recentHistory, confirmedEntry, DAY_MS,
} from './calculator.js';

const $ = (id) => document.getElementById(id);

// ---------- Storage (SharedPreferences stand-in) ----------

const area = (name) => { try { return window[name]; } catch { return null; } };
const local = area('localStorage');
const session = area('sessionStorage');
const read = (store, key, fallback) => {
  try { const raw = store?.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
};
const write = (store, key, value) => { try { store?.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

const SETTINGS_KEY = 'culator.settings';
const HISTORY_KEY = 'culator.history';
const DRAFT_KEY = 'culator.draft';
const UI_KEY = 'culator.ui';

// ---------- Settings ----------

const ACCENTS = ['Mint', 'Blue', 'Purple', 'System', 'Custom'];
const RETENTION_OPTIONS = [1, 7, 30, 90, 365];
const DEFAULT_SETTINGS = Object.freeze({
  darkMode: true, accent: 'System', offsetRange: 20, customAccent: 0xCAEFAC,
  followSystemTheme: true, keepScreenOn: true, historyRetentionDays: 7,
});

function loadSettings() {
  const raw = read(local, SETTINGS_KEY, {}) ?? {};
  const d = DEFAULT_SETTINGS;
  const bool = (v, f) => (typeof v === 'boolean' ? v : f);
  const int = (v, f) => (Number.isInteger(v) ? v : f);
  return {
    darkMode: bool(raw.darkMode, d.darkMode),
    accent: ACCENTS.includes(raw.accent) ? raw.accent : d.accent,
    offsetRange: Math.min(100, Math.max(1, int(raw.offsetRange, d.offsetRange))),
    customAccent: int(raw.customAccent, d.customAccent) & 0xFFFFFF,
    followSystemTheme: bool(raw.followSystemTheme, d.followSystemTheme),
    keepScreenOn: bool(raw.keepScreenOn, d.keepScreenOn),
    historyRetentionDays: RETENTION_OPTIONS.includes(raw.historyRetentionDays) ? raw.historyRetentionDays : d.historyRetentionDays,
  };
}

// ---------- History store ----------

const retentionMs = () => state.settings.historyRetentionDays * DAY_MS;
const validEntry = (e) => e && typeof e.equation === 'string' && typeof e.result === 'string' && Number.isFinite(e.timestamp);

function loadHistory(now = Date.now()) {
  const raw = read(local, HISTORY_KEY, []);
  const saved = (Array.isArray(raw) ? raw : []).filter(validEntry)
    .map(({ equation, result, timestamp }) => ({ equation, result, timestamp }));
  const recent = recentHistory(saved, now, retentionMs());
  if (JSON.stringify(recent) !== JSON.stringify(raw)) write(local, HISTORY_KEY, recent);
  return recent;
}

function addHistory(equation, now = Date.now()) {
  const recent = loadHistory(now);
  const entry = confirmedEntry(equation, now);
  if (!entry) return recent;
  const entries = [entry, ...recent];
  write(local, HISTORY_KEY, entries);
  return entries;
}

function deleteHistory(entry) {
  const entries = loadHistory();
  const index = entries.findIndex((e) =>
    e.equation === entry.equation && e.result === entry.result && e.timestamp === entry.timestamp);
  if (index >= 0) entries.splice(index, 1);
  write(local, HISTORY_KEY, entries);
  return entries;
}

function clearHistory() {
  write(local, HISTORY_KEY, []);
  return [];
}

// ---------- State ----------

const draft = read(local, DRAFT_KEY, {}) ?? {};
const ui = read(session, UI_KEY, {}) ?? {};

const state = {
  settings: loadSettings(),
  equation: typeof draft.equation === 'string' ? draft.equation : '',
  completed: draft.completed === true,
  // Survive reloads like rememberSaveable survives activity recreation.
  splitTotal: typeof ui.splitTotal === 'string' && evaluate(ui.splitTotal) ? ui.splitTotal : null,
  itemCount: typeof ui.itemCount === 'string' && /^\d{0,4}$/.test(ui.itemCount) ? ui.itemCount : '',
  results: Array.isArray(ui.results) && ui.results.length ? ui.results.map(String) : null,
  showSettings: ui.showSettings === true,
  showHistory: ui.showHistory === true,
  showMenu: false,
  averageError: false,
  history: [],
  color: null, // custom accent picker: { h, s, v, hex } while open
  entryMenu: null, // history entry whose action menu is open
};
if (state.splitTotal == null) state.results = null;
state.history = loadHistory();

const answer = () => evaluate(state.equation);
const enteringCount = () => state.splitTotal != null && state.results == null;
const validCount = () => {
  const n = /^\d+$/.test(state.itemCount) ? Number(state.itemCount) : NaN;
  return n >= 1 && n <= 1000;
};

function setEquation(value) {
  // averageError is remembered per equation in the Compose version.
  if (value !== state.equation) state.averageError = false;
  state.equation = value;
}

function setHistory(entries) {
  state.history = entries;
  scheduleExpiry();
}

function updateSettings(next) {
  const retentionChanged = next.historyRetentionDays !== state.settings.historyRetentionDays;
  state.settings = next;
  write(local, SETTINGS_KEY, next);
  applyTheme();
  syncWakeLock();
  if (retentionChanged) setHistory(loadHistory());
  render();
}

const shares = (total, count) =>
  randomAverage(evaluate(total), count, Math.random, state.settings.offsetRange).map(String);

function startAverage() {
  const value = answer();
  if (!value) return;
  if (!isWhole(value)) {
    state.averageError = true;
  } else {
    state.averageError = false;
    state.splitTotal = display(value);
    state.itemCount = '';
  }
}

function dismissAverage() {
  state.results = null;
  state.splitTotal = null;
  state.itemCount = '';
  setEquation('');
  state.completed = false;
  state.averageError = false;
}

function restoreEntry(entry) {
  setEquation(entry.equation);
  state.completed = false;
  state.splitTotal = null;
  state.results = null;
  state.itemCount = '';
  state.averageError = false;
  state.showHistory = false;
}

// ---------- Keypad ----------

const ROWS = [
  ['C', '⌫', '−5', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '00', '='],
];
const OPERATORS = '+-×÷';
const FIVE = decimal(5n);
const isDigits = (label) => /^\d+$/.test(label);

function keyEnabled(label, value, entering) {
  if (label === '−5') return value != null && !entering;
  return !entering || label === 'C' || label === '⌫' || isDigits(label) || (label === '=' && validCount());
}

function pressKey(label) {
  const value = answer();
  const entering = enteringCount();
  if (!keyEnabled(label, value, entering)) return;
  if (entering) {
    if (label === 'C') state.itemCount = '';
    else if (label === '⌫') state.itemCount = state.itemCount.slice(0, -1);
    else if (label === '=') { if (validCount()) state.results = shares(state.splitTotal, Number(state.itemCount)); }
    else if (isDigits(label)) {
      const next = (state.itemCount + label).replace(/^0+/, '') || '0';
      if (next.length <= 4) state.itemCount = next;
    }
    return render();
  }
  const equation = state.equation;
  switch (label) {
    case 'C':
      setEquation('');
      state.completed = false;
      break;
    case '⌫':
      setEquation(equation.slice(0, -1));
      state.completed = false;
      break;
    case '=':
      if (value) {
        setHistory(addHistory(equation));
        setEquation(display(value));
        state.completed = true;
      }
      break;
    case '−5':
      if (value) {
        setEquation(display(subtract(value, FIVE)));
        state.completed = true;
      }
      break;
    case '+': case '-': case '×': case '÷':
      if (equation === '' || equation === '-') { if (label === '-') setEquation('-'); }
      else if (OPERATORS.includes(equation.at(-1))) setEquation(equation.slice(0, -1) + label);
      else setEquation(equation + label);
      state.completed = false;
      break;
    default: {
      if (state.completed) setEquation('');
      state.completed = false;
      const eq = state.equation;
      let start = eq.length;
      while (start > 0 && !OPERATORS.includes(eq[start - 1])) start--;
      const current = eq.slice(start);
      if (eq.length < 100 && (label !== '.' || !current.includes('.'))) {
        setEquation(eq + (label === '.' && current === '' ? '0.' : label));
      }
    }
  }
  render();
}

const keypad = $('keypad');
const keyButtons = ROWS.flat().map((label) => {
  const button = document.createElement('button');
  button.className = 'key pressable';
  if (label === '=') button.classList.add('equals');
  else if (OPERATORS.includes(label)) button.classList.add('operator');
  else if (label === 'C') button.classList.add('clear');
  button.textContent = label;
  const names = { '⌫': 'Backspace', C: 'Clear', '−5': 'Subtract five' };
  if (names[label]) button.setAttribute('aria-label', names[label]);
  button.addEventListener('click', () => pressKey(label));
  // Keep focus off keys after mouse clicks so Enter types "=" instead of repeating the key.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  keypad.append(button);
  return { label, button };
});

// ---------- Theme ----------

const PALETTE = { Mint: ['#CAEFAC', '#416B24'], Blue: ['#ADCFFF', '#245DA8'], Purple: ['#D6BCFF', '#7041AC'] };
const TOKENS = {
  dark: {
    bg: '#101214', surface: '#202427', fg: '#F2F4EF', muted: '#ABB3AD', outline: '#938F99',
    'outline-variant': '#49454F', 'surface-container': '#211F26', 'surface-container-high': '#2B2930',
    'surface-container-highest': '#36343B', error: '#F2B8B5',
  },
  light: {
    bg: '#F6F7F4', surface: '#E7EAE4', fg: '#191D17', muted: '#555E52', outline: '#79747E',
    'outline-variant': '#CAC4D0', 'surface-container': '#F3EDF7', 'surface-container-high': '#ECE6F0',
    'surface-container-highest': '#E6E0E9', error: '#B3261E',
  },
};
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const intToRgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const rgbToInt = ([r, g, b]) => (r << 16) | (g << 8) | b;
const toHex6 = (n) => n.toString(16).padStart(6, '0').toUpperCase();
const css = ([r, g, b], a = 1) => (a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`);
const over = (top, alpha, bottom) => top.map((c, i) => Math.round(c * alpha + bottom[i] * (1 - alpha)));

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (rgb) => (luminance(rgb) > 0.179 ? '#000000' : '#FFFFFF');

// Android 12+ dynamic color has no web equivalent; the CSS AccentColor system color is the closest.
const systemAccent = (() => {
  try {
    if (!CSS.supports('color', 'AccentColor')) return null;
    const probe = document.createElement('div');
    probe.style.cssText = 'color: AccentColor; display: none';
    document.documentElement.append(probe);
    const match = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
    probe.remove();
    return match && match.length >= 3 ? match.slice(0, 3).map((c) => Math.round(Number(c))) : null;
  } catch {
    return null;
  }
})();

const isDark = () => (state.settings.followSystemTheme ? darkQuery.matches : state.settings.darkMode);

function applyTheme() {
  const { accent, customAccent } = state.settings;
  const dark = isDark();
  let primary;
  if (accent === 'System' && systemAccent) primary = systemAccent;
  else if (accent === 'Custom') primary = intToRgb(customAccent);
  else primary = hexToRgb((PALETTE[accent] ?? PALETTE.Mint)[dark ? 0 : 1]);
  const root = document.documentElement.style;
  const tokens = TOKENS[dark ? 'dark' : 'light'];
  for (const [name, value] of Object.entries(tokens)) root.setProperty(`--${name}`, value);
  root.setProperty('--primary', css(primary));
  root.setProperty('--on-primary', onColor(primary));
  root.setProperty('--container', css(primary, 0.16));
  root.setProperty('color-scheme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]').content = tokens.bg;
}

darkQuery.addEventListener('change', () => {
  if (state.settings.followSystemTheme) { applyTheme(); render(); }
});

// ---------- Keep screen on ----------

let wakeLock = null;
let wakeLockPending = false;
async function syncWakeLock() {
  if (!('wakeLock' in navigator)) return;
  const want = state.settings.keepScreenOn && document.visibilityState === 'visible';
  if (want && !wakeLock && !wakeLockPending) {
    wakeLockPending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      wakeLock = lock;
      if (!state.settings.keepScreenOn) syncWakeLock();
    } catch { /* denied, e.g. battery saver */ }
    wakeLockPending = false;
  } else if (!want && wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(() => {});
  }
}

// ---------- History expiry ----------

let expiryTimer = 0;
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  if (!state.history.length) return;
  // Remove entries as they expire, checking at least once a minute.
  const oldest = Math.min(...state.history.map((e) => e.timestamp));
  const delay = Math.min(60_000, Math.max(1, oldest + retentionMs() + 1 - Date.now()));
  expiryTimer = setTimeout(() => { setHistory(loadHistory()); render(); }, delay);
}

// ---------- Back navigation (BackHandler / dialog dismissal) ----------

// Each dismissible layer owns one history entry so the system back button closes it.
function layerCount() {
  let count = 0;
  if (state.showSettings) count += state.color ? 2 : 1;
  if (state.showHistory) count++;
  if (state.results) count++;
  else if (enteringCount()) count++;
  return count;
}

function closeTopLayer() {
  if (state.color) state.color = null;
  else if (state.showSettings) state.showSettings = false;
  else if (state.showHistory) { state.showHistory = false; state.entryMenu = null; }
  else if (state.results) dismissAverage();
  else if (enteringCount()) state.splitTotal = null;
  else return false;
  return true;
}

let pushedDepth = history.state?.culatorDepth ?? 0;
let traversalTarget = null;

function syncBackStack() {
  if (traversalTarget != null) return; // resynced when the pending traversal lands
  const want = layerCount();
  while (pushedDepth < want) history.pushState({ culatorDepth: ++pushedDepth }, '');
  if (pushedDepth > want) {
    traversalTarget = want;
    history.go(want - pushedDepth);
  }
}

addEventListener('popstate', (event) => {
  const depth = event.state?.culatorDepth ?? 0;
  pushedDepth = depth;
  if (traversalTarget != null) {
    traversalTarget = null;
  } else {
    while (layerCount() > depth && closeTopLayer()) { /* close layers the user navigated back past */ }
  }
  render();
});

// ---------- Rendering ----------

const measure = document.createElement('canvas').getContext('2d');
const equationEl = $('equation');
let equationText = '';

function fitEquation() {
  const width = equationEl.clientWidth;
  const family = getComputedStyle(equationEl).fontFamily;
  let size = 24;
  for (let candidate = 44; candidate >= 24; candidate -= 2) {
    measure.font = `${candidate}px ${family}`;
    if (measure.measureText(equationText).width <= width) { size = candidate; break; }
  }
  equationEl.style.fontSize = `${size}px`;
  equationEl.style.lineHeight = `${size + 6}px`;
}
new ResizeObserver(fitEquation).observe(equationEl);

const syncDialog = (dialog, open) => {
  if (open && !dialog.open) dialog.showModal();
  else if (!open && dialog.open) dialog.close();
};

function renderCalculator() {
  const value = answer();
  const entering = enteringCount();
  const clickable = value != null && !entering;

  $('calculator').hidden = state.showSettings;
  $('countLabel').hidden = !entering;
  equationText = entering ? (state.itemCount || '0') : (state.equation || '0');
  if (equationEl.textContent !== equationText) equationEl.textContent = equationText;
  fitEquation();

  const result = $('result');
  result.textContent = entering ? 'press = to confirm' : value ? `= ${display(value)}` : '';
  result.classList.toggle('has-answer', value != null);
  for (const el of [equationEl, result]) {
    el.classList.toggle('clickable', clickable);
    if (clickable) { el.setAttribute('role', 'button'); el.tabIndex = 0; }
    else { el.removeAttribute('role'); el.removeAttribute('tabindex'); }
  }
  equationEl.title = clickable ? 'Random average' : '';

  $('averageError').hidden = !state.averageError;
  const averageButton = $('averageButton');
  averageButton.textContent = entering ? 'Cancel' : 'Random average';
  averageButton.disabled = value == null;

  for (const { label, button } of keyButtons) button.disabled = !keyEnabled(label, value, entering);

  $('mainMenu').hidden = !state.showMenu;
  $('menuButton').setAttribute('aria-expanded', String(state.showMenu));
}

function renderSettings() {
  const settingsEl = $('settings');
  const wasHidden = settingsEl.hidden;
  settingsEl.hidden = !state.showSettings;
  if (!state.showSettings) return;
  if (wasHidden) $('settingsBack').focus({ preventScroll: true });
  const s = state.settings;
  const themeChoice = s.followSystemTheme ? 'system' : s.darkMode ? 'dark' : 'light';
  for (const chip of document.querySelectorAll('[data-theme-choice]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.themeChoice === themeChoice));
  }
  for (const chip of document.querySelectorAll('[data-accent]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.accent === s.accent));
  }
  $('systemAccentNote').hidden = !(s.accent === 'System' && !systemAccent);
  $('keepScreenOn').checked = s.keepScreenOn;
  $('wakeLockNote').hidden = 'wakeLock' in navigator;
  for (const chip of document.querySelectorAll('[data-days]')) {
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.days) === s.historyRetentionDays));
  }
  $('offsetLabel').textContent = `Up to ±${s.offsetRange}`;
  const slider = $('offsetRange');
  slider.value = String(s.offsetRange);
  slider.style.setProperty('--pct', `${((s.offsetRange - 1) / 99) * 100}%`);
  renderColorDialog();
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
let renderedHistory = null;

function renderHistory() {
  const dialog = $('historyDialog');
  syncDialog(dialog, state.showHistory);
  if (!state.showHistory) { renderedHistory = null; state.entryMenu = null; $('historyMenu').hidden = true; return; }
  const days = state.settings.historyRetentionDays;
  $('historySubtitle').textContent = `Last ${days} ${days === 1 ? 'day' : 'days'} · Hold an equation for actions`;
  const empty = state.history.length === 0;
  $('historyEmpty').hidden = !empty;
  $('clearHistory').disabled = empty;
  const list = $('historyList');
  list.hidden = empty;
  if (renderedHistory !== state.history) {
    renderedHistory = state.history;
    list.replaceChildren(...state.history.map((entry, index) => {
      const item = document.createElement('li');
      item.className = 'history-item';
      item.tabIndex = 0;
      item.dataset.index = String(index);
      item.setAttribute('aria-haspopup', 'menu');
      const date = document.createElement('div');
      date.className = 'date';
      date.textContent = dateFormat.format(new Date(entry.timestamp));
      const eq = document.createElement('div');
      eq.className = 'eq';
      eq.textContent = entry.equation;
      const res = document.createElement('div');
      res.className = 'res';
      res.textContent = `= ${entry.result}`;
      item.append(date, eq, res);
      return item;
    }));
  }
  const menu = $('historyMenu');
  const item = state.entryMenu && list.querySelector(`[data-index="${state.history.indexOf(state.entryMenu)}"]`);
  if (!item) { state.entryMenu = null; menu.hidden = true; return; }
  const opening = menu.hidden;
  menu.hidden = false;
  // Anchor below the entry like DropdownMenu, flipping above when there's no room.
  const rect = item.getBoundingClientRect();
  const height = menu.offsetHeight;
  const top = rect.bottom + height <= innerHeight - 8 ? rect.bottom : Math.max(8, rect.top - height);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.min(rect.left, innerWidth - menu.offsetWidth - 8)}px`;
  if (opening) menu.querySelector('button').focus({ preventScroll: true });
}

let renderedResults = null;
function renderAverage() {
  syncDialog($('averageDialog'), state.results != null);
  if (!state.results) { renderedResults = null; return; }
  const total = state.splitTotal;
  $('averageSummary').textContent = `Total ${total} · offsets up to ±${state.settings.offsetRange}`;
  $('averageCount').textContent = `${state.results.length} items · total exactly ${total}`;
  if (renderedResults !== state.results) {
    renderedResults = state.results;
    $('averageList').replaceChildren(...state.results.map((value, index) => {
      const item = document.createElement('li');
      item.className = 'average-item';
      const number = document.createElement('span');
      number.className = 'index';
      number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.className = 'value';
      text.textContent = value;
      item.append(number, text);
      return item;
    }));
  }
}

function persist() {
  write(local, DRAFT_KEY, { equation: state.equation, completed: state.completed });
  write(session, UI_KEY, {
    splitTotal: state.splitTotal, itemCount: state.itemCount, results: state.results,
    showSettings: state.showSettings, showHistory: state.showHistory,
  });
}

function render() {
  renderCalculator();
  renderSettings();
  if (!state.showSettings) syncDialog($('colorDialog'), false);
  renderHistory();
  renderAverage();
  persist();
  syncBackStack();
}

// ---------- Custom accent picker ----------

function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map((c) => Math.round(c * 255));
}

function rgbToHsv([r, g, b]) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}

function openColorPicker() {
  const rgb = intToRgb(state.settings.customAccent);
  state.color = { ...rgbToHsv(rgb), hex: toHex6(state.settings.customAccent) };
  render();
}

function pickColor(h, s, v) {
  state.color = { h, s, v, hex: toHex6(rgbToInt(hsvToRgb(h, s, v))) };
  renderColorDialog();
}

function renderColorDialog() {
  const dialog = $('colorDialog');
  const picker = state.color;
  syncDialog(dialog, picker != null);
  if (!picker) return;
  const { h, s, v, hex } = picker;
  const hue = css(hsvToRgb(h, 1, 1));
  const selected = hsvToRgb(h, s, v);
  $('svPad').style.setProperty('--hue-color', hue);
  $('svPad').setAttribute('aria-valuetext', `Saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`);
  const thumb = $('svThumb');
  thumb.style.left = `${s * 100}%`;
  thumb.style.top = `${(1 - v) * 100}%`;
  const hueSlider = $('hueSlider');
  if (Number(hueSlider.value) !== h) hueSlider.value = String(h);
  hueSlider.style.setProperty('--thumb', hue);
  const hexInput = $('hexInput');
  if (hexInput.value !== hex) hexInput.value = hex;
  hexInput.closest('.text-field').classList.toggle('error', hex.length !== 6);
  $('colorApply').disabled = hex.length !== 6;
  const preview = dialog.querySelector('.preview-box').style;
  const surface = hexToRgb(TOKENS[isDark() ? 'dark' : 'light'].surface);
  preview.setProperty('--pick', css(selected));
  preview.setProperty('--pick-on', onColor(selected));
  preview.setProperty('--pick-container', css(over(selected, 0.16, surface)));
}

const svPad = $('svPad');
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function pickAt(event) {
  const rect = svPad.getBoundingClientRect();
  pickColor(state.color.h, clamp01((event.clientX - rect.left) / rect.width), 1 - clamp01((event.clientY - rect.top) / rect.height));
}
svPad.addEventListener('pointerdown', (event) => {
  svPad.setPointerCapture(event.pointerId);
  pickAt(event);
});
svPad.addEventListener('pointermove', (event) => { if (svPad.hasPointerCapture(event.pointerId)) pickAt(event); });
svPad.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.1 : 0.01;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  const { h, s, v } = state.color;
  pickColor(h, clamp01(s + move[0]), clamp01(v + move[1]));
});
$('hueSlider').addEventListener('input', (event) => {
  pickColor(Number(event.target.value), state.color.s, state.color.v);
});
$('hexInput').addEventListener('input', (event) => {
  const input = event.target;
  const text = input.value.replace(/^#/, '');
  if (text.length <= 6 && /^[0-9a-f]*$/i.test(text)) {
    const hex = text.toUpperCase();
    state.color = text.length === 6 ? { ...rgbToHsv(intToRgb(parseInt(text, 16))), hex } : { ...state.color, hex };
  }
  renderColorDialog();
});
$('colorApply').addEventListener('click', () => {
  if (state.color?.hex.length !== 6) return;
  const { h, s, v } = state.color;
  state.color = null;
  updateSettings({ ...state.settings, accent: 'Custom', customAccent: rgbToInt(hsvToRgb(h, s, v)) });
});
$('colorCancel').addEventListener('click', () => { state.color = null; render(); });

// ---------- Dialog dismissal ----------

// Dismiss on backdrop taps only when the press also started on the backdrop (not a drag out of the content).
function onDismiss(dialog, dismiss) {
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => { downOnBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && downOnBackdrop) dismiss();
    downOnBackdrop = false;
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });
  // Some browsers close anyway (e.g. repeated Escape); keep state in sync.
  dialog.addEventListener('close', () => {
    queueMicrotask(() => { if (dialogWanted(dialog)) { dismiss(); } });
  });
}

const dialogWanted = (dialog) => ({
  historyDialog: state.showHistory,
  averageDialog: state.results != null,
  colorDialog: state.color != null,
})[dialog.id] && !dialog.open;

onDismiss($('historyDialog'), () => {
  if (state.entryMenu) state.entryMenu = null;
  else state.showHistory = false;
  render();
});
onDismiss($('averageDialog'), () => { dismissAverage(); render(); });
onDismiss($('colorDialog'), () => { state.color = null; render(); });

// ---------- Calculator events ----------

const startAverageFromDisplay = () => {
  if (answer() != null && !enteringCount()) { startAverage(); render(); }
};
for (const el of [equationEl, $('result')]) {
  el.addEventListener('click', startAverageFromDisplay);
  el.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && el.getAttribute('role') === 'button') {
      event.preventDefault();
      startAverageFromDisplay();
    }
  });
}

$('averageButton').addEventListener('click', () => {
  if (enteringCount()) state.splitTotal = null;
  else startAverage();
  render();
});

$('menuButton').addEventListener('click', () => { state.showMenu = !state.showMenu; render(); });
$('mainMenu').addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  state.showMenu = false;
  if (action === 'settings') state.showSettings = true;
  if (action === 'history') { setHistory(loadHistory()); state.showHistory = true; }
  render();
});
document.addEventListener('pointerdown', (event) => {
  if (state.showMenu && !event.target.closest('.menu-anchor')) { state.showMenu = false; render(); }
  // A backdrop press is left to the dialog, whose dismiss closes the entry menu first.
  if (state.entryMenu && event.target !== $('historyDialog')
    && !event.target.closest('#historyMenu') && !event.target.closest('.history-item')) {
    state.entryMenu = null;
    render();
  }
});

$('shuffleAgain').addEventListener('click', () => {
  state.results = shares(state.splitTotal, state.results.length);
  render();
});
$('averageDone').addEventListener('click', () => { dismissAverage(); render(); });

// ---------- History events ----------

const historyList = $('historyList');
const entryAt = (target) => {
  const item = target.closest?.('.history-item');
  return item ? state.history[Number(item.dataset.index)] : null;
};
function openEntryMenu(entry) {
  if (!entry || state.entryMenu === entry) return;
  state.entryMenu = entry;
  render();
}

let pressTimer = 0;
let pressStart = null;
historyList.addEventListener('pointerdown', (event) => {
  const entry = entryAt(event.target);
  if (!entry) return;
  pressStart = [event.clientX, event.clientY];
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => openEntryMenu(entry), 500);
});
historyList.addEventListener('pointermove', (event) => {
  if (pressStart && Math.hypot(event.clientX - pressStart[0], event.clientY - pressStart[1]) > 10) {
    clearTimeout(pressTimer);
    pressStart = null;
  }
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  historyList.addEventListener(type, () => { clearTimeout(pressTimer); pressStart = null; });
}
historyList.addEventListener('contextmenu', (event) => {
  const entry = entryAt(event.target);
  if (!entry) return;
  event.preventDefault();
  openEntryMenu(entry);
});
historyList.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    const entry = entryAt(event.target);
    if (entry) { event.preventDefault(); openEntryMenu(entry); }
  }
});
historyList.addEventListener('scroll', () => { if (state.entryMenu) { state.entryMenu = null; render(); } });

$('historyMenu').addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const entry = state.entryMenu;
  if (!action || !entry) return;
  state.entryMenu = null;
  if (action === 'restore') restoreEntry(entry);
  if (action === 'delete') setHistory(deleteHistory(entry));
  render();
});
$('clearHistory').addEventListener('click', () => {
  state.entryMenu = null;
  setHistory(clearHistory());
  render();
});
$('historyDone').addEventListener('click', () => { state.showHistory = false; render(); });

// ---------- Settings events ----------

const chip = (text, data) => {
  const button = document.createElement('button');
  button.className = 'chip pressable';
  button.textContent = text;
  Object.assign(button.dataset, data);
  return button;
};
const chipRows = (container, chips) => {
  for (let i = 0; i < chips.length; i += 3) {
    const row = document.createElement('div');
    row.className = 'chip-row';
    row.append(...chips.slice(i, i + 3));
    container.append(row);
  }
};
chipRows($('accentChips'), ACCENTS.map((accent) => chip(accent, { accent })));
chipRows($('retentionChips'), RETENTION_OPTIONS.map((days) => chip(days === 1 ? '1 day' : `${days} days`, { days })));
for (const button of document.querySelectorAll('.chip, .text-button, .outlined-button, .tonal-button, .icon-button, .menu button')) {
  button.classList.add('pressable');
}

$('settingsBack').addEventListener('click', () => { state.showSettings = false; render(); $('menuButton').focus({ preventScroll: true }); });
$('themeChips').addEventListener('click', (event) => {
  const choice = event.target.closest('[data-theme-choice]')?.dataset.themeChoice;
  if (!choice) return;
  const s = state.settings;
  if (choice === 'system') updateSettings({ ...s, followSystemTheme: true });
  else updateSettings({ ...s, darkMode: choice === 'dark', followSystemTheme: false });
});
$('accentChips').addEventListener('click', (event) => {
  const accent = event.target.closest('[data-accent]')?.dataset.accent;
  if (!accent) return;
  if (accent === 'Custom') openColorPicker();
  else updateSettings({ ...state.settings, accent });
});
$('retentionChips').addEventListener('click', (event) => {
  const days = event.target.closest('[data-days]')?.dataset.days;
  if (days) updateSettings({ ...state.settings, historyRetentionDays: Number(days) });
});
$('keepScreenOn').addEventListener('change', (event) => {
  updateSettings({ ...state.settings, keepScreenOn: event.target.checked });
});
$('offsetRange').addEventListener('input', (event) => {
  updateSettings({ ...state.settings, offsetRange: Number(event.target.value) });
});
$('restoreDefaults').addEventListener('click', () => updateSettings({ ...DEFAULT_SETTINGS }));

// ---------- Keyboard (desktop convenience) ----------

const KEYMAP = {
  '*': '×', x: '×', X: '×', '/': '÷', ',': '.', Enter: '=', '=': '=', Backspace: '⌫', Delete: 'C',
};
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    if (state.showMenu) { state.showMenu = false; render(); $('menuButton').focus(); return; }
    if (document.querySelector('dialog[open]')) return; // handled by the dialog's cancel event
    if (closeTopLayer()) { event.preventDefault(); render(); }
    return;
  }
  if (state.showSettings || document.querySelector('dialog[open]') || state.showMenu) return;
  if (event.target.closest?.('input')) return;
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('button, [role="button"]')) return;
  const label = KEYMAP[event.key] ?? (/^[0-9.+\-]$/.test(event.key) ? event.key : null);
  if (!label) return;
  event.preventDefault();
  pressKey(label);
});

// ---------- Lifecycle ----------

document.addEventListener('visibilitychange', () => {
  syncWakeLock();
  if (document.visibilityState === 'visible') { setHistory(loadHistory()); render(); }
});
addEventListener('storage', (event) => {
  if (event.key === SETTINGS_KEY) {
    state.settings = loadSettings();
    applyTheme();
    syncWakeLock();
  }
  if (event.key === SETTINGS_KEY || event.key === HISTORY_KEY) {
    setHistory(loadHistory());
    render();
  }
});

applyTheme();
render();
scheduleExpiry();
syncWakeLock();

if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
}

// Install flow: the site's "Install PWA" button links here with ?install, since the
// browser only offers installation on pages inside the manifest scope.
const installBanner = document.getElementById('installBanner');
const installText = document.getElementById('installText');
const installConfirm = document.getElementById('installConfirm');
let installPrompt = null;
const installRequested = new URLSearchParams(location.search).has('install');
if (installRequested) history.replaceState(null, '', location.pathname + location.hash);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function showInstallBanner(message, canInstall) {
  installText.textContent = message;
  installConfirm.hidden = !canInstall;
  installBanner.hidden = false;
}

addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (installRequested) showInstallBanner('Install Culator on this device?', true);
});
addEventListener('appinstalled', () => {
  installPrompt = null;
  installBanner.hidden = true;
});
installConfirm.addEventListener('click', async () => {
  if (!installPrompt) return;
  installBanner.hidden = true;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
});
document.getElementById('installDismiss').addEventListener('click', () => { installBanner.hidden = true; });

if (installRequested && !isStandalone) {
  // Browsers without beforeinstallprompt (Safari, Firefox) need manual steps.
  setTimeout(() => {
    if (installPrompt || !installBanner.hidden) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    showInstallBanner(ios
      ? 'To install, tap Share, then "Add to Home Screen".'
      : 'To install, use your browser menu\'s "Install app" or "Add to Home Screen" option. If Culator is already installed, open it from your apps.', false);
  }, 1500);
}
