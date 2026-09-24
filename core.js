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
  drawDist: 280,        // segments rendered
  fogDensity: 4.2,

  maxSpeed: 12000,      // units/s (293 km/h)
  accel: 3400,          // at standstill; torque falls away toward top speed
  torqueFade: 0.8,      // fraction of accel lost at top speed (~8s to the top)
  brakeDecel: 11000,
  natDecel: 2600,       // lifting off the throttle
  offroadDecel: 9000,
  offroadLimit: 3600,   // max speed on grass
  slopeGrav: 1800,      // uphill drags, downhill pulls
  steerSpeed: 2.35,     // lateral road-widths/s at full speed and full lock
  steerRamp: 7.5,       // how fast the wheel reaches full lock (1/s)
  centrifugal: 0.62,    // tight bends out-pull full lock at top speed

  // drift: brake-tap while steering at speed, hold the wheel to keep it
  driftMinFrac: 0.55,
  driftSteer: 1.25,     // extra steering authority mid-drift
  driftPull: 0.32,      // centrifugal fraction felt while drifting: the fast line through a hairpin
  driftScrub: 380,      // speed lost per second while sliding
  driftRate: 600,       // drift points per second at full speed, in a bend
  driftPassBonus: 0.5,  // each car passed mid-slide adds half again to the payout
  driftMinBend: 2,      // straights pay nothing: you have to be cornering
  driftMinTime: 0.9,    // shorter slides are flicks, not drifts
  driftGrace: 0.3,      // seconds you can straighten or counter-steer without losing it
  driftHold: 0.3,       // how hard you must keep the wheel over to hold the slide
  driftStraight: 0.5,   // seconds of straight road before a slide dies

  forkSegs: 260,        // fork zone at the end of a stage
  rumbleLen: 3,         // segments per rumble stripe

  trafficBase: 26,
  trafficPerTier: 3,
  trafficCap: 50,
  trafficMinSpeed: 0.26,
  trafficMaxSpeed: 0.6,
  lanePos: [-0.7, 0, 0.7],
  carHit: 0.33,         // lateral overlap that counts as contact: lanes are 0.7 apart, so
  truckHit: 0.44,       // threading two cars needs the lane line to within a hair
  nearMiss: 0.45,       // lateral gap under which a pass is a near miss: a real brush
  fastShare: 0.24,      // share of cars (not trucks) quick enough to tow you
  ghostTime: 1.4,       // post-crash invulnerability so one car can't farm you

  passBonus: 300,
  nearBonus: 1200,
  chainWindow: 4.5,     // seconds a combo survives without a new pass
  chainStep: 3,         // links per multiplier step
  chainCap: 5,
  crashSpeedKeep: 0.25, // fraction of speed kept after a rear-end
  spinTime: 1.1,        // seconds of spin-out after a traffic crash
  wreckTime: 1.3,       // seconds of tumbling after hitting scenery
  slipTime: 0.25,       // seconds tucked behind a car before the tow kicks in
  slipWindow: 12,       // segments behind a car where its wake pulls
  slipBoost: 0.2,       // top-speed gain while towed
  slingBonus: 3000,     // passing the car that towed you: the slingshot
  towMatch: 0.75,       // a wake only pulls if the car is within 25% of your speed
  driftPassCap: 2,      // mid-slide passes that sweeten a drift
  towTime: 1.6,         // the slingshot lasts this long after you pull out
  carryKeep: 0.35,      // share of banked time above carryFree kept at a checkpoint
  carryFree: 10,
  goalTimeBonus: 1500,  // points per second remaining at the goal
  countdown: 3,
};

export const DIFFICULTY = {
  easy:   { time: 1.18, traffic: 0.7, label: 'EASY' },
  normal: { time: 1.05, traffic: 1.0, label: 'NORMAL' },
  hard:   { time: 0.89, traffic: 1.15, label: 'HARD' },
};

export const CAM_DEPTH = 1 / Math.tan((CFG.fov / 2) * Math.PI / 180);
// the car sits this far ahead of the camera: where it is drawn is where it collides
export const PLAYER_Z = CFG.cameraHeight * CAM_DEPTH;

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
// stage tree — the OutRun pyramid: five tiers, fifteen stages, five goals.
// Tier t, column i forks to (t+1, i) on the left and (t+1, i+1) on the right,
// so neighbouring routes merge and every run is exactly five stages.
export const TIERS = [
  ['coast'],
  ['palms', 'canyon'],
  ['pines', 'dusk', 'desert'],
  ['autumn', 'harbor', 'fields', 'volcano'],
  ['snow', 'bay', 'metro', 'savanna', 'lastlight'],
];

export const STAGE_TREE = {};
for (let t = 0; t < TIERS.length; t++) {
  TIERS[t].forEach((k, i) => {
    STAGE_TREE[k] = t + 1 < TIERS.length ? { L: TIERS[t + 1][i], R: TIERS[t + 1][i + 1] } : null;
  });
}

