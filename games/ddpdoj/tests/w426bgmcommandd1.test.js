// ===============================================================================================
// W426 -- `$28C186`, THE HALF OF THE `$28BBAC` TIER THAT NEEDS THE CALLER'S D1.
// ===============================================================================================
//
// W423 built the `$28BBAC` packer a path of its own (`postBgmCommand`) and W425 taught
// `postWrapper` to dispatch `$28C170` into it, which closed nine sites in one change. It could
// not close the tenth. `$28C170` loads BOTH registers itself:
//
//     28C174  303C 0015   move.w #$15,D0
//     28C178  7200        moveq  #0,D1
//     28C17A  4EB9 0028BBAC
//
// while `$28C186` loads only D0 and falls straight into the packer with whatever D1 the CALLER
// left there:
//
//     28C18A  303C 0016   move.w #$16,D0
//     28C18E  4EB9 0028BBAC          <- no `moveq #0,D1` anywhere between
//
// So an ADDRESS is the whole command for one of them and only half of it for the other, and
// `sound.js` refused `$28C186` by address rather than defaulting D1 to zero. That refusal is
// right and it left `objslot15.js:179` -- `ctx.soundPost?.(0x28c186)` -- a LIVE THROW, on a line
// that has been reached-and-fatal since the slot was ported. The missing half is a ctx-level
// D1-carrying API, and this wave adds `ctx.soundPostD1(addr, d1)` and converts all three sites.
//
// SECTION 1  the census: every reference to $28C186 in the image, and there are THREE
// SECTION 2  each site's D1, read out of the image rather than assumed
// SECTION 3  THE STAGE SCRIPTS -- the only non-constant D1, walked, and it is $0000 everywhere
// SECTION 4  the packer's OR is `or.w`, not a byte OR (W423's code disagreed with W423's comment)
// SECTION 5  the ctx API, and the address-only path still refusing
// SECTION 6  STATE TRACE 1 -- objslot15's live throw, driven through Game#step
// SECTION 7  STATE TRACE 2 -- stageend's F8 exit handshake, driven on a real ctx
// SECTION 8  STATE TRACE 3 -- the scroll VM's cue sub-op 2, driven off the real stage-0 record
// SECTION 9  the bookkeeping, READ: no `note()` for $28C186 survives anywhere in src/
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Game } from '../src/main.js';
import { OBJ } from '../src/objdriver.js';
import { UnportedLog } from '../src/unported.js';
import { SLOT15 } from '../src/objslot15.js';
import { SE, result28D9AA } from '../src/stageend.js';
import { BGO, BGRAM, BgVram, backgroundInit, backgroundFrame } from '../src/background.js';
import {
  SOUND, SoundState, BGM_COMMANDS, postBgmCommand, postWrapper,
} from '../src/sound.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SRC = here('../src/');
const IMAGE = here('../rip/sound/maincpu.bin');
const SEED = here('../rip/web/seed.bin');
const TABLES = here('../rip/port/player.tables.json');

const SKIP = existsSync(IMAGE) ? false
  : 'rip/sound/maincpu.bin absent -- THIS IS A SKIP, NOT A PASS.';
const IMG = SKIP ? null : readFileSync(IMAGE);

const SKIP_SEED = existsSync(SEED) && existsSync(TABLES) ? false
  : 'rip/web/seed.bin or player.tables.json absent -- THIS IS A SKIP, NOT A PASS.';
const seedBytes = SKIP_SEED ? null : new Uint8Array(readFileSync(SEED));
const tablesJson = SKIP_SEED ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const game = () => new Game(seedBytes.slice(), tablesJson, { palCatchUp: false });

const u16 = (a) => IMG.readUInt16BE(a);
const u32 = (a) => IMG.readUInt32BE(a);
const bytesAt = (a, n) => Array.from(IMG.subarray(a, a + n));
const ringWords = (ram) =>
  Array.from({ length: 0x190 / 4 }, (_, i) => ram.u32(SOUND.ring + i * 4));
