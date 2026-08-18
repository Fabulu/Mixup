// W227: the option object's player-death arm $24CA60 (docket D9).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { OPTION_BLOCKS, OPT, runOptionObject } from '../src/options.js';
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

test('W227 a dying player clears its own option block and nothing past it',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const log = new UnportedLog();
    const [p1, p2] = OPTION_BLOCKS;

    // A recognisable pattern in each block, written in that order so P1's fifty
    // words cannot reach into P2's -- they are exactly adjacent.
    for (let n = 0; n < 50; n++) ram.setU16(p1.opt + n * 2, 0xa5a5);
    for (let n = 0; n < 50; n++) ram.setU16(p2.opt + n * 2, 0x5a5a);
    ram.setU16(p1.opt + OPT.state, 0x8003);
    // $5A5A has bit 15 clear, so P2's block is not live and is skipped: its
    // pattern survives untouched and witnesses where the clear stops.
    ram.bset8(p1.player + P.state, 0);           // $24C14A: THE PLAYER IS DYING

    runOptionObject(ram, { ram, rom: ROM, unported: log, unportedLog: log });

    // $24CA60: fifty words, and $81050E - $8104AA is exactly those fifty words
    for (let n = 0; n < 50; n++)
      assert.equal(ram.u16(p1.opt + n * 2), 0, `word ${n} cleared`);
    assert.equal(p2.opt - p1.opt, 50 * 2, 'the clear stops at the next block');
    assert.equal(ram.u16(p2.opt), 0x5a5a, "and P2's block is untouched");
    assert.deepEqual(log.report(), [], 'the arm is translated, not deferred');

    // the arm returns before the rest of the block runs: the raw-input copy at
    // $24C134 happens first and the clear takes it back out again
    assert.equal(ram.u8(p1.opt + OPT.raw), 0);
  });

test('W227 a real death runs its animation and reset instead of stopping',
  { skip: SKIP_SEED }, () => {
    const g = new Game(new Uint8Array(readFileSync(seedPath)), json,
      { palCatchUp: false });
    const shot = portWordFromBits([BIT.b1]);
    for (let n = 0; n < 90; n++) g.step(shot);
    g.ram.setU16(0x81b65c, 1);
    g.ram.setU16(0x81b642, 0x095f);
    g.step(portWordFromBits([BIT.b1, BIT.b2]));

    // This is W226's hyper scenario, and holding button 1 without dodging gets
    // the player killed on a fixed frame.  Before this wave the very next option
    // pass stopped the port at $24CA60.
    let died = 0;
    // W324: the window's end moves with the death, 496 -> 494. It has to: the reset used to
    // land at 497 and now lands at 495, so stopping at 496 would step PAST the reset and find
    // the option block re-armed at $8001 by the respawn instead of cleared by the death.
    // W411: 494 -> 493, for the same one-frame shift the note below records.
    for (let f = 92; f <= 493; f++) {
      g.step(shot);
      if (!died && (g.ram.u8(RAM.player1 + P.state) & 1) !== 0) died = f;
    }
    // W324: 426 -> 424, and the CAUSE is a fidelity gain rather than a regression. This
    // scenario holds Button 1 WITH the hyper on, so it runs the beam -- and W324 wired
    // `$25485E jsr $289F96`, the beam-BODY effect, which had been a counted note since W34.
    // Pool E's `fillSlot` draws the shared RNG at `$28A204 jsr $242FFC`, so a port that
    // skipped the call also skipped its draws and every later draw came out one step early.
    // Running it consumes what the board consumes and the death lands two frames sooner.
    //
    // **THE NEW NUMBER IS NOT BOARD-VERIFIED**, and that is stated rather than implied: 424
    // is this port with the draws, 426 was this port without them, and only an oracle trace
    // of the death frame can say which matches the machine. What IS established is that the
    // board makes the call, so making it is the more faithful of the two.
    // W411 (docket D42): 424 -> 423, and it is the SAME MECHANISM W324 recorded one
    // line up. `$24CBCC` is `bclr #$7,($1,A6)` -- the OPTION BLOCK -- and the port was
    // clearing the beam RECORD's byte, so the beam HEAD was laid once per press instead
    // of once per hit. It is now laid repeatedly, each laying puts a type-1 BODY segment
    // in pool slot 27, and that segment's `($26,A6)` divider is the only caller of
    // `$289F96`, whose `fillSlot` draws `$242FFC`. More allocations, more draws on the
    // shared `$803916`, every later event one frame earlier. MEASURED as an RNG shift and
    // not an art change: with `src/spark.js`'s D48 fix alone and `src/laser.js` at HEAD the
    // frame is still 424; with the laser fix alone it is 423.
    assert.equal(died, 423, 'the player dies where the RNG draws now put it');
    assert.equal(g.ram.u16(OPTION_BLOCKS[0].opt), 0,
      'and its option block is cleared, not stepped');
    assert.equal(g.ram.u16(0x8130fa), 1,
      '$24A210 armed the respawn dispatcher entry, which is the next frontier');
  });
