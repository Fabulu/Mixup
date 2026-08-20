// W228: the respawn $25FFA8, jump-table entry 1 of the $25FF7A dispatcher
// (docket D9, the link after W227).
//
// W446 -- THE SUBJECT MOVED AND NOT ONE ASSERTION DID. These five tests were written
// against `player.js`'s copy, which W445 proved had NO PRODUCTION CALLER: the same
// fifty-eight instructions were transcribed a second time as `tally.js
// bonusLine125FFA8`, and THAT is what `tallyDriver25FF7A` case 1 runs. W446 merged the
// two into the one live body, so this file now imports the survivor. Nothing below was
// weakened to make it fit -- the point of pointing it here is that W228's evidence
// (the id at `($18,A6)`, the 12-record defer buffer, the game-over handoff to request
// 2, and the full-game death-and-respawn run) now bears on the copy the game runs.
//
// TWO ASSERTIONS BELOW WERE RED ON THE LIVE COPY BEFORE THE MERGE, and that is the
// measurement: `$26002E move.l D0,($18,A6)` was absent from `tally.js`, so
// `ram.u32(a6 + 0x18)` stayed at the bench's $DEADBEEF.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { bonusLine125FFA8 } from '../src/tally.js';
import { ALLOC } from '../src/objalloc.js';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P, BIT } from '../src/machine.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const seedPath = new URL('../rip/web/seed.bin', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const SKIP_SEED = HAVE && existsSync(seedPath)
  ? false : 'generated ROM tables/seed absent; skip, not pass';

const ENTRY = 0x8130fa;          // P1's $25FF7A table entry, stride $24
const COUNT = 0x8130be;          // what the seed's $8(a6) points at

/** The entry as the seed carries it, with the count set by the caller. */
function entry(ram, count, { p2 = false, type = 2 } = {}) {
  ram.setU16(ENTRY, 1);                       // $24A210 armed it
  ram.setU16(ENTRY + 0x02, 0x1234);           // cleared unconditionally at $26004E
  ram.setU32(ENTRY + 0x08, COUNT);
  ram.setU16(ENTRY + 0x0c, 0x1000);
  ram.setU16(ENTRY + 0x0e, 0x0e00);
  ram.setU16(ENTRY + 0x14, type);
  ram.setU8(ENTRY + 0x17, p2 ? 1 : 0);
  ram.setU32(ENTRY + 0x18, 0xdeadbeef);
  ram.setU16(COUNT, count);
  return ENTRY;
}

function ctxOf(ram) {
  const log = new UnportedLog();
  const events = [];
  return { log, events, ctx: { ram, rom: ROM, unported: log, unportedLog: log,
    deathEvent(...a) { events.push(a); } } };
}

test('W228 a life in hand creates the player object and spends the count',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, events, ctx } = ctxOf(ram);
    const a6 = entry(ram, 1);

    bonusLine125FFA8(ram, ROM, ctx, a6);

    assert.equal(ram.u16(COUNT), 0, '$25FFC8 subq.w #$1 on the pointed-at word');
    assert.equal(ram.u16(a6), 0, '$26004A: state 0, the dispatcher goes idle');
    assert.equal(ram.u16(a6 + 0x02), 0, '$26004E clears it unconditionally');
    assert.equal(ram.u16(0x8130d4), 0x78, '$25FFB6');
    assert.deepEqual([ram.u16(0x81316c), ram.u16(0x81316a)], [1, 0], '$261116');

    // $260028 staged a create of the entry's type, and $26002E kept its id
    const staged = ALLOC.createStage;
    assert.equal(ram.u16(staged) & 0xff, 2, 'object type 2, P1');
    assert.equal(ram.u16(staged) & 0x8000, 0x8000, 'and it is marked live');
    assert.equal(ram.u32(a6 + 0x18), ram.u32(staged + ALLOC.idOff));
    assert.notEqual(ram.u32(a6 + 0x18), 0xdeadbeef);
    assert.deepEqual([ram.u8(staged + 0x06), ram.u8(staged + 0x07),
      ram.u16(staged + 0x08), ram.u16(staged + 0x0a)], [0, 0, 0x1000, 0x0e00],
    '$260032..$260044 hand the new object its side and its position');

    assert.deepEqual(events, [['respawn', 1, 0, 'ok']]);
    // W445 REWRITES THIS ASSERTION -- IT WAS PINNING THE DEFECT. It read
    // `['$23C668', '$2878CC']` and called that "the only thing this arm defers is a
    // VRAM clear and a HUD row", which made the missing lives row look like the
    // measured, intended state. `hud.js` has EXPORTED `livesRow2878CC` since W116 and
    // the cartridge's `$260014` is an unconditional `jsr $2878CC`. Only `$23C668`
    // ($907000, outside the $904000 TxVram this port models) is genuinely still out.
    assert.deepEqual(log.report().map((l) => l.trim().split(' ')[2]), ['$23C668'],
      '$2878CC is DRAWN now, not counted; if it comes back here the wiring was lost');
  });

