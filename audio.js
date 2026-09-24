// SUNSTRIP audio — WebAudio synth: engine, road layers, sfx and three radio
// stations. Everything is generated; nothing is loaded.
//
// Graph: sources → {engine, road, sfx, music} buses → master → compressor → out.
// Music ducks under big sfx; the whole context suspends when the tab hides.

const A = { ctx: null, volume: 0.8, musicVol: 0.8, muted: false };

export const STATIONS = [
  { name: 'SUNSET CRUISE', bpm: 100, root: 45, lead: 'triangle',
    chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    bass: [0, -1, 0, 12, 0, -1, 7, -1],
    arp: [0, 1, 2, 1, 0, 2, 1, 2],
    melody: [[12, -1, 16, 14, 12, -1, 11, 9, 7, -1, 9, -1, 12, -1, -1, -1], [16, -1, 14, 12, 14, -1, 16, 19, 17, -1, 16, 14, 12, -1, -1, -1]] },
  { name: 'CHROME RUSH', bpm: 132, root: 41, lead: 'sawtooth',
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]],
    bass: [0, 0, 12, 0, 0, 12, 10, 12],
    arp: [0, 1, 2, 0, 1, 2, 0, 1],
    melody: [[12, 12, -1, 15, -1, 17, 15, 12, 17, 17, -1, 19, -1, 20, 19, 17], [24, -1, 22, 19, 22, -1, 19, 17, 15, -1, 17, -1, 19, -1, 22, -1]] },
  { name: 'MIRAGE FM', bpm: 112, root: 43, lead: 'square',
    chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [2, 5, 9]],
    bass: [0, -1, 0, -1, 7, -1, 5, -1],
    arp: [2, 1, 0, 1, 2, 1, 0, 1],
    melody: [[-1, 12, -1, 14, -1, 16, -1, 14, 12, -1, 9, -1, 12, -1, -1, -1], [19, -1, 17, 16, -1, 14, 12, -1, 14, -1, 16, -1, 12, -1, -1, -1]] },
];

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function audioUnlock() {
  if (A.ctx) {
    if (A.ctx.state !== 'running' && !document.hidden) A.ctx.resume().catch(() => {});
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  const c = new Ctor();
  A.ctx = c;
  // mix: music, engine and road glue through a gentle bus compressor; sfx skip
  // it so impacts keep their punch. Everything meets at the master, then a
  // limiter and a tanh soft-clip hold the ceiling. (The browser compressor adds
  // its own make-up gain, so none is stacked on top.)
  const clip = c.createWaveShaper();
  const cc = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; cc[i] = Math.tanh(x * 1.1) / Math.tanh(1.1) * 0.9; }
  clip.curve = cc;
  clip.connect(c.destination);
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.001; limiter.release.value = 0.08;
  limiter.connect(clip);
  A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : A.volume;
  A.master.connect(limiter);
  const bus = c.createDynamicsCompressor();
  bus.threshold.value = -24; bus.knee.value = 8; bus.ratio.value = 2;
  bus.attack.value = 0.01; bus.release.value = 0.25;
  bus.connect(A.master);
  for (const b of ['engine', 'road', 'sfx', 'music']) {
    A[b] = c.createGain(); A[b].connect(b === 'sfx' ? A.master : bus);
  }
  A.music.gain.value = 0.42 * A.musicVol;
  A.sfx.gain.value = 1.8;
  A.engine.gain.value = 0;
  A.road.gain.value = 1;

  // one second of white noise, reused by every noisy thing
  const len = c.sampleRate;
  A.noise = c.createBuffer(1, len, c.sampleRate);
  const d = A.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  // engine: two detuned saws + sub square through a gentle drive and lowpass
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
  shaper.curve = curve;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2;
  A.eng = [c.createOscillator(), c.createOscillator(), c.createOscillator()];
  A.eng[0].type = 'sawtooth'; A.eng[1].type = 'sawtooth'; A.eng[1].detune.value = 9; A.eng[2].type = 'square';
  const subG = c.createGain(); subG.gain.value = 0.5;
  A.eng[0].connect(shaper); A.eng[1].connect(shaper); A.eng[2].connect(subG); subG.connect(shaper);
  const pre = c.createGain(); pre.gain.value = 0.55;
  // firing pulse: amplitude-modulate the note at the cylinder rate so it
  // chugs like an engine instead of droning like a pad
  const am = c.createGain(); am.gain.value = 0.72;
  const lfo = c.createOscillator(); lfo.type = 'square';
  const lfoDepth = c.createGain(); lfoDepth.gain.value = 0.28;
  lfo.connect(lfoDepth); lfoDepth.connect(am.gain);
  shaper.connect(lp); lp.connect(am); am.connect(pre); pre.connect(A.engine);
  A.eng.forEach((o) => o.start()); lfo.start();
  A.engLP = lp; A.lfo = lfo;
  A.shiftT = 0; A.lastT = c.currentTime;

  // looping noise layers: intake/wind, tyre squeal, off-road rumble
  const loop = (type, f, q) => {
    const src = c.createBufferSource(); src.buffer = A.noise; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(flt); flt.connect(g); g.connect(A.road); src.start();
    return { g, flt };
  };
  A.wind = loop('bandpass', 900, 0.6);
  // three traffic voices: detuned saw pairs, panned and doppler-pitched per frame
  A.hum = [0, 1, 2].map(() => {
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 18;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = 0;
    let out = g;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    o1.connect(f); o2.connect(f); f.connect(g);
    if (p) { g.connect(p); out = p; }
    out.connect(A.road);
    o1.start(); o2.start();
    return { o1, o2, g, p, f };
  });
  A.squeal = loop('bandpass', 2400, 9);
  A.rumble = loop('lowpass', 180, 1);
  A.lastGear = 1;
  A.duckCar = 0;
}

