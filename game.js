// SUNSTRIP browser layer — rendering, audio, input. All pixels and sound
// from code; the simulation lives in core.js.
import {
  CFG, CAM_DEPTH, STAGES, STAGE_TREE, buildStage, newRace, stepRace,
  segmentAt, kmh, makeRng,
} from './core.js';

const W = 1280, H = 720;
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------------------
// palettes — the real OutRun register: sunset, sea, asphalt, chrome
const PAL = {
  coast: {
    sky: ['#5db4e8', '#a8dcf0', '#ffe8b8'], sun: '#fff4c8', sunGlow: '#ffd98c',
    sea: ['#5aa8cc', '#7fc2dc'], hills: ['#78b8d4', '#a2d0e2'],
    grass: ['#57a05e', '#519a58'], road: ['#696a70', '#636469'],
    rumble: ['#f0f0f0', '#d84840'], lane: '#f4f4f4', fog: '#cfe8f2',
    cloud: '#eef6fb',
  },
  palms: {
    sky: ['#4aa8e0', '#98d4ec', '#ffe0a8'], sun: '#fff8d8', sunGlow: '#ffe0a0',
    sea: ['#4f9fc4', '#77bcd6'], hills: ['#6cacc8', '#96c8da'],
    grass: ['#519c5a', '#4b9554'], road: ['#66676d', '#606166'],
    rumble: ['#f0f0f0', '#d84840'], lane: '#f4f4f4', fog: '#c8e4f0',
    cloud: '#e8f2f8',
  },
  canyon: {
    sky: ['#ff9e5e', '#ffc888', '#ffedc0'], sun: '#fff0b0', sunGlow: '#ffb870',
    sea: null, hills: ['#b05838', '#cf7850'], shadow: '#6e2f1e',
    grass: ['#c07a4a', '#b97448'], road: ['#6e665e', '#68615a'],
    rumble: ['#f4e8d0', '#b84028'], lane: '#f4ead0', fog: '#ffd8a8',
    cloud: '#f7e6c2',
  },
  pines: {
    sky: ['#88c4dc', '#c4e4e8', '#f0f4d8'], sun: '#fffce0', sunGlow: '#e8f0c0',
    sea: null, hills: ['#4a7c5c', '#6e9c7e'],
    grass: ['#3f7d4a', '#3a7645'], road: ['#63646a', '#5d5e64'],
    rumble: ['#e8e8e8', '#c84838'], lane: '#ececec', fog: '#d8e8dc',
    cloud: '#dfe8e4',
  },
  dusk: {
    sky: ['#241f52', '#68387c', '#e8586e'], sun: '#ffb058', sunGlow: '#ff7a5c',
    sea: null, hills: ['#241f48', '#332a58'], city: true,
    grass: ['#2c3046', '#282c41'], road: ['#585a68', '#525462'],
    rumble: ['#c8c8d8', '#a83848'], lane: '#d8d8e4', fog: '#4c3868',
    cloud: '#6a4a80',
  },
  desert: {
    sky: ['#eaa64e', '#ffd98c', '#ffedbe'], sun: '#fff8e0', sunGlow: '#ffd98c',
    sea: null, hills: ['#c8a468', '#dcbc84'],
    grass: ['#c9a15e', '#c39b59'], road: ['#71695f', '#6b635a'],
    rumble: ['#f8f0d8', '#c05030'], lane: '#f8f2dc', fog: '#f4e0b0',
    cloud: '#f7e6c2',
  },
};

// ---------------------------------------------------------------------------
// game modes and browser-side state
const B = {
  mode: 'title',      // title | race | over
  S: null,
  bgCurve: 0,         // accumulated background parallax
  bounce: 0,
  banner: null,       // {text, sub, t}
  toast: null,        // {text, t}
  shakeT: 0,
  radio: 1,
  muted: false,
  best: Number(localStorage.getItem('sunstrip.best') || 0),
  titleT: 0,
  overT: 0,
  hintT: 0,           // fading touch-zone overlay at race start
  finalScore: 0,
  seed: 1,
};

const input = { steer: 0, brake: false, accel: true, left: false, right: false };
const TOUCH = matchMedia('(pointer: coarse)').matches
  || new URLSearchParams(location.search).has('touch');

// ---------------------------------------------------------------------------
// audio — WebAudio synth: engine, sfx, and three radio stations
const AU = { ctx: null, master: null, engine: null, engineGain: null, music: null };

const STATIONS = [
  { name: 'SUNSET CRUISE', bpm: 96,
    bass: [0, 0, 7, 0, 5, 0, 7, 0, 3, 3, 10, 3, 8, 3, 10, 3],
    lead: [12, -1, 15, 14, 12, -1, 10, -1, 8, -1, 12, -1, 10, 8, 7, -1],
    root: 45, wave: 'triangle' },
  { name: 'CHROME RUSH', bpm: 128,
    bass: [0, 0, 0, 12, 0, 0, 10, 0, 5, 5, 5, 17, 5, 5, 15, 5],
    lead: [12, 12, -1, 15, -1, 17, 15, 12, 17, 17, -1, 19, -1, 20, 19, 17],
    root: 41, wave: 'sawtooth' },
  { name: 'MIRAGE FM', bpm: 108,
    bass: [0, -1, 0, -1, 8, -1, 7, -1, 5, -1, 5, -1, 3, -1, 7, -1],
    lead: [-1, 12, -1, 14, -1, 15, -1, 14, 12, -1, 10, -1, 12, -1, -1, -1],
    root: 43, wave: 'square' },
];

function audioInit() {
  if (AU.ctx) {
    if (AU.ctx.state === 'suspended') AU.ctx.resume();
    return;
  }
  const A = new (window.AudioContext || window.webkitAudioContext)();
  AU.ctx = A;
  if (A.state === 'suspended') A.resume();
  AU.master = A.createGain(); AU.master.gain.value = B.muted ? 0 : 0.5;
  AU.master.connect(A.destination);
  const e1 = A.createOscillator(), e2 = A.createOscillator();
  e1.type = 'sawtooth'; e2.type = 'sawtooth'; e2.detune.value = 14;
  const ef = A.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 420;
  const eg = A.createGain(); eg.gain.value = 0;
  e1.connect(ef); e2.connect(ef); ef.connect(eg); eg.connect(AU.master);
  e1.start(); e2.start();
  AU.engine = [e1, e2]; AU.engineGain = eg; AU.engineFilter = ef;
}

function engineUpdate(frac) {
  if (!AU.ctx) return;
  const f = 36 + frac * 130;
  AU.engine[0].frequency.setTargetAtTime(f, AU.ctx.currentTime, 0.05);
  AU.engine[1].frequency.setTargetAtTime(f * 1.5, AU.ctx.currentTime, 0.05);
  AU.engineFilter.frequency.setTargetAtTime(300 + frac * 900, AU.ctx.currentTime, 0.08);
  const g = B.mode === 'race' ? 0.05 + frac * 0.09 : 0;
  AU.engineGain.gain.setTargetAtTime(g, AU.ctx.currentTime, 0.1);
}

