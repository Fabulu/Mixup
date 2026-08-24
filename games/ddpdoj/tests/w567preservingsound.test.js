// W567: preserving streaming entries reached through the address-only sound dispatcher.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { BgVram, TxVram, VideoRegs } from '../src/background.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import {
  SOUND, SOUND_ENTRY, SOUND_WRAPPERS, SoundState, postWrapper,
} from '../src/sound.js';
import {
  MENU2911B0, SLOT7, objSlot7,
} from '../src/objslot7pool.js';
import { ALLOC } from '../src/objalloc.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { RAM, P } from '../src/machine.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00076711.json');
const TABLE_HASH = '145945830be69de56a76312f0d44aaedd47519083d0da70fce2361ea06dba289';
const SKIP = existsSync(TABLES) && existsSync(IMAGE) ? false
  : 'generated tables or decrypted image absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = existsSync(CHECKPOINT)
  && existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz')) && !SKIP ? false
  : 'exact checkpoint bundle absent. This is a skip, not a pass.';
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W568_BASES = new Set([
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
]);
const W567_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(TABLE_JSON));
  copy.rom.windows = copy.rom.windows.filter((w) => !W568_BASES.has(w.base));
  return copy;
})();
const IMG = SKIP ? null : readFileSync(IMAGE);
const ROM = SKIP ? null : {
  u32: (address) => IMG.readUInt32BE(address),
  u16: (address) => IMG.readUInt16BE(address),
  u8: (address) => IMG[address],
  i32: (address) => IMG.readInt32BE(address),
  i16: (address) => IMG.readInt16BE(address),
  bytes: (address, count) => IMG.subarray(address, address + count),
};
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bundle = async () => loadBundle(
  async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));

function soundBench(head, tail) {
  const ram = new Ram();
  const sound = new SoundState();
  ram.setU16(SOUND.head, head);
  ram.setU16(SOUND.tail, tail);
  return { ram, sound };
}

test('W567 preserves the generated table identity and keeps both entries out of WRAPPERS',
  { skip: SKIP }, () => {
    assert.equal(canonicalHash(W567_TABLE), TABLE_HASH);
    assert.equal(W567_TABLE.rom.windows.length, 825);
    assert.equal(W567_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451687);
    assert.deepEqual(SOUND_ENTRY[0x28c0fc], { type: 0x10, gate: 'none', tail: false });
    assert.deepEqual(SOUND_ENTRY[0x28c10c], { type: 0x20, gate: 'none', tail: false });
    assert.equal(SOUND_WRAPPERS[0x28c0fc], undefined);
    assert.equal(SOUND_WRAPPERS[0x28c10c], undefined);
  });

test('W567 address dispatch packs, wraps, and accounts for both preserving entries', () => {
  const ok = soundBench(0x0004, 0x0188);
  assert.equal(postWrapper(ok.ram, ok.sound, 0x28c0fc), true);
  assert.equal(postWrapper(ok.ram, ok.sound, 0x28c10c), true);
  assert.equal(ok.ram.u32(SOUND.ring + 0x0188), 0x10000000);
  assert.equal(ok.ram.u32(SOUND.ring + 0x018c), 0x20000000);
  assert.deepEqual([ok.ram.u16(SOUND.head), ok.ram.u16(SOUND.tail)], [0x0004, 0x0000]);
  assert.deepEqual([
    ok.sound.postCount, ok.sound.dropCount, ok.sound.framePosts, ok.sound.frameDrops,
  ], [2, 0, 2, 0]);

  const full = soundBench(0x0004, 0x0000);
  full.ram.setU32(SOUND.ring, 0x5a5aa5a5);
  const before = Array.from(full.ram.b);
  assert.equal(postWrapper(full.ram, full.sound, 0x28c0fc), false);
  assert.equal(postWrapper(full.ram, full.sound, 0x28c10c), false);
  assert.deepEqual(Array.from(full.ram.b), before, 'a full ring changes neither payload nor cursor');
  assert.deepEqual([
    full.sound.postCount, full.sound.dropCount, full.sound.framePosts, full.sound.frameDrops,
  ], [0, 2, 0, 2]);
});

