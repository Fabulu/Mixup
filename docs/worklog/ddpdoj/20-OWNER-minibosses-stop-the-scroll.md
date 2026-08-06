# OWNER OBSERVATION - stationary minibosses stop the scroll

status: **ANSWERED by W19** - see `19-impl-score-chain-rank-ledger.md` JOB 2.
The mechanism guess is RIGHT (the script freezes, an enemy gates the unfreeze:
`$261142`, exactly two callers, `$26C7F4` and `$26D254`, both enemy state
machines, each paired with `clr.w $8130F4`) and the PREDICTION IS WRONG: a
FREEZE does not stop the scroll. `($8,A5)` is read at `$261324` ONLY and that
read guards one instruction, `$26132C addq.w #1,$8130CE`. The camera and the
column writer run frozen; what makes the stage stop ADVANCING is the paired
op-`$04` with `loops = $FFFF`, which loops map columns 210..223 forever while
the picture keeps moving. The stage-1 midboss `$26B6FA` does not freeze
anything - it pushes speed `$0020` at `$26B73A` (and that is the caller of the
one external speed push W17 measured and could not attribute). The only thing
that stops the scroll dead is `$8130D2`, whose two writers in all of build B
are `$25FD82`/`$25FD8C` in the flow layer.
original status: RECORDED (hypothesis with a testable prediction; not yet measured)
raised: 2026-08-02 by the repo owner

> "When there's stationary minibosses, the stages in DOJ stop scrolling until
> they're killed. Other bosses I'm not sure. Maybe depends on the boss."

## Why this matters now

It names the mechanism behind two things the scroll recon already measured but
did not connect:

- the VM has a **FREEZE opcode `$0C`** (payload 0 bytes), and stage 1's script 0
  contains **two FREEZE records** among its 41;
- the stage-1 boss stop is the last two records - `04 FFF2 000E FFFF` + `0C`,
  i.e. REPEAT columns 210..223 forever with the distance clock parked at `$0344`
  - and the recon concluded **"nothing inside the VM can ever end it."**
  W17 then found the boss lock *does* have an exit.

The owner's observation supplies the missing half: **the release is not in the
VM. It is the miniboss dying.** The script freezes, an enemy gates the unfreeze,
and the scroll resumes when it is destroyed.

## The prediction, which is testable on the CURRENT live build

Enemies are not ported. So if the unfreeze is gated on enemy death, the port
**must stall permanently at the first FREEZE record** - the scroll should run
normally and then stop dead, not go black and not loop.

That is a *different* symptom from the black-space report that produced wave 14,
and distinguishing them matters:

| what the owner sees | what it means |
|---|---|
| scrolls, then **stops dead** | FREEZE works; nothing can release it. Expected. |
| scrolls to the stage end | either no FREEZE was reached, or freeze is not ported |
| black space | tile data ran out (the wave-14 bug) |

## What to measure, when the enemy waves come round

1. **Where the two stage-1 FREEZE records sit** (frame and scroll px) - the
   recon decoded every record with its frame/px/column, so this is a lookup, not
   a measurement.
2. **What releases a FREEZE.** Hook the write that resumes the clock and read
   which routine does it. This is the same shape as finding the player mover:
   watch the write, not the listing.
3. **Whether "depends on the boss" is real.** The owner is unsure. Stage index 2
   locks after 13.9 s into a 28-column arena and stage index 4 ends on speed
   `$0000` rather than a loop - so the stages already differ in how they stop.
   Enumerate the stop mechanism per stage rather than assuming one rule.
4. Whether a miniboss is an ordinary entry in the 113-entry enemy table with a
   flag, or a distinct object type.

## Consequence for the port's architecture

The scroll is **not** a pure function of the script. It has an input from the
enemy system, which means the scroll VM cannot be finished in isolation - the
last mile of "the whole level scrolls" depends on enemies being killable.

That is worth saying plainly in the ledger: the background can be *drawn* for
the whole stage now, but the stage cannot be *traversed* end to end until
something can die.