export function audioSuspend(on) {
  if (!A.ctx) return;
  if (on) A.ctx.suspend().catch(() => {});
  else A.ctx.resume().catch(() => {});
}

export function setVolume(v) {
  A.volume = v;
  if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : v, A.ctx.currentTime, 0.02);
}
export function setMusicVolume(v) {
  A.musicVol = v;
  if (A.music) A.music.gain.setTargetAtTime(0.42 * v, A.ctx.currentTime, 0.05);
}
export function setMuted(m) {
  A.muted = m;
  if (A.master) A.master.gain.setTargetAtTime(m ? 0 : A.volume, A.ctx.currentTime, 0.02);
}
export function isMuted() { return A.muted; }

// everything car-related to silence: pause, outro, results, title
export function engineSilence() {
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  for (const g of [A.engine.gain, A.wind.g.gain, A.squeal.g.gain, A.rumble.g.gain, ...A.hum.map((h) => h.g.gain)]) g.setTargetAtTime(0, t, 0.05);
}

// voices: up to three { gain 0..1, pan -1..1, rate ~1 } for the nearest cars
export function trafficHum(voices) {
  if (!A.ctx || A.ctx.state !== 'running') return;
  const t = A.ctx.currentTime;
  A.hum.forEach((h, i) => {
    const v = voices[i];
    h.g.gain.setTargetAtTime(v ? Math.min(1, v.gain) * 0.12 : 0, t, 0.08);
    if (!v) return;
    h.f.frequency.setTargetAtTime(v.tone || 320, t, 0.1);
    h.o1.frequency.setTargetAtTime(140 * v.rate, t, 0.05);
    h.o2.frequency.setTargetAtTime(140 * v.rate * 1.5, t, 0.05);
    if (h.p) h.p.pan.setTargetAtTime(v.pan, t, 0.05);
  });
}

