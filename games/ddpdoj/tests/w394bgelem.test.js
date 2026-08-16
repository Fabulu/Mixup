// ===============================================================================================
// W394 -- STAGE 3's BACKGROUND ELEMENTS, AND THE FRAME THE ATTRACT LOOP STOPPED DYING.
// ===============================================================================================
//
// UNIT. `$262B4C`, the constructor a real cold boot reached at +10,514 and could not translate,
// and the thirteen constructors adjacent to it: the whole of internal stage index 2's element
// table, which is human Stage 3 and the stage DEMO 2 plays.
//
// **WHERE THE BRIEF IS WRONG, asserted here from the bytes rather than argued:**
//
//   1. "its updater `$262B6A` differs from the already-ported `$2627CA` in TWO BYTES: the
//      `addi.l` threshold and one branch displacement." **IT IS FOUR BYTES AND NEITHER OF THE
//      OTHER TWO IS A DISPLACEMENT.** The displacement word is `$0006` in BOTH, so both branch
//      to their own start+$32. What differs at +$0C is the CONDITION -- `6E00 bgt.w` against
//      `6C00 bge.w` -- and what differs at +$30/+$31 is the low word of the `4EF9 jmp` target:
//      `$23DEFC` against `$23DF2A`, which `resolveEmitStub` resolves to BUCKET 1 and BUCKET 2.
//      Aliasing `$2627CA` would have put every element of this stage in the wrong sprite bucket
//      AND kept an element alive for one extra frame at the despawn edge. SECTION 2, and
//      SECTION 3 drives the bge/bgt difference through the real driver.
//   2. "**One row** in `BGELEM_HANDLERS`". The stage's table is bounded by the per-stage pointer
//      array `$262302` itself -- entry 2 is `$26229E` and entry 3 is `$2622D6`, so the table is
//      $38 bytes and **FOURTEEN** entries, every one of them the same $52-byte unit. Porting one
//      row would have left thirteen constructors that the port can prove are already understood
//      sitting behind an `unreached`. SECTION 1 decodes all fourteen field by field.
//   3. "plus its sprite art". No ROM window is needed and none is declared: the port never
//      dereferences an element's `data`, it only stages the pointer, and the two addresses it
//      DOES read -- the table at `$26229E` and the emit stub at `$23DEFC` -- are already inside
//      W-earlier windows `$262240+$100` and `$23D760+$962`. SECTION 6 ablates both to prove they
//      are load-bearing rather than assumed. **What was still missing at W394 was the web
//      build's sprite sheet: `tools/export-web.mjs` harvested BGELEM art for `stage === 0`, `1`
//      and `3` and had no arm for `stage === 2`, so these fourteen streams had no picture.** That
//      file was not W394's to edit; SECTION 5 names the fourteen stream addresses, and **W395
//      added the fourth arm and harvested them** -- `tests/w395stage2art.test.js` compares the
//      shipped shard-11 mask body against the mask ROM word for word.
//   4. "Expect more behind it." There is nothing behind it. SECTION 5 runs 20,000 frames -- five
//      complete 4,032-frame attract laps, fifteen demos -- with no throw at all.
//
// SECTION 1  the ROM: the table's extent from the pointer array, and all fourteen units decoded
// SECTION 2  **THE FOUR BYTES**, and what each one does
// SECTION 3  driven: bgt against bge at the exact zero-sum frame, in one frame of one driver
// SECTION 4  driven: the record really lands in BUCKET 1, carrying this row's own art
// SECTION 5  **THE DELIVERABLE: a real cold boot past +10,514, and what demo 2 then does**
// SECTION 5b the stale sentence in `src/rank.js`, and the write that proves it was stale
// SECTION 6  the ROM windows -- none declared, both dependencies ablated, the overlap count
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { RomWindows } from '../src/rom.js';
import { resolveEmitStub, BUCKETS } from '../src/spritequeue.js';
import { BGELEM_HANDLERS, BGRAM, ESLOT } from '../src/background.js';
import { SCREEN8 } from '../src/objslot8.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const SKIP_T = existsSync(TABLES) ? SKIP : 'generated ROM tables absent; skip, not pass';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const tables = existsSync(TABLES) ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const s16 = (v) => (v << 16) >> 16;

// `$262302` is `BGTAB.elemTable`, the per-stage pointer array `$262332 move.l (A0,D0.w),$8132C8`
// indexes with stage*4. Internal index 2 is human Stage 3.
const ELEM_TABLE_PTRS = 0x262302;
const STAGE3_TABLE = 0x26229e;      // = l($262302 + 2*4)
const STAGE4_TABLE = 0x2622d6;      // = l($262302 + 3*4) -- the far bound, stated by code
const UNIT = 0x52;                  // ctor $1E + updater $32 + a `4E71` filler word
const S2 = BGELEM_HANDLERS.filter((h) => h.stage === 2);

