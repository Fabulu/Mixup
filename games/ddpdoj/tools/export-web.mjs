#!/usr/bin/env node
// THE ASSET EXPORTER FOR THE PUBLISHED PAGE  (wave 7).
//
//     node games/ddpdoj/tools/export-web.mjs
//
// WHAT PROBLEM THIS SOLVES.  Wave 6's page fetched `rip/` directly: the whole
// IGS023 tile region plus both sprite regions, 58 MiB, plus a 4.0 MiB board
// capture.  That is not a thing anybody serves to a phone, and wave 6 said so
// (`06-impl-pixel-slice.md` §"What I could not do" item 4: "cannot be trimmed
// to what this capture uses without a second measurement").
//
// THIS IS THAT SECOND MEASUREMENT.  The page draws exactly 161 captured frames
// of the `fly-around` scenario, on a loop, with the ship's three display-list
// records moved to the port's own position.  The SPLICE TOUCHES ONLY THE
// POSITION FIELDS (`src/render/capture.js`: word 0 bits 10..0 and word 1 bits
// 9..0) -- never `offs`, never `width`/`height`, never a tile number.  So the
// set of ROM bytes the page can ever read is FIXED by the capture and is
// enumerable exactly:
//
//   * BG tile numbers  = every `bgram[ti*2]`, ti in 0..1023, over 161 frames
//   * TX tile numbers  = every `txram[ti*2]`, ti in 0..2047, over 161 frames
//     (`buildBgMap`/`buildTxMap` decode EVERY map entry, on-screen or not)
//   * sprite streams   = every record `parseSpriteList` returns, over 161
//     frames, walked to count exactly how many mask words and colour words
//     the drawer consumes
//
// Wave 7 measured: 415 BG tiles, 159 TX tiles, 150 distinct sprite streams,
// 11,325 mask words and 21,784 colour words -- out of 8,388,608 and 16,777,216
// respectively.  0.13 % and 0.13 %.
//
// CURRENT, and both numbers moved for reasons later waves wrote down: the atlas
// is **166** streams (W12 added the ship's 16 other bank frames BY ADDRESS,
// because the recorded ship never banked) over **12,900 mask words and 24,794
// colour words**.  W35 changed where the EXTENTS come from -- see its block
// below -- which moved `maskUsed` by exactly 7 words, all of them the null
// stream `$000000`'s, and moved nothing else.
//
// AND THE PROVENANCE OF THE ATLAS IS STILL THE RECORDING, WHICH IS THE POINT
// W28 §6 MADE: 150 of the 166 exist because they appeared in a 161-frame
// capture. `tools/w35atlas.mjs` enumerates the same thing from the cartridge --
// **1,150 streams for stage 1** out of the ROM's own **8,073** -- and
// `docs/worklog/ddpdoj/35-recon-sprite-atlas.md` §7 states what it would cost to
// ship that list instead.
//
// AND THE OUTPUT IS NOT A SLICE OF THE CARTRIDGE.
//   * the tiles are DECODED -- 5bpp LSB-first bitstream -> one byte per pixel,
//     and 4bpp packed-lsb -> one byte per pixel.  Same transformation
//     `games/gradius/assets/chr/tiles.u8` is.
//   * the sprite streams are RE-BASED into a compact 16-bit address space:
//     each stream's two-word header is REWRITTEN to point at its colour data's
//     new address, and every display-list record in the capture has its `offs`
//     field rewritten to the new base.  The published `spr/mask.u16` is a
//     different address space from the cartridge's, and `capture.bin` is
//     rewritten to match it.
// Neither file is a contiguous slice of any ROM, and `tools/build-dist.mjs`'s
// leak guard is left exactly as it is.
//
// The gate that says this bundle is CORRECT and not merely small is
// `tools/bundlegate.mjs`: the demo path, run off the BUNDLE, compared to MAME's
// own framebuffers.  It must stay at 15955968/15955968, and its `--break`
// modes must go red.
//
// ------------------------------------------------------------------- WAVE 14
// THE WHOLE STAGE-1 BACKGROUND, AND WHY THE COVERAGE PASS ABOVE IS NO LONGER
// THE WHOLE ANSWER.
//
// Wave 13 gave the port the scroll VM, so `$900000` is now written by the
// CARTRIDGE's own column stream and the camera walks all 8,486 px of stage 1.
// The set of BG tiles the page can ask for is therefore NO LONGER bounded by
// the recording: it is bounded by the MAP, and the map wants 1,820 tiles where
// the 161-frame capture flew over 415.  Past the recording's 160 px the sheet
// had nothing and the screen went BLACK, silently, which is the report this
// wave came out of.
//
// So this file now exports the background from the LAYOUT DATA rather than from
// the recording (`docs/worklog/ddpdoj/20-recon-level-data.md`):
//
//   $225B78  224 scrolling map columns, 9 longwords each (tile:u16, attr:u16),
//            tile base $0AA9 added to the WHOLE longword by $240D86
//   $227AF8  a SECOND, SEPARATE 23-column map with tile base $32A9, painted in
//            one shot by object type $1C's handler $26C20C -- 23 of the 24
//            columns `20-recon-scroll-engine.md` §9.3 called unreachable.  They
//            are not unreachable, they are a second map with a different tile
//            base, and a port that ships only the scrolling columns renders a
//            hole where a background structure should be.
//   $227E58  2,048 B of palette: 32 banks x 32 xRGB555, which is what the
//            renderer's `(attr & $3e) >> 1` indexes
//
// AND IT SHARDS THE TILE SHEET, because 1,820 decoded tiles is 653 KiB gzipped
// and nobody waits for that before the first frame.  Eight shards: seven of 32
// map columns each (0..223) and an eighth holding the second map.  The shards
// are DISJOINT BY CONSTRUCTION -- a tile is assigned to the FIRST shard whose
// columns use it -- which costs almost nothing here because the DoJ background
// is a painted strip and not a tile set: 88.4 % of stage 1's tiles appear in
// exactly one map column (recon §2).  BOOT LOADS SHARDS 0 AND 1 ONLY; the rest
// are queued from boot and promoted by the scroll position the VM already
// computes (`src/web/assets.js`, `src/web/app.js`).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Capture } from '../src/render/capture.js';
import { parseSpriteList, BUFFER_STRIDE } from '../src/render/spritelist.js';
import {
  IGS023_LAYOUT, IGS023_SIZE, SPRCOL_LAYOUT, SPRCOL_SIZE,
  SPRMASK_LAYOUT, SPRMASK_SIZE, assemble, assertLittleEndianHost,
} from '../src/render/regions.js';
import { bgTile, txTile, BG_W, BG_H, TX_W, TX_H } from '../src/render/tiles.js';
import { streamExtent } from '../src/render/spritedir.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');

const BG_TILE_BYTES = BG_W * BG_H;      // 1024, decoded
const TX_TILE_BYTES = TX_W * TX_H;      // 64, decoded

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const RIP = arg('rip', path.join(GAME, 'rip'));
const OUT = arg('out', path.join(GAME, 'assets'));

// ---------------------------------------------------------------------------
// the cartridge side

function need(p, how) {
  if (!fs.existsSync(p)) {
    throw new Error(`${p} is missing. ${how}`);
  }
  return p;
}

console.log(`reading  ${RIP}`);
const romDir = need(path.join(RIP, 'rom'),
  'Run: python games/ddpdoj/tools/assets.py extract');
const webDir = need(path.join(RIP, 'web'),
  'Run: python games/ddpdoj/tools/oracle/pgm.py pixdemo');
const tablesFile = need(path.join(RIP, 'port', 'player.tables.json'),
  'Run: python games/ddpdoj/tools/export-tables.py');
// WAVE 14.  The DECRYPTED 68000 image -- the same file `tools/export-tables.py`
// and every recon tool reads.  The stage's map columns, its second map and its
// palette block are 68000 DATA, not tile ROM, so they come from here.
const cpuFile = need(path.join(GAME, 'tools', 'oracle', 'out', 'maincpu.bin'),
  'Run: python games/ddpdoj/tools/oracle/derive.py');

assertLittleEndianHost();
const readRom = (n) => new Uint8Array(fs.readFileSync(path.join(romDir, n)));
const igs023 = assemble(readRom, IGS023_LAYOUT, IGS023_SIZE);
const sprmaskBytes = assemble(readRom, SPRMASK_LAYOUT, SPRMASK_SIZE);
const sprcolBytes = assemble(readRom, SPRCOL_LAYOUT, SPRCOL_SIZE);
const sprmask = new Uint16Array(sprmaskBytes.buffer, 0, SPRMASK_SIZE / 2);
const sprcol = new Uint16Array(sprcolBytes.buffer, 0, SPRCOL_SIZE / 2);
const MASKW = sprmask.length, COLW = sprcol.length;

const capJson = JSON.parse(fs.readFileSync(path.join(webDir, 'capture.json'), 'utf8'));
const capBin = new Uint8Array(fs.readFileSync(path.join(webDir, 'capture.bin')));
const cap = new Capture(capJson, capBin);
const seed = new Uint8Array(fs.readFileSync(path.join(webDir, 'seed.bin')));
const tables = fs.readFileSync(tablesFile);