// THE WIRING'S OWN WITNESS, AND IT IS OUTSIDE tally.js ENTIRELY.
// `livesRow2878CC` writes nothing tally.js can see: it appends (dest, tile) pairs to
// the `$80B058` TX DEFER BUFFER through `hud.js txPrint240DC2`/`txPrint240EBC`. So a
// faked wiring -- a call that returns early, a stub, a re-added note -- leaves this
// buffer at its head and this test red. The unarmed run below is the control that says
// the 12 records are the DRAW and not the bench: same respawn, cursor never armed,
// nothing written. (That unarmed case is also why the old note called $2878CC a
// "ZERO RAM WRITES" draw -- it was measured on a bench with no buffer.)
test('W445 the respawn REDRAWS the lives row, and an unarmed buffer is the control',
  { skip: SKIP }, () => {
    const HEAD = 0x80b058, CURSOR = 0x80c8d8;
    const records = (ram) => {
      const out = [];
      for (let a = HEAD; a + 8 <= ram.u32(CURSOR); a += 8) out.push([ram.u32(a), ram.u32(a + 4)]);
      return out;
    };

    const armed = new Ram();
    armed.setU32(CURSOR, HEAD);                 // what camReset does before any body runs
    bonusLine125FFA8(armed, ROM, ctxOf(armed).ctx, entry(armed, 1));
    const recs = records(armed);
    // Six vertical slots ($287902 moveq #5,D7 -> dbra = 6) each two cells wide
    // ($287904 moveq #1,D2), so 12 pairs.
    assert.equal(recs.length, 12, 'six 2-cell slots reached the defer buffer');
    // $25FFC8 subq.w #$1 spent the one life BEFORE the row is drawn, so $28790C reads
    // ZERO and $287910 beq skips the icon loop entirely: all six slots are blanks.
    // That is the cartridge's order and it is why the row must be redrawn at all.
    assert.equal(recs.filter(([, t]) => t === 0xc0000000).length, 12,
      'twelve blank cells -- $240EBC discards D4 and writes $C0000000 into every one');
    // AND THE ICON ARM IS REACHABLE, measured on the same body: give the count 3 and
    // two of the six slots become icons off $2881E2. Without this the assertion above
    // would also pass on a body that could only ever draw blanks.
    {
      const three = new Ram();
      three.setU32(CURSOR, HEAD);
      bonusLine125FFA8(three, ROM, ctxOf(three).ctx, entry(three, 3));
      const r3 = records(three);
      assert.equal(r3.length, 12, 'still six slots');
      assert.equal(r3.filter(([, t]) => t !== 0xc0000000).length, 4,
        'two life icons ($2881E2, two cells each) once the count survives the subq');
      assert.deepEqual(r3.slice(0, 4).map(([, t]) => t >>> 0),
        [0xc6270012, 0xc6280012, 0xc6270012, 0xc6280012],
        '$2881E2 is $06270012 and $240DEE steps the tile $10000 per cell');
    }
    // P1's row walks its column base UP by $100 a slot ($28793C addi.w #$100,D1),
    // so the six dests are $100 apart -- proof these are the ROW, not stray writes.
    const cols = [...new Set(recs.map(([d]) => (d - 0x904000) & 0xff00))].sort((a, b) => a - b);
    assert.deepEqual(cols, [0x200, 0x300, 0x400, 0x500, 0x600, 0x700],
      'six slots, one row apart, from $2878D4 move.w #$200,D1');

    const unarmed = new Ram();                  // cursor left at 0 -- the ROM's null case
    bonusLine125FFA8(unarmed, ROM, ctxOf(unarmed).ctx, entry(unarmed, 1));
    assert.equal(unarmed.u32(CURSOR), 0, 'an unarmed buffer draws nothing, as $240DCC does');
  });

