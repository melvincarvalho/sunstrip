// SUNSTRIP machine-verified proofs — run with: node proofs.mjs
// Each proof exercises the pure core (core.js). The suite is also imported by
// mutants.mjs, which injects deliberately broken cores and demands failures.
import { botInput } from './bot.js';

export async function runProofs(C) {
  const P = [];
  const proof = (name, fn) => {
    try { fn(); P.push({ name, pass: true }); }
    catch (e) { P.push({ name, pass: false, msg: e.message }); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const close = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg} (${a} vs ${b})`);
  const DT = 1 / 60;
  const GAS = { steer: 0, brake: false, accel: true };
  // a race past the start lights with an empty road and a long clock
  const open = (seed, key = 'coast') => {
    const S = C.newRace(seed);
    if (key !== 'coast') { S.stageKey = key; S.stage = C.buildStage(key); }
    S.countdown = 0; S.time = 999; S.traffic = [];
    return S;
  };
  const PZ = C.PLAYER_Z;               // the car runs this far ahead of the camera
  const car = (o) => Object.assign({ z: 0, lane: 0, laneIdx: 1, target: 1, speed: 1000, kind: 0, truck: false, blink: 0, lcT: 99, passed: false }, o);

  // -- geometry ------------------------------------------------------------
  proof('projection: centered point lands on screen centre', () => {
    const p = C.project(0, 0, 5000, 0, 0, 0, 1280, 720);
    close(p.x, 640, 1, 'x should be centre');
  });

  proof('projection: scale strictly shrinks with distance', () => {
    let last = Infinity;
    for (let z = 1000; z <= 40000; z += 1000) {
      const p = C.project(0, 0, z, 0, 0, 0, 1280, 720);
      assert(p.scale < last, `scale not shrinking at z=${z}`);
      last = p.scale;
    }
  });

  proof('projection: road width shrinks with distance and stays positive', () => {
    let last = Infinity;
    for (let z = 1000; z <= 40000; z += 1000) {
      const p = C.project(0, 0, z, 0, 0, 0, 1280, 720);
      assert(p.w > 0 && p.w < last, `bad road width at z=${z}`);
      last = p.w;
    }
  });

  // -- rng -----------------------------------------------------------------
  proof('rng: same seed reproduces, different seed diverges', () => {
    const a = C.makeRng(42), b = C.makeRng(42), c = C.makeRng(43);
    const A = [a(), a(), a()], B = [b(), b(), b()], Cs = [c(), c(), c()];
    assert(A.join() === B.join(), 'same seed diverged');
    assert(A.join() !== Cs.join(), 'different seeds identical');
    assert(A.every((v) => v >= 0 && v < 1), 'rng out of [0,1)');
  });

  // -- stage construction --------------------------------------------------
  proof('stage: deterministic build', () => {
    const s1 = C.buildStage('coast'), s2 = C.buildStage('coast');
    assert(s1.segments.length === s2.segments.length, 'lengths differ');
    for (let i = 0; i < s1.segments.length; i += 97) {
      assert(s1.segments[i].curve === s2.segments[i].curve, `curve differs at ${i}`);
      assert(s1.segments[i].y === s2.segments[i].y, `y differs at ${i}`);
    }
  });

  proof('stage: segment count and world length agree with config, deeper stages run longer', () => {
    let last = 0;
    for (const tier of C.TIERS) {
      for (const key of tier) {
        const s = C.buildStage(key);
        assert(s.segments.length === C.stageSegs(key), `${key} wrong segment count`);
        assert(s.length === C.stageSegs(key) * C.CFG.segLen, `${key} wrong length`);
        assert(s.segments.length >= last, `${key} shorter than the tier before`);
      }
      last = C.stageSegs(tier[0]);
    }
  });

  proof('stage: fork zone is straight and level', () => {
    for (const key of Object.keys(C.STAGES)) {
      const s = C.buildStage(key);
      const n = s.segments.length;
      const y0 = s.segments[n - C.CFG.forkSegs].y;
      for (let k = n - C.CFG.forkSegs; k < n; k++) {
        assert(s.segments[k].curve === 0, `${key}: curve in fork zone at ${k}`);
        assert(s.segments[k].y === y0, `${key}: hill in fork zone at ${k}`);
        assert(s.segments[k].fork, `${key}: fork flag missing at ${k}`);
      }
    }
  });

  proof('stage: curvature is continuous (no snap steering)', () => {
    for (const key of Object.keys(C.STAGES)) {
      const s = C.buildStage(key);
      for (let i = 1; i < s.segments.length; i++) {
        const d = Math.abs(s.segments[i].curve - s.segments[i - 1].curve);
        assert(d < 1.0, `${key}: curve jump ${d.toFixed(2)} at seg ${i}`);
      }
    }
  });

  proof('stage: hills are continuous (no cliffs)', () => {
    for (const key of Object.keys(C.STAGES)) {
      const s = C.buildStage(key);
      for (let i = 1; i < s.segments.length; i++) {
        const d = Math.abs(s.segments[i].y - s.segments[i - 1].y);
        assert(d < 400, `${key}: elevation cliff ${d.toFixed(0)} at seg ${i}`);
      }
    }
  });

  proof('stage: the start line is clear of solid scenery', () => {
    for (const key of Object.keys(C.STAGES)) {
      const s = C.buildStage(key);
      for (let i = 0; i < 20; i++) assert(!s.segments[i].sprites.length, `${key}: sprite on the grid at ${i}`);
    }
  });

  proof('stage: every curve-warning sign points the way the road bends', () => {
    for (const key of Object.keys(C.STAGES)) {
      const s = C.buildStage(key);
      s.segments.forEach((sg, k) => sg.sprites.forEach((sp) => {
        if (sp.kind !== 'sign') return;
        const ahead = s.segments[Math.min(s.segments.length - 1, k + 40)].curve;
        assert(sp.dir === Math.sign(ahead) && Math.abs(ahead) > 2.5, `${key}: sign at ${k} lies`);
      }));
    }
  });

  // -- stage tree ----------------------------------------------------------
  proof('tree: fifteen stages, every branch resolves, every run is exactly 5 stages', () => {
    assert(Object.keys(C.STAGE_TREE).length === 15, 'pyramid should have 15 stages');
    for (const [k, kids] of Object.entries(C.STAGE_TREE)) {
      assert(k in C.STAGES, `unknown stage ${k}`);
      if (kids) assert(kids.L in C.STAGE_TREE && kids.R in C.STAGE_TREE && kids.L !== kids.R, `${k} child missing`);
    }
    for (const k of Object.keys(C.STAGE_TREE)) {
      const leaf = !C.STAGE_TREE[k];
      const depth = C.routeDepth(k);
      assert(leaf ? depth === 4 : depth < 4, `${k} at depth ${depth} breaks the 5-stage pyramid`);
    }
  });

  proof('tree: every goal is reachable and neighbouring routes merge', () => {
    const reach = new Set(['coast']);
    for (const t of C.TIERS) for (const k of t) if (reach.has(k) && C.STAGE_TREE[k]) { reach.add(C.STAGE_TREE[k].L); reach.add(C.STAGE_TREE[k].R); }
    assert(reach.size === 15, `only ${reach.size} stages reachable`);
    assert(C.STAGE_TREE.palms.R === C.STAGE_TREE.canyon.L, 'middle routes do not merge');
  });

  // -- traffic -------------------------------------------------------------
  proof('traffic: spawns inside the road, inside the stage, denser when deeper', () => {
    const s = C.buildStage('coast');
    const cars = C.trafficInit(s, 9);
    assert(cars.length === C.trafficCount(s), 'wrong car count');
    for (const c of cars) {
      assert(Math.abs(c.lane) <= 0.9, `lane ${c.lane} off the road`);
      assert(c.z >= 0 && c.z <= s.length, 'car outside stage');
      assert(c.speed > 0 && c.speed < C.CFG.maxSpeed, 'car speed out of band');
    }
    assert(C.trafficCount(C.buildStage('metro')) > C.trafficCount(s), 'deep city not busier than the beach');
    assert(C.trafficCount(s, 'hard') > C.trafficCount(s, 'easy'), 'hard not busier than easy');
    for (const k of Object.keys(C.STAGES)) for (const d of ['easy', 'normal', 'hard']) {
      assert(C.trafficCount(C.buildStage(k), d) <= 50, `${k}/${d} is a car park`);
    }
  });

  proof('traffic: stepping preserves count and wraps inside the stage', () => {
    const s = C.buildStage('coast');
    const cars = C.trafficInit(s, 9);
    const n = cars.length;
    const rng = C.makeRng(3);
    for (let i = 0; i < 10000; i++) C.stepTraffic(cars, s.length, DT, rng);
    assert(cars.length === n, 'car lost');
    for (const c of cars) {
      assert(c.z >= 0 && c.z <= s.length, `car escaped at z=${c.z}`);
      assert(Math.abs(c.lane) <= Math.max(...C.CFG.lanePos) + 1e-9, `car drifted to ${c.lane}`);
    }
  });

  proof('traffic: lane changes are telegraphed by the indicator first', () => {
    const rng = C.makeRng(5);
    const c = car({ z: 0, lane: 0, laneIdx: 1, target: 1, lcT: 0.01 });
    C.stepTraffic([c], 1e9, DT, rng);
    assert(c.target !== 1 && c.blink > 0, 'no indicator before the move');
    let t = 0;
    while (c.blink > 0) { assert(c.lane === 0, 'moved while still indicating'); C.stepTraffic([c], 1e9, DT, rng); t += DT; }
    assert(t > 0.5, `indicator only ${t.toFixed(2)}s`);
    for (let i = 0; i < 120; i++) C.stepTraffic([c], 1e9, DT, rng);
    close(c.lane, C.CFG.lanePos[c.target], 1e-6, 'car did not settle in its new lane');
  });

  // -- start ---------------------------------------------------------------
  proof('start: the lights hold the car and the clock, then say go', () => {
    const S = C.newRace(1);
    const t0 = S.time;
    const ev = [];
    for (let i = 0; i < 60 * C.CFG.countdown - 2; i++) ev.push(...C.stepRace(S, GAS, DT));
    assert(S.z === 0 && S.speed === 0, 'car moved on red');
    assert(S.time === t0, 'clock ran on red');
    assert(ev.filter((e) => e.startsWith('count:')).length === 2, 'expected two count beeps');
    for (let i = 0; i < 4; i++) ev.push(...C.stepRace(S, GAS, DT));
    assert(ev.includes('go'), 'no go');
    for (let i = 0; i < 30; i++) C.stepRace(S, GAS, DT);
    assert(S.speed > 0 && S.time < t0, 'car or clock still frozen after go');
  });

  // -- physics -------------------------------------------------------------
  proof('physics: speed stays within [0, max+tow] under input fuzz', () => {
    const S = C.newRace(5); S.countdown = 0;
    const rng = C.makeRng(77);
    for (let i = 0; i < 20000; i++) {
      const inp = { steer: rng() * 2 - 1, brake: rng() < 0.2, accel: rng() < 0.8 };
      C.stepRace(S, inp, DT);
      assert(S.speed >= 0 && S.speed <= C.CFG.maxSpeed * (1 + C.CFG.slipBoost) + 1e-9, `speed ${S.speed} out of range`);
      if (S.over) break;
    }
  });

  proof('physics: throttle matters — lifting off slows the car', () => {
    const a = open(2), b = open(2);
    a.speed = b.speed = C.CFG.maxSpeed * 0.8;
    for (let i = 0; i < 60; i++) { C.stepRace(a, GAS, DT); C.stepRace(b, { steer: 0, brake: false, accel: false }, DT); }
    assert(a.speed > b.speed + 1500, 'coasting kept pace with the throttle');
  });

  proof('physics: the wheel ramps in rather than snapping to full lock', () => {
    const S = open(3); S.speed = C.CFG.maxSpeed * 0.8;
    C.stepRace(S, { steer: 1, brake: false, accel: true }, DT);
    assert(S.steerV > 0 && S.steerV < 0.3, `wheel at ${S.steerV} after one tick`);
    for (let i = 0; i < 30; i++) C.stepRace(S, { steer: 1, brake: false, accel: true }, DT);
    close(S.steerV, 1, 1e-9, 'wheel never reached full lock');
  });

  proof('physics: lateral position stays clamped under fuzz', () => {
    const S = C.newRace(6); S.countdown = 0;
    S.stage.segments.forEach((sg) => { sg.sprites = []; });   // open fields: nothing to stop you
    const rng = C.makeRng(78);
    for (let i = 0; i < 20000; i++) {
      C.stepRace(S, { steer: rng() < 0.5 ? -1 : 1, brake: false, accel: true }, DT);
      assert(Math.abs(S.playerX) <= 2.2 + 1e-9, `playerX ${S.playerX} escaped`);
      if (S.over) break;
    }
  });

  proof('physics: grass punishes — offroad speed decays to the offroad limit', () => {
    const S = open(7);
    S.speed = C.CFG.maxSpeed;
    for (let i = 0; i < 600; i++) {
      S.playerX = 2.0; S.wreck = 0; S.ghost = 99; // pin the car on open grass
      S.stage.segments.forEach((sg) => { sg.sprites = []; });
      C.stepRace(S, GAS, DT);
    }
    assert(S.speed <= C.CFG.offroadLimit + 200, `offroad speed still ${S.speed}`);
  });

  proof('physics: centrifugal force pushes outward, scaled by speed', () => {
    const mk = (speed) => {
      const S = open(8);
      S.speed = speed;
      const i = S.stage.segments.findIndex((sg) => sg.curve > 2.5);
      assert(i > 0, 'no curve found');
      S.z = i * C.CFG.segLen;
      const x0 = S.playerX;
      C.stepRace(S, { steer: 0, brake: false, accel: false }, DT);
      return S.playerX - x0;
    };
    const fast = mk(C.CFG.maxSpeed), slow = mk(C.CFG.maxSpeed * 0.3);
    assert(fast < 0, 'right curve should push left');
    assert(Math.abs(fast) > Math.abs(slow), 'push should grow with speed');
  });

  proof('physics: a real share of bends out-pull full lock at top speed', () => {
    let tot = 0, hot = 0;
    for (const k of Object.keys(C.STAGES)) {
      for (const sg of C.buildStage(k).segments) { tot++; if (Math.abs(sg.curve) * C.CFG.centrifugal > C.CFG.steerSpeed) hot++; }
    }
    const share = hot / tot;
    assert(share > 0.1 && share < 0.4, `${(share * 100).toFixed(1)}% of road beats grip — lifting should matter, not dominate`);
  });

  proof('physics: climbing costs speed', () => {
    const S = open(21, 'pines');
    const segs = S.stage.segments;
    const up = segs.findIndex((sg, i) => i > 50 && segs[i + 1] && segs[i + 1].y - sg.y > 150);
    assert(up > 0, 'no climb found');
    const flat = open(21, 'pines');
    S.z = up * C.CFG.segLen; S.speed = 8000;
    const i0 = segs.findIndex((sg, i) => i > 50 && segs[i + 1] && Math.abs(segs[i + 1].y - sg.y) < 1 && sg.curve === 0);
    flat.z = i0 * C.CFG.segLen; flat.speed = 8000;
    C.stepRace(S, { steer: 0, brake: false, accel: false }, DT);
    C.stepRace(flat, { steer: 0, brake: false, accel: false }, DT);
    assert(S.speed < flat.speed, 'hill did not slow the car');
  });

  proof('physics: the last segment never reads a grade across the stage wrap', () => {
    const S = open(22, 'autumn');
    S.z = S.stage.length - C.CFG.segLen * 0.5; S.speed = 6000; S.playerX = 0.7;
    C.stepRace(S, GAS, DT);
    assert(S.speed > 5500, `speed collapsed to ${S.speed} at the stage end`);
  });

  // -- collisions ----------------------------------------------------------
  proof('collision: a rear-end spins the car, costs speed and breaks the chain', () => {
    const S = open(9);
    S.speed = C.CFG.maxSpeed; S.chain = 7; S.chainT = 2;
    S.traffic = [car({ z: S.z + PZ + C.CFG.segLen, lane: 0, speed: C.CFG.maxSpeed * 0.3 })];
    const before = S.speed;
    const ev = C.stepRace(S, GAS, DT);
    assert(ev.includes('crash'), 'no crash event');
    assert(S.spin > 0, 'no spin after crash');
    assert(S.speed < before * 0.6, `crash kept too much speed (${S.speed})`);
    assert(S.chain === 0, 'chain survived a crash');
  });

  proof('collision: ghosting stops one car farming repeat crashes', () => {
    const S = open(10);
    S.speed = C.CFG.maxSpeed;
    S.traffic = [car({ z: S.z + PZ + C.CFG.segLen, lane: 0, speed: C.CFG.maxSpeed * 0.3 })];
    let crashes = C.stepRace(S, GAS, DT).filter((e) => e === 'crash').length;
    // a second car right on your nose while you're still reeling
    const second = car({ z: S.z + PZ + C.CFG.segLen * 0.5, lane: 0, speed: 50 });
    S.traffic.push(second);
    for (let i = 0; i < 60; i++) { second.z = S.z + PZ + C.CFG.segLen * 0.5; crashes += C.stepRace(S, GAS, DT).filter((e) => e === 'crash').length; }
    assert(crashes === 1, `${crashes} crashes in a second`);
  });

  proof('collision: nothing can tunnel through the contact window in one frame', () => {
    const closing = C.CFG.maxSpeed * (1 + C.CFG.slipBoost) - C.CFG.trafficMinSpeed * C.CFG.maxSpeed * 0.8;
    assert(closing * DT < C.CFG.segLen * 1.2, `closing ${(closing * DT).toFixed(0)}/frame outruns the window`);
  });

  proof('collision: a car already behind you cannot hit you', () => {
    const S = open(11);
    S.z = 20000; S.speed = C.CFG.maxSpeed * 0.5;
    S.traffic = [car({ z: S.z + PZ - C.CFG.segLen * 0.6, lane: 0, speed: 100, passed: true })];
    const ev = C.stepRace(S, GAS, DT);
    assert(!ev.includes('crash'), 'hit from behind');
  });

  proof('collision: contact happens at the car on screen, not at the camera', () => {
    const S = open(11);
    S.z = 20000; S.speed = C.CFG.maxSpeed * 0.5;
    // a car level with the camera is between the lens and the player: no contact
    S.traffic = [car({ z: S.z + C.CFG.segLen * 0.3, lane: 0, speed: 100, passed: true })];
    assert(!C.stepRace(S, GAS, DT).includes('crash'), 'hit something behind the drawn car');
    S.traffic = [car({ z: C.carZ(S) + C.CFG.segLen * 0.6, lane: 0, speed: 100 })];
    assert(C.stepRace(S, GAS, DT).includes('crash'), 'no contact at the car');
  });

  proof('collision: scenery is solid — a palm at speed means a wreck', () => {
    const S = open(12);
    S.z = 50 * C.CFG.segLen; S.speed = C.CFG.maxSpeed; S.playerX = 1.6;
    const at = Math.floor(C.carZ(S) / C.CFG.segLen) + 3;
    S.stage.segments[at].sprites = [{ kind: 'palm', off: 1.6, v: 0.5 }];
    let ev = [];
    for (let i = 0; i < 10 && !ev.includes('wreck'); i++) ev = C.stepRace(S, GAS, DT);
    assert(ev.includes('wreck'), 'drove through a palm');
    assert(S.wreck > 0 && S.speed < C.CFG.maxSpeed * 0.65, 'wreck without consequence');
    for (let i = 0; i < 60 * C.CFG.wreckTime + 10; i++) C.stepRace(S, GAS, DT);
    assert(Math.abs(S.playerX) < 1.02, `not returned to the road (x=${S.playerX.toFixed(2)})`);
  });

  proof('collision: a palm already behind the car cannot hit it', () => {
    const S = open(12);
    S.z = 50 * C.CFG.segLen; S.speed = C.CFG.maxSpeed * 0.3; S.playerX = 1.6;
    const at = Math.floor(C.carZ(S) / C.CFG.segLen);
    for (let k = at - 5; k < at + 30; k++) S.stage.segments[k].sprites = [];
    S.stage.segments[at].sprites = [{ kind: 'palm', off: 1.6, v: 0.5 }];
    assert(!C.stepRace(S, GAS, DT).includes('wreck'), 'hit by a palm drawn over the car');
  });

  proof('collision: bushes are soft', () => {
    const S = open(13);
    S.z = 50 * C.CFG.segLen; S.speed = C.CFG.maxSpeed; S.playerX = 1.6;
    const at = Math.floor(C.carZ(S) / C.CFG.segLen) + 3;
    for (let k = at - 10; k < at + 20; k++) S.stage.segments[k].sprites = [];
    S.stage.segments[at].sprites = [{ kind: 'bush', off: 1.6, v: 0.5 }];
    let wrecked = false;
    for (let i = 0; i < 10; i++) wrecked = wrecked || C.stepRace(S, GAS, DT).includes('wreck');
    assert(!wrecked, 'a bush wrecked the car');
  });

  proof('fork: the island tip is a crash barrier and the kerb shoulders you off', () => {
    const S = open(14);
    const n = S.stage.segments.length;
    S.z = (n - C.CFG.forkSegs * 0.8) * C.CFG.segLen - PZ; S.speed = C.CFG.maxSpeed; S.playerX = 0;
    let ev = [];
    for (let i = 0; i < 30 && !ev.includes('wreck'); i++) ev = C.stepRace(S, GAS, DT);
    assert(ev.includes('wreck'), 'drove through the island tip');
    const T = open(14);
    T.z = (n - C.CFG.forkSegs * 0.3) * C.CFG.segLen - PZ; T.speed = C.CFG.maxSpeed * 0.5; T.playerX = 0.05;
    C.stepRace(T, GAS, DT);
    assert(Math.abs(T.playerX) >= C.islandHalf(C.forkInto(T.stage, C.carZ(T))), 'car inside the island');
  });

  // -- scoring -------------------------------------------------------------
  proof('score: a close pass pays the near-miss bonus, a wide one the pass bonus, once each', () => {
    const L = C.CFG.lanePos;
    const run = (lane) => {
      const S = open(15);
      S.speed = C.CFG.maxSpeed; S.playerX = L[0];
      S.traffic = [car({ z: C.carZ(S) + C.CFG.segLen * 2, lane, speed: 100 })];
      const ev = [];
      for (let i = 0; i < 240; i++) { ev.push(...C.stepRace(S, GAS, DT)); S.playerX = L[0]; }
      return ev;
    };
    const near = run(L[0] + (C.CFG.carHit + C.CFG.nearMiss) / 2), wide = run(L[2]);
    assert(near.filter((e) => e.startsWith('near:')).length === 1, 'near miss not paid exactly once');
    assert(wide.filter((e) => e.startsWith('pass:')).length === 1, 'pass not paid exactly once');
    assert(wide.every((e) => !e.startsWith('near:')), 'two lanes over counted as near');
    assert(run(L[1]).every((e) => !e.startsWith('near:')), 'a whole lane over counted as near');
    const pn = Number(near.find((e) => e.startsWith('near:')).split(':')[1]);
    const pp = Number(wide.find((e) => e.startsWith('pass:')).split(':')[1]);
    assert(pn > pp, 'near miss should pay more than a pass');
  });

  proof('score: riding the lane line is a knife-edge, not a free near-miss lane', () => {
    const L = C.CFG.lanePos;
    const line = (L[0] + L[1]) / 2;
    // the gap either side of a lane line is barely wider than a car's reach
    assert(Math.abs(line - L[0]) - C.CFG.carHit < 0.05, 'the lane line is a comfortable safe lane');
    assert(C.CFG.nearMiss - C.CFG.carHit <= 0.15, 'near-miss band is wider than a brush');
    // and the kerb is no hiding place: outer-lane cars reach the edge of the tarmac
    assert(L[2] + C.CFG.carHit >= 1.02, 'a safe lane runs along the kerb');
  });

  proof('score: exactly one event per car passed', () => {
    const S = open(23);
    S.speed = C.CFG.maxSpeed; S.playerX = 0;
    S.stage.segments.forEach((sg) => { sg.curve = 0; sg.y = 0; sg.sprites = []; });
    const lead = car({ z: C.carZ(S) + C.CFG.segLen * 4, lane: 0, speed: C.CFG.maxSpeed * 0.9, cruise: C.CFG.maxSpeed * 0.9 });
    S.traffic = [lead];
    const ev = [];
    for (let i = 0; i < 90; i++) { lead.z = Math.max(lead.z, C.carZ(S) + C.CFG.segLen * 3); ev.push(...C.stepRace(S, GAS, DT)); }
    for (let i = 0; i < 200; i++) { S.playerX = 0.4; lead.speed = 6000; ev.push(...C.stepRace(S, GAS, DT)); }
    const scoring = ev.filter((e) => /^(pass|near|sling):/.test(e));
    assert(scoring.length === 1, `one car passed, ${scoring.length} scoring events: ${scoring.join(' ')}`);
  });

  proof('score: chains multiply and expire', () => {
    const S = open(16);
    assert(C.comboMult(S) === 1, 'fresh multiplier not 1');
    S.chain = 9; S.chainT = 0.05;
    assert(C.comboMult(S) > 1, 'chain did not multiply');
    let ev = [];
    for (let i = 0; i < 10; i++) ev.push(...C.stepRace(S, GAS, DT));
    assert(S.chain === 0 && ev.includes('chainend'), 'chain never expired');
  });

  proof('score: a held drift keeps speed and pays out; a flick pays nothing', () => {
    const S = open(17);
    // park the car on a long right-hander and hold the slide on the tarmac
    S.stage.segments.forEach((sg) => { sg.curve = 4; sg.y = 0; sg.sprites = []; });
    S.z = 30 * C.CFG.segLen; S.speed = C.CFG.maxSpeed; S.steerV = 1;
    let ev = C.stepRace(S, { steer: 1, brake: true, accel: true }, DT);
    assert(S.drift === 1 && ev.includes('driftstart'), 'brake-tap while turning did not start a drift');
    // hold the slide on the tarmac for a second and a half
    for (let k = 0; k < 90; k++) { S.playerX = 0; ev = ev.concat(C.stepRace(S, { steer: 1, brake: false, accel: true }, DT)); }
    assert(S.speed > C.CFG.maxSpeed * 0.8, `drift scrubbed too much (${S.speed})`);
    // straighten up: after the grace window the slide is banked
    for (let k = 0; k < 30; k++) { S.playerX = 0; ev = ev.concat(C.stepRace(S, { steer: 0, brake: false, accel: true }, DT)); }
    const paid = ev.find((e) => e.startsWith('drift:'));
    assert(paid && Number(paid.split(':')[1]) > 0, 'held drift paid nothing');
    const T = open(17);
    T.stage = S.stage;
    T.z = S.z; T.speed = C.CFG.maxSpeed; T.steerV = 1;
    C.stepRace(T, { steer: 1, brake: true, accel: true }, DT);
    let flick = [];
    for (let k = 0; k < 30; k++) { T.playerX = 0; flick = flick.concat(C.stepRace(T, { steer: 0, brake: false, accel: true }, DT)); }
    assert(!flick.some((e) => e.startsWith('drift:')), 'a one-frame flick paid out');
  });

  proof('score: a drift needs real lock to hold — a feather on the wheel lets it go', () => {
    const S = open(21);
    S.stage.segments.forEach((sg) => { sg.curve = 4; sg.y = 0; sg.sprites = []; });
    S.z = 30 * C.CFG.segLen; S.speed = C.CFG.maxSpeed; S.steerV = 1;
    C.stepRace(S, { steer: 1, brake: true, accel: true }, DT);
    for (let k = 0; k < 40 && S.drift; k++) { S.playerX = 0; C.stepRace(S, { steer: 0.05, brake: false, accel: true }, DT); }
    assert(!S.drift, 'a 0.05 steer held the slide');
  });

  proof('score: a drift that ends in contact is forfeited', () => {
    const S = open(20);
    S.stage.segments.forEach((sg) => { sg.curve = 4; sg.y = 0; sg.sprites = []; });
    S.z = 30 * C.CFG.segLen; S.speed = C.CFG.maxSpeed; S.steerV = 1;
    C.stepRace(S, { steer: 1, brake: true, accel: true }, DT);
    for (let k = 0; k < 90; k++) { S.playerX = 0; C.stepRace(S, { steer: 1, brake: false, accel: true }, DT); }
    assert(S.drift && S.driftPts > 0, 'setup: no live drift');
    S.traffic = [car({ z: C.carZ(S) + C.CFG.segLen * 1.1, lane: 0, speed: 100 })];
    const ev = C.stepRace(S, { steer: 1, brake: false, accel: true }, DT);
    assert(ev.includes('crash') && !ev.some((e) => e.startsWith('drift:')), 'a crashed drift still paid');
  });

  proof('score: snaking down a straight pays nothing — drifts must be in a bend', () => {
    const S = open(19);
    S.stage.segments.forEach((sg) => { sg.curve = 0; sg.y = 0; sg.sprites = []; });
    S.z = 30 * C.CFG.segLen; S.speed = C.CFG.maxSpeed;
    const ev = [];
    for (let i = 0; i < 60 * 20; i++) {
      const dir = Math.floor(i / 90) % 2 ? 1 : -1;
      S.steerV = dir; S.playerX = 0; S.speed = C.CFG.maxSpeed;
      ev.push(...C.stepRace(S, { steer: dir, brake: !S.drift, accel: true }, DT));
    }
    assert(!ev.some((e) => e.startsWith('drift:')), 'straight-line snaking scored');
    assert(S.chain === 0, 'snaking built a chain');
    // a slide started on the straight that then dips into a short bend has
    // not earned its minimum time *in the bend*
    const T = open(19);
    T.stage.segments.forEach((sg) => { sg.curve = 0; sg.y = 0; sg.sprites = []; });
    T.z = 20 * C.CFG.segLen; T.speed = C.CFG.maxSpeed; T.steerV = 1;
    const ev2 = [];
    const step = (st, br) => { T.playerX = 0; T.speed = C.CFG.maxSpeed; ev2.push(...C.stepRace(T, { steer: st, brake: br, accel: true }, DT)); };
    step(1, true);
    for (let i = 0; i < 27; i++) step(1, false);                          // 0.45s of straight
    T.stage.segments.forEach((sg) => { sg.curve = 4; });
    for (let i = 0; i < 30; i++) step(1, false);                          // 0.5s of bend
    for (let i = 0; i < 30; i++) step(-1, false);                         // straighten up: banked or not
    assert(!ev2.some((e) => e.startsWith('drift:')), 'a straight-line slide cashed in on a moment of bend');
  });

  proof('slipstream: tucking in behind a car tows you past top speed', () => {
    const S = open(18);
    S.speed = C.CFG.maxSpeed; S.playerX = 0;
    S.stage.segments.forEach((sg) => { sg.curve = 0; sg.y = 0; });
    const lead = car({ z: C.carZ(S) + C.CFG.segLen * 3, lane: 0, speed: C.CFG.maxSpeed * 1.2 });
    S.traffic = [lead];
    const ev = [];
    for (let i = 0; i < 120; i++) { ev.push(...C.stepRace(S, GAS, DT)); lead.z = C.carZ(S) + C.CFG.segLen * 3; }
    assert(ev.includes('slip'), 'no slipstream event');
    assert(S.speed > C.CFG.maxSpeed, 'tow did not lift top speed');
    // pull out: the slingshot keeps pulling for a moment
    S.traffic = [];
    for (let i = 0; i < 30; i++) C.stepRace(S, GAS, DT);
    assert(S.tow > 0 && S.speed > C.CFG.maxSpeed, 'tow vanished the instant you pulled out');
  });

  proof('slipstream: the tow pays once, as a slingshot past the car that gave it — weaving farms nothing', () => {
    const S = open(18);
    S.speed = C.CFG.maxSpeed; S.playerX = 0;
    S.stage.segments.forEach((sg) => { sg.curve = 0; sg.y = 0; sg.sprites = []; });
    const lead = car({ z: C.carZ(S) + C.CFG.segLen * 4, lane: 0, speed: C.CFG.maxSpeed * 0.85, cruise: C.CFG.maxSpeed * 0.85 });
    S.traffic = [lead];
    const ev = [];
    // tuck, pull out, tuck, pull out... while the lead stays ahead
    for (let i = 0; i < 600; i++) {
      S.playerX = Math.floor(i / 40) % 2 ? 0.45 : 0;
      lead.z = Math.max(lead.z, C.carZ(S) + C.CFG.segLen * 3);
      ev.push(...C.stepRace(S, GAS, DT));
    }
    const score0 = S.score;
    assert(!ev.some((e) => e.startsWith('sling:')), 'weaving behind a car paid out');
    // passing some *other* car while towed is just a pass
    assert(S.tow > 0, 'setup: should be towed');
    const other = car({ z: C.carZ(S) + C.CFG.segLen * 2, lane: 0.7, speed: 1000, cruise: 1000 });
    S.traffic.push(other);
    const evo = [];
    for (let i = 0; i < 40; i++) { S.playerX = 0.2; lead.z = Math.max(lead.z, C.carZ(S) + C.CFG.segLen * 3); evo.push(...C.stepRace(S, GAS, DT)); }
    assert(evo.some((e) => /^(pass|near):/.test(e)) && !evo.some((e) => e.startsWith('sling:')), 'passing a bystander paid a slingshot');
    S.traffic = [lead];
    // now actually go past it, out of its wake
    S.playerX = 0.62;
    for (let i = 0; i < 300 && lead.z > C.carZ(S) - C.CFG.segLen * 5; i++) { lead.speed = C.CFG.maxSpeed * 0.7; ev.push(...C.stepRace(S, GAS, DT)); S.playerX = 0.62; }
    const slings = ev.filter((e) => e.startsWith('sling:'));
    assert(slings.length === 1 && S.score > score0, `slingshot paid ${slings.length} times`);
  });

  proof('score: driving forward always earns distance points', () => {
    const S = open(14);
    S.speed = C.CFG.maxSpeed * 0.5;
    let last = S.score;
    for (let i = 0; i < 600; i++) {
      C.stepRace(S, GAS, DT);
      assert(S.score >= last, 'score went backwards');
      last = S.score;
    }
    assert(S.score > 0, 'no score from driving');
  });

  proof('traffic: cars never merge into the last open lane', () => {
    const rng = C.makeRng(4);
    const a = car({ z: 1000, lane: -0.7, laneIdx: 0, target: 0, speed: 5000, cruise: 5000 });
    const b = car({ z: 1100, lane: 0, laneIdx: 1, target: 1, speed: 5000, cruise: 5000, lcT: 0.01 });
    const cars = [a, b];
    for (let i = 0; i < 60; i++) C.stepTraffic(cars, 1e9, DT, rng);
    // b may only have gone left if that left a lane open; a wall of three needs a third car
    const c3 = car({ z: 1050, lane: 0.7, laneIdx: 2, target: 2, speed: 5000, cruise: 5000 });
    const d = car({ z: 1200, lane: 0, laneIdx: 1, target: 1, speed: 5000, cruise: 5000, lcT: 0.01 });
    const cars2 = [car({ z: 1000, lane: -0.7, laneIdx: 0, target: 0, speed: 5000, cruise: 5000 }), c3, d];
    for (let i = 0; i < 120; i++) {
      C.stepTraffic(cars2, 1e9, DT, rng);
      const lanes = new Set(cars2.filter((o) => Math.abs(o.z - d.z) < C.CFG.segLen * 4).map((o) => o.target));
      assert(lanes.size < 3 || d.target === 1, 'a car closed the last gap');
    }
  });

  proof('traffic: a fast car boxed in behind a slow one queues instead of driving through it', () => {
    const rng = C.makeRng(8);
    const slow = car({ z: 3000, lane: 0, laneIdx: 1, target: 1, speed: 3000, cruise: 3000 });
    const fast = car({ z: 700, lane: 0, laneIdx: 1, target: 1, speed: 9000, cruise: 9000 });
    // both side lanes blocked alongside
    const l = car({ z: 2000, lane: -0.7, laneIdx: 0, target: 0, speed: 3000, cruise: 3000, truck: true });
    const r = car({ z: 2000, lane: 0.7, laneIdx: 2, target: 2, speed: 3000, cruise: 3000, truck: true });
    const cars = [slow, fast, l, r];
    for (let i = 0; i < 240; i++) {
      C.stepTraffic(cars, 1e9, DT, rng);
      // it may pull round once there's room, but never through
      if (Math.abs(fast.lane - slow.lane) < C.CFG.carHit) assert(Math.abs(fast.z - slow.z) > C.CFG.segLen * 0.5, 'fast car drove into the slow one');
    }
    assert(fast.z < slow.z || Math.abs(fast.lane - slow.lane) >= C.CFG.carHit, 'passed inside the same lane');
  });

  proof('routes: left roads are calmer with more time, right roads busier and richer', () => {
    for (const t of C.TIERS.slice(1)) {
      const L = C.STAGES[t[0]], R = C.STAGES[t[t.length - 1]];
      assert(L.traffic < R.traffic && L.bonus < R.bonus && L.extra > R.extra, `tier ${t.join('/')} has no trade-off`);
    }
  });

  // -- clock, checkpoints, goal -------------------------------------------
  proof('clock: time runs out to a loss, never negative', () => {
    const S = C.newRace(11); S.countdown = 0;
    S.time = 0.5;
    const ev = [];
    for (let i = 0; i < 120 && !S.over; i++) ev.push(...C.stepRace(S, GAS, DT));
    assert(S.over && !S.won, 'timeout did not end the race');
    assert(S.time === 0, `time is ${S.time} after timeout`);
    assert(ev.includes('timeout'), 'no timeout event');
  });

  proof('clock: difficulty scales the time you get', () => {
    const e = C.newRace(1, 'easy'), n = C.newRace(1, 'normal'), h = C.newRace(1, 'hard');
    assert(e.time > n.time && n.time > h.time, 'start times not ordered by difficulty');
  });

  proof('checkpoint: stage end extends the clock and advances the route', () => {
    const S = open(12);
    S.time = 30;
    S.z = S.stage.length - 10;
    S.speed = C.CFG.maxSpeed;
    S.playerX = -0.5; // choose the left gate
    const ev = C.stepRace(S, GAS, DT);
    assert(ev.some((e) => e.startsWith('checkpoint')), 'no checkpoint event');
    assert(S.stageNo === 2, 'stage number did not advance');
    assert(S.stageKey === C.STAGE_TREE.coast.L, 'left gate chose the wrong stage');
    const kept = C.CFG.carryFree + (30 - DT - C.CFG.carryFree) * C.CFG.carryKeep;
    const add = (C.CHECKPOINT_TIME[1] + C.STAGES[S.stageKey].extra) * C.DIFFICULTY.normal.time;
    close(S.time, kept + add, 0.01, 'checkpoint time not added (or carry-over not compressed)');
    const T = open(12); T.time = C.CFG.carryFree - 1; T.z = T.stage.length - 10; T.speed = C.CFG.maxSpeed; T.playerX = -0.5;
    C.stepRace(T, GAS, DT);
    close(T.time, C.CFG.carryFree - 1 - DT + add, 0.01, 'a short bank should carry over whole');
    assert(S.routeTaken.length === 2 && S.splits.length === 1, 'route or split not recorded');
  });

  proof('goal: finishing a leaf stage wins and banks the route-weighted time bonus', () => {
    const S = open(13, 'lastlight');
    S.stageNo = 5;
    S.z = S.stage.length - 10;
    S.speed = C.CFG.maxSpeed;
    S.time = 20;
    const scoreBefore = S.score;
    const ev = C.stepRace(S, GAS, DT);
    assert(ev.includes('goal'), 'no goal event');
    assert(S.over && S.won, 'goal did not win the race');
    assert(S.score - scoreBefore >= S.time * C.CFG.goalTimeBonus * C.STAGES.lastlight.bonus, 'time bonus missing');
    assert(C.STAGES.lastlight.bonus > C.STAGES.snow.bonus, 'the hard road should pay more');
  });

  proof('arcade: a crash only disturbs the cars it touches, not the whole road', () => {
    const run = (shove) => {
      const st = C.buildStage('coast');
      const cars = C.trafficInit(st, 1986 + 7919, 'normal');
      const rng = C.stageRng(1986, 'coast');
      for (let i = 0; i < 60 * 30; i++) {
        if (shove && i === 60) { cars[0].speed = 11000; cars[0].shove = 0.6; }
        C.stepTraffic(cars, st.length, DT, rng);
      }
      return cars;
    };
    const a = run(false), b = run(true);
    const diff = a.filter((c, i) => Math.abs(c.lane - b[i].lane) > 0.1).length;
    assert(diff <= a.length * 0.25, `one shove re-laned ${diff}/${a.length} cars`);
  });

  proof('arcade: a stage\'s traffic is the same however you got there', () => {
    const at = (dawdle) => {
      const S = C.newRace(1986, 'normal');
      S.countdown = 0; S.time = 999;
      // a slow first stage vs a fast one, then onto the same second stage
      for (let i = 0; i < 60 * (dawdle ? 30 : 15) && S.stageNo === 1; i++) C.stepRace(S, botInput(C, S), DT);
      S.z = S.stage.length - 5; S.playerX = -0.5;
      C.stepRace(S, GAS, DT);
      assert(S.stageKey === C.STAGE_TREE.coast.L, 'setup: not on palms');
      S.playerX = 5; S.speed = 0;            // park off the road; let the traffic run
      for (let i = 0; i < 60 * 20; i++) { S.playerX = 2.2; S.wreck = 0; S.speed = 0; C.stepRace(S, { steer: 0, brake: true, accel: false }, DT); }
      return S.traffic.map((c) => c.z.toFixed(1) + c.lane.toFixed(3)).join();
    };
    assert(at(true) === at(false), 'stage-2 traffic depends on how stage 1 went');
  });

  proof('medals: every difficulty has gold to chase, set from the route\'s time allowance', () => {
    for (const d of ['easy', 'normal', 'hard']) {
      const route = ['coast', 'canyon', 'desert', 'volcano', 'lastlight'];
      const a = C.medalLine(route, d);
      assert(C.medalFor(route, d, a) === 'GOLD' && C.medalFor(route, d, a * 0.6) === 'SILVER' && C.medalFor(route, d, 0.1) === 'BRONZE', `${d}: medal ladder broken`);
    }
    assert(C.timeAllowance(['coast', 'palms'], 'easy') > C.timeAllowance(['coast', 'palms'], 'hard'), 'allowance ignores difficulty');
    const R = ['coast', 'palms', 'pines', 'autumn', 'snow'];
    const g = (d) => C.medalLine(R, d);
    assert(g('easy') > g('normal') && g('normal') > g('hard'), 'gold should need more spare time on easier modes');
    // and gold must be reachable: the line sits below what a clean run can bank
    // at the goal (the final stage's allowance plus the tax-free bank)
    for (const d of ['easy', 'normal', 'hard']) {
      const dm = C.DIFFICULTY[d].time;
      const ceiling = (C.CHECKPOINT_TIME[4] + C.STAGES.snow.extra) * dm + C.CFG.carryFree;
      assert(g(d) < ceiling * 0.6, `${d}: gold line ${g(d).toFixed(1)}s is out of reach`);
    }
  });

  // -- determinism and balance --------------------------------------------
  proof('determinism: identical seeds and inputs give identical worlds', () => {
    const run = () => {
      const S = C.newRace(99);
      const rng = C.makeRng(1234);
      for (let i = 0; i < 3000; i++) {
        C.stepRace(S, { steer: rng() * 2 - 1, brake: rng() < 0.1, accel: true }, DT);
        if (S.over) break;
      }
      return C.stateHash(S);
    };
    assert(run() === run(), 'same run diverged');
  });

  proof('balance: EASY is kind; HARD separates skilled from timid drivers', () => {
    const runOne = (seed, diff, skill) => {
      const S = C.newRace(seed, diff);
      let minT = Infinity;
      for (let i = 0; i < 60 * 400 && !S.over; i++) { C.stepRace(S, botInput(C, S, skill), DT); if (S.countdown <= 0) minT = Math.min(minT, S.time); }
      return { won: S.won, minT };
    };
    const easy = runOne(2, 'easy', 0.9);
    assert(easy.won && easy.minT > 10, 'a timid driver should cruise Easy');
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const hard = seeds.map((sd) => runOne(sd, 'hard', 1)).filter((r) => r.won).length;
    const timid = seeds.map((sd) => runOne(sd, 'hard', 0.9)).filter((r) => r.won).length;
    // Hard is a skill check: the gap between a skilled and a timid driver is the point
    assert(hard >= 5, `skilled driver won only ${hard}/8 on Hard`);
    assert(timid <= 3 && hard - timid >= 3, `Hard doesn't separate skill: skilled ${hard}/8, timid ${timid}/8`);
  });

  proof('balance: the autopilot finishes NORMAL with time to spare; a parked car does not', () => {
    const S = C.newRace(1, 'normal');
    let minT = Infinity;
    for (let i = 0; i < 60 * 400 && !S.over; i++) {
      C.stepRace(S, botInput(C, S), DT);
      if (S.countdown <= 0) minT = Math.min(minT, S.time);
    }
    assert(S.won, `autopilot lost at ${S.stageKey}`);
    assert(minT > 3 && S.time < 60, `clock never tense or never threatening (min ${minT.toFixed(1)}, left ${S.time.toFixed(1)})`);
    const P2 = C.newRace(1, 'normal');
    for (let i = 0; i < 60 * 120 && !P2.over; i++) C.stepRace(P2, { steer: 0, brake: false, accel: false }, DT);
    assert(P2.over && !P2.won, 'a parked car won');
  });

  proof('speedometer: kmh is monotonic and tops out at 293; gears climb', () => {
    assert(C.kmh(0) === 0, 'kmh(0) not 0');
    assert(C.kmh(C.CFG.maxSpeed) === 293, `top speed reads ${C.kmh(C.CFG.maxSpeed)}`);
    let last = -1, gear = 1;
    for (let v = 0; v <= C.CFG.maxSpeed; v += 500) {
      assert(C.kmh(v) >= last, 'kmh not monotonic');
      last = C.kmh(v);
      const g = C.gearbox(v);
      assert(g.gear >= gear && g.rpm >= 0 && g.rpm <= 1, 'gearbox went backwards');
      gear = g.gear;
    }
    assert(gear === 5, 'never reached fifth');
  });

  return P;
}

// run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const C = await import('./core.js');
  const results = await runProofs(C);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.msg}`);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} proofs hold`);
  process.exit(failed ? 1 : 0);
}