function blip(freq, dur = 0.08, type = 'square', gain = 0.16, when = 0) {
  if (!AU.ctx) return;
  const A = AU.ctx, t = A.currentTime + when;
  const o = A.createOscillator(), g = A.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AU.master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur = 0.4, gain = 0.3, freq = 900) {
  if (!AU.ctx) return;
  const A = AU.ctx, t = A.currentTime;
  const len = Math.floor(A.sampleRate * dur);
  const buf = A.createBuffer(1, len, A.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = A.createBufferSource(); src.buffer = buf;
  const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = A.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(AU.master);
  src.start(t);
}

function sfx(name) {
  if (!AU.ctx) return;
  if (name === 'crash') { noiseBurst(0.5, 0.4, 700); blip(120, 0.3, 'sawtooth', 0.2); }
  if (name === 'pass') noiseBurst(0.12, 0.08, 2400);
  if (name === 'checkpoint') { [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, 'square', 0.14, i * 0.09)); }
  if (name === 'goal') { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => blip(f, 0.16, 'square', 0.14, i * 0.11)); }
  if (name === 'tune') blip(880, 0.05, 'square', 0.1);
}

function musicStart(n) {
  musicStop();
  if (!AU.ctx) return;
  const st = STATIONS[n];
  const A = AU.ctx;
  const stepDur = 60 / st.bpm / 4;
  const state = { step: 0, next: A.currentTime + 0.05, timer: null };
  const mg = A.createGain(); mg.gain.value = 0.42; mg.connect(AU.master);
  state.gain = mg;
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function noiseHit(t, dur, gain, dest) {
    const len = Math.floor(A.sampleRate * dur);
    const buf = A.createBuffer(1, len, A.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / len);
    const src = A.createBufferSource(); src.buffer = buf;
    const hp = A.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = A.createGain(); g.gain.value = gain;
    src.connect(hp); hp.connect(g); g.connect(dest); src.start(t);
  }
  function schedule() {
    while (state.next < A.currentTime + 0.12) {
      const i = state.step % 16, t = state.next;
      const b = st.bass[i];
      if (b >= 0) {
        const o = A.createOscillator(), g = A.createGain();
        o.type = 'sawtooth'; o.frequency.value = midi(st.root + b);
        g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
        o.connect(g); g.connect(mg); o.start(t); o.stop(t + stepDur);
      }
      const l = st.lead[i];
      if (l >= 0) {
        const o = A.createOscillator(), g = A.createGain();
        o.type = st.wave; o.frequency.value = midi(st.root + 24 + l);
        g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.6);
        o.connect(g); g.connect(mg); o.start(t); o.stop(t + stepDur * 1.8);
      }
      if (i % 4 === 0) {
        const o = A.createOscillator(), g = A.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(mg); o.start(t); o.stop(t + 0.14);
      }
      if (i % 8 === 4) noiseHit(t, 0.09, 0.12, mg);
      if (i % 2 === 1) noiseHit(t, 0.03, 0.05, mg);
      state.next += stepDur; state.step++;
    }
    state.timer = setTimeout(schedule, 40);
  }
  schedule();
  AU.music = state;
}

function musicStop() {
  if (AU.music) { clearTimeout(AU.music.timer); try { AU.music.gain.disconnect(); } catch {} AU.music = null; }
}

// ---------------------------------------------------------------------------
// input
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  audioInit();
  if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === ' ') input.brake = true;
  if (e.key === 'm') { B.muted = !B.muted; if (AU.master) AU.master.gain.value = B.muted ? 0 : 0.5; }
  if (B.mode === 'title') {
    if (e.key === 'ArrowLeft' || e.key === 'a') { B.radio = (B.radio + STATIONS.length - 1) % STATIONS.length; sfx('tune'); }
    if (e.key === 'ArrowRight' || e.key === 'd') { B.radio = (B.radio + 1) % STATIONS.length; sfx('tune'); }
    if (e.key === 'Enter') startRace();
  } else if (B.mode === 'over' && e.key === 'Enter' && B.overT > 1) {
    B.mode = 'title'; B.titleT = 0; musicStop();
  }
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === ' ') input.brake = false;
});
canvas.addEventListener('pointerdown', (e) => {
  audioInit();
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  if (B.mode === 'title') {
    // tap the radio widget to tune; anywhere else starts the race
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
    if (px >= 62 && px <= 392 && py >= H - 148 && py <= H - 40) {
      B.radio = (B.radio + 1) % STATIONS.length; sfx('tune'); return;
    }
    startRace(); return;
  }
  if (B.mode === 'over' && B.overT > 1) { B.mode = 'title'; B.titleT = 0; musicStop(); return; }
  touchSteer(e);
});
canvas.addEventListener('pointermove', (e) => { if (e.buttons) touchSteer(e); });
function touchClear() { input.left = input.right = input.brake = false; }
canvas.addEventListener('pointerup', touchClear);
canvas.addEventListener('pointercancel', touchClear);
function touchSteer(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  input.left = x < 0.4; input.right = x > 0.6; input.brake = y > 0.8;
}

function startRace() {
  B.S = newRace(B.seed);
  B.S.speed = 0;
  B.mode = 'race';
  B.banner = { text: STAGES.coast.name, sub: 'STAGE 1', t: 2.2 };
  B.bgCurve = 0;
  B.hintT = TOUCH ? 4 : 0;
  musicStart(B.radio);
}

// ---------------------------------------------------------------------------
// update
function update(dt) {
  if (B.mode === 'title') { B.titleT += dt; return; }
  if (B.mode === 'over') { B.overT += dt; return; }
  const S = B.S;
  input.steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const ev = stepRace(S, input, dt);
  for (const e of ev) {
    if (e === 'crash') { B.shakeT = 0.5; sfx('crash'); }
    else if (e === 'pass') { B.toast = { text: 'PASS +' + CFG.passBonus, t: 0.9 }; sfx('pass'); }
    else if (e.startsWith('checkpoint')) {
      B.banner = { text: STAGES[S.stageKey].name, sub: 'CHECKPOINT — TIME +' + CFG.checkpointTime, t: 2.4 };
      sfx('checkpoint');
    } else if (e === 'goal') {
      B.mode = 'over'; B.overT = 0; B.finalScore = Math.floor(S.score);
      if (B.finalScore > B.best) { B.best = B.finalScore; localStorage.setItem('sunstrip.best', B.best); }
      sfx('goal'); musicStop();
    } else if (e === 'timeout') {
      B.mode = 'over'; B.overT = 0; B.finalScore = Math.floor(S.score);
      if (B.finalScore > B.best) { B.best = B.finalScore; localStorage.setItem('sunstrip.best', B.best); }
      musicStop();
    }
  }
  const seg = segmentAt(S.stage, S.z);
  const frac = S.speed / CFG.maxSpeed;
  B.bgCurve += seg.curve * frac * dt * 14;
  B.bounce += dt * (4 + frac * 26);
  if (B.banner) { B.banner.t -= dt; if (B.banner.t <= 0) B.banner = null; }
  if (B.toast) { B.toast.t -= dt; if (B.toast.t <= 0) B.toast = null; }
  if (B.hintT > 0) B.hintT -= dt;
  if (B.shakeT > 0) B.shakeT -= dt;
  engineUpdate(frac);
}

