// W375 -- `$23BF74`, THE FRONT-END BOOT BLOCK, and the four places the brief for it was wrong.
//
// Every ROM claim below is decoded from the raw image inside the test. Nothing is restated.
//
// The four corrections, each with the test that settles it:
//   1. `$23BF74` is not a routine entry           -- "twenty-three jsr's"
//   2. it does not end at `$23BFDC`               -- "falls into the main loop and never returns"
//   3. `$23C194` is not `or.w #1,$80393C` alone   -- "tail-jumps to $23C008"
//   4. the five palette blocks are already windowed -- "W93 already declared"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));

let _img = null;
const img = () => (_img ??= readFileSync(ROM));

/** The exported window list, with `base` parsed. `export-tables.py` writes it as the string
 *  `"$25321E"`, not a number -- reading it as one silently matches nothing, which is exactly
 *  the shape of failure a window test must not have. */
function windows() {
  return JSON.parse(readFileSync(TABLES, 'utf8')).rom.windows
    .map((w) => ({ base: parseInt(String(w.base).replace('$', ''), 16), len: w.len }));
}

// A read-only ROM face over the raw image, the same shape `RomWindows` presents.
function rawRom() {
  const d = img();
  return {
    u32: (a) => d.readUInt32BE(a), u16: (a) => d.readUInt16BE(a), u8: (a) => d[a],
    i16: (a) => d.readInt16BE(a), bytes: (a, n) => d.subarray(a, a + n),
  };
}

async function mods() {
  return {
    fe: await import('../src/frontend.js'),
    dl: await import('../src/displaylist.js'),
    ram: await import('../src/ram.js'),
    pal: await import('../src/palette.js'),
    hs: await import('../src/hiscore.js'),
  };
}

/** A counting `ctx.unported` and a `videoRegs` stand-in, so both halves are observable. */
function ctxFor() {
  const notes = [];
  return {
    notes,
    ctx: {
      unported: { note: (a, w) => notes.push([a, w]) },
      videoRegs: { ctrl: 0x0000 },
    },
  };
}

// =============================================================================================
// 1. THE DISASSEMBLY -- what the block IS
// =============================================================================================

test('W375 CORRECTION 1: $23BF74 is not a routine entry -- $23BEEA reaches it through 23 jsr\'s',
  { skip: SKIP }, async () => {
    const d = img();
    const { fe } = await mods();
    // `4EB9 xxxxxxxx` is `jsr abs.l`, six bytes. Twenty-three of them back to back is a
    // straight line with no branch in it, which is what makes $23BF74 an interior address
    // rather than an entry -- and it needs no decoder to see.
    const targets = [];
    for (let a = 0x23beea; a < 0x23bf74; a += 6) {
      assert.equal(d.readUInt16BE(a), 0x4eb9,
        `$${a.toString(16).toUpperCase()} is not jsr abs.l -- the straight line is broken`);
      targets.push(d.readUInt32BE(a + 2));
    }
    assert.equal(targets.length, 23, 'TWENTY-THREE calls before the block, not none');
    assert.deepEqual(targets, [...fe.RESET_PROLOGUE],
      'frontend.js RESET_PROLOGUE must be the cartridge\'s own list, in order');
    // ...and $23BF74 itself is the twenty-fourth jsr, so the stride divides exactly.
    assert.equal((0x23bf74 - 0x23beea) % 6, 0);
    assert.equal(d.readUInt16BE(0x23bf74), 0x4eb9);
    assert.equal(d.readUInt32BE(0x23bf76), 0x28841e, '$23BF74 jsr $28841E');
  });

