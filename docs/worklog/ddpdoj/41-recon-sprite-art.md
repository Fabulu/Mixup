# 41 — RECON: the SPRITE ART, its DELIVERY, and REMOVING THE CAPTURE LAYER

status: **DONE** — see §8 for the WORK LIST.
started / finished: 2026-08-04. RECON 2 of 2 for the enemy layer.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER).
RECON 1 (`40-recon-emission-path.md`) owns the EMISSION PATH; this document does
not touch it.

**[M] = measured by me, this session, on this tree.** Anything taken from another
document is marked `[cited]`. No MAME was run for any number here; every figure is
the cartridge ROM read directly, the published bundle read directly, or the port
replayed against a TSV already on disk.

**A HAZARD, DECLARED FIRST.** A DaiOuJou implementer is editing
`games/ddpdoj/src/` concurrently with this recon. Every ROM-side and bundle-side
number below is independent of `src/` and is safe. The two PORT-RUN measurements
(§1.3, §2.4) executed `src/` as it stood mid-session and could have caught it
mid-edit — that is W35 §6.3's hazard, whose symptom was a *plausible* wrong
number. They are marked as such and no recommendation rests on them alone.

---

## 0. THE BRIEF'S PREMISES, CHECKED

| the brief says | verdict |
|---|---|
| the mask ROM walks to **8,073** streams | **[M] CONFIRMED.** `node tools/w35atlas.mjs rom` reproduced `DIRECTORY 8073 streams ... $000000..$33a6e4 of $800000 words` |
| shipping the full ROM list costs **+1.13 MiB gzipped at boot** | **[M] CONFIRMED, to the byte,** re-packed and re-gzipped independently of the exporter. ROM list = mask 67,150 B + colour 1,154,096 B = **1,192.6 KiB**; today's 166 streams = 5,689 + 34,437 = **39.2 KiB**. Difference **1,153.4 KiB = 1.13 MiB** |
| **"2,035 streams is the whole list"** | **[M] FALSE, in both directions, and this is the premise that matters.** 2,035 is neither the cartridge's inventory (8,073) nor a stage-1 census. It is a FLOOR whose 52-table SET was discovered by measurement and then enumerated to each table's full extent — so it **over**-includes (tables that serve other stages) and **under**-includes at the same time. Measured under-inclusion, today: **the port's own emitter produces 92 streams the 2,035-list does not contain** (§1.3). W35 measured 328 of 328 covered; that is no longer true |
| the port/capture split is **329 vs 150, 53 shared, 97 capture-only, 276 port-only** | **[M] STALE.** Re-run this session with W35's own interventions: **506 vs 150, 63 shared, 87 capture-only, 443 port-only.** The port grew between W35 and now. (PORT-RUN number — see the hazard above) |
| removal-first is the owner's decision | not mine to check; taken as given, and §5 is built for it |

---

## 1. THE WORKING SET — how many streams does stage 1 need?

### 1.1 The honest answer first

