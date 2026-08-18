// W419 -- POOL C'S KIND GUARD, WHICH WAS NARROWER THAN THE CARTRIDGE, AND THE
// ART THAT GOES WITH IT.
//
// W415 found `handlers.js:2014` calling `spawnPoolC289B50(..., 8, ...)` for type
// $8E's death against a guard that read `(kind & $3C) !== 4 -> unreached`, and
// deliberately left it: opening the guard alone would have put ground marks on
// screen with no art, because the other families' streams were absent from the
// bundle entirely. That is the two-halves shape W414 and W417 each paid for.
// BOTH HALVES ARE HERE, and each is measured rather than argued.
//
// THE DOMAIN IS FOUR, NOT ONE AND NOT FIVE. The brief for this wave said the
// table has "real entries for kinds 0, 8, $C and $10". It is wrong twice, and
// section 1 is the correction: kind 4 IS one of the real entries (it is the one
// already ported), and $10 is NOT -- `$289DEA+$10..+$1C` are four copies of
// `$289E7A`, which is the KIND-0 TEMPLATE'S OWN LIST 0, not a template. Its
// first word is $0022, bit 15 CLEAR, so a record filled from it is born dead and
// `$289B80` never steps it. Reading padding as an entry is exactly the error the
// entry-to-entry rule exists to prevent, and here it would have shipped a fifth
// family that does not exist.
//
// THE CARTRIDGE STATES THE DOMAIN FROM THE CALLER SIDE TOO, which is the witness
// that makes this a bound and not a stride walk: `$267F4E cmpi.w #$3,D0 / bgt` +
// `$267F56 tst.w D0 / bmi` + two `add.w D0,D0` clamps a random draw to 0..3 and
// quadruples it, so ONE call site passes 0, 4, 8 and $C -- the whole domain and
// nothing above it. Section 2.
//
// WHAT THIS FILE WILL NOT DO. It does not assert "no throw". W418's six holds
// ran 30,000 frames clean while the game was stuck on one screen. Section 4
// reads the RECORD back frame by frame, as a whole trace, and section 5 asks the
// shipped bundle whether it can answer the offsets that record names, at the
// width the template's own size word demands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { AimTables } from '../src/aim.js';
import { UnportedLog } from '../src/unported.js';
import { handlerMap, TYPE_SPECS } from '../src/handlers.js';
import { spawnPoolC289B50, runPoolCDriver, POOL_C, C } from '../src/effects.js';
import { buildDisplayList, resetSpriteQueueCounters } from '../src/displaylist.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');

const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false
  : 'generated ROM tables absent; THIS IS A SKIP, NOT A PASS.';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false
  : 'the ROM image is absent; THIS IS A SKIP, NOT A PASS.';
const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => u16(a) * 0x10000 + u16(a + 2);
const hex = (a, n) => IMG.subarray(a, a + n).toString('hex');

// ---- the shipped bundle, read the way W414/W415 read it: straight out of
// assets/, so this file needs no HTTP shim and no capture.
const MANIFEST = path.join(R, 'assets', 'manifest.json');
function shipped() {
  if (!existsSync(MANIFEST)) return null;
  const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const file = path.join(R, 'assets', man.spr.streamsFile);
  if (!existsSync(file)) return null;
  const raw = gunzipSync(readFileSync(file));
  const a = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
  const n = man.spr.streamCount;
  assert.equal(a.length, n * 3, 'streams.u32 is streamCount x 3');
  // BOTH plane 0 and plane 1 are first-differenced; only plane 2 is raw. Reading
  // plane 1 without accumulating gives every stream a base of a few hundred,
  // which files them all under shard 0 and makes a shard assertion say nothing.
  // That is this wave's measurement trap and it cost a reading.
  let rom = 0, base = 0;
  const triples = [];
  for (let i = 0; i < n; i++) {
    rom = (rom + a[i]) >>> 0;
    base = (base + a[n + i]) >>> 0;
    triples.push([rom, base, a[2 * n + i]]);
  }
  const shardOfBase = (b) => {
    for (const s of man.spr.shards) {
      if (b >= s.maskFrom && b < s.maskFrom + s.maskLen) return s.i;
    }
    return -1;
  };
  const orderOf = new Map(man.spr.shards.map((s) => [s.i, s.order]));
  return {
    man,
    byRom: new Map(triples.map((t) => [t[0], t])),
    shardOfBase,
    orderOf,
    map: romToPackedMap({ spr: { streams: triples } }, shardOfBase),
  };
}
const SHIP = shipped();
const SKIP_SHEET = SHIP ? false
  : 'assets/ has not been exported (node tools/export-web.mjs); '
    + 'THIS IS A SKIP, NOT A PASS.';