test('W375 CORRECTION 2: the block does NOT end at $23BFDC -- it falls into the loop and the '
  + 'loop `bra`s back, so the routine never returns', { skip: SKIP }, async () => {
  const d = img();
  const { fe } = await mods();
  // $23BFD6 is `317c 000d 0004` -- move.w #$D,($4,A0). DECODING TRAP 1: the IMMEDIATE is at
  // a+2 and the DISPLACEMENT at a+4, not the other way round.
  assert.equal(d.readUInt16BE(0x23bfd6), 0x317c, '$23BFD6 move.w #imm,(d16,A0)');
  assert.equal(d.readUInt16BE(0x23bfd8), 0x000d, '  ...the IMMEDIATE $D comes FIRST');
  assert.equal(d.readUInt16BE(0x23bfda), 0x0004, '  ...and the DISPLACEMENT $4 SECOND');
  // What follows is not an rts. It is seven more jsr's -- the main loop.
  const loop = [];
  for (let a = 0x23bfdc; a < 0x23c006; a += 6) {
    assert.equal(d.readUInt16BE(a), 0x4eb9, `$${a.toString(16).toUpperCase()} jsr abs.l`);
    loop.push(d.readUInt32BE(a + 2));
  }
  assert.deepEqual(loop,
    [0x23be8c, 0x256d5a, 0x2410bc, 0x24683e, 0x23d2ae, 0x23c212, 0x23d12a],
    'the SEVEN main-loop calls src/main.js already ports, in the cartridge\'s order');
  // $23C006 60 d4 -- bra.s, PC = $23C008, displacement $D4 = -44, target $23BFDC.
  assert.equal(d[0x23c006], 0x60, '$23C006 is a bra.s');
  assert.equal(d[0x23c007], 0xd4);
  assert.equal(0x23c008 + d.readInt8(0x23c007), 0x23bfdc,
    'and it branches back to $23BFDC -- so $23BF74 NEVER RETURNS');
  assert.equal(fe.BOOT.loop, 0x23bfdc);
  assert.equal(fe.BOOT.loopBack, 0x23c006);
  // POSITIVE CONTROL for "there is no rts in it": the fixture can find an rts when there is
  // one, and $23C014 is one, twelve bytes further on.
  assert.equal(d.readUInt16BE(0x23c014), 0x4e75, 'the fixture CAN see an rts -- here is one');
  for (let a = 0x23bf74; a < 0x23c008; a += 2) {
    assert.notEqual(d.readUInt16BE(a), 0x4e75,
      `...and there is none at $${a.toString(16).toUpperCase()} in $23BF74..$23C007`);
  }
});

test('W375 CORRECTION 3: $23C194 and $23C1A2 both `bra.w $23C008`, which writes $B0E000',
  { skip: SKIP }, async () => {
    const d = img();
    const { dl } = await mods();
    // $23C194 -- the SET.
    assert.equal(d.readUInt16BE(0x23c194), 0x303c, '$23C194 move.w #imm,D0');
    assert.equal(d.readUInt16BE(0x23c196), 0x0001, '  ...#$1');
    assert.equal(d.readUInt16BE(0x23c198), 0x8179, '$23C198 or.w D0,abs.l');
    assert.equal(d.readUInt32BE(0x23c19a), 0x0080393c, '  ...$80393C');
    // ...and then FOUR MORE BYTES that displaylist.js\'s comment did not have.
    assert.equal(d.readUInt16BE(0x23c19e), 0x6000, '$23C19E bra.w -- NOT 4E75 rts');
    // bra.w\'s base is the EXTENSION WORD\'s address (decoding trap 4 on a branch).
    assert.equal(0x23c1a0 + d.readInt16BE(0x23c1a0), 0x23c008, '  ...to $23C008');

    // $23C1A2 -- the CLEAR, four bytes longer than a `not.w`/`and.w` pair too.
    assert.equal(d.readUInt16BE(0x23c1a2), 0x303c);
    assert.equal(d.readUInt16BE(0x23c1a4), 0x0001);
    assert.equal(d.readUInt16BE(0x23c1a6), 0x4640, '$23C1A6 not.w D0 -> $FFFE');
    assert.equal(d.readUInt16BE(0x23c1a8), 0xc179, '$23C1A8 and.w D0,abs.l');
    assert.equal(d.readUInt32BE(0x23c1aa), 0x0080393c);
    assert.equal(d.readUInt16BE(0x23c1ae), 0x6000, '$23C1AE bra.w');
    assert.equal(0x23c1b0 + d.readInt16BE(0x23c1b0), 0x23c008, '  ...to the SAME $23C008');

    // $23C008 -- the shared tail, three instructions.
    assert.equal(d.readUInt16BE(0x23c008), 0x41f9, '$23C008 lea abs.l,A0');
    assert.equal(d.readUInt32BE(0x23c00a), 0x00b0e000, '  ...$B0E000, the IGS023 control reg');
    assert.equal(d.readUInt16BE(0x23c00e), 0x30b9, '$23C00E move.w abs.l,(A0)');
    assert.equal(d.readUInt32BE(0x23c010), 0x0080393c, '  ...$80393C');
    assert.equal(d.readUInt16BE(0x23c014), 0x4e75, '$23C014 rts -- and 4E75 is TWO bytes');

    assert.equal(dl.DL.sectionCommit, 0x23c008);
    assert.equal(dl.DL.ctrlReg, 0x00b0e000);
  });