// per-frame: engine and road layers follow the car
// st: { active, rpm 0..1, gear, throttle, frac, offroad, squeal 0..1 }
export function engineUpdate(st) {
  if (!A.ctx || A.ctx.state !== 'running') return;
  const t = A.ctx.currentTime;
  const dt = Math.max(0, Math.min(0.1, t - A.lastT)); A.lastT = t;
  if (st.gear !== A.lastGear) {
    // upshift: the clutch goes in and the note drops for a beat
    if (st.gear > A.lastGear && st.active) A.shiftT = 0.12;
    A.lastGear = st.gear;
  }
  A.shiftT = Math.max(0, A.shiftT - dt);
  const dip = A.shiftT > 0 ? 0.35 : 1;
  const f = (42 + st.rpm * 118 + st.gear * 5) * (A.shiftT > 0 ? 0.9 : 1);
  A.eng[0].frequency.setTargetAtTime(f, t, 0.04);
  A.eng[1].frequency.setTargetAtTime(f * 1.006, t, 0.04);
  A.eng[2].frequency.setTargetAtTime(f / 2, t, 0.04);
  A.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.04);
  // on throttle the note opens up; lifting closes the filter and softens it
  A.engLP.frequency.setTargetAtTime(220 + st.rpm * 700 + st.throttle * 900, t, 0.06);
  const g = st.active ? (0.026 + st.throttle * 0.02 + st.rpm * 0.016) * dip * (t < A.duckCar ? 0.3 : 1) : 0;
  A.engine.gain.setTargetAtTime(g, t, 0.03);
  A.wind.g.gain.setTargetAtTime(st.active ? st.frac * st.frac * 0.08 : 0, t, 0.1);
  A.wind.flt.frequency.setTargetAtTime(500 + st.frac * 1200, t, 0.1);
  A.squeal.g.gain.setTargetAtTime(st.active ? st.squeal * 0.9 : 0, t, 0.04);
  A.squeal.flt.frequency.setTargetAtTime(2100 + st.squeal * 700 + Math.sin(t * 30) * 80, t, 0.02);
  const rum = st.offroad ? 0.5 : st.kerb ? 0.28 : 0;
  A.rumble.g.gain.setTargetAtTime(st.active ? rum * Math.min(1, st.frac * 3) : 0, t, 0.04);
  A.rumble.flt.frequency.setTargetAtTime(st.kerb ? 90 + Math.sin(t * 60) * 20 : 180, t, 0.02);
  // off-throttle crackle from the exhaust at high revs
  if (st.active && !st.throttle && st.rpm > 0.6 && Math.random() < 5 * (st.dt || 1 / 60)) {
    noise(0.03, 0.12 * Math.random(), 'bandpass', 900 + Math.random() * 1400, 0, 0, 0, 3);
  }
}

// ---------------------------------------------------------------------------
// one-shots
function tone(freq, dur, type = 'square', gain = 0.16, when = 0, bus = A.sfx, slideTo = 0, pan = 0) {
  const c = A.ctx, t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  o.connect(g); out.connect(bus);
  o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, gain, type, f0, f1 = 0, when = 0, pan = 0, q = 1) {
  if (type === 'bandpass') gain *= Math.sqrt(Math.max(1, q));     // a narrow band throws energy away
  const vr = 1 + (Math.random() - 0.5) * 0.16; f0 *= vr; if (f1) f1 *= vr;
  const c = A.ctx, t = c.currentTime + when;
  const src = c.createBufferSource(); src.buffer = A.noise;
  const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g);
  src.loop = true;                 // long hits never run off the end of the buffer
  let out = g;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  out.connect(A.sfx);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function duckCar(time) { A.duckCar = A.ctx.currentTime + time; A.road.gain.cancelScheduledValues(A.ctx.currentTime); A.road.gain.setTargetAtTime(0.3, A.ctx.currentTime, 0.01); A.road.gain.setTargetAtTime(1, A.ctx.currentTime + time, 0.12); }
function duck(amount, time) {
  const t = A.ctx.currentTime, m = A.music.gain, base = 0.42 * A.musicVol;
  m.cancelScheduledValues(t);
  m.setTargetAtTime(base * amount, t, 0.02);
  m.setTargetAtTime(base, t + time, 0.25);
}

