# 40 - RECON: THE EMISSION PATH (enemy layer, recon 1 of 2)

status: IN PROGRESS
wave: 40. role: RECON (read-only; this file is the only thing I write).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Build B = `$23xxxx..$2Axxxx`.
Any build-A address is flagged on the line.

Subject: **what has to happen for a live ported object to become a visible
sprite, and what is missing today.**

Tree state: measurements taken against `games/ddpdoj/` at HEAD `7f8eb8d`, with
`git status --porcelain games/ddpdoj/` EMPTY at the time of every run. HEAD moved
to `a03808d` during the session (`7fb3ec0`, `a03808d`); `git diff --stat
7f8eb8d a03808d -- games/ddpdoj/` is EMPTY, so nothing I measured moved under me.
A DaiOuJou implementer is editing `src/` concurrently - everything below that
depends on `src/` is dated to those two hashes and should be re-checked if
`src/` has moved when this is read.

`[M]` = measured by me this session. Anything cited from another document says
so and names it. RECON 2 (`41-recon-sprite-art.md`) owns the sprite ART / tile
data and the capture-layer removal; where this document needs a number from that
side it states the dependency and stops.

---

## 0. THE BRIEF'S PREMISE - THREE THINGS IN IT ARE STALE, AND ONE MATTERS A LOT

The brief's framing ("none of it draws", "the objects that can be shot are not
visible") is CORRECT and §1 shows exactly why. Three of its numbers are not.

| the brief says | [M] measured this session | where the stale number comes from |
|---|---|---|
| "the stage-1 ledger records that 2 of 30 have producers" | **EIGHT of 30 buckets receive records from the port TODAY** - 0, 2, 3, 5, 7, 14, 15, 19 (§2) | `20-plan-level-and-patterns.md:55`, written at W20. `src/main.js`'s own `PRODUCED_BUCKETS` says FOUR and is also stale (W12's) |
| "9 of its 23 `jsr` targets are wired" / "the remaining 14" | **TEN of 23 are wired; THIRTEEN are not** (§3) | W33 added `$28AD54` to `TYPE5_PORTED` and did not update `src/main.js`'s "NINE" comment |
| "bucket 0 alone was 72 % of sprite pixels" | the arithmetic reproduces, and the **denominator is four frames of one scenario** (§2.1) | W11 §6; W11's own prose says 71 %, which is the same measurement over a larger denominator |

**The one that matters is the first**, and it changes the shape of the wave. The
architect must not plan "add producers for 28 buckets". The producers for the
enemies, the midboss, the background elements, the ship, the pods, the shadows
and the shots are ALREADY THERE and ALREADY RUNNING; they append 12-byte
requests every frame; call #4 gathers them; the port writes a real hardware
display list to `$800000`. **Nothing reads it.** That is the gap, and it is one
edge in the graph, not twenty-eight producers.

---

## 1. THE CHAIN, END TO END

Stages, in execution order. "ROM" is the build-B routine; "port" is the file at
HEAD `7f8eb8d`.

| # | stage | ROM | port | state |
|---|---|---|---|---|
| 1 | the object's seven sprite fields exist in its record: `($2,A6)` long-axis pos, `($4,A6)` short-axis pos, `($6,A6)`/`($8,A6)` offsets, **`($A,A6)` the sprite DESCRIPTOR** (pri bit + 23-bit word offset into `sprmask`), `($E,A6)` width/height, `($1C,A6)` flip+colour | the prototype copy `$2637A2`, the 16-entry heading tables, handler immediates | `src/enemyproto.js`, `src/initbody.js`, `src/handlers.js`, `src/mover.js` | **PORTED** |
| 2 | a producer calls an ENQUEUE STUB, which packs those seven fields into a 12-byte REQUEST in one of thirty staging buffers and advances that bucket's counter by 12 | ~130 per-record stubs (`$23D762` family), the register variant (`$23EFC0` family), the zooming variant `$23D9E2`, and two BULK writers (`$28A098`, `$281D9A`) | `src/spritequeue.js` `enqueueRequest` / `enqueueRegisters` / `enqueueThroughStub` / `bulkWrite` | **PORTED**, and reached from `handlers.js`, `midboss.js`, `shots.js`, `options.js`, `shipsprite.js`; `background.js` has its OWN inline copy for bucket 2 (§2.3) |
| 3 | **main-loop call #4** sums the thirty counters, applies the pre-emptive drop policy, drains 29 buckets into the queue in a fixed hand-written order (= depth order), emits 10-byte hardware entries into `$800000..$8009FF` with a filler every 51/50 and a terminator, and clears the thirty counters | `$23D2AE..$23D724` | `src/displaylist.js` `buildDisplayList`, called from `src/main.js:352` every `step()` | **PORTED WHOLE**, gated at 0 divergent frames by `pgm.py dlgate` (W11) |
| 4 | the SPRITE DMA copies `$800000..$8009FF` (5 words/entry) into `:igs023:spritebuffer` (8 words/entry), masking word 1 bit 10 and word 2 bit 15, **one frame late** | IGS023 hardware, `pgm.cpp screen_vblank` | `src/render/spritelist.js` `parseSpriteList(words, stride)` already does the mask and takes `RAM_STRIDE = 5` | the CODE exists; **NOTHING CALLS IT ON THE PORT'S OWN LIST in the page** |
| 5 | the drawer walks the list backwards, first-drawn-wins, resolving each record's `offs` into `sprmask`/`sprcol` | `igs023_video.cpp` | `src/render/igs023.js` `Renderer.renderIndexed(st, {spriteStride})` → `src/render/sprites.js` `SpriteDrawer` | **PORTED**, and `renderIndexed` ALREADY accepts `spriteStride` |
| 6 | the sheet the drawer indexes | the mask/colour ROMs | `assets/spr/mask.u16` + `col.u16`, **166 streams RE-BASED into a packed 16-bit space** (`assets/manifest.json` `spr.note`) | **the addresses are the RECORDING's** - see §4 step 3 and RECON 2 |

