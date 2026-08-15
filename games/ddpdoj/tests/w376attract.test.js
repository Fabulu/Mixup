// W376 -- `$259FF8` (the warning screen's string emitter) and `$23CFDE` (the credit / FREE PLAY
// line): the two routines that kept a cold boot SILENT AND BLANK.
//
// Every ROM claim below is decoded from the raw image inside the test -- the instruction bytes,
// the lea displacements, the eight tail addresses, the font table's progression and the fourteen
// warning lines. Nothing is restated from a brief.
//
// WHAT EACH SECTION WOULD CATCH IF IT WERE WRONG:
//   1  the disassembly of `$259FF8`, including the ATTRIBUTE ORDER trap that separates it from
//      its near-twin `$25A14C`
//   2  the two ROM windows this wave declared for it, each proved by ABLATION
//   3  the emitter drawing, cell by cell, through the DEFERRED printer
//   4  the disassembly of `$23CFDE` -- four bands, eight tails, all twelve displacements
//   5  its four ROM windows, again by ablation
//   6  the four bands drawing four different lines
//   7  A COLD BOOT: the warning screen appearing, the credit line appearing, and a coin changing
//      the digit -- plus the one pre-existing throw that still ends the run there

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));

let _img = null;
const img = () => (_img ??= readFileSync(ROM));
let _tables = null;
const tables = () => (_tables ??= JSON.parse(readFileSync(TABLES, 'utf8')));

/** A read-only ROM face over the raw image -- the shape `RomWindows` presents, with no windows.
 *  Used wherever the point of the test is the DISASSEMBLY rather than the window list. */
function rawRom() {
  const d = img();
  return {
    u32: (a) => d.readUInt32BE(a), u16: (a) => d.readUInt16BE(a), u8: (a) => d[a],
    i16: (a) => d.readInt16BE(a), bytes: (a, n) => d.subarray(a, a + n),
  };
}

/** A `RomWindows` built from the exported table with `drop` (a list of window bases) REMOVED.
 *  This is the ablation harness: every window claim below is proved by showing the exact
 *  `Unreached` address that appears when its window is not there, against a POSITIVE CONTROL
 *  that shows the same read succeeding when it is. */
async function windowedRom(drop = []) {
  const { RomWindows } = await import('../src/rom.js');
  const spec = tables().rom;
  const kept = spec.windows.filter(
    (w) => !drop.includes(parseInt(String(w.base).replace('$', ''), 16)));
  assert.equal(kept.length, spec.windows.length - drop.length,
    'the ablation must actually remove the named windows -- a no-op filter proves nothing');
  return new RomWindows({ ...spec, windows: kept });
}

/** The `$904000` tilemap as text along ONE map column. `$25A14C`/`$240CF0` put the character
 *  BYTE straight in the tile's high word, so a credit line reads back as ASCII with no table. */
function txColumn(tx, col) {
  let s = '';
  for (let r = 0; r < 32; r++) {
    const v = tx.long(0x904000 + (r * 64 + col) * 4);
    const t = (v >>> 16) & 0x3fff;
    s += v === 0 ? '.' : (t >= 0x20 && t < 0x7f ? String.fromCharCode(t) : '?');
  }
  return s.replace(/\.+$/, '');
}

/** `assert.throws` returns nothing, and every ablation below has to READ the thrown
 *  `romAddress` -- "it threw" is not the claim, "it threw asking for THIS byte" is. */
function caught(fn) {
  try { fn(); } catch (e) { return e; }
  return assert.fail('expected a throw and got a clean return');
}

const txNonZero = (tx) => {
  let n = 0;
  for (let i = 0; i < 64 * 32; i++) if (tx.long(0x904000 + i * 4) !== 0) n++;
  return n;
};

/** A minimal chain for the two drawers: real RAM, a real TxVram, an armed defer buffer. */
async function fx() {
  const { Ram } = await import('../src/ram.js');
  const { TxVram, deferReset } = await import('../src/background.js');
  const ram = new Ram();
  deferReset(ram);                        // $240F08, which `camReset` runs from arm 13's init
  return { ram, tx: new TxVram(), rom: rawRom() };
}

/** Drain the `$80B058` defer buffer the way IRQ6's `$141258` does, so a test can see what the
 *  DEFERRED printer queued. `$259FF8` writes nothing to the tilemap directly -- it queues, and
 *  the flush lands it on the NEXT frame. */
async function flush(ram, tx) {
  const { flushTextDefer141258 } = await import('../src/hud.js');
  flushTextDefer141258(ram, tx, {});
}

// =============================================================================================
// 1. `$259FF8` -- THE DISASSEMBLY
// =============================================================================================

test('W376 $259FF8 is 74 bytes, $259FF8..$25A041, and every instruction is the one claimed',
  { skip: SKIP }, async () => {
    const d = img();
    // The whole routine, byte for byte, as `python tools/aligned.py sweep 0x259FF8 0x25A044`
    // decodes it. A single wrong byte here and the port below is a port of something else.
    const expect = [
      [0x259ff8, '48e7fffe'],       // movem.l d0-d7/a0-a6,-(a7)
      [0x259ffc, '343c0000'],       // move.w #$0,d2      <- FIRST
      [0x25a000, '3a02'],           // move.w d2,d5       <- SECOND: the attribute is HARDWIRED 0
      [0x25a002, '7401'],           // moveq #$1,d2       -- $240E1A's outer count, (D2+1) = 2
      [0x25a004, '7600'],           // moveq #$0,d3       -- (D3+1) = 1
      [0x25a006, '7800'],           // moveq #$0,d4       <- THE LOOP TOP
      [0x25a008, '1818'],           // move.b (a0)+,d4
      [0x25a00a, '4a04'],           // tst.b d4
      [0x25a00c, '6700002e'],       // beq.w $25A03C
      [0x25a010, '43fa0030'],       // lea ($25A042,pc),a1
      [0x25a014, '4e71'],           // nop
      [0x25a016, '024400ff'],       // andi.w #$FF,d4
      [0x25a01a, '04440020'],       // subi.w #$20,d4
      [0x25a01e, 'd844'],           // add.w d4,d4
      [0x25a020, 'd2c4'],           // adda.w d4,a1      -- SIGN-EXTENDED
      [0x25a022, '3811'],           // move.w (a1),d4
      [0x25a024, '4844'],           // swap d4
      [0x25a026, '3805'],           // move.w d5,d4
      [0x25a028, '2f05'],           // move.l d5,-(a7)
      [0x25a02a, '3a3c0010'],       // move.w #$10,d5
      [0x25a02e, '4eb900240e1a'],   // jsr $240E1A
      [0x25a034, '2a1f'],           // move.l (a7)+,d5
      [0x25a036, '06410100'],       // addi.w #$100,d1
      [0x25a03a, '60ca'],           // bra.s $25A006
      [0x25a03c, '4cdf7fff'],       // movem.l (a7)+,d0-d7/a0-a6
      [0x25a040, '4e75'],           // rts
    ];
    let a = 0x259ff8;
    for (const [at, hex] of expect) {
      assert.equal(a, at, `the previous instruction's length put us at $${a.toString(16)}`);
      assert.equal(d.subarray(a, a + hex.length / 2).toString('hex'), hex,
        `$${a.toString(16).toUpperCase()}`);
      a += hex.length / 2;
    }
    assert.equal(a, 0x25a042, 'the routine ENDS at $25A041 and the font table begins at $25A042');
    // $25A03A bra.s: PC after = $25A03C, disp $CA = -54, so it lands on the `moveq #$0,D4` at
    // $25A006 -- NOT on the `move.b` at $25A008. D4 is cleared EVERY character.
    assert.equal(0x25a03c + ((d[0x25a03b] << 24) >> 24), 0x25a006);
  });

