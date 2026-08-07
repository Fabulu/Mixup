# 116 -- IMPL: the HUD OTHER text (Wave C' of the HUD port)

status: **DONE** (opened IN PROGRESS before coding, 2026-08-07; closed same day)

started: 2026-08-07. wave: 116. role: IMPL (I own `games/ddpdoj/src/` this wave,
and the one `tools/export-tables.py` accompaniment the bodies require). target:
`ddpdojblk` VERSION-B. Every address is build B unless tagged "(A)".

The plan is W112 (sections 1.2, 2, 2.2) and W114 (section 4, the MAME-captured
`$240DC2` callers). The score DIGITS already ship (W115) via their OWN flush
`$185DC4`. This wave ports the OTHER text -- lives, bombs, credits, chain
high-water, hyper-stock icons, the panel/hyper labels -- which ride the general
text defer path (`$240DC2` printer + `$141258` flush) into the SAME TxVram W115
added. It does NOT touch the score-digit path, the sprite frames (W113), the
input layer, or the bee.

## PREMISE CHECK (done before coding)

Verified directly off `maincpu.bin` (capstone 5.0.7, `.scratch/w116/dasm.py`):

- `$240DC2` IS a deferred-(address,value)-write printer to the `$80B058` buffer
  (cursor `$80C8D8`, terminator `$FFFFFFFF`), exactly as W112 sec 2 drew it.
  CONFIRMED. The destination is `$904000 + position` (a TX tilemap cell).
- The 4 variants, measured this session:
  - `$240DC2`: grid, tile = `(D4 + $C0000000) + $10000 * cellIndex`. Args
    D0 (outer step), D1 (base col), D2 (outer count), D3 (inner count), D4
    (start tile).
  - `$240E1A` (== `$240E1E`, the entry with the prologue): grid + a caller
    inter-column tile stride. Computes `$80D518 := ((D5 - D3 - 1) & $FFFF)<<16`
    (`$240E2C..$240E34`) and adds it to D4 between columns (`$240E62`).
  - `$240E84`: SINGLE cell. dest = `$904000 + D0 + D1`, tile = `D4|$C0000000`.
  - `$240EBC`: grid filled with the ONE blank tile `$C0000000` (D4 := $C0000000
    at `$240ECE`, NO per-cell increment). Used to clear regions.
- The flush `$141258` IS the 3rd IRQ6-gated routine (`machine.js isr6Gated[2]`,
  build A). CONFIRMED. Body: drains `(dest,value)` longword pairs from `$80B058`
  until `$FFFFFFFF`, writing each value to its dest (`$14126C move.l (a0)+,(a1)`).
  Its tail `$14123A` IS `deferReset` (clears `$80D518`, re-arms the terminator,
  resets the cursor) -- so the flush drains AND re-arms each IRQ6.
- The BG defer path: `$141258` writes `M[dest] = value` for ANY dest. In the
  PORT, `background.js` writes `BgVram` DIRECTLY (`writeMapLong`), so NO bg
  entries ever enter `$80B058`; only `$904xxx` (TX) entries do. The flush routes
  TX-range dests to TxVram and notes anything else (defensive -- expected never).
- TxVram exists (W115) and `st.tx`/`wantTx` are on (W115). `deferReset`
  (`background.js`) resets the buffer head each init. CONFIRMED.
