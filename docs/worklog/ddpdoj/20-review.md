# W20 REVIEW — the aim pair and the first turrets

status: **DONE** — verdict: **DEFECTS FOUND** (one blocking check-that-cannot-
fail; the port itself is sound and I found no arithmetic or control-flow error)
wave: 20   role: reviewer (DAIOUJOU)   started: 2026-08-02
subject: commit `d1a390c`, `games/ddpdoj/src/{aim,turret,enemyproto}.js`,
`tools/w20turretgate.mjs`, `tools/oracle/{w20turret.lua,w20run.py}`.
READER — nothing in `games/ddpdoj/src/` was left changed; three source breaks
were applied, seen, and restored byte-identical (sha256 both ways).

---

## 0. VERDICT SO FAR

The **translation is right**. Every instruction of `$24203E`, `$2422A2`,
`$242190`, `$2421AC`, `$24218C`, `$24270A`/`$242730`/`$242748`, `$26377A`,
`$2637A2` (both forms) and both turret blocks was re-disassembled from
`out/maincpu.bin` with capstone and compared line by line against the port; I
found no arithmetic or control-flow defect. Every measurement reproduces
exactly, including a from-scratch MAME re-run whose TSV is **byte-identical**
to the committed corpus.

What is wrong is the **evidence**, in three places, one of which is a
check-that-cannot-fail of exactly the shape this project has now found eight
times.

---

## 1. WHAT I RE-RAN, AND WHAT IT SAID

| command | result |
|---|---|
| `node --test games/ddpdoj/tests/` | **238 pass, 0 fail** (matches) |
| `node tools/w20turretgate.mjs` | 14,732 pairs, 0 divergent — every number matches the worklog |
| `... --corpus w20-turret-invuln.tsv` | 32,788 pairs, 0 divergent — matches |
| `... --break all` | **ALL 8 MUTATIONS RED** |
| `python tools/oracle/w20run.py 6000 w20-rev-play` (fresh MAME run) | `sha256` of the new TSV **equals** the committed corpus's, byte for byte: `ffca1497…8891`. 27,415 turret rows, 2,533 driver passes, 4 bombs, **2 deaths**, 11 types — all as reported. Determinism confirmed independently. |

**Table verification against the cartridge.** `LUT64[129]`, `LUT256[65]`,
`BASE64`, `BASE256` and `OPS64` as hard-coded in `tests/aim.test.js` /
`tests/turret.test.js` are **byte-identical to `maincpu.bin`** at `$2420F6`,
`$242362`, `$2420E6`, `$242352`, `$2420C6`. The eight `$242312` stubs are
`d240/9240/9240/d240/9240/d240/d240/9240` — the same sign pattern as
`$2420C6`, as the port assumes.

**Reference counts.** I scanned the whole 6 MB image for absolute-long
occurrences of all 28 library entry points. Every entry `AIM_REFS` calls dead
has **zero** absolute-long occurrences; the live ones agree with `AIM_REFS`
once the PC-relative `bsr`s visible in the listing are added
(`$24202C`: 34 abs + 3 bsr = 37 ✓, `$24203E`: 46 abs + 2 bra = 48 ✓,
`$2422A2`: 45 + 1 = 46 ✓, `$24218C`: 1 + 1 = 2 ✓). The dead-entry throws are
justified.

**The `$2637A2` short form is REAL and the port's transcription is exact.**
Byte counts verified by hand from `$2637A2..$2637DE`:
long = 2 + (skip 4) + 24 + 2 → **$20 written, 28 consumed**;
short = 2 + (skip 4) + 8 + 2 + 12 zeros + 4 → **$20 written, 16 consumed**;
`bset #$7,(-$2,A1)` hits the word's HIGH byte = bit 15; `bpl` takes the SHORT
arm when bit 15 is CLEAR, and the port's `if (flags & 0x8000) long else short`
is the correct polarity. Both `dbra`s return to `$2637A8`, so the form is
re-decided per sub-record. **The recon correction stands.**

**The driver-sufficiency inference is CORRECT.** `$26351A move.w #$39,D6`
(=58 slots) and `$26356C dbra D6,$26351E` is unconditional; the only per-slot
skip is `$26351E tst.w (A5)/beq` on an EMPTY slot. So "if the pass ran, every
present record was dispatched" is a listing fact, not a guess. `$263502
clr.w $815E9C` is genuinely the pass's first instruction — a sound write tap.

**Fall-through, checked myself.** `$2420C4` is the `rts` the `beq $242072`
targets and `$2420C6` is the sign table; `$242318` is the `rts` of stub 0 and
`$24231A` opens stub 1; `$2421A8/$2421AA` is `move.w D0,D1 / rts` (the `beq`
skips the final `and.w D2,D0` — the port matches); `$24272E` is the shared
`rts`; `$2637A0`, `$2637C0`, `$2637DE` are three separate `rts`s and `$2637E0`
is a different routine; and the turret block does fall through into the
UNPORTED fire block at `$268A5A btst #$5,(A6)`, which is named. No
tenth-incident here.