const TABLE = 0x289dea;                     // src/effects.js POOL_C.templateTable
const TEMPLATES = [0x289e0a, 0x289e26, 0x289e42, 0x289e5e];  // kinds 0, 4, 8, $C
const POOLB_KIND7_CELL0 = 0x202614;         // W415's fireball, the relative yardstick

// ================ 1. THE TABLE, AND WHY IT IS FOUR ENTRIES DEEP =============

test('W419 $289DEA holds four templates and four copies of a LIST address',
  { skip: SKIP_IMG }, () => {
  // Thirty-two bytes, read once and asserted whole so a single moved long shows.
  assert.equal(hex(TABLE, 32),
    '00289e0a00289e2600289e4200289e5e00289e7a00289e7a00289e7a00289e7a');
  for (let i = 0; i < 4; i++) {
    assert.equal(u32(TABLE + i * 4), TEMPLATES[i], `+$${(i * 4).toString(16)}`);
  }
  // AND THE OTHER FOUR ARE THE SAME ADDRESS, WHICH IS NOT A TEMPLATE.
  for (const off of [0x10, 0x14, 0x18, 0x1c]) {
    assert.equal(u32(TABLE + off), 0x289e7a,
      `+$${off.toString(16)} is the padding pointer, not a fifth family`);
  }
  // $289E7A is the KIND-0 template's list 0. That is the positive witness that
  // it is data and not a header -- it is reachable from INSIDE $289E0A.
  assert.equal(u32(TEMPLATES[0] + 0x10), 0x289e7a);
  // ...and read AS a template its status word is $0022. `$289DE0 move.w (A2)+,(A0)`
  // is what puts that word in the record, and the driver's `(status & $8000)`
  // test skips any record whose bit 15 is clear -- so kind $10 would allocate,
  // bump the live count and then never be stepped, culled or drawn.
  assert.equal(u16(0x289e7a), 0x0022);
  assert.equal(u16(0x289e7a) & 0x8000, 0, 'bit 15 CLEAR -- born dead');
});

test('W419 both fills index that table by `kind & $3C` as a BYTE offset',
  { skip: SKIP_IMG }, () => {
  // $289B50's fill. `02 43 00 3C` is `andi.w #$3C,D3` and `24 72 30 00` is
  // `movea.l (0,A2,D3.w),A2` -- D3 is used UNSCALED, so index $10 is the fifth
  // long, which is what makes the padding reachable at all.
  assert.equal(hex(0x289dd2, 4), '0243003c');
  assert.equal(hex(0x289dd6, 4), '45fa0012');            // lea (18,PC),A2
  assert.equal(0x289dd8 + 0x12, TABLE, 'PC-relative from the EXTENSION WORD');
  assert.equal(hex(0x289ddc, 4), '24723000');
  // $289AF4's fill is the same three instructions with a different displacement.
  assert.equal(hex(0x289c3e, 4), '0243003c');
  assert.equal(hex(0x289c42, 4), '45fa01a6');
  assert.equal(0x289c44 + 0x1a6, TABLE, 'the same table from the other fill');
  assert.equal(hex(0x289c48, 4), '24723000');
});