const countInRing = (ram, w) => ringWords(ram).filter((x) => x === w).length;

/** A `rom` shim over the whole image. `i16` is NOT optional: `background.js`'s op-$04 rewind
 *  reads a SIGNED word and a shim without it throws four opcodes into the first stage script. */
const ROM = SKIP ? null : {
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
  i16: (a) => IMG.readInt16BE(a), i32: (a) => IMG.readInt32BE(a),
  bytes: (a, n) => IMG.subarray(a, a + n),
};

// ------------------------------------------------------------------------------- SECTION 1

// A BRIEF'S SITE LIST IS A FLOOR, NEVER A CEILING -- W425 said five and there were nine. So the
// sites are not taken from any note: the whole 4 MB of code space is swept for every shape that
// can transfer control to $28C186, and the answer has to come out at three.
test('SECTION 1: exactly THREE references to $28C186 exist in the image, all `jsr` absolute',
  { skip: SKIP }, () => {
    const abs = [], other = [];
    const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);
    for (let a = 0x200000; a < 0x600000; a += 2) {
      const w = u16(a);
      if (w === 0x4eb9 && u32(a + 2) === 0x28c186) { abs.push(a); continue; }
      if (w === 0x4ef9 && u32(a + 2) === 0x28c186) { other.push(['jmp abs.l', a]); continue; }
      // TRAP: a `(d16,PC)` or `bsr.w` target is the EXTENSION WORD's address plus the
      // displacement, NOT the address after the instruction.
      if (w === 0x4eba || w === 0x6100) {
        if (a + 2 + s16(u16(a + 2)) === 0x28c186) {
          other.push([w === 0x4eba ? 'jsr (d16,PC)' : 'bsr.w', a]);
        }
        continue;
      }
      if ((w >>> 8) === 0x61 && (w & 0xff) !== 0x00 && (w & 0xff) !== 0xff) {
        const d = (w & 0xff) >= 0x80 ? (w & 0xff) - 0x100 : (w & 0xff);
        if (a + 2 + d === 0x28c186) other.push(['bsr.b', a]);
      }
    }
    assert.deepEqual(abs.map((a) => a.toString(16)), ['2621ce', '28de72', '291fac'],
      'the `jsr $28C186` census moved -- every new site needs its own D1 read out of the image');
    assert.deepEqual(other, [],
      'a NON-`jsr abs.l` transfer to $28C186 exists and no site list has ever accounted for it');
  });

test('SECTION 1: $28C186 sets D0 and NOTHING ELSE -- there is no `moveq #0,D1` in it',
  { skip: SKIP }, () => {
    // This is the entire reason the API needs a second parameter. If the routine loaded D1 the
    // way its sibling does, an address would be the whole command and `soundPost` would do.
    assert.deepEqual(bytesAt(0x28c186, 2), [0x48, 0xe7], '$28C186 movem.l');
    assert.deepEqual(bytesAt(0x28c18a, 4), [0x30, 0x3c, 0x00, 0x16], '$28C18A move.w #$16,D0');
    assert.deepEqual(bytesAt(0x28c18e, 6), [0x4e, 0xb9, 0x00, 0x28, 0xbb, 0xac],
      '$28C18E jsr $28BBAC -- straight from the D0 load, with no D1 load between');
    // and the sibling, for contrast: the `7200` that makes IT address-only.
    assert.deepEqual(bytesAt(0x28c178, 2), [0x72, 0x00], '$28C178 moveq #0,D1 -- $28C170 only');
    assert.equal(BGM_COMMANDS[0x28c186], 0x16, 'and the table agrees with the D0 immediate');
  });

// ------------------------------------------------------------------------------- SECTION 2

