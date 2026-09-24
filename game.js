// SUNSTRIP browser layer — rendering, input, menus and presentation.
// The simulation lives in core.js, art in art.js, sound in audio.js.
import * as C from './core.js';
import { PAL, fogLUT, FOG_STEPS, drawSprite, drawTrafficCar, drawPlayerCar, mixHex } from './art.js';
import * as AU from './audio.js';
import { botInput } from './bot.js';

const { CFG, STAGES, STAGE_TREE, TIERS } = C;
let W = 1280;                 // logical width grows on wide screens (phones); height is fixed
const H = 720;
const FONT = "'Arial Black', 'Segoe UI Black', 'Helvetica Neue', Arial, system-ui, sans-serif";
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

// ---------------------------------------------------------------------------
// storage that never throws (sandboxed iframes and private modes do)
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const hasOwn = Object.hasOwn || ((o, k) => Object.prototype.hasOwnProperty.call(o, k));
let storageOk = true;
try { localStorage.setItem('sunstrip.probe', '1'); localStorage.removeItem('sunstrip.probe'); } catch { storageOk = false; }
const store = {
  get(k, d) { try { const v = localStorage.getItem('sunstrip.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sunstrip.' + k, JSON.stringify(v)); } catch { /* memory only */ } },
};

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// everything read back from storage is validated: a bad save must never brick the game
const DEFAULTS = {
  difficulty: 'normal', radio: 0, autoGas: false, volume: 0.8, music: 0.8,
  shake: !reduceMotion, streaks: !reduceMotion, flashes: !reduceMotion,
};
const SET = Object.assign({}, DEFAULTS);
(() => {
  const raw = store.get('settings', {});
  if (!raw || typeof raw !== 'object') return;
  for (const [k, d] of Object.entries(DEFAULTS)) {
    const v = raw[k];
    if (typeof d === 'boolean' && typeof v === 'boolean') SET[k] = v;
    if (typeof d === 'number' && Number.isFinite(v)) SET[k] = Math.max(0, Math.min(1, v));
  }
  if (Number.isInteger(raw.radio) && raw.radio >= 0 && raw.radio < AU.STATIONS.length) SET.radio = raw.radio;
  if (typeof raw.difficulty === 'string' && hasOwn(C.DIFFICULTY, raw.difficulty)) SET.difficulty = raw.difficulty;
})();
function saveSettings() { store.set('settings', SET); }
AU.setVolume(SET.volume); AU.setMusicVolume(SET.music);

// a row must be a real run: whole score in range, arcade initials, a true path
// down the pyramid from the beach
const validRoute = (r) => Array.isArray(r) && r.length >= 1 && r.length <= 5 && r[0] === 'coast' &&
  r.every((k, i) => typeof k === 'string' && hasOwn(STAGES, k) && (i === 0 || [STAGE_TREE[r[i - 1]]?.L, STAGE_TREE[r[i - 1]]?.R].includes(k)));
const validRow = (r) => r && typeof r.name === 'string' && /^[A-Z0-9 ]{1,3}$/.test(r.name) &&
  Number.isInteger(r.score) && r.score >= 0 && r.score <= 99999999 && validRoute(r.route);
const BOARDS = { easy: [], normal: [], hard: [] };
(() => {
  const raw = store.get('boards', null);
  if (raw && typeof raw === 'object') {
    for (const d of Object.keys(BOARDS)) if (Array.isArray(raw[d])) BOARDS[d] = raw[d].filter(validRow).sort((a, b) => b.score - a.score).slice(0, 10);
  }
  // carry over the single best score from the first release
  const old = Number(store.get('best', 0));
  if (Number.isFinite(old) && old > 0 && !BOARDS.normal.length) {
    BOARDS.normal.push({ name: 'OLD', score: Math.floor(old), route: ['coast'], won: false, diff: 'normal', date: 0 });
  }
})();
const board = (d = SET.difficulty) => (hasOwn(BOARDS, d) ? BOARDS[d] : BOARDS.normal);
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
function loadSplits(d) {
  const raw = store.get('splits.' + d, {});
  const out = {};
  if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (hasOwn(STAGES, k) && Number.isFinite(v) && v > 0) out[k] = v;
  return out;
}
const medalCache = {};
function loadMedals(d) {
  if (medalCache[d]) return medalCache[d];
  const raw = store.get('medals.' + d, {});
  const out = {};
  if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const route = k.split('>');
      const ok = route.length === 5 && route.every((r, i) => hasOwn(STAGES, r) && C.stageTier(r) === i);
      if (ok && ['GOLD', 'SILVER', 'BRONZE'].includes(v) && Object.keys(out).length < 16) out[k] = v;
    }
  }
  return (medalCache[d] = out);
}
function loadName() {
  const raw = store.get('name', null);
  return Array.isArray(raw) && raw.length === 3 && raw.every((c) => typeof c === 'string' && c.length === 1 && ALPHA.includes(c)) ? raw.slice() : ['A', 'A', 'A'];
}

// ---------------------------------------------------------------------------
// browser-side state
const B = {
  mode: 'title',        // title | race | results
  menu: 'main',         // title submenus: main | options | scores | help
  sel: 0,
  S: null,              // the race
  demo: null,           // attract-mode race behind the title
  paused: false, pauseSel: 0,
  t: 0,                 // wall clock of the sim (pauses with it)
  bgCurve: 0,
  wheel: 0,
  shake: 0, flash: 0, kick: 0, hitstop: 0,
  banner: null, pops: [], parts: [], streaks: [],
  xOff: 0,              // eases the lateral jump at checkpoints
  prevPal: null, palBlend: 1,
  end: null,            // { t, won } — outro before the results card
  results: null,
  entry: null,          // initials entry { chars, pos, rank }
  noGasT: 0,
  lastLowBeep: 99,
  touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  storageToast: false,
  hits: [],             // clickable rects for pointer menus
  quality: 1,
  lastStrike: -1e9,
  toast: null,
  popSlot: 0,
  towFov: 0,
  dip: 0,
  prev: null,           // last sim state, for render interpolation
  alpha: 1,
  scoresTab: null,
};

const input = { steer: 0, brake: false, accel: false, codes: new Set(), pad: { steer: 0, gas: false, brake: false }, touch: new Map() };
const held = (action) => { for (const c of input.codes) if (KEYMAP[c] === action) return true; return false; };

// ---------------------------------------------------------------------------
// canvas sizing: letterboxed 16:9, crisp on high-DPI, adaptive under load
let RS = 1, cssScale = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  W = Math.round(Math.max(1280, Math.min(1600, H * vw / Math.max(1, vh))));
  if (typeof PADS !== 'undefined') PADS.brake.x = W - 200;
  const sc = Math.min(vw / W, vh / H);
  const cw = Math.floor(W * sc), ch = Math.floor(H * sc);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  cssScale = cw / W;
  const dpr = Math.min(3, window.devicePixelRatio || 1) * B.quality;
  let bw = Math.max(320, Math.round(cw * dpr));
  const budget = 3840 * 2160 * 0.75;                  // pixels, not width: 4K-ish tops
  if (bw * bw * H / W > budget) bw = Math.floor(Math.sqrt(budget * W / H));
  const bh = Math.round(bw * H / W);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; bodyReset(); }
  RS = bw / W;
}
function bodyReset() { /* canvas contexts keep gradients; nothing cached per size */ }
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// input
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', KeyX: 'down',
  Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Escape: 'esc', KeyP: 'pause', Backspace: 'back',
};
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k || e.code === 'KeyM' || e.code === 'KeyF') e.preventDefault();
  unlockAudio();
  if (B.mode !== 'race') B.touch = false;            // never switch throttle mode mid-race
  // initials take every letter, even the ones that drive
  if (B.entry && /^(Key[A-Z]|Digit[0-9]|Space)$/.test(e.code)) { if (!e.repeat) typeLetter(e.code === 'Space' ? ' ' : e.code.slice(-1)); return; }
  if (e.code === 'KeyM') { AU.setMuted(!AU.isMuted()); return; }
  if (e.code === 'KeyF') { toggleFullscreen(); return; }
  if (!k) return;
  input.codes.add(e.code);
  if (!e.repeat) press(k);
  else if ((k === 'left' || k === 'right' || k === 'up' || k === 'down') && (B.mode !== 'race' || B.paused)) press(k);
});
window.addEventListener('keyup', (e) => { input.codes.delete(e.code); });
window.addEventListener('blur', () => { input.codes.clear(); input.touch.clear(); autoPause(); });
try {
  matchMedia('(orientation: portrait) and (pointer: coarse)').addEventListener('change', (m) => { if (m.matches) autoPause(); });
} catch { /* old Safari */ }
let audioReady = false;
function unlockAudio() {
  AU.audioUnlock();
  if (!audioReady) {
    audioReady = true;
    if (B.mode === 'title') AU.musicStart(SET.radio);   // the radio plays from the first touch
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { autoPause(); AU.audioSuspend(true); } else AU.audioSuspend(false);
});
function autoPause() { if (B.mode === 'race' && !B.end && !B.paused) setPaused(true); }
function setPaused(p) {
  B.paused = p; B.pauseSel = 0; B.hits = [];
  if (p) { input.touch.clear(); AU.engineSilence(); }
}

function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  } catch { /* unsupported */ }
}

// menu-level presses; race steering reads held keys each tick
function press(k) {
  if (B.mode === 'title') return titlePress(k);
  if (B.mode === 'results') return resultsPress(k);
  if (B.mode === 'race') {
    if (k === 'esc' || k === 'pause') { if (!B.end) { setPaused(!B.paused); AU.sfx('menu'); } return; }
    if (B.paused) return pausePress(k);
  }
}

// touch: on-screen pads during the race, taps on menu items elsewhere
const PADS = {
  left:  { x: 16,  y: 470, w: 190, h: 234, label: '◄' },
  right: { x: 216, y: 470, w: 190, h: 234, label: '►' },
  brake: { x: 1080, y: 330, w: 184, h: 150, label: 'BRAKE' },
  pause: { x: 12, y: 10, w: 76, h: 76, label: '❚❚' },
};
resize();
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  // the letterbox bars count: clamp thumbs there onto the nearest edge
  return {
    x: Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W)),
    y: Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H)),
  };
}
function padAt(p) {
  for (const [name, r] of Object.entries(PADS)) {
    if (p.x >= r.x - 10 && p.x <= r.x + r.w + 10 && p.y >= r.y - 10 && p.y <= r.y + r.h + 10) return name;
  }
  // generous halves when not on a pad: left third steers left, etc.
  if (p.y > H * 0.45) return p.x < W * 0.33 ? 'left' : p.x < W * 0.5 ? 'right' : p.x > W * 0.8 ? 'brake' : null;
  return null;
}
window.addEventListener('pointerdown', (e) => {
  if (e.target !== canvas && e.target !== document.body && e.target !== document.documentElement) return;
  e.preventDefault();
  unlockAudio();
  if (e.pointerType === 'touch' && (B.mode !== 'race' || B.touch)) B.touch = true;   // auto throttle on touch; never flips mid-race
  const p = toLogical(e);
  if (B.mode === 'race' && B.end) return;       // the outro: nothing to press yet
  if (B.mode === 'race' && !B.paused) {
    if (e.pointerType === 'mouse') return;       // a desk mouse doesn't drive
    const pad = padAt(p);
    if (pad === 'pause') { setPaused(true); return; }
    if (pad) input.touch.set(e.pointerId, pad);
    return;
  }
  for (const h of B.hits) {
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) { h.fn(p); return; }
  }
  if (B.mode === 'results' && !B.entry) resultsPress('enter');
}, { passive: false });
window.addEventListener('pointermove', (e) => {
  if (!input.touch.has(e.pointerId)) return;
  const pad = padAt(toLogical(e));
  if (pad && pad !== 'pause') input.touch.set(e.pointerId, pad);
});
const lift = (e) => input.touch.delete(e.pointerId);
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('gamepaddisconnected', () => autoPause());
// gamepad: polled every frame, edges turned into presses
const padPrev = {};
function pollGamepad() {
  let pads = [];
  try { pads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter((g) => g && g.connected); } catch { /* blocked */ }
  if (!pads.length) { input.pad = { steer: 0, gas: false, brake: false }; return; }
  // merge every pad: phantom devices at index 0 must not hide the real one
  const b = (i) => pads.some((gp) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3));
  let ax = 0, ay = 0;
  for (const gp of pads) {
    const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    if (Math.hypot(x, y) > 0.25 && Math.abs(x) > Math.abs(ax)) ax = x;
    if (Math.hypot(x, y) > 0.25 && Math.abs(y) > Math.abs(ay)) ay = y;
  }
  const steer = b(14) ? -1 : b(15) ? 1 : ax;
  input.pad = { steer, gas: b(7) || b(0), brake: b(6) || b(2) || b(1) };
  const edges = { enter: b(0), back: b(1), pause: b(9), up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: steer < -0.6, right: steer > 0.6 };
  for (const [k, v] of Object.entries(edges)) {
    if (v && !padPrev[k]) { unlockAudio(); if (B.mode !== 'race') B.touch = false; if (!(B.mode === 'race' && !B.paused && (k === 'left' || k === 'right' || k === 'enter' || k === 'back'))) press(k === 'back' ? (B.entry ? 'back' : 'esc') : k); }
    padPrev[k] = v;
  }
}

