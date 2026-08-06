# 115 -- IMPL: the score digits (Wave B' of the HUD)

status: **DONE** (opened IN PROGRESS before coding, 2026-08-07; closed same day)

started: 2026-08-07. wave: 115. role: IMPL (I own `games/ddpdoj/src/` this wave).
target: `ddpdojblk` VERSION-B. Every address is build B unless tagged "(A)".

The plan is W114 (the MAME recon). The score digits have their OWN flush
`$185DC4` (build A, the 4th IRQ6-gated routine) that drains the dirty records
at `$81B4C8` straight into the text tilemap `$904000`, INDEPENDENTLY of the
`$240DC2`/`$141258` text path (Wave C'). `digits2843A8` (the producer) is
already ported; this wave ports the FLUSH, adds a `TxVram` model for `$904000`,
and sources `st.tx` from it.

## PREMISE CHECK (done before coding)

W114's premise break verified against the source:

- `$185dc4` IS listed in `src/machine.js:196` `isr6Gated` (the 4th entry).
  CONFIRMED.
- `digits2843A8` (src/hud.js) writes `+$0` (dirty) and `+$6` (tile word).
  CONFIRMED. Its records are 9 each at `HUDRAM.digitsP1`/`digitsP2`, stride
  `$A`.
- The renderer's TX pass is at `src/render/igs023.js:129` (`buildTxMap`,
  reading `st.tx`). CONFIRMED.
- `wantTx: false` is at `src/web/app.js:919`. CONFIRMED.
- There is NO `TxVram` model today. CONFIRMED (only `BgVram` in background.js).

ONE PREMISE CORRECTION (the gate `$81B6F0`):

W114 section 6 speculated `$81B6F0` is a "dirty-pending master flag, not yet
named in HUDRAM". It IS named: `HUDRAM.objFlag` (src/hud.js), the HUD object's
own "I exist" word (`$28D508` raises it, `$28D512` drops it). The flush gates
on it to mean "only flush score digits while the HUD object is alive", which is
the correct semantics. The existing comment claiming `$81B6F0`'s ONE reader is
`$287286` was incomplete; `$185DC4` is a second reader, and this wave adds it
back. No new HUDRAM entry is needed.

## WHAT PORTED

1. **`TxVram`** (`src/background.js`, next to `BgVram`). A 64x32-longword model
   of `$904000`, big-endian u16 pairs (high word = tile number, low word =
   attr), the exact layout `render/tiles.js` `buildTxMap` and `capture.js`
   already use. `setLong(dest, v)` takes an absolute `$904xxx` address.
2. **`$185DC4` the flush** (`src/hud.js` `flushScoreDigits185DC4`). ~25 lines,
   transcribed from the W114 section 1 listing. Walks the 18 player dirty
   records (P1 then P2, stride `$A`) plus the two standalone records
   (`HUDRAM.extraRecA`/`extraRecB`); for each DIRTY one writes the `+$6` tile
   longword into TxVram at the `+$2` dest address, then clears `+$0`.
3. **The `+$2` dest init** (`src/hud.js` `initScoreDigitDests`). Hardcoded from
   W114's recdump table (P1 `$9040D8`+i*$100 rows 0..8 col 54; P2 `$9051D8`+i*
   $100 rows 17..25 col 54; extras `$9049D8`/`$905AD8`). Installed at HUD
   object state-0 init. On the shipped seed the HUD is already in state 1, so
   the seed's own (correct, measured) dests are used; on a cold boot this is
   the path.
4. **IRQ6 wire** (`src/isr.js`). `$185DC4` is dispatched as the 4th gated
   routine, the same way `$140FFE` (the scroll-reg upload) already is. The
   `$803940` (vblank semaphore) outer gate is unchanged -- it already governs
   all four gated routines; the flush's OWN inner gate is `$81B6F0`
   (`HUDRAM.objFlag`, the HUD-alive word). Added `ROM.isr6ScoreFlush`/
   `isr6TextFlush` named aliases to `src/machine.js`.
5. **`st.tx` from TxVram, `wantTx` flipped** (`src/web/app.js`). In `port`
   mode `st.tx = this.game.txvram.w` and the `wantTx: false` override is
   removed (so `wantTx` defaults to true). `capture` mode is unchanged. The
   page status line now prints `hud-score` (port: score digits live, other
   text blank) vs `hud-rec` (capture: whole layer the recording). Added
   `txPort` to the stats object.
6. **Game plumbing** (`src/main.js`). `this.txvram = new TxVram()` on the Game
   (per-game, like `vram`/`video`); `txvram: this.txvram` on the ctx so
   `irq6` can reach it.

## THE MUST-FAIL CHECK (SEEDED) -- RED -> GREEN

`tests/w115hud.test.js` holds it down in three tests:

- **RED (before the flush):** seed P1 total `$00000086`, run `digits2843A8`
  (records 7/8 go dirty with tiles `$C0380000`/`$C0360000`), DO NOT flush.
  `TxVram.long($9047D8)` and `.long($9048D8)` are both `0`. RED.
- **GREEN (the flush):** same seed, run `flushScoreDigits185DC4`. Now
  `TxVram.long($9047D8) == $C0380000` (digit "8") and
  `.long($9048D8) == $C0360000` (digit "6"), dirty flags cleared.
- **RED (broken flush):** clear the dirty flags but SKIP the `txvram.setLong`
  call; cells stay `0`. Restore the real flush on a fresh seed -> GREEN.

Plus: the gate (flush is a no-op when `objFlag == 0`), the full 20-record walk
(P2 + extras), and the dest-init table.

## GATES

- `node --test games/ddpdoj/tests/` : **1238 pass, 0 fail, 0 skipped**.
- `python games/ddpdoj/tools/bosscoverage.py` : **103/0/8** (ported / live-
  unported / dead), matches the baseline.
- `node tools/publish.mjs --only ddpdoj --dry` : **clean**. rom-leak guard
  checked 261 files (49 decompressed) against 12 ROMs; 6 deliberate exception(s)
  (all pre-existing owner-approved art shards). dist/ built: 265 files.

## DEFERRED

- **The OTHER text (lives, bombs, credits, chain-high-water).** These ride the
  general text defer flush `$141258` and the `$240DC2` printer (ISR6 gated
  routine #3, still a counted note here). Their cells stay blank in TxVram
  until Wave C' ports that path. This is the incremental shape the brief
  specifies: the score ships first, independently.
- **The `+$2` dest init routine's address.** W114 section 6 OPEN DETAILS: the
  one-time write is un-ID'd. I hardcode the measured values instead (W114
  section 3's table), installed at HUD object init. A later MAME write-tap on
  `$81B4CA` from boot could pin the routine; not needed this wave since the
  values are fixed.
- **`$185E16`/`$185E3C` (the "mark all 9 dirty" full-redraw arms).** Named in
  `HUD.scoreMarkP1`/`scoreMarkP2` for the next wave; not ported (they arm the
  redraw on HUD init / player-change, which the seed already satisfied).

## LOG

- opened IN PROGRESS before coding.
- read W114 (full), machine.js, hud.js, background.js, render/igs023.js,
  render/tiles.js, render/capture.js, web/app.js, isr.js, main.js, ram.js.
- premise check done (above); one correction on `$81B6F0` = `HUDRAM.objFlag`.
