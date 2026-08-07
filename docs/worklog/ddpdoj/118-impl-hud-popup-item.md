# 118 -- IMPL: the chain-BREAK popup, the item row, and install24157A

status: **DONE** (opened IN PROGRESS before coding, 2026-08-07; closed same day).
wave: 118. role: IMPL (the only tree writer this wave is this file plus the
code). target: `ddpdojblk` VERSION-B. Every address is build B. Instrument:
`games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file offset, big-endian),
capstone `CS_MODE_M68K_030`.

This is the IMPL wave for W117's recon. W117 verified both of W113's deferral
reasons were WRONG; this wave ports the three pieces W117 cut.

## 0. PREMISE RE-VERIFIED THIS WAVE (the recon's claim, re-measured)

`[M]` re-disassembled $24157A, $2855B6, $2857B4 and dumped all seven nested
data tables plus the three palette source tables this session. The recon is
accurate. Specifically:

- `[M]` `$24157A` is the palette hi-half installer (the 4th of the nine-routine
  `$24150A` family): `lea $80E886,A1 / lsl.w #$6,D0 / addi.w #$20,D0 / adda.w
  D0,A1 / moveq #$7,D0 / move.l (A0)+,(A1)+ x8 / move.w #$1,$80FA66 / rts`.
- `[M]` `$242AC6` is the already-ported double-dabble BCD converter
  (`src/items.js:1377`).
- `[M]` the popup `$2855B6` and item row `$2857B4` bodies match the recon
  section 3.2/4.1 transcriptions byte for byte.

One refinement the recon stated loosely, pinned here: the popup's per-frame D5
is DUAL-ROLE. At body entry the routine loads D5 = `$1C9778` (or `$1C9980` when
`$80390C == 0`) -- a TILE BASE. The LATE path (`D6 >= $C`) keeps that D5 and
does `D2 = word_table[digit] + D5`. The EARLY path (`D6 < $C`) OVERWRITES D5 to
`floor(popupIdx/3)*4` (the zoom index into the jump table). So D5 is the tile
base in the late path and the zoom index in the early path; both use the same
register. The port transcribes both roles.

## 1. THE THREE PIECES

### Piece 1 -- `install24157A` in `src/palette.js`

A thin hi-half sibling of `install24150A`: same `(ram, pal, d0, src, site, why)`
shape, but `addi.w #$20` before the offset and 8 longwords (16 entries) not 32.
Writes `pal.stageSourced.spr[bank*32 + 16..31]`, sets dirty flag `$80FA66`.

### Piece 2 -- `itemRow2857B4` in `src/hud.js`

`$2857B4` reads `itemCount $81B610`, `bcd242AC6` converts it to a packed-BCD
longword, the 8-nibble walk (`rol.l #4`) emits each significant digit through
`enqueueRegisters(ram, 25, ...)`, then the suffix sprite. No palette install
(`itemKind $81B612` is the sprite colour word, passed as D4). The body reads
its own RAM; signature `itemRow2857B4(ram, rom, ctx)`.

### Piece 3 -- `chainPopup2855B6` in `src/hud.js`