test('W375 $23C1C2\'s contract: reads nothing, writes $80393E := 0 and the IPL, returns nothing',
  { skip: SKIP }, async () => {
    const d = img();
    const { fe } = await mods();
    assert.equal(d.readUInt16BE(0x23c1c2), 0x2f00, '$23C1C2 move.l D0,-(A7)');
    assert.equal(d.readUInt16BE(0x23c1c4), 0x7000, '$23C1C4 moveq #$0,D0');
    assert.equal(d.readUInt16BE(0x23c1c6), 0x33c0, '$23C1C6 move.w D0,abs.l');
    assert.equal(d.readUInt32BE(0x23c1c8), 0x0080393e, '  ...$80393E, NOT $80393C');
    assert.equal(d[0x23c1cc], 0x60, '$23C1CC bra.s -- again not an rts');
    assert.equal(0x23c1ce + d.readInt8(0x23c1cd), 0x23c1b2, '  ...to $23C1B2');
    assert.equal(fe.BOOT.iplShadow, 0x80393e);
    assert.equal(fe.BOOT.iplTail, 0x23c1b2);

    // $23C1B2 is a SHARED tail (decoding trap 6): it is the instruction after $23C1A2's
    // bra.w, so it is reachable without going through $23C1C2 at all.
    assert.equal(0x23c1ae + 4, 0x23c1b2, '$23C1B2 is what follows $23C1AE bra.w');
    assert.equal(d.readUInt16BE(0x23c1b2), 0xe148, '$23C1B2 lsl.w #$8,D0');
    assert.equal(d.readUInt16BE(0x23c1b4), 0x40c1, '$23C1B4 move SR,D1');
    assert.equal(d.readUInt16BE(0x23c1b6), 0x0241, '$23C1B6 andi.w #imm,D1');
    assert.equal(d.readUInt16BE(0x23c1b8), 0xf8ff, '  ...#$F8FF -- clears SR bits 10-8');
    assert.equal(d.readUInt16BE(0x23c1ba), 0x8240, '$23C1BA or.w D0,D1');
    assert.equal(d.readUInt16BE(0x23c1bc), 0x46c1, '$23C1BC move D1,SR');
    assert.equal(d.readUInt16BE(0x23c1be), 0x201f, '$23C1BE move.l (A7)+,D0 -- the POP');
    assert.equal(d.readUInt16BE(0x23c1c0), 0x4e75, '$23C1C0 rts');
    // The push and the pop are a pair, so nothing is returned in D0 -- "it returns the old
    // mask" is the obvious reading and it is wrong.
    assert.equal(d.readUInt16BE(0x23c1c2), 0x2f00);

    // ...and the sibling that proves the tail is shared rather than private: $23C1CE is the
    // DISABLE, and it reaches $23C1B2 from a different address with a different level.
    assert.equal(d.readUInt16BE(0x23c1ce), 0x2f00, '$23C1CE move.l D0,-(A7)');
    assert.equal(d.readUInt16BE(0x23c1d0), 0x40c0, '$23C1D0 move SR,D0');
    assert.equal(d.readUInt16BE(0x23c1d2), 0x0240, '$23C1D2 andi.w #imm,D0');
    assert.equal(d.readUInt16BE(0x23c1d4), 0x0700, '  ...#$700');
    assert.equal(d.readUInt16BE(0x23c1de), 0x7007, '$23C1DE moveq #$7,D0 -- mask EVERYTHING');
    assert.equal(0x23c1e2 + d.readInt8(0x23c1e1), 0x23c1b2, '$23C1E0 bra.s $23C1B2, shared');
  });