// ===============================================================================================
// SECTION 1 -- THE ROM. The extent is read out of the pointer array, never out of an absence.
// ===============================================================================================

test('W394 SECTION 1: the pointer array bounds the table at FOURTEEN entries, not one',
  { skip: SKIP }, () => {
    assert.equal(l(ELEM_TABLE_PTRS + 2 * 4), STAGE3_TABLE,
      '$262302 + 2*4 names $26229E as internal stage 2\'s element table');
    assert.equal(l(ELEM_TABLE_PTRS + 3 * 4), STAGE4_TABLE,
      '  ...and the NEXT stage\'s pointer, $2622D6, is where it has to stop');
    assert.equal(STAGE4_TABLE - STAGE3_TABLE, 0x38, 'so the table is $38 bytes');
    assert.equal((STAGE4_TABLE - STAGE3_TABLE) / 4, 14, '  ...which is fourteen longwords');
    // The near bound is the previous stage's table, and W168 already pinned its far end: the
    // 32-pair animation table $262A4C..$262B4B ends exactly at $262B4C.
    assert.equal(l(ELEM_TABLE_PTRS + 1 * 4), 0x26227e, '$262302 + 1*4 is W168\'s $26227E');
    assert.equal(0x262a4c + 32 * 8, 0x262b4c,
      'and W168\'s closed animation table ends AT $262B4C, the first constructor here');
    assert.equal(S2.length, 14, 'the registry carries all fourteen');
  });

test('W394 SECTION 1: every field of all fourteen units is read out of the instruction that '
  + 'writes it', { skip: SKIP }, () => {
    for (let i = 0; i < 14; i++) {
      const h = S2[i];
      const c = h.ctor;
      const tag = `stage-2 id ${i} ($${c.toString(16).toUpperCase()})`;
      assert.equal(h.id, i, `${tag}: the row's id is its table index`);
      assert.equal(l(STAGE3_TABLE + i * 4), c, `${tag}: the cartridge's own table entry`);
      assert.equal(c, 0x262b4c + i * UNIT, `${tag}: the units are a flat $52 stride`);

      // --- the constructor, five instructions, $1E bytes, `rts` AT the last address (trap 5)
      assert.equal(w(c + 0x00), 0x2d7c, `${tag}: move.l #imm,(d16,A6)`);
      assert.equal(l(c + 0x02), h.data, `${tag}: the sprite stream immediate`);
      assert.equal(w(c + 0x06), 0x0010, `${tag}:   ...into ($10,A6), ESLOT.data`);
      assert.equal(w(c + 0x08), 0x3d7c, `${tag}: move.w #imm,(d16,A6)`);
      assert.equal(w(c + 0x0a), h.yPos, `${tag}: the Y constant`);
      assert.equal(w(c + 0x0c), 0x0014, `${tag}:   ...into ($14,A6), ESLOT.yPos`);
      assert.equal(w(c + 0x0e), 0x2d7c, `${tag}: move.l #imm,(d16,A6)`);
      assert.equal(l(c + 0x10), h.upd, `${tag}: the updater it installs`);
      assert.equal(w(c + 0x14), 0x0008, `${tag}:   ...into ($8,A6), ESLOT.update`);
      assert.equal(h.upd, c + 0x1e, `${tag}: which is this unit's own second half`);
      // TRAP 3: `1D7C 0016 000D` is `move.b #imm,(d16,A6)` and the WORD literal $0016 covers the
      // byte operand AND its pad byte. `elemConstruct` writes slot+$D, not slot+$C.
      assert.equal(w(c + 0x16), 0x1d7c, `${tag}: move.b #imm,(d16,A6)`);
      assert.equal(w(c + 0x18), h.kind, `${tag}: the kind byte, in a word literal`);
      assert.equal(w(c + 0x1a), 0x000d, `${tag}:   ...into ($D,A6), the LOW half of ESLOT.kind`);
      assert.equal(h.kindWord, undefined, `${tag}: so this row is NOT one of W168's word writers`);
      assert.equal(w(c + 0x1c), 0x4e75, `${tag}: the rts sits AT the constructor's last address`);

      // --- the updater, $32 bytes
      const u = h.upd;
      assert.equal(w(u + 0x00), 0x302e, `${tag}: upd move.w (d16,A6),D0`);
      assert.equal(w(u + 0x02), 0x0002, `${tag}:   ...($2,A6), the despawn word`);
      assert.equal(w(u + 0x04), 0x48c0, `${tag}: ext.l D0 -- so this is a LONG variant`);
      assert.equal(w(u + 0x06), 0x0680, `${tag}: addi.l #imm,D0`);
      assert.equal(l(u + 0x08), h.thr, `${tag}: the threshold`);
      assert.equal(w(u + 0x0c), 0x6e00, `${tag}: 6E00 -- bgt.w, NOT the 6C00 bge.w of $2627CA`);
      assert.equal(h.v, 'lbgt', `${tag}:   ...which is what 'lbgt' means in the registry`);
      assert.equal(w(u + 0x0e), 0x0006, `${tag}: the displacement word, and it is 6 in all of them`);
      // TRAP 4: a `bcc.w` target is the EXTENSION WORD's address plus the displacement.
      assert.equal(u + 0x0e + 6, u + 0x14, `${tag}: so the branch goes to upd+$14`);
      assert.equal(w(u + 0x10), 0x4216, `${tag}: the not-taken arm is clr.b (A6) -- die`);
      assert.equal(w(u + 0x12), 0x4e75, `${tag}:   ...then rts`);
      assert.equal(w(u + 0x14), 0x4eb9, `${tag}: jsr abs.l`);
      assert.equal(l(u + 0x16), 0x24179e, `${tag}:   ...$24179E, the scroll compensation`);
      assert.equal(w(u + 0x1a), 0x222e, `${tag}: move.l ($2,A6),D1`);
      assert.equal(w(u + 0x1c), 0x0002, `${tag}:   ...ESLOT.arg`);
      assert.equal(w(u + 0x1e), 0x362e, `${tag}: move.w ($14,A6),D3`);
      assert.equal(w(u + 0x20), 0x0014, `${tag}:   ...ESLOT.yPos`);
      assert.equal(w(u + 0x22), 0x242e, `${tag}: move.l ($10,A6),D2`);
      assert.equal(w(u + 0x24), 0x0010, `${tag}:   ...ESLOT.data`);
      // TRAP 22: `moveq #0,D4` before a WORD read of ($C,A6) is a dead store on every row here,
      // because the kind field's high byte is never written. Transcribed, not tidied.
      assert.equal(w(u + 0x26), 0x7800, `${tag}: moveq #0,D4`);
      assert.equal(w(u + 0x28), 0x382e, `${tag}: move.w ($C,A6),D4`);
      assert.equal(w(u + 0x2a), 0x000c, `${tag}:   ...ESLOT.kind, the WHOLE word`);
      // TRAP 5 again: `4EF9` is six bytes, so the updater's last address is upd+$31 and it
      // NEVER RETURNS -- it tail-jumps into the emitter.
      assert.equal(w(u + 0x2c), 0x4ef9, `${tag}: jmp abs.l -- a tail jump, there is no rts here`);
      assert.equal(l(u + 0x2e), h.emit, `${tag}: the emitter`);
      assert.equal(h.emit, 0x23defc, `${tag}: and it is bucket 1's $23DEFC on ALL fourteen`);
      assert.equal(u + 0x32, c + UNIT - 2, `${tag}: the updater ends two bytes short of the unit`);
      assert.equal(w(c + 0x50), 0x4e71, `${tag}: and those two bytes are a 4E71 nop filler`);
    }
  });

