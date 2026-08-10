// W241: the LOOP's zero-lives extend $253794, which was noted as a "pod teardown".

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { resetPower25313E } from '../src/stageend.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

// `base` is the PLAYER record, which is what `$25313E tst.w/bpl` gates on.
const P1 = { base: 0x8103e6, at: 0x25313e, lives: 0x8130be,
  gateA: 0x812934, gateB: 0x81293c, row: '$2878CC' };
const P2 = { base: 0x810448, at: 0x25318e, lives: 0x8130c0,
  gateA: 0x812936, gateB: 0x81293e, row: '$28795C' };

function fixture(s, over = {}) {
  const ram = new Ram();
  ram.setU16(s.base, 0x8000);                  // $25313E tst.w/bpl
  ram.setU16(0x813098, over.loop ?? 1);        // the LOOP flag
  ram.setU16(s.gateA, over.gateA ?? 0);
  ram.setU16(s.gateB, over.gateB ?? 0);
  ram.setU16(s.lives, over.lives ?? 0);
  const log = new UnportedLog();
  const events = [];
  return { ram, log, events, ctx: { ram, rom: ROM, unported: log, unportedLog: log,
    soundPost(a) { events.push(['sound', a]); },
    stageEndEvent(...a) { events.push(a); } } };
}

const run = (f, s) => resetPower25313E(f.ram, f.ctx, s.base, s.at);

test('W241 the loop grants one life at zero, and sounds the extend', { skip: SKIP }, () => {
  for (const s of [P1, P2]) {
    const f = fixture(s);
    run(f, s);
    assert.equal(f.ram.u16(s.lives), 1, 'one free life');
    assert.ok(f.events.some((e) => e[0] === 'sound' && e[1] === 0x28c678),
      '$2537D8 jsr $28C678 -- the extend jingle');
    assert.ok(f.events.some((e) => e[0] === 'loop-extend'), 'and it reports it');
    // The LIVES row is a counted zero-RAM-write draw, and it is the ONLY thing this
    // routine defers -- so the report naming exactly it is the claim.
    assert.ok(f.log.report().some((l) => l.includes(s.row)), `defers ${s.row}`);
  }
});

test('W241 every one of its four gates refuses', { skip: SKIP }, () => {
  const refuses = (over) => {
    const f = fixture(P1, over);
    run(f, P1);
    return f.ram.u16(P1.lives) === (over.lives ?? 0);
  };
  assert.ok(refuses({ loop: 0 }), 'not on the first loop ($813098)');
  assert.ok(refuses({ gateA: 1 }), '$812934');
  assert.ok(refuses({ gateB: 1 }), '$81293C');
  assert.ok(refuses({ lives: 3 }), 'and not while lives remain');
});

test('W241 the $14 check is dead, and that is the cartridge\'s redundancy',
  { skip: SKIP }, () => {
    // $2537B6 proves $8130BE is zero and $2537C0 then compares it against $14, which
    // can never match. The port keeps both, so this states the fact rather than
    // asserting a behaviour that cannot be produced: at lives $14 it is the EARLIER
    // gate that refuses.
    const f = fixture(P1, { lives: 0x14 });
    run(f, P1);
    assert.equal(f.ram.u16(P1.lives), 0x14, 'unchanged, by the tst.w and not the cmpi');
    const src = readFileSync(new URL('../src/stageend.js', import.meta.url), 'utf8');
    assert.ok(/0x14\) return;\s*\/\/ \$2537C0 \/ \$25380E -- dead/.test(src),
      'and the port records it as dead rather than deleting it');
  });