test('W419 the four templates are $1C bytes each and adjacent',
  { skip: SKIP_IMG }, () => {
  // The header is 16 bytes plus three list longs. Adjacency is a POSITIVE bound:
  // template n + $1C is template n+1, and template 3 + $1C is $289E7A, the first
  // list -- so the four are the whole family block and there is no fifth.
  for (let i = 0; i < 3; i++) assert.equal(TEMPLATES[i] + 0x1c, TEMPLATES[i + 1]);
  assert.equal(TEMPLATES[3] + 0x1c, 0x289e7a);
  // Each one's status word is $8000 | (kind & $3C): the template states its own
  // index, which is the cheapest possible check that none of them has moved.
  for (let i = 0; i < 4; i++) {
    assert.equal(u16(TEMPLATES[i]), 0x8000 | (i * 4));
    assert.equal(u16(TEMPLATES[i] + 0x0a), 0x000c, 'wrap $000C -- FOUR cells');
  }
});

// ================ 2. THE DOMAIN, STATED BY A CALLER =========================

test('W419 $267F4E clamps a random draw to 0..3 and quadruples it, so ONE site '
  + 'passes 0, 4, 8 and $C', { skip: SKIP_IMG }, () => {
  assert.equal(hex(0x267f48, 6), '4eb900259c42', 'jsr $259C42, the draw');
  assert.equal(hex(0x267f4e, 4), '0c400003');            // cmpi.w #$3,D0
  assert.equal(hex(0x267f52, 4), '6e000014');            // bgt
  assert.equal(hex(0x267f56, 2), '4a40');                // tst.w D0
  assert.equal(hex(0x267f58, 4), '6b00000e');            // bmi
  assert.equal(hex(0x267f5c, 2), 'd040');                // add.w D0,D0
  assert.equal(hex(0x267f5e, 2), 'd040');                // and again -- D0 * 4
  assert.equal(hex(0x267f60, 2), '7200');                // moveq #0,D1
  assert.equal(hex(0x267f62, 6), '4eb900289af4');
  // BOTH rejects land PAST the call, which is what makes 0..3 the whole domain
  // rather than a fast path with a fallback below it.
  assert.equal(0x267f54 + 0x14, 0x267f68);
  assert.equal(0x267f5a + 0x0e, 0x267f68);
  assert.equal(0x267f62 + 6, 0x267f68, 'and $267F68 is the next instruction');
});

test('W419 the eight pool-C allocator call sites and the kind each loads',
  { skip: SKIP_IMG }, () => {
  // `$267F62`'s D0 is the clamped draw above and is therefore NOT a constant;
  // the other seven are `moveq` immediates. THE MOVEQ IS NOT ALWAYS THE
  // INSTRUCTION BEFORE THE JSR -- $264830's is twenty bytes back and $26821E's
  // eighteen, with the bucket, the position and a `lea` in between -- so each
  // one is named by its own address rather than by an offset from the call.
  const SITES = [
    [0x264830, 0x26481c, 0x04, 0x289b50], [0x2673e6, 0x2673e0, 0x04, 0x289af4],
    [0x26821e, 0x26820c, 0x04, 0x289af4], [0x2688ba, 0x2688a8, 0x04, 0x289af4],
    [0x27664e, 0x27664c, 0x08, 0x289af4], [0x2774bc, 0x2774ba, 0x08, 0x289af4],
    [0x2777d6, 0x2777d4, 0x08, 0x289af4],
  ];
  for (const [site, mq, k, target] of SITES) {
    assert.equal(u32(site + 2), target, `$${site.toString(16)} target`);
    assert.equal(IMG[mq], 0x70, `$${mq.toString(16)} moveq opcode`);
    assert.equal(IMG[mq + 1], k,
      `$${site.toString(16)} loads kind $${k.toString(16)} at $${mq.toString(16)}`);
  }
  assert.equal(u32(0x267f62 + 2), 0x289af4, 'and the eighth is the clamped draw');
  // A WHOLE-IMAGE SCAN, so a ninth site cannot appear without this failing. An
  // inventory taken from the port would only ever list what the port already
  // knows -- W418's trap 4, a stated reason that is false.
  const found = [];
  for (let a = 0x200000; a < IMG.length - 6; a += 2) {
    if (IMG[a] !== 0x4e || IMG[a + 1] !== 0xb9) continue;
    const t = u32(a + 2);
    if (t === 0x289af4 || t === 0x289b50) found.push(a);
  }
  assert.deepEqual(found, [0x264830, 0x2673e6, 0x267f62, 0x26821e,
    0x2688ba, 0x27664e, 0x2774bc, 0x2777d6]);
});