test('W376 $259FF8 hardwires the attribute to ZERO -- $25A14C does the OPPOSITE, and the two '
  + 'are otherwise the same routine', { skip: SKIP }, async () => {
  const d = img();
  // $259FF8: move.w #$0,D2 (343C 0000) THEN move.w D2,D5 (3A02). The caller's D2 is destroyed
  // before it is ever read, so D5 -- the low word of every tile longword -- is 0.
  assert.equal(d.readUInt32BE(0x259ffc), 0x343c0000);
  assert.equal(d.readUInt16BE(0x25a000), 0x3a02);
  // $25A14C: move.w D2,D5 (3A02) FIRST, and no immediate before it. The caller's D2 IS the
  // attribute there. Same two instructions, opposite order, opposite contract.
  assert.equal(d.readUInt16BE(0x25a150), 0x3a02);
  assert.notEqual(d.readUInt32BE(0x25a14c), 0x343c0000);
  // ...and the port says so.
  const { FRONTTEXT } = await import('../src/fronttext.js');
  assert.equal(FRONTTEXT.emitAttr, 0x0000);
});

test('W376 $259FF8 has exactly ONE caller in the whole image, and it is arm 13\'s $25AC64',
  { skip: SKIP }, async () => {
    const d = img();
    const hits = [];
    for (let a = 0x200000; a + 6 <= d.length; a += 2) {
      const w = d.readUInt16BE(a);
      if ((w === 0x4eb9 || w === 0x4ef9) && d.readUInt32BE(a + 2) === 0x259ff8) hits.push(a);
      if (w === 0x4eba || w === 0x4efa) {                    // the pc-relative forms
        if (a + 2 + d.readInt16BE(a + 2) === 0x259ff8) hits.push(a);
      }
    }
    assert.deepEqual(hits, [0x25ac64], 'one jsr, in arm 13');
    // ...and the register set-up right before it. D1 and D2 are both `move.w #$0`, and D2 is
    // DEAD ($259FFC overwrites it), which is why the port passes no attribute at all.
    assert.equal(d.readUInt32BE(0x25ac58), 0x302d0008, '$25AC58 move.w ($8,A5),D0 -- the Y');
    assert.equal(d.readUInt32BE(0x25ac5c), 0x323c0000, '$25AC5C move.w #$0,D1');
    assert.equal(d.readUInt32BE(0x25ac60), 0x343c0000, '$25AC60 move.w #$0,D2 -- and it is dead');
  });

// =============================================================================================
// 2. THE TWO `$25xxxx` ROM WINDOWS, EACH PROVED BY ABLATION
// =============================================================================================

test('W376 the font table is 96 words at $25A042, pinned below by $259FF8\'s rts and above by '
  + 'the routine prologue at $25A102', { skip: SKIP }, async () => {
  const d = img();
  // The BASE, from the code: $25A010 lea ($25A042,pc),A1 -- EA = the EXTENSION WORD's own
  // address ($25A012) plus $30, NOT $25A010 + $30.
  assert.equal(d.readUInt16BE(0x25a010), 0x43fa);
  assert.equal(0x25a012 + d.readInt16BE(0x25a012), 0x25a042);
  // The END. $25A102 is a routine PROLOGUE, not more table: `movem.l d0-d7/a0-a6,-(a7)`.
  assert.equal(d.readUInt32BE(0x25a102), 0x48e7fffe);
  // ...and the routine it opens really is a routine: its own movem/rts epilogue closes it.
  assert.equal(d.readUInt32BE(0x25a146), 0x4cdf7fff, '$25A146 movem.l (a7)+,d0-d7/a0-a6');
  assert.equal(d.readUInt16BE(0x25a14a), 0x4e75, '$25A14A rts -- $25A102\'s own end');
  // The table's own arithmetic, which is what makes 96 the right count and not 95 or 97:
  // entry i is $80 + (i >> 4) * $20 + (i & $F), for i = 0..95 and for NO further i.
  for (let i = 0; i < 96; i++) {
    assert.equal(d.readUInt16BE(0x25a042 + i * 2), 0x80 + (i >> 4) * 0x20 + (i & 0xf),
      `font entry ${i} (char $${(0x20 + i).toString(16)})`);
  }
  assert.notEqual(d.readUInt16BE(0x25a042 + 96 * 2), 0x80 + 6 * 0x20,
    'the progression STOPS at 96 -- the next word is the movem, not $0140');
  assert.equal(0x25a042 + 0xc0, 0x25a102);
  // The window as exported.
  const w = tables().rom.windows.find((x) => parseInt(String(x.base).replace('$', ''), 16)
    === 0x25a042);
  assert.ok(w, 'export-tables.py declares $25A042');
  assert.equal(w.len, 0xc0);
});