// "DO NOT ASSUME THE OTHERS ARE ZERO." Two of the three are `moveq #0,D1` and the third is not,
// and that difference is read here rather than believed.
test('SECTION 2: each site\'s D1 comes out of the image, and only ONE of the three is a load',
  { skip: SKIP }, () => {
    assert.deepEqual(bytesAt(0x291fa6, 4), [0x2b, 0x40, 0x00, 0x08],
      '$291FA6 move.l D0,($8,A5) -- the chain handle, just before the cue');
    assert.deepEqual(bytesAt(0x291faa, 2), [0x72, 0x00],
      '$291FAA moveq #0,D1 -- objslot15.js posts with D1 = 0');

    assert.deepEqual(bytesAt(0x28de6c, 4), [0x2b, 0x40, 0x00, 0x08],
      '$28DE6C move.l D0,($8,A5) -- the fly-away handle');
    assert.deepEqual(bytesAt(0x28de70, 2), [0x72, 0x00],
      '$28DE70 moveq #0,D1 -- stageend.js posts with D1 = 0');

    assert.deepEqual(bytesAt(0x2621cc, 2), [0x32, 0x1a],
      '$2621CC move.w (A2)+,D1 -- background.js takes D1 out of the STAGE SCRIPT, and this is '
      + 'the site the whole D1-carrying API exists for');
  });

// ------------------------------------------------------------------------------- SECTION 3

// **THE MEASUREMENT THAT CORRECTS A STANDING CLAIM.** W425 wrote, in `background.js` and in
// `sound.js` both, that the scroll VM's D1 "is not always 0" and that an address-only post would
// therefore be wrong. Nothing ever read the scripts to check. This does. Every sub-op 2 in every
// cue stream the cartridge owns carries $0000, so an address-only post would have produced the
// correct longword by luck -- the refusal is justified by the INSTRUCTION, not by the data.
//
// This is the shape that has now bitten this repo five times: a true rule resting on a false
// reason, surviving because nothing read it back.
const CUE_PAIR_TABLE = 0x26153e;          // $26152C lea ($26153E,PC),A0
const CUE_STAGES = 5;                     // the pair table's own length; entry 5 is script DATA

/** Walk one cue stream exactly as `background.js`'s op-$14 walks it: `move.w (A2)+,D0`, then
 *  $FFFF ends, 0 takes six more bytes, 1 takes none and 2 takes a word. */
function walkCueStream(base) {
  const out = [];
  let a = base;
  for (let guard = 0; guard < 256; guard++) {
    const sub = u16(a); a += 2;
    if (sub === 0xffff) return out;
    if (sub === 0) { out.push({ sub, count: u16(a), call: u32(a + 2) }); a += 6; }
    else if (sub === 1) { out.push({ sub }); }
    else if (sub === 2) { out.push({ sub, d1: u16(a) }); a += 2; }
    else throw new Error(`cue sub-op ${sub} at $${a.toString(16)} -- the table has three entries`);
  }
  throw new Error(`cue stream at $${base.toString(16)} never terminated`);
}

test('SECTION 3: every sub-op-2 D1 in every stage cue stream is $0000 -- MEASURED, not assumed',
  { skip: SKIP }, () => {
    const heads = [], sub2 = [];
    for (let stage = 0; stage < CUE_STAGES; stage++) {
      const pair = u32(CUE_PAIR_TABLE + stage * 4);
      // script 0 owns the cue stream; script 1's is a NULL pointer in all five stages, which is
      // why `installScripts` writing 0 there is not a bug.
      const cue0 = u32(u32(pair) + 4);
      const cue1 = u32(u32(pair + 4) + 4);
      assert.equal(cue1, 0, `stage ${stage} script 1 has a cue stream now -- walk it too`);
      heads.push(cue0);
      for (const e of walkCueStream(cue0)) if (e.sub === 2) sub2.push({ stage, d1: e.d1 });
    }
    assert.deepEqual(heads.map((h) => h.toString(16)),
      ['261602', '2618c4', '261a4c', '261bf8', '261d92'],
      'the five cue streams moved -- re-derive them before trusting anything below');
    // NOT VACUOUS: if the walk found no sub-op 2 at all, the "all zero" claim below would be
    // true of an empty set and would prove nothing.
    assert.equal(sub2.length, CUE_STAGES, 'each stage has exactly one sub-op-2 cue');
    assert.deepEqual(sub2.map((e) => e.d1), [0, 0, 0, 0, 0],
      'a stage script now carries a NON-ZERO D1. That is the case W425 asserted and never '
      + 'measured; the port passes it through correctly, but every note saying "always 0" is '
      + 'now wrong and must be rewritten rather than deleted.');
  });