// seconds added at each checkpoint, by the tier being entered
export const CHECKPOINT_TIME = [0, 53, 56, 58, 61];
export const START_TIME = 60;

// every stage: layout character, traffic mood, scenery, and a route bonus that
// pays the harder right-hand branches more at the goal
export const STAGES = {
  coast:   { name: 'COCONUT BEACH',  seed: 101, curviness: 0.55, hilliness: 0.35, traffic: 0.8, bonus: 1.0, extra: 0,
             scenery: ['palm', 'palm', 'bush', 'sign', 'rock', 'palm'] },
  palms:   { name: 'PALM MILE',      seed: 202, curviness: 0.7,  hilliness: 0.3,  traffic: 0.8, bonus: 1.0, extra: 3,
             scenery: ['palm', 'palm', 'palm', 'bush', 'sign'] },
  canyon:  { name: 'RED CANYON',     seed: 303, curviness: 0.85, hilliness: 0.7,  traffic: 1.15, bonus: 1.2, extra: 1,
             scenery: ['rock', 'rock', 'mesa', 'bush', 'sign'] },
  pines:   { name: 'PINE RIDGE',     seed: 404, curviness: 0.65, hilliness: 0.9,  traffic: 0.8, bonus: 1.0, extra: 3,
             scenery: ['pine', 'pine', 'pine', 'rock', 'sign'] },
  dusk:    { name: 'CHROME CITY',    seed: 505, curviness: 0.55, hilliness: 0.25, traffic: 1.1, bonus: 1.15, extra: 1,
             scenery: ['building', 'building', 'lamp', 'sign', 'lamp'] },
  desert:  { name: 'MIRAGE FLATS',   seed: 606, curviness: 0.4,  hilliness: 0.2,  traffic: 1.3, bonus: 1.3, extra: 2,
             scenery: ['cactus', 'cactus', 'rock', 'sign', 'bush'], trucks: 0.3 },
  autumn:  { name: 'AMBER VALLEY',   seed: 707, curviness: 0.75, hilliness: 0.6,  traffic: 0.8, bonus: 1.0, extra: 3,
             scenery: ['maple', 'maple', 'poplar', 'fence', 'sign'] },
  harbor:  { name: 'LANTERN HARBOR', seed: 808, curviness: 0.6,  hilliness: 0.3,  traffic: 1.0, bonus: 1.1, extra: 2,
             scenery: ['lamp', 'palm', 'lamp', 'sign', 'bollard'] },
  fields:  { name: 'GOLDEN FIELDS',  seed: 909, curviness: 0.45, hilliness: 0.45, traffic: 1.15, bonus: 1.2, extra: 1,
             scenery: ['bale', 'windmill', 'poplar', 'fence', 'bale'], trucks: 0.25 },
  volcano: { name: 'ASH VOLCANO',    seed: 1010, curviness: 0.9, hilliness: 0.8,  traffic: 1.35, bonus: 1.35, extra: 0,
             scenery: ['lavarock', 'lavarock', 'rock', 'sign', 'deadtree'] },
  snow:    { name: 'SNOW SUMMIT',    seed: 1111, curviness: 0.8, hilliness: 0.9,  traffic: 0.85, bonus: 1.0, extra: 3,
             scenery: ['snowpine', 'snowpine', 'snowpine', 'rock', 'sign'] },
  bay:     { name: 'LIGHTHOUSE BAY', seed: 1212, curviness: 0.6, hilliness: 0.4,  traffic: 1.0, bonus: 1.1, extra: 2,
             scenery: ['palm', 'bush', 'lighthouse', 'sign', 'palm'] },
  metro:   { name: 'MIDNIGHT METRO', seed: 1313, curviness: 0.55, hilliness: 0.3, traffic: 1.2, bonus: 1.2, extra: 1,
             scenery: ['building', 'building', 'lamp', 'lamp', 'sign'] },
  savanna: { name: 'SAVANNA RUN',    seed: 1414, curviness: 0.5, hilliness: 0.35, traffic: 1.3, bonus: 1.3, extra: 1,
             scenery: ['acacia', 'acacia', 'rock', 'bush', 'sign'], trucks: 0.3 },
  lastlight: { name: 'LAST LIGHT',   seed: 1515, curviness: 0.95, hilliness: 0.7, traffic: 1.45, bonus: 1.45, extra: 2,
             scenery: ['palm', 'rock', 'sign', 'palm', 'lamp'] },
};

// half-width of each scenery kind's solid trunk/base, in road half-widths.
// Zero means the sprite is soft (bushes) and only slows you like grass.
export const HIT = {
  palm: 0.12, pine: 0.16, cactus: 0.12, rock: 0.24, mesa: 0.6, bush: 0, sign: 0.1,
  building: 0.5, lamp: 0.07, billboard: 0.36, maple: 0.14, poplar: 0.1, fence: 0,
  bale: 0.2, windmill: 0.22, bollard: 0.06, lavarock: 0.26, deadtree: 0.1,
  snowpine: 0.16, lighthouse: 0.3, acacia: 0.12,
};
// scenery that must stand well clear of the tarmac
const FAR = { mesa: 2.8, building: 2.4, windmill: 2.4, lighthouse: 2.6 };