// ------------------------------------------------------------------- WAVE 47
// THE SPRITE SHEET IS SHARDED, AND THE ENEMY BODY TABLES ARE HARVESTED BY
// ADDRESS.  (enemy layer E2 -- docs/worklog/ddpdoj/47-impl-E2-art.md)
//
// THE REPORT THIS CAME OUT OF.  The owner loaded the page after W44 and saw
// "lots of turrets running around targetting you... without tank bodies".
// `46-diag-orphan-turrets.md` measured the cause and this file is the whole of
// the fix: enemy type $11 -- 104 of stage 1's 339 spawn records -- draws its
// HULL from `$268B9E` indexed by HEADING and its TURRET from `$268C9E` indexed
// by FACING, and **the 161-frame recording this atlas was harvested from swept
// every FACING (the turret tracks the player) and only ever used two of the 64
// HEADINGS (the tanks all drove one way)**.  So 32 of 32 turret images shipped
// and 2 of 64 hull images did, and a tank has a body only while it is driving
// on heading 44 or 45.
//
// [M] W47, 6,185 logic frames from the shipped seed, nothing pressed: the hull
// table's records are **55,574 of the 154,831 records the page could not draw --
// 35.9 % of every miss in the port's longest run.**  The art is 27.1 KiB gz.
//
// SO THE HARVEST BELOW IS BY ROM ADDRESS -- exactly the mechanism the ship's 17
// tilts already use (§WAVE 12) -- and it takes each table to its FULL EXTENT out
// of the cartridge rather than to the entries some recording happened to index.
// That is `docs/knowledge/09`: the ROM is the inventory.
//
// AND THE EXTENTS ARE THE TRAP.  `src/handlers.js` called both type-$11 tables
// "16-direction"; [M] they are 64 and 32 LONGWORDS.  Every extent below is
// pinned by CODE and re-checked here (`checkTableExtent`), because a harvest
// sized off a comment would ship a quarter of the hull art and leave the owner's
// bug exactly where it is.
//
// AND BOOT MUST NOT GET SLOWER (HANDOVER §8.8).  So the sheet becomes SHARDS
// over ONE packed address space: shard 0 is what the bundle already shipped,
// and the harvest is DEFERRED, queued from boot and promoted by the page's own
// miss guard the moment a record asks for it.  A record whose shard has not
// landed is SKIPPED AND NAMED -- "named, never black", the contract
// `src/web/assets.js BgShards` already has and `bundlegate --break shard-404`
// already red-validates.
//
// The harvest tables, each with the code that pins its extent:
//
//   $268B9E  64  type $11 HULL, by HEADING.  $2689A0 builds
//                `d1 = (($1A,A6) & $3E) << 2`, which reaches $F8, and $2689B4
//                adds 4 on the mirror bit -> entries 0..63.  Pinned from below
//                by $268C9E being the next table.
//   $268C9E  32  type $11 TURRET, by FACING ($268A46's ((($33,A5)+1) & $3E)*2).
//                ALL 32 ARE ALREADY IN THE SHEET; it is listed so the pair is
//                enumerated in one place and so the assertion covers both.
//   $269E48  32  the damage-first family's heading table ($269E20 lea).
//   $269BB6   4  the same family's `anim4` ($269B64).  All 4 already shipped.
//   $272E7A  32  type $89's body, $27740E `andi.w #$3E,D1 / add.w D1,D1`.
//   $26990E  70  type $31's animation, 8 bytes per entry.  THE EXTENT IS THE
//                HANDLER'S OWN WRAP: phase 2 frees the record at cursor $230 and
//                `$26990E + $230 == $269B3E`, which is the shared draw block --
//                i.e. instructions.  [M] 70 entries, 70 distinct streams.
//                (46-diag §6 priced this at 24 entries / 37.3 KiB and §10.2 said
//                it had not found the end; it is 70 / 116.7 KiB.)
//   $2970D8  16  type $24's own table.  $2970D4 is the handler's last
//                instruction and $297118 is the next init stub, so both ends are
//                pinned by code.  `handlers.js:2454` reads it.
//
//   and the LASER's five streams (W45), which are needed on the FIRST HELD
//   FRAME and are therefore in the BOOT shard, not a deferred one.
//
// WHAT IS DELIBERATELY NOT HARVESTED: `$268594`, enemy type $10's 96-entry
// table (90 missing, 51.8 KiB).  [M] no ported code reads it -- `grep 268594
// games/ddpdoj/src/` is empty -- and the 6,185-frame run emitted 0 of its 96
// streams.  It is in `tools/w35atlas.mjs ROM_TABLES` and it belongs to a handler
// that does not exist yet.  Named rather than silently omitted.

// A TABLE'S EXTENT IS A CLAIM, AND EACH ONE IS PINNED TWICE.
//
//   `entries` -- what the HANDLER can reach, from its own index arithmetic or
//                its own wrap constant.  This is what is harvested.
//   `runsTo`  -- how many consecutive valid stream starts the CARTRIDGE holds
//                from that base, [M] measured, asserted on every build, and
//                usually LARGER because the next table follows immediately.
//   `endsAt`  -- where that run stops, and what is there.
//
// The two numbers together are what makes this non-vacuous: `entries` alone
// could be any wrong number and still export something plausible, and `runsTo`
// alone would over-harvest into the neighbouring table.  `$269E48` is the case
// that proves the point -- [M] its run is 64, but the second 32 are `FAM.bucket`
// ($269EC8), which are BUCKET longs that merely happen to look like stream
// starts, and the index `(d1 & $3E) * 2` cannot reach them.
//
/** `[shard, base, entries, byteStride, runsTo, endsAt, why]` */
const HARVEST = Object.freeze([
  // the LASER's five streams are IMMEDIATES, not a table -- see LASER_STREAMS.
  [1, 0x268b9e, 64, 4, 96, 0x268d1e,
    'type $11 HULL by HEADING ($2689BC). Entries: $2689A0 builds '
    + '`d1 = (($1A,A6) & $3E) << 2`, which reaches $F8, and $2689B4 adds 4 on '
    + 'the mirror bit -> 0..63. The run of 96 is this table PLUS the turret '
    + 'table below, which begins at $268B9E+$100 = $268C9E -- that adjacency is '
    + 'what pins this table from below. THE OWNER\'S BUG: [M] 55,574 of 154,831 '
    + 'missed records in a 6,185-frame run, 35.9 % of every miss'],
  [1, 0x268c9e, 32, 4, 32, 0x268d1e,
    'type $11 TURRET by FACING ($268A72), index $268A46 `((($33,A5)+1) & $3E)*2` '
    + '-> $7C -> 32. ALREADY SHIPPED IN FULL; harvested by name so the pair is '
    + 'enumerated in one place and so $268B9E\'s end is pinned by a table this '
    + 'file knows about rather than by a comment'],
  [2, 0x272e7a, 32, 4, 96, 0x272ffa,
    'type $89 body. $27740E `andi.w #$3E,D1 / add.w D1,D1` -> $7C -> 32 '
    + '(initbody.js:608, handlers.js:1999). The run continues 64 entries past '
    + 'the end into a table nobody has named; the INDEX is what stops the '
    + 'harvest, and over-harvesting there would ship 64 streams no code can '
    + 'reach. [M] first needed lf4938'],
  [3, 0x269e48, 32, 4, 64, 0x269f48,
    'the damage-first family\'s heading table, $269E20 lea, index $269E26 '
    + '`(d1 & $3E) * 2` -> $7C -> 32. The run of 64 walks straight on into '
    + 'FAM.bucket ($269EC8), whose longs are BUCKET values, and stops exactly at '
    + 'FAM.muzzle ($269F48). [M] first needed lf6426'],
  [3, 0x269bb6, 4, 4, 4, 0x269bc6,
    'the same family\'s anim4, $269B64, ($20,A5) cycling 0/4/8/$C -> 4. '
    + 'ALREADY SHIPPED IN FULL. Here the run and the index agree exactly'],
  [4, 0x2970d8, 16, 4, 16, 0x297118,
    'type $24 ($2970BA / handlers.js:2454). $2970D4 is the handler\'s last '
    + 'instruction and $297118 is the next init stub, so BOTH ends are pinned by '
    + 'code -- and [M] the run stops at $297118 too. [M] first needed lf7834'],
  [5, 0x26990e, 70, 8, 70, 0x269b3e,
    'type $31\'s animation, 8 bytes per entry. The extent is the HANDLER\'S OWN '
    + 'WRAP: phase 2 frees the record when the cursor reaches $230, and '
    + '$26990E+$230 == $269B3E, which is the damage-first family\'s shared draw '
    + 'block -- instructions. [M] the run stops there too, at 70. '
    + '(46-diag §6 priced 24 entries / 37.3 KiB and §10.2 said it had not found '
    + 'the end; it is 70 / 116.7 KiB.) [M] first needed lf8106, and it is 116.7 '
    + 'KiB for 120 records in the whole run -- hence the LAST shard'],
]);

