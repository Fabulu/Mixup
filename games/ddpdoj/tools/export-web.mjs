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
import { streamExtent, walkDirectory } from '../src/render/spritedir.js';
// W86: the art harvest for the background elements is derived from the PORT's
// own handler table, not from a second copy of it. See (1g) below.
import { BGELEM_HANDLERS } from '../src/background.js';
import { TYPE84_ART, TYPE8D_ART, TYPE8F_ART, TYPE90_ART, TYPE91_ART, TYPE92_ART,
  TYPE93_ART, TYPE94_ART, TYPE95_ART, TYPE96_ART, TYPE97_ART,
  TYPE3E_ART, TYPE36_ART, TYPE37_ART, TYPE38_FAMILY_ART,
  TYPE3C_ART, TYPE3B_ART } from '../src/handlers.js';
import { parseScoreGroups, scoreToJson } from '../src/bgmscore.js';
import { driverParamsToJson } from '../src/driverparams.js';

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
// WAVE 27D -- the parsed form is needed to read the ICS sample windows the
// Python exporter measured (tables.sound.sampleWindows). `tables` itself stays
// the raw buffer so put('player.tables.json', tables) writes it byte-for-byte.
const tablesJson = JSON.parse(tables);

// W158 -- owner-approved complete static ICS sample union. W157 derives 228
// intervals from all 69 live SFX descriptors and all 159 score-reachable BGM
// descriptors in every live command form, then merges them to 6 non-contiguous
// u17 fragments. Captures
// only validate this inventory. pgm_m01s has zero reachable witnesses.
const SOUND = tablesJson.sound;
const u17 = readRom(SOUND.rom);
if (u17.length !== SOUND.fileSize) {
  throw new Error(`${SOUND.rom} is ${u17.length} B, expected ${SOUND.fileSize} `
    + '(0x400000). The ICS sample ROM must be 4 MiB.');
}

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
//   $269EC8  32  THE SAME FAMILY'S SECOND DRAW ARM ($269B8C -> $23DF58).  W84.
//                This block used to say these longs were BUCKET values; they
//                are art, and the board's own display list draws them.
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
// WAVE 81 CLOSED THE ONE DEFERRAL THIS BLOCK NAMED.  `$268594` used to be here
// under "WHAT IS DELIBERATELY NOT HARVESTED: enemy type $10's 96-entry table
// (90 missing, 51.8 KiB); no ported code reads it".  It is harvested now -- as
// TWO tables, not one -- and `src/handlers.js` reads both.  See §WAVE 81.

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
// that proves the point -- [M] its run is 64 and only the first 32 are reachable
// through its own index `(d1 & $3E) * 2`.
//
// **AND IT IS ALSO THE CASE THAT PROVES THE OTHER HALF, WHICH THIS BLOCK GOT
// WRONG FOR FORTY WAVES.**  "The index cannot reach them" is a statement about
// ONE lea.  It is not a statement about the ART, and this block used it as one:
// the second 32 ($269EC8) are read by a DIFFERENT lea ($269E32) into ($2C,A5)
// and drawn by a DIFFERENT emitter ($269B8C -> $23DF58), so they were dismissed
// here as bucket values that only resembled stream starts, and left out of the
// sheet.  [M] The board draws them.  A run of valid stream starts that
// no INDEX reaches still has to be asked WHICH INDEX -- every lea in the
// handler, not the one the row is written under.
//
/** `[shard, base, entries, byteStride, runsTo, endsAt, why]` */
const HARVEST = Object.freeze([
  [17, TYPE3B_ART.hullTable, TYPE3B_ART.hullFrames + 1, 4,
    30, 0x265348,
    'stage-3 type $3B hull animation plus its fixed satellite. The handler '
      + 'reaches the first 17 pointers; the valid stream-shaped run continues '
      + 'through 13 adjacent pointers owned by unreachable local code'],
  [17, TYPE37_ART.table, TYPE37_ART.frames, 4,
    TYPE37_ART.frames, 0x264b86,
    'stage-3 type $37 rotating body. Rounded heading selects one of 32 groups '
      + 'and the four-phase animation reaches exactly 128 pointers before the '
      + 'packed muzzle-vector table begins'],
  [17, 0x289eaa, 4, 4, 36, 0x289f3a,
    'pool-C kind-4 death satellite animation list 0; the valid stream run '
      + 'continues through adjacent pool-C families'],
  [17, 0x289eba, 4, 4, 32, 0x289f3a,
    'pool-C kind-4 death satellite animation list 1; the valid run continues '
      + 'through the byte-identical third list and adjacent pool-C families'],
  [17, 0x289eca, 4, 4, 28, 0x289f3a,
    'pool-C kind-4 death satellite animation list 2, duplicating list 1; the '
      + 'remaining valid-pointer run belongs to adjacent pool-C families'],
  [17, TYPE36_ART.upperTable, TYPE36_ART.headings, 4,
    192, 0x272ffa,
    'stage-3 type $36 upper attachments. Heading is rounded to one of 32 '
      + 'entries; the valid stream run continues through adjacent families'],
  [17, TYPE3E_ART.table, TYPE3E_ART.frames, 4,
    TYPE3E_ART.frames, 0x265798,
    'stage-3 type $3E heading/mirror animation. The heading selects each even '
      + 'pointer and record +$28 selects its adjacent mirror frame, reaching '
      + 'all 64 longwords before the next type stub at $265798'],
  // W198. Stage-3 types $12, $13, and $14 each use stride-4 pointer tables.
  // The two adjacent pairs have a longer valid-pointer run, but each row owns
  // only the entries its handler indexes. All 60 pointers are distinct and
  // belong to the existing deferred late-family shard 17.
  [17, 0x26d2c6, 8, 4, 8, 0x26d2e6,
    'stage-3 type $12 sprite table 0, eight stride-4 pointers'],
  [17, 0x26d362, 8, 4, 16, 0x26d3a2,
    'stage-3 type $12 sprite table 1, eight indexed pointers in a 16-entry '
      + 'valid run shared with the adjacent table'],
  [17, 0x26d382, 8, 4, 8, 0x26d3a2,
    'stage-3 type $12 sprite table 2, eight stride-4 pointers'],
  [17, 0x26d3fe, 8, 4, 16, 0x26d43e,
    'stage-3 type $12 sprite table 3, eight indexed pointers in a 16-entry '
      + 'valid run shared with the adjacent table'],
  [17, 0x26d41e, 8, 4, 8, 0x26d43e,
    'stage-3 type $12 sprite table 4, eight stride-4 pointers'],
  [17, 0x26d64e, 16, 4, 16, 0x26d68e,
    'stage-3 type $13 sprite table, sixteen stride-4 pointers'],
  [17, 0x265bdc, 4, 4, 4, 0x265bec,
    'stage-3 type $14 sprite table, four stride-4 pointers'],
  // W200. Type $15's two 16-entry pointer tables are complete, exact runs.
  // They share the existing deferred late-family shard with the adjacent
  // Stage-3 art and add 32 distinct streams.
  [17, 0x26605a, 16, 4, 16, 0x26609a,
    'stage-3 type $15 sprite table 0, sixteen stride-4 pointers'],
  [17, 0x2665aa, 16, 4, 16, 0x2665ea,
    'stage-3 type $15 sprite table 1, sixteen stride-4 pointers'],
  // W203. Type $16 owns two complete 32-entry art tables.  Both resolve to
  // the uniform late-family $F4 stream chain and add exactly 64 new streams.
  [17, 0x2670e0, 32, 4, 64, 0x2671e0,
    'stage-3 type $16 sprite table 0, thirty-two stride-4 pointers'],
  [17, 0x267160, 32, 4, 32, 0x2671e0,
    'stage-3 type $16 sprite table 1, thirty-two stride-4 pointers'],
  // W204. The A2 object-9 arrival rows are twelve bytes each; only row +$0
  // is a sprite pointer. Their 40 pointers form a complete run in shard17.
  [17, 0x29c100, 40, 12, 43, 0x29c304,
    'stage-3 type $A0 A2 object 9, forty 12-byte rows'],
  // W205. D0/D6 animate the exact A2 0..8 tables during the normal boss
  // arrival. Objects 6/7 reuse the already-shipped `$272D7A` family; these
  // five tables contain the 47 remaining table-selected streams.
  [17, 0x29bea0, 16, 4, 16, 0x29bee0,
    'stage-3 boss A2 object 0, sixteen selector frames'],
  [17, 0x29bf6a, 8, 4, 8, 0x29bf8a,
    'stage-3 boss A2 objects 2/3, eight shared frames'],
  [17, 0x29bfb8, 8, 4, 8, 0x29bfd8,
    'stage-3 boss A2 object 4, eight frames'],
  [17, 0x29c006, 8, 4, 8, 0x29c026,
    'stage-3 boss A2 object 5, eight frames'],
  [17, 0x29c052, 7, 4, 7, 0x29c06e,
    'stage-3 boss A2 object 8, seven frames'],
  // W209. The low-HP E0 pair uses the existing opening family at $29BF6A,
  // then switches to this complete reverse eight-frame active table.
  [17, 0x29e976, 8, 4, 9, 0x29e99a,
    'stage-3 boss live type $99 child, eight active animation frames'],
  [18, 0x289820, 32, 4, 32, 0x2898a0,
    'pool-D debris template 0 descriptor list'],
  [18, 0x2898b0, 32, 4, 32, 0x289930,
    'pool-D debris template 1 descriptor list'],
  [18, 0x289940, 32, 4, 32, 0x2899c0,
    'pool-D debris template 2 descriptor list'],
  [18, 0x2899d0, 32, 4, 32, 0x289a50,
    'pool-D debris template 3 descriptor list'],
  [18, 0x289a60, 32, 4, 32, 0x289ae0,
    'pool-D debris template 4 descriptor list'],
  [17, TYPE97_ART.animationTable, TYPE97_ART.frames, 4,
    TYPE97_ART.frames, 0x278288,
    'stage-2 type $97 body animation. Record +$36 walks raw byte offsets '
      + '0,$04,$08,$0C and wraps before $10, reaching exactly four pointers; '
      + '$278288 begins the five-vector death table'],
  [17, TYPE97_ART.headingTable, TYPE97_ART.headings, 4,
    224, 0x272ffa,
    'stage-2 type $97 heading attachment. Init $277E42 and retarget $278088 '
      + 'mask the 64-heading selector to $3E and double it, reaching exactly '
      + 'the first 32 longwords. The valid-pointer run continues across '
      + 'adjacent families to the vector table at $272FFA'],
  [17, TYPE96_ART.animationTable, TYPE96_ART.frames, 8,
    TYPE96_ART.frames, 0x27aa6c,
    'stage-2 type $96 opening/closing animation. Record +$20 is a byte offset '
      + '0..$78 in steps of eight, selecting exactly 16 pointer/update pairs; '
      + 'the table is structurally bounded by the next type $98 stub'],
  [17, TYPE84_ART.animationTable, TYPE84_ART.animationFrames, 4,
    6, 0x2757e2,
    'stage-2 type $84 body animation. Sub-record +$28 wraps over raw byte '
      + 'offsets 0,$04,$08,$0C and reaches exactly four pointers. Two adjacent '
      + 'pairs from the phase-word table also decode as valid stream starts, '
      + 'but this selector cannot reach them'],
  // Type $84 cue kind 0 points into the already closed `$22C59C..$22C6BC`
  // laser-impact chain below. Keep those four streams in shard 10: assigning
  // them here first would silently move shared live art between shards.
  [17, TYPE84_ART.cue4Table, TYPE84_ART.cue4Frames, 4,
    TYPE84_ART.cue4Frames, TYPE84_ART.cue4Table + TYPE84_ART.cue4Frames * 4,
    'type $84 cue descriptor kind 4. $28AE8A reloads phase $0C'],
  [17, TYPE84_ART.cue8Table, TYPE84_ART.cue8Frames, 4,
    TYPE84_ART.cue8Frames, TYPE84_ART.cue8Table + TYPE84_ART.cue8Frames * 4,
    'type $84 cue descriptor kind 8. $28AEAC reloads phase $1C'],
  // W172. `$272EFA`'s first 32 longs are type $8F's heading selector. The
  // next 32 valid pointers are the adjacent type $89 family, so the valid
  // pointer run is 64 while this registry owns exactly its first half.
  [17, TYPE8F_ART.headingTable, TYPE8F_ART.headings, 4, 64, 0x272ffa,
    'stage-2 type $8F heading art. $277550 masks the aimed heading to $3E '
      + 'and doubles it, reaching exactly the first 32 longwords; the next '
      + '32 valid pointers belong to a separately indexed family'],
  // W171. The 32 headings and six descending animation pointers are adjacent
  // pointer tables, but separate indexed families. The first valid-pointer run
  // therefore has 38 entries while only its first 32 belong to the heading
  // selector. `$276DE8` begins shot vectors, which pins the shared far end.
  [17, TYPE8D_ART.headingTable, TYPE8D_ART.headings, 4,
    TYPE8D_ART.headings + TYPE8D_ART.animations, 0x276de8,
    'stage-2 type $8D heading art. $276974 masks a 64-heading byte to $3E '
      + 'and doubles it, reaching exactly 32 longwords; the following six '
      + 'valid pointers belong to the animation selector'],
  [17, TYPE8D_ART.animationTable, TYPE8D_ART.animations, 4,
    TYPE8D_ART.animations, 0x276de8,
    'stage-2 type $8D animation art. Record +$28 walks raw byte offsets '
      + '$14,$10,$0C,$08,$04,$00, reaching all six pointers'],
  // W170. The gameplay registry owns this extent: +$20 advances 0..$1C in
  // four-byte steps, so all eight pointers are reachable. $277DE0 is the next
  // init stub and the cartridge's valid-stream run stops there too.
  [17, TYPE95_ART.table, TYPE95_ART.frames, 4, TYPE95_ART.frames,
    TYPE95_ART.table + TYPE95_ART.frames * 4,
    'stage-2 type $95 animation. $277B4C/$277C6E step record +$20 by four, '
      + '$277C9A indexes this table with the raw byte cursor, and $277DE0 is '
      + 'the next type init stub'],
  // W180. The gameplay registry owns all sixteen entries: +$20 advances the
  // raw cursor through 0..$78 in eight-byte records. $27A44C is the next
  // type-$96 init stub and structurally bounds the table.
  [17, TYPE94_ART.table, TYPE94_ART.frames, 8, TYPE94_ART.frames,
    TYPE94_ART.table + TYPE94_ART.frames * 8,
    'stage-2 type $94 extending body animation. $27A1B4 advances record '
      + '+$20 by eight, reaching all sixteen pointers; $27A44C is the next '
      + 'type init stub'],
  // W185. The eleven stage-2 boss A2 routines are draw-only register emitters.
  // Their nine pointer tables are structurally pinned by the next routine and
  // by the exact selector bounds established before the routines were ported.
  [17, 0x297490, 8, 4, 8, 0x2974b0,
    'stage-2 boss A2 object 0. A6+$28 cycles 0..$1C in four-byte steps'],
  [17, 0x2974da, 8, 4, 9, 0x2974fe,
    'stage-2 boss A2 object 3. A6+$06 reaches raw offsets 0..$1C through '
      + 'D2/D6/D7, exactly eight pointers. The ninth valid pointer at $20 is '
      + 'structurally adjacent but unreachable'],
  [17, 0x297538, 16, 4, 16, 0x297578,
    'stage-2 boss A2 object 1. A6+$166 indexes all sixteen pointers'],
  [17, 0x2975a8, 14, 4, 14, 0x2975e0,
    'stage-2 boss A2 object 2. A6+$16A cycles 0..$34'],
  [17, 0x297614, 16, 4, 16, 0x297654,
    'stage-2 boss A2 object 5. A6+$E6 is masked to $3F'],
  [17, 0x297686, 16, 4, 16, 0x2976c6,
    'stage-2 boss A2 object 4. A6+$C6 is masked to $3F'],
  [17, 0x2976fc, 32, 4, 32, 0x29777c,
    'stage-2 boss A2 objects 6 and 7. Heading bytes map to 32 pointers'],
  [17, 0x2977e6, 32, 4, 32, 0x297866,
    'stage-2 boss A2 objects 8 and 9. Heading bytes map to 32 pointers'],
  [17, 0x2978d0, 32, 4, 32, 0x297950,
    'stage-2 boss A2 object 10. A6+$11B maps to 32 pointers'],
  [17, 0x29bbd4, 8, 4, 8, 0x29bbf4,
    'stage-2 boss type $4D satellite. Record +$20 cycles 0..$1C'],
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
    + '`(d1 & $3E) * 2` -> $7C -> 32. The run of 64 walks straight on into the '
    + 'SECOND DRAW ARM\'s table ($269EC8, harvested below) and stops exactly at '
    + 'FAM.muzzle ($269F48). [M] first needed lf6426'],
  // ------------------------------------------------- WAVE 84, AND IT IS A FIX
  // THIS ROW REFUTES THE LINE ABOVE IT.  Until this wave both the comment block
  // and $269E48's own `why` said the second 32 longs "are BUCKET values that
  // merely happen to look like stream starts", and that is why they were never
  // harvested.  They are ART.  $269B8C -- ARM B of the family's shared draw --
  // does `move.l ($2C,A5),D2 / move.w #$410,D3 / jmp $23DF58`, and D2 is the
  // DESCRIPTOR the emitter writes into hardware words 2 and 3; ($2C,A5) is
  // loaded from this table by $269E32 and by $269DB6, at the same heading index
  // as the body.  [M] THE BOARD'S OWN DISPLAY LIST CARRIES THEM: over the 210
  // checkpoints of the `stage1-laser-hold` ladder, 54 entries have a descriptor
  // out of this table (and 359 out of $269BB6, arm A's, which ships already).
  // W80 wired the family's two machines, both draw arms started running, and
  // every one of arm B's records had no picture in the bundle -- all 186 of
  // `webgate`'s "NO ART ANYWHERE" and 12 of the 13 addresses its guard names.
  [3, 0x269ec8, 32, 4, 32, 0x269f48,
    'the damage-first family\'s SECOND DRAW ARM ($269B8C, `move.l ($2C,A5),D2 / '
    + 'jmp $23DF58`), heading-indexed by $269E32 and $269DB6 at the same '
    + '`(d1 & $3E) * 2` -> $7C -> 32 as the body. The run of 32 stops exactly at '
    + 'FAM.muzzle ($269F48), which is $269E48\'s run of 64 minus this table -- '
    + 'the two extents pin each other. [M] the BOARD draws 54 of them over '
    + 'stage1-laser-hold; [M] first needed lf2107 from the shipped seed, which '
    + 'is why shard 3 moved ahead of shard 1 in SPR_ORDER'],
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
  // ------------------------------------------------------------- WAVE 53 E5a
  // THE SHOT'S IMPACT SPARK.  Not a body table and not indexed by a heading:
  // this is an ANIMATION, walked by `$28A15C move.w ($10,A6),D0 / subq.w #4`
  // from a starting cursor the template carries, downwards, once per frame.
  //
  // BOTH ENDS ARE PINNED BY DATA THAT IS NOT THIS LIST.  The bottom is the
  // pointer at `$28A5AC+$10` (and the fourteen other templates' -- [M] all 15
  // name $28A5C2 and nothing else).  The top is the largest starting cursor any
  // of the 15 carries, $8C, i.e. 36 longwords -- and [M] $28A5C2 + 36*4 ==
  // $28A652, template 1's own base.  The list and the templates ABUT EXACTLY.
  // `tools/export-tables.py check_pool_e_extents` asserts both on every export.
  //
  // [M] ENTRY 0 ($22CBC0) IS NEVER DRAWN, and it is harvested anyway rather
  // than trimmed.  `$28A15C` reads the cursor BEFORE `$28A160 subq.w #4` and
  // `$28A164 bcs` frees the slot on the borrow, so a record that reaches cursor
  // 0 dies instead of drawing list[0].  Trimming to 35 would make the harvest
  // depend on my reading of a branch instead of on the table's own extent, and
  // `46-diag`'s tank hulls are what that costs.  Named here, measured in
  // `53-impl-E5a-spark.md`.
  // -------------------------------------------------------------- WAVE 61 I2
  // THE ITEM.  Ten flat longword tables, and every `entries` below is pinned by
  // an INSTRUCTION rather than by the run:
  //
  //   the four-frame tables: `$27EA96 addq.w #4,($e,A6) / $27EA9A andi.w #$F`
  //     -- the cursor can only be 0/4/8/$C, so FOUR entries, and the same two
  //     instructions appear in all four ported bodies.
  //   the sixteen-frame one ($27EF10): kinds $0C/$14's `andi.w #$3F` -- and
  //     those two kinds are REFUSED by `src/items.js`, so nothing in this port
  //     can ask for its art.  IT IS HARVESTED ANYWAY, for `docs/knowledge/09`'s
  //     reason and W58 §2.1b's precedent: the table's own extent is the claim,
  //     not what a run reaches, and wave I3 must not find a hole.
  //   the collected animations: `$27F64A cmpi.w #$78,($a,A6) / bge` -> 30, and
  //     `$27F6A2 cmpi.w #$44` -> 17.  Both are the STEPPER'S OWN bound.
  //
  // Each list's base is `list + 8` because `$27F5F4` consumes an 8-byte header
  // (`d.l = pos + (A0)+ ; D3 = (A0)+ ; A0 += 2`) BEFORE `adda.w ($a,A6),A0`.
  // [M] the four 30-entry lists carry SIX repeated frames each (24 distinct of
  // 30) and the 17-entry one is a PALINDROME (8 distinct of 17), which is why
  // 172 table entries are only 139 distinct streams.
  [12, 0x27ea1a, 4, 4, 4, 0x27ea2a, 'kind $00 THE POWER-UP, 4 frames'],
  [12, 0x27ebcc, 4, 4, 4, 0x27ebdc, 'kind $04 FULL POWER, 4 frames'],
  [12, 0x27ed7c, 4, 4, 4, 0x27ed8c, 'kind $08 THE SET ITEM, 4 frames'],
  [12, 0x27ef10, 16, 4, 16, 0x27ef50,
    'kinds $0C/$14 THE HYPER STOCK, 16 frames. Those kinds are REFUSED by '
    + 'src/items.js (the rank error recon 59 5.2 measures), so NOTHING IN THIS '
    + 'PORT CAN REACH THIS ART -- and it ships anyway, because the harvest is '
    + 'sized off the table and not off a run'],
  [12, 0x27f196, 4, 4, 4, 0x27f1a6, 'kind $10 the $8130BE counter, 4 frames'],
  [12, 0x27f308, 30, 4, 30, 0x27f380,
    'COLLECTED animation A ($27F300 + its 8-byte header), 30 frames, used by '
    + 'kind $10. The far end is the NEXT list\'s header'],
  [12, 0x27f388, 30, 4, 30, 0x27f400, 'COLLECTED animation B, kind $08\'s'],
  [12, 0x27f408, 30, 4, 30, 0x27f480,
    'COLLECTED animation C -- kinds $0C/$14\'s, and therefore UNREACHABLE in '
    + 'this port for the same reason $27EF10 is'],
  [12, 0x27f488, 30, 4, 30, 0x27f500,
    'COLLECTED animation D, kinds $00 and $04\'s -- the POWER-UP\'s'],
  [12, 0x27f508, 17, 4, 17, 0x27f54c,
    'THE AT-MAXIMUM animation, 17 frames, taken when the thing an item grants '
    + 'is already at maximum and the pickup scores $1000 instead of $10. '
    + '$27F508 + 8 + 17*4 == $27F54C == THE COLLECT TAIL ITSELF'],
  // ------------------------------------------------------------- WAVE 81
  // THE FIGHTER, THE MECH AND THE TWIN TURRET -- the three types W80 measured
  // as ART waves rather than emission waves.  Every extent below is pinned by
  // the INDEX ARITHMETIC in the handler, and W80's own figures are refused by
  // it in three places (docs/worklog/ddpdoj/81-impl-fighter-mech-art.md §1):
  //
  //  * TYPE $82's art is NOT "57 descriptors" and NOT one table.  Its body
  //    descriptor is the CONSTANT $1735FC in the sub-record prototype at
  //    $274770+6 (immediate, below); its heading table $272DFA is the
  //    $151E10 family THIS FILE ALREADY SHIPS in shard 11; and its third
  //    record is the immediate $173810 at $274A70.  TWO new streams.
  //  * TYPE $10's `$268594` is TWO tables of 64 and 32, not one of 96 --
  //    exactly type $11's hull/turret pair, and the 96 in `w35atlas.mjs
  //    ROM_TABLES` is their SUM.  Both are reachable and both are harvested.
  //  * TYPE $88 needs 37 streams, not the one W80's census saw: the body
  //    immediate $17D480, the four-frame sub table $2763D8, AND the 32-entry
  //    turret table $272D7A that `src/initbody.js:560` has read since W36.
  [14, 0x268594, 64, 4, 96, 0x268714,
    'type $10 HULL by HEADING. $268300 reads ($1A,A6), $268304 `moveq #$3E / '
    + 'and.w D7,D1 / add.w D1,D1 / add.w D1,D1` -> $F8, and $26831C adds 4 on '
    + 'the mirror bit ($80390B bit 2) -> entries 0..63; $268324 `move.l '
    + '(A0,D1.w),($a,A6)`. THE INDEX IS INSTRUCTION-FOR-INSTRUCTION $268B9E\'s '
    + '(type $11 hull), and the run of 96 is this table PLUS the turret table '
    + 'below at $268594+$100 -- the same adjacency that pins $268B9E. [M] W81: '
    + 'stride $C4 = 4x48 = 64x48 px, the gold armoured mech W75 photographed'],
  [14, 0x268694, 32, 4, 32, 0x268714,
    'type $10 TURRET by FACING. $2683AE `addq.b #1,D1 / andi.w #$3E,D1 / add.w '
    + 'D1,D1` -> $7C -> 32, $2683BC `move.l (A0,D1.w),($22,A5)`. This is '
    + '$268C9E\'s index exactly. Pinned from BELOW by code: [M] $268714 is '
    + '$3B7C0000 (`move.w #..,($4,A5)`), not a stream'],
  [16, 0x272d7a, 32, 4, 160, 0x272ffa,
    'type $88 TWIN TURRET, both barrels. src/initbody.js:560/565 already reads '
    + 'it twice ($275DE6/$275E1A), index `(($1B,A6) & $3E) << 1` -> $7C -> 32. '
    + 'THE RUN OF 160 WALKS STRAIGHT ON through $272DFA (type $82/$85, 32, '
    + 'already shipped in shard 11) and $272E7A (type $89, 96, shard 2) and '
    + 'stops at $272FFA -- so the run cannot size this table and the INDEX '
    + 'does. [M] $151790 stride $34 = 48 mask words'],
  [16, 0x2763d8, 4, 4, 4, 0x2763e8,
    'type $88 SUB-RECORD, four frames. $275E46 / handlers.js:2515 `move.l '
    + '(A0,D0.w),($2a,A6)` indexed by ($28,A6) as a BYTE offset. Both ends are '
    + 'the cartridge\'s: $2763D0 is the handler\'s `jmp $263762` and [M] '
    + '$2763E8 is $00000800, which is not a stream start'],
  // ------------------------------------------------------- WAVE 90, AND IT IS
  // THE OTHER HALF OF "THE LASER SHOOTS THROUGH THEM".  W86 made the fighter
  // die; this is the flash that says the BEAM connected. Same pool, same
  // driver, same shard -- a DIFFERENT template ($28A506) and a different list.
  // [M] 36 longwords, $22C860 down to $22C6BC step $C, DESCENDING, and the
  // template's own cursor seed $008C is where 36 comes from ($28A160 steps it
  // -4). Both ends are the cartridge's: $28A506+$16 == $28A51C (the template
  // ABUTS its own list) and $28A51C+144 == $28A5AC, W53's template 0 below.
  // `tools/export-tables.py check_beam_impact_extents` asserts every one of
  // those, plus both heads' seven instructions.
  //
  // ENTRY 0 ($22C860) IS NEVER DRAWN and is harvested anyway, for exactly the
  // reason the row below gives: `$28A15C` reads the cursor BEFORE `$28A160
  // subq.w #4` and `$28A164 bcs` frees the slot on the borrow, so a record
  // walks entries 35..1 and never 0. Trimming it would make the harvested
  // length a consequence of a control-flow argument rather than of the
  // template's own field, and W86 §0.2 is what happens when a list's extent
  // stops being the cartridge's.
  [8, 0x28a51c, 36, 4, 36, 0x28a5ac,
    'THE LASER\'S IMPACT EFFECT, $289FC0/$289FDA (src/spark.js, W90). The '
    + 'flash where the BEAM connects, against the row below\'s flash where a '
    + 'BULLET connects -- different template, different list, same 60-slot '
    + 'pool E and same driver $28A098. $22C6BC..$22C860 step $C. [M] W53 §6 '
    + 'named these as deliberately absent and W86 §6.3 as the owner\'s '
    + '"the laser shoots through them"; the records were always emitted '
    + 'correctly and there was no picture at the end of them. '
    + 'NOTE $289F96 -- the beam\'s SEGMENT producer -- shares this template '
    + 'and list, so ITS art ships here too although it is still unported'],
  [8, 0x28a5c2, 36, 4, 36, 0x28a652,
    'THE IMPACT SPARK, $289F54/$28A098 (src/spark.js). 36 frames, '
    + '$22CA1C..$22CBC0 step $C -- 12 mask words each, which is exactly the '
    + '2 + wide*high + 2 that the record own ($e,A6) = $0208 (1 x 8) wants. '
    + '[M] 0 of the 36 are in the shipped sheet and it is 0.8 KiB gz for all '
    + 'of them -- the cheapest shard in this bundle by a factor of thirteen'],
  // ================================================== WAVE 98: THE BOSS'S BODY
  // W96 got the stage-1 boss ARRIVING, descending, handing off and fighting for
  // 559 logic frames, and the owner could not see one pixel of it: the port
  // emitted the right records at the right coordinates and the renderer had no
  // tiles for any of them.  [M] W96's closing census, reproduced here to the
  // record: 4,071 records lacking art over 75 streams, of which 58 are the boss.
  //
  // **THE TABLES BELOW ARE THE BOSS'S OWN AND EVERY ONE OF THEM IS ALREADY A
  // DECLARED ROM WINDOW** -- W82 exported OBJECT 3/4/5's and W96 exported
  // OBJECT 0/1/6's, each pinned by the instruction that indexes it and by the
  // first byte of code past its far end (`tools/export-tables.py`,
  // `check_boss_arrival_tables`).  This wave adds NO new reading of the
  // cartridge; it ships the pictures the windows already name.
  //
  // AND THE COUNT IS THE PREMISE CHECK.  The brief said "the boss's art"; the
  // census said 58 streams.  [M] THE TABLES HOLD 244, and the gap is W81 §1.1's
  // lesson from the other side: 58 is what a 559-frame life happens to index,
  // and the boss's animation cursors ($2A,A6), ($6A,A6), ($AC,A6), ($C6,A6) and
  // ($11A,A6) each sweep their whole table over a fight that runs to the end.
  // A harvest sized off W96's run would ship a quarter of the battleship.
  //
  // TWO TABLES IN THE BOSS'S OWN ROM WINDOWS ARE **NOT ART** AND ARE NOT HERE,
  // and this is worth writing down because both are named "sprite table" in the
  // exporter's own comments: [M] $292A08's 32 longwords are $40004000,
  // $48004800 .. $C000C000 -- word pairs written to ($46,A6), not stream starts
  // -- and [M] $292F84's SECOND longword per record is $E600EE00 / $E000E500,
  // two distinct values over 24 records.  Only `(A2)` is the picture.
  [17, 0x292a88, 32, 4, 32, 0x292b08,
    'OBJECT 0, THE BOSS\'S LEFT PART -- 32 frames. $292972 `lea $292A88(pc),A2 '
    + '/ move.w $2A(A6),D2 / move.l (A2,D2.w),D2`, a WORD used as a raw byte '
    + 'offset, so $7C+4 = $80 = 32. The run of 32 stops EXACTLY at $292B08, '
    + 'OBJECT 1\'s own routine, which $292932[1] publishes -- the index and the '
    + 'cartridge agree entry for entry. [M] W96 drew 4 of these 32'],
  [17, 0x292b7a, 32, 4, 32, 0x292bfa,
    'OBJECT 1, THE BOSS\'S RIGHT PART -- 32 frames, indexed by ($6A,A6) the '
    + 'same way. The run of 32 stops at $292BFA, OBJECT 3\'s routine, which '
    + '$292932[3] publishes. [M] W96 drew 4 of these 32'],
  [17, 0x292c2a, 120, 4, 120, 0x292e0a,
    'OBJECT 3 -- FIFTEEN $20 ROWS. $292C00 `move.w $AC(A6),D2 / addq.w #$7 / '
    + 'lsl.w #$5 / adda.w D2,A2 / adda.w $AA(A6),A2` with $AC SIGNED in '
    + '[-7,+7] and the row cursor $AA taking 0,4,..,$18. THE RUN AND THE CODE '
    + 'PIN AGREE AT 120: $292C2A+$1E0 == $292E0A, OBJECT 4\'s first '
    + 'instruction, and the cartridge\'s run of consecutive stream starts is '
    + '120 too. [M] the row cursor wraps at $1C so the EIGHTH longword of each '
    + 'row is unreachable through this lea -- 15 of the 120. They ship anyway, '
    + 'for W58 §2.1b\'s reason and W84\'s: "the index cannot reach them" is a '
    + 'statement about ONE lea. [M] W96 drew 7, i.e. one row'],
  [17, 0x292e32, 3, 4, 3, 0x292e3e,
    'OBJECT 4 -- three longwords of which $292E10 `move.l (A2),D2` can only '
    + 'ever read [0] (no index register, no displacement). All three ship; the '
    + 'far end is $292E3E, OBJECT 5\'s first instruction. 0.3 KiB'],
  [17, 0x292eca, 32, 4, 32, 0x292f4a,
    'OBJECT 5 -- 32 longwords, $292E3E `move.b $C6..$C9(A6),D2 / andi.w #$3E / '
    + 'add.w D2,D2 / move.l $292ECA(pc,D2.w),D2`, read FOUR times per frame '
    + '($292E4A/$292E7A/$292E98/$292EB6). Far end pinned by $292F4A, OBJECT '
    + '6\'s first instruction. [M] W96 drew 17 of the 32'],
  [17, 0x292f84, 24, 16, 29, 0x293154,
    'OBJECT 6, **THE BATTLESHIP\'S OWN HULL** -- 24 twelve-byte records at '
    + 'stride $10, $292F4A `lea $292F84(pc),A2 / adda.w $11A(A6),A2`. MAIN 0 '
    + 'drives ($11A,A6) 0,$10,$20..$180 and the handoff at $180 stops OBJECT 6 '
    + 'in the same frame, so $170 is the last index drawn. THE RUN CANNOT SIZE '
    + 'THIS TABLE AND SAYS SO: [M] at stride $10 the cartridge\'s run of '
    + 'longwords that pass as stream starts is 29, because entries 24..28 land '
    + 'inside $293104, the MAIN SCRIPT TABLE, whose {init,step} pointers '
    + 'happen to decode as stream starts. $293104 is `$292710 lea $293104,A0` '
    + '-- the cartridge publishes it -- and THAT is what pins 24, exactly as '
    + '$272E7A\'s run of 160 is stopped by an index and not by a run. '
    + '[M] all 24 were missing and this is 147.3 KiB of the wave\'s 367'],
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
/** W61: the item shard -- see SPR_SHARDS[12]. */
const ITEM_SHARD = 12;

// ------------------------------------------------------------------- WAVE 81
/** THE THREE STREAMS THAT ARE IMMEDIATES, NOT TABLE ENTRIES.  Each is pinned by
 *  the instruction or the prototype word that carries it, and a fourth address
 *  the same reading produces -- type $85's `$2758B0` prototype -- is NOT here
 *  because [M] its descriptor `$1928BC` is already in shard 11.
 *
 *  `[shard, offs, why]`. */
const W81_IMMEDIATES = Object.freeze([
  ...TYPE38_FAMILY_ART.map((offs, i) => [17, offs,
    `TYPE $${(0x38 + i).toString(16).toUpperCase()} fixed hull, copied from `
      + `record prototype +$28 and emitted by shared handler $2647A6`]),
  [17, TYPE3C_ART.centre,
    'TYPE $3C centre body, emitted directly by $266B8E at size $0E38'],
  [17, TYPE3C_ART.left,
    'TYPE $3C left opening arm, emitted directly by $266BC2 at size $0E28'],
  [17, TYPE3C_ART.right,
    'TYPE $3C right opening arm, emitted directly by $266BF6 at size $0E28'],
  [17, TYPE37_ART.body,
    'TYPE $37 fixed hull, emitted directly by $264920 at size $1060'],
  [17, TYPE36_ART.body,
    'TYPE $36 fixed carrier hull, emitted directly by $26453E at size $2450'],
  [15, 0x1735fc,
    'TYPE $82\'s BODY. Not a table: the sub-record PROTOTYPE at $274770 carries '
    + 'it at +6, which `loadSubProto` copies to ($a,A6) (initbody.js:496), and '
    + '$274A28 `jsr $23DBCA` emits ($a,A6) unchanged. [M] size word $274770+$A '
    + '= $0C58 = 96x88 px, 530 mask words -- the blue forward-swept-wing '
    + 'fighter W75 §3.1 photographed off the board\'s framebuffer'],
  [15, 0x173810,
    'TYPE $82\'s THIRD RECORD, the one that goes to a DIFFERENT BUCKET. '
    + '$274A70 `move.l #$173810,D2` / $274A76 `move.w #$628,D3` (6x40) / '
    + '$274A7E `jsr $23DF58`. Gated by `tst.w $813098` (RANK) at $274A50 and '
    + '`tst.w $80390C` at $274A58, so a rank-0 single-player run never asks '
    + 'for it -- which is exactly why a harvest sized off a RUN would miss it'],
  [16, 0x17d480,
    'TYPE $88\'s BODY. The prototype at $275ECC+6 (initbody.js:552), size word '
    + '$0C60 = 96x96 px, 578 mask words. [M] This is the stream the live page '
    + 'named at 55 s and 65 s and 80 s in W68 §6 -- `NO ART $17D480` -- for a '
    + 'type that has been emitting 12 of 12 records since W36'],
  // ------------------------------------------------------------------ WAVE 98
  // TWO MORE, AND THE SECOND ONE IS NOT THE BOSS'S.
  [17, 0x06539c,
    'OBJECT 2, THE BOSS. Not a table: $292952 `move.l #$6539C,D2` is the whole '
    + 'of it (src/boss.js:788, emit23E020). [M] 357 records with no picture in '
    + 'the W98 census, and OBJECT 2 has been PORTED SINCE W82 -- it was '
    + 'invisible only because nothing had ever armed the OBJECT slots'],
  [4, 0x07e8ac,
    'TYPE $24\'s FIRST RECORD, and it belongs to shard 4 rather than to the '
    + 'boss. $29709E `move.l #$7E8AC,D2` (handlers.js emit24) is a LITERAL; the '
    + 'SECOND record of the same emitter reads $2970D8, which shard 4 has '
    + 'harvested since W47, so the type shipped with half its art and nobody '
    + 'noticed. [M] 523 records -- **the single largest missing stream in the '
    + 'whole census, larger than any of the boss\'s** -- first needed lf7,521. '
    + 'This is W81 §1.1\'s immediate-vs-table lesson a third time'],
]);

// W200. Type $15 carries four direct display-list stream descriptors in its
// local closure. They are not entries in either pointer table above.
const W200_IMMEDIATES = Object.freeze([
  [17, 0x28ea40, 'TYPE $15 immediate body stream 0'],
  [17, 0x28f3a4, 'TYPE $15 immediate body stream 1'],
  [17, 0x28fd08, 'TYPE $15 immediate body stream 2'],
  [17, 0x29060c, 'TYPE $15 immediate body stream 3'],
]);

// W202. Type $83 visibly emits these two immediate streams. The adjacent
// $173F24 descriptor is unreachable and intentionally remains unharvested.
const W202_IMMEDIATES = Object.freeze([
  [15, 0x17388c, 'TYPE $83 visible immediate body stream 0'],
  [15, 0x173c80, 'TYPE $83 visible immediate body stream 1'],
]);

/** Shard metadata.  `boot` is awaited by `loadBundle`; the rest are queued from
 *  boot and promoted by the page's miss guard. */
// ------------------------------------------------------------------- WAVE 52
// AND THE TWO SHARDS THE WEAPONS NEED.  (enemy layer E4 --
// docs/worklog/ddpdoj/52-impl-E4-bullets.md)
//
// The owner's report after W51: "shooting enemies with bullets works, but you
// can't see the bullets".  Both halves of that are one thing -- neither the
// player's shots (bucket 14) nor the enemy bullets (buckets 22/23) had any art
// in the sheet, because the sheet was harvested from a 161-frame recording in
// which the shots and the bullets happen to be drawn from streams the recording
// did carry for OTHER producers, or not at all.
//
// [M] 1,200 logic frames from the shipped seed with fire tapped every 4 frames:
// bucket 14 emits 21,691 records over 20 distinct streams and NOT ONE of the 20
// is in the sheet.  The bullet pool runs 14,172 live record-frames with nothing
// pressed over 68 distinct descriptors, of which 6 are in the sheet.
//
// SHARD 6 AND SHARD 7 ARE FETCHED FIRST among the deferred, because their
// deadlines are the earliest anything in this bundle has: [M] the first enemy
// bullet wants art at lf+40 = +0.7 s and the first shot on the first frame the
// player presses fire.  `SPR_ORDER` below is what says so; the queue used to
// assume ascending index WAS need order and after this wave it is not.
const SPR_SHARDS = Object.freeze([
  [0, 'boot', 'the recording\'s 150 streams + the ship\'s 17 tilts (W12). '
    + 'BYTE-IDENTICAL to what shipped before W47.'],
  [1, 'type11', 'type $11\'s hull $268B9E + turret $268C9E, and the laser\'s 5 '
    + '(W45). The owner\'s missing tank bodies.'],
  [2, 'type89', 'type $89\'s body table $272E7A'],
  [3, 'family', 'the damage-first family, $269E48 + $269EC8 + $269BB6 -- the '
    + 'body, the SECOND DRAW ARM (W84) and anim4'],
  [4, 'type24', 'type $24\'s table $2970D8'],
  [5, 'type31', 'type $31\'s 70-frame animation $26990E'],
  [6, 'shots', 'THE PLAYER\'S SHOTS: the ship\'s own $2554EA/$255502 and the '
    + 'option pods\' $24D2FC/$24D35C, five powers each, with every chain each '
    + '38-byte template opens (W52).'],
  [7, 'bullets', 'THE ENEMY BULLETS: the mask ROM\'s own stream chain across '
    + 'the four ranges the 39 behaviour bodies animate inside (W52).'],
  [8, 'spark', 'THE IMPACT SPARK: pool E 36-frame animation $28A5C2, '
    + 'the flash where a bullet CONNECTS (W53). 0.8 KiB.'],
  [9, 'explode', 'THE ENEMY DEATH EXPLOSION: pool B\'s 68 script entries at '
    + '$221520/$221630, 23 distinct scripts of 12..36 cells each, walked the '
    + 'way $288E4E and $288E20 walk them (W54). What happens when an enemy '
    + 'actually dies.'],
  [10, 'laser', 'THE LASER BEAM: $24BB0A\'s 4-frame animation for all five '
    + 'POWER steps + the segment block $24A86A..$24B7EA and the option block '
    + '$24BBA0..$24C080 (W58). [M] 29 of the beam\'s 33 descriptors had no '
    + 'picture: the owner\'s flicker.'],
  [11, 'structures', 'buckets 2/3/7 -- background structures, midboss and large '
    + 'emplacements, [M] 111 streams = 82.5 % of every missing sprite PIXEL '
    + '(W58). The 288x208 hole in the middle of the playfield.'],
  [12, 'items', 'THE ITEM: the five four-frame sprite tables the six item '
    + 'bodies index ($27EA1A $27EBCC $27ED7C $27EF10 $27F196) and the five '
    + 'COLLECTED animations $27F308/$388/$408/$488 (30 frames) and $27F508 '
    + '(17) that $27F5F4 and $27F656 walk (W61). What the bigger ships drop.'],
  // The `why` is what the page prints in "SPRITE SHARD n DID NOT LOAD -- it
  // holds N streams -- ...", and `manifest.json` is the one body served
  // UNCOMPRESSED, so every character of it is a boot byte. [M] W66: the first
  // draft of this string cost 329 B and the shipped one costs 174 (E3 §3's
  // trim-after-measuring, for the same reason).
  [13, 'bomb', 'THE BOMB, LASER BOMB, AND HYPER AURA: $255E3E\'s three phase scripts, '
    + 'the laser bomb\'s data block $256662..$256986, pool E\'s $28A464, the '
    + 'ship\'s bit-7 aura, hyper activation burst, and type $8A\'s pair (W66/W188)'],
  [14, 'type10', 'THE GOLD MECH: type $10\'s hull $268594 (64, by heading) and '
    + 'turret $268694 (32, by facing) -- the pair W80 read as one 96-entry '
    + 'table. The owner\'s "tanks on the golden terrain" (W81)'],
  [15, 'type82', 'THE FIGHTER: type $82\'s body $1735FC (96x88) and its '
    + 'bucket-3 record $173810. The largest invisible object in the stage, and '
    + 'it arrives on the rung the midboss dies (W75 §4, W81)'],
  [16, 'type88', 'THE TWIN TURRET: type $88\'s body $17D480, its four-frame '
    + '$2763D8 and both barrels\' $272D7A. Already emitting 12 of 12 records '
    + 'with no picture for any (W80 §5, W81)'],
  // The `why` below is what the page prints when the shard has not landed, and
  // `manifest.json` is served UNCOMPRESSED, so every character is a boot byte.
  [17, 'boss', 'THE STAGE-1 BATTLESHIP: its hull $292F84 and the six OBJECT '
    + 'tables around it, plus stage-2 boss parts and late-game enemy families. '
    + 'These compact late-game families share one derived packed shard'],
  [18, 'debris', 'POOL-D SECONDARY DEBRIS: all five 32-frame template lists '
    + 'used by enemy and boss death explosions (W191)'],
]);
const SPR_BOOT = [0];
/** the order the deferred shards are FETCHED in -- measured first need, not
 *  index order.  [M] W52: bullets +0.7 s, shots the first fire frame, then
 *  W47's own measured ladder 7.7 / 49.6 / 74.7 / 98.7 / 103.2 s. */
// W53: the spark lands FOURTH, behind the two producers that have to draw
//  before anything can be hit.  Its first need is the first frame a shot
//  CONNECTS, which is later than the first fire frame (shard 6) and later
//  than the first enemy bullet (shard 7) -- and it is 0.8 KiB, so it costs
//  the two ahead of it almost nothing.
// W54: shard 9 is the BIGGEST in the bundle (218.4 KiB) and its deadline is the
// first frame an enemy DIES, which is later than the first bullet (shard 7) and
// later than the first fire frame (shard 6) but [M] earlier than shard 1's hull
// need at +7.7 s.  It goes FOURTH, ahead of the 0.8 KiB spark deliberately:
// the spark's own first need is later than the first kill in a tapped run and
// `demand()` promotes whichever the simulation actually reaches first anyway.
// W58: shard 10 THE LASER goes THIRD, behind the two shards that have to draw
// before anything can be hit and ahead of the 218 KiB explosion, because [M]
// its deadline is the FIRST HELD FRAME -- the player can hold fire on frame one
// -- and it is the owner's most-repeated complaint. Shard 11 THE STRUCTURES is
// 256.7 KiB and goes LAST by index, which costs nothing: [M] its first need is
// +5.3 s and `demand()` promotes whichever shard the simulation actually
// reaches first, exactly as it has since W47.
// W61: shard 12 THE ITEM goes FIFTH among the deferred, immediately behind the
// explosion, and the reason is that its deadline IS the explosion's: [M] the
// only drop this port can reach is `$275B06`, twelve instructions above the
// `$289004` that spawns shard 9's fireball, so the first frame an item needs a
// picture is the first frame an enemy of type $85/$86 dies. It is also small.
// W66: shard 13 THE BOMB goes FIFTH among the deferred, behind the explosion
// and ahead of the item. Its deadline is a DELIBERATE PRESS rather than an
// event the game reaches by itself -- the seed carries three bombs and the
// owner can press X on frame one, but nothing makes them -- and it is 187 KiB,
// the second-largest body in the bundle, so it must not sit in front of the
// shards the simulation reaches on its own. `demand()` promotes it to the head
// of the queue on the frame Button 2 is pressed, exactly as it has since W47,
// and until it lands the page NAMES it rather than drawing pen 0.
// W81: the three new shards go AHEAD of shard 1, and the clock that says so is
// the BOARD's, not the port's -- `75-diag` §3's per-type first..last logic frame
// over a 210-rung ladder of the whole stage. [M, cited W75 §3] type $10 is on
// screen from lf2,200 and type $88 from lf2,500 (measured here off the same
// ladder), against shard 1's own first need at +7.7 s = lf~2,456 (W47). Type
// $82 arrives at lf3,825 -- 30 s of slack on 2.7 KiB -- and goes behind them.
// Shard 14 is 52 KiB and its deadline is the earliest of the three, so it leads.
// W84: SHARD 3 MOVES AHEAD OF SHARD 1, and the reason is that its deadline
// changed under it.  It was written down as `[M] first needed lf6426` -- true
// when nothing in the port emitted for the damage-first family at all.  W80
// wired the family's two machines and [M] its first record now lands at lf2106
// from the SHIPPED SEED (lf2000), i.e. 1.8 s after boot, against shard 1's own
// first need at +7.7 s.  It is 4.3 KiB.  A shard whose deadline moved because a
// handler was ported is exactly the case the ORDER-IS-A-CLAIM assertion in
// `tests/w52weapons.test.js` exists to catch, and it is asserted there.
// W98: SHARD 17 THE BOSS GOES LAST, and for once the clock is not close.  [M]
// its first need is lf8,144 -- 137.6 s after the seed at 59.185606 Hz -- where
// the latest deadline anything else in this bundle has is shard 11's +5.3 s.
// It is also the LARGEST body in the bundle (367 KiB against shard 11's 322),
// so putting it anywhere but last would delay a shard whose deadline is
// twenty-five times nearer.  `demand()` still promotes it the moment a record
// asks, exactly as it has since W47, and until it lands the page NAMES it.
const SPR_ORDER = Object.freeze([0, 7, 6, 10, 9, 18, 13, 12, 8, 14, 16, 15, 3,
  1, 2, 4, 5, 11, 17]);

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
const romBe16 = (a) => (cpuBytes[a] << 8) | cpuBytes[a + 1];

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
const w203StreamsBefore = streams.size;
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
// W203's two tables are a deliberately exact 64-stream family: the pointers
// interleave, but their union is the single uniform $F4 chain.  Keep this
// check beside the harvest so a table truncation or accidental duplicate is
// visible before the packed bundle is written.
{
  const ptrs = [];
  for (const base of [0x2670e0, 0x267160]) {
    for (let i = 0; i < 32; i++) ptrs.push(romBe32(base + i * 4) & 0x7fffff);
  }
  const unique = new Set(ptrs);
  const chain = new Set(Array.from({ length: 64 }, (_, i) => 0x174f40 + i * 0xf4));
  const w203Rows = harvestReport.filter((r) => r.base === 0x2670e0
    || r.base === 0x267160);
  if (unique.size !== 64 || [...unique].some((a) => !chain.has(a))
      || w203Rows.length !== 2 || w203Rows.some((r) => r.added !== 32 || r.already !== 0)
      || w203StreamsBefore !== 166 || streams.size !== 1975) {
    throw new Error(`W203 type $16 art harvest drifted: ${unique.size} distinct `
      + `pointers, ${w203StreamsBefore} pre-harvest streams, ${streams.size} total; `
      + 'expected 64 on the $F4 chain, 166 before, and 1975 after this harvest');
  }
}
// W205 A2 object 1 carries its fixed hull as an immediate rather than a table.
for (const offs of [0x000a3514]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else harvestAlready++;
}
for (const offs of LASER_STREAMS) {
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, LASER_SHARD);
  harvested++;
}
// W170: the body and fixed overlay are immediates, not entries in the eight-
// pointer animation table. The sub prototype carries main and `$277D02`
// carries fixed, which is the full ten-stream family with the table. This
// compact, late-stage family shares shard 17 with the immediately preceding
// boss family: alone its colour plane is a verbatim ROM span, while the joined
// packed plane remains a derived multi-family asset and needs no publish-owner
// exception.
for (const offs of [TYPE95_ART.main, TYPE95_ART.fixed]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else {
    harvestAlready++;
  }
}
// W171: the immediate death stream completes the 39 type-specific streams.
// The four `$278338` shared overlays are already owned by W53/W58's closed
// `$22C59C` chain in shard 10, completing the 43-stream dependency family
// without changing their established shard owner.
for (const offs of [TYPE8D_ART.death, TYPE8F_ART.death]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else {
    harvestAlready++;
  }
}
for (const offs of [TYPE84_ART.body, TYPE84_ART.fixedA,
  TYPE84_ART.fixedB, TYPE84_ART.fixedC]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else {
    harvestAlready++;
  }
}
// W174: type $90's prototype carries its sole stream directly; there is no
// pointer table or indirect draw family to infer beyond this exact immediate.
for (const offs of [TYPE90_ART.main]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else {
    harvestAlready++;
  }
}
// W177/W178/W181: these compact threshold enemies carry one immediate body
// stream in their long-form prototype. They share shard 17 with the adjacent
// stage-2 families, and `romExtent` proves each value is a stream start.
for (const offs of [TYPE91_ART.main, TYPE92_ART.main, TYPE93_ART.main]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else {
    harvestAlready++;
  }
}
// W175: the death stream is an immediate at `$27A50E`; it is the seventeenth
// consecutive `$684`-stride stream after the 16 table-selected frames.
for (const offs of [TYPE96_ART.death]) {
  if (!streams.has(offs)) {
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, 17);
    harvested++;
  } else {
    harvestAlready++;
  }
}
// W61: the item's LAST THREE streams are IMMEDIATES, not a table -- `move.l
// #$1B8B28,D2` at $27EFBE, `#$1B8C80` at $27F03E and `#$1B8BD4` at $27F2C2,
// inside kinds $0C/$14's bodies.  Those kinds are REFUSED by `src/items.js`, so
// nothing in this port can ask for them; they are here so that recon 59 §6's
// 139 is 139 and wave I3 finds no hole.  Three immediates cannot be a "run",
// which is why they are a list and not a HARVEST row.
const ITEM_STREAMS = Object.freeze([0x1b8b28, 0x1b8c80, 0x1b8bd4]);
for (const offs of ITEM_STREAMS) {
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, ITEM_SHARD);
  harvested++;
}

