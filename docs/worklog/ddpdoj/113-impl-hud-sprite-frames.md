# 113 -- IMPL: the HUD SPRITE frames (bucket 25, Wave A of the HUD port)

status: **DONE** (opened IN PROGRESS before coding, 2026-08-07; closed same day)

started: 2026-08-07. wave: 113. role: IMPL (the only writer this wave is
`games/ddpdoj/src/`, plus one ROM-window line in `tools/export-tables.py`).
target: `ddpdojblk` VERSION-B. The recon is W112 (`112-recon-hud-port.md`,
sections 1.1 and 6.3 Wave A); every claim there was re-measured against the ROM
this session before a line of code was written.

`[M]` = measured by me, this session, from `maincpu.bin` or this tree.

---

## 0. PREMISE CHECK -- the brief's three claims, all VERIFIED

1. **the 10 sprite draws reach `$23FA96`/`$23FAC4` into bucket 25.** `[M]` the
   closure of each of the 10 bodies calls ONLY `$23FA96` or `$23FAC4` (confirmed
   by linear disassembly this session), and those two feed buffer `$80A6E4`
   counted at `$80AFE6` -- `BUCKETS[25]` in `src/spritequeue.js:93`. No draw
   calls the text printer `$240DC2`.
2. **bucket 25 is drained/rendered.** `[M]` `src/displaylist.js:322-323` drains
   all buckets `1..29` (including 25) into the queue, and `src/render/igs023.js`
   draws the queue. The drain runs today.
3. **`enqueueRegisters(ram, 25, ...)` covers `$23FA96`/`$23FAC4`.** `[M]`
   `src/spritequeue.js:243` is the register-convention enqueue, parameterised by
   bucket. Calling it with bucket 25 is byte-for-byte `$23FA96` (W112 section 3
   re-confirmed: same opcode shape, same `asr.l #6` / `andi.l` / `ori.l`).

---

## 1. WHAT SHIPPED THIS WAVE (8 of 10 draws)

Each replaces a `draw(ctx, addr)` note in `src/hud.js` with the real body,
transcribed from the ROM. Positions are scroll-compensated by `$81B622`/
`$81B624` exactly as the ROM does.

| addr | what | status |
|---|---|---|
| `$285C5E`/`$285C62` | P1 panel entry + score row (hyper arm + non-hyper arm) | PORTED |
| `$285DD8`/`$285DDC` | P2 mirror (reads `$81B644`/`$81B64C`/`$81B6E2`) | PORTED |
| `$2859DC` | chain-meter BAR (tile from `$28809E[loop]` + meter index) | PORTED |
| `$284F72` | banner P1 panel wrapper -> `$285C62` | PORTED |
| `$284FA2` | banner P2 panel wrapper -> `$285DDC` | PORTED |
| `$285FA6` | hyper-flash (SPRITE half only: D3=$430, D4=$9, jmp $23FA96) | PORTED |

### 1.1 the score row's TWO arms

`[M]` `$285C62 tst.w $81B63E / beq.w $285D74`: the score row splits on hyper.
**HYPER active** (`$285C6C..$285D72`): draws the hyper-coloured panel frame
(tile from `$2881F2[hyperlevel]`, where hyperlevel = `gauge*$16 >> 16 / $4B0`),
the hyper-stock icons (loop over `$81B6E0`), and the rank icon (tile from
`$2882A6[rank]`). **NOT hyper** (`$285D74..$285DD6`): draws the icons (guarded
by `$81B6E4`) and rank only -- no panel frame, because the default frame is the
background's job.

In normal play (no hyper, `$81B6E4` = 0), the non-hyper arm produces only the
rank icon. That is correct and matches the ROM: the panel frame is a hyper-only
overlay.

### 1.2 the scroll compensation

`[M]` the score row's panel position is `$5EC0/$400` (P1) or `$5EC0/$2800` (P2)
by default, and the banner arms offset it by `$81B622 << 6` (long) and
`$81B624 << 6` or `<< 7` (short) depending on which banner state is active.
In this port `$8130F9` bit 0 is never set (BOSS_TAIL unported), so the
compensation never fires; it is ported anyway, faithully.

---

## 2. WHAT DEFERRED (2 of 10 draws), and the measured reason

