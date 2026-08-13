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
    // W353: an unwritten type has NEITHER registration. W351 put this skip on the handler test only,
    // which was an oversight caught the moment a second `ported: false` spec landed.
    // W369: this check now keys on the INIT-BODY flag alone. It used to skip `ported: false` specs, which
    // was the hole: $4C is `ported: false` with its body already registered, so the skip was wrong even
    // for the case it was written for -- and it hid $1A's and $B0's missing bodies entirely.
    if (spec.initBodyPorted === false) continue;
    const hex = `$${type.toString(16).toUpperCase().padStart(2, '0')}`;
    assert.ok(registered.has(spec.initBody),
      `${hex} initBody $${spec.initBody.toString(16)} is missing from INIT_BODY_ADDRESSES. This is `
      + 'the exact $55 failure: a BODY.set placed after `INIT_BODY_ADDRESSES = [...BODY.keys()]` '
      + 'registers nothing and every other check stays green.');
  }
});

// W369: TWO ORTHOGONAL FLAGS, because the first attempt at this test modelled them as three ordered
// states and $4C immediately disproved it -- $4C is `ported: false` with its init body ALREADY registered.
// A type has two halves and they land independently:
//     ported: false          the HANDLER is not written        -> handler must NOT be registered
//     initBodyPorted: false  the INIT BODY is not registered   -> the type CANNOT SPAWN
// $4C has the body but no handler; $1A and $B0 have handlers but no body. Nothing orders them.
//
// WHY IT EXISTS: the two registry tests above skip `ported: false` specs. W365 registered handler1A and
// W363 registered handler2A4606 while both specs still said `ported: false`, so BOTH tests skipped BOTH
// types -- and neither init body was ever registered. `runInitBodyAddr` throws by address, so $1A and
// HIBACHI cannot spawn, while w314stage5scope read clean because it counts handlers.
test('W369: a `ported: false` spec has no registered handler', { skip: !HAVE }, () => {
  const handlers = new Set(HANDLER_ADDRESSES);
  for (const [type, spec] of TYPE_SPECS) {
    if (spec.ported !== false) continue;
    assert.ok(!handlers.has(spec.handler),
      `$${type.toString(16).toUpperCase()} is flagged \`ported: false\` but its handler IS registered. `
      + 'When a handler lands the flag must go, because leaving it makes the init-body check above skip '
      + 'the type -- which is how $1A and $B0 both ended up unspawnable with a green suite.');
  }
});

test('W369: an `initBodyPorted: false` spec has no registered init body, and cannot spawn',
  { skip: !HAVE }, () => {
  const bodies = new Set(INIT_BODY_ADDRESSES);
  for (const [type, spec] of TYPE_SPECS) {
    if (spec.initBodyPorted !== false) continue;
    assert.ok(!bodies.has(spec.initBody),
      `$${type.toString(16).toUpperCase()} carries \`initBodyPorted: false\` but its init body IS `
      + 'registered -- delete the flag, the type is spawnable now');
  }
});

test('W369: exactly ONE spec is measured-but-handlerless -- $4C', () => {
  const unwritten = [...TYPE_SPECS.entries()]
    .filter(([, spec]) => spec.ported === false)
    .map(([type]) => type)
    .sort((a, b) => a - b);
  assert.deepEqual(unwritten, [0x4c],
    'Was [$1A, $4C, $B0]. $1A and $B0 were never in this state: both had written, registered handlers '
    + 'and were mislabelled, which is what hid their missing init bodies.');
});

test('W369: exactly ONE type is UNSPAWNABLE -- $1A', () => {
  // This is the count that matters for the milestone. A registered handler the driver can never reach is
  // worth nothing: the spawn throws first. $B0 is the stage-5 BOSS, so stage 5 cannot currently be
  // completed regardless of $4C.
  const unspawnable = [...TYPE_SPECS.entries()]
    .filter(([, spec]) => spec.initBodyPorted === false)
    .map(([type]) => type)
    .sort((a, b) => a - b);
  assert.deepEqual(unspawnable, [0x1a],
    // W369 second half: $B0's body $2A42DC LANDED, so HIBACHI spawns and stage 5 can end. $1A stays,
    // blocked on D3 provenance rather than on reading.

    'Porting an init body means DELETING the flag in its spec and here. $1A is blocked on D3 provenance '
    + 'at $268D8C (the aim CORE takes its target in D2/D3 and nothing in the body or $263808 writes D3); '
    + '$B0 has not been read yet. Neither is blocked on the handler.');
});