- The text bodies' register args, measured this session (`dasm.py walk`):
  - lives `$2878CC`/`$28795C`: D0=$BC, D1=$200(P1)/$1900(P2); 6 vertical slots
    (D7=5), each a 2-wide icon (D2=1,D3=0); icon tile from `$2881E2[$813084*2]`
    (P1) / `$2881EA[$813086*2]` (P2); remaining slots blanked by `$240EBC`.
  - bombs `$287ABE`/`$287AF0`: D0=$D4, D1=$0/$1A00, D2=7, D3=1, D4=$404000A/
    $3EE000A; `jmp $240DC2`. NO table read -- a fixed graphic.
  - hyper-stock `$286ED6`/`$286F3E`: D0=$C8, D1=$200/$1400, D2=2, D3=5; tile
    from `$2883E6[$81B65C*4]` (or the active tile $414000A when hyper active).
  - credits `$285FB6`: called with D0=$D4, D1=$200/$1400, D5=`$812910`/
    $812912, D6=`$812900`/$81290E (the credit BCD count). 1-digit and 2-digit
    arms over tables `$287F86`/`$287F7A`/`$287FAE`/`$287FD6`, using `$240E1A`.
  - chain high-water `$286040`: called with D0=$D4, D1=$200/$1400, D6=`$81B632`/
    $81B634. Draws the label (imm $53D000A) + a 4-digit BCD walk over `$287FFE`
    via `$240E1A`.
- The slide-in's LAST frame (`$284E7A..$284F6A`) draws lives INLINE (table
  `$2881E2[$81043E*2]`, the player-record shipSel -- NOT `$813084`), then calls
  the hyper-stock + bombs + panel-label (`$284EEC`, imm `$54F000A`). This inline
  path is what shows lives in normal stage-1 play; the body `$2878CC` itself is
  only reached from the dead `$8130F9 bit0` arm.

ONE PREMISE NOTE: the lives body `$2878CC` reads `$813084` (a standalone ship-
select word) while the slide-in inline reads `$81043E` (`RAM.player1 + P.shipSel`).
Both index `$2881E2`. The port honours both as-written.

## WHAT IS PORTING

