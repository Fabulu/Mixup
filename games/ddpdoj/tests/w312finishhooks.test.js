// W312: `$280BCE`'s hooks 2, 3 and 17 -- eighteen of twenty.
//
// Hooks 2 and 3 are the same twenty-four bytes at two addresses, and they are the first entries
// in this dispatch that do NONE of the shared speed and angle work. That is why the port's fill
// had to stop hoisting it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0 } from '../src/bee.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const CARRIER = 0x814600;
const POOL_BASE = 0x8171be;      // POOL_A.base, the first of eighty slots at stride $2C
const LIVE_COUNT = 0x817f7e;     // POOL_A.liveCount, $280B3E addq.w #1
const B = { status: 0x00, sprite: 0x0a, blinkTimer: 0x18, speed: 0x1a, waypoint: 0x20 };

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + 0x02, 0x30003000);       // a carrier position well inside the screen
  return { ram, log, ctx: { tables: MT, rom: ROM, unported: log, unportedLog: log, notes: log } };
}
const alloc = (f, kind) => allocPoolA27F8F0(f.ram, ROM, f.ctx, kind, 0, 0, CARRIER);

// ==================== 1. HOOKS 2 AND 3 ARE THE SAME CODE TWICE

test('W312 `$280CF8` and `$280D10` are byte-identical', { skip: SKIP_IMG }, () => {
  // The fourth duplicate in this dispatch, and the first of a new sort: W286's kind 16 and
  // W298's 5/6/7 were the same table ENTRY, while these two are duplicated CODE at two
  // addresses. Same lesson -- read the entry -- by a different mechanism.
  const a = IMG.subarray(0x280cf8, 0x280d10);
  const b = IMG.subarray(0x280d10, 0x280d28);
  assert.equal(a.length, 24);
  assert.deepEqual(a, b, 'twenty-four bytes, twice');
  assert.equal(a.toString('hex').toUpperCase(),
    '2E004EB900242E240240001FD12800184268002020074E75');
  // And the dispatch really points at the two DIFFERENT addresses, unlike W298's shared entry.
  assert.notEqual(IMG.readUInt32BE(0x280bce + 2 * 4), IMG.readUInt32BE(0x280bce + 3 * 4));
  assert.equal(IMG.readUInt32BE(0x280bce + 2 * 4), 0x00280cf8);
  assert.equal(IMG.readUInt32BE(0x280bce + 3 * 4), 0x00280d10);
});

test('W312 both allocate, and both take the SAME code path', { skip: SKIP }, () => {
  // Two kinds, two dispatch entries, one body. What must match is the BEHAVIOUR -- speed
  // untouched, waypoint cleared -- and NOT the field values: `impactTemplate280B4A(rom, kind)`
  // gives each kind its own template out of the cartridge, so the blink words legitimately
  // differ. My first draft asserted them equal and found the template difference instead.
  const results = [0x08, 0x0c].map((kind) => {
    const f = world();
    const slot = alloc(f, kind);
    assert.ok(slot, `kind $${kind.toString(16)} allocated`);
    return {
      status: f.ram.u16(slot + B.status),
      blink: f.ram.u16(slot + B.blinkTimer),
      speed: f.ram.u16(slot + B.speed),
      waypoint: f.ram.u32(slot + B.waypoint),
    };
  });
  assert.equal(results[0].status, 0x8008, 'kind | $8000');
  assert.equal(results[1].status, 0x800c);
  for (const [i, r] of results.entries()) {
    assert.equal(r.speed, 0, `entry ${i}: no shared speed work`);
    assert.equal(r.waypoint >>> 16, 0, `entry ${i}: waypoint's first word cleared`);
  }
  assert.notEqual(results[0].blink, results[1].blink,
    'and their per-kind templates really are different data');
});

// ==================== 2. THEY DO NO SPEED OR ANGLE WORK

test('W312 hooks 2 and 3 leave the speed field ALONE', { skip: SKIP }, () => {
  // `$280B3E` only dispatches -- `lea ($280BCE,PC),A1 / adda.w D0,A1 / movea.l (A1),A1 /
  // jsr (A1)` -- so the `move.w #$420,($1A,A0)` and everything after it belongs to the hooks.
  // The port had hoisted that into the fill because all fifteen translated kinds did it; these
  // two are why it is gated now.
  //
  // The template skips +$1A/+$1B, so an untouched speed field is whatever the slot held, which in
  // a fresh Ram is zero. A hook that wrongly ran the shared body would leave $0420 plus a draw.
  for (const kind of [0x08, 0x0c]) {
    const f = world();
    const slot = alloc(f, kind);
    assert.equal(f.ram.u16(slot + B.speed), 0, `kind $${kind.toString(16)}: no $420`);
  }
});

test('W312 hooks 2 and 3 clear the waypoint LONG\'s first word', { skip: SKIP }, () => {
  // `clr.w ($20,A0)`. The shared body instead writes a whole velocity pair there, so a
  // non-zero waypoint would mean the wrong body ran.
  const f = world();
  f.ram.setU32(POOL_BASE + B.waypoint, 0xdeadbeef);
  const slot = alloc(f, 0x08);
  assert.equal(slot, POOL_BASE, 'the first free slot');
  assert.equal(f.ram.u16(slot + B.waypoint), 0, 'cleared');
  assert.equal(f.ram.u16(slot + B.waypoint + 2), 0xbeef, 'and only the FIRST word');
});

