// SUNSTRIP core — pure simulation. No DOM, no audio, no rendering.
// Everything here is imported both by the browser layer (game.js) and by
// the proof suite (proofs.mjs), so it must stay deterministic and side-effect
// free. All randomness flows through makeRng(seed).

export const CFG = {
  segLen: 200,          // world units per road segment
  roadWidth: 1550,      // half-width of the road in world units
  lanes: 3,
  cameraHeight: 1300,
  fov: 100,             // degrees
  drawDist: 260,        // segments rendered
  fogDensity: 4.2,

  maxSpeed: 12000,      // units/s
  accel: 4200,
  brakeDecel: 14000,
  natDecel: 2200,
  offroadDecel: 9000,
  offroadLimit: 3400,   // max speed on grass
  steerSpeed: 2.1,      // playerX units/s at full speed
  centrifugal: 0.36,

  startTime: 70,
  checkpointTime: 42,
  stageSegs: 2000,      // segments per stage
  forkSegs: 260,        // fork zone at the end of a stage
  rumbleLen: 3,         // segments per rumble stripe

  trafficCount: 24,
  trafficMinSpeed: 0.28,
  trafficMaxSpeed: 0.62,
  passBonus: 500,
  crashSpeedKeep: 0.22, // fraction of speed kept after a crash
  spinTime: 1.1,        // seconds of spin-out after a crash
  goalTimeBonus: 1000,  // points per second remaining at the goal
};

export const CAM_DEPTH = 1 / Math.tan((CFG.fov / 2) * Math.PI / 180);

// ---------------------------------------------------------------------------
// deterministic rng (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// stage tree — OutRun-style branching pyramid, three stages per run
export const STAGE_TREE = {
  coast:  { L: 'palms', R: 'canyon' },
  palms:  { L: 'pines', R: 'dusk' },
  canyon: { L: 'dusk',  R: 'desert' },
  pines:  null,
  dusk:   null,
  desert: null,
};

export const STAGES = {
  coast:  { name: 'COCONUT COAST', seed: 101, curviness: 0.55, hilliness: 0.35, sea: true,
            scenery: ['palm', 'palm', 'bush', 'sign', 'rock'] },
  palms:  { name: 'PALM MILE',     seed: 202, curviness: 0.75, hilliness: 0.30, sea: true,
            scenery: ['palm', 'palm', 'palm', 'bush', 'sign'] },
  canyon: { name: 'RED CANYON',    seed: 303, curviness: 0.85, hilliness: 0.75, sea: false,
            scenery: ['rock', 'rock', 'mesa', 'bush', 'sign'] },
  pines:  { name: 'PINE RIDGE',    seed: 404, curviness: 0.65, hilliness: 0.85, sea: false,
            scenery: ['pine', 'pine', 'pine', 'rock', 'sign'] },
  dusk:   { name: 'CHROME CITY',   seed: 505, curviness: 0.60, hilliness: 0.25, sea: false,
            scenery: ['building', 'building', 'lamp', 'sign', 'lamp'] },
  desert: { name: 'MIRAGE FLATS',  seed: 606, curviness: 0.40, hilliness: 0.20, sea: false,
            scenery: ['cactus', 'cactus', 'rock', 'sign', 'bush'] },
};

export function routeDepth(key) {
  let d = 0, k = key;
  const parents = {};
  for (const [p, kids] of Object.entries(STAGE_TREE)) {
    if (kids) { parents[kids.L] = p; parents[kids.R] = p; }
  }
  while (parents[k]) { k = parents[k]; d++; }
  return d;
}

// ---------------------------------------------------------------------------
// stage construction
function ease(a, b, t) { return a + (b - a) * (1 - Math.cos(t * Math.PI)) / 2; }