test('W228 the last life falls through to the game-over arm', { skip: SKIP }, () => {
    const ram = new Ram();
    const { events, ctx } = ctxOf(ram);
    const a6 = entry(ram, 0);

    bonusLine125FFA8(ram, ROM, ctx, a6);

    assert.equal(ram.u16(COUNT), 0xffff, 'the count goes NEGATIVE, which is the test');
    assert.equal(ram.u16(a6), 2,
      '$260004 arms request 2, and $25FF52[2] is $260056, the continue entry');
    assert.deepEqual([ram.u16(0x812930), ram.u16(0x812934), ram.u16(0x812938)],
      [0, 1, 0], '$25FFD8, P1 side');
    assert.equal(ram.u16(ALLOC.createStage), 0, 'and NO object was created');
    assert.deepEqual(events, [['game-over', 1, 0xffff]]);
  });

test('W228 the P2 arm writes the other three words', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf(ram);
  bonusLine125FFA8(ram, ROM, ctx, entry(ram, 0, { p2: true, type: 3 }));
  assert.deepEqual([ram.u16(0x812932), ram.u16(0x812936), ram.u16(0x81293a)],
    [0, 1, 0], '$25FFF0, P2 side');
  assert.deepEqual([ram.u16(0x812930), ram.u16(0x812934), ram.u16(0x812938)],
    [0, 0, 0], "and P1's are untouched");
});

test('W228 a real death respawns and keeps running',
  { skip: SKIP_SEED }, () => {
    const g = new Game(new Uint8Array(readFileSync(seedPath)), json,
      { palCatchUp: false });
    const shot = portWordFromBits([BIT.b1]);
    for (let n = 0; n < 90; n++) g.step(shot);
    g.ram.setU16(0x81b65c, 1);
    g.ram.setU16(0x81b642, 0x095f);
    g.step(portWordFromBits([BIT.b1, BIT.b2]));
    assert.equal(g.ram.u16(COUNT), 2, 'the seed carries two in reserve');

    let died = 0;
    // With W231's init and pod deploy in, this scenario now survives THREE deaths
    // and two full respawns: it dies at 426, 767 and 1207, spends the seed's two
    // lives at 497 and 838, and at 1278 the third death exhausts the count and arms
    // request 2 -- $260056, the credit/continue entry, which is the next frontier.
    // 700 is inside the first respawn's life, after its reset at 497 and before the
    // second death at 767, so the count below is exactly one and the player is alive.
    for (let f = 92; f <= 700; f++) {
      g.step(shot);                  // stopped at $24CA60, then $25FFA8, then $24C934
      if (!died && (g.ram.u8(RAM.player1) & 1) !== 0) died = f;
    }
    // W324: 426 -> 424. The same two-frame shift w227death.test.js records, from the same
    // cause: this scenario holds the beam with the hyper on, W324 wired the beam-BODY effect
    // `$25485E jsr $289F96` that had been a counted note since W34, and pool E's `fillSlot`
    // draws the shared RNG. Consuming the draws the board consumes moves every later event
    // two frames earlier. The 767/1207/497/838/1278 frames in the comment above are from the
    // pre-W324 port and will each have shifted too; only 424 and the invariants below are
    // asserted, so they are left as the narrative they are rather than re-measured here.
    // W411 (docket D42): 424 -> 423, and it is the SAME MECHANISM W324 recorded one
    // line up. `$24CBCC` is `bclr #$7,($1,A6)` -- the OPTION BLOCK -- and the port was
    // clearing the beam RECORD's byte, so the beam HEAD was laid once per press instead
    // of once per hit. It is now laid repeatedly, each laying puts a type-1 BODY segment
    // in pool slot 27, and that segment's `($26,A6)` divider is the only caller of
    // `$289F96`, whose `fillSlot` draws `$242FFC`. More allocations, more draws on the
    // shared `$803916`, every later event one frame earlier. MEASURED as an RNG shift and
    // not an art change: with `src/spark.js`'s D48 fix alone and `src/laser.js` at HEAD the
    // frame is still 424; with the laser fix alone it is 423.
    assert.equal(died, 423);
    assert.equal(g.ram.u16(COUNT), 1, 'one life spent');
    assert.equal(g.ram.u16(ENTRY), 0, 'and the dispatcher is idle again');
    assert.equal(g.ram.u8(RAM.player1) & 1, 0, 'the death bit is clear');

    // The respawned player answers the stick, and W231 gave it a long axis too:
    // $2491C0's init takes the position from the object record the respawn filled.
    // w231playerinit.test.js pins that exactly; here it is enough that it is set.
    const left = portWordFromBits([BIT.left]);
    for (let n = 0; n < 60; n++) g.step(left);    // ...and 760 < 767
    assert.equal(g.ram.u16(RAM.player1 + P.posX), 0x300);
    assert.notEqual(g.ram.u16(RAM.player1 + P.posY), 0);
  });
