// WAVE 13 -- the scroll program, pinned against the LISTING.
//
// These run on SYNTHETIC RAM and a SYNTHETIC ROM window, so `node --test
// games/ddpdoj/tests/` still works on a tree with no cartridge extracted (the
// rule tests/shots.test.js and tests/render.test.js both state for themselves).
// What they cannot do is prove the translation matches the board; that is what
// `node tools/scrollportgate.mjs` is for -- 10,431 board frames of stage 1 plus
// 1,364 of the attract demo, and nine mutations that prove IT can fail.
//
// What they CAN do, and the frame-exact gate cannot, is reach the arms the
// corpus never takes: an eighth opcode, a fourth cue sub-op, a FLAG record
// (stage index 4 only, never executed in stage 1), and the one-instruction
// difference between the two builds' register uploads.

import test from 'node:test';
import assert from 'node:assert';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import {
  BGO, BGRAM, CAM, BGTAB, BgVram, VideoRegs,
  camBgAccumulate, camTxAccumulate, camReset, uploadRegs, writeMapLong,
  makeBackground, backgroundFrame,
} from '../src/background.js';
import { WATCH_SPEC, CLAIMED, stateVector } from '../src/state.js';
import { ROM as ROMADDR } from '../src/machine.js';

const A5 = 0x80e240;                    // object slot 0, $2410C4 lea $80E240

/** A synthetic cartridge: one window per region the port reads, filled by the
 *  caller.  Byte-addressed, big-endian, exactly like the 68000 sees it. */
function makeRom(regions) {
  const windows = regions.map(([base, len, fill]) => {
    const b = new Uint8Array(len);
    if (fill) fill(b, base);
    return {
      base: `$${base.toString(16)}`, len, why: 'test',
      hex: [...b].map((x) => x.toString(16).padStart(2, '0')).join(''),
    };
  });
  return new RomWindows({ windows });
}

function put16(b, o, v) { b[o] = (v >> 8) & 0xff; b[o + 1] = v & 0xff; }
function put32(b, o, v) { put16(b, o, (v >>> 16) & 0xffff); put16(b, o + 2, v & 0xffff); }

/**
 * A cartridge carrying: the five per-stage tables, a script pair, two scripts
 * built from `recs`, a 4-column stream and a tile base.  Laid out at the REAL
 * addresses so the port's own constants are what is exercised.
 */
function scriptRom(recs, { stream = 64, tileBase = 0x0aa90000 } = {}) {
  const STREAM = 0x225b78, SCRIPT0 = 0x261610, SCRIPT1 = 0x2617a0;
  const PAIR = 0x261552, OBJ = 0x26157a, CUE = 0x261602;
  return makeRom([
    [0x240d60, 0x20, (b) => put32(b, 0x240d62 - 0x240d60, tileBase)],
    [0x261240, 0xd40, (b) => {
      const at = (a) => a - 0x261240;
      put32(b, at(BGTAB.palette), 0x227e58);
      put32(b, at(BGTAB.colStream), STREAM);
      put32(b, at(BGTAB.scriptPair), PAIR);
      put32(b, at(PAIR), SCRIPT0);
      put32(b, at(PAIR + 4), SCRIPT1);
      // object stream: one entry then the $FFFFFFFF terminator
      put32(b, at(OBJ), 0x2238b8); put16(b, at(OBJ + 4), 0x000a);
      put32(b, at(OBJ + 6), 0xffffffff);
      // cue stream: sub-op 0 (arm the deferred callback), countdown 0
      put16(b, at(CUE), 0); put16(b, at(CUE + 2), 0);
      put32(b, at(CUE + 4), 0x28cb88);
      // script 0
      put32(b, at(SCRIPT0), OBJ); put32(b, at(SCRIPT0 + 4), CUE);
      let o = at(SCRIPT0 + 8);
      for (const [t, op, ...args] of recs) {
        put16(b, o, t); put16(b, o + 2, 0xffff); put16(b, o + 4, op);
        args.forEach((a, i) => put16(b, o + 6 + i * 2, a));
        o += 6 + args.length * 2;
      }
      put16(b, o, 0xffff);
      // script 1: header of zeros and an immediate terminator
      put32(b, at(SCRIPT1), 0); put32(b, at(SCRIPT1 + 4), 0);
      put16(b, at(SCRIPT1 + 8), 0xffff);
    }],
    [0x262240, 0x100, (b) => {
      put32(b, 0x262302 - 0x262240, 0x26224a);
      for (let i = 0; i < 13; i++) put32(b, 0x26224a - 0x262240 + i * 4, 0x2623a4 + i);
    }],
    // the column stream: `stream` columns of 9 longwords, each holding its own
    // (column, row) so a map write can be checked without a real cartridge.
    [STREAM, stream * 36, (b) => {
      for (let c = 0; c < stream; c++) {
        for (let r = 0; r < 9; r++) put32(b, c * 36 + r * 4, (c << 8) | r);
      }
    }],
  ]);
}