export function stageTier(key) {
  for (let t = 0; t < TIERS.length; t++) if (TIERS[t].includes(key)) return t;
  return -1;
}
export function routeDepth(key) { return stageTier(key); }
export function stageSegs(key) { return 2300 + stageTier(key) * 120; }

// ---------------------------------------------------------------------------
// stage construction
function ease(a, b, t) { return a + (b - a) * (1 - Math.cos(t * Math.PI)) / 2; }

export function buildStage(key) {
  const def = STAGES[key];
  const rng = makeRng(def.seed);
  const segs = [];
  const n = stageSegs(key);
  const tier = stageTier(key);

  // a calm run-up out of the checkpoint, then a curve/hill plan of sections
  let i = 0;
  let lastCurve = 0, lastY = 0;
  let bank = 0; // net curve budget so stages don't drift forever one way
  while (i < n) {
    const remaining = n - i;
    const len = i === 0 ? 70 : Math.min(remaining, 70 + Math.floor(rng() * 140));
    let curve = 0;
    if (i > 0 && rng() < def.curviness && remaining > 120) {
      curve = (rng() * (4 + tier * 0.5) + 1.5) * (rng() < 0.5 ? 1 : -1);
      if (Math.abs(bank + curve * len) > Math.abs(bank)) curve = -Math.sign(bank || curve) * Math.abs(curve);
      bank += curve * len;
    }
    let hill = 0;
    if (i > 0 && rng() < def.hilliness) hill = (rng() * 55 + 10) * (rng() < 0.5 ? 1 : -1) * CFG.segLen;

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
    } else if (k === n - 40) {
      segs[k].sprites.push({ kind: 'goalarch', off: 0 });
    }
  }

  // scenery — first segments stay clear so the start line is never blocked
  for (let k = 20; k < n; k += 2) {
    if (rng() < 0.55) {
      const kind = def.scenery[Math.floor(rng() * def.scenery.length)];
      const side = rng() < 0.5 ? -1 : 1;
      const min = FAR[kind] || 1.45;
      const off = side * (min + rng() * 2.4);
      const sp = { kind, off, v: rng() };
      // signs warn of the bend ahead and point its way; else they're mile posts
      if (kind === 'sign') {
        const ahead = segs[Math.min(n - 1, k + 40)].curve;
        sp.dir = Math.abs(ahead) > 2.5 ? Math.sign(ahead) : 0;
        if (!sp.dir) sp.kind = def.scenery[0];
      }
      segs[k].sprites.push(sp);
    }
    // billboards on long straights, facing the player in pairs
    if (k % 250 === 0 && !segs[k].fork) {
      segs[k].sprites.push({ kind: 'billboard', off: -2.2, n: Math.floor(rng() * 6) });
      segs[k].sprites.push({ kind: 'billboard', off: 2.2, n: Math.floor(rng() * 6) });
    }
  }

  return { key, def, tier, segments: segs, length: n * CFG.segLen };
}

// ---------------------------------------------------------------------------
// projection — world point to screen through the camera
export function project(wx, wy, wz, camX, camY, camZ, W, H, depth = CAM_DEPTH) {
  const dz = Math.max(wz - camZ, 1);
  const scale = depth / (dz / CFG.segLen);
  return {
    x: Math.round(W / 2 + (scale * (wx - camX)) * W / 2 / CFG.segLen),
    y: Math.round(H / 2 - (scale * (wy - camY)) * H / 2 / CFG.segLen),
    w: Math.max(0, scale * CFG.roadWidth * W / 2 / CFG.segLen),
    scale,
  };
}

export function segmentAt(stage, z) {
  const n = stage.segments.length;
  const idx = Math.floor(z / CFG.segLen) % n;
  return stage.segments[((idx % n) + n) % n];
}

// fraction of the way through the fork zone (0 before it)
export function forkInto(stage, z) {
  const n = stage.segments.length;
  const idx = Math.floor(z / CFG.segLen);
  return Math.max(0, (idx - (n - CFG.forkSegs)) / CFG.forkSegs);
}
// half-width of the solid fork island at a given progress through the zone
export function islandHalf(into) {
  if (into <= 0.15) return 0;
  return 0.30 * 1.12 * Math.pow((into - 0.15) / 0.85, 1.15);
}

// ---------------------------------------------------------------------------
// traffic
export function trafficCount(stage, difficulty = 'normal') {
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  // multipliers stack (deep tier x busy branch x hard); cap so the densest
  // road on Hard is still a road, not a car park
  return Math.min(CFG.trafficCap, Math.round((CFG.trafficBase + CFG.trafficPerTier * stage.tier) * stage.def.traffic * d.traffic));
}