test('W394 SECTION 1: ABLATION -- every single registry field is load-bearing', { skip: SKIP },
  () => {
    // Each of the six columns, mutated one row at a time, must make SECTION 1's cross-check
    // above fail. This is the check that says the fourteen rows were transcribed and not typed.
    const CHECK = (h) => {
      assert.equal(l(h.ctor + 0x02), h.data);
      assert.equal(w(h.ctor + 0x0a), h.yPos);
      assert.equal(l(h.ctor + 0x10), h.upd);
      assert.equal(w(h.ctor + 0x18), h.kind);
      assert.equal(l(h.upd + 0x08), h.thr);
      assert.equal(l(h.upd + 0x2e), h.emit);
      assert.equal(l(STAGE3_TABLE + h.id * 4), h.ctor);
    };
    let reddened = 0;
    for (const h of S2) {
      assert.doesNotThrow(() => CHECK(h), `id ${h.id} passes as shipped`);
      for (const k of ['ctor', 'upd', 'data', 'yPos', 'kind', 'thr', 'emit']) {
        assert.throws(() => CHECK({ ...h, [k]: h[k] + 2 }),
          `id ${h.id}: perturbing \`${k}\` must redden the ROM cross-check`);
        reddened++;
      }
    }
    assert.equal(reddened, 14 * 7, 'ninety-eight ablations, all of them red');
  });

// ===============================================================================================
// SECTION 2 -- **THE FOUR BYTES.** The brief said two, and called one of them a displacement.
// ===============================================================================================