// ---------------------------------------------------------------------------
// drawing helpers
function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function mix(a, b, t) {
  const A = rgb(a), Bc = rgb(b);
  return `rgb(${Math.round(A[0] + (Bc[0] - A[0]) * t)},${Math.round(A[1] + (Bc[1] - A[1]) * t)},${Math.round(A[2] + (Bc[2] - A[2]) * t)})`;
}
function poly(pts, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------------------
// background: sky, sun, clouds, sea, hills, city — parallax on bgCurve.
// The sun sinks and swells stage by stage: drive west until it gives out.
function drawBackground(pal, horizonY, seedBase, stageNo) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY + 60);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(0.62, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizonY + 60);

  // sega sun: banded disc, lower and larger as the run goes on
  const R = 66 + stageNo * 42;
  const sunX = Math.max(W * 0.30, Math.min(W * 0.72, W * 0.62 - B.bgCurve * 1.6));
  const sunY = horizonY - 150 + stageNo * 44;
  const glow = ctx.createRadialGradient(sunX, sunY, R * 0.3, sunX, sunY, R * 2.6);
  glow.addColorStop(0, pal.sunGlow + 'cc'); glow.addColorStop(1, pal.sunGlow + '00');
  ctx.fillStyle = glow; ctx.fillRect(sunX - R * 3, sunY - R * 3, R * 6, R * 6);
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, R, 0, Math.PI * 2);
  ctx.rect(0, 0, W, horizonY + 1); ctx.clip('evenodd');
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = pal.sun; ctx.fillRect(sunX - R, sunY - R, R * 2, R * 2);
  ctx.fillStyle = pal.sky[1];
  for (let i = 0; i < 4; i++) ctx.fillRect(sunX - R, sunY + R * 0.12 + i * (R * 0.22), R * 2, 6 + i * 4);
  ctx.restore();

  // clouds — shapes and placement vary per stage, tinted to the biome light
  ctx.fillStyle = pal.cloud + 'bb';
  const cr = makeRng(7 + (seedBase || 0));
  for (let i = 0; i < 6; i++) {
    const cx = ((cr() * 1.6 * W - B.bgCurve * (0.5 + cr() * 0.4)) % (W + 300) + W + 300) % (W + 300) - 150;
    const cy = 36 + cr() * (horizonY * 0.42);
    const s = 26 + cr() * 62;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * (0.24 + cr() * 0.14), 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * (0.5 + cr() * 0.3), cy + 4, s * 0.7, s * 0.24, 0, 0, Math.PI * 2);
    if (cr() < 0.5) ctx.ellipse(cx - s * 0.55, cy + 6, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // far hills, two parallax layers, far layer lighter (aerial perspective)
  for (let layer = 0; layer < 2; layer++) {
    const col = layer === 0 ? mix(pal.hills[0], pal.sky[2], 0.25) : pal.hills[1];
    const par = layer === 0 ? 0.9 : 1.7;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 1);
    for (let x = 0; x <= W; x += 16) {
      const wx = x + B.bgCurve * par + (seedBase || 0) * 37;
      const h1 = Math.sin(wx * 0.004 + layer * 9) * 26 + Math.sin(wx * 0.011 + layer * 4) * 14;
      ctx.lineTo(x, horizonY - Math.max(0, h1 + 18 - layer * 8) + 1);
    }
    ctx.lineTo(W, horizonY + 1);
    ctx.closePath(); ctx.fill();
  }

  // city skyline: two continuous overlapping silhouette bands (Chrome City)
  if (pal.city) {
    const layers = [
      { col: '#3a2450', par: 0.7, base: 4, hMin: 26, hMax: 88, w: 46, win: false },
      { col: '#241536', par: 1.3, base: 6, hMin: 18, hMax: 120, w: 34, win: true },
    ];
    for (const L of layers) {
      const rr = makeRng(500 + L.par * 100);
      const off = (B.bgCurve * L.par) % (W + 200);
      ctx.fillStyle = L.col;
      let x = -200 - off;
      const towers = [];
      while (x < W + 100) {
        const tw = L.w * (0.7 + rr() * 0.9);
        const th = L.hMin + rr() * (L.hMax - L.hMin);
        towers.push([x, tw, th]);
        ctx.fillRect(x, horizonY + L.base - th, tw, th);
        x += tw * (0.72 + rr() * 0.4); // overlap for massing
      }
      if (L.win) {
        ctx.fillStyle = '#ffd870';
        for (const [tx, tw, th] of towers) {
          const wr = makeRng(Math.floor(tx * 7) + 13);
          for (let wy = 10; wy < th - 6; wy += 12) {
            for (let wx2 = 4; wx2 < tw - 4; wx2 += 9) {
              if (wr() < 0.28) ctx.fillRect(tx + wx2, horizonY + L.base - th + wy, 3, 5);
            }
          }
        }
      }
    }
  }

  // sea band with shimmer
  if (pal.sea) {
    const sg = ctx.createLinearGradient(0, horizonY, 0, horizonY + 40);
    sg.addColorStop(0, pal.sea[0]); sg.addColorStop(1, pal.sea[1]);
    ctx.fillStyle = sg; ctx.fillRect(0, horizonY, W, 42);
    ctx.fillStyle = '#ffffff50';
    const sr = makeRng(11);
    for (let i = 0; i < 26; i++) {
      const sx = ((sr() * W * 1.4 - B.bgCurve * 1.2) % (W + 100) + W + 100) % (W + 100) - 50;
      ctx.fillRect(sx, horizonY + 4 + sr() * 34, 14 + sr() * 40, 2);
    }
  }
}

