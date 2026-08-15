// W374 -- the two shared select-screen draws ported into src/objslot9.js this wave:
//
//   $25E6CE  a MIRROR PAIR, 70 bytes, no gates of its own
//   $25EF30  TWO MUTUALLY RECURSIVE HALVES, 228 bytes, gated on $813098 and on the OTHER record
//
// Everything here is driven, not merely compiled: each test runs the ported function against a real
// Ram and reads back the twelve-byte records the emitter stub actually wrote into bucket 0. Only
// D1 comes back lossy -- `$23EFC0` does `asr.l #6 / andi.l #$07FF03FF / ori.l #$80008000` before it
// stores -- so D1 is checked by packing the EXPECTED longword through the same arithmetic and
// comparing words, plus a separate decode of the masked field for the mirror. D2/D3/D4 are stored
// verbatim and are compared as-is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

// Bucket 0, the bucket `$23DFB4` resolves to. NOTE: `BUCKETS[i].counter` is the counter's ADDRESS.
// It is only ever READ here -- writing that field would rewrite the bucket descriptors and break
// `resolveEmitStub` for every other test in the process.
const BUF = 0x80397c;
const CTR = 0x80afc0;
const REC = 12;

async function fx() {
  const mod = await import('../src/objslot9.js');
  const s17 = await import('../src/objslot17.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const notes = [];
  const ctx = { unported: { note: (a) => notes.push(a) }, unportedLog: { note: () => {} },
    tx: new TxVram(), soundPost: () => {} };
  return { ...mod, SCREEN17: s17.SCREEN17, sideFromD7_25D4E4: s17.sideFromD7_25D4E4,
    ram: new Ram(), rom, ctx, notes };
}

/** The bucket-0 counter, in BYTES. Not a sprite tally. */
const bytesUsed = (ram) => ram.u16(CTR);

/** Decode the twelve-byte register-convention records written since byte offset `from`. */
function emitsSince(ram, from) {
  const out = [];
  for (let off = from; off < bytesUsed(ram); off += REC) {
    out.push({
      d1hi: ram.u16(BUF + off + 0),         // packed: $8000 | (D1 bits 22..32)
      d1lo: ram.u16(BUF + off + 2),         // packed: $8000 | (D1 bits 6..15)
      art: ((ram.u16(BUF + off + 4) << 16) | ram.u16(BUF + off + 6)) >>> 0,   // D2, verbatim
      attr: ram.u16(BUF + off + 8),         // D3, verbatim
      pal: ram.u16(BUF + off + 10),         // D4, verbatim
    });
  }
  return out;
}

/** `$23EFC0` verbatim: asr.l #6 / andi.l #$07FF03FF / ori.l #$80008000. */
function pack(d1) {
  const d0 = ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
  return { hi: (d0 >>> 16) & 0xffff, lo: d0 & 0xffff };
}

// A packed low word of exactly $8000 means D1's low word had NOTHING in bits 6..15 -- which is the
// assertion that dies if anyone reintroduces $38001C00 or $5B001C00 as a coordinate base ($1C00
// would land as $70 here, $3800 as $E0).
const LOW_WORD_ZERO = 0x8000;

// ---------------------------------------------------------------------------
// $25E6CE
// ---------------------------------------------------------------------------

test('W374 $25E6CE emits exactly two sprites and has NO gate of its own', { skip: SKIP },
  async () => {
    const { draw25E6CE, DRAW_25E6CE, SCREEN17, ram, rom, ctx } = await fx();
    const a6 = SCREEN17.recs;

    // No tst, no cmp, no branch anywhere in $25E6CE..$25E713: a zero offset field draws too.
    ram.setU16(a6 + DRAW_25E6CE.offA, 0);
    let before = bytesUsed(ram);
    draw25E6CE(ram, rom, ctx, a6);
    let delta = bytesUsed(ram) - before;
    assert.ok(delta > 0, 'with ($3E,A6) = 0 it still draws -- it has no gate');
    assert.equal(delta % 2, 0, `${delta} bytes is a whole multiple of the two emits`);
    assert.equal(emitsSince(ram, before).length, 2, 'exactly two sprites');

    // ...and a non-zero offset field draws the same two. Still no gate.
    ram.setU16(a6 + DRAW_25E6CE.offA, 0x0140);
    before = bytesUsed(ram);
    draw25E6CE(ram, rom, ctx, a6);
    delta = bytesUsed(ram) - before;
    assert.equal(delta % 2, 0, `${delta} bytes is a whole multiple of the two emits`);
    assert.equal(emitsSince(ram, before).length, 2, 'exactly two sprites again');
  });

test('W374 $25E6CE\'s mirror is real: the two D1 high words are f and -f', { skip: SKIP },
  async () => {
    const { draw25E6CE, DRAW_25E6CE, SCREEN17, ram, rom, ctx } = await fx();
    const a6 = SCREEN17.recs;
    const f = 0x0140;                    // a multiple of $40, so `asr.l #6` loses nothing of it
    ram.setU16(a6 + DRAW_25E6CE.offA, f);

    const before = bytesUsed(ram);
    draw25E6CE(ram, rom, ctx, a6);
    const [e1, e2] = emitsSince(ram, before);

    // Exact: the expected longwords, run through the stub's own packing.
    assert.deepEqual({ hi: e1.d1hi, lo: e1.d1lo }, pack((f << 16) >>> 0),
      'emit 1 D1 = f << 16');
    assert.deepEqual({ hi: e2.d1hi, lo: e2.d1lo }, pack((((-f) & 0xffff) << 16) >>> 0),
      'emit 2 D1 = (-f) << 16 -- the TWO sub.w at $25E700/$25E704, not one');

    // ...and the same claim read straight off the emitted data, with no reference to `pack`:
    // the surviving 11 bits of each high word sum to zero, which is what "f and -f" means here.
    const hi1 = e1.d1hi & 0x07ff;
    const hi2 = e2.d1hi & 0x07ff;
    assert.equal((hi1 + hi2) % 0x800, 0, `${hi1} and ${hi2} are negatives of each other`);
    assert.notEqual(hi1, hi2, 'and they are genuinely different, so the mirror moved something');

    // The second palette is the first with $6000 set -- BOTH flip bits, from one ori.w.
    assert.equal(e1.pal, DRAW_25E6CE.pal[0]);
    assert.equal(e2.pal, e1.pal | 0x6000, '$25E70A ori.w #$6000,D4');
    assert.equal(e2.pal, DRAW_25E6CE.pal[1]);
    // The redundant $25E6F8 reload puts the SAME art on both.
    assert.equal(e1.art, DRAW_25E6CE.art);
    assert.equal(e2.art, DRAW_25E6CE.art, '$25E6F8 move.l #$0019C068,D2, reloaded not inherited');
    assert.equal(e1.attr, DRAW_25E6CE.attr);
    assert.equal(e2.attr, DRAW_25E6CE.attr, 'D3 is never rewritten');
  });

test('W374 $25E6CE\'s #$38001C00 CANCELS: D1\'s low word is exactly zero', { skip: SKIP },
  async () => {
    const { draw25E6CE, DRAW_25E6CE, SCREEN17, ram, rom, ctx } = await fx();
    const a6 = SCREEN17.recs;
    // $3800 + $C800 and $1C00 + $E400 each wrap to $0000 exactly.
    assert.equal(((DRAW_25E6CE.base >>> 16) + 0xc800) & 0xffff, 0, '$3800 + $C800 -> $0000');
    assert.equal(((DRAW_25E6CE.base & 0xffff) + 0xe400) & 0xffff, 0, '$1C00 + $E400 -> $0000');

    for (const f of [0, 0x0140, 0xfe00]) {
      ram.setU16(a6 + DRAW_25E6CE.offA, f);
      const before = bytesUsed(ram);
      draw25E6CE(ram, rom, ctx, a6);
      for (const e of emitsSince(ram, before)) {
        assert.equal(e.d1lo, LOW_WORD_ZERO,
          `f=$${f.toString(16)}: D1 low word is $0000, NOT $3800/$1C00 carried through`);
      }
    }
  });

test('W374 $25E6CE is 70 bytes and ends at the jmp, not 342', { skip: SKIP }, async () => {
  const { DRAW_25E6CE, rom } = await fx();
  assert.equal(DRAW_25E6CE.end - DRAW_25E6CE.addr + 1, 70, 'the routine is 70 bytes');
  assert.equal(rom.u32(DRAW_25E6CE.addr), 0x223c3800, '$25E6CE move.l #$3800....,D1');
  assert.equal(rom.u16(DRAW_25E6CE.addr + 4), 0x1c00, '  ...$1C00');
  assert.equal(rom.u16(0x25e70e), 0x4ef9, '$25E70E is a jmp');
  assert.equal(rom.u32(0x25e710), DRAW_25E6CE.stub, '  ...to $23DFB4, the tail emit');
  // Two sub.w ($3E,A6),D1 in a row -- $926E $003E twice.
  assert.equal(rom.u32(0x25e700), 0x926e003e, '$25E700 sub.w ($3E,A6),D1');
  assert.equal(rom.u32(0x25e704), 0x926e003e, '$25E704 sub.w ($3E,A6),D1 -- AGAIN');
});

// ---------------------------------------------------------------------------
// $25EF30
// ---------------------------------------------------------------------------

const A6_REC0 = 0x812ea0;                 // SCREEN17.recs
const A6_REC1 = 0x812ea0 + 0x70;          // so that a6 - $70 is a valid address

test('W374 $25EF30 draws nothing while $813098 is non-zero, for BOTH halves', { skip: SKIP },
  async () => {
    const { draw25EF30, DRAW_25EF30, ram, rom, ctx } = await fx();
    ram.setU8(A6_REC0, 0);
    ram.setU8(A6_REC1, 0);                // both records empty, so both halves WOULD run

    ram.setU16(DRAW_25EF30.loopCounter, 1);
    let before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, A6_REC0, 1);
    assert.equal(bytesUsed(ram), before, 'd7 != 0: a non-zero $813098 silences body A and the bsr');
    before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, A6_REC1, 0);
    assert.equal(bytesUsed(ram), before, 'd7 == 0: and body B, and its bsr');

    // The gate is tested INSIDE each half, so clearing it opens both at once.
    ram.setU16(DRAW_25EF30.loopCounter, 0);
    before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, A6_REC0, 1);
    const delta = bytesUsed(ram) - before;
    assert.ok(delta > 0, 'a zero $813098 draws');
    assert.equal(delta / REC, 4, 'both halves, two emits each');
  });

test('W374 $25EF30 reads the OTHER record, and D7 picks which one', { skip: SKIP }, async () => {
  const { draw25EF30, DRAW_25EF30, ram, rom, ctx } = await fx();
  ram.setU16(DRAW_25EF30.loopCounter, 0);
  const run = (a6, d7) => {
    const before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, a6, d7);
    return emitsSince(ram, before);
  };

  // d7 != 0 -> A1 = a6 + $70. Occupy THAT one and only body A runs.
  ram.setU8(A6_REC0 + 0x70, 1);
  ram.setU8(A6_REC0 - 0x70, 0);
  let e = run(A6_REC0, 1);
  assert.equal(e.length, 2, 'd7 != 0, other record OCCUPIED: exactly one half');
  assert.equal(e[0].art, DRAW_25EF30.a1.art, '  ...and it is body A');
  assert.equal(e[1].art, DRAW_25EF30.a2.art);

  // Flip which neighbour is occupied. If d7 != 0 really read a6 + $70, this is now EMPTY and both
  // halves run; if the port had read a6 - $70 instead, this case would show one half.
  ram.setU8(A6_REC0 + 0x70, 0);
  ram.setU8(A6_REC0 - 0x70, 1);
  e = run(A6_REC0, 1);
  assert.equal(e.length, 4, 'd7 != 0 reads a6 + $70, NOT a6 - $70');
  // The bsr precedes the fall-through, so the OTHER half runs first: B1, B2, then A1, A2.
  assert.deepEqual(e.map((x) => x.art),
    [DRAW_25EF30.b1.art, DRAW_25EF30.b2.art, DRAW_25EF30.a1.art, DRAW_25EF30.a2.art],
    'body B runs FIRST, then body A falls through into its own gate');

  // d7 == 0 -> A1 = a6 - $70, and A6_REC1 - $70 is A6_REC0.
  ram.setU8(A6_REC1 - 0x70, 1);
  ram.setU8(A6_REC1 + 0x70, 0);
  e = run(A6_REC1, 0);
  assert.equal(e.length, 2, 'd7 == 0, other record OCCUPIED: exactly one half');
  assert.equal(e[0].art, DRAW_25EF30.b1.art, '  ...and it is body B');
  assert.equal(e[1].art, DRAW_25EF30.b2.art);

  ram.setU8(A6_REC1 - 0x70, 0);
  ram.setU8(A6_REC1 + 0x70, 1);
  e = run(A6_REC1, 0);
  assert.equal(e.length, 4, 'd7 == 0 reads a6 - $70, NOT a6 + $70');
  assert.deepEqual(e.map((x) => x.art),
    [DRAW_25EF30.a1.art, DRAW_25EF30.a2.art, DRAW_25EF30.b1.art, DRAW_25EF30.b2.art],
    'body A runs FIRST from $25EFAC bsr $25EF46, then body B');
});