export function buildStage(key) {
  const def = STAGES[key];
  const rng = makeRng(def.seed);
  const segs = [];
  const n = CFG.stageSegs;

  // build a curve/hill plan out of sections, then rasterize to segments
  let i = 0;
  let lastCurve = 0, lastY = 0;
  let bank = 0; // net curve budget so stages don't drift forever one way
  while (i < n) {
    const remaining = n - i;
    const len = Math.min(remaining, 80 + Math.floor(rng() * 140));
    let curve = 0;
    if (rng() < def.curviness && remaining > 120) {
      curve = (rng() * 4 + 1.5) * (rng() < 0.5 ? 1 : -1);
      // steer the budget back toward zero so proofs of balance hold
      if (Math.abs(bank + curve * len) > Math.abs(bank)) curve = -Math.sign(bank || curve) * Math.abs(curve);
      bank += curve * len;
    }
    let hill = 0;
    if (rng() < def.hilliness) hill = (rng() * 55 + 10) * (rng() < 0.5 ? 1 : -1) * CFG.segLen;

    const startY = lastY;
    for (let j = 0; j < len && i < n; j++, i++) {
      const t = j / len;
      const c = ease(lastCurve, curve, Math.min(1, t * 3)); // ease into curves
      const y = ease(startY, startY + hill, t);
      segs.push({ i, curve: c, y, sprites: [], fork: false });
      lastY = y;
    }
    lastCurve = curve;
  }

  // fork zone: road stays straight and level so the choice reads clearly
  const forkStart = n - CFG.forkSegs;
  const easeBand = 60;
  const preCurve = segs[forkStart - easeBand - 1].curve;
  for (let k = forkStart - easeBand; k < forkStart; k++) {
    segs[k].curve = preCurve * (1 - (k - (forkStart - easeBand)) / easeBand);
  }
  for (let k = forkStart; k < n; k++) {
    segs[k].curve = 0;
    segs[k].y = segs[forkStart - 1].y;
    segs[k].fork = true;
    if (STAGE_TREE[key]) {
      if (k === forkStart + 30 || k === forkStart + 130) segs[k].sprites.push({ kind: 'gantry', off: 0 });
      if (k > forkStart + 60 && k % 10 === 0) segs[k].sprites.push({ kind: 'divider', off: 0 });
    }
  }

  // scenery
  for (let k = 8; k < n; k += 2) {
    if (rng() < 0.55) {
      const kind = def.scenery[Math.floor(rng() * def.scenery.length)];
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (1.6 + rng() * 2.6);
      segs[k].sprites.push({ kind, off });
    }
    // billboards on long straights, facing the player in pairs
    if (k % 250 === 0 && !segs[k].fork) {
      segs[k].sprites.push({ kind: 'billboard', off: -2.2, n: Math.floor(rng() * 6) });
      segs[k].sprites.push({ kind: 'billboard', off: 2.2, n: Math.floor(rng() * 6) });
    }
  }

  return { key, def, segments: segs, length: n * CFG.segLen };
}

// ---------------------------------------------------------------------------
// projection — world point to screen through the camera
export function project(wx, wy, wz, camX, camY, camZ, W, H) {
  const dz = Math.max(wz - camZ, 1e-6);
  const scale = CAM_DEPTH / (dz / CFG.segLen);
  return {
    x: Math.round(W / 2 + (scale * (wx - camX)) * W / 2 / CFG.segLen * 1),
    y: Math.round(H / 2 - (scale * (wy - camY)) * H / 2 / CFG.segLen * 1),
    w: Math.max(0, scale * CFG.roadWidth * W / 2 / CFG.segLen),
    scale,
  };
}

export function segmentAt(stage, z) {
  const n = stage.segments.length;
  const idx = Math.floor(z / CFG.segLen) % n;
  return stage.segments[((idx % n) + n) % n];
}

// ---------------------------------------------------------------------------
// traffic
export function trafficInit(stage, seed) {
  const rng = makeRng(seed);
  const cars = [];
  for (let i = 0; i < CFG.trafficCount; i++) {
    cars.push({
      z: (0.06 + 0.9 * rng()) * stage.length,
      lane: (Math.floor(rng() * CFG.lanes) - (CFG.lanes - 1) / 2) / ((CFG.lanes - 1) / 2) * 0.62,
      speed: (CFG.trafficMinSpeed + rng() * (CFG.trafficMaxSpeed - CFG.trafficMinSpeed)) * CFG.maxSpeed,
      kind: Math.floor(rng() * 3),
      passed: false,
    });
  }
  cars.sort((a, b) => a.z - b.z);
  return cars;
}

export function stepTraffic(cars, stageLength, dt) {
  for (const c of cars) {
    c.z += c.speed * dt;
    if (c.z > stageLength) { c.z -= stageLength; c.passed = false; }
  }
}

// ---------------------------------------------------------------------------
// race state
export function newRace(seed = 1) {
  const stage = buildStage('coast');
  return {
    seed,
    routeTaken: ['coast'],
    stageKey: 'coast',
    stage,
    traffic: trafficInit(stage, seed),
    z: 0,               // player world z within stage
    playerX: 0,         // -1 .. 1 = road edges (times roadWidth)
    speed: 0,
    time: CFG.startTime,
    score: 0,
    distance: 0,
    spin: 0,            // >0 while spinning from a crash
    over: false,
    won: false,
    stageNo: 1,
  };
}

