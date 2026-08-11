# W281: DOCKET D16 -- the hyper display is COMPLETE; the producer is the gap

Status: DONE. Suite 1963/1963 (1955 + 8), sweep 0 missing on both, run before the commit.

The owner: *"hyper bar shows you how much hyper you have even when not hypering."* They are
right, the port draws it, and it shows nothing because there is never anything to show. This
wave settles the draw side with a test so no further wave looks there, and redirects D16 --
and probably D17 with it -- at the item producer.

## Starting state

W280 committed and pushed at `9a0298b`, suite 1955/1955.

## FIRST: `$81B63E` MEANS WHAT `hud.js` SAYS IT MEANS

The handoff's own instruction was to settle this before touching a draw, because the whole
question turned on it: if `hyperActiveP1` actually meant "the gauge is armed" then the panel
would show outside a hyper and the port would already be correct.

    $285A12  tst.w $81B63E / bne $285A96     <- non-zero takes the RUNNING arm
    $285A1C  tst.w $81B658 / beq             <- else: is there a REQUEST?
    $285A30  move.w #$1,$81B63E              <- set when a hyper STARTS

Eight write sites in build B, classified by opcode rather than by grep: `$24531E`,
`$245378`, `$249FE0`, `$253930`, `$2539A4`, `$25469E`, `$285A30`, `$285B0C`. The name is
correct. **So the fill panel is genuinely hyper-only, and it is NOT the always-visible
indicator.**

## AND THE ALWAYS-VISIBLE INDICATOR IS THE ICON ROW, WHICH THE PORT ALREADY DRAWS

`$285D74`, the arm taken when `$81B63E` is zero, draws **`$81B6E0` icons from tile
`$1CA008`, guarded by `$81B6E4`**. W279 read that arm and recorded "icons and rank and no
panel" -- correct, and it missed that the icons ARE the hyper display. Measured:

    gate 1, count 1  ->  1 bucket-25 record
    gate 1, count 2  ->  2
    gate 1, count 3  ->  3
    gate 1, count 5  ->  5
    gate 0, count 4  ->  0        the guard is real

One tile at stepped positions, so the row LENGTH is the reading -- asserted, because a port
that varied the tile per unit would look right in a screenshot and be wrong. And a FULL gauge
with no hyper running draws no panel, which is the assertion that separates the two displays.

So the answer to D16 is: **there are two hyper displays, the port has both, and the one the
owner means is the icon row.**

## SO WHY IS THE SCREEN EMPTY

Measured over 900 frames on the shipped seed AND on the laser-hold rung at lf2000:

    $81B65C  the hyper STOCK        every frame: 0
    $81B6E0  the icon COUNT         every frame: 0
    $81B6E4  the GATE               every frame: 0
    $81B642  the gauge              every frame: 0

Nothing in a live run ever raises any of them, so every hyper display correctly draws
nothing. Driven by hand they all respond -- the icon row, and W271's stock row too.

**The gap is the item PRODUCER**, and this is the D3 shape again: a consumer that works,
starved by a producer that never fires.

## A DEAD BRANCH THAT READS LIKE THE CAUSE, PINNED SO IT STOPS COSTING TIME

`spawnItem` still carries a `REFUSED_KINDS` branch with a long note explaining that granting
a P1 hyper stock early would plant a permanent +16 rank error nothing in the port could spend.
That branch is the obvious suspect and it is **dead**: `REFUSED_KINDS` has been `[]` since
W163, when the hyper machine landed. The test asserts the list is empty, because reading that
note and concluding "hyper items are refused" is a mistake this wave nearly made.

## WHAT THE NEXT WAVE SHOULD MEASURE, IN ORDER

1. **Does ANY item spawn in a live run?** Pool A's live count and the item pool at `$8181BA`
   (`ITEM.base`, stride `$40`, 25 slots) were both empty after 900 frames. That is one
   measurement away from telling you whether the producer fires at all or only fires for
   kinds the window never reaches.
2. **If nothing spawns, the shared cause covers D17 too.** `bee.js` says "the medal IS the
   bee", pool A's reserved ten; the medals and the hyper items come out of the same item
   family. One producer defect would explain both docket items, which is exactly the mistake
   D3/D4 warn about in reverse -- **so prove they share a cause rather than assuming it.**
3. Only then go near a draw.

## Docket status

    D13 W279   D14 W280   D15 W279
    D16 REDIRECTED (W281) -- the display is complete and tested; the producer is the gap
    D17 open -- likely the same producer, TO BE PROVEN not assumed
    D18 standing rule -- commit AND push every wave

## Order for the next wave

1. **The item producer**, per the three measurements above. It is the one thread that may
   close both D16 and D17.
2. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`, whose table is windowed.