export function trafficInit(stage, seed, difficulty = 'normal') {
  const rng = makeRng(seed);
  const cars = [];
  const count = trafficCount(stage, difficulty);
  const spread = 0.12 + stage.tier * 0.03;
  for (let i = 0; i < count; i++) {
    const laneIdx = Math.floor(rng() * CFG.lanes);
    const truck = rng() < (stage.def.trucks || 0.1);
    const lo = CFG.trafficMinSpeed, hi = Math.min(0.72, CFG.trafficMaxSpeed + spread * 0.5);
    const fast = !truck && rng() < CFG.fastShare;
    cars.push({
      z: (0.03 + 0.93 * rng()) * stage.length,
      laneIdx, target: laneIdx,
      lane: CFG.lanePos[laneIdx],
      speed: 0,
      cruise: fast ? (0.84 + rng() * 0.1) * CFG.maxSpeed : (lo + rng() * (hi - lo)) * CFG.maxSpeed * (truck ? 0.8 : 1),
      kind: truck ? 3 : fast ? 4 : Math.floor(rng() * 3),
      truck,
      blink: 0,
      lcT: 2 + rng() * 8,   // seconds until this car considers a lane change
      passed: false,
      rng: makeRng((seed * 31 + i * 7919) >>> 0),   // its own stream: one crash can't reshuffle the road
    });
  }
  for (const c of cars) c.speed = c.cruise;
  cars.sort((a, b) => a.z - b.z);
  return cars;
}

// rng is optional: without it cars hold their lanes (proofs rely on that)
// a lane is clear to merge into if nobody is alongside or closing on the gap
function laneClear(cars, c, l) {
  if (l < 0 || l >= CFG.lanes) return false;
  const x = CFG.lanePos[l];
  if (cars.some((o) => o !== c && Math.abs(o.lane - x) < 0.4 && o.z - c.z > -CFG.segLen * 3 && o.z - c.z < CFG.segLen * 8)) return false;
  // and never close the last gap: somebody must leave you a way through
  const busy = new Set([l]);
  for (const o of cars) {
    if (o !== c && Math.abs(o.z - c.z) < CFG.segLen * 5) busy.add(o.target);
  }
  return busy.size < CFG.lanes;
}

// rng is optional: without it cars hold their lanes and speeds (proofs rely on that)
export function stepTraffic(cars, stageLength, dt, stageRng, forkStartZ = Infinity) {
  for (const c of cars) {
    c.z += c.speed * dt;
    if (c.z > stageLength) { c.z -= stageLength; c.passed = false; }
    if (!stageRng) continue;
    const rng = c.rng || stageRng;
    if (c.shove > 0) c.shove -= dt;
    // who's ahead in my lane (or the one I'm heading for)?
    let ahead = null, gapA = Infinity;
    for (const o of cars) {
      if (o === c) continue;
      const g = o.z - c.z;
      if (g > 0 && g < CFG.segLen * 16 && g < gapA && (Math.abs(o.lane - c.lane) < 0.4 || Math.abs(o.lane - CFG.lanePos[c.target]) < 0.4)) { ahead = o; gapA = g; }
    }
    const cruise = c.cruise || c.speed;
    let want = cruise;
    if (ahead && ahead.speed < cruise) {
      // try to pull round; if boxed in, queue at their pace (a tow for you)
      if (c.blink <= 0 && c.laneIdx === c.target && !c.truck) {
        const opts = [c.laneIdx - 1, c.laneIdx + 1].filter((l) => laneClear(cars, c, l));
        if (opts.length) { c.target = opts[Math.floor(rng() * opts.length)]; c.blink = 0.6; }
      }
      // ease down to their pace as the gap closes, never through them
      want = Math.min(cruise, ahead.speed * (gapA < CFG.segLen * 2 ? 0.85 : 1) + Math.sqrt(8000 * Math.max(0, gapA - CFG.segLen * 2)));
    }
    // the fork run-in: traffic hurries through so the one lane on your side is open
    if (c.z > forkStartZ - CFG.segLen * 90 && c.z < forkStartZ + CFG.segLen * CFG.forkSegs && (!ahead || gapA > CFG.segLen * 6)) want = Math.max(want, CFG.maxSpeed * 0.8);
    if (!(c.shove > 0)) c.speed += Math.max(-12000 * dt, Math.min(1500 * dt, want - c.speed));
    // centre-lane cars peel off before the fork island rises
    if (c.z > forkStartZ - CFG.segLen * 70 && c.z < forkStartZ && c.target === 1 && c.blink <= 0) {
      let left = 0, right = 0;
      for (const o of cars) if (Math.abs(o.z - c.z) < CFG.segLen * 30) { if (o.target === 0) left++; if (o.target === 2) right++; }
      c.target = left < right ? 0 : left > right ? 2 : rng() < 0.5 ? 0 : 2; c.blink = 0.9;
    }
    if (c.blink > 0) {
      c.blink -= dt;                     // indicator on: telegraph first
    } else if (c.laneIdx !== c.target) {
      const goal = CFG.lanePos[c.target];
      const step = 0.75 * dt;
      c.lane += Math.sign(goal - c.lane) * Math.min(step, Math.abs(goal - c.lane));
      if (Math.abs(goal - c.lane) < 1e-6) { c.lane = goal; c.laneIdx = c.target; }
    } else if (!c.truck && (c.lcT -= dt) <= 0) {
      c.lcT = 3 + rng() * 8;
      const opts = [c.laneIdx - 1, c.laneIdx + 1].filter((l) => laneClear(cars, c, l));
      if (opts.length) { c.target = opts[Math.floor(rng() * opts.length)]; c.blink = 0.9; }
    }
  }
}

