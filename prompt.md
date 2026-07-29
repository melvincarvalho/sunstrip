# The prompt

This repository is an experiment in prompt-driven game development: build the
game once, then loop harsh sub-agent critics against reproducible screenshots
until the score stops improving. This is the prompt that produced it.

```
Build an OutRun at the level of a modern commercial arcade remake (OutRun
2006: Coast 2 Coast, Horizon Chase Turbo). Single HTML file territory, no
assets — every pixel and sound from code. Not a neon pastiche: the real
OutRun palette — sunset gradients, sea, palms, chrome and asphalt.

Pseudo-3D segmented road done properly: curves that lean, hills that crest,
a draw distance that fogs out, parallax coast behind it. Branching stages —
a fork at the end of every stage, distinct scenery per route. Checkpoints
extend the clock, traffic to slip past, off-road grass that punishes,
radio-dial music selection at the title with in-code synth tracks.

One owner writes the whole game (no parallel fan-out — coupled visual systems
break under split ownership). Then /loop a harsh-critic pass: three separate
sub-agent critics with distinct lenses (composition/color, game-feel juice,
HUD/typography) review deterministic screenshots against the commercial bar,
tag defects FRAME-RUINING / MAJOR / MINOR, and demand concrete fixes. Apply
the consensus fixes as a single owner, re-capture, re-score. Critics must
grade against the bar, not against improvement, and must call out any claimed
fix that didn't land in the pixels. Loop until the score plateaus, then
report the honest final number.

The core simulation must be pure and importable: road geometry, projection,
physics, traffic and the stage tree live in exported functions with no DOM
access. Ship machine-verified proofs (node proofs.mjs) covering projection
invariants, curve/hill continuity, determinism from seed, collision and
clock maths — and a mutant gate that injects deliberate bugs into the core
and proves the suite catches them.
```