test('W394 SECTION 2: $262B6A and $2627CA differ in FOUR bytes, and here is what each does',
  { skip: SKIP }, () => {
    const A = 0x262b6a;             // this wave's id-0 updater
    const B = 0x2627ca;             // W168's already-ported stage-2 (internal 1) id-0 updater
    const diff = [];
    for (let i = 0; i < 0x32; i++) if (IMG[A + i] !== IMG[B + i]) diff.push(i);
    assert.deepEqual(diff, [0x0a, 0x0c, 0x30, 0x31],
      'FOUR differing bytes over the $32-byte body, at these four offsets');

    // +$0A -- the `addi.l` threshold's high byte. This one the brief had right.
    assert.equal(l(A + 0x08), 0x00007000, '$262B72 addi.l #$7000,D0');
    assert.equal(l(B + 0x08), 0x00005c00, '$2627D2 addi.l #$5C00,D0');

    // +$0C -- **NOT A DISPLACEMENT. THE CONDITION.**  The displacement word that follows is the
    // SAME in both, and both branches land on their own body at start+$14.
    assert.equal(w(A + 0x0c), 0x6e00, '$262B76 is 6E00, bgt.w');
    assert.equal(w(B + 0x0c), 0x6c00, '$2627D6 is 6C00, bge.w');
    assert.equal(w(A + 0x0e), 0x0006, 'and the displacement word is $0006...');
    assert.equal(w(B + 0x0e), 0x0006, '  ...in BOTH of them');
    assert.equal(A + 0x0e + 6, A + 0x14, 'so $262B76 branches to $262B7E');
    assert.equal(B + 0x0e + 6, B + 0x14, '  ...and $2627D6 to $2627DE, each its own body');
    // What the condition costs: bge keeps a true sum of exactly 0 alive, bgt kills it. SECTION 3
    // drives that difference in one frame of the real driver.
    const rowA = S2[0]; const rowB = BGELEM_HANDLERS.find((h) => h.upd === B);
    assert.equal(rowA.v, 'lbgt', '$262B4C\'s row is lbgt');
    assert.equal(rowB.v, 'lbge', '  ...and $2627AC\'s stays lbge');

    // +$30/+$31 -- the `jmp` target's low word. **A DIFFERENT SPRITE BUCKET.**
    assert.equal(w(A + 0x2c), 0x4ef9, 'both tail-jump...');
    assert.equal(w(B + 0x2c), 0x4ef9, '  ...through 4EF9');
    assert.equal(l(A + 0x2e), 0x23defc, '$262B96 jmp $23DEFC');
    assert.equal(l(B + 0x2e), 0x23df2a, '$2627F2 jmp $23DF2A');
    const ROM = new RomWindows(tables.rom);
    assert.deepEqual(resolveEmitStub(ROM, 0x23defc), { bucket: 1, conv: 'register' },
      '$23DEFC is BUCKET 1');
    assert.deepEqual(resolveEmitStub(ROM, 0x23df2a), { bucket: 2, conv: 'register' },
      '$23DF2A is BUCKET 2 -- so the two bytes are a whole different sprite queue');
    assert.equal(rowA.emit, 0x23defc, 'and the registry says so');
    assert.equal(rowB.emit, 0x23df2a);
  });

// ===============================================================================================
// SECTION 3, 4, 5 -- DRIVEN. One real cold boot, shared.
// ===============================================================================================

/** The helper W390..W393 use, extended to record what the stage-2 elements do. */
function coldBoot(frames, tweak = null) {
  const g = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  const byUpd = new Map(S2.map((h) => [h.upd, h.id]));
  const seen = new Map();
  const arms = []; let prev = -1; let threw = null;
  for (let f = 1; f <= frames; f++) {
    try { g.step(0xffff); } catch (e) { threw = { f, e }; break; }
    const a = g.ram.u16(SCREEN8.state);
    if (a !== prev) { arms.push([f, a]); prev = a; }
    for (let s = 0; s < 8; s++) {
      const slot = BGRAM.elemSlots + s * 0x20;
      if (g.ram.u8(slot + ESLOT.active) === 0) continue;
      const id = byUpd.get(g.ram.u32(slot + ESLOT.update));
      if (id === undefined) continue;
      const e = seen.get(id);
      if (e) { e.frames++; e.last = f; } else seen.set(id, { first: f, last: f, frames: 1 });
    }
    if (tweak) tweak(g, f);
  }
  return { g, arms, threw, seen };
}

let RUN = null;
const run = () => (RUN ??= coldBoot(20000));