function readDriveInput() {
  let steer = (held('left') ? -1 : 0) + (held('right') ? 1 : 0);
  let brake = held('down') || held('space');
  let gas = held('up');
  for (const pad of input.touch.values()) {
    if (pad === 'left') steer -= 1;
    if (pad === 'right') steer += 1;
    if (pad === 'brake') brake = true;
  }
  if (Math.abs(input.pad.steer) > Math.abs(steer)) steer = input.pad.steer;
  gas = gas || input.pad.gas;
  brake = brake || input.pad.brake;
  steer = Math.max(-1, Math.min(1, steer));
  const auto = SET.autoGas || B.touch;
  input.steer = steer; input.brake = brake; input.accel = auto ? !brake : gas && !brake;
  return { steer, brake, accel: input.accel };
}

// ---------------------------------------------------------------------------
// menus
const DIFFS = ['easy', 'normal', 'hard'];
function mainItems() {
  return [
    { label: 'DRIVE', act: () => startRace() },
    { label: 'RADIO', value: AU.STATIONS[SET.radio].name, change: (d) => { SET.radio = (SET.radio + d + 3) % 3; AU.sfx('tune'); previewRadio(); saveSettings(); } },
    { label: 'MODE', value: C.DIFFICULTY[SET.difficulty].label, change: (d) => { SET.difficulty = DIFFS[(DIFFS.indexOf(SET.difficulty) + d + 3) % 3]; saveSettings(); } },
    { label: 'HOW TO PLAY', act: () => { B.menu = 'help'; B.sel = 0; } },
    { label: 'HIGH SCORES', act: () => { B.menu = 'scores'; B.sel = 0; } },
    { label: 'OPTIONS', act: () => { B.menu = 'options'; B.sel = 0; } },
  ];
}
function optionItems() {
  const pct = (v) => Math.round(v * 100) + '%';
  return [
    { label: 'THROTTLE', value: SET.autoGas ? 'AUTO' : 'MANUAL', change: () => { SET.autoGas = !SET.autoGas; saveSettings(); } },
    { label: 'VOLUME', value: pct(SET.volume), change: (d) => { SET.volume = Math.max(0, Math.min(1, Math.round((SET.volume + d * 0.1) * 10) / 10)); AU.setVolume(SET.volume); AU.sfx('menu'); saveSettings(); } },
    { label: 'MUSIC', value: pct(SET.music), change: (d) => { SET.music = Math.max(0, Math.min(1, Math.round((SET.music + d * 0.1) * 10) / 10)); AU.setMusicVolume(SET.music); saveSettings(); } },
    { label: 'CAMERA SHAKE & ROLL', value: SET.shake ? 'ON' : 'OFF', change: () => { SET.shake = !SET.shake; saveSettings(); } },
    { label: 'SCREEN FLASHES', value: SET.flashes ? 'ON' : 'OFF', change: () => { SET.flashes = !SET.flashes; saveSettings(); } },
    { label: 'SPEED LINES', value: SET.streaks ? 'ON' : 'OFF', change: () => { SET.streaks = !SET.streaks; saveSettings(); } },
    { label: 'FULLSCREEN', act: () => toggleFullscreen() },
    { label: 'BACK', act: () => { B.menu = 'main'; B.sel = 5; } },
  ];
}
function currentItems() {
  if (B.menu === 'main') return mainItems();
  if (B.menu === 'options') return optionItems();
  const from = B.menu;
  return [{ label: 'BACK', act: () => { B.menu = 'main'; B.sel = from === 'help' ? 3 : 4; } }];
}
function previewRadio() { AU.musicStart(SET.radio); }
function titlePress(k) {
  const items = currentItems();
  if (k === 'up') { B.sel = (B.sel + items.length - 1) % items.length; AU.sfx('menu'); }
  else if (k === 'down') { B.sel = (B.sel + 1) % items.length; AU.sfx('menu'); }
  else if (k === 'left' || k === 'right') {
    if (B.menu === 'scores') { cycleScoresTab(k === 'left' ? -1 : 1); return; }
    const it = items[B.sel]; if (it && it.change) it.change(k === 'left' ? -1 : 1);
  }
  else if (k === 'enter' || k === 'space') {
    const it = items[B.sel];
    if (it.act) { AU.sfx('select'); it.act(); } else if (it.change) it.change(1);
  } else if (k === 'esc' || k === 'back') {
    if (B.menu !== 'main') { const from = B.menu; B.menu = 'main'; B.sel = { help: 3, scores: 4, options: 5 }[from] || 0; AU.sfx('menu'); }
  }
}
const PAUSE_ITEMS = ['RESUME', 'RESTART', 'QUIT TO TITLE'];
function pausePress(k) {
  if (k === 'up') { B.pauseSel = (B.pauseSel + 2) % 3; AU.sfx('menu'); }
  else if (k === 'down') { B.pauseSel = (B.pauseSel + 1) % 3; AU.sfx('menu'); }
  else if (k === 'enter' || k === 'space') pauseAct(B.pauseSel);
}
function pauseAct(i) {
  AU.sfx('select');
  if (i === 0) setPaused(false);
  else if (i === 1) startRace();
  else toTitle();
}

// ---------------------------------------------------------------------------
// race lifecycle
function startRace() {
  // arcade rules: every route has fixed traffic, so a score measures driving, not luck
  B.S = C.newRace(1986, SET.difficulty);
  B.mode = 'race'; B.paused = false; B.end = null; B.results = null; B.entry = null; B.hits = [];
  B.banner = { text: STAGES.coast.name, sub: 'STAGE 1 · ' + C.DIFFICULTY[SET.difficulty].label, t: 3.2, dur: 3.2 };
  B.bgCurve = 0; B.pops = []; B.parts = []; B.streaks = []; B.xOff = 0; B.flash = 0; B.shake = 0;
  B.prevPal = null; B.palBlend = 1; B.noGasT = 0; B.lastLowBeep = 99; B.kick = 0; B.hitstop = 0; B.prev = null;
  AU.musicStart(SET.radio);
}
function toTitle() {
  B.mode = 'title'; B.menu = 'main'; B.sel = 0; B.paused = false; B.end = null; B.entry = null;
  B.demo = null; B.parts = []; B.pops = []; B.streaks = []; B.prevPal = null; B.palBlend = 1; B.xOff = 0;
  B.banner = null; B.flash = 0; B.shake = 0; B.prev = null;
  AU.engineSilence();
  AU.musicStart(SET.radio);
}
function cycleScoresTab(d) {
  const i = DIFFS.indexOf(B.scoresTab || SET.difficulty);
  B.scoresTab = DIFFS[(i + d + 3) % 3];
  AU.sfx('menu');
}
function newDemo() {
  const S = C.newRace(((Math.random() * 1e6) | 0) + 7, 'easy');
  S.countdown = 0; S.speed = CFG.maxSpeed * 0.8; S.time = 999;
  return S;
}

function finishRace(won) {
  const S = B.S;
  B.end = { t: 0, won };
  B.hits = [];
  const score = Math.floor(S.score);
  const bd = board(S.difficulty);
  const rank = bd.filter((s) => s.score >= score).length;
  // per-route best splits: the ghost you race next time
  const bestKey = 'splits.' + S.difficulty;
  const best = loadSplits(S.difficulty);
  const deltas = {};
  S.routeTaken.forEach((k, i) => {
    const t = S.splits[i];
    if (t === undefined) return;
    const prev = best && Number.isFinite(best[k]) ? best[k] : null;
    if (prev !== null) deltas[k] = t - prev;
    if (prev === null || t < prev) best[k] = t;
  });
  store.set(bestKey, best);
  // route medals: how much sun was left when you got there
  let medal = null, newMedal = false;
  if (won) {
    medal = C.medalFor(S.routeTaken, S.difficulty, S.time);
    const mk = 'medals.' + S.difficulty, got = loadMedals(S.difficulty), route = S.routeTaken.join('>');
    const rankOf = { BRONZE: 1, SILVER: 2, GOLD: 3 };
    if (!got[route] || rankOf[medal] > rankOf[got[route]]) { got[route] = medal; newMedal = true; store.set(mk, got); medalCache[S.difficulty] = got; }
  }
  B.results = {
    won, score, rank: rank < 10 && score > 0 ? rank : -1, deltas, medal, newMedal,
    record: score > 0 && (bd.length === 0 || score > bd[0].score),
    timeBonus: won ? Math.floor(S.time * CFG.goalTimeBonus * S.stage.def.bonus) : 0,
  };
  if (won) { AU.sfx('goal'); AU.musicStop(1.5); } else { AU.sfx('timeout'); AU.musicStop(0.4); }
  AU.engineSilence();
}
function resultsPress(k) {
  if (!B.results || B.end && B.end.t < 1.2) return;
  if (B.entry) {
    const E = B.entry;
    if (k === 'up' || k === 'down') { const i = ALPHA.indexOf(E.chars[E.pos]); E.chars[E.pos] = ALPHA[(i + (k === 'up' ? 1 : ALPHA.length - 1)) % ALPHA.length]; AU.sfx('menu'); }
    else if (k === 'left') E.pos = Math.max(0, E.pos - 1);
    else if (k === 'right') E.pos = Math.min(2, E.pos + 1);
    else if (k === 'back' || k === 'esc') { E.chars[E.pos] = ' '; E.pos = Math.max(0, E.pos - 1); AU.sfx('menu'); }
    else if (k === 'enter') { if (E.pos < 2) { E.pos++; AU.sfx('menu'); } else commitEntry(); }
    return;
  }
  if (k === 'enter' || k === 'space' || k === 'esc') {
    AU.sfx('select');
    const ranked = B.results.rank >= 0, diff = B.S.difficulty;
    toTitle();
    if (ranked) { B.menu = 'scores'; B.sel = 0; B.scoresTab = diff; }
  }
}

function typeLetter(ch) {
  const E = B.entry; if (!E) return;
  E.chars[E.pos] = ch; if (E.pos < 2) E.pos++;
  AU.sfx('menu');
}
function commitEntry() {
  const S = B.S, E = B.entry;
  const name = E.chars.join('').trim() || 'ACE';
  const row = { name, score: B.results.score, route: S.routeTaken.slice(), won: S.won, diff: S.difficulty, date: Date.now() };
  const bd = board(S.difficulty);
  bd.push(row);
  bd.sort((a, b) => b.score - a.score);
  BOARDS[S.difficulty] = bd.slice(0, 10);
  store.set('boards', BOARDS);
  store.set('name', E.chars);
  B.entry = null;
  AU.sfx('select');
}

