// WAVE 86 -- THE BLACK TERRAIN: the 13 stage-1 background elements and the
// column of sprite streams they draw with.
//
// THE OWNER, on the live build: *"some terrain starts being black after the
// golden terrain"*.  `[cited: W68 §5.2]` named five missing bucket-2 streams;
// `[cited: W75 §3.4]` tied `$232578` to the invisible `$8B` hitbox lattice on
// the gold crystal, so the invisible enemy and the black terrain are ONE object.
// `tools/export-web.mjs` carried EIGHT of the thirteen element sprites as
// "measured one-offs" from a 3,000-frame run and the five it lacked -- handlers
// 7..11 -- first draw at [M] steps 3,627..5,275.  A list taken off a run is a
// floor.
//
// WHAT THIS FILE PINS, and it is the half a unit suite can reach:
//   * `BGELEM_HANDLERS` is the port's own table and the exporter now derives the
//     art from it, so the two cannot drift. The property that matters is
//     therefore "one stream per handler, all distinct, all present" -- W86/2.
//   * the CARTRIDGE's own stage-1 handler table `$26224A` must name handler `i`'s
//     constructor at entry `i`, in order -- W86/1. That window is exported
//     (`tools/export-tables.py`, `$262240` + `$0100`), so this is a real
//     comparison against the image and not against a second copy of the list.
//
// WHAT IT CANNOT REACH, said plainly: each constructor's own
// `move.l #imm,($10,A6)` lives at `$2623A4..$26275E`, which is OUTSIDE every
// exported ROM window, so the `data` column is checked against the cartridge in
// `tools/export-web.mjs` (which reads `maincpu.bin`) and NOT here. That check
// was seen to fail three ways; see the worklog.
//
// SEEN TO FAIL:
//   [M] MUTATION  row 9's `ctor` 0x262674 -> 0x262676      W86/1 RED
//   [M] MUTATION  rows 7 and 8 swapped                     W86/1 RED
//   [M] MUTATION  row 9's `data` -> row 8's                W86/2 RED
//   [M] and at HEAD, W86/3 is RED: the five late elements were not in the
//       shipped manifest at all.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RomWindows } from '../src/rom.js';
import { BGELEM_HANDLERS } from '../src/background.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const ROM = HAVE ? new RomWindows(JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- run tools/export-tables.py. THIS IS '
    + 'A SKIP, NOT A PASS.';

const MANIFEST = path.join(HERE, '..', 'assets', 'manifest.json');
const HAVE_M = fs.existsSync(MANIFEST);
const SKIP_M = HAVE_M ? false
  : 'assets/manifest.json missing -- run tools/export-web.mjs. THIS IS A SKIP, '
    + 'NOT A PASS.';

/** `$262380 move.l $8132C8,A1` -- stage 1's own background-element handler
 *  table, and `src/background.js elemSpawn` indexes it with op $10's id. */
const BGELEM_TABLE = 0x26224a;

test('W86/1 the CARTRIDGE\'s own $26224A names the port\'s 13 constructors, in '
  + 'order', { skip: SKIP }, () => {
  assert.equal(BGELEM_HANDLERS.length, 13,
    'W13 read 13 stage-1 handlers behind $26224A');
  for (let i = 0; i < BGELEM_HANDLERS.length; i++) {
    assert.equal(ROM.u32(BGELEM_TABLE + i * 4), BGELEM_HANDLERS[i].ctor,
      `$26224A entry ${i}. src/background.js's rows are indexed BY THIS TABLE `
      + '(elemSpawn does `rom.u32(tab + id*4)`), so a row out of order sends '
      + "op $10's id to the wrong element");
  }
  // AND THE ONE PAST THE END IS A REAL CONSTRUCTOR THE PORT REFUSES.  That is
  // what stops "13" reading as "the table is 13 long": it is not. $2627AC is
  // the same shape and `elemSpawn` throws a named `unreached` on it, which the
  // exporter's own header prefers to a quiet blank.
  assert.equal(ROM.u32(BGELEM_TABLE + 13 * 4), 0x2627ac,
    'entry 13 exists and is $2627AC -- the table does NOT end at 13. What ends '
    + 'at 13 is what THIS PORT can construct, and $2627CA (its updater) is one '
    + 'of the addresses W75 §5.1 measured the port blocking on');
  assert.ok(!BGELEM_HANDLERS.some((h) => h.ctor === 0x2627ac),
    'and $2627AC is deliberately NOT one of the port\'s 13');
});

test('W86/2 every element draws with EXACTLY ONE sprite stream, and all 13 are '
  + 'different', () => {
  const data = BGELEM_HANDLERS.map((h) => h.data);
  assert.equal(new Set(data).size, 13,
    'thirteen distinct streams. `elemConstruct` writes ($10,A6) ONCE and '
    + '`elemUpdate` only reads it, so the art an element can ever ask for is '
    + 'this one address -- a duplicate would mean two elements share a picture '
    + 'and the harvest is one stream short of what it claims');
  for (const h of BGELEM_HANDLERS) {
    assert.ok(h.data >= 0x220000 && h.data < 0x240000,
      `$${h.data.toString(16)} is in the $22xxxx/$23xxxx block every element's `
      + 'descriptor comes from');
  }
});

test('W86/3 the SHIPPED BUNDLE holds a stream for all 13, the five late ones '
  + 'included', { skip: SKIP_M }, () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  // `spr.streams` is not in the manifest as a list of addresses; the harvest
  // ledger is, and it names this table by base. Read the ledger row rather than
  // trusting the count: a row that says 13 and harvested 8 is the defect.
  const row = (m.spr?.harvest ?? []).find((r) =>
    String(r.at).toLowerCase() === `$${BGELEM_TABLE.toString(16)}`);
  assert.ok(row, 'manifest.spr.harvest must carry the $26224A row -- without it '
    + 'the element art is back to being whatever a run happened to ask for');
  assert.equal(row.entries, 13, 'thirteen handlers');
  assert.equal(row.distinct, 13, 'thirteen distinct streams');
  // THE FIVE. Named individually, because "13 distinct" would also be satisfied
  // by thirteen wrong addresses, and because these five ARE the owner's report.
  const LATE = [0x231520, 0x231c44, 0x232578, 0x232eac, 0x233630];
  for (const offs of LATE) {
    assert.ok(BGELEM_HANDLERS.some((h) => h.data === offs),
      `$${offs.toString(16).toUpperCase()} -- one of W68 §5.2's five missing `
      + 'bucket-2 streams -- must be one of the thirteen this row harvests');
  }
});
