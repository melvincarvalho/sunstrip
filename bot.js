// SUNSTRIP autopilot — drives the title-screen attract mode and the balance sims.
// reusable bot: continuous lateral target search, avoids cars incl. their target lanes, lifts in bends
export function botInput(C, S, skill = 1) {
  const cz = Math.min(C.carZ(S), S.stage.length - 1);
  const seg = C.segmentAt(S.stage, cz);
  const ahead = C.segmentAt(S.stage, Math.min(cz + C.CFG.segLen * 12, S.stage.length - 1));
  const frac = S.speed / C.CFG.maxSpeed;
  let best = S.playerX, bestScore = -1e9;
  const into = C.forkInto(S.stage, cz + C.CFG.segLen * 40);
  for (let x = -0.85; x <= 0.851; x += 0.05) {
    let sc = -Math.abs(x - S.playerX) * 400;
    for (const c of S.traffic) {
      const gap = c.z - cz;
      if (gap < -150 || gap > C.CFG.segLen * 45) continue;
      const tl = C.CFG.lanePos[c.target];
      const d = Math.min(Math.abs(c.lane - x), c.blink > 0 || c.laneIdx !== c.target ? Math.abs(tl - x) : 9);
      const hit = (c.truck ? C.CFG.truckHit : C.CFG.carHit) + 0.1;
      const closing = Math.max(300, S.speed - c.speed);
      const tt = gap / closing; // seconds until we reach it
      if (d < hit && S.speed > c.speed && tt < 3.5) sc -= 1e5 / (tt + 0.25);
    }
    if (into > 0 && Math.abs(x) < 0.55) sc -= 1e6;
    if (sc > bestScore) { bestScore = sc; best = x; }
  }
  const pull = seg.curve * C.CFG.centrifugal * frac * frac;
  const want = (best - S.playerX) * 4 + pull / (C.CFG.steerSpeed * Math.max(0.2, frac));
  const steer = Math.max(-1, Math.min(1, want));
  const needLift = Math.abs(pull) > C.CFG.steerSpeed * frac * 0.85 * skill || Math.abs(ahead.curve * C.CFG.centrifugal * frac * frac) > C.CFG.steerSpeed * frac * 0.95 * skill;
  const blocked = bestScore < -2e5;
  // good drivers slide the hard bends instead of lifting — unless a car is
  // in the way, when avoiding it comes first
  let threat = false;
  for (const c of S.traffic) {
    const gap = c.z - cz;
    if (gap < -100 || gap > C.CFG.segLen * 40) continue;
    const tt = gap / Math.max(300, S.speed - c.speed);
    if (tt < 1.6 && S.speed > c.speed && Math.abs(c.lane - S.playerX) < (c.truck ? C.CFG.truckHit : C.CFG.carHit) + 0.2) threat = true;
  }
  if (skill >= 1 && !blocked && !threat) {
    const hard = Math.abs(seg.curve) * C.CFG.centrifugal * frac * frac > C.CFG.steerSpeed * frac * 0.8;
    if (hard || S.drift) {
      const dir = Math.sign(seg.curve) || S.drift;
      const wide = Math.abs(S.playerX) > 0.8 && Math.sign(S.playerX) === dir;
      if (S.drift || Math.abs(S.steerV) > 0.6) {
        return { steer: dir * (wide ? 0.2 : 1), brake: !S.drift, accel: true };
      }
      return { steer: dir, brake: false, accel: true };
    }
  }
  return { steer, brake: blocked && frac > 0.4, accel: !needLift && !blocked };
}
export function run(C, seed, diff = 'normal', route = null, skill = 1) {
  const S = C.newRace(seed, diff); let minT = 1e9, t = 0; const log = [];
  while (!S.over && t < 900) {
    const inp = botInput(C, S, skill);
    if (route && C.forkInto(S.stage, Math.min(C.carZ(S), S.stage.length - 1)) > 0) { const side = route[S.stageNo - 1]; inp.steer = side === 'L' ? (S.playerX > -0.62 ? -1 : 0) : (S.playerX < 0.62 ? 1 : 0); }
    const ev = C.stepRace(S, inp, 1 / 60); t += 1 / 60;
    if (S.countdown <= 0) minT = Math.min(minT, S.time);
    for (const e of ev) if (e.startsWith('checkpoint') || e === 'goal' || e === 'timeout') log.push(`${e}@${t.toFixed(0)}s left=${S.time.toFixed(1)}`);
  }
  return { won: S.won, score: Math.floor(S.score), crashes: S.crashes, wrecks: S.wrecks, passes: S.passes, nears: S.nears, minT: minT.toFixed(1), left: S.time.toFixed(1), route: S.routeTaken.join('>'), log };
}
