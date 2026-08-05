# DIAGNOSTIC 78 — the whole-stage oracle compares ONE logic frame

status: DONE. Measured 2026-08-05 by the orchestrator, reproducing a red that
W67 (T1) reported in passing. Not a wave; no code changed. This exists because
the number at the bottom of W69 is not the number anybody has been quoting.

## HOW THIS SURFACED

W67 closed with `final 74-stage run 73/1/0`, and named the red as W69's segment
sweep, `s14y@lf2016 port=26122 board=25738`, shot slots. That is accurate as far
as it goes. I went to reproduce it and aimed at the wrong ladder — `--segment
2000` on `stage1-sweep` — and got not a red but a **BLOCKED** segment. Chasing
why produced this.

**T1's red is real and correctly identified.** What it is not is the story.

## THE MEASUREMENT

`node games/ddpdoj/tools/seedcmp.mjs --manifest <each> --quiet`, over all four
ladders in `tools/oracle/out/w69/`. No emulator in the loop; these read
checkpoint ladders already on disk.

| ladder | segments | green | red | **blocked** | logic frames compared |
|---|---|---|---|---|---|
| `fly-around` | 8 | 8 | 0 | 0 | 2,000 |
| `stage1-laser-hold` | 209 | 14 | 13 | **182** | 1,657 |
| `stage1-play` | 71 | 1 | 25 | **45** | 6,250 |
| `stage1-sweep` | 71 | 0 | 0 | **71** | **1** |

Three of four exit non-zero. 298 of 359 segments are BLOCKED — the sweep never
gets to the point of agreeing or disagreeing, because the port throws on a
routine it has not ported and the segment is abandoned.

**`stage1-sweep` is the ladder built to answer the owner's request** — *"We need
to oracle through the whole stages. Ideally with saved states so we don't have
to run everything fully all the time."* It cost ~14 minutes of MAME to build,
covers lf2,000 to lf19,500 at a cadence of 250, and it currently compares
**one logic frame in total.**

## WHY — AND IT IS ONE ROUTINE

Census of the blocking throw per ladder:

**`stage1-sweep` — 69 of 71 rungs blocked by a single address.**

| count | address |
|---|---|
| 69 | `$2497AA` |
| 2 | `$2943B0` (the last two rungs, lf19,000+ — the stage end) |

`$2497AA` throws at the **first frame of every rung** from lf2,001 onward.

The ladder's own script explains it exactly. `tail: "1890=C"`, then a
`tailRepeat` cycling `C / CU / C / CL / C / CR / C / CD` every 240 frames until
lf19,560 — so **`C` is held continuously from lf1,890 to the end of the stage**.
And the manifest says what `C` is, in its own words: *"AUTO-SHOT, not tapped
fire: Button 3 (mirror bit 6) is the auto-shot the corpus's own `stage1-open`
and `stage1-deep` already hold, so the ship is FIRING for the whole stage."*

**So: holding the auto-shot button — the ordinary way this game is played —
reaches an unported routine that throws.**

This is the same `$2497AA` the owner reported from the live site by pasting the
throw, and the same button they described as *"hyper button still goes ████"*.
Two independent observations, one cause, and it has been sitting in the queue as
a play-time annoyance while it was silently costing the entire whole-stage
comparison.

**The other two ladders block on different, larger families** (these are not
one routine and should not be briefed as if they were):

- `stage1-play`, 45 blocked: the `$295xxx` family — `$295304` ×17, `$2956F6`
  ×11, `$295120` ×9, `$295432` ×3, `$296DD6` ×2, `$2937AE` ×2, `$294FA6` ×1.
- `stage1-laser-hold`, 182 blocked: a long tail. Largest clusters are
  `$2627CA`/`$26286E`/`$26281C`/`$2629AE`/`$26294E`/`$2628DE` (62 together) and
  a dense run through `$28A520`–`$28A5A0` (~50 across 26 addresses spaced 4–8
  bytes apart — **that spacing is a jump table, not 26 unrelated routines**, and
  porting its dispatch is likely one job rather than twenty-six).

## WHAT THIS CHANGES

**`$2497AA` moves to the front of the queue.** It was ranked behind the
thirty-instruction `$269D84..$269E1C` wiring (72 objects, 7,078 slot-frames).
That ranking was made on visible-pixels payoff and it was reasonable on those
terms, but it did not know this: `$2497AA` is worth 69 rungs of whole-stage
oracle coverage *and* the owner's own reported crash *and* it unblocks the
measurement that would tell us whether the other queued items are right.

Fixing a measurement that returns 1 frame comes before adding more to the pile
it cannot see.

## THE TRAP THIS IS AN INSTANCE OF

`docs/knowledge/10` — coverage is branches, not frames — has a companion this
project keeps re-learning: **a green from a comparison that never ran is not a
green.** The sweep is honest (`BLOCKED` is printed, blocked drives a non-zero
exit, and the summary line prints the count), so nothing lied here. But
`73/1/0` at the top of a gate report reads as "one field wrong", and the
underlying state was "the whole-stage ladder compared one frame". The number
that matters was one line further down.

Same shape as `stageledger.py`'s RUNNABLE column meaning "statically guarded"
rather than "plays", which hid six shipped crashes. Same shape as "100% drawn"
being true at 2,600 frames and 95.61% at 7,000.

**For whoever writes the next gate summary:** a stage that reports PASS/FAIL
should also report *how much it actually compared*, because zero is a number
that passes quietly.

## WHAT IS ACTUALLY RED (not blocked), for the record

`stage1-play`, first divergence per field, earliest first:

```
s14y, s14x, s14v, s21y, s21x, shot1, shot2   first at lf2016  (segment from lf2000)
s14t                                          first at lf2205
s21t                                          first at lf2207
vf, irq6                                      first at lf8227  (segment from lf8000)
```

`s14`/`s21` are shot slots; `port=26122 board=25738` on `s14y` is a difference of
384 = `$180`, a suspiciously round number that suggests a wrap or a spawn-origin
offset rather than accumulated drift — worth checking before anything harder.

`vf`/`irq6` at lf8,227 is the already-known slowdown divergence (W69), and
`76-recon-mister-timing.md` now says what the board's mechanism is.

## NEXT

1. **`$2497AA`** — unblocks 69 rungs of `stage1-sweep` and the owner's crash.
2. **`$28A520`–`$28A5A0`** — port the dispatch, not the leaves; ~50 segments.
3. **`$2627xx`–`$2629xx`** — 62 segments on the laser-hold ladder.
4. **`$295xxx`** — 45 segments on `stage1-play`.
5. **`$2943B0`** — 2 rungs, but they are the stage END.
6. The lf2,016 shot-slot cluster, once the sweep can see past it.