test('W394 SECTION 3: the ONE byte, DRIVEN -- at a true sum of exactly zero the bgt element '
  + 'dies in the same frame the bge element lives', { skip: SKIP_T }, () => {
    // +11,500 is inside demo 2, 986 frames after `$262B4C` spawns. `$8130D2` is up and the
    // scroll delta is 0 there, so `$24179E` is skipped and nothing but the despawn check can
    // move either slot -- the frame is a clean bench made out of a real run.
    const bench = () => {
      const { g } = coldBoot(11500);
      assert.equal(g.ram.u16(BGRAM.bgFreeze), 1, 'bgFreeze up, so $24179E is skipped');
      assert.equal(g.ram.u16(BGRAM.scrollDelta), 0, '  ...and the scroll delta is zero');
      return g;
    };
    const g = bench();
    const s0 = BGRAM.elemSlots;            // demo 2's own live element, $262B6A, lbgt, thr $7000
    const s1 = BGRAM.elemSlots + 0x20;     // a free slot, given W168's $2627CA, lbge, thr $5C00
    assert.equal(g.ram.u32(s0 + ESLOT.update), 0x262b6a, 'slot 0 is running $262B6A');
    assert.equal(g.ram.u8(s1 + ESLOT.active), 0, 'slot 1 is free');
    const rowB = BGELEM_HANDLERS.find((h) => h.upd === 0x2627ca);
    g.ram.setU8(s1 + ESLOT.active, 0x80);
    g.ram.setU32(s1 + ESLOT.update, rowB.upd);
    g.ram.setU32(s1 + ESLOT.data, rowB.data);
    g.ram.setU16(s1 + ESLOT.yPos, rowB.yPos);
    g.ram.setU8(s1 + 0x0d, rowB.kind);
    // The exact zero-sum point for each: i16(slot+2) + thr === 0.
    g.ram.setU16(s0 + ESLOT.arg, 0x10000 - S2[0].thr);
    g.ram.setU16(s1 + ESLOT.arg, 0x10000 - rowB.thr);
    assert.equal(s16(g.ram.u16(s0 + ESLOT.arg)) + S2[0].thr, 0, 'slot 0 sits at a true sum of 0');
    assert.equal(s16(g.ram.u16(s1 + ESLOT.arg)) + rowB.thr, 0, '  ...and so does slot 1');
    g.step(0xffff);
    assert.equal(g.ram.u8(s0 + ESLOT.active), 0,
      '**bgt: $262B6A KILLS its element at a true sum of exactly 0**');
    assert.equal(g.ram.u8(s1 + ESLOT.active), 0x80,
      '**bge: $2627CA, one byte away, KEEPS its element in the very same frame**');

    // POSITIVE CONTROL: one unit above zero and the bgt element lives, so the test is measuring
    // the boundary and not a slot that was going to die anyway.
    const g2 = bench();
    g2.ram.setU16(s0 + ESLOT.arg, 0x10000 - S2[0].thr + 1);
    g2.step(0xffff);
    assert.equal(g2.ram.u8(s0 + ESLOT.active), 0x80, 'at a true sum of +1 the bgt element lives');
  });

test('W394 SECTION 4: the record really lands in BUCKET 1, carrying this row\'s own art',
  { skip: SKIP_T }, () => {
    const { g } = coldBoot(11500);
    const b1 = BUCKETS[1];
    assert.equal(b1.buffer, 0x805104, 'bucket 1\'s buffer, $23DEFC\'s own');
    const h = S2[0];
    // `elemStage`'s twelve bytes, as `$23DEFC`'s register convention lays them down: the packed
    // coordinate longword, the art longword, the Y word and the kind word.
    assert.equal(g.ram.u32(b1.buffer + 4), h.data,
      `bucket 1 record 0 words 2-3 are $${h.data.toString(16).toUpperCase()}, id 0's stream`);
    assert.equal(g.ram.u16(b1.buffer + 8), h.yPos, '  ...word 4 is its yPos $38A0');
    assert.equal(g.ram.u16(b1.buffer + 10), h.kind, '  ...and word 5 its kind $16');
    // AND NOT BUCKET 2: nothing in bucket 2's buffer carries this stream.
    const b2 = BUCKETS[2];
    let inB2 = 0;
    for (let o = 0; o + 4 <= b2.capBytes; o += 12) {
      if (g.ram.u32(b2.buffer + o + 4) === h.data) inB2++;
    }
    assert.equal(inB2, 0, 'and $290F10 appears nowhere in bucket 2 -- the jmp target is honoured');
  });

// ===============================================================================================
// SECTION 5 -- **THE DELIVERABLE.**
// ===============================================================================================

test('W394 SECTION 5: **DEMO 2 PLAYS.** A real cold boot runs 20,000 frames with no throw at all',
  { skip: SKIP_T }, () => {
    const { threw, arms } = run();
    assert.equal(threw, null,
      `no throw in 20,000 frames${threw ? ` -- it reached +${threw.f}` : ''}`);
    // W392/W393 measured three laps and a death. The loop is now periodic without end: five
    // complete laps of exactly 4,032 frames, fifteen demos, and the sixteenth in flight.
    const twos = arms.filter(([, a]) => a === 2).map(([f]) => f);
    assert.deepEqual(twos, [302, 4334, 8366, 12398, 16430], 'arm 2 five times, not three');
    for (let i = 1; i < twos.length; i++) {
      assert.equal(twos[i] - twos[i - 1], 4032, `lap ${i} -> ${i + 1} is the same 4,032 frames`);
    }
    // The first three laps are byte-for-byte W392's sixteen transitions; nothing regressed.
    assert.deepEqual(arms.slice(0, 16), [
      [1, 13], [302, 2], [574, 12], [878, 9], [1182, 1], [1918, 5],
      [4334, 2], [4606, 12], [4910, 9], [5214, 1], [5950, 5],
      [8366, 2], [8638, 12], [8942, 9], [9246, 1], [9982, 5],
    ], 'W392\'s sixteen transitions, unchanged');
    // ...and +10,514, the frame the brief is named after, is now just a frame.
    assert.ok(arms.every(([f]) => f !== 10514), '+10,514 is not even a transition');
  });

