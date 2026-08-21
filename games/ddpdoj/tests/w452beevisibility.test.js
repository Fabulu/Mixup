// W452: type $8A carrier and released kind-1 bee visibility.
//
// The cartridge and pinned VERSION-B board captures settle two different draw
// rules. A covered or distant carrier emits nothing. Once a player is within
// $240 on the short axis, the carrier emits every other eligible frame and only
// changes art on emitted frames. A surviving released bee emits every frame,
// while its art follows B,A,A. The tests below keep object identity separate
// from unrelated display-list producers by looking for the exact ten-byte
// hardware entry derived from the object's own record.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import {
  POOL_A, B, KIND, allocBee27F92A, runPoolADriver,
} from '../src/bee.js';
import { BUCKETS } from '../src/spritequeue.js';
import { readTrace } from '../tools/portdiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const ORACLE = path.join(GAME, 'tools', 'oracle');
const WITNESS_PATH = path.join(ORACLE, 'w452beevisibility.board.json');
const TABLES_PATH = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE_PATH = path.join(GAME, 'rip', 'sound', 'maincpu.bin');
const HAVE_STATIC = fs.existsSync(WITNESS_PATH) && fs.existsSync(IMAGE_PATH);
const HAVE_TABLES = fs.existsSync(TABLES_PATH);
const TABLES_JSON = HAVE_TABLES
  ? JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8')) : null;
const ROM = HAVE_TABLES ? new RomWindows(TABLES_JSON.rom) : null;
const WITNESS = fs.existsSync(WITNESS_PATH)
  ? JSON.parse(fs.readFileSync(WITNESS_PATH, 'utf8')) : null;
const SKIP_STATIC = HAVE_STATIC ? false
  : 'W452 witness or decrypted main CPU image absent; this is a skip, not a pass';
const SKIP_TABLES = HAVE_TABLES ? false
  : 'generated ROM tables absent; this is a skip, not a pass';

const RAM_BASE = 0x800000;
const A5 = 0x81332c;
const A6 = 0x81459c;
const hex = (v) => `$${v.toString(16).toUpperCase()}`;
const signed16 = (v) => (v & 0x8000 ? v - 0x10000 : v);
const signed32 = (v) => (v & 0x80000000 ? v - 0x100000000 : v);
const bytesAt = (ram, addr, len) => Uint8Array.from(
  { length: len }, (_, i) => ram.u8(addr + i));
const hexAt = (ram, addr, len) => Buffer.from(bytesAt(ram, addr, len)).toString('hex');

function boardFrame(lf) {
  for (const capture of WITNESS.captures) {
    const frame = capture.frames.find((f) => f.lf === lf);
    if (frame) return frame;
  }
  throw new Error(`W452 board frame lf${lf} is absent`);
}

function u16(buf, at) {
  return (buf[at] << 8) | buf[at + 1];
}

/** $23D762 plus $23D624 with the board's $80B054 value of zero. */
function hardwareEntry(record) {
  const longAxis = (signed16(u16(record, 2)) + signed16(u16(record, 6))) & 0xffff;
  const shortAxis = (signed16(u16(record, 4)) + signed16(u16(record, 8))) & 0xffff;
  const packed = signed32(((longAxis << 16) | shortAxis) >>> 0) >> 6;
  const request01 = ((packed & 0x07ff03ff) | 0x80008000) >>> 0;
  const emitted01 = ((request01 & 0xf800f800) | (request01 & 0x07ff3fff)) >>> 0;
  const out = Buffer.alloc(10);
  out.writeUInt32BE(emitted01, 0);
  out[4] = record[0x1c] | record[0x1d];
  record.copy(out, 5, 0x0b, 0x10);
  return out;
}

function entryOffsets(display, entry) {
  const out = [];
  for (let at = 0; at + 10 <= display.length; at += 10) {
    if (display.subarray(at, at + 10).equals(entry)) out.push(at);
  }
  return out;
}

function branchTarget(image, pc) {
  const opcode = image.readUInt16BE(pc);
  assert.equal(opcode & 0xf000, 0x6000, `${hex(pc)} is a branch`);
  const d8 = opcode & 0xff;
  if (d8 !== 0) return [pc + 2 + (d8 & 0x80 ? d8 - 0x100 : d8), 2];
  const ext = image.readUInt16BE(pc + 2);
  return [pc + 2 + signed16(ext), 4];
}