test('W374 $25EF30 terminates: the bsr targets are the GATES, past the tst.b', { skip: SKIP },
  async () => {
    const { draw25EF30, DRAW_25EF30, ram, rom, ctx } = await fx();
    // Both neighbours empty for BOTH call shapes -- the arrangement that would recurse forever if
    // either bsr landed on a body head instead of on its gate.
    ram.setU16(DRAW_25EF30.loopCounter, 0);
    ram.setU8(A6_REC0 - 0x70, 0);
    ram.setU8(A6_REC0 + 0x70, 0);
    let before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, A6_REC0, 1);
    assert.equal((bytesUsed(ram) - before) / REC, 4, 'four emits, not eight and not a stack blowup');

    ram.setU8(A6_REC1 - 0x70, 0);
    ram.setU8(A6_REC1 + 0x70, 0);
    before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, A6_REC1, 0);
    assert.equal((bytesUsed(ram) - before) / REC, 4, 'and the same from the other side');

    // The ROM's own proof: both bsr displacements land on the tst.w, not on the tst.b.
    assert.equal(rom.u16(0x25ef44), 0x6168, '$25EF44 bsr +$68');
    assert.equal(0x25ef46 + 0x68, DRAW_25EF30.gateB, '  ...-> $25EFAE, body B\'s GATE');
    assert.equal(rom.u16(0x25efac), 0x6198, '$25EFAC bsr -$68');
    assert.equal(0x25efae - 0x68, DRAW_25EF30.gateA, '  ...-> $25EF46, body A\'s GATE');
    assert.equal(rom.u16(DRAW_25EF30.gateA), 0x4a79, '$25EF46 tst.w <abs>');
    assert.equal(rom.u32(DRAW_25EF30.gateA + 2), DRAW_25EF30.loopCounter, '  ...$813098');
    assert.equal(rom.u16(DRAW_25EF30.gateB), 0x4a79, '$25EFAE tst.w <abs>');
    assert.equal(rom.u32(DRAW_25EF30.gateB + 2), DRAW_25EF30.loopCounter, '  ...$813098');
    // ...and the bodies proper open with the tst.b (A1) that the bsrs skip.
    assert.equal(rom.u16(DRAW_25EF30.bodyA), 0x4a11, '$25EF40 tst.b (A1)');
    assert.equal(rom.u16(DRAW_25EF30.bodyB), 0x4a11, '$25EFA8 tst.b (A1)');
  });

test('W374 $25EF30\'s ori.w #$0060 applies to emit B1 ONLY', { skip: SKIP }, async () => {
  const { draw25EF30, DRAW_25EF30, ram, rom, ctx } = await fx();
  ram.setU16(DRAW_25EF30.loopCounter, 0);
  ram.setU8(A6_REC1 - 0x70, 1);                    // other record occupied: body B alone
  const before = bytesUsed(ram);
  draw25EF30(ram, rom, ctx, A6_REC1, 0);
  const [b1, b2] = emitsSince(ram, before);

  assert.equal(b1.pal, 0x0076, 'B1 = $0016 | $0060, from $25EFDC');
  assert.equal(b2.pal, 0x0016, 'B2 = $0016 -- $25F006 is a FULL WORD write, the ori is GONE');
  assert.equal(b1.pal, DRAW_25EF30.b1.pal);
  assert.equal(b2.pal, DRAW_25EF30.b2.pal);
  // Same art on B1 as on A1, but B2's art is its own.
  assert.equal(b1.art, DRAW_25EF30.a1.art, 'B1 shares A1\'s art $001A0630');
  assert.notEqual(b2.art, DRAW_25EF30.a2.art, 'B2\'s art $001A1118 differs from A2\'s $001A0FD4');
  assert.equal(b2.art, 0x001a1118);
  assert.equal(b1.attr, 0x16e0);
  assert.equal(b2.attr, 0x0a40);
});

test('W374 $25EF30\'s first emit of each half has a D1 LOW WORD of exactly zero', { skip: SKIP },
  async () => {
    const { draw25EF30, DRAW_25EF30, ram, rom, ctx } = await fx();
    ram.setU16(DRAW_25EF30.loopCounter, 0);
    // $5B00 + $EA00 -> $4500 and $1540 + $EA00 -> $FF40; both low halves $1C00 + $E400 -> $0000.
    assert.equal((0x5b00 + 0xea00) & 0xffff, DRAW_25EF30.a1.base, 'A1 base resolves to $4500');
    assert.equal((0x1540 + 0xea00) & 0xffff, DRAW_25EF30.b1.base, 'B1 base resolves to $FF40');
    assert.equal((0x1c00 + 0xe400) & 0xffff, 0, 'and the low half cancels to $0000');

    ram.setU8(A6_REC0 + 0x70, 0);                  // both halves
    ram.setU16(A6_REC0 + DRAW_25EF30.off36, 0x0200);
    ram.setU16(A6_REC0 + DRAW_25EF30.off38, 0x0180);
    const before = bytesUsed(ram);
    draw25EF30(ram, rom, ctx, A6_REC0, 1);
    const [b1, b2, a1, a2] = emitsSince(ram, before);

    assert.equal(b1.d1lo, LOW_WORD_ZERO, 'B1: NOT $5B001C00 carried through');
    assert.equal(a1.d1lo, LOW_WORD_ZERO, 'A1: NOT $5B001C00 carried through');

    // And the full resolved longwords, packed the way the stub packs them.
    const m36 = 0x0200;
    const m38 = 0x0180;
    assert.deepEqual({ hi: a1.d1hi, lo: a1.d1lo },
      pack(((0x4500 + m36) & 0xffff) << 16 >>> 0), 'A1 D1 = ($4500 + m36) << 16');
    assert.deepEqual({ hi: a2.d1hi, lo: a2.d1lo },
      pack(((0x35c0 << 16) | ((0x2800 + m38) & 0xffff)) >>> 0), 'A2 D1 = $35C0 : $2800 + m38');
    assert.deepEqual({ hi: b1.d1hi, lo: b1.d1lo },
      pack(((0xff40 - m36) & 0xffff) << 16 >>> 0), 'B1 D1 = ($FF40 - m36) << 16, SUB not ADD');
    assert.deepEqual({ hi: b2.d1hi, lo: b2.d1lo },
      pack(((0x2600 << 16) | ((0 - m38) & 0xffff)) >>> 0), 'B2 D1 = $2600 : -m38, SUB not ADD');
  });

test('W374 $25EF30 writes NOTHING to RAM itself', { skip: SKIP }, async () => {
  const { draw25EF30, DRAW_25EF30, ram, rom, ctx } = await fx();
  ram.setU16(DRAW_25EF30.loopCounter, 0);
  ram.setU8(A6_REC0 + 0x70, 0);
  ram.setU16(A6_REC0 + DRAW_25EF30.off36, 0x0123);
  ram.setU16(A6_REC0 + DRAW_25EF30.off38, 0x0456);
  // Snapshot the two records and the counter word; only the sprite bucket may move.
  const snap = [];
  for (let a = A6_REC0 - 0x70; a < A6_REC0 + 0xe0; a++) snap.push(ram.u8(a));
  draw25EF30(ram, rom, ctx, A6_REC0, 1);
  for (let i = 0; i < snap.length; i++) {
    assert.equal(ram.u8(A6_REC0 - 0x70 + i), snap[i],
      `$${(A6_REC0 - 0x70 + i).toString(16)} is unchanged`);
  }
  assert.equal(ram.u16(DRAW_25EF30.loopCounter), 0, '$813098 is read, never written');
});

test('W374 both draws go through $23DFB4, which resolves to bucket 0 register convention',
  { skip: SKIP }, async () => {
    const { DRAW_25E6CE, DRAW_25EF30, rom } = await fx();
    const { resolveEmitStub, BUCKETS } = await import('../src/spritequeue.js');
    assert.equal(DRAW_25E6CE.stub, 0x23dfb4);
    assert.equal(DRAW_25EF30.stub, 0x23dfb4);
    const r = resolveEmitStub(rom, 0x23dfb4);
    assert.deepEqual(r, { bucket: 0, conv: 'register' });
    // Read, never write: BUCKETS[i].counter is the counter's ADDRESS.
    assert.equal(BUCKETS[r.bucket].buffer, BUF);
    assert.equal(BUCKETS[r.bucket].counter, CTR);
  });

// ---------------------------------------------------------------------------
// $25EDF8. W374 first recorded its body as UNREACHABLE and WITHDREW that claim: the state write
// it depended on is skipped by $25D244 beq.w $25D254, so a non-confirm frame reaches this with
// ($1,A6) still 4. These tests pin the FUNCTION's gate, which is correct either way.
//
// `$25EE28 cmpi.b #$4,($1,A6) / bne $25EF2E` gates everything, and both callers write ($1,A6)
// immediately before the jsr: `$25D24E move.b #$2` .. `$25D27E jsr`, and `$25D49A move.b #$5` ..
// `$25D4CE jsr`. The body is ported in full anyway, and pinned here, so that a later change which
// makes it live is a deliberate, visible act rather than an accident.
// ---------------------------------------------------------------------------

/** Put a record into a known state. Only the fields $25EDF8 reads are touched. */
function arm25EDF8(ram, D, a6, { state = 4, cursor = 0, phase = 0, anim = 0, timer = 0x50,
  moved = 0, frame = 0, mirror2 = 0 } = {}) {
  ram.setU8(a6 + D.gateAt, state);
  ram.setU16(a6 + D.cursorAt, cursor);
  ram.setU16(a6 + D.phaseAt, phase);
  ram.setU16(a6 + D.animAt, anim);
  ram.setU16(a6 + D.timerAt, timer);
  ram.setU16(a6 + D.movedAt, moved);
  ram.setU16(D.frameCounter, frame);
  ram.setU16(D.mirror2, mirror2);
}

test('W374 $25EDF8 gates on state 4: states 2 and 5 emit NOTHING, state 4 runs',
  { skip: SKIP }, async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;

    // $25D24E move.b #$2,($1,A6) then $25D27E jsr $25EDF8.
    arm25EDF8(ram, D, a6, { state: 2 });
    let before = bytesUsed(ram);
    draw25EDF8(ram, rom, ctx, a6, 1);
    assert.equal(bytesUsed(ram), before, 'state 2 -- what $25D24E writes -- is an immediate rts');

    // $25D49A move.b #$5,($1,A6) then $25D4CE jsr $25EDF8.
    arm25EDF8(ram, D, a6, { state: 5 });
    before = bytesUsed(ram);
    draw25EDF8(ram, rom, ctx, a6, 1);
    assert.equal(bytesUsed(ram), before, 'state 5 -- what $25D49A writes -- is an immediate rts');

    // ...and every other byte value is dead too, 4 excepted.
    for (const st of [0, 1, 3, 6, 7, 0xff]) {
      arm25EDF8(ram, D, a6, { state: st });
      before = bytesUsed(ram);
      draw25EDF8(ram, rom, ctx, a6, 1);
      assert.equal(bytesUsed(ram), before, `state ${st} is an immediate rts as well`);
    }

    // FORCED to 4 the body runs. Nothing in the shipped cartridge can do this.
    arm25EDF8(ram, D, a6, { state: 4 });
    before = bytesUsed(ram);
    draw25EDF8(ram, rom, ctx, a6, 1);
    const delta = bytesUsed(ram) - before;
    assert.ok(delta > 0, 'state 4 draws -- the body is real, it is simply never entered');
    assert.equal(delta % REC, 0, `${delta} bytes is a whole multiple of ${REC}`);
  });

test('W374 $25EDF8 gate operand order and BOTH callers, proved from the ROM',
  { skip: SKIP }, async () => {
    const { DRAW_25EDF8: D, rom } = await fx();
    // $25EE28 cmpi.b #$4,($1,A6): opcode $0C2E, IMMEDIATE word $0004, THEN displacement $0001.
    assert.equal(rom.u16(0x25ee28), 0x0c2e, '$25EE28 cmpi.b #<imm>,(d16,A6)');
    assert.equal(rom.u16(0x25ee2a), D.gateValue, '  ...immediate $0004 comes FIRST');
    assert.equal(rom.u16(0x25ee2c), D.gateAt, '  ...displacement $0001 comes SECOND');
    assert.equal(rom.u16(0x25ee2e), 0x6600, '$25EE2E bne.w');
    assert.equal(0x25ee30 + rom.u16(0x25ee30), D.exit, '  ...-> $25EF2E, the rts');
    assert.equal(rom.u16(D.exit), 0x4e75, '$25EF2E rts');

    // The two callers, and there are only two: `move.b #$N,($1,A6)` = $1D7C 00NN 0001.
    assert.equal(rom.u32(0x25d24e), 0x1d7c0002, '$25D24E move.b #$2,...');
    assert.equal(rom.u16(0x25d252), 0x0001, '  ...($1,A6)');
    assert.equal(rom.u16(0x25d27e), 0x4eb9, '$25D27E jsr');
    assert.equal(rom.u32(0x25d280), D.addr, '  ...$25EDF8, in state 2');
    assert.equal(rom.u32(0x25d49a), 0x1d7c0005, '$25D49A move.b #$5,...');
    assert.equal(rom.u16(0x25d49e), 0x0001, '  ...($1,A6)');
    assert.equal(rom.u16(0x25d4ce), 0x4eb9, '$25D4CE jsr');
    assert.equal(rom.u32(0x25d4d0), D.addr, '  ...$25EDF8, in state 5');
  });