test('W376 ABLATION: without the $25A042 window the emitter throws Unreached at $25A042 -- '
  + 'and with it, the same call draws', { skip: SKIP }, async () => {
  const { txFontString259FF8 } = await import('../src/fronttext.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram, deferReset } = await import('../src/background.js');

  // POSITIVE CONTROL FIRST. The fixture CAN see the table when the window is present, so the
  // failure below is the window's absence and not a broken fixture.
  {
    const ram = new Ram(); deferReset(ram);
    const tx = new TxVram();
    txFontString259FF8(ram, await windowedRom([]), 0xb8, 0x0000, 0x25aa36);
    await flush(ram, tx);
    assert.ok(txNonZero(tx) > 0, 'with every window declared, the first warning line draws');
  }
  {
    const ram = new Ram(); deferReset(ram);
    const rom = await windowedRom([0x25a042]);
    const e = caught(() => txFontString259FF8(ram, rom, 0xb8, 0x0000, 0x25aa36));
    assert.equal(e.name, 'Unreached');
    assert.equal(e.romAddress, 0x25a042,
      'the exact address the missing window is asked for: the SPACE glyph, char $20, index 0');
  }
});

test('W376 the fourteen warning lines are $1C0 bytes at $25AA36, and BOTH ends come from the '
  + 'code that reads them', { skip: SKIP }, async () => {
  const d = img();
  // BASE: $25AC50 lea ($25AA36,pc),A0 -- EA = $25AC52 + $FDE4.
  assert.equal(d.readUInt16BE(0x25ac50), 0x41fa);
  assert.equal(0x25ac52 + d.readInt16BE(0x25ac52), 0x25aa36);
  // LENGTH: $25AC36 cmpi.w #$1C0,($6,A5) is the terminal cursor and $25AC70 addi.w #$20 the
  // stride -- a COUNT IN THE CODE, not a terminator eyeballed in the data.
  assert.equal(d.readUInt32BE(0x25ac36), 0x0c6d01c0);
  assert.equal(d.readUInt16BE(0x25ac3a), 0x0006, '...and the field is ($6,A5), the cursor');
  assert.equal(d.readUInt32BE(0x25ac70), 0x066d0020);
  assert.equal(d.readUInt16BE(0x25ac74), 0x0006);
  // ...and $25AA36 + $1C0 is arm 13's OWN entry point. The data ends exactly where the code
  // that walks it begins.
  assert.equal(0x25aa36 + 0x1c0, 0x25abf6);
  const { SCREEN8 } = await import('../src/objslot8.js');
  assert.equal(SCREEN8.warnStrings, 0x25aa36);
  assert.equal(0x1c0 / 0x20, 14);
  // Each of the fourteen is 28 characters and a NUL -- the bound `$25A15A tst.b D4 / beq` uses.
  for (let i = 0; i < 14; i++) {
    const line = d.subarray(0x25aa36 + i * 0x20, 0x25aa36 + i * 0x20 + 0x20);
    assert.equal(line.indexOf(0), 28, `line ${i} is NUL-terminated at +28`);
    for (const c of line.subarray(0, 28)) {
      assert.ok(c >= 0x20 && c <= 0x59, `line ${i} char $${c.toString(16)} is in $20..$59`);
    }
  }
  assert.equal(d.subarray(0x25aa36, 0x25aa36 + 28).toString('latin1'),
    '  THIS GAME IS FOR USE IN   ');
  assert.equal(d.subarray(0x25abd6, 0x25abd6 + 28).toString('latin1'),
    '    2002.10.07.BLACK VER    ');
});

test('W376 ABLATION: without the $25AA36 window arm 13 throws Unreached at $25AA36',
  { skip: SKIP }, async () => {
    const { txFontString259FF8 } = await import('../src/fronttext.js');
    const { Ram } = await import('../src/ram.js');
    const { deferReset } = await import('../src/background.js');
    const ram = new Ram(); deferReset(ram);
    const rom = await windowedRom([0x25aa36]);
    const e = caught(() => txFontString259FF8(ram, rom, 0xb8, 0x0000, 0x25aa36));
    assert.equal(e.name, 'Unreached');
    assert.equal(e.romAddress, 0x25aa36, 'the first byte of the first line');
  });

// =============================================================================================
// 3. `$259FF8` DRAWING -- through the DEFERRED printer, two cells per glyph
// =============================================================================================

test('W376 each glyph is TWO cells, tiles T and T + $10, and the string advances $100 a '
  + 'character', { skip: SKIP }, async () => {
  const { txFontString259FF8 } = await import('../src/fronttext.js');
  const { ram, tx } = await fx();
  const rom = await windowedRom([]);
  // "  THIS..." at the Y arm 13's init arms, $B8.
  txFontString259FF8(ram, rom, 0x00b8, 0x0000, 0x25aa36);
  await flush(ram, tx);

  // $240E1A's dest is $904000 + (D6 + D0), D6 = D1 stepping $100 an INNER pass and D0 stepping
  // -4 an OUTER one. With D3 = 0 there is one inner pass, so each character is two cells: one
  // at D1 + $B8 and one at D1 + $B4.
  const cell = (off) => tx.long(0x904000 + off);
  const d = img();
  for (let n = 0; n < 28; n++) {
    const ch = d[0x25aa36 + n];
    const tile = d.readUInt16BE(0x25a042 + (ch - 0x20) * 2);
    const base = n * 0x100;
    assert.equal(cell(base + 0xb8), (0xc0000000 | (tile << 16)) >>> 0,
      `char ${n} ($${ch.toString(16)}) upper cell`);
    assert.equal(cell(base + 0xb4), (0xc0000000 | ((tile + 0x10) << 16)) >>> 0,
      `char ${n} lower cell -- the SECOND glyph tile, T + $10 from $240E1A's $10 stride`);
  }
  // 28 characters, two cells each, and the NUL at +28 stops it. Not 29, and not 32.
  assert.equal(txNonZero(tx), 56);
});

test('W376 the attribute in every warning-screen cell is ZERO, whatever the caller passes',
  { skip: SKIP }, async () => {
    const { txFontString259FF8 } = await import('../src/fronttext.js');
    const { ram, tx } = await fx();
    txFontString259FF8(ram, await windowedRom([]), 0x00b8, 0x0000, 0x25aa36);
    await flush(ram, tx);
    for (let i = 0; i < 64 * 32; i++) {
      const v = tx.long(0x904000 + i * 4);
      if (v !== 0) assert.equal(v & 0xffff, 0x0000, `cell ${i} low word`);
    }
  });

test('W376 arm 13 emits one line a frame for fourteen frames and then stops at $1C0',
  { skip: SKIP }, async () => {
    const { objSlot8, SCREEN8 } = await import('../src/objslot8.js');
    const { Ram } = await import('../src/ram.js');
    const { TxVram } = await import('../src/background.js');
    const ram = new Ram();
    const tx = new TxVram();
    const ctx = { tx, unported: { note: () => {} } };
    const rom = await windowedRom([]);
    const a5 = 0x812600;
    ram.setU8(a5 + SCREEN8.constructed, 1);
    ram.setU16(SCREEN8.state, 0x000d);

    objSlot8(ram, rom, a5, ctx);                       // the init frame -- $25AC34 rts
    await flush(ram, tx);
    assert.equal(txNonZero(tx), 0, 'the init frame draws NOTHING');

    const counts = [];
    for (let f = 0; f < 20; f++) {
      objSlot8(ram, rom, a5, ctx);
      await flush(ram, tx);
      counts.push(txNonZero(tx));
    }
    // 56 cells a line (28 characters, two cells each), fourteen lines, then flat.
    assert.deepEqual(counts.slice(0, 14), Array.from({ length: 14 }, (_, i) => (i + 1) * 56));
    assert.deepEqual(counts.slice(14), Array.from({ length: 6 }, () => 14 * 56));
    assert.equal(ram.u16(a5 + SCREEN8.cursor), 0x01c0);
    // ...and the Y really did step DOWN by $C: line 13's cells sit $C * 13 BELOW line 0's.
    assert.notEqual(tx.long(0x904000 + 0xb8), 0, 'line 0 at Y = $B8');
    assert.notEqual(tx.long(0x904000 + (0xb8 - 13 * 0xc)), 0, 'line 13 at Y = $B8 - 13 * $C');
  });

// =============================================================================================
// 4. `$23CFDE` -- THE DISASSEMBLY. Four bands, eight tails, twelve displacements.
// =============================================================================================

test('W376 $23CFDE\'s dispatcher is $23CFDE..$23D05F and its four bands are $12, $11, $9..$10 '
  + 'and everything else', { skip: SKIP }, async () => {
  const d = img();
  const expect = [
    [0x23cfde, '7000'],             // moveq #$0,d0
    [0x23cfe0, '7200'],             // moveq #$0,d1
    [0x23cfe2, '103900803808'],     // move.b $803808,d0
    [0x23cfe8, '12390080380b'],     // move.b $80380B,d1
    [0x23cfee, '0c400012'],         // cmpi.w #$12,d0
    [0x23cff2, '66000018'],         // bne.w $23D00A
    [0x23cff6, '0c010001'],         // cmpi.b #$1,d1
    [0x23cffa, '6706'],             // beq.s $23D002
    [0x23cffc, '4efafdb8'],         // jmp $23CDB6
    [0x23d000, '4e71'],
    [0x23d002, '4ebafdca'],         // jsr $23CDCE
    [0x23d006, '4efafdd0'],         // jmp $23CDD8
    [0x23d00a, '4e71'],
    [0x23d00c, '0c400011'],         // cmpi.w #$11,d0
    [0x23d010, '6616'],             // bne.s $23D028
    [0x23d012, '0c010001'],
    [0x23d016, '6706'],
    [0x23d018, '4efafdde'],         // jmp $23CDF8
    [0x23d01c, '4e71'],
    [0x23d01e, '4ebafe02'],         // jsr $23CE22
    [0x23d022, '4efafe22'],         // jmp $23CE46
    [0x23d026, '4e71'],
    [0x23d028, '0c400010'],         // cmpi.w #$10,d0
    [0x23d02c, '6e1c'],             // bgt.s $23D04A -- the DEFAULT band
    [0x23d02e, '0c400009'],         // cmpi.w #$9,d0
    [0x23d032, '6d16'],             // blt.s $23D04A -- same target
    [0x23d034, '0c010001'],
    [0x23d038, '6706'],
    [0x23d03a, '4efafe50'],         // jmp $23CE8C
    [0x23d03e, '4e71'],
    [0x23d040, '4ebafe8e'],         // jsr $23CED0
    [0x23d044, '4efafed6'],         // jmp $23CF1C
    [0x23d048, '4e71'],
    [0x23d04a, '0c010001'],
    [0x23d04e, '6706'],
    [0x23d050, '4efaff20'],         // jmp $23CF72
    [0x23d054, '4e71'],
    [0x23d056, '4ebaff3e'],         // jsr $23CF96
    [0x23d05a, '4efaff5e'],         // jmp $23CFBA
    [0x23d05e, '4e71'],
  ];
  let a = 0x23cfde;
  for (const [at, hex] of expect) {
    assert.equal(a, at);
    assert.equal(d.subarray(a, a + hex.length / 2).toString('hex'), hex,
      `$${a.toString(16).toUpperCase()}`);
    a += hex.length / 2;
  }
  assert.equal(a, 0x23d060, '$23D060 is creditSpend23D060, already ported in objslot8.js');
  // Every jsr/jmp target, recomputed from the EXTENSION WORD's own address plus its
  // displacement -- the trap that has cost this codebase a wave before.
  const target = (op) => op + 2 + d.readInt16BE(op + 2);
  assert.deepEqual(
    [0x23cffc, 0x23d002, 0x23d006, 0x23d018, 0x23d01e, 0x23d022,
      0x23d03a, 0x23d040, 0x23d044, 0x23d050, 0x23d056, 0x23d05a].map(target),
    [0x23cdb6, 0x23cdce, 0x23cdd8, 0x23cdf8, 0x23ce22, 0x23ce46,
      0x23ce8c, 0x23ced0, 0x23cf1c, 0x23cf72, 0x23cf96, 0x23cfba]);
  // The band bounds, so "9..$10" is not a paraphrase: bgt above $10 and blt below $9 BOTH go to
  // the same default arm, and both compares sit BELOW the $12 and $11 tests.
  assert.equal(0x23d02e + d[0x23d02d], 0x23d04a, '$23D02C bgt -> $23D04A');
  assert.equal(0x23d034 + d[0x23d033], 0x23d04a, '$23D032 blt -> the same $23D04A');
});

test('W376 the separate-pool arms are jsr THEN jmp -- BOTH sides print, and the shared-pool '
  + 'arms are a single jmp', { skip: SKIP }, async () => {
  const d = img();
  for (const [pair, single] of [[0x23d002, 0x23cffc], [0x23d01e, 0x23d018],
    [0x23d040, 0x23d03a], [0x23d056, 0x23d050]]) {
    assert.equal(d.readUInt16BE(pair), 0x4eba, `$${pair.toString(16)} is jsr (d16,PC)`);
    assert.equal(d.readUInt16BE(pair + 4), 0x4efa, '...immediately followed by jmp (d16,PC)');
    assert.equal(d.readUInt16BE(single), 0x4efa, 'the shared-pool arm is ONE jmp');
  }
});

test('W376 $23CDCE and $23CDD8 are TWO ENTRIES that fall into ONE body at $23CDE0',
  { skip: SKIP }, async () => {
    const d = img();
    assert.equal(d.readUInt32BE(0x23cdce), 0x303c0003, '$23CDCE move.w #$3,D0');
    assert.equal(d.readUInt32BE(0x23cdd2), 0x323c0003, '$23CDD2 move.w #$3,D1');
    assert.equal(d.readUInt16BE(0x23cdd6), 0x6008, '$23CDD6 bra.s -- OVER $23CDD8');
    assert.equal(0x23cdd8 + 8, 0x23cde0, '...landing on $23CDE0');
    assert.equal(d.readUInt32BE(0x23cdd8), 0x303c0011, '$23CDD8 move.w #$11,D0 -- the P2 entry');
    // The shared body: the same lea, the same D2, the same tail jump.
    assert.equal(0x23cde2 + d.readInt16BE(0x23cde2), 0x23cdac, '$23CDE0 lea $23CDAC');
    assert.equal(d.readUInt32BE(0x23cde4), 0x343c0000, '$23CDE4 move.w #$0,D2');
    assert.equal(d.readUInt16BE(0x23cde8), 0x4ef9);
    assert.equal(d.readUInt32BE(0x23cdea), 0x25a14c, '$23CDE8 jmp $25A14C');
  });

test('W376 $23CD80 turns the LOW NIBBLE into one ASCII character, hex digits included',
  { skip: SKIP }, async () => {
    const d = img();
    assert.equal(d.readUInt32BE(0x23cd80), 0x48e7f800, 'movem.l d0-d4,-(a7)');
    assert.equal(d.readUInt16BE(0x23cd84), 0x0284, 'andi.l ...');
    assert.equal(d.readUInt32BE(0x23cd86), 0x0000000f, '...#$F,d4 -- the LOW NIBBLE ONLY');
    assert.equal(d.readUInt16BE(0x23cd8a), 0x3a02, 'move.w d2,d5 -- the attribute, read FIRST');
    assert.equal(d.readUInt32BE(0x23cd90), 0x0c04000a, 'cmpi.b #$A,d4');
    assert.equal(d.readUInt16BE(0x23cd96), 0x5e44, 'addq.w #$7,d4');
    assert.equal(d.readUInt32BE(0x23cd98), 0x06440030, 'addi.w #$30,d4');
    assert.equal(d.readUInt16BE(0x23cda0), 0x4eb9);
    assert.equal(d.readUInt32BE(0x23cda2), 0x240cf0, 'jsr $240CF0 -- the DIRECT blit');
    assert.equal(d.readUInt16BE(0x23cdaa), 0x4e75);

    // ...and the port agrees, digit for digit. `$1A` prints `A`, not `1A` and not `9`.
    const { creditLine23CFDE } = await import('../src/fronttext.js');
    const { Ram } = await import('../src/ram.js');
    const { TxVram } = await import('../src/background.js');
    const rom = await windowedRom([]);
    for (const [value, glyph] of [[0, '0'], [9, '9'], [0x0a, 'A'], [0x0f, 'F'],
      [0x10, '0'], [0x1a, 'A'], [0xff, 'F']]) {
      const ram = new Ram(); const tx = new TxVram();
      ram.setU8(0x80395a, value);
      creditLine23CFDE(ram, rom, tx);
      assert.equal(txColumn(tx, 3), '..........CREDITS:' + glyph,
        `$80395A = $${value.toString(16)}`);
    }
  });

test('W376 $23CFDE has ONE caller and $23CD80 has twenty-four -- so the digit printer is '
  + 'EXPORTED and the credit line is not', { skip: SKIP }, async () => {
  const d = img();
  const refs = (tgt) => {
    const out = [];
    for (let a = 0x130000; a + 6 <= d.length; a += 2) {
      const w = d.readUInt16BE(a);
      if ((w === 0x4eb9 || w === 0x4ef9) && d.readUInt32BE(a + 2) === tgt) out.push(a);
      else if ((w === 0x4eba || w === 0x4efa) && a + 2 + d.readInt16BE(a + 2) === tgt) out.push(a);
    }
    return out;
  };
  assert.deepEqual(refs(0x23cfde), [0x25a85c], 'the credit line is slot [8]\'s tail and nothing else');
  const digitCallers = refs(0x23cd80);
  assert.equal(digitCallers.length, 24);
  // FIFTEEN are inside $23CFDE's own tails; the NINE outside are why hexDigit23CD80 is exported
  // rather than private -- a later wave would otherwise transcribe it a second time.
  const outside = digitCallers.filter((a) => a < 0x23cd80 || a > 0x23cfdd);
  assert.deepEqual(outside,
    [0x25b0aa, 0x25b0f2, 0x25b32a, 0x25b362, 0x25e1b4, 0x25e1f4, 0x25f3c6, 0x25f408, 0x2886f4]);
  const { hexDigit23CD80 } = await import('../src/fronttext.js');
  assert.equal(typeof hexDigit23CD80, 'function', 'and it is exported for them');
});

// =============================================================================================
// 5. THE FOUR `$23Cxxx` STRING WINDOWS, EACH PROVED BY ABLATION
// =============================================================================================

test('W376 the six strings are NUL-terminated where the port says and each run ends on the '
  + 'first instruction of the tail that leas it', { skip: SKIP }, async () => {
  const d = img();
  const cases = [
    [0x23cdac, 'FREE PLAY', 0x23cdb5, 0x23cdb6],
    [0x23cdf0, 'COINS:', 0x23cdf6, 0x23cdf8],
    [0x23ce6a, 'CREDITS: ( / )', 0x23ce78, 0x23ce7a],
    [0x23ce7a, 'CREDITS', 0x23ce81, 0x23ce83],
    [0x23ce83, '  ( / )', 0x23ce8a, 0x23ce8c],
    [0x23cf68, 'CREDITS:', 0x23cf70, 0x23cf72],
  ];
  for (const [base, text, nul, next] of cases) {
    assert.equal(d.subarray(base, base + text.length).toString('latin1'), text);
    assert.equal(d[nul], 0, `$${nul.toString(16)} is the NUL $25A15A tst.b/beq stops on`);
    assert.equal(base + text.length, nul, 'and nothing between the text and the NUL');
    for (let a = nul; a < next; a++) assert.equal(d[a], 0, 'only NUL/pad up to the next thing');
  }
  // The three middle strings are ADJACENT, which is why they are ONE window and not three.
  assert.equal(0x23ce6a + 0x22, 0x23ce8c);
  // ...and the four windows are exported at exactly those extents.
  const byBase = new Map(tables().rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]));
  assert.equal(byBase.get(0x23cdac), 0x000a);
  assert.equal(byBase.get(0x23cdf0), 0x0008);
  assert.equal(byBase.get(0x23ce6a), 0x0022);
  assert.equal(byBase.get(0x23cf68), 0x000a);
});

