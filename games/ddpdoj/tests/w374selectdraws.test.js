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
// $25EDF8 -- the routine whose BODY IS UNREACHABLE AS SHIPPED.
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

test('W374 $25EDF8 THE DEAD GATE: both real caller states emit NOTHING, only state 4 runs',
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

test('W374 $25EDF8 dead gate, proved from the ROM: the operand order and BOTH callers',
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