test('W375 CORRECTION 4: the five palette blocks are $20 apart and W93 ALREADY WINDOWED them',
  { skip: SKIP }, async () => {
    const d = img();
    const { fe, pal } = await mods();
    // The five `lea block,A0 / moveq #n,D0 / jsr $2414BE` triples, read out of the code.
    const seen = [];
    for (let a = 0x23bf86; a < 0x23bfcc; a += 14) {
      assert.equal(d.readUInt16BE(a), 0x41f9, `$${a.toString(16).toUpperCase()} lea abs.l,A0`);
      const block = d.readUInt32BE(a + 2);
      const moveq = d.readUInt16BE(a + 6);
      assert.equal(moveq & 0xff00, 0x7000, '  ...moveq #n,D0');
      assert.equal(d.readUInt16BE(a + 8), 0x4eb9);
      assert.equal(d.readUInt32BE(a + 10), 0x2414be, '  ...jsr $2414BE');
      seen.push([a + 8, moveq & 0xff, block]);
    }
    assert.equal(seen.length, 5);
    assert.deepEqual(seen.map((s) => s[2]),
      [0x222638, 0x222658, 0x222678, 0x222698, 0x2226b8]);
    for (let i = 1; i < seen.length; i++) {
      assert.equal(seen[i][2] - seen[i - 1][2], 0x20, 'stride $20, as the brief said');
    }
    assert.deepEqual(fe.BOOT.txInstalls.map((t) => [...t]), seen,
      'frontend.js BOOT.txInstalls must be the code\'s own (site, bank, block) triples');
    assert.deepEqual(pal.TX_BOOT_INSTALLS.map((t) => [...t]), seen,
      '...and palette.js TX_BOOT_INSTALLS must agree with it, or the two lists have drifted');

    // The window: $222638 + $C0 covers banks 0..5 contiguously, and the last byte the fifth
    // install reads is $2226B8 + $20 - 1 = $2226D7, inside it. NO NEW WINDOW WAS NEEDED.
    const w = windows().find((x) => x.base === 0x222638);
    assert.ok(w, '$222638 has a window and this wave did not declare it');
    assert.ok(w.len >= 0xc0, `it is $${w.len.toString(16)} bytes, covering all five blocks`);
    assert.ok(0x2226b8 + 0x20 <= 0x222638 + w.len);
  });

test('W375 $23BFCC..$23BFD5 -- move.w #$8,D0 then jsr $241182, and the type is 8',
  { skip: SKIP }, async () => {
    const d = img();
    const { fe } = await mods();
    assert.equal(d.readUInt16BE(0x23bfcc), 0x303c, '$23BFCC move.w #imm,D0');
    assert.equal(d.readUInt16BE(0x23bfce), 0x0008, '  ...#$8 -- object dispatch type 8');
    assert.equal(d.readUInt16BE(0x23bfd0), 0x4eb9);
    assert.equal(d.readUInt32BE(0x23bfd2), 0x241182, '$23BFD0 jsr $241182');
    assert.equal(fe.BOOT.screenType, 8);
    assert.equal(fe.BOOT.screenState, 0x0d);
    assert.equal(fe.BOOT.stateField, 4);
  });