// W188: `$287324/$287340` advances this 112x80 hyper activation aura by its
// exact `$234` ROM stride, and `$2873AC` selects the ending frames from the
// same family. No pointer table enumerates the complete union. All 34 stream
// starts are live, from `$0530FC` through `$0579B0`, and belong beside the
// other Button-2 presentation in deferred shard 13.
const HYPER_AURA = Object.freeze({ base: 0x0530fc, frames: 34, stride: 0x234 });
for (let i = 0; i < HYPER_AURA.frames; i++) {
  const offs = HYPER_AURA.base + i * HYPER_AURA.stride;
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, 13);
  harvested++;
}
// WAVE 81: the three immediates above.  `romExtent` throws unless each is a real
// stream start, which is the whole check an immediate can have -- there is no
// run and no neighbour to pin it against.
for (const [shard, offs, why] of W81_IMMEDIATES) {
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, shard);
  harvested++;
  void why;
}
for (const [shard, offs, why] of W200_IMMEDIATES) {
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, shard);
  harvested++;
  void why;
}
for (const [shard, offs, why] of W202_IMMEDIATES) {
  if (streams.has(offs)) { harvestAlready++; continue; }
  streams.set(offs, romExtent(offs));
  shardOfStream.set(offs, shard);
  harvested++;
  void why;
}

