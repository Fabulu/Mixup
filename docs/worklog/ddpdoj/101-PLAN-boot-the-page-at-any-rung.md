# PLAN - boot the PAGE at any ladder rung

owner, 2026-08-06:

> "I keep seing a popup playing the game. Probably an oracle run? It always
> starts from 0. Can't we build these to start at save states? We have state
> from mame easily and from ourselves... we have the source, should be
> superduper easy"

status: PLANNED, not started. Small, high value, and the owner's read of the
difficulty is close to right for a reason worth stating.

## THE POPUP IS REAL AND SO IS THE COST

Every wave that changes what is drawn now opens a real browser and photographs
the result. That became the standard because headless gates were repeatedly
green while the page was wrong: the fighter drew nothing, the bomb was grey, the
boss showed a banner and no boss.

The cost is that **reaching the boss is about 8,500 logic frames from boot, and
every wave pays it again**. W96 ran to lf8,518 to see 559 frames of combat.
The art wave has to make the same journey to photograph a picture.

## THE MACHINERY ALREADY EXISTS ON BOTH ENDS

**The page does not power on. It already boots from a save state.**

```
[M] games/ddpdoj/src/web/assets.js:697   const seed = await bin('seed.bin.gz');
[M] games/ddpdoj/tools/export-web.mjs    put('seed.bin', seed)
```

There is simply only ever ONE seed and it sits near the start of the stage.

**And the ladders hold 72 more.** `games/ddpdoj/tools/oracle/out/w69/stage1-sweep/ckpt`
holds 216 files, three per rung, at 250 frame intervals from lf2,000 to
lf19,500:

```
c002000.ram.bin     the 128 KiB work RAM
c002000.bg.bin      the $900000 ring
c002000.regs.txt    the IGS023 registers
```

Those are the same three components the page's single seed is built from. So
the job is **selection, not machinery**: let the page take a rung, and get that
rung's three files to it. The owner's "should be superduper easy" is closer to
right than most such estimates on this project.

## THREE THINGS THAT MUST NOT BE GOT WRONG

### 1. A SEEDED PAGE PROVES CODE, NEVER A ROUTE

This is the one that will mislead somebody. The ladder manifest says it in its
own words, and `docs/knowledge/09` says it generally:

> a seeded comparison validates the CODE from that state, never the route to it

A screenshot taken from rung 33 proves **the boss draws**. It proves nothing
about whether a player can reach the boss. Those are different claims and this
project has confused exactly that kind of pair before: `stageledger.py`'s
RUNNABLE column meant "statically guarded" and was read as "plays", and six
crashes shipped behind it.

**So the page must SAY it is seeded**, visibly, in the same way `seedcmp` prints
its intervention banner on every run. A screenshot with no label is a claim
nobody can audit later.

### 2. THE SWEEP LADDER IS AN INVULNERABLE RUN

`stage1-sweep`'s manifest declares it: `$810424` held at `$FF` from lf1,890, so
the player cannot die. Without that a scripted run dies long before the stage
ends and the deep rungs are unreachable.

**That means its states are not states a player can be in.** No death, no
respawn, no rank drop. Fine for "does the boss draw", wrong for anything about
difficulty, rank or survival. Whoever adds this must carry the intervention
label through to the page, not just the bytes.

### 3. THE LADDERS MUST NOT BE PUBLISHED

**This is the one with teeth.** Those `ram.bin` files are dumps of the board's
own memory. They are ROM-derived by any reasonable definition, and 72 of them is
a large amount of cartridge state.

- `assets/` is gitignored and nothing ROM-derived is ever committed. The ladders
  live under `tools/oracle/out/` and must stay there.
- `build-dist.mjs`'s leak guard checks published files against every ROM
  present. A ladder rung would be caught, and it should be.
- **This is a LOCAL DEVELOPMENT tool, not a site feature.** The published page
  keeps its single seed. If anyone ever wants seeded boot on the live site, that
  is an OWNER DECISION of the same kind as the six `PUBLISH_VERBATIM` entries,
  and it is a much bigger ask than those were.

## SHAPE OF THE WORK

1. Teach the page to accept a rung, most simply a query parameter, defaulting to
   the shipped seed so nothing changes for a normal visitor.
2. Serve the rung's three files from the ladder directory in local development
   only.
3. Print the rung and its intervention on screen, and in whatever the harness
   captures, so a screenshot carries its own provenance.
4. Give the playwright harness a way to say "start at the boss" instead of
   "press fire for eight thousand frames".

## WHY THIS IS WORTH DOING BEFORE MORE PORTING

Every remaining DaiOuJou item is deep in the stage: the boss art, `$29540C`, the
rest of the boss's F scripts, the bees at their fixed scenery positions, stage
2. **All of them are behind an 8,500 frame walk that is currently paid per
wave, per attempt.** This is the same cost inversion `seedcmp` already solved
for the headless comparison, applied to the one check that keeps catching what
the headless gates cannot see.