1. The `$240DC2` printer + 3 variants (`$240E1A`, `$240E84`, `$240EBC`) as JS
   that appends `(dest, tile)` longword pairs to the `$80B058` defer buffer in
   RAM (the port's `Ram` already models that region; `deferReset` arms it). One
   private `txDeferGrid` core + four thin wrappers, transcribed cell-for-cell
   from the listings.
2. The flush `$141258` as a per-frame drain of `$80B058` into TxVram (TX-range
   dests -> `txvram.setLong`), including its `deferReset` tail. Wired as the 3rd
   ISR6 gated routine in `src/isr.js` (before the score flush `$185DC4`).
3. The text bodies: lives, bombs (P1/P2), hyper-stock (P1/P2), credits, chain
   high-water. Each replaces a former `draw(ctx, addr)` NOTE.
4. The slide-in wiring: the inline lives loop, the panel-label inline, and the
   body calls (hyper-stock, bombs) replace the NOTEs at `$284E7A..$284F6A` and
   the playerBlock credit/chain sites.
5. Three ROM windows added to `tools/export-tables.py` (the W113-analogous
   accompaniment): lives icon `$2881E2`, hyper-stock `$2883E6`, and the
   credit/chain-hw digit-table tails `$287FCA..$28803E`. Without these the
   table-reading bodies would `unreached`-throw in production.

## MUST-FAIL CHECK (SEEDED) -- RED -> GREEN

`tests/w116hud.test.js` holds it:
- RED (no flush): seed, call `txPrint240DC2(...)` -> the defer buffer holds the
  entry but `TxVram.long(dest) === 0`.
- GREEN (the flush): same seed, call `flushTextDefer141258` -> TxVram holds the
  tile; the buffer is re-armed (cursor back at head).
- RED (broken flush): a flush that skips `txvram.setLong` -> TxVram stays blank.
- The lives body (`$2878CC`): seed `$813084`=0, `$8130BE`=3, run the body +
  flush, assert the icon tile (`$2881E2[0]` = `$06270012`) lands at the lives
  cells and the buffer holds the expected entry count.

## LOG

- opened IN PROGRESS before coding.
- read W112, W114, W115, src/{hud,background,isr,machine,rom}.js, web/app.js
  context.
- `[M]` disassembled `$240DC2`/`$240E1A`/`$240E84`/`$240EBC`, the flush
  `$141258` + tail `$14123A`, and the 8 text bodies + their playerBlock/slide-in
  caller contexts.
- `[M]` confirmed the W63 ROM window `$287E8E+$13C` covers `$287F7A`/`$287F86`/
  `$287FAE(base)` but NOT the tails `$287FD6`/`$287FFE`; lives `$2881E2` and
  hyper-stock `$2883E6` are outside every window.
- ported the 4 printer variants + the flush + the 6 text bodies; wired the flush
  as the 3rd ISR6 routine and the bodies into slideIn/playerBlock.
- added `u32` to ram.js (the printer's `>>> 0` half).
- added 3 ROM windows to export-tables.py + regenerated player.tables.json and
  the gzipped asset (both gitignored under `rip/` and `assets/`).
- `[M]` the printer needs TWO port-specific bounds the ROM does not have, both
  forced by tests that drop the HUD straight into state 1 on fresh RAM or run
  many main-loop iterations without an IRQ6 flush: (a) refuse an out-of-range
  cursor (unarmed buffer draws nothing, same as the ROM's null-sentinel case),
  and (b) stop appending when the buffer is near full so a long no-flush run
  cannot walk the cursor past `$80C8D8` into the rest of main RAM. The flush's
  walk is likewise bounded at the buffer end. In production the per-IRQ6 flush
  + `deferReset` keep the cursor in range, so neither bound changes shipped
  behaviour; both are declared here in the code.
- `[M]` updated W63's hyper-latch test: the two `$240DC2` NOTEs it counted are
  now REAL draws (the panel-label inline + the active hyper-stock icon); the
  test now arms the defer buffer and asserts the cursor advances by exactly 36
  cells (`$120` bytes) on the transition and not again while held.

## GATES

- `node --test games/ddpdoj/tests/` : **1256 pass, 0 fail, 0 skipped** (1238
  baseline + 18 new W116 tests).
- `python games/ddpdoj/tools/bosscoverage.py` : **103/0/8** (ported / live-
  unported / dead), matches the baseline.
- `node tools/publish.mjs --only ddpdoj --dry` : **clean**. rom-leak guard
  checked 261 files (49 decompressed) against 12 ROMs; 6 deliberate exception(s)
  (all pre-existing owner-approved art shards -- the new tile-table windows are
  ASCII-hex in the JSON and do not match raw ROM bytes). dist/ built: 265 files.

## DEFERRED

- **The non-HUD text.** `$253xxx` (ship/option spawn-time text) and
  `$25Axxx`/`$25Fxxx`/`260xxx` (title/attract) are NOT the in-game HUD; they
  ride the same `$240DC2`/`$141258` substrate this wave shipped, so the printer
  + flush are ready for them, but their BODIES are not ported (out of scope per
  the brief).
- **The chain-BREAK popup `$2855B6` and item row `$2857B4`.** These are SPRITE
  draws (W113 deferrals) -- they need `$24157A`/`$242AC6`, not the text path.
- **The `+$2`-dest init routine for the score-digit records** stays un-ID'd
  (W114/W115 OPEN DETAILS); the hardcoded measured dests are correct.

## WHAT SHIPPED

The `$240DC2` printer (base + `$240E1A` stride + `$240E84` single + `$240EBC`
blank), the `$141258` flush (drains `$80B058` -> TxVram + re-arms, wired as the
3rd ISR6 gated routine), and the gameplay HUD text bodies: lives P1/P2
(`$2878CC`/`$28795C`), bombs P1/P2 (`$287ABE`/`$287AF0`), hyper-stock P1/P2
(`$286ED6`/`$286F3E`), credits (`$285FB6`), chain high-water (`$286040`), the
panel-label inline, and the slide-in's inline lives draw. The score digits
(W115) are untouched. Visible result (owner live-verifies): lives, bombs,
credits, chain-high-water, hyper-stock icons and labels render alongside the
score digits in the same TxVram.

status: **DONE**
