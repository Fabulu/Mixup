# 106 -- RECON: the boss death explosion and the laser bomb translucency

status: DONE

started: 2026-08-06. wave: 106. role: RECON (READ-ONLY; the only tree file I
write is this one; scratch lives in `.scratch/w106/`, gitignored).
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file
offset), capstone `CS_MODE_M68K_030`.

Two owner play reports, both answered from the ROM with addresses.

`[M]` = measured by me, this session. `[cited]` = from another document, named.

---

## Q1 -- BOSS DEATH HAS NO EXPLOSION. The missing routine, ported vs not, smallest port.

### THE CHAIN RE-READ, BOTH ENDS

`[cited: src/boss.js, src/stageend.js]`, read in full. The death chain the port
already has:

```
$294AD8   bossDamage: HP0 < 0 with a live player -> $294BA4 bra
$294DD4   bossDeath: sets flags, dying=1, kills the two PARTS, arms
          A0 script 1 ($294E2C, the death drift $2933C2) and
          A3 script 6 ($294E34, D-script 6 $293DC6/$293E04)
$293E04   D-script 6, the 7-state death animation. ALL its emitters are
          NOTED (counted) in BOSS_NOTED, none run. ~482 frames, last 128
          are the state-6 wait.
$293E16   state 6 end: jsr $2595E8 -- $812E06 := 1
$25962E   tst.w $812E06 / ori.w #$1,sr -> C=1
$29291E   bcc NOT taken -> $292922 jsr $242952 (stage advance)  PORTED
$292928   jmp $263762 -- the boss record is freed               PORTED
```

The stage IS advancing -- the owner saw the boss disappear. So the missing
visual is NOT the stage-clear banner (`$28E7F8`, 299 instructions, NOT ported,
declared deviation) and NOT the result screen (`$28D9AA`, 819 instructions, NOT
ported). Those are downstream of `$242952` and belong to object type 6's
presentation tier. **The missing visual is the boss's OWN death explosion: the
pool-B effect bursts D-script 6 emits during its ~354 frames of states 0-5.**

### THE HEADLINE: THE ALLOCATOR AND DRIVER ARE ALREADY PORTED. boss.js's NOTE IS STALE.

`[M]` `$289004`, the explosion allocator, IS PORTED as `spawnEffect` in
`src/effects.js` (W54, "E5b"). Its driver `$288E4E` IS PORTED as
`runEffectDriver` in the same file, and `[M]` it runs EVERY FRAME via
`src/type5.js` `case TYPE5.effectDriver` (call #5 of the type-5 object's 23).
Pool B (`$81B732`, 80 slots x $38) is fully functional: allocate, step, cull,
animate, emit. The art for pool B's effect kinds shipped with W54 (enemy deaths
already use it: `src/handlers.js`, `src/midboss.js`).

`[M]` `src/boss.js`'s `BOSS_NOTED[0x289004]` reads:

> *"`$289004` ... the D-script-6 EXPLOSION allocator (the $28Axxx effect family,
> deferred whole since W53)"*