export function sfx(name, arg = 0) {
  if (!A.ctx || A.ctx.state !== 'running') return;
  switch (name) {
    case 'crash':
      tone(58, 0.35, 'sine', 0.9, 0, A.sfx, 38);                        // sub thump: the hit you feel
      noise(0.6, 0.9, 'lowpass', 1600, 200);                           // impact, now
      tone(110, 0.35, 'sawtooth', 0.25, 0, A.sfx, 45);
      noise(0.45, 0.35, 'bandpass', 3000, 1600, 0.06, 0, 6);            // then the tyres
      duck(0.35, 0.7); duckCar(0.25);
      break;
    case 'wreck':
      tone(52, 0.5, 'sine', 1.0, 0, A.sfx, 32);
      noise(1.1, 1.0, 'lowpass', 2000, 120);
      tone(90, 0.6, 'sawtooth', 0.3, 0, A.sfx, 35);
      noise(0.4, 0.35, 'bandpass', 2800, 1600, 0.05, 0, 6);
      noise(0.9, 0.25, 'bandpass', 700, 300, 0.25, 0, 2);                 // grinding scrape along the ground
      for (let i = 0; i < 5; i++) noise(0.14, 0.3, 'bandpass', 2400 + Math.random() * 2600, 0, 0.2 + i * 0.13 + Math.random() * 0.05, 0, 18); // metal
      noise(0.5, 0.5, 'lowpass', 900, 100, 0.95);                      // landing
      duck(0.25, 1.6); duckCar(0.3);
      break;
    case 'bump':
      noise(0.18, 0.5, 'lowpass', 900, 200);
      tone(160, 0.12, 'square', 0.1, 0, A.sfx, 90);
      break;
    case 'scrape':
      noise(0.1, 0.12, 'highpass', 3000, 0, 0, 0, 1);
      break;
    case 'pass':
      // doppler: pitch falls as the car goes by on its side
      noise(0.35, 0.9, 'bandpass', 2400, 600, 0, arg, 1.2);
      break;
    case 'near':
      noise(0.45, 1.3, 'bandpass', 3800, 500, 0, arg, 1.6);
      tone(1175, 0.1, 'triangle', 0.08, 0.05);
      break;
    case 'chain': {
      const n = Math.min(12, arg);
      tone(523 * Math.pow(2, n / 12), 0.09, 'square', 0.09);
      tone(784 * Math.pow(2, n / 12), 0.12, 'square', 0.07, 0.06);
      break;
    }
    case 'driftstart':
      noise(0.2, 0.3, 'bandpass', 2600, 1900, 0, 0, 8);    // tyres bite
      break;
    case 'drift':
      [659, 880, 1175].forEach((f, i) => tone(f, 0.1, 'triangle', 0.1, i * 0.05));
      break;
    case 'slip':
      noise(0.6, 0.25, 'bandpass', 400, 1800, 0, 0, 2);
      tone(330, 0.5, 'sawtooth', 0.04, 0, A.sfx, 660);
      break;
    case 'mute':
      break;
    case 'count':
      tone(440, 0.22, 'square', 0.14);
      break;
    case 'go':
      tone(880, 0.5, 'square', 0.16); tone(1320, 0.5, 'square', 0.06);
      break;
    case 'checkpoint':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.12, i * 0.08));
      tone(1047, 0.5, 'triangle', 0.12, 0.34);
      duck(0.5, 0.8); duckCar(0.9);
      break;
    case 'goal':
      [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.18, 'square', 0.12, i * 0.1));
      [[523, 659, 784]].forEach((ch) => ch.forEach((f) => tone(f, 1.4, 'sawtooth', 0.05, 0.85)));
      duck(0.2, 2.4);
      break;
    case 'timeout':
      [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 0.9 : 0.22, 'square', 0.12, i * 0.22));
      duck(0.0, 3);
      break;
    case 'lowtime':
      tone(1200, 0.06, 'square', 0.06);
      break;
    case 'menu':
      tone(660, 0.05, 'square', 0.08);
      break;
    case 'select':
      tone(660, 0.06, 'square', 0.1); tone(990, 0.1, 'square', 0.08, 0.05);
      break;
    case 'tune':
      noise(0.12, 0.12, 'bandpass', 1200, 3000, 0, 0, 3);
      tone(880, 0.05, 'square', 0.06, 0.08);
      break;
  }
}

