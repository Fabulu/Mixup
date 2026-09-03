// W234: the bee's collected animation and its "500" popup (docket D6).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { BUCKETS } from '../src/spritequeue.js';
import { POOL_A, B, KIND, runPoolADriver, clearPoolA } from '../src/bee.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const manifestPath = new URL('../assets/manifest.json', import.meta.url);
const streamsPath = new URL('../assets/spr/streams.u32.gz', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const SKIP_BUNDLE = HAVE && existsSync(manifestPath) && existsSync(streamsPath)
  ? false : 'generated assets absent; skip, not pass';

/** A COLLECTED bee, the state `$27FAD0` routes to `$28112C`: bit 0 set, the two
 *  timers armed, and the lifetime byte still counting. */
function collectedBee(ram, over = {}) {
  clearPoolA(ram);
  const a6 = POOL_A.reservedBase;
  const o = { status: KIND.bee | 0x8000 | 0x0001, pos: 0x40002000,
    sprite: 0x001bca34, timer: 0x0a, reload: 0x0a, step: 0x0040,
    phase: 0x02, life: 0x04, speed: 0x10, x2: false, ...over };
  ram.setU16(a6 + B.status, o.status | (o.x2 ? 0x2000 : 0));
  ram.setU32(a6 + B.pos, o.pos);
  ram.setU32(a6 + B.sprite, o.sprite);
  ram.setU32(a6 + B.spriteOff, 0x01000200);      // ($6,A6) long, ($8,A6) short
  ram.setU16(a6 + B.size, 0x0208);
  ram.setU8(a6 + B.hitShortA, o.timer);          // ($14,A6)
  ram.setU8(a6 + B.hitShortA + 1, o.reload);     // ($15,A6)
  ram.setU16(a6 + B.hitShortB, o.step);          // ($16,A6)
  ram.setU8(a6 + B.blinkTimer, o.phase);         // ($18,A6)
  ram.setU8(a6 + B.blinkTimer + 1, o.life);      // ($19,A6)
  ram.setU8(a6 + B.speed, o.speed);              // ($1a,A6)
  ram.setU16(a6 + B.hitLongB, 0x0010);           // ($12,A6), the x2 tile cursor
  ram.setU32(a6 + B.layerEmitter, 0x23d762);
  ram.setU16(POOL_A.liveCount, ram.u16(POOL_A.liveCount) + 1);
  return a6;
}

function ctxOf(ram) {
  const log = new UnportedLog();
  return { log, ctx: { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost() {}, effectSpawn() {}, bulletSpawn() {} } };
}

const bucket8 = (ram) => ram.u16(BUCKETS[8].counter) / 12;

function touchedBee(ram, touchMask) {
  clearPoolA(ram);
  const a6 = POOL_A.reservedBase;
  ram.setU16(a6 + B.status, KIND.bee | 0x8000 | touchMask);
  ram.setU32(a6 + B.pos, 0x40002000);
  ram.setU16(POOL_A.liveCount, 1);
  return a6;
}

test('W255 bee collection transforms and frees after the native 68 steps',
  { skip: SKIP }, () => {
    for (const [player, touchMask] of [[1, 0x1000], [2, 0x0800]]) {
      const ram = new Ram();
      const { ctx } = ctxOf(ram);
      const a6 = touchedBee(ram, touchMask);
      const beforePos = ram.u32(a6 + B.pos);

      const collected = runPoolADriver(ram, ROM, ctx);
      assert.equal(collected.collected, 1, `P${player} collection runs`);
      assert.equal(ram.u16(a6 + B.status), 0x8005 | touchMask,
        `P${player} touch and collected bits survive the transform`);
      assert.equal(ram.u32(a6 + B.pos), (beforePos + 0x06000000) >>> 0);
      assert.deepEqual({
        spriteOff: ram.u32(a6 + B.spriteOff),
        sprite: ram.u32(a6 + B.sprite),
        size: ram.u16(a6 + B.size),
        cursor: ram.u16(a6 + B.hitLongB),
        timerReload: ram.u16(a6 + B.hitShortA),
        step: ram.u16(a6 + B.hitShortB),
        phaseLife: ram.u16(a6 + B.blinkTimer),
        attr: ram.u16(a6 + B.tpl1C),
      }, {
        spriteOff: 0xfc00fb00,
        sprite: 0x001e24dc,
        size: 0x0428,
        cursor: 0x0010,
        timerReload: 0x0202,
        step: 0x0054,
        phaseLife: 0x070f,
        attr: 0x001d,
      }, 'the immediate popup record matches the native transform');

      for (let step = 1; step <= 67; step++) {
        runPoolADriver(ram, ROM, ctx);
        assert.notEqual(ram.u16(a6 + B.status), 0,
          `P${player} popup remains live through collected step ${step}`);
      }
      runPoolADriver(ram, ROM, ctx);
      assert.equal(ram.u16(a6 + B.status), 0,
        `P${player} popup frees on collected step 68`);
      assert.equal(ram.u16(POOL_A.liveCount), 0);

      for (let step = 69; step <= 600; step++) runPoolADriver(ram, ROM, ctx);
      assert.equal(ram.u16(a6 + B.status), 0,
        `P${player} marker is absent ten seconds after collection`);
    }
  });

test('W234 the popup draws its digits, and only above the timer floor',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, ctx } = ctxOf(ram);
    const a6 = collectedBee(ram, { timer: 0x0a });

    runPoolADriver(ram, ROM, ctx);
    assert.equal(bucket8(ram), 1, '$2811BE enqueued the digits into bucket 8');
    assert.equal(ram.u32(BUCKETS[8].buffer + 4), 0x0020168c, 'the digits tile');
    assert.deepEqual([ram.u16(BUCKETS[8].buffer + 8), ram.u16(BUCKETS[8].buffer + 10)],
      [0x0210, 0x001d], '$2811D0/$2811D4 D3 and D4');
    assert.deepEqual(log.report(), [],
      'and the arm reaches no unported path -- it used to BE one');

    // $281188 cmpi.b #$3,($14,A6) / bcs: below three there are no digits.
    const ram2 = new Ram();
    const { ctx: ctx2 } = ctxOf(ram2);
    collectedBee(ram2, { timer: 0x02, reload: 0x02 });
    runPoolADriver(ram2, ROM, ctx2);
    assert.equal(bucket8(ram2), 0, 'the digits are gated on the timer');
    void a6;
  });