test('W394 SECTION 5: what demo 2 ACTUALLY asks for is ONE of the fourteen, and the other '
  + 'thirteen are transcribed but never reached', { skip: SKIP_T }, () => {
    const { seen } = run();
    assert.deepEqual([...seen.keys()], [0], 'across five laps ONLY id 0 is ever spawned');
    const e = seen.get(0);
    assert.equal(e.first, 10514, 'it spawns on the exact frame the port used to die on');
    // It then lives out the rest of the demo: `$8130D2` goes up and the scroll delta stops, so
    // `($2,A6)` stalls at +960 and `960 + $7000 > 0` keeps it alive to the demo's end.
    assert.ok(e.frames > 2000, `and it stays live for ${e.frames} slot-frames`);
    // THE COUNT, with measured byte extents, so the next wave does not have to re-measure:
    // ids 1..13 are $52 bytes each, $262B9E..$262FC7, and every one of them is already
    // transcribed into BGELEM_HANDLERS -- they are not counted, they are ported-but-unexercised.
    const rest = S2.filter((h) => h.id !== 0);
    assert.equal(rest.length, 13);
    assert.equal(rest[0].ctor, 0x262b9e, 'the unexercised span starts at $262B9E');
    assert.equal(rest[12].ctor + UNIT, 0x262fc8,
      '  ...and ends at $262FC8, which is stage 3\'s table entry 0. $52 * 13 = $42A bytes');
    assert.equal(13 * UNIT, 0x42a);
  });

test('W394 SECTION 5: the fourteen art streams the WEB build had no picture for',
  { skip: SKIP }, () => {
    // Named here rather than harvested, because `tools/export-web.mjs` was not W394's file. Its
    // three BGELEM harvest arms filtered `stage === 0`, `stage === 1` and `stage === 3`; there
    // was no `stage === 2` arm, so these fourteen streams were absent from the sprite sheet and
    // internal stage 2 rendered the W86 black terrain on the live build. **W395 ADDED THE FOURTH
    // ARM** off this very list; the sheet side is `tests/w395stage2art.test.js`. They are offsets
    // into the sprite MASK rom, not the program rom -- do not read them in `maincpu.bin`.
    assert.deepEqual(S2.map((h) => h.data), [
      0x290f10, 0x292094, 0x294018, 0x295f9c, 0x2961a0, 0x298124, 0x29a0a8,
      0x29c02c, 0x29cc90, 0x29dc54, 0x29fbd8, 0x2a1b5c, 0x2a3ae0, 0x2a5a64,
    ], 'fourteen distinct streams, $290F10..$2A5A64');
    assert.equal(new Set(S2.map((h) => h.data)).size, 14, 'no two rows share art');
    for (const h of S2) {
      assert.equal(l(h.ctor + 2), h.data, 'each read out of its own `move.l #imm,($10,A6)`');
    }
  });

// ===============================================================================================
// SECTION 5b -- THE STALE SENTENCE IN `src/rank.js`. Trap 14, and nothing asserted it.
// ===============================================================================================

test('W394 SECTION 5b: rank.js no longer says $260580 is NOTED, because W378 made it a CALL',
  { skip: SKIP_T }, () => {
    const rank = readFileSync(here('../src/rank.js'), 'utf8');
    const slot17 = readFileSync(here('../src/objslot17.js'), 'utf8');
    // THE LIE, gone. It stood beside a live call from W378 to W394.
    assert.equal(/NOTES `?\$260580`? instead of running it/.test(rank), false,
      'src/rank.js must not claim handoff26070C notes $260580');
    // THE TRUTH, in the code rather than in prose: objslot17.js imports this file\'s
    // `stageStart260580` and invokes it inside `handoff26070C`.
    assert.match(slot17, /import \{[^}]*stageStart260580[^}]*\} from '\.\/rank\.js'/,
      'objslot17.js imports stageStart260580 from rank.js');
    assert.match(slot17, /\n\s*stageStart260580\(ram, rom, ctx, d6, d7, a5\);/,
      '  ...and calls it, unconditionally, in handoff26070C');
    // AND DRIVEN, which is the only reading a comment cannot fake: the chain
    // $26070C -> $260580 -> $26051A -> $26089E is the ONLY writer of $81315C, so a non-zero
    // $81315C on a real cold boot IS the call having happened.
    const g = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false });
    g.boot(); g.ram.setU8(0x803957, 1);
    let first = null; const vals = new Set();
    for (let f = 1; f <= 2000; f++) {
      g.step(0xffff);
      const v = g.ram.u32(0x81315c);
      if (v !== 0) { first ??= f; vals.add(v); }
    }
    assert.equal(first, 1934, '$81315C goes non-zero at +1,934, demo 0\'s handoff frame');
    assert.deepEqual([...vals], [0x260874],
      '  ...with $260874, difficulty table 1 out of RANKBASE\'s longword table');
  });