// ------------------------------------------------------------------------------- SECTION 4

// **W423's CODE DISAGREED WITH W423's OWN COMMENT FOR THREE WAVES.** The doc said the longword is
// `((D0<<8 | D1) & $FFFF) << 16`; the code masked D1 with `& 0xFF`. `$28BBAE` is `8041`, whose
// bits 8..6 are `001` -- the WORD form of OR -- so the 68k ORs D1's whole low word. The old
// SECTION 3 of `w423bgmcommand.test.js` asserted the byte mask under the heading "the pack is
// WORD-sized", which is the first lie-shape: a test defending the wrong reading. It survived
// because every call site passes D1 = 0, so nothing observable ever depended on it.
test('SECTION 4: `or.w D1,D0` is a WORD or -- a D1 above $FF changes the COMMAND byte',
  { skip: SKIP }, () => {
    assert.deepEqual(bytesAt(0x28bbae, 2), [0x80, 0x41],
      '$28BBAE 8041 = or.w D1,D0 (bits 8..6 = 001, the word form; the byte form would be 000)');
    const ram = new Ram();
    postBgmCommand(ram, new SoundState(), 0x28c186, 0x01ff);
    assert.equal(ram.u32(SOUND.ring), 0x17ff0000 >>> 0,
      '$1600 | $01FF = $17FF. A byte mask would have packed $16FF and kept the command at $16');
  });

test('SECTION 4: and the word mask still discards what the 68k discards', () => {
  const ram = new Ram();
  postBgmCommand(ram, new SoundState(), 0x28c186, 0x12340056);
  assert.equal(ram.u32(SOUND.ring), 0x16560000 >>> 0,
    'only D1.w reaches `or.w`; the high half of a longword D1 is not the 68k\'s business');
});

// ------------------------------------------------------------------------------- SECTION 5

test('SECTION 5: Game#ctx() carries soundPostD1, and it is NOT the address-only soundPost',
  { skip: SKIP_SEED }, () => {
    const g = game();
    const SPY = 0x33;
    assert.equal(g.handlers.has(SPY), false, `type $${SPY.toString(16)} is a real handler now`);
    let ctx = null;
    g.handlers.set(SPY, (_r, _s, _i, c) => { ctx = c; });
    plantDirty(g, firstEmptySlot(g), SPY, 0, 0x00);
    g.step(0);
    assert.ok(ctx !== null, 'the spy never ran, so nothing below tests anything');
    assert.equal(typeof ctx.soundPostD1, 'function', 'Game#ctx() does not carry `soundPostD1`');
    assert.notEqual(ctx.soundPostD1, ctx.soundPost, 'the two APIs must stay distinct: one '
      + 'carries the caller\'s D1 and the other cannot');

    // It reaches the real ring, not a stub.
    const before = countInRing(g.ram, 0x16000000);
    assert.equal(ctx.soundPostD1(0x28c186, 0), true);
    assert.equal(countInRing(g.ram, 0x16000000), before + 1);
  });

test('SECTION 5: the ADDRESS-ONLY path still refuses $28C186, loudly and by name', () => {
  // If this ever stops throwing, every caller silently gets D1 = 0 -- which happens to be right
  // for this ROM's data and would still be a port that reads a register it did not read.
  const ram = new Ram();
  assert.throws(() => postWrapper(ram, new SoundState(), 0x28c186),
    /takes D1 FROM THE CALLER/,
    '$28C186 must never be postable by address alone');
  // and the sibling must still go through by address, because IT loads D1 itself.
  assert.equal(postWrapper(ram, new SoundState(), 0x28c170), true);
  assert.equal(ram.u32(SOUND.ring), 0x15000000 >>> 0);
});

