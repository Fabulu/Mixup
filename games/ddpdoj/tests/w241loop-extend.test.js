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
    // W445 REWRITES THIS ASSERTION -- IT WAS PINNING THE DEFECT. It read
    // `assert.ok(f.log.report().some((l) => l.includes(s.row)), 'defers ' + s.row)`,
    // above the comment "The LIVES row is a counted zero-RAM-write draw, and it is the
    // ONLY thing this routine defers". `hud.js` has EXPORTED `livesRow2878CC` since
    // W116; `items.js` and `tally.js` had it wired at four sites. THIS was the fifth
    // and the only one on a live path, so a loop extend granted the free life and left
    // the row on screen reading zero. The routine now defers NOTHING.
    assert.deepEqual(f.log.report(), [],
      `${s.row} is drawn, not counted -- this arm has nothing left to defer`);
  }
});

// THE WITNESS IS OUTSIDE stageend.js. `livesRow2878CC` writes no flag this file owns;
// it appends (dest, tile) pairs to the $80B058 TX DEFER BUFFER through
// `hud.js txPrint240DC2`/`txPrint240EBC`. A faked wiring -- an early return, a stub, a
// re-added note -- leaves the cursor at its head and this test red. The three controls
// below are what say the records are the EXTEND and not the bench: each one refuses the
// extend through a DIFFERENT one of the cartridge's four gates and draws nothing.
test('W445 a LOOP EXTEND redraws that side\'s lives row, and each gate that refuses '
  + 'the extend also refuses the draw', { skip: SKIP }, () => {
  const HEAD = 0x80b058, CURSOR = 0x80c8d8;
  const cells = (ram) => Math.max(0, (ram.u32(CURSOR) - HEAD) / 8);

  for (const s of [P1, P2]) {
    const f = fixture(s);
    f.ram.setU32(CURSOR, HEAD);                 // what camReset arms before any body runs
    assert.equal(cells(f.ram), 0, 'nothing drawn before the extend');
    run(f, s);
    // Six vertical slots ($287902 moveq #5,D7 -> dbra = 6), each two cells wide
    // ($287904 moveq #1,D2). The extend just made lives 1, so $287910 takes the icon
    // arm once and $287944's blank arm covers the other five: 2 icon + 10 blank.
    assert.equal(cells(f.ram), 12, `${s.row} reached the defer buffer`);
    const recs = [];
    for (let a = HEAD; a + 8 <= f.ram.u32(CURSOR); a += 8) recs.push([f.ram.u32(a), f.ram.u32(a + 4)]);
    assert.equal(recs.filter(([, t]) => t === 0xc0000000).length, 10, 'ten blank cells');
    assert.equal(recs.filter(([, t]) => t !== 0xc0000000).length, 2, 'and the one life\'s icon');
    // P1's row steps its column base UP $100 a slot ($28793C addi.w #$100,D1) from
    // $2878D4 move.w #$200,D1; P2's steps DOWN from $287988 move.w #$1900,D1
    // ($2879C6 subi.w #$100,D1). Asserting the SIDE-SPECIFIC ladder is what stops a
    // wiring that always passed `who = 0` from passing here.
    const cols = [...new Set(recs.map(([d]) => (d - 0x904000) & 0xff00))].sort((a, b) => a - b);
    assert.deepEqual(cols, s === P1
      ? [0x200, 0x300, 0x400, 0x500, 0x600, 0x700]
      : [0x1400, 0x1500, 0x1600, 0x1700, 0x1800, 0x1900],
    `the ${s === P1 ? 'P1' : 'P2'} ladder, which is how the side is proved`);
  }

  for (const over of [{ loop: 0 }, { gateA: 1 }, { gateB: 1 }, { lives: 3 }]) {
    const f = fixture(P1, over);
    f.ram.setU32(CURSOR, HEAD);
    run(f, P1);
    assert.equal(cells(f.ram), 0,
      `refused by ${JSON.stringify(over)} -- no life, and therefore no row either`);
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