// =============================================================================================
// 2. THE PORT -- `$23C008`'s missing half, and the boot block
// =============================================================================================

test('W375 sectionCommit23C008 mirrors $80393C into the control register, both ways',
  { skip: SKIP }, async () => {
    const { dl, ram: R } = await mods();
    const ram = new R.Ram();
    const regs = { ctrl: 0xdead };
    ram.setU16(0x80393c, 0x001e);
    assert.equal(dl.sectionFlagSet23C194(ram, regs), 0x001f);
    assert.equal(ram.u16(0x80393c), 0x001f, 'the RAM half: bit 0 up');
    assert.equal(regs.ctrl, 0x001f, 'the REGISTER half, which the port did not have');
    assert.equal(dl.sectionFlagClear23C1A2(ram, regs), 0x001e);
    assert.equal(ram.u16(0x80393c), 0x001e, 'bit 0 down');
    assert.equal(regs.ctrl, 0x001e, '...and mirrored again');
    // POSITIVE CONTROL for the optional argument: the fixture CAN see a write (it just did),
    // and with no videoRegs the RAM half still happens and the register is untouched.
    const keep = { ctrl: 0xbeef };
    dl.sectionFlagSet23C194(ram, undefined);
    assert.equal(ram.u16(0x80393c), 0x001f, 'RAM still moves without a videoRegs');
    assert.equal(keep.ctrl, 0xbeef, 'and nothing else is written');
  });

test('W375 buildDisplayList opens and closes with the commit, so $B0E000 is written TWICE',
  { skip: SKIP }, async () => {
    const { dl, ram: R } = await mods();
    const ram = new R.Ram();
    ram.setU16(0x80393c, 0x001f);
    const seen = [];
    const regs = { _v: 0, get ctrl() { return this._v; }, set ctrl(v) { this._v = v; seen.push(v); } };
    const t = dl.buildDisplayList(ram, { videoRegs: regs });
    assert.deepEqual(seen, [0x001e, 0x001f],
      'step (a) clears bit 0 and commits, step (j) sets it back and commits');
    assert.equal(t.ctrlAtStart, 0x001e);
    assert.equal(t.ctrlAtEnd, 0x001f);
    // ...and the pre-wave behaviour is preserved exactly for a caller with no videoRegs.
    const t2 = dl.buildDisplayList(ram, {});
    assert.equal(t2.ctrlAtEnd, 0x001f, 'the return still reports it');
    assert.equal(ram.u16(0x80393c), 0x001f);
  });

test('W375 interruptEnable23C1C2 writes $80393E := 0 and COUNTS the SR half it cannot model',
  { skip: SKIP }, async () => {
    const { fe, ram: R } = await mods();
    const ram = new R.Ram();
    const { ctx, notes } = ctxFor();
    ram.setU16(0x80393e, 0x0700);
    const r = fe.interruptEnable23C1C2(ram, ctx);
    assert.equal(ram.u16(0x80393e), 0, '$23C1C6 move.w D0,$80393E with D0 = 0');
    assert.equal(r.shadow, 0);
    assert.equal(r.level, 0, 'level 0 = every interrupt enabled');
    assert.deepEqual(notes.map((n) => n[0]), [0x23c1b2],
      'ONE counted deferral, at the `move D1,SR` this port has no register for');
    assert.match(notes[0][1], /no STATUS\s*REGISTER|NO STATUS/i);
  });

// =============================================================================================
// 3. THE GAP THIS WAVE CLOSES -- `$28841E` was exported and never called
// =============================================================================================