/** W45's beam art: the pod muzzle `$24C906` forces onto `($a,A6)` and four of
 *  the ten segment images at `$24ACE8`.  `45-impl-laser-beam.md` §6 measured
 *  that not one of them is in the 166-stream sheet, so every beam record is a
 *  named skip.
 *
 *  THEY GO IN SHARD 1, NOT IN THE BOOT SHARD, and that is a decision rather than
 *  an oversight.  They are only 1.1 KiB, and the player CAN hold fire on frame
 *  one -- but putting them in shard 0 shifts every packed base behind them,
 *  which rewrites `capture.bin` and therefore moves the bytes
 *  `tools/bundlegate.mjs` proves pixel-identical to MAME.  Keeping shard 0
 *  byte-for-byte what the bundle already shipped is worth more than 1.1 KiB of
 *  latency on a beam that is a named skip for the second or two shard 1 takes.
 *  Shard 1 is the FIRST deferred fetch for exactly this reason. */
const LASER_STREAMS = Object.freeze([0x01302c, 0x013098, 0x065354, 0x011e8c,
  0x013b94]);
const LASER_SHARD = 1;

/** Shard metadata.  `boot` is awaited by `loadBundle`; the rest are queued from
 *  boot and promoted by the page's miss guard. */
const SPR_SHARDS = Object.freeze([
  [0, 'boot', 'the recording\'s 150 streams + the ship\'s 17 tilts (W12). '
    + 'BYTE-IDENTICAL to what shipped before W47.'],
  [1, 'type11', 'type $11\'s hull $268B9E + turret $268C9E, and the laser\'s 5 '
    + '(W45). The owner\'s missing tank bodies.'],
  [2, 'type89', 'type $89\'s body table $272E7A'],
  [3, 'family', 'the damage-first family, $269E48 + $269BB6'],
  [4, 'type24', 'type $24\'s table $2970D8'],
  [5, 'type31', 'type $31\'s 70-frame animation $26990E'],
]);
const SPR_BOOT = [0];

// ---------------------------------------------------------------------------
// 1. COVERAGE.  What can this capture possibly make the renderer read?

const bgUsed = new Set(), txUsed = new Set();
/** offs -> {maskWords, colStart, colWords, stride, pixels} , from the ROM */
const streams = new Map();
/** offs -> sprite shard index.  FIRST shard wins, exactly as the BG sheet's
 *  `shardOfTile` does, so the shards are disjoint by construction. */
const shardOfStream = new Map();
let records = 0;

// ------------------------------------------------------------------- WAVE 35
// THE EXTENTS NOW COME OUT OF THE MASK ROM, NOT OUT OF THE RECORDING.
//
// Until this wave a stream's extent was `2 + record.width * record.height`,
// i.e. it was read off the display-list record that drew it -- and the only
// records this file has are `capture.bin`'s.  So the published sheet's SIZES
// had the recording as their provenance, which is half of what W28 §6 named as
// the thing gating deleting the capture.
//
// `src/render/spritedir.js` derives them from the cartridge instead: the mask
// ROM is a closed chain (stride = wide*high + 4, closed by each stream's own
// colour pointer), and `streamExtent` solves it at one address.
//
// The two readings are cross-checked against each other below rather than one
// replacing the other silently, because a stream's ROM length is an UPPER bound
// on what any record may read, not an identity: a record with smaller extents
// legitimately draws a prefix.  `$000000` -- the null pointer the recording
// draws as 1x1 -- is the one stream where they differ, and it differs the safe
// way round.
const romExtent = (offs) => streamExtent(sprmask, COLW, offs & (MASKW - 1));
let extentAgree = 0, extentPrefix = 0;

/** The record's reading, kept ONLY to check the ROM's. `SpriteDrawer` consumes
 *  `wide` mask words per SOURCE line and always walks `high` source lines (a
 *  ygrow-doubled line REWINDS and replays; a yzoom-dropped line is consumed
 *  without being drawn), so a record reads `2 + wide*high` words. */
function checkAgainstRecord(offs, wide, high, w) {
  const need = wide * high;
  if (need > w.stride - 4) {
    throw new Error(`stream $${offs.toString(16)}: a display-list record reads `
      + `${need} mask words but the ROM chain gives this stream only `
      + `${w.stride - 4}. Either src/render/spritedir.js has mis-solved the `
      + 'chain or the record is not pointing at a stream start -- either way '
      + 'the sheet would be SHORT, so this stops.');
  }
  if (need === w.stride - 4) extentAgree++; else extentPrefix++;
}

for (let i = 0; i < cap.length; i++) {
  const st = cap.state(i);
  for (let t = 0; t < 64 * 16; t++) bgUsed.add(st.bg[t * 2]);
  for (let t = 0; t < 64 * 32; t++) txUsed.add(st.tx[t * 2]);
  for (const s of parseSpriteList(st.spritebuffer, BUFFER_STRIDE)) {
    records++;
    // `draw()` returns before touching a single ROM word when either extent is
    // zero, so such a record needs no data at all -- but it still needs a legal
    // `offs`, because the field is rewritten below.
    let w = streams.get(s.offs);
    if (!w) { w = romExtent(s.offs); streams.set(s.offs, w); shardOfStream.set(s.offs, 0); }
    checkAgainstRecord(s.offs, s.width, s.height, w);
  }
}

// ------------------------------------------------------------------- WAVE 12
// THE SEVENTEEN SHIP IMAGES -- and the reason the ship has never banked.
//
// `render/capture.js` wrote this down and left it for a later wave: the port
// DOES compute the tilt and DOES compute the tilt-indexed animation long
// ($25533A -> $255362, `vectors.js` anim()), those longs ARE display-list words
// 2-3, "and what stops it is that export-web.mjs RE-BASES every sprite stream
// into a packed 16-bit space and does not ship the map".
//
// The map cannot be built from the capture, and that is the whole problem: the
// recorded ship never moved on the short axis (`frameList[].px` is 5312 on all
// 161 frames), so its tilt was 0 throughout and exactly ONE of the seventeen
// streams -- $1520 -- appears in the coverage pass above.  The other sixteen are
// not in the packed sheet, so there is nothing for a rebased map to point at.
//
// So they are HARVESTED HERE, by address, out of the same sprite ROMs every
// other stream comes from.  The addresses are the ROM's own table (exported by
// tools/export-tables.py, read the way $249E5A reads it) and the extents are the
// ship record's ($e,A6), MEASURED $0620 = 3 x 32 on every one of the 2,233 drawn
// frames of fly-around -- not a guess, and it is asserted below against the one
// stream the capture does contain.
const SHIP_SIZE = 0x0620;                   // MEASURED ($e,A6) on $8103E6
const shipWide = (SHIP_SIZE >> 9) & 0x3f;   // spritelist.js: width bits 14..9
const shipHigh = SHIP_SIZE & 0x1ff;         // ...height bits 8..0
const shipTable = JSON.parse(tables.toString('utf8')).anim;
const shipOffs = shipTable.a.shipSel0.map(([hi, lo]) => ((hi & 0x7f) << 16) | lo);
if (shipOffs.length !== 17) {
  throw new Error(`the $25533A ship animation table has ${shipOffs.length} tilt `
    + 'entries, not 17 -- re-run tools/export-tables.py');
}
//
// WAVE 35.  The harvest no longer needs `SHIP_SIZE` to know how much to take --
// `romExtent` reads that off the chain.  The constant is kept and CHECKED, which
// turns a measured number into a number the cartridge agrees with: all 17 tilt
// images must be exactly `3 x 32` streams.
let shipHarvested = 0;
for (const offs of shipOffs) {
  const w = romExtent(offs);
  if (w.stride - 4 !== shipWide * shipHigh) {
    throw new Error(`ship tilt stream $${offs.toString(16)}: the ROM chain says `
      + `${w.stride - 4} mask words, the MEASURED ($e,A6) = $0620 says `
      + `${shipWide} x ${shipHigh} = ${shipWide * shipHigh}. One of the two is `
      + 'wrong and neither may be assumed.');
  }
  if (!streams.has(offs)) {
    streams.set(offs, w); shardOfStream.set(offs, 0); shipHarvested++;
  }
}

// ------------------------------------------------------------------- WAVE 47
// 1a. THE ENEMY BODY TABLES AND THE LASER, HARVESTED BY ADDRESS.
//
// The cartridge is the inventory.  Every table is taken to its FULL extent (see
// the HARVEST block's header for what pins each one) and every entry is put
// through `romExtent`, which throws `SpriteDirError` unless the address is a
// real stream start in the mask ROM's own chain -- so a wrong base, a wrong
// stride or a wrong entry count stops here instead of shipping a short sheet.
const cpuBytes = new Uint8Array(fs.readFileSync(cpuFile));
const romBe32 = (a) => (((cpuBytes[a] << 24) | (cpuBytes[a + 1] << 16)
  | (cpuBytes[a + 2] << 8) | cpuBytes[a + 3]) >>> 0);

