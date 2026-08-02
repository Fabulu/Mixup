# Recon: what the loop counter `$1A` actually does

**Date:** 2026-08-02
**Scope:** static question only -- is `$1A` a row-index into EXISTING tables
(like `$9A35[$17]`), or a wave-stream selector (a second game's worth of data)?
Source of truth: `games/gradius/rip/prg.asm`. No `src/` edits, no commit.

## Verdict

**`$1A` is a rank/difficulty scalar, not a wave-stream selector.** Loops 2+ are
**nearly free**: the same code, the same wave data, the same terrain streams --
only a handful of fire-rate / bullet-velocity scalars change. There is no
second game of data hiding behind `$1A`. The plan's assumption ("loop 2+
difficulty cannot exist yet") is correct *as a scope statement* but the reason
isn't that the data is missing -- it's that the **end-of-game / loop-wrap chain
that increments `$1A`** (`$9872`, reached only when `$19 == 6` on stage 7) is not
ported. Five of eight `$1A` consumers are unported, but none of them touch wave
data; the wave/terrain tables are indexed by stage (`$19`) and rank (`$17`),
never by `$1A`.

Same shape as `$82`'s `$9A35[$17]` countdown: **rank-indexed, table-driven,
finite.** `$1A` is the loop analogue of `$17`.

## Writers (complete) -- the increment is indirect

`zpuse.py zp 1A` noise filtered, the genuine writers of the `$1A` byte:

| site | role |
|---|---|
| `$82EC STA $1A` | new-game init (`LDA #$00`), cold-boot zero. Conditional on `$03&2`; on power-on RAM is 0 regardless. |
| `$9B74 STA $1A` | `$9B3E` intro restore: `LDA $28,X / STA $1A` -- pulls the loop count back out of the checkpoint slot. |
| `$97BD LDA $1A / STA $28,X` | the *persist* (save `$1A` into checkpoint slot `$28,X`). This is a READ-to-persist, counted below as a read but not a consumer. |
| **`$9889 INC $28,X`** | **the ONE increment**, and it is not a `$1A` instruction -- it bumps the checkpoint slot, which `$9B74` later reads back into `$1A`. Reached from `$9904` only inside `$9872`, gated on `$19 == 6` (stage 7 clear). Once per 7-stage lap. |

`$1A` is **never clamped on write.** It can in principle grow unbounded; only
the `$CEAC` reader clamps (for table indexing). See "ceiling" below.

## Readers -- all 9 accesses, 8 consumer sites

There are exactly **8 `LDA $1A` + 1 `ORA $1A`** in the whole PRG. `$97BD` is the
persist-read; the other **8 are the consumers** the task names. Classification:

| # | site | shape (bytes) | indexes? | class | port status |
|---|---|---|---|---|---|
| 0 | `$97BD` | `LDA $1A / STA $28,X` | nothing -- persist into checkpoint | persist-read | ported (`flow.js:177`) |
| 1 | `$B003` | `LDY $17 / ($19!=0) INY / ($1A!=0) INY / LDA $B01D,Y` | **row of `$B01D`** (9-byte fire-interval table); `$1A` shifts Y by +1 | **table-index** (rank row, like `$9A35[$17]`) | **ported** (`enemies.js:2226`) |
| 2 | `$B951` | `LDA $1A / BEQ / LDA #$FF / STA $04EC,X / LDA #$00 / STA $03AC,X` | nothing -- sets two object scalars | scalar branch | **absent** (boss-hit `$B914`, boss not ported) |
| 3 | `$BBBF` | `LDA $19 / ORA $1A / BEQ $BBEC` | nothing -- gate flag | scalar flag | **guarded/throw** (`enemies.js:791`) |
| 4 | `$BBC9` | `LDA $1A / BEQ / INY / CMP #$02 / BCC / INY` | nothing -- adds 1 (loop 2) or 2 (loop 3+) to Y | scalar (+rung on the fire ladder `$BBC3`) | **covered by the `$BBBF` throw** -- the `$BBC1 BEQ` jumps the whole ladder when `$19\|$1A == 0`, so any `$1A != 0` that would reach `$BBC9` trips the guard first |
| 5 | `$BC44` | `LDA $1A / BNE $BC59` | nothing -- skips the `$19<2` + player-position firing gate | scalar branch | **guarded/throw** (`enemies.js:854`) |
| 6 | `$BD42` | `LDA $1A / BEQ / [second ADC into `$03EC/$03BC`, `$044C,X = $80`]` | nothing -- bullet dY gets a 2nd accumulation | scalar branch | **ported** (`enemies.js:1090`) |
| 7 | `$BD96` | `LDA $1A / BEQ / [second ADC into `$044C/$042C`, `$03EC,X = $80`]` | nothing -- bullet dX, other axis | scalar branch | **ported** (`enemies.js:1117`) |
| 8 | `$CEAC` | `LDA $1A / CMP #$06 / BCC / LDA #$06 / ASL / TAX / LDA $CF2D,X` (ptr lo/hi into `$98/$99`) | **row of `$CF2D`** -- but the table is FLAT | **table-index (flat)** | **absent** (ending typewriter `$CE94`, end-of-game chain not ported) |

**Per-reader verdict:** 2 of 8 consumers are table-indexed (`$B003`, `$CEAC`);
the other 6 are scalar branches/flags. **Zero are stream-selectors.** No reader
uses `$1A` to pick a wave pointer, a terrain chunk base, a spawn list, or a
`(zp),Y` pointer pair. The only pointer `$1A` produces is at `$CEAC`, and every
word it can select is the same address.

## The two `$1A`-indexed tables

**`$B01D` -- fire-interval / reload (9 bytes), at `$B003`:**
```
B01D: 64 46 3C 37 32 2D 28 23 1E
```
Indexed by `Y = $17 + ($19!=0) + ($1A!=0)`. `$1A` contributes **at most +1** to
Y. This is a **rank-row** table -- the same one `$17` indexes -- just shifted one
row by the loop. The port comment at `enemies.js:2221` says it plainly: *"the
rank row is shifted by the STAGE and by the LOOP, so the same hatch fires faster
on stage 2+ and faster again on loop 2."* Identical mechanism to `$82`'s
`$9A35[$17]`.

**`$CF2D` -- ending-text script pointer (7 words), at `$CEAC`:**
```
CF2D: 3B CF 3B CF 3B CF 3B CF 3B CF 3B CF 3B CF
```
Every one of the 7 entries is `$CF3B`. The loop-indexed ending table is
**decoration**: the ending text is byte-identical in every loop. So even the one
"table" read is a no-op across loops.

## Finite ceiling

- **`$CEAC` clamps `$1A` to 6** before indexing (`CMP #$06 / BCC / LDA #$06`).
  The `$CF2D` table is exactly 7 words. **Supported loop range: 1..7**
  (indices 0..6). Loop 8+ reads entry 6 (clamped) -- no overflow, just repeats
  the same ending. This is the hard finite ceiling of the `$1A`-table data.
- **`$B01D`** has 9 entries; Y tops out well below 9 under the rank system
  (`$17` bounded), so `$1A`'s +1 nudge never runs it off the end.
- The six scalar readers have **no table ceiling** -- they branch on
  zero / non-zero / `< 2`, so an unbounded `$1A` only ever selects "loop 2" or
  "loop 3+" tiers. No new data appears at any tier.

So: **max supported loop = 7** (the ending table width), and even past it nothing
breaks. There is no "loop 8 needs more ROM" cliff anywhere.

## Cross-check: the 5 unported consumers

The task asks whether any of the 5 unported read sites pulls different wave data
the port has never decoded. No:

| site | unported as | wave data? |
|---|---|---|
| `$B951` | absent (boss hit) | no -- writes two object scalars (`$04EC,X`, `$03AC,X`) |
| `$BBBF` | guarded/throw | no -- `ORA` gate flag |
| `$BBC9` | absent (covered by `$BBBF` throw) | no -- +1/+2 rung on the fire-rate ladder |
| `$BC44` | guarded/throw | no -- branch around a firing gate |
| `$CEAC` | absent (ending chain not ported) | no -- indexes `$CF2D`, which is flat (all `$CF3B`) |

**All five are bullet/fire/ending scalars. None touch the wave streams.** The
wave/terrain data is selected by `$19` (stage -- `$A7D0[$19*2]`, the 7 stage
entries) and `$17` (rank), never by `$1A`. Confirmed by exhaustion: there is no
9th read of `$1A` hiding in the terrain streamer `$9C24` or anywhere near the
`$A7xx` wave tables -- the 8 LDA + 1 ORA above are the complete set.

## What it means

**For "finish stage 1":** nothing. Stage 1 is loop 1 (`$1A == 0`); all 8
consumers are inert or take their loop-1 branch, and the port's `zp1A = 0`
(`state.js:200`) is exactly correct. Zero loop-2 work is needed to ship stage 1.
The 3 already-ported sites (`$B003`, `$BD42`, `$BD96`) are dead-but-faithful
while `zp1A` stays 0.

**For loops-2+ scope:** NOT a second game. The cost is:
1. The end-of-game / loop-wrap **chain** itself (`$8B/$8C/$8D` -> `$9872` ->
   `$9889 INC $28,X` -> `$9B3E` restore). This is the real missing piece --
   it's the ending typewriter scene (`$CE94`/`$BB0F`/`$BB1C`), a single finite
   scripted scene, plus the `$98E5 ($8D)` reset into intro. Not data-heavy.
2. Drop the two `zp1A !== 0` throws (`enemies.js:791`, `854`) and let the
   already-correct `$BD42`/`$BD96`/`$B003` arms run.
3. Port three trivial scalars: `$BBC9` (one ladder rung), `$B951` (two STA on
   boss hit), and `$CEAC` (a flat table -- a no-op even when wired).

**Ceiling: 7 loops** before the ending table repeats; scalars are tier-bounded
(loop 2 / loop 3+), not table-bounded. There is no scenario in which loop 2+
pulls wave data the port has never decoded.

## The load-bearing reads

If only two sites matter, they are:

- **`$CEAC` (`LDA $1A / ... / LDA $CF2D,X`)** -- the *only* `$1A`-indexed pointer
  in the ROM, and its 7 target words are all `$CF3B`. This is the single fact
  that rules out "loops select a different stream."
- **`$B003` (`LDA $1A / BEQ / INY / LDA $B01D,Y`)** -- the *only* other
  `$1A`-indexed table, and it's a rank-row nudge (`$1A` adds +1 to a `$17`-based
  Y), the loop analogue of `$82`'s `$9A35[$17]`. Confirms `$1A`'s shape: a rank
  index, not a stream selector.

Everything else is a scalar branch. RULE 2: nothing here was undecidable -- every
reader resolves to bytes in the listing, and both `$1A`-indexed tables are fully
visible in `prg.asm` (`$B01D` 9 bytes, `$CF2D` 7 words).