// ================ 3. THE PORT'S GUARD, CALLED, ON A DIRTIED SLOT ============

/** A pool-C slot carrying a PREVIOUS TENANT's bytes. W417 and W418 each shipped
 *  a green test because a fresh `Ram()` happened to hold the value the assertion
 *  wanted; every field the fill writes is pre-loaded here with something else. */
function dirtyPool(ram) {
  for (let n = 0; n < POOL_C.slots; n++) {
    const q = POOL_C.base + n * POOL_C.stride;
    for (let b = 0; b < POOL_C.stride; b++) ram.setU8(q + b, 0xa5);
    ram.setU16(q + C.status, 0);            // ...but FREE, so the scan takes it
  }
  ram.setU16(POOL_C.count, 0);
}

test('W419 the guard accepts every kind the table really has, and the record is '
  + 'the template byte for byte', { skip: SKIP || SKIP_IMG }, () => {
  for (let i = 0; i < 4; i++) {
    const kind = i * 4;
    const t = TEMPLATES[i];
    const ram = new Ram();
    dirtyPool(ram);
    const slot = spawnPoolC289B50(ram, ROM, {}, kind, 0x0c, 0x20001800);
    assert.equal(slot, POOL_C.base, `kind $${kind.toString(16)} took slot 0`);
    // Every field the fill copies, read back against the IMAGE's own template.
    assert.equal(ram.u16(slot + C.status), u16(t), 'status');
    assert.equal(ram.u32(slot + C.offs), u32(t + 2), 'offs');
    assert.equal(ram.u16(slot + C.size), u16(t + 6), 'size');
    assert.equal(ram.u16(slot + C.template18), u16(t + 8), '+$18');
    assert.equal(ram.u16(slot + C.wrap), u16(t + 10), 'wrap');
    assert.equal(ram.u16(slot + C.cull), u16(t + 12), 'cull');
    assert.equal(ram.u32(slot + C.list), u32(t + 16), 'list 0 -- the selector is 0');
    assert.equal(ram.u32(slot + C.pos), 0x20001800, 'position');
    // $289D4E move.w ($1A,A2),... -- the fill seeds the descriptor from
    // `list + cursor`, NOT from `list`. On a fresh counter the cursor is 4, so
    // the two readings differ; the driver overwrites this field on its first
    // step, which is why it has to be read here rather than after a frame.
    assert.equal(ram.u16(slot + C.cursor), 4, 'the seeded cursor for this fixture');
    assert.equal(ram.u32(slot + C.descriptor),
      u32(u32(t + 16) + ram.u16(slot + C.cursor)), 'descriptor = list + cursor');
    assert.notEqual(ram.u32(slot + C.descriptor), u32(u32(t + 16)),
      'and that is not the same as list + 0');
    // ...and the two constants the fill writes that are NOT from the template.
    assert.equal(ram.u8(slot + C.palette), 0x1e, '$289D3A move.b #$1E,($1D,A0)');
    assert.equal(ram.u8(slot + C.marker), 0, 'the $1F marker is cleared at the end');
    assert.equal(ram.u8(slot + C.bucket), 0x0c, 'D1, the caller bucket');
    assert.equal(ram.u16(POOL_C.count), 1);
  }
});