function newGame(recs, opts = {}) {
  const ram = new Ram();
  const rom = scriptRom(recs, opts);
  const vram = new BgVram();
  const unportedLog = new UnportedLog();
  const events = [];
  const ctx = { unportedLog, scrollEvent: (e) => events.push(e) };
  const handler = makeBackground(rom, vram, opts);
  return { ram, rom, vram, ctx, events, unportedLog, handler,
    step: () => handler(ram, A5, 0, ctx) };
}

// ---------------------------------------------------------------------------
test('$26127A is a THREE-FRAME warm-up, not an init and go', () => {
  const g = newGame([[0, 0x08, 0x0200]]);
  g.step();                                    // 1: $26114C, the init
  assert.equal(g.ram.u16(BGRAM.ringCursor), 0, 'the mirror is not written yet');
  assert.equal(g.ram.u16(A5 + BGO.cursor), 0x0f, '$261220 -- 15 columns pre-filled');
  assert.equal(g.ram.u16(A5 + BGO.speedBg), 0x20, '$26117A');
  assert.equal(g.vram.columnsWritten, 15);
  g.step();                                    // 2: $2613AC bset #1
  assert.equal(g.vram.columnsWritten, 15, 'frame 2 must not scroll');
  g.step();                                    // 3: $261298 bset #3
  assert.equal(g.ram.u16(BGRAM.clock), 0, 'frame 3 must not scroll either');
  g.step();                                    // 4: the handler at last
  // the t=0 SPEED record ran, then one $200 step: the odometer ticks once.
  assert.equal(g.ram.u16(A5 + BGO.speedBg), 0x0200, '$26213A on the first handler frame');
  assert.equal(g.ram.u16(BGRAM.clock), 1, '$26132C -- one $200 of scroll');
  assert.equal(g.ram.u32(CAM.bgLong), 0x200, '$240BAA');
});

test('the record header: the SECOND WORD IS SKIPPED, not tested ($262082)', () => {
  // Both records carry cond=$FFFF (what the ROM has).  If $262082 were a test
  // the second would never run, and the port would sit at speed $0200.
  const g = newGame([[0, 0x08, 0x0200], [1, 0x08, 0x0040]]);
  for (let i = 0; i < 4; i++) g.step();
  assert.equal(g.ram.u16(BGRAM.clock), 1);
  g.step();
  assert.equal(g.ram.u16(A5 + BGO.speedBg), 0x0040,
    'the t=1 record executed despite a non-zero second word');
});

test('the clock is matched on EXACT EQUALITY, so a value the clock never takes '
  + 'skips its record FOREVER ($26207C cmp.w/bne, never a >=)', () => {
  // The opening block of every stage does exactly this: FREEZE at t, resume at
  // t+4.  Here the freeze is at 0 and the resume writes 4, so 1, 2 and 3 never
  // occur -- and the t=2 record can never run again, because the clock only
  // ever grows from 4.
  const g = newGame([[0, 0x08, 0x0800], [0, 0x04, 0xfffe, 2, 1], [0, 0x0c],
    [2, 0x08, 0x0040], [4, 0x08, 0x0100]]);
  const cursorBefore = () => g.ram.u32(BGRAM.scr0);
  for (let i = 0; i < 3; i++) g.step();
  let clockAtUnfreeze = null;
  for (let i = 0; i < 30; i++) {
    g.step();
    if (clockAtUnfreeze === null && g.ram.u16(A5 + BGO.frozen) === 0) {
      clockAtUnfreeze = g.ram.u16(BGRAM.clock);
    }
  }
  assert.equal(g.ram.u16(A5 + BGO.frozen), 0, 'the repeat completed');
  assert.equal(clockAtUnfreeze, 4, '$261FC4 wrote the resume value back');
  // AND IT IS WORSE THAN "the record is skipped": $26207C is `cmp.w D1,D7 /
  // bne $262096`, which leaves the WHOLE SCRIPT, so the t=2 record does not
  // step aside -- it BLOCKS everything behind it, permanently.  The stage-1
  // script survives its own $0034 -> $0038 jump only because its next record
  // is at exactly $0038.
  assert.equal(g.ram.u16(A5 + BGO.speedBg), 0x0800,
    'neither the t=2 record (never equal) nor the t=4 record behind it ran');
  assert.equal(cursorBefore(), 0x261610 + 8 + 8 + 12 + 6,
    'the record cursor is parked on the t=2 record for ever');
});

