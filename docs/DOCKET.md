# Player-observed defect docket

Defects seen while playing the live build, in the owner's words, with the
port-side finding underneath. Nothing counts as fixed until a worklog says so and
a focused smoke proves it.

Opened 2026-08-10 from a play session on the shipped web build.

## Fixed

### D1: firing the hyper crashes -- FIXED in W226

Reported as a crash; it was the port's honest `Unreached` on a longword at
`$24BAF6`, the second frame of a hyper beam. The arithmetic was right and the ROM
window was short: the twenty `$24BB0A` pairs point at `$28`-byte strips that
`$2550A0` walks DOWN, so they span `$24B7EA..$24BB0A` while `$24A800+$1100` stops
at `$24B900`. The shared hyper strip `$24BAE2`, the ship arm's upper powers and
the whole formation arm were outside every window. Normal play survived only
because TYPE-A with formation 2 takes the `+$0` arm. Fix: one window,
`$24B900+$02AA`, which also carries the pair table seam-free.

### D2: hyper pickups move far too fast -- FIXED in W226

`$27F0E8 movem.w ($1a,A6),D0-D1` reads two words, at `$1A` and `$1C`. The port
read one word at `$1B`, straddling the pair, so the row `$FFF4001F` moved the
short axis by `$F400` (-3072) instead of `$001F` (+31). Same body: the two draw
biases were swapped, and the animation advance ran after the draws instead of
before, with the borrow inverted.

### D7 (partly) and the rank icons -- FIXED in W230

The rank-icon tables `$2882A6` (P1) and `$288326` (P2), eight longwords each, had
never been harvested into the sprite bundle, so the port enqueued a rank icon
every frame and the page had nothing to draw. Found by the new descriptor sweep.

### D9: CLOSED in W231 -- a death, a respawn and the pods all work

W227 translated `$24CA60` (it clears fifty words of the option block), W228
translated `$25FFA8` (the respawn/game-over fork) and W231 translated the player
object's one-time INIT `$2491C0`/`$249246`, the SET/bonus panel `$2603B0` behind
it, and the pods' deploy `$24C934` it makes reachable.

A death now runs its animation and reset, spends a life, creates a fresh player
object, puts the ship back at the position the respawn entry carries, gives it
`$F0` frames of invulnerability, and deploys its pods to exactly the target
`$24C928` names. The headless scenario survives three deaths and two full
respawns.

What remains is not a defect but the next frontier: when the LAST life goes, the
game-over arm arms dispatcher request 2, which is `$260056`, the credit/continue
entry. That creates object types `$D` and `$B`, and type `$B` is the same
unported `$25DBB4` that D11 is about, so the two meet there.

## Open, in priority order

### D11: the stage transition is abrupt and the ship vanishes mid-transition

The owner's words: finishing a level, the ground goes, then the ship disappears,
then it reappears in the new level, and it is far too abrupt -- the real game runs
a big transition sequence there. Possibly no score totalling either; none is
visible.

NOT the same thing as D9's missing player init, which is a respawn defect. The
lead is that the object dispatch table `$240F62` has two entries the port does not
implement at all, and the descriptor sweep sees both running every frame of
ordinary play:

- entry `[11]` = `$25DBB4`, priority `$0A`, called once per frame. It is a state
  machine that reads `$813098` (the loop flag) and `$813092` (the stage number)
  and calls `$28D53C` and `$23C932`. A stage-level sequencer is exactly the shape
  of the transition engine.
- entry `[4]` = `$260B30`, priority `$09`, called TWICE per frame (once per side:
  it reads `$7(a5)`), dispatching through a jump table at `$260B6A` by `$4(a5)`.

Both are counted as `object dispatch entry [N] -- handler not ported in wave 4`,
1800 and 900 times in a 900-frame run. Whatever the transition should look like,
it cannot happen while these two are no-ops. Start with `[11]`.

### D3 and D4: missing explosions in stages 1 and 2, and the stage-2 mid boss

The descriptor sweep settles what these are NOT. Over 900 frames of stage-1 play,
after the rank-icon fix, **every descriptor the port draws is in the bundle** and
the display list drops nothing. So a missing explosion is not a missing stream
and not a dropped record: its PRODUCER is not running.

The counted gaps from the same run name the candidates, and the effect ones are
`$289AF4` (the secondary effect spawn, "D0=$4 secondary", W26) and `$27F8F8`
(the bullet death effect). Next step for D3 is to run the sweep and read the
counted-gap list rather than to guess: the instrument is
`tools/w230descriptorsweep.mjs`.

### D5: the systemic sprite question -- INSTRUMENT DELIVERED in W230

`tools/w230descriptorsweep.mjs` answers "which sprites cannot draw" mechanically:
it takes the display list the port actually builds and checks every descriptor
against the bundle's own stream table. Bundle-wide it now reports zero. Re-run it
per stage and per boss as coverage grows; a missing sprite that is not in its
output is a producer problem, not a bundle problem.

### D6: bees give no score popup and no collect feedback

Check whether the collect credits score at all or only the presentation is
missing. `src/bee.js` into `src/score.js` / `src/hud.js`.

### D7: the hyper gauges are not painted

The gauge word does count (`$81B642` steps down by 2 per frame while hyper is up,
verified headlessly in W226), so this is likely presentation. The rank icons under
"Fixed" were one instance of the same family; the gauge needs its own look.

### D8: the ship may be missing its large exhausts

Only tiny exhausts draw. Since the sweep says nothing the port draws is missing
from the bundle, the exhaust is either a draw the port never makes or a part of
the ship record it never fills. Check `src/shipsprite.js` against the ROM.

### D10: mobile landscape wastes most of the screen on the browser bar

Presentation only, no simulation risk. The page shell in `src/web/` wants a
fullscreen request on first input plus `viewport-fit=cover` and `100dvh`.

### D12: the repo documentation is well behind the code

`docs/` still describes the project as it was several waves ago:
`00-MASTER-REFERENCE.md`, `01-PORT-PLAN.md` and the `recon-*` documents predate
stages 3 and 4 entirely, and nothing in `docs/` except this docket and
`NEXT_AGENT_HANDOFF.md` mentions the Stage-4 boss, the hyper, the death chain or
the web bundle's shard layout. Worth one pass that brings the top-level documents
up to the code, states where the port actually is stage by stage, and points at
the worklogs for detail rather than restating them.
