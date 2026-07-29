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
    'Math.min(CFG.maxSpeed, S.speed + CFG.accel * dt)',
    'Math.max(CFG.maxSpeed, S.speed + CFG.accel * dt)'],
  ['offroad penalty removed',
    'S.speed = Math.max(CFG.offroadLimit, S.speed - CFG.offroadDecel * dt);',
    'S.speed = S.speed;'],
  ['centrifugal force flipped',
    'S.playerX -= seg.curve * CFG.centrifugal * frac * frac * dt;',
    'S.playerX += seg.curve * CFG.centrifugal * frac * frac * dt;'],
  ['lateral clamp removed',
    'S.playerX = Math.max(-2.2, Math.min(2.2, S.playerX));',
    'S.playerX = Math.max(-22, Math.min(22, S.playerX));'],
  ['fork zone left curved',
    'segs[k].curve = 0;',
    'segs[k].curve = 5;'],
  ['clock frozen',
    'S.time -= dt;',
    'S.time -= 0;'],
  ['checkpoint bonus dropped',
    'S.time += CFG.checkpointTime;',
    'S.time += 0;'],
  ['rng made constant',
    'return ((t ^ (t >>> 14)) >>> 0) / 4294967296;',
    'return 0.5;'],
  ['traffic wrap broken',
    'if (c.z > stageLength) { c.z -= stageLength; c.passed = false; }',
    'if (c.z > stageLength) { c.passed = false; }'],
  ['crash consequence-free',
    'S.speed = Math.max(c.speed * 0.5, S.speed * CFG.crashSpeedKeep);',
    'S.speed = S.speed;'],
  ['projection distance ignored',
    'const scale = CAM_DEPTH / (dz / CFG.segLen);',
    'const scale = CAM_DEPTH * 1;'],
  ['stage shortened silently',
    'const n = CFG.stageSegs;',
    'const n = CFG.stageSegs - 100;'],
  ['distance score removed',
    'S.score += dz * 0.01;',
    'S.score += 0;'],
  ['goal bonus removed',
    'S.score += S.time * CFG.goalTimeBonus;',
    'S.score += 0;'],
  ['pass bonus paid forever',
    'c.passed = true;',
    'c.passed = false;'],
  ['spin never triggered',
    'S.spin = CFG.spinTime;',
    'S.spin = 0;'],
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
