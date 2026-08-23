import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Game, RAM } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { BIT, P } from '../src/machine.js';
import { FullRom } from '../src/rom.js';
import {
  COLD_BOOT_COINAGE,
  MAINCPU_SHA256,
  buildMainCpu,
  installColdBootDefaults,
  sha256Bytes,
  tablesFromMainCpu,
} from '../src/localrom.js';

const ROM_DIR = fileURLToPath(new URL('../rip/rom/', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const BIOS = `${ROM_DIR}/ddp3_bios.u37`;
const PROGRAM = `${ROM_DIR}/ddb10_10_8_434f.u45`;
const digest = webcrypto.subtle.digest.bind(webcrypto.subtle);

test('FullRom reads big-endian values and rejects every out-of-range read', () => {
  const rom = new FullRom(new Uint8Array([0x80, 0x01, 0x23, 0x45, 0x67]));
  assert.equal(rom.u8(0), 0x80);
  assert.equal(rom.u16(1), 0x0123);
  assert.equal(rom.i16(0), -32767);
  assert.equal(rom.u32(1), 0x01234567);
  assert.deepEqual(rom.bytes(2, 3), [0x23, 0x45, 0x67]);
  assert.equal(rom.byteCount, 5);
  assert.throws(() => rom.u16(4), RangeError);
  assert.throws(() => rom.u8(-1), RangeError);
});

if (existsSync(BIOS) && existsSync(PROGRAM) && existsSync(TABLES)) {
  test('raw ddpdojblk members reproduce the exact maincpu, direct tables, and cold boot', async () => {
    const maincpu = await buildMainCpu({
      bios: new Uint8Array(readFileSync(BIOS)),
      program: new Uint8Array(readFileSync(PROGRAM)),
    }, { digest });
    assert.equal(await sha256Bytes(maincpu, digest), MAINCPU_SHA256);
    const fromDecrypted = await buildMainCpu({ decrypted: maincpu }, { digest });
    assert.notEqual(fromDecrypted, maincpu, 'the supplied decrypted input is copied');
    assert.equal(await sha256Bytes(fromDecrypted, digest), MAINCPU_SHA256);

    const direct = tablesFromMainCpu(maincpu);
    const exported = JSON.parse(readFileSync(TABLES, 'utf8'));
    assert.deepEqual(direct.dirTable, exported.dirTable);
    assert.deepEqual(direct.foldTable, exported.foldTable);
    assert.deepEqual(direct.gov, exported.gov);
    assert.deepEqual(direct.anim, exported.anim);
    for (const level of exported.speed.exported) {
      assert.deepEqual(direct.speed.quads[String(level)], exported.speed.quads[String(level)]);
    }

    const game = new Game(new Uint8Array(0x20000), direct, {
      rom: new FullRom(maincpu),
      palCatchUp: false,
    });
    game.boot();
    installColdBootDefaults(game.ram);
    assert.equal(game.ram.u8(COLD_BOOT_COINAGE), 1);

    const run = (count, player = 0xffff, coin = 0xffff) => {
      game.coinPort = coin;
      for (let frame = 0; frame < count; frame++) game.step(player);
    };
    run(400);
    assert.equal(game.ram.u16(0x812e56), 0x0002);
    run(20, 0xffff, 0xfffe);
    run(10);
    assert.equal(game.ram.u8(0x80395a), 1, 'the local cold-boot default accepts a coin');
    run(20, portWordFromBits([BIT.start]));
    assert.equal(game.ram.u16(0x812e56), 0x000e, 'START reaches gameplay');
    assert.equal(game.ram.u8(0x80395a), 0, 'START spends the local credit');

    let playerFrame = 0;
    for (; playerFrame < 2600; playerFrame++) {
      game.step(0xffff);
      if ((game.ram.u16(RAM.player1) & 0x8000) !== 0) break;
    }
    assert.ok(playerFrame < 2600, 'the local cold boot creates the player');
    assert.equal(game.playerDamageTransform, undefined,
      'ordinary local launch has no invulnerability transform');

    const x = game.ram.u16(RAM.player1 + P.posX);
    run(12, portWordFromBits([BIT.right]));
    assert.ok(game.ram.u16(RAM.player1 + P.posX) > x, 'the local player moves');
    const shots = Array.from(game.shotSpawns.values()).reduce((sum, count) => sum + count, 0);
    run(12, portWordFromBits([BIT.b1]));
    assert.ok(Array.from(game.shotSpawns.values()).reduce((sum, count) => sum + count, 0)
      > shots, 'the local player fires');

    run(216);
    assert.equal(game.ram.u8(RAM.player1 + P.invuln), 0,
      'the authentic spawn protection expires instead of becoming permanent');
  });
}