// ---------------------------------------------------------------------------
// radio: scheduled step sequencer — pad chords, bass, arp, lead, drums.
// Two eight-bar sections (A/B) so the loop breathes instead of droning.
export function musicStart(n) {
  musicStop();
  if (!A.ctx) return;
  const st = STATIONS[n] || STATIONS[0];
  const c = A.ctx;
  const stepDur = 60 / st.bpm / 4;
  const S = { step: 0, next: c.currentTime + 0.08, timer: null, gain: c.createGain(), nodes: [] };
  S.gain.gain.value = 0.0001;
  S.gain.gain.setTargetAtTime(1, c.currentTime, 0.2);
  // a touch of echo on the lead
  const dly = c.createDelay(1); dly.delayTime.value = stepDur * 3;
  const fb = c.createGain(); fb.gain.value = 0.28;
  const wet = c.createGain(); wet.gain.value = 0.3;
  dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(S.gain);
  const padF = c.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 1400; padF.connect(S.gain);
  S.nodes.push(dly, fb, wet, padF);
  S.gain.connect(A.music);

  function voice(type, freq, t, dur, g, dest, attack = 0.005, sustain = false) {
    const o = c.createOscillator(), a = c.createGain();
    o.type = type; o.frequency.value = freq;
    a.gain.setValueAtTime(0.0001, t);
    a.gain.linearRampToValueAtTime(g, t + attack);
    if (sustain) {
      // hold, then release: a pad, not a pluck
      a.gain.setValueAtTime(g, t + dur - 0.35);
      a.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a); a.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return a;
  }
  function hit(t, dur, g, f, type = 'highpass') {
    const src = c.createBufferSource(); src.buffer = A.noise; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f;
    const a = c.createGain();
    a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(a); a.connect(S.gain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  // 32-bar form: A verse, B arp chorus, C breakdown, D lifted chorus
  const FORM = 32;
  function schedule() {
    // background throttling can leave us behind; never replay the past
    if (S.next < c.currentTime) S.next = c.currentTime + 0.05;
    while (S.next < c.currentTime + 0.15) {
      const t = S.next, step = S.step;
      const i = step % 16, bar = Math.floor(step / 16) % FORM;
      const sec = bar < 8 ? 'A' : bar < 16 ? 'B' : bar < 20 ? 'C' : 'D';
      const chord = st.chords[Math.floor(bar / 2) % 4];
      const root = st.root;
      const lift = sec === 'D' ? 12 : 0;
      if (i === 0 && bar % 2 === 0) {
        for (const nn of chord) for (const det of [-7, 7]) {
          voice('sawtooth', midi(root + 24 + nn) * Math.pow(2, det / 1200), t, stepDur * 32, sec === 'C' ? 0.03 : 0.022, padF, 0.4, true);
        }
      }
      if (sec !== 'C' && i % 2 === 0) {
        const b = st.bass[(i / 2) % 8];
        if (b >= 0) voice('sawtooth', midi(root + chord[0] + b), t, stepDur * 1.8, 0.14, S.gain);
      }
      if (sec === 'B' || sec === 'D' || (sec === 'C' && bar >= 18)) {
        const nn = chord[st.arp[i % 8]] + (i % 16 >= 8 ? 12 : 0);
        voice('square', midi(root + 36 + nn), t, stepDur * 0.9, sec === 'C' ? 0.02 : 0.028, S.gain);
      }
      const phrase = st.melody[sec === 'B' ? 1 : 0];
      const l = phrase[i];
      if (l >= 0 && sec !== 'C' && (bar % 2 === 0 || sec === 'D')) {
        const a = voice(st.lead, midi(root + 24 + l + lift * (sec === 'D' && bar % 2 ? 0 : 1)), t, stepDur * 2.2, 0.065, S.gain);
        a.connect(dly);
      }
      if (sec !== 'C' && i % 4 === 0) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(S.gain); o.start(t); o.stop(t + 0.2);
      }
      if (sec !== 'C' && i % 8 === 4) { hit(t, 0.16, 0.2, 1400, 'bandpass'); hit(t, 0.08, 0.12, 4000); }
      if (i % 2 === 1) hit(t, 0.03, sec === 'C' ? 0.07 : 0.05, 7000);
      if ((bar % 8 === 7 || bar === 19) && i >= 12) hit(t, 0.06, 0.12, 2000, 'bandpass');   // fill into the next section
      S.next += stepDur; S.step++;
    }
    S.timer = setTimeout(schedule, 30);
  }
  schedule();
  A.song = S;
}

export function musicStop(fade = 0.08) {
  if (!A.song) return;
  const S = A.song; A.song = null;
  clearTimeout(S.timer);
  if (A.ctx) {
    const t = A.ctx.currentTime;
    S.gain.gain.cancelScheduledValues(t);
    S.gain.gain.setTargetAtTime(0.0001, t, fade);
    setTimeout(() => {
      for (const nd of [S.gain, ...S.nodes]) { try { nd.disconnect(); } catch { /* already gone */ } }
    }, fade * 8000 + 100);
  }
}
