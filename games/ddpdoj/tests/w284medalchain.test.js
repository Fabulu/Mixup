// W284 (DOCKET D17): the medal chain works, and W283's method says where to look.
//
// Applied in the order that closed D16 -- script, then run, then draw:
//
//   the SCRIPT   stage 1 holds TEN type-$8A records. The medal carrier is not rare.
//   the RUN      all TEN spawn. But the reserved ten -- the pool slots ONLY the
//                carrier's death arm allocates from -- is NEVER occupied.
//   the WIRE     `deathSeq8A` is complete and `handlers.js:$2767E6` calls
//                `allocBee27F92A`. So the carriers are not DYING.
//   the CHAIN    forced by hand, kind 1 allocates cleanly with zero notes.
//                **Kind 16 throws `Unreached $280CEE`** -- a real, named gap.
//
// And `bee.js`'s own header records the SAME owner report -- "the yellow 500-pt medals
// the carrier type-$8A drops are nowhere" -- which W111 fixed. So D17 is plausibly a
// re-report against a stale deploy; see the worklog.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { allocBee27F92A } from '../src/bee.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const tablesPath = path.join(GAME, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');
const HAVE_IMG = existsSync(IMAGE);
const IMG = HAVE_IMG ? readFileSync(IMAGE) : null;

// `bee.js`'s own arithmetic, restated so a change to the pool geometry fails here.
const POOL = 0x8171be;
const RESERVED = 0x817dc6;
const COUNT = 0x817f7e;
const STRIDE = 0x2c;

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}
const occupied = (ram) => {
  let n = 0;
  for (let i = 0; i < 10; i++) if (ram.u8(RESERVED + i * STRIDE) !== 0) n++;
  return n;
};

// ==================================================== 1. THE POOL ARITHMETIC

test('W284 the reserved ten really is bolted onto the end, and it closes EXACT', () => {
  // Three equalities `bee.js` claims in its header. If any drifts, every measurement
  // in this file and in W284's worklog is reading the wrong bytes.
  assert.equal(POOL + 70 * STRIDE, RESERVED, '70 general slots then the reserved ten');
  assert.equal(RESERVED + 10 * STRIDE, COUNT, 'and the live count sits one past them');
  assert.equal(COUNT - POOL, 80 * STRIDE, '80 slots in all');
});

// ============================================ 2. THE CHAIN WORKS FOR KIND 1

test('W284 kind 1 -- THE MEDAL -- allocates from the reserved ten, silently',
  { skip: SKIP }, () => {
    // `$2767DE move.w ($1A,A5),D0` passes `$0004`, which is kind 1, so this is the
    // path a real carrier death takes.
    const f = world();
    const carrier = 0x814600;
    f.ram.setU16(carrier + 0x02, 0x1200);
    f.ram.setU16(carrier + 0x04, 0x1a00);
    assert.equal(occupied(f.ram), 0, 'the reserved ten starts empty');
    allocBee27F92A(f.ram, ROM, f.ctx, 0x04, 0, carrier);
    assert.equal(occupied(f.ram), 1, 'one reserved slot is taken');
    assert.equal(f.ram.u16(COUNT), 1, 'and the live count agrees');
    assert.deepEqual(f.log.report(), [], 'with NO counted gap in the path');
  });

test('W284 kind 16 allocates and then THROWS at $280CEE -- a real named gap',
  { skip: SKIP }, () => {
    // The bee's flying variant. The slot is taken before the throw, which is worth
    // knowing: a caller that swallowed this would leak a reserved slot per attempt.
    const f = world();
    assert.throws(() => allocBee27F92A(f.ram, ROM, f.ctx, 0x40, 0, 0x814600),
      (e) => e instanceof Unreached && e.romAddress === 0x280cee,
      'kind 16 reaches an untranslated fill at $280CEE');
    assert.equal(occupied(f.ram), 1,
      'and the slot was already claimed -- the throw is AFTER the allocation');
  });

test('W284 a kind that is neither 1 nor 16 is refused', { skip: SKIP }, () => {
  // `bee.js`: "REFUSES any kind that is not 1 ($04) or 16 ($40)". The reserved ten is
  // the bee's alone, so anything else must not get in.
  const f = world();
  assert.throws(() => allocBee27F92A(f.ram, ROM, f.ctx, 0x08, 0, 0x814600));
  assert.equal(occupied(f.ram), 0, 'and nothing was allocated');
});

// ==================================== 3. THE SCRIPT SAYS THE CARRIER IS COMMON

test('W284 stage 1 holds TEN type-$8A carriers, so the medal is not rare',
  { skip: HAVE_IMG ? false : 'the decrypted image is absent' }, () => {
    // Same walk W283 used. Ten carriers against two type-$85s: whatever is wrong,
    // "the stage does not send any" is not it -- which is exactly what makes the
    // never-occupied reserved ten worth explaining rather than shrugging at.
    const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
    const u32 = (a) => ((u16(a) << 16) | u16(a + 2)) >>> 0;
    const script = u32(0x263336);
    let a = script;
    let carriers = 0;
    let prev = -1;
    for (let n = 0; n < 4096; n++) {
      const trig = u16(a);
      if (trig === 0xffff || trig < prev) break;
      prev = trig;
      if (IMG[a + 4] === 0x8a) carriers++;
      a += 8;
    }
    assert.equal(carriers, 10, 'ten type-$8A records in stage 1');
  });

// ============================================ 4. THE WIRE IS THERE

test('W284 the carrier\'s death arm really calls the bee allocator', () => {
  // `$2767E6 jsr $27F92A`. If this wire were missing, everything above would be true
  // and the medal would still never appear -- which is the W271 defect shape, so it is
  // asserted rather than assumed.
  const src = readFileSync(path.join(GAME, 'src', 'handlers.js'), 'utf8');
  const fn = src.slice(src.indexOf('function deathSeq8A'));
  const body = fn.slice(0, fn.indexOf('\n  // W54: SPAWNED'));
  assert.match(body, /allocBee27F92A\(ram, rom, ctx, kind, layer, a6\)/,
    'the allocator is called');
  assert.match(body, /ram\.u16\(a5 \+ 0x1a\)/, 'with the kind from ($1A,A5)');
  assert.match(body, /ram\.u8\(a6 \+ S\.f1f\)/, 'and the layer from ($1F,A6)');
});

test('W284 bee.js records that this exact report was already fixed once', () => {
  // The owner's D17 wording matches `bee.js`'s own header, which describes the report
  // W110 recon'd and W111 ported. Pinned because it is the strongest single reason to
  // check the DEPLOYED build before spending a wave on a re-report.
  const src = readFileSync(path.join(GAME, 'src', 'bee.js'), 'utf8');
  assert.match(src.slice(0, 1200), /yellow 500-pt medals/,
    'the header describes the same symptom');
  assert.match(src.slice(0, 1200), /WAVE 111/, 'and names the wave that fixed it');
});