// input: { steer: -1..1, brake: bool, accel: bool }
// returns list of event strings for the browser layer to present
export function stepRace(S, input, dt) {
  const ev = [];
  if (S.over) return ev;

  const seg = segmentAt(S.stage, S.z);
  const offroad = Math.abs(S.playerX) > 1.02;

  // --- speed ---
  if (S.spin > 0) {
    S.spin = Math.max(0, S.spin - dt);
    S.speed = Math.max(0, S.speed - CFG.natDecel * 2 * dt);
  } else if (input.brake) {
    S.speed = Math.max(0, S.speed - CFG.brakeDecel * dt);
  } else if (input.accel) {
    S.speed = Math.min(CFG.maxSpeed, S.speed + CFG.accel * dt);
  } else {
    S.speed = Math.max(0, S.speed - CFG.natDecel * dt);
  }
  if (offroad && S.speed > CFG.offroadLimit) {
    S.speed = Math.max(CFG.offroadLimit, S.speed - CFG.offroadDecel * dt);
  }

  // --- steering + centrifugal pull ---
  const frac = S.speed / CFG.maxSpeed;
  if (S.spin <= 0) S.playerX += input.steer * CFG.steerSpeed * frac * dt;
  S.playerX -= seg.curve * CFG.centrifugal * frac * frac * dt;
  S.playerX = Math.max(-2.2, Math.min(2.2, S.playerX));

  // the fork island is solid — it shoulders the car toward a gate
  if (seg.fork) {
    const fs = S.stage.segments.length - CFG.forkSegs;
    const idx = Math.floor(S.z / CFG.segLen) % S.stage.segments.length;
    if ((idx - fs) / CFG.forkSegs > 0.2 && Math.abs(S.playerX) < 0.3) {
      S.playerX += (S.playerX >= 0 ? 1 : -1) * dt * 1.2;
    }
  }

  // --- move ---
  const dz = S.speed * dt;
  S.z += dz;
  S.distance += dz;
  S.score += dz * 0.01;

  // --- traffic ---
  stepTraffic(S.traffic, S.stage.length, dt);
  for (const c of S.traffic) {
    const gap = c.z - S.z;
    if (!c.passed && gap < 0 && gap > -CFG.segLen * 4 && S.speed > c.speed) {
      c.passed = true;
      S.score += CFG.passBonus;
      ev.push('pass');
    }
    if (S.spin <= 0 && Math.abs(gap) < CFG.segLen * 0.9 &&
        Math.abs(c.lane - S.playerX) < 0.34 && S.speed > c.speed * 1.05) {
      S.spin = CFG.spinTime;
      S.speed = Math.max(c.speed * 0.5, S.speed * CFG.crashSpeedKeep);
      ev.push('crash');
    }
  }

  // --- clock ---
  S.time -= dt;
  if (S.time <= 0) {
    S.time = 0;
    S.over = true;
    S.won = false;
    ev.push('timeout');
    return ev;
  }

  // --- stage end: fork or goal ---
  if (S.z >= S.stage.length) {
    S.z -= S.stage.length;
    const kids = STAGE_TREE[S.stageKey];
    if (!kids) {
      S.over = true;
      S.won = true;
      S.score += S.time * CFG.goalTimeBonus;
      ev.push('goal');
      return ev;
    }
    const side = S.playerX < 0 ? 'L' : 'R';
    const nextKey = kids[side];
    S.stageKey = nextKey;
    S.stage = buildStage(nextKey);
    S.traffic = trafficInit(S.stage, S.seed + S.stageNo * 7919);
    S.stageNo += 1;
    S.routeTaken.push(nextKey);
    S.time += CFG.checkpointTime;
    S.playerX *= 0.4;
    ev.push('checkpoint:' + side);
  }

  return ev;
}

// speed in km/h for the HUD — 12000 u/s reads as 293 km/h
export function kmh(speed) { return Math.round(speed / 41); }

// ---------------------------------------------------------------------------
// determinism helper for proofs
export function stateHash(S) {
  const r = (x) => Math.round(x * 1000) / 1000;
  const t = S.traffic.map((c) => `${r(c.z)}|${r(c.lane)}|${r(c.speed)}`).join(',');
  return [S.stageKey, r(S.z), r(S.playerX), r(S.speed), r(S.time), r(S.score), t].join(';');
}
