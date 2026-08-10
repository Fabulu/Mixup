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
    for (let f = 92; f <= 496; f++) {
      g.step(shot);
      if (!died && (g.ram.u8(RAM.player1 + P.state) & 1) !== 0) died = f;
    }
    assert.equal(died, 426, 'the player dies where it always did');
    assert.equal(g.ram.u16(OPTION_BLOCKS[0].opt), 0,
      'and its option block is cleared, not stepped');
    assert.equal(g.ram.u16(0x8130fa), 1,
      '$24A210 armed the respawn dispatcher entry, which is the next frontier');
  });