test('W375 THE GAP: bootFrontEnd23BF74 installs the factory high-score table, and without it '
  + 'the style column is zero', { skip: SKIP }, async () => {
  const { fe, ram: R, pal, hs } = await mods();
  const ram = new R.Ram();
  const rom = rawRom();
  const { ctx, notes } = ctxFor();

  // BEFORE: zeroed RAM. This is what every caller of `Game` had before this wave, because
  // NOTHING IN src/ CALLED `hiscoreDefaults28841E` -- fourteen test files did and the port
  // did not.
  assert.equal(ram.u16(hs.HISCORE_DEFAULTS.blocks[0].dst & 0xffffff), 0,
    'the factory table is not there yet');
  assert.equal(ram.u16(0x803892), 0, 'and $803892, the STYLE column, is 0');

  const r = fe.bootFrontEnd23BF74(ram, rom, new pal.PaletteState(), ctx);

  assert.notEqual(ram.u16(0x803892), 0, '$23BF74 jsr $28841E put a real style value there');
  assert.equal(ram.u16(0x803892), 6, '...and it is 6, one of the three $25B61A reaches');
  // The other five calls, each with its own witness.
  assert.equal(r.sectionFlagBefore, 0, '$80393C started at 0 on a cold RAM');
  assert.equal(ram.u16(0x80393c) & 1, 1, '$23BF7A jsr $23C194 set bit 0');
  assert.equal(r.ctrl, ctx.videoRegs.ctrl, '...and $23C008 mirrored it into $B0E000');
  assert.equal(ram.u16(0x80393e), 0, '$23BF80 jsr $23C1C2 cleared $80393E');
  assert.equal(r.banks, 5, '$23BF86..$23BFCC installed FIVE text banks');
  assert.equal(r.skipped, 0);
  assert.equal(r.made.ok, true, '$23BFD0 jsr $241182 staged a create');
  assert.equal(ram.u16(r.made.addr), 0x8008, '  ...$8000 | type 8');
  assert.equal(r.state, 0x000d, '$23BFD6 move.w #$D,($4,A0) -- arm 13, the WARNING screen');
  // The priority came out of the DISPATCH TABLE, never from a literal here.
  assert.equal(ram.u16(r.made.addr + 0x4a), rom.u16(0x240f62 + 8 * 8 + 4));
  // The block it does NOT run is counted, once, by name.
  assert.ok(notes.some(([a, w]) => a === 0x23beea && /23 jsr/.test(w)),
    'the twenty-three preceding calls are ONE counted deferral, not a silent skip');
});

test('W375 $23BFD6 writes through A0 -- the STAGED record -- so a full queue still gets the $D',
  { skip: SKIP }, async () => {
    const { fe, ram: R, pal } = await mods();
    const ram = new R.Ram();
    const alloc = await import('../src/objalloc.js');
    // $241186 move.w $80DBAC,D2 / $24118C cmpi.w #$640 -- at the cap, $2411D4 hands back the
    // DUMMY at $80D51C and the cartridge writes through it just the same.
    ram.setU16(alloc.ALLOC.createSp, alloc.ALLOC.createCap);
    const r = fe.bootFrontEnd23BF74(ram, rawRom(), new pal.PaletteState(), ctxFor().ctx);
    assert.equal(r.made.ok, false);
    assert.equal(r.made.addr, alloc.ALLOC.createDummy, 'the dummy at $80D51C');
    assert.equal(ram.u16(alloc.ALLOC.createDummy + 4), 0x000d,
      'and $23BFD6 writes the $D into it anyway, because the cartridge does');
  });

// =============================================================================================
// 4. THE WHOLE THING -- a COLD BOOT, through the real path, to the high-score screen
// =============================================================================================

async function coldBoot() {
  const { Game } = await import('../src/main.js');
  const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
  // ZEROED RAM and `palCatchUp: false`. The catch-ups exist to replay what a MID-GAME seed
  // has already run; a cold boot has run nothing, and letting them fire would be the
  // hand-seeded fixture this test exists to replace.
  const g = new Game(new Uint8Array(0x20000), tables,
    { logicFrame: 0, videoFrame: 0, palCatchUp: false });
  return g;
}

/** Run `n` frames of `$23BFDC`, returning the throw if there is one. */
function run(g, n) {
  for (let i = 0; i < n; i++) {
    try { g.step(0xffff); } catch (e) { return { at: i, err: e }; }
  }
  return null;
}