test('W234 the lifetime byte frees the slot and drops the census',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    // timer 1 so it borrows on this pass, and life 1 so the borrow ends the popup
    const a6 = collectedBee(ram, { timer: 0x01, life: 0x01 });
    const census = ram.u16(POOL_A.liveCount);
    runPoolADriver(ram, ROM, ctx);
    assert.deepEqual([ram.u16(a6 + B.status), ram.u16(a6 + B.pos)], [0, 0],
      '$2811AE cleared the slot');
    assert.equal(ram.u16(POOL_A.liveCount), census - 1, 'and dropped $817F7E');
  });

test('W234 the x2 flag draws the indicator and flickers the colour',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    const a6 = collectedBee(ram, { x2: true });
    ram.setU16(0x80390c, 1);                     // $281132: the phase is non-zero
    const attr = ram.u8(a6 + 0x1d);

    runPoolADriver(ram, ROM, ctx);

    assert.equal(ram.u8(a6 + 0x1d), attr ^ 0x10,
      '$28113A toggles bit 4 of the attribute word\'s low byte');
    assert.equal(bucket8(ram), 2, 'the digits AND the x2 indicator');
    assert.equal(ram.u32(BUCKETS[8].buffer + 12 + 4), ROM.u32(0x2812d4 + 0x10),
      'the x2 tile at cursor $10');
    assert.deepEqual([ram.u16(BUCKETS[8].buffer + 12 + 8),
      ram.u16(BUCKETS[8].buffer + 12 + 10)], [0x0420, 0x001d]);
    assert.equal(ram.u16(a6 + B.hitLongB), 0x000c, '$2812C6 steps the cursor by 4');

    // ...and without the phase there is no toggle, which is what makes it flicker
    const ram2 = new Ram();
    const { ctx: ctx2 } = ctxOf(ram2);
    const b2 = collectedBee(ram2, { x2: true });
    ram2.setU16(0x80390c, 0);
    const attr2 = ram2.u8(b2 + 0x1d);
    runPoolADriver(ram2, ROM, ctx2);
    assert.equal(ram2.u8(b2 + 0x1d), attr2, 'no phase, no toggle');
  });

test('W234 the x2 tile cursor cycles all five and reloads on the borrow',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    const a6 = collectedBee(ram, { x2: true, life: 0x40 });
    const seen = [];
    for (let n = 0; n < 6; n++) {
      seen.push(ram.u16(a6 + B.hitLongB));
      ram.setU8(a6 + B.hitShortA, 0x0a);         // keep it above the digit floor
      runPoolADriver(ram, ROM, ctx);
    }
    assert.deepEqual(seen, [0x10, 0x0c, 0x08, 0x04, 0x00, 0x10],
      'five tiles, then $2812CC reloads $10');
  });

test('W234 all six popup tiles are in the bundle', { skip: SKIP_BUNDLE }, () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const raw = gunzipSync(readFileSync(streamsPath));
  const flat = new Uint32Array(raw.buffer.slice(raw.byteOffset,
    raw.byteOffset + raw.byteLength));
  const shipped = new Set();
  let acc = 0;
  for (let i = 0; i < manifest.spr.streamCount; i++) {
    acc = (acc + flat[i]) >>> 0;
    shipped.add(acc);
  }
  const tiles = [0x0020168c,
    ...Array.from({ length: 5 }, (_, i) => ROM.u32(0x2812d4 + i * 4))];
  assert.equal(new Set(tiles).size, 6);
  for (const t of tiles) {
    assert.ok(shipped.has(t),
      `$${t.toString(16).toUpperCase()} must ship or the popup draws nothing`);
  }
});