test("op $04's countdown is armed at len+1 and reloaded at len, and the clock "
  + 'is written BACKWARDS on completion ($262130 / $261FD0 / $261FC4)', () => {
  // rewind -2 columns, len 2, ONE pass; freeze; resume at clock+4.
  const g = newGame([[0, 0x08, 0x0800], [0, 0x04, 0xfffe, 2, 1], [0, 0x0c]],
    { stream: 32 });
  for (let i = 0; i < 3; i++) g.step();
  const before = g.ram.u32(A5 + BGO.colPtr);
  g.step();                                            // the first handler frame
  assert.equal(g.ram.u16(A5 + BGO.frozen), 1, '$26214C froze the clock');
  assert.equal(g.ram.u32(BGRAM.scr0 + 0x0c), before - 2 * 36,
    '$262118 rewound the saved pointer by 2 columns x 36 bytes IMMEDIATELY');
  assert.equal(g.ram.u16(BGRAM.scr0 + 0x12), 2, '($12,A6) = len');
  assert.equal(g.ram.u16(BGRAM.scr0 + 0x14), 2,
    '($14,A6) was armed at len+1 = 3 by $262130 and the SAME frame $261348 '
    + 'already counted it down once -- the arm and the first countdown happen '
    + 'on one frame, which is exactly why reading this value alone cannot tell '
    + 'the two off-by-one readings apart');
  assert.equal(g.ram.u16(BGRAM.scr0 + 0x16), 4, '($16,A6) = clock + 4');
  // speed $800 writes exactly one column per frame, so the countdown reaches 0
  // after len+1 = 3 more columns and then reloads at len = 2 for the last pass.
  const unfreezeFrame = (mut, loops = 1) => {
    const h = newGame([[0, 0x08, 0x0800], [0, 0x04, 0xfffe, 2, loops], [0, 0x0c]],
      { stream: 64, mutate: mut });
    for (let i = 0; i < 3; i++) h.step();
    for (let f = 0; f < 40; f++) {
      h.step();
      if (h.ram.u16(A5 + BGO.frozen) === 0) return { f, clock: h.ram.u16(BGRAM.clock) };
    }
    return null;
  };
  const rom = unfreezeFrame(null);
  assert.equal(rom.f, 2, 'armed at len+1 = 3 and counted down on the arming '
    + 'frame itself, so the third column step is the one that completes');
  assert.equal(rom.clock, 4, '$261FC4 wrote ($16,A0) back into $8130CE -- the '
    + 'clock is written BACKWARDS to the stashed resume value');
  // THE TWO MISREADINGS, and they land on DIFFERENT frames.  A test that only
  // ran the ROM reading could not tell any of the three apart.
  assert.equal(unfreezeFrame('len-not-lenplus1').f, 1,
    'armed at len instead of len+1 unfreezes one column step EARLY');
  // The RELOAD is only reached when there is more than one pass, so the second
  // misreading needs a two-pass repeat to be visible at all -- which is itself
  // the reason a gate needs both switches and not one.
  assert.equal(unfreezeFrame(null, 2).f, 4,
    'two passes: len+1 = 3 steps then len = 2 more');
  assert.equal(unfreezeFrame('reload-lenplus1', 2).f, 5,
    'reloading at len+1 instead of len unfreezes one column step LATE');
});

test('a loop word of $FFFF never completes ($261FA8) -- the boss lock', () => {
  const g = newGame([[0, 0x08, 0x0800], [0, 0x04, 0xfffe, 2, 0xffff], [0, 0x0c]],
    { stream: 32 });
  for (let i = 0; i < 60; i++) g.step();
  assert.equal(g.ram.u16(A5 + BGO.frozen), 1,
    'nothing inside the VM can end an infinite repeat');
  assert.equal(g.ram.u16(BGRAM.scr0 + 0x10), 0xffff, 'the loop word is not decremented');
});

