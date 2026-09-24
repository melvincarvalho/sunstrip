// SUNSTRIP mutant gate — run with: node mutants.mjs
// Injects deliberate bugs into core.js and demands that the proof suite
// catches every one. A mutant that survives means a proof is missing teeth.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runProofs } from './proofs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'core.js'), 'utf8');

const MUTANTS = [
  ['speed clamp inverted',
    'Math.min(top, S.speed + a * dt)',
    'Math.max(top, S.speed + a * dt)'],
  ['throttle ignored',
    '} else if (input.accel) {',
    '} else if (true) {'],
  ['steering snaps instead of ramping',
    'S.steerV += Math.max(-rate * dt, Math.min(rate * dt, want - S.steerV));',
    'S.steerV = want;'],
  ['offroad penalty removed',
    'S.speed = Math.max(CFG.offroadLimit, S.speed - CFG.offroadDecel * dt);',
    'S.speed = S.speed;'],
  ['centrifugal force flipped',
    'S.playerX -= seg.curve * CFG.centrifugal * pull * frac * frac * dt;',
    'S.playerX += seg.curve * CFG.centrifugal * pull * frac * frac * dt;'],
  ['bends made toothless',
    'centrifugal: 0.62,',
    'centrifugal: 0.4,'],
  ['hills flattened',
    'S.speed - grade * CFG.slopeGrav * dt',
    'S.speed - 0 * CFG.slopeGrav * dt'],
  ['grade read across the wrap',
    'const next = cz + CFG.segLen < len ? segmentAt(S.stage, cz + CFG.segLen) : seg;',
    'const next = segmentAt(S.stage, cz + CFG.segLen);'],
  ['lateral clamp removed',
    'S.playerX = Math.max(-2.2, Math.min(2.2, S.playerX));',
    'S.playerX = Math.max(-22, Math.min(22, S.playerX));'],
  ['fork zone left curved',
    'segs[k].curve = 0;',
    'segs[k].curve = 5;'],
  ['countdown skipped',
    'if (S.countdown > 0) {',
    'if (false) {'],
  ['clock frozen',
    'S.time -= dt;',
    'S.time -= 0;'],
  ['checkpoint bonus dropped',
    'S.time += (CHECKPOINT_TIME[S.stage.tier]',
    'S.time += 0 * (CHECKPOINT_TIME[S.stage.tier]'],
  ['rng made constant',
    'return ((t ^ (t >>> 14)) >>> 0) / 4294967296;',
    'return 0.5;'],
  ['traffic wrap broken',
    'if (c.z > stageLength) { c.z -= stageLength; c.passed = false; }',
    'if (c.z > stageLength) { c.passed = false; }'],
  ['lane change without indicator',
    'if (opts.length) { c.target = opts[Math.floor(rng() * opts.length)]; c.blink = 0.9; }',
    'if (opts.length) { c.target = opts[Math.floor(rng() * opts.length)]; c.blink = 0; }'],
  ['crash consequence-free',
    'S.speed = Math.max(c.speed * 0.5, S.speed * CFG.crashSpeedKeep);',
    'S.speed = S.speed;'],
  ['no ghosting after a crash',
    'S.ghost = CFG.ghostTime;',
    'S.ghost = 0;'],
  ['hit from behind',
    'gap > -CFG.segLen * 0.3 && gap < CFG.segLen * 0.9',
    'gap > -CFG.segLen * 2 && gap < CFG.segLen * 0.9'],
  ['scenery made of air',
    'if (h && !sp.down && Math.abs(S.playerX - sp.off) < h + 0.16) {',
    'if (false) {'],
  ['bushes made solid',
    'bush: 0, sign',
    'bush: 0.3, sign'],
  ['wreck leaves you in the weeds',
    'S.playerX = S.wreckSide * 0.62; S.speed',
    'S.speed'],
  ['fork island hollow',
    'if (half > 0 && Math.abs(S.playerX) < half + 0.12) {',
    'if (false) {'],
  ['projection distance ignored',
    'const scale = depth / (dz / CFG.segLen);',
    'const scale = depth * 1;'],
  ['stage shortened silently',
    'const n = stageSegs(key);',
    'const n = stageSegs(key) - 100;'],
  ['pyramid lost a tier',
    "  ['snow', 'bay', 'metro', 'savanna', 'lastlight'],\n",
    ''],
  ['distance score removed',
    'S.score += dz * 0.01;',
    'S.score += 0;'],
  ['goal bonus removed',
    'S.score += S.time * CFG.goalTimeBonus * S.stage.def.bonus;',
    'S.score += 0;'],
  ['pass bonus paid forever',
    'c.passed = true;',
    'c.passed = false;'],
  ['near miss pays like a pass',
    'sling ? CFG.slingBonus : near ? CFG.nearBonus : CFG.passBonus',
    'sling ? CFG.slingBonus : CFG.passBonus'],
  ['chain survives crashes',
    "        breakChain(S);\n        ev.push('crash');",
    "        ev.push('crash');"],
  ['chain never expires',
    'if (S.chainT > 0) { S.chainT -= dt;',
    'if (S.chainT > 0) { S.chainT -= 0;'],
  ['drift never pays',
    'if (S.drift && !forfeit && S.driftBendT >= CFG.driftMinTime && S.driftPts > 0) {',
    'if (false) {'],
  ['drift pays for a flick',
    'S.driftBendT >= CFG.driftMinTime',
    'S.driftBendT >= 0'],
  ['slipstream disabled',
    "const top = CFG.maxSpeed * (towed ? 1 + CFG.slipBoost : 1);",
    "const top = CFG.maxSpeed;"],
  ['crashed drift still pays',
    'endDrift(S, ev, true);\n        breakChain(S);\n        ev.push(\'crash\');',
    'endDrift(S, ev);\n        breakChain(S);\n        ev.push(\'crash\');'],
  ['traffic drives through traffic',
    'if (!(c.shove > 0)) c.speed +=',
    'if (false) c.speed +='],
  ['routes without trade-offs',
    "palms:   { name: 'PALM MILE',      seed: 202, curviness: 0.7,  hilliness: 0.3,  traffic: 0.8, bonus: 1.0, extra: 3,",
    "palms:   { name: 'PALM MILE',      seed: 202, curviness: 0.7,  hilliness: 0.3,  traffic: 1.2, bonus: 1.0, extra: 3,"],
  ['scenery hit behind the car',
    'for (let k = 1; k < 3 && idx + k < N; k++) {',
    'for (let k = 0; k < 3 && idx + k < N; k++) {'],
  ['weaving farms the tow',
    'const sling = S.towCar === c && S.tow > 0 && !c.slung;',
    'const sling = S.tow > 0;'],
  ['a feather holds a drift',
    'S.driftOff = want * S.drift >= CFG.driftHold ? 0',
    'S.driftOff = want * S.drift > 0 ? 0'],
  ['traffic density uncapped',
    'return Math.min(CFG.trafficCap, Math.round(',
    'return Math.min(1e9, Math.round('],
  ['slingshot double-pays',
    "else ev.push((near ? 'near:' : 'pass:')",
    "ev.push((near ? 'near:' : 'pass:')"],
  ['one shared stream for every car',
    '      rng: makeRng((seed * 31 + i * 7919) >>> 0),   // its own stream: one crash can\'t reshuffle the road\n',
    ''],
  ['spin never triggered',
    'S.spin = CFG.spinTime;',
    'S.spin = 0;'],
  ['clock far too generous',
    'export const START_TIME = 60;',
    'export const START_TIME = 260;'],
  ['collisions at the camera again',
    'export function carZ(S) { return S.z + PLAYER_Z; }',
    'export function carZ(S) { return S.z; }'],
  ['drift pays on straights',
    'if (bend > CFG.driftMinBend) { S.driftBendT',
    'if (true) { S.driftBendT'],
  ['slingshot cut short',
    'S.tow = Math.max(0, S.tow - dt);',
    'S.tow = 0;'],
  ['carry-over uncompressed',
    'if (S.time > CFG.carryFree) S.time = CFG.carryFree + (S.time - CFG.carryFree) * CFG.carryKeep;',
    ''],
  ['lanes pulled in off the kerb',
    'lanePos: [-0.7, 0, 0.7],',
    'lanePos: [-0.5, 0, 0.5],'],
];

const tmpDir = join(here, '.mutants');
mkdirSync(tmpDir, { recursive: true });

let killed = 0;
const survivors = [];
for (let i = 0; i < MUTANTS.length; i++) {
  const [name, from, to] = MUTANTS[i];
  if (!source.includes(from)) {
    console.log(`? ${name} — mutation target not found in core.js`);
    survivors.push(name + ' (target missing)');
    continue;
  }
  const mutated = source.replace(from, to);
  const file = join(tmpDir, `core-mutant-${i}.mjs`);
  writeFileSync(file, mutated);
  const M = await import(`file://${file}`);
  const results = await runProofs(M);
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    killed++;
    console.log(`✓ killed: ${name} (caught by "${failures[0].name}")`);
  } else {
    survivors.push(name);
    console.log(`✗ SURVIVED: ${name}`);
  }
}

rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${killed}/${MUTANTS.length} mutants killed`);
if (survivors.length) { console.log('survivors:', survivors.join(', ')); process.exit(1); }
