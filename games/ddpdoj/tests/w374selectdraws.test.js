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
  return { ...mod, SCREEN17: s17.SCREEN17, ram: new Ram(), rom, ctx, notes };
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