test('op $00 SPAWN does NOT write the cursor back on the $FFFFFFFF arm '
  + '($2620EC branches past $2620FC)', () => {
  const g = newGame([[0, 0x00, 2]]);          // asks for 2, the stream holds 1
  for (let i = 0; i < 4; i++) g.step();
  assert.equal(g.events.filter((e) => e.kind === 'spawn').length, 1);
  assert.equal(g.ram.u32(BGRAM.scr0 + 0x04), 0x26157a,
    'the object-stream cursor is unchanged -- the terminator arm skips the '
    + 'write-back, exactly as written');
});

test('op $14 CUE sub-op 0 arms the deferred callback and the countdown fires on '
  + 'the BORROW ($2620A8 subq.w / $2620AE bcc)', () => {
  const g = newGame([[0, 0x14, 1]]);
  for (let i = 0; i < 4; i++) g.step();
  // $2621B6 armed it, then $26209E ran in the SAME frame: `subq.w #1` on a
  // countdown of 0 BORROWS, `$2620AE bcc` falls through, the callback fires and
  // $2620B6 clears the pointer.  Stage 1's only armed cue has countdown 0, so
  // this is the arm the board takes.
  assert.equal(g.ram.u16(BGRAM.cueCount), 0xffff, '$2620A8, and it borrowed');
  assert.equal(g.events.filter((e) => e.kind === 'defer').length, 1,
    'the callback fired on the arming frame');
  assert.equal(g.ram.u32(BGRAM.cueCall), 0, '$2620B6 cleared it');
  assert.ok(g.unportedLog.report().some((l) => l.includes('$28CB88')),
    'and the callee is COUNTED, by address -- sound is excluded, not silent');
});

test('op $18 FLAG sets rungs 1..N of $81B414 and throws above the listing', () => {
  const g = newGame([[0, 0x18, 3]]);
  for (let i = 0; i < 4; i++) g.step();
  assert.equal(g.ram.u16(0x81b414), 1);
  assert.equal(g.ram.u16(0x81b416), 1);
  assert.equal(g.ram.u16(0x81b418), 1);
  assert.equal(g.ram.u16(0x81b41a), 0, 'level 3 sets three rungs, not four');

  const h = newGame([[0, 0x18, 9]]);
  for (let i = 0; i < 3; i++) h.step();
  assert.throws(() => h.step(), (e) => e instanceof Unreached
    && e.romAddress === 0x2621d6);
});

test('an EIGHTH opcode is a loud named throw carrying $2620C2, not a jsr into '
  + 'data ($262086 adds the op word with no bound check)', () => {
  const g = newGame([[0, 0x1c, 0]]);
  for (let i = 0; i < 3; i++) g.step();
  const e = (() => { try { g.step(); } catch (x) { return x; } })();
  assert.ok(e instanceof Unreached, 'it must THROW, never return quietly');
  assert.equal(e.romAddress, BGTAB.opTable);
  assert.match(e.message, /SEVEN longwords/);
});

test('a FOURTH cue sub-op is a loud named throw carrying $2621AA', () => {
  const rom = scriptRom([[0, 0x14, 1]]);
  // Rewrite the cue stream's first word to 3 -- one past the table's last entry.
  const g = newGame([[0, 0x14, 1]]);
  g.rom = rom;
  const bad = makeRomWithCueSub(3);
  const ram = new Ram();
  const h = makeBackground(bad, new BgVram(), {});
  const ctx = { unportedLog: new UnportedLog(), scrollEvent: () => {} };
  for (let i = 0; i < 3; i++) h(ram, A5, 0, ctx);
  const e = (() => { try { h(ram, A5, 0, ctx); } catch (x) { return x; } })();
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x2621aa);
});

function makeRomWithCueSub(sub) {
  const rom = scriptRom([[0, 0x14, 1]]);
  // patch the byte in the window holding the cue stream's first word
  const w = rom.windows.find((x) => 0x261602 >= x.base && 0x261602 < x.base + x.len);
  w.bytes[0x261602 - w.base] = (sub >> 8) & 0xff;
  w.bytes[0x261602 - w.base + 1] = sub & 0xff;
  return rom;
}