test('W374 $25EDF8 side select: D7 == 0 KEEPS the fall-through set, and $25D4E4 INVERTS',
  { skip: SKIP }, async () => {
    const { draw25EDF8, DRAW_25EDF8: D, sideFromD7_25D4E4, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    // The mapping the whole test rests on.
    assert.equal(sideFromD7_25D4E4(0), 1, 'D7 == 0 is SIDE 1');
    assert.notEqual(sideFromD7_25D4E4(1), 1, 'D7 != 0 is SIDE 0');
    assert.deepEqual(D.tables[1], { a0: 0x25edf4, a1: 0x25ede4, a2: 0x25ece4, a3: 0x25eb94 });
    assert.deepEqual(D.tables[0], { a0: 0x25edf0, a1: 0x25edd8, a2: 0x25ecd8, a3: 0x25eb64 });

    const run = (d7) => {
      arm25EDF8(ram, D, a6, { state: 4, cursor: 0, phase: 0, anim: 0, mirror2: 1 });
      const before = bytesUsed(ram);
      draw25EDF8(ram, rom, ctx, a6, d7);
      return emitsSince(ram, before);
    };

    // D7 == 0 -> the FALL-THROUGH set: A3 = $25EB94 -> $25EBA0 -> $25EC1E, D1 = $314110C0;
    // A1 = $25EDE4 -> $001978C4; A0 = $25EDF4 -> $1E00/$1E00 -> $04000400;
    // A2 = $25ECE4 -> $25ED24, whose one record is D1 = $15411980.
    let e = run(0);
    assert.deepEqual({ hi: e[0].d1hi, lo: e[0].d1lo }, pack(0x314110c0),
      'D7 == 0 takes $25EB94, NOT $25EB64');
    assert.equal(e[1].art, 0x001978c4, 'D7 == 0 takes A1 = $25EDE4, NOT $25EDD8');
    assert.deepEqual({ hi: e[1].d1hi, lo: e[1].d1lo }, pack(0x04000400),
      'D7 == 0 takes A0 = $25EDF4 ($1E00/$1E00), NOT $25EDF0');
    assert.deepEqual({ hi: e[2].d1hi, lo: e[2].d1lo }, pack(0x15411980),
      'D7 == 0 takes A2 = $25ECE4, NOT $25ECD8');

    // D7 != 0 -> the OVERRIDE set: A3 = $25EB64 -> $25EB70 -> $25EBC4, D1 = $3A8105C0;
    // A1 = $25EDD8 -> $001955FC; A0 = $25EDF0 -> $5200/$1A00 -> $38000000;
    // A2 = $25ECD8 -> $25ECF0, whose one record is D1 = $47810E40.
    e = run(1);
    assert.deepEqual({ hi: e[0].d1hi, lo: e[0].d1lo }, pack(0x3a8105c0),
      'D7 != 0 takes $25EB64');
    assert.equal(e[1].art, 0x001955fc, 'D7 != 0 takes A1 = $25EDD8');
    assert.deepEqual({ hi: e[1].d1hi, lo: e[1].d1lo }, pack(0x38000000),
      'D7 != 0 takes A0 = $25EDF0 ($5200/$1A00)');
    assert.deepEqual({ hi: e[2].d1hi, lo: e[2].d1lo }, pack(0x47810e40),
      'D7 != 0 takes A2 = $25ECD8');

    // $25EE08 is a `tst.w`, so a wide D7 whose LOW word is zero must still read as side 1.
    e = run(0x10000);
    assert.deepEqual({ hi: e[0].d1hi, lo: e[0].d1lo }, pack(0x314110c0),
      '$25EE08 tst.w -- only D7 low word is tested');

    // The ROM own proof of the branch sense and of all eight lea displacements.
    assert.equal(rom.u16(0x25ee08), 0x4a47, '$25EE08 tst.w D7');
    assert.equal(rom.u16(0x25ee0a), 0x6710, '$25EE0A beq.s +$10 -- taken on D7 == 0');
    assert.equal(0x25ee0c + 0x10, 0x25ee1c, '  ...which SKIPS the override block');
    for (const [ext, want] of [[0x25edfa, 0x25edf4], [0x25edfe, 0x25ede4], [0x25ee02, 0x25ece4],
      [0x25ee06, 0x25eb94], [0x25ee0e, 0x25edf0], [0x25ee12, 0x25edd8], [0x25ee16, 0x25ecd8],
      [0x25ee1a, 0x25eb64]]) {
      const disp = (rom.u16(ext) ^ 0x8000) - 0x8000;             // the extension word is SIGNED
      assert.equal(ext + disp, want, `lea ext@$${ext.toString(16)} resolves to $${
        want.toString(16).toUpperCase()}`);
    }
  });

test('W374 $25EDF8 runs all three phase arms, and ONLY arm 1 takes its art from a frame table',
  { skip: SKIP }, async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    // anim on, timer well away from 0 so the phase does not advance under us.
    const run = (phase, cursor) => {
      arm25EDF8(ram, D, a6, { state: 4, cursor, phase, anim: 1, timer: 0x50, mirror2: 0 });
      const before = bytesUsed(ram);
      draw25EDF8(ram, rom, ctx, a6, 1);                     // side 0
      assert.equal(ram.u16(a6 + D.phaseAt), phase, 'the phase did not move');
      return emitsSince(ram, before);
    };

    // The jump table is indexed by BYTES: ($5C,A6) = 0, 4, 8 -> $25EE86, $25EE8A, $25EE8E.
    assert.deepEqual(D.arms, [0x25ee86, 0x25ee8a, 0x25ee8e]);
    for (const [i, at] of D.arms.entries()) {
      assert.equal(rom.u16(at), 0x6000, `$${at.toString(16).toUpperCase()} bra.w`);
      assert.equal(at + 2 + rom.u16(at + 2), D.armTargets[i], `  ...-> $${
        D.armTargets[i].toString(16).toUpperCase()}`);
    }

    // Arm 0, cursor 1, side 0: leaf $25EBCE -> art $0019B694 STRAIGHT off the leaf.
    let e = run(0, 1);
    assert.equal(e[0].art, 0x0019b694, 'arm 0 art comes straight from the leaf');
    assert.equal(e[0].attr, 0x0288, 'every leaf attr is $0288');

    // Arm 1, cursor 1, side 0: leaf $25EBEC third longword is $0025EC98, a FRAME TABLE, and the
    // art is a longword READ OUT OF IT -- $0019B720, never the table address itself.
    e = run(4, 1);
    assert.equal(rom.u32(0x25ebec + 6), 0x0025ec98, 'the leaf holds a POINTER, not art');
    assert.notEqual(e[0].art, 0x0025ec98, 'arm 1 does NOT emit the frame table address');
    assert.equal(e[0].art, 0x0019b720, 'arm 1 dereferences the frame table');
    assert.equal(e[0].art, rom.u32(0x25ec98), '  ...at index 0, with $80390A = 0');

    // Arm 2, cursor 1, side 0: leaf $25EC0A -> art $0019B7AC STRAIGHT off the leaf, and it is a
    // DIFFERENT sprite from arm 0, so the two byte-identical arms really do select differently.
    e = run(8, 1);
    assert.equal(e[0].art, 0x0019b7ac, 'arm 2 art comes straight from the leaf');
    assert.notEqual(e[0].art, 0x0019b694, 'and arm 2 is not arm 0');
  });

test('W374 $25EDF8 masks the frame index to EIGHT entries: (counter & $E) * 2', { skip: SKIP },
  async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(D.frameMask, 0x0e);
    // The record loop frame table for side 0 / cursor 0 is $25ED58 -- eight DISTINCT longwords.
    const table = 0x25ed58;
    const distinctInRom = new Set();
    for (let i = 0; i < 8; i++) distinctInRom.add(rom.u32(table + i * 4));
    assert.equal(distinctInRom.size, 8, '$25ED58 is a genuine 8-frame animation');

    const seen = new Set();
    for (let f = 0; f < 40; f++) {                       // a range far wider than 8
      arm25EDF8(ram, D, a6, { state: 4, cursor: 0, phase: 0, anim: 0, frame: f, mirror2: 0 });
      const before = bytesUsed(ram);
      draw25EDF8(ram, rom, ctx, a6, 1);
      const e = emitsSince(ram, before);
      assert.equal(e.length, 2, 'emit 1 plus the single record');
      // $25EF12 moveq #$E / and.w $80390A / add.w -> byte offsets 0, 4, .., 28.
      assert.equal(e[1].art, rom.u32(table + ((f & 0x0e) * 2)),
        `frame ${f}: index is (counter & $E) * 2 = ${(f & 0x0e) * 2}`);
      seen.add(e[1].art);
    }
    assert.equal(seen.size, 8, '40 counter values produce exactly EIGHT distinct arts');
    // The mask is $E, not $F: odd counters reuse the even frame below them.
    assert.equal((7 & 0x0e) * 2, (6 & 0x0e) * 2, 'counters 6 and 7 select the same frame');
  });

test('W374 $25EDF8 ($2A,A6) period is 181 decrements, not 180 -- the bcc reloads on the BORROW',
  { skip: SKIP }, async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(D.timerReload, 0xb4);
    assert.equal(D.timerPeriod, 181, '$B4 + 1');
    assert.equal(rom.u16(0x25ee5e), 0x6416, '$25EE5E bcc.s -- branch on NO BORROW, so 0 reloads');

    // mirror2 = 0 keeps this to two emits a call, well inside bucket 0 502 records.
    arm25EDF8(ram, D, a6,
      { state: 4, cursor: 0, phase: 0, anim: 1, timer: D.timerReload, moved: 0, mirror2: 0 });
    for (let i = 1; i <= 180; i++) {
      draw25EDF8(ram, rom, ctx, a6, 1);
      assert.equal(ram.u16(a6 + D.phaseAt), 0, `call ${i}: the phase has NOT advanced yet`);
      assert.equal(ram.u16(a6 + D.timerAt), D.timerReload - i, `call ${i}: ($2A,A6) counts down`);
    }
    assert.equal(ram.u16(a6 + D.timerAt), 0, 'after 180 calls ($2A,A6) is 0, and 0 is not a reload');
    draw25EDF8(ram, rom, ctx, a6, 1);                       // call 181 -- the BORROW
    assert.equal(ram.u16(a6 + D.phaseAt), 4, 'the 181st call advances the phase, not the 180th');
    assert.equal(ram.u16(a6 + D.timerAt), D.timerReload, 'and reloads $B4');

    // The wrap: 0 -> 4 -> 8 -> 0, via cmpi.w #$C.
    for (const want of [8, 0, 4]) {
      for (let i = 0; i < D.timerPeriod; i++) draw25EDF8(ram, rom, ctx, a6, 1);
      assert.equal(ram.u16(a6 + D.phaseAt), want, `$25EE6A cmpi.w #$C wraps to ${want}`);
    }

    // ($2C,A6) zero forces arm 0 with D1 = 0 and touches NEITHER the timer nor the phase.
    ram.setU16(a6 + D.animAt, 0);
    ram.setU16(a6 + D.timerAt, 1);
    ram.setU16(a6 + D.phaseAt, 8);
    draw25EDF8(ram, rom, ctx, a6, 1);
    assert.equal(ram.u16(a6 + D.timerAt), 1, '$25EE58 beq skips the subq entirely');
    assert.equal(ram.u16(a6 + D.phaseAt), 8, '  ...and the phase field is left alone');

    // ($28,A6) non-zero is CONSUMED and forces the timer and the phase.
    ram.setU16(a6 + D.movedAt, 1);
    ram.setU16(a6 + D.timerAt, 3);
    ram.setU16(a6 + D.phaseAt, 8);
    draw25EDF8(ram, rom, ctx, a6, 1);
    assert.equal(ram.u16(a6 + D.movedAt), 0, '$25EE38 clr.w ($28,A6)');
    assert.equal(ram.u16(a6 + D.timerAt), D.timerReload, '$25EE3C move.w #$B4,($2A,A6)');
    assert.equal(ram.u16(a6 + D.phaseAt), 4, '$25EE42 move.w #$4,($5C,A6)');
  });

test('W374 $25EDF8 record loop stops at the ZERO longword and never emits it', { skip: SKIP },
  async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    // Side 0 three lists: $25ECF0 (one record), $25ECFE (one), $25ED0C (TWO).
    assert.equal(rom.u32(0x25ecd8 + 8), 0x0025ed0c, 'cursor 2 -> $25ED0C');
    assert.equal(rom.u32(0x25ecf0 + 10), 0, '$25ECF0 terminates after one 10-byte record');
    assert.equal(rom.u32(0x25ed0c + 10), 0x45c11940, '$25ED0C has a SECOND record, not a terminator');
    assert.equal(rom.u32(0x25ed0c + 20), 0, '  ...and terminates after it');

    const count = (cursor) => {
      arm25EDF8(ram, D, a6, { state: 4, cursor, phase: 0, anim: 0, mirror2: 0 });
      const before = bytesUsed(ram);
      draw25EDF8(ram, rom, ctx, a6, 1);
      const delta = bytesUsed(ram) - before;
      assert.equal(delta % REC, 0, `${delta} bytes is a whole multiple of ${REC}`);
      return emitsSince(ram, before);
    };

    assert.equal(count(0).length, 2, 'cursor 0: emit 1 plus ONE record');
    assert.equal(count(1).length, 2, 'cursor 1: emit 1 plus ONE record');
    const two = count(2);
    assert.equal(two.length, 3, 'cursor 2: emit 1 plus TWO records -- one more, not one less');
    // The two records are distinct, and neither is the $00000000 terminator read as a sprite.
    assert.deepEqual({ hi: two[1].d1hi, lo: two[1].d1lo }, pack(0x44410440), 'record 1 D1');
    assert.deepEqual({ hi: two[2].d1hi, lo: two[2].d1lo }, pack(0x45c11940), 'record 2 D1');
    assert.equal(two[1].attr, 0x0c40);
    assert.equal(two[2].attr, 0x0c30);
    for (const e of two) {
      assert.notEqual(e.art, 0, 'no emit carries the terminator zero art');
      assert.equal(e.pal, D.pal, 'D4 is $12 at all three emit sites');
    }
    // $25EF2A move.l (A2)+,D1 / $25EF2C bne.s $25EF0E -- back to the loop TOP, not to the entry.
    assert.equal(rom.u16(0x25ef2a), 0x221a, '$25EF2A move.l (A2)+,D1');
    assert.equal(rom.u16(0x25ef2c), 0x66e0, '$25EF2C bne.s -$20');
    assert.equal(0x25ef2e - 0x20, 0x25ef0e, '  ...-> $25EF0E, ONE instruction below the entry');
  });