test('SECTION 5: soundPostD1 refuses an address that is not in this tier', { skip: SKIP_SEED },
  () => {
    const ram = new Ram();
    assert.throws(() => postBgmCommand(ram, new SoundState(), 0x28c25a, 0),
      /no \$28BBAC-tier command/,
      'an ordinary WRAPPERS row must not acquire a D1 it has no field for');
  });

// ------------------------------------------------------------------------------- SECTION 6

/** The lowest EMPTY object-table slot in the seed. */
function firstEmptySlot(g) {
  for (let i = 0; i < OBJ.slots; i++) {
    if (g.ram.u16(OBJ.base + i * OBJ.stride + OBJ.typeOff) === 0) return i;
  }
  throw new Error('the seed has no empty object slot -- this test cannot plant a record');
}

/** Plant a record of `type` in `state`, over a slot DIRTIED BYTE BY BYTE first. A zeroed record
 *  is the fixture that has lied here three waves running: a recycled slot carries the previous
 *  tenant's bytes, and every field this routine does not write must be one the routine does not
 *  read either. */
function plantDirty(g, slotIndex, type, state, fill = 0xa5) {
  const a5 = OBJ.base + slotIndex * OBJ.stride;
  for (let i = 0; i < OBJ.stride; i++) g.ram.setU8(a5 + i, fill);
  g.ram.setU16(a5 + OBJ.typeOff, type);
  g.ram.setU8(a5 + 0x02, state);
  return a5;
}

// **THE UNIT'S OWN DEFECT, DRIVEN.** `objslot15.js:179` is reached whenever the timed-text
// sequence's load is armed, and until this wave it called `ctx.soundPost?.(0x28c186)`, which
// `postWrapper` refuses -- so the frame died with a TypeError-shaped run-ender in the owner's
// build. The slot is planted in state 1 with the three conditions of `$291F78`'s `bne` chain
// satisfied and driven through `Game#step`, which is the path that was throwing.
test('SECTION 6: STATE TRACE -- slot [15]\'s sequence load posts $16000000 and no longer throws',
  { skip: SKIP_SEED }, () => {
    const g = game();
    const a5 = plantDirty(g, firstEmptySlot(g), 15, 1);
    // $291F78's three gates, all open: phase 0, drift stopped, timer about to hit zero.
    g.ram.setU16(a5 + SLOT15.phase, 0);
    g.ram.setU16(a5 + SLOT15.timer, 1);
    g.ram.setU32(a5 + SLOT15.handle, 0xdeadbeef);      // dirtied: the load must overwrite it
    g.ram.setU16(SLOT15.drift, 0);
    g.ram.setU16(SLOT15.cursor, 0);
    g.ram.setU16(SLOT15.frames, 0);
    // The shared pool: entry words zero (so nothing draws) but every OTHER word dirtied, because
    // slot [7] walks this same region at a different stride and leaves its own bytes behind.
    for (let i = 0; i < SLOT15.entries; i++) {
      const e = SLOT15.pool + i * SLOT15.stride;
      g.ram.setU16(e, 0);
      for (let o = 2; o < SLOT15.stride; o += 2) g.ram.setU16(e + o, 0x5a5a);
    }

    const before = countInRing(g.ram, 0x16000000);
    g.step(0);                                          // THREW before this wave

    assert.equal(countInRing(g.ram, 0x16000000), before + 1,
      '$291FAC jsr $28C186 did not reach the ring -- D0=$16, D1=0 packs to $16000000');
    // NOT JUST "no throw": the surrounding instructions ran too, so the arm really was taken.
    assert.equal(g.ram.u16(a5 + SLOT15.phase), 1, '$291F94 did not set the phase');
    assert.equal(g.ram.u16(a5 + SLOT15.timer), 0, '$291F8C did not drain the timer');
    assert.notEqual(g.ram.u32(a5 + SLOT15.handle), 0xdeadbeef,
      '$291FA0 jsr $246710 did not store a chain handle over the dirty one');
  });