// ---------------------------------------------------------------------------
// Cartridge and board evidence
// ---------------------------------------------------------------------------

test('W452 cartridge pins type-$8A suppression and released-bee continuous emit',
  { skip: SKIP_STATIC }, () => {
    const image = fs.readFileSync(IMAGE_PATH);
    const requireHex = (at, expected, why) => {
      const want = Buffer.from(expected, 'hex');
      assert.deepEqual(image.subarray(at, at + want.length), want,
        `${hex(at)} ${why}`);
    };

    requireHex(0x276702,
      '4a39008130f86b2c4eb90024179e202e000206400c00d07900813172'
      + '0640b000650c48400640040006408c00640e4a2d0016670e4ef900263762'
      + '4e711b7c00010016725cc216670c021600a3',
    'type-$8A bounds and hit prologue');
    requireHex(0x27674e,
      '4a6e00186b00007c4a7900811f7266484eb9002428844a40676608000000'
      + '671c3439008103ea322e000492426a0244410c410240651c080000016744'
      + '34390081044c322e000492426a0244410c410240642e3b7c000f0018'
      + '536d0018086e00060001661c0aae000000b4000a302e001ed040d040'
      + '41fa1ad84e71207000004e904e75',
    'proximity, alternating suppression and emit');
    requireHex(0x2767d0,
      '70014eb90028615e4eb90028c25a302d001a142e001f4eb90027f92a'
      + '700c4eb900289004216e00020002302e001ed04043fa1b1e4e71'
      + '31710000001e303c0001314000104ef900263762',
    'death and released-bee allocation');
    requireHex(0x27facc,
      '080100006600165a70000801000c660000900801000b670001a8',
    'released-bee body dispatch');
    requireHex(0x27fc8c,
      '2d7c001bca34000a536e0018640e3d7c000200182d7c001bca80000a'
      + '202e000206401c00d0790081317206409000650a48400640080006407800'
      + '65b47004c240b141661a4a79008130d2660a30390080b03cd16e0002'
      + '206e00284ed0',
    'released-bee B,A,A art, bounds and unconditional emitter');

    const branches = new Map([
      [0x276752, [0x2767d0, 4]],
      [0x27fad0, [0x28112c, 4]],
      [0x27fada, [0x27fb6c, 4]],
      [0x27fae2, [0x27fc8c, 4]],
      [0x27fc98, [0x27fca8, 2]],
      [0x27fcc6, [0x27fc7c, 2]],
    ]);
    for (const [pc, expected] of branches) {
      assert.deepEqual(branchTarget(image, pc), expected,
        `${hex(pc)} target and instruction size`);
    }
    assert.equal(image[0x276753], 0,
      '$276752 uses the extension word, not an 8-bit zero displacement');
  });