// ------------------------------------------------------------------ the camera
test('$240B94 keeps the 1/64-px FRACTION and commits only whole pixels', () => {
  const ram = new Ram();
  camBgAccumulate(ram, 0x20, 0);            // half a pixel
  assert.equal(ram.u32(CAM.bgLong), 0, 'nothing whole yet');
  assert.equal(ram.u32(CAM.bgAccL), 0x20, '$240BB0 kept (acc & $3F)');
  camBgAccumulate(ram, 0x20, 0);            // ...and the other half
  assert.equal(ram.u32(CAM.bgLong), 0x40, 'one whole pixel, on the second frame');
  assert.equal(ram.u32(CAM.bgAccL), 0);
});

test('$240B94 and $240C22 take their steps as ZERO-EXTENDED WORDS, so a '
  + 'negative $81316E enters as +65,520 and not as -16', () => {
  const ram = new Ram();
  camBgAccumulate(ram, 0, 0xfff0);
  assert.equal(ram.u32(CAM.bgAccC), 0x30, '$FFF0 & $3F');
  assert.equal(ram.u32(CAM.bgCross), 0xffc0, 'the whole part of +65,520');
});

test('$240C7C writes $80B03C -- the write 90 bytes into $240C22 that the recon '
  + 'declared had no writer', () => {
  const ram = new Ram();
  camTxAccumulate(ram, 0x200, 0);
  assert.equal(ram.u16(CAM.txNegL), 0x10000 - 0x200,
    '$240C7A negates the whole-pixel part before storing');
});

test('THE REGISTER UPLOAD IS BUILD A\'s $140FFE: it does NOT subtract the '
  + 'screen shake, and build B\'s $240CC0 does', () => {
  const ram = new Ram();
  const v = new VideoRegs();
  ram.setU32(CAM.bgLong, 0x4000);           // 256 px
  ram.setU32(CAM.bgCross, 0x800);           // 32 px
  ram.setU16(CAM.shakeX, 24);
  ram.setU16(CAM.shakeY, 8);
  uploadRegs(ram, v);
  assert.equal(v.bg_xscroll, 0x100, '$141018 lsr.l #6, and NOTHING else');
  assert.equal(v.bg_yscroll, 0x20);
  uploadRegs(ram, v, { subtractShake: true });
  assert.equal(v.bg_xscroll, 0x100 - 24, '$240CDE, the arm that does not run');
  assert.equal(v.bg_yscroll, 0x20 - 8);
  assert.equal(ROMADDR.isr6RegUpload, 0x140ffe, 'and the ISR list says which');
  assert.ok(ROMADDR.isr6Gated.includes(ROMADDR.isr6RegUpload));
});

test('$240B0E clears BOTH word accumulators with one move.l ($240B3C/$240B74)', () => {
  const ram = new Ram();
  ram.setU16(CAM.bgFracA, 0x11); ram.setU16(CAM.bgFracB, 0x22);
  ram.setU16(CAM.txFracA, 0x33); ram.setU16(CAM.txFracB, 0x44);
  camReset(ram);
  for (const a of [CAM.bgFracA, CAM.bgFracB, CAM.txFracA, CAM.txFracB]) {
    assert.equal(ram.u16(a), 0, `$${a.toString(16)} must be cleared`);
  }
  assert.equal(ram.u16(CAM.txId), 1, '$240B46 moveq #$1,D0 -> $240CB8');
  assert.equal(ram.u32(CAM.deferHead), 0xffffffff, '$240F08');
});

// ------------------------------------------------------------------- the map
test('$240D76 adds the PER-STAGE TILE BASE to the whole longword and indexes '
  + '(row*64 + col)*4', () => {
  const ram = new Ram();
  const rom = scriptRom([[0, 0x08, 0x20]]);
  const vram = new BgVram();
  ram.setU16(BGRAM.stageX4, 0);
  writeMapLong(ram, rom, vram, 3, 7, 0x00010002);
  assert.equal(vram.long(3, 7), (0x0aa90000 + 0x00010002) >>> 0);
  assert.equal(vram.w[((3 * 64) + 7) * 2], 0x0aaa, 'the tile word');
  assert.equal(vram.w[((3 * 64) + 7) * 2 + 1], 0x0002, 'the attr word rides through');
});

