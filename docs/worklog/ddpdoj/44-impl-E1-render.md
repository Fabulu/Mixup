# 44 — IMPL: RENDER THE PORT'S OWN DISPLAY LIST (enemy layer, wave E1)

status: **IN PROGRESS**
started: 2026-08-04. WAVE 44 / enemy-layer E1.
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
spec: `43-plan-enemy-layer.md` §3.1 (a)–(e), §3.2 done-when, §5 D1–D4.
inputs read in full: 40, 41, 42, 43, 39-OWNER, HANDOVER, `docs/knowledge/09`, `10`.

target: `ddpdojblk` VERSION-B. Every address below is build B.

## 0. WHAT THIS WAVE IS

Put the port's OWN `$800000` display list on the screen, remapped from ROM
stream addresses into the packed sheet's space, with every record that has no
art SKIPPED AND NAMED. Zero new art bytes.

## 1. THE BRIEF'S AND THE PLAN'S PREMISE, CHECKED

**The plan is right about everything load-bearing, and the wave is exactly the
shape it says.** Four things I verified myself against the tree and four
corrections, none of which changes the work.

### VERIFIED

- **`tools/export-web.mjs` really does build the ROM->packed map and throw the
  key away.** `offsMap` at lines 582-605; line 787-790 emitted
  `[offsMap.get(offs), w.maskWords]`. Confirmed by reading, and it is the whole
  of §5.
- **C2 IS RIGHT: the `spriteStride` trap is withdrawn.** `render/igs023.js:36-41`
  is the CONSTRUCTOR's bag and carries the "Nothing in the port may pass a
  non-default value" comment; `renderIndexed`'s own bag is lines 74-78 and
  carries `spriteStride` and `scrollSign` alongside the four mutation knobs.
  `tools/pixgate.mjs` builds `drawOpts` from the four and passes neither.
  Passing `spriteStride: RAM_STRIDE` from the page violates nothing.
- **`SpriteDrawer.draw` returns before touching a ROM word when `wide === 0`**
  (`sprites.js:139-140`) and `parseSpriteList` terminates only on
  `(w4 & 0x7fff) === 0` (`spritelist.js:46`). So the zero-width skip is
  available and the zero-word-4 skip is the trap.
- **`manifest.spr.streams` has exactly two readers** in `src/`+`tools/`:
  `verifyCoverage` (destructures the tuple) and two `.length` prints. Changing
  the tuple's shape is a two-line change plus the page's new map.

### CORRECTION 1 — [M] the manifest cost is **+2,160 B, not +1,328 B**

`43-plan` §3.1(a)/§4 gives `manifest.json` 10,112 -> 11,440 B and boot
470.0 -> 471.3 KiB. **Measured on this tree: 10,112 -> 12,272 B, boot
470.0 -> 472.1 KiB.**

The plan measured the delta on the COMPACT JSON of `spr.streams`
(1,706 -> 3,034 = +1,328) and applied it to a file `export-web.mjs` writes with
`JSON.stringify(manifest, null, 1)` — i.e. PRETTY. A third array element is a
whole indented line per stream, not a comma and a number. (Its compact figure is
also 209 B high: measured 1,706 -> **2,825**.)

**[M] What does NOT change: not one `.gz` asset moves a byte.** All 21 files
hashed before and after; `manifest.json` is the only one that differs. So
`bundlegate`'s pixels cannot have moved — the line adds a KEY, it re-bases
nothing.

### CORRECTION 2 — the plan's headline counts are a ONE-FRAME-WINDOW restatement

`43-plan` §3.2.1 asks `webgate` to assert **16,457 records over 300 logic
frames**. **[M] I reproduce 16,457 EXACTLY** — but only for the lists produced by
300 STEPS read with NO lag. A page that renders one frame late, over its first
300 DRAWN frames, sees **16,412** records: the 299 lists the port built in that
window, plus **the 23-record list the BOARD's own seed already had in `$800000`**
(the seed is a RAM snapshot, so `$800000` is populated at construction and the
first drawn frame is a real list rather than an empty one).

Both numbers are in the gate. They are the same measurement one frame apart, and
saying which is which is the point — the lag is the thing most likely to be got
wrong here.

