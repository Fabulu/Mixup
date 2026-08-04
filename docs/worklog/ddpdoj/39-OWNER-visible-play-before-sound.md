# OWNER DECISION — VISIBLE PLAY comes before SOUND

owner, 2026-08-04. Binding. This REORDERS the queue set in
`27-OWNER-sound-queued-after-stage-1.md`; that file's ten-recon sound round is
not cancelled, it moves behind everything below.

> "Instead of sound, we prioritize getting the enemies and all the weapons
> working and drawing everything. Shots too."

## WHAT PROMPTED IT

The owner loaded the live site (build `20260804145445`), pressed fire, and got
the `$24C180` laser throw. Then reported the game "still has only painted
enemies and no damage, so it's still like the first recording build we had".

Both observations are correct, and neither is visible to any gate we own:

- **The ported enemies are invisible.** `main.js` wires the enemy stack in via
  `makeType5` and it runs — but SPRITE EMISSION is unported, so nothing it
  creates draws. What is on screen is still the 161-frame capture painting the
  ORIGINAL enemies. So the visible enemies are not objects and cannot be shot,
  while the objects that can be shot are not visible.
- **Any press of fire throws.** `$24C164 btst #4,($40,A6)` is the board's own
  gate and fires on the FIRST HELD FRAME. There is no tap short enough to avoid
  it.

W34 measured 343 kills and a `$00532278` score. Those were real — in a headless
harness, against enemies nothing drew.

## THE GAP THIS EXPOSES, AND IT IS THE SAME SHAPE AS ALL THE OTHERS

Every gate we have proves the port matches the board in a HEADLESS harness.
**Nothing checks that the browser page is playable.** No agent was ever asked
that question and no gate answers it. `stageledger.py`'s RUNNABLE meant
"statically guarded", not "plays"; six crashes shipped behind it. This is the
same defect one level higher: green means "fidelity in the harness", not
"a person can play it".

**A playability check belongs in the gate**: load the page headless, run frames,
press fire, fail on any throw. Until that exists, "all gates green" says nothing
about whether the game works.

## THE NEW ORDER

1. **DRAWING — sprite emission.** Until ported objects produce sprites, every
   further handler is more invisible work. This is the row the stage-1 ledger
   has been pointing at all along (L1: 2 of 30 sprite buckets have producers;
   bucket 0 alone was 72% of sprite pixels in W11's ablation).
2. **THE LASER** (`$24C180` and its chain: `$2536FA`, the ramp `$24C8BE`, the
   latch `$24C1A8`, the beam record `$811EF2`, the 45 x `$30` segment table
   `$811F72`). Recon: `37-recon-laser.md`. This currently BLOCKS ALL PLAY.
3. **BOMB and HYPER** — "the super". Recon: `38-recon-bomb-hyper.md`. Their
   rank interaction is safety-critical per `20-OWNER-scoring-must-be-exact.md`.
4. **SHOTS DRAWN.** The shot subsystem computes; the ledger records player shots
   as "computed and INVISIBLE". Drawing them is part of item 1's scope.
5. **The remaining enemy work** so the visible enemies are the ported ones and
   `capture.bin` can go.
6. **SOUND** — the ten-recon round, unchanged in shape, now last.

## THE RECORDED ENEMIES GO

> "Also we have to get rid of the recorded enemies, they look retarded."

Removing them is a GOAL, not a by-product of finishing. The capture-painted
enemies are to be taken off the screen — the owner does not want them there.

**Sequencing, and it needs a decision when the wave is briefed.** If the capture
enemies are removed BEFORE sprite emission draws the ported ones, stage 1 goes
visually empty in that layer until item 1 lands. Two defensible orders:

- **Emission first, then removal.** The screen never regresses; ported enemies
  appear, then the capture layer is switched off and the picture should barely
  change if the port is right — which is itself a strong visual check.
- **Removal first.** The screen is emptier but HONEST: nothing on it is a
  recording. Every enemy that appears afterwards is ours.

The second has real merit for this project specifically, because a screen that
looks right while being sourced from a recording is exactly the kind of false
green that has cost the most here. But it is the owner's call, not the
implementer's — put the question to them rather than picking silently.

### DECIDED: REMOVAL FIRST

> "go removal first. The recorded enemies became off and wrong at some point
> anyway. They were correct in the beginning but I think the stage moves
> differently now"

The owner chose removal first, and the reason is itself a finding.

**The capture is 161 frames. Stage 1 is 7,317 logic frames.** The recorded
enemies are a short loop replayed against a scroll that is now COMPUTED by the
ported scroll VM rather than replayed alongside them. They were correct at the
start because that is where the recording and the computed scroll agree; they
drift because nothing keeps a 161-frame loop in step with a 7,317-frame stage.

So "they look wrong now" is the expected consequence of the scroll being ported
and the enemies not. It is not evidence of a scroll defect — the scroll port is
gated at 0 divergent across its compared columns — but that should be RE-CHECKED
rather than assumed, because "expected consequence" is the kind of explanation
that has been wrong on this project before. If the drift turns out to be faster
or in a different direction than a 161-frame loop predicts, that is a real
divergence hiding behind a plausible story.

Removing them therefore costs less than it looks: what is being deleted is
already wrong on screen. The layer goes empty, and every enemy that appears
after that is ours.

## THE TEST OF DONE, IN THE OWNER'S TERMS

Not a gate number. **Load the page, fly, shoot, laser, bomb, and kill a visible
enemy.** Anything that does not move that sentence forward is not the priority.

---

## STANDING DIRECTIVE — 2026-08-04, evening

> "get back onto daioujou whenever you can, don't stop until that first level is
> feature complete and oracles perfectly."

DaiOuJou stage 1 is the standing priority. Gradius work is permitted when it
does not displace a DaiOuJou wave — a free slot goes to DaiOuJou first.

**"Feature complete AND oracles perfectly" is TWO conditions and both must hold.**
This project has repeatedly satisfied one and reported the pair:

- W27 transcribed all 39 bullet behaviour kinds — none of them executed anywhere.
- The gate read ALL GREEN 49/0/0 while the page was unplayable and the enemies
  on screen were a recording.
- "79.6% of spawns" was 31% of the code.

So the bar is:

1. **FEATURE COMPLETE** — the owner's own test: load the page, fly, shoot,
   laser, bomb, and kill a VISIBLE enemy. Plus the capture ledger empty and
   `capture.bin` deleted. Enemies, weapons, effects, HUD and score all produced
   by ported code.
2. **ORACLES PERFECTLY** — compared against the real board, with the comparison
   demonstrated capable of failing. A green from a gate that is structurally
   blind to the fields in question is not evidence. State per subsystem what is
   compared and what is not.

Neither counts without the other, and a wave that delivers one must say plainly
which one it delivered.