test('the ring cursor wraps mod 64 and the pre-fill leaves it at $F', () => {
  const g = newGame([[0, 0x08, 0x0800]], { stream: 128 });
  for (let i = 0; i < 3; i++) g.step();
  assert.equal(g.ram.u16(A5 + BGO.cursor), 0x0f);
  for (let i = 0; i < 60; i++) g.step();     // one column per frame at $800
  assert.equal(g.ram.u16(A5 + BGO.cursor), (0x0f + 60) & 0x3f);
  assert.equal(g.ram.u16(BGRAM.ringCursor), g.ram.u16(A5 + BGO.cursor),
    '$26137A mirrors ($e,A5) into $81318A');
});

// ------------------------------------------------------------ the entry clock
test('$26200E replays the interpreter for clocks 0..entry-1, restores BOTH '
  + 'column pointers and clears the two repeat targets', () => {
  const recs = [[0, 0x08, 0x0800], [0, 0x04, 0xfffe, 2, 4], [4, 0x08, 0x0040]];
  const cold = newGame(recs, { stream: 64 });
  const warm = newGame(recs, { stream: 64 });
  warm.ram.setU16(A5 + BGO.entryClock, 4);            // the attract demo's shape
  cold.step(); warm.step();
  // The replayed op-$04 rewound the pointer; $26203E/$262044 put it back.
  // The only difference the port may show is $2611E0's `(clock >> 2) * 36`:
  // entry clock 4 starts one column further into the stream.  The replayed
  // op-$04 rewound by TWO columns and $26203E/$262044 put the pointer back, so
  // anything other than +36 means the save/restore was dropped.
  assert.equal(warm.ram.u32(A5 + BGO.colPtr),
    cold.ram.u32(A5 + BGO.colPtr) + 36,
    'the pointer save/restore undoes the replayed rewind ($262028 push / '
    + '$26203C pop); without it this would be 36 - 2*36 lower');
  assert.equal(warm.ram.u32(BGRAM.scr0 + 0x0c), 0, '$26204E cleared $81319E');
  assert.equal(warm.ram.u32(BGRAM.scr1 + 0x0c), 0, '$262054 cleared $8131B6');
  assert.equal(warm.ram.u16(A5 + BGO.frozen), 0, '$26204A cleared ($8,A5)');
  assert.equal(warm.ram.u16(BGRAM.fastFwd), 0, '$26205A');
  assert.equal(warm.ram.u16(A5 + BGO.speedBg), 0x0800,
    'the replay DID apply the speed records it passed');
  // ...and the replay DID advance the record cursor past the two t=0 records
  // (SPEED = 6+2 bytes, REPEAT = 6+6), which is what makes the attract demo
  // start at the right record rather than at record 0.
  assert.equal(warm.ram.u32(BGRAM.scr0) - cold.ram.u32(BGRAM.scr0), 8 + 12);
});

// ------------------------------------------------------- the compared columns
test('every wave-13 column is in WATCH_SPEC and in CLAIMED, in the same commit '
  + 'as the code that writes it (wave 5 rule 7)', () => {
  const names = new Set(WATCH_SPEC.map(([n]) => n));
  for (const c of ['d0ce', 'd18a', 'd18c', 'b012', 'b016', 'b034', 'b038',
    'b03c', 'd16e', 'd170', 'd172', 'd174', 'd0d2', 'd190', 'scr0', 'scr1']) {
    assert.ok(names.has(c), `${c} is missing from WATCH_SPEC`);
    assert.ok(CLAIMED.includes(c), `${c} is missing from CLAIMED`);
  }
  // and the LONG columns must be declared 'l', or `frame.lua` reads 32 bits
  // while the port reports 16 -- the latent defect this wave found in
  // stateVector, invisible because $80B054 is 0 on every frame ever sampled.
  for (const c of ['b012', 'b016', 'b034', 'b038', 'scr0', 'scr1']) {
    assert.equal(WATCH_SPEC.find(([n]) => n === c)[2], 'l', `${c} must be :l`);
  }
});

test('stateVector reads a :l column as a LONGWORD', () => {
  const ram = new Ram();
  ram.setU32(CAM.bgLong, 0x00147480);
  const game = { ram, logicFrame: 0, videoFrame: 0, irq6Count: 0, releases: 0,
    objn: 0, order: { value: 0n }, objlive: () => 0 };
  assert.equal(stateVector(game).b012, 0x00147480);
});