// ---------------------------------------------------------------------------
// procedural sprites — every one drawn from primitives
function drawSprite(kind, x, y, s, pal, extra) {
  if (s <= 0.004) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  switch (kind) {
    case 'palm': {
      // lean and size vary per placement so clones don't read as clones
      const lean = (extra || 1) < 0 ? -1 : 1;
      const v = Math.abs(extra || 1) % 1;         // 0..1 variant
      const sc = 0.85 + v * 0.4;
      ctx.scale(sc * lean, sc);
      ctx.strokeStyle = '#6a4a34'; ctx.lineWidth = 30;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(34, -230, 78, -420); ctx.stroke();
      // trunk ring notches
      ctx.strokeStyle = '#5a3e2c'; ctx.lineWidth = 8;
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const nx = 2 * (1 - t) * t * 34 + t * t * 78, ny = -(2 * (1 - t) * t * 230 + t * t * 420);
        ctx.beginPath(); ctx.moveTo(nx - 16, ny); ctx.lineTo(nx + 16, ny); ctx.stroke();
      }
      // fronds: lit tops, dark undersides
      for (const [col, lw, dy] of [['#1e6b35', 40, 8], ['#3fa554', 26, 0]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.08 + (i / 6) * 0.84);
          const fx = Math.cos(a) * 190, fy = -Math.sin(a) * 120;
          ctx.beginPath();
          ctx.moveTo(78, -420 + dy);
          ctx.quadraticCurveTo(78 + fx * 0.55, -420 + fy - 60 + dy, 78 + fx, -420 + fy + 70 + dy);
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
      break;
    }
    case 'pine': {
      ctx.fillStyle = '#5a4030'; ctx.fillRect(-16, -90, 32, 90);
      poly([[-130, -80], [130, -80], [0, -300]], '#2c6440');
      poly([[-105, -190], [105, -190], [0, -380]], '#317048');
      poly([[-80, -290], [80, -290], [0, -450]], '#387c50');
      // sun-side rim
      ctx.strokeStyle = '#ffe0a866'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(80, -290); ctx.lineTo(0, -450); ctx.stroke();
      break;
    }
    case 'cactus': {
      ctx.fillStyle = '#3e7c3a';
      ctx.fillRect(-22, -240, 44, 240);
      ctx.fillRect(-90, -170, 40, 26);
      ctx.fillRect(-90, -170, 26, 90);
      ctx.fillRect(50, -200, 40, 26);
      ctx.fillRect(64, -200, 26, 110);
      ctx.fillStyle = '#ffe0a855'; ctx.fillRect(14, -240, 8, 240);
      break;
    }
    case 'rock': {
      poly([[-120, 0], [-70, -95], [10, -130], [90, -70], [120, 0]], '#8a7462');
      poly([[-50, 0], [-16, -80], [60, -95], [95, 0]], '#a08a74');
      poly([[-70, -95], [10, -130], [40, -110], [-30, -80]], '#c0a888');
      break;
    }
    case 'mesa': {
      poly([[-260, 0], [-200, -240], [200, -240], [260, 0]], '#b06040');
      poly([[-200, -240], [200, -240], [180, -280], [-180, -280]], '#c87856');
      poly([[180, -280], [200, -240], [260, 0], [230, 0]], '#8a4830');
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#3a7c46';
      ctx.beginPath();
      ctx.arc(-45, -35, 48, 0, Math.PI * 2); ctx.arc(20, -50, 56, 0, Math.PI * 2);
      ctx.arc(70, -30, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4f9558';
      ctx.beginPath(); ctx.arc(10, -62, 30, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'building': {
      const hgt = 380 + (extra || 0) * 160;
      ctx.fillStyle = '#2a2c48';
      ctx.fillRect(-110, -hgt, 220, hgt);
      ctx.fillStyle = '#383a5c'; ctx.fillRect(-110, -hgt, 40, hgt);
      ctx.fillStyle = '#ffd870';
      const br = makeRng(19 + (extra || 0));
      for (let fy = 30; fy < hgt - 20; fy += 44) {
        for (let fx = -88; fx < 80; fx += 40) {
          if (br() < 0.55) ctx.fillRect(fx, -fy - 22, 22, 26);
        }
      }
      break;
    }
    case 'lamp': {
      const side = extra < 0 ? 90 : -90;
      ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -360);
      ctx.quadraticCurveTo(0, -430, side, -430); ctx.stroke();
      // light pool on the tarmac + radial glow on the head
      const lp = ctx.createRadialGradient(side, -430, 6, side, -430, 150);
      lp.addColorStop(0, '#fff0b0cc'); lp.addColorStop(1, '#fff0b000');
      ctx.fillStyle = lp; ctx.fillRect(side - 150, -580, 300, 300);
      ctx.fillStyle = '#fff0b0';
      ctx.beginPath(); ctx.arc(side, -430, 22, 0, Math.PI * 2); ctx.fill();
      if (s > 0.06) {
        ctx.fillStyle = '#fff0b014';
        ctx.beginPath(); ctx.ellipse(side, -10, 130, 34, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'sign': {
      ctx.fillStyle = '#d0d4dc'; ctx.fillRect(-14, -220, 28, 220);
      ctx.fillStyle = '#20489c'; ctx.fillRect(-120, -330, 240, 120);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(-108, -318, 216, 96);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 64px system-ui';
      ctx.textAlign = 'center'; ctx.fillText('⇧', 0, -248);
      break;
    }
    case 'billboard': {
      // sun-bleached warm boards that stay inside the biome palette
      const ads = ['SUNSTRIP', 'TIDEHOLM', 'NEONOID', 'MAGPIE AIR', 'BUBBLE KEEP', 'melvin.me'];
      const cols = ['#c9694a', '#b8845a', '#a05c48', '#c99a4a', '#8a6a52', '#7c8a5c'];
      const nAd = (extra || 0) % ads.length;
      ctx.fillStyle = '#8a7a68'; ctx.fillRect(-160, -140, 20, 140); ctx.fillRect(140, -140, 20, 140);
      ctx.fillStyle = '#f5e9d2'; ctx.fillRect(-200, -320, 400, 190);
      ctx.strokeStyle = cols[nAd]; ctx.lineWidth = 14; ctx.strokeRect(-200, -320, 400, 190);
      ctx.fillStyle = cols[nAd]; ctx.font = 'bold italic 56px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(ads[nAd], 0, -206);
      break;
    }
    case 'gantry': {
      const L = extra && extra.L || '', R = extra && extra.R || '';
      ctx.fillStyle = '#8a94a4';
      ctx.fillRect(-2300, -1250, 90, 1250); ctx.fillRect(2210, -1250, 90, 1250);
      ctx.fillStyle = '#a8b0bc';
      ctx.fillRect(-2300, -1250, 4600, 110);
      ctx.fillStyle = '#0f7c3c'; ctx.fillRect(-2080, -1130, 1900, 430);
      ctx.fillStyle = '#0f7c3c'; ctx.fillRect(180, -1130, 1900, 430);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 26;
      ctx.strokeRect(-2080, -1130, 1900, 430); ctx.strokeRect(180, -1130, 1900, 430);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 240px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('◄ ' + L, -1130, -830);
      ctx.fillText(R + ' ►', 1130, -830);
      break;
    }
    case 'divider': {
      poly([[-30, 0], [30, 0], [0, -170]], '#e8b028');
      ctx.fillStyle = '#332'; ctx.fillRect(-8, -110, 16, 60);
      break;
    }
    case 'chevron': {
      // crash-board capping the fork island tip
      ctx.fillStyle = '#c8b038'; ctx.fillRect(-120, -240, 240, 240);
      ctx.fillStyle = '#1a1a20';
      for (let i = 0; i < 3; i++) {
        poly([[-120, -60 - i * 80], [0, -120 - i * 80], [120, -60 - i * 80],
              [120, -30 - i * 80], [0, -90 - i * 80], [-120, -30 - i * 80]], '#1a1a20');
      }
      break;
    }
  }
  ctx.restore();
}

// traffic car, rear view — silver has a dark glasshouse so it never vanishes
function drawTrafficCar(x, y, s, kind) {
  if (s <= 0.004) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const cols = [['#2a5cc8', '#1a3c88'], ['#d0d2d8', '#9aa0ac'], ['#e8a020', '#b87818']];
  const [c1, c2] = cols[kind % 3];
  ctx.fillStyle = 'rgba(20,24,32,0.5)';
  ctx.beginPath(); ctx.ellipse(0, 14, 250, 36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#14141a';
  ctx.beginPath();
  ctx.roundRect(-196, -66, 66, 74, 10); ctx.roundRect(130, -66, 66, 74, 10);
  ctx.fill();
  poly([[-180, -40], [180, -40], [165, -150], [-165, -150]], c1);
  poly([[-165, -150], [165, -150], [120, -240], [-120, -240]], c2);
  ctx.fillStyle = '#101820ee'; ctx.fillRect(-110, -228, 220, 70);
  ctx.fillStyle = '#ffe0a855'; ctx.fillRect(-165, -150, 330, 6);
  ctx.fillStyle = '#e83030';
  ctx.fillRect(-172, -120, 60, 26); ctx.fillRect(112, -120, 60, 26);
  ctx.restore();
}

// the player's car — low red coupe with banking, body light and exhaust haze
function drawPlayerCar(x, y, s, steerPose, braking, spinT, frac = 0, night = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (spinT > 0) ctx.rotate(Math.sin(spinT * 18) * 0.3);
  else ctx.rotate(steerPose * 0.026);          // chassis roll into the corner
  const sk = steerPose * 18;                    // shear toward the apex

  // shadow: stretched toward the camera, skewed by steering
  ctx.fillStyle = 'rgba(16,20,28,0.45)';
  ctx.beginPath(); ctx.ellipse(sk * 0.4, 16, 290, 40, 0, 0, Math.PI * 2); ctx.fill();

  // exhaust shimmer at speed
  if (frac > 0.45) {
    ctx.fillStyle = `rgba(225,228,236,${(0.05 + frac * 0.07).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(-150 + sk * 0.3, -16, 26 + frac * 14, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(150 + sk * 0.3, -14, 24 + frac * 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // tires: arcs merged into the silhouette, offset opposite the roll
  ctx.fillStyle = '#101016';
  ctx.beginPath();
  ctx.roundRect(-240 - sk * 0.25, -70, 84, 86, 14);
  ctx.roundRect(156 - sk * 0.25, -70, 84, 86, 14);
  ctx.fill();
  ctx.fillStyle = '#2e2e38';
  ctx.fillRect(-222 - sk * 0.25, -52, 48, 54); ctx.fillRect(174 - sk * 0.25, -52, 48, 54);

  // body: vertical gradient, roof light to rocker dark
  const bg = ctx.createLinearGradient(0, -260, 0, -30);
  bg.addColorStop(0, '#e04038'); bg.addColorStop(0.55, '#c22622'); bg.addColorStop(1, '#8f1f1c');
  poly([[-228, -38], [228, -38], [206 + sk, -160], [-206 + sk, -160]], '#000');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-228, -38); ctx.lineTo(228, -38); ctx.lineTo(206 + sk, -160);
  ctx.lineTo(138 + sk, -252); ctx.lineTo(-138 + sk, -252); ctx.lineTo(-206 + sk, -160);
  ctx.closePath(); ctx.fill();

  // warm rim light along the sun-facing upper edges
  ctx.strokeStyle = 'rgba(255,217,160,0.75)'; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-138 + sk, -252); ctx.lineTo(138 + sk, -252);
  ctx.moveTo(-206 + sk, -160); ctx.lineTo(-138 + sk, -252);
  ctx.moveTo(206 + sk, -160); ctx.lineTo(138 + sk, -252);
  ctx.stroke();

  // rear window
  ctx.fillStyle = '#182030dd';
  poly([[-124 + sk, -244], [124 + sk, -244], [100 + sk, -180], [-100 + sk, -180]], '#182030dd');
  // side vents (Testarossa strakes)
  ctx.fillStyle = '#801410';
  for (let i = 0; i < 5; i++) ctx.fillRect(-150 + i * 66 + sk * 0.5, -140, 40, 8);
  // full-width tail light strip
  ctx.fillStyle = '#2a2a33';
  ctx.fillRect(-206, -70, 412, 18);
  ctx.fillStyle = braking ? '#ff5040' : (night ? '#ff4a38' : '#e83a30');
  ctx.fillRect(-196, -94, 392, 24);
  if (night) { ctx.fillStyle = '#ff503033'; ctx.fillRect(-216, -108, 432, 52); }
  ctx.fillStyle = '#1a1a20';
  for (let i = 1; i < 6; i++) ctx.fillRect(-196 + i * 65, -92, 6, 24);
  if (braking) {
    ctx.fillStyle = '#ff504055';
    ctx.fillRect(-212, -104, 424, 48);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// road renderer — classic segmented projection with hills, curves and fog
function drawRoad() {
  const S = B.S;
  const pal = PAL[S.stageKey];
  const segs = S.stage.segments;
  const N = segs.length;
  const baseIdx = Math.floor(S.z / CFG.segLen);
  const basePct = (S.z % CFG.segLen) / CFG.segLen;
  const baseSeg = segs[baseIdx % N];
  const playerY = baseSeg.y + (segs[(baseIdx + 1) % N].y - baseSeg.y) * basePct;
  const camY = playerY + CFG.cameraHeight;
  const camX = S.playerX * CFG.roadWidth;
  const frac = S.speed / CFG.maxSpeed;

  let x = 0;
  let dx = -(baseSeg.curve * basePct);
  let maxY = H;
  const rows = [];

  const farP = project(camX, playerY, S.z + CFG.drawDist * CFG.segLen * 0.9, camX, camY, S.z, W, H);
  const horizonY = Math.min(H - 80, Math.max(120, farP.y));
  drawBackground(pal, horizonY, S.stage.def.seed, S.stageNo);

  // ground fill below the horizon
  ctx.fillStyle = pal.grass[0];
  ctx.fillRect(0, horizonY + (pal.sea ? 42 : 0), W, H - horizonY);

  // atmospheric haze where the ground meets the sky
  const hz = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 44);
  hz.addColorStop(0, pal.fog + '55'); hz.addColorStop(1, pal.fog + '00');
  ctx.fillStyle = hz; ctx.fillRect(0, horizonY - 4, W, 48);

  let prev = null;
  for (let n = 0; n < CFG.drawDist; n++) {
    const idx = (baseIdx + n) % N;
    const seg = segs[idx];
    const segZ = (baseIdx + n) * CFG.segLen;
    const p = project(0, seg.y, segZ, camX - x, camY, S.z, W, H);
    x += dx; dx += seg.curve;

    rows[n] = { p, idx, clip: maxY };

    if (!prev) { prev = { p, idx }; continue; }
    if (p.y >= maxY || p.y >= prev.p.y) { prev = { p, idx }; rows[n].hidden = true; continue; }

    const light = Math.floor(idx / CFG.rumbleLen) % 2 === 0;
    const fogT = Math.min(1, Math.pow(n / CFG.drawDist, 2) * CFG.fogDensity / 3);
    const grass = mix(light ? pal.grass[0] : pal.grass[1], pal.fog, fogT);
    const road = mix(light ? pal.road[0] : pal.road[1], pal.fog, fogT);
    const rumble = mix(light ? pal.rumble[0] : pal.rumble[1], pal.fog, fogT);

    ctx.fillStyle = grass;
    ctx.fillRect(0, p.y, W, prev.p.y - p.y);
    const rw1 = prev.p.w * 1.14, rw2 = p.w * 1.14;
    poly([[prev.p.x - rw1, prev.p.y], [prev.p.x + rw1, prev.p.y], [p.x + rw2, p.y], [p.x - rw2, p.y]], rumble);
    poly([[prev.p.x - prev.p.w, prev.p.y], [prev.p.x + prev.p.w, prev.p.y], [p.x + p.w, p.y], [p.x - p.w, p.y]], road);
    if ((light || n < 45) && p.w > 8) {
      const lane = mix(pal.lane, pal.fog, fogT);
      for (let l = 1; l < CFG.lanes; l++) {
        const t1 = -1 + 2 * l / CFG.lanes, lw1 = prev.p.w * 0.014 + 1, lw2 = p.w * 0.014 + 1;
        poly([
          [prev.p.x + prev.p.w * t1 - lw1, prev.p.y], [prev.p.x + prev.p.w * t1 + lw1, prev.p.y],
          [p.x + p.w * t1 + lw2, p.y], [p.x + p.w * t1 - lw2, p.y],
        ], lane);
      }
    }
    // fork: a triangular kerbed island grows until the road properly splits
    if (seg.fork) {
      const fs = N - CFG.forkSegs;
      const into = (idx - fs) / CFG.forkSegs;
      if (into > 0.15) {
        const t = Math.pow((into - 0.15) / 0.85, 1.15);
        const mw1 = prev.p.w * 0.30 * t, mw2 = p.w * 0.30 * t;
        poly([[prev.p.x - mw1 * 1.12, prev.p.y], [prev.p.x + mw1 * 1.12, prev.p.y],
              [p.x + mw2 * 1.12, p.y], [p.x - mw2 * 1.12, p.y]],
             mix(light ? pal.rumble[0] : pal.rumble[1], pal.fog, fogT));
        poly([[prev.p.x - mw1, prev.p.y], [prev.p.x + mw1, prev.p.y], [p.x + mw2, p.y], [p.x - mw2, p.y]],
             mix(pal.grass[0], pal.fog, fogT));
      }
    }
    maxY = p.y;
    prev = { p, idx };
  }

  // near-field ground shading so the foreground never reads as a flat slab
  const fgg = ctx.createLinearGradient(0, H * 0.74, 0, H);
  fgg.addColorStop(0, 'rgba(18,20,28,0)'); fgg.addColorStop(1, 'rgba(18,20,28,0.16)');
  ctx.fillStyle = fgg; ctx.fillRect(0, H * 0.74, W, H * 0.26);

  // sprites and traffic, back to front
  for (let n = CFG.drawDist - 1; n > 0; n--) {
    const row = rows[n];
    if (!row) continue;
    const seg = segs[row.idx];
    const fogT = Math.min(1, Math.pow(n / CFG.drawDist, 2) * CFG.fogDensity / 3);
    if (fogT > 0.92) continue;

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, row.clip); ctx.clip();
    ctx.globalAlpha = 1 - fogT * 0.85;
    for (const sp of seg.sprites) {
      const sx = row.p.x + row.p.w * sp.off;
      const sc = row.p.w / 660;
      if (sp.kind === 'gantry') {
        const kids = STAGE_TREE[S.stageKey];
        drawSprite('gantry', row.p.x, row.p.y, row.p.w / 2100,
          pal, kids ? { L: STAGES[kids.L].name.split(' ')[0], R: STAGES[kids.R].name.split(' ')[0] } : null);
      } else if (sp.kind === 'divider') {
        const firstDivider = row.idx < N - CFG.forkSegs + 80;
        drawSprite(firstDivider ? 'chevron' : 'divider', row.p.x, row.p.y, row.p.w / (firstDivider ? 900 : 1100), pal, 0);
      } else {
        drawSprite(sp.kind, sx, row.p.y, sc, pal, sp.n !== undefined ? sp.n : sp.off);
      }
    }
    for (const c of S.traffic) {
      if (Math.floor(c.z / CFG.segLen) % N === row.idx) {
        const cx = row.p.x + row.p.w * c.lane;
        drawTrafficCar(cx, row.p.y, row.p.w / 1500, c.kind);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // player car
  const bounceY = Math.sin(B.bounce) * frac * 4;
  const offroad = Math.abs(S.playerX) > 1.02;
  const steerPose = input.steer !== 0 ? input.steer : Math.sign(-baseSeg.curve * frac || 0) * 0.4;
  if (pal.city) {
    const hw = ctx.createLinearGradient(0, H * 0.52, 0, H - 80);
    hw.addColorStop(0, 'rgba(255,240,190,0)'); hw.addColorStop(1, 'rgba(255,240,190,0.10)');
    poly([[W / 2 - 60, H - 80], [W / 2 + 60, H - 80], [W / 2 + 190, H * 0.52], [W / 2 - 190, H * 0.52]], '#0000');
    ctx.fillStyle = hw;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 160, H - 80); ctx.lineTo(W / 2 + 160, H - 80);
    ctx.lineTo(W / 2 + 60, H * 0.52); ctx.lineTo(W / 2 - 60, H * 0.52);
    ctx.closePath(); ctx.fill();
  }
  drawPlayerCar(W / 2, H - 52 + bounceY, 0.62, steerPose, input.brake, S.spin, frac, pal.city);

  // offroad dust kicked over the shoulder
  if (offroad && S.speed > 800) {
    const dr = makeRng(Math.floor(B.bounce * 7) + 3);
    ctx.fillStyle = 'rgba(210,190,150,0.55)';
    for (let i = 0; i < 12; i++) {
      const px = W / 2 + (dr() - 0.5) * 420, py = H - 30 - dr() * 90;
      const ps = 4 + dr() * 14;
      ctx.beginPath(); ctx.arc(px, py, ps, 0, Math.PI * 2); ctx.fill();
    }
  }

  // speed streaks pull the corners in at full attack
  if (frac > 0.68) {
    const sa = (frac - 0.68) / 0.32 * 0.34;
    ctx.strokeStyle = `rgba(255,255,255,${sa.toFixed(3)})`;
    ctx.lineWidth = 3;
    const STREAKS = [
      [200, 0.10, 30], [160, 0.34, 10], [230, 0.58, 20], [180, 0.82, 26],
      [W - 200, 0.14, -30], [W - 160, 0.38, -10], [W - 230, 0.62, -20], [W - 180, 0.86, -26],
    ];
    const band0 = horizonY + 36, band1 = H - 120;
    for (const [x1, ft, slope] of STREAKS) {
      const y1 = band0 + (band1 - band0) * ft;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.sign(x1 - W / 2) * (150 + 120 * ft), y1 + slope); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// HUD
function hudText(txt, x, y, size, color, align = 'left', italic = true, stroke = true) {
  ctx.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  if (stroke) { ctx.lineWidth = Math.max(3, size / 9); ctx.strokeStyle = '#101828'; ctx.strokeText(txt, x, y); }
  ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

function drawHUD() {
  const S = B.S;
  // top scrim, deep enough to hold labels over any sky
  const g = ctx.createLinearGradient(0, 0, 0, 118);
  g.addColorStop(0, 'rgba(8,10,20,0.66)'); g.addColorStop(1, 'rgba(8,10,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 118);

  // the timer owns the screen: biggest element, red panic under 15s
  const low = S.time < 15;
  const pulse = low ? 1 + Math.sin(performance.now() / 90) * 0.09 : 1;
  hudText('TIME', W / 2, 26, 17, '#c3d2e8', 'center');
  hudText(String(Math.ceil(S.time)), W / 2, 84, Math.round(58 * pulse), low ? '#ff3040' : '#ffd84a', 'center');

  hudText('SCORE', W - 36, 26, 17, '#c3d2e8', 'right');
  hudText(String(Math.floor(S.score)).padStart(7, '0'), W - 36, 62, 28, '#f4f6fa', 'right');

  hudText('STAGE ' + S.stageNo + '/3', 36, 26, 17, '#c3d2e8');
  hudText(STAGES[S.stageKey].name, 36, 60, 26, '#f4f6fa');

  // speed cluster: feathered corner scrim, baseline-aligned unit, safe margins
  const sg = ctx.createRadialGradient(W - 80, H - 50, 30, W - 80, H - 50, 400);
  sg.addColorStop(0, 'rgba(8,10,20,0.62)'); sg.addColorStop(1, 'rgba(8,10,20,0)');
  ctx.fillStyle = sg; ctx.fillRect(W - 480, H - 260, 480, 260);
  hudText(String(kmh(S.speed)), W - 118, H - 30, 58, '#f4f6fa', 'right');
  hudText('KM/H', W - 30, H - 34, 23, '#c3d2e8', 'right');

  // fork approach: echo the route choice at HUD scale
  const seg = segmentAt(S.stage, S.z);
  const kids = STAGE_TREE[S.stageKey];
  if (seg.fork && kids) {
    const fs = S.stage.segments.length - CFG.forkSegs;
    const idx = Math.floor(S.z / CFG.segLen) % S.stage.segments.length;
    const into = Math.max(0, (idx - fs) / CFG.forkSegs);
    const sc = 0.72 + into * 0.55;
    const by = H * 0.34;
    const base = Math.min(1, into * 4);
    const leftPick = S.playerX < 0;
    for (const [side, txt] of [['L', '◄ ' + STAGES[kids.L].name.split(' ')[0]], ['R', STAGES[kids.R].name.split(' ')[0] + ' ►']]) {
      const chosen = (side === 'L') === leftPick;
      ctx.globalAlpha = base * (chosen ? 1 : 0.45);
      const bx = side === 'L' ? 60 : W - 60 - 300 * sc;
      ctx.fillStyle = '#0f7c3c';
      ctx.beginPath(); ctx.roundRect(bx, by - 34 * sc, 300 * sc, 62 * sc, 10); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.strokeRect(bx + 5, by - 34 * sc + 5, 300 * sc - 10, 62 * sc - 10);
      hudText(txt, bx + 150 * sc, by + 10 * sc, Math.round(26 * sc), '#ffffff', 'center');
    }
    ctx.globalAlpha = 1;
  }

  // touch-zone hints: shown for the first seconds of a run, then gone
  if (B.hintT > 0) {
    ctx.globalAlpha = Math.min(1, B.hintT / 1.2);
    ctx.fillStyle = 'rgba(240,244,250,0.10)';
    ctx.fillRect(0, 0, W * 0.4, H * 0.8);
    ctx.fillRect(W * 0.6, 0, W * 0.4, H * 0.8);
    ctx.fillStyle = 'rgba(232,58,48,0.14)';
    ctx.fillRect(0, H * 0.8, W, H * 0.2);
    hudText('◄', W * 0.2, H * 0.52, 76, '#f4f6fa', 'center');
    hudText('►', W * 0.8, H * 0.52, 76, '#f4f6fa', 'center');
    hudText('HOLD SIDES TO STEER', W / 2, H * 0.52, 26, '#f4f6fa', 'center');
    hudText('BRAKE', W / 2, H * 0.94, 28, '#ffc4bc', 'center');
    ctx.globalAlpha = 1;
  }

  if (B.banner) {
    const a = Math.min(1, B.banner.t * 2, (2.4 - B.banner.t) * 3);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(8,12,24,0.55)';
    ctx.fillRect(0, H * 0.30, W, 110);
    hudText(B.banner.text, W / 2, H * 0.30 + 62, 52, '#ffd84a', 'center');
    if (B.banner.sub) hudText(B.banner.sub, W / 2, H * 0.30 + 98, 22, '#e8ecf4', 'center');
    ctx.globalAlpha = 1;
  }
  if (B.toast) {
    ctx.globalAlpha = Math.min(1, B.toast.t * 3);
    hudText(B.toast.text, W / 2, H * 0.56, 26, '#7ce88a', 'center');
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// title & game-over screens
function drawTitle() {
  const pal = PAL.coast;
  drawBackground(pal, H * 0.58, STAGES.coast.seed, 1.6);
  const cx = W / 2, hy = H * 0.58;
  poly([[0, H], [W, H], [cx + 30, hy], [cx - 30, hy]], '#63646a');
  poly([[cx - 26, H], [cx + 26, H], [cx + 2, hy], [cx - 2, hy]], '#f4f4f4');
  poly([[0, H], [-W * 0.2, H], [cx - 34, hy], [cx - 30, hy]], '#d84840');
  poly([[W, H], [W * 1.2, H], [cx + 34, hy], [cx + 30, hy]], '#d84840');
  poly([[0, H], [cx - 30, hy], [0, hy]], pal.grass[0]);
  poly([[W, H], [cx + 30, hy], [W, hy]], pal.grass[0]);

  // chrome wordmark: hard horizon band, offset drop shadow, opened tracking
  const ty = H * 0.285;
  ctx.textAlign = 'center';
  ctx.save();
  try { ctx.letterSpacing = '6px'; } catch {}
  ctx.font = '900 italic 116px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(30,12,40,0.5)';
  ctx.fillText('SUNSTRIP', cx + 7, ty + 8);
  ctx.lineWidth = 16; ctx.strokeStyle = '#2a1030';
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
  try { ctx.letterSpacing = '4px'; } catch {}
  ctx.font = '600 19px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(16,24,40,0.7)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('DRIVE WEST UNTIL THE SUN GIVES OUT', cx, ty + 52);
  ctx.restore();

  // car fully in frame on the right shoulder
  drawPlayerCar(W * 0.64, H - 46, 0.55, Math.sin(B.titleT * 0.8) * 0.25, false, 0, 0);

  // start prompt: the single entry point, centred and pulsing
  const py = H * 0.70;
  ctx.fillStyle = 'rgba(10,14,26,0.55)';
  ctx.beginPath(); ctx.roundRect(cx - 280, py - 40, 560, 62, 12); ctx.fill();
  if (Math.floor(B.titleT * 1.4) % 2 === 0) {
    hudText(TOUCH ? 'TAP TO DRIVE' : 'PRESS ENTER TO DRIVE', cx, py + 5, 32, '#ffffff', 'center');
  }

  // radio: compact widget, bottom-left
  const rx = 62, ry2 = H - 148;
  ctx.fillStyle = 'rgba(10,14,26,0.74)';
  ctx.beginPath(); ctx.roundRect(rx, ry2, 330, 108, 14); ctx.fill();
  hudText('RADIO  ◄ ►', rx + 165, ry2 + 30, 16, '#9fb4cc', 'center');
  hudText(STATIONS[B.radio].name, rx + 165, ry2 + 66, 23, '#ffd84a', 'center');
  ctx.font = '600 13px system-ui'; ctx.fillStyle = '#9fb4cc'; ctx.textAlign = 'center';
  ctx.fillText(TOUCH ? 'TAP HERE TO TUNE BEFORE YOU DRIVE' : 'TUNE WITH ◄ ► BEFORE YOU DRIVE', rx + 165, ry2 + 92);

  // controls on a full-width bottom scrim
  const csg = ctx.createLinearGradient(0, H - 56, 0, H);
  csg.addColorStop(0, 'rgba(8,10,20,0)'); csg.addColorStop(1, 'rgba(8,10,20,0.72)');
  ctx.fillStyle = csg; ctx.fillRect(0, H - 56, W, 56);
  ctx.font = '600 15px system-ui'; ctx.fillStyle = '#eef2f8'; ctx.textAlign = 'center';
  ctx.fillText(TOUCH ? 'HOLD SIDES TO STEER · BOTTOM EDGE TO BRAKE · AUTO-ACCEL'
                     : '◄ ► STEER · ▼ BRAKE · AUTO-ACCEL · MUTE (M)', cx, H - 18);

  if (B.best > 0) hudText('BEST ' + String(B.best).padStart(7, '0'), W - 36, H - 28, 20, '#ffd84a', 'right');
}

function drawOver() {
  const S = B.S;
  drawRoad();
  ctx.fillStyle = 'rgba(8,10,20,0.66)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  if (S.won) {
    hudText('GOAL!', cx, H * 0.30, 84, '#ffd84a', 'center');
    hudText('ROUTE: ' + S.routeTaken.map((k) => STAGES[k].name.split(' ')[0]).join(' → '), cx, H * 0.40, 24, '#e8ecf4', 'center');
  } else {
    hudText('TIME UP', cx, H * 0.32, 76, '#ff6a4a', 'center');
  }
  hudText('SCORE  ' + String(B.finalScore).padStart(7, '0'), cx, H * 0.52, 40, '#f4f6fa', 'center');
  hudText('BEST   ' + String(B.best).padStart(7, '0'), cx, H * 0.60, 28, B.finalScore >= B.best ? '#7ce88a' : '#9fb4cc', 'center');
  if (B.finalScore >= B.best && B.finalScore > 0) hudText('NEW RECORD', cx, H * 0.665, 22, '#7ce88a', 'center');
  if (B.overT > 1 && Math.floor(B.overT * 1.6) % 2 === 0) {
    hudText(TOUCH ? 'TAP — BACK TO TITLE' : 'ENTER — BACK TO TITLE', cx, H * 0.80, 26, '#ffffff', 'center');
  }
}

// local projection helper for the road pass
function project(wx, wy, wz, camX, camY, camZ, w, h) {
  const dz = Math.max(wz - camZ, 1);
  const scale = CAM_DEPTH / (dz / CFG.segLen);
  return {
    x: Math.round(w / 2 + (scale * (wx - camX)) / CFG.segLen * (w / 2)),
    y: Math.round(h / 2 - (scale * (wy - camY)) / CFG.segLen * (h / 2)),
    w: Math.max(0, (scale * CFG.roadWidth) / CFG.segLen * (w / 2)),
    scale,
  };
}

// ---------------------------------------------------------------------------
// main loop — fixed timestep
let last = performance.now();
let acc = 0;
const DT = 1 / 60;

function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= DT) { update(DT); acc -= DT; }

  ctx.save();
  if (B.shakeT > 0) ctx.translate((Math.random() - 0.5) * 14 * B.shakeT, (Math.random() - 0.5) * 10 * B.shakeT);
  if (B.mode === 'title') drawTitle();
  else if (B.mode === 'race') { drawRoad(); drawHUD(); }
  else drawOver();
  ctx.restore();

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// deterministic screenshot mode: ?shot=<name>&seed=<n>
const params = new URLSearchParams(location.search);
const SHOTS = {
  title:  { mode: 'title' },
  hero:   { key: 'coast',  pos: 'curve', stageNo: 1 },
  palms:  { key: 'palms',  pos: 'curve', stageNo: 2 },
  canyon: { key: 'canyon', pos: 'curve', stageNo: 2 },
  pines:  { key: 'pines',  pos: 'crest', stageNo: 3 },
  dusk:   { key: 'dusk',   steps: 950,   stageNo: 3 },
  desert: { key: 'desert', steps: 850,   stageNo: 3 },
  fork:   { key: 'coast',  pos: 'fork',  stageNo: 1 },
  traffic: { key: 'coast', steps: 300,   stageNo: 1 },
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
  if (cfg.mode === 'title') { B.mode = 'title'; B.titleT = 0.4; renderOnce(); return; }
  const S = newRace(Number(params.get('seed') || 1));
  S.stageKey = cfg.key;
  S.stage = buildStage(cfg.key);
  S.stageNo = cfg.stageNo || 1;
  S.traffic = trafficInitShim(S.stage, 5);
  S.speed = CFG.maxSpeed * 0.92;
  let steps = cfg.steps || 400;
  if (cfg.pos === 'fork') { S.z = S.stage.length - CFG.forkSegs * CFG.segLen * 0.92; S.playerX = -0.45; steps = 1; }
  if (cfg.pos === 'curve') { S.z = (findCurveSeg(S.stage) - 40) * CFG.segLen; steps = 45; }
  for (const c of S.traffic) c.z = (c.z + S.z) % S.stage.length;
  if (cfg.pos === 'crest') { S.z = (findCrestSeg(S.stage) - 55) * CFG.segLen; steps = 45; }
  B.S = S; B.mode = 'race';
  if (TOUCH) B.hintT = 3;
  const inp = { steer: 0, brake: false, accel: true, left: false, right: false };
  for (let i = 0; i < steps; i++) {
    const seg = segmentAt(S.stage, S.z);
    inp.steer = Math.max(-1, Math.min(1, -S.playerX * 1.6 + seg.curve * 0.35));
    stepRace(S, inp, DT);
    B.bgCurve += seg.curve * (S.speed / CFG.maxSpeed) * DT * 14;
    if (S.over) break;
  }
  S.traffic = S.traffic.filter((c) => Math.abs(c.z - S.z) > CFG.segLen * 6);
  input.steer = inp.steer; // freeze the pose the sim ended on
  S.time = Math.max(S.time, 38);
  renderOnce();
}
function trafficInitShim(stage, seed) {
  // deterministic corridor of traffic: near, mid and far cars in every frame
  const rng = makeRng(seed);
  const cars = [];
  for (let i = 0; i < CFG.trafficCount; i++) {
    cars.push({
      z: (i + 1) * CFG.segLen * 14,
      lane: (i % 2 === 0 ? -1 : 1) * 0.62,
      speed: CFG.maxSpeed * (0.35 + 0.1 * rng()),
      kind: i % 3, passed: false,
    });
  }
  return cars;
}
function renderOnce() {
  if (B.mode === 'title') drawTitle();
  else { drawRoad(); drawHUD(); }
  window.__shotReady = true;
}

if (params.has('shot')) {
  runShot(params.get('shot'));
} else {
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
}