// ===============================================================================================
// SECTION 6 -- THE ROM WINDOWS. **NONE IS DECLARED**, and that is checked, not assumed.
// ===============================================================================================

const WINDOWS = () => tables.rom.windows.map(
  (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]);

test('W394 SECTION 6: no new window -- the two addresses the port reads are already covered',
  { skip: SKIP_T }, () => {
    const ws = WINDOWS();
    // W398, W399 and then W400 moved this ONE number and nothing else in this file: W398 declared
    // $22D770, stage 5's map column stream, W399 declared HIBACHI's A4 script table plus the four
    // data blocks its ending scripts read, and W400 declared type $44's init stub, its prototype
    // pair and five data tables, so the set is 583. The claim this line makes -- that W394 itself
    // added no window -- is unchanged; the two `covers()` assertions below are its real content
    // and they are untouched witnesses.
    assert.equal(ws.length, 594, 'the exported set was 569 windows at W394, 570 after W398, '
      + '575 after W399, 583 after W400, 585 after W402, 590 after W404, 593 after W405, '
      + 'and is 594 since W406 declared A1 gun 9 template');
    const covers = (a) => ws.filter(([b, len]) => a >= b && a < b + len);
    // ONE: the per-stage table. `elemSpawn` does `rom.u32(tab + id*4)` and `backgroundInit` does
    // `rom.u32($262302 + stage*4)`; both are inside W-earlier `$262240 + $100`.
    assert.deepEqual(covers(ELEM_TABLE_PTRS).map(([b, n]) => [b, n]), [[0x262240, 0x100]]);
    assert.deepEqual(covers(STAGE3_TABLE).map(([b, n]) => [b, n]), [[0x262240, 0x100]]);
    assert.deepEqual(covers(STAGE4_TABLE - 4).map(([b, n]) => [b, n]), [[0x262240, 0x100]],
      'including the table\'s LAST longword');
    // TWO: the emit stub. `resolveEmitStub` reads $23DEFC's prologue; W168's stage-2 id 1 row
    // already goes through it, so the window predates this wave.
    assert.deepEqual(covers(0x23defc).map(([b, n]) => [b, n]), [[0x23d760, 0x962]]);
    // AND NOTHING ELSE. **THE FOURTEEN `data` VALUES ARE NOT PROGRAM-ROM ADDRESSES AT ALL** --
    // they are offsets into the sprite MASK rom (`tools/export-web.mjs` resolves them with
    // `romExtent(offs) = streamExtent(sprmask, COLW, offs & (MASKW-1))`), and the port never
    // dereferences one anyway: `elemConstruct` stores the value in ESLOT.data and `elemEmit`
    // hands it to the emitter as a VALUE, which lands in the bucket record verbatim (SECTION 4).
    // Nine of the fourteen numerically fall inside windows declared for the stage-2 and stage-4
    // BOSS code, and that is a coincidence of arithmetic, not coverage. Pinned so that nobody
    // later reads it as either.
    const numericallyInside = S2.filter((h) => covers(h.data).length > 0).map((h) => h.id);
    assert.deepEqual(numericallyInside, [1, 5, 6, 7, 8, 9, 10, 11, 12],
      'nine of the fourteen collide numerically with boss-code windows; five do not');
    assert.deepEqual(covers(0x292094).map(([b, n]) => [b, n]), [[0x291fe2, 0x1d8]],
      'e.g. id 1\'s $292094 sits inside a stage-2 boss window -- a different ROM entirely');
    // Nor is the CODE of the fourteen units read; it is transcribed into the registry.
    assert.deepEqual(covers(0x262b4c), [], '$262B4C itself is in no window');
  });

