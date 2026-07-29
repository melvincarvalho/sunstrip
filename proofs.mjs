// SUNSTRIP machine-verified proofs — run with: node proofs.mjs
// Each proof exercises the pure core (core.js). The suite is also imported by
// mutants.mjs, which injects deliberately broken cores and demands failures.

export async function runProofs(C) {
  const P = [];
  const proof = (name, fn) => {
    try { fn(); P.push({ name, pass: true }); }
    catch (e) { P.push({ name, pass: false, msg: e.message }); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const close = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg} (${a} vs ${b})`);

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

  proof('stage: segment count and world length agree with config', () => {
    for (const key of Object.keys(C.STAGES)) {
      const s = C.buildStage(key);
      assert(s.segments.length === C.CFG.stageSegs, `${key} wrong segment count`);
      assert(s.length === C.CFG.stageSegs * C.CFG.segLen, `${key} wrong length`);
    }
  });

  proof('stage: fork zone is straight and level', () => {
    const s = C.buildStage('coast');
    const n = s.segments.length;
    const y0 = s.segments[n - C.CFG.forkSegs].y;
    for (let k = n - C.CFG.forkSegs; k < n; k++) {
      assert(s.segments[k].curve === 0, `curve in fork zone at ${k}`);
      assert(s.segments[k].y === y0, `hill in fork zone at ${k}`);
      assert(s.segments[k].fork, `fork flag missing at ${k}`);
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

  // -- stage tree ----------------------------------------------------------
  proof('tree: every branch resolves and every run is exactly 3 stages', () => {
    for (const [k, kids] of Object.entries(C.STAGE_TREE)) {
      assert(k in C.STAGES, `unknown stage ${k}`);
      if (kids) {
        assert(kids.L in C.STAGE_TREE && kids.R in C.STAGE_TREE, `${k} child missing`);
      }
    }
    for (const k of Object.keys(C.STAGE_TREE)) {
      const leaf = !C.STAGE_TREE[k];
      const depth = C.routeDepth(k);
      assert(leaf ? depth === 2 : depth < 2, `${k} at depth ${depth} breaks the 3-stage pyramid`);
    }
  });

  // -- traffic -------------------------------------------------------------
  proof('traffic: spawns inside the road and inside the stage', () => {
    const s = C.buildStage('coast');
    const cars = C.trafficInit(s, 9);
    assert(cars.length === C.CFG.trafficCount, 'wrong car count');
    for (const c of cars) {
      assert(Math.abs(c.lane) <= 0.9, `lane ${c.lane} off the road`);
      assert(c.z >= 0 && c.z <= s.length, 'car outside stage');
      assert(c.speed >= C.CFG.trafficMinSpeed * C.CFG.maxSpeed - 1e-6 &&
             c.speed <= C.CFG.trafficMaxSpeed * C.CFG.maxSpeed + 1e-6, 'car speed out of band');
    }
  });

  proof('traffic: stepping preserves count and wraps inside the stage', () => {
    const s = C.buildStage('coast');
    const cars = C.trafficInit(s, 9);
    for (let i = 0; i < 10000; i++) C.stepTraffic(cars, s.length, 1 / 60);
    assert(cars.length === C.CFG.trafficCount, 'car lost');
    for (const c of cars) assert(c.z >= 0 && c.z <= s.length, `car escaped at z=${c.z}`);
  });

  // -- physics -------------------------------------------------------------
  proof('physics: speed stays within [0, maxSpeed] under input fuzz', () => {
    const S = C.newRace(5);
    const rng = C.makeRng(77);
    for (let i = 0; i < 20000; i++) {
      const inp = { steer: rng() * 2 - 1, brake: rng() < 0.2, accel: rng() < 0.8 };
      C.stepRace(S, inp, 1 / 60);
      assert(S.speed >= 0 && S.speed <= C.CFG.maxSpeed + 1e-9, `speed ${S.speed} out of range`);
      if (S.over) break;
    }
  });

  proof('physics: lateral position stays clamped under fuzz', () => {
    const S = C.newRace(6);
    const rng = C.makeRng(78);
    for (let i = 0; i < 20000; i++) {
      C.stepRace(S, { steer: rng() < 0.5 ? -1 : 1, brake: false, accel: true }, 1 / 60);
      assert(Math.abs(S.playerX) <= 2.2 + 1e-9, `playerX ${S.playerX} escaped`);
      if (S.over) break;
    }
  });

  proof('physics: grass punishes — offroad speed decays to the offroad limit', () => {
    const S = C.newRace(7);
    S.speed = C.CFG.maxSpeed;
    S.playerX = 2.0;
    S.time = 999;
    for (let i = 0; i < 600; i++) {
      C.stepRace(S, { steer: S.playerX > 2.05 ? -0.05 : 0.05, brake: false, accel: true }, 1 / 60);
      S.playerX = 2.0; // pin the car on the grass
    }
    assert(S.speed <= C.CFG.offroadLimit + 200, `offroad speed still ${S.speed}`);
  });

  proof('physics: centrifugal force pushes outward, scaled by speed', () => {
    const mk = (speed) => {
      const S = C.newRace(8);
      S.speed = speed; S.time = 999;
      // find a hard right-hand curve and park the sim on it
      const i = S.stage.segments.findIndex((sg) => sg.curve > 2.5);
      assert(i > 0, 'no curve found');
      S.z = i * C.CFG.segLen;
      const x0 = S.playerX;
      C.stepRace(S, { steer: 0, brake: false, accel: false }, 1 / 60);
      return S.playerX - x0;
    };
    const fast = mk(C.CFG.maxSpeed), slow = mk(C.CFG.maxSpeed * 0.3);
    assert(fast < 0, 'right curve should push left');
    assert(Math.abs(fast) > Math.abs(slow), 'push should grow with speed');
  });

  proof('physics: collision spins the car and costs speed', () => {
    const S = C.newRace(9);
    S.time = 999; S.speed = C.CFG.maxSpeed;
    const car = S.traffic[0];
    car.z = S.z + C.CFG.segLen * 0.5; car.lane = 0; car.speed = C.CFG.maxSpeed * 0.3;
    S.playerX = 0;
    const before = S.speed;
    const ev = C.stepRace(S, { steer: 0, brake: false, accel: true }, 1 / 60);
    assert(ev.includes('crash'), 'no crash event');
    assert(S.spin > 0, 'no spin after crash');
    assert(S.speed < before * 0.6, `crash kept too much speed (${S.speed})`);
  });

  proof('physics: passing a car pays the pass bonus exactly once', () => {
    const S = C.newRace(10);
    S.time = 999; S.speed = C.CFG.maxSpeed;
    const car = S.traffic[0];
    // place the car just ahead in another lane, slow
    car.z = S.z + C.CFG.segLen * 2; car.lane = 0.62; car.speed = 100;
    S.playerX = -0.62;
    let passes = 0;
    for (let i = 0; i < 240; i++) {
      const ev = C.stepRace(S, { steer: 0, brake: false, accel: true }, 1 / 60);
      passes += ev.filter((e) => e === 'pass').length;
      S.playerX = -0.62;
    }
    assert(passes >= 1, 'pass never scored');
    assert(passes === 1, `pass scored ${passes} times`);
  });

  // -- clock, checkpoints, goal -------------------------------------------
  proof('clock: time runs out to a loss, never negative', () => {
    const S = C.newRace(11);
    S.time = 0.5;
    let ev = [];
    for (let i = 0; i < 120 && !S.over; i++) ev.push(...C.stepRace(S, { steer: 0, brake: false, accel: true }, 1 / 60));
    assert(S.over && !S.won, 'timeout did not end the race');
    assert(S.time === 0, `time is ${S.time} after timeout`);
    assert(ev.includes('timeout'), 'no timeout event');
  });

  proof('checkpoint: stage end extends the clock and advances the route', () => {
    const S = C.newRace(12);
    S.time = 30;
    S.z = S.stage.length - 10;
    S.speed = C.CFG.maxSpeed;
    S.playerX = -0.5; // choose the left gate
    const ev = C.stepRace(S, { steer: 0, brake: false, accel: true }, 1 / 60);
    assert(ev.some((e) => e.startsWith('checkpoint')), 'no checkpoint event');
    assert(S.stageNo === 2, 'stage number did not advance');
    assert(S.stageKey === C.STAGE_TREE.coast.L, 'left gate chose the wrong stage');
    close(S.time, 30 - 1 / 60 + C.CFG.checkpointTime, 0.01, 'checkpoint time not added');
    assert(S.routeTaken.length === 2, 'route not recorded');
  });

  proof('goal: finishing a leaf stage wins and banks the time bonus', () => {
    const S = C.newRace(13);
    S.stageKey = 'desert';
    S.stage = C.buildStage('desert');
    S.stageNo = 3;
    S.z = S.stage.length - 10;
    S.speed = C.CFG.maxSpeed;
    S.time = 20;
    const scoreBefore = S.score;
    const ev = C.stepRace(S, { steer: 0, brake: false, accel: true }, 1 / 60);
    assert(ev.includes('goal'), 'no goal event');
    assert(S.over && S.won, 'goal did not win the race');
    assert(S.score - scoreBefore >= S.time * C.CFG.goalTimeBonus, 'time bonus missing');
  });

  proof('score: driving forward always earns distance points', () => {
    const S = C.newRace(14);
    S.time = 999; S.speed = C.CFG.maxSpeed * 0.5;
    let last = S.score;
    for (let i = 0; i < 600; i++) {
      C.stepRace(S, { steer: 0, brake: false, accel: true }, 1 / 60);
      assert(S.score >= last, 'score went backwards');
      last = S.score;
    }
    assert(S.score > 0, 'no score from driving');
  });

  // -- determinism ---------------------------------------------------------
  proof('determinism: identical seeds and inputs give identical worlds', () => {
    const run = () => {
      const S = C.newRace(99);
      const rng = C.makeRng(1234);
      for (let i = 0; i < 3000; i++) {
        C.stepRace(S, { steer: rng() * 2 - 1, brake: rng() < 0.1, accel: true }, 1 / 60);
        if (S.over) break;
      }
      return C.stateHash(S);
    };
    assert(run() === run(), 'same run diverged');
  });

  proof('speedometer: kmh is monotonic and tops out at 293', () => {
    assert(C.kmh(0) === 0, 'kmh(0) not 0');
    assert(C.kmh(C.CFG.maxSpeed) === 293, `top speed reads ${C.kmh(C.CFG.maxSpeed)}`);
    let last = -1;
    for (let v = 0; v <= C.CFG.maxSpeed; v += 500) {
      assert(C.kmh(v) >= last, 'kmh not monotonic');
      last = C.kmh(v);
    }
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