test('W419 the SELECTOR picks list 0, 1 or 2 and the stride is FOUR',
  { skip: SKIP || SKIP_IMG }, () => {
  // Every one of the four templates has selector word $0000, so `$289D5A tst.w
  // (A2)+ / bpl` sends the pick to `$24311A`, whose 128-byte table at $243174
  // holds only 0, 1 and 2. `$24311A` bumps `$803917` BEFORE it indexes, and the
  // fill draws three times in a row -- attr ($242FDE), cursor, then the pick --
  // so seeding the counter at c makes the cursor T[c+2] and the pick T[c+3].
  //
  // WITHOUT THIS TEST THE LIST STRIDE IS UNMEASURED: every other fixture in this
  // file draws pick 0, where `template + 16 + pick * 4` and `... * 8` agree.
  // [M] T[0] = 0, T[1] = 2, T[2] = 1.
  for (const [counter, wantPick, wantCursor] of [[0x7d, 0, 4], [0x7f, 1, 8], [0x7e, 2, 0]]) {
    const ram = new Ram();
    dirtyPool(ram);
    ram.setU8(0x803917, counter);                     // RNG.counter, the low byte
    const slot = spawnPoolC289B50(ram, ROM, {}, 8, 0, 0x20001800);
    assert.equal(ram.u32(slot + C.list), u32(TEMPLATES[2] + 16 + wantPick * 4),
      `counter $${counter.toString(16)} picks list ${wantPick}`);
    assert.equal(ram.u16(slot + C.cursor), wantCursor, 'and the cursor with it');
  }
  // ...and the three lists really are three DIFFERENT addresses for kind 8, so
  // the assertion above can tell them apart.
  assert.equal(new Set([0, 1, 2].map((i) => u32(TEMPLATES[2] + 16 + i * 4))).size, 3);
  assert.deepEqual([0, 1, 2].map((i) => u32(TEMPLATES[2] + 16 + i * 4)),
    [0x289eda, 0x289eea, 0x289efa]);
});

test('W419 the guard still refuses everything above $C, and says why',
  { skip: SKIP }, () => {
  for (const kind of [0x10, 0x14, 0x18, 0x1c, 0x20, 0x3c]) {
    const ram = new Ram();
    dirtyPool(ram);
    assert.throws(() => spawnPoolC289B50(ram, ROM, {}, kind, 0, 0),
      /289E7A/, `kind $${kind.toString(16)} must be refused BY NAME`);
    assert.equal(ram.u16(POOL_C.count), 0, 'and nothing was allocated');
  }
});

test('W419 kinds 5..7 are kind 4 -- the mask is $3C and the domain does not grow',
  { skip: SKIP || SKIP_IMG }, () => {
  // The guard is written on `kind & $3C`, so it must not have quietly become a
  // guard on `kind`. Reading that mask as an equality test is how a fifth family
  // appears.
  for (const kind of [5, 6, 7]) {
    const ram = new Ram();
    dirtyPool(ram);
    const slot = spawnPoolC289B50(ram, ROM, {}, kind, 0, 0x20001800);
    assert.equal(ram.u16(slot + C.status), u16(TEMPLATES[1]),
      `kind $${kind.toString(16)} lands on kind 4's template`);
  }
  // ...and the mask matters on the HIGH side too. $4D & $3C is $C, so a guard
  // written on the RAW kind (`kind > 0x0c`) would REFUSE a legal call while
  // still passing every value this suite otherwise tries. $4D is not a kind any
  // caller passes; it is here because it separates those two readings and
  // nothing else does. `$289DD0 move.w D0,D3 / $289DD2 andi.w #$3C,D3` is the
  // cartridge doing the same thing to the same register.
  const ram = new Ram();
  dirtyPool(ram);
  const slot = spawnPoolC289B50(ram, ROM, {}, 0x4d, 0, 0x20001800);
  assert.equal(ram.u16(slot + C.status), u16(TEMPLATES[3]),
    "kind $4D masks to $C and lands on kind $C's template");
});