test('W374 $25EDF8: $80390C gates emit 2 entirely, and its art is A1 by cursor', { skip: SKIP },
  async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(D.mirror2, 0x80390c);
    assert.equal(rom.u16(0x25eedc), 0x4a79, '$25EEDC tst.w <abs>');
    assert.equal(rom.u32(0x25eede), D.mirror2, '  ...$80390C');
    assert.equal(rom.u16(0x25eee2), 0x6728, '$25EEE2 beq.s +$28');
    assert.equal(0x25eee4 + 0x28, 0x25ef0c, '  ...-> $25EF0C, past emit 2 entirely');
    // (A0)+ THEN (A0): exactly two words, which is what bounds the coordinate table at two.
    assert.equal(rom.u16(0x25eee4), 0x3218, '$25EEE4 move.w (A0)+,D1');
    assert.equal(rom.u16(0x25eeec), 0x3210, '$25EEEC move.w (A0),D1 -- NOT (A0)+');

    const run = (cursor, mirror2) => {
      arm25EDF8(ram, D, a6, { state: 4, cursor, phase: 0, anim: 0, mirror2 });
      const before = bytesUsed(ram);
      draw25EDF8(ram, rom, ctx, a6, 1);                        // side 0
      return emitsSince(ram, before);
    };

    // Cursor 0 list holds one record, so off = 2 emits and on = 3: EXACTLY one emit either way.
    assert.equal(run(0, 0).length, 2, '$80390C == 0 suppresses emit 2');
    const e = run(0, 1);
    assert.equal(e.length, 3, '$80390C != 0 adds exactly one emit back');
    assert.equal(e[1].art, 0x001955fc, 'emit 2 art = A1[$25EDD8] + cursor 0 * 4');
    assert.equal(e[1].attr, 0x1ad0, '$25EEFE move.w #$1AD0,D3 -- emit 2 only');
    assert.equal(e[1].pal, D.pal);
    assert.notEqual(e[0].attr, 0x1ad0, 'emit 1 keeps the leaf attr $0288');

    // ...and the art really does follow the cursor, which is what makes the $25EEF2 recompute
    // observable at all: $23DFB4 clobbers D0, so a port that trusted the old D0 would still pass
    // for cursor 0 and fail here.
    assert.equal(run(1, 1)[1].art, 0x001948f0, 'cursor 1 -> $001948F0');
    assert.equal(run(2, 1)[1].art, 0x00193dc8, 'cursor 2 -> $00193DC8');
    assert.equal(rom.u32(0x25edd8), 0x001955fc);
    assert.equal(rom.u32(0x25edd8 + 4), 0x001948f0);
    assert.equal(rom.u32(0x25edd8 + 8), 0x00193dc8);
  });

test('W374 $25EDF8 660-byte data block tiles $25EB64..$25EDF7 exactly', { skip: SKIP },
  async () => {
    const { DRAW_25EDF8: D, rom } = await fx();
    assert.equal(D.dataTo - D.dataFrom + 1, 660, 'the block is 660 bytes');
    assert.equal(rom.u16(D.dataFrom - 2), 0x4e75, '$25EB62 rts bounds it below');
    assert.equal(rom.u16(D.dataTo + 1), 0x41fa, '$25EDF8 lea (d16,PC),A0 bounds it above');

    // Every extent, in order, with no gaps and no overlaps.
    const spans = [
      [0x25eb64, 12, 'A3 outer, side 0'], [0x25eb70, 36, 'A3 inner x3, side 0'],
      [0x25eb94, 12, 'A3 outer, side 1'], [0x25eba0, 36, 'A3 inner x3, side 1'],
      [0x25ebc4, 180, '18 leaves x 10 bytes'],
      [0x25ec78, 96, '3 static frame tables x 32'],
      [0x25ecd8, 12, 'A2 table, side 0'], [0x25ece4, 12, 'A2 table, side 1'],
      [0x25ecf0, 104, '6 record lists, $25ECF0..$25ED57'],
      [0x25ed58, 128, '4 animated frame tables x 32'],
      [0x25edd8, 12, 'A1 art, side 0'], [0x25ede4, 12, 'A1 art, side 1'],
      [0x25edf0, 4, 'A0 coords, side 0'], [0x25edf4, 4, 'A0 coords, side 1'],
    ];
    let at = D.dataFrom;
    for (const [from, len, what] of spans) {
      assert.equal(from, at, `${what} starts where the previous span ended`);
      at = from + len;
    }
    assert.equal(at, D.dataTo + 1, 'the spans reach exactly the routine first opcode');

    // Every leaf attr is $0288, and each leaf is 10 bytes.
    for (let a = 0x25ebc4; a < 0x25ec78; a += 10) {
      assert.equal(rom.u16(a + 4), 0x0288, `$${a.toString(16).toUpperCase()} attr is $0288`);
    }
    // The three "static" frame tables are one pointer repeated eight times.
    for (const t of [0x25ec78, 0x25ec98, 0x25ecb8]) {
      for (let i = 1; i < 8; i++) {
        assert.equal(rom.u32(t + i * 4), rom.u32(t), `$${t.toString(16).toUpperCase()} is static`);
      }
    }
    // $E600 is -$1A00, so the two coordinate pairs resolve to $38000000 and $04000400.
    assert.equal(D.coordBias, 0xe600);
    assert.equal((0xe600 + 0x1a00) & 0xffff, 0, '$E600 is -$1A00');
    assert.equal((0x5200 + 0xe600) & 0xffff, 0x3800, 'side 0 high word');
    assert.equal((0x1a00 + 0xe600) & 0xffff, 0x0000, 'side 0 low word');
    assert.equal((0x1e00 + 0xe600) & 0xffff, 0x0400, 'side 1, both words');
  });

test('W374 $25EDF8 emits through $23DFB4 with D4 = $12 at all three sites', { skip: SKIP },
  async () => {
    const { draw25EDF8, DRAW_25EDF8: D, ram, rom, ctx } = await fx();
    assert.equal(D.stub, 0x23dfb4);
    assert.equal(D.pal, 0x0012);
    for (const at of [0x25eed2, 0x25ef02, 0x25ef20]) {
      assert.equal(rom.u16(at), 0x383c, `$${at.toString(16).toUpperCase()} move.w #<imm>,D4`);
      assert.equal(rom.u16(at + 2), D.pal, '  ...$0012');
      assert.equal(rom.u16(at + 4), 0x4eb9, '  ...followed by a jsr');
      assert.equal(rom.u32(at + 6), D.stub, '  ...to $23DFB4');
    }
    // Cursor 2 with $80390C on is the widest case: emit 1, emit 2, and TWO records.
    const a6 = A6_REC0;
    arm25EDF8(ram, D, a6, { state: 4, cursor: 2, phase: 0, anim: 0, mirror2: 1 });
    const before = bytesUsed(ram);
    draw25EDF8(ram, rom, ctx, a6, 1);
    const delta = bytesUsed(ram) - before;
    const e = emitsSince(ram, before);
    assert.equal(e.length, 4, 'four emits');
    assert.equal(delta, e.length * REC, `${delta} bytes is exactly ${e.length} x ${REC}`);
    for (const x of e) assert.equal(x.pal, D.pal, 'every emit carries D4 = $12');
  });

// ---------------------------------------------------------------------------
// $25F074 -- the LAST of the eight shared select-screen draws by size. 327 bytes, EIGHT emits:
// five through $23DFB4 and three through the ZOOMING register stub $23E2F2, which feeds the same
// bucket 0, so `emitsSince` reads all eight. Only the D1 packing differs: the zooming form ors in
// D6 ($80005000) instead of $80008000 and adds a SHORT-axis recentring of ($80 - $50) * scale.
// ---------------------------------------------------------------------------

const TAB_A = 0x25f014;                   // side 0, the lea the `bne` at $25F07E KEEPS
const TAB_B = 0x25f044;                   // side 1, the $25F080 override plus `neg.w D5`

/** Put a record into a known state. Only the seven fields $25F074 reads are touched. */
function arm25F074(ram, D, a6, { state = 2, anim = 1, gate1 = 1, loop = 0, cursor = 0,
  nibbles = 0, short: shortAxis = 0 } = {}) {
  ram.setU8(a6 + D.stateAt, state);       // ($1,A6) -- slice select AND the art gate
  ram.setU16(a6 + D.animAt, anim);        // ($2C,A6) -- gates emit 2 and the cursor advance
  ram.setU16(a6 + D.nibblesAt, nibbles);  // ($2E,A6) -- a WORD here, three nibbles
  ram.setU16(a6 + D.shortAt, shortAxis);  // ($38,A6) -- D5
  ram.setU16(a6 + D.cursorAt, cursor);    // ($66,A6) -- the ramp cursor, the ONLY thing written
  ram.setU16(D.gateEmit1, gate1);         // $80390C
  ram.setU16(D.loopCounter, loop);        // $813098
}

/** `$23E2F2` with D6 = $80005000: the LONG-axis adjustment is exactly 0 ($80 - $80 = 0, whatever
 *  the scale) and the SHORT one is ($80 - $50) * scale, the scale coming from D3's height. */
function packZoom(d1, scale) {
  const hi = (d1 >>> 16) & 0xffff;
  const lo = ((d1 & 0xffff) + (0x80 - 0x50) * scale) & 0xffff;
  const d0 = ((((((hi << 16) | lo) | 0) >> 6) & 0x07ff03ff) | 0x80005000) >>> 0;
  return { hi: (d0 >>> 16) & 0xffff, lo: d0 & 0xffff };
}

test('W374 $25F074 THE SLICE SELECT: states 0..6 emit eight, 7..$FF emit the SAME last four',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;

    const run = (state) => {
      arm25F074(ram, D, a6, { state, cursor: 0 });
      const before = bytesUsed(ram);
      draw25F074(ram, rom, ctx, a6, 1);
      const delta = bytesUsed(ram) - before;
      assert.equal(delta % REC, 0, `${delta} bytes is a whole multiple of ${REC} -- the counter is `
        + 'a BYTE OFFSET, not a sprite tally');
      return emitsSince(ram, before);
    };

    // The two states the ported callers reach: $25D28C after `move.b #$2` and $25D4DC after #$5.
    for (const st of [2, 5]) {
      assert.equal(run(st).length, 8, `state ${st} runs the FULL path -- $25F086 bcs is taken`);
    }
    // ...and the third call site, $25D836, arrives with 7 or with 8 ($25D748 move.b #$8).
    const full = run(2);
    for (const st of [7, 8, 0x30, 0xff]) {
      const sliced = run(st);
      assert.equal(sliced.length, 4, `state ${st} takes adda.l #$18,A0 / bra.w $25F128`);
      assert.deepEqual(sliced, full.slice(4),
        `state ${st} lands on EXACTLY the A0 the full path reaches via lea ($10,A0),A0`);
    }
    // Every state below 7 is full, including the ones no caller produces. `bcs` is UNSIGNED.
    for (const st of [0, 1, 3, 4, 6]) {
      assert.equal(run(st).length, 8, `state ${st} is < 7 unsigned, so it is the full path`);
    }
  });

test('W374 $25F074 emit 1 art is $0019A35C in states 2/5/7/8, and $0019A410 in state 4',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;

    // 7 and 8 skip emit 1 altogether; 2, 4 and 5 draw it. State 4 IS reachable -- $25D490 beq.w
    // $25D4A4 skips the move.b #$5 on a non-confirm frame -- so both arms below are live.
    for (const st of [2, 5]) {
      arm25F074(ram, D, a6, { state: st });
      const before = bytesUsed(ram);
      draw25F074(ram, rom, ctx, a6, 1);
      const e = emitsSince(ram, before);
      assert.equal(e[0].art, D.artEmit1,
        `state ${st}: $25F0A8 cmpi.b #$4,($1,A6) does not match here, so emit 1's D2 is $0019A35C. `
        + '$0019A410 is the state-4 arm; these states select the other one');
      assert.notEqual(e[0].art, D.artEmit1Dead, 'the $25F0B0 arm did not run');
      assert.equal(e[0].attr, D.attr.e1, 'emit 1 D3 = $0458');
      assert.equal(e[0].pal, D.pal, 'emit 1 D4 = $0012');
    }

    // In state 4 the second arm runs, and state 4 IS reachable from $25D4CE on any frame the
    // player does not confirm. W374 first claimed otherwise and withdrew it.
    arm25F074(ram, D, a6, { state: 4 });
    const before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    assert.equal(emitsSince(ram, before)[0].art, D.artEmit1Dead,
      'state 4 takes $25F0B0 -- a live arm, reached on every non-confirm frame');
  });

test('W374 $25F074 art gate and slice select, proved from the ROM, all THREE call sites',
  { skip: SKIP }, async () => {
    const { DRAW_25F074: D, rom } = await fx();
    // $25F086 cmpi.b #$7,($1,A6): opcode $0C2E, IMMEDIATE $0007 FIRST, displacement $0001 second.
    assert.equal(rom.u16(0x25f086), 0x0c2e, '$25F086 cmpi.b #<imm>,(d16,A6)');
    assert.equal(rom.u16(0x25f088), D.stateLimit, '  ...$0007 comes FIRST');
    assert.equal(rom.u16(0x25f08a), D.stateAt, '  ...$0001 comes SECOND');
    assert.equal(rom.u16(0x25f08c), 0x650a, '$25F08C bcs.s -- UNSIGNED <, not blt');
    assert.equal(rom.u32(0x25f090), D.sliceSkip, '$25F08E adda.l #$18,A0');
    assert.equal(0x25f096 + rom.u16(0x25f096), 0x25f128, '$25F094 bra.w -> $25F128');

    // $25F0A8 cmpi.b #$4,($1,A6) -- the DEAD one, same operand order.
    assert.equal(rom.u16(0x25f0a8), 0x0c2e, '$25F0A8 cmpi.b');
    assert.equal(rom.u16(0x25f0aa), D.deadGateValue, '  ...$0004 FIRST');
    assert.equal(rom.u16(0x25f0ac), D.stateAt, '  ...$0001 SECOND');
    assert.equal(rom.u32(0x25f0a4), D.artEmit1, '$25F0A2 move.l #$0019A35C,D2');
    assert.equal(rom.u32(0x25f0b2), D.artEmit1Dead, '$25F0B0 move.l #$0019A410,D2 -- the state-4 arm');

    // THREE call sites, and there are exactly three: a full-image scan for the longword $0025F074
    // finds these operands and no others. All three are `jsr` ($4EB9).
    for (const at of [0x25d28c, 0x25d4dc, 0x25d836]) {
      assert.equal(rom.u16(at - 2), 0x4eb9, `$${(at - 2).toString(16).toUpperCase()} jsr`);
      assert.equal(rom.u32(at), D.addr, '  ...$25F074');
    }
    // The two states the ported callers set, and the 8 that $25D748 writes for the third.
    assert.equal(rom.u32(0x25d24e), 0x1d7c0002, '$25D24E move.b #$2,($1,A6) -> $25D28C');
    assert.equal(rom.u32(0x25d49a), 0x1d7c0005, '$25D49A move.b #$5,($1,A6) -> $25D4DC');
    assert.equal(rom.u32(0x25d748), 0x1d7c0008, '$25D748 move.b #$8,($1,A6) -> $25D836');
    // ...and 2, 5, 7 and 8 are all != 4, which is the whole of the dead-gate argument.
    for (const st of [2, 5, 7, 8]) assert.notEqual(st, D.deadGateValue);
  });