test('W452 pinned board witness separates carrier suppression from bee art cadence',
  { skip: WITNESS ? false : SKIP_STATIC }, () => {
    assert.deepEqual(WITNESS.machine,
      { set: 'ddpdojblk', build: 'B', maincpuFnv64: 'D4C25CA9C91B9D47' });
    assert.equal(WITNESS.captures.length, 2, 'two independently replayable captures');
    const frames = WITNESS.captures.flatMap((c) => c.frames);
    assert.equal(frames.length, 20, 'twenty selected board frames');
    assert.equal(WITNESS.snapshots.length, 24, 'twenty-four framebuffer identities');

    for (const frame of frames) {
      const record = Buffer.from(frame.record, 'hex');
      assert.equal(record.length, 44, `lf${frame.lf} record width`);
      assert.equal(record.subarray(0, 2).toString('hex'), frame.status);
      assert.equal(record.subarray(0x0a, 0x0e).toString('hex'), frame.sprite);
      assert.equal(record.subarray(0x18, 0x1a).toString('hex'), frame.word18,
        '+$18 is carrier HP or bee blink timer, depending on the record kind');
      assert.equal(hardwareEntry(record).toString('hex'), frame.entry,
        `lf${frame.lf} exact hardware entry derived outside the port`);
    }

    for (const lf of [3802, 3803, 3804, 3805, 3998, 3999, 4000, 4001]) {
      const frame = boardFrame(lf);
      const visible = frame.phase.includes('visible') && !frame.phase.includes('suppressed');
      assert.equal(frame.entryOffsets.length, visible ? 1 : 0,
        `lf${lf} board carrier ${visible ? 'emits' : 'is suppressed'}`);
    }
    assert.deepEqual([3802, 3803, 3804, 3805].map((lf) => boardFrame(lf).status),
      ['8140', '8100', '8140', '8100'], 'carrier bit 6 alternates');
    assert.deepEqual([3802, 3803, 3804, 3805].map((lf) => boardFrame(lf).sprite),
      ['001bca80', '001bca80', '001bca34', '001bca34'],
    'carrier art changes only on visible frames');

    for (const lf of [11297, 11378]) {
      assert.deepEqual(boardFrame(lf).entryOffsets, [], `lf${lf} covered carrier emits nothing`);
    }
    assert.equal(boardFrame(11378).enemy.slice(0, 4), '8002',
      'the covered carrier enemy is live before its death');
    assert.equal(boardFrame(11380).enemy.slice(0, 4), '0000',
      'the carrier enemy has been freed at release');
    assert.equal(boardFrame(11380).record.slice(0, 4), '8004',
      'released kind 1 occupies reserved slot zero');

    const beeLfs = [11380, 11381, 11382, 11383, 11384, 11385];
    assert.deepEqual(beeLfs.map((lf) => boardFrame(lf).sprite),
      ['001bca80', '001bca34', '001bca34', '001bca80', '001bca34', '001bca34'],
    'board released-bee art is B,A,A twice');
    assert.deepEqual(beeLfs.map((lf) => boardFrame(lf).word18),
      ['0002', '0001', '0000', '0002', '0001', '0000'],
    'board blink timer is 2,1,0 twice');
    assert.ok(beeLfs.every((lf) => boardFrame(lf).entryOffsets.length === 1),
      'the exact bee entry exists on all six art states');
    for (const lf of [11400, 11401, 11402, 11403]) {
      assert.ok(WITNESS.snapshots.some((s) => s.file.includes(`lf0${lf}.png`)),
        `lf${lf} has an external framebuffer identity`);
      assert.equal(boardFrame(lf).entryOffsets.length, 1,
        `lf${lf} framebuffer frame also carries the exact bee entry`);
    }
  });

// ---------------------------------------------------------------------------
// Deterministic port replay from board checkpoints
// ---------------------------------------------------------------------------

const REPLAY_JOBS = [
  { capture: 0, seedLf: 3750 },
  { capture: 1, seedLf: 11200 },
];

function replayAvailable(job) {
  if (!HAVE_TABLES || !WITNESS) return false;
  const spec = WITNESS.captures[job.capture];
  const manifestPath = path.join(ORACLE, spec.manifest);
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rung = manifest.rungs.find((r) => r.lf === job.seedLf);
  if (!rung) return false;
  const dir = path.dirname(manifestPath);
  return [manifest.trace, path.join('ckpt', rung.ram), path.join('ckpt', rung.bg)]
    .every((p) => fs.existsSync(path.join(dir, p)));
}

const HAVE_REPLAY = REPLAY_JOBS.every(replayAvailable);
const SKIP_REPLAY = HAVE_REPLAY ? false
  : 'W69 checkpoint ladders, traces, or generated ROM tables absent; skip, not pass';