// W161 -- THE HUD SPRITE INVENTORY, ENUMERATED FROM THE COMPLETE ROM TABLES.
// These records are not added from the capture. The chain bar's 56/90 words
// collapse to 32 unique stream addresses, and the popup bodies carry their own
// complete digit and suffix tables. They live in a deferred shard because the
// first frame does not need them, but a live chain can demand them by address.
const HUD_CHAIN_SHARD = 17;
function addHudStreamGroup(name, addresses, why) {
  const unique = [...new Set(addresses)];
  let added = 0, already = 0;
  for (const offs of unique) {
    if (streams.has(offs)) { already++; continue; }
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, HUD_CHAIN_SHARD);
    harvested++;
    added++;
  }
  harvestAlready += already;
  const end = unique.length ? Math.max(...unique) + 4 : 0;
  harvestReport.push({ shard: HUD_CHAIN_SHARD, base: 0, entries: addresses.length,
    stride: 0, runsTo: unique.length, endsAt: end, distinct: unique.length,
    added, already, why: `${name}: ${why}` });
}

const chainBarStreams = new Set();
for (let loop = 0; loop < 2; loop++) {
  const ptr = romBe32(0x28809e + loop * 4);
  const cap = romBe16(0x287df0 + loop * 2);
  for (let i = 0; i < cap; i++) {
    chainBarStreams.add(0x1cc4a0 + romBe16(ptr + i * 2));
  }
}
if (chainBarStreams.size !== 32) {
  throw new Error(`W161 chain-bar tables resolve ${chainBarStreams.size} streams, `
    + 'not the 32 unique addresses pinned by the 56/90-entry tables');
}
addHudStreamGroup('chain bar', [...chainBarStreams],
  '$28809E -> $2880A6/$28811A, caps $287DF0 = 56/90, tile base $1CC4A0');