test('W374 $25F074 THE SIDE SENSE IS INVERTED and the semantics are not: bne, and $25D4E4 inverts',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, sideFromD7_25D4E4, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    // $25F07E is `bne` ($66xx), where $25EDF8 uses `beq`. The two inversions cancel.
    assert.equal(rom.u16(0x25f07c), 0x4a47, '$25F07C tst.w D7');
    assert.equal(rom.u16(0x25f07e) >>> 8, 0x66, '$25F07E is bne.s, NOT beq.s');
    assert.equal(rom.u16(0x25f084), 0x4445, '$25F084 neg.w D5 -- the fall-through arm only');
    assert.equal(sideFromD7_25D4E4(1), 0, 'D7 != 0 is SIDE 0');
    assert.equal(sideFromD7_25D4E4(0), 1, 'D7 == 0 is SIDE 1');
    assert.equal(D.sides[0].table, TAB_A, 'side 0 keeps the $25F014 lea');
    assert.equal(D.sides[1].table, TAB_B, 'side 1 takes the $25F044 lea');
    assert.equal(D.sides[0].negate, false);
    assert.equal(D.sides[1].negate, true, 'and only side 1 negates D5');
    // Both `lea (d16,PC)` displacements, resolved from the EXTENSION WORD's own address.
    assert.equal(0x25f076 + ((rom.u16(0x25f076) << 16) >> 16), TAB_A, '$25F074 lea -> $25F014');
    assert.equal(0x25f082 + ((rom.u16(0x25f082) << 16) >> 16), TAB_B, '$25F080 lea -> $25F044');

    const f = 0x0140;
    const run = (d7) => {
      arm25F074(ram, D, a6, { state: 2, cursor: 0, short: f });
      const before = bytesUsed(ram);
      draw25F074(ram, rom, ctx, a6, d7);
      return emitsSince(ram, before);
    };

    // D7 != 0 -> TABLE A. Emit 3 is the cleanest witness: D1 and D2 both come straight from
    // +$08/+$0C with no arithmetic at all.
    const e0 = run(1);
    assert.deepEqual({ hi: e0[2].d1hi, lo: e0[2].d1lo }, pack(0x60010100), 'side 0 emit 3 D1');
    assert.equal(e0[2].art, 0x0019485c, 'side 0 emit 3 D2 = $25F014 + $0C');
    assert.equal(e0[3].art, 0x00195568, 'side 0 emit 4 D2 = $25F014 + $14');
    assert.equal(e0[1].pal, D.palEmit2, 'side 0 emit 2 D4 = $0017 -- the ori is SKIPPED');
    // ...and D5 is NOT negated, so emit 5's short axis is +f.
    assert.deepEqual({ hi: e0[4].d1hi, lo: e0[4].d1lo }, pack(0x39413180 + f),
      'side 0 emit 5 D1 = $39413180 + ($38,A6)');

    // D7 == 0 -> TABLE B, and D5 negated.
    const e1 = run(0);
    assert.deepEqual({ hi: e1[2].d1hi, lo: e1[2].d1lo }, pack(0x03010880), 'side 1 emit 3 D1');
    assert.equal(e1[2].art, 0x00196b24, 'side 1 emit 3 D2 = $25F044 + $0C');
    assert.equal(e1[3].art, 0x00197830, 'side 1 emit 4 D2 = $25F044 + $14');
    assert.equal(e1[1].pal, D.palEmit2 | D.palEmit2Ori, 'side 1 emit 2 D4 = $0077');
    assert.equal(e1[1].pal, 0x0077, '$25F0F8 ori.w #$0060,D4 -- both flip bits at once');
    assert.deepEqual({ hi: e1[4].d1hi, lo: e1[4].d1lo }, pack(0x29010780 + ((-f) & 0xffff)),
      'side 1 emit 5 D1 = $29010780 - ($38,A6), the `neg.w D5` arm');

    // SWAPPING THE TWO SIDES MUST FAIL. Every one of these differs between the arms.
    assert.notEqual(e0[2].art, e1[2].art, 'emit 3 art differs between the two tables');
    assert.notEqual(e0[1].pal, e1[1].pal, 'emit 2 palette differs');
    assert.notEqual(e0[4].d1lo, e1[4].d1lo, 'emit 5 short axis differs');
  });

test('W374 $25F074: $80390C gates EMIT 1 ONLY, and ($2C,A6) gates emit 2 AND the cursor advance',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    const run = (opts) => {
      arm25F074(ram, D, a6, { state: 2, cursor: 0, ...opts });
      const before = bytesUsed(ram);
      draw25F074(ram, rom, ctx, a6, 1);
      const delta = bytesUsed(ram) - before;
      assert.equal(delta % REC, 0, `${delta} bytes is a whole multiple of ${REC}`);
      return { e: emitsSince(ram, before), cursor: ram.u16(a6 + D.cursorAt) };
    };

    const all = run({ gate1: 1, anim: 1 });
    assert.equal(all.e.length, 8);
    assert.equal(all.cursor, D.rampStep, '$25F0E0 addq.w #4,($66,A6) ran');

    // $80390C == 0: ONE fewer emit, and emits 2..8 are byte-identical. The two `move.l (A0)+,D1`
    // sit OUTSIDE the gate, so A0 still reaches +$08 and nothing downstream shifts.
    const g = run({ gate1: 0, anim: 1 });
    assert.equal(g.e.length, 7, '$80390C = 0 drops exactly one sprite');
    assert.deepEqual(g.e, all.e.slice(1), 'and it is EMIT 1 -- the other seven are unchanged');
    assert.equal(g.cursor, D.rampStep, 'the cursor still advances: that gate is not this one');

    // ($2C,A6) == 0: one fewer emit AND the cursor is frozen.
    const a = run({ gate1: 1, anim: 0 });
    assert.equal(a.e.length, 7, '($2C,A6) = 0 drops exactly one sprite');
    assert.deepEqual(a.e, [all.e[0], ...all.e.slice(2)],
      'and it is EMIT 2 -- emit 1 and emits 3..8 are unchanged');
    assert.equal(a.cursor, 0,
      '$25F0E0 is INSIDE the ($2C,A6) gate, so a zero anim field freezes the ramp');

    // Both off: six emits, cursor frozen.
    const both = run({ gate1: 0, anim: 0 });
    assert.equal(both.e.length, 6);
    assert.equal(both.cursor, 0);
    assert.deepEqual(both.e, all.e.slice(2));
  });

test('W374 $25F074 THE ART RAMP wraps at $30: four frames at stride $E4, three ticks each',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(D.ramp, 0x25f1bc);
    assert.equal(D.rampWrap, 0x30, '$25F0E4 cmpi.w #$30,($66,A6) states the bound');
    assert.equal(D.rampEntries * 4, D.rampWrap, 'TWELVE longs is exactly $30 bytes');
    assert.equal(rom.u16(0x25f0d0), 0x4e71, '$25F0D0 nop -- between the lea and the adda');
    assert.equal(0x25f0ce + ((rom.u16(0x25f0ce) << 16) >> 16), D.ramp, '$25F0CC lea -> $25F1BC');

    arm25F074(ram, D, a6, { state: 2, cursor: 0 });
    const seen = [];
    for (let i = 0; i < 12; i++) {
      const before = bytesUsed(ram);
      draw25F074(ram, rom, ctx, a6, 1);
      seen.push(emitsSince(ram, before)[1].art);           // emit 2 -- the ramp is its art
      const want = ((i + 1) * 4) % 0x30;
      assert.equal(ram.u16(a6 + D.cursorAt), want,
        `tick ${i}: the cursor steps by 4 and returns to 0 after $2C`);
    }
    assert.equal(ram.u16(a6 + D.cursorAt), 0, 'a full cycle is TWELVE ticks and lands back on 0');

    // The twelve longs, straight out of the window, and the emitted art in the same order.
    const romRamp = [];
    for (let i = 0; i < 12; i++) romRamp.push(rom.u32(D.ramp + i * 4));
    assert.deepEqual(seen, romRamp, 'emit 2 walks $25F1BC entry for entry');

    // FOUR distinct frames at stride $E4, each held for THREE consecutive ticks.
    const distinct = [...new Set(romRamp)];
    assert.equal(distinct.length, 4, 'four distinct frames');
    for (let i = 1; i < 4; i++) {
      assert.equal(distinct[i] - distinct[i - 1], D.rampStride, 'the stride is $E4');
    }
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(romRamp.slice(i * 3, i * 3 + 3), [distinct[i], distinct[i], distinct[i]],
        `frame ${i} is held for three ticks`);
    }
    // And the thirteenth tick is the first frame again, from the wrapped cursor.
    const before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    assert.equal(emitsSince(ram, before)[1].art, romRamp[0], 'the wrap really restarts the ramp');
  });

test('W374 $25F074 THREE INDEPENDENT NIBBLES off ($2E,A6): *$64 twice off +$24, *$34 off +$2C',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx, notes } = await fx();
    const a6 = A6_REC0;
    // ($2E,A6) IS A WORD HERE. SCREEN9.tailFlag reads $2E as a BYTE; both are the cartridge's.
    assert.equal(rom.u16(0x25f14c), 0x302e, '$25F14C move.w ($2E,A6),D0 -- a WORD move');
    assert.equal(rom.u16(0x25f14e), D.nibblesAt, '  ...($2E,A6)');
    assert.equal(rom.u32(0x25f150), 0x024000f0, '$25F150 andi.w #$00F0,D0');
    assert.equal(rom.u16(0x25f154), 0xe848, '$25F154 lsr.w #4,D0');
    // THE aligned.py DEFECT: `C1FC 0064 D480` is TWO instructions, not one six-byte one.
    assert.equal(rom.u16(0x25f156), 0xc1fc, '$25F156 muls.w #<imm>,D0 -- FOUR bytes');
    assert.equal(rom.u16(0x25f158), D.nib6.mul, '  ...#$0064');
    assert.equal(rom.u16(0x25f15a), 0xd480, '$25F15A add.l D0,D2 -- a SEPARATE two-byte add');
    assert.equal(rom.u16(0x25f1a0), 0xc1fc, '$25F1A0 muls.w #<imm>,D0');
    assert.equal(rom.u16(0x25f1a2), D.nib8.mul, '  ...#$0034 -- a DIFFERENT stride');
    assert.equal(rom.u16(0x25f1a4), 0xd480, '$25F1A4 add.l D0,D2');
    assert.equal(rom.u16(0x25f19a), 0x700f, '$25F19A moveq #$F,D0');
    assert.equal(rom.u32(0x25f17c), 0x02400f00, '$25F17C andi.w #$0F00,D0');
    assert.equal(rom.u16(0x25f180), 0xe048, '$25F180 lsr.w #8,D0');

    const base67 = rom.u32(TAB_A + D.off.d2e67);            // $0019AF00
    const base8 = rom.u32(TAB_A + D.off.d2e8);              // $0019B2E8
    const run = (nibbles) => {
      arm25F074(ram, D, a6, { state: 2, cursor: 0, nibbles });
      const before = bytesUsed(ram);
      draw25F074(ram, rom, ctx, a6, 1);
      return emitsSince(ram, before);
    };

    // Each nibble moves ONE emit and leaves the other two alone.
    for (let n = 0; n <= 9; n++) {
      let e = run(n << 4);                                  // bits 7..4 -> EMIT 6
      assert.equal(e[5].art, base67 + n * 0x64, `emit 6 art = +$24 + ${n} * $64`);
      assert.equal(e[6].art, base67, '  ...and emit 7 is untouched by that nibble');
      assert.equal(e[7].art, base8, '  ...and so is emit 8');

      e = run(n << 8);                                      // bits 11..8 -> EMIT 7
      assert.equal(e[6].art, base67 + n * 0x64, `emit 7 art = +$24 + ${n} * $64`);
      assert.equal(e[5].art, base67, '  ...emit 6 untouched');
      assert.equal(e[7].art, base8, '  ...emit 8 untouched');

      e = run(n);                                           // bits 3..0 -> EMIT 8
      assert.equal(e[7].art, base8 + n * 0x34, `emit 8 art = +$2C + ${n} * $34`);
      assert.equal(e[5].art, base67, '  ...emit 6 untouched');
      assert.equal(e[6].art, base67, '  ...emit 7 untouched');
    }
    // All three at once, to prove the masks really are disjoint.
    const e = run(0x0357);
    assert.equal(e[5].art, base67 + 5 * 0x64, 'bits 7..4 = 5');
    assert.equal(e[6].art, base67 + 3 * 0x64, 'bits 11..8 = 3');
    assert.equal(e[7].art, base8 + 7 * 0x34, 'bits 3..0 = 7');
    // Bits 15..12 are read into D0 and then masked off by all three `andi`. They change nothing.
    assert.deepEqual(run(0xf357), e, 'the top nibble is read and discarded');

    // NOTHING CLAMPS THE NIBBLE. $A..$F index past the intended frames; no bound is stated
    // anywhere in the routine and the writer of ($2E,A6) was not found, so the port NOTES the
    // case rather than inventing a clamp -- and still emits, exactly as the cartridge does.
    const before = notes.length;
    const wild = run(0x00f0);
    assert.equal(wild[5].art, base67 + 0xf * 0x64, 'nibble $F is NOT clamped');
    assert.ok(notes.length > before, 'and the out-of-range case is noted, not silently accepted');
    assert.ok(notes.includes(D.nib6.at), `the note names $${D.nib6.at.toString(16).toUpperCase()}`);
  });