// ---------------------------------------------------------------------------
// particles (screen space). kinds: dust smoke spark debris confetti streak
function emit(kind, x, y, n, o = {}) {
  if (B.parts.length > 420) return;
  for (let i = 0; i < n; i++) {
    const r = Math.random;
    const p = { kind, x: x + (r() - 0.5) * (o.spread || 0), y, vx: 0, vy: 0, life: 0, max: 1, size: 4, rot: r() * 6, vr: 0, col: o.col };
    if (kind === 'dust') { p.vx = (r() - 0.5) * 200 + (o.vx || 0); p.vy = 60 + r() * 120; p.max = 0.5 + r() * 0.4; p.size = 10 + r() * 16; }
    if (kind === 'smoke') { p.vx = (r() - 0.5) * 120 + (o.vx || 0); p.vy = 40 + r() * 60; p.max = 0.7 + r() * 0.5; p.size = 16 + r() * 18; }
    if (kind === 'spark') { const a = r() * Math.PI - Math.PI; p.vx = Math.cos(a) * (300 + r() * 500) + (o.vx || 0); p.vy = Math.sin(a) * (200 + r() * 300); p.max = 0.25 + r() * 0.35; p.size = 2 + r() * 2; }
    if (kind === 'debris') { p.vx = (r() - 0.5) * 900; p.vy = -300 - r() * 500; p.max = 1 + r() * 0.6; p.size = 6 + r() * 12; p.vr = (r() - 0.5) * 20; }
    if (kind === 'confetti') { p.x = r() * W; p.y = -20 - r() * 200; p.vx = (r() - 0.5) * 80; p.vy = 120 + r() * 160; p.max = 4 + r() * 2; p.size = 6 + r() * 6; p.vr = (r() - 0.5) * 12; p.col = ['#ffd84a', '#ff5a4a', '#4ac8ff', '#ffffff', '#7ce88a'][i % 5]; }
    B.parts.push(p);
  }
}
function stepParticles(dt) {
  const out = [];
  for (const p of B.parts) {
    p.life += dt;
    if (p.life >= p.max) continue;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.kind === 'debris') p.vy += 1600 * dt;
    if (p.kind === 'spark') p.vy += 900 * dt;
    if (p.kind === 'dust' || p.kind === 'smoke') { p.size += dt * 40; p.vx *= 0.97; }
    out.push(p);
  }
  B.parts = out;
}
// one soft puff per colour, rendered once and stamped: no gradients per particle
const puffs = new Map();
function puff(rgbStr) {
  let c = puffs.get(rgbStr);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgbStr},1)`); gr.addColorStop(1, `rgba(${rgbStr},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    puffs.set(rgbStr, c);
  }
  return c;
}
function drawParticles(layer) {
  for (const p of B.parts) {
    const a = 1 - p.life / p.max;
    if (layer === 'under' && p.kind !== 'dust' && p.kind !== 'smoke') continue;
    if (layer === 'over' && (p.kind === 'dust' || p.kind === 'smoke')) continue;
    if (p.kind === 'dust' || p.kind === 'smoke') {
      ctx.globalAlpha = 0.45 * a;
      ctx.drawImage(puff(p.col || (p.kind === 'dust' ? '210,188,150' : '236,236,240')), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(255,${200 + (a * 55) | 0},120,${a})`; ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = p.col || '#c82824';
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// score popups that rise off the car
function pop(text, col = '#ffffff', size = 28, big = false) {
  if (big) { B.pops = B.pops.filter((p) => !p.big); B.pops.push({ text, col, size, t: 0, x: W / 2, y: 220, big }); return; }
  B.popSlot = (B.popSlot + 1) % 4;
  B.pops.push({ text, col, size, t: 0, x: W / 2 + (B.popSlot % 2 ? 90 : -90), y: H * 0.6 - B.popSlot * 34 });
  if (B.pops.length > 6) B.pops.shift();
}

// ---------------------------------------------------------------------------
// update
const DT = 1 / 60;
function snapshot(S) {
  B.prev = S ? { S, key: S.stageKey, z: S.z, x: S.playerX, xOff: B.xOff, bg: B.bgCurve, wheel: B.wheel, cars: S.traffic, cz: S.traffic.map((c) => c.z), cl: S.traffic.map((c) => c.lane) } : null;
}
function update(dt) {
  pollGamepad();
  if (!storageOk && !B.storageToast) { B.storageToast = true; B.toast = { text: 'SAVING IS OFF IN THIS BROWSER — SCORES LAST THIS SESSION', t: 5 }; }
  if (B.toast && (B.toast.t -= dt) <= 0) B.toast = null;
  if (B.mode === 'title') {
    B.t += dt;
    if (!B.demo || B.demo.over) B.demo = newDemo();
    const S = B.demo;
    snapshot(S);
    const ev = C.stepRace(S, botInput(C, S, 0.9), dt);
    if (ev.some((e) => e.startsWith('checkpoint'))) S.time = 999;
    worldTick(S, dt, true);
    return;
  }
  if (B.mode === 'results') { B.t += dt; stepParticles(dt); snapshot(null); return; }
  if (B.paused) { snapshot(null); return; }
  const S = B.S;
  snapshot(S);
  // hit-stop: the world holds its breath for a few frames on impact
  if (B.hitstop > 0) { B.hitstop -= dt; return; }
  B.t += dt;

  if (B.end) {
    // outro: winner coasts under the arch with confetti; loser rolls to a stop
    B.end.t += dt;
    const brake = !B.end.won;
    S.speed = Math.max(0, S.speed - (brake ? 4200 : 1500) * dt);
    S.z += S.speed * dt;
    S.playerX += (0 - S.playerX) * dt * (B.end.won ? 0.8 : 0);
    if (B.end.won && B.end.t < 3 && Math.random() < 0.6) emit('confetti', 0, 0, 3);
    worldTick(S, dt, false);
    if (B.end.t > (B.end.won ? 3.2 : 2.4) && B.mode === 'race') {
      B.mode = 'results';
      if (B.results.rank >= 0) B.entry = { chars: loadName(), pos: 0 };
    }
    return;
  }

  const inp = readDriveInput();
  const prevX = S.playerX, prevKey = S.stageKey;
  const ev = C.stepRace(S, inp, dt);
  for (const e of ev) handleEvent(e, S, prevX, prevKey);

  // onboarding: nudge a stalled player toward the throttle
  if (!B.touch && !SET.autoGas && S.countdown <= 0 && S.speed < 600 && !inp.accel && !inp.brake && !S.wreck && !S.spin) B.noGasT += dt; else B.noGasT = 0;
  // low-time ticks
  if (S.time < 10 && !S.over) {
    const s = Math.ceil(S.time);
    if (s !== B.lastLowBeep) { B.lastLowBeep = s; AU.sfx('lowtime'); }
  }
  worldTick(S, dt, false);
}

function handleEvent(e, S, prevX, prevKey) {
  const [name, arg, arg2] = e.split(':');
  const n = Number(arg), side = Number(arg2) || 0;
  switch (name) {
    case 'count': AU.sfx('count'); break;
    case 'go': AU.sfx('go'); break;
    case 'recover': break;
    case 'driftstart': AU.sfx('driftstart'); break;
    case 'crash':
      AU.sfx('crash'); B.shake = Math.max(B.shake, 0.9); B.hitstop = 0.07; B.dip = 1;
      emit('spark', W / 2, H - 120, 18); emit('smoke', W / 2, H - 70, 8, { spread: 200 });
      pop('CRASH', '#ff6a4a', 52, true);
      break;
    case 'wreck':
      AU.sfx('wreck'); B.shake = 1; B.hitstop = 0.09; B.dip = 1;
      pop('WRECK!', '#ff6a4a', 60, true);
      emit('debris', W / 2, H - 140, 26); emit('spark', W / 2, H - 120, 26); emit('dust', W / 2, H - 60, 16, { spread: 300 });
      break;
    case 'bump':
      AU.sfx('bump'); B.shake = Math.max(B.shake, 0.4);
      emit('spark', W / 2 + (S.playerX > 0 ? -150 : 150), H - 110, 12);
      break;
    case 'scrape':
      if (Math.random() < 0.3) { AU.sfx('scrape'); emit('spark', W / 2 + (S.playerX > 0 ? -170 : 170), H - 80, 2); }
      break;
    case 'pass': AU.sfx('pass', side * 0.7); pop('+' + n, '#e8ecf4', 22); chainSfx(S); break;
    case 'near':
      AU.sfx('near', side * 0.8); pop('NEAR MISS +' + n, '#7ce8ff', 28); chainSfx(S);
      B.kick = 1;
      emit('spark', W / 2 + side * 170, H - 90, 3);
      break;
    case 'drift': AU.sfx('drift'); pop('DRIFT +' + n, '#ffd84a', 30); break;
    case 'slip': AU.sfx('slip'); pop('SLIPSTREAM', '#9fe0ff', 22); break;
    case 'sling': AU.sfx('pass', side * 0.8); AU.sfx('chain', 12); pop('SLINGSHOT +' + n, '#9fe0ff', 30); B.kick = 1; break;
    case 'chainend': if (S.chain >= 8) pop('CHAIN ' + S.chain, '#ffd84a', 24); break;
    case 'checkpoint': {
      AU.sfx('checkpoint');
      B.flash = SET.flashes ? 0.45 : 0;
      B.prevPal = prevKey; B.palBlend = 0;
      B.xOff = prevX - S.playerX;
      const add = Math.round(C.CHECKPOINT_TIME[S.stage.tier] * C.DIFFICULTY[S.difficulty].time);
      // split against this route's best: the ghost you're racing
      const best = loadSplits(S.difficulty);
      const prevKey2 = S.routeTaken[S.routeTaken.length - 2];
      const split = S.splits[S.splits.length - 1];
      let vs = '';
      if (best && Number.isFinite(best[prevKey2])) {
        const d = split - best[prevKey2];
        vs = ` · ${d <= 0 ? '▼' : '▲'} ${Math.abs(d).toFixed(2)}s vs BEST`;
      }
      B.banner = { text: STAGES[S.stageKey].name, sub: `STAGE ${S.stageNo}/5 · EXTENDED PLAY +${add}s${vs}`, t: 2.6, dur: 2.6 };
      break;
    }
    case 'goal':
      S.z += S.stage.length;          // keep rolling under the arch, not back at the start
      finishRace(true);
      break;
    case 'timeout':
      finishRace(false);
      break;
  }
}
function chainSfx(S) { if (S.chain > 1) AU.sfx('chain', Math.min(12, S.chain)); }

// shared per-tick presentation state for any race (player or attract demo)
function worldTick(S, dt, demo) {
  const seg = C.segmentAt(S.stage, Math.min(C.carZ(S), S.stage.length - 1));
  const frac = S.speed / CFG.maxSpeed;
  B.bgCurve += seg.curve * frac * dt * 14;
  B.wheel += S.speed * dt / 900;
  if (B.shake > 0) B.shake = Math.max(0, B.shake - dt * 1.4);
  if (B.kick > 0) B.kick = Math.max(0, B.kick - dt * 3);
  if (B.dip > 0) B.dip = Math.max(0, B.dip - dt * 6);
  if (B.fade > 0) B.fade = Math.max(0, B.fade - dt);
  B.towFov += ((S.tow > 0 ? 0.06 : 0) - B.towFov) * Math.min(1, dt * 4);
  if (B.flash > 0) B.flash = Math.max(0, B.flash - dt);
  B.xOff *= Math.exp(-dt * 3);
  if (B.palBlend < 1) B.palBlend = Math.min(1, B.palBlend + dt / 1.6);
  if (B.banner && !(S.countdown > 0)) { B.banner.t -= dt; if (B.banner.t <= 0) B.banner = null; }
  for (const p of B.pops) { p.t += dt; if (!p.big || p.t > 0.5) p.y -= 60 * dt; }
  B.pops = B.pops.filter((p) => p.t < 1.2);

  for (const c of S.traffic) if (c.hitT > 0) c.hitT -= dt;
  // the marshals' reset: start the fade before the snap, so it lands in the dark
  if (!demo && S.wreck > 0 && S.wreck <= 0.18 && !(B.fade > 0)) B.fade = 0.36;
  // particles from the tyres
  const offroad = Math.abs(S.playerX) > 1.02;
  const kerb = !offroad && Math.abs(S.playerX) > 0.9 && S.speed > 1500;
  B.kerb = kerb && !demo;
  const cx = W / 2;
  if (offroad && S.speed > 600) emit('dust', cx + (Math.random() < 0.5 ? -130 : 130), H - 40, 2, { vx: 0 });
  if (S.drift && S.speed > 2000) emit('smoke', cx + (Math.random() < 0.5 ? -130 : 130), H - 40, 2, { vx: -S.drift * 140 });
  if (!demo && S.wreck > 0 && Math.random() < 0.4) emit('smoke', cx, H - 120, 1, { spread: 80, col: '120,120,128' });
  stepParticles(dt);

  // speed lines stream out of the vanishing point
  if (SET.streaks && frac > 0.62 && !demo) {
    const n = S.tow > 0 ? 3 : frac > 0.9 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const left = Math.random() < 0.5;
      const a = (left ? Math.PI : 0) + (left ? -1 : 1) * (Math.random() * 0.5 - 0.15);
      B.streaks.push({ a, r: 380 + Math.random() * 120, v: 900 + Math.random() * 700, life: 0 });
    }
  }
  for (const s of B.streaks) { s.r += s.v * dt * (0.4 + s.r / 400); s.life += dt; }
  B.streaks = B.streaks.filter((s) => s.r < 900 && s.life < 1.2);

  // audio follows the car
  const gb = C.gearbox(S.speed);
  const seg2 = seg;
  const pullRatio = Math.abs(seg2.curve * CFG.centrifugal * frac * frac) / (CFG.steerSpeed * Math.max(0.2, frac));
  const squeal = S.drift ? 1 : S.spin > 0 ? 0.8 : (input.brake && frac > 0.3 ? 0.3 : Math.max(0, pullRatio - 0.8) * 2);
  if (demo || B.end) { AU.engineSilence(); AU.trafficHum([]); }
  else {
    // on the grid, the throttle revs the engine against the lights
    const grid = S.countdown > 0;
    B.rev = grid ? Math.max(0, Math.min(1, (B.rev || 0) + (held('up') || input.pad.gas ? 2.5 : -1.5) * dt)) : 0;
    AU.engineUpdate({
      // airborne in a wreck the wheels spin free and the engine screams
      active: B.mode === 'race' && !B.paused, rpm: grid ? 0.15 + B.rev * 0.75 : S.wreck > CFG.wreckTime - 0.6 ? 0.95 : gb.rpm, gear: grid ? 1 : gb.gear,
      throttle: grid ? (B.rev > 0.05 ? 1 : 0) : S.wreck > CFG.wreckTime - 0.6 ? 1 : S.wreck > 0 ? 0 : input.accel ? 1 : 0, frac, offroad, kerb, squeal: Math.min(1, squeal), dt,
    });
    // the nearest three cars hum in space: panned by lane, pitched by closing speed
    const cz = C.carZ(S), near = [];
    for (const c of S.traffic) {
      const g = c.z - cz;
      if (g > -CFG.segLen * 6 && g < CFG.segLen * 14) near.push({ c, g });
    }
    near.sort((a, b) => Math.abs(a.g) - Math.abs(b.g));
    // each voice keeps its car while that car stays near; free voices take the next nearest
    const keep = new Set(near.slice(0, 3).map((o) => o.c));
    B.humCars = (B.humCars || [null, null, null]).map((c) => (c && keep.has(c) ? c : null));
    for (const { c } of near) {
      if (B.humCars.includes(c)) continue;
      const free = B.humCars.indexOf(null);
      if (free < 0) break;
      B.humCars[free] = c;
    }
    const byCar = new Map(near.map((o) => [o.c, o.g]));
    AU.trafficHum(B.humCars.map((c) => (c ? { c, g: byCar.get(c) } : null)).map((o) => o && (({ c, g }) => ({
      gain: Math.max(0, 1 - Math.abs(g) / (CFG.segLen * 14)) * (c.truck ? 1.2 : 0.8),
      tone: c.truck ? 160 : 360,
      pan: Math.max(-1, Math.min(1, (c.lane - S.playerX) * 1.2)),
      // doppler: approaching (we close on it ahead) sounds higher, receding lower
      rate: (c.truck ? 0.6 : 1) * (1 + Math.sign(g) * Math.sign(S.speed - c.speed) * Math.min(0.25, Math.abs(S.speed - c.speed) / 40000)) * (0.7 + c.speed / CFG.maxSpeed),
    }))(o)));
  }
}

// ---------------------------------------------------------------------------
// drawing helpers
function poly(pts, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
function text(txt, x, y, size, color, align = 'left', o = {}) {
  size = Math.max(size, minText());
  ctx.font = `${o.italic === false ? '' : 'italic '}900 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (o.stroke !== false) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = o.strokeCol || '#0c1222'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); }
  ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
const UIFONT = FONT.replace("'Arial Black', ", '');
const minText = () => Math.max(12, 12 / Math.max(0.2, cssScale));   // ≥12 CSS px everywhere
function label(txt, x, y, size, color, align = 'left', outline = true) {
  size = Math.max(size, minText());
  ctx.font = `700 ${size}px ${UIFONT}`;
  ctx.textAlign = align;
  if (outline) { ctx.lineWidth = Math.max(2, size / 6); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,12,24,0.55)'; ctx.strokeText(txt, x, y); }
  ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function panel(x, y, w, h, a = 0.72, r = 14) {
  ctx.fillStyle = `rgba(10,14,28,${a})`;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; ctx.stroke();
}
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------------------
// background: sky, sun, clouds, far range, hills, city, sea.
// The sun sinks and swells stage by stage: drive west until it gives out.
function drawBackground(pal, horizonY, seed, stageNo, alpha = 1) {
  ctx.globalAlpha = alpha;
  const top = -40;
  const g = ctx.createLinearGradient(0, top, 0, horizonY + 60);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(0.6, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(-80, top, W + 160, horizonY + 60 - top);

  if (pal.stars) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      const sx = ((hash(i) * W * 1.5 - B.bgCurve * 0.2) % W + W) % W, sy = hash(i + 99) * horizonY * 0.7;
      ctx.globalAlpha = alpha * (0.3 + 0.7 * hash(i + 7)) * (0.7 + 0.3 * Math.sin(B.t * 2 + i));
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = alpha;
  }

  // banded sun, lower and larger through the run
  const R = 58 + stageNo * 26;
  const sunX = Math.max(W * 0.28, Math.min(W * 0.72, W * 0.6 - B.bgCurve * 1.6));
  const sunY = horizonY - 190 + stageNo * 40;
  const glow = ctx.createRadialGradient(sunX, sunY, R * 0.3, sunX, sunY, R * 3);
  glow.addColorStop(0, pal.sunGlow + 'bb'); glow.addColorStop(1, pal.sunGlow + '00');
  ctx.fillStyle = glow; ctx.fillRect(sunX - R * 3, sunY - R * 3, R * 6, R * 6);
  ctx.save();
  ctx.beginPath(); ctx.rect(-80, top, W + 160, horizonY - top); ctx.clip();
  ctx.beginPath(); ctx.arc(sunX, sunY, R, 0, Math.PI * 2); ctx.clip();
  const sg = ctx.createLinearGradient(0, sunY - R, 0, sunY + R);
  sg.addColorStop(0, pal.sun); sg.addColorStop(1, pal.sunGlow);
  ctx.fillStyle = sg; ctx.fillRect(sunX - R, sunY - R, R * 2, R * 2);
  // retro bands once the light turns golden: evenly spaced, thickening down
  ctx.fillStyle = pal.sky[2];
  const bands = pal.night || stageNo >= 3 ? 6 : 0;
  for (let i = 0; i < bands; i++) {
    const by = sunY + R * (0.05 + i * 0.16);
    ctx.fillRect(sunX - R, by, R * 2, 2 + i * 2.2);
  }
  ctx.restore();

  // clouds
  const cr = C.makeRng(7 + (seed || 0));
  ctx.fillStyle = pal.cloud + 'c8';
  for (let i = 0; i < 7; i++) {
    const cx = ((cr() * 1.6 * W - B.bgCurve * (0.5 + cr() * 0.4) - B.t * 4) % (W + 300) + W + 300) % (W + 300) - 150;
    const cy = 30 + cr() * (horizonY * 0.42);
    const s = 26 + cr() * 62;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * (0.24 + cr() * 0.14), 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * (0.5 + cr() * 0.3), cy + 4, s * 0.7, s * 0.24, 0, 0, Math.PI * 2);
    if (cr() < 0.5) ctx.ellipse(cx - s * 0.55, cy + 6, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // far range: peaks, mesas, volcano, or rolling ridges
  const far = mixHex(pal.far, pal.sky[2], 0.3);
  ctx.fillStyle = far;
  ctx.beginPath(); ctx.moveTo(-80, horizonY + 1);
  for (let x = -80; x <= W + 80; x += 12) {
    const wx = x + B.bgCurve * 0.5 + (seed || 0) * 31;
    let h;
    if (pal.peaks) h = Math.abs(Math.sin(wx * 0.006)) * 90 + Math.abs(Math.sin(wx * 0.017 + 1)) * 30 + 20;
    else if (pal.mesa) h = (Math.sin(wx * 0.004) > 0.3 ? 70 : 20) + Math.sin(wx * 0.02) * 4;
    else h = Math.sin(wx * 0.003) * 30 + Math.sin(wx * 0.009) * 14 + 34;
    ctx.lineTo(x, horizonY - h);
  }
  ctx.lineTo(W + 80, horizonY + 1); ctx.closePath(); ctx.fill();
  if (pal.snowcaps) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ffffffcc';
    ctx.fillRect(-80, horizonY - 200, W + 160, 125);
    ctx.restore();
  }
  if (pal.volcano) {
    const vx = ((W * 0.3 - B.bgCurve * 0.5) % (W + 600) + W + 600) % (W + 600) - 300;
    poly([[vx - 330, horizonY], [vx - 60, horizonY - 200], [vx + 60, horizonY - 200], [vx + 330, horizonY]], mixHex(pal.far, '#000000', 0.2));
    const lg = ctx.createRadialGradient(vx, horizonY - 200, 5, vx, horizonY - 200, 140);
    lg.addColorStop(0, 'rgba(255,120,40,0.7)'); lg.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = lg; ctx.fillRect(vx - 140, horizonY - 340, 280, 280);
    ctx.fillStyle = 'rgba(40,24,24,0.5)';
    for (let i = 0; i < 5; i++) {
      const pr = (B.t * 0.08 + i / 5) % 1;
      ctx.beginPath(); ctx.arc(vx + Math.sin(i * 3) * 30 + pr * 80, horizonY - 220 - pr * 200, 30 + pr * 60, 0, 6.3); ctx.fill();
    }
  }

  // near hills
  ctx.fillStyle = mixHex(pal.hills[0], pal.sky[2], 0.12);
  ctx.beginPath(); ctx.moveTo(-80, horizonY + 1);
  for (let x = -80; x <= W + 80; x += 14) {
    const wx = x + B.bgCurve * 1.1 + (seed || 0) * 37;
    const h1 = Math.sin(wx * 0.005 + 9) * 22 + Math.sin(wx * 0.013 + 4) * 12 + 14;
    ctx.lineTo(x, horizonY - Math.max(0, h1));
  }
  ctx.lineTo(W + 80, horizonY + 1); ctx.closePath(); ctx.fill();

  // treeline silhouettes on the nearest layer
  if (pal.treeline) {
    ctx.fillStyle = pal.treeline;
    for (let x = -80; x <= W + 80; x += 9) {
      const wx = x + B.bgCurve * 1.7 + (seed || 0) * 13;
      const h = 6 + hash(Math.floor(wx / 9)) * 16;
      if (hash(Math.floor(wx / 9) + 3) < 0.7) poly([[x - 6, horizonY + 1], [x, horizonY - h], [x + 6, horizonY + 1]], pal.treeline);
    }
  }

  // city skyline: two overlapping silhouette bands
  if (pal.city) {
    const layers = [
      { col: mixHex(pal.far, '#000000', 0.1), par: 0.7, base: 4, hMin: 26, hMax: 96, w: 46, win: false },
      { col: mixHex(pal.hills[1], '#000000', 0.2), par: 1.3, base: 6, hMin: 18, hMax: 130, w: 34, win: true },
    ];
    for (const L of layers) {
      const rr = C.makeRng(500 + L.par * 100);
      const off = ((B.bgCurve * L.par) % (W + 200) + W + 200) % (W + 200);
      ctx.fillStyle = L.col;
      let x = -200 - off;
      const towers = [];
      while (x < W + 200) {
        const tw = L.w * (0.7 + rr() * 0.9);
        const th = L.hMin + rr() * (L.hMax - L.hMin);
        towers.push([x, tw, th, rr()]);
        ctx.fillRect(x, horizonY + L.base - th, tw, th);
        x += tw * (0.72 + rr() * 0.4);
      }
      if (L.win) {
        ctx.fillStyle = '#ffd870';
        for (const [tx, tw, th, v] of towers) {
          let r = Math.floor(v * 9973) | 1;
          for (let wy = 10; wy < th - 6; wy += 12) {
            for (let wx2 = 4; wx2 < tw - 4; wx2 += 9) {
              r = (r * 16807) % 2147483647;
              if (r % 100 < 30) ctx.fillRect(tx + wx2, horizonY + L.base - th + wy, 3, 5);
            }
          }
        }
      }
    }
  }

  // sea band with shimmer
  if (pal.sea) {
    const sg2 = ctx.createLinearGradient(0, horizonY, 0, horizonY + 44);
    sg2.addColorStop(0, pal.sea[0]); sg2.addColorStop(1, pal.sea[1]);
    ctx.fillStyle = sg2; ctx.fillRect(-80, horizonY, W + 160, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const sr = C.makeRng(11);
    for (let i = 0; i < 30; i++) {
      const sx = ((sr() * W * 1.4 - B.bgCurve * 1.2 + Math.sin(B.t + i) * 6) % (W + 100) + W + 100) % (W + 100) - 50;
      ctx.fillRect(sx, horizonY + 4 + sr() * 36, 14 + sr() * 40, 2);
    }
    // sun glitter under the disc
    ctx.fillStyle = pal.sun + '88';
    for (let i = 0; i < 8; i++) ctx.fillRect(sunX - R * 0.6 + hash(i + Math.floor(B.t * 6)) * R * 1.2, horizonY + 3 + i * 5, 20 + hash(i) * R * 0.6, 2);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// road renderer — segmented projection with hills, curves, fog, and the
// next stage's opening already visible beyond the fork.
const nextStageCache = new Map();
function stageFor(key) {
  if (!nextStageCache.has(key)) nextStageCache.set(key, C.buildStage(key));
  return nextStageCache.get(key);
}
const rows = new Array(CFG.drawDist + 1);
const carBuckets = new Map();

function drawWorld(S, o = {}) {
  const palKey = S.stageKey;
  const pal = PAL[palKey];
  const lut = fogLUT(palKey);
  const segs = S.stage.segments;
  const N = segs.length;
  const kids = STAGE_TREE[S.stageKey];
  const beyond = kids ? stageFor(kids[S.playerX < 0 ? 'L' : 'R']).segments : null;
  const segAt = (i) => (i < N ? segs[i] : beyond ? beyond[(i - N) % beyond.length] : segs[N - 1]);
  const yAt = (i) => (i < N ? segs[i].y : segs[N - 1].y + (beyond ? beyond[(i - N) % beyond.length].y : 0));

  const frac = S.speed / CFG.maxSpeed;
  const baseIdx = Math.floor(S.z / CFG.segLen);
  const basePct = (S.z % CFG.segLen) / CFG.segLen;
  const baseSeg = segAt(baseIdx);
  const playerY = yAt(baseIdx) + (yAt(baseIdx + 1) - yAt(baseIdx)) * basePct;
  const camY = playerY + CFG.cameraHeight;
  const camX = (S.playerX + B.xOff) * CFG.roadWidth;
  // FOV opens up with speed and kicks wider on a near miss
  const depth = C.CAM_DEPTH * (1 - 0.1 * frac - 0.05 * B.kick - B.towFov);

  // camera roll into the bend, trauma shake (squared, layered sines ≈ noise)
  ctx.save();
  const cam = SET.shake && !o.noShake;
  const roll = !cam || o.noRoll ? 0 : -baseSeg.curve * frac * 0.006 - (S.steerV || 0) * frac * 0.006;
  const tr = cam ? Math.max(B.shake * B.shake, B.shake * 0.4) : 0;
  const buzz = cam && B.kerb ? Math.sin(B.t * 125) * 3.5 : 0;
  const nx = Math.sin(B.t * 97) + Math.sin(B.t * 61 + 1.3) * 0.6 + Math.sin(B.t * 151 + 2.1) * 0.3;
  const ny = Math.sin(B.t * 83 + 0.7) + Math.sin(B.t * 53 + 2.9) * 0.6 + Math.sin(B.t * 139) * 0.3;
  ctx.translate(W / 2 + nx * 26 * tr, H / 2 + ny * 18 * tr + buzz + B.dip * 14);
  ctx.rotate(roll + Math.sin(B.t * 71) * 0.035 * tr);
  ctx.translate(-W / 2, -H / 2);

  const farP = C.project(camX, playerY, S.z + CFG.drawDist * CFG.segLen * 0.9, camX, camY, S.z, W, H, depth);
  const horizonY = Math.min(H - 80, Math.max(120, farP.y));
  drawBackground(pal, horizonY, S.stage.def.seed, S.stageNo);
  if (B.prevPal && B.palBlend < 1) drawBackground(PAL[B.prevPal], horizonY, STAGES[B.prevPal].seed, S.stageNo - 1, 1 - B.palBlend);

  ctx.fillStyle = lut.grass[0][FOG_STEPS];
  ctx.fillRect(-80, horizonY + (pal.sea ? 44 : 0), W + 160, H - horizonY + 80);
  const hz = ctx.createLinearGradient(0, horizonY - 30, 0, horizonY + 40);
  hz.addColorStop(0, pal.fog + '00'); hz.addColorStop(0.5, pal.fog + '66'); hz.addColorStop(1, pal.fog + '00');
  ctx.fillStyle = hz; ctx.fillRect(-80, horizonY - 30, W + 160, 70);

  // traffic by segment so the sprite pass is O(rows + cars)
  carBuckets.clear();
  for (const c of S.traffic) {
    const i = Math.floor(c.z / CFG.segLen);
    let arr = carBuckets.get(i);
    if (!arr) { arr = []; carBuckets.set(i, arr); }
    arr.push(c);
  }

  let x = 0, dx = -(baseSeg.curve * basePct);
  let maxY = H + 60;
  let prev = null;
  const forkStartIdx = N - CFG.forkSegs;
  for (let n = 0; n < CFG.drawDist; n++) {
    const idx = baseIdx + n;
    const seg = segAt(idx);
    const segZ = idx * CFG.segLen;
    const p = C.project(0, yAt(idx), segZ, camX - x, camY, S.z, W, H, depth);
    x += dx; dx += seg.curve;
    const row = rows[n] || (rows[n] = {});
    row.p = p; row.idx = idx; row.seg = seg; row.clip = maxY; row.n = n;
    if (!prev) { prev = p; row.vis = false; continue; }
    if (p.y >= maxY || p.y >= prev.y) { prev = p; row.vis = true; continue; }
    row.vis = true;

    // light/dark banding fades out with distance so it can't moiré
    const light = n > 90 || Math.floor(idx / CFG.rumbleLen) % 2 === 0 ? 0 : 1;
    const fi = Math.min(FOG_STEPS, Math.round(Math.min(1, Math.pow(n / CFG.drawDist, 2) * CFG.fogDensity * (pal.fogK || 1) / 3) * FOG_STEPS));
    ctx.fillStyle = lut.grass[light][fi];
    ctx.fillRect(-80, p.y - 0.5, W + 160, prev.y - p.y + 0.5);
    // bands overlap their neighbours by a fraction of a pixel both ways, so
    // antialiased edges land on tarmac, never on grass: no seams
    const py = p.y - 0.6, qy = prev.y + 0.6;
    const rw1 = prev.w * 1.14, rw2 = p.w * 1.14;
    // far away the kerb stripes alias into noise: melt them into the tarmac
    const tiny = p.w < 9;
    poly([[prev.x - rw1, prev.y], [prev.x + rw1, prev.y], [p.x + rw2, py], [p.x - rw2, py]], tiny ? lut.road[0][fi] : lut.rumble[light][fi]);
    poly([[prev.x - prev.w, qy], [prev.x + prev.w, qy], [p.x + p.w, py], [p.x - p.w, py]], lut.road[tiny ? 0 : light][fi]);
    if (!light && p.w > 10) {
      const lc = lut.lane[fi];
      for (let l = 1; l < CFG.lanes; l++) {
        const t1 = -1 + 2 * l / CFG.lanes, lw1 = prev.w * 0.016 + 0.6, lw2 = p.w * 0.016 + 0.6;
        poly([[prev.x + prev.w * t1 - lw1, prev.y], [prev.x + prev.w * t1 + lw1, prev.y],
              [p.x + p.w * t1 + lw2, p.y], [p.x + p.w * t1 - lw2, p.y]], lc);
      }
    }
    // fork: a kerbed island grows until the road properly splits
    if (idx < N && seg.fork && kids) {
      const into = (idx - forkStartIdx) / CFG.forkSegs;
      const hw = C.islandHalf(into) / 1.12;
      if (hw > 0) {
        const intoP = (idx - 1 - forkStartIdx) / CFG.forkSegs;
        const hwP = C.islandHalf(Math.max(0, intoP)) / 1.12;
        const m1 = prev.w * hwP, m2 = p.w * hw;
        poly([[prev.x - m1 * 1.12, prev.y], [prev.x + m1 * 1.12, prev.y], [p.x + m2 * 1.12, p.y], [p.x - m2 * 1.12, p.y]], lut.rumble[light][fi]);
        if (m2 > 0.5) poly([[prev.x - m1, prev.y], [prev.x + m1, prev.y], [p.x + m2, p.y], [p.x - m2, p.y]], lut.island[fi]);
      }
    }
    maxY = p.y;
    prev = p;
  }

  // near-field ground shading
  const fgg = ctx.createLinearGradient(0, H * 0.74, 0, H);
  fgg.addColorStop(0, 'rgba(18,20,28,0)'); fgg.addColorStop(1, `rgba(18,20,28,${0.16 + (pal.night || 0) * 0.3})`);
  ctx.fillStyle = fgg; ctx.fillRect(-80, H * 0.74, W + 160, H * 0.26 + 80);

  // headlight pool at night
  if ((pal.night || 0) > 0.4 && !o.noCar) {
    const hl = ctx.createRadialGradient(W / 2, H * 0.72, 20, W / 2, H * 0.72, 380);
    hl.addColorStop(0, `rgba(255,244,210,${0.16 * pal.night})`); hl.addColorStop(1, 'rgba(255,244,210,0)');
    ctx.fillStyle = hl; ctx.fillRect(W / 2 - 400, H * 0.45, 800, H * 0.55);
  }

  // speed lines out of the vanishing point, under every sprite
  if (B.streaks.length && !o.noCar) {
    const vx = W / 2, vy = horizonY + 30;
    ctx.lineWidth = 2;
    for (const s of B.streaks) {
      const a = Math.min(1, s.life * 4) * Math.max(0, 1 - s.r / 900) * 0.45;
      const ca = Math.cos(s.a), sa = Math.abs(Math.sin(s.a)) + 0.12;
      ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(vx + ca * s.r, vy + sa * s.r * 0.5);
      ctx.lineTo(vx + ca * (s.r + 60 + s.r * 0.2), vy + sa * (s.r + 60 + s.r * 0.2) * 0.5);
      ctx.stroke();
    }
  }

  // sprites and traffic, back to front — the player car slots in at its own
  // depth, so anything between it and the lens is drawn over it
  const night = pal.night || 0;
  const carN = Math.floor(C.PLAYER_Z / CFG.segLen + basePct);
  let carDrawn = !!o.noCar;
  // the screen row where the car's own z projects (hills and FOV move it)
  const cr = rows[carN], cr2 = rows[carN + 1];
  const carFrac = (C.PLAYER_Z / CFG.segLen + basePct) - carN;
  const carY = cr && cr2 && cr.p && cr2.p ? Math.max(H - 90, Math.min(H - 46, cr.p.y + (cr2.p.y - cr.p.y) * carFrac)) : H - 50;
  const drawCar = () => {
    carDrawn = true;
    drawParticles('under');
    const bounce = Math.sin(B.wheel * 3) * frac * 3 + (Math.abs(S.playerX) > 0.9 ? Math.sin(B.t * 47) * 3 * frac : 0);
    const steerPose = S.spin > 0 || S.wreck > 0 ? 0 : (S.steerV || 0);
    drawPlayerCar(ctx, W / 2 + (S.drift || 0) * 26, carY + bounce, 0.62, {
      steer: steerPose, braking: o.braking, spin: S.spin, spinMax: S.spinMax || CFG.spinTime, frac, night, wheel: B.wheel, drift: S.drift || 0,
      wreck: S.wreck > 0 ? 1 - S.wreck / CFG.wreckTime : 0, side: S.wreckSide,
    });
    drawParticles('over');
  };
  const pzNow = C.carZ(S);
  for (let n = CFG.drawDist - 1; n > 0; n--) {
    if (n === carN && !carDrawn) {
      // cars in the player's own segment but ahead of the car sit behind it
      const row = rows[n], cars = row && row.idx < N ? carBuckets.get(row.idx) : null;
      if (cars && row.vis) {
        for (const c of cars) if (c.z >= pzNow) drawTrafficCar(ctx, row.p.x + row.p.w * c.lane, row.p.y, row.p.w / 1500, c, B.t, (pal.night || 0) > 0.3);
        carBuckets.set(row.idx, cars.filter((c) => c.z < pzNow));
      }
      drawCar();
    }
    const row = rows[n];
    if (!row || !row.vis) continue;
    const seg = row.seg;
    const cars = row.idx < N ? carBuckets.get(row.idx) : null;
    if (!seg.sprites.length && !cars) continue;
    const fogT = Math.min(1, Math.pow(n / CFG.drawDist, 2) * CFG.fogDensity / 3);
    if (fogT > 0.95) continue;
    const clipped = row.clip < H;
    if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(-80, -80, W + 160, row.clip + 80); ctx.clip(); }
    // fade sprites in from the fog and out right at the lens
    const near = Math.min(1, (n - 1) / 4);
    for (const sp of seg.sprites) {
      const sc = row.p.w / 660;
      ctx.globalAlpha = (1 - fogT * 0.9) * (sp.kind === 'gantry' || sp.kind === 'goalarch' ? 1 : near);
      if (ctx.globalAlpha <= 0.02) continue;
      if (sp.kind === 'gantry') {
        if (!kids) continue;
        drawSprite(ctx, 'gantry', row.p.x, row.p.y, row.p.w / 2100, 0, 0, pal, B.t,
          { L: STAGES[kids.L].name.split(' ')[0], R: STAGES[kids.R].name.split(' ')[0] });
      } else if (sp.kind === 'goalarch') {
        drawSprite(ctx, 'goalarch', row.p.x, row.p.y, row.p.w / 2100, 0, 0, pal, B.t);
      } else if (sp.kind === 'divider') {
        const tip = row.idx < forkStartIdx + 80;
        drawSprite(ctx, tip ? 'chevron' : 'divider', row.p.x, row.p.y, row.p.w / (tip ? 900 : 1100), 0, 0, pal, B.t);
      } else {
        const sx = row.p.x + row.p.w * sp.off;
        if (sx < -400 * sc - 100 || sx > W + 400 * sc + 100) continue;
        if (sp.down) continue;           // knocked clear by the wreck
        drawSprite(ctx, sp.kind, sx, row.p.y, sc, sp.v || 0, Math.sign(sp.off), pal, B.t, sp.kind === 'sign' ? sp.dir : sp.n);
      }
    }
    if (cars) {
      ctx.globalAlpha = 1 - fogT * 0.85;
      for (const c of cars) {
        const cx2 = row.p.x + row.p.w * c.lane;
        if (c.hitT > 0) {
          // just been hit: a twitch of yaw and the hazards on
          ctx.save(); ctx.translate(cx2, row.p.y); ctx.rotate(Math.sin(c.hitT * 20) * 0.12 * c.hitT); ctx.translate(-cx2, -row.p.y);
          drawTrafficCar(ctx, cx2, row.p.y, row.p.w / 1500, Object.assign(Object.create(c), { blink: Math.floor(B.t * 6) % 2 ? 1 : 0, target: c.laneIdx + 1 }), B.t, night > 0.3);
          ctx.restore();
        } else drawTrafficCar(ctx, cx2, row.p.y, row.p.w / 1500, c, B.t, night > 0.3);
      }
    }
    ctx.globalAlpha = 1;
    if (clipped) ctx.restore();
  }

  if (!carDrawn) drawCar();

  // weather in the air, over the world
  if (pal.weather) {
    const snow = pal.weather === 'snow';
    ctx.fillStyle = snow ? 'rgba(255,255,255,0.85)' : 'rgba(60,50,50,0.55)';
    for (let i = 0; i < 70; i++) {
      const sp = 60 + hash(i) * 90;
      const px = ((hash(i + 3) * W + B.t * (snow ? 20 : -30) * (1 + hash(i)) - B.bgCurve * 2 * hash(i + 5)) % W + W) % W;
      const py = ((hash(i + 9) * H + B.t * sp * (1 + frac)) % H);
      const s = 1.5 + hash(i + 1) * (snow ? 3 : 2);
      ctx.fillRect(px, py, s, s);
    }
  }
  ctx.restore();
  return horizonY;
}

// ---------------------------------------------------------------------------
// HUD
function drawHUD(S) {
  const g = ctx.createLinearGradient(0, 0, 0, 130);
  g.addColorStop(0, 'rgba(8,10,20,0.62)'); g.addColorStop(1, 'rgba(8,10,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 130);

  // time owns the screen: biggest element, red panic under 10s
  const low = S.time < 10;
  const pulse = low ? 1 + Math.max(0, Math.sin(B.t * Math.PI * 2)) * 0.08 : 1;
  label('TIME', W / 2, 24, 16, '#c3d2e8', 'center');
  text(String(Math.ceil(S.time)), W / 2, 86, Math.round(62 * pulse), low ? '#ff3a40' : '#ffd84a', 'center');

  // left: stage, name, progress
  const lx = B.touch ? 104 : 32;
  label(`STAGE ${S.stageNo}/5`, lx, 24, 16, '#c3d2e8');
  text(STAGES[S.stageKey].name, lx, 58, 26, '#f4f6fa');
  const prog = Math.min(1, S.z / S.stage.length);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(lx, 70, 250, 6);
  ctx.fillStyle = '#ffd84a'; ctx.fillRect(lx, 70, 250 * prog, 6);
  for (let i = 1; i < 5; i++) { ctx.fillStyle = i < S.stageNo ? '#ffd84a' : 'rgba(255,255,255,0.3)'; ctx.fillRect(lx + (i - 1) * 16, 84, 12, 4); }
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(lx + 64, 84, 12, 4);
  ctx.fillStyle = '#ffd84a'; ctx.fillRect(lx + (S.stageNo - 1) * 16, 84, 12 * Math.max(0.25, prog), 4);

  // right: score and lap
  label('SCORE', W - 32, 24, 16, '#c3d2e8', 'right');
  text(String(Math.floor(S.score)).padStart(7, '0'), W - 32, 58, 30, '#f4f6fa', 'right');
  label('LAP ' + fmtTime(S.stageT), W - 32, 84, 16, '#c3d2e8', 'right');

  // speed cluster: tacho arc, gear, km/h — dims while the car is out of control
  const cx = W - 140, cy = H - 70;
  ctx.globalAlpha = S.wreck > 0 || S.spin > 0.4 ? 0.45 : 1;
  const sg = ctx.createRadialGradient(cx, cy, 30, cx, cy, 150);
  sg.addColorStop(0, 'rgba(8,10,20,0.5)'); sg.addColorStop(1, 'rgba(8,10,20,0)');
  ctx.fillStyle = sg; ctx.fillRect(cx - 150, cy - 150, 300, 300);
  const gb = C.gearbox(S.speed);
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
  ctx.lineCap = 'round';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.arc(cx, cy, 92, a0, a1); ctx.stroke();
  const rpmA = a0 + (a1 - a0) * gb.rpm;
  ctx.strokeStyle = gb.rpm > 0.9 ? '#ff4a40' : '#ffd84a';
  ctx.beginPath(); ctx.arc(cx, cy, 92, a0, rpmA); ctx.stroke();
  ctx.lineCap = 'butt';
  text(String(C.kmh(S.speed)), cx + 30, cy + 18, 54, '#f4f6fa', 'right');
  label('KM/H', cx + 38, cy + 16, 16, '#c3d2e8');
  label('GEAR', cx - 2, cy - 36, 13, '#c3d2e8', 'center');
  text(String(gb.gear), cx + 46, cy - 30, 30, '#ffd84a', 'center');
  ctx.globalAlpha = 1;

  // chain / combo meter, bottom-left above the touch pads
  const by = B.touch ? 150 : H - 64, bx = B.touch ? lx - 16 : 28;
  if (S.chain > 0) {
    const mult = C.comboMult(S);
    const next = CFG.chainStep - (S.chain % CFG.chainStep);
    const chainTxt = mult < CFG.chainCap ? `CHAIN ${S.chain} · x${mult + 1} IN ${next}` : `CHAIN ${S.chain} · MAX`;
    ctx.font = `700 ${Math.max(15, minText())}px ${UIFONT}`;
    const cw2 = Math.max(150, ctx.measureText(chainTxt).width);
    panel(bx, by - 42, cw2 + 100, 60, 0.5, 10);
    text('x' + mult, bx + 16, by + 2, 34, mult > 1 ? '#ffd84a' : '#ffffff');
    label(chainTxt, bx + 82, by - 12, 15, '#e8ecf4');
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(bx + 82, by - 2, 150, 6);
    ctx.fillStyle = '#7ce8ff'; ctx.fillRect(bx + 82, by - 2, 150 * S.chainT / CFG.chainWindow, 6);
  }
  if (S.tow > 0) label('» SLIPSTREAM — PASS IT FOR A SLINGSHOT «', W / 2, H * 0.5 + 34, 18, '#9fe0ff', 'center');
  else if (S.slip > 0) {
    // the wake building: a small meter under the car's roof line
    const f = Math.min(1, S.slip / CFG.slipTime);
    panel(W / 2 - 80, H * 0.5 + 14, 160, 30, 0.6, 8);
    label('WAKE', W / 2 - 70, H * 0.5 + 34, 12, '#9fe0ff');
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(W / 2 - 24, H * 0.5 + 24, 96, 8);
    ctx.fillStyle = '#9fe0ff'; ctx.fillRect(W / 2 - 24, H * 0.5 + 24, 96 * f, 8);
  }
  // live drift counter and slipstream tag, centred above the car
  if (S.drift) {
    if (S.driftPts > 0) text('DRIFT ' + Math.round(S.driftPts / 10) * 10 + (S.driftPasses ? ' +' + S.driftPasses + ' PASS' : ''), W / 2, 176, 30, '#ffd84a', 'center');
    else label('DRIFT — HOLD IT INTO A BEND', W / 2, 176, 18, '#ffd84a', 'center');
  }

  // start lights
  if (S.countdown > 0 || S.totalT < 0.8) {
    const lit = S.countdown > 0 ? 3 - Math.ceil(S.countdown) + 1 : 4;
    panel(W / 2 - 120, 118, 240, 76, 0.75, 38);
    for (let i = 0; i < 3; i++) {
      const on = lit > i;
      const green = lit === 4;
      ctx.fillStyle = green ? '#3cff6a' : on ? '#ff3a30' : '#3a2a2a';
      ctx.beginPath(); ctx.arc(W / 2 - 72 + i * 72, 156, 24, 0, 6.3); ctx.fill();
      if (on || green) { ctx.fillStyle = green ? 'rgba(60,255,106,0.25)' : 'rgba(255,60,48,0.25)'; ctx.beginPath(); ctx.arc(W / 2 - 72 + i * 72, 156, 36, 0, 6.3); ctx.fill(); }
    }
    if (S.countdown > 0) {
      const hint = SET.autoGas || B.touch ? (B.touch ? 'HOLD ◄ ► TO STEER · BRAKE PAD TO SLOW' : '◄ ► STEER · ▼ BRAKE') : 'HOLD ▲ TO ACCELERATE · ◄ ► STEER · ▼ BRAKE';
      panel(W / 2 - 330, H * 0.36 - 30, 660, 46, 0.6, 10);
      label(hint, W / 2, H * 0.36, 18, '#ffffff', 'center');
    } else text('GO!', W / 2, H * 0.44, 96, '#3cff6a', 'center');
  }
  if (B.noGasT > 1.2 && !B.banner) {
    const a = 0.6 + 0.4 * Math.sin(B.t * 6);
    ctx.globalAlpha = a;
    text(B.touch ? 'TAP OPTIONS → THROTTLE AUTO' : 'HOLD ▲ OR W TO ACCELERATE', W / 2, H * 0.42, 34, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }

  // fork approach: a heads-up before the gantry, then the gantry speaks
  const kids = STAGE_TREE[S.stageKey];
  const forkStart = (S.stage.segments.length - CFG.forkSegs) * CFG.segLen;
  const toFork = forkStart - S.z;
  if (kids && toFork > 0 && toFork < CFG.segLen * 220) {
    const a = Math.min(1, (CFG.segLen * 220 - toFork) / (CFG.segLen * 30));
    ctx.globalAlpha = a;
    panel(W / 2 - 250, 104, 500, 44, 0.55, 10);
    label('ROUTE FORK AHEAD', W / 2, 132, 18, '#ffd84a', 'center');
    label('◄ ' + STAGES[kids.L].name, W / 2 - 238, 132, 14, '#ffffff', 'left');
    label(STAGES[kids.R].name + ' ►', W / 2 + 238, 132, 14, '#ffffff', 'right');
    ctx.globalAlpha = 1;
  }

  if (B.banner && !B.paused && !(S.countdown > 0) && S.totalT > 0.7) {
    const bn = B.banner;
    const a = Math.min(1, bn.t * 2, (bn.dur - bn.t) * 3);
    ctx.globalAlpha = Math.max(0, a);
    const yy = H * 0.24;
    const bg2 = ctx.createLinearGradient(0, 0, W, 0);
    bg2.addColorStop(0, 'rgba(8,12,24,0)'); bg2.addColorStop(0.25, 'rgba(8,12,24,0.6)'); bg2.addColorStop(0.75, 'rgba(8,12,24,0.6)'); bg2.addColorStop(1, 'rgba(8,12,24,0)');
    ctx.fillStyle = bg2; ctx.fillRect(0, yy, W, 104);
    text(bn.text, W / 2, yy + 60, 52, '#ffd84a', 'center');
    if (bn.sub) label(bn.sub, W / 2, yy + 90, 20, '#e8ecf4', 'center');
    ctx.globalAlpha = 1;
  }
  for (const p of B.pops) {
    ctx.globalAlpha = Math.min(1, (1.2 - p.t) * 3);
    const k = 1 + Math.max(0, 0.12 - p.t) / 0.12 * 0.6;        // punch in from 1.6x
    text(p.text, p.x, p.y, Math.round(p.size * k), p.col, 'center');
  }
  ctx.globalAlpha = 1;

  if (B.touch) drawTouchPads();
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${m}'${String(s).padStart(2, '0')}"${String(cs).padStart(2, '0')}`;
}
function drawTouchPads() {
  const held = new Set(input.touch.values());
  for (const [name, r] of Object.entries(PADS)) {
    ctx.fillStyle = held.has(name) ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    const mx = r.x + r.w / 2, my = r.y + r.h / 2;
    if (name === 'left' || name === 'right') {
      const d = name === 'left' ? -1 : 1;
      poly([[mx + d * 34, my], [mx - d * 22, my - 36], [mx - d * 22, my + 36]], 'rgba(255,255,255,0.85)');
    } else if (name === 'pause') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(mx - 11, my - 13, 8, 26); ctx.fillRect(mx + 3, my - 13, 8, 26);
    } else label(r.label, mx, my + 8, 22, 'rgba(255,255,255,0.85)', 'center');
  }
}

// route pyramid: every stage as a node, the run's path lit up
function drawRouteMap(x, y, w, h, route, splits, deltas) {
  const pos = {};
  for (let t = 0; t < TIERS.length; t++) {
    TIERS[t].forEach((k, i) => {
      pos[k] = { x: x + w / 2 + (i - (TIERS[t].length - 1) / 2) * (w / 5), y: y + t * (h / 4.4) + 12 };
    });
  }
  ctx.lineWidth = 2;
  for (const [k, kids] of Object.entries(STAGE_TREE)) {
    if (!kids) continue;
    for (const c of [kids.L, kids.R]) {
      const on = route.includes(k) && route.includes(c) && route.indexOf(c) === route.indexOf(k) + 1;
      ctx.strokeStyle = on ? '#ffd84a' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = on ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(pos[k].x, pos[k].y); ctx.lineTo(pos[c].x, pos[c].y); ctx.stroke();
    }
  }
  for (const [k, p] of Object.entries(pos)) {
    const i = route.indexOf(k);
    const on = i >= 0;
    ctx.fillStyle = on ? PAL[k].sky[1] : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(p.x, p.y, on ? 9 : 6, 0, 6.3); ctx.fill();
    if (on) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.stroke(); }
    const compact = minText() > 13;
    if (compact && !on) continue;            // small screens: name only the road you drove
    const nm = STAGES[k].name.split(' ')[0];
    const stag = 0;
    ctx.font = `700 ${Math.max(on ? 13 : 12, minText())}px ${UIFONT}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(nm).width + 10;
    const hasSplit = on && splits && splits[i] !== undefined;
    ctx.fillStyle = on ? 'rgba(10,14,28,0.9)' : 'rgba(10,14,28,0.6)';
    const fs = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)[1]);
    ctx.beginPath(); ctx.roundRect(p.x - tw / 2, p.y + 12 + stag, tw, fs + 6, 4); ctx.fill();
    ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.42)';
    ctx.fillText(nm, p.x, p.y + 14 + fs + stag);
    if (hasSplit) {
      const d = deltas && deltas[k];
      ctx.fillStyle = d === undefined ? '#9fb4cc' : d <= 0 ? '#7ce88a' : '#ff9a7a';
      ctx.font = `700 ${Math.max(11, minText())}px ${UIFONT}`;
      ctx.textAlign = 'left';
      const tt = fmtTime(splits[i]), ttw = ctx.measureText(tt).width;
      const fillCol = ctx.fillStyle;
      ctx.fillStyle = 'rgba(10,14,28,0.9)'; ctx.fillRect(p.x + 11, p.y - 4 - fs, ttw + 6, fs + 5);
      ctx.fillStyle = fillCol;
      ctx.fillText(tt, p.x + 14, p.y - 4);
    }
  }
}

function drawPause() {
  ctx.fillStyle = 'rgba(6,8,16,0.6)'; ctx.fillRect(0, 0, W, H);
  panel(W / 2 - 230, H / 2 - 190, 460, 380, 0.94);
  text('PAUSED', W / 2, H / 2 - 120, 52, '#ffd84a', 'center');
  B.hits = [];
  PAUSE_ITEMS.forEach((it, i) => {
    const y = H / 2 - 50 + i * 64;
    const on = i === B.pauseSel;
    if (on) { ctx.fillStyle = 'rgba(255,216,74,0.16)'; ctx.beginPath(); ctx.roundRect(W / 2 - 190, y - 34, 380, 50, 10); ctx.fill(); }
    text(it, W / 2, y + 2, 30, on ? '#ffffff' : '#9fb4cc', 'center', { stroke: false });
    B.hits.push({ x: W / 2 - 190, y: y - 34, w: 380, h: 50, fn: () => pauseAct(i) });
  });
  label(B.touch || cssScale < 0.75 ? 'TAP RESUME TO KEEP DRIVING' : 'ESC / P  RESUME   ·   M  MUTE   ·   F  FULLSCREEN', W / 2, H / 2 + 166, 14, '#9fb4cc', 'center');
}

// ---------------------------------------------------------------------------
// title
function drawTitle() {
  const S = B.demo || (B.demo = newDemo());
  interpolated(S, () => drawWorld(S, { noShake: true }));
  // soft vignette so the menu reads over the live drive
  const v = ctx.createRadialGradient(W / 2, H * 0.45, 200, W / 2, H * 0.45, 800);
  v.addColorStop(0, 'rgba(6,8,18,0.05)'); v.addColorStop(1, 'rgba(6,8,18,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

  // chrome wordmark
  const cx = W / 2, ty = 140;
  ctx.save();
  try { ctx.letterSpacing = '6px'; } catch { /* old browsers */ }
  ctx.font = `italic 900 112px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,12,40,0.5)';
  ctx.fillText('SUNSTRIP', cx + 7, ty + 8);
  ctx.lineWidth = 16; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1030';
  ctx.strokeText('SUNSTRIP', cx, ty);
  const cg = ctx.createLinearGradient(0, ty - 88, 0, ty + 8);
  cg.addColorStop(0, '#eaf6ff'); cg.addColorStop(0.26, '#cfe8f8');
  cg.addColorStop(0.30, '#ffffff'); cg.addColorStop(0.35, '#9fc8e8');
  cg.addColorStop(0.52, '#5e98c0'); cg.addColorStop(0.525, '#ffd84a');
  cg.addColorStop(0.76, '#c05818'); cg.addColorStop(1, '#ffe8c0');
  ctx.fillStyle = cg;
  ctx.fillText('SUNSTRIP', cx, ty);
  ctx.restore();
  ctx.save();
  try { ctx.letterSpacing = '4px'; } catch { /* old browsers */ }
  ctx.shadowColor = 'rgba(16,24,40,0.8)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  label('DRIVE WEST UNTIL THE SUN GIVES OUT', cx, ty + 44, 18, '#ffffff', 'center');
  ctx.restore();

  B.hits = [];
  if (B.menu === 'main' || B.menu === 'options') drawMenu(B.menu === 'main' ? mainItems() : optionItems(), B.menu === 'options' ? 'OPTIONS' : null);
  else if (B.menu === 'scores') drawScores();
  else if (B.menu === 'help') drawHelp();

  // footer
  const csg = ctx.createLinearGradient(0, H - 50, 0, H);
  csg.addColorStop(0, 'rgba(8,10,20,0)'); csg.addColorStop(1, 'rgba(8,10,20,0.75)');
  ctx.fillStyle = csg; ctx.fillRect(0, H - 50, W, 50);
  const foot = B.touch ? 'TAP TO SELECT · ◄ ► ON AN ITEM TO CHANGE IT' : '▲ ▼ CHOOSE · ◄ ► CHANGE · ENTER SELECT · ESC BACK · M MUTE · F FULLSCREEN';
  ctx.font = `700 ${Math.max(14, minText())}px ${UIFONT}`;
  const fw = ctx.measureText(foot).width + 28;
  panel(cx - fw / 2, H - 38, fw, 30, 0.6, 8);
  label(foot, cx, H - 16, 14, '#dfe6f0', 'center');
  const bd = board();
  if (bd.length) label(`${C.DIFFICULTY[SET.difficulty].label} BEST ${String(bd[0].score).padStart(7, '0')} ${bd[0].name}`, W - 28, 36, 16, '#ffd84a', 'right');
}

function drawMenu(items, title) {
  const x = 56, w = 440, rowH = B.touch ? 52 : 42;
  const top = B.touch ? 206 : 222;
  panel(x, top - (title ? 56 : 16), w, items.length * rowH + (title ? 72 : 32), 0.84);
  if (title) text(title, x + w / 2, top - 14, 26, '#ffd84a', 'center');
  items.forEach((it, i) => {
    const y = top + i * rowH + 34;
    const on = i === B.sel;
    if (on) {
      ctx.fillStyle = 'rgba(255,216,74,0.16)';
      ctx.beginPath(); ctx.roundRect(x + 14, y - 34, w - 28, rowH - 4, 10); ctx.fill();
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(x + 14, y - 34, 5, rowH - 4);
    }
    const col = on ? '#ffffff' : '#b8c6d8';
    if (it.value !== undefined) {
      text(it.label, x + 40, y, 22, col, 'left', { stroke: false });
      text((on ? '◄ ' : '') + it.value + (on ? ' ►' : ''), x + w - 40, y, 22, on ? '#ffd84a' : '#ffd84acc', 'right', { stroke: false });
    } else {
      const hero = i === 0 && B.menu === 'main';
      text(it.label + (hero ? '  ►' : ''), x + 40, y, hero ? 30 : 22, hero ? (on ? '#ffd84a' : '#ffe9a0') : col, 'left', { stroke: false });
    }
    B.hits.push({
      x: x + 14, y: y - 34, w: w - 28, h: rowH - 4,
      fn: (p) => {
        AU.audioUnlock();
        B.sel = i;
        if (it.change) it.change(p.x < x + w / 2 ? -1 : 1);
        else if (it.act) { AU.sfx('select'); it.act(); }
      },
    });
  });
}

function drawScores() {
  panel(W / 2 - 330, 196, 660, 440, 0.8);
  text('HIGH SCORES', W / 2, 238, 30, '#ffd84a', 'center');
  const tab = B.scoresTab || SET.difficulty;
  DIFFS.forEach((d, i) => {
    const tx = W / 2 - 150 + i * 150, on = d === tab;
    ctx.fillStyle = on ? 'rgba(255,216,74,0.22)' : 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(tx - 64, 250, 128, 28, 8); ctx.fill();
    label(C.DIFFICULTY[d].label, tx, 270, 14, on ? '#ffd84a' : '#9fb4cc', 'center', false);
    B.hits.push({ x: tx - 64, y: 250, w: 128, h: 28, fn: () => { B.scoresTab = d; AU.sfx('menu'); } });
  });
  const rowsB = board(tab);
  if (!rowsB.length) label('NO RUNS YET — GO SET ONE', W / 2, 420, 20, '#9fb4cc', 'center');
  rowsB.forEach((s, i) => {
    const y = 306 + i * 28;
    const col = i === 0 ? '#ffd84a' : '#e8ecf4';
    label(String(i + 1).padStart(2, ' ') + '.', W / 2 - 290, y, 18, col);
    label(s.name, W / 2 - 240, y, 18, col);
    label(String(s.score).padStart(7, '0'), W / 2 - 110, y, 18, col);
    label((s.won ? '★ ' : '') + STAGES[s.route[s.route.length - 1]].name, W / 2 + 10, y, 14, '#9fb4cc');
    label(s.won ? 'GOAL' : 'STAGE ' + s.route.length, W / 2 + 290, y, 14, '#9fb4cc', 'right');
  });
  const md = Object.values(loadMedals(tab));
  label(`MEDALS ${md.filter((m) => m === 'GOLD').length}★ ${md.length}/16 ROUTES`, W / 2 + 300, 604, 13, '#ffd84a', 'right');
  label('◄ ► SWITCH MODE', W / 2 - 300, 604, 13, '#9fb4cc', 'left');
  backButton(604);
}
function drawHelp() {
  panel(W / 2 - 400, 196, 800, 444, 0.82);
  text('HOW TO PLAY', W / 2, 240, 30, '#ffd84a', 'center');
  const L = [
    ['BEAT THE CLOCK', 'Reach each checkpoint before time runs out. Five stages, fifteen routes.'],
    ['CHOOSE YOUR ROAD', 'Every stage ends in a fork. Keep left or right — right-hand roads pay more.'],
    ['DRIVE', (SET.autoGas ? 'Throttle is automatic. ' : '▲/W accelerate. ') + '◄ ► steer. ▼/SPACE brake. Gamepad and touch work too.'],
    ['LIFT IN THE BENDS', 'Tight corners out-pull your grip at top speed. Ease off or you run wide.'],
    ['DRIFT', 'Tap brake while turning hard at speed, hold the turn: keep speed, score points.'],
    ['CHAIN', 'Passes build a chain; close passes count double. Crashes break it. x8 max.'],
    ['SLIPSTREAM', 'Tuck in behind a car for a moment to get a tow past top speed.'],
    ['DON\'T HIT THE SCENERY', 'Palms, signs and rocks are solid. Hit one and you\'ll tumble.'],
  ];
  L.forEach(([h, d], i) => {
    const y = 286 + i * 40;
    label(h, W / 2 - 370, y, 16, '#ffd84a');
    label(d, W / 2 - 150, y, 15, '#e8ecf4');
  });
  backButton(604);
}
function backButton(y) {
  ctx.fillStyle = 'rgba(255,216,74,0.16)';
  ctx.beginPath(); ctx.roundRect(W / 2 - 80, y - 28, 160, 40, 10); ctx.fill();
  text('BACK', W / 2, y, 20, '#ffffff', 'center', { stroke: false });
  B.hits.push({ x: W / 2 - 80, y: y - 28, w: 160, h: 40, fn: () => { AU.sfx('menu'); titlePress('esc'); } });
}

// ---------------------------------------------------------------------------
// results card over a dimmed, frozen race
function drawResults() {
  const S = B.S, R = B.results;
  drawWorld(S, { noShake: true, noRoll: true });
  ctx.fillStyle = 'rgba(6,8,18,0.62)'; ctx.fillRect(0, 0, W, H);
  drawParticles('over');
  B.hits = [];
  panel(W / 2 - 550, 60, 1100, H - 120, 0.94, 18);
  text(R.won ? 'GOAL!' : 'TIME UP', W / 2, 128, 64, R.won ? '#ffd84a' : '#ff6a4a', 'center');
  label(R.won ? STAGES[S.stageKey].name + ' — THE SUN GIVES OUT' : `REACHED ${STAGES[S.stageKey].name} · STAGE ${S.stageNo}/5`, W / 2, 160, 18, '#e8ecf4', 'center');

  const mapX = W / 2 - 510, statX = W / 2 + 80, statR = W / 2 + 510;
  drawRouteMap(mapX, 196, 540, 300, S.routeTaken, S.splits, R.deltas);
  if (Object.values(R.deltas).some((d) => d <= 0)) label('GREEN SPLIT = BEAT YOUR BEST ON THAT ROAD', mapX + 270, 600, 12, '#9fb4cc', 'center', false);

  const sx = statX, rows2 = [
    ['PASSES', S.passes], ['NEAR MISSES', S.nears], ['DRIFTS', S.drifts], ['BEST CHAIN', S.bestChain],
    ['CRASHES', S.crashes + S.wrecks], ['RACE TIME', fmtTime(S.totalT)],
  ];
  if (R.won) rows2.push(['TIME BONUS', '+' + R.timeBonus]);
  rows2.forEach(([k, v], i) => {
    const y = 214 + i * 32;
    label(k, sx, y, 17, '#9fb4cc');
    label(String(v), statR, y, 17, '#ffffff', 'right');
  });
  const scoreY = 214 + rows2.length * 32 + 24;
  label('SCORE', sx, scoreY + 6, 20, '#ffd84a');
  text(String(R.score).padStart(7, '0'), statR, scoreY + 10, 40, '#ffffff', 'right');
  if (R.medal) {
    const mc = { GOLD: '#ffd84a', SILVER: '#d8dee8', BRONZE: '#d8905a' }[R.medal];
    // under the route map, where the route it belongs to is drawn
    const my = 562, mt = R.medal + ' MEDAL ON THIS ROUTE' + (R.newMedal ? ' — NEW!' : '');
    ctx.font = `700 ${Math.max(16, minText())}px ${UIFONT}`;
    const mw = ctx.measureText(mt).width + 34;
    ctx.fillStyle = mc; ctx.beginPath(); ctx.arc(mapX + 270 - mw / 2 + 12, my - 6, 12, 0, 6.3); ctx.fill();
    label(mt, mapX + 270 - mw / 2 + 32, my, 16, mc);
  }
  if (R.record) text('NEW RECORD!', statR, scoreY + 46, 22, '#7ce88a', 'right');
  else if (R.rank >= 0) label('RANK #' + (R.rank + 1), statR, scoreY + 42, 18, '#7ce88a', 'right');

  const ready = B.end && B.end.t > 1.2 || !B.end;
  if (B.entry) {
    const E = B.entry;
    const ex = (statX + statR) / 2;
    label('NEW HIGH SCORE — ENTER YOUR INITIALS', ex, 548, 16, '#ffd84a', 'center');
    for (let i = 0; i < 3; i++) {
      const x = ex - 130 + i * 76, y = 610;
      const on = i === E.pos;
      ctx.fillStyle = on ? 'rgba(255,216,74,0.2)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(x - 32, y - 44, 64, 58, 8); ctx.fill();
      if (on) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x - 20, y + 8, 40, 3); }
      text(E.chars[i] === ' ' ? '_' : E.chars[i], x, y, 40, on ? '#ffd84a' : '#ffffff', 'center', { stroke: false });
      // touch: tap top half = next letter, bottom half = previous
      B.hits.push({ x: x - 32, y: y - 44, w: 64, h: 29, fn: () => { E.pos = i; resultsPress('up'); } });
      B.hits.push({ x: x - 32, y: y - 15, w: 64, h: 29, fn: () => { E.pos = i; resultsPress('down'); } });
    }
    ctx.fillStyle = 'rgba(124,232,138,0.28)';
    ctx.beginPath(); ctx.roundRect(ex + 110, 566, 96, 58, 10); ctx.fill();
    text('OK', ex + 158, 606, 26, '#ffffff', 'center', { stroke: false });
    B.hits.push({ x: ex + 110, y: 566, w: 96, h: 58, fn: () => commitEntry() });
    {
      const hint = B.touch ? 'TAP TOP/BOTTOM OF A LETTER' : 'TYPE A NAME · ▲ ▼ · ◄ ► · ENTER';
      ctx.font = `700 ${Math.max(12, minText())}px ${UIFONT}`;
      const hw = ctx.measureText(hint).width, room = (statR - statX);
      label(hint, ex, 652, Math.max(8, Math.max(12, minText()) * Math.min(1, room / hw)), '#9fb4cc', 'center', false);
    }
  } else if (ready) {
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(B.t * 4);
    text(B.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE', W / 2, 626, 26, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// main loop — fixed 60Hz simulation, rendering interpolated between ticks
let last = performance.now(), acc = 0;
let perfAcc = 0, perfN = 0, faults = 0;
function frame(now) {
  // schedule first: one bad frame must never stop the loop
  requestAnimationFrame(frame);
  const ms = now - last;
  acc += Math.min(0.25, ms / 1000);
  last = now;
  const work0 = performance.now();
  try {
    while (acc >= DT) { update(DT); acc -= DT; }
    B.alpha = acc / DT;
    render();
    faults = 0;
  } catch (err) {
    if (faults++ < 3) console.error('SUNSTRIP frame fault', err);
    acc = 0;
    // a throw mid-draw can leave clips, alpha or transforms behind
    try { if (ctx.reset) ctx.reset(); else canvas.width = canvas.width; } catch { /* ok */ }
    // a fault that repeats every frame: clear the volatile saves, back to title
    if (faults > 30) {
      // last resort: settings back to defaults, volatile saves cleared (boards kept
      // unless they're the problem on a second strike), and tell the player
      // first strike: settings back to defaults (in memory and saved). Progress —
      // splits, name, medals — is validated on load and never deleted here.
      Object.assign(SET, DEFAULTS); saveSettings();
      // a second burst within a minute that comes from drawing the boards: back
      // the boards up (latest copy) and set them aside. Any other fault leaves
      // them alone — a glitch elsewhere must never cost a player their scores.
      const now = performance.now();
      const boardsFault = /drawScores/.test(String(err && err.stack));
      const hasScores = Object.values(BOARDS).some((b) => b.length);
      let what = 'SETTINGS RESET';
      if (now - B.lastStrike < 60000 && boardsFault && hasScores) {
        store.set('boards.bak', BOARDS);          // only ever a non-empty copy
        for (const d of Object.keys(BOARDS)) BOARDS[d] = [];
        store.set('boards', BOARDS);
        what = 'SCORES SET ASIDE (BACKED UP)';
      }
      B.lastStrike = now;
      faults = 0;
      try { toTitle(); } catch { /* nothing more to do */ }
      if (!(B.toast && /SET ASIDE/.test(B.toast.text))) B.toast = { text: 'SOMETHING WENT WRONG — ' + what, t: 4 };
    }
  }
  // adaptive resolution from the time we actually spend working — a 30Hz
  // battery-saver cap is not a reason to go blurry
  const work = performance.now() - work0;
  if (ms < 100) { perfAcc += work; perfN++; }
  if (perfN >= 90) {
    const avg = perfAcc / perfN;
    if (avg > 13 && B.quality > 0.5) { B.quality = Math.max(0.5, B.quality - 0.15); resize(); }
    else if (avg < 7 && B.quality < 1) { B.quality = Math.min(1, B.quality + 0.05); resize(); }
    perfAcc = 0; perfN = 0;
  }
}

// render between sim ticks: blend the last two states (camera, car and every
// traffic car) so 120/144Hz screens
// scroll smoothly instead of repeating frames unevenly
function interpolated(S, fn) {
  const P = B.prev;
  if (!P || P.S !== S || P.key !== S.stageKey || Math.abs(S.z - P.z) > 3000 || B.alpha >= 1) return fn();
  const a = B.alpha;
  const z = S.z, x = S.playerX, xo = B.xOff, bg = B.bgCurve, wh = B.wheel;
  S.z = P.z + (z - P.z) * a; S.playerX = P.x + (x - P.x) * a;
  B.xOff = P.xOff + (xo - P.xOff) * a; B.bgCurve = P.bg + (bg - P.bg) * a; B.wheel = P.wheel + (wh - P.wheel) * a;
  const cars = P.cars === S.traffic ? S.traffic : null;
  const cz = cars && cars.map((c) => c.z), cl = cars && cars.map((c) => c.lane);
  if (cars) cars.forEach((c, i) => {
    if (Math.abs(c.z - P.cz[i]) < 3000) c.z = P.cz[i] + (c.z - P.cz[i]) * a;
    c.lane = P.cl[i] + (c.lane - P.cl[i]) * a;
  });
  try { return fn(); } finally {
    S.z = z; S.playerX = x; B.xOff = xo; B.bgCurve = bg; B.wheel = wh;
    if (cars) cars.forEach((c, i) => { c.z = cz[i]; c.lane = cl[i]; });
  }
}

function render() {
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.imageSmoothingEnabled = true;
  if (B.mode === 'title') drawTitle();
  else if (B.mode === 'race') {
    interpolated(B.S, () => drawWorld(B.S, { braking: input.brake && B.S.speed > 100 && !B.end }));
    if (!B.end) drawHUD(B.S);
    else {
      text(B.end.won ? 'GOAL!' : 'TIME UP', W / 2, H * 0.4, 96, B.end.won ? '#ffd84a' : '#ff6a4a', 'center');
    }
    if (B.fade > 0) { const f = 1 - Math.abs(B.fade / 0.35 * 2 - 1); ctx.fillStyle = `rgba(8,10,20,${(f * 0.8).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (B.flash > 0) {
      const peak = SET.flashes ? 0.8 : 0;
      ctx.fillStyle = `rgba(255,255,255,${(Math.min(1, B.flash / 0.45) * peak).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
    }
    if (B.paused) drawPause();
  } else drawResults();
  if (AU.isMuted()) label('MUTED · M', W - 32, 112, 13, 'rgba(255,255,255,0.8)', 'right');
  if (B.toast) {
    ctx.globalAlpha = Math.min(1, B.toast.t);
    panel(W / 2 - 300, H - 110, 600, 44, 0.85, 10);
    label(B.toast.text, W / 2, H - 81, 16, '#ffd84a', 'center');
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// deterministic screenshot mode: ?shot=<name> renders one frame and stops
const params = new URLSearchParams(location.search);
const SHOTS = {
  title:   { mode: 'title' },
  hero:    { key: 'coast',  pos: 'curve', stageNo: 1 },
  palms:   { key: 'palms',  pos: 'curve', stageNo: 2 },
  canyon:  { key: 'canyon', pos: 'curve', stageNo: 2 },
  pines:   { key: 'pines',  pos: 'crest', stageNo: 3 },
  dusk:    { key: 'dusk',   steps: 950,   stageNo: 3 },
  desert:  { key: 'desert', steps: 850,   stageNo: 3 },
  autumn:  { key: 'autumn', pos: 'curve', stageNo: 4 },
  harbor:  { key: 'harbor', steps: 700,   stageNo: 4 },
  fields:  { key: 'fields', steps: 700,   stageNo: 4 },
  volcano: { key: 'volcano', pos: 'curve', stageNo: 4 },
  snow:    { key: 'snow',   pos: 'crest', stageNo: 5 },
  bay:     { key: 'bay',    steps: 700,   stageNo: 5 },
  metro:   { key: 'metro',  steps: 700,   stageNo: 5 },
  savanna: { key: 'savanna', steps: 700,  stageNo: 5 },
  lastlight: { key: 'lastlight', pos: 'curve', stageNo: 5 },
  fork:    { key: 'coast',  pos: 'fork',  stageNo: 1 },
  traffic: { key: 'coast',  steps: 300,   stageNo: 1 },
  results: { mode: 'results' },
  help:    { mode: 'help' },
  pause:   { key: 'palms', steps: 400, stageNo: 2, paused: true },
  touch:   { key: 'coast', steps: 300, stageNo: 1, touch: true },
  spin1:   { key: 'palms', steps: 300, stageNo: 2, spin: 0.85 },
  spin2:   { key: 'palms', steps: 300, stageNo: 2, spin: 0.55 },
  spin3:   { key: 'palms', steps: 300, stageNo: 2, spin: 0.3 },
  wreck1:  { key: 'canyon', steps: 300, stageNo: 2, wreck: 1.5 },
  wreck2:  { key: 'canyon', steps: 300, stageNo: 2, wreck: 1.1 },
  wreck3:  { key: 'canyon', steps: 300, stageNo: 2, wreck: 0.7 },
};
function findCurveSeg(stage) {
  const segs = stage.segments;
  for (let i = 400; i < segs.length - 400; i++) {
    if (Math.abs(segs[i].curve) > 2.4 && Math.abs(segs[i + 80].curve) > 2.4) return i;
  }
  return 500;
}
function findCrestSeg(stage) {
  const segs = stage.segments;
  let best = 500, bestDrop = 0;
  for (let i = 300; i < segs.length - 400; i++) {
    const drop = segs[i].y - segs[i + 90].y;
    if (drop > bestDrop) { bestDrop = drop; best = i; }
  }
  return best;
}
function runShot(name) {
  const cfg = SHOTS[name] || SHOTS.hero;
  if (cfg.mode === 'title' || cfg.mode === 'help') {
    B.mode = 'title'; B.menu = cfg.mode === 'help' ? 'help' : 'main';
    B.demo = C.newRace(3, 'easy'); B.demo.countdown = 0; B.demo.speed = CFG.maxSpeed * 0.8; B.demo.time = 999;
    for (let i = 0; i < 500; i++) { C.stepRace(B.demo, botInput(C, B.demo, 0.9), DT); worldTick(B.demo, DT, true); }
    render(); window.__shotReady = true; return;
  }
  if (cfg.mode === 'results') {
    const S = C.newRace(4, 'normal');
    S.countdown = 0; S.time = 999;
    for (let i = 0; i < 60 * 400 && !S.over; i++) {
      C.stepRace(S, botInput(C, S), DT);
      if (S.stageNo === 5 && S.z > S.stage.length * 0.98) S.time = 7.3;
    }
    B.S = S; S.over = true; S.won = true;
    finishRace(true); B.end = null; B.mode = 'results';
    B.entry = { chars: ['M', 'E', 'L'], pos: 2 };
    render(); window.__shotReady = true; return;
  }
  const S = C.newRace(Number(params.get('seed') || 1));
  S.countdown = 0;
  S.stageKey = cfg.key;
  S.stage = C.buildStage(cfg.key);
  S.stageNo = cfg.stageNo || 1;
  S.traffic = C.trafficInit(S.stage, 5);
  S.speed = CFG.maxSpeed * 0.92;
  let steps = cfg.steps || 400;
  if (cfg.pos === 'fork') { S.z = S.stage.length - CFG.forkSegs * CFG.segLen * 0.92; S.playerX = -0.45; steps = 1; }
  if (cfg.pos === 'curve') { S.z = (findCurveSeg(S.stage) - 40) * CFG.segLen; steps = 45; }
  if (cfg.pos === 'crest') { S.z = (findCrestSeg(S.stage) - 55) * CFG.segLen; steps = 45; }
  for (const c of S.traffic) c.z = (c.z + S.z) % S.stage.length;
  B.S = S; B.mode = 'race';
  B.touch = !!cfg.touch;
  for (let i = 0; i < steps; i++) {
    const inp = botInput(C, S);
    input.steer = inp.steer; input.accel = inp.accel;
    C.stepRace(S, inp, DT);
    worldTick(S, DT, false);
    if (S.over) break;
  }
  S.time = Math.max(S.time, 38);
  S.totalT = Math.max(S.totalT, 10);
  B.banner = null; B.pops = [];
  B.paused = !!cfg.paused;
  if (cfg.spin) { S.spin = cfg.spin; S.spinMax = CFG.spinTime; input.steer = 1; S.steerV = 1; }
  if (cfg.wreck) { S.wreck = cfg.wreck; S.wreckSide = 1; }
  render();
  window.__shotReady = true;
}

// debug hook for automated play-testing
window.__SUNSTRIP = () => {
  const S = B.S;
  return { mode: B.mode, paused: B.paused, menu: B.menu, stage: S && S.stageKey, stageNo: S && S.stageNo, time: S && +S.time.toFixed(1), speed: S && Math.round(S.speed), x: S && +S.playerX.toFixed(2), score: S && Math.floor(S.score), crashes: S && S.crashes, wrecks: S && S.wrecks, chain: S && S.chain, over: S && S.over };
};

try { const f = document.getElementById('fail'); if (f) f.remove(); } catch { /* ok */ }
if (params.has('shot')) runShot(params.get('shot'));
else requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