const popupDigitStreams = [];
for (let zoom = 0; zoom < 4; zoom++) {
  const base = romBe32(0x2856d4 + zoom * 4);
  for (let digit = 0; digit < 10; digit++) {
    popupDigitStreams.push(romBe32(base + digit * 4));
  }
}
if (new Set(popupDigitStreams).size !== 40) {
  throw new Error(`W161 popup digit table resolves ${new Set(popupDigitStreams).size} `
    + 'streams, not all 40 entries from $2856D4');
}
addHudStreamGroup('popup digits', popupDigitStreams,
  '$2856D4 four jump entries, ten digits per zoom at $2856E4..$285783');

const popupLateStreams = [];
for (const base of [0x1c9778, 0x1c9980]) {
  for (let digit = 0; digit < 10; digit++) {
    popupLateStreams.push(base + romBe16(0x28567c + digit * 2));
  }
}
if (new Set(popupLateStreams).size !== 20) {
  throw new Error(`W161 popup late table resolves ${new Set(popupLateStreams).size} `
    + 'streams, not the two complete ten-digit families from $28567C');
}
addHudStreamGroup('popup late digits', popupLateStreams,
  '$28567C ten word offsets applied to both $1C9778/$1C9980 bases');

const popupSuffixStreams = [];
for (let i = 0; i < 12; i++) popupSuffixStreams.push(romBe32(0x285784 + i * 4));
if (new Set(popupSuffixStreams).size !== 12) {
  throw new Error(`W161 popup suffix table resolves ${new Set(popupSuffixStreams).size} `
    + 'streams, not all 12 entries from $285784');
}
addHudStreamGroup('popup suffix', popupSuffixStreams,
  '$285784 twelve suffix zoom entries');

// ------------------------------------------------------------------- WAVE 52
// 1b. THE PLAYER'S SHOTS, and 1c. THE ENEMY BULLETS.
//
// TWO DIFFERENT SHAPES, because the cartridge lays them out two different ways
// and using one mechanism for both would be a lie about one of them.
//
//   THE SHOTS are reached by INDEX, through 38-byte templates: four pointer
//   tables -> a per-power table -> a template -> three separate chains.  There
//   is no contiguous block to walk; the 71 streams live in five separate runs
//   ($004970.., $006D48.., $007CDC.., $009360.., $00C4DC..).  So they are
//   harvested exactly the way `src/shots.js` and `src/options.js` reach them,
//   with every index range pinned by the instruction that bounds it.
//
//   THE BULLETS are reached by ADDRESS ARITHMETIC -- `addi.l #$24,-(A1)` and a
//   `cmpi.l` wrap -- over CONTIGUOUS runs of the mask ROM's own stream chain.
//   Enumerating the 20 wrap ranges, the 39 templates, the muzzle table, the two
//   direction-table families and the loose immediates gives 213 addresses; [M]
//   WALKING THE CHAIN across the four ranges those 213 live in gives 306 and
//   contains all 213.  The walk is what ships, for the reason `46-diag` gave
//   this project about the tank hulls: an animation ring sized off a reading is
//   how you ship a quarter of the art, and the chain cannot be read wrong --
//   `streamExtent` solves each stream's stride out of the cartridge and the
//   walk ENDS EXACTLY on the stated address or this build stops.
const SHOT_TABLES = Object.freeze([
  [0x2554ea, 0, 'ship PRIMARY normal, $249C3E'],
  [0x255502, 0, 'ship SECONDARY normal, $249C88'],
  [0x2554ea, 4, 'ship PRIMARY hyper, $249C3A adds 4'],
  [0x255502, 4, 'ship SECONDARY hyper, $249C3A adds 4'],
  [0x25551a, 4, 'option hyper family selected by $249D5E'],
  [0x24d2fc, 0, 'option pod 0, $24D4EA `movea.l ($24D2FC,PC,D0.w),A0`. D0 = '
    + '($58,A4)*4 and MEASURED ($58,A4) = 0 (TYPE-A) -- machine.js P.shipSel'],
  [0x24d35c, 0, 'option pod 1, $24D4EE, the same index'],
  [0x24d2fc, 4, 'option pod 0 hyper, $24D4C6 adds 4'],
  [0x24d35c, 4, 'option pod 1 hyper, $24D4C6 adds 4'],
  [0x24d2fc, 12, 'TYPE-B option pod 0 hyper, ship selector 2 plus 4'],
  [0x24d35c, 12, 'TYPE-B option pod 1 hyper, ship selector 2 plus 4'],
]);
/** the five POWER steps: `$249C48`/`$24D4F8` index by ($20,A6)*2 and the power
 *  word is 0,2,4,6,8 -- `src/shots.js PS.power`. */
const SHOT_POWERS = [0, 2, 4, 6, 8];
/** `$253C7A` (dispatch nibble 0/8) and `$253F38` (nibble 2/10): the HIT
 *  re-point tables, indexed by the template's own ($26,A6). */
const SHOT_HIT_TABLE = { 0: 0x24deb2, 2: 0x25014c,
  4: 0x24ed4e, 5: 0x24f4ae, 6: 0x2519e0, 7: 0x2525d6 };
/** `$24A238 move.l (A2,D0.w),(A0)+` / `$24D548`: D0 is the firing object's
 *  animation PHASE, which `$24A26E`/`$24D500` cycle 8,4,0. */
const SPAWN_PHASES = [0, 4, 8];
/** what the SPAWN can leave in ($24,A6), i.e. how far the per-frame animation
 *  `$253BC6 subq.w #4 / bcc / move.w #$4` can index: the ship copies the
 *  player's ($44,A6), which `$24A32E` cycles 4,0; a pod copies its own D7
 *  phase, which `$24D510` cycles 8,4,0. */
const SHOT_ANIM_TOP = { 0x2554ea: 4, 0x255502: 4, 0x25551a: 8,
  0x24d2fc: 8, 0x24d35c: 8 };

const shotStreams = new Set();
const shotReport = [];
for (const [ptr, selector, why] of SHOT_TABLES) {
  const table = romBe32(ptr + selector);
  for (const pw of SHOT_POWERS) {
    const tpl = romBe32(table + pw * 2);
    const nib = romBe16(tpl) & 0xf;
    if (!(nib in SHOT_HIT_TABLE)) {
      throw new Error(`shot template $${tpl.toString(16)} (from $${ptr.toString(16)}`
        + `[${selector}], power ${pw}) carries type word $${romBe16(tpl).toString(16)}, i.e. `
        + `$253ADE dispatch nibble ${nib}. src/shots.js has no matching handler; `
        + `harvesting art for a handler that does not exist is what `
        + `$268594 is NAMED for. (${why})`);
    }
    // the SPAWN's own descriptor: the template's +$0A pointer, three phases.
    const a2 = romBe32(tpl + 10);
    for (const k of SPAWN_PHASES) shotStreams.add(romBe32(a2 + k) & 0x7fffff);
    // the per-frame animation: the template's +$1E pointer, indices 0..top.
    const ap = romBe32(tpl + 30);
    for (let k = 0; k <= SHOT_ANIM_TOP[ptr]; k += 4) {
      shotStreams.add(romBe32(ap + k) & 0x7fffff);
    }
    // the HIT re-point.  `$253C90 move.l (A0)+,$22(A6)` is a LONGWORD whose LOW
    // word is the index the hit animation starts at and counts DOWN to 0 --
    // reading it as a word leaves the index stale AND under-sizes this harvest.
    const blk = romBe32(SHOT_HIT_TABLE[nib] + romBe16(tpl + 36));
    const hp = romBe32(blk + 6), top = romBe32(blk + 10) & 0xffff;
    if (top === 0 || top % 4 !== 0 || top > 0x100) {
      throw new Error(`shot hit block $${blk.toString(16)} says its animation `
        + `starts at index $${top.toString(16)}, which is not a positive multiple `
        + 'of 4 under $100. Either $253C90 is being read as a word or the hit '
        + 'table has moved.');
    }
    for (let k = 0; k <= top; k += 4) shotStreams.add(romBe32(hp + k) & 0x7fffff);
    shotReport.push({ ptr, selector, pw, tpl, nib, a2, ap, hit: blk, top });
  }
}
{
  let added = 0, already = 0;
  for (const offs of [...shotStreams].sort((a, b) => a - b)) {
    if (streams.has(offs)) { already++; continue; }
    streams.set(offs, romExtent(offs));      // throws unless it is a stream start
    shardOfStream.set(offs, 6);
    added++;
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: 6, base: 0x2554ea, entries: shotStreams.size,
    stride: 0, runsTo: shotStreams.size, endsAt: 0, distinct: shotStreams.size,
    added, already,
    why: 'THE PLAYER SHOTS -- normal and hyper pointer tables, five powers, three chains' });
}

/** `[base, endsAt, why]` -- walk the mask ROM's stream chain from `base` and
 *  stop when the running address reaches `endsAt`.  **`endsAt` IS THE CLAIM**:
 *  if the chain steps OVER it the range is wrong and this build stops, which is
 *  the same two-sided pin `checkTableExtent` puts on an index table. */
const BULLET_RANGES = Object.freeze([
  [0x1bf58c, 0x1c0e9c,
    'the LOW bullet block. The bottom is $282118\'s `move.l #$1BF58C,$a(A6)` '
    + '(kind 0) and the top is the limit of the highest wrap in the family, '
    + '$282E4A `cmpi.l #$1C0E9C` -- and [M] the cartridge\'s own chain closes '
    + 'EXACTLY on $1C0E9C after 228 streams. It covers every one of the 20 '
    + '`animateRenderOffsWrap` rings below $1C1000, the 39 templates\' own '
    + 'descriptors ($281956[k]+6), the $283D4C muzzle table and both '
    + 'direction-table families ($2821FA/$282C8E via $2822EC, $282714/$2830EA '
    + 'via $283C4C)'],
  [0x1c1418, 0x1c143c, 'kind 1\'s $281FDC `move.l #$1C1418,$a(A6)`, alone'],
  [0x1c1658, 0x1c167c, 'kind 1\'s $281FC4 `move.l #$1C1658,$a(A6)`, alone'],
  [0x1c1b68, 0x1c23d8,
    'the HIGH bullet block: the bouncers ($282F80 #$1C1B68), the tracker '
    + '($282D46 #$1C1E38) and their two rings $1C1BF8..$1C1E38 and '
    + '$1C1EC8..$1C2108. [M] the chain closes EXACTLY on $1C23D8 after 76 '
    + 'streams, and $1C23D8 itself is a 6,276-word picture -- a stride 313x the '
    + 'bullets around it, i.e. a different subject entirely'],
]);
{
  let added = 0, already = 0, total = 0;
  for (const [base, endsAt, why] of BULLET_RANGES) {
    let a = base, n = 0, prev = base;
    while (a < endsAt) {
      const w = romExtent(a);                // throws unless it is a stream start
      if (streams.has(a)) already++; else {
        streams.set(a, w); shardOfStream.set(a, 7); added++;
      }
      prev = a; a += w.stride; n++; total++;
      if (n > 4096) throw new Error(`bullet range $${base.toString(16)} did not `
        + `reach $${endsAt.toString(16)} in 4096 streams`);
    }
    if (a !== endsAt) {
      throw new Error(`bullet range $${base.toString(16)}: the cartridge's stream `
        + `chain steps from $${prev.toString(16)} OVER $${endsAt.toString(16)} to `
        + `$${a.toString(16)}. This file's end address is not a stream boundary, `
        + 'so the range is wrong and the sheet would be short or long. '
        + `(${why})`);
    }
    // the per-range detail goes to the CONSOLE, not into `manifest.json` --
    // that file is uncompressed and every byte of it is a boot byte.
    console.log(`  bullet chain $${base.toString(16).toUpperCase()}..`
      + `$${endsAt.toString(16).toUpperCase()}: ${n} streams, closes exactly`);
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: 7, base: 0x1bf58c, entries: total, stride: 0,
    runsTo: total, endsAt: 0x1c23d8, distinct: total, added, already,
    why: 'THE ENEMY BULLETS -- 4 chain ranges (W52)' });
}

// ------------------------------------------------------------------- WAVE 54
// 1d. THE ENEMY DEATH EXPLOSION -- pool B's 68 SCRIPT ENTRIES, walked.
//
// A THIRD SHAPE, and it is neither an index table nor a chain range: an effect
// KIND selects one of 68 entries in the two tables `$221520`/`$221630`, and an
// entry is a PAIR of lists walked in LOCKSTEP -- a DESCRIPTOR list of 4-byte
// stream addresses interleaved with 8-byte negative-tagged escape commands
// ($288E20), and a DURATION list of words ending in `$FFFF` ($288F94).  One
// stream is consumed per duration word.  So the harvester has to be the
// interpreter, and `walkEffectScript` below is `$288E4E` + `$288E20` with the
// RAM writes removed.
//
// **ALL 269 STREAMS SHIP, NOT THE 204 THE PORT'S KINDS REACH.**  That is a
// decision and here is its reason, which is W53 §1.3's applied one level up:
//   * [M] `50-recon` §2.4 measured "EIGHT distinct kinds on the port's damage
//     path" from a RUN.  [M] enumerating the port's own ported arms out of the
//     listing gives ELEVEN ($1 $2 $3 $4 $5 $7 $9 $C $D $84 $85) -- `$4` is type
//     $10's death ($2681D6, which the port's own comment called $7 until W54),
//     `$5` is $275B20's and `$9` is two entries of the midboss's `$26B214`
//     list.  A harvest cut to a measured kind set is a harvest that goes short
//     the first time a run reaches a twelfth.
//   * the 68 entries are the TABLE'S OWN EXTENT, pinned from both ends by
//     `tools/export-tables.py check_pool_b_extents`, and sizing art off a
//     reading instead of off the table is `46-diag`'s tank hulls.
//   * [M] it costs 22.6 KiB gz over the 204 (218.4 against 195.8), all of it
//     DEFERRED, against 65 streams that would otherwise be a silent wrong
//     picture the day a boss or a `$2440E0` runs.
const EFFECT_TABLES = [0x221520, 0x221630];
const EFFECT_ENTRIES = 34;                    // $289004 `cmpi.w #$21,D1 / bgt`
const EFFECT_SHARD = 9;
const EFFECT_DATA_END = 0x222618;             // both lists' far end, [M] exact

/** `$288E4E` + `$288E20`, with the RAM writes removed: the stream addresses one
 *  script names, in order, plus where each of its two lists stops. */
function walkEffectScript(desc, dur) {
  const out = [];
  let dc = desc, du = dur;
  for (let n = 0; ; n++) {
    if (n > 200) throw new Error(`effect script $${desc.toString(16)}/`
      + `$${dur.toString(16)} has no $FFFF terminator within 200 cells`);
    const w = romBe16(du); du += 2;
    if (w === 0xffff) break;                             // $288F94
    for (let g = 0; ; g++) {                             // $288E20's escapes
      if (!(romBe32(dc) & 0x80000000)) break;            // $288E26 bpl
      if (g > 64) throw new Error(`$288E20's walk ran away at $${dc.toString(16)}`);
      dc += 8;
    }
    out.push(romBe32(dc)); dc += 4;                      // $288EBC / $288FB2
  }
  return { streams: out, descEnd: dc, durEnd: du };
}
{
  const seen = new Set();
  const scripts = new Set();
  let hi = 0, added = 0, already = 0, entries = 0;
  for (const tbl of EFFECT_TABLES) {
    for (let i = 0; i < EFFECT_ENTRIES; i++) {
      const desc = romBe32(tbl + i * 8), dur = romBe32(tbl + i * 8 + 4);
      const r = walkEffectScript(desc, dur);
      scripts.add(`${desc}:${dur}`);
      hi = Math.max(hi, r.descEnd, r.durEnd);
      entries++;
      for (const offs of r.streams) {
        seen.add(offs);
        if (streams.has(offs)) { already++; continue; }
        streams.set(offs, romExtent(offs));   // throws unless it is a stream start
        shardOfStream.set(offs, EFFECT_SHARD);
        added++;
      }
    }
  }
  // THE FAR END IS THE CLAIM, exactly as `BULLET_RANGES`' `endsAt` is: a walk
  // that stopped short would ship a subset and never say so.
  if (hi !== EFFECT_DATA_END || entries !== 2 * EFFECT_ENTRIES) {
    throw new Error(`the effect scripts: walking ${entries} entries reaches `
      + `$${hi.toString(16)}; this file says ${2 * EFFECT_ENTRIES} entries `
      + `ending at $${EFFECT_DATA_END.toString(16)}. The $221520 ROM window in `
      + `tools/export-tables.py is sized off the SAME number, so a short walk `
      + `here ships a truncated script the port then reads past.`);
  }
  if (scripts.size !== 23 || seen.size !== 269) {
    throw new Error(`the ${entries} effect entries resolve to ${scripts.size} `
      + `distinct scripts over ${seen.size} distinct streams; W54 measured 23 `
      + `and 269 (reproducing 50-recon-effects §5.1 exactly). A wrong count `
      + `means the tables or the walk have moved.`);
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: EFFECT_SHARD, base: 0x221520, entries,
    stride: 8, runsTo: entries, endsAt: EFFECT_DATA_END, distinct: seen.size,
    added, already,
    why: 'THE ENEMY DEATH EXPLOSION -- 68 script entries / 23 scripts (W54)' });
  console.log(`  effect scripts $221520+$221630: ${entries} entries, `
    + `${scripts.size} distinct scripts, ${seen.size} streams, data ends exactly `
    + `at $${EFFECT_DATA_END.toString(16).toUpperCase()}`);
}