**Nobody can state it exactly today, and the reason is nameable rather than
vague.** Eight stage-1 handlers, the effect pool `$289004`+`$288E4E`, the boss
`$292902` and the option object's laser arm `$24C180` are unported `[cited: W35
§7.2]`, so no instrument can reach the art behind them; and the ROM side has no
per-stage sprite table at all `[cited: W35 §2]`, so any static list is built by
enumerating tables discovered from observations. Under-inclusion and
over-inclusion are both live at once.

What I can do is **bound it, and price every bound.** All figures `[M]`, packed
and gzipped exactly as `tools/export-web.mjs` does it (coalesce the used word
ranges, pack, `zlib.gzipSync level 9`). **The method was validated against the
shipped bundle and its one known deviation is stated rather than hidden:** on the
same 166 streams it gives mask 5,689 B and colour 34,437 B where
`assets/spr/*.u16.gz` are 5,708 B and 34,566 B — **19 B and 129 B low**, because
`export-web.mjs` rounds each packed buffer up to a power of two and this does not.
Every figure in the table is therefore ~0.4 % BELOW what the exporter would
actually write, uniformly, in the direction that flatters nothing.

| candidate working set | streams | mask gz | colour gz | **total gz** |
|---|---|---|---|---|
| `capture.bin`'s own display lists | 150 | 4,986 | 28,556 | **32.8 KiB** |
| **TODAY's published atlas** (150 + 16 ship) | **166** | 5,689 | 34,437 | **39.2 KiB** |
| what survives the removal of §5 (+ ship tilts) | 100 | 2,909 | 22,390 | **24.7 KiB** |
| **the PORT's own emitter, 12,000 frames** | **506** | 32,560 | 534,785 | **554.0 KiB** |
| wave 3's 2-scenario board harvest | 1,183 | 78,463 | 905,332 | **960.7 KiB** |
| **the committed ROM list** | **2,035** | 67,150 | 1,154,096 | **1,192.6 KiB** |
| union of all three instruments | 1,449 | 99,163 | 1,275,823 | **1,342.8 KiB** |
| the cartridge's whole inventory | 8,073 | 597,232 | 8,970,152 | **9,343.1 KiB** |

**The headline is that there is no set that fits.** Today's entire boot is
**470.0 KiB [M]** (§2.1). The *smallest defensible* working set — the streams the
port's own emitter reaches today, itself a floor with eight named holes — is
**554.0 KiB on its own**, larger than the whole page. "Ship what stage 1 uses"
does not solve the size problem. It halves it.

### 1.2 How each set was established

- **capture 150** `[M]` — every `offs` in all 161 frames of `rip/web/capture.bin`
  through `src/render/spritelist.js`. 7,671 records, 150 distinct. Reproduces W35.
- **166** `[M]` — those 150 plus the 17 `$25533A` ship tilt streams read from
  `rip/port/player.tables.json` (one, `$001520`, is already among the 150). This
  is exactly what `assets/manifest.json` holds.
- **506** `[M, PORT-RUN]` — `tools/w35atlas.mjs diff … --free 12000 --fire 4
  --stick --no-pods --stub-unported`, collecting the port's OWN emitted
  `$800000..$8009FF`, parsed by the same parser the capture side uses.
  **All 506 are mask-ROM directory entries — 506 of 506, 0 exceptions**, which is
  the check that says they are real stream starts rather than a mis-parse.
  INTERVENTIONS, named (`docs/knowledge/09`): synthetic Button-1 tap every 4
  frames, the owner's stick script, `--no-pods`, `--stub-unported`, a free run
  past the trace. Valid for coverage; invalid for "this is what the game does".
- **1,183** `[M]` — the distinct `offs` in wave 3's `rip/assets/manifest.json`.
  The file holds 1,211 RECORDS; **they collapse to 1,183 distinct addresses**,
  where W35 §4.4 reports 1,211 streams. All 1,183 are directory entries.
- **2,035** `[M]` — `node tools/w35atlas.mjs rom`, reproduced exactly, 52 tables /
  2,246 entries + 22 immediates + 15 animation ranges.
- **8,073** `[M]` — `walkDirectory` over `cave_b04401w064.u1`, reproduced exactly.

### 1.3 THE FINDING THAT CHANGES THE PLAN — the committed list is already behind the port

**[M] The 2,035-stream ROM list covers only 414 of the port's 506 emitted
streams. 92 are missing**, and they are not noise:

- all 92 are mask-ROM directory entries;
- 68 are one fixed-stride run, `$1D04EC .. $1DF3FC`, stride `$384`;
- 18 are the run `$07E8AC .. $083DEC`, stride `$554`;
- 5 are `$17D480 $17D6C4 $17D778 $17D82C $17D8E0`;
- the 92nd is `$000000`, the null stream, legitimately absent.

Their own cost is **151.5 KiB gz [M]**. Two of the three runs have the exact shape
of a `ROM_ANIM_RANGES` entry — a base and a fixed stride — i.e. the
enumerable-exactly case W35 §4.3 made its point about. The fix is cheap. But until
it lands, **shipping the committed ROM list would leave the port's own emitter
pointing at 92 streams the bundle does not contain, and `verifyCoverage` would not
catch it**, because that check walks only the CAPTURE's records.

Coverage of the other instruments, for the record `[M]`: capture **149 of 150**
(the miss is `$000000`), harvest **848 of 1,183**.

### 1.4 The over-inclusion, counted

**[M] 1,012 of the 2,035 have never been reached by any of the three
instruments.** (Capture ∪ port ∪ harvest, restricted to directory entries, is
1,449 streams; 1,023 of those are inside the ROM list.) W35 called this number
1,058 against a smaller port; it is 1,012 now. Some of the 1,012 are stage-1 art
nothing has reached yet — which is the whole argument for enumerating statically —
and some are other stages' art riding along inside a fully-enumerated table.
**Nothing in this document can tell those two apart.**

---

## 2. DELIVERY — the options, measured

### 2.1 What boot costs today `[M]`

Every file `loadBundle` awaits before `boot()` returns, summed from disk:

```
  manifest.json                 10,112
  gfx/tx.tiles.u8.gz             2,549     gfx/tx.tileno.u16.gz         297
  gfx/bg.tileno.u16.gz           3,345     gfx/bg.pal.u16.gz            946
  gfx/bg.shard0.tiles.u8.gz    111,993     gfx/bg.smap.u16.gz           517
  gfx/bg.shard1.tiles.u8.gz    103,309
  spr/mask.u16.gz                5,708     spr/col.u16.gz            34,566
  capture.json.gz                3,895     capture.bin.gz            67,590
  seed.bin.gz                    6,879     player.tables.json.gz    129,563
  ---------------------------------------------------------------------------
  TOTAL BOOT                   481,269 B = 470.0 KiB
  deferred (bg shards 2..7)    522,474 B = 510.2 KiB
```

W35 wrote 467.9 KiB; the bundle has moved 2.1 KiB since. The 433.1 → 377.0 KiB win
the brief cites is `[cited]`, not re-measured here.

### 2.2 COMPRESSION IS NOT THE LEVER — measured, not assumed

The colour half is **96.8 %** of the ROM list's cost and it barely compresses:
2,133,246 raw bytes → 1,154,096 gzipped, ratio **0.541**. Alternatives, all `[M]`
on the ROM list's own colour buffer:

| encoding | raw | gzip -9 | brotli q11 |
|---|---|---|---|
| **as shipped** (u16 LE) | 2,133,246 | **1,154,096** (1,127.0 KiB) | 932,899 (911.0 KiB) |
| byte-plane split (lo bytes, then hi) | 2,133,246 | 1,162,176 | 982,197 |
| **unpacked, one 5-bit pixel per byte** | 3,199,869 | **1,042,249** (1,017.8 KiB) | 840,979 |
| unpacked + pixel-plane split | 3,199,869 | 1,229,740 | 983,496 |
| dense 5-bit bitpack | 1,999,919 | 1,342,160 | 1,147,330 |

- The best **gzip-decodable** re-encoding saves **9.7 %**, triples the in-memory
  array (3.2 MB rather than 2.1 MB) and needs a change to `SpriteDrawer`'s inner
  loop. Not worth a wave.
- Brotli would save **19.2 %** — but `src/web/assets.js` inflates the payload
  ITSELF through `DecompressionStream`, which browsers implement for `gzip`,
  `deflate` and `deflate-raw` and **not** for brotli. Using it means handing the
  inflate back to the HTTP layer (`Content-Encoding: br`), which is the exact
  configuration `assets.js`'s own error message warns is a footgun, and it becomes
  a property of the host rather than of the bundle.

**1.13 MiB is 1.13 MiB. The only levers are WHAT is sent and WHEN.**

### 2.3 The cost is concentrated in a few enormous pictures `[M]`

Over the 2,035, ranked by colour words consumed:

```
  top  10 streams = 13.5 % of the colour words
  top  20 streams = 25.4 %
  top  50 streams = 49.7 %
  top 100 streams = 69.1 %
  top 200 streams = 77.3 %
```

**Half the whole payload is fifty pictures.** The largest single stream is
`$23061C` (3,842 mask words, 15,079 colour words) — a BACKGROUND ELEMENT reached
from the immediate at `$26258C`.

Per-source MARGINAL cost — what the list loses if that source is dropped:

| source | streams | marginal gz |
|---|---|---|
| `$288D62` — **no citation** in `ROM_TABLES` | 18 | **225.0 KiB** |
| `$25E7B8` — **no citation** | 14 | **195.0 KiB** |
| the 13 background-element immediates `$2623A6..$262760` | 13 | **143.4 KiB** (summed) |
| `$272C7A` types `$20/$21` | 224 | 101.6 KiB |
| `$26BF42` MIDBOSS, second table | 32 | 78.9 KiB |
| `$25F7C8` — no citation | 40 | 73.7 KiB |
| `$26BFE8` MIDBOSS, third table | 5 | 61.6 KiB |
| `$268594` enemy type `$10` | 96 | 55.0 KiB |
| `$268B9E` enemy type `$11` | 96 | 33.3 KiB |
| `$24F5E4` — no citation | 118 | 19.7 KiB |
| ~70 further sources | | the remaining ~215 KiB |

**Two uncited tables — 32 streams between them — are 420 KiB, 35 % of the entire
payload.** Neither has a `why` in `ROM_TABLES`; both were admitted because some
observed stream's longword lives there, and both are read `lea (d16,PC)` so a
literal scan cannot name their reader. Before a byte of this ships, somebody
should read what `$288D62` and `$25E7B8` ARE. If either is another stage's or a
boss's, the payload drops by up to a third for the price of one listing read.

### 2.4 TIME-SHARDING — when does the port first need each stream? `[M, PORT-RUN]`

The same 12,000-frame run, recording the FIRST logic frame at which each stream is
emitted, priced cumulatively (59.185606 Hz):

| by | streams | cumulative gz |
|---|---|---|
| 1 s | 44 | **18.2 KiB** |
| 2 s | 47 | 18.5 KiB |
| **5 s** | **99** | **26.9 KiB** |
| 10 s | 129 | 50.1 KiB |
| 20 s | 225 | 166.6 KiB |
| 30 s | 271 | 245.5 KiB |
| 60 s | 310 | 319.5 KiB |
| 120 s | 506 | 554.0 KiB |
| 203 s (end of run) | 506 | 554.0 KiB |

**This is the delivery answer.** A boot shard covering the first five seconds of
play is **99 streams and 26.9 KiB** — *smaller than the 39.2 KiB sprite sheet the
page already ships*. The rest arrives on a schedule with tens of seconds of slack,
exactly as the eight BG shards do. Caveats that must travel with these numbers:

- it is the PORT's emission order, not the board's, and the port is missing eight
  handlers, so **later buckets are understated and the early ones are the most
  trustworthy**;
- the interventions of §1.2 apply — a stick sweep and a 4-frame fire tap make the
  run off-distribution;
- the deferred sprite payload (~527 KiB after the 5 s shard) would compete with
  the 510.2 KiB of deferred BG shards. Two half-megabyte queues on one connection
  is a scheduling question the BG recon's "25 s of slack, tightest deadline 4.3 s"
  `[cited]` does not answer.

### 2.5 The four real options, priced

| option | boot | runtime | verdict |
|---|---|---|---|
| **A. ship the ROM list at boot** | **+1,153.4 KiB** (470 → 1,623 KiB) | none | rejected by the owner's standing "boot must not get slower" constraint |
| **B. shard, boot shard = the first seconds, rest deferred** | **+0 KiB, or NEGATIVE**: a 5 s boot shard is 26.9 KiB against the 39.2 KiB shipped today | a shard in flight draws nothing; the machinery (`BgShards`, `promote`, `demand`, "named, never black") **already exists** | **the only option that works** |
| **C. lazy per-stream fetch on first draw** | +0 | **impossible.** `renderIndexed` is synchronous inside the frame; a stream that has not arrived cannot be awaited, only skipped. Degenerates to B with a worse schedule | rejected |
| **D. a different compression** | −9.7 % (gzip-decodable) or −19.2 % (brotli, host-dependent) | a renderer change for the 9.7 % | not a lever (§2.2) |

One structural note for B. The BG shard schedule is driven by the scroll VM's own
column cursor, which is arithmetic (`streamColumnOf`). A sprite shard has an
equally good clock available and should use it rather than a timer: **the stage-1
spawn script's own trigger clocks**, already read from ROM at run time by
`stage1Handlers()` in `tools/w34damagegate.mjs`. Shard by producer (source table),
schedule by trigger clock.

---

## 3. THE CAPTURE LAYER — what it supplies, and what removal touches

### 3.1 Every runtime consumer of `capture.bin`, read out of the code

`src/web/app.js Demo.draw()` builds one `st` per frame from `cap.state(fi)` and
overwrites part of it. Exhaustively:

| `st` field | source today | ledger row |
|---|---|---|
| `spritebuffer` | **the capture, whole** — every sprite, including the 8 player records the splice relocates | L1, L4, L10, L11, L12, L13 |
| `bg` | **the PORT** (`st.bg = game.vram.w`); the ring's first 63 columns are `bgSeed`, from the capture, at construction | L6 (part) |
| `tx` | **the capture, whole** — HUD, score digits, all on-screen text | L8, L9 |
| `palette` | **the capture, whole** (frame `fi+1`'s — the measured sample-point offset) | L14, L7 (colour half) |
| `rowscroll` | **the capture** (measured all-zero over 13,600 lf `[cited]`) | L5 |
| `zoomram` | **the capture** — even though `src/zoomtable.js` bakes the constant and asserts it at boot, the RENDERER still reads the capture's copy | L17 (marked REPLACED; this is the part that is not) |
| `regs.bg_xscroll/bg_yscroll/tx_xscroll/tx_yscroll` | **the PORT** | L5 (part) |
| `regs.ctrl`, `regs.bg_scale` | **the capture** (constants on every measured frame `[cited]`) | L5 (part) |
| `frames[i].lf/vf`, `cap.length` | **the capture** — this is the 161-frame modulo in `draw()` | L15 |
| `frameList[].refPy/refPx` | **the capture** — the input to the attachment matcher | — |

Plus, outside `draw()`: `bundle.bgPalette` is shipped, **validated against the
capture's palette RAM at boot** (`assets.js` demands ≥1000 of 1024 agreement) and
then read by nothing.

### 3.2 What removal touches, by ledger row

**L1 is the row that changes.** L1 is "the CONTENTS of the thirty sprite buckets";
removal takes the 26 producerless buckets' contents off the screen and leaves the
four the port produces (19, 15, 5, 14). Its status should gain a clause, not flip.

**L4, L10, L11, L12 are emptied, not replaced** — the player shots, the enemies,
the enemy bullets, and the explosions/death effects/items are exactly the rows
whose pixels come out of `spritebuffer`. None may be marked REPLACED. The honest
new state is **REMOVED (empty) — awaiting its producer.**

**L13** (laser, bomb, hyper) is untouched: it was never in the capture.

**No other row moves**, and that is measured rather than argued:

- **[M] the HUD is not sprites.** Over all 161 frames there are 220 distinct
  `(offs, class)` keys in the capture's display lists, and **exactly 4 never
  move**. Of those four, the only one appearing more than once is the NULL stream
  `$000000`, drawn 1x1 at x = −1024 — off screen. There is no static,
  screen-anchored sprite in the recording. The HUD, the score and the text are
  `st.tx`, which removal does not touch.
- L5, L6, L7, L8, L9, L14, L15, L17 read nothing differently.
- **L2 and L3** (the ship, the two pods, the three ground shadows, the aura and
  the glow) are precisely the records that must SURVIVE removal — §5.

---

## 4. PALETTES — where the colour comes from

### 4.1 Today, 100 % of the palette is the recording

`draw()` calls `paletteRgb(this.cap.part((fi + 1) % n, 'palette'), this.pal)` —
the whole palette RAM, sprites included. The cartridge's BG block IS shipped
(`gfx/bg.pal.u16.gz`, 946 B), IS checked at boot, and **is drawn by nothing**.

### 4.2 [M] The sprite palette is CONSTANT, and 31 of its 32 banks are in ROM

The capture's palette part is **2,560 words** (`$000..$9FF`; `$A00..$FFF` is not
captured at all). Over all 161 frames:

| region | words | non-zero at f0 | **ever change** |
|---|---|---|---|
| SPRITE `$000..$3FF` | 1,024 | 962 | **0** |
| BG `$400..$7FF` | 1,024 | 659 | **4** — bank 21 pens 0..3, the animated four W15 named |
| TX `$800..$9FF` (the captured part) | 512 | 179 | **0** |

A sprite pixel is `pen + colour*32` (`src/render/sprites.js`), so the sprite
palette is exactly 32 banks of 32 words. Searching the decrypted 68000 image
(`tools/oracle/out/maincpu.bin`) for each bank as a verbatim 32-word big-endian
run:

- **31 of 32 banks are found.** Bank 24 is all zeros (its hits are trivial and it
  is not counted as found); **bank 6 is the only non-zero bank with no 32-word
  match anywhere in the image** — unresolved, §7.
- Most live in a `$40`-strided array around **`$2237F8 .. $2252B8`** (build B;
  each has a build-A twin at `$12xxxx`, the mirror `NOTES-build-split.md`
  describes). Outliers: bank 0 `$222878`, bank 2 `$222978`, bank 4 `$2229F8`,
  bank 1 `$2259B8`, bank 3 `$246C38` / `$25BAEC`.
- **The banks are NOT in ROM order** (the lowest address is bank 12, then 13, 11,
  10, 15, 14, …), so an indirection decides which block lands in which bank. That
  table — and the routine that uploads it — is the work; the data is trivial.
- **The method was validated on a known answer**: the BG block's first 256 words
  match at `$127E58` / `$227E58`, which is the address `$2415E8` is documented to
  upload `[cited: W16, `app.js`]`.

### 4.3 What palettes add to the work

**Almost no bytes and one listing read.** 1,024 words = 2,048 raw bytes; gzipped
next to the existing `bg.pal.u16.gz` it is under 1 KiB. Colour is **0.1 %** of the
delivery problem. What it costs is finding the sprite analogue of `$2415E8`.

**And one thing removal and emission do NOT need.** Because the sprite palette
never changes over the recorded window, and because the port already computes each
enemy's palette INDEX (sub-record `+$1D` → the display-list record's colour field,
ported across `initbody.js` and `handlers.js`), **the emission wave can draw its
own enemies against the capture's palette and be right**, until the uploader is
ported. That is a real ordering freedom, and it is measured rather than hoped.

This is the first measurement filed under **L14**, which reads `not yet answered`.
It answers only the sprite half, and only for the recorded window.

---

## 5. THE ORDER — the minimum change that takes the recorded enemies off screen

### 5.1 The change, in one place

**`src/web/app.js`, `Demo.draw()`, between the `this.cap.splice(...)` call and
`this.renderer.renderIndexed(st)`:** keep only the display-list records that
`cap.attached()[fi]` names, compact them to the front of `st.spritebuffer`, and
let the next record's already-zero word 4 terminate the list.

Order is forced, not stylistic: `splice` addresses records by their index in the
ORIGINAL list, and `#shipRecord` identifies the ship by its size word among those
same indices. **The strip must run AFTER the splice.**

That is the whole change. `st.bg` (the port's ring), `st.tx` (the HUD), the
palette, the four scroll registers and the shard scheduler are untouched. No asset
is rebuilt.

### 5.2 [M] It works — measured through the real renderer on the real bundle

I loaded `games/ddpdoj/assets/` through the page's own `loadBundle`, rendered all
161 frames twice — once as the page renders them, once with the strip — and
compared palette indexes:

```
  161 frames: display-list records 7,671 -> 886
  changed pixels 1,452,475 of 16,156,672 = 8.99 %
  changed pixels span the whole 448 x 224 buffer (x 2..447, y 0..223)
  per frame: 23..72 records before, 5..6 after
```

The 886 survivors are the eight attached classes and nothing else. **88.5 % of the
recording's display-list records go; the ship, both pods, both exhaust records and
all three ground shadows stay.** No throw, no `AssetError`, no missing stream: the
renderer is entirely content with a six-record list.

### 5.3 [M] Why the strip MUST be in the page and NOT in the exporter

This is the one place where the obvious optimisation is wrong.
`tools/bundlegate.mjs` renders **the published bundle's own capture** and requires
`exact === total` — **100.0000 % pixel-identity to MAME** over at least 100
frames. If `export-web.mjs` stripped the records, that gate would fall from
100.0000 % to roughly 91 % and there would be no honest way to keep it green.

`app.js` is on no gate's path: `bundlegate`, `pixgate` and `webgate` each build
their own `Renderer` and their own `st`. **A strip inside `Demo.draw()` costs zero
gate coverage; a strip inside `export-web.mjs` costs the project its strongest
pixel gate.** Do it in the page.

### 5.4 What it saves, and what it does not

- **Boot does not change** under the minimum version: the bundle is untouched.
- **[M] What the bundle COULD drop afterwards**: once stripped, only **84
  streams** are still read (the eight attached classes across all 161 frames);
  with the 17 ship tilts that is **100 streams, 24.7 KiB gz** against today's
  166 / 39.2 KiB — a **14.5 KiB** boot saving. It is available only after
  `verifyCoverage` and `bundlegate` stop needing the other 66. **A follow-up, not
  the minimum change.**
- **[M] `capture.bin`'s `spritebuffer` part is 32,236 of its 67,494 gzipped
  bytes** — 48 % of the file, for 4,096 of 25,664 bytes per frame. Dropping it
  would take boot from 470.0 KiB to about 431 KiB. **It cannot be dropped yet:**
  the eight surviving records ARE the capture's records — the port does not choose
  their list slots (L1's remaining half) — so the page still needs their template
  bytes (size word, colour, flip, priority, and the pods'/aura's/shadows' own
  animation words). Dropping it means synthesising eight records, which is
  emission's job.

### 5.5 The drift the owner reported, checked as far as this recon can

`39-OWNER` explains "the recorded enemies became off and wrong" as a 161-frame
loop replayed against a 7,317-frame computed scroll, and asks for that to be
RE-CHECKED rather than assumed.

**[M] The mechanism is confirmed present in the code.** `draw()` computes
`fi = (game.logicFrame - seedLf) % cap.length` with `cap.length === 161`, while
the background's motion comes from `game.vram` / `game.video`, which the scroll VM
advances with no reference to `fi`. The sprite layer therefore restarts every 161
logic frames — **2.720 s at 59.185606 Hz** — and the background does not.

**I did not measure the drift RATE against the board.** That needs MAME and is
outside this recon. It stays in §7 deliberately: "expected consequence" is exactly
the shape of explanation this project has been burned by.

### 5.6 The order, for the architect

1. **REMOVAL** (§5.1) — one function in `app.js`, one test, no asset change, no
   gate moves. The screen loses 88.5 % of its display-list records and keeps the
   ship, the pods, the shadows, the background, the HUD and the scroll.
2. **EMISSION** — RECON 1's subject. Nothing in §1's delivery problem blocks it:
   the first seconds' art is tiny (§2.4), the palette is already right (§4.3), and
   the extents already come from the ROM chain (`spritedir.js`, W35).
3. **THE ART, SHARDED** (§2.5 option B) — and only after `ROM_TABLES` /
   `ROM_ANIM_RANGES` are level with the port (§1.3), or the bundle will be missing
   92 streams the emitter asks for.
4. **THE SPRITE PALETTE UPLOADER** (§4) — small, and it may trail emission.

---

## 6. SIZE IT

| piece | bytes | ships with |
|---|---|---|
| **removal** (§5.1) | **0 asset bytes**; ~40 lines in `src/web/app.js` + its test | **alone** |
| shrink the sheet to the 100 survivors (§5.4) | **−14.5 KiB** boot | `verifyCoverage` + `bundlegate` rework |
| drop `capture.bin`'s `spritebuffer` (§5.4) | **−39 KiB** boot (470.0 → ~431) | emission, once the 8 records are synthesised |
| bring `ROM_TABLES`/`ROM_ANIM_RANGES` level with the port (§1.3) | 0 boot; **+151.5 KiB** to the eventual payload | **must precede any ROM-derived sheet** |
| identify `$288D62` and `$25E7B8` (§2.3) | potentially **−420 KiB** off the payload | **before** the sharding wave |
| **a 5-second boot sprite shard** (§2.4) | **26.9 KiB**, i.e. −12.3 KiB against today's sheet | the sharding wave |
| the deferred sprite shards to 120 s | +527 KiB post-boot, competing with 510.2 KiB of BG shards | the sharding wave |
| **the whole ROM-derived sheet at boot** | **+1,153.4 KiB** | rejected |
| the sprite palette block | **+~1 KiB** | trails emission |

**Must ship together:** (a) any ROM-derived sprite sheet and the `ROM_TABLES`
update of §1.3 — a sheet without it is 92 streams short and no existing check
catches that; (b) any sheet change and an extension of `verifyCoverage` that walks
the PORT's emitted records and not only the capture's, which is the only thing
that would turn a short sheet into a message.

**Must NOT ship together:** removal and any bundle change. Removal's entire value
is that it cannot break a gate.

---

## 7. WHAT I COULD NOT DETERMINE

1. **The true stage-1 working set.** Bounded (§1.1), not determined. Blocked on
   the four things W35 §7.2 named, plus the 92-stream gap of §1.3.
2. **What `$288D62` and `$25E7B8` are.** 32 streams, 420 KiB, 35 % of the
   payload, no citation in `ROM_TABLES` (both read `lea (d16,PC)`, which a literal
   scan cannot see). The single highest-value listing read available.
3. **Sprite palette bank 6.** 31 of 32 banks are verbatim ROM runs; bank 6 is
   non-zero and is not one. Either it is assembled at run time, animated, or my
   32-word alignment assumption fails for it.
4. **The sprite palette UPLOADER and its bank-order table.** I located the DATA by
   matching the recording against the ROM — presence by measurement. The routine
   that copies it is unread.
5. **The drift RATE of the recorded enemies against the computed scroll** (§5.5).
   The mechanism is confirmed in the code; the magnitude needs MAME.
6. **Whether the 1,012 unreached ROM-list streams belong to stage 1 or to another
   stage.** Over-inclusion is safe for an atlas and fatal for a coverage claim; no
   coverage claim is made here.
7. **Whether two half-megabyte deferred queues (sprites and BG shards) can share
   one connection** on the schedule §2.4 implies. The BG recon's "25 s of slack,
   tightest deadline 4.3 s" `[cited]` was measured for BG alone.
8. **Anything about the board.** No MAME was run for any number in this document.
9. **Whether the two PORT-RUN figures caught `src/` mid-edit.** They are
   self-consistent (`maxclk 836`, 12,000 frames, no throw, 506 of 506 directory
   entries) and match W35's shape, but a concurrent editor means they should be
   re-derived on a settled tree before anyone builds on them.

---

## 8. WORK LIST FOR THE ARCHITECT

Ordered. Each line names what it changes and what proves it.

**W-A. REMOVAL — the recorded enemies come off. (smallest, do first, alone.)**
Strip `st.spritebuffer` to `cap.attached()[fi]` in `src/web/app.js Demo.draw()`,
after the splice. Report the kept/removed counts on the status line so the page
keeps saying what it is. **NOT in `export-web.mjs`** (§5.3).
*Done when:* a unit test drives the strip over the shipped capture and asserts
7,671 → 886 records and that all eight attached classes survive; `pgm.py check`
unchanged; `webgate.mjs` still renders a non-black frame. A red-validated
mutation: strip BEFORE the splice, and the ship must vanish.
*Ledger:* L1 gains "26 of 30 buckets are now EMPTY rather than recorded"; L4, L10,
L11, L12 gain **REMOVED (empty) — awaiting its producer**. None becomes REPLACED.

**W-B. Two listing reads that are worth a whole wave of size.**
(i) What are `$288D62` and `$25E7B8`? 420 KiB, 35 % of the payload, uncited.
(ii) Bring `ROM_TABLES`/`ROM_ANIM_RANGES` level with the port: 92 streams,
three fixed-stride runs, §1.3.
*Done when:* `w35atlas.mjs rom` covers the port's emitted set N of N, and the two
tables have a `why` or are removed with a reason.

**W-C. The sprite sheet, sharded (§2.5 B, §2.4).**
Boot shard = the first seconds' streams (26.9 KiB for 5 s — *smaller than today's
sheet*); the rest deferred and scheduled off the spawn script's trigger clocks.
Reuse `BgShards` wholesale, including "named, never black". Extend
`verifyCoverage` to walk the PORT's emitted records, not only the capture's — the
only check that can catch a short sheet.
*Blocked by:* W-B(ii).

**W-D. The sprite palette uploader (§4).** Find the sprite analogue of `$2415E8`
and the bank-order table behind the `$40`-strided array at `$2237F8..$2252B8`.
Ship the 1,024 words (~1 KiB). Resolve bank 6.
*Not blocking:* emission may draw against the capture's palette and be correct,
because the sprite palette does not change (§4.3).

**W-E. Boot reclaim, after emission.** Shrink the sheet to the survivors
(−14.5 KiB) and drop `capture.bin`'s `spritebuffer` (−39 KiB) once the eight
player records are synthesised rather than relocated. 470.0 → ~416 KiB.

**And one correction to carry into `PLAN-no-recordings.md` §6 in whichever wave
touches it next:** the plan's risk register should stop saying or implying that
2,035 is a stage-1 census. It is a floor that also over-includes, and both
directions are now measured (§1.3, §1.4).

## LOG (appended as findings arrived)

- opened.
- §0 [M]: reproduced 8,073 and 2,035 from the ROM, and the +1.13 MiB
  independently (39.2 KiB today vs 1,192.6 KiB for the ROM list). **The brief's
  "2,035 is the whole list" is false in both directions**; the port/capture split
  is stale (506/150/63/87/443, not 329/150/53/97/276).
- §1.3 [M]: **the committed ROM list misses 92 of the port's own 506 streams**,
  151.5 KiB of art, mostly two fixed-stride animation runs.
- §2.2 [M]: compression is not a lever — the best gzip-decodable re-encoding saves
  9.7 % and triples memory; brotli saves 19.2 % and the browser cannot inflate it
  through `DecompressionStream`.
- §2.3 [M]: 50 streams are half the payload; two UNCITED tables are 35 % of it.
- §2.4 [M]: a 5-second boot shard is **99 streams, 26.9 KiB** — smaller than the
  39.2 KiB sheet the page ships today. That is the delivery answer.
- §3 [M]: **the HUD is not sprites** — 4 of 220 record keys are static and the
  only frequent one is the null stream, off screen. Removal touches L1 and empties
  L4/L10/L11/L12; nothing else moves.
- §4 [M]: the sprite palette **never changes** over the 161 frames, and 31 of its
  32 banks are verbatim 32-word runs in the 68000 image (a `$40`-strided array
  around `$2237F8..$2252B8`). Method validated on the known BG block at `$227E58`.
- §5 [M]: the strip renders — 7,671 records to 886, 8.99 % of pixels, no throw —
  and it **must live in `app.js`, not in the exporter**, because `bundlegate.mjs`
  demands 100.0000 % pixel-identity from the published bundle.

status: DONE