### 1.1 [M] WHAT W11 PORTED CONSUMES, AND WHAT IT DOES NOT

`buildDisplayList(ram, opts)` (`src/displaylist.js:263`):

* **consumes** `ram` only - the thirty counters `$80AFC0..$80AFFB`, the thirty
  staging buffers, and `$80B054`. No object table, no ROM, no capture.
* **produces** ten-byte entries at `$800000` (`DL.list`), the telemetry return
  value `t`, and the cleared counters. It writes THROUGH `ram`.
* **does not** produce pixels, does not look at sprite art, does not know the
  atlas exists, and does not return the list - the list is in `ram`.

### 1.2 [M] THE BREAK IS AT STAGE 4, AND IT IS ONE LINE WIDE

`src/main.js:352` assigns `this.displayList = buildDisplayList(...)`.
**`grep -rn "displayList" src/ tools/*.mjs` gives exactly ONE hit - that
assignment. There are ZERO readers anywhere in `src/` or `tools/`.**

`src/web/app.js` `Demo.draw()` (lines 322–375) does, in order:

```js
const st = this.cap.state(fi);          // <- the CAPTURE's frame, fi = lf % 161
st.bg = this.game.vram.w;               // the port's background ring
st.regs = { ...st.regs, bg_xscroll: ..., ... };   // the port's scroll
this.spliced = this.cap.splice(st, fi, prevY, prevX, {tilt, ship});  // move 8 records
const idx = this.renderer.renderIndexed(st);      // renders st.spritebuffer
```

`st.spritebuffer` is `cap.part(i, 'spritebuffer')` - **the recording's own
post-DMA sprite buffer**, with eight player-attached records relocated. The
port's `$800000` list is built, held in RAM, and thrown away every frame.

That is the whole reason "none of it draws". Not a missing producer, not a
missing transform: **a missing edge between stage 3 and stage 4.**

### 1.3 THE ONE-FRAME LAG IS PART OF THE CONTRACT AND WILL BITE

`src/render/capture.js`'s header: *"`:igs023:spritebuffer` lags main RAM by one
frame … lag 1 gives three offsets holding on 161/161 captured frames, lag 0 and
lag 2 give none."* A page that renders the list built by the CURRENT `step()` is
one frame early. The existing splice already handles this by passing `prevPos` /
`prevTilt`; the port-list path has to hold the previous frame's list (or accept
a one-frame lead and say so).

### 1.4 A STALE COMMENT THE ARCHITECT WILL TRIP ON

`src/render/capture.js:8` and `src/render/index.js:8` both still say the port has
no display list and "one of the thirty buckets has a ported feeder (14, the
shots)". Both predate W11/W12/W29–W36. `src/main.js:47-55` `PRODUCED_BUCKETS`
lists four. All three are wrong as of §2.

---

## 2. THE THIRTY SPRITE BUCKETS

### 2.1 [M] THE 72 % CLAIM: IT REPRODUCES, AND ITS DENOMINATOR IS SMALL

I did not re-run the ablation (it needs MAME). I re-did the arithmetic on
W11 §6's published table - **the table is W11's measurement, the percentages
below are mine**:

* pass-1 pixels lost, eleven buckets: 87,545 + 11,741 + 6,380 + 4,472 + 3,775 +
  2,937 + 2,693 + 828 + 643 + 251 + 195 = **121,460**. Bucket 0 is
  87,545 / 121,460 = **72.08 %**.
* adding pass 2 (bucket 17 = 738, bucket 5 = 689, bucket 3 = 513) gives
  **123,400**, and bucket 0 is **70.94 %** - which is the 71 % W11's own prose
  states. **Both numbers are the same measurement with different denominators**;
  the brief's 72 % is the pass-1 one and is not wrong.

**THE DENOMINATOR IS NOT "SPRITE PIXELS IN STAGE 1".** It is *pixels that
changed in four framebuffers (lf1900/2100/2300/2500 of `stage1-open`) when one
bucket's counter was zeroed*. Nineteen buckets scored 0 px there because they
carried **zero records on all 1,901 frames of that scenario**, not because they
draw nothing. Quoting "bucket 0 is 72 % of sprite pixels" without that sentence
is how a four-frame number becomes a stage-wide claim.

### 2.2 [M] THE BOARD-SIDE FEEDER CENSUS - MINE, THIS SESSION

`python games/ddpdoj/tools/w10/buckets.py` re-run, plus a full absolute-long
caller expansion I wrote over `tools/oracle/out/maincpu.bin`. **377 absolute-long
call sites into the enqueue family across the thirty buckets**, which reproduces
W10 §3's 377 exactly from an independently written expansion. Absolute-long only,
so every caller count is a LOWER BOUND - and §3.2 shows a case where it is a
badly wrong one.

### 2.3 [M] THE PORT-SIDE CENSUS - WHICH BUCKETS THE PORT ACTUALLY FILLS

Run: the port from the PAGE'S OWN BUNDLE (`assets/seed.bin.gz`,
`player.tables.json.gz`, `capture.json/bin.gz` for `bgSeed`), seed lf2000, the
page's own standing `$810424 = $FF` invulnerability intervention, **3,000 logic
frames, input word `$FFFF` (nothing pressed), no other intervention, no throw**.
Per-bucket record counts read off `buildDisplayList`'s own telemetry.

```
frames=3000 seedLf=2000 recordsMax=70 of 251 entriesMax=72 of 256
bucket  total   max  frames!=0
   0    73150    62     3000
   2     7198     4     2686
   3    34721    20     2279
   5     4500     3     1500
   7     6604     6     1655
  15     6000     2     3000
  19     6000     3     3000
BUCKETS WITH >=1 RECORD FROM THE PORT: 7 of 30
```