// ------------------------------------------------------------------- WAVE 58
// 1e. THE LASER'S ART, and 1f. THE BIG MID-SCREEN STRUCTURES.  (E3 --
// docs/worklog/ddpdoj/58-impl-E3-art.md)
//
// THE REPORT THIS CAME OUT OF.  The owner, playing the live build: "something
// fires. It looks like shit. Laser looks like shit also and flickers. After
// initial tanks shots come out of nowhere, tons of enemies completely
// invisible."  `55-diag-invisible-content.md` measured that it is MISSING ART:
// [M] 79.3 % of the sprite pixels the port asks for had no picture behind them.
//
// THE FLICKER IS NOT A PHASE BUG, IT IS 29 ABSENT PICTURES.  [M] Bucket 16 --
// the beam -- emitted 2,606 records over a 3,000-frame playing run and drew 131
// of them (5.0 %) over 33 distinct descriptors, 29 of which the sheet did not
// have.  Every emit site already runs (`src/laser.js`, W45); the beam simply
// steps an animation whose frames are not in the bundle, so it appears on a
// minority of its own steps and vanishes on the rest.
//
// (1e) THE LASER, ENUMERATED FROM THE CARTRIDGE RATHER THAN FROM THE RUN.
// `55-diag` §10's W56 shopping list is the 29 addresses ONE scenario reached at
// ONE power level.  [M] The beam's descriptor comes from `$24BB0A`, a table of
// twenty (startOffset, pointer) pairs indexed by
// `($22,A5)*4 + {0,$28,$50,$78}` (`$254FF6..$255036`, `laser.js beamRequest`),
// and each pointer names a 40-byte block of FOUR ten-byte animation frames that
// `$2550A0 subi.w #$a` walks.  Shipping the 29 ships ONE of those blocks and
// the beam goes blank again the first time the player picks up a power-up.  So:
//
//   * THE BEAM: `$24BB0A` entries 0..4 -- the five POWER steps of the default
//     loadout -- walked to all four frames each. 20 streams.
//     THREE THINGS PIN THE STRUCTURE AND ALL THREE ARE ASSERTED BELOW:
//       [M] $24B7EA + 20*$28 == $24BB0A, i.e. the block array ABUTS the pointer
//           table exactly, which is what says there are twenty blocks;
//       [M] $24BB0A + 20*8  == $24BBAA, and the longword there no longer
//           carries the start offset $1E -- which is what says the pointer
//           table is twenty entries and not more;
//       [M] the start offset is $1E and the step is $A, and $1E + $A == $28 --
//           the four frames EXACTLY fill a block.
//   * THE SEGMENTS: every longword in the laser's own contiguous data block
//     `$24A86A..$24B7EA` that is a MASK-ROM DIRECTORY ENTRY, plus the option
//     block `$24BBA0..$24C080`.  THE METHOD IS DELIBERATE AND IT IS AN UPPER
//     BOUND, NOT A CENSUS: a segment's descriptor `($a,A6)` is written only by
//     `laser.js` reading one of these windows (`hBody`, `hOnShip`, `hOnPod`,
//     `scriptBody`, `stepTemplate`, `startBeamRecords`), so the port CANNOT ask
//     for a laser stream that is not in this set.  It over-includes -- the five
//     template families interleave scripts, anim tables and $20-byte records --
//     and the directory test is what keeps that bounded ([M] 80 of 362 hits in
//     the segment block and 28 of 195 in the option block are NOT directory
//     entries and are dropped).
//     [M] It costs 104.5 KiB gz for 399 new streams against 7.7 KiB for the 29,
//     all of it DEFERRED, and the assertion below is that all 29 are inside it.
//
// WHAT IS DELIBERATELY NOT HARVESTED, named rather than omitted:
//   * `$24BB0A` entries 5..19 -- the `+$28`/`+$50`/`+$78` groups, 60 more
//     streams.  `+$28` needs `($58,A5)` (ship select) non-zero and
//     `src/machine.js` records it as [M] 0 for TYPE-A over the whole corpus with
//     nothing in the port writing it; `+$50` needs `($5a,A6) != 2` and
//     `tools/export-tables.py` records [M] 2 on every frame.  This is the
//     `$268594` precedent: art for a state no ported code can enter.
//   * AND IT IS SAFE TO LEAVE THEM OUT, because the port cannot silently draw
//     the wrong thing there.  [M] the blocks those entries point at,
//     `$24B902..$24BB0A`, are outside EVERY window `tools/export-tables.py`
//     exports (`$24A800+$1100` stops at $24B900 and `$24BB00+$A0` starts after
//     it), so reaching one is a LOUD NAMED THROW out of `src/rom.js` at $24B902
//     -- which is more informative than a NO ART skip.  Widening that window
//     WITHOUT this art would turn a loud throw into a quiet blank; the two must
//     move together and neither moves in this wave.
//   * the LASER's own impact spark `$22C6BC..$22C860` -- W53 §6's, still behind
//     the unported `$289F96`/`$289FC0`/`$289FDA`.
//
// (1f) THE BIG MID-SCREEN STRUCTURES -- buckets 2, 3 and 7.
// [M] 89.7 % of every missing sprite pixel in `55-diag`'s run and [M] 82.5 % of
// mine.  These are the 288x208 black hole the owner sees in the middle of the
// playfield.  THIS LIST IS A MEASURED FLOOR AND IT IS SAID SO HERE rather than
// dressed up as an enumeration: they are reached from BACKGROUND-ELEMENT
// IMMEDIATES ($2623A6..$262760) and from tables no ported handler indexes, so
// there is no table for this file to walk to an extent.  `55-diag` §10's W59
// asks for exactly this list and this is it, from a 3,000-frame playing run.
// [M] 111 streams, 256.7 KiB gz, DEFERRED and promoted by the page's own miss
// guard the moment a record asks -- which [M] is +5.3 s from the seed.

const LASER_SHARD_W58 = 10;
const STRUCT_SHARD = 11;

/** the beam's `(startOffset, pointer)` pairs and the block array they index. */
const BEAM_ANIM = Object.freeze({
  ptrTab: 0x24bb0a, ptrEntries: 20, ptrStride: 8, ptrEndsAt: 0x24bbaa,
  blocks: 0x24b7ea, blockBytes: 0x28, start: 0x1e, step: 0x0a,
  /** entries 0..4: `($22,A5)*4` with the group offset 0 -- the power ladder of
   *  the default ship and formation.  See the block header for 5..19. */
  harvest: 5,
});

/** `[from, to, why]` -- scan for longwords that are MASK-ROM DIRECTORY entries. */
const LASER_BLOCKS = Object.freeze([
  [0x24a86a, 0x24b7ea,
    'the laser\'s own contiguous data block: the type-2/7/12/17 scripts '
    + '($24A86A..), family 1 ($24A932 x25x$26), family 2\'s sixteen $28-byte '
    + 'anim tables ($24ACE8..$24AF68) and family 2 itself ($24AF68 x20x$0E), '
    + 'family 3\'s scripts ($24B048), families 3/4/5 ($24B0A0/$24B1E0/$24B320) '
    + 'and the two sub-templates $254C1E copies ($24B420, $24B6D2). It stops at '
    + '$24B7EA because that is where the BEAM\'s own block array begins'],
  [0x24bba0, 0x24c080,
    'the OPTION block $24BBAA.. -- $24C906\'s twelve-byte template lists, whose '
    + '($a,A6)/($5c,A6) pair is the pod muzzle and ITS GROUND SHADOW. [M] '
    + '$065354 has shipped since W45 and $065388, the shadow beside it, did not: '
    + 'it is bucket 5\'s only missing stream'],
]);

/** [M] ALL 33 descriptors bucket 16 -- the beam -- asked for over a 3,000-frame
 *  playing run, of which the bundle held FOUR ($01302C $013098 $011E8C $013B94,
 *  the first frame of four different cycles) and 29 it did not.
 *  THE HARVEST ABOVE MUST CONTAIN EVERY ONE. This is what makes the range scan
 *  non-vacuous: a wrong range, a wrong directory filter or a wrong beam walk
 *  drops some of them and this build stops, naming them. */
const B16_MEASURED = Object.freeze([
  0x01302c, 0x013050, 0x013074, 0x013098, 0x0130bc, 0x0130e0, 0x013104,
  0x013128, 0x01314c, 0x013170, 0x01447c, 0x0144e0, 0x014544, 0x014d28,
  0x014d8c, 0x014df0, 0x014e54, 0x011e8c, 0x0120c0, 0x0122f4, 0x012528,
  0x01275c, 0x012990, 0x012bc4, 0x012df8, 0x013b94, 0x013c18, 0x022aec,
  0x022b90, 0x022c34, 0x022cd8, 0x022d7c, 0x022e20,
]);

/** bucket 0's last four, a chain run pinned from above by W53's own boundary:
 *  [M] $22C59C..$22C6BC, and $22C6BC is exactly where the LASER's impact-spark
 *  list ($28A51C, W53 §6) begins. */
const B0_RUN = Object.freeze([0x22c59c, 0x22c6bc]);

{
  const dir = new Set(Array.from(walkDirectory(sprmask).starts));
  const isDirEntry = (v) => v !== 0 && (v >>> 24) === 0
    && dir.has((v & 0x7fffff) & (MASKW - 1));
  const laserStreams = new Set();

  // --- the beam -------------------------------------------------------------
  if (BEAM_ANIM.blocks + BEAM_ANIM.ptrEntries * BEAM_ANIM.blockBytes
      !== BEAM_ANIM.ptrTab) {
    throw new Error(`the beam's block array $${BEAM_ANIM.blocks.toString(16)} + `
      + `${BEAM_ANIM.ptrEntries} x $${BEAM_ANIM.blockBytes.toString(16)} does not `
      + `land on the pointer table $${BEAM_ANIM.ptrTab.toString(16)}. The two `
      + 'ABUT in the cartridge and that adjacency is the only thing that says '
      + 'how many blocks there are.');
  }
  if (BEAM_ANIM.ptrTab + BEAM_ANIM.ptrEntries * BEAM_ANIM.ptrStride
      !== BEAM_ANIM.ptrEndsAt
      || (romBe32(BEAM_ANIM.ptrEndsAt) & 0xffff) === BEAM_ANIM.start) {
    throw new Error(`the beam's pointer table $${BEAM_ANIM.ptrTab.toString(16)}: `
      + `${BEAM_ANIM.ptrEntries} entries end at `
      + `$${BEAM_ANIM.ptrEndsAt.toString(16)}, and the longword there `
      + `($${romBe32(BEAM_ANIM.ptrEndsAt).toString(16)}) still carries the start `
      + `offset $${BEAM_ANIM.start.toString(16)} -- so the table is longer than `
      + 'this file says and the harvest would be short.');
  }
  if (BEAM_ANIM.start + BEAM_ANIM.step !== BEAM_ANIM.blockBytes) {
    throw new Error(`the beam walks from $${BEAM_ANIM.start.toString(16)} down in `
      + `steps of $${BEAM_ANIM.step.toString(16)}, which does not fill a `
      + `$${BEAM_ANIM.blockBytes.toString(16)}-byte block exactly.`);
  }
  const blockAt = new Set();
  for (let k = 0; k < BEAM_ANIM.ptrEntries; k++) {
    blockAt.add(BEAM_ANIM.blocks + k * BEAM_ANIM.blockBytes);
  }
  for (let i = 0; i < BEAM_ANIM.ptrEntries; i++) {
    const a = BEAM_ANIM.ptrTab + i * BEAM_ANIM.ptrStride;
    const start = romBe32(a) & 0xffff, ptr = romBe32(a + 4);
    if (start !== BEAM_ANIM.start || !blockAt.has(ptr)) {
      throw new Error(`beam pointer entry ${i} at $${a.toString(16)} is `
        + `(start $${start.toString(16)}, ptr $${ptr.toString(16)}); every entry `
        + `must start at $${BEAM_ANIM.start.toString(16)} and point INTO the `
        + `block array $${BEAM_ANIM.blocks.toString(16)}..`
        + `$${BEAM_ANIM.ptrTab.toString(16)}.`);
    }
    if (i >= BEAM_ANIM.harvest) continue;      // groups +$28/+$50/+$78: see above
    for (let off = BEAM_ANIM.start; off >= 0; off -= BEAM_ANIM.step) {
      laserStreams.add(romBe32(ptr + off + 4) & 0x7fffff);   // ($a,A6)
    }
  }
  const beamCount = laserStreams.size;

  // --- the segments and the option block ------------------------------------
  for (const [from, to] of LASER_BLOCKS) {
    for (let a = from; a + 4 <= to; a += 2) {
      const v = romBe32(a);
      if (isDirEntry(v)) laserStreams.add(v & 0x7fffff);
    }
  }
  const missed = B16_MEASURED.filter((o) => !laserStreams.has(o));
  if (missed.length) {
    throw new Error(`the laser harvest resolves ${laserStreams.size} streams and `
      + `does NOT contain ${missed.length} of the ${B16_MEASURED.length} `
      + 'descriptors a 3,000-frame playing run measured bucket 16 asking for: '
      + `${missed.map((o) => '$' + o.toString(16)).join(' ')}. The range scan or `
      + 'the beam walk has moved, and the owner\'s flicker would come back.');
  }
  let added = 0, already = 0;
  for (const offs of [...laserStreams].sort((a, b) => a - b)) {
    if (streams.has(offs)) { already++; continue; }
    streams.set(offs, romExtent(offs));      // throws unless it is a stream start
    shardOfStream.set(offs, LASER_SHARD_W58);
    added++;
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: LASER_SHARD_W58, base: BEAM_ANIM.ptrTab,
    entries: laserStreams.size, stride: 0, runsTo: laserStreams.size,
    endsAt: 0x24c080, distinct: laserStreams.size, added, already,
    why: 'THE LASER -- beam 5-power ladder + segment/option blocks (W58)' });
  console.log(`  laser $24BB0A[0..${BEAM_ANIM.harvest - 1}] x4 frames = `
    + `${beamCount} beam streams; + $24A86A..$24B7EA and $24BBA0..$24C080 = `
    + `${laserStreams.size} total, and all ${B16_MEASURED.length} measured `
    + 'bucket-16 descriptors are in it');
}

{
  // bucket 0's last four, walked as a chain so the run's own extent sizes it.
  let added = 0, already = 0, n = 0, a = B0_RUN[0];
  while (a < B0_RUN[1] && n <= 64) {
    const w = romExtent(a);
    if (streams.has(a)) already++;
    else { streams.set(a, w); shardOfStream.set(a, LASER_SHARD_W58); added++; }
    a += w.stride; n++;
  }
  if (a !== B0_RUN[1]) {
    throw new Error(`the $${B0_RUN[0].toString(16)} run steps OVER `
      + `$${B0_RUN[1].toString(16)} to $${a.toString(16)}; $22C6BC is W53's own `
      + 'boundary (the LASER impact-spark list) and it must be a stream start.');
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: LASER_SHARD_W58, base: B0_RUN[0], entries: n,
    stride: 0, runsTo: n, endsAt: B0_RUN[1], distinct: n, added, already,
    why: 'bucket 0, $22C59C..$22C6BC (W58)' });
  console.log(`  $22C59C..$22C6BC: ${n} streams, closes exactly on W53's boundary`);
}

/** THE FOUR 32-FRAME ANIMATION FAMILIES, WALKED AS CHAINS -- `[base, endsAt,
 *  why]`, `BULLET_RANGES`' mechanism, and `endsAt` IS THE CLAIM: if the
 *  cartridge's chain steps OVER it this build stops.
 *
 *  THESE WERE AN EXPLICIT LIST OF MEASURED ADDRESSES UNTIL THE BROWSER SAID
 *  OTHERWISE.  [M] With the measured list shipped, the live page still named
 *  `$1567D4 $156ABC $156B38 $155C34` -- four neighbours of the twelve the run
 *  reached, in the same uniform 3x40 run.  That is a measured floor going short
 *  in the first thirty seconds of play, exactly as `46-diag`'s tank hulls did.
 *  [M] All four families are 32 streams of ONE stride and each is closed by the
 *  stride CHANGING at its far end, so the cartridge sizes them and not a run.
 *  It costs 6.7 KiB gz for 35 more streams. */
const STRUCTURE_RANGES = Object.freeze([
  [0x11e1fc, 0x127e7c, 32, '13x96 c16, stride 1252. [M] 32 streams, and $127E7C -- '
    + 'itself an 18x208 this file ships below -- is stride 3748, a different '
    + 'subject entirely'],
  [0x12c7b0, 0x12d430, 32, '3x32, stride 100. [M] 32 streams, closed by $12D430 '
    + 'being stride 68. ($12D430 is the port\'s single most-emitted missing '
    + 'stream -- [M] 3,600 records in 3,000 frames -- and it is NOT in this run; '
    + 'it is the first frame of the next family, which the row below walks.) '
    + '55-diag §2.2 calls this "a 38-frame run $12C7B0..$12D3CC"; [M] it is 32'],
  // ------------------------------------------------------------------ WAVE 66
  // AND THE FAMILY W58's OWN NOTE POINTED AT AND DID NOT WALK.  The row above
  // says "$12D430 ... is the first frame of the next family" and stops there.
  // [M] W66: fire TAPPED and never HELD, no bomb, 2,600 frames -- the page asks
  // for $12D474..$12D60C, seven streams E3's own scenario never reached because
  // it holds fire twice every 600 frames.  The family is EIGHT frames of stride
  // 68 and $12D650 is stride 1084, so the cartridge sizes it exactly as it
  // sizes the other four.  NOT the bomb's; shipped by this wave anyway, because
  // "zero missing streams" that only holds while the player holds fire is not
  // the claim.
  [0x12d430, 0x12d650, 8, '3x32-ish, stride 68. [M] 8 streams, closed by '
    + '$12D650 being stride 1084. W58 §2.2 identified $12D430 as "the first '
    + 'frame of the next family" and shipped only that one frame'],
  [0x151e10, 0x152a90, 32, '3x32, stride 100. [M] 32 streams, closed by stride 228'],
  [0x155c34, 0x156bb4, 32, '3x40 c12, stride 124. [M] 32 streams, closed by $156BB4 '
    + 'being stride 484. 55-diag §2.2 calls this "a 16-frame 3x40 c12 run '
    + '$155D2C..$1569C4"; [M] it is 32, and it starts $DC lower'],
]);