test('W375 a COLD BOOT reaches the attract loop through the real path and runs the warning '
  + 'screen for its own $12C frames', { skip: SKIP }, async () => {
  const g = await coldBoot();
  assert.equal(g.ram.u16(0x812e56), 0, 'slot [8]\'s state word starts at 0');
  assert.equal(g.objlive(), 0, 'and no object exists');

  g.boot();                                        // $23BF74..$23BFDB
  assert.equal(run(g, 1), null, 'the first $23BFDC iteration commits the create and runs arm 0');
  assert.equal(g.objlive(), 1, 'ONE object, staged by $23BFD0 and committed by $24111E');
  assert.equal(g.ram.u16(0x80e240), 0x8008, 'and it is dispatch type 8');
  assert.equal(g.ram.u16(0x812e56), 0x0d, 'arm 0 read ($4,A5) and set the state to $D');

  // Arm 13 is `$25AC28 move.w #$12C,($4,A5)` and `$25AC7C subq.w #1` -- 300 frames, and the
  // INIT frame does not count because `$25AC34 rts` ends it.
  const r = run(g, 300);
  assert.equal(r, null, r && `threw at ${r.at}: ${r.err.message.slice(0, 160)}`);
  assert.equal(g.ram.u16(0x812e56), 0x0d, 'still on the warning screen after 301 frames');
  assert.equal(run(g, 1), null);
  assert.equal(g.ram.u16(0x812e56), 0x02, 'frame 302 is the timeout: $D -> 2, the HIGH SCORES');
});

test('W375 ...and the high-score screen DRAWS -- no throw on the style column, real entries in '
  + 'the display list', { skip: SKIP }, async () => {
  const g = await coldBoot();
  g.boot();
  const r = run(g, 340);
  assert.equal(r, null, r && `threw at ${r.at} ($${(r.err.romAddress ?? 0).toString(16)
    .toUpperCase()}): ${r.err.message.slice(0, 200)}`);
  assert.equal(g.ram.u16(0x812e56), 0x02);
  assert.ok(g.displayList.entries > 50,
    `the screen is drawn: ${g.displayList.entries} display-list entries`);
  assert.equal(g.displayList.terminated, true);
  // The style column specifically -- five rows, every one of them 2, 4 or 6, which is the
  // only set `$25B5E2`'s `subq.w #2 / add.w D0,D0` can index.
  for (let row = 0; row < 5; row++) {
    const v = g.ram.u16(0x803892 + row * 2);
    assert.ok([2, 4, 6].includes(v), `style row ${row} is ${v}, one of the reachable three`);
  }
  // $23C008 ran on the real path too.
  assert.equal(g.video.ctrl, g.ram.u16(0x80393c),
    'the control register mirrors $80393C after call #4\'s step (j)');
});

test('W375 POSITIVE CONTROL: the same cold boot WITHOUT $28841E throws by address on the style '
  + 'column, which is what makes the test above mean something', { skip: SKIP }, async () => {
  const g = await coldBoot();
  const { Unreached } = await import('../src/unported.js');
  const fe = await import('../src/frontend.js');
  const pal = await import('../src/palette.js');
  const dl = await import('../src/displaylist.js');
  const alloc = await import('../src/objalloc.js');

  // `boot()` MINUS its first instruction. Everything else about the run is identical, so the
  // failure below is attributable to `$23BF74 jsr $28841E` and to nothing else.
  const ram = g.ram;
  dl.sectionFlagSet23C194(ram, g.video);                        // $23BF7A
  fe.interruptEnable23C1C2(ram, { unported: { note: () => {} } });  // $23BF80
  for (const [site, bank, block] of fe.BOOT.txInstalls) {       // $23BF86..$23BFCC
    pal.install2414BE(ram, g.palette, bank, g.rom.bytes(block, 32), site, 'positive control');
  }
  const made = alloc.stageCreate(ram, 8, (t) => g.rom.u16(0x240f62 + t * 8 + 4));
  ram.setU16(made.addr + 4, 0x000d);                            // $23BFD6

  assert.equal(ram.u16(0x803892), 0, 'the style column is zero, exactly as before the fix');
  const r = run(g, 340);
  assert.ok(r, 'IT MUST THROW -- if this passes, the test above proves nothing');
  assert.ok(r.err instanceof Unreached, `and by NAME, not by TypeError: ${r.err.message}`);
  assert.equal(r.err.romAddress, 0x25b602,
    '$25B5E2 read style value 0, which `subq.w #2` indexes as -2 into its own rts');
  assert.match(r.err.message, /style value 0/);
});