async function replayJob(job) {
  const { Game } = await import('../src/main.js');
  const spec = WITNESS.captures[job.capture];
  const manifestPath = path.join(ORACLE, spec.manifest);
  const dir = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rung = manifest.rungs.find((r) => r.lf === job.seedLf);
  const seed = new Uint8Array(fs.readFileSync(path.join(dir, 'ckpt', rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(dir, 'ckpt', rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const game = new Game(seed, TABLES_JSON,
    { logicFrame: job.seedLf, videoFrame: rung.vf, bgSeed });
  const trace = readTrace(path.join(dir, manifest.trace));
  const pokes = (manifest.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((v) => Number.parseInt(v, 16)));
  const wanted = new Map(spec.frames.map((frame) => [frame.lf, frame]));
  const found = [];
  const lastLf = Math.max(...wanted.keys());

  for (let lf = job.seedLf + 1; lf <= lastLf; lf++) {
    const row = trace.byLf.get(lf);
    assert.ok(row, `${spec.id} trace carries lf${lf}`);
    for (const [addr, value] of pokes) game.ram.setU8(addr, value);
    game.step(Number(row.portin));
    const frame = wanted.get(lf);
    if (!frame) continue;

    const recordAddress = Number.parseInt(frame.recordAddress, 16);
    const enemyAddress = Number.parseInt(frame.enemyAddress, 16);
    assert.equal(hexAt(game.ram, recordAddress, frame.record.length / 2), frame.record,
      `${spec.id} lf${lf} exact object record`);
    assert.equal(hexAt(game.ram, enemyAddress, frame.enemy.length / 2), frame.enemy,
      `${spec.id} lf${lf} exact enemy record`);

    const record = Buffer.from(bytesAt(game.ram, recordAddress, 44));
    const entry = hardwareEntry(record);
    assert.equal(entry.toString('hex'), frame.entry,
      `${spec.id} lf${lf} port derives the board's exact target entry`);
    const queueBytes = game.ram.u16(0x80affc);
    const display = Buffer.from(bytesAt(game.ram, 0x800000, queueBytes));
    const offsets = entryOffsets(display, entry);
    const boardVisible = frame.entryOffsets.length !== 0;
    assert.equal(offsets.length, boardVisible ? 1 : 0,
      `${spec.id} lf${lf} target entry containment matches the board; unrelated offsets may differ`);
    found.push(lf);
  }
  assert.deepEqual(found, [...wanted.keys()], `${spec.id} selected frames all replayed`);
  return found.length;
}

test('W452 checkpoint replay matches 20 exact records and target-entry visibility',
  { skip: SKIP_REPLAY }, async () => {
    let frames = 0;
    for (const job of REPLAY_JOBS) frames += await replayJob(job);
    assert.equal(frames, 20, 'eight carrier and twelve covered/released-bee frames');
  });

// ---------------------------------------------------------------------------
// Dirty records and opposite-state arms
// ---------------------------------------------------------------------------

function context(ram) {
  const log = new UnportedLog();
  return {
    ram, rom: ROM, unported: log, unportedLog: log, notes: log,
    soundPost: () => {},
  };
}

function carrierFixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU32(A5 + 0x06, A6);
  ram.setU8(A5 + 0x16, 1);
  ram.setU16(A5 + 0x18, 0xbeef);
  ram.setU16(A6, 0x8100);
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU32(A6 + 0x06, 0xfa00fd00);
  ram.setU32(A6 + 0x0a, 0xdeadbeef);
  ram.setU16(A6 + 0x0e, 0x0618);
  ram.setU16(A6 + 0x1e, 0);
  ram.setU8(0x8103e6, 0x80);
  ram.setU8(0x810448, 0);
  return ram;
}

function queuedSprites(ram, bucket) {
  const b = BUCKETS[bucket];
  const out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12) {
    out.push(ram.u32(b.buffer + off + 4));
  }
  return out;
}

test('W452 dirty carrier stays covered while far, then emits visible,hidden,visible,hidden',
  { skip: SKIP_TABLES }, () => {
    const ram = carrierFixture();
    const ctx = context(ram);
    ram.setU16(0x8103ea, 0x3000);                    // $1000 away, outside $240
    runHandler(0x276702, ram, ROM, A5, ctx);
    assert.equal(ram.u16(A5 + 0x18), 0xbeef, 'far arm preserves the dirty counter');
    assert.equal(ram.u8(A6 + 1), 0, 'far arm does not toggle bit 6');
    assert.equal(ram.u32(A6 + B.sprite), 0xdeadbeef, 'far arm preserves dirty art');
    assert.equal(ram.u16(BUCKETS[0].counter), 0, 'far arm emits nothing');

    ram.setU16(0x8103ea, 0x2000);                    // same short axis, now near
    const states = [];
    for (let i = 0; i < 4; i++) {
      runHandler(0x276702, ram, ROM, A5, ctx);
      states.push({
        bit6: ram.u8(A6 + 1) & 0x40,
        sprite: ram.u32(A6 + B.sprite),
        bytes: ram.u16(BUCKETS[0].counter),
      });
      assert.equal(ram.u16(A5 + 0x18), 0x000e,
        'near arm reloads $000F then decrements to $000E');
    }
    assert.deepEqual(states.map((s) => s.bit6), [0x40, 0, 0x40, 0]);
    assert.deepEqual(states.map((s) => s.bytes), [12, 12, 24, 24],
      'only old-clear bit-6 states enqueue');
    assert.deepEqual(states.map((s) => s.sprite),
      [0xdeadbe5b, 0xdeadbe5b, 0xdeadbeef, 0xdeadbeef],
    'the descriptor changes only with emitted frames');
    assert.deepEqual(queuedSprites(ram, 0), [0xdeadbe5b, 0xdeadbeef],
      'the two requests are external witnesses to the visible arms');
  });

test('W452 no-live-player arm suppresses, while mover freeze bypasses proximity',
  { skip: SKIP_TABLES }, () => {
    const ram = carrierFixture();
    const ctx = context(ram);
    ram.setU8(0x8103e6, 0);
    ram.setU16(A5 + 0x18, 0x1234);
    runHandler(0x276702, ram, ROM, A5, ctx);
    assert.equal(ram.u16(A5 + 0x18), 0x1234);
    assert.equal(ram.u8(A6 + 1) & 0x40, 0);
    assert.equal(ram.u16(BUCKETS[0].counter), 0, 'no live player means no draw');

    ram.setU16(0x811f72, 1);
    runHandler(0x276702, ram, ROM, A5, ctx);
    assert.equal(ram.u16(A5 + 0x18), 0x1233,
      'freeze skips player proximity and decrements the existing counter');
    assert.equal(ram.u8(A6 + 1) & 0x40, 0x40);
    assert.equal(ram.u16(BUCKETS[0].counter), 12,
      'freeze still reaches the eligible emit arm');
  });

const BEE_OWNED = [
  ...Array.from({ length: 0x1a }, (_, i) => i),
  0x1c, 0x1d, 0x1e, 0x1f, 0x28, 0x29, 0x2a, 0x2b,
];
const BEE_HOLES = [0x1a, 0x1b, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27];

function dirtyBeeWorld() {
  const ram = new Ram();
  const slot = POOL_A.reservedBase;
  for (let i = 0; i < POOL_A.stride; i++) ram.setU8(slot + i, 0xa5);
  ram.setU16(slot + B.status, 0);                         // free, but otherwise recycled
  const carrier = 0x815000;
  ram.setU32(carrier + B.pos, 0x6dc011c0);
  ram.setU16(POOL_A.scrollShort, 0);
  ram.setU16(0x813172, 0);
  ram.setU16(POOL_A.freeze, 0);
  const ctx = context(ram);
  const allocated = allocBee27F92A(ram, ROM, ctx, KIND.bee, 3, carrier);
  assert.equal(allocated, slot);
  return { ram, ctx, slot };
}

test('W452 dirty released-bee slot overwrites owned fields and emits B,A,A continuously',
  { skip: SKIP_TABLES }, () => {
    const { ram, ctx, slot } = dirtyBeeWorld();
    const lfs = [11380, 11381, 11382];
    const scroll = [0xffc0, 0xffc0, 0x0000];
    const telemetry = [];
    for (let i = 0; i < lfs.length; i++) {
      ram.setU16(POOL_A.scrollLong, scroll[i]);
      telemetry.push(runPoolADriver(ram, ROM, ctx));
      const expected = Buffer.from(boardFrame(lfs[i]).record, 'hex');
      for (const at of BEE_OWNED) {
        assert.equal(ram.u8(slot + at), expected[at],
          `lf${lfs[i]} allocator-owned byte +$${at.toString(16)} matches board`);
      }
      for (const at of BEE_HOLES) {
        assert.equal(ram.u8(slot + at), 0xa5,
          `recycled hole +$${at.toString(16)} remains cartridge-owned`);
      }
    }
    assert.ok(telemetry.every((t) => t.emitted === 1),
      'all three surviving timer states emit');
    assert.equal(ram.u16(BUCKETS[2].counter), 36, 'three exact twelve-byte requests');
    assert.deepEqual(queuedSprites(ram, 2), [0x001bca80, 0x001bca34, 0x001bca34],
      'dirty slot emits board B,A,A art without a carrier-style draw gate');
    assert.equal(ram.u16(POOL_A.liveCount), 1, 'released bee remains allocated');
  });

test('W452 opposite arm frees an off-screen released bee instead of emitting',
  { skip: SKIP_TABLES }, () => {
    const { ram, ctx, slot } = dirtyBeeWorld();
    ram.setU32(slot + B.pos, 0xf0002000);
    const t = runPoolADriver(ram, ROM, ctx);
    assert.deepEqual({ freed: t.freed, emitted: t.emitted }, { freed: 1, emitted: 0 });
    assert.equal(ram.u16(slot + B.status), 0, 'slot is free');
    assert.equal(ram.u16(POOL_A.liveCount), 0, 'live count decremented');
    assert.ok(BUCKETS.every((bucket) => ram.u16(bucket.counter) === 0),
      'off-screen arm reaches no emitter');
  });
