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
// The table is types $00..$7F ONLY -- the wave-20 window is $267820+$410, ending at $267C30. Types
// $80 and up are dispatched through a SEPARATE structure near $27E410 whose indexing is not yet
// solved: $8E's [init, handler] pair sits at $27E41A and $81's at $27E482, so the pair spacing is
// $68 = 13 entries for a type difference of 13, but the ADDRESS RISES AS THE TYPE FALLS. That rules
// out `base + type * 8` for any base. Until it is solved, high types are out of this check's scope
// rather than silently assumed -- see the third test, which pins the boundary so the gap stays
// visible instead of looking like coverage.
const HIGH_TYPE = 0x80;

function realRom() {
  const j = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  return new RomWindows(j.rom);
}

/** `[init, handler]` for a type, straight out of the windowed ROM table. */
function romEntry(rom, type) {
  const at = TYPE_TABLE + type * ENTRY;
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
    if (type >= HIGH_TYPE) continue;              // a different table, see HIGH_TYPE
    checked += 1;
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
  assert.ok(checked >= 10, `cross-checked ${checked} low types against the ROM table`);
});

test('W346: the low table stops at $7F, and the high types are a known GAP not a pass',
  { skip: !HAVE }, () => {
  const rom = realRom();
  // $7F is the last type in the table; its handler longword is the last four bytes of the window.
  assert.doesNotThrow(() => romEntry(rom, 0x7f), 'type $7F is inside the wave-20 window');
  // The wave-20 window is $267820+$410, ending at $267C30, so it actually reaches through type $80
  // ($267C24..$267C28) and stops inside $81. The window comment saying "types $00..$7F" is therefore
  // one type short of what it exports. Assert the REAL boundary, since that is what a reader will
  // hit: $80 reads, $81 throws.
  assert.doesNotThrow(() => romEntry(rom, 0x80), 'the $410 window reaches through type $80');
  assert.throws(() => romEntry(rom, 0x81),
    /outside every ROM window/, 'type $81 is the first outside -- high types dispatch elsewhere');
  // And say out loud which specs this file therefore does NOT verify.
  const unverified = [...TYPE_SPECS.keys()].filter((t) => t >= HIGH_TYPE);
  assert.deepEqual(unverified, [0x81, 0x8e],
    'exactly $81 and $8E are unverified here; a new high type must update HIGH_TYPE reasoning');
});

test('W346: a spec that claims a handler has it actually registered with the driver', () => {
  const registered = new Set(HANDLER_ADDRESSES);
  for (const [type, spec] of TYPE_SPECS) {
    const hex = `$${type.toString(16).toUpperCase().padStart(2, '0')}`;
    assert.ok(registered.has(spec.handler),
      `${hex} handler $${spec.handler.toString(16)} is in HANDLERS -- an unregistered handler is a `
      + 'spec describing code the driver will never reach');
  }
});

test('W346: a spec that claims an initBody has it actually registered -- the $55 no-op guard', () => {
  const registered = new Set(INIT_BODY_ADDRESSES);
  for (const [type, spec] of TYPE_SPECS) {
    const hex = `$${type.toString(16).toUpperCase().padStart(2, '0')}`;
    assert.ok(registered.has(spec.initBody),
      `${hex} initBody $${spec.initBody.toString(16)} is missing from INIT_BODY_ADDRESSES. This is `
      + 'the exact $55 failure: a BODY.set placed after `INIT_BODY_ADDRESSES = [...BODY.keys()]` '
      + 'registers nothing and every other check stays green.');
  }
});