// ---------------------------------------------------------------------------
// race state
export function newRace(seed = 1, difficulty = 'normal') {
  const stage = buildStage('coast');
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  return {
    seed, difficulty,
    rng: stageRng(seed, 'coast'),
    routeTaken: ['coast'],
    splits: [],
    stageKey: 'coast',
    stage,
    traffic: trafficInit(stage, seed, difficulty),
    z: 0,               // player world z within stage
    playerX: 0,         // -1 .. 1 = road edges (times roadWidth)
    steerV: 0,          // the wheel, ramped toward the input
    speed: 0,
    time: START_TIME * d.time,
    stageT: 0,
    totalT: 0,
    score: 0,
    distance: 0,
    countdown: CFG.countdown,
    spin: 0,            // >0 while spinning from a traffic crash
    wreck: 0,           // >0 while tumbling from a scenery hit
    wreckSide: 0,
    ghost: 0,           // >0 while traffic can't hit you
    drift: 0,           // 0 = gripping, ±1 = sliding that way
    driftT: 0, driftPts: 0,
    slip: 0,            // seconds tucked in someone's slipstream
    tow: 0,             // slingshot seconds left after the tuck
    chain: 0, chainT: 0, bestChain: 0,
    passes: 0, nears: 0, crashes: 0, wrecks: 0, drifts: 0,
    over: false,
    won: false,
    stageNo: 1,
  };
}

export function stageRng(seed, key) {
  let h = seed ^ 0x5eed;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return makeRng(h >>> 0);
}

// medals: time still on the clock at the goal. Carry-over is taxed, so what can
// be left is set by the final stage's allowance (plus the tax-free bank), not
// the whole route. The share falls with difficulty: every mode has gold to chase.
export const MEDAL_SHARE = { easy: 0.42, normal: 0.36, hard: 0.16 };
export function medalLine(route, difficulty = 'normal') {
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const last = route[route.length - 1];
  const final = (CHECKPOINT_TIME[stageTier(last)] + (STAGES[last].extra || 0)) * d.time + CFG.carryFree;
  return final * (MEDAL_SHARE[difficulty] || 0.3);
}
export function timeAllowance(route, difficulty = 'normal') {
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  let t = START_TIME * d.time;
  route.forEach((k, i) => { if (i > 0) t += (CHECKPOINT_TIME[stageTier(k)] + (STAGES[k].extra || 0)) * d.time; });
  return t;
}
export function medalFor(route, difficulty, timeLeft) {
  const gold = medalLine(route, difficulty);
  return timeLeft >= gold ? 'GOLD' : timeLeft >= gold / 2 ? 'SILVER' : 'BRONZE';
}

export function comboMult(S) { return Math.min(CFG.chainCap, 1 + Math.floor(S.chain / CFG.chainStep)); }

function bumpChain(S, n) {
  S.chain += n; S.chainT = CFG.chainWindow;
  if (S.chain > S.bestChain) S.bestChain = S.chain;
}
function breakChain(S) { S.chain = 0; S.chainT = 0; }
// points earned on a stage are weighted by that road's difficulty
function award(S, base) { return Math.round(base * comboMult(S) * S.stage.def.bonus / 10) * 10; }

// contact forfeits the slide: you don't get paid for a drift that ends in a wall
function endDrift(S, ev, forfeit = false) {
  if (S.drift && !forfeit && S.driftBendT >= CFG.driftMinTime && S.driftPts > 0) {
    const pts = award(S, S.driftPts * (1 + CFG.driftPassBonus * Math.min(CFG.driftPassCap, S.driftPasses || 0)));
    S.score += pts; S.drifts++;
    bumpChain(S, 1);
    ev.push('drift:' + pts);
  }
  S.drift = 0; S.driftT = 0; S.driftPts = 0; S.driftOff = 0; S.driftBendT = 0; S.driftPasses = 0; S.driftStr = 0;
}

// the car's own z: the camera trails it by PLAYER_Z
export function carZ(S) { return S.z + PLAYER_Z; }