test('W567 slot 7 posts the immediate chain, enters menu state 4, then LEFT and SHOT choose loop 2',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const rom = ROM;
    const sound = new SoundState();
    const posts = [];
    const unported = new UnportedLog();
    const ctx = {
      videoRegs: new VideoRegs(), tx: new TxVram(), bgVram: new BgVram(),
      palette: new PaletteState(), unported, unportedLog: unported,
      soundPost: (address) => {
        posts.push(address);
        return postWrapper(ram, sound, address);
      },
    };
    const a5 = 0x812000;
    const a6 = SLOT7.work;
    const p1Edge = 0x803972;
    ram.setU32(SLOT7.p1, 0x80000000);
    ram.setU32(SLOT7.p2, 0x00000000);
    ram.setU16(SLOT7.postD1[0], 2);
    ram.setU16(SLOT7.postD1[1], 2);
    ram.setU16(SLOT7.gate, 0);

    objSlot7(ram, rom, a5, ctx);
    assert.deepEqual(posts.slice(0, 3), [0x28c170, 0x28c0fc, 0x28c10c]);
    assert.deepEqual([
      ram.u32(SOUND.ring), ram.u32(SOUND.ring + 4), ram.u32(SOUND.ring + 8),
    ], [0x15000000, 0x10000000, 0x20000000]);
    assert.equal(ram.u8(a5 + SLOT7.stateAt), 1);
    assert.equal(ram.u16(a6 + SLOT7.innerAt), 4, 'the real menu gate opens inner state 4');
    assert.equal(ram.u16(a6 + SLOT7.seqSel), 0, '$290B4C mapped post value 2 to sequence 0');
    assert.equal(ram.u16(SLOT7.bannerSel), 0, '$290B4C reset the banner selector');

    let introFrames = 0;
    while (ram.u16(a6 + 0x06) !== 2 && introFrames < 4000) {
      ram.setU16(p1Edge, 0);
      objSlot7(ram, rom, a5, ctx);
      introFrames++;
    }
    assert.ok(introFrames < 4000, 'the authentic menu intro did not reach input state 2');
    assert.equal(ram.u16(MENU2911B0.sel), 1);

    ram.setU16(p1Edge, 0x04);
    objSlot7(ram, rom, a5, ctx);
    assert.equal(ram.u16(MENU2911B0.sel), 0, 'LEFT toggles the default choice from 1 to 0');
    ram.setU16(p1Edge, 0x10);
    objSlot7(ram, rom, a5, ctx);
    assert.equal(ram.u16(a6 + 0x06), 3, 'SHOT confirms the chosen loop option');

    ram.setU32(a6 + 0x14, 0x813000);
    ram.setU32(0x813000 + 0x2c, 0);
    ram.setU16(p1Edge, 0);
    objSlot7(ram, rom, a5, ctx);
    assert.equal(ram.u8(a5 + SLOT7.stateAt), 2);
    objSlot7(ram, rom, a5, ctx);

    assert.equal(ram.u16(SLOT7.gate), 1, 'the raw loop word advances from 0 to 1');
    assert.equal(ram.u16(ALLOC.createStage), 0x8011, 'slot type $11 is staged with its pending bit');
    assert.equal(ram.u16(ALLOC.createStage) & 0x7fff, 0x0011, 'the staged slot type is $11');
  });

test('W567 exact lf76711 replay reaches the historical menu intro frontier after both entries',
  { skip: SKIP_CHECKPOINT }, async () => {
    const current = await bundle();
    const exact = { ...current, tables: W567_TABLE };
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.equal(checkpoint.tablesSha256, TABLE_HASH);
    const { game, probe } = restoreCheckpoint(checkpoint, exact, checkpoint.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 1000; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(probe.inputWord);
      } catch (caught) {
        error = caught;
        break;
      }
    }
    assert.equal(attempted, 9);
    assert.equal(game.logicFrame, 76719);
    assert.equal(error?.romAddress, 0x29139e);
    assert.match(error?.message ?? '', /word at \$29139E/);
    assert.doesNotMatch(error?.message ?? '', /no wrapper at \$28C0FC|no wrapper at \$28C10C/);
    assert.equal(game.ram.u16(SLOT7.gate), 0, 'the exact run is still in loop zero');
    assert.equal(game.ram.u16(SLOT7.work + SLOT7.innerAt), 4, 'slot 7 entered menu state 4');
    assert.equal(game.ram.u16(SLOT7.work + 0x06), 1, 'the menu is running its intro list');
    assert.equal(game.ram.u16(SLOT7.work + SLOT7.seqSel), 1,
      'the independent sequence selector remains one at the historical intro frontier');
  });