/** THE END OF A TABLE IS A CLAIM AND IT IS CHECKED.  Every extent in `HARVEST`
 *  is pinned by code in the listing; this asserts the cartridge agrees, from the
 *  other side: entry `n-1` must be a stream start and entry `n` must NOT be.
 *  A table that ran one entry further would ship art indexed by nothing; one
 *  that stopped one entry short is the owner's bug all over again. */
function checkTableExtent(base, n, stride, runsTo, endsAt, why) {
  const isStart = (a) => {
    const v = romBe32(a) & 0x7fffff;
    if (v === 0 || (romBe32(a) >>> 24) !== 0) return false;
    try { streamExtent(sprmask, COLW, v & (MASKW - 1)); return true; } catch { return false; }
  };
  if (n > runsTo) {
    throw new Error(`sprite table $${base.toString(16)} claims ${n} entries but `
      + `its run of valid stream starts is stated as only ${runsTo}. (${why})`);
  }
  let run = 0;
  while (isStart(base + run * stride) && run <= runsTo + 8) run++;
  if (run !== runsTo || base + run * stride !== endsAt) {
    throw new Error(`sprite table $${base.toString(16)} stride ${stride}: the `
      + `cartridge's run of consecutive stream starts is ${run}, ending at `
      + `$${(base + run * stride).toString(16)}; this file says ${runsTo} ending `
      + `at $${endsAt.toString(16)}. One of the two has moved, and a harvest `
      + `sized off the wrong one ships the wrong art. (${why})`);
  }
}

let harvested = 0, harvestAlready = 0;
const harvestReport = [];
for (const [shard, base, n, stride, runsTo, endsAt, why] of HARVEST) {
  checkTableExtent(base, n, stride, runsTo, endsAt, why);
  let added = 0, already = 0;
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const offs = romBe32(base + i * stride) & 0x7fffff;
    seen.add(offs);
    if (streams.has(offs)) { already++; continue; }
    streams.set(offs, romExtent(offs));    // throws unless it is a stream start
    shardOfStream.set(offs, shard);
    added++;
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard, base, entries: n, stride, runsTo, endsAt,
    distinct: seen.size, added, already, why });
}
for (const offs of LASER_STREAMS) {
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, LASER_SHARD);
  harvested++;
}

const bgList = [...bgUsed].sort((a, b) => a - b);
const txList = [...txUsed].sort((a, b) => a - b);
console.log(`coverage over ${cap.length} captured frames, ${records} records:`);
console.log(`  BG tiles ${bgList.length}   TX tiles ${txList.length}   `
  + `sprite streams ${streams.size} (${shipHarvested} of them the ship's own `
  + `bank frames, harvested by address because the recorded ship never banked)`);
console.log(`  sprite EXTENTS from the ROM chain (src/render/spritedir.js): `
  + `${extentAgree} records match their stream's full length exactly, `
  + `${extentPrefix} read a prefix of it`);

// ------------------------------------------------------------------- WAVE 14
// 1b. THE STAGE-1 LAYOUT, out of the 68000 image.
//
// The capture bounds the SPRITES and the TX layer.  It does not bound the
// BACKGROUND any more -- the map does.  Every address here is a measured one
// from `20-recon-level-data.md` §0/§1/§3b; every one of the checks below fails
// loudly if it is wrong, and several of them were seen to fail while this was
// being written (see the worklog's RED table).

const cpu = cpuBytes;              // WAVE 47 read it above, for the harvest
const be16 = (a) => (cpu[a] << 8) | cpu[a + 1];
const be32 = (a) => (((cpu[a] << 24) | (cpu[a + 1] << 16)
  | (cpu[a + 2] << 8) | cpu[a + 3]) >>> 0);

/** stage 1 = stage index 0.  `w20level.py tables`, and $2611D6/$2611B2. */
const STAGE1 = Object.freeze({
  cols: 0x225b78,      // $2611D6's column-stream pointer for stage 0
  ncols: 224,          // columns the scroll VM reaches -- MEASURED, 224 of 248
  tileBase: 0x0aa9,    // $240D62[0] >> 16, added to the WHOLE longword
  smap: 0x227af8,      // $26C220 lea $227AF8,A1 -- the SECOND map
  nsmap: 23,           // $26C23C moveq #$16,D6 -> 23 columns
  smapBase: 0x32a9,    // $26C244 addi.l #$32A90000,D4
  pal: 0x227e58,       // $2611B2's palette pointer for stage 0
  palWords: 1024,      // 2,048 B = 32 banks x 32 xRGB555
});
const COL_BYTES = 36;                    // 9 longwords, $26135A's `dbra D6`, D6=8
const COL_ROWS = 9;

/** One map: `[ [tile, attr] x 9 ] x n`, with the per-stage base already added. */
function decodeMap(at, n, base) {
  const out = [];
  for (let c = 0; c < n; c++) {
    const col = [];
    for (let r = 0; r < COL_ROWS; r++) {
      const v = be32(at + c * COL_BYTES + r * 4);
      // $240D88 `add.l D2,D4` with D2 = base<<16: the tile number is the high
      // word plus the base and the attribute word rides through untouched.
      col.push([((v >>> 16) + base) & 0xffff, v & 0xffff]);
    }
    out.push(col);
  }
  return out;
}

const stageMap = decodeMap(STAGE1.cols, STAGE1.ncols, STAGE1.tileBase);
const secondMap = decodeMap(STAGE1.smap, STAGE1.nsmap, STAGE1.smapBase);

// CHECK 1 -- the attribute word.  Recon §1b: no BG map entry in the whole game
// sets a flip bit ($C0) or any bit outside $3E; the attribute is a pure 5-bit
// palette-bank select.  A wrong stride, a wrong base or a swapped tile/attr
// half turns this into noise, so it is the cheapest way to catch all three.
{
  const bad = [];
  for (const map of [stageMap, secondMap]) {
    for (const col of map) for (const [, a] of col) if (a & ~0x3e) bad.push(a);
  }
  if (bad.length) {
    throw new Error(`${bad.length} BG map attribute words have a bit outside `
      + `$3E (first $${bad[0].toString(16)}). Recon §1b measured ZERO in all `
      + '8,142 entries of all five stages -- so the column stride, the tile '
      + 'base or the tile/attr halves are being read wrongly.');
  }
}

const mapTiles = new Set();
for (const col of stageMap) for (const [t] of col) mapTiles.add(t);
const smapTiles = new Set();
for (const col of secondMap) for (const [t] of col) smapTiles.add(t);

// CHECK 2 -- the counts and the ranges the recon measured.
{
  const lo = Math.min(...mapTiles), hi = Math.max(...mapTiles);
  if (mapTiles.size !== 1820 || lo !== 0x0aa9 || hi !== 0x11c6) {
    throw new Error(`stage 1's 224 columns hold ${mapTiles.size} distinct tiles `
      + `$${lo.toString(16)}..$${hi.toString(16)}; recon §1/§2 measured 1,820 `
      + 'in $0AA9..$11C6. The stream bound or the tile base has moved.');
  }
  const slo = Math.min(...smapTiles), shi = Math.max(...smapTiles);
  if (smapTiles.size !== 205 || slo !== 0x32a9 || shi !== 0x3381) {
    throw new Error(`the second map holds ${smapTiles.size} distinct tiles `
      + `$${slo.toString(16)}..$${shi.toString(16)}; recon §3b measured 205 in `
      + '$32A9..$3381.');
  }
}

// THE PALETTE BLOCK.  Big-endian xRGB555 -- and bit 15 is the check, because a
// block of map entries read as colours has bit 15 set on a third of its words
// and a byte-swapped read scatters them.  Recon §1a measured 0 of 1024.
const bgPal = new Uint16Array(STAGE1.palWords);
for (let i = 0; i < STAGE1.palWords; i++) bgPal[i] = be16(STAGE1.pal + i * 2);
{
  const set = [...bgPal].filter((w) => w & 0x8000).length;
  if (set !== 0) {
    throw new Error(`${set} of ${STAGE1.palWords} words at $227E58 have bit 15 `
      + 'set. xRGB555 never does; recon §1a measured 0. This is not the palette '
      + 'block, or it is not being read big-endian.');
  }
}
// ...and the block against the BOARD.  $2415E8 uploads it into palette RAM
// $400..$7FF once per stage, so the capture's own palette IS this block plus
// whatever the game animates on top of it.  This is the check that says the
// ADDRESS is right rather than merely plausible: a wrong one drops it to ~370.
let palAgree = 0;
{
  const p = cap.part(0, 'palette');
  for (let i = 0; i < STAGE1.palWords; i++) if (p[0x400 + i] === bgPal[i]) palAgree++;
  if (palAgree < 1000) {
    throw new Error(`the $227E58 palette block agrees with the board's own `
      + `palette RAM $400..$7FF on only ${palAgree} of ${STAGE1.palWords} `
      + 'entries at capture frame 0. Wave 14 measured 1020 (the other four are '
      + 'bank 21 pens 0..3, which the game animates). This block is not what '
      + '$2415E8 uploads.');
  }
}