| addr | what | reason |
|---|---|---|
| `$2855B6` | chain-BREAK popup (90 instr) | calls `$24157A` (an OBJECT-RECORD installer: copies 8 longwords from a ROM table to `$80E886+slot*64+$20`, NOT a bucket-25 write). Without porting `$24157A` the popup's graphic records do not install, and the sprite digits alone are half the picture. The digit walk also uses THREE nested pc-relative tile tables (`$28567C`, `$2856D4`, `$285784`) that need careful transcription. A separate wave. |
| `$2857B4` | item row (114 instr) | calls `$242AC6` (an unported helper returning D2 from the item count). Same nested-table digit pattern as the popup. Without `$242AC6` the row's tile computation cannot run. A separate wave. |

Both remain `draw(ctx, addr)` notes. The deferral is DECLARED, not silent.

---

## 3. ROM WINDOWS added

`tools/export-tables.py` gets one window for the HUD draw tables (W113), all
extents measured from the image:

| base | len | what |
|---|---|---|
| `$28809E` | `$0130` (304) | chain-bar stage pointers (`$28809E`, 2 longs) + per-stage meter data (`$2880A6` 56 words loop 0, `$28811A` 90 words loop 1). Far end pinned by the panel tile table at `$2881F2`. |
| `$2881F2` | `$0040` (64) | panel tile table (8 longwords `$1CBF98..`) + the 24-byte gap + rank icon P1 table `$2882A6` (8 longwords). |
| `$288326` | `$0020` (32) | rank icon P2 table (8 longwords `$1CED18..`). |

`check_hud_sprite_extents` asserts the chain-bar pointers and the table
extents out of the image on every export.

---

## 4. HUDRAM additions

Two words the brief named, plus their P2 mirrors and the rank/icon guard the
score row reads (all written by unported hyper/tally tails, read here):

| name | addr | read at |
|---|---|---|
| `hyperGaugeP1` | `$81B642` | `$285C6E` |
| `hyperGaugeP2` | `$81B644` | `$285DE8` |
| `hyperStockP1` | `$81B6E0` | `$285D34` / `$285D92` |
| `hyperStockP2` | `$81B6E2` | `$285EAE` / `$285F0C` |
| `hyperStockFlag` | `$81B6E4` | `$285D8A` / `$285F04` (shared guard) |
| `rankAccumP1` | `$81B64A` | `$285D4E` / `$285DB2` |
| `rankAccumP2` | `$81B64C` | `$285EC8` / `$285F2C` |

---

## 5. THE MUST-FAIL CHECK

SEEDED test on the chain bar `$2859DC`: with `meter = $10` (nonzero), it emits
exactly one bucket-25 record (the counter `$80AFE6` advances by 12, and the 12
staged bytes are non-zero); with `meter = 0`, `playerBlock` returns before the
call and the counter does not move. Break the guard (make the chain bar
unconditionally emit), watch it emit on meter=0 too. Restore, green.

---

## LOG

- opened IN PROGRESS before coding.
- re-read W112 (sections 1.1, 6.3 Wave A), `src/hud.js` (full), `src/spritequeue.js`
  (`enqueueRegisters`, `BUCKETS[25]`), `src/displaylist.js` (the drain loop).
- `[M]` disassembled all 10 sprite draw bodies and their caller contexts from
  `maincpu.bin` (linear + closure). Confirmed the register state at each entry.
- `[M]` measured the ROM table extents (`$28809E` chain-bar, `$2881F2` panel,
  `$2882A6`/`$288326` rank icons) out of the image.
- `[M]` confirmed the existing ROM windows do NOT cover these tables; added one
  W113 window declaration to `export-tables.py`.
- ported all 8 clean draws, wrote the must-fail test (SEEDED), regenerated the
  gzipped web tables.
- GATE RESULTS:
  - `node --test games/ddpdoj/tests/`: **1229 pass, 0 fail, 0 skipped** (was 1221;
    +8 W113 tests).
  - `python bosscoverage.py`: **103/0/8** (unchanged -- the boss closure is
    untouched).
  - `node tools/publish.mjs --only ddpdoj --dry`: **clean** (no REFUSING; the
    web fetch gate's W44 display-list count updated from 20794 to 20842 and
    per-frame min from 20 to 21, the 48 extra records being the slide-in banner
    panels and the per-frame rank icon the ported score row now emits).

status: **DONE**