// ================ 4. TYPE $8E'S DEATH, FRAME BY FRAME =======================

const HANDLER8E = 0x2764d2, A5 = 0x8137c0, A6 = 0x8139c0;
const DEATHWORDS = 0x278314;

function dying8E(idx) {
  const ram = new Ram();
  dirtyPool(ram);
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A6 + 0x02, 0x2000);              // long axis
  ram.setU16(A6 + 0x04, 0x1800);              // short axis
  ram.setU16(A6 + 0x18, 0x8000);              // HP already negative
  ram.setU8(A6, 0x5c);                        // the hit bits, so the damage arm runs
  ram.setU16(A6 + 0x1e, idx);
  ram.setU8(A5 + 0x16, 1);                    // it has been seen on screen
  const ev = { poolC: [], drops: [] };
  const ctx = {
    tables: new AimTables(ROM), rom: ROM, unported: log, unportedLog: log,
    notes: log, soundPost: () => {}, bulletSpawn: () => {},
    poolCSpawn: (slot, kind, bucket) => ev.poolC.push({ slot, kind, bucket }),
    poolCDrop: (kind, site) => ev.drops.push({ kind, site }),
  };
  return { ram, ctx, ev };
}

test('W419 $278314 is six words and type $8E passes each one as the BUCKET',
  { skip: SKIP_IMG }, () => {
  // The port computes the bucket itself here rather than through $289AF4's
  // ($1F,caller) remap, which is why `handlers.js` calls the inner allocator.
  assert.equal(hex(DEATHWORDS, 12), '0000000000040008000c0010');
  // $276642 lea (d16,PC),A0 reaches the table from the EXTENSION WORD.
  assert.equal(hex(0x276642, 4), '41fa1cd0');
  assert.equal(0x276644 + 0x1cd0, DEATHWORDS);
  assert.equal(hex(0x276648, 4), '32300000', '$276648 move.w (A0,D0.w),D1');
  assert.equal(hex(0x27664c, 2), '7008', '$27664C moveq #$8,D0');
  // AND THE PORT'S CONSTANT IS PINNED TO THAT `lea`, not merely to a run of the
  // right bytes. `$278320` is a SECOND run of the same six words, byte for byte
  // (`$27831C` onward reads 0000 0000 0004 0008 000C 0010 twice), so no fixture
  // can tell $278314 from $278320 by behaviour -- only the displacement can.
  assert.equal(TYPE_SPECS.get(0x8e).deathWords, 0x276644 + 0x1cd0);
  assert.equal(hex(0x278320, 12), hex(DEATHWORDS, 12),
    'the two runs really are byte-identical, which is why this is asserted here');
});