// ---------------------------------------------------------------------------
// 2. THE TILE SHEETS.
//
// TX: one sheet, from the capture, unchanged -- it is the HUD and it does not
// scroll with the stage.
//
// BG: EIGHT SHARDS.  Shard s in 0..6 is map columns [32s, 32s+32); shard 7 is
// the second map.  A tile is assigned to the FIRST shard that uses it, so the
// shards are disjoint by construction and the shard holding a tile is always
// the earliest one that needs it.  Slots are contiguous across shards in shard
// order, so ONE `bg.tileno.u16` describes every slot and the loader can build
// its tile->slot table before a single shard body has arrived.
const BG_SHARDS = 8;
const SMAP_SHARD = 7;
const BOOT_SHARDS = [0, 1];
const SHARD_COLS = 32;

/** tile number -> shard index, first use wins. */
const shardOfTile = new Map();
for (let s = 0; s < SMAP_SHARD; s++) {
  for (let c = s * SHARD_COLS; c < Math.min((s + 1) * SHARD_COLS, STAGE1.ncols); c++) {
    for (const [t] of stageMap[c]) if (!shardOfTile.has(t)) shardOfTile.set(t, s);
  }
}
for (const t of smapTiles) if (!shardOfTile.has(t)) shardOfTile.set(t, SMAP_SHARD);

// THE CAPTURE'S OWN TILES ARE NOT NEGOTIABLE.  `verifyCoverage` throws at load
// for any BG tile the recording uses and the sheet lacks, and that check must
// keep working from the BOOT shards alone -- the page draws capture frame 0
// before shard 2 has been asked for.  Measured: 414 of the capture's 415 tiles
// are in columns 0..63, and the 415th is tile $0000, which is the value
// $23C668's ring clear leaves behind and which no map column ever names.
const bootSet = new Set(BOOT_SHARDS);
const captureExtras = bgList.filter((t) => !bootSet.has(shardOfTile.get(t)));
for (const t of captureExtras) {
  if (shardOfTile.has(t)) {
    throw new Error(`the capture uses BG tile $${t.toString(16)}, which the map `
      + `puts in shard ${shardOfTile.get(t)} -- outside the boot set `
      + `[${BOOT_SHARDS}]. The boot bundle cannot satisfy verifyCoverage.`);
  }
  shardOfTile.set(t, 0);         // no map column names it: it belongs to boot
}
if (captureExtras.length > 32) {
  throw new Error(`${captureExtras.length} of the capture's ${bgList.length} BG `
    + 'tiles are named by no stage-1 map column. Wave 14 measured exactly one '
    + '(tile $0000, the ring clear). That many means the capture is not of '
    + 'stage 1, or the map is being decoded wrongly.');
}

const shardTiles = [];
for (let s = 0; s < BG_SHARDS; s++) shardTiles.push([]);
for (const [t, s] of shardOfTile) shardTiles[s].push(t);
for (const list of shardTiles) list.sort((a, b) => a - b);

const bgSlotNo = [];
const shardMeta = [];
for (let s = 0; s < BG_SHARDS; s++) {
  const firstSlot = bgSlotNo.length;
  for (const t of shardTiles[s]) bgSlotNo.push(t);
  shardMeta.push({
    i: s,
    kind: s === SMAP_SHARD ? 'secondmap' : 'scroll',
    cols: s === SMAP_SHARD ? null : [s * SHARD_COLS,
      Math.min((s + 1) * SHARD_COLS, STAGE1.ncols) - 1],
    firstSlot,
    tiles: shardTiles[s].length,
  });
}
const bgNo = Uint16Array.from(bgSlotNo);
if (new Set(bgSlotNo).size !== bgSlotNo.length) {
  throw new Error('the BG shards are not disjoint -- a tile is in two of them, '
    + 'so `bg.tileno.u16`\'s slot mapping is ambiguous');
}

/** Decoded pixels for one shard, in slot order. */
const shardPixels = shardTiles.map((list) => {
  const buf = new Uint8Array(list.length * BG_TILE_BYTES);
  list.forEach((n, i) => {
    if (n > 0xffff) throw new Error(`BG tile number ${n} does not fit a u16`);
    bgTile({ igs023 }, n, buf.subarray(i * BG_TILE_BYTES, (i + 1) * BG_TILE_BYTES));
  });
  return buf;
});

// THE REGION-ASSEMBLY GATE.  `cave_t04401w064.u19` loads at 0x180000 and
// SHADOWS the top of `pgm_t01s.rom`; at 0x200000 it would not, and every tile
// index above 0xC000 would shift.  Wave 3 measured that mutation at 52.86 % of
// pixels still correct -- it renders a PLAUSIBLE background.  This asserts the
// two facts a wrong base breaks: the region is the size regions.js says, and
// the highest tile any shard names has all 5,120 of its bits inside it.
// `tools/bgstrip.py --check --break u19` is the pixel-level form of the same
// check and is the one that was seen red.
{
  const hi = bgSlotNo[bgSlotNo.length - 1];
  const need = Math.ceil(((hi + 1) * BG_W * BG_H * 5) / 8);
  if (igs023.length !== IGS023_SIZE || need > igs023.length) {
    throw new Error(`the assembled igs023 region is ${igs023.length} B and tile `
      + `$${hi.toString(16)} needs ${need} B of it; regions.js says `
      + `${IGS023_SIZE}. cave_t04401w064.u19 must load at 0x180000, where it `
      + 'SHADOWS the top of pgm_t01s.rom -- 0x200000 shifts every tile index '
      + 'above 0xC000 and still draws a plausible picture.');
  }
}

// THE MAP the second-map shard is for.  The 224 SCROLLING columns need no file:
// the port reads them out of the ROM window `player.tables.json` already
// carries ($225B78, $22E0 B, which spans the second map too) and writes them
// into $900000 itself.  The second map's PAINTER ($26C20C, object type $1C) is
// unported, so its 207 entries are shipped DECODED here for the wave that ports
// it -- and named in the manifest so nobody has to re-derive the $32A9 base.
const smapPairs = new Uint16Array(STAGE1.nsmap * COL_ROWS * 2);
{
  let k = 0;
  for (const col of secondMap) for (const [t, a] of col) { smapPairs[k++] = t; smapPairs[k++] = a; }
}

const txSheet = new Uint8Array(txList.length * TX_TILE_BYTES);
const txNo = new Uint16Array(txList.length);
txList.forEach((n, i) => {
  if (n > 0xffff) throw new Error(`TX tile number ${n} does not fit a u16`);
  txNo[i] = n;
  txTile({ igs023 }, n, txSheet.subarray(i * TX_TILE_BYTES, (i + 1) * TX_TILE_BYTES));
});

// ---------------------------------------------------------------------------
// 3. THE SPRITE STREAMS, RE-BASED.
//
// Coalesce the used word ranges first, THEN assign new bases per coalesced
// block, so streams that share colour data keep sharing it.  Each stream's own
// mask block is disjoint from every other's (asserted below), which is what
// makes rewriting its header safe.