// =============================================================================================
// 5. THE ONE ROM WINDOW THIS WAVE DECLARED
// =============================================================================================

test('W375 the high-score fade targets: two new windows, bounded by the script\'s own $001F',
  { skip: SKIP }, async () => {
    const d = img();
    // $25BA46 is the chain script `$25B3DC`'s `jsr $24641A` walks. Count word first.
    assert.equal(d.readUInt16BE(0x25ba46), 7, 'SEVEN entries');
    const targets = [];
    let a = 0x25ba48;
    for (let i = 0; i < 7; i++) {
      const target = d.readUInt32BE(a + 6);
      const wordsMinusOne = d.readUInt16BE(a + 10);
      assert.equal(wordsMinusOne, 0x001f,
        `entry ${i} reads ${wordsMinusOne + 1} words -- THIS is the window bound, not the data`);
      targets.push(target);
      a += 14;
    }
    assert.equal(a, 0x25ba46 + 0x64, 'and 2 + 7*14 = $64, exactly the existing $25BA46 window');
    assert.deepEqual(targets.map((t) => t.toString(16)),
      ['2257f8', '225838', '2258b8', '2258f8', '225938', '2254b8', '225878']);

    const wins = windows();
    // POSITIVE CONTROL that `windows()` finds anything at all before it is used to prove an
    // absence: a window everybody agrees exists.
    assert.ok(wins.some((w) => w.base === 0x25ba46 && w.len === 0x64),
      'the fixture can see the $25BA46 script window, so a miss below is a real miss');
    const covers = (base, len) => wins.some((w) => w.base <= base && base + len <= w.base + w.len);
    for (const t of targets) {
      assert.ok(covers(t, 0x40),
        `$${t.toString(16).toUpperCase()} + $40 must lie WHOLE inside one window`);
    }
    // The two this wave declared, and their exact extents.
    assert.ok(wins.some((w) => w.base === 0x2257f8 && w.len === 0x80),
      '$2257F8 + $80 = entries [0] and [1], contiguous');
    assert.ok(wins.some((w) => w.base === 0x2258b8 && w.len === 0x00c0),
      '$2258B8 + $C0 = entries [2], [3] and [4], contiguous');
    // NEITHER WIDENS AN EXISTING WINDOW: $2257F8 is exactly where W236's $2256B8+$140 stops,
    // and $2257F8 + $80 is exactly where the existing $225878 window starts.
    assert.ok(wins.some((w) => w.base === 0x2256b8 && w.base + w.len === 0x2257f8),
      'W236\'s window still ends at $2257F8 -- it was not widened');
    assert.ok(wins.some((w) => w.base === 0x225878),
      '...and $225878\'s window is still its own');

    // POSITIVE CONTROL that the window really is $40 per target and not "everything works":
    // the RomWindows face must REFUSE the word one past the last block.
    const { RomWindows } = await import('../src/rom.js');
    const { Unreached } = await import('../src/unported.js');
    const rom = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
    assert.equal(typeof rom.u16(0x225938 + 0x3e), 'number', 'the LAST word of entry [4] reads');
    assert.throws(() => rom.u16(0x225978), (e) => e instanceof Unreached,
      'and $225978, one block past it, does not -- the bound is real');
  });