test('W374 $25F074 EMIT 4 INHERITS D3 and D4 from emit 3, and every D4 but emit 2 is $0012',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    // There is no move.w into D3 or D4 between $25F110 and $25F11E: emit 4 opens straight on
    // `move.l ($8,A0),D1`. Folding emit 4 into "its own" attribute is the mistake this pins.
    assert.equal(rom.u16(0x25f116), 0x2228, '$25F116 move.l (d16,A0),D1 -- the FIRST thing after');
    assert.equal(rom.u16(0x25f118), 0x0008, '  ...($8,A0), no D3/D4 reload in between');
    assert.equal(rom.u16(0x25f11a), 0x2428, '$25F11A move.l (d16,A0),D2');
    assert.equal(rom.u16(0x25f11c), 0x000c, '  ...($C,A0)');

    arm25F074(ram, D, a6, { state: 2, cursor: 0 });
    const before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    const e = emitsSince(ram, before);

    assert.equal(e[2].attr, D.attr.e3, 'emit 3 D3 = $0630');
    assert.equal(e[3].attr, D.attr.e3, 'emit 4 D3 is INHERITED -- the same $0630, not a new value');
    assert.equal(e[3].attr, e[2].attr, 'stated again as the identity it is');
    assert.equal(e[3].pal, e[2].pal, 'and D4 is inherited too');
    // The six attribute words the routine actually loads, in emit order.
    assert.deepEqual(e.map((x) => x.attr),
      [D.attr.e1, D.attr.e2, D.attr.e3, D.attr.e3, D.attr.e5, D.attr.e6, D.attr.e6, D.attr.e8],
      '$0458 $0E20 $0630 $0630 $0218 $0818 $0818 $0610 -- emits 4 and 7 repeat their predecessor');
    // D4 is $0012 everywhere except emit 2, which is the only site with its own immediate.
    assert.deepEqual(e.map((x) => x.pal),
      [D.pal, D.palEmit2, D.pal, D.pal, D.pal, D.pal, D.pal, D.pal],
      'only emit 2 carries a palette of its own');
  });

test('W374 $25F074 EMIT 7 reuses emit 6 D2 base from (-$4,A0) and sits 15 px along',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(rom.u16(0x25f170), 0x2428, '$25F170 move.l (d16,A0),D2');
    assert.equal(rom.u16(0x25f172), 0xfffc, '  ...(-$4,A0) -- table +$24 AGAIN, not a new entry');
    assert.equal(rom.u32(0x25f174), 0x044103c0, '$25F174 subi.w #$03C0,D1');
    assert.equal(D.emit7Back / 0x40, 15, '$3C0 at 1/64 px is exactly 15 px');
    // D3 and D4 are INHERITED: there is no move.w into either between the two jsr.
    assert.equal(rom.u16(0x25f188), 0x2c3c, '$25F188 move.l #<imm>,D6 -- the ONLY reload');
    assert.equal(rom.u32(0x25f18a), D.zoomFlags, '  ...$80005000, the same literal a third time');
    assert.equal(rom.u16(0x25f18e), 0x4eb9, '$25F18E jsr');
    assert.equal(rom.u32(0x25f190), D.zoomStub, '  ...$23E2F2, with D3/D4 still emit 6 s');

    arm25F074(ram, D, a6, { state: 2, cursor: 0, nibbles: 0, short: 0 });
    const before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    const e = emitsSince(ram, before);
    const e6 = e[5], e7 = e[6];

    assert.equal(e6.art, e7.art, 'both read table +$24, so with equal nibbles the art is equal');
    assert.equal(e6.attr, D.attr.e6, 'emit 6 D3 = $0818');
    assert.equal(e7.attr, D.attr.e6, 'emit 7 D3 is INHERITED, not reloaded');
    assert.equal(e6.pal, D.pal);
    assert.equal(e7.pal, D.pal, 'emit 7 D4 is INHERITED too');
    assert.equal(e6.d1hi, e7.d1hi, 'the LONG axis is untouched -- subi.w is a WORD op');
    assert.equal((e6.d1lo & 0x03ff) - (e7.d1lo & 0x03ff), 15,
      'emit 7 is exactly 15 px along the SHORT axis from emit 6');

    // Exact, through $23E2F2 own arithmetic. Height $18 = 24 -> $23E78C[(24>>1)>>2] = [3] = 3.
    const { ZOOM_REG_SCALE_TABLE } = await import('../src/spritequeue.js');
    const scale6 = ZOOM_REG_SCALE_TABLE[((D.attr.e6 & 0x1ff) >> 1) >> 2];
    assert.equal(scale6, 3, 'the short-axis scale for height 24');
    assert.equal((D.attr.e6 & 0x1ff) & 7, 0, 'height 24 is a multiple of 8 -- no height & 7 throw');
    assert.equal((D.attr.e8 & 0x1ff) & 7, 0, 'and so is height 16');
    const d1e6 = rom.u32(TAB_A + D.off.d1e67);
    assert.deepEqual({ hi: e6.d1hi, lo: e6.d1lo }, packZoom(d1e6, scale6), 'emit 6 D1 exactly');
    assert.deepEqual({ hi: e7.d1hi, lo: e7.d1lo },
      packZoom(((d1e6 & 0xffff0000) | ((d1e6 - D.emit7Back) & 0xffff)) >>> 0, scale6),
      'emit 7 D1 exactly -- the SHORT word only');

    // The LONG-axis adjustment is exactly 0 because D6 high word is $8000 ($80 - $80).
    assert.equal((D.zoomFlags >>> 24) & 0xff, 0x80, 'D6 high byte $80 -> long adjustment 0');
    assert.equal(e6.d1hi, packZoom(d1e6, scale6).hi, 'so the long axis is the table value verbatim');
  });

test('W374 $25F074: $813098 is the ONLY early exit, and emits 1..4 have already happened',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(D.loopCounter, 0x813098);
    assert.equal(rom.u32(0x25f12a), D.loopCounter, '$25F128 tst.w $813098');
    assert.equal(rom.u16(0x25f12e), 0x6600, '$25F12E bne.w');
    assert.equal(0x25f130 + rom.u16(0x25f130), D.rts, '  ...-> $25F1BA');
    assert.equal(rom.u16(D.rts), 0x4e75, '$25F1BA rts');

    // Full path, counter zero: eight.
    arm25F074(ram, D, a6, { state: 2, cursor: 0, loop: 0 });
    let before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    const all = emitsSince(ram, before);
    assert.equal(all.length, 8);

    // Full path, counter non-zero: FOUR, and they are emits 1..4, not zero.
    arm25F074(ram, D, a6, { state: 2, cursor: 0, loop: 1 });
    before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    const early = emitsSince(ram, before);
    assert.equal(early.length, 4, 'the exit is BELOW emits 1..4, not at the top of the routine');
    assert.deepEqual(early, all.slice(0, 4), 'and they are exactly emits 1..4');

    // Slice path plus the counter: nothing at all.
    arm25F074(ram, D, a6, { state: 7, cursor: 0, loop: 1 });
    before = bytesUsed(ram);
    draw25F074(ram, rom, ctx, a6, 1);
    assert.equal(bytesUsed(ram), before, 'state 7 with the counter set emits nothing');
    // ...and the cursor still moved on the full path, because emit 2 is above the exit.
    arm25F074(ram, D, a6, { state: 2, cursor: 0, loop: 1 });
    draw25F074(ram, rom, ctx, a6, 1);
    assert.equal(ram.u16(a6 + D.cursorAt), D.rampStep, 'emit 2 ran before the exit was tested');
  });

test('W374 $25F074 the two tables share their three art longs at +$1C/+$24/+$2C', { skip: SKIP },
  async () => {
    const { DRAW_25F074: D, rom } = await fx();
    // BYTE-IDENTICAL art, DIFFERENT coordinates -- independent confirmation of the layout.
    for (const [off, art] of [[D.off.d2e5, 0x0019a4c4], [D.off.d2e67, 0x0019af00],
      [D.off.d2e8, 0x0019b2e8]]) {
      assert.equal(rom.u32(TAB_A + off), art, `$25F014 + $${off.toString(16)} is $${
        art.toString(16).toUpperCase()}`);
      assert.equal(rom.u32(TAB_B + off), art, '  ...and $25F044 holds the SAME long');
    }
    // Every other long differs -- those are the coordinates, and pairing only starts at +$08.
    for (const off of [D.off.d1e1, D.off.d1e2, D.off.d1e3, D.off.d2e3, D.off.d1e4, D.off.d2e4,
      D.off.d1e5, D.off.d1e67, D.off.d1e8]) {
      assert.notEqual(rom.u32(TAB_A + off), rom.u32(TAB_B + off),
        `+$${off.toString(16)} is a coordinate or a side-specific art, and it differs`);
    }
    // +$04 is a COORDINATE, not an art pointer: emit 2 art comes from the $25F1BC ramp.
    assert.equal(rom.u32(TAB_A + D.off.d1e2), 0x4f013000,
      '$25F014 + $04 = $4F013000 -- long $4F01, short $3000, not a plausible art address');
    // The tables tile: $25F014 + $30 = $25F044, and $25F044 + $30 is the routine first opcode.
    assert.equal(TAB_A + D.tableBytes, TAB_B);
    assert.equal(TAB_B + D.tableBytes, D.addr);
    assert.equal(D.ramp + D.tableBytes, 0x25f1ec, 'and the ramp ends where the next routine starts');
  });

test('W374 $25F074 is 327 bytes, eight emits, and the bucket delta is always a multiple of 12',
  { skip: SKIP }, async () => {
    const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
    const a6 = A6_REC0;
    assert.equal(D.rts - D.addr + 1, D.bytes, 'the routine is 327 bytes');
    assert.equal(D.bytes, 327);

    // Five plain emits and three zooming ones, in ROM order.
    for (const at of [0x25f0be, 0x25f0fc, 0x25f110, 0x25f11e, 0x25f140]) {
      assert.equal(rom.u16(at), 0x4eb9, `$${at.toString(16).toUpperCase()} jsr`);
      assert.equal(rom.u32(at + 2), D.stub, '  ...$23DFB4');
    }
    for (const at of [0x25f16a, 0x25f18e, 0x25f1b4]) {
      assert.equal(rom.u16(at), 0x4eb9, `$${at.toString(16).toUpperCase()} jsr`);
      assert.equal(rom.u32(at + 2), D.zoomStub, '  ...$23E2F2, the ZOOMING register form');
    }
    // D6 is the same hard literal at all three zoom sites -- there is no zoom ramp here.
    for (const at of [0x25f164, 0x25f188, 0x25f1ae]) {
      assert.equal(rom.u16(at), 0x2c3c, `$${at.toString(16).toUpperCase()} move.l #<imm>,D6`);
      assert.equal(rom.u32(at + 2), D.zoomFlags, '  ...$80005000');
    }
    // EMIT 3 reads (A0) with NO post-increment where both neighbours use (A0)+.
    assert.equal(rom.u16(0x25f098), 0x2218, '$25F098 move.l (A0)+,D1');
    assert.equal(rom.u16(0x25f0c4), 0x2218, '$25F0C4 move.l (A0)+,D1');
    assert.equal(rom.u16(0x25f102), 0x2210, '$25F102 move.l (A0),D1 -- NO advance');
    assert.equal(rom.u32(0x25f124), 0x41e80010, '$25F124 lea ($10,A0),A0 -- the deferred advance');

    // Every reachable shape leaves a delta that is a whole multiple of 12.
    for (const state of [2, 5, 7, 8]) {
      for (const gate1 of [0, 1]) {
        for (const anim of [0, 1]) {
          for (const d7 of [0, 1]) {
            arm25F074(ram, D, a6, { state, gate1, anim, cursor: 0 });
            const before = bytesUsed(ram);
            draw25F074(ram, rom, ctx, a6, d7);
            const delta = bytesUsed(ram) - before;
            assert.equal(delta % REC, 0, `state ${state} gate1 ${gate1} anim ${anim} d7 ${d7}: `
              + `${delta} bytes is a whole multiple of ${REC}`);
            assert.equal(delta / REC, emitsSince(ram, before).length, 'and it matches the decode');
          }
        }
      }
    }
  });

test('W374 $25F074 writes ONLY ($66,A6), and nothing else in RAM', { skip: SKIP }, async () => {
  const { draw25F074, DRAW_25F074: D, ram, rom, ctx } = await fx();
  const a6 = A6_REC0;
  arm25F074(ram, D, a6, { state: 2, cursor: 0, nibbles: 0x0123, short: 0x0140, anim: 1 });
  // Every byte of the record, plus the two absolute words, before and after.
  const snap = () => {
    const b = [];
    for (let i = 0; i < 0x70; i++) b.push(ram.u8(a6 + i));
    b.push(ram.u16(D.gateEmit1), ram.u16(D.loopCounter));
    return b;
  };
  const before = snap();
  draw25F074(ram, rom, ctx, a6, 1);
  const after = snap();
  const moved = [];
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) moved.push(i);
  assert.deepEqual(moved, [D.cursorAt + 1],
    'only the low byte of ($66,A6) changed 0 -> 4; nothing else in the record or the two words');
});

// ---------------------------------------------------------------------------
// $25E29E -- the SIXTH shared draw ported. Four unrolled arms, ONE of which emits, four zooming
// emits through $23E2F2 (NOT $23DFB4), and the only live producer of scale index 56 in the corpus.
// ---------------------------------------------------------------------------

const A6_29E = A6_REC1;                   // $812F10, so a6 - $70 is still a valid address

/** The four D1 longwords, written as the RESOLVED table rather than as the port's step-by-step
 *  swaps, so that a swap read as decoration in `src/` cannot also be wrong here in the same way. */
function d1of25E29E(x, y) {
  const w = (v) => v & 0xffff;
  return [
    ((w(0x4801 + x) << 16) | w(-2 * y)) >>> 0,          // hi = $4801 + X, lo = -2Y
    ((w(0xfe81 - x) << 16) | w(+2 * y)) >>> 0,          // hi = $FE81 - X, lo = +2Y
    ((w(0x0001 - 2 * x) << 16) | w(-y)) >>> 0,          // hi = $0001 - 2X, lo = -Y   <-- FLIPPED
    ((w(0x0001 + 2 * x) << 16) | w(0x2800 + y)) >>> 0,  // hi = $0001 + 2X, lo = $2800 + Y
  ];
}
const D2_25E29E = [0x0019e310, 0x0019ebd4, 0x0019f498, 0x0019fb9c];
const D3_25E29E = [0x14e0, 0x14e0, 0x3840, 0x3840];     // emits 2 and 4 INHERIT
const D4_25E29E = [0x0010, 0x0010, 0x0010, 0x0010];     // emits 2, 3 and 4 INHERIT

function arm25E29E(ram, D, a6, { x = 0, y = 0, cursor = 0 } = {}) {
  ram.setU16(a6 + D.longAt, x);
  ram.setU16(a6 + D.shortAt, y);
  ram.setU16(a6 + D.cursorAt, cursor);
}