### CORRECTION 3 — the miss set has **184** addresses, not 183

`43-plan` §1.1 gives 302 distinct streams of which 119 are in the sheet, i.e.
183 absent. **[M] the guard names 184.** The extra is **`$000000` itself**, which
IS in the sheet (packed base 0, 10 mask words) and is still a miss on ten of its
1,075 emissions — the 3x40 records §1.4 found. That is the plan's own landmine,
caught by the general rule rather than by a special case, and it is the
difference between a correct guard and one that reads 122 mask words out of a
10-word stream.

### CORRECTION 4 — `$0166EE4` in §3.2.4 is `$166EE4` (a stray digit)

**[M] `$166EE4` is the port's most-drawn SHIPPED stream: 9,643 records in 3,000
frames** (the plan's 9,644, one frame of window apart). Used as the
`drop-one-stream` victim.

## 2. THE MEASUREMENTS  [M] = mine, this tree, this session

Method, once. `loadBundle` over the real `games/ddpdoj/assets/`; `new
Game(bundle.seed, bundle.tables, {logicFrame: 2000, videoFrame, bgSeed})`;
the page's own standing intervention `$810424 = $FF` each frame; input word
`$FFFF` (nothing pressed); the list read out of `game.ram` at
`$800000..$8009FF` and remapped by `src/web/app.js portSpriteList` — **the same
function the page calls**, not a second implementation. NO MAME. No
`--stub-unported`, no `--no-pods`.

### 2.1 300 frames from the shipped seed — THE CRITICAL-PATH NUMBER

```
[M] 300 STEPS, no input:  16,457 display-list records, 20..69 per frame,
                          0 MISSED, 0 blank, 102 distinct ROM streams
[M] 300 DRAWN frames (one-frame hold): 16,412 records, 0 MISSED
    of which the seed's own board list is 23 records, all drawn
[M] bucket 0 -- THE ENEMIES -- min 14, max 62, mean 48.67 per frame
```

`min 14` and `max 62` reproduce `43-plan` §3.2.3 exactly.

### 2.2 The first record with no art

```
[M] FIRST MISS: $233F34 at lf2315 = +5.32 s
```

Digit for digit `43-plan` §1.2. It is the 5x80 background element, not an enemy.

### 2.3 400 frames — the guard is ALIVE

```
[M] 23,281 records, 22,992 drawn, 289 MISSED, 6 distinct missing streams
    $233F34x85 $22DA70x69 $1928BCx54 $1523ECx53 $192A48x27 $152450x1
```

### 2.4 3,000 frames — and this is E2's denominator, measured not estimated

```
[M] 139,219 records, 73,138 drawn = 52.53 %, 66,081 MISSED
[M] 302 distinct ROM streams emitted   (reproduces RECON 1 §4 step 0 exactly)
[M] 184 distinct MISSING addresses
[M] the null stream $000000: emitted 1,075 times, MISSED exactly 10
    -- the 3x40 records 43-plan §1.4 predicted, caught by the extent rule
[M] most-drawn SHIPPED stream $166EE4, 9,643 records
[M] most-emitted stream overall $12D430, 14,104 records, AND IT HAS NO ART
```

## 3. THE LONG RUN — E2's DENOMINATOR, MEASURED

The architect's R1 asks for this inside E1, "the single cheapest de-risking
available in this plan": log the guard's missing-address set over a long run so
E2 has a real denominator instead of a floor under a moving target.

**[M] One run, from the shipped seed, nothing pressed, 7,400 frames requested.**
It got **6,185 logic frames — lf2000 to lf8185, 104.6 s** and then stopped at a
LOUD NAMED THROW, which is the honest end of the window:

```
UNPORTED $292902: enemy handler at $292902, dispatched from $263538 for the
record at $81387C (slot 17 of 58).
```

```
[M] 288,903 display-list records, 20..81 per frame
[M] 134,072 drawn (46.4 %), 154,831 MISSED, 0 blank
[M] 454 distinct ROM streams emitted; 326 of them have NO ART
[M] bucket 0: min 0, max 62, mean 22.72 per frame over 6,185 frames
```

### 3.1 WHY THIS IS STILL A FLOOR, AND BY HOW MUCH — read before pricing E2

`43-plan` R1 is right that the art denominator is a function of WHICH HANDLERS
ARE PORTED, and this run proves it from the other side: **it ended ON an unported
handler.** Everything `$292902` and the seven other unported stage-1 handlers,
the effect pool `$288E4E`, the impact pool `$27F95A`, the midboss's later phases
and the boss would emit is NOT in the 326 below. So:

- **326 is a LOWER BOUND on the miss set for the first 104.6 s**, not the answer
  for stage 1. Stage 1 is 7,317 logic frames to the boss lock and this reached
  6,185 of them.
- It is nonetheless **a real list of real addresses**, not an estimate: every one
  of the 326 was emitted by the port's own emitter and named by the guard.
- **114 of the 326 first appear after 70 s**, i.e. in the last third of the run,
  which is where the run is least representative. The **101 that appear inside
  the first 20 seconds are the ones E2 should price first.**

### 3.2 WHEN EACH MISS FIRST APPEARS  [M]

| first seen | new missing streams |
|---|---:|
| 0–10 s | 14 |
| 10–20 s | 87 |
| 20–30 s | 56 |
| 30–50 s | 27 |
| 50–70 s | 28 |
| 70 s+ | 114 |

The first ten seconds cost **fourteen** streams. That is the cheapest possible
first shard and it is a much smaller number than `43-plan` §1.3's "60 new streams
to buy 10 s" — because that figure counts streams the *3,000-frame* run reached,
and because this run's handler set differs. **Do not price off either without
re-running it; they disagree and only the listing settles which handlers are in.**

### 3.3 THE MISS SET, BY ADDRESS AND BY COUNT  [M]

326 cartridge stream addresses, most-drawn first, over 6,185 logic frames.
`$12D430` alone is 14,104 records — **the port's single most-emitted stream is
one the sheet does not contain.**

```
$12D430x14104 $166A34x9171 $167074x8129 $167394x6808 $166714x5990 $1727C4x4269 $1663F4x4035 $166D54x3479
$17D480x3122 $153624x2394 $172D18x2135 $22CBCCx1938 $166458x1925 $1563F4x1887 $1670D8x1831 $17D82Cx1718
$166264x1708 $153708x1624 $166778x1606 $22E508x1600 $1673F8x1572 $231C44x1568 $232578x1568 $22FE98x1536
$23061Cx1536 $22DED4x1520 $22F184x1504 $231520x1504 $232EACx1376 $166A98x1266 $1928BCx1214 $22DA70x1170
$156470x1146 $156378x1098 $17D8E0x1039 $1717FCx1037 $11E1FCx1012 $1538D0x1010 $233F34x992 $1718F4x989
$166DB8x953 $1564ECx933 $1537ECx928 $233630x911 $151AD0x859 $166840x831 $1667DCx827 $151B04x820
$1719ECx808 $1662C8x769 $15345Cx768 $171134x726 $151B38x712 $165DB4x698 $171970x671 $1660D4x624
$171878x615 $192A48x608 $17253Cx520 $156568x483 $172584x481 $12C814x472 $12C878x464 $12C8DCx464
$12C940x464 $12C9A4x464 $12CA08x464 $12CA6Cx464 $12CAD0x464 $12CB34x464 $12CB98x464 $12CBFCx464
$12CC60x464 $12CCC4x464 $12CD28x464 $12CD8Cx464 $12CDF0x464 $12CE54x464 $12CEB8x464 $12CF1Cx464
$12CF80x464 $12CFE4x464 $12D048x464 $12D0ACx464 $12D110x464 $12D174x464 $12D1D8x464 $12D23Cx464
$12D2A0x464 $12D304x464 $12D368x464 $12D3CCx464 $12C7B0x464 $151A34x459 $171A68x416 $1725CCx406
$1523ECx400 $151A68x398 $128D20x372 $129BC4x372 $12AA68x372 $127E7Cx371 $12B90Cx370 $166CF0x368
$166C8Cx368 $12D60Cx368 $172344x363 $07E8ACx352 $1562FCx345 $1725A8x337 $151B6Cx328 $172560x309
$171704x309 $151A9Cx248 $1565E4x237 $156660x228 $166138x216 $153540x216 $1725F0x208 $17D6C4x191
$151A00x191 $1566DCx182 $151BA0x180 $17D778x174 $152388x172 $1666B0x160 $16664Cx160 $1724F4x156
$156280x153 $1665E8x152 $166584x152 $166520x152 $1664BCx152 $151D0Cx148 $156948x145 $1519CCx138
$1569C4x132 $151BD4x129 $1568CCx126 $15610Cx126 $151D40x126 $151DA8x124 $156850x120 $171780x119
$166E80x116 $166E1Cx116 $151C08x113 $151DDCx112 $156758x110 $156188x108 $151CD8x108 $156A40x107
$151C3Cx104 $1567D4x102 $151998x102 $151894x102 $167330x100 $1672CCx100 $167268x100 $167204x100
$1671A0x100 $16713Cx100 $151964x99 $151CA4x98 $156204x96 $127998x95 $151C70x91 $166B60x88
$166AFCx88 $155CB0x88 $151930x86 $152324x84 $1518C8x84 $151E74x82 $166C28x80 $166BC4x80
$156ABCx79 $151ED8x78 $155DA8x78 $1518FCx78 $15182Cx74 $152450x68 $151D74x68 $156B38x64
$155D2Cx64 $12D474x64 $12D4B8x64 $12D4FCx64 $12D540x64 $12D584x64 $12D5C8x64 $151860x61
$172518x60 $171DCCx60 $171EC4x60 $171FBCx60 $155E24x54 $166390x52 $16632Cx52 $151E10x52
$151F3Cx50 $155EA0x48 $15225Cx44 $156090x42 $156014x42 $155F98x42 $155F1Cx42 $151FA0x32
$165E18x32 $000000x30 $152194x30 $1726ECx30 $172734x30 $17277Cx30 $152E20x30 $1522C0x28
$11E6E0x25 $11EBC4x25 $11F0A8x25 $11F58Cx25 $11FA70x25 $11FF54x25 $120438x25 $12091Cx25
$120E00x25 $1212E4x25 $1217C8x25 $121CACx25 $122190x25 $122674x25 $122B58x25 $12303Cx25
$123520x25 $123A04x25 $123EE8x25 $1243CCx25 $1248B0x25 $124D94x25 $125278x25 $12575Cx25
$125C40x25 $126124x25 $126608x25 $126AECx25 $126FD0x25 $1274B4x25 $166908x24 $1668A4x24
$1669D0x24 $16696Cx24 $152004x24 $1521F8x22 $07F354x22 $07F8A8x22 $07FDFCx22 $080350x22
$0808A4x22 $080DF8x22 $08134Cx22 $0818A0x22 $081DF4x22 $082348x22 $08289Cx22 $082DF0x22
$083344x22 $083898x22 $083DECx22 $07EE00x22 $1520CCx20 $152068x20 $167010x20 $166FACx20
$152130x8 $153378x8 $153294x8 $1531B0x8 $1530CCx8 $152FE8x8 $152F04x8 $1D756Cx6
$1D78F0x6 $1D7C74x6 $166200x4 $16619Cx4 $1674C0x4 $16745Cx4 $167588x4 $167524x4
$167650x4 $1675ECx4 $1517F8x4 $1D04ECx3 $1D0870x3 $1D0BF4x3 $1D0F78x3 $1D12FCx3
$1D1680x3 $1D1A04x3 $1D1D88x3 $1D210Cx3 $1D2490x3 $1D2814x3 $1D2B98x3 $1D2F1Cx3
$1D32A0x3 $1D3624x3 $1D39A8x3 $1D3D2Cx3 $1D40B0x3 $1D4434x3 $1D47B8x3 $1D4B3Cx3
$1D4EC0x3 $1D5244x3 $1D55C8x3 $1D594Cx3 $1D5CD0x3 $1D6054x3 $1D63D8x3 $1D675Cx3
$1D6AE0x3 $1D6E64x3 $1D71E8x3 $1D7FF8x3 $1D837Cx3 $155C34x1
```

## 4. THE CHANGE

### 4.1 `tools/export-web.mjs` — one line, and it is the whole remap

`manifest.spr.streams` was `[packedBase, maskWords]`; it is now
`[romOffs, packedBase, maskWords]`. `offsMap` has always been built there (lines
582-605) and the ROM key was discarded on the emit line. Cost §1's +2,160 B;
no `.gz` moves.

### 4.2 `src/web/app.js` — `portSpriteList(ram, map, opts)`, pure and exported

Copies `$800000..$8009FF` (0x500 words) out of `game.ram`, walks the five-word
entries, and per record:

- **present, and `maskWords >= 2 + w*h`** -> the packed base is written back into
  words 2 and 3, preserving flip / colour / pri exactly as the exporter does when
  it rewrites `capture.bin`. `drawn++`.
- **absent, or the stream is SHORT for this record** -> **the WIDTH field of
  word 4 is zeroed and the CARTRIDGE address is counted in `missing`.**
  `SpriteDrawer.draw` returns before touching a ROM word at `wide === 0`, and
  `(word4 & $7FFF)` is still non-zero because the height is untouched, so the
  record is skipped and **everything behind it still draws**.
- **width or height already zero** -> left completely alone and counted as
  `blank`. It reads no ROM word, so it needs no art — and zeroing the width of a
  zero-HEIGHT record would turn word 4 into the hardware TERMINATOR.

The extent rule is the general form of `43-plan` §1.4's landmine and is the same
rule `src/web/assets.js verifyCoverage` already applies to the capture.

**A skip is not a throw, and the code says why.** This project's rule is that
unported paths are loud named throws; that rule is about CODE. This is DATA, and
a background element with no art must not take the page down for a picture nobody
is asking about. The honest analogue is a named skip with a count, and every one
of them is printed.

### 4.3 `Demo` — the one-frame hold, and the A/B

`step()` snapshots `$800000` **before** `g.step()`, so what `draw()` renders is
the list the PREVIOUS frame built. That is `render/capture.js`'s measured DMA lag
of 1, the same lag `prevPos`/`prevTilt` already honour. `draw()` passes it as
`st.spritebuffer` with `renderIndexed(st, { spriteStride: RAM_STRIDE })`.

The splice and W37's strip still run every frame and the page can draw either
source: **`port` is the DEFAULT, `capture` is a labelled diagnostic on `KeyL`.**
Both are kept because the ship must land in the same place in both, which is the
only correctness check this wave has that does not need MAME. `KeyL` is bound in
`index.html` by `e.code`, not in `src/web/input.js` — that module owns which
CONTROL is which BIT of the board's port word, and this must never reach the
68000.

### 4.4 The status line

`[port] dl N drawn D b0 B` every frame, and when anything is missing,
**`NO ART n: $ADDRxCOUNT ...`** — the addresses, live, on the page.

### 4.5 The stale comments `43-plan` §3.1(e) names

`src/render/index.js:8` ("one of the thirty buckets has a ported feeder"),
`src/render/capture.js:8` ("call #4 is unported"), `src/main.js` (`FOUR`
produced buckets, "NINE of its 23"). All corrected. **Per C4 the
`PRODUCED_BUCKETS` ARRAY IS UNTOUCHED** — it is what `tools/shipgate.mjs`
substitutes, not a census — and the comment now says so.

## 5. TWO DEFECTS FOUND, NEITHER OF THEM THIS WAVE'S

### 5.1 `G.b8` — type $80 has been reading the DISPLAY LIST as a rank word

**This is the find of the wave and it is not in the brief.**

`src/handlers.js` reads the board's globals through a table `G`. Type $80 cites
`G.b8` at two sites. **`b8` was not in the table.** So `a5 + undefined` is `NaN`,
and `Ram.#off`'s bounds test was `o < 0 || o >= size` — **`NaN` fails BOTH
comparisons**, so the read went through and `DataView.getUint16(NaN)` returned
offset ZERO, i.e. **`$800000`, the head of the display list.**

Verified against the listing, not against the comment:

```
$273BDA  move.w #$50,D0
$273BDE  sub.w  $8130B8.l,D0      -> ($1E,A5)   type $80's SALVO RELOAD
$273D9A  move.w #$30,D0
$273D9E  sub.w  $8130B8.l,D0      -> ($22,A5)   its SECOND TURRET's cadence
```

`xref.py abs 8130b8` finds 18 readers in the image; `$273BE0` and `$273DA0` are
among them. `src/initbody.js`'s own table has always had `b8: 0x8130b8`.

**So type $80's salvo reload and its second turret cadence have been computed
from a sprite record's first word since W30**, on every frame that handler ran,
silently. Fixed: `b8: 0x8130b8` added to `handlers.js`'s `G`, cited to both
listing addresses.

**How it surfaced, and it is `docs/knowledge/03` exactly.** I tightened
`Ram.#off` to `!(o >= 0 && o < size)` — same two comparisons, same cost, NaN now
caught — because a shadowed constant in my own gate had just cost me a red run
the same way. The port then stopped **loudly, at logic frame 2753**, inside
`handler80`, in a real browser. Before that change nothing anywhere could see it.

`tests/handlers.test.js` gains the static version, which is the one that scales:
**every `G.` / `R.` / `S.` field the file reads must be a key of its table.**

### 5.2 The first version of that test COULD NOT FAIL

The scan was built with a `\b` inside a **template literal**, where it is a
BACKSPACE character and not a word boundary — so it matched nothing and the test
agreed with everything. It passed on a tree where `G.b8` really was missing.
Caught by mutating it (M1 below), fixed with `String.raw`, and the test now also
asserts the scan found something.

## 6. EVERY CHECK SEEN TO FAIL

### 6.1 The four red validations `43-plan` §3.2.4 asks for, plus one

`tools/webgate.mjs --break <name>`. Each prints the NUMBER that moved.

| break | what moved  [M] |
|---|---|
| `no-remap` | **16,250 of 16,457** records have no key at all (unbroken: 0), across 102 addresses. Only 207 draw |
| `drop-one-stream` | `$166EE4` skipped **3,664** times; drawn **12,793 = 16,457 - 3,664**, exactly |
| `lag-0` | the ship's offset from the previous frame's `$8103E8` breaks on **126 of 200** frames |
| `terminate-instead-of-zero-width` | the renderer sees **9,406 of 24,889** records — 62 % of every frame silently lost behind the first gap |
| `no-extent-check` | the `$000000` over-read stops being named (5 occurrences to lf2700) |

**AND ONE OF THEM COULD NOT FAIL WHEN I FIRST WROTE IT.** My `no-remap` passed an
IDENTITY map (`rom -> rom`), which makes `portSpriteList` write the ROM address
back and count the record DRAWN: the records then index the packed array at
`offs & 16383` and draw garbage — the real defect — while `skipped` stays 0 and
every assertion stays green. The break is now **the map keyed on the packed
base**, which is literally what a pre-W44 bundle gives you. A mutation that
leaves the counters alone tests nothing.

**AND THE GUARD WINDOW HAD TO BE WIDENED TO MAKE ONE FIRE.** `43-plan` §3.2.2
asks for lf2400; the `$000000` 3x40 records first appear at **lf2634**, so at
lf2400 the extent rule is completely unexercised and `--break no-extent-check`
came back "NOTHING MOVED". The window is lf2700, and it also counts the records
the RENDERER would see (`gVisible`), because `skipped` is incremented either way
and could never see a truncation.

### 6.2 Unit mutations — 13, each turning a NAMED test red, each restored byte-identical

| # | mutation | the test that went red |
|---|---|---|
| M1 | `G.b8` removed from `handlers.js` | `every G./R./S. field handlers.js reads is actually in its table` |
| M2 | a miss is drawn anyway | `a record with NO ART is skipped by WIDTH and NAMED by its ROM address` |
| M3 | skip by zeroing word 4 | same, + `the SKIP-BY-WORD-4 mutation truncates the list` |
| M4 | the extent check removed | `a stream that is SHORT for the record is a miss, not an over-read` |
| M5 | zero-extent records counted as misses | `a record the hardware draws nothing for needs NO ART and is left alone` |
| M6 | `step()` snapshots AFTER `g.step()` | `Demo.draw() renders the HELD list, and step() takes it BEFORE the frame` |
| M7 | the loading-line guard removed | `the loading line is CLOSED when boot returns, or the last shard sticks` |
| M8 | the page still claims four buckets | `the page says the ENEMIES ARE THE PORT'S...` |
| M9 | the page drops the measured record count | same |
| M10 | `Ram.#off`'s NaN test reverted | `a NaN address is REFUSED by Ram, not read as offset zero` |
| M11 | `capture` made the default source | `the PORT is the default sprite source...` |
| M12 | the exporter drops the ROM key again | `THE EXPORTER KEEPS THE CARTRIDGE ADDRESS, and nothing else moved` |
| M13 | `bundlegate`'s `exact === total` loosened | same, + `THE STRIP IS IN THE PAGE AND NOT IN THE EXPORTER` |

Every restore hashed **byte-identical**.

**M12 END TO END, because a source check is not the proof.** Exporter reverted to
pairs, bundle RE-EXPORTED, `webgate` run: it stops at load with
`AssetError: capture frame 0 (lf2000) record 0 points at packed sprite offset
6510, which is not an exported stream base.` Loud and named. Restored and
re-exported.

## 7. THE PAGE, IN A REAL BROWSER — WHAT I SAW

Chrome + Python `playwright` over `python -m http.server`, the recipe W42
established. Nothing downloaded.

**PORTED ENEMIES ARE ON THE SCREEN.** At lf2196, `[port] dl 67 drawn 67 b0 60`:
**about forty ported vehicles in formation on the road**, drawn ON the road
surface where ground vehicles belong — which is exactly what the recorded ones
had stopped doing (W42's before-shot has them floating over the rooftops and
across the HUD). The ship, its exhaust plume, its two pods and its shadows are at
the bottom. `PLAYER-1`, the score, `PRESS START`, the bomb count `B B B` and the
power bar are all intact.

```
BOOTED   lf 2082  69.9,83.0px  clk 115  shards 8/8  rec-37 keep 6
         [port] dl 42 drawn 42 b0 40            57.3Hz
+6s      lf 2452  [port] dl 63 drawn 59 b0 52
         NO ART 4: $233F34x1 $22DA70x1 $1928BCx1
+12s     lf 2807  [port] dl 37 drawn 18 b0 22   NO ART 19: $166264x6 ...
flying   lf 2940  32.0,12.0px  tilt -32         [port] dl 41 drawn 20 b0 26
+22s     lf 3680  [port] dl 46 drawn 14 b0 16   NO ART 32: $12C8DCx8 $12D430x8 ...
canvas   224x448, 82,594 of 100,352 px lit, 143 distinct colours
```

- **The guard is visible, live, and correct.** `NO ART` first appears a few
  seconds in and the first address on it is `$233F34` — the same address the
  headless run names at lf2315.
- **The A/B works and the ship agrees.** `KeyL` -> `[capture]` and the sky goes
  empty (only the ship, pods and shadows survive W37's strip); the canvas drops
  from **143 distinct colours to 93**. `KeyL` again -> `[port]` and the forty
  vehicles come back. **The ship, its plume and its pods are in the same place in
  both**, which is `43-plan` §3.4's check, passed by eye.
- **The ship still flies**: 69.9,83.0 -> 32.0,12.0 px on the arrows, tilt -32.
- **No new throw.** The page ran the whole session. HOLDING fire still reaches
  `$24C180 IS NOT PORTED YET` in the page's own error panel — `39-OWNER`'s known
  laser blocker, unchanged by this wave. A single `press` is too short to span a
  logic frame and does not reach it.
- **THE OWNER'S LOADING-TEXT REPORT IS FIXED, AND VERIFIED BY EYE.** `#status` is
  `''` at boot, at +6 s and at +12 s. See §8.

**What I did NOT see, stated as a limit.** The two A/B screenshots are 71 logic
frames apart, so their backgrounds differ and I cannot compare the top-left
region between them. Everything above is about the ship and the enemy layer,
which is what this wave changed.

## 8. THE OWNER'S LOADING TEXT

> "the last loading gfx text just stays on screen even when finished loading, we
> don't need that."

**The mechanism is not the obvious one, and the obvious repair would not have
held.** `statusEl.textContent = ''` after `await boot(...)` was already there and
already ran. `boot()` calls `bundle.bg.prefetchAll()` AFTER `loadBundle`
resolves, and the six DEFERRED background shards are fetched through the SAME
`httpReader(base, opts.onProgress)` (`src/web/assets.js:286`). So the element was
cleared and then re-written six times over the next several seconds, and the last
arrival stuck. There is no later point to clear it at: the writes are
asynchronous and the last one is whenever the network says.

**The loader's channel is CLOSED when boot returns** (`let booting = true` /
`if (!booting) return;` / `booting = false`). Nothing about what is reported
DURING loading changes, and nothing is hidden: the stats line already prints
`shards n/8` every frame and `WAITING ON SHARD n` when a draw actually waits.

Checked two ways: a source check that goes red without the guard (M7), and the
browser, which is what the report was about.

## 10. WHAT THIS WAVE DID NOT DO

- **No new art.** Zero bytes. That is `43-plan` D2 and it holds: the shipped
  sheet covers the port's own emitter completely for the first 5.32 s **from this
  seed**, and thins out after, biggest pictures first, every miss named.
- **Nothing is compared against MAME.** `43-plan` §8.1 stands: I have proved the
  records carry positions, sizes, colour banks and stream addresses the bundle
  can resolve, and that they look right on screen. **A record with a correct
  descriptor can still be the wrong record**, and no gate in this repo compares
  the PORT's own list against a board frame. That gate does not exist and I did
  not build it.
- **The splice and W37's strip are NOT deleted** (`43-plan` §3.4 says so): they
  are the A/B, and E6 reclaims them.
- **`PRODUCED_BUCKETS` is NOT widened.** Comment only — C4.
- **The palette uploader, the shard, the bullet sink, the effect pool and the
  shots' art are all downstream and untouched.**
- **`games/gradius/` was not touched.**

## LOG (appended as findings arrive)

- opened.
- §1 [M]: the exporter change lands. **ONE file in the bundle changes —
  `manifest.json`, 10,112 -> 12,272 B (+2,160, not the plan's +1,328). Every
  `.gz` is byte-identical**, verified by hashing all 21 files both ways, so
  `bundlegate`'s pixel identity cannot have moved.
- §2 [M]: **300 steps from the shipped seed: 16,457 records, 20..69 per frame,
  ZERO MISSED**, and bucket 0 runs min 14 / max 62 / mean 48.67. The plan's
  §3.2.1 and §3.2.3 reproduce exactly.
- §2.2 [M]: the first record with no art is **`$233F34` at lf2315 = +5.32 s** —
  `43-plan` §1.2 to the digit, independently.
- §2.4 [M]: 3,000 frames — **302 distinct streams**, 52.53 % of records drawn,
  **184 named missing addresses**, and the `$000000` 3x40 landmine caught 10
  times out of 1,075 emissions.
- §3 [M]: the long run R1 asked for. **6,185 frames to a loud named throw at
  `$292902`; 454 distinct streams emitted, 326 with NO ART, listed by address.**
  It ended ON an unported handler, so 326 is a floor and this file says so.
- §5 [M]: **a real port defect, found because a check was tightened.**
  `handlers.js` had no `G.b8`, so type $80's salvo reload and second turret
  cadence have been reading `$800000` — the display list — instead of `$8130B8`
  since W30. Both sites confirmed in the listing. Fixed, and a static test now
  covers the whole class.
- §5.2 [M]: **and the test that catches it could not fail when first written.**
  Mutated, caught, fixed.
- §6 [M]: five gate breaks and 13 unit mutations, every one seen to turn a NAMED
  check red, every restore byte-identical. **Two of the breaks could not fail as
  first written** and both are documented rather than quietly repaired.
- §7 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER: about forty ported vehicles on
  the road, from the port's own `$800000` list.** The A/B toggle shows the
  capture path empty at 93 colours against the port's 143, with the ship in the
  same place in both.
- §8 [M]: the owner's loading-text report — the DEFERRED shards were re-writing
  the element after boot. Fixed, red-validated, and seen gone in the browser.