function coalesce(ranges) {
  const r = ranges.filter(([, len]) => len > 0)
    .map(([s, len]) => [s, s + len]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of r) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// WAVE 47: PER SHARD, IN SHARD ORDER, INTO ONE ADDRESS SPACE.  Each shard owns
// a CONTIGUOUS run of the packed mask array and a contiguous run of the packed
// colour array, so the page can allocate both at full size at boot and drop each
// shard's words into place as it arrives -- and so "which shard is this stream
// in" is a range test on the packed base rather than a fourth manifest field.
//
// Coalescing is INSIDE a shard, never across one.  Two streams that share
// colour data and land in different shards therefore get one copy each; that is
// a few duplicated words in exchange for shards that are independently loadable,
// and it is the same trade `shardOfTile` makes for the background.
const shardStreams = SPR_SHARDS.map(() => []);
for (const [offs, w] of streams) shardStreams[shardOfStream.get(offs)].push([offs, w]);

const maskBlocksBy = shardStreams.map((list) =>
  coalesce(list.map(([offs, w]) => [offs & (MASKW - 1), w.maskWords])));
const colBlocksBy = shardStreams.map((list) =>
  coalesce(list.map(([, w]) => [w.colStart, w.colWords])));

// One mask block per stream, starting exactly at that stream's `offs`. If this
// ever fails the header rewrite below could corrupt another sprite's mask data,
// so it is an ERROR and not a warning.  (It holds because the mask chain's
// stride is `wide*high + 4` and a stream's own extent is `stride - 2`, so
// consecutive streams are always two words apart -- W35's `spritedir.js`.)
const nonEmptyStreams = [...streams.entries()].filter(([, w]) => w.maskWords > 2
  || w.colWords > 0);
const maskBlockCount = maskBlocksBy.reduce((t, b) => t + b.length, 0);
if (maskBlockCount !== nonEmptyStreams.length) {
  throw new Error(`${nonEmptyStreams.length} sprite streams coalesced into `
    + `${maskBlockCount} mask blocks -- two streams overlap, and rewriting `
    + 'one\'s header would corrupt the other\'s mask data. Ship the streams at '
    + 'their cartridge addresses instead of re-basing them.');
}

const words = (blocks) => blocks.reduce((t, [s, e]) => t + (e - s), 0);
const pow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

/** Pack every shard's blocks into one power-of-two buffer, in shard order.
 *  Returns the buffer, a PER-SHARD remap table and a per-shard `[from, len]`
 *  span -- the span is what becomes a file and what the manifest publishes. */
function pack(blocksBy, src) {
  const total = blocksBy.reduce((t, b) => t + words(b), 0);
  const size = Math.max(2, pow2(total));
  const buf = new Uint16Array(size);
  const maps = [], spans = [];
  let at = 0;
  for (const blocks of blocksBy) {
    const from = at;
    const map = [];      // [oldStart, oldEnd, newStart]
    for (const [s, e] of blocks) {
      for (let k = s; k < e; k++) buf[at + (k - s)] = src[k & (src.length - 1)];
      map.push([s, e, at]);
      at += e - s;
    }
    maps.push(map);
    spans.push([from, at - from]);
  }
  return { buf, maps, spans, used: total };
}

const packedMask = pack(maskBlocksBy, sprmask);
const packedCol = pack(colBlocksBy, sprcol);

const remapIn = (map, addr) => {
  for (const [s, e, at] of map) if (addr >= s && addr < e) return at + (addr - s);
  return -1;
};

/** old `offs` -> new `offs`, and the header rewritten to the new colour base. */
const offsMap = new Map();
for (const [offs, w] of streams) {
  const sh = shardOfStream.get(offs);
  const old = offs & (MASKW - 1);
  // THE LOOKUP IS IN THIS STREAM'S OWN SHARD'S MAP, not in a global one. A
  // colour range shared by two streams in different shards exists twice, and a
  // global search would point one of them at the OTHER shard's copy -- i.e. at
  // words that are still zero until that shard lands.
  let nb = remapIn(packedMask.maps[sh], old);
  if (nb < 0) {
    // A stream that is never read (zero width or height in every occurrence).
    // It still needs an `offs` inside the packed space so a mis-parse cannot
    // wrap into somebody else's data.
    nb = 0;
  } else if (w.colWords > 0) {
    const na = remapIn(packedCol.maps[sh], w.colStart);
    if (na < 0) throw new Error(`colour base ${w.colStart} is not in any block`);
    // `a = ((mask[o+1] << 16) | mask[o]) >>> 2`, inverted. The two bits the
    // shift discards are written as zero: the decoder cannot see them, and
    // that is one more way this file is not the cartridge's bytes.
    packedMask.buf[nb] = (na << 2) & 0xffff;
    packedMask.buf[nb + 1] = ((na << 2) >>> 16) & 0xffff;
  }
  // WAVE 47 RAISED THIS FROM 16 BITS TO 23, WHICH IS THE HARDWARE'S OWN WIDTH.
  // A display-list record carries `offs` as word 2 bits 6..0 (bits 22..16) and
  // word 3 (bits 15..0), and both the capture rewrite below and
  // `Capture.splice`/`portSpriteList` have always written the high 7 bits
  // correctly.  Only the ASSERTION assumed they were zero -- true while the
  // packed space was one 32,768-word sheet and false the moment the harvest
  // pushed it past 65,536.
  if (nb > 0x7fffff) {
    throw new Error(`packed mask base ${nb} exceeds the 23 bits a display-list `
      + 'record can carry (word 2 bits 6..0 : word 3)');
  }
  offsMap.set(offs, nb);
}

// ---------------------------------------------------------------------------
// 4. THE CAPTURE, with every record's `offs` rewritten to the packed space.
//
// Big-endian u16 on disk (`beWords`). Word 2 bits 6..0 are `offs` bits 22..16
// and word 3 is bits 15..0; every other bit of word 2 (flip, colour, pri, and
// bit 15 which the DMA mask drops) is preserved byte for byte.

const outBin = capBin.slice();
const [sprOff, sprLen] = cap.offsets.spritebuffer;
let rewritten = 0;
for (let i = 0; i < cap.length; i++) {
  const base = i * cap.frameBytes + sprOff;
  const view = outBin.subarray(base, base + sprLen);
  for (let r = 0; r < 256; r++) {
    const b = r * BUFFER_STRIDE * 2;
    if (b + 10 > view.length) break;
    const w4 = (view[b + 8] << 8) | view[b + 9];
    if ((w4 & 0x7fff) === 0) break;                       // the terminator
    const w2 = (view[b + 4] << 8) | view[b + 5];
    const w3 = (view[b + 6] << 8) | view[b + 7];
    const offs = ((w2 & 0x007f) << 16) | w3;
    const nb = offsMap.get(offs);
    if (nb === undefined) throw new Error(`record ${r} of frame ${i} has offs `
      + `$${offs.toString(16)}, which the coverage pass never saw`);
    const nw2 = (w2 & ~0x007f) | ((nb >>> 16) & 0x7f);
    view[b + 4] = (nw2 >> 8) & 0xff; view[b + 5] = nw2 & 0xff;
    view[b + 6] = (nb >> 8) & 0xff; view[b + 7] = nb & 0xff;
    rewritten++;
  }
}
if (rewritten !== records) {
  throw new Error(`rewrote ${rewritten} records but the coverage pass counted `
    + `${records} -- the two walks disagree about where the list ends`);
}

// ---------------------------------------------------------------------------
// 5. WRITE.  Every binary is gzipped; the page inflates with the platform's own
// DecompressionStream. The capture is 161 nearly-identical frames of video
// state and compresses 61:1, which is the difference between a 4.0 MiB fetch
// and a 66 KiB one.

// ===========================================================================
// W34.  THIS `rmSync` USED TO TAKE THE WHOLE OF `assets/`, AND THAT IS THE
// MECHANISM FOUR WAVES COULD NOT FIND.
//
// `movement.test.js`'s W24 stream inventory started SKIPPING in W29 and skipped
// again in W31, W32, W33 and W34, every time with the same message: its
// gitignored input `assets/w24-movement/stage1-streams.json` was absent.  W29
// and W31 attributed it to "a concurrent `pgm.py check`"; W32 grepped
// `games/ddpdoj/tools/` for a remover and reported finding none; W33 said the
// mechanism was still unidentified.
//
// It is this line.  `OUT` is `games/ddpdoj/assets`, `w24streams.py` writes
// `games/ddpdoj/assets/w24-movement/`, and `pgm.py check` runs this exporter --
// so every gate run deleted the dump and the very next unit-test run skipped.
// MEASURED this wave: the suite was 516/0/0, `node tools/export-web.mjs` ran,
// and the directory was gone.
//
// The clean rebuild is still right for what this tool OWNS.  It now removes
// exactly that -- `gfx/`, `spr/`, and the top-level FILES -- and leaves any
// other subdirectory alone.
for (const d of ['gfx', 'spr']) {
  fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
}
if (fs.existsSync(OUT)) {
  for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (e.isFile()) fs.rmSync(path.join(OUT, e.name), { force: true });
  }
}
fs.mkdirSync(path.join(OUT, 'gfx'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'spr'), { recursive: true });
// In the same breath as the directory, per the standing rule. The repo root's
// .gitignore already matches an unanchored `assets/`; this is the belt to that
// pair of braces, and it is what games/ddpdoj/rip/ does too.
fs.writeFileSync(path.join(OUT, '.gitignore'), '*\n');