/** [M] the buckets-2/3/7 streams a 3,000-frame playing run asked for that are
 *  NOT inside one of the five families above and NOT a background element.
 *  THESE ARE STILL A MEASURED FLOOR -- see the block header. Every one is a
 *  large one-off structure with no uniform run around it for the chain walk to
 *  close on, and no index arithmetic to size it.
 *
 *  ================== WAVE 86 TOOK EIGHT ADDRESSES OUT OF THIS LIST ==========
 *  and it was not a tidy-up: it is the owner's *"some terrain starts being
 *  black after the golden terrain"*.
 *
 *  This list held `$22CBCC $22DA70 $22DED4 $22E508 $22F184 $22FE98 $23061C
 *  $233F34` -- which are background-element handlers **0, 1, 2, 3, 4, 5, 6 and
 *  12** of `src/background.js`'s THIRTEEN, and not one of 7..11.  The block
 *  header above named the extent the whole time (*"they are reached from
 *  BACKGROUND-ELEMENT IMMEDIATES ($2623A6..$262760)"*, which is constructor 0's
 *  immediate field to constructor 12's) and the list was still taken off a
 *  3,000-frame run.  [M] handlers 7..11 first draw at steps 3,627 / 3,755 /
 *  4,299 / 4,747 / 5,275 from the shipped seed, so no 3,000-frame run can reach
 *  them, and [M] their five streams were 7,027 of the 8,452 records the port
 *  emitted with NO ART over 6,500 steps -- 83.1 %, and the largest records on
 *  the screen.
 *
 *  All thirteen are now enumerated from `BGELEM_HANDLERS` below, which is the
 *  port's own table, so the art and the code that asks for it cannot drift.
 *  `46-diag`'s tank hulls and W81 §1.3's `$272D7A` are the same lesson; this is
 *  the third time and the first where the correct extent was already written
 *  down in the file that got it wrong. */
const STRUCTURE_STREAMS = Object.freeze([
  0x127e7c, 0x128d20, 0x129bc4, 0x12aa68, 0x12b90c, 0x12d430,
  0x1727c4, 0x172d18, 0x1928bc, 0x192a48,
]);
{
  if (STRUCTURE_STREAMS.length !== 10 || STRUCTURE_RANGES.length !== 5) {
    throw new Error(`STRUCTURE_STREAMS holds ${STRUCTURE_STREAMS.length} `
      + `addresses and there are ${STRUCTURE_RANGES.length} chain ranges; `
      + 'W58 measured 18 and 4, W66 added the fifth ($12D430, 8 frames), and '
      + 'W86 moved the EIGHT background-element immediates out of the list and '
      + 'into BGELEM_ART below, which enumerates all thirteen.');
  }
  let added = 0, already = 0, chained = 0;
  for (const [base, endsAt, count, why] of STRUCTURE_RANGES) {
    let a = base, n = 0, prev = base;
    while (a < endsAt) {
      const w = romExtent(a);              // throws unless it is a stream start
      if (streams.has(a)) already++;
      else { streams.set(a, w); shardOfStream.set(a, STRUCT_SHARD); added++; }
      prev = a; a += w.stride; n++; chained++;
      if (n > 512) throw new Error(`structure range $${base.toString(16)} did `
        + `not reach $${endsAt.toString(16)} in 512 streams`);
    }
    if (a !== endsAt || n !== count) {
      throw new Error(`structure range $${base.toString(16)}: the cartridge's `
        + `chain runs ${n} streams from $${prev.toString(16)} to `
        + `$${a.toString(16)}; this file says ${count} ending at `
        + `$${endsAt.toString(16)}. Each of these families is closed by a `
        + `stride change, and a walk that stopped short `
        + `ships a subset the way the MEASURED list did. (${why})`);
    }
  }
  for (const offs of STRUCTURE_STREAMS) {
    if (streams.has(offs)) { already++; continue; }
    streams.set(offs, romExtent(offs));    // throws unless it is a stream start
    shardOfStream.set(offs, STRUCT_SHARD);
    added++;
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: STRUCT_SHARD, base: 0x11e1fc,
    entries: chained + STRUCTURE_STREAMS.length, stride: 0,
    runsTo: chained + STRUCTURE_STREAMS.length, endsAt: 0x1928bc,
    distinct: chained + STRUCTURE_STREAMS.length, added, already,
    why: 'buckets 2/3/7: 5 x closed chains + 10 measured one-offs (W58/W66; '
      + 'W86 moved the 8 background-element immediates to BGELEM_ART)' });
  console.log(`  buckets 2/3/7: ${chained} streams over 5 closed chains + `
    + `${STRUCTURE_STREAMS.length} measured one-offs, ${added} new -- the `
    + '288x208 hole in the middle of the playfield');
}

// ------------------------------------------------------------------- WAVE 86
// (1g) **THE BACKGROUND ELEMENTS' OWN SPRITES -- THE BLACK TERRAIN.**
//
// THE OWNER, on the live build: *"some terrain starts being black after the
// golden terrain"*.  `[cited: W68 §5.2]` named the cause as bucket 2's five
// missing streams and `[cited: W75 §3.4]` tied one of them, `$232578`, to the
// invisible `$8B` hitbox lattice sitting on the gold crystal -- *"the invisible
// enemy and the black terrain are the same object"*.
//
// A stage-1 background element is a `$20`-byte slot whose `($10,A6)` is a
// SPRITE STREAM ADDRESS, written ONCE by its constructor's `move.l #imm,($10,A6)`
// and read every frame by `$23DF2A` (`src/background.js elemStage`) as the
// record's descriptor.  So the art an element can ever ask for is ONE stream,
// and there are exactly as many as `src/background.js` has handlers.
//
// **THE LIST IS THE PORT'S OWN.**  `BGELEM_HANDLERS` is imported, not copied:
// `src/background.js elemSpawn` throws a loud named `unreached` for any
// constructor outside it, so "every element the port can construct has a
// picture" is a property of one array rather than an agreement between two.
// An element the port CANNOT construct is a named throw, which the block header
// above already prefers to a quiet blank.
//
// AND IT IS CHECKED AGAINST THE CARTRIDGE FROM BOTH SIDES, because a typed-in
// constant that nothing verifies is how eight of these came to be right and
// five to be absent:
//
//   * the ROM's own stage-1 handler table `$26224A` must name handler `i`'s
//     constructor at entry `i`, in order -- so a row inserted or reordered in
//     `src/background.js` stops the build;
//   * the constructor must BE `2D7C <data> 0010`, i.e. `move.l #data,($10,A6)`
//     -- so `data` is read out of the instruction that writes it, and the port's
//     thirteen constants are verified against the image for the first time;
//   * `romExtent` must accept `data` as a real stream start in the mask ROM's
//     own chain.
//
// [M] 13 rows, 8 of which were already in the sheet (they were STRUCTURE_STREAMS'
// eight) and FIVE of which are new: handlers 7..11, `$231520 $231C44 $232578
// $232EAC $233630`.
const BGELEM_TABLE = 0x26224a;   // $262380 move.l $8132C8,A1 -- stage 1's
{
  const handlers = BGELEM_HANDLERS.filter((h) => h.stage === 0);
  let added = 0, already = 0;
  const seen = new Set();
  for (let i = 0; i < handlers.length; i++) {
    const h = handlers[i];
    const fromTable = romBe32(BGELEM_TABLE + i * 4);
    if (fromTable !== h.ctor) {
      throw new Error(`background element ${i}: the cartridge's own handler `
        + `table $${BGELEM_TABLE.toString(16)} names $${fromTable.toString(16)} `
        + `and src/background.js's row ${i} is $${h.ctor.toString(16)}. One of `
        + 'the two has moved; the art below is indexed by this table.');
    }
    // $2623A4 `2D7C 0022CBCC 0010` -- move.l #imm,($10,A6), the ONLY writer of
    // the element's descriptor.  Both the opcode word and the displacement are
    // asserted: `2D7C <long> 0014` would be the Y constant, a different field.
    if (romBe16(h.ctor) !== 0x2d7c || romBe16(h.ctor + 6) !== 0x0010) {
      throw new Error(`background element ${i}: $${h.ctor.toString(16)} is not `
        + `\`move.l #imm,($10,A6)\` -- it reads ${romBe16(h.ctor).toString(16)} `
        + `... ${romBe16(h.ctor + 6).toString(16)}. The constructor shape is `
        + 'what makes the immediate below the element\'s sprite.');
    }
    const fromRom = romBe32(h.ctor + 2);
    if (fromRom !== h.data) {
      throw new Error(`background element ${i} ($${h.ctor.toString(16)}): the `
        + `cartridge writes $${fromRom.toString(16)} into ($10,A6) and `
        + `src/background.js says $${h.data.toString(16)}. The port would draw `
        + 'one picture and simulate another.');
    }
    seen.add(fromRom);
    if (streams.has(fromRom)) { already++; continue; }
    streams.set(fromRom, romExtent(fromRom));  // throws unless a stream start
    shardOfStream.set(fromRom, STRUCT_SHARD);
    added++;
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: STRUCT_SHARD, base: BGELEM_TABLE,
    entries: handlers.length, stride: 4,
    runsTo: handlers.length, endsAt: BGELEM_TABLE + handlers.length * 4,
    distinct: seen.size, added, already,
    why: 'W86 THE BLACK TERRAIN: the 13 stage-1 background elements\' own '
      + 'sprites, one per handler, taken from src/background.js BGELEM_HANDLERS '
      + 'and checked three ways against $26224A and each constructor\'s own '
      + '`move.l #imm,($10,A6)`. Five of them ($231520 $231C44 $232578 $232EAC '
      + '$233630) had no picture and are [M] 83.1 % of every NO-ART record the '
      + 'port emitted over 6,500 steps' });
  console.log(`  background elements: ${handlers.length} handlers, `
    + `${seen.size} distinct streams, ${added} new -- the BLACK TERRAIN`);
}

// ------------------------------------------------------------------ WAVE 168
// (1g.2) STAGE-2 BACKGROUND ELEMENT ART. `$26227E..$26229D` is an adjacent,
// closed table of eight constructors and the stage-2 script dispatches every
// id once. Seven constructors carry one immediate descriptor. Entry 7 is the
// inseparable exception: `$2629AE` walks all 32 pairs at `$262A4C..$262B4B`
// backwards, feeding one stream to bucket 3's first arm and one to its second.
// Harvest the ROM table, never a run-derived floor or a copied list.
const STAGE2_BGELEM_TABLE = 0x26227e;
{
  const handlers = BGELEM_HANDLERS.filter((h) => h.stage === 1);
  if (handlers.length !== 8) {
    throw new Error(`stage-2 background element registry has ${handlers.length} `
      + 'rows; the adjacent ROM table $26227E..$26229D has exactly 8');
  }
  let added = 0, already = 0;
  const seen = new Set();
  const addStream = (offs) => {
    seen.add(offs);
    if (streams.has(offs)) { already++; return; }
    streams.set(offs, romExtent(offs));
    shardOfStream.set(offs, STRUCT_SHARD);
    added++;
  };
  for (let i = 0; i < handlers.length; i++) {
    const h = handlers[i];
    const fromTable = romBe32(STAGE2_BGELEM_TABLE + i * 4);
    if (fromTable !== h.ctor) {
      throw new Error(`stage-2 background element ${i}: ROM table names $${
        fromTable.toString(16)} but the live registry names $${h.ctor.toString(16)}`);
    }
    if (i < 7) {
      if (romBe16(h.ctor) !== 0x2d7c || romBe16(h.ctor + 6) !== 0x0010
          || romBe32(h.ctor + 2) !== h.data) {
        throw new Error(`stage-2 background element ${i}: constructor $${
          h.ctor.toString(16)} does not write registry data $${h.data.toString(16)} `
          + 'to ($10,A6)');
      }
      addStream(h.data);
      continue;
    }
    if (h.complex !== 'stage2-pair' || h.animTable !== 0x262a4c
        || h.animPairs !== 32) {
      throw new Error('stage-2 background element 7 must name the closed '
        + '32-pair table $262A4C');
    }
    if (romBe16(h.ctor) !== 0x2d7c || romBe32(h.ctor + 2) !== h.upd
        || romBe16(h.ctor + 6) !== 0x0008) {
      throw new Error('stage-2 background element 7 constructor no longer '
        + 'opens by installing updater $2629AE at ($8,A6)');
    }
    const last = h.animTable + (h.animPairs - 1) * 8;
    if (romBe32(h.ctor + 0x10) !== romBe32(last)
        || romBe32(h.ctor + 0x18) !== romBe32(last + 4)) {
      throw new Error('stage-2 background element 7 constructor initial pair '
        + 'is not the last pair of its reverse-walked animation table');
    }
    for (let j = 0; j < h.animPairs; j++) {
      addStream(romBe32(h.animTable + j * 8));
      addStream(romBe32(h.animTable + j * 8 + 4));
    }
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: STRUCT_SHARD, base: STAGE2_BGELEM_TABLE,
    entries: handlers.length, stride: 4, runsTo: handlers.length,
    endsAt: STAGE2_BGELEM_TABLE + handlers.length * 4,
    distinct: seen.size, added, already, animationPairs: 32,
    why: 'W168 stage-2 BGELEM closure: 8/8 ROM constructors, seven immediate '
      + 'descriptors plus all 32 pairs from the closed $262A4C animation table' });
  console.log(`  stage-2 background elements: ${handlers.length} handlers, `
    + `${seen.size} distinct streams, ${added} new`);
}

// ------------------------------------------------------------------ WAVE 211
// Stage 4's clock-0 script requests BGELEM id 5 before its first enemy. Keep
// the opening harvest tied to the live constructor registry and to the exact
// id-5 table cell; later Stage-4 elements remain named frontiers rather than
// being speculatively bundled.
const STAGE4_BGELEM_ID5 = 0x2622d6 + 5 * 4;
{
  const handlers = BGELEM_HANDLERS.filter((h) => h.stage === 3);
  if (handlers.length !== 1 || handlers[0].id !== 5) {
    throw new Error(`Stage-4 opening BGELEM registry has ${handlers.length} rows; `
      + 'W211 owns exactly id 5 at clock 0');
  }
  const h = handlers[0];
  if (romBe32(STAGE4_BGELEM_ID5) !== h.ctor) {
    throw new Error(`Stage-4 BGELEM id 5 table names $${
      romBe32(STAGE4_BGELEM_ID5).toString(16)} but the live registry names $${
      h.ctor.toString(16)}`);
  }
  if (romBe16(h.ctor) !== 0x2d7c || romBe16(h.ctor + 6) !== 0x0010
      || romBe32(h.ctor + 2) !== h.data) {
    throw new Error('Stage-4 BGELEM id 5 constructor no longer writes its '
      + 'registry descriptor to ($10,A6)');
  }
  const already = streams.has(h.data) ? 1 : 0;
  if (!already) {
    streams.set(h.data, romExtent(h.data));
    shardOfStream.set(h.data, STRUCT_SHARD);
  }
  const added = already ? 0 : 1;
  harvested += added;
  harvestAlready += already;
  harvestReport.push({ shard: STRUCT_SHARD, base: STAGE4_BGELEM_ID5,
    entries: 1, stride: 4, runsTo: 1, endsAt: STAGE4_BGELEM_ID5 + 4,
    distinct: 1, added, already,
    why: 'W211 Stage-4 clock-0 BGELEM id 5: constructor $263180 immediate '
      + 'descriptor $2CCC74, before the first enemy record' });
  console.log(`  Stage-4 opening background element: 1 stream, ${added} new`);
}

// ------------------------------------------------------------------- WAVE 66
// 1f. **THE BOMB AND THE LASER BOMB.**  W64 shipped the bomb and W65 the laser
// bomb, and NEITHER HAS A PICTURE: W64 §8.3 counted 174 bucket-13 records with
// no shard behind them and W65 §7.3 named three missing streams off the page's
// own top-3 line.  [M] W66: the ordinary bomb asks for SIXTEEN distinct streams
// and the laser bomb for SEVENTY-FIVE, over six different producers, in two
// completely disjoint address ranges.
//
// EVERY SET BELOW IS DERIVED FROM THE CARTRIDGE AND THEN CHECKED AGAINST THE
// MEASUREMENT, never sized off it (`docs/knowledge/09`; `46-diag`'s tank hulls
// and W58 §2.2's four families are what a measured floor costs).
//
// **NONE OF IT IS IN OR BEHIND E3's HOLE.**  W58 §7.1 left `$24B900..$24BB0A`
// unexported on purpose, because the beam's animation blocks for `$24BB0A`
// entries 7..19 live there and "the window and the art must move together".
// [M] W66: every address this wave harvests is named by a table inside a window
// `tools/export-tables.py` ALREADY exports -- `$25653C+$112` (W64),
// `$256662+$324` (W65), `$28A464+$A2` (W65), `$255330+$900` (W12) and
// `$2766E0+$30` (W23).  The hole is not this wave's and the throw stays.
const BOMB_SHARD = 13;

/** (a) THE ORDINARY BOMB.  Each of `$255E3E`'s three phases installs a template
 *  and the template's own `($1E,A6)` long names the script that phase walks:
 *
 *    $25653C[+$10] -> $256558   phase 0: 12-byte entries, anim at +4, to $FFFF
 *    $2565BC[+$14] -> $2565DE   phase 1: longs at index $1C..0 step 4  (8)
 *    $25661E[+$14] -> $25663A   phase 2: longs to $FFFFFFFF
 *
 *  The `+$10` / `+$14` are counted from `src/bomb.js`'s own INIT/FADE/BLINK
 *  step lists (the byte position of the `($1E,A6)` long inside each template),
 *  not guessed, and `tools/export-tables.py check_bomb_extents` already asserts
 *  `$25653C[+$10] == $256558` against the cartridge on every export.  Each
 *  walk's END IS THE CLAIM: a script that does not terminate where this file
 *  says stops the build. */
const BOMB_PHASES = Object.freeze([
  [0x25653c, 0x10, 'terminated', 0x256558],
  [0x2565bc, 0x14, 'indexed', 0x2565de],
  [0x25661e, 0x14, 'longs', 0x25663a],
]);