test('W419 type $8E death: a LIVE kind-8 record, stepped and drawn -- a state '
  + 'trace, not an absence of throws',
  { skip: SKIP || SKIP_IMG || SKIP_SHEET }, () => {
  for (const idx of [0, 2, 5]) {
    const f = dying8E(idx);
    handlerMap().get(HANDLER8E)(f.ram, ROM, A5, f.ctx);
    assert.equal(f.ev.drops.length, 0, `idx ${idx}: nothing was dropped`);
    assert.equal(f.ev.poolC.length, 1, `idx ${idx}: exactly one pool-C record`);
    const { slot, kind, bucket } = f.ev.poolC[0];
    assert.equal(kind, 8);
    assert.equal(bucket, u16(DEATHWORDS + idx * 2), "the bucket is $278314's word");
    // ...and it is IN THE RECORD, at +$1E ($289D52 move.b D1,($1E,A0)), where
    // the driver reads it as the emitter selector. The three indices give 0, 4
    // and $10, none of which is the $C the direct-call fixtures pass.
    assert.equal(f.ram.u8(slot + C.bucket), u16(DEATHWORDS + idx * 2));
    assert.equal(f.ram.u16(slot + C.status), 0x8008, "kind 8's own status word");
    assert.equal(f.ram.u16(slot + C.size), 0x0830);
    assert.equal(f.ram.u32(slot + C.list), 0x289eda, "kind 8's list 0");
    assert.equal(f.ram.u16(slot + C.cursor), 0x0004,
      'the fill set the cursor to `$24311A * 4`');
    // $289C50 move.l ($2,A6),($2,A0) -- the position is the SUB-RECORD's long at
    // +$2, not its +$4 word pair. The fixture puts $2000 at +$2 and $1800 at +$4
    // so the two readings differ, which they would not on a zeroed record.
    assert.equal(f.ram.u32(slot + C.pos), 0x20001800, 'position from ($2,A6)');

    // Six frames of the driver, and what the record BECOMES each frame. The
    // cursor walks DOWN by 4 and reloads from the wrap on the borrow, so the
    // sequence is 4 -> 0 -> $C -> 8 -> 4 -> 0 with the descriptor read BEFORE
    // each decrement. `cursorBefore` is recorded so the two columns can be
    // cross-checked against the list rather than against each other.
    const seen = [];
    for (let n = 0; n < 6; n++) {
      const cursorBefore = f.ram.u16(slot + C.cursor);
      resetSpriteQueueCounters(f.ram);
      for (let i = 0; i < 0x800; i++) f.ram.setU16(0x800000 + i * 2, 0);
      const r = runPoolCDriver(f.ram, ROM, f.ctx);
      buildDisplayList(f.ram);
      const L = portSpriteList(f.ram, SHIP.map);
      seen.push({
        live: r.live, emitted: r.emitted, freed: r.freed,
        cursorBefore, cursor: f.ram.u16(slot + C.cursor),
        desc: f.ram.u32(slot + C.descriptor),
        records: L.records, drawn: L.drawn, skipped: L.skipped,
        missing: [...L.missing.keys()],
      });
    }
    // THE TRACE, WHOLE, so any change anywhere in it reads as a diff.
    assert.deepEqual(seen.map((s) => s.cursorBefore), [4, 0, 0x0c, 8, 4, 0],
      `idx ${idx}: the cursor walk`);
    assert.deepEqual(seen.map((s) => s.cursor), [0, 0x0c, 8, 4, 0, 0x0c]);
    // ...and each descriptor is the list cell that cursor names, taken from the
    // IMAGE. $289EDA's four longs are $229898 $2297D4 $229710 $22964C.
    assert.deepEqual(seen.map((s) => s.desc),
      seen.map((s) => u32(0x289eda + s.cursorBefore)),
      `idx ${idx}: descriptor = list 0 + cursor`);
    assert.deepEqual(seen.map((s) => s.desc),
      [0x2297d4, 0x229898, 0x22964c, 0x229710, 0x2297d4, 0x229898]);
    assert.deepEqual(seen.map((s) => [s.live, s.emitted, s.freed]),
      [[1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0]]);
    // AND IT REACHES THE GLASS: one record in the display list every frame, and
    // `portSpriteList` DRAWS it. `skipped` is the counter that would read 1 on
    // every frame if the art half of this wave had been left out -- which is
    // exactly what HEAD's bundle produces for these offsets.
    assert.deepEqual(seen.map((s) => [s.records, s.drawn, s.skipped]),
      [[1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0]]);
    assert.deepEqual(seen.flatMap((s) => s.missing), []);
  }
});

// ================ 5. THE ART, ALL FOUR FAMILIES =============================

