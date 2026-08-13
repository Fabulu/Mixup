// W346: cross-check every ported type spec against the ROM's own type table.
//
// Each spec in `handlers.js` carries a comment of the form "entry points verified against the type
// table". Those were verified by eye, once, when the spec was written. `$55` proved what that is
// worth: its init body was registered after `INIT_BODY_ADDRESSES` had already been built from
// `BODY.keys()`, so the registration was a silent no-op and five consecutive green check runs said
// nothing. Only a census pin with a hard-coded expected count caught it, and only by one.
//
// The ROM answers all of this itself. `$267824` is the type table, types `$00..$7F`, eight bytes per
// entry, `[init, handler]` -- windowed since wave 20. `initBody = init + 8` by `spawn.js`'s
// `$26361A addq.w #8,A1`. So every field is re-derivable on every run instead of asserted in prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TYPE_SPECS, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { RomWindows } from '../src/rom.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);

const TYPE_TABLE = 0x267824;
const ENTRY = 8;
// TWO tables, both ascending `[init, handler]` at eight bytes an entry:
//   types $00..$7F   $267824 + type * 8            windowed wave 20 as $267820+$410
//   types $80..$FF   $27E412 + (type - $80) * 8    windowed as $27E410+$410
// W347 solved the high one. W346 got it wrong twice: first "the address rises as the type falls",
// which came from reading a two-pattern `grep -A2` in the wrong order and so pairing each spec with
// the other's entry, and then an exclusion built on that error. The high base is $27E412, NOT
// $27E410 -- the two bytes at $27E410 are a trailing `nop` from the preceding code, which is why the
// table is not 8-aligned to the window start. Verified three ways: type $80's handler $2739C0 is
// registered as `handler80`, $81's $274076 as `handler81` at index 1, and $8E's $2764D2 as
// `handler8E` at index 14.
const HIGH_TYPE = 0x80;
const HIGH_TABLE = 0x27e412;

function realRom() {
  const j = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  return new RomWindows(j.rom);
}

/** `[init, handler]` for a type, straight out of the windowed ROM table. */
function romEntry(rom, type) {
  const at = type < HIGH_TYPE
    ? TYPE_TABLE + type * ENTRY
    : HIGH_TABLE + (type - HIGH_TYPE) * ENTRY;
  return { init: rom.u32(at), handler: rom.u32(at + 4) };
}

test('W346: the type table window covers every type $00..$7F', { skip: !HAVE }, () => {
  const rom = realRom();
  for (const type of [0x00, 0x01, 0x43, 0x55, 0x7f]) {
    const e = romEntry(rom, type);
    assert.equal(typeof e.init, 'number', `type $${type.toString(16)} init readable`);
    assert.ok(e.init >= 0x240000 && e.init < 0x2b0000,
      `type $${type.toString(16)} init $${e.init.toString(16)} inside build B`);
    assert.ok(e.handler >= 0x240000 && e.handler < 0x2b0000,
      `type $${type.toString(16)} handler $${e.handler.toString(16)} inside build B`);
  }
});

test('W346: every ported spec agrees with the ROM table on init, initBody and handler',
  { skip: !HAVE }, () => {
  const rom = realRom();
  assert.ok(TYPE_SPECS.size >= 12, 'the spec registry is populated');
  let checked = 0;
  for (const [type, spec] of TYPE_SPECS) {
    checked += 1;                                 // W347: both bands, no exclusions
    const hex = `$${type.toString(16).toUpperCase().padStart(2, '0')}`;
    const e = romEntry(rom, type);
    assert.equal(spec.init, e.init,
      `${hex} init: spec $${spec.init.toString(16)} vs ROM $${e.init.toString(16)}`);
    assert.equal(spec.handler, e.handler,
      `${hex} handler: spec $${spec.handler.toString(16)} vs ROM $${e.handler.toString(16)}`);
    // The rule, not a restatement of the spec: the body is eight bytes past the init.
    assert.equal(spec.initBody, e.init + 8,
      `${hex} initBody must be init + 8 ($26361A addq.w #8,A1)`);
  }
  assert.equal(checked, TYPE_SPECS.size,
    `every spec cross-checked, both bands -- ${checked} of ${TYPE_SPECS.size}`);
});