test('W376 ABLATION: each of the four string windows is REQUIRED, and the band that needs it '
  + 'names its exact first byte', { skip: SKIP }, async () => {
  const { creditLine23CFDE } = await import('../src/fronttext.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  // dip $803808, dip $80380B, the window that band reads, the address it dies on.
  const cases = [
    [0x12, 0x00, 0x23cdac, 0x23cdac],   // FREE PLAY, shared
    [0x11, 0x00, 0x23cdf0, 0x23cdf0],   // coin mode, shared
    [0x0a, 0x00, 0x23ce6a, 0x23ce6a],   // the $9..$10 band, shared
    [0x00, 0x00, 0x23cf68, 0x23cf68],   // the DEFAULT band -- a cold boot's
  ];
  for (const [dip, dip2, drop, addr] of cases) {
    // POSITIVE CONTROL: with every window present the same band draws something.
    const ok = new TxVram(); const okRam = new Ram();
    okRam.setU8(0x803808, dip); okRam.setU8(0x80380b, dip2);
    creditLine23CFDE(okRam, await windowedRom([]), ok);
    assert.ok(txNonZero(ok) > 0, `dip $${dip.toString(16)} draws when the window is there`);
    // ...and without it, the named address.
    const ram = new Ram();
    ram.setU8(0x803808, dip); ram.setU8(0x80380b, dip2);
    const ablated = await windowedRom([drop]);
    const e = caught(() => creditLine23CFDE(ram, ablated, new TxVram()));
    assert.equal(e.name, 'Unreached',
      `dip $${dip.toString(16)} must need $${drop.toString(16)}`);
    assert.equal(e.romAddress, addr);
  }
});

// =============================================================================================
// 6. THE FOUR BANDS DRAW FOUR DIFFERENT LINES
// =============================================================================================

test('W376 the four coinage bands and the two pool modes draw eight different lines',
  { skip: SKIP }, async () => {
    const { creditLine23CFDE } = await import('../src/fronttext.js');
    const { Ram } = await import('../src/ram.js');
    const { TxVram } = await import('../src/background.js');
    const rom = await windowedRom([]);

    const draw = (dip, dip2, seed = {}) => {
      const ram = new Ram(); const tx = new TxVram();
      ram.setU8(0x803808, dip); ram.setU8(0x80380b, dip2);
      for (const [a, v] of Object.entries(seed)) ram.setU8(Number(a), v);
      creditLine23CFDE(ram, rom, tx);
      return tx;
    };
    // The counters, chosen so every one is distinguishable in the output.
    const seed = { 0x803956: 3, 0x803958: 1, 0x80395a: 2, 0x80395e: 4, 0x803960: 5 };

    // FREE PLAY, shared: one "FREE PLAY" at map row $A.
    let tx = draw(0x12, 0x00, seed);
    assert.equal(txColumn(tx, 3), '..........FREE PLAY');
    // FREE PLAY, separate: TWO of them, at $3 and $11 -- the jsr + jmp pair.
    tx = draw(0x12, 0x01, seed);
    assert.equal(txColumn(tx, 3), '...FREE PLAY.....FREE PLAY');

    // COIN MODE ($11), shared: "COINS:" at $B and the SUM of both slots six on, at $11.
    tx = draw(0x11, 0x00, seed);
    assert.equal(txColumn(tx, 3), '...........COINS:5', '1 + 4 = 5, a BYTE add');
    // ...separate: two labels, each with its own slot's count.
    tx = draw(0x11, 0x01, seed);
    assert.equal(txColumn(tx, 3), '....COINS:1.......COINS:4');

    // THE $9..$10 BAND, shared: credits, coins and coins-per-credit on ONE line, the three
    // digits landing in the label's own three blanks.
    tx = draw(0x0a, 0x00, seed);
    assert.equal(txColumn(tx, 3), '.......CREDITS:2(5/3)', 'credits 2, coins 1+4, per credit 3');
    // ...separate: TWO lines, and the P2 one reads the OTHER pool.
    tx = draw(0x0a, 0x01, seed);
    // Column 3 carries ONLY "  ( / )" and the three digits that overwrite its blanks; the word
    // "CREDITS" is on column 4, because $23CED0 prints it with D1 = 4 and the rest with D1 = 3.
    assert.equal(txColumn(tx, 3), '... 2(1/3)....... 5(4/3)',
      'P1 reads $803958/$80395A and P2 reads $80395E/$803960 -- the OTHER pool');
    assert.equal(txColumn(tx, 4), '...CREDITS.......CREDITS',
      'the "CREDITS" half of each is one map column over -- D1 = 4, not 3');

    // THE DEFAULT BAND: no coin count at all, and a cold boot ($803808 = 0) lands here.
    tx = draw(0x00, 0x00, seed);
    assert.equal(txColumn(tx, 3), '..........CREDITS:2');
    tx = draw(0x00, 0x01, seed);
    assert.equal(txColumn(tx, 3), '...CREDITS:2.....CREDITS:5');
    // $8 is inside the default band and $9 is not -- the boundary, from the two compares.
    assert.equal(txColumn(draw(0x08, 0x00, seed), 3), '..........CREDITS:2');
    assert.notEqual(txColumn(draw(0x09, 0x00, seed), 3), '..........CREDITS:2');
    assert.equal(txColumn(draw(0x10, 0x00, seed), 3), '.......CREDITS:2(5/3)');
    assert.equal(txColumn(draw(0x11, 0x00, seed), 3), '...........COINS:5');
  });

test('W376 the credit line is DIRECT and the warning screen is DEFERRED -- one frame apart',
  { skip: SKIP }, async () => {
    const { creditLine23CFDE, txFontString259FF8 } = await import('../src/fronttext.js');
    const { ram, tx } = await fx();
    const rom = await windowedRom([]);
    creditLine23CFDE(ram, rom, tx);
    assert.ok(txNonZero(tx) > 0, '$23CFDE writes TxVram in the same call');
    const after = txNonZero(tx);
    txFontString259FF8(ram, rom, 0x00b8, 0x0000, 0x25aa36);
    assert.equal(txNonZero(tx), after, '$259FF8 writes NOTHING until the flush');
    await flush(ram, tx);
    assert.ok(txNonZero(tx) > after, '...and everything after it');
  });

// =============================================================================================
// 7. A COLD BOOT
// =============================================================================================

/** `Game#boot()` then n `step()`s from ZEROED RAM -- the brief's own baseline. */
async function coldBoot(n, { dips = {} } = {}) {
  const { Game } = await import('../src/main.js');
  const g = new Game(new Uint8Array(0x20000), tables(), { palCatchUp: false });
  g.boot();
  for (const [a, v] of Object.entries(dips)) g.ram.setU8(Number(a), v);
  for (let i = 0; i < n; i++) g.step(0xffff);
  return g;
}

test('W376 A COLD BOOT DRAWS THE WARNING SCREEN: 784 tilemap cells by frame 16, and it stays '
  + 'up for the whole $12C', { skip: SKIP }, async () => {
  const g = await coldBoot(20);
  assert.equal(g.ram.u16(0x812e56), 0x000d, 'still arm 13');
  // 14 lines x 28 characters x 2 cells. The line walk starts on frame 3 (init frame, then the
  // $1 delay, then the deferred flush is one frame behind), so 16 frames is comfortably past it.
  assert.equal(txNonZero(g.txvram), 784);
  const g2 = await coldBoot(300);
  assert.equal(g2.ram.u16(0x812e56), 0x000d, 'the $12C has not expired at frame 300');
  assert.equal(txNonZero(g2.txvram), 784, 'and the screen is still up');
});

test('W376 the warning screen reads as the ROM\'s own fourteen lines when the tilemap is '
  + 'decoded back through the font table', { skip: SKIP }, async () => {
  const d = img();
  const g = await coldBoot(20);
  // tile -> character, the inverse of $25A042. The SECOND cell of each glyph is T + $10, which
  // is deliberately NOT in this map -- so a line that decoded cleanly proves the port used the
  // upper half where the cartridge does.
  const rev = new Map();
  for (let i = 0; i < 96; i++) rev.set(d.readUInt16BE(0x25a042 + i * 2), String.fromCharCode(0x20 + i));

  for (let line = 0; line < 14; line++) {
    // Character n of line L sits at map offset n * $100 + ($B8 - L * $C).
    let out = '';
    for (let n = 0; n < 28; n++) {
      const v = g.txvram.long(0x904000 + n * 0x100 + (0xb8 - line * 0x0c));
      out += rev.get((v >>> 16) & 0x3fff) ?? '?';
    }
    assert.equal(out, d.subarray(0x25aa36 + line * 0x20, 0x25aa36 + line * 0x20 + 28)
      .toString('latin1'), `line ${line}`);
  }
});

test('W376 the credit line appears the frame AFTER 13 -> 2, because arm 2\'s init clears TX '
  + 'behind the tail that drew it', { skip: SKIP }, async () => {
  const { Game } = await import('../src/main.js');
  const g = new Game(new Uint8Array(0x20000), tables(), { palCatchUp: false });
  g.boot();
  const seen = [];
  for (let i = 0; i < 306; i++) {
    g.step(0xffff);
    seen.push([g.ram.u16(0x812e56), txNonZero(g.txvram)]);
  }
  // 300 frames of arm 13 at 784 cells, then the transition frame -- state 13's tail draws NO
  // credit line ($25A82C cmpi.w #$D / beq) and $25AC8A clears TX -- then one frame where the
  // tail draws and arm 2's init clears it again, then the line stays.
  assert.deepEqual(seen[300], [0x000d, 784]);
  assert.deepEqual(seen[301], [0x0002, 0], 'the $12C expiry frame wipes the warning screen');
  assert.deepEqual(seen[302], [0x0002, 0], 'arm 2\'s $25A91E clears the line the tail just drew');
  // **W377 CHANGED THIS COUNT FROM 9 TO 87, AND THE EXTRA 78 ARE A NEW PORT, NOT A LEAK.**
  // `$25AFD8` -- the blink message's OFF half -- is ported now (`fronttext.js blinkOff25AFD8`)
  // and the tail calls it for real on OFF frames. It blits 28 + 26 + 24 = 78 blank cells at
  // D1 = $13/$12/$11, and the blink counter is 1, 2, 3... here, so every frame in this window
  // is an OFF frame. 9 + 78 = 87. The credit line's own column is unaffected, which is what
  // the next assertion still pins.
  assert.deepEqual(seen[303], [0x0002, 87],
    '"CREDITS:" + one digit = 9 cells, plus $25AFD8\'s 78 blanks');
  assert.equal(txColumn(g.txvram, 3), '..........CREDITS:0');
});

// **W377 REWROTE THIS TEST'S ENDING, BECAUSE THE ENDING WAS THE BUG.**
// It used to assert that `g.step()` THROWS `no wrapper at $28C170` one frame after the credit
// line updates -- i.e. it pinned the crash that made a coin unsurvivable on a cold boot. Arm 3
// now COUNTS `$28C170` instead of posting it (`objslot8.js`; `sound.js`'s header forbids giving
// that address a `WRAPPERS` row), so the step returns cleanly and the run continues. The claim
// this test still makes -- the coin changes what is on screen, `CREDITS:0` -> `CREDITS:1` -- is
// unchanged and is now checked on a run that SURVIVES. See `w377coin.test.js`.
test('W377 A COIN CHANGES WHAT IS ON SCREEN: CREDITS:0 -> CREDITS:1, and the run SURVIVES it',
  { skip: SKIP }, async () => {
  const { COIN } = await import('../src/isr.js');
  const { COIN_BITS } = await import('../src/web/input.js');
  const coinWord = (...names) => {
    let w = 0xffff;
    for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
    return w;
  };
  // `$803957` is `COIN.creditsPerCoin`, and on ZEROED ram it is 0 -- so on a literally cold
  // machine a coin is worth no credits at all and nothing on screen moves. The shipped seed
  // carries 1, so that is what a real board does and what this test sets.
  const g = await coldBoot(320, { dips: { 0x803957: 1 } });
  assert.equal(txColumn(g.txvram, 3), '..........CREDITS:0');
  assert.equal(g.ram.u8(0x80395a), 0);

  g.coinPort = coinWord('COIN1');                     // Digit5 on the page
  for (let i = 0; i < 12; i++) g.step(0xffff);        // ~6 debounce calls, inside [3, $26]
  assert.equal(g.ram.u8(0x80395a), 0, 'a HELD coin credits nothing -- the credit is on release');
  g.coinPort = COIN.idle;
  // Four more frames: the debounce finalises, `$13CF86` hands the pending word to IRQ6, and
  // `coinage13CE22` writes `$80395A`. `objSlot8` sees it in the SAME frame, so `$25A7C0` tears
  // the screen down and `$25A82A rts` returns without the tail -- the tilemap goes blank.
  for (let i = 0; i < 4; i++) g.step(0xffff);
  assert.equal(g.ram.u8(0x80395a), 1, 'the coin credited');
  assert.equal(txNonZero(g.txvram), 0, '$25A814 cleared TX and $25A82A rts\'d before the tail');
  g.step(0xffff);                                     // arm 0 on the restaged record -> state 3
  assert.equal(g.ram.u16(0x812e56), 0x0003);

  // The next frame's TAIL draws the credit line with the new count, and then arm 3's init runs
  // `$25A962 jsr $28C170` -- which is COUNTED now, not posted, so the frame completes.
  assert.doesNotThrow(() => g.step(0xffff), 'W377: arm 3 no longer throws on $28C170');
  assert.equal(txColumn(g.txvram, 3), '..........CREDITS:1', 'the credit line updated');
  assert.ok(g.unportedLog.report().some((s) => s.includes('$28C170')),
    'and the cue it cannot post is on the unported report rather than gone');
  // And it keeps running: thirty more frames of arm 3 with the credit still in hand.
  for (let i = 0; i < 30; i++) g.step(0xffff);
  assert.equal(g.ram.u16(0x812e56), 0x0003, 'still on the credit screen');
  assert.equal(g.ram.u8(0x80395a), 1, 'with the credit unspent');
});

// W388 RE-BASE. This test was named `the attract loop does NOT cycle` and PINNED the stall it
// describes: arm 2 held at `$812E56 = 2` because `$25B480 jsr $24681A` never answered zero.
//
// **W376 DIAGNOSED IT CORRECTLY AND THE MEASUREMENTS BELOW WERE ALL TRUE.** The eight nodes did
// step every frame and none ever expired -- because `chainLoader246710` allocated them and seeded
// no CONTENT, leaving each node's executor pointer `($6)` zero, which is the exact field
// `runAnimObjects24683E` tests before it will step a node. W388 ports `$24676A..$2467C3`, the
// 90-byte block `$246710` runs inside its own allocation loop, so the chain now drains.
//
// The assertions are re-based to what the cartridge does now, NOT weakened: every one of them is
// the same measurement with the opposite (and now correct) expectation.
test('W388 the attract loop ADVANCES: arm 2\'s chain drains and $25B4D2 hands on to state 12',
  { skip: SKIP }, async () => {
    const g = await coldBoot(1500);
    assert.equal(g.ram.u16(0x812e56), 0x000c, 'arm 2 finished and set state 12 ($25A940)');
    const { SCREEN_STATE } = await import('../src/hiscorescreen.js');
    // `$25B488 jsr $246800` freed the chain on the way out, so the screen's own state word is
    // left at 2 -- the arm advanced, it did not restart.
    assert.equal(g.ram.u16(SCREEN_STATE.state), 2, '$812E5C is left at the screen\'s state 2');
    const handle = g.ram.u32(SCREEN_STATE.handle);
    assert.notEqual(handle, 0, 'the handle $25B3DC installed is real');
    // `chainFree246800` clears each node's id word; the root itself is released.
    assert.equal(g.ram.u16(handle), 0, '$246800 cleared the root -- the chain was freed, not left');
    assert.equal(g.animFrame.nodes, 0, 'no node is walked any more: every chain has been freed');
    assert.equal(g.animFrame.freed, 0, '...and there is nothing left to free');
  });

// The DRAIN itself, frame by frame, so the fix is measured rather than inferred from the state
// word. Timing index 2 in the `$246B38` table is `{reload 0, step 2}`, so `($20,node)` climbs by
// 2 every frame and reaches `$20` -- the terminal value -- on the sixteenth.
test('W388 the eight nodes drain in exactly 16 frames, and the palette ends BLACK',
  { skip: SKIP }, async () => {
    const { SCREEN_STATE } = await import('../src/hiscorescreen.js');
    const g = await coldBoot(558);            // the frame $812E5C reaches 2
    assert.equal(g.ram.u16(SCREEN_STATE.state), 2, 'the screen is on its state 2');
    const handle = g.ram.u32(SCREEN_STATE.handle);
    const head = g.ram.u32(handle + 0x2c);
    assert.notEqual(head, 0, 'the chain is live at the start of state 2');
    // `$24676E move.l ($4,A3,D2.w),($6,A2)` -- the store W376 was missing.
    assert.equal(g.ram.u32(head + 0x06), 0x80fa66,
      'node 0 has a REAL executor pointer, so $24683E will step it');
    assert.equal(g.ram.u32(head + 0x0a), 0x246bb8,
      '$24677E seeded the target as the CONSTANT $246BB8 -- W91\'s all-zero bank, BLACK');
    assert.equal(g.animFrame.nodes, 8, 'all eight nodes are walked');

    let drained = 0;
    for (let f = 1; f <= 40; f++) {
      g.step(0xffff);
      if (!drained && g.ram.u16(0x812e56) === 0x000c) drained = f;
    }
    assert.equal(drained, 16, 'the chain finished on the 16th frame of state 2');
  });