test('W312 the jitter is a masked draw ADDED to the blink byte', { skip: SKIP }, () => {
  // `andi.w #$1F,D0 / add.b D0,($18,A0)` -- masked to 0..31 and ADDED, not stored, and as a BYTE
  // so it wraps within the high half of the word the template put there.
  const f = world();
  const slot = alloc(f, 0x08);
  const blink = f.ram.u16(slot + B.blinkTimer);
  const templateHigh = 0x01;                 // the template's animWord is $0101 for these kinds
  const added = (blink >>> 8) - templateHigh;
  assert.ok(added >= 0 && added <= 0x1f, `the high byte moved by ${added}, inside 0..31`);
  assert.equal(blink & 0xff, 0x01, 'and the LOW byte is untouched');
});

test('W312 the shared body still runs for a kind that wants it', { skip: SKIP }, () => {
  // The gate must not have turned it off for everybody. Kind 0 is `$280C5E`, translated in W264.
  const f = world();
  const slot = alloc(f, 0x00);
  assert.ok(slot);
  assert.notEqual(f.ram.u16(slot + B.speed), 0, 'kind 0 still gets its $420 plus a draw');
  assert.notEqual(f.ram.u32(slot + B.waypoint), 0, 'and a velocity');
});

// ==================== 3. HOOK 17 IS ONE TABLE ROW

test('W312 hook 17 allocates and rewrites the status to `$14`', { skip: SKIP }, () => {
  // `$280DE0 andi.w #$FF83,(A0) / $280DE4 ori.w #$14,(A0)` -- the same normalisation `$280DEA`
  // and `$280E1A` do, which is what makes it a `status` row rather than a new body.
  const f = world();
  const slot = alloc(f, 0x44);
  assert.ok(slot, 'kind $44 allocated');
  assert.equal(f.ram.u16(slot + B.status) & 0x7f, 0x14, 'the kind field became $14');
  assert.ok((f.ram.u16(slot + B.status) & 0x8000) !== 0, 'and it is still live');
});

test('W312 hook 17 uses W287\'s hook BLOCK 1, not its own', { skip: SKIP_IMG }, () => {
  // `$280DD0 lea ($280C1E,PC),A3` -- already windowed by W287, which is why this hook needed no
  // new ROM window at all. The `$242EC2 & $E` index is the pattern `$280DEA` established.
  assert.equal(IMG.readUInt16BE(0x280dd0), 0x47fa, 'lea (d16,PC),A3');
  assert.equal(0x280dd2 + IMG.readInt16BE(0x280dd2), 0x280c1e, 'and it names block 1');
  assert.equal(IMG.readUInt32BE(0x280dc6), 0x00242ec2, 'through $242EC2');
  assert.equal(IMG.readUInt16BE(0x280dca), 0x0240, 'andi.w');
  assert.equal(IMG.readUInt16BE(0x280dcc), 0x000e, '#$E');
});

test('W312 hook 17 does the shared body, unlike hooks 2 and 3', { skip: SKIP }, () => {
  // `$280DDC bsr $280C84` -- the ported path, so the speed and velocity are present.
  const f = world();
  const slot = alloc(f, 0x44);
  assert.notEqual(f.ram.u16(slot + B.speed), 0, 'it has a speed');
  assert.notEqual(f.ram.u32(slot + B.waypoint), 0, 'and a velocity');
});

test('W312 hook 17 sets the speed field to `$420` before drawing', { skip: SKIP_IMG }, () => {
  // `$280DBE move.w #$420,($1A,A0)` -- which the shared fill already writes, the same redundancy
  // W298 found in `$280CD4`. Worth pinning so nobody "fixes" the duplicate away.
  assert.equal(IMG.readUInt16BE(0x280dbe), 0x317c, 'move.w #imm,(d16,A0)');
  assert.equal(IMG.readUInt16BE(0x280dc0), 0x0420);
  assert.equal(IMG.readUInt16BE(0x280dc2), 0x001a, 'into ($1A,A0)');
});

// ==================== 4. WHAT IS LEFT

test('W312 eighteen of twenty are translated and the two left are named', { skip: SKIP }, () => {
  // Indices 1 and 16 are BOTH `$280CEE` (W286) and belong to `allocBee27F92A`, so this dispatch
  // will never translate them. Driving one proves the message is still the diagnosis.
  const f = world();
  assert.throws(() => alloc(f, 0x04), (e) => e.name === 'Unreached'
    && e.romAddress === 0x280bce
    && /EIGHTEEN of its twenty/.test(e.message)
    && /indices 1 and 16/.test(e.message)
    && /allocBee27F92A/.test(e.message));
});

test('W312 every kind index 0..19 either allocates or is one of the two', { skip: SKIP }, () => {
  // The whole dispatch, swept. Eighteen must allocate and exactly two must throw, which is a
  // stronger statement than any single-kind test and catches a table row typed as the wrong index.
  const threw = [];
  for (let i = 0; i < 20; i++) {
    const f = world();
    try {
      const slot = alloc(f, i * 4);
      assert.ok(slot, `index ${i} allocated`);
    } catch (e) {
      if (e.name !== 'Unreached') throw e;
      threw.push(i);
    }
  }
  assert.deepEqual(threw, [1, 16], 'exactly indices 1 and 16');
  assert.equal(20 - threw.length, 18);
});

test('W312 the pool bookkeeping is unchanged by the new kinds', { skip: SKIP }, () => {
  // `$280B3E addq.w` on the live count runs before any hook, so a hook that returned early must
  // still have been counted.
  for (const kind of [0x08, 0x0c, 0x44]) {
    const f = world();
    const before = f.ram.u16(LIVE_COUNT);
    alloc(f, kind);
    assert.equal(f.ram.u16(LIVE_COUNT), before + 1,
      `kind $${kind.toString(16)} was counted`);
  }
});