A second run with `SHIP_MUTATE = 'no-option-object'` (the `--no-pods`
intervention W35 documents - needed because ANY fire press throws, §5) and a
single-frame Button-1 tap every 4 logic frames:

```
frames=2349  BLOCKED lf4349 $27F8F8 (the screen clear's effect spawn)
   0 33918/46   2 5240/4   3 17609/19   5 1175/1   7 2900/5
  14 20816/10  19 4697/3
```

**Union: buckets 0, 2, 3, 5, 7, 14, 15, 19 - EIGHT of 30.** (15 and 14 are
mutually exclusive only because of the intervention, not because of the game.)

### 2.4 THE TABLE, ALL THIRTY

`stubs` and `abs-long callers` are [M] mine. `port` is [M] the §2.3 census.
`ablation px` is W11 §6's measurement, cited. `what` is W11 §6 where W11 claimed
it and my own listing work where noted.

| # | ctr | stubs | abs-long callers | port? | ablation px (W11) | what feeds it on the board |
|---:|---|---:|---:|---|---:|---|
| 0 | `$80AFC0` | 9 | 98 | **YES** 62/f | 87,545 | THE ENEMIES. `$23D762` ← 10 enemy sites; `$23DECE` ← 83 sites `$258062..$29BBCC`; `$23D88E` ← 5 option sites. **[M] ALSO the effect pool `$288E4E` and the pool `$289B80`**, via the PC-relative table §3.2 |
| 1 | `$80AFC2` | 8 | 30 | no | 2,937 | `$23DEFC` ← 26 sites `$262848..$263314` (the BACKGROUND object's block) + `$29F3xx`; `$23D79E` ← 4 enemy sites. **[M] + `$288E4E`/`$289B80`** |
| 2 | `$80AFC4` | 8 | 42 | **YES** 4/f | 2,693 | `$23DF2A` ← 35 sites `$2623F4..$2631CA` (background elements). Port: `src/background.js` `elemStage`, its OWN inline copy of `$23DF2A` (`B2_BASE`/`B2_COUNT`), **not** `spritequeue.js`. **[M] + `$288E4E`/`$289B80`** |
| 3 | `$80AFC6` | 8 | 42 | **YES** 20/f | 513 (pass 2) | `$23DF58` ← 34 sites incl. the MIDBOSS `$26BF3A/$26BFE0`; `$23D816` ← 8. Port: `src/midboss.js` (`$23DF58`, `$23E056`), `src/handlers.js`. **[M] + `$288E4E`/`$289B80`** |
| 4 | `$80AFCC` | 4 | 2 | no | 0 | `$23E9D8` ← `$2810A2 $2810B4` (the bullet block). **I did not determine which routine reaches those two** |
| 5 | `$80AFD0` | 8 | 1 | **YES** 3/f | 689 (pass 2) | `$23EFC0` ← `$249EE2` only. Port: `src/shipsprite.js` + `src/options.js` - the ship's and the two pods' GROUND SHADOWS (W12 corrected W11's "exhaust" label) |
| 6 | `$80AFD2` | 4 | 0 | no | 0 | **no static caller of any kind** (W11 §7's `bsrscan`). SACRIFICED SECOND by the drop policy |
| 7 | `$80AFC8` | 8 | 39 | **YES** 6/f | 11,741 | `$23DF86` ← 29 sites; `$23D852` ← 10 (`$269E16 $269E3E $273C94 $274E4E $275A24 $277CA6 $278634` = enemy handlers). Port: `src/handlers.js`. **[M] + `$288E4E`/`$289B80`** |
| 8 | `$80AFCA` | 4 | 17 | no | 0 | `$23EBA0` ← 13 sites `$27FAB2..$280B20` - **[M] every one of them is a target of the IMPACT-POOL dispatch table `$27F99E`, i.e. type-5 call #4 `$27F95A`**; `$23EC20` ← 4 sites in `$281xxx` |
| 9 | `$80AFD4` | 4 | 0 | no | 0 | no static caller. SACRIFICED SECOND |
| 10 | `$80AFE8` | 8 | 0 | no | 0 | no static caller |
| 11 | `$80AFF0` | 8 | 0 | no | 0 | no static caller |
| 12 | `$80AFEA` | 2 | 0 | no | 0 | no static caller |
| 13 | `$80AFEC` | 4 | 8 | no | 0 | `$23FF06` ← `$255F44 $25613x`; `$23FF42` ← `$255F8E $25624C $2562EA`. **[M] all eight lie inside the two routines type-5 call #7 `$255DD8` dispatches to (`$255E3E`, `$255FE2`) - `$255DD8` drives `$811F72`, the LASER's beam-segment record.** Bucket 13 is 90 records deep |
| 14 | `$80AFD6` | 5 | 23 | **YES** 10/f | 3,775 | `$23F3AE` ← 23 sites `$253B40..$2544FC` = the player-shot handlers. Port: `src/shots.js` `enqueueShotSprite` |
| 15 | `$80AFDA` | 4 | 7 | **YES** 2/f | 643 | `$23F2CA` ← 7 sites, all inside the option object `$24C096`. Port: `src/options.js` |
| 16 | `$80AFD8` | 5 | 9 | no | 0 | `$23F508` ← 9 sites `$2548BA..$25514C`. **[M] five of them (`$2548BA $25497C $254A56 $254AB6 $254B5E`) lie inside the 32 routines type-5 call #10 `$254680` dispatches through `$254712`; two (`$2550C6 jsr`, `$25514C jmp`) are INSIDE type-5 call #11 `$255042` itself.** `$254F2E`/`$254FDC` I did not place |
| 17 | `$80AFCE` | 4 | 9 | no | 738 (pass 2) | `$23EB06` ← `$27EAC4..$27F66E`, all of which lie between `$27E99E` and the next type-5 call. **[M] `$23EB06` is in type-5 call #18 `$27E99E`'s call graph** |
| 18 | `$80AFF8` | 4 | 4 | no | 0 | `$240A5A` ← `$287374 $2873F4 $287452 $2874D2` - the `$287xxx` block. Not reached from any type-5 call I walked |
| 19 | `$80AFDC` | 6 | 4 | **YES** 3/f | 6,380 | `$23F104` ← `$24A538 $24A6C4`; `$23F1FA` ← `$24A532 $24A632`. THE SHIP. Port: `src/shipsprite.js` |
| 20 | `$80AFDE` | 4 | 0 | no | 195 | the BULK writer `$28A098` = **type-5 call #12**, unported. FIRST PRE-EMPTIVE SACRIFICE |
| 21 | `$80AFE4` | 5 | 4 | no | 0 | `$23F896` ← `$2698C4 $2698E2 $2698F6 $269906`. Port: `src/handlers.js:2360/2364` cites three of the four - **but the port emitted ZERO bucket-21 records in 3,000 frames**, so its handler (enemy type `$31`) did not run in this window |
| 22 | `$80AFE0` | 5 | 13 | no | 0 | the BULK writer `$281D9A` (**PORTED**, `src/bulletdriver.js`) writes the counter but emits nothing; the per-record stubs `$23F746/$23F782/$23F7C6` ← 13 sites incl. `$272C72 $27C432` (enemy handlers) |
| 23 | `$80AFE2` | **0** | 0 | no | 828 | **the ONLY feeder is the bulk writer `$281D9A`** - the ENEMY BULLETS. `src/bulletdriver.js` runs it; `spriteEmit` writes to a JS array sink and no sink is passed (§4 step 2) |
| 24 | `$80AFFA` | 2 | 0 | no | 0 | no static caller |
| 25 | `$80AFE6` | 4 | 21 | no | 4,472 | `$23FA96` ← 21 sites `$28490E..$285FAE`. W11 §6 left the label UNRESOLVED (its box is identical 400 frames apart and nobody bombed). I did not resolve it either |
| 26 | `$80AFEE` | 8 | 0 | no | 0 | no static caller |
| 27 | `$80AFF2` | 8 | 0 | no | 0 | no static caller |
| 28 | `$80AFF4` | 4 | 2 | no | 0 | `$240892` ← `$2529BC $252A48` - **[M] both inside type-5 call #22 `$25292A`** |
| 29 | `$80AFF6` | 4 | 2 | no | 0 | `$240976` ← `$252AC8 $252B3C` - **[M] both inside type-5 call #23 `$252A52`** |

**N of 30 with a PORTED producer that actually emits: 8** (0, 2, 3, 5, 7, 14,
15, 19). Two more have a ported CALLER that emits nothing: **22 and 23** (the
bullet driver runs, the sink is absent) and **21** (ported, not reached in my
window). Nineteen have no ported producer at all; nine of those nineteen have no
static caller in the whole image and never carried a record in 1,901 frames.

---

## 3. TYPE 5 `$28B5E0` - WHICH OF THE UNPORTED CALLS ARE EMISSION

### 3.1 [M] THE COUNT

`python tools/oracle/xref.py dasm 28B5E0 160`, read this session: **23 `jsr`
targets**, `$28B5E6..$28B66A`, then the tail at `$28B670`. `TYPE5_PORTED`
(`src/type5.js:181`) holds **TEN**: `$2634F4 $28AD54 $253A70 $24C096 $24A458
$24A46C $24A440 $24A44C $281D9A $25354C`. So **thirteen** are unported, not
fourteen - `$28AD54` was added by W33 (its FIRST LOOP only) and `src/main.js:59`
still says "NINE".

### 3.2 THE METHOD, AND ITS ONE BIG LIMITATION - STATED FIRST

I walked each unported target recursively (unidasm, following `bsr`/`jsr`/`jmp`
to `$23xxxx..$2Axxxx`), flagging any absolute-long reference to a bucket counter
or staging buffer.

**FIRST, A FALSE POSITIVE I MADE AND CAUGHT.** The project's standing rule is to
read PAST the apparent end of a routine, so my first pass read `$40` bytes past
each `rts`. The ~130 enqueue stubs are laid out **CONTIGUOUSLY** - `$23EB06`,
`$23EB38`, `$23EB6E`, `$23EBA0` are consecutive `$32`-byte stubs - so a `$40`-byte
overrun walks straight into the NEXT stub and attributes its bucket to the
caller. That pass wrongly gave `$255042` buckets 17 and 8, `$27E99E` bucket 4,
and `$252A52` bucket 18. **Every one of those is withdrawn.** §3.3 is the
overrun-0 result, cross-checked against the stub-caller lists and, where it
mattered, against the listing (`$2550C6 jsr $23F508` really is inside
`$255042`). The overrun rule is right for a routine that continues; it is wrong
for a table of adjacent leaf stubs, and this is the shape where it lies.

**SECOND, THE WALK MISSES THE MOST IMPORTANT CASE.** These pools dispatch through
`lea (table,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)` - invisible to
any absolute-long or `bsr` scan. My walker reported "no sprite-bucket reference"
for `$288E4E` and `$27F95A`; **both are wrong**, and I found the truth only by
reading the listing and dumping the PC-relative tables by hand:

```
[M] $288FF0 (reached from $288FDA, index = ($1E,A6) as a BYTE offset):
    [0] $23D762  [1] $23D79E  [2] $23D7DA  [3] $23D816  [4] $23D852
    -> buckets 0, 1, 2, 3, 7.  Entry [5] is $289004, the next ROUTINE, so the
       table is exactly FIVE entries.
[M] $289C26 (reached from $289C04, A4 loaded at $289BA4): the IDENTICAL five.
[M] $27F99E (reached from $27F988, D0 = $7C & type): 20 entries,
    $27FA30..$280A0E -- and $27FAB2..$280B20, the twelve abs-long callers of
    bucket 8's stub $23EBA0, are all INSIDE that range.
[M] $254712 (reached from $2546BA, D1 = ($1F & type)*4): 32 entries,
    $2547B2..$254B9E -- and bucket 16's nine callers $2548BA..$25514C are inside.
[M] $255E2E (reached from $255E1E, D0 = (type & 7)*4): 4 slots pointing at two
    routines $255E3E / $255FE2 -- and bucket 13's eight callers $255F44..$2562EA
    are inside them.
```

So "the walk found nothing" is worth nothing here, and every negative below is
labelled as what it is.

### 3.3 THE THIRTEEN, CLASSIFIED

| ROM call | # | pool / what it drives | EMISSION? | evidence |
|---|---:|---|---|---|
| `$289B80` | 1 | pool `$81CDEE`, stride `$30`, count `$81D38E`; writes `($a,A6)` at `$289BCC` from a table pointer | **YES → buckets 0,1,2,3,7** | [M] its own five-entry emitter table `$289C26` |
| `$27F95A` | 4 | the IMPACT pool `$8171BE`, stride `$2C`, count `$817F7E`, 20-entry dispatch | **YES → bucket 8** | [M] `$27F99E` targets contain all 12 abs-long callers of `$23EBA0` |
| `$288E4E` | 5 | **THE EFFECT POOL** - 80 slots (`moveq #$4F`), base `$81B732`, stride `$38`, live count `$81C8EA`; scripts out of `$221520`/`$221630`; spawner `$289004` | **YES → buckets 0,1,2,3,7** | [M] its own five-entry emitter table `$288FF0`. **Every explosion is behind this** |
| `$2890F2` | 6 | pool `$81C8EC`, stride `$40`, count `$81CDEC` | **UNRESOLVED** | [M] no abs-long/`bsr` bucket reference found; I did not locate its dispatch table. Given #1/#5's shape, assume emission until shown otherwise |
| `$255DD8` | 7 | `$811F72` - **the LASER's beam-segment record** (`37-recon-laser.md`'s `$811F72`); 4-slot table `$255E2E` | **YES → bucket 13** (90 records deep) | [M] all eight bucket-13 callers lie inside `$255E3E`/`$255FE2` |
| `$254680` | 10 | two 32-slot pools `$8112F2` (P1) / `$8118F2` (P2), stride `$30`; counts `$81295E`; 32-entry table `$254712` | **YES → bucket 16** | [M] all nine bucket-16 callers lie inside the table's targets |
| `$255042` | 11 | the two per-player records `$811F32`/`$811F52`; fills a 12-byte record at `($2,A6)` from a ROM template (`$25508A..$25509E`) | **YES → bucket 16** | [M] `$2550C6 jsr $23F508` and `$25514C jmp $23F508` are inside its body |
| `$28A098` | 12 | **THE BULK WRITER for bucket 20** - the FIRST PRE-EMPTIVE SACRIFICE | **YES → bucket 20** | [M] `$28A0EC lea $808FA4,A4` / `$28A12A move.w A4,$80AFDE` |
| `$2527CE` | 13 | `$81B660`/`$81B6A0`, driven off `$81B65C/$81B65E` | **UNRESOLVED, probably not** | [M] no bucket reference found by any of my methods |
| `$27E99E` | 18 | - | **YES → bucket 17** | [M] `$23EB06` is in its call graph |
| `$252BD0` | 19 | `$81B646/$81B648`, PC tables `$252B44`/`$252B8A` of WORDS (not pointers) | **UNRESOLVED, probably not** | [M] the tables are read `move.w (A0,D2.w),D0` - data, not calls |
| `$25292A` | 22 | - | **YES → bucket 28** | [M] `$240892` is in its call graph |
| `$252A52` | 23 | - | **YES → bucket 29** | [M] `$240976` is in its call graph |

**TEN of the thirteen are emission-path** - #1, #4, #5, #7, #10, #11, #12, #18,
#22, #23. **Two are unresolved** (#6 `$2890F2`, #13 `$2527CE`), **one is
probably not** (#19 `$252BD0`).

**Ranked by what they buy on screen:**

1. **`$288E4E` (#5) - the effect pool.** Explosions. It draws into buckets 0/1/2/3/7,
   i.e. the same depths as the enemies themselves, and W35 §7.2 already names it
   and its spawner `$289004` (34 kinds, 80 slots, 294 call sites) as a blocker on
   the sprite enumeration. **This is the single biggest visual item in the list.**
2. **`$27F95A` (#4) - the impact pool.** Bullet hits. Already reachable: the port
   throws `$27F8F8` (its spawner) TODAY, measured at lf4349 in my fire run.
3. **`$28A098` (#12) - bucket 20's bulk writer.** Cheap in pixels (195 px in W11's
   ablation) but it is the bucket the game drops FIRST, so its absence also
   removes the degradation policy's only live subject.
4. **`$255DD8` (#7) - the laser beam.** Blocked behind the laser (`$24C180`),
   which the owner already ranked as item 2.
5. **`$254680` (#10) / `$255042` (#11) / `$27E99E` (#18) / `$25292A` (#22) /
   `$252A52` (#23)** - buckets 16, 17, 28, 29. Bucket 17 measured 738 px in
   W11's pass 2; the other three measured 0 px in W11's four ablation frames.

---

## 4. THE GAP, NAMED - the work list for a stage-1 enemy that exists RIGHT NOW

Concrete case: an enemy spawned by the ported spawn walker, running a ported
handler, alive in the object table at this instant. What stands between its
record and a drawn pixel:

### STEP 0 - nothing. Stages 1–3 are done for it.
[M] In 3,000 frames from the page's seed the port appended **73,150 requests to
bucket 0 alone (max 62/frame)** and built a real display list every frame,
max 70 records / 72 entries. Its `($a,A6)` descriptor is a real ROM stream
address: **[M] 302 distinct `offs` values over those 3,000 frames, and 301 of the
302 are in W35's committed 2,035-stream ROM list** (the 302nd is `$000000`, the
null placeholder W35 §3 identified).

### STEP 1 - **NOTHING READS `$800000`.** *(the single missing edge)*
`src/web/app.js` `Demo.draw()` renders `cap.state(fi).spritebuffer`. The port's
list is discarded. **Fix shape:** read `$800000..$8009FF` out of `game.ram` into
a `Uint16Array(0x500)` and pass it as `st.spritebuffer` with
`renderIndexed(st, { spriteStride: RAM_STRIDE })`. `parseSpriteList` already
applies the DMA word masks, so the RAM list and the post-DMA buffer parse
identically. **Cost: a dozen lines.** Two traps:
* `spriteStride` currently lives in `renderIndexed`'s red-validation options bag,
  whose comment says *"Nothing in the port may pass a non-default value."* It has
  to move out of that bag or the comment has to change - silently violating it is
  how a decoder override becomes production behaviour.
* the ONE-FRAME LAG (§1.3): hold the previous frame's list.

### STEP 2 - **THE SHEET IS RE-BASED AND DOES NOT CONTAIN THE ENEMY.**
`assets/manifest.json` `spr.streams` is 166 entries whose bases are **packed
16-bit offsets (0, 10, 108, 206, …), not ROM addresses**; `tools/export-web.mjs`
rewrites every `capture.bin` record's `offs` into that space (lines 609–640) and
`src/web/assets.js verifyCoverage` asserts membership. **A port record carrying
`$12D430` indexes the packed mask array at word `$12D430 & (16384-1)` and draws
garbage - it does not throw.**

**[M] Exactly how bad, against `assets/manifest.json` as shipped: of the 302 ROM
offsets the port emits, ONE coincides with a packed stream base (base 0, the
null stream). 234 of the 302 are `>= 16384` and WRAP inside the packed mask
array; the other 68 land on arbitrary mask data.** So §4.1 shipped alone gives a
screen of ported enemies drawn as 301 wrong pictures. Two things are needed, and
sizing them is RECON 2's:
* the streams themselves. **[M] the 301 the port emits from the page seed cost
  98,258 mask words (196,516 B) + 293,814 colour words (587,628 B) = 784 KB RAW**
  (measured with the port's own `streamExtent`). Seven of the 301 are the big
  background elements (`$22CBCC..$233F34`), 30,636 B + 102,470 B on their own;
  the other 294 are 165,880 B + 485,158 B. Compare W35 §7.1's figure for the
  whole 2,035-stream list: **+1.13 MiB gzipped at boot**, against a current
  sprite bundle of 39.3 KiB.
* an **`offs` REMAP**, or an exporter that does not re-base. Today the only
  ROM→packed mapping shipped is `manifest.ship.pairs` (17 tilts), added by W12
  precisely because the recording could not supply them. A general
  `romOffs → packedOffs` table is the same idea generalised. **It must be an
  exact map with a LOUD MISS**, not a fallback: a record whose stream is absent
  must name the stream, not draw whatever is at that index.

### STEP 3 - **PALETTE.** A record's `color` field is bits 12..8 (32 banks). The
page draws with the CAPTURE's palette (`app.js:362`); W14/W15 shipped the
cartridge's own BG palette block and measured 1,020 of 1,024 entries equal, with
four (bank 21 pens 0..3) animated by an unported routine. **I did not check
whether the colour banks the port's enemy records ask for are among the 1,020.**
Unresolved, and it is the cheapest of the four to check.

### STEP 4 - **THE CAPTURE LAYER.** Once step 1 lands, the picture contains BOTH
the ported enemies and the recording's. The owner has already decided REMOVAL
FIRST (`39-OWNER…` §DECIDED). RECON 2 owns this. One consequence worth flagging
to the architect: **the splice becomes dead.** The port already produces the
ship (19), the pods (15) and all three shadows (5), so a page rendering the
port's own list needs no `cap.splice`, no attach matcher, and no
`manifest.ship.pairs` - those exist only to relocate records inside a recording.

### STEP 5 - **THE ENEMY BULLETS AND THE TRAILS ARE STILL SINK-LESS.**
`src/mover.js spriteEmit` (line 330) opens `if (!ctx.sprites) return;` and
`src/bulletdriver.js` passes no sink; `trailEmit` (line 526) is a counted note.
So buckets 22 and 23 stay empty even after step 1 - [M] confirmed, 0 records in
3,000 frames. **And two known defects are latent inside that emit**, recorded by
`26-review.md` F1/F2 and quoted in `bulletdriver.js`'s own header: the
renderOffs half-words are swapped relative to `$284286`, and kind 19's
continuation omits its renderOffs wrap. **Wiring the sink ships both.** They must
be fixed in the same change.

### STEP 6 - **THE EFFECT POOL.** Nothing explodes until `$288E4E` + `$289004`
are ported (§3.3). Independent of steps 1–5.

---

## 5. PLAYER SHOTS - SAME PATH, AND SMALLER THAN ANYONE THOUGHT

**Same emission path, one bucket over.** `src/shots.js` calls
`enqueueShotSprite(ram, rec)` = `enqueueRequest(ram, 14, rec)` - the identical
per-record stub, into bucket 14, gathered by the identical call #4, emitted into
the identical `$800000` list. There is no second path. The ledger's "computed and
INVISIBLE" is precisely step 1 of §4 and nothing else.

**[M] 1,500 frames, `--no-pods`, one Button-1 tap every 4 frames**, reading
bucket 14's staging buffer (`$808854`) at the count `main.js` records before
call #4 clears it:

```
max shot requests/frame = 10        DISTINCT SHOT STREAMS: 9
  $004970  5184 records  3x8      $00498c  5166 records  3x8
  $005064   478 records  2x24     $005098   477 records  2x24
  $0050cc   477 records  2x24     $005100   475 records  2x24
  $004d18   382 records  2x16     $004d3c   382 records  2x16
  $004d60   382 records  2x16
```

**[M] Their exact cost, from the port's own chain solver `streamExtent`:
354 mask words (708 B) + 738 colour words (1,476 B) = 2,184 bytes RAW.**

So "draw the shots" is: step 1 of §4, plus **2.1 KB of sprite art and nine remap
entries.** That is by far the cheapest visible win in this whole wave, and it is
the one the owner asked for by name.

**[M] BUT THE SHOTS CANNOT BE REACHED FROM THE PAGE TODAY.** Pressing fire with
the option object running throws `$24C180` on the FIRST held frame - I reproduced
it exactly (`BLOCKED lf2000 $24C180`). Every shot number above required the
`no-option-object` intervention. **So "shots drawn" and "the laser" are not
independent**: without the laser (owner's item 2) or some other honest gate, a
player still cannot fire. This is the one place the owner's ordering (drawing
before laser) does not survive contact.

---

## 6. SIZING

| step | unit | size | independent of? |
|---|---|---|---|
| §4.1 render the port's list | 1 edit in `src/web/app.js` `draw()` + a lag buffer + moving `spriteStride` out of the mutation bag | ~15 lines | mechanically independent of everything. **But it cannot be SHIPPED alone**: [M] 301 of 302 records would draw garbage (§4 step 2). It needs either §4.2 or a SKIP-AND-COUNT guard on records whose stream is not in the atlas - and that guard is worth building anyway, because it is what turns "the picture is wrong" into "N records this frame have no art, here are their addresses" |
| §4.2a ship the streams | exporter change + sharding | [M] 784 KB raw for the 301 the page seed reaches; W35 §7.1: +1.13 MiB gz for all 2,035 | needs §4.2b to be usable |
| §4.2b the `offs` remap | one map in the manifest + one lookup in `SpriteDrawer.draw` (or an exporter that does not re-base) | 166→N entries | **must ship WITH §4.2a.** Either alone draws garbage |
| §4.5 the bullet sink | `bulletdriver.js` passes a cursor; `mover.js spriteEmit`/`trailEmit` write 12 bytes; **plus the two `26-review` F1/F2 fixes** | 2 buckets, ~40 lines + 2 bug fixes | independent of §4.1 mechanically; pointless before it |
| §3.3 `$288E4E` + `$289004` | 80 slots × `$38`, script tables `$221520`/`$221630`, 34 spawn kinds, 294 call sites (W35 §7.2's count, cited), 5-entry emitter table | a wave on its own | independent |
| §3.3 `$27F95A` + `$27F8F8` | 20-entry dispatch `$27F99E`, pool `$8171BE` stride `$2C` | ~20 bodies | independent; already reached by a throw |
| §3.3 `$28A098` | 1 bulk writer, 1 bucket | small | independent |
| §5 shots' art | [M] 9 streams, 2,184 B raw | tiny | needs §4.2b |

**MUST SHIP TOGETHER:** §4.2a + §4.2b (art + remap), and §4.1 must ship with
either those two or the skip-and-count guard. **THE SMALLEST HONEST SHIPPABLE
SLICE** is therefore: §4.1 + the guard + the shots' nine streams and their nine
remap entries (2,184 B). That puts the port's ship, pods, shadows AND SHOTS on
the screen from the port's own list, names every enemy record that has no art
yet, and is the first time anything on that page has been drawn from the port's
own display list.

---

## 7. WHAT I COULD NOT DETERMINE

1. **Whether the port's enemies would look RIGHT once drawn.** Nothing here is
   compared against MAME. Every number in this document is the port replayed
   against its own bundle, or the ROM read statically. A record with a correct
   position and a correct descriptor can still be the wrong record.
2. **Type-5 calls #6 `$2890F2` and #13 `$2527CE`.** I found no bucket reference
   by absolute-long scan, `bsr` walk, or by reading their first ~90
   instructions. **I did not find their PC-relative dispatch tables**, and §3.2
   is the proof that "I found no reference" is worth very little for this shape.
   `$2890F2` has a pool (`$81C8EC`, stride `$40`, count `$81CDEC`) that looks
   exactly like the two that DO emit.
3. **Bucket 25 (`$28490E..$285FAE`, 4,472 ablation px).** W11 left the label
   unresolved and so do I. It is the third-largest ablation figure and nobody
   knows what it is.
4. **Whether the palette covers the port's enemy colour banks** (§4 step 3). Not
   checked. Cheap to check.
5. **Bucket 21.** `src/handlers.js` cites three of its four feeders, but the port
   emitted zero bucket-21 records in 3,000 frames, so I cannot say whether the
   producer works - only that its handler did not run in my window.
6. **Anything about the zooming enqueue `$23D9E2`.** W11 ported it LISTING-ONLY
   with two named throws; no producer in the port calls it, and none of my runs
   reached it. If a ported enemy ever needs a zoomed record it throws at
   `$23D9FA`, which is correct behaviour and also a stop.
7. **`$80B054`.** Still `$00000000` everywhere anyone has looked. Presence, not
   coverage - six writers, none disassembled.
8. **The exact gzipped cost** of §4.2a. I measured RAW bytes (784 KB) because
   gzip depends on how the exporter packs; W35's +1.13 MiB gz figure is for the
   full 2,035 list and is cited, not re-measured.
9. **What RECON 2 will find about the art.** Every art number above is a
   dependency I stated and stopped at; I did not open the tile data or the
   capture-removal question.

---

## 8. THE WORK LIST, FOR THE ARCHITECT

Ordered so each item is visible when it lands.

1. **RENDER THE PORT'S OWN DISPLAY LIST.** `src/web/app.js draw()`: read
   `$800000..$8009FF` from `game.ram`, hold it one frame, pass it as
   `st.spritebuffer` with `spriteStride: RAM_STRIDE`. Move `spriteStride` out of
   the red-validation options bag or amend its comment. **Ship it with a
   SKIP-AND-COUNT guard**: a record whose `offs` is not an exported stream base
   is not drawn, and its ROM address goes on the status line. Without the guard
   [M] 301 of 302 records draw garbage. **This is the wave's keystone and
   everything else is downstream of it.**
2. **THE `offs` REMAP + THE STREAMS**, together. Generalise
   `manifest.ship.pairs` into a ROM→packed map; ship the streams the port
   actually emits ([M] 301 today, 784 KB raw) behind the same shard machinery
   `gfx/bg.shard*` already uses. **A record whose stream is absent must throw by
   address, never index into a wrapped array.** (Sizing and cutting: RECON 2.)
3. **THE SHOTS' NINE STREAMS** ([M] `$004970 $00498C $004D18 $004D3C $004D60
   $005064 $005098 $0050CC $005100`, 2,184 B raw). Falls out of item 2 for
   almost nothing and is what the owner asked for by name. **Note the coupling
   in §5: fire still throws at `$24C180` until the laser lands.**
4. **THE BULLET SINK** - `bulletdriver.js` → `mover.js spriteEmit`/`trailEmit`,
   buckets 22 and 23. **Fix `26-review.md` F1 (swapped renderOffs half-words vs
   `$284286`) and F2 (kind 19's missing wrap) in the same change** - they are
   latent only because no sink exists.
5. **THE EFFECT POOL `$288E4E` + `$289004`** - buckets 0/1/2/3/7 via the
   five-entry table `$288FF0`; 80 slots, stride `$38`, base `$81B732`, scripts
   at `$221520`/`$221630`. Every explosion. Biggest visual item after item 1.
6. **THE IMPACT POOL `$27F95A` + `$27F8F8`** - bucket 8, 20-entry table
   `$27F99E`, pool `$8171BE` stride `$2C`. Already reached by a throw today.
7. **`$28A098`** - bucket 20's bulk writer, and with it the drop policy's only
   live subject.
8. **`$289B80`** (buckets 0/1/2/3/7 via `$289C26`), then **`$255042` / `$27E99E`
   / `$254680` / `$25292A` / `$252A52`** (buckets 16, 17, 28, 29).
9. **RESOLVE `$2890F2` and `$2527CE`** by finding their dispatch tables - §7.2.
10. **CHECK THE PALETTE BANKS** the port's enemy records ask for against the
    1,020 shipped entries - §7.4. Half an hour, and it can turn item 1 from
    "enemies appear" into "enemies appear the right colour".

**And a documentation defect that will mislead the next reader:**
`src/render/index.js:8`, `src/render/capture.js:8` and `src/main.js:47-59` all
still say the port has no display list / four produced buckets / nine of 23
type-5 calls. All three are wrong. Correcting them costs nothing and is the same
class of error that cost W28 its headline (`src/type5.js:13-20` says so itself).

---

## LOG

- opened.
- §1 [M]: the chain is COMPLETE through call #4. `buildDisplayList` runs every
  `step()` and writes a real hardware list to `$800000`. **`game.displayList` has
  ONE writer and ZERO readers in the whole repo**; `web/app.js draw()` renders
  `cap.state(fi).spritebuffer` instead. That one missing edge is the gap.
- §0/§2 [M]: **the brief's "2 of 30 buckets have producers" is stale.** The port
  fills EIGHT of 30 today (0, 2, 3, 5, 7, 14, 15, 19), measured from the page's
  own bundle over 3,000 + 2,349 logic frames. `src/main.js`'s own
  `PRODUCED_BUCKETS` (four) is stale too.
- §2.1 [M]: 72 % reproduces from W11 §6's table (87,545 / 121,460). Its
  denominator is four framebuffers of one scenario, and nineteen buckets scored
  0 because they never carried a record there.
- §2.2 [M]: 377 absolute-long call sites into the enqueue family, reproducing
  W10 §3 from an independently written expansion. Full per-bucket feeder table
  in §2.4.
- §3 [M]: **TEN of 23 type-5 calls are wired, not nine.** Of the thirteen
  unported, TEN are emission-path; the two biggest are the EFFECT POOL
  `$288E4E` (explosions, buckets 0/1/2/3/7 via the five-entry table `$288FF0`)
  and the IMPACT POOL `$27F95A` (bucket 8).
- §3.2 [M]: a `bsr`/absolute-long walk MISSES these pools entirely - they
  dispatch through `lea (tbl,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)`.
  Five such tables dumped by hand. Every negative in §3.3 is labelled.
- §3.2 [M]: **and a false positive of my own, caught and withdrawn.** Reading
  `$40` bytes past each `rts` - this project's own standing rule - walks into the
  NEXT enqueue stub, because the stubs are contiguous `$32`-byte neighbours. It
  wrongly gave `$255042` buckets 17 and 8, `$27E99E` bucket 4 and `$252A52`
  bucket 18. All withdrawn; §3.3 is the overrun-0 result, cross-checked.
- §4 [M]: the work list. 301 of 302 streams the port emits are already in W35's
  committed ROM list; the 302nd is the null `$000000`. The sheet is RE-BASED, so
  a port record needs a remap as well as the art.
- §5 [M]: **the shots are on the SAME path, bucket 14.** Nine streams,
  **2,184 bytes raw**, max 10 records/frame. And [M] **any fire press throws
  `$24C180` on the first held frame** - reproduced - so shots are unreachable
  from the page until the laser lands.
- §7: nine things I could not determine, including two type-5 calls whose
  dispatch tables I did not find and bucket 25, which nobody has ever named.

status: DONE