**THIS IS STALE.** W54 ported `$289004` + `$288E4E` and shipped them for enemy
deaths. Another "comment that lied" / "verified has a shelf life" instance
(CATCHUP §4's standing count is now one higher). The boss files do not import
`effects.js` and never call `spawnEffect` -- `[M]` zero occurrences across
`boss.js`, `bossf23.js`, `bossscripts.js`, `bossphase.js`, `bossarrival.js`.

So the gap is narrow: the boss death path COUNTS `$289004`/`$2938AE`/`$28B4BE`
as notes instead of calling the already-ported `spawnEffect`.

### WHAT D-SCRIPT 6 ACTUALLY SPAWNS (disassembled $293E04..$294132)

`[M]` D-script 6's step. Seven states, walked high-to-low. The visual emitters,
all routing through `$289004`:

| state | ROM site | what it spawns | kind(s) |
|---|---|---|---|
| 0 | `$29412E bsr $2938AE` (table `$294154`) | 8-particle burst at boss pos | $85,$87,$0D,$87,$87,$07,$05,$0D |
| 1 (timer B) | `$293E3A jsr $289004` | 1 particle, spd $14, up-drift | $05 |
| 1 (timer A) | `$293E7E`,`$293EAA jsr $289004` | 2 particles, spd $18/$14 | $10,$10 |
| 1 end | `$2940F0 bsr $2938AE` (table `$2941B6`) | 4-particle burst | $85,$87,$0D,$87 |
| 2 (timer C) | `$29403C jsr $289004` | 1 particle from table `$2941E8` | (per table) |
| 2 (toggle) | `$29409C jsr $28B4BE` | the BIG 5-particle burst, every 2nd tick | $04,$07,$04,$05,$05 |
| 3 (timer C) | `$293F8C jsr $289004` | 1 particle from table `$2941E8` | (per table) |

`$2938AE` is a ~20-instruction table-driven burst: reads 12-byte entries
`[delay:2][kind:2][f1c:2][nudge:4][loopctl:2]` terminated by `$FFFF`, calls
`$289004` per entry, sets bucket=$C, position=boss, nudge from table.
`$28B4BE` is 5 sequential `$289004` calls with kinds 4,7,4,5,5 and an RNG angle
jitter via `$242B3C`.

The timer-D table at `$294134` (8 entries, stepped by 4 and masked to `$1F`)
holds ONLY sound routines -- `$28C25A`/`$28C274`/`$28C2A8`/`$28C2C2`. Timer D
contributes no visuals.

`$2440E0` (state 5, the single big burst at the state-5->6 transition) spawns
into POOL A (`$8171BE`), which W52 REFUSED (no driver ported, `[cited:
effects.js]`). It is one moment, not the bulk, and not the smallest port.

### THE TWO PART SCRIPTS are the same shape

`[M]` `src/boss.js` `partScriptStep` (A3 scripts 4 and 5, the side parts
falling off) also COUNT `$2938AE` (state 0 and state 2) rather than calling it.
Same fix, smaller visual payoff (the parts are off-screen by then).

### WHAT IS PORTED vs NOT on the death path

| thing | status |
|---|---|
| `$294AD8` damage pass, `$294DD4` death, parts, A0/A3 arming | PORTED (boss.js) |
| A0 script 1, the death drift `$2933C2` | PORTED (boss.js) |
| D-script 6 arithmetic `$293DC6`/`$293E04` (the state machine) | PORTED (boss.js) |
| **D-script 6's explosion EMITTERS (`$289004`/`$2938AE`/`$28B4BE`)** | **NOT PORTED -- counted as notes. THIS IS THE GAP.** |
| `$289004` allocator / `$288E4E` driver / pool B | PORTED (effects.js, W54); driver runs every frame |
| `$242952` stage advance | PORTED (stageend.js) |
| `$292928` boss record free | PORTED (boss.js -> freeEnemy) |
| `$28E7F8` stage-clear banner (299 insns) | NOT PORTED (declared deviation) |
| `$28D9AA` result screen (819 insns) | NOT PORTED (declared deviation) |
| `$285400` HUD tally | NOT PORTED |
| `$2440E0` pool-A big burst (state 5) | NOT PORTED (pool A refused, W52) |

The boss fight runs clean to ~lf19533; the only remaining throw is `$229DF8`
(a 2 KB data-export window at the stage-1 tail, reached AFTER the death), so the
explosion gap is upstream of that, confirmed.

### THE SMALLEST PORT THAT MAKES THE BOSS VISIBLY EXPLODE

In `src/boss.js` `d6Step293E04`, replace the counted notes with real calls to
the already-ported `spawnEffect` (import from `./effects.js`), plus the field
writes the ROM does. Concretely, three sites, in visual priority order:

1. **The two `$2938AE` table bursts (states 0 and 1).** Port the ~20-instruction
   `$2938AE` helper: read 12-byte entries from the ROM tables `$294154` (state 0)
   and `$2941B6` (state 1), call `spawnEffect(ram, ctx, kind, 0x2938AE)` per
   entry, set `+$1C` (palette attr), `+$18` (delay), `+$26` (nudge long),
   `+$02` (boss position from A6), `+$1E=$0C` (bucket), `+$12/$14 = 0`. This is
   the FIRST thing the owner sees (death frame + state-1 end) and the smallest
   unit that produces an unmistakable explosion. Tables are in the boss bank and
   already readable via `rom.u16`/`rom.u32` (the port reads `$293694` the same
   way).

2. **The state-2/3 timer-C direct spawns (`$293F8C`, `$29403C`).** Each reads a
   kind from table `$2941E8` and calls `$289004` with bucket $C, nudge, position,
   speed. These are the SUSTAINED mid-death explosions and are the bulk of the
   ~354-frame sequence.

3. **The `$28B4BE` big burst (state 2 toggle, `$29409C`).** Five `spawnEffect`
   calls with RNG angle (`$242B3C`, already in `rng.js`'s family -- needs a
   check it is exported, else transcribe the 6 instructions). Optional for the
   smallest port; gives the periodic big booms.

Item 1 ALONE makes the boss visibly explode on death. Items 1+2 reproduce most
of the sequence. The art already ships; the driver already runs; no new pool, no
new window, no new object type. The ROM addresses the implementer names in
`unportedLog` (`0x289004` etc.) become real calls, and the stale `BOSS_NOTED`
entry for `0x289004` is corrected.

---

## Q2 -- LASER BOMB TRANSLUCENCY. Current render, the four candidates, the missing measurement.

### WHAT ALPHA / TRANSLUCENCY IS CURRENTLY RENDERED

`[M]` **NONE.** The port has no translucency anywhere:

* `src/render/sprites.js` `SpriteDrawer` writes a palette INDEX per pixel. A
  sprite bit is either transparent (skipped) or a full opacity index. There is
  no alpha byte, no blend, no `globalAlpha`.
* `src/web/app.js:731` takes the canvas context with `alpha: false`.
* `src/render/spritelist.js` decodes the sprite record into {xgrow,xzom,x,
  ygrow,yzom,y,flip,color,pri,offs,width,height}. **There is no alpha/translucency
  bit decoded** -- and there is not one to decode: `[cited: src/render/capture.js
  lines 39-44, 78-85]` and `[cited: recon 77]` state the PGM sprite hardware has
  NO blender. Transparency on this hardware is faked by drawing on alternate
  frames, not by alpha.

So the owner's "translucent" is a perception of the OUTPUT, not a port render
mode. The bomb's non-transparent pixels are drawn at full opacity in orange
(since W91 sourced bank 6 from the cartridge: `$222A78`/`$222AB8` =
white->pale-yellow->gold->orange).

### THE FOUR CANDIDATES (W90/W100), and their status

`[cited: docs/worklog/ddpdoj/100-impl-owner-four.md §1, 90-impl §2.5]`

1. **ALTERNATE-FRAME DRAWING (the hardware's transparency trick).** RULED OUT.
   `[M W90/W100]` the LASER bomb draws on 131 of 132 live frames -- EVERY frame,
   no parity gate anywhere in `$256120`/`$2561AA`. (The ORDINARY bomb's FADE
   phase does alternate via `$255F1C tst.w $80390C`, but the owner's report and
   screenshots are the laser bomb.)
2. **A CAPTURE-SOURCED PALETTE (wrong colour reads as thin).** RULED OUT, and
   this is why the colour is now right. `[M W91]` bank 6 is sourced from the
   cartridge outside the object stream; W100 §1.2 confirmed all five laser-bomb
   appearance classes are colour 6.
3. **THE BIT-7 AURA W65 TURNED ON, overlaid on the beam.** RULED OUT. `[M W100
   §1.3]` bit 7 is set on every frame of the bomb, but `$24A48C bmi $24A4E2`
   routes bit-7 frames down a DIFFERENT arm with an indirect table and a
   different size -- the aura REPLACES the invulnerability blink, it does not
   haze over the beam.
4. **AUTHENTIC ARTWORK -- the sprite pixels are genuinely sparse.** UNRESOLVED.
   Nothing in this repo compares the bomb's PIXELS against the board. `[cited:
   W100 §1.4]` no MAME scenario in `scenarios.json` drops a laser bomb, and
   `[cited: W91]` no bomb was dropped in the 161 recorded capture frames.

### IS THE CURRENT RENDER A GUESS?

**No translucency is being guessed at all** -- the port draws opaque pixels, the
same way the hardware does (the hardware has no blender). What is UNVERIFIED is
whether the port's bomb matches the board's bomb pixel-for-pixel: the port could
be correct (the artwork is simply sparse, so it looks thin on both) or it could
be missing density (wrong stream, missing records). **No board comparison
exists for the laser bomb, so the current output has zero board backing either
way.** That is the unknown, stated plainly.

### THE EXACT MEASUREMENT THE FOURTH CANDIDATE NEEDS

`[cited: W100 §1.4]` One MAME run:

1. A MAME checkpoint (`pgm.py ckpt`) of `ddpdojblk` with Button 2 pressed WHILE
   THE BEAM IS UP (fire held to raise the laser, then bomb), taken through the
   bomb's ~132 live frames.
2. `tools/boarddl.mjs` on the checkpoint to extract the board's own display list
   (`$800000`, 5 words/entry) and the framebuffer for those frames.
3. Compare: (a) how many records the cartridge emits per frame in which buckets,
   against the port's `ctx.bombEvent`/display-list; (b) the framebuffer pixels
   against a port render at the same state.

That comparison settles whether the port's bomb is pixel-faithful (artwork is
just sparse) or wrong (something is thinning it).

### DID I DO NEW ROM/MAME WORK?

**No.** The brief said do new work ONLY if a candidate is quickly resolvable
without a long run. Candidate 4 requires a brand-new MAME scenario with
specific held-input over thousands of frames -- not quick. The ROM alone cannot
settle a pixel comparison; it can only describe the artwork, which the port
already transcribes. So this is a status-confirm + clearly-state-the-unknown.

---

## FILES

* Worklog: `docs/worklog/ddpdoj/106-recon-boss-death-and-bomb.md` (this file).
* Source read (READ-ONLY, not modified): `src/stageend.js`, `src/boss.js`,
  `src/bossscripts.js`, `src/bossf23.js`, `src/effects.js`, `src/type5.js`,
  `src/bomb.js`, `src/laser.js`, `src/render/sprites.js`, `src/render/spritelist.js`,
  `src/render/index.js`, `src/render/capture.js`, `src/rng.js`, `src/web/app.js`.
* ROM read: `tools/oracle/out/maincpu.bin` via `tools/oracle/w27disasm.py` and
  throwaway python in `.scratch/w106/` (gitignored). Nothing committed.

status: DONE