// input: { steer: -1..1, brake: bool, accel: bool }
// returns list of event strings for the browser layer to present
export function stepRace(S, input, dt) {
  const ev = [];
  if (S.over) return ev;

  // --- start lights ---
  if (S.countdown > 0) {
    const before = Math.ceil(S.countdown);
    S.countdown = Math.max(0, S.countdown - dt);
    const after = Math.ceil(S.countdown);
    if (after !== before) ev.push(after > 0 ? 'count:' + after : 'go');
    return ev;
  }

  const segs = S.stage.segments;
  const N = segs.length;
  const len = S.stage.length;
  // everything physical happens at the car, which runs ahead of the camera;
  // past the stage end the road is the level fork run-out
  const cz = Math.min(carZ(S), len - 1);
  const seg = segmentAt(S.stage, cz);
  // the stage ends level; never read the grade across the wrap to segment 0
  const next = cz + CFG.segLen < len ? segmentAt(S.stage, cz + CFG.segLen) : seg;
  const offroad = Math.abs(S.playerX) > 1.02;
  const stunned = S.spin > 0 || S.wreck > 0;
  S.stageT += dt; S.totalT += dt;
  if (S.ghost > 0) S.ghost = Math.max(0, S.ghost - dt);

  // --- the wheel ramps toward the stick, snappier when reversing ---
  const want = stunned ? 0 : Math.max(-1, Math.min(1, input.steer || 0));
  const rate = CFG.steerRamp * (Math.sign(want) !== Math.sign(S.steerV) ? 1.6 : 1);
  S.steerV += Math.max(-rate * dt, Math.min(rate * dt, want - S.steerV));

  // --- drift: tap brake while turning hard at speed, hold the slide ---
  let frac = S.speed / CFG.maxSpeed;
  if (!S.drift && !stunned && input.brake && Math.abs(S.steerV) > 0.6 && frac > CFG.driftMinFrac && !offroad) {
    S.drift = Math.sign(S.steerV); S.driftOff = 0;
    ev.push('driftstart');
  }
  if (S.drift) {
    // a moment of straightening or counter-steer is allowed; holding it isn't
    S.driftOff = want * S.drift >= CFG.driftHold ? 0 : (S.driftOff || 0) + dt;
    S.driftStr = Math.abs(seg.curve) > CFG.driftMinBend ? 0 : (S.driftStr || 0) + dt;
    if (stunned || offroad || S.driftOff > CFG.driftGrace || S.driftStr > CFG.driftStraight || frac < CFG.driftMinFrac * 0.8) endDrift(S, ev);
  }

  // --- speed ---
  if (S.tow > 0) S.tow = Math.max(0, S.tow - dt);
  const towed = S.tow > 0;
  const top = CFG.maxSpeed * (towed ? 1 + CFG.slipBoost : 1);
  if (S.wreck > 0) {
    S.wreck = Math.max(0, S.wreck - dt);
    // momentum carries the tumble forward before it grinds to a halt
    S.speed = Math.max(0, S.speed - CFG.brakeDecel * 0.2 * dt);
    // the sliding wreck flattens whatever else is on its line along the verge
    const wi = Math.floor(carZ(S) / CFG.segLen);
    for (let k = 0; k < 3 && wi + k < segs.length; k++) for (const sp of segs[wi + k].sprites) {
      if (HIT[sp.kind] && Math.abs(sp.off - S.playerX) < HIT[sp.kind] + 0.35) sp.down = true;
    }
    // marshals put you back on the road when the tumble ends
    if (S.wreck <= 0) { S.wreckStopZ = undefined; S.playerX = S.wreckSide * 0.62; S.speed = 3000; ev.push('recover'); }
  } else if (S.spin > 0) {
    S.spin = Math.max(0, S.spin - dt);
    // the spin carries you on a little: never parked while still rotating
    S.speed = Math.max(Math.min(S.speed, 2600), S.speed - CFG.natDecel * 1.6 * dt);
  } else if (S.drift) {
    // drifting holds momentum; throttle keeps it lit, brake scrubs harder
    S.speed = Math.max(0, S.speed - (CFG.driftScrub + (input.brake ? 2000 : 0) - (input.accel ? 200 : 0)) * dt);
  } else if (input.brake) {
    S.speed = Math.max(0, S.speed - CFG.brakeDecel * dt);
  } else if (input.accel) {
    const a = CFG.accel * (1 - CFG.torqueFade * Math.min(1, S.speed / top)) * (towed ? 1.6 : 1);
    S.speed = S.speed > top ? Math.max(top, S.speed - CFG.natDecel * dt) : Math.min(top, S.speed + a * dt);
  } else {
    S.speed = Math.max(0, S.speed - CFG.natDecel * dt);
  }
  // hills: climbing costs speed, descending gives a little back
  const grade = (next.y - seg.y) / CFG.segLen;
  if (S.speed > 0 && !stunned) S.speed = Math.max(0, Math.min(top * 1.02, S.speed - grade * CFG.slopeGrav * dt));
  if (offroad && S.speed > CFG.offroadLimit) {
    S.speed = Math.max(CFG.offroadLimit, S.speed - CFG.offroadDecel * dt);
  }
  S.speed = Math.max(0, Math.min(CFG.maxSpeed * (1 + CFG.slipBoost), S.speed));

  // --- steering + centrifugal pull ---
  frac = S.speed / CFG.maxSpeed;
  const grip = S.drift ? CFG.driftSteer : 1;
  const pull = S.drift ? CFG.driftPull : 1;
  if (!stunned) S.playerX += S.steerV * CFG.steerSpeed * grip * Math.min(1, 0.3 + frac) * (S.speed > 50 ? 1 : 0) * dt;
  S.playerX -= seg.curve * CFG.centrifugal * pull * frac * frac * dt;
  S.playerX = Math.max(-2.2, Math.min(2.2, S.playerX));
  if (S.drift) {
    S.driftT += dt;
    // only a slide through a real bend scores
    const bend = Math.abs(seg.curve);
    if (bend > CFG.driftMinBend) { S.driftBendT = (S.driftBendT || 0) + dt; S.driftPts += CFG.driftRate * frac * (bend / 4) * dt; }
  }

  // --- move ---
  let dz = S.speed * dt;
  // a wreck doesn't carry you through the thing you hit
  if (S.wreck > 0 && S.wreckStopZ !== undefined) {
    // ease into it: the slide bleeds off over half a second, never through it
    const room = Math.max(0, S.wreckStopZ - S.z);
    dz = Math.min(dz, room * Math.min(1, dt * 3.5));
    S.speed = dz / dt;
  }
  S.z += dz;
  S.distance += dz;
  S.score += dz * 0.01;
  const pz = carZ(S);

  // --- fork island: the tip is a crash barrier, the kerb shoulders you off ---
  const into = Math.min(1, forkInto(S.stage, Math.min(pz, len - 1)));
  if (STAGE_TREE[S.stageKey] && into > 0 && S.wreck <= 0) {
    const half = islandHalf(into);
    if (half > 0 && Math.abs(S.playerX) < half + 0.12) {
      if (into < 0.26 && S.speed > 2500) {
        wreck(S, ev, S.playerX >= 0 ? 1 : -1);
      } else {
        const side = S.playerX >= 0 ? 1 : -1;
        S.playerX = side * (half + 0.12);
        S.speed = Math.max(Math.min(S.speed, 4000), S.speed - 5000 * dt);
        ev.push('scrape');
      }
    }
  }

  // --- scenery: palms and signs are solid ---
  if (S.wreck <= 0 && Math.abs(S.playerX) > 1.05 && pz < len) {
    const idx = Math.floor(pz / CFG.segLen);
    for (let k = 1; k < 3 && idx + k < N; k++) {
      const sg = segs[idx + k];
      for (const sp of sg.sprites) {
        const h = HIT[sp.kind];
        if (h && !sp.down && Math.abs(S.playerX - sp.off) < h + 0.16) {
          if (S.speed > 1800) {
            wreck(S, ev, Math.sign(sp.off));
            sp.down = true;                         // knocked flat: drawn fallen, no longer solid
            // the obstacle is off to the side: slide on along the verge past it
            S.wreckStopZ = S.z + 1800;
          }
          else { S.speed = 0; S.playerX -= Math.sign(sp.off) * 0.02; }
          break;
        }
      }
      if (S.wreck > 0) break;
    }
  }

  // --- traffic ---
  const forkZ = (N - CFG.forkSegs) * CFG.segLen;
  stepTraffic(S.traffic, len, dt, S.rng, forkZ);
  let tucked = false;
  for (const c of S.traffic) {
    const gap = c.z - pz;
    const dx = Math.abs(c.lane - S.playerX);
    const hit = c.truck ? CFG.truckHit : CFG.carHit;
    // contact first, so a car you hit this frame can't also pay a pass
    if (S.ghost <= 0 && S.wreck <= 0 && gap > -CFG.segLen * 0.3 && gap < CFG.segLen * 0.9 && dx < hit && S.speed > c.speed) {
      c.touched = true;
      const pre = S.speed;
      if (dx > hit * 0.7 && S.spin <= 0) {
        // side-swipe: shoved aside and dragged down to their pace
        S.playerX += Math.sign(S.playerX - c.lane || 1) * 0.2;
        S.speed = Math.min(S.speed * 0.8, c.speed * 1.05);
        S.spin = 0.3; S.spinMax = 0.3;
        S.ghost = 0.6;
        endDrift(S, ev, true);
        breakChain(S);
        ev.push('bump');
      } else {
        S.spin = CFG.spinTime; S.spinMax = CFG.spinTime;
        S.ghost = CFG.ghostTime;
        S.speed = Math.max(c.speed * 0.5, S.speed * CFG.crashSpeedKeep);
        // the other driver floors it out of the wreck so it can't trap you
        c.speed = Math.max(c.speed, pre * 0.75); c.shove = 0.6; c.hitT = 0.8;
        if (c.laneIdx === c.target) { const l = c.laneIdx + (S.playerX < c.lane ? 1 : -1); if (l >= 0 && l < CFG.lanes) { c.target = l; c.blink = 0; } }
        S.crashes++;
        endDrift(S, ev, true);
        breakChain(S);
        ev.push('crash');
      }
      continue;
    }
    if (!c.passed && gap < 0 && gap > -CFG.segLen * 4 && S.speed > c.speed) {
      c.passed = true;
      if (!c.touched) {
        S.passes++;
        const sling = S.towCar === c && S.tow > 0 && !c.slung;
        const near = dx < CFG.nearMiss;
        bumpChain(S, near || sling ? 2 : 1);
        const pts = award(S, sling ? CFG.slingBonus : near ? CFG.nearBonus : CFG.passBonus);
        S.score += pts;
        if (near) S.nears++;
        if (S.drift && Math.abs(seg.curve) > CFG.driftMinBend) S.driftPasses = (S.driftPasses || 0) + 1;
        // exactly one event per pass: the slingshot replaces the pass/near call
        if (sling) { c.slung = true; S.towCar = null; ev.push('sling:' + pts + ':' + Math.sign(c.lane - S.playerX)); }
        else ev.push((near ? 'near:' : 'pass:') + pts + ':' + Math.sign(c.lane - S.playerX));
      }
      c.touched = false;
    }
    if (gap > CFG.segLen && gap < CFG.segLen * CFG.slipWindow && dx < 0.28 && c.speed > S.speed * CFG.towMatch && !c.slung) { tucked = true; S.towCar = c; }
  }
  S.slip = tucked && !stunned && frac > 0.5 ? S.slip + dt : 0;
  if (S.slip > CFG.slipTime) {
    if (S.tow <= 0) ev.push('slip');
    S.tow = CFG.towTime;          // refreshed while tucked; the slingshot runs on after
  }

  if (S.chainT > 0) { S.chainT -= dt; if (S.chainT <= 0) { S.chainT = 0; if (S.chain > 0) ev.push('chainend'); S.chain = 0; } }

  // --- clock ---
  S.time -= dt;
  if (S.time <= 0) {
    S.time = 0;
    S.over = true;
    S.won = false;
    endDrift(S, ev, true);
    ev.push('timeout');
    return ev;
  }

  // --- stage end: fork or goal ---
  if (S.z >= len) {
    S.z -= len;
    S.splits.push(S.stageT);
    S.stageT = 0;
    const kids = STAGE_TREE[S.stageKey];
    if (!kids) {
      endDrift(S, ev);
      S.over = true;
      S.won = true;
      S.score += S.time * CFG.goalTimeBonus * S.stage.def.bonus;
      ev.push('goal');
      return ev;
    }
    const side = S.playerX < 0 ? 'L' : 'R';
    const nextKey = kids[side];
    S.stageKey = nextKey;
    S.stage = buildStage(nextKey);
    S.traffic = trafficInit(S.stage, S.seed + S.stageNo * 7919, S.difficulty);
    // a fresh lane-change stream per stage: the traffic you meet on a road is the
    // same every time, whatever happened on the stages before
    S.rng = stageRng(S.seed, nextKey);
    S.stageNo += 1;
    S.routeTaken.push(nextKey);
    // banked time carries over, but only a share of it past the first few
    // seconds: every stage stays a race against the clock
    if (S.time > CFG.carryFree) S.time = CFG.carryFree + (S.time - CFG.carryFree) * CFG.carryKeep;
    S.time += (CHECKPOINT_TIME[S.stage.tier] + (S.stage.def.extra || 0)) * (DIFFICULTY[S.difficulty] || DIFFICULTY.normal).time;
    S.playerX *= 0.4;
    ev.push('checkpoint:' + side);
  }

  return ev;
}