test('SECTION 6: RED -- the load\'s cue is exactly the address the address-only API refuses',
  { skip: SKIP_SEED }, () => {
    // The proof that SECTION 6 tests a real repair and not a no-op: the address objslot15 posts
    // is the one `postWrapper` throws on, so the old one-argument call could only ever throw.
    const src = readFileSync(SRC + 'objslot15.js', 'utf8');
    assert.match(src, /ctx\.soundPostD1\?\.\(0x28c186, 0\)/,
      'objslot15.js no longer posts $28C186 through the D1-carrying API');
    assert.doesNotMatch(src, /ctx\.soundPost\?\.\(0x28c186/,
      'the address-only call is back, and it throws on every frame that reaches it');
    assert.throws(() => postWrapper(new Ram(), new SoundState(), 0x28c186),
      /takes D1 FROM THE CALLER/);
  });

// ------------------------------------------------------------------------------- SECTION 7

// `$28DE72`, the result screen's exit handshake. This was a counted `note()`, not a throw, so it
// failed SILENTLY: the handshake advanced, the cue did not sound. Driven on the REAL ctx, through
// the exported `result28D9AA`, with the record dirtied first.
test('SECTION 7: STATE TRACE -- the result screen\'s F8 exit posts $16000000',
  { skip: SKIP_SEED }, () => {
    const g = game();
    const SPY = 0x33;
    let ctx = null;
    g.handlers.set(SPY, (_r, _s, _i, c) => { ctx = c; });
    const slot = firstEmptySlot(g);
    plantDirty(g, slot, SPY, 0, 0x00);
    g.step(0);
    assert.ok(ctx !== null, 'the spy never ran');

    // Type 6's own record, DIRTIED, then only the two fields $28DE2A..$28DE3A actually reads.
    const a5 = plantDirty(g, slot, 6, 0x00, 0x5a);
    g.ram.setU16(a5 + 0x04, 1);        // $28DE3A cmpi.w #$5 -- NOT the stage-5 ending arm
    g.ram.setU8(a5 + 0x06, 0x01);      // $28DE2A/$28DE30 -- neither $B nor $15, so it proceeds

    // `$28D9AA`'s phase byte with F0/F1/F4/F6 already done, and F3/F5/F7 already finished, so the
    // one arm left is F8. Each of these is the cartridge's own "done" encoding, not a shortcut.
    const a6 = SE.result;
    g.ram.setU8(a6 + 0x02, 0x01 | 0x02 | 0x04 | 0x08);
    g.ram.setU16(a6 + 0x04, 0);        // f1cnt: F2 already ran
    g.ram.setU16(a6 + 0x06, 0x8000);   // slide: $28DACE bmi -> F4
    g.ram.setU16(a6 + 0x2c, 0);        // hold: F5's countdown drained
    g.ram.setU16(a6 + 0x3e, 0x8000);   // medal: $28DDB0 bmi -> F8
    g.ram.setU8(SE.bossFlags9, g.ram.u8(SE.bossFlags9) | 0x02);  // $28DE1E btst #1

    const before = countInRing(g.ram, 0x16000000);
    result28D9AA(g.ram, ctx.rom, ctx, a5);

    assert.equal(countInRing(g.ram, 0x16000000), before + 1,
      '$28DE72 jsr $28C186 did not reach the ring');
    // THE STATE TRACE: F8 really ran, rather than an earlier arm returning before it.
    assert.equal(g.ram.u8(a5 + 0x06), 0x0b, '$28DE60 did not advance type 6 to state $B');
    assert.notEqual(g.ram.u32(a5 + 0x08) >>> 0, 0x5a5a5a5a,
      '$28DE66 jsr $24652A did not store the fly-away handle over the dirty one');
  });

// ------------------------------------------------------------------------------- SECTION 8

// The scroll VM's cue sub-op 2 -- the site whose D1 is a real script word. It is NOT reachable
// from the shipped seed in any tractable number of frames: MEASURED, 3,000 frames of `Game#step`
// from the seed dispatch four background-element records and ZERO op-$14 records, because the
// stage-0 script schedules its two cues at clock $01DA and $01F2 and the clock is an odometer,
// not a frame counter. So the interpreter is pointed at the cartridge's own CUE RECORD and run
// for one frame. Everything below that -- the record decode, the cue-stream walk, the sub-op
// dispatch, the D1 read and the post -- is the shipped code on the shipped data.
test('SECTION 8: STATE TRACE -- the scroll VM\'s cue sub-op 2 posts, with the script\'s own D1',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const sound = new SoundState();
    const seen = [], records = [];
    const ctx = {
      unportedLog: new UnportedLog(),
      soundPost: () => {},
      soundPostD1: (addr, d1) => { seen.push([addr, d1]); return postBgmCommand(ram, sound, addr, d1); },
      scrollRecord: (r) => records.push(r),
      scrollEvent: () => {},
    };
    const vram = new BgVram();
    const a5 = 0x80e240;
    ram.setU16(BGRAM.stageX4, 0);                       // stage 1 (index 0)
    ram.setU16(a5 + BGO.entryClock, 0);
    backgroundInit(ram, ROM, vram, ctx, a5);

    assert.equal(ram.u32(BGRAM.scr0 + 0x08), 0x261602,
      '$262000 did not install stage 0\'s cue stream, so the walk below would prove nothing');
    records.length = 0;
    ram.setU32(BGRAM.scr0 + 0x00, 0x261756);            // SB.cur := the op-$14 record
    ram.setU16(BGRAM.clock, 0x01da);                    // and its own time word

    backgroundFrame(ram, ROM, vram, ctx, a5);

    assert.deepEqual(records.map((r) => [r.at, r.op, r.t]), [[0x261756, 0x14, 0x01da]],
      'the interpreter did not dispatch the CUE record');
    assert.deepEqual(seen, [[0x28c186, 0]],
      'cue sub-op 2 did not post -- it was a counted note until this wave');
    assert.equal(countInRing(ram, 0x16000000), 1, 'and the packed command is not in the ring');
    // $2621A4: the cursor is written back only when the sub-op count runs out, and it lands past
    // the D1 word -- proof the walk consumed the word it posted rather than re-reading the head.
    assert.equal(ram.u32(BGRAM.scr0 + 0x08), 0x261606,
      '$2621A4 did not advance the cue cursor past the sub-op-2 payload');
  });