/** The expected records, built by driving `$23E2F2`'s OWN port with hand-resolved registers into a
 *  SEPARATE Ram. This is not a re-implementation of the emitter -- it is the emitter, fed what the
 *  cartridge feeds it, so the comparison is purely about $25E29E's register arithmetic. */
async function reference25E29E(x, y, d6) {
  const { enqueueZoomedRegisters } = await import('../src/spritequeue.js');
  const { Ram } = await import('../src/ram.js');
  const ram = new Ram();
  const d1 = d1of25E29E(x, y);
  for (let i = 0; i < 4; i++) {
    enqueueZoomedRegisters(ram, 0, d1[i], D2_25E29E[i], D3_25E29E[i], D4_25E29E[i], d6);
  }
  return emitsSince(ram, 0);
}

test('W374 $25E29E is 481 bytes, ONE straight line, and only the LIVE arm reaches a jsr',
  { skip: SKIP }, async () => {
    const { DRAW_25E29E: D, rom } = await fx();
    assert.equal(D.rts - D.addr + 1, D.bytes, 'the routine is 481 bytes');
    assert.equal(rom.u16(D.rts), 0x4e75, '$25E47E rts');

    // FOUR `jsr $23E2F2` in the whole routine, and every one of them inside the live arm.
    const jsrs = [];
    for (let a = D.addr; a < D.rts; a += 2) {
      if (rom.u16(a) === 0x4eb9 && rom.u32(a + 2) === D.stub) jsrs.push(a);
    }
    assert.deepEqual(jsrs, D.emits.map((e) => e.at),
      'exactly four jsr $23E2F2, at $25E322/$25E344/$25E36A/$25E38C');
    for (const at of jsrs) {
      assert.ok(at >= D.armLive.from && at < D.armLive.to,
        `$${at.toString(16).toUpperCase()} is inside the live arm $25E2F2..$25E391`);
    }
    // ...and not one `jsr`, `jmp` or `bsr` of ANY kind lives in the three silent arms.
    for (const arm of [D.armDeadHead, D.armDeadLsl, D.armDeadAsr]) {
      for (let a = arm.from & ~1; a <= arm.to; a += 2) {
        const w = rom.u16(a);
        assert.ok(w !== 0x4eb9 && w !== 0x4ef9 && w !== 0x4eba && w !== 0x4efa
          && (w & 0xff00) !== 0x6100,
        `$${a.toString(16).toUpperCase()} in the DEAD arm $${arm.from.toString(16).toUpperCase()
        }..$${arm.to.toString(16).toUpperCase()} is not a call or a branch (it is $${
          w.toString(16).toUpperCase()})`);
      }
    }
    // The four arms tile the routine exactly, with the rts left over.
    assert.equal(D.armDeadHead.to + 1, D.armLive.from);
    assert.equal(D.armLive.to + 1, D.armDeadLsl.from);
    assert.equal(D.armDeadLsl.to + 1, D.armDeadAsr.from);
    assert.equal(D.armDeadAsr.to + 1, D.rts);
  });

test('W374 $25E29E\'s three silent arms are DEAD: nothing in the image reaches into the body',
  { skip: SKIP }, async () => {
    const { DRAW_25E29E: D } = await fx();
    const img = readFileSync(ROM);
    const s16 = (v) => (v << 16) >> 16;
    const LO = D.addr, HI = D.rts - 1;         // $25E29E..$25E47D, i.e. every byte but the rts

    // 1. Absolute longwords: exactly three, all $0025E29E, all `jsr` operands.
    const abs = [];
    for (let a = 0; a + 4 <= img.length; a += 2) {
      const v = img.readUInt32BE(a);
      if (v >= LO && v <= HI) abs.push([a, v]);
    }
    assert.deepEqual(abs, [[0x25d266, D.addr], [0x25d4b6, D.addr], [0x25d810, D.addr]],
      'the ONLY absolute references are the three jsr operands, and every one of them targets the '
      + 'entry $25E29E -- nothing computes an address inside the body');
    for (const [a] of abs) {
      assert.equal(img.readUInt16BE(a - 2), 0x4eb9, `$${(a - 2).toString(16).toUpperCase()} jsr`);
    }

    // 2. 8-bit Bcc: none anywhere in the image lands inside the routine.
    const b8 = [];
    for (let a = 0; a + 2 <= img.length; a += 2) {
      const w = img.readUInt16BE(a);
      if ((w & 0xf000) !== 0x6000) continue;
      const d = w & 0xff;
      if (d === 0 || d === 0xff) continue;      // .w and .l forms, covered by the sweep below
      const t = a + 2 + (d >= 0x80 ? d - 256 : d);
      if (t >= LO && t <= HI) b8.push(a);
    }
    assert.deepEqual(b8, [], 'no 8-bit branch anywhere in the 6 MB image targets $25E29E..$25E47D');

    // 3. Every 16-bit PC-relative displacement -- bra.w/bsr.w/Bcc.w AND every `4xFA` / (d16,PC)
    //    extension word -- whose EXTENSION WORD is preceded by a real PC-relative opcode.
    const pcrel = [];
    for (let a = 2; a + 2 <= img.length; a += 2) {
      const t = a + s16(img.readUInt16BE(a));
      if (t < LO || t > HI) continue;
      const op = img.readUInt16BE(a - 2);
      // lea/movea/move (d16,PC) in any register: 4xFA; jmp/jsr (d16,PC): 4EFA/4EBA;
      // bra.w/bsr.w/Bcc.w: 6xx0 with a zero displacement byte.
      const isLea = (op & 0xf1ff) === 0x41fa;
      const isJmp = op === 0x4efa || op === 0x4eba;
      const isBr = (op & 0xf000) === 0x6000 && (op & 0x00ff) === 0x00;
      if (isLea || isJmp || isBr) pcrel.push([a - 2, op, t]);
    }
    assert.deepEqual(pcrel, [], 'no PC-relative instruction anywhere in the image resolves into '
      + '$25E29E..$25E47D. THIS IS THE EVIDENCE for the dead-arm claim: the head, the lsl arm and '
      + 'the asr arm are unreachable, so their stores are overwritten before anything sees them');

    // ...and the sweep is not vacuous: the routine's OWN lea at $25E2F2 is found when the range is
    // opened by one longword to include the ramp it points at.
    const own = [];
    for (let a = 2; a + 2 <= img.length; a += 2) {
      if (a + s16(img.readUInt16BE(a)) !== D.ramp) continue;
      if ((img.readUInt16BE(a - 2) & 0xf1ff) === 0x41fa) own.push(a - 2);
    }
    assert.ok(own.includes(D.leaAt), `$25E2F2's own lea IS found by the same sweep (hits: ${
      own.map((h) => '$' + h.toString(16).toUpperCase()).join(' ')}) -- so a null result above is a `
      + 'real absence and not a broken scan');
  });

test('W374 $25E29E\'s lea is at $25E2F2, NOT $25E2EE -- the trap the project already fell into',
  { skip: SKIP }, async () => {
    const { DRAW_25E29E: D, rom } = await fx();
    assert.equal(rom.u16(D.leaAt), 0x49fa, '$25E2F2 lea (d16,PC),A4');
    assert.equal(rom.u16(D.leaExt), D.leaDisp, '  ...displacement $018C');
    assert.equal(D.leaExt + D.leaDisp, D.ramp,
      '68000 PC-relative: the PC is the EXTENSION WORD address, $25E2F4 + $18C = $25E480');
    assert.equal(rom.u16(0x25e2f6), 0x4e71, '$25E2F6 nop -- padding between the lea and the adda');
    assert.equal(rom.u32(0x25e2f8), 0xd8ee0060, '$25E2F8 adda.w ($60,A6),A4');
    assert.equal(rom.u16(0x25e2fc), 0x2c14, '$25E2FC move.l (A4),D6 -- the ZOOM FLAGS');
    // $25E2EE falls INSIDE `move.l #$0019FB9C,D2`, which starts at $25E2EC. Reading the ext word
    // there gives a base of $25E47C and an off-by-one cursor -- a recon made exactly that error.
    assert.equal(rom.u16(0x25e2ec), 0x243c, '$25E2EC move.l #<imm>,D2');
    assert.equal(rom.u32(0x25e2ee), 0x0019fb9c, '  ...and $25E2EE is its IMMEDIATE, not an opcode');
    assert.notEqual(0x25e2f0 + rom.u16(0x25e2f0), D.ramp,
      'reading the lea at $25E2EE resolves to $25E47C, four bytes low -- the propagated error');
  });

test('W374 $25E29E emits EXACTLY FOUR sprites, through $23E2F2, whatever the fields hold',
  { skip: SKIP }, async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx, notes } = await fx();
    for (const x of [0, 0x0140, 0x3800]) {
      for (const y of [0, 0x0100, 0x1c00]) {
        for (const cursor of [0, 4, 0x3c]) {
          arm25E29E(ram, D, A6_29E, { x, y, cursor });
          const before = bytesUsed(ram);
          draw25E29E(ram, rom, ctx, A6_29E);
          const delta = bytesUsed(ram) - before;
          assert.equal(delta % REC, 0,
            `x=$${x.toString(16)} y=$${y.toString(16)} cur=$${cursor.toString(16)}: ${delta} `
            + `bytes is a whole multiple of ${REC}`);
          assert.equal(delta / REC, 4, '  ...and it is FOUR records -- no gate can suppress them');
          assert.equal(emitsSince(ram, before).length, 4, '  ...as the decode agrees');
        }
      }
    }
    assert.deepEqual(notes, [], 'nothing is unported on any reachable field value');
  });

test('W374 $25E29E: D3 is written TWICE and D4 ONCE, and emits 2/3/4 INHERIT', { skip: SKIP },
  async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    // The cartridge fact first: in the WHOLE live arm there are two `move.w #imm,D3` ($363C) and
    // exactly one `move.w #imm,D4` ($383C). A port that rebuilds either per emit contradicts this.
    const d3w = [], d4w = [];
    for (let a = D.armLive.from; a < D.armLive.to; a += 2) {
      if (rom.u16(a) === 0x363c) d3w.push(a);
      if (rom.u16(a) === 0x383c) d4w.push(a);
    }
    assert.deepEqual(d3w, [0x25e31a, 0x25e366], 'move.w #$14E0,D3 and move.w #$3840,D3, no more');
    assert.deepEqual(d4w, [0x25e31e], 'move.w #$0010,D4 -- ONCE, before the first jsr');

    arm25E29E(ram, D, A6_29E, { x: 0x0140, y: 0x0100, cursor: 8 });
    const before = bytesUsed(ram);
    draw25E29E(ram, rom, ctx, A6_29E);
    const e = emitsSince(ram, before);
    assert.equal(e.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(e[i].art, D2_25E29E[i], `emit ${i + 1} D2`);
      assert.equal(e[i].attr, D3_25E29E[i], `emit ${i + 1} D3`);
      assert.equal(e[i].pal, D4_25E29E[i], `emit ${i + 1} D4`);
    }
    assert.equal(e[1].attr, e[0].attr, 'emit 2 INHERITS D3 -- nothing writes it between the jsrs');
    assert.equal(e[3].attr, e[2].attr, 'emit 4 INHERITS D3 = $3840, which is the index-56 size');
    assert.notEqual(e[2].attr, e[1].attr, '  ...and emit 3 really does change it');
    for (const r of e) assert.equal(r.pal, 0x0010, 'D4 is written once and inherited three times');
  });

test('W374 $25E29E\'s AXIS SPLIT: emits 1/2 move on the HIGH half, 3/4 on the LOW', { skip: SKIP },
  async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    // Cursor 0 -> D6 = $80008000, whose recentring is exactly zero on both axes, so the emitted
    // words are D1 shifted and each record word depends on exactly ONE half of D1.
    const run = (x, y) => {
      arm25E29E(ram, D, A6_29E, { x, y, cursor: 0 });
      const before = bytesUsed(ram);
      draw25E29E(ram, rom, ctx, A6_29E);
      return emitsSince(ram, before);
    };
    const base = run(0, 0);
    const movedX = run(0x0140, 0);            // X only -- ($4E,A6), the LONG-axis accumulator
    const movedY = run(0, 0x0140);            // Y only -- ($50,A6), the SHORT-axis one

    for (const i of [0, 1]) {
      assert.notEqual(movedX[i].d1hi, base[i].d1hi, `emit ${i + 1}: X moves the HIGH half`);
      assert.equal(movedX[i].d1lo, base[i].d1lo, `emit ${i + 1}: X leaves the LOW half alone`);
      assert.equal(movedY[i].d1hi, base[i].d1hi, `emit ${i + 1}: Y leaves the HIGH half alone`);
      assert.notEqual(movedY[i].d1lo, base[i].d1lo, `emit ${i + 1}: Y moves the LOW half`);
    }
    for (const i of [2, 3]) {
      // THE OPPOSITE WAY ROUND -- X still reaches the high half and Y the low one, but through the
      // reversed swap shape at $25E354/$25E35E and $25E37A/$25E384. What separates the two shapes
      // is WHICH field is doubled, and that is the assertion below.
      assert.notEqual(movedX[i].d1hi, base[i].d1hi, `emit ${i + 1}: X moves the HIGH half`);
      assert.equal(movedX[i].d1lo, base[i].d1lo, `emit ${i + 1}: X leaves the LOW half alone`);
      assert.equal(movedY[i].d1hi, base[i].d1hi, `emit ${i + 1}: Y leaves the HIGH half alone`);
      assert.notEqual(movedY[i].d1lo, base[i].d1lo, `emit ${i + 1}: Y moves the LOW half`);
    }
    // X reaches emits 1/2's high half ONCE, through `add.w ($4E,A6),D1` between two swaps, but
    // emits 3/4's high half TWICE, through the doubled D0 that the final swap carries up. Read the
    // swaps as decoration and both shapes collapse to the same one, which is what this catches.
    const dx12 = ((movedX[0].d1hi & 0x07ff) - (base[0].d1hi & 0x07ff)) & 0x7ff;
    const dx34 = ((base[2].d1hi & 0x07ff) - (movedX[2].d1hi & 0x07ff)) & 0x7ff;
    assert.equal(dx34, dx12 * 2, 'emit 1 takes X once, emit 3 takes it TWICE (and negated)');
  });