// ------------------------------------------------------------- the cross axis
test('$26146C follows the ONE live player when $81316C is 0 and writes '
  + '$813176, the delta every other object subtracts ($26151E)', () => {
  const g = newGame([[0, 0x08, 0x20]]);
  for (let i = 0; i < 3; i++) g.step();
  g.ram.setU16(BGRAM.crossMode, 0);                 // $261126 cleared it
  g.ram.setU16(0x8103e6, 0x8000);                   // P1 live
  g.ram.setU16(0x810448, 0x0000);                   // P2 not
  g.ram.setU16(0x8103e6 + 4, 0x1c00 + 200 * 3);     // posX -> quotient 3
  g.step();
  assert.equal(g.ram.u16(A5 + BGO.crossPos), 0xc0,
    '$2614DE: (posX - $1C00) / $C8 = 3, << 6 = $C0, clamped through $2613B4');
  assert.equal(g.ram.u16(BGRAM.crossDelta), 0xc0, '$2614EE');
  assert.equal(g.ram.u16(BGRAM.crossWhole), 3, '$261514');
  assert.equal(g.ram.u16(BGRAM.scrollDelta), 3 << 6, '$26151E');
});

test('$2613B4 clamps the cross-axis request to +-$800 and raises $81317A, the '
  + 'flag the PLAYER\'s own $261126 reads', () => {
  const g = newGame([[0, 0x08, 0x20]]);
  for (let i = 0; i < 3; i++) g.step();
  g.ram.setU16(BGRAM.crossMode, 0);
  g.ram.setU16(0x8103e6, 0x8000);
  g.ram.setU16(0x8103e6 + 4, 0x1c00 + 200 * 100);   // far past the clamp
  g.step();
  assert.equal(g.ram.u16(BGRAM.wallFlag), 1, '$2613DE');
  assert.equal(g.ram.u16(A5 + BGO.crossAcc), 0x800, '$2613E6 took D2 = +$800');
});

// -------------------------------------------------------------- the freeze
test('$2612A0 returns before the interpreter when $8130D2 is set, and the '
  + 'element driver still runs', () => {
  const g = newGame([[0, 0x08, 0x0800]]);
  for (let i = 0; i < 4; i++) g.step();
  const clock = g.ram.u16(BGRAM.clock);
  const cols = g.vram.columnsWritten;
  g.ram.setU16(BGRAM.bgFreeze, 1);
  g.step();
  assert.equal(g.ram.u16(BGRAM.clock), clock, 'nothing moved');
  assert.equal(g.vram.columnsWritten, cols);
  assert.ok(g.unportedLog.report().some((l) => l.includes('$26233A')),
    '$2613A0 still calls the background-element driver -- W18');
});

test('the external speed push $813180 is CONSUMED and CLEARED ($2612B4), even '
  + 'though it was measured to be a no-op in stage 1', () => {
  const g = newGame([[0, 0x08, 0x0800]]);
  for (let i = 0; i < 4; i++) g.step();
  g.ram.setU16(BGRAM.extSpeed, 1);
  g.ram.setU16(BGRAM.extSpeedBg, 0x0040);
  g.ram.setU16(BGRAM.extSpeedTx, 0x0080);
  g.step();
  assert.equal(g.ram.u16(BGRAM.extSpeed), 0);
  assert.equal(g.ram.u16(A5 + BGO.speedBg), 0x0040);
  assert.equal(g.ram.u16(A5 + BGO.speedTx), 0x0080);
});

test('the external freeze $81317E: 1 freezes, anything else unfreezes, and it '
  + 'is cleared either way ($2612D8..$2612F8)', () => {
  const g = newGame([[0, 0x08, 0x0800]]);
  for (let i = 0; i < 4; i++) g.step();
  g.ram.setU16(BGRAM.extFreeze, 1); g.step();
  assert.equal(g.ram.u16(A5 + BGO.frozen), 1);
  assert.equal(g.ram.u16(BGRAM.extFreeze), 0, '$2612E2');
  g.ram.setU16(BGRAM.extFreeze, 2); g.step();
  assert.equal(g.ram.u16(A5 + BGO.frozen), 0);
});

// --------------------------------------------------------- the ROM boundary
test('a stage other than 1 is a LOUD THROW BY ADDRESS, not a plausible '
  + 'picture -- only stage 1s column stream was exported', () => {
  const g = newGame([[0, 0x08, 0x20]]);
  g.ram.setU16(BGRAM.stageX4, 4);                   // stage index 1
  const e = (() => { try { g.step(); } catch (x) { return x; } })();
  assert.ok(e instanceof Unreached, 'the synthetic ROM has no stage-2 tables');
});