function wreck(S, ev, side) {
  S.wreck = CFG.wreckTime;
  S.wreckSide = side || 1;
  S.spin = 0;
  S.ghost = CFG.wreckTime + 0.8;
  S.speed *= 0.6;
  S.wrecks++;
  S.tow = 0;
  endDrift(S, ev, true);
  breakChain(S);
  ev.push('wreck');
}

// speed in km/h for the HUD — 12000 u/s reads as 293 km/h
export function kmh(speed) { return Math.round(speed / 41); }

// cosmetic five-speed box for the tacho and engine note: gear and rpm 0..1
export function gearbox(speed) {
  const f = Math.max(0, speed / CFG.maxSpeed);
  const tops = [0.2, 0.38, 0.57, 0.78, 1.08];
  let g = 0;
  while (g < 4 && f > tops[g]) g++;
  const lo = g === 0 ? 0 : tops[g - 1] * 0.62;
  const rpm = Math.max(0, Math.min(1, (f - lo) / (tops[g] - lo)));
  return { gear: g + 1, rpm };
}

// ---------------------------------------------------------------------------
// determinism helper for proofs
export function stateHash(S) {
  const r = (x) => Math.round(x * 1000) / 1000;
  const t = S.traffic.map((c) => `${r(c.z)}|${r(c.lane)}|${r(c.speed)}`).join(',');
  return [S.stageKey, r(S.z), r(S.playerX), r(S.speed), r(S.time), r(S.score), t].join(';');
}