test('W394 SECTION 6: ABLATED FROM THE EXPORTED TABLES, both dependencies throw BY ADDRESS',
  { skip: SKIP_T }, () => {
    const without = (base) => ({
      ...tables,
      rom: {
        ...tables.rom,
        windows: tables.rom.windows.filter(
          (x) => parseInt(String(x.base).replace('$', ''), 16) !== base),
      },
    });
    // (a) THE EMIT STUB. A cold boot without $23D760 dies at +303 on $23DECE, and the exact read
    // this wave's fourteen rows depend on -- resolving $23DEFC -- throws at $23DEFC itself.
    const a = without(0x23d760);
    const ga = new Game(new Uint8Array(0x20000), a, { palCatchUp: false });
    ga.boot(); ga.ram.setU8(0x803957, 1);
    let hit = null;
    for (let f = 1; f <= 400; f++) {
      try { ga.step(0xffff); } catch (e) { hit = { f, a: e.romAddress, m: e.message }; break; }
    }
    assert.equal(hit?.f, 303, 'without $23D760 the cold boot dies at +303');
    assert.equal(hit?.a, 0x23dece, '  ...at $23DECE');
    assert.match(hit.m, /outside every\s+ROM window/, '  ...a window throw, named');
    assert.throws(() => resolveEmitStub(new RomWindows(a.rom), 0x23defc),
      (e) => e.romAddress === 0x23defc,
      'and this wave\'s own read, $23DEFC\'s prologue, throws at $23DEFC');

    // (b) THE HANDLER TABLE. Without $262240 the boot dies at +1,935 -- the frame demo 0's stage
    // installs its element table -- and both of the reads the fourteen rows need are gone.
    const b = without(0x262240);
    const gb = new Game(new Uint8Array(0x20000), b, { palCatchUp: false });
    gb.boot(); gb.ram.setU8(0x803957, 1);
    let hit2 = null;
    for (let f = 1; f <= 2000; f++) {
      try { gb.step(0xffff); } catch (e) { hit2 = { f, a: e.romAddress }; break; }
    }
    assert.equal(hit2?.f, 1935, 'without $262240 the cold boot dies at +1,935');
    assert.equal(hit2?.a, 0x262302, '  ...at $262302, the per-stage pointer array');
    const rb = new RomWindows(b.rom);
    assert.throws(() => rb.u32(ELEM_TABLE_PTRS + 2 * 4), (e) => e.romAddress === 0x26230a,
      'the stage-2 pointer read throws at $26230A');
    assert.throws(() => rb.u32(STAGE3_TABLE), (e) => e.romAddress === 0x26229e,
      '  ...and the table read at $26229E');

    // POSITIVE CONTROL: with both windows present, neither read throws...
    const ok = new RomWindows(tables.rom);
    assert.equal(ok.u32(ELEM_TABLE_PTRS + 2 * 4), STAGE3_TABLE);
    assert.equal(ok.u32(STAGE3_TABLE), 0x262b4c);
    assert.deepEqual(resolveEmitStub(ok, 0x23defc), { bucket: 1, conv: 'register' });
    // ...and the whole path they serve really runs: 20 frames past the old death, demo 2's
    // element is live in slot 0 with $262B6A installed. Without W394's rows this is the
    // `unreached` that used to end the run, so the control is tied to the fix and not to the
    // window set alone.
    const { g, threw } = coldBoot(10534);
    assert.equal(threw, null, 'the run is clean 20 frames past the old death');
    assert.equal(g.ram.u32(BGRAM.elemSlots + ESLOT.update), 0x262b6a,
      'and slot 0 is running $262B6A, reached through both of the windows above');
  });

test('W394 SECTION 6: the overlap count over the WHOLE set is unchanged at 71', { skip: SKIP_T },
  () => {
    const ws = WINDOWS();
    const pairs = (list) => {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          const [a, la] = list[i]; const [b, lb] = list[k];
          if (a < b + lb && b < a + la) n++;
        }
      }
      return n;
    };
    assert.equal(pairs(ws), 71, '71 overlapping pairs, the same number W393 counted');
    // W394 declares NO window, so "with and without mine" is the same set and the same 71. The
    // honest extra measurement is that the two windows this wave leans on are members that
    // overlap NOTHING -- dropping both leaves the count at 71, so neither is a duplicate of
    // another window that would have covered the reads anyway.
    assert.equal(pairs(ws.filter(([a]) => a !== 0x262240 && a !== 0x23d760)), 71,
      'dropping the two this wave depends on still leaves 71: neither overlaps anything');
    assert.equal(ws.filter(([a]) => a === 0x262240).length, 1, '$262240 is declared once');
    assert.equal(ws.filter(([a]) => a === 0x23d760).length, 1, '  ...and so is $23D760');
    // THE WAVE'S LEDGER, in one line: fourteen new registry rows, zero new windows, and not one
    // window base anywhere near the fourteen constructors.
    assert.equal(S2.length, 14, 'W394 added fourteen rows...');
    assert.equal(ws.filter(([a]) => S2.some((h) => a === h.ctor || a === h.upd)).length, 0,
      '  ...and declared no window at any of their addresses');
  });