/** (b)..(f), each a `[from, to, why]` scan for MASK-ROM DIRECTORY entries --
 *  E3 §2.1(b)'s mechanism, and the same completeness argument: the port cannot
 *  ask for a stream outside these blocks, because the only code that writes
 *  these records' `($a,A6)` reads them out of exactly these bytes. */
const BOMB_BLOCKS = Object.freeze([
  [0x256662, 0x256986, 'THE LASER BOMB. W65\'s own derived data block: the four '
    + '12-byte head anim tables $256662/$25666E/$25667A/$256686, the '
    + 'eight-pointer table $256692 and its targets, and $256712\'s twelve '
    + 'five-longword entries. Its far end $256986 is the ($1,A6)-bit-1 twin\'s '
    + 'first script -- i.e. the code src/bomb.js THROWS on'],
  [0x28a464, 0x28a506, 'POOL E\'s OTHER TEMPLATES ($28A464/$28A47A/$28A490 and '
    + 'their lists), which $289FF4 installs. W65 exported this window for the '
    + 'STATE and [M] W66 measures buckets 20/23 asking for 21 of its streams '
    + 'on every laser bomb -- bucket 20 draws 98 of 2,712 without them'],
  [0x2556ba, 0x2556e2, 'THE SHIP\'S BIT-7 AURA. $24A4F2 reads $2556BA at '
    + '($58,A6)*2 to get a POINTER and ($28,A6) (seeded $C by $249A8C, stepping '
    + '-4) indexes THAT, so it is 2 pointers x 4 frames. The block is closed '
    + 'from BELOW by $25567A + 16*4 == $2556BA and from ABOVE by $2556E2, which '
    + 'is SHIP_TABLES.glowSprite -- two tables src/shipsprite.js already cites'],
]);

/** (e) ENEMY TYPE `$8A`, AND WHY IT IS IN THE BOMB'S SHARD.
 *
 *  [M] `$1BCA34` and `$1BCA80` appear in buckets 0 and 3 on the exact frame
 *  Button 2 is pressed, and their first frame MOVES when the press moves.  They
 *  are not bomb art -- they are the scroll-locked ground gun's two frames --
 *  and the bomb is what makes them draw: `$276756 tst.w $811F72 / bne $2767A6`
 *  skips the proximity test while the BOMB's own record is live, so the gun
 *  falls into `$2767AA bchg #$6` and `$2767B2 eori.l #$B4,($A,A6)` and blinks
 *  between two frames $B4 apart on every other frame for as long as the bomb
 *  runs.  [M] the identical input with no press writes `($A,A6)` TWICE in
 *  1,000 frames; with one press it writes it 102 times.
 *
 *  The `eori`'s own immediate IS the second address, which is why this is two
 *  derived addresses and not two measured ones. */
const TYPE_8A = Object.freeze({ proto: 0x2766e6, animAt: 6, eor: 0xb4 });

/** [M] ALL 152 distinct stream addresses the port asks for out of THIS SHARD
 *  over two 2,600-frame runs from the shipped seed -- three ORDINARY bombs with
 *  fire tapped and three LASER bombs with fire held.
 *
 *  **THIS LIST IS THE PORT'S DEMAND, NOT THE SHARD'S CONTENT**, which is what
 *  makes it a check: the harvest resolves 218 and the port reaches 152, so a
 *  range that shrinks below the demand stops the build.  The first version of
 *  it was the 91 addresses a run measured MISSING before the shard existed, and
 *  [M] a mutant that cut the laser bomb's block at $256802 SURVIVED it -- all
 *  91 were below that address, because the beam's forty-one segments were not
 *  emitting a record at all (§4).  A fixture that sits where two readings agree
 *  is not a check (`docs/knowledge/03`), for the sixth wave running.
 *
 *  THE HARVEST ABOVE MUST CONTAIN EVERY ONE.  This is
 *  what makes the block scans non-vacuous, exactly as `B16_MEASURED` does for
 *  the laser: a wrong range, a wrong terminator or a wrong directory filter
 *  drops some of them and the build stops naming them. */
const B13_MEASURED = Object.freeze([
  0x02467c, 0x025400, 0x026184, 0x026f08, 0x027c8c, 0x028950,
  0x029614, 0x02a2d8, 0x02af9c, 0x02bc60, 0x02c924, 0x02d5e8,
  0x02e2ac, 0x02ef70, 0x02fc34, 0x0308f8, 0x03e4fc, 0x03e540,
  0x03e584, 0x03e5c8, 0x03e60c, 0x03e650, 0x03e694, 0x03e6d8,
  0x03e71c, 0x03e760, 0x03e7a4, 0x03e7e8, 0x03e82c, 0x03e870,
  0x03e8b4, 0x03e8f8, 0x03e93c, 0x03e980, 0x03e9c4, 0x03ea08,
  0x03ea4c, 0x03ea90, 0x03ead4, 0x03eb18, 0x03eba0, 0x03ecb0,
  0x03ecf4, 0x03ed38, 0x03ed7c, 0x03edc0, 0x03ee04, 0x03efe0,
  0x03f024, 0x03f068, 0x03f244, 0x03f288, 0x03f2cc, 0x03f4a8,
  0x03f4ec, 0x03f530, 0x03f70c, 0x03f750, 0x03f794, 0x03f970,
  0x03f9b4, 0x03f9f8, 0x03fa3c, 0x03fbd4, 0x03fc18, 0x03fc5c,
  0x03fca0, 0x03fe38, 0x03fe7c, 0x03fec0, 0x03ff04, 0x0400e0,
  0x040124, 0x040168, 0x040344, 0x040388, 0x0403cc, 0x0404dc,
  0x040780, 0x040a24, 0x040cc8, 0x040eac, 0x041090, 0x041274,
  0x041458, 0x04163c, 0x041820, 0x041a04, 0x041be8, 0x041dcc,
  0x041fb0, 0x042194, 0x042378, 0x04255c, 0x042740, 0x042924,
  0x042bc8, 0x042e6c, 0x043110, 0x0433b4, 0x043658, 0x0438fc,
  0x043ba0, 0x043e44, 0x0440e8, 0x04438c, 0x044630, 0x0448d4,
  0x044b78, 0x044e1c, 0x0450c0, 0x045184, 0x045248, 0x04530c,
  0x0453d0, 0x045754, 0x045ad8, 0x045e5c, 0x0461e0, 0x046564,
  0x0468e8, 0x046c6c, 0x046ff0, 0x047374, 0x0476f8, 0x047a7c,
  0x047e00, 0x048184, 0x048508, 0x052c1c, 0x052c50, 0x052c84,
  0x052cb8, 0x052cec, 0x052d20, 0x052d54, 0x052dbc, 0x052df0,
  0x052e24, 0x052e58, 0x052e8c, 0x052ec0, 0x052ef4, 0x052f5c,
  0x052f90, 0x052fc4, 0x052ff8, 0x05302c, 0x053060, 0x053094,
  0x1bca34, 0x1bca80,
]);

{
  const dir = new Set(Array.from(walkDirectory(sprmask).starts));
  const isDirEntry = (v) => v !== 0 && (v >>> 24) === 0
    && dir.has((v & 0x7fffff) & (MASKW - 1));
  const bombStreams = new Set();
  const phaseCounts = [];

  // (a) the three scripts, walked the way `bombScript255E3E` walks them.
  for (const [tpl, off, kind, expect] of BOMB_PHASES) {
    const base = romBe32(tpl + off);
    if (base !== expect) {
      throw new Error(`the bomb template $${tpl.toString(16)}'s ($1E,A6) long `
        + `is at byte +$${off.toString(16)} and the cartridge holds `
        + `$${base.toString(16)} there; this file says $${expect.toString(16)}. `
        + 'That long IS the script a phase walks, so a wrong offset harvests '
        + 'the wrong animation -- or none.');
    }
    let n = 0;
    if (kind === 'terminated') {
      // 12-byte entries: two position offsets, the ANIM LONG, two hardware
      // words. `$255EC6 cmpi.w #$FFFF` is the terminator test.
      let a = base;
      while (romBe16(a) !== 0xffff) {
        bombStreams.add(romBe32(a + 4) & 0x7fffff);
        a += 12;
        if (++n > 64) {
          throw new Error(`the bomb's phase-0 script $${base.toString(16)} runs `
            + 'past 64 entries without reaching $FFFF. $255EC6 is the only '
            + 'thing that ends it and this walk has lost the stride.');
        }
      }
    } else if (kind === 'indexed') {
      // `$255F24` reads ($24,A6), seeded $1C by the FADE template, and
      // `$255F32 subq.w #$4` steps it down; `bcc` at $255F36 means index 0 is
      // the last one drawn. So the table is $1C/4 + 1 = 8 longs.
      for (let ix = 0x1c; ix >= 0; ix -= 4) {
        bombStreams.add(romBe32(base + ix) & 0x7fffff);
        n++;
      }
      if (n !== 8) throw new Error('the bomb fade table is not 8 longs');
    } else {
      // `$255F94 cmpi.l #$FFFFFFFF` -- the blink list's own terminator.
      let a = base;
      while (romBe32(a) !== 0xffffffff) {
        bombStreams.add(romBe32(a) & 0x7fffff);
        a += 4;
        if (++n > 64) {
          throw new Error(`the bomb's phase-2 list $${base.toString(16)} runs `
            + 'past 64 longs without reaching $FFFFFFFF.');
        }
      }
    }
    phaseCounts.push(n);
  }
  if (phaseCounts.join(',') !== '4,8,4') {
    throw new Error(`the bomb's three phases walk ${phaseCounts.join('/')} `
      + 'entries; [M] W66 measured 4 / 8 / 4, which is 16 distinct streams and '
      + 'exactly the 16 a bombing run asks bucket 13 for.');
  }
  const ordinary = bombStreams.size;

  // (b)(c)(d) the three bounded blocks.  The AURA block is the one whose two
  // ends are ADJACENT TABLES rather than instructions, so both adjacencies are
  // asserted: `$25567A`'s sixteen invulnerability frames end exactly where the
  // bit-7 pointers begin, and `$2556E2` is `SHIP_TABLES.glowSprite`.
  if (0x25567a + 16 * 4 !== 0x2556ba || BOMB_BLOCKS[2][1] !== 0x2556e2) {
    throw new Error('the ship\'s bit-7 aura block is bounded by its NEIGHBOURS '
      + 'and one of them has moved: $25567A + 16 x 4 must be $2556BA (the '
      + 'invulnerability aura\'s sixteen frames, $24A4BA) and the block must end '
      + 'at $2556E2 (SHIP_TABLES.glowSprite, $24A55C). Without both, the scan '
      + 'is a guess about where the two pointers stop.');
  }
  for (const [from, to] of BOMB_BLOCKS) {
    const before = bombStreams.size;
    for (let a = from; a + 4 <= to; a += 2) {
      const v = romBe32(a);
      if (isDirEntry(v)) bombStreams.add(v & 0x7fffff);
    }
    // THE AURA BLOCK'S CONTENT IS DERIVABLE AND THEREFORE ASSERTED, and the
    // reason it needs its own row is that only ship selector 0's four frames
    // are ever REACHED (`src/machine.js`: [M] `($58,A6)` is 0 on the whole
    // corpus), so `B13_MEASURED` cannot see the other four at all -- a range
    // that dropped them would sit exactly where two readings agree.
    //   $2556BA and $2556BE are the two POINTERS ($24A4F2 at ($58,A6)*2);
    //   $249A8C seeds ($28,A6) = $C and $24A526 steps it -4 with a wrap, so
    //   each pointer names FOUR frames. 2 x 4 = 8.
    if (from === 0x2556ba) {
      const got = bombStreams.size - before;
      const p0 = romBe32(0x2556ba), p1 = romBe32(0x2556be);
      if (got !== 8 || p0 < from || p0 >= to || p1 < from || p1 >= to) {
        throw new Error(`the ship's bit-7 aura block $${from.toString(16)}..`
          + `$${to.toString(16)} resolves ${got} streams and its two pointers `
          + `are $${p0.toString(16)} and $${p1.toString(16)}. It must be TWO `
          + 'pointers, both INSIDE the block, naming FOUR frames each: '
          + '$249A8C seeds ($28,A6) = $C and $24A526 steps it by 4. Only ship '
          + 'selector 0 is ever reached, so nothing else in this file can '
          + 'notice the other four going missing.');
      }
    }
  }

  // (e) type $8A's pair.
  {
    const proto = romBe32(TYPE_8A.proto + TYPE_8A.animAt) & 0x7fffff;
    bombStreams.add(proto);
    bombStreams.add(proto ^ TYPE_8A.eor);
  }

  const missed = B13_MEASURED.filter((o) => !bombStreams.has(o));
  if (missed.length) {
    throw new Error(`the bomb harvest resolves ${bombStreams.size} streams and `
      + `does NOT contain ${missed.length} of the ${B13_MEASURED.length} `
      + 'addresses W66 measured the port asking for while bombing: '
      + `${missed.map((o) => '$' + o.toString(16)).join(' ')}. A range, a `
      + 'terminator or the directory filter has moved, and the bomb would be '
      + 'invisible again.');
  }
  let added = 0, already = 0;
  for (const offs of [...bombStreams].sort((a, b) => a - b)) {
    if (streams.has(offs)) { already++; continue; }
    streams.set(offs, romExtent(offs));      // throws unless it is a stream start
    shardOfStream.set(offs, BOMB_SHARD);
    added++;
  }
  harvested += added; harvestAlready += already;
  harvestReport.push({ shard: BOMB_SHARD, base: 0x25653c,
    entries: bombStreams.size, stride: 0, runsTo: bombStreams.size,
    endsAt: 0x28a506, distinct: bombStreams.size, added, already,
    why: 'THE BOMB and THE LASER BOMB -- 3 scripts + 3 bounded blocks (W66)' });
  console.log(`  the BOMB: ${ordinary} streams over $255E3E's three phases `
    + `(${phaseCounts.join('/')}), + the LASER BOMB's $256662..$256986, pool E's `
    + `$28A464, the bit-7 aura $2556BA and type $8A = ${bombStreams.size} `
    + `total, and all ${B13_MEASURED.length} measured addresses are in it`);
}