test('W347: both type tables are readable across their whole band', { skip: !HAVE }, () => {
  const rom = realRom();
  // W347 correction: the LOW table really is types $00..$7F, exactly as its wave-20 comment says.
  // W346 claimed it "reaches through type $80" on the strength of $267C24 being READABLE inside the
  // $410 window -- but readable is not an entry. $267C24 holds CODE (`41fa 0026 4e71 4eb9`), and the
  // only reason the read succeeded is that the window is $10 longer than the table. Type $80 lives
  // solely in the high table. So the check is PLAUSIBILITY, not readability.
  const plausible = (v) => v >= 0x240000 && v < 0x2b0000;
  for (const type of [0x00, 0x01, 0x43, 0x7f]) {
    const e = romEntry(rom, type);
    assert.ok(plausible(e.init) && plausible(e.handler),
      `low type $${type.toString(16)} is a real entry`);
  }
  for (const type of [0x80, 0x81, 0x8e, 0xb0, 0xff]) {
    const e = romEntry(rom, type);
    assert.ok(plausible(e.init) && plausible(e.handler),
      `high type $${type.toString(16)} is a real entry`);
  }
  // And the proof the low table STOPS at $7F: one past it is code, not an address pair.
  const past = { init: rom.u32(TYPE_TABLE + 0x80 * ENTRY) };
  assert.ok(!plausible(past.init),
    'one entry past $7F in the LOW table must be code, not a plausible init -- that is the table end');
});

// W351: a spec may carry `ported: false` to mean "every field measured, handler not yet written". The two
// registry tests below skip those, because an unwritten handler cannot be registered. The ROM cross-check
// above does NOT skip them -- that is the point of recording the addresses before the code exists.
test('W346: a spec that claims a handler has it actually registered with the driver', { skip: !HAVE }, () => {
  const registered = new Set(HANDLER_ADDRESSES);
  for (const [type, spec] of TYPE_SPECS) {
    if (spec.ported === false) continue;
    const hex = `$${type.toString(16).toUpperCase().padStart(2, '0')}`;
    assert.ok(registered.has(spec.handler),
      `${hex} handler $${spec.handler.toString(16)} is in HANDLERS -- an unregistered handler is a `
      + 'spec describing code the driver will never reach');
  }
});

test('W346: a spec that claims an initBody has it actually registered -- the $55 no-op guard',
  { skip: !HAVE }, () => {
  const registered = new Set(INIT_BODY_ADDRESSES);
  for (const [type, spec] of TYPE_SPECS) {
    const hex = `$${type.toString(16).toUpperCase().padStart(2, '0')}`;
    assert.ok(registered.has(spec.initBody),
      `${hex} initBody $${spec.initBody.toString(16)} is missing from INIT_BODY_ADDRESSES. This is `
      + 'the exact $55 failure: a BODY.set placed after `INIT_BODY_ADDRESSES = [...BODY.keys()]` '
      + 'registers nothing and every other check stays green.');
  }
});

// W351: this pin was DESCRIBED as landing two commits before it did. The comment above the handler test
// went in; this assertion did not, and I reported it as working off a passing test count instead of
// reading the file. So it is its own test now, with the count in the name, where a diff cannot lose it.
test('W351: exactly ONE spec is measured-but-unwritten, and it is $55', () => {
  const unwritten = [...TYPE_SPECS.entries()]
    .filter(([, spec]) => spec.ported === false)
    .map(([type]) => type);
  assert.deepEqual(unwritten, [0x55],
    'Writing a handler means DELETING its `ported: false`, and adding another measured-but-unwritten '
    + 'spec has to be deliberate enough to update this list. An empty result means $55 was written -- '
    + 'if so, four census pins move too (W223 type $41, the handlerMap() adapter cover, W217 reusable '
    + 'coverage, W317 thirteen-spawn), and they must be bumped from their real counts.');
});