test('W374 $25E29E DOUBLES: emit 1\'s low half moves by -2Y, emit 3\'s high half by -2X',
  { skip: SKIP }, async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    // The cartridge fact: two consecutive `sub.w D0,D1` ($9240 $9240) and two consecutive
    // `add.w D0,D1` ($D240 $D240), not one of each with a shift.
    assert.equal(rom.u32(0x25e310) >>> 0, 0x92409240, '$25E310/$25E312 sub.w D0,D1 TWICE');
    assert.equal(rom.u32(0x25e33a) >>> 0, 0xd240d240, '$25E33A/$25E33C add.w D0,D1 TWICE');
    assert.equal(rom.u32(0x25e35a) >>> 0, 0x92409240, '$25E35A/$25E35C sub.w D0,D1 TWICE');
    assert.equal(rom.u32(0x25e380) >>> 0, 0xd240d240, '$25E380/$25E382 add.w D0,D1 TWICE');

    const run = (x, y) => {
      arm25E29E(ram, D, A6_29E, { x, y, cursor: 0 });
      const before = bytesUsed(ram);
      draw25E29E(ram, rom, ctx, A6_29E);
      return emitsSince(ram, before);
    };
    // $40 in 1/64 px is exactly one pixel, so `asr.l #6` loses nothing and the deltas are exact.
    const base = run(0, 0);
    const oneY = run(0, 0x0040);
    const oneX = run(0x0040, 0);

    const lo = (r) => r.d1lo & 0x03ff;
    const hi = (r) => r.d1hi & 0x07ff;
    assert.equal((lo(base[0]) - lo(oneY[0])) & 0x3ff, 2,
      'emit 1 low half moved by -2Y = -2 px for Y = 1 px, NOT -1');
    assert.equal((lo(oneY[1]) - lo(base[1])) & 0x3ff, 2, 'emit 2 low half moved by +2Y');
    assert.equal((hi(base[2]) - hi(oneX[2])) & 0x7ff, 2,
      'emit 3 HIGH half moved by -2X = -2 px for X = 1 px, NOT -1');
    assert.equal((hi(oneX[3]) - hi(base[3])) & 0x7ff, 2, 'emit 4 high half moved by +2X');
    // ...while the SINGLE applications on emits 1/2's high half and 3/4's low half move by one.
    assert.equal((hi(oneX[0]) - hi(base[0])) & 0x7ff, 1, 'emit 1 high half takes X ONCE');
    assert.equal((lo(base[2]) - lo(oneY[2])) & 0x3ff, 1, 'emit 3 low half takes Y ONCE');
  });

test('W374 $25E29E\'s zoom ramp is sixteen longwords of $8000 + $800*i, on BOTH halves',
  { skip: SKIP }, async () => {
    const { DRAW_25E29E: D, rom } = await fx();
    for (let i = 0; i < D.rampEntries; i++) {
      const v = rom.u32(D.ramp + i * D.rampStep) >>> 0;
      const half = (0x8000 + 0x800 * i) & 0xffff;
      assert.equal((v >>> 16) & 0xffff, half, `ramp[${i}] long half is $${half.toString(16)}`);
      assert.equal(v & 0xffff, half, `ramp[${i}] short half is the SAME -- both axes zoom together`);
    }
    assert.equal(rom.u32(D.ramp) >>> 0, 0x80008000,
      'entry 0 is the NO-ZOOM encoding: grow set, zoom 0');
    assert.equal(rom.u32(D.ramp + D.rampLast) >>> 0, 0xf800f800,
      'entry 15, the last of the sixteen-frame zoom-in');
    assert.equal(D.rampEntries * D.rampStep, D.rampBytes, '$25E480 + $40 covers all sixteen');
    assert.equal(D.rampLast + D.rampStep, D.rampBytes, '  ...and $3C is the LAST valid cursor');
  });

test('W374 $25E29E indexes the ramp as $25E480 + ($60,A6), and $3C selects the last entry',
  { skip: SKIP }, async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    // $25D51C move.w #$0,($60,A6) is the only initialiser, $25D7B6 addq.w #$4 the only advance, and
    // $25D7AC cmpi.w #$3C / beq skips that addq -- so the cursor is {0, 4, ..., $3C} and saturates.
    assert.equal(rom.u32(0x25d51c) >>> 0, 0x3d7c0000, '$25D51C move.w #$0,($60,A6)');
    assert.equal(rom.u16(0x25d520), D.cursorAt, '  ...the displacement $60');
    assert.equal(rom.u32(0x25d7ac) >>> 0, 0x0c6e003c, '$25D7AC cmpi.w #$3C,($60,A6)');
    assert.equal(rom.u16(0x25d7b0), D.cursorAt);
    assert.equal(rom.u32(0x25d7b6) >>> 0, 0x586e0060,
      '$25D7B6 addq.w #$4,($60,A6) -- the only advance');

    for (const cursor of [0, 4, 8, 0x20, 0x3c]) {
      arm25E29E(ram, D, A6_29E, { x: 0, y: 0, cursor });
      const before = bytesUsed(ram);
      draw25E29E(ram, rom, ctx, A6_29E);
      const got = emitsSince(ram, before);
      const flags = rom.u32(D.ramp + cursor) >>> 0;
      assert.deepEqual(got, await reference25E29E(0, 0, flags),
        `cursor $${cursor.toString(16)} selects ramp entry ${cursor / 4} = $${
          flags.toString(16).toUpperCase()}`);
      // ...and it is really the flags: the emitted words carry the ramp's own high bits.
      for (const r of got) {
        assert.equal(r.d1hi & 0xf800, (flags >>> 16) & 0xf800,
          'the ramp longword is `or.l`-ed whole into the coords by $23E350');
      }
    }
    // The LAST entry is genuinely different from the first, so "saturates on $3C" is observable.
    assert.notEqual(rom.u32(D.ramp + D.rampLast) >>> 0, rom.u32(D.ramp) >>> 0);
  });

test('W374 $25E29E is the ONE live producer of scale index 56 -- ZOOM_REG, never SCALE_TABLE',
  { skip: SKIP }, async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    const { ZOOM_REG_SCALE_TABLE, SCALE_TABLE } = await import('../src/spritequeue.js');
    const { u16, i16 } = await import('../src/ram.js');

    // D3 = $3840 on emits 3 and 4, and $23E326 andi.w #$3E00 / $23E32A lsr.w #6 makes the ENTRY
    // index ($3840 >> 8) & $3E = 56 -- the ONE index at which the two tables disagree.
    assert.equal((0x3840 >> 8) & 0x3e, 56);
    assert.equal(ZOOM_REG_SCALE_TABLE[56], 56, '$23E78C[56] is $23E9CE = 64x - 8x = x56');
    assert.equal(SCALE_TABLE[56], 1, '$23E54A[56] is the x1 out-of-range GUARD');

    // Cursor 4 -> D6 = $88008800, so ($80 - $88) = -8 and the recentring is NON-zero on both axes.
    // With x1 it would be -8 on the long axis; with x56 it is -448. Nothing else distinguishes them.
    const cursor = 4;
    const d6 = rom.u32(D.ramp + cursor) >>> 0;
    assert.equal(d6, 0x88008800);
    arm25E29E(ram, D, A6_29E, { x: 0x0140, y: 0x0100, cursor });
    const before = bytesUsed(ram);
    draw25E29E(ram, rom, ctx, A6_29E);
    const got = emitsSince(ram, before);

    // $23E2F2's coordinate math, parameterised on the scales so both answers come from one piece of
    // code. `withReg` is checked against the real emitter at the end of this test, so it cannot rot.
    const longWordWith = (d1, scaleLong, scaleShort) => {
      const shortAdj = i16(u16(0x80 - u16(d6 >>> 8)) * scaleShort);
      const longAdj = i16(u16(0x80 - ((d6 >>> 24) & 0xff)) * scaleLong);
      const long = u16(longAdj + i16((d1 >>> 16) & 0xffff));
      const short = u16(shortAdj + i16(d1 & 0xffff));
      const packed = (((long << 16) | short) | 0) >> 6;
      return ((((packed & 0x07ff03ff) | d6) >>> 0) >>> 16) & 0xffff;
    };
    const d1 = d1of25E29E(0x0140, 0x0100);
    // height $3840 & $1FF = $40 = 64 -> entry (64/2)/4 = 8 -> x8 on the SHORT axis, in both tables.
    for (const i of [2, 3]) {
      const withReg = longWordWith(d1[i], ZOOM_REG_SCALE_TABLE[56], ZOOM_REG_SCALE_TABLE[8]);
      const withRec = longWordWith(d1[i], SCALE_TABLE[56], SCALE_TABLE[8]);
      assert.notEqual(withReg, withRec,
        `emit ${i + 1}: the two tables give DIFFERENT long-axis words, so this is a real test`);
      assert.equal(got[i].d1hi, withReg,
        `emit ${i + 1} carries the x56 recentring from $23E78C[56]. IF THIS FAILS, somebody `
        + 'aliased ZOOM_REG_SCALE_TABLE to SCALE_TABLE, or pointed this draw at $23DFB4');
      assert.notEqual(got[i].d1hi, withRec,
        `emit ${i + 1} is NOT what $23E54A[56]'s x1 guard would give -- $25E29E is the only live `
        + 'producer of index 56 in the corpus, so nothing else would catch the alias');
    }
    // Emits 1 and 2 pass D3 = $14E0, index $14 = 20, where the two tables AGREE -- which is exactly
    // why the alias would be invisible without emits 3 and 4.
    assert.equal((0x14e0 >> 8) & 0x3e, 20);
    assert.equal(ZOOM_REG_SCALE_TABLE[20], SCALE_TABLE[20]);
    // The whole four-record block matches the emitter driven with the resolved registers.
    assert.deepEqual(got, await reference25E29E(0x0140, 0x0100, d6));
  });

test('W374 $25E29E at its two real call sites: X = Y = 0, cursor 0, D1 is the bare literals',
  { skip: SKIP }, async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    // $25D264 (state 1's tail) and $25D4B4 (state 4's) both arrive here. Only $25D80E, inside
    // $25D560's tail, ever drives ($4E,A6)/($50,A6)/($60,A6) non-zero, and that state is not ported.
    for (const at of [0x25d264, 0x25d4b4, 0x25d80e]) {
      assert.equal(rom.u16(at), 0x4eb9, `$${at.toString(16).toUpperCase()} jsr`);
      assert.equal(rom.u32(at + 2), D.addr, '  ...$25E29E');
    }
    // The four `move.l #imm,D1` of the live arm ARE the four D1 values when X = Y = 0.
    const heads = [0x25e2fe, 0x25e328, 0x25e34a, 0x25e370];
    const want = d1of25E29E(0, 0);
    assert.deepEqual(want, [0x48010000, 0xfe810000, 0x00010000, 0x00012800]);
    for (let i = 0; i < 4; i++) {
      assert.equal(rom.u16(heads[i]), 0x223c, `$${heads[i].toString(16).toUpperCase()} move.l #,D1`);
      assert.equal(rom.u32(heads[i] + 2) >>> 0, want[i], '  ...and its immediate');
      assert.equal(D.emits[i].base >>> 0, want[i], '  ...matching the descriptor');
    }
    assert.equal(rom.u32(D.ramp) >>> 0, 0x80008000,
      'and cursor 0 gives D6 = $80008000, the no-zoom flags');

    arm25E29E(ram, D, A6_29E, { x: 0, y: 0, cursor: 0 });
    const before = bytesUsed(ram);
    draw25E29E(ram, rom, ctx, A6_29E);
    assert.deepEqual(emitsSince(ram, before), await reference25E29E(0, 0, 0x80008000));
  });

test('W374 $25E29E writes NO RAM of its own, and reads $4E/$50/$60 but never $62', { skip: SKIP },
  async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx } = await fx();
    arm25E29E(ram, D, A6_29E, { x: 0x0140, y: 0x0100, cursor: 8 });
    ram.setU16(A6_29E + 0x62, 0x7fff);        // ($62,A6) -- the DEAD head's field
    const snap = () => {
      const b = [];
      for (let i = 0; i < 0x70; i++) b.push(ram.u8(A6_29E + i));
      return b;
    };
    const before = snap();
    const beforeBytes = bytesUsed(ram);
    draw25E29E(ram, rom, ctx, A6_29E);
    assert.deepEqual(snap(), before,
      'not one byte of the record moved -- every write goes through $23E2F2 into the bucket');
    const withJunk62 = emitsSince(ram, beforeBytes);

    // ...and the DEAD head's field cannot reach an emit. Change it and nothing at all moves.
    ram.setU16(A6_29E + 0x62, 0x0000);
    const at2 = bytesUsed(ram);
    draw25E29E(ram, rom, ctx, A6_29E);
    assert.deepEqual(emitsSince(ram, at2), withJunk62,
      '($62,A6) is read ONLY by the dead head at $25E2A6/$25E2C2/$25E2D4/$25E2E8, so it is invisible');
  });

test('W374 $25E29E notes rather than invents when ($60,A6) leaves the declared window',
  { skip: SKIP }, async () => {
    const { draw25E29E, DRAW_25E29E: D, ram, rom, ctx, notes } = await fx();
    for (const cursor of [0x40, 0x02, 0xfffc]) {
      arm25E29E(ram, D, A6_29E, { cursor });
      const before = bytesUsed(ram);
      draw25E29E(ram, rom, ctx, A6_29E);
      assert.equal(bytesUsed(ram), before, `cursor $${cursor.toString(16)}: nothing is emitted`);
    }
    assert.deepEqual(notes, [D.leaAt, D.leaAt, D.leaAt],
      'three notes at $25E2F2, the lea whose window $25E480 + $40 the cursor left');
    // ...and every value $25D51C/$25D7AC/$25D7B6 can actually produce is silent.
    for (let cursor = 0; cursor <= D.rampLast; cursor += D.rampStep) {
      arm25E29E(ram, D, A6_29E, { cursor });
      const before = bytesUsed(ram);
      draw25E29E(ram, rom, ctx, A6_29E);
      assert.equal(bytesUsed(ram) - before, 4 * REC, `cursor $${cursor.toString(16)} draws`);
    }
    assert.equal(notes.length, 3, 'no reachable cursor adds a note');
  });