const written = [];
function put(rel, bytes, { gz = true } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body = gz ? zlib.gzipSync(raw, { level: 9 }) : raw;
  const p = path.join(OUT, gz ? `${rel}.gz` : rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  written.push([gz ? `${rel}.gz` : rel, body.length, raw.length]);
}

for (let s = 0; s < BG_SHARDS; s++) put(`gfx/bg.shard${s}.tiles.u8`, shardPixels[s]);
put('gfx/bg.tileno.u16', bgNo);
put('gfx/bg.pal.u16', bgPal);
put('gfx/bg.smap.u16', smapPairs);
put('gfx/tx.tiles.u8', txSheet);
put('gfx/tx.tileno.u16', txNo);
// WAVE 47.  One file per shard per array, each a CONTIGUOUS slice of the packed
// buffer.  Shard 0's slice holds exactly the words the single `spr/mask.u16`
// held before this wave (it is packed first and its blocks are unchanged), minus
// the power-of-two padding, which is why boot does not grow.
const sprMeta = [];
for (const [i, kind, why] of SPR_SHARDS) {
  const [mFrom, mLen] = packedMask.spans[i];
  const [cFrom, cLen] = packedCol.spans[i];
  put(`spr/mask.shard${i}.u16`, packedMask.buf.subarray(mFrom, mFrom + mLen));
  put(`spr/col.shard${i}.u16`, packedCol.buf.subarray(cFrom, cFrom + cLen));
  sprMeta.push({
    i, kind, why, streams: shardStreams[i].length,
    maskFrom: mFrom, maskLen: mLen, colFrom: cFrom, colLen: cLen,
  });
}
put('capture.bin', outBin);
put('seed.bin', seed);
// WAVE 14.  These two were the last uncompressed bodies in the bundle -- 121 KB
// and 38 KB of JSON, 159 KB of the 408 KB the page used to fetch.  Adding the
// whole stage's background put the BOOT figure over what the page loads today,
// and the owner's constraint is that boot must not get slower.  Gzipping the
// two JSON blobs gives that back with room to spare and changes nothing about
// their content: the loader inflates them through the same DecompressionStream
// every other body already goes through.  `manifest.json` stays PLAIN because
// it is what says how everything else is encoded.
put('player.tables.json', tables);

// WAVE 47 -- THE STREAM TABLE MOVED OUT OF THE MANIFEST AND INTO A TYPED ARRAY,
// AND THAT IS A BOOT NUMBER.
//
// `manifest.json` is the one body served UNCOMPRESSED -- it is what says how
// everything else is encoded -- so every byte of it is a BOOT byte.  W44
// measured the third array element at +2,160 B rather than +1,119 because
// `JSON.stringify(manifest, null, 1)` puts EVERY array element on its own
// indented line: ~13 B of whitespace per number.  This wave more than doubles
// the stream count (166 -> 378), and [M] as pretty JSON that list alone is
// 11,922 B and even compacted onto one line it is 7,007 B.
//
// [M] AS A `Uint32Array` IT IS 4,536 B RAW AND 1,912 B GZIPPED.  A thousand
// integers belong in a typed array, not in JSON; the manifest keeps the
// STRUCTURE (shard ranges, the harvest ledger) and the numbers ship as numbers.
// `src/web/assets.js` inflates it through the same `DecompressionStream` as
// everything else and materialises it back onto `manifest.spr.streams`, so
// every existing reader -- `verifyCoverage`, `romToPackedMap`, `bundlegate` --
// sees exactly the array it always saw.
const sprStreamList = [...streams.entries()]
  .map(([offs, w]) => [offs, offsMap.get(offs), w.maskWords])
  .filter(([, , n]) => n > 2)
  .sort((a, b) => a[1] - b[1]);
const sprStreamU32 = Uint32Array.from(sprStreamList.flat());
put('spr/streams.u32', sprStreamU32);

const manifest = {
  note: 'Generated by games/ddpdoj/tools/export-web.mjs. Nothing here is '
    + 'committed: assets/ is gitignored. Regenerate from your own cartridge.',
  game: 'ddpdoj', set: 'ddpdojblk', build: 'B',
  scenario: capJson.scenario,
  frames: cap.length,
  // Every binary above is gzip; `src/webassets.js` inflates with
  // DecompressionStream and REFUSES to run without it rather than serving a
  // zero-filled sheet that renders a plausible empty starfield.
  encoding: 'gzip',
  gfx: {
    // WAVE 14 -- the BG sheet is SHARDED and covers the WHOLE stage, not the
    // recording.  `tiles` is every slot in `bg.tileno.u16`; `shards[s]` says
    // which contiguous run of those slots lives in `bg.shard<s>.tiles.u8`.
    bg: {
      tiles: bgNo.length, tileBytes: BG_TILE_BYTES, w: BG_W, h: BG_H, bpp: 5,
      stage: 1, stageIndex: 0,
      map: {
        cols: `$${STAGE1.cols.toString(16).toUpperCase()}`, ncols: STAGE1.ncols,
        colBytes: COL_BYTES, rows: COL_ROWS,
        tileBase: `$${STAGE1.tileBase.toString(16).toUpperCase()}`,
        note: 'The 224 SCROLLING columns are NOT a file: the port reads them '
          + 'out of player.tables.json\'s $225B78 ROM window the way $26135A '
          + 'reads them and writes $900000 itself. This block is here so the '
          + 'shard boundaries can be checked against the same numbers.',
      },
      secondMap: {
        at: `$${STAGE1.smap.toString(16).toUpperCase()}`, ncols: STAGE1.nsmap,
        tileBase: `$${STAGE1.smapBase.toString(16).toUpperCase()}`,
        entries: STAGE1.nsmap * COL_ROWS,
        file: 'gfx/bg.smap.u16.gz',
        painter: '$26C20C (object type $1C, init $26C1C2) -- 23x9 columns into '
          + 'ring columns 47.. (or 41 when $803926 is 0), every frame it lives',
        note: 'DECODED (tile, attr) pairs with $32A9 ALREADY ADDED, column '
          + 'major, 9 rows per column. THE PAINTER IS UNPORTED: nothing in this '
          + 'bundle draws these yet, and shard 7 therefore ships pixels no '
          + 'frame currently asks for. What spawns type $1C is named-not-found '
          + '(recon §8.5).',
      },
      palette: {
        at: `$${STAGE1.pal.toString(16).toUpperCase()}`,
        words: STAGE1.palWords, banks: 32, perBank: 32,
        file: 'gfx/bg.pal.u16.gz',
        agreesWithBoard: palAgree,
        note: 'xRGB555, big-endian in the 68000 image, what $2415E8 uploads '
          + 'into palette RAM $400..$7FF. It agrees with the board\'s own '
          + `palette on ${palAgree} of ${STAGE1.palWords} entries at capture `
          + 'frame 0; the four that differ are bank 21 pens 0..3, which the '
          + 'game ANIMATES through an unported routine. THE PAGE STILL DRAWS '
          + 'WITH THE CAPTURE\'S PALETTE for that reason -- this block is '
          + 'shipped, checked at load, and not yet used.',
      },
      shards: shardMeta,
      boot: BOOT_SHARDS,
      captureExtras,
      note: 'DECODED, one byte per pixel, exactly the transformation '
        + 'src/render/tiles.js bgTile() performs. Slot i holds tile number '
        + 'bg.tileno.u16[i]; slots [firstSlot, firstSlot+tiles) come from '
        + 'gfx/bg.shard<i>.tiles.u8.gz. Shards are DISJOINT: a tile lives in '
        + 'the FIRST shard whose map columns use it. `boot` is the set the page '
        + 'must have before frame 1; the rest are queued from boot and promoted '
        + 'by the scroll VM\'s own column cursor. `captureExtras` are tiles the '
        + 'RECORDING uses that no map column names -- they are folded into '
        + 'shard 0 so verifyCoverage is satisfiable at boot.',
    },
    tx: { tiles: txList.length, tileBytes: TX_TILE_BYTES, w: TX_W, h: TX_H, bpp: 4 },
  },
  spr: {
    maskWords: packedMask.buf.length, maskUsed: packedMask.used,
    colWords: packedCol.buf.length, colUsed: packedCol.used,
    // Every stream base that is legal in the packed space, so a record that
    // points outside one is caught at boot instead of drawing noise.
    //
    // WAVE 44 (enemy layer E1) KEEPS THE ROM KEY.  Until this wave the triple
    // below was a PAIR -- `[packedBase, maskWords]` -- and the cartridge address
    // `offsMap` is keyed on was computed here and thrown away on this very line.
    // That discarded number is the whole of the remap the page needs: the PORT's
    // own display list at $800000 carries CARTRIDGE stream addresses in words 2
    // and 3, and 301 of the 302 it emits index the packed mask array at
    // `offs & (16384-1)` and draw somebody else's picture if they are not
    // translated (40-recon-emission-path.md §4 step 2, measured).
    //
    // So the entry is now `[romOffs, packedBase, maskWords]` and
    // `src/web/app.js portSpriteList()` builds `romOffs -> packedBase` out of
    // it.  MEASURED, this wave, and it is NOT the number the plan predicted:
    // `spr.streams` 1,706 -> 2,825 COMPACT JSON bytes, but manifest.json goes
    // 10,112 -> 12,272 B = **+2,160 B**, not +1,119.  `JSON.stringify(manifest,
    // null, 1)` writes this file PRETTY, so a third array element costs a whole
    // indented line per stream, not a comma and a number.  (43-plan §3.1(a)
    // predicted +1,328 B by measuring the compact delta and applying it to the
    // pretty file.  Same decision, 832 B more.)  Boot 470.0 -> 472.1 KiB.
    //
    // AND WHAT DOES NOT CHANGE, VERIFIED BY HASHING ALL 21 FILES BOTH WAYS:
    // NOT ONE .gz asset moves a byte.  The packed arrays, the rewritten
    // capture.bin and therefore every pixel `tools/bundlegate.mjs` compares are
    // exactly what they were -- this line adds a KEY, it does not re-base
    // anything.
    //
    // The filter is on maskWords, i.e. on the THIRD field now.  A stream of 2
    // words or fewer is a header with no mask data; it cannot legally be drawn
    // and must not be a lookup key on either side.
    //
    // WAVE 47 DID NOT ADD A FOURTH FIELD, deliberately.  Which SHARD a stream is
    // in is decided by which shard's packed mask range its `packedBase` falls
    // in (`shards[].maskFrom/maskLen`), so the page can answer "which shard is
    // this" for a stream whose shard has not arrived -- the same property
    // `BgShards.shardOfTile` has -- without a per-stream field, and the triples
    // keep the shape `verifyCoverage` and `romToPackedMap` already read.
    //
    // AND THE TRIPLES THEMSELVES ARE NOT IN THIS FILE ANY MORE.  They are
    // `spr/streams.u32.gz`, a flat `Uint32Array` of `streamCount` x 3, and the
    // loader materialises them onto `manifest.spr.streams` before anything reads
    // it.  See the block above this object for the measurement that decided it.
    streamCount: sprStreamList.length,
    streamsFile: 'spr/streams.u32.gz',
    // WAVE 47 -- THE SHARDS.  `shards[i]` owns `mask[maskFrom, maskFrom+maskLen)`
    // and `col[colFrom, colFrom+colLen)`; the page allocates both arrays at full
    // size at boot and drops each shard's words in as it lands.  `boot` is the
    // set `loadBundle` awaits.
    shards: sprMeta,
    boot: SPR_BOOT,
    // THE HARVEST LEDGER, SHORT ON PURPOSE.  `manifest.json` is the one body
    // served UNCOMPRESSED and it is BOOT BYTES, so the reasoning behind every
    // extent lives in this file's HARVEST table (which a reader has to open
    // anyway to change it) and only the numbers ship. [M] the full prose cost
    // 3.6 KiB of boot.
    harvest: harvestReport.map((h) => ({
      shard: h.shard, at: `$${h.base.toString(16).toUpperCase()}`,
      entries: h.entries, stride: h.stride, distinct: h.distinct,
      runsTo: h.runsTo, endsAt: `$${h.endsAt.toString(16).toUpperCase()}`,
      added: h.added, already: h.already,
    })),
    laser: LASER_STREAMS.map((o) => `$${o.toString(16).toUpperCase().padStart(6, '0')}`),
    notHarvested: '$268594 (enemy type $10, 90 absent, 51.8 KiB): no ported '
      + 'code reads it and 0 of its 96 streams were emitted in 6,185 frames. '
      + 'See export-web.mjs.',
    note: 'RE-BASED into a compact 16-bit address space: headers rewritten to '
      + 'the packed colour addresses, and every capture.bin record\'s offs '
      + 'field rewritten to match. Array lengths are powers of two because '
      + 'SpriteDrawer indexes with & (len-1). Each entry is [romOffs, '
      + 'packedBase, maskWords]: romOffs is the CARTRIDGE word offset the '
      + 'board\'s own display list carries, and the page remaps the port\'s '
      + '$800000 list through it (src/web/app.js portSpriteList). WAVE 47: the '
      + 'streams are SHARDED -- see `shards` -- and `harvest` says which ROM '
      + 'table each deferred shard came from.',
  },
  // WAVE 12 -- THE ONE FIELD THAT MAKES THE SHIP BANK.  `render/capture.js`
  // named this as "a one-field change to the exporter and a later wave's job";
  // this is the field.  `pairs[i]` is the packed-space (word2, word3) the port
  // must write into display-list words 2 and 3 for tilt `tiltMin + i*tiltStep`,
  // i.e. the rebased form of the ROM long `$255362[tilt]` that `$249E62` writes
  // into ($a,A6).  Without it the port's ROM-space longs cannot be translated
  // into the bundle's address space and the ship is drawn with one image
  // forever, which is what the owner reported.
  ship: {
    rom: '$25533A -> $255362', reads: '$249E62 move.l (A0,D0.w),($a,A6)',
    tiltMin: shipTable.tiltMin, tiltStep: shipTable.tiltStep,
    size: SHIP_SIZE, wide: shipWide, high: shipHigh,
    pairs: shipOffs.map((o) => {
      const nb = offsMap.get(o);
      if (nb === undefined) {
        throw new Error(`ship stream $${o.toString(16)} was harvested but not `
          + 'rebased -- the packer and the harvest disagree');
      }
      // The capture stores word 2 bits 6..0 as `offs` bits 22..16 and word 3 as
      // bits 15..0.  W47: the packed space outgrew 16 bits, so the high 7 are
      // emitted rather than assumed zero -- `Capture.splice` has always written
      // them (`(word2 & $FF80) | pair[0]`).  All 17 tilts are in the BOOT shard,
      // which is packed first, so in practice pair[0] is still 0; it is computed
      // rather than hardcoded so that stops being a silent dependency.
      return [(nb >>> 16) & 0x7f, nb & 0xffff];
    }),
    note: 'PACKED-SPACE (word2Low7, word3) per tilt step, 17 entries. The ROM '
      + 'longs these came from are NOT usable directly: export-web.mjs re-bases '
      + 'every stream. 16 of the 17 do not appear in capture.bin at all -- the '
      + 'recorded ship never banked -- and were harvested from the sprite ROMs '
      + 'by address.',
  },
  capture: { layout: capJson.layout, frameBytes: capJson.frameBytes },
  romsUsed: [...IGS023_LAYOUT, ...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT].map(([n]) => n),
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
put('capture.json', new TextEncoder().encode(JSON.stringify({
  ...capJson,
  note: `${capJson.note} -- REBASED for the published bundle by `
    + 'games/ddpdoj/tools/export-web.mjs: every record\'s sprite offs field '
    + 'points into the packed sprite space assets/spr/mask.shard*.u16 assemble, '
    + 'not into the cartridge.',
  rebased: true,
})));

// WAVE 14 -- THE BOOT FIGURE, which is the number the owner asked for.  A file
// is "deferred" if the page does not need it before the first frame: that is
// exactly the non-boot BG shards.  Everything else is boot.
const DEFERRED = new Set();
for (let s = 0; s < BG_SHARDS; s++) {
  if (!BOOT_SHARDS.includes(s)) DEFERRED.add(`gfx/bg.shard${s}.tiles.u8.gz`);
}
// WAVE 47: and the non-boot SPRITE shards, for the same reason.
for (const [i] of SPR_SHARDS) {
  if (!SPR_BOOT.includes(i)) {
    DEFERRED.add(`spr/mask.shard${i}.u16.gz`);
    DEFERRED.add(`spr/col.shard${i}.u16.gz`);
  }
}

let total = 0, boot = 0;
for (const [name, gz, raw] of written) {
  total += gz;
  if (!DEFERRED.has(name)) boot += gz;
  console.log(`  ${name.padEnd(28)} ${String(gz).padStart(9)} B`
    + (gz === raw ? '' : `  (from ${raw} B)`)
    + (DEFERRED.has(name) ? '   [deferred]' : ''));
}
{
  const n = fs.statSync(path.join(OUT, 'manifest.json')).size;
  total += n; boot += n;
  console.log(`  ${'manifest.json'.padEnd(28)} ${String(n).padStart(9)} B`);
}
console.log(`BUNDLE ${OUT}: ${(total / 1024).toFixed(1)} KiB total, `
  + `${(boot / 1024).toFixed(1)} KiB BEFORE THE FIRST FRAME `
  + `(shards ${BOOT_SHARDS.join('+')}), `
  + `${((total - boot) / 1024).toFixed(1)} KiB deferred`);
console.log('  BG shards, gz:');
for (let s = 0; s < BG_SHARDS; s++) {
  const [, gz] = written.find(([n]) => n === `gfx/bg.shard${s}.tiles.u8.gz`);
  const m = shardMeta[s];
  console.log(`    ${s} ${m.kind.padEnd(9)} `
    + `${m.cols ? `cols ${String(m.cols[0]).padStart(3)}..${String(m.cols[1]).padStart(3)}` : 'second map    '}`
    + `  ${String(m.tiles).padStart(4)} tiles  ${String(gz).padStart(7)} B `
    + `= ${(gz / 1024).toFixed(1)} KiB${BOOT_SHARDS.includes(s) ? '  BOOT' : ''}`);
}
// WAVE 47 -- the sprite shards and the harvest, printed so the size of what was
// added is visible on every build rather than only in a worklog.
console.log(`  SPRITE STREAMS ${streams.size} (${harvested} harvested by ROM `
  + `address this wave, ${harvestAlready} of the harvest already present), `
  + 'shards, gz:');
for (const m of sprMeta) {
  const mg = written.find(([n]) => n === `spr/mask.shard${m.i}.u16.gz`)[1];
  const cg = written.find(([n]) => n === `spr/col.shard${m.i}.u16.gz`)[1];
  console.log(`    ${m.i} ${m.kind.padEnd(7)} ${String(m.streams).padStart(3)} `
    + `streams  mask ${String(mg).padStart(6)} + col ${String(cg).padStart(6)} `
    + `= ${((mg + cg) / 1024).toFixed(1)} KiB`
    + `${SPR_BOOT.includes(m.i) ? '  BOOT' : '  [deferred]'}`);
}
for (const h of harvestReport) {
  console.log(`    <- $${h.base.toString(16).toUpperCase()} ${String(h.entries).padStart(3)} `
    + `entries stride ${h.stride}: ${String(h.added).padStart(3)} new, `
    + `${String(h.already).padStart(3)} already in the sheet -> shard ${h.shard}`);
}