/** Every stream one family names, and the width its own size word demands. */
function family(i) {
  const t = TEMPLATES[i];
  const size = u16(t + 6);
  const cells = u16(t + 0x0a) / 4 + 1;
  const offs = [];
  for (let l = 0; l < 3; l++) {
    const list = u32(t + 0x10 + l * 4);
    for (let c = 0; c < cells; c++) offs.push(u32(list + c * 4));
  }
  return {
    t, size, cells, offs: [...new Set(offs)],
    need: 2 + ((size & 0x7e00) >> 9) * (size & 0x01ff),
  };
}

test('W419 the four families name 44 distinct streams and the bundle holds every '
  + 'one at the width its own template asks for',
  { skip: SKIP_IMG || SKIP_SHEET }, () => {
  const counts = [];
  for (let i = 0; i < 4; i++) {
    const f = family(i);
    assert.equal(f.cells, 4, 'four cells, from the wrap word');
    counts.push(f.offs.length);
    for (const o of f.offs) {
      const s = SHIP.byRom.get(o);
      assert.ok(s !== undefined, `$${o.toString(16).toUpperCase()} `
        + `(kind $${(i * 4).toString(16)}) is not in the shipped sheet`);
      assert.ok(s[2] >= f.need, `$${o.toString(16).toUpperCase()} holds ${s[2]} `
        + `mask words, kind $${(i * 4).toString(16)}'s size word `
        + `$${f.size.toString(16)} asks for ${f.need}`);
    }
  }
  // Kind 4's list 2 duplicates list 1 byte for byte (W415); the other three do
  // not, which is why the counts are 12/8/12/12 and not four twelves.
  assert.deepEqual(counts, [12, 8, 12, 12]);
  assert.deepEqual([0, 1, 2, 3].map((i) => family(i).need), [18, 98, 194, 434]);
});

test('W419 no family is fetched later than the fireball the same death spawns',
  { skip: SKIP_IMG || SKIP_SHEET }, () => {
  // W415's rule, kept and extended to all four: the decidable question is
  // RELATIVE. A membership test alone passes on art that is present and late,
  // which is precisely how D50 survived all the way to the owner's screen.
  const fireball = SHIP.byRom.get(POOLB_KIND7_CELL0);
  assert.ok(fireball !== undefined, 'the fireball itself is in the sheet');
  const fireOrder = SHIP.orderOf.get(SHIP.shardOfBase(fireball[1]));
  for (let i = 0; i < 4; i++) {
    for (const o of family(i).offs) {
      const s = SHIP.byRom.get(o);
      const order = SHIP.orderOf.get(SHIP.shardOfBase(s[1]));
      assert.ok(order <= fireOrder, `$${o.toString(16).toUpperCase()} is `
        + `fetched ${order}th, the fireball ${fireOrder}th`);
    }
  }
});

test('W419 the $289EDA window is a NEW window and W194\'s is not widened',
  { skip: SKIP || SKIP_IMG }, () => {
  const w = json.rom.windows;
  const w194 = w.find((x) => x.base === '$289B50');
  assert.equal(w194.len, 0x038a, "W194's window is NOT widened");
  const mine = w.find((x) => x.base === '$289EDA');
  assert.ok(mine, "W419's window is declared");
  assert.equal(mine.len, 0x60, '24 longs: two families x three lists x four cells');
  assert.equal(0x289b50 + 0x38a, 0x289eda, 'they abut, they do not overlap');
  // The END is a positive witness and not a gap: $289F3A is `lea $81D394,A0`,
  // the first instruction of pool E's clear -- ported since W53 as
  // `spark.js clearPool`, a DIFFERENT unit that already owns those bytes.
  assert.equal(0x289eda + 0x60, 0x289f3a);
  assert.equal(hex(0x289f3a, 6), '41f90081d394');
  assert.equal(hex(0x289f40, 4), '303c03fd', 'move.w #$3FD,D0 -- $3FE words');
  // And the port can now read what it could not: both ends of the new window.
  assert.equal(ROM.u32(0x289eda), u32(0x289eda));
  assert.equal(ROM.u32(0x289f36), u32(0x289f36));
});