`$2855B6` calls `install24157A` (1x when `popupSpeed != 0`; 1-2x when
`popupSpeed == 0`, the second only when `popupVal >= $100`), then the 4-nibble
walk (`rol.w #4`), then the suffix. Signature
`chainPopup2855B6(ram, rom, ctx, d0, d1, d2, d4, d6)` -- the caller computes the
entry registers (the countdown side effects stay in `playerBlock`; the register
values are captured pre-side-effect to match the ROM body's view).

## 2. ROM WINDOWS

`[M]` the three popup palette source tables (`$2250D8`/`$225118`/`$225158`, 32
bytes each) are ALREADY covered by the W91 window `$222A78+..$2252F8`. No new
window for them; a new assertion pins their bytes anyway.

Two new windows for the `$285xxx` data tables (none of W63/W113/W116 covers
them -- W117 sec 7):
- `$28567C..$2857B4` (len $138): popup late-path words + jump table + the
  40-long per-zoom digit block + the 12-long suffix table.
- `$28587C..$285994` (len $118): item jump table + the 40-long per-zoom digit
  block + the 10-long late-path table + the 4-word 1P/2P base + the 14-long
  suffix table.

`check_hud_popup_item_extents` asserts the jump-table pointers and table
extents out of the image on every export.

## 3. THE MUST-FAIL CHECK (SEEDED)

- Item row SEEDED: `itemCount $81B610 = $10` (BCD 16, two significant digits)
  with `itemDir $81B60E >= 0` emits TWO digit sprites + one suffix into bucket
  25 (counter `$80AFE6` advances 36); NO palette install (dirty flag `$80FA66`
  unchanged). `itemDir < 0` -> the caller returns before the body and the
  counter does not move (RED if the guard is broken).
- Popup SEEDED: `popup $81B5C8 != 0`, `popupVal $81B5DC = $0123` (three
  significant digits after leading-zero suppress), `popupSpeed != 0` ->
  `install24157A` fires once (dirty flag `$80FA66` flips to 1, install count
  rises) + THREE digit sprites + one suffix (counter advances 48). A popup draw
  that skips `install24157A` leaves the dirty flag 0 (RED).
- Combo identity: the popup's emitted digit nibbles are exactly the significant
  BCD digits of `popupVal` (the popup value IS the chain count -- a tested
  invariant, not a comment).

(W117 sec 6.3 said "4 digit sprites" for `$0123`; re-measured, the leading zero
IS suppressed, so `$0123` draws THREE. The COMBO IDENTITY invariant is what the
test pins; the count follows from it.)

## LOG

- opened IN PROGRESS before coding.
- re-disassembled $24157A / $2855B6 / $2857B4 and dumped all data tables +
  palette sources (premise re-verified).
- piece 1: `install24157A` in `src/palette.js` (hi-half sibling of
  `install24150A`).
- piece 2: `itemRow2857B4` in `src/hud.js` (8-nibble walk, no palette install).
- piece 3: `chainPopup2855B6` in `src/hud.js` (palette install + 4-nibble walk
  + suffix); the popup caller block in `playerBlock` now computes the entry
  registers (D6 pre-inc, D2 pre-dec) and calls the body.
- the three `draw(ctx, 0x2857b4)` notes in `extendCounter284AB6` replaced with
  `itemRow2857B4` (rom threaded into that function's signature).
- ROM windows: two new ($28567C+$138, $28587C+$118); the popup's three palette
  sources are inside the existing W91 window. `check_hud_popup_item_extents`
  pins the jump-table pointers, table extents, and the shared 14-byte prefix of
  the three palette sources.
- tests: `tests/w118hud.test.js`, 12 cases. MUST-FAIL red/green demonstrated:
  breaking the popup's `install24157A` call (`if (d2 !== 0)` -> `if (false && ...)`)
  turns test 7 RED (installCount 0, dirty flag 0); restoring turns it GREEN.
- gates: `node --test games/ddpdoj/tests/` -> 1268 pass, 0 fail, **0 skip**.
  `python tools/bosscoverage.py` -> **103/0/8** (unchanged). The web assets
  bundle rebuilt (`node tools/export-web.mjs`) so the bundle/fetch gates see the
  new windows; `node tools/publish.mjs --only ddpdoj --dry` -> bundle gate
  100.0000%, web fetch gate PASS, ROM-leak guard clean (6 pre-existing
  deliberate exceptions, none mine), exit 0.
- the COMBO IDENTITY invariant is a tested fact: the popup's emitted digit
  tiles equal the BCD of `popupVal` byte for byte (late path: D5 base +
  word_table[nibble]; early path: per-zoom-table[nibble]). The popup value IS
  the live chain count (W117 sec 5); the HUD is feature-complete.

## COULD NOT REACH (carried from W117)

- Whether sprite palette bank 7's hi half is already sourced by
  `catchUpObjectStream` before the popup's first frame. The popup installs it
  every frame it draws regardless, so the port is correct either way.
- Dynamic confirmation of the popup's on-screen wobble/position. The position
  arithmetic is transcribed faithfully; the owner live-verifies the rendering.
