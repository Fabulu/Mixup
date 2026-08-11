// W285 (DOCKET D17): kill a carrier in a LIVE RUN and the medal appears.
//
// W284 proved the pieces: stage 1 holds ten type-$8A carriers, all ten spawn,
// `deathSeq8A` calls `allocBee27F92A`, and forced in isolation kind 1 allocates
// cleanly. What it could not show is the whole thing working inside a running game,
// because **no scenario in the tree kills a carrier** -- the laser-hold ladder parks
// the ship at the bottom centre by design and only kills what enters the beam.
//
// So this drives the death gate on a real carrier mid-run and watches for the medal.
// That is the one measurement D17 needed, and it is now a permanent gate rather than
// a thing somebody re-derives.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const tablesPath = path.join(GAME, 'rip', 'port', 'player.tables.json');
const RUNG = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold',
  'ckpt', 'c002000.ram.bin');
const HAVE = existsSync(tablesPath) && existsSync(RUNG);
const SKIP = HAVE ? false : 'the generated tables or the W69 laser-hold rung are absent';

// The 58-slot enemy table is contiguous: $81332C..$81454B, stride $50.
const E_BASE = 0x81332c;
const E_STRIDE = 0x50;
const E_SLOTS = 58;
const E_TYPE = 0x0c;              // the spawn dispatch's type byte
const E_SUB = 0x06;               // the SUB-RECORD pointer (A6)

// `bee.js`'s reserved ten -- ONLY the carrier's death arm allocates from these.
const RESERVED = 0x817dc6;
const B_COUNT = 0x817f7e;
const B_STRIDE = 0x2c;

// `deathSeq8A`'s gate, from `$276744`: a hit bit in the $5C mask, and the HP SIGN.
const S_HP = 0x18;
const HIT_BIT = 0x04;

const occupied = (ram) => {
  let n = 0;
  for (let i = 0; i < 10; i++) if (ram.u8(RESERVED + i * B_STRIDE) !== 0) n++;
  return n;
};

/** Find a live type-$8A carrier and return its sub-record, or 0. */
function findCarrier(ram) {
  for (let i = 0; i < E_SLOTS; i++) {
    const a = E_BASE + i * E_STRIDE;
    if ((ram.u16(a) & 0x8000) === 0) continue;
    if (ram.u8(a + E_TYPE) !== 0x8a) continue;
    const a6 = ram.u32(a + E_SUB);
    if (a6 < 0x800000 || a6 > 0x81ffff) continue;   // an unset pointer is not a record
    return a6;
  }
  return 0;
}

async function boot() {
  const { Game } = await import('../src/main.js');
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
  const g = new Game(new Uint8Array(readFileSync(RUNG)), tables, { palCatchUp: false });
  return { g, hold: portWordFromBits([BIT.b1]) };
}

test('W285 killing a type-$8A carrier mid-run PRODUCES A MEDAL', { skip: SKIP },
  async () => {
    const { g, hold } = await boot();
    let killedAt = 0;
    let before = -1;
    let after = -1;

    for (let f = 1; f <= 1200; f++) {
      g.step(hold);
      if (killedAt) {
        // The allocation happens inside the carrier's own handler, so the frame AFTER
        // the poke is the first one that can show it.
        after = occupied(g.ram);
        break;
      }
      const a6 = findCarrier(g.ram);
      if (!a6) continue;
      before = occupied(g.ram);
      // Drive `$276744`'s two conditions and nothing else.
      g.ram.setU8(a6, g.ram.u8(a6) | HIT_BIT);
      g.ram.setU16(a6 + S_HP, 0x8001);
      killedAt = f;
    }

    assert.ok(killedAt > 0, 'a live carrier was found to kill');
    assert.equal(before, 0, 'and the reserved ten was empty before it died');
    assert.equal(after, 1, 'one reserved slot is taken the very next frame');
    assert.equal(g.ram.u16(B_COUNT), 1, 'and pool A\'s live count agrees');
  });

test('W285 the carrier really is common in the run, and really does not die on its own',
  { skip: SKIP }, async () => {
    // Both halves of W284's explanation, in one live run: carriers are plentiful, and
    // the parked-laser scenario kills none of them. If a future scenario change made
    // the second half false this test says so rather than quietly passing.
    const { g, hold } = await boot();
    const seen = new Set();
    let sawCarrier = 0;
    let beeEver = 0;
    for (let f = 1; f <= 1200; f++) {
      g.step(hold);
      for (let i = 0; i < E_SLOTS; i++) {
        const a = E_BASE + i * E_STRIDE;
        if ((g.ram.u16(a) & 0x8000) === 0) continue;
        if (g.ram.u8(a + E_TYPE) === 0x8a) { sawCarrier++; seen.add(i); }
      }
      if (occupied(g.ram)) beeEver++;
    }
    assert.ok(sawCarrier > 0, `a carrier was live on ${sawCarrier} slot-frames`);
    assert.equal(beeEver, 0,
      'and NO medal ever appeared unaided -- the scenario kills no carrier, which is '
      + 'why D17 was unreproducible here');
  });

test('W285 the gate is the HP SIGN, so a positive HP with a hit does NOT drop',
  { skip: SKIP }, async () => {
    // `$27674E tst.w / $276752 bmi` -- the SIGN, not zero. A port that tested `=== 0`
    // would drop nothing for an overkill that took HP negative, which is the normal
    // case for a laser. Driven the other way here: a hit with HP still positive must
    // produce nothing.
    const { g, hold } = await boot();
    let poked = 0;
    for (let f = 1; f <= 1200; f++) {
      g.step(hold);
      if (poked) { assert.equal(occupied(g.ram), 0, 'no medal from a survivable hit'); break; }
      const a6 = findCarrier(g.ram);
      if (!a6) continue;
      g.ram.setU8(a6, g.ram.u8(a6) | HIT_BIT);
      g.ram.setU16(a6 + S_HP, 0x0010);            // hit, but alive
      poked = f;
    }
    assert.ok(poked > 0, 'a carrier was found');
  });