**Version B.** No build-A address in any file this wave added, except
`0x13C806` in the `REL` set of `w20turret.lua`, which is the *build-A release
PC of the `$803940` arm* and is correct and consistent with earlier waves.
`$268A92 tst.w $813098` (the rank loop) sits in the **fire** block, not the
aim — the "rank cannot reach the aim" claim survives reading.

**AN INDEPENDENT 8-OCTANT CHECK I BUILT.** The board corpus reaches only 5 of
8 octants. `tools/recon20/aimmodel.py` is a *different* transcription that was
validated **6,139/6,139 against the cartridge over all 8 octants**, and its
corpus is still on disk. I generated 85,414 input quadruples (a dense delta
grid + 60,000 uniform random over the full 16-bit space + the extremes),
covering **all eight `D4` values 0,2,…,14**, and diffed the Python model
against `src/aim.js`:

```
CROSSCHECK rows=85414 aim64_mismatch=0 aim256_mismatch=0
```

So the JS inherits the recon's cartridge validation, including the three
octants the board never presented and including `aim256`. **This is the
strongest single piece of evidence in the wave and the implementer did not
produce it** — it costs two short scripts and closes gap §6.4.

---

## 2. FINDINGS

### F1 (BLOCKING — a check that cannot fail; the eighth of its kind)
**Every enemy-record offset in `TURRET` is seeded through the same constant it
is read and compared through, in both the gate and the unit tests, so none of
them can fail.** `w20turretgate.mjs:seed()` writes
`ram.setU32(a5 + TURRET.subOff, r.sub)`, `ram.setU8(a5 + TURRET.facingOff, …)`,
`ram.setU8(a5 + TURRET.cadenceOff, …)`, `ram.setU32(a5 + TURRET.gfxOff, …)`,
`ram.setU16(TURRET.freezeGate, g.d0d2)` — and the verdict then reads back at
those same offsets. `tests/turret.test.js:scene()` does the same.

Demonstrated, twice, on the committed tree:

| break | edit | `node --test` | gate |
|---|---|---|---|
| R3 | `TURRET.subOff` `0x06` → `0x0a` | **238 pass, 0 fail** | **RESULT 0 DIVERGENT** |
| R4 | `TURRET.facingOff` `0x33` → `0x37` | **238 pass, 0 fail** | **RESULT 0 DIVERGENT** |

Both restored; `sha256 src/turret.js = df9c4293…8db1` before and after.

The gate validates the *arithmetic* and is blind to the *record layout* —
which is the error class a 68000 record port most often gets wrong. The fix is
cheap and does not need a new run: the corpus already carries the raw record
bytes' meaning per column, so the gate should seed at **literal** offsets
(`a5 + 0x06`, `a5 + 0x33`, …) taken from the Lua/listing, and let `TURRET.*`
be the thing under test. Same for `scene()`.

### F2 (MODERATE — the stated cause of the biggest exclusion is wrong)
The worklog, the commit message and `w20turret.lua`'s own comment all say the
`driver-did-not-run` window "is the player-death / respawn window". It is not.
Measured over the playing corpus:

```
lf    1..1618   drv=0   pre-game, no turret rows          (excluded silently)
lf 1619..4151   drv=1   EVERY frame -- the whole comparison
lf 4152..6000   drv=0   1,849 frames x 6 turret rows = 11,094  <- the exclusion
```

`lives` goes 2 → 1 → 0 → `$FFFF` at lf 3593 (**game over**) and the driver
stops for good at lf 4152. So the exclusion is one contiguous post-game-over
tail, not death windows, and the primary corpus effectively **ends at lf 4151**:
2,533 useful frames of a run billed as 6,000. Nothing about the port changes;
the characterisation and the "6,000 lf" headline do.

### F3 (MODERATE — the headline denominator is ~10× its discriminating power)
Of the 47,520 compared pairs, only **4,817 (10.1 %)** have a facing that
actually changes between N and N+1 (play 1,288/14,732; invuln 3,529/32,788).
The other 42,703 are satisfied by the port leaving `($33,A5)` alone. Aim
executions are 22,175, of which **only 21–22 % move the gun**. The check is not
vacuous — `plain-atan2` still costs 3,689 — but "0 divergent over 47,520 pairs"
is not 47,520 bits of evidence and the worklog decomposes every other
denominator except this one.

### F4 (MODERATE — `aim256` and two of the three target selectors have NO
coverage of any kind)
`aim256` is never called by either turret type, so the gate never executes it;
`tests/aim.test.js` asserts only 5 cardinals, the zero-delta and one mutation.
`targetSelectByA6_2E` (`$242730`, 3 sites) and `targetSelectByA6_2A`
(`$242748`, 1 site) have no test and no gate path at all. Demonstrated:

| break | edit | `node --test` | gate |
|---|---|---|---|
| R2 | `$242730`'s `($2E,A6)` → `($2A,A6)` | **238 pass, 0 fail** | **0 DIVERGENT** |

Restored; `sha256 src/aim.js = 5e982e36…f370` before and after. My §1
cross-check against `aimmodel.py` covers `aim256`'s *arithmetic* over 85,414
rows; it does **not** cover the two selectors' offsets, which remain
listing-only. (I re-read `$24273C tst.b ($2E,A6)` and `$242754 tst.b ($2A,A6)`
— the port is correct as written.)

### F5 (MINOR — the ship's Y never moves)
"A scenario where the ship MOVES" is satisfied only in X. Measured:
`py ∈ {$1000, $1179}` in the playing corpus and `py = $1179` on **every** frame
of the invulnerable one; `px` takes 60 / 91 distinct values over
`$0845..$1C00`. That is the owner's routine executed literally, and it is the
proximate cause of the 5/8 octants and 37/64 outputs. My §1 cross-check
removes the consequence for the aim, but no BOARD row has the ship above a
shooter.

### F6 (MINOR — wrong address in a comment)
`src/enemyproto.js` line 68 and `tools/export-tables.py` both cite
"`$2680E0 moveq #$F`" for type `$10`'s record prototype. The `moveq #$F` is at
**`$2680CA`**; `$2680E0` is `move.b D0,($1D,A5)`. (`$26872E` for type `$11` is
correct.) `tests/turret.test.js:78` calls `A5 = 0x81364C` "the 48-slot band's
slot 0"; the band is 58 slots from `$81332C` and that address is **slot 10**.

### F6b (MINOR — a documented return value the ROM does not produce)
`loadRecordProto()` ends `return table + 2 * (d0 + 1);  // A0 after the walk`,
and `tests/turret.test.js:209` asserts it. But `$26377A` opens
`movem.l D0/A0-A1,-(A7)` (mask `$80C0` = D0, A0, A1) and closes
`movem.l (A7)+,D0/A0-A1` (mask `$0301` = D0, A0, A1) — **A0 is RESTORED**, so
after the ROM routine returns A0 still points at `table`. (`$2637A2` has no
`movem` and genuinely does advance A0, so `loadSubProto`'s return is right.)
Nothing in `src/` consumes the wrong one today; a W23 caller that chains a
second `lea` off it would be misled, and the test currently enshrines the
mistake.

### F7 (MINOR — process hazard, carried over and worse than reported)
The implementer noted "the shared index is still carrying staged deletions of
~20 worklog files". It is carrying **101 staged deletions**, and they now
include `games/ddpdoj/src/{aim,turret,enemyproto,background}.js` — this wave's
own new files. `git status --porcelain | grep -c '^D '` = 101. The commit
itself is sound (I verified `git show HEAD:<path>` is byte-identical to the
working tree for all six new/changed files), but any workflow that commits
through the default index would delete them.

---

## 3. WHAT I COULD NOT DO

* I did not re-run the **invulnerable** corpus from MAME (only the playing one);
  the committed one reproduces the gate exactly and the playing one proved the
  probe deterministic.
* I did not verify `AIM_REFS`'s PC-relative counts exhaustively — only the
  absolute-long half (which is what proves the 23 dead entries dead) plus the
  `bsr`s visible in the listings I read.
* I did not reach the three unexercised octants **on the board**; §1's
  cross-check is against a second transcription, not against the cartridge
  directly, and I say so.
* I did not re-run the **pixel gate** or the other non-`--quick` stages. A
  regression there is structurally impossible from this commit: `git show
  --stat` changes no existing `src/` file, and `grep` shows `src/aim.js`,
  `src/turret.js` and `src/enemyproto.js` are imported by **nothing** outside
  `tests/` and `tools/w20turretgate.mjs`. `pgm.py check --quick` is
  **ALL GREEN — 17 passed, 0 failed, 0 SKIPPED**, which includes the gfx gate
  and its six mutations and the two scroll gates.
* `pgm.py check` now SKIPs the three new turret stages if the TSVs are absent,
  so on a fresh clone the wave's evidence silently drops out of the verdict.
  That is the established pattern for corpus-backed gates here, noted not
  charged.

---

## 4. THE ONE-LINE VERDICT

The aim pair, both prototype loaders and both turret blocks are **translated
correctly** — verified instruction by instruction against `maincpu.bin`, table
byte by table byte, reproduced exactly from a fresh emulator run, and
cross-checked 85,414/85,414 over all eight octants against the recon's
independently cartridge-validated model. **Fix F1 before this counts as
validated**: two of the port's own record offsets can be wrong by four bytes
and every check in the wave still says 0 divergent.