// ------------------------------------------------------------------------------- SECTION 9

// **MAKE SOMETHING READ THE BOOKKEEPING.** Four times now this repo has carried a statement that
// was false while every assertion around it held, and every one survived because nothing read it
// back. So: no `note()` for `$28C186` may exist anywhere in `src/`, and each of the three sites
// must carry the real call. A file that quietly reverts to counting fails here.
test('SECTION 9: not one counted note for $28C186 survives in src/, and all three sites post',
  () => {
    const offenders = [];
    for (const f of readdirSync(SRC).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(SRC + f, 'utf8');
      for (const m of src.matchAll(/\bnote\(\s*(?:ctx\s*,\s*)?0x28c186\b/gi)) {
        offenders.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    assert.deepEqual(offenders, [],
      'a $28C186 call site is being COUNTED instead of posted again: ' + offenders.join(', '));

    for (const [f, re] of [
      ['objslot15.js', /ctx\.soundPostD1\?\.\(0x28c186, 0\)/],
      ['stageend.js', /ctx\.soundPostD1\?\.\(0x28c186, 0\)/],
      ['background.js', /ctx\.soundPostD1\?\.\(0x28c186, d1\)/],
    ]) {
      assert.match(readFileSync(SRC + f, 'utf8'), re,
        `${f} no longer posts $28C186 through the D1-carrying API`);
    }
  });