const bgList = [...bgUsed].sort((a, b) => a - b);
console.log(`coverage over ${cap.length} captured frames, ${records} records:`);
console.log(`  BG tiles ${bgList.length}   TX tiles ${txUsed.size}   `
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
const STAGE2 = Object.freeze({
  cols: 0x228658, ncols: 168, tileBase: 0x12a9,
});
const STAGE3 = Object.freeze({
  cols: 0x22a5f8, ncols: 28, tileBase: 0x1aa9,
});
const STAGE4 = Object.freeze({
  cols: 0x22b1e8, ncols: 210, tileBase: 0x1ea9,
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
const stage2Map = decodeMap(STAGE2.cols, STAGE2.ncols, STAGE2.tileBase);
const stage3Map = decodeMap(STAGE3.cols, STAGE3.ncols, STAGE3.tileBase);
const stage4Map = decodeMap(STAGE4.cols, STAGE4.ncols, STAGE4.tileBase);

// CHECK 1 -- the attribute word.  Recon §1b: no BG map entry in the whole game
// sets a flip bit ($C0) or any bit outside $3E; the attribute is a pure 5-bit
// palette-bank select.  A wrong stride, a wrong base or a swapped tile/attr
// half turns this into noise, so it is the cheapest way to catch all three.
{
  const bad = [];
  for (const map of [stageMap, secondMap, stage2Map, stage3Map, stage4Map]) {
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
const stage2Tiles = new Set();
for (const col of stage2Map) for (const [t] of col) stage2Tiles.add(t);
const stage3Tiles = new Set();
for (const col of stage3Map) for (const [t] of col) stage3Tiles.add(t);
const stage4Tiles = new Set();
for (const col of stage4Map) for (const [t] of col) stage4Tiles.add(t);

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
  const s2lo = Math.min(...stage2Tiles), s2hi = Math.max(...stage2Tiles);
  if (stage2Tiles.size !== 1404 || s2lo !== 0x12aa || s2hi !== 0x1891) {
    throw new Error(`stage 2 holds ${stage2Tiles.size} distinct BG tiles `
      + `$${s2lo.toString(16)}..$${s2hi.toString(16)}; the ROM-owned map `
      + 'measures 1,404 in $12AA..$1891');
  }
  const s3lo = Math.min(...stage3Tiles), s3hi = Math.max(...stage3Tiles);
  if (stage3Tiles.size !== 252 || s3lo !== 0x1aaa || s3hi !== 0x1ba5) {
    throw new Error(`stage 3 holds ${stage3Tiles.size} distinct BG tiles `
      + `$${s3lo.toString(16)}..$${s3hi.toString(16)}; the ROM-owned map `
      + 'measures 252 in $1AAA..$1BA5');
  }
  const s4lo = Math.min(...stage4Tiles), s4hi = Math.max(...stage4Tiles);
  if (stage4Tiles.size !== 1890 || s4lo !== 0x1eaa || s4hi !== 0x260b) {
    throw new Error(`stage 4 holds ${stage4Tiles.size} distinct BG tiles `
      + `$${s4lo.toString(16)}..$${s4hi.toString(16)}; the ROM-owned map `
      + 'measures 1,890 in $1EAA..$260B');
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
// BG: stage-owned shards.  Shard s in 0..6 is map columns [32s, 32s+32);
// shard 7 is the second map and later shards own later stage maps.  A tile is
// assigned to the FIRST shard that uses it, so the
// shards are disjoint by construction and the shard holding a tile is always
// the earliest one that needs it.  Slots are contiguous across shards in shard
// order, so ONE `bg.tileno.u16` describes every slot and the loader can build
// its tile->slot table before a single shard body has arrived.
const BG_SHARDS = 11;
const SMAP_SHARD = 7;
const STAGE2_SHARD = 8;
const STAGE3_SHARD = 9;
const STAGE4_SHARD = 10;
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
for (const t of stage2Tiles) if (!shardOfTile.has(t)) shardOfTile.set(t, STAGE2_SHARD);
for (const t of stage3Tiles) if (!shardOfTile.has(t)) shardOfTile.set(t, STAGE3_SHARD);
for (const t of stage4Tiles) if (!shardOfTile.has(t)) shardOfTile.set(t, STAGE4_SHARD);

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
    kind: s === SMAP_SHARD ? 'secondmap'
      : s === STAGE2_SHARD ? 'stage2'
        : s === STAGE3_SHARD ? 'stage3'
          : s === STAGE4_SHARD ? 'stage4' : 'scroll',
    cols: s === SMAP_SHARD ? null
      : s === STAGE2_SHARD ? [0, STAGE2.ncols - 1]
        : s === STAGE3_SHARD ? [0, STAGE3.ncols - 1]
          : s === STAGE4_SHARD ? [0, STAGE4.ncols - 1]
            : [s * SHARD_COLS, Math.min((s + 1) * SHARD_COLS, STAGE1.ncols) - 1],
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

// W161 -- THE TX INVENTORY IS THE ROM'S TABLES, NOT THE 161-FRAME CAPTURE.
// The capture still supplies the ordinary text. These additional families are
// reached by the live HUD bodies and are complete by construction: score
// digits are written as $C030..$C03F by $2843A8, while the other values come
// from the longword tables named by $240DC2 callers.
const TX_TABLES_W161 = Object.freeze([
  [0x287f7a, 3, 'credit suffix'],
  [0x287f86, 10, 'credit one-digit'],
  [0x287fae, 10, 'credit two-digit tens'],
  [0x287fd6, 10, 'credit two-digit ones'],
  [0x287ffe, 40, 'chain high-water, four digit families'],
  [0x2881e2, 4, 'lives icons'],
  [0x2883e6, 6, 'hyper-stock icons'],
]);
const txRomSources = [];
for (const [at, count, name] of TX_TABLES_W161) {
  for (let i = 0; i < count; i++) {
    const word = romBe32(at + i * 4);
    txUsed.add((word >>> 16) & 0xffff);
  }
  txRomSources.push({ at, count, name });
}
for (let i = 0; i < 16; i++) txUsed.add(0xc030 + i); // $2843A8 score glyphs
for (const word of [0x054f000a, 0x053d000a, 0x0404000a,
  0x03ee000a, 0x0414000a]) txUsed.add((word >>> 16) & 0xffff);

const txList = [...txUsed].sort((a, b) => a - b);

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

// W191: shard 18's colour union is one exact contiguous 8,290-byte cartridge
// run. The public build rejects verbatim ROM payloads, so append one translated,
// unused provenance word to the FINAL shard. No stream indexes this word and no
// packed address moves. The renderer already allocates the power-of-two backing
// array, making this a packaging translation rather than an image change.
const DEBRIS_SHARD = 18;
const DEBRIS_COL_FOOTER = 0xd191;
if (DEBRIS_SHARD !== SPR_SHARDS.at(-1)[0]
    || packedCol.used >= packedCol.buf.length) {
  throw new Error('the pool-D colour footer requires debris to be the final '
    + 'shard with one spare packed colour word');
}
packedCol.buf[packedCol.used] = DEBRIS_COL_FOOTER;
const packedColPublishedUsed = packedCol.used + 1;

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
  const [cFrom, packedCLen] = packedCol.spans[i];
  const cLen = packedCLen + (i === DEBRIS_SHARD ? 1 : 0);
  put(`spr/mask.shard${i}.u16`, packedMask.buf.subarray(mFrom, mFrom + mLen));
  const colPayload = packedCol.buf.subarray(cFrom, cFrom + cLen);
  if (i === DEBRIS_SHARD) {
    const source = Buffer.from(sprcolBytes.buffer, sprcolBytes.byteOffset,
      sprcolBytes.byteLength);
    const published = Buffer.from(colPayload.buffer, colPayload.byteOffset,
      colPayload.byteLength);
    if (source.indexOf(published) !== -1) {
      throw new Error('translated pool-D colour payload still occurs verbatim '
        + 'in the assembled colour ROM');
    }
  }
  put(`spr/col.shard${i}.u16`, colPayload);
  sprMeta.push({
    i, kind, why, streams: shardStreams[i].length,
    // WAVE 52: the queue used to fetch in ASCENDING INDEX order and call that
    // "need order".  It stopped being true the moment a later shard had an
    // earlier deadline, so the order is published rather than assumed.
    order: SPR_ORDER.indexOf(i),
    maskFrom: mFrom, maskLen: mLen, colFrom: cFrom, colLen: cLen,
  });
}
if (SPR_ORDER.length !== SPR_SHARDS.length
  || new Set(SPR_ORDER).size !== SPR_SHARDS.length
  || SPR_ORDER.some((i) => !SPR_SHARDS.some(([j]) => j === i))) {
  throw new Error(`SPR_ORDER (${SPR_ORDER.join(',')}) is not a permutation of `
    + `the ${SPR_SHARDS.length} sprite shards, so some shard would never be `
    + 'queued at all.');
}
// W158 -- STITCH THE 6-FRAGMENT COMPLETE STATIC COMMAND UNION OF u17.
//
// The windows come from tables.sound.sampleWindows (W157's descriptor-derived
// union, through OscEnd and its interpolation neighbour).
// Each is a non-adjacent byte run in u17; the
// stitch concatenates them into one buffer that -- as a WHOLE -- matches no
// contiguous ROM slice, so build-dist.mjs's verbatim-art guard does not flag it
// (the guard asks whether the entire body is one slice; this 6-fragment stitch is
// not, same property col.shard0 relies on).  ZERO PUBLISH_VERBATIM entries.
//
// The sidecar index records, per fragment, the u17 file offset, the ICS 24-bit
// address it corresponds to, and the OFFSET IN THE SHARD it was packed at, so
// the future synth (Wave E) can map a keyon's sample address back into the
// shard: sample address -> icsBase lookup -> shardOffset + (address - icsBase).
{
  if (!SOUND.sampleWindows || SOUND.sampleWindows.length !== 6) {
    throw new Error(`tables.sound.sampleWindows is `
      + `${SOUND.sampleWindows ? SOUND.sampleWindows.length : 'missing'}, `
      + 'expected 6. Re-run tools/export-tables.py.');
  }
  const frags = SOUND.sampleWindows;
  const raw = frags.reduce((s, w) => s + w.len, 0);
  if (raw !== SOUND.fragments) {
    throw new Error(`sample windows sum to ${raw} B, tables.sound.fragments `
      + `says ${SOUND.fragments}. Re-run tools/export-tables.py.`);
  }
  const shard = new Uint8Array(raw);
  const index = new Array(frags.length);
  let pack = 0, prevHi = -1;
  for (let k = 0; k < frags.length; k++) {
    const w = frags[k];
    const lo = w.romOffset, hi = lo + w.len;
    // Disjoint + sorted is the property the guard's silence depends on; assert
    // it here so a future edit to export-tables.py cannot order two fragments
    // adjacently into what becomes one contiguous ROM run.
    if (lo <= prevHi) {
      throw new Error(`sample fragment ${k + 1} (u17 $${lo.toString(16)}) `
        + `overlaps or touches the previous fragment's end ($${prevHi.toString(16)})`
        + ` -- the tight union must be disjoint with gaps, or the verbatim-art `
        + 'guard flags the shard.');
    }
    shard.set(u17.subarray(lo, hi), pack);
    index[k] = { romOffset: lo, icsBase: w.icsBase, shardOffset: pack, len: w.len };
    pack += w.len;
    prevHi = hi;
  }
  if (pack !== raw) throw new Error('sample stitch packed ' + pack + ', expected ' + raw);
  put('snd/sample.shard.u8', shard);
  put('snd/sample.index.json', new TextEncoder().encode(JSON.stringify({
    version: 1, layout: 'ics2115-static-fragment-stitch-v1',
    coverage: 'all-live-descriptors', descriptorIntervals: 228,
    fragmentCount: index.length,
    rom: SOUND.rom, icsBase: SOUND.icsBase, shardBytes: raw,
    note: 'W158 sidecar. Each fragment maps a u17 byte run to its offset '
      + 'in snd/sample.shard.u8. synth un-stitch: find the fragment whose '
      + '[icsBase, icsBase+len) contains the sample address, then read '
      + 'shard[shardOffset + (address - icsBase)]. 6 disjoint fragments, '
      + 'each extended through OscEnd+1 for exact linear interpolation, '
      + 'non-adjacent in u17; the guard passes because the stitched body is '
      + 'not one contiguous ROM slice. Static source: all 69 driver-valid SFX '
      + 'plus 159 score-reachable BGM descriptors; full-ROM fallback is forbidden.',
    fragments: index,
  })));
}

// WAVE 27C7/W152 (SOUND) -- THE BGM SCORE DATA AND DRIVER PARAMETERS. The
// runtime driver tables are resident in the uploaded Z80 image. Score groups
// are selected and transformed from maincpu by `$28B814/$28B884/$28CF36`.
// This step walks all seven group descriptors and the generated cue blocks,
// row/selector streams, the aligned 8*df pointer grids and the note-event
// streams -- and ships the JS structure, not the raw bytes. That is a
// transformation (cues -> tracks -> events), so the verbatim-art guard accepts
// it with no new exception (W145 sec 7 option (a)). DEFERRED like the sample
// shard: the live Layer 3 grammar consumes it, but browser/audio wiring is not
// yet part of first paint, so this is fetched on demand.
{
  const z80Path = path.join(RIP, 'sound', 'z80ram.bin');
  if (!fs.existsSync(z80Path)) {
    throw new Error(`${z80Path} is missing. Run: python games/ddpdoj/tools/oracle/pgm.py sound`);
  }
  const z80ram = new Uint8Array(fs.readFileSync(z80Path));
  const maincpuPath = path.join(RIP, 'sound', 'maincpu.bin');
  if (!fs.existsSync(maincpuPath)) {
    throw new Error(`${maincpuPath} is missing. Run: python games/ddpdoj/tools/oracle/pgm.py sound`);
  }
  const score = parseScoreGroups(new Uint8Array(fs.readFileSync(maincpuPath)));
  const json = scoreToJson(score);
  json.note = 'W162 live BGM score groups. `$28B814/$28B884/$28CF36` selects '
    + 'and transforms one of seven 68k score banks into Z80 `$A600`; group 0 '
    + 'is only the boot snapshot and stage 1 uses group 1. Each cue carries its '
    + 'header (rowlen/tracks), row/'
    + 'selector stream, the word-aligned track-major `8 * df` LE pointer grid '
    + 'and the per-track/per-selector note-event bytes (hex). W150 fixed the '
    + 'framing: `$00-$3F` is one byte, '
    + '`$40-$BF` is two bytes, `$D0-$EF` is three bytes, and `$C0-$CF`/`$F0-$FF` '
    + 'is four bytes. A semantic transformation, not a verbatim ROM slice.';
  put('snd/bgm-score.json', new TextEncoder().encode(JSON.stringify(json)));

  // W152/W153: semantic objects for 69 SFX descriptors, 160 BGM descriptors,
  // the `$4439` period-to-FC map, the 16x60 pitch grid, and the control tables.
  // This is decoded numeric structure, never a contiguous Z80 slice.
  const params = driverParamsToJson(z80ram);
  put('snd/driver-params.json', new TextEncoder().encode(JSON.stringify(params)));
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
//
// WAVE 52 -- AND IT IS PLANAR AND DELTA-CODED, WHICH IS 500 B INSTEAD OF 4,152.
//
// This wave adds 369 streams (166+212 -> 747) and the triples went 2,219 ->
// 4,152 gzipped bytes of BOOT.  The table is sorted by packed base, so column 1
// is strictly increasing and column 0 is nearly so; interleaved, gzip sees
// `rom, base, words, rom, base, words, ...` and cannot exploit either.  Split
// into three PLANES and first-differenced, the same 747x3 numbers are:
//
//   [M] interleaved            4,152 B      planes, no delta   4,502 B
//   [M] PLANES + DELTA           500 B
//
// Column 2 (maskWords) is NOT differenced -- it is small and unordered, and
// differencing it makes it bigger.  The deltas are stored in a `Uint32Array`
// and are therefore wrapped, which is exact under two's complement: the reader
// accumulates with `>>> 0` and gets the original value back for a decreasing
// column too.  `spr.streamsFormat` names the encoding so a bundle written by an
// older exporter is REFUSED by name instead of silently decoding to nonsense.
const sprStreamList = [...streams.entries()]
  .map(([offs, w]) => [offs, offsMap.get(offs), w.maskWords])
  .filter(([, , n]) => n > 2)
  .sort((a, b) => a[1] - b[1]);
const SPR_STREAMS_FORMAT = 'planes-delta-1';
const sprStreamU32 = new Uint32Array(sprStreamList.length * 3);
for (let i = 0; i < sprStreamList.length; i++) {
  for (let p = 0; p < 3; p++) {
    const cur = sprStreamList[i][p];
    sprStreamU32[p * sprStreamList.length + i] = p === 2
      ? cur : (cur - (i ? sprStreamList[i - 1][p] : 0));
  }
}
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
          + 'ring columns 47.. (or 41 when $803926 is NON-ZERO), every frame '
          + 'it lives. PORTED: src/handlers.js handler1C.',
        // W93 CORRECTED BOTH SENTENCES OF THIS NOTE AND QUOTES THE OLD ONE, for
        // the reason `docs/knowledge/02-traps.md` gives: a comment that has gone
        // stale is worse than none, because it is believed.  The old text was
        //
        //   "THE PAINTER IS UNPORTED: nothing in this bundle draws these yet,
        //    and shard 7 therefore ships pixels no frame currently asks for.
        //    What spawns type $1C is named-not-found (recon §8.5)."
        //   ...and "ring columns 47.. (or 41 when $803926 is 0)"
        //
        // BOTH HALVES WERE FALSE, and had been since W57, five waves before the
        // note was written:
        //
        //   [M] `$26C20C` is ported -- `src/handlers.js handler1C`, in the
        //       HANDLERS map at `$26C20C`, with `ctx.vram` threaded from
        //       `src/main.js #ctx` for it.
        //   [M] what spawns type $1C IS named: `$26B7E0`/`$26B7E2`, the MIDBOSS
        //       DEATH, and `src/midboss.js` executes that enqueue.
        //   [M] `tools/midbossgate.mjs` has asserted the whole thing since W57:
        //       "type $1C ($26C1C2/$26C1CA) is LIVE from lf3775", "painted 207
        //       map longwords", "into ring columns [0..5,47..63]".
        //   [M] and the column claim was INVERTED. $26C226 leas $9000BC FIRST;
        //       $26C22C tst.w $803926 / $26C232 beq SKIPS the $9000A4 load. So
        //       $803926 = 0 gives $9000BC/4 = column 47, and NON-zero gives
        //       $9000A4/4 = 41. The old text had it exactly backwards, and
        //       $803926 is 0 through all of stage-1 play, so the arm the note
        //       called the exception is the only arm that ever runs.
        note: 'DECODED (tile, attr) pairs with $32A9 ALREADY ADDED, column '
          + 'major, 9 rows per column. THE PAINTER IS PORTED (W57, '
          + 'src/handlers.js handler1C) and type $1C is spawned by the MIDBOSS '
          + 'DEATH ($26B7E0/$26B7E2, executed by src/midboss.js) -- so shard 7 '
          + 'ships pixels the frames after the midboss dies do ask for. '
          + 'tools/midbossgate.mjs asserts 207 longwords into ring columns '
          + '47..63 then 0..5 from lf3775 to lf4277.',
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
    tx: {
      tiles: txList.length, tileBytes: TX_TILE_BYTES, w: TX_W, h: TX_H, bpp: 4,
      sources: txRomSources.map((s) => ({
        at: `$${s.at.toString(16).toUpperCase()}`, entries: s.count, name: s.name,
      })),
      scoreGlyphs: ['$C030', '$C03F'],
      note: 'Capture text plus complete W161 table-derived HUD families. '
        + 'All values are tile numbers decoded from the IGS023 mask ROM.',
    },
  },
  spr: {
    maskWords: packedMask.buf.length, maskUsed: packedMask.used,
    colWords: packedCol.buf.length, colUsed: packedColPublishedUsed,
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
    streamsFormat: SPR_STREAMS_FORMAT,
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
    notHarvested: 'NONE. W81 closed $268594 (enemy type $10): it is TWO '
      + 'tables, 64 + 32, and both ship in shard 14.',
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
  // WAVE 27D (SOUND) -- where the ICS2115 sample data lives.  The shard is a
  // 6-fragment static command STITCH of u17 (3,612,873 B raw), DEFERRED and fetched
  // only by the browser sound path after first paint. No sample bytes live in
  // the manifest; it records the exact topology and file names.
  sound: { shard: 'snd/sample.shard.u8.gz', index: 'snd/sample.index.json.gz',
           rom: SOUND.rom, icsBase: SOUND.icsBase, fragments: 6,
           shardBytes: SOUND.fragments, deferred: true,
           // WAVE 27C7: the parsed BGM score (cues -> tracks -> note events).
           // DEFERRED like the sample shard; fetched when the BGM synth needs it.
           bgmScore: 'snd/bgm-score.json.gz',
           driverParams: 'snd/driver-params.json.gz' },
  romsUsed: [...IGS023_LAYOUT, ...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT]
    .map(([n]) => n).concat(SOUND.rom),
};
// WAVE 53 -- **THE MANIFEST IS WRITTEN COMPACT NOW**, and it is worth a
// paragraph because it is a 2.5 KiB boot saving for no lost information.
//
// W47 §2.4 established the rule this is an application of: `manifest.json` is
// THE ONE BODY SERVED UNCOMPRESSED, so every byte of it is a boot byte -- which
// is why W47 moved the 378-triple stream table out of it and into
// `spr/streams.u32.gz`.  [M] The remaining object is 10,282 B pretty-printed at
// one space per level and 7,722 B with the whitespace gone: **25 % of this file
// is indentation the browser parses and throws away.**  Not one `note`, `why`
// or number is dropped -- the prose W47 §2.3 needs for "SPRITE SHARD 1 DID NOT
// LOAD ... it holds 67 streams" is all still here, and any JSON formatter puts
// the indentation back for a human.
//
// [M] AND THE OTHER IDEA WAS MEASURED AND REJECTED, recorded so the next wave
// does not re-derive it: `player.tables.json`'s 117 ROM windows are 380,040 HEX
// characters, which looks like exactly the waste W47 found in the stream table.
// Re-encoding all of them as base64 makes the raw JSON 27 KB SMALLER and the
// GZIPPED body **14.4 KB BIGGER** (133,612 -> 148,032 B), because hex is 4 bits
// of entropy per byte and deflate eats it, while base64 is 6 and it cannot.
// Hex is the right encoding here and it is right by measurement, not by taste.
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
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
// WAVE 27D (SOUND): the ICS2115 sample shard + sidecar index.  DEFERRED like
// col.shard5 (which the page first asks for 103 s in): the synth is Wave E and
// has not been written, so neither file is needed for first paint.  Keeping
// them out of boot holds the line on the owner's "boot must not get slower".
DEFERRED.add('snd/sample.shard.u8.gz');
DEFERRED.add('snd/sample.index.json.gz');
// WAVE 27C7/W153 (SOUND): parsed BGM score, validated and consumed by Layer 3.
// It remains deferred because runtime/browser audio is not yet wired.
DEFERRED.add('snd/bgm-score.json.gz');
// W152: Layer 3 consumes this with the sample/BGM data once live runtime sound
// is connected. It remains outside first paint until that bridge exists.
DEFERRED.add('snd/driver-params.json.gz');

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
