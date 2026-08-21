// THE PALETTE, and the reason every sprite on the page used to be the colour a
// recording froze it at.
//
// WAVE 91.  Until this wave the port modelled NO palette hardware at all.  The
// page drew every sprite through `capture.bin`'s palette RAM -- one frozen
// instant of a 161-frame recording -- and `$24150A`, the cartridge's own
// 64-byte bank upload, was a COUNTED NOTE in six source files.  W90 found that
// while chasing the owner's report that the bomb "should be bright orange with
// yellowish highlights" and is instead "a bit translucent and kinda grey"
// (`90-impl` §2).  This file is the port of the subsystem it named.
//
// ============================================================================
// 1. THE HARDWARE, both ends, read off the listing rather than from the label
// ============================================================================
//
// Palette RAM is `$A00000..$A011DF` and almost nothing writes it directly.
// Everything writes a STAGING COPY in main RAM and sets a DIRTY FLAG;
// `$24133C`, called once a frame from `$23C454`, copies a dirty region
// wholesale and clears its flag.  [M] `python tools/oracle/w27disasm.py 24133C
// 241404`:
//
// **AND "NOTHING WRITES PALETTE RAM DIRECTLY" IS W91's, AND IT IS WRONG BY ONE
// ROUTINE -- COMMENT ELEVEN.**  [M] W92 disassembled `$241404..$2414BC`, the
// tail `$2413CC`'s `beq` falls into, and it is `lea $A00800,A1 / adda.w #$540,
// A1` followed by four `move.w D0,$n(A1)`.  It writes palette RAM DIRECTLY,
// bypassing the staging area and the dirty flag entirely, which is exactly why
// those four words are the only ones in the whole 2,560 that move: see
// `bgFade241404` below.  W91 located the routine correctly and described its
// mechanism in one word too strong.
//
//   [M] 24133c  tst.w $80FA66 / beq $241384
//   [M] 241346  lea $80E886,A0 / lea $A00000,A1
//   [M] 241352  moveq #$1F,D0 / 16 x `move.l (A0)+,(A1)+` / dbra   = 2048 bytes
//   [M] 241378  move.w #$0,$80FA66 / jsr $24132A(pc)   <- 41 nops, a DMA wait
//   [M] 241384  tst.w $80FA68 / beq $2413CC
//   [M] 24138E  lea $80F086,A0 / lea $A00800,A1   ... 2048 bytes, flag $80FA68
//   [M] 2413CC  tst.w $80FA6A / beq $241404
//   [M] 2413D6  lea $80F886,A0 / lea $A01000,A1
//   [M] 2413E2  moveq #$E,D0 / 8 x move.l / dbra                  =  480 bytes
//
// SO THE THREE REGIONS ARE, in words of palette RAM, and this is the fact
// `src/web/app.js` was missing for 76 waves:
//
//   words $000..$3FF   SPRITES     <- $80E886, 32 banks x 32 entries, flag $80FA66
//   words $400..$7FF   BACKGROUND  <- $80F086, 32 banks x 32 entries, flag $80FA68
//   words $800..$8EF   TEXT/HUD    <- $80F886, 15 banks x 16 entries, flag $80FA6A
//
// The block this bundle has shipped since wave 14 -- `$227E58`, uploaded by
// `$2415E8`, checked at 1020 of 1024 against the board -- is the BACKGROUND
// third.  It contains no sprite entry.  The bomb is a sprite in bank 6.
//
// ============================================================================
// 2. `$24150A` IS ONE OF NINE, and the other eight are why the label lies
// ============================================================================
//
// [M] `$24150A` is ten instructions and it is the FOURTH entry of a family of
// nine consecutive routines that differ only in destination, length and flag.
// Reading `$24150A` alone and stopping at its `rts` gets the shape wrong,
// because `$24152E` immediately follows it and is the same routine with an
// outer `dbra`:
//
//   [M] addr      dest                       length              flag
//   [M] $24150A   $80E886 + D0*64            16 longs  = 1 bank   $80FA66
//   [M] $24152E   $80E886 + D0*64            (D1+1) banks         $80FA66
//   [M] $241556   $80E886 + D0*64             8 longs  = lo half  $80FA66
//   [M] $24157A   $80E886 + D0*64 + $20       8 longs  = hi half  $80FA66
//   [M] $2415A2   $80E886 + D0*64            (D1+1) WORDS         $80FA66
//   [M] $2415C4   $80F086 + D0*64            16 longs  = 1 bank   $80FA68
//   [M] $2415E8   $80F086 + D0*64            (D1+1) banks         $80FA68
//   [M] $2414BE   $80F886 + D0*32             8 longs  = 1 TX bank $80FA6A
//   [M] $2414E2   $80F886 + D0*32            (D1+1) TX banks      $80FA6A
//
// `D0` IS THE BANK NUMBER and `lsl.w #$6,D0` is what makes it one: 64 bytes =
// 32 xRGB555 entries = one 5-bit sprite colour bank.  (The TX pair shifts by 5,
// so a text bank is SIXTEEN entries, not 32 -- `$2414BE`, and `moveq #$E`
// upstream is what pins the region at 15 of them.)
//
// **W164: this module implements `$24150A`, `$2415A2`, `$2415E8`, `$24133C`
// and its `$241404` tail.**  `$2415E8` is the whole
// BACKGROUND third in ONE call -- [M] `$2611C4 moveq #$0,D0 / moveq #$1F,D1 /
// jsr $2415E8`, 32 banks = 2048 bytes, from the per-stage block the cartridge
// publishes at `$261252[$813096]` (stage 1: `$227E58`, which this bundle has
// shipped as an ASSET since W14 and never uploaded).  The table above is
// CHECKED against the cartridge on every export
// (`tools/export-tables.py check_palette_upload_family`) so that it cannot rot
// the way the project's TEN lying comments did (`docs/knowledge/02-traps.md`;
// the standing count was seven, W90 found two and **W91 found the tenth one
// line above the note this file replaces** -- see `src/background.js` on
// `$246BB8`/`$246BF8`); a routine nothing calls is not ported here on the
// strength of a table.
//
// [M] 161 absolute-long call sites across the nine, 152 of them `jsr $24150A`.
// The census with each site's bank and source block is
// `.scratch/w91/sites.txt`, regenerated by `.scratch/w91/sites.py`.
//
// ============================================================================
// 3. WHAT THIS PORT CAN AND CANNOT SOURCE, AND WHY THE ANSWER IS PER BANK
// ============================================================================
//
// The port starts from a SEED taken mid-stage.  Every install that ran before
// the seed instant ran on the board and not here, so a port that only executed
// the installs it reaches from now on would have 32 banks of nothing.
//
// It does not, and the reason is `catchUpObjectStream` below: the stage-1
// scroll script's OBJECT STREAM is the palette installer, its cursor is a field
// in the seed's own RAM, and the entries are the cartridge's.  [M] the seed's
// `$813196` is `$2615E6` = the stream head `$26157A` + 18 entries, so replaying
// entries 0..17 out of the cartridge reproduces exactly the banks the board had
// already installed -- 18 of them -- WITHOUT taking one byte of colour from the
// recording.  [M] the result equals the board's own palette RAM on 576 of 576
// entries, and equals the seed's own staging area byte for byte.
//
// EVERY WORD CARRIES ITS PROVENANCE.  `sourced[i]` is 1 only where a ported
// install put cartridge bytes there.  The page starts from the capture's
// palette and overwrites only those words (`mergePalette`), so a bank nothing
// has sourced stays visibly on the recording rather than silently becoming
// whatever the seed's RAM happened to hold.  Broken-and-declared, never
// fabricated.

import { unreached } from './unported.js';

/** Palette RAM as the oracle dumps it: 2,560 words from `$A00000`.  The three
 *  flush copies fill words $000..$8EF; the rest is never written by anything
 *  and stays 0 and UNSOURCED, which is what makes a read of it visible. */
export const PAL_WORDS = 2560;

/** The three staging areas and their dirty flags, all in main RAM. */
export const PALSTAGE = {
  spr: { stage: 0x80e886, dirty: 0x80fa66, dst: 0x000, words: 0x400, bankWords: 32 },
  bg: { stage: 0x80f086, dirty: 0x80fa68, dst: 0x400, words: 0x400, bankWords: 32 },
  tx: { stage: 0x80f886, dirty: 0x80fa6a, dst: 0x800, words: 0x0f0, bankWords: 16 },
};

/** `$24150A`'s own arithmetic: 32 words per bank, 32 banks in the region. */
export const SPR_BANKS = 32;
export const BANK_WORDS = 32;

/** The per-game palette hardware.  PER GAME, never a module global, for the
 *  reason `ProtLatch` is (NOTES-replay.md §2: state derives from the initial
 *  state and the input words and from nothing else). */
export class PaletteState {
  constructor() {
    /** The port's own `$A00000`. */
    this.words = new Uint16Array(PAL_WORDS);
    /** 1 where a ported install from CARTRIDGE bytes produced the word. */
    this.sourced = new Uint8Array(PAL_WORDS);
    /** ...the same, on the STAGING side, so the flush can carry it across. */
    this.stageSourced = {
      spr: new Uint8Array(PALSTAGE.spr.words),
      bg: new Uint8Array(PALSTAGE.bg.words),
      tx: new Uint8Array(PALSTAGE.tx.words),
    };
    /** Every `$24150A` this port executed, keyed by CALL SITE, with the bank
     *  and the source block.  Counted rather than logged: an install that fires
     *  once a stage and one that fires every frame must not look the same. */
    this.installs = new Map();
    this.installCount = 0;
    /** Flushes, and how many of them actually copied each region. */
    this.flushes = 0;
    this.copies = { spr: 0, bg: 0, tx: 0 };
    /** `catchUpObjectStream`'s own result, for the gate to assert on. */
    this.catchUp = null;
    /** ...and `catchUpBgPalette`'s.  W92. */
    this.bgCatchUp = null;
    /** ...and `catchUpTextPalette`'s.  W93. */
    this.txCatchUp = null;
    /** `bgFade241404`'s last result: whether both its gates were open, the
     *  level it wrote with, and whether the divider borrowed.  W92. */
    this.lastFade = null;
  }

  /** How many palette words currently come from the cartridge. */
  sourcedCount() {
    let n = 0;
    for (let i = 0; i < this.sourced.length; i++) n += this.sourced[i];
    return n;
  }

  /** Reports source coverage by palette region. */
  ledger() {
    // Keep the ledger split by third because "N of 2,560" hides which third is
    // still the recording's, and that is the number 39-OWNER tracks. The fourth
    // row is words $8F0..$9FF, which no region of `$24133C` copies and which are
    // zero on all 161 recorded frames. They can never be sourced, and saying so
    // is the point.
    const rows = { spr: 0, bg: 0, tx: 0, unwritten: 0 };
    for (let i = 0; i < this.sourced.length; i++) {
      if (!this.sourced[i]) continue;
      rows[i < 0x400 ? 'spr' : i < 0x800 ? 'bg' : i < 0x8f0 ? 'tx' : 'unwritten']++;
    }
    return {
      ...rows,
      total: rows.spr + rows.bg + rows.tx + rows.unwritten,
      of: { spr: 0x400, bg: 0x400, tx: 0xf0, unwritten: PAL_WORDS - 0x8f0 },
    };
  }

  /** The sprite banks a ported install has sourced, ascending. */
  sourcedBanks() {
    const out = [];
    for (let b = 0; b < SPR_BANKS; b++) {
      if (this.sourced[b * BANK_WORDS]) out.push(b);
    }
    return out;
  }

  report() {
    return [...this.installs.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, v]) => `${String(v.n).padStart(5)} x ${k}`);
  }
}

/**
 * `$24150A` -- movem, `lea $80E886,A1`, `lsl.w #$6,D0`, `adda.w D0,A1`,
 * sixteen `move.l (A0)+,(A1)+`, `move.w #$1,$80FA66`.
 *
 * D0 IS NOT MASKED ON THE BOARD EITHER.  `lsl.w #$6` on a D0 of 32 addresses
 * `$80E886+$800`, which is the BACKGROUND staging area -- the board would
 * scribble on it and so would this.  The port throws by address instead of
 * clamping, because a bank number out of range means the caller resolved the
 * wrong table and a clamp would hide it (`docs/knowledge/08`; the brief's "do
 * not clamp an index to stop a throw").
 *
 * @param ram   the port's main RAM
 * @param pal   the PaletteState
 * @param d0    the bank number, D0
 * @param src   64 bytes read out of the cartridge (`rom.bytes(ptr, 64)`)
 * @param site  the ROM address of the `jsr`, for the census
 * @param why   what the site is
 */
export function install24150A(ram, pal, d0, src, site, why) {
  if (!(d0 >= 0 && d0 < SPR_BANKS)) {
    unreached(0x24150a, `$24150A was handed bank ${d0} from $${site.toString(16)
      .toUpperCase()}. lsl.w #$6 makes that $80E886+$${(d0 * 64).toString(16)
      .toUpperCase()}, which is outside the 32-bank sprite staging area and on `
      + `the board would land in the BACKGROUND staging at $80F086. The caller `
      + `resolved the wrong table; clamping would hide it`);
  }
  if (src.length !== 64) {
    unreached(0x24150a, `$24150A from $${site.toString(16).toUpperCase()} was `
      + `handed ${src.length} source bytes and it copies 16 longwords = 64. `
      + `A short read means the ROM window is narrower than the block`);
  }
  const base = PALSTAGE.spr.stage + d0 * 64;
  for (let i = 0; i < 32; i++) {
    ram.setU16(base + i * 2, (src[i * 2] << 8) | src[i * 2 + 1]);
    pal.stageSourced.spr[d0 * BANK_WORDS + i] = 1;
  }
  ram.setU16(PALSTAGE.spr.dirty, 1);                       // $241520
  const k = `$${site.toString(16).toUpperCase()} bank ${d0} <- ${why}`;
  const e = pal.installs.get(k) ?? { n: 0, bank: d0 };
  e.n++;
  pal.installs.set(k, e);
  pal.installCount++;
}

/**
 * `$24157A` -- the HI-HALF sibling of `$24150A`.  [M] it is the FOURTH entry of
 * the nine-routine `$24150A` family (`palette.js:56-71` documents it but did
 * not implement it):
 *
 *   [M] 24157a  movem.l d0/a0-a1,-(a7)
 *   [M] 24157e  lea $80e886.l,A1     ; the SPRITE staging area
 *   [M] 241584  lsl.w #$6,D0         ; bank * 64
 *   [M] 241586  addi.w #$20,D0       ; + $20  -> the HIGH 16 entries of the bank
 *   [M] 24158a  adda.w D0,A1         ; A1 = $80E886 + bank*64 + $20
 *   [M] 24158c  moveq #$7,D0         ; 8 longwords = 16 entries (not 32)
 *   [M] 24158e  move.l (A0)+,(A1)+ / dbra
 *   [M] 241594  move.w #$1,$80fa66.l ; SPRITE dirty flag
 *
 * Two diffs from `install24150A` and no third: `addi.w #$20` before `adda.w`
 * (high half, not whole bank), and 8 longwords (`moveq #$7`) not 16.  Same
 * `(ram, pal, d0, src, site, why)` signature; `src` is the 32-byte ROM block
 * (16 xRGB555 entries).  [M] the call-site census is THREE sites, all inside
 * the popup `$2855B6` (W117 sec 1) -- this routine has no other consumer.
 *
 * The high half writes `pal.stageSourced.spr[bank*32 + 16..31]`; the next
 * `catchUpObjectStream` install refreshes bank 7's whole block after the popup
 * ends, so no restore is needed (W117 sec 6.1).
 *
 * @param ram   the port's main RAM
 * @param pal   the PaletteState
 * @param d0    the bank number, D0 (the popup passes D4 = 7)
 * @param src   32 bytes read out of the cartridge (`rom.bytes(ptr, 32)`)
 * @param site  the ROM address of the `jsr`, for the census
 * @param why   what the site is
 */
export function install24157A(ram, pal, d0, src, site, why) {
  if (!(d0 >= 0 && d0 < SPR_BANKS)) {
    unreached(0x24157a, `$24157A was handed bank ${d0} from $${site.toString(16)
      .toUpperCase()}. lsl.w #$6 + addi.w #$20 makes that $80E886+$${(d0 * 64
        + 0x20).toString(16).toUpperCase()}, which is outside the 32-bank sprite `
      + `staging area. The caller resolved the wrong table; clamping would `
      + `hide it`);
  }
  if (src.length !== 32) {
    unreached(0x24157a, `$24157A from $${site.toString(16).toUpperCase()} was `
      + `handed ${src.length} source bytes and it copies 8 longwords = 32. `
      + `A short read means the ROM window is narrower than the block`);
  }
  const base = PALSTAGE.spr.stage + d0 * 64 + 0x20;            // $241586 addi.w #$20
  for (let i = 0; i < 16; i++) {                               // $24158C moveq #$7
    ram.setU16(base + i * 2, (src[i * 2] << 8) | src[i * 2 + 1]);
    pal.stageSourced.spr[d0 * BANK_WORDS + 16 + i] = 1;        // hi half: words 16..31
  }
  ram.setU16(PALSTAGE.spr.dirty, 1);                           // $241594
  const k = `$${site.toString(16).toUpperCase()} hi-half bank ${d0} <- ${why}`;
  const e = pal.installs.get(k) ?? { n: 0, bank: d0 };
  e.n++;
  pal.installs.set(k, e);
  pal.installCount++;
}

/**
 * `$2415A2` -- install `(D1+1)` WORDS at the low end of sprite bank D0.
 *
 * The player-death path reaches this through `$2531DE/$2531FE`. The selected
 * row supplies the source pointer, bank and DBRA count together, so the source
 * length is derived from D1 rather than widened to a whole palette bank.
 */
export function install2415A2(ram, pal, d0, d1, src, site, why) {
  const words = d1 + 1;
  if (!(d0 >= 0 && d0 < SPR_BANKS) || !(words >= 1 && words <= BANK_WORDS)) {
    unreached(0x2415a2, `$2415A2 was handed D0=${d0} D1=${d1} from $${site
      .toString(16).toUpperCase()}; that selects ${words} words at `
      + `sprite bank ${d0}. The board does not clamp either register`);
  }
  if (src.length !== words * 2) {
    unreached(0x2415a2, `$2415A2 from $${site.toString(16).toUpperCase()} was `
      + `handed ${src.length} source bytes for D1=${d1}; DBRA copies exactly `
      + `${words} words (${words * 2} bytes)`);
  }
  const base = PALSTAGE.spr.stage + d0 * 64;
  for (let i = 0; i < words; i++) {
    ram.setU16(base + i * 2, (src[i * 2] << 8) | src[i * 2 + 1]);
    pal.stageSourced.spr[d0 * BANK_WORDS + i] = 1;
  }
  ram.setU16(PALSTAGE.spr.dirty, 1);                       // $2415B6
  const k = `$${site.toString(16).toUpperCase()} ${words}-word bank ${d0} <- ${why}`;
  const e = pal.installs.get(k) ?? { n: 0, bank: d0 };
  e.n++;
  pal.installs.set(k, e);
  pal.installCount++;
}

/**
 * `$2415E8` -- THE BACKGROUND THIRD, and the whole of it arrives in one call.
 *
 * [M] `$2415E8` is `$24150A`'s shape with two differences and no third:
 * `lea $80F086,A1` instead of `$80E886`, and an OUTER `dbra D1` around the
 * sixteen `move.l`s, so it uploads (D1+1) consecutive 64-byte banks.  Its
 * dirty flag is `$80FA68` and `$24133C` copies its region to `$A00800`.
 *
 * [M] It has THREE absolute-long call sites in the whole 6 MiB image and two of
 * them are the stage fade's endpoints (`$24639A`, `$2463D4`, D1 = $1F from the
 * BLACK/WHITE constant banks).  The third is the one that matters:
 *
 *   [M] $2611B2 lea ($261252,PC),A0 / adda.w $813096,A0 / movea.l (A0),A0
 *   [M] $2611C0 moveq #$0,D0 / moveq #$1F,D1 / $2611C4 jsr $2415E8
 *
 * -- inside `$261136`, the scroll VM's per-stage init, which `src/background.js`
 * already ports and which had this as a counted note.  D1 = $1F is THIRTY-TWO
 * banks: 1,024 words, the entire background third, out of one cartridge block
 * chosen by the seed's own stage index.
 *
 * D0 IS NOT MASKED AND D1 IS NOT BOUNDED ON THE BOARD, and the port throws by
 * address rather than clamping for `install24150A`'s reason.  `$80F086 + $800`
 * is the TEXT staging area, so an over-long upload would scribble on it here
 * exactly as it would there.
 */
export function install2415E8(ram, pal, d0, d1, src, site, why) {
  const banks = d1 + 1;
  if (!(d0 >= 0 && d0 < SPR_BANKS) || !(banks >= 1 && d0 + banks <= SPR_BANKS)) {
    unreached(0x2415e8, `$2415E8 was handed D0=${d0} D1=${d1} from $${site
      .toString(16).toUpperCase()}, which is ${banks} banks starting at bank `
      + `${d0}. The background staging area $80F086 is ${SPR_BANKS} banks; `
      + `past it is the TEXT staging at $80F886 and the board would scribble `
      + `on it. The caller resolved the wrong table; clamping would hide it`);
  }
  if (src.length !== banks * 64) {
    unreached(0x2415e8, `$2415E8 from $${site.toString(16).toUpperCase()} was `
      + `handed ${src.length} source bytes for ${banks} banks and it copies `
      + `${banks} x 16 longwords = ${banks * 64}. A short read means the ROM `
      + `window is narrower than the block`);
  }
  const base = PALSTAGE.bg.stage + d0 * 64;
  for (let i = 0; i < banks * 32; i++) {
    ram.setU16(base + i * 2, (src[i * 2] << 8) | src[i * 2 + 1]);
    pal.stageSourced.bg[d0 * BANK_WORDS + i] = 1;
  }
  ram.setU16(PALSTAGE.bg.dirty, 1);                        // $241602
  const k = `$${site.toString(16).toUpperCase()} BG banks ${d0}..${d0 + banks - 1
    } <- ${why}`;
  const e = pal.installs.get(k) ?? { n: 0, bank: d0 };
  e.n++;
  pal.installs.set(k, e);
  pal.installCount++;
}

/**
 * `$246292` -- the per-entry BRIGHTNESS transform, transcribed instruction for
 * instruction because its arithmetic is not the obvious one.
 *
 * D0 is an xRGB555 word and D1 is a LEVEL.  Each 5-bit channel is widened by
 * `asl.w #$8` then `asr.w #$5` (a net times-8, through the word, with the sign
 * extension that pairing implies), multiplied by the level, shifted back down
 * by 8, masked to `$7FFF` and clamped to `$1F`.  [M] so level `$20` is exactly
 * the identity -- checked on eight words in `.scratch/w92/probe2.mjs` -- and
 * the `$18`..`$3C` the caller ping-pongs through is 0.75x to 1.875x.
 *
 * The `andi.w #$7FFF` between the shift and the clamp does nothing for any
 * value this game reaches (the largest product is 31*8*60 = 14,880) and is
 * transcribed anyway: a reader who drops it has changed the routine.
 */
export function fade246292(d0, d1) {
  const i16 = (v) => (v << 16) >> 16;
  const chans = [(d0 & 0x7c00) >>> 10, (d0 & 0x03e0) >>> 5, d0 & 0x1f];
  const out = chans.map((v) => {
    let x = i16((v << 8) & 0xffff) >> 5;         // $2462B2 asl.w #8 / asr.w #5
    x = i16((x * i16(d1)) & 0xffff) >> 8;        // $2462BE muls.w D7 / asr.w #8
    x &= 0x7fff;                                 // $2462CA andi.w #$7FFF
    if (x > 0x1f) x = 0x1f;                      // $2462D6 cmpi/ble/move #$1F
    return x;
  });
  return ((out[0] << 10) & 0x7c00) | ((out[1] << 5) & 0x03e0) | (out[2] & 0x1f);
}

/** Where `$241422 adda.w #$540,A1` lands: `$540/2` = 672 words into the
 *  background region = bank 21, pens 0..3.  Named rather than spelled `0x2a0`
 *  in four places, because `$540` is the number in the instruction and 672 is
 *  the number a reader has to re-derive. */
export const FADE_OFFSET_BYTES = 0x540;
export const FADE_WORDS = 4;

/**
 * `$241404..$2414BC` -- **THE FOUR ANIMATED ENTRIES**, and they are the thread
 * the owner's grey bomb was pulled out of: W14 measured four background words
 * that disagree with the shipped block, W90 re-measured them, W91 located the
 * routine, and this is it.
 *
 * IT IS THE TAIL OF `$24133C` ITSELF.  `$2413CC tst.w $80FA6A / beq $241404`
 * falls here whether or not the TEXT region was dirty, and `$241400 jsr
 * $24132A(pc)` falls here too, so it runs EVERY frame -- there is no dirty flag
 * and there is no staging copy.  Both gates are its own:
 *
 *   [M] $241404 cmpi.w #$0,$813092 / bne $2414BC   -- only while unfrozen
 *   [M] $241410 cmpi.w #$130,$8130CE / bge $2414BC -- only for the first $130
 *
 * **AND IT WRITES PALETTE RAM DIRECTLY** (`lea $A00800,A1 / adda.w #$540,A1`),
 * reading its four sources back out of the STAGING area at the same offset.  So
 * the staging keeps the block's own colour and palette RAM shows the faded one,
 * which is precisely why `$227E58` agrees with the board on 1020 of 1024 and
 * has since W14 -- [M] the four that disagree are bank 21 pens 0..3 and they
 * are the ONLY four words of all 2,560 that ever move across the 161 recorded
 * frames (`.scratch/w92/probe.mjs`).
 *
 * THE ORDER IS WRITE-THEN-ADVANCE and getting it backwards costs one frame of
 * phase.  [M] the seed carries `$80FA6C` = `$1E`, and the recording's frame 0
 * is `fade(base, $1F)` -- the level BEFORE that frame's advance.  The board
 * wrote palette RAM with `$1F` and then stepped to `$1E`, so a port that
 * advances first is a frame early on every one of the 161.
 *
 * The four stores are `$6,$4,$2,(A1)` in that order.  Transcribed in that order
 * even though the routine is memoryless per entry, because the next reader
 * should see the listing.
 */
export function bgFade241404(ram, pal) {
  const res = { ran: false, level: ram.u16(0x80fa6c), wrote: 0 };
  if (ram.u16(0x813092) !== 0) return res;                 // $241404 / $24140C
  const i16 = (v) => (v << 16) >> 16;
  if (i16(ram.u16(0x8130ce)) >= 0x130) return res;         // $241410 / $241418
  const level = ram.u16(0x80fa6c);                         // $241430
  const stage = PALSTAGE.bg.stage + FADE_OFFSET_BYTES;     // $241426 / $24142C
  const dst = PALSTAGE.bg.dst + FADE_OFFSET_BYTES / 2;     // $24141C / $241422
  const bgSrcWord = FADE_OFFSET_BYTES / 2;                 // into stageSourced.bg
  for (const k of [3, 2, 1, 0]) {                          // $241436..$241468
    pal.words[dst + k] = fade246292(ram.u16(stage + k * 2), level);
    // PROVENANCE SURVIVES THE TRANSFORM.  A faded word is cartridge-sourced
    // exactly when the word it was computed FROM is; if nothing has uploaded
    // the background block, these four stay the recording's like the other
    // 1,020 and `mergePalette` leaves them alone.
    pal.sourced[dst + k] = pal.stageSourced.bg[bgSrcWord + k];
    res.wrote++;
  }
  res.ran = true;
  // $24146A subq.b #$1,$80FA70 / bcc $2414BC -- a frame divider, reloaded from
  // $80FA71.  W91 named the level and the step and not this pair; [M] the seed
  // carries $01/$01, so it advances every frame, and a port that dropped the
  // divider would be right on this seed and wrong on any other.
  const ctr = (ram.u8(0x80fa70) - 1) & 0xff;
  ram.setU8(0x80fa70, ctr);
  if (ctr !== 0xff) return res;                            // bcc: no borrow
  ram.setU8(0x80fa70, ram.u8(0x80fa71));                   // $241474
  const step = i16(ram.u16(0x80fa6e));                     // $24147E
  const next = (level + step) & 0xffff;
  ram.setU16(0x80fa6c, next);                              // $241488 / $2414A4
  // $241484 bpl: the SIGN OF THE STEP picks which bound is tested, and the two
  // arms are not symmetric -- `bge $18` on the way down, `blt $3C` on the way
  // up.  Both are "still inside, do nothing"; the else is `neg.w $80FA6E`.
  if (step < 0) {
    if (i16(next) < 0x18) ram.setU16(0x80fa6e, u16neg(step));   // $24148E/$24149A
  } else if (i16(next) >= 0x3c) {
    ram.setU16(0x80fa6e, u16neg(step));                         // $2414AA/$2414B6
  }
  res.advanced = true;
  return res;
}

const u16neg = (v) => (-v) & 0xffff;

/**
 * `$24133C` -- the once-a-frame upload, called from `$23C454`.
 *
 * THE GATE AT THE CALL SITE IS NOT MODELLED AND THAT IS DELIBERATE.  `$23C44C
 * tst.b $803940 / beq $23C472` runs this block only while the vblank semaphore
 * is still armed, i.e. once per LOOP ITERATION that reached the spin.  The port
 * runs one iteration per `step()`, so calling this once at the end of `step()`
 * is the same schedule.  If the port ever models a dropped frame, this is the
 * line that has to learn about it, which is why it says so here.
 *
 * Returns which regions were copied, so a caller can tell "nothing was dirty"
 * from "the flush never ran".
 */
export function flush24133C(ram, pal) {
  const did = { spr: false, bg: false, tx: false };
  for (const key of ['spr', 'bg', 'tx']) {
    const r = PALSTAGE[key];
    if (ram.u16(r.dirty) === 0) continue;                  // $24133C/$241384/$2413CC
    for (let i = 0; i < r.words; i++) {
      pal.words[r.dst + i] = ram.u16(r.stage + i * 2);
      pal.sourced[r.dst + i] = pal.stageSourced[key][i];
    }
    ram.setU16(r.dirty, 0);                                // $241378/$2413C0/$2413F8
    did[key] = true;
    pal.copies[key]++;
  }
  // $2413CC's `beq` and $241400's `jsr $24132A(pc)` BOTH fall into $241404, so
  // the fade runs whether or not any region was dirty.  It is inside this
  // function rather than beside it because it is inside $24133C in the ROM:
  // there is no second call site and no second caller.
  //
  // ITS RESULT GOES ON `pal`, NOT INTO `did`, and that is deliberate: `did`
  // means "which of the three REGION COPIES ran" and W91's tests assert its
  // exact shape.  The fade is not a region copy -- it writes four words of
  // palette RAM directly -- so widening `did` would have made two of those
  // tests fail for a reason that has nothing to do with what they check.
  pal.lastFade = bgFade241404(ram, pal);                   // $241404
  pal.flushes++;
  return did;
}

/**
 * THE CATCH-UP, and it is the one thing in this file that is not a
 * transcription of an instruction.  Read the argument before the code.
 *
 * `$2620DE` (op $00 SPAWN, `src/background.js`) walks the scroll script's
 * OBJECT STREAM and hands each (pointer, param) pair to `$24150A`.  For stage 1
 * that stream is 22 entries at `$26157A` and it is the sprite palette: [M]
 * eighteen of its entries carry a `$22xxxx` colour block and a bank number.
 *
 * The port resumes mid-stage, so the entries the board consumed before the seed
 * instant will never execute here.  The cursor that says HOW MANY is a
 * longword in the seed's own RAM (`($4,A6)` of the script-0 state block at
 * `$813192`), and the stream head is a longword in the CARTRIDGE
 * (`$261FFC move.l (A2)+,$4(A1)`, A2 from the per-stage pair table `$26153E`).
 *
 * So this replays entries [head, cursor) through the SAME `$24150A` the live
 * op $00 uses.  It takes ONE number from the recording -- how far the cursor
 * had advanced -- and every byte of colour from the cartridge.  That is the
 * same bargain `bgSeed` already makes for the tilemap ring, and a weaker one:
 * `bgSeed` carries 63 columns of the board's pixels, this carries an integer.
 *
 * [M] on the shipped seed it replays 18 entries into 18 banks and the bytes it
 * writes are IDENTICAL to the ones already in the seed's staging area (`same`
 * below is 576 of 576).  That equality is the check that the model is right,
 * and `tools/webgate.mjs` asserts it.
 *
 * A stream whose cursor is not an exact multiple of 6 past its head, or which
 * hits the `$FFFFFFFF` terminator early, is a LOUD NAMED THROW: it would mean
 * the seed and the cartridge disagree about which stage this is.
 */
export function catchUpObjectStream(ram, rom, pal, opts = {}) {
  const SCRIPT_PAIR = 0x26153e;   // $26152C lea ($26153E,PC),A0
  const SCR0 = 0x813192;          // $261FF2 lea $813192,A1
  const OBJ = 0x04;               // $261FFC move.l (A2)+,$4(A1)
  const STAGE_X4 = 0x813096;      // $240D80's index into every per-stage table
  const stageX4 = ram.u16(STAGE_X4);
  const pair = rom.u32(SCRIPT_PAIR + stageX4);
  const script = rom.u32(pair);                     // script 0
  const head = rom.u32(script);
  const cursor = ram.u32(SCR0 + OBJ);
  const res = { head, cursor, entries: 0, banks: [], same: 0, total: 0, skipped: 0 };
  if (cursor === head) return (pal.catchUp = res);
  // A ZERO CURSOR IS NOT A CORRUPT ONE.  `$261FFC` is what writes this field,
  // so zero means the scroll script has never been installed at all -- which is
  // true of the board's own script-1 block in the shipped seed ($8131AE is 0 on
  // 161 of 161 recorded frames) and of every hand-built fixture in `tests/`.
  // There is nothing to replay and it is not a disagreement; it is counted, so
  // that "no palette because no script" cannot look like "no palette because
  // the catch-up silently did nothing".
  if (cursor === 0) {
    res.noScript = true;
    opts.note?.(0x261ffc, `the script-0 object cursor is 0, so $261FFC has `
      + `never run on this seed and there is no consumed prefix to replay. `
      + `Every sprite bank stays the recording's until a live install writes it`);
    return (pal.catchUp = res);
  }
  if (cursor < head || (cursor - head) % 6 !== 0) {
    unreached(0x2620fc, `the seed's script-0 object cursor is $${cursor
      .toString(16).toUpperCase()} and the cartridge's stream head for stage `
      + `$${(stageX4 / 4).toString(16)} is $${head.toString(16).toUpperCase()}. `
      + `The stream is 6-byte entries, so a cursor that is not head + 6n is not `
      + `a position in THIS stream -- the seed and the cartridge disagree about `
      + `which stage this is, and replaying anything would invent a palette`);
  }
  for (let a = head; a < cursor; a += 6) {
    const ptr = rom.u32(a);
    if (ptr === 0xffffffff) {                       // $2620E6 cmpa.l/beq
      unreached(0x2620e6, `the stage's object stream terminates at $${a
        .toString(16).toUpperCase()} but the seed's cursor is $${cursor
        .toString(16).toUpperCase()}, past the end. The seed's scroll state and `
        + `this cartridge's stream are not the same stream`);
    }
    const param = rom.u16(a + 4);
    let src;
    try {
      src = rom.bytes(ptr, 64);
    } catch (e) {
      // A pointer outside every exported window is the exporter's problem and
      // it is NAMED rather than skipped silently -- but it must not stop the
      // page, because the remaining entries are still sourceable.
      res.skipped++;
      opts.note?.(0x2620f2, `object-stream catch-up entry at $${a.toString(16)
        .toUpperCase()} points at $${ptr.toString(16).toUpperCase()}, which is `
        + `outside every ROM window: ${e.message.slice(0, 120)}`);
      continue;
    }
    // The equality check, before the write, against the staging the seed
    // carries.  It is a MEASUREMENT and never a gate on the write: a seed from
    // a different instant may legitimately disagree.
    const base = PALSTAGE.spr.stage + param * 64;
    if (param >= 0 && param < SPR_BANKS) {
      for (let i = 0; i < 32; i++) {
        res.total++;
        if (ram.u16(base + i * 2) === ((src[i * 2] << 8) | src[i * 2 + 1])) res.same++;
      }
    }
    install24150A(ram, pal, param, src, 0x2620f2,
      `$${ptr.toString(16).toUpperCase()} (object stream catch-up)`);
    res.entries++;
    if (!res.banks.includes(param)) res.banks.push(param);
  }
  res.banks.sort((a, b) => a - b);
  return (pal.catchUp = res);
}

/** The 15 TX banks, and their SIXTEEN entries each.  `$2414BE lsl.w #$5,D0`
 *  is what makes a text bank half the size of a sprite one, and `$2413E2 moveq
 *  #$E,D0` upstream is what pins the region at 15 banks = 240 words. */
export const TX_BANKS = 15;
export const TX_BANK_WORDS = 16;

/**
 * `$2414BE` -- the TEXT/HUD single-bank upload, the eighth of the nine.
 *
 * [M] `python tools/oracle/w27disasm.py 2414BE 241510`:
 *
 *   [M] 2414BE  movem.l  d0/a0-a1,-(a7)
 *   [M] 2414C2  lea.l    $80F886,a1
 *   [M] 2414C8  lsl.w    #$5,d0          <- FIVE, not six: a TX bank is 32 BYTES
 *   [M] 2414CA  adda.w   d0,a1
 *   [M] 2414CC  moveq    #$7,d0
 *   [M] 2414CE  move.l   (a0)+,(a1)+ / dbra    = 8 longs = 32 B = 16 entries
 *   [M] 2414D4  move.w   #$1,$80FA6A
 *
 * THE BOUND IS NOT ARBITRARY AND THE THROW NAMES WHAT IT PROTECTS.  The TX
 * staging is 15 banks -- `$80F886..$80FA65`, 480 bytes -- and `$80FA66` is the
 * SPRITE DIRTY FLAG.  So bank 15 would set the sprite flag with colour data on
 * the board too; the port throws by address rather than clamping, for the
 * reason `install24150A` does (`docs/knowledge/08`).
 */
export function install2414BE(ram, pal, d0, src, site, why) {
  if (!(d0 >= 0 && d0 < TX_BANKS)) {
    unreached(0x2414be, `$2414BE was handed TEXT bank ${d0} from $${site
      .toString(16).toUpperCase()}. lsl.w #$5 makes that $80F886+$${(d0 * 32)
      .toString(16).toUpperCase()}, and the text staging area is only ${TX_BANKS
      } banks ($80F886..$80FA65) because $2413E2's moveq #$E copies 15 of them. `
      + `Bank ${TX_BANKS} lands ON $80FA66, THE SPRITE DIRTY FLAG. The caller `
      + `resolved the wrong table; clamping would hide it`);
  }
  if (src.length !== 32) {
    unreached(0x2414be, `$2414BE from $${site.toString(16).toUpperCase()} was `
      + `handed ${src.length} source bytes and it copies 8 longwords = 32. A `
      + `short read means the ROM window is narrower than the block`);
  }
  const base = PALSTAGE.tx.stage + d0 * 32;
  for (let i = 0; i < TX_BANK_WORDS; i++) {
    ram.setU16(base + i * 2, (src[i * 2] << 8) | src[i * 2 + 1]);
    pal.stageSourced.tx[d0 * TX_BANK_WORDS + i] = 1;
  }
  ram.setU16(PALSTAGE.tx.dirty, 1);                          // $2414D4
  const k = `$${site.toString(16).toUpperCase()} TX bank ${d0} <- ${why}`;
  const e = pal.installs.get(k) ?? { n: 0, bank: d0 };
  e.n++;
  pal.installs.set(k, e);
  pal.installCount++;
}

// ===========================================================================
// W274 -- `$241688`, THE TALLY'S PALETTE SET
//
// `$2600D8` (`src/tally.js`) calls this on both its arms and it was that
// routine's last counted gap. Four arms on (D0, D1), each installing three
// SPRITE banks through `$24150A` and one TEXT bank through `$2414BE`:
//
//        D0  D1     spr           spr           spr           tx
//   $241696  0   0  0 <- $222878  2 <- $222978  4 <- $2229F8   9 <- $2226F8
//   $2416D0  0  !0  0 <- $2228B8  2 <- $2229B8  4 <- $222A38   9 <- $222738
//   $241710 !0   0  1 <- $2228F8  3 <- $222978  4 <- $2229F8  $A <- $222718
//   $24174A !0  !0  1 <- $222938  3 <- $2229B8  4 <- $222A38  $A <- $222758
//
// Read down the columns and the structure is plain: **D1 picks the SOURCE and D0
// picks the DESTINATION BANK.** The two D1=0 arms share `$222978`/`$2229F8` and
// the two D1!=0 arms share `$2229B8`/`$222A38`, while D0 shifts the sprite banks
// from (0,2) to (1,3) and the text bank from 9 to $A. Only the FIRST sprite
// block differs per arm outright.
//
// Bank 4 is installed by all four arms and is never shifted, which is why it
// reads as the shared one.
//
// THE TWELVE SOURCE BLOCKS NEEDED TWO WINDOWS AND NEITHER EXTENT IS A GUESS.
// The eight sprite blocks are $40 apart from `$222878` and `$222A38 + $40` is
// `$222A78`, where W91's palette-family window starts -- so `$222878 + $200` is
// exactly eight blocks and abuts it. The four text blocks are $20 apart from
// `$2226F8`, `$222638 + $C0` ends AT `$2226F8`, and `$222758 + $20` is
// `$222778` where another existing window starts -- so `$2226F8 + $80` fills
// the hole between two windows exactly. See `tools/export-tables.py`.

/** The four arms as data, in the ROM's own order. */
const SET241688 = Object.freeze([
  // [ site, sprBankA, srcA, sprBankB, srcB, sprBankC, srcC, txBank, txSrc ]
  Object.freeze({ site: 0x241696, spr: [[0, 0x222878], [2, 0x222978], [4, 0x2229f8]],
    tx: [9, 0x2226f8] }),
  Object.freeze({ site: 0x2416d0, spr: [[0, 0x2228b8], [2, 0x2229b8], [4, 0x222a38]],
    tx: [9, 0x222738] }),
  Object.freeze({ site: 0x241710, spr: [[1, 0x2228f8], [3, 0x222978], [4, 0x2229f8]],
    tx: [0x0a, 0x222718] }),
  Object.freeze({ site: 0x24174a, spr: [[1, 0x222938], [3, 0x2229b8], [4, 0x222a38]],
    tx: [0x0a, 0x222758] }),
]);

/**
 * `$241688` -- install the tally's four palette banks.
 *
 * @param ram
 * @param pal  the PaletteState
 * @param rom  the RomWindows, for the twelve source blocks
 * @param d0   `$241688 tst.w D0 / bne` -- a WORD test
 * @param d1   `$24168E cmpi.w #$0,D1 / bne` -- also a WORD compare
 * @returns the arm index 0..3 that ran, so a caller or a test can name it
 */
export function paletteSet241688(ram, pal, rom, d0, d1) {
  // Both tests are on WORDS, so a high half never selects an arm.
  const arm = ((d0 & 0xffff) !== 0 ? 2 : 0) + ((d1 & 0xffff) !== 0 ? 1 : 0);
  const a = SET241688[arm];
  const why = `$241688 arm ${arm} (D0 ${(d0 & 0xffff) !== 0 ? '!=' : '=='} 0, `
    + `D1 ${(d1 & 0xffff) !== 0 ? '!=' : '=='} 0) -- the stage-clear tally's set`;
  for (const [bank, src] of a.spr) {
    install24150A(ram, pal, bank, rom.bytes(src, 64), a.site, why);
  }
  install2414BE(ram, pal, a.tx[0], rom.bytes(a.tx[1], 32), a.site, why);
  return arm;
}

/**
 * THE BOOT TEXT INSTALLS -- `$23BF86..$23BFCC`, five banks, and this is the
 * ONE palette catch-up in this port whose code path is the RESET PATH.
 *
 * [M] `python tools/oracle/w27disasm.py 23BF20 23C010`.  The routine at
 * `$23BEEA` is entered by `jmp $23BEEA` from `$23B7D8` (cold, `$803908 := 0`)
 * and from `$23B7F2` (warm, `$803908 := 1`), each of which has just set
 * `A7 = $820000` and masked interrupts.  It runs 20 initialisers and then:
 *
 *   [M] 23BF38  jsr $2412FE            <- ZEROES THE WHOLE PALETTE STAGING
 *   [M] 23BF86  lea $222638,A0 / moveq #$0,D0 / jsr $2414BE
 *   [M] 23BF94  lea $222658,A0 / moveq #$1,D0 / jsr $2414BE
 *   [M] 23BFA2  lea $222678,A0 / moveq #$2,D0 / jsr $2414BE
 *   [M] 23BFB0  lea $222698,A0 / moveq #$3,D0 / jsr $2414BE
 *   [M] 23BFBE  lea $2226B8,A0 / moveq #$4,D0 / jsr $2414BE
 *   [M] 23BFCC  move.w #$8,D0 / jsr $241182 ... / bra.b $23BFDC   <- the main loop
 *
 * There is NO BRANCH between `$23BF86` and `$23BFCC`: five unconditional
 * installs of five constant banks from five constant blocks.
 *
 * ============================================================================
 * WHY THESE FIVE AND NOT THE OTHER TEN, and the answer is a MEASUREMENT
 * ============================================================================
 *
 * `92-impl` §5.2 matched ELEVEN of the 15 text banks to a named site and
 * REFUSED to wire any of them, because "the bytes match, therefore replay it"
 * is the reasoning that would have installed the wrong sprite bank 1, 7 and 8
 * (`92-impl` §5.1).  That refusal was right and this wave does not overturn it.
 * What it does is separate the five banks where the argument is NOT a byte
 * match from the ten where it is.
 *
 * [M] every absolute-long `$2414BE`/`$2414E2` site in the 6 MiB image is
 * enumerated in `.scratch/w93/txsites.py` -- 27 of them.  Grouped by BANK:
 *
 *   [M] bank 0  $23BF8E($222638) $25A80E($222638) $25A92C($222638)
 *               $25A9A2($222618) $25AC10($222618) $25C9AE($222618)
 *               $25CDCE($222618) $26056C($222618) $2605DC($222638)
 *               $28F394($222638)
 *   [M] bank 1  $23BF9C($222658)   $2605EA($222658)
 *   [M] bank 2  $23BFAA($222678)   $2605F8($222678)
 *   [M] bank 3  $23BFB8($222698)   $260606($222698)
 *   [M] bank 4  $23BFC6($2226B8)   $260614($2226B8)
 *
 * **AND THAT IS WHY THESE FIVE ARE SOUND: THE RESULT DOES NOT DEPEND ON WHICH
 * SITE RAN.**  Banks 1..4 have exactly TWO installers in the whole image and
 * both name the SAME block, so no ordering of them produces a different answer.
 * Bank 0 has ten installers naming two different blocks, `$222618` and
 * `$222638` -- and [M] THOSE TWO BLOCKS ARE BYTE-IDENTICAL for all 32 bytes,
 * so the ambiguity is not observable either.  The claim being made is not "the
 * seed's bytes match this block" but "every code path in the cartridge that can
 * write this bank writes these bytes", which no later overwrite can falsify.
 *
 * Banks 5, 6, 7, 8 and 11 are taken too, and by a SECOND argument that is not
 * this one -- `TX_OBJ0A_INSTALLS` below.  The four that are NOT taken are:
 *
 *   [M] bank 9 ($2226F8) has NO installer anywhere in the image at all.
 *       **W274 CORRECTION: IT HAS ONE, AND IT IS NOW PORTED.** `$2416C0 lea
 *       $2226F8,A0 / moveq #$9,D0 / jsr ($2414BE,PC)` is arm 0 of `$241688`, the
 *       tally's palette set -- see `paletteSet241688` below. The claim above was
 *       made with `tools/hard/absxref.py`, which histograms operands landing in
 *       MAIN RAM ($800000..$81FFFF) and therefore cannot see a reference to a
 *       ROM block at all; `python tools/rosetta.py codexref 2226F8` finds it in
 *       one line and always could have. The sentence is left standing above
 *       because the correction is the interesting part: an absence is only ever
 *       as strong as the scan behind it, and this one names its scan.
 *   [M] bank 13 ($222818) has one, `$288590`, whose reachability this wave did
 *       not establish.  It stays the recording's.
 *   [M] banks 10, 12, 14 are ZERO in the seed, and bank 12's only named site
 *       ($25C600 <- $2227F8) does NOT match, so that install never ran.  They
 *       are zero because `$2412FE` zeroed them and nothing wrote them since;
 *       that is a code-sourced zero, not a cartridge block, and it is counted
 *       as UNSOURCED rather than claimed.
 *
 * **AND `$2412FE` IS NOT REPLAYED HERE, DELIBERATELY.**  [M] it is `lea
 * $80E886,A0 / move.w #$8F5,D0 / move.w #$0,(A0)+ / dbra` -- 2,294 words =
 * 4,588 bytes, which is $80E886..$80FA71: ALL THREE staging areas and the fade
 * state.  Running it here would erase the ten text banks and the nine sprite
 * banks the port still takes from the recording, replacing visible recorded
 * colour with black.  The board ran it before every one of its own installs;
 * the port arrives after all of them, so replaying it would be running the
 * cartridge's code at the wrong instant.  (It is worth naming for one more
 * reason: [M] its tail sets `$80FA6C := $20`, `$80FA6E := $1` and
 * `$80FA70 := $0101` -- the fade level, step and DIVIDER `92-impl` §0.2 found
 * from the other end, with the level at exactly the identity.)
 */
export const TX_BOOT_INSTALLS = [
  [0x23bf8e, 0, 0x222638],
  [0x23bf9c, 1, 0x222658],
  [0x23bfaa, 2, 0x222678],
  [0x23bfb8, 3, 0x222698],
  [0x23bfc6, 4, 0x2226b8],
];

/**
 * `$2605C8` -- TYPE `$0A`'s STATE-0 INIT, and the seed's own RAM says it ran.
 *
 * THIS ROUTINE LOOKED UNREACHABLE AND IT IS NOT.  [M] a scan of the whole 6 MiB
 * image for `jsr.l`/`jmp.l`/`bsr.w`/`bra.w`/`jsr (d16,PC)` and for the longword
 * `$002605C8` at EVERY byte offset finds nothing -- and that scan was MINE and
 * it was WRONG, because it did not include the conditional branches.  There is
 * exactly one reference and it is a `beq.w`:
 *
 *   [M] 260794  tst.b    $2(a5)
 *   [M] 260798  beq.w    $2605C8            <- state 0: the INIT arm
 *   [M] 26079C  cmpi.b   #$2,$2(a5)
 *   [M] 2607A2  beq.b    $260788            <- state 2: the teardown
 *   [M] 2607A4  jsr      $25FF7A(pc)        <- state 1: the per-frame body
 *
 * and `$2605C8`'s own first instruction is `move.b #$1,$2(a5)`, which is what
 * takes the object out of state 0 after exactly one visit.
 *
 * THE CHAIN, every link with its disassembly, from the main loop down:
 *
 *   [M] 23BFDC  the main loop; its third call is `jsr $2410BC.l`
 *   [M] 2410C4  lea $80E240,A5 / moveq #$13,D0      <- 20 slots of $50 bytes
 *   [M] 2410CC  move.w (A5),D1 / beq / andi.w #$FF,D1 / lsl.w #$3,D1
 *   [M] 2410DA  lea ($240F62,PC),A0 / movea.l (A0,D1.w),A0 / jsr (A0)
 *   [M] $240F62 is 20 entries of 8 bytes {handler.l, priority.w, $0000}, and
 *       [M] entry $0A ($240FB2) is `$260794`, priority `$001F`
 *   [M] 241182  the allocator: same table for the priority, then
 *       [M] 2411AC move.w D0,(A0) with D0 = $8000|type, and
 *       [M] 2411AE clr.w $2(A0)   <- STATE := 0, so the NEXT dispatch inits
 *
 * ============================================================================
 * AND THE SEED WITNESSES THE EXECUTION, which is what makes this a replay and
 * not a guess
 * ============================================================================
 *
 * [M] the shipped seed's `$80E240` slot array, slot 0:
 *
 *   [M] word $800A   -- ACTIVE ($8000) and TYPE $0A
 *   [M] $2(a5) $01   -- THE STATE BYTE, and $01 is not $00
 *   [M] $4A(a5) $001F -- the priority, equal to $240F62[$0A]'s own word
 *
 * The state byte is `clr.w`ed to 0 by the allocator and the ONLY instruction in
 * the cartridge that makes it 1 is `$2605C8`'s first.  So the seed's own RAM
 * records that this routine executed, exactly the way `$813196` records how far
 * the object stream's cursor had advanced (`catchUpObjectStream`, W91 §2) --
 * and that is a STRONGER warrant than `catchUpBgPalette`'s, which has no seed
 * witness at all and rests on a stage index.
 *
 * [M] and the result agrees: all TEN banks this installs are byte-identical to
 * the staging area the seed carries, 160 of 160 words.  Compare `92-impl`
 * §5.1's sprite routines, where the same "the bytes match" reasoning gives
 * `$24A764` 1 of 2 and `$25BE72` 2 of 5 -- see `catchUpTextPalette`'s caller in
 * `93-impl` for why those two stay refused and this one does not.
 *
 * ONLY THE TEN INSTALLS ARE REPLAYED, not the routine.  `$2605C8` also does
 * `jsr $259C4A`, `clr.w $813080`, `move.w #$1,$813082` and a `$813098` branch;
 * none of that is executed here and none of it is written.  That is the same
 * partial replay `catchUpBgPalette` makes of `$261136` (one call out of a
 * per-stage init) and it is declared rather than implied.
 *
 * [M] banks 0..4 are installed by BOTH this and the reset path, from the SAME
 * five blocks, so running both in board order is idempotent on them -- measured
 * as `sameAsReset` below rather than assumed.
 */
export const TX_OBJ0A_INSTALLS = [
  [0x2605dc, 0, 0x222638], [0x2605ea, 1, 0x222658], [0x2605f8, 2, 0x222678],
  [0x260606, 3, 0x222698], [0x260614, 4, 0x2226b8], [0x260622, 5, 0x2226d8],
  [0x260630, 6, 0x222778], [0x26063e, 7, 0x222798], [0x26064c, 8, 0x2227b8],
  [0x26065a, 11, 0x2227d8],
];

/** `$80E240`, 20 slots of `$50` bytes; `(0,slot)` is `$8000|type` and
 *  `(2,slot)` is the state byte `$260794` switches on. */
export const OBJ_SLOTS = 0x80e240;
export const OBJ_SLOT_BYTES = 0x50;
export const OBJ_SLOT_COUNT = 20;
export const OBJ_TYPE_0A = 0x0a;

/** Did type `$0A` reach state 1 or later before the seed instant?  Returns the
 *  slot and its state, or null -- and a null is what makes `catchUpTextPalette`
 *  leave the ten banks on the recording instead of replaying them blind. */
export function obj0AWitness(ram) {
  for (let s = 0; s < OBJ_SLOT_COUNT; s++) {
    const a = OBJ_SLOTS + s * OBJ_SLOT_BYTES;
    const w = ram.u16(a);
    if ((w & 0x8000) === 0 || (w & 0xff) !== OBJ_TYPE_0A) continue;
    const state = ram.u16(a + 2) >> 8;              // $260794 tst.b $2(a5)
    if (state === 0) continue;                      // still IN state 0: has not run
    return { slot: s, addr: a, state, prio: ram.u16(a + 0x4a) };
  }
  return null;
}

export function catchUpTextPalette(ram, rom, pal, opts = {}) {
  const res = {
    banks: 0, same: 0, total: 0, reset: 0, obj0A: 0, witness: null,
    sameAsReset: 0,
  };
  const run = (list, why) => {
    let n = 0;
    for (const [site, bank, block] of list) {
      let src;
      try {
        src = rom.bytes(block, 32);
      } catch (e) {
        // NAMED, never silent, and never fatal: the bank stays the recording's.
        res.skipped = (res.skipped ?? 0) + 1;
        opts.note?.(site, `the text block $${block.toString(16).toUpperCase()
          } for TX bank ${bank} (${why}) is outside every ROM window: ${e.message
            .slice(0, 120)}. Its 16 words stay the recording's`);
        continue;
      }
      // The equality check against the staging the seed carries, BEFORE the
      // write and never a gate on it -- a seed from another instant may
      // disagree, and a port that REFUSED on disagreement would be asserting
      // that this recording is the only one that exists.
      const already = pal.stageSourced.tx[bank * TX_BANK_WORDS] === 1;
      for (let i = 0; i < TX_BANK_WORDS; i++) {
        res.total++;
        const cart = (src[i * 2] << 8) | src[i * 2 + 1];
        if (ram.u16(PALSTAGE.tx.stage + bank * 32 + i * 2) === cart) res.same++;
        if (already) res.sameAsReset++;
      }
      install2414BE(ram, pal, bank, src, site, `$${block.toString(16)
        .toUpperCase()} (${why})`);
      n++;
      res.banks++;
    }
    return n;
  };
  // 1. THE RESET PATH.  Unconditional: the machine cannot be mid-stage-1
  //    without having run $23BEEA.
  res.reset = run(TX_BOOT_INSTALLS, 'the RESET path $23BEEA, $23BF86..$23BFCC');
  // 2. TYPE $0A's STATE-0 INIT, and ONLY if the seed's own object slot array
  //    says it ran.  A seed whose type-$0A object is still in state 0 -- or
  //    which has no type-$0A object at all -- gets NOTHING from this arm and
  //    keeps the recording's ten banks, which is the whole point: the warrant
  //    is the witness, not the byte match.
  const w = obj0AWitness(ram);
  res.witness = w;
  if (w) {
    res.obj0A = run(TX_OBJ0A_INSTALLS, `$2605C8, type $0A's state-0 init, `
      + `witnessed by slot ${w.slot} state $${w.state.toString(16)}`);
  } else {
    opts.note?.(0x2605c8, `no ACTIVE type $0A object past state 0 in the seed's `
      + `$80E240 slot array, so $2605C8's ten TEXT installs are NOT replayed `
      + `and banks 5, 6, 7, 8 and 11 stay the recording's. The bytes would have `
      + `matched; the witness is what makes replaying them a replay`);
  }
  return (pal.txCatchUp = res);
}

/** The per-stage BACKGROUND palette table, and the one call that reads it.
 *  `$2611B2 lea ($261252,PC),A0` -- the same shape as every other per-stage
 *  table in `src/background.js` BGTAB, indexed by `$813096`. */
export const BGPAL_TABLE = 0x261252;

/**
 * THE BACKGROUND CATCH-UP -- the middle third, and it needs no cursor.
 *
 * `$2611C4` is one call inside the scroll VM's per-stage init `$261136`, which
 * ran on the board before the seed instant and will never run here.  Unlike the
 * object stream it takes NOTHING from the recording at all: D0 and D1 are the
 * immediates `#$0` and `#$1F`, and the source block is `$261252[$813096]` --
 * a cartridge pointer indexed by a stage number the port already reads for the
 * column stream, the element table and the tile base.  So this is a strictly
 * weaker bargain than `catchUpObjectStream`'s (which takes one integer) and
 * very much weaker than `bgSeed`'s (which takes 63 columns of board pixels).
 *
 * WHY REPLAYING IT IS SOUND AND NOT AN ASSUMPTION.  [M] on the shipped seed the
 * 1,024 words this writes are IDENTICAL to the background staging area
 * `$80F086` the seed already carries -- 1,024 of 1,024 -- so the board reached
 * the same state by running this same routine over this same block, and nothing
 * between `$261136` and the seed instant overwrote any of it.  That equality is
 * the model's proof exactly as it is for the sprite third, with the same
 * limitation, stated in `92-impl` §4.2.
 *
 * WHAT IT DOES **NOT** SOURCE: the four words `$241404` animates.  The staging
 * gets the block's own colour and `bgFade241404` computes palette RAM from it,
 * so those four are sourced through the transform rather than by the copy.
 */
export function catchUpBgPalette(ram, rom, pal, opts = {}) {
  const STAGE_X4 = 0x813096;                        // $2611B8 adda.w $813096,A0
  const stageX4 = ram.u16(STAGE_X4);
  const res = { stageX4, block: 0, banks: 0, same: 0, total: 0 };
  const block = rom.u32(BGPAL_TABLE + stageX4);     // $2611BE movea.l (A0),A0
  res.block = block;
  const banks = 0x1f + 1;                           // $2611C2 moveq #$1F,D1
  let src;
  try {
    src = rom.bytes(block, banks * 64);
  } catch (e) {
    // NAMED, never silent, and never fatal: the background third simply stays
    // the recording's and the page prints that it did.
    res.skipped = true;
    opts.note?.(0x2611c4, `the stage's background palette block $${block
      .toString(16).toUpperCase()} (from $261252 + $${stageX4.toString(16)
      .toUpperCase()}) is outside every ROM window: ${e.message.slice(0, 120)}. `
      + `All 1,024 background words stay the recording's`);
    return (pal.bgCatchUp = res);
  }
  // The equality check against the staging the seed carries, BEFORE the write
  // and never a gate on it -- a seed from another instant may disagree.
  for (let i = 0; i < banks * 32; i++) {
    res.total++;
    if (ram.u16(PALSTAGE.bg.stage + i * 2) === ((src[i * 2] << 8) | src[i * 2 + 1])) {
      res.same++;
    }
  }
  install2415E8(ram, pal, 0, 0x1f, src, 0x2611c4,
    `$${block.toString(16).toUpperCase()} (the stage's own block, $261252[`
    + `$${stageX4.toString(16).toUpperCase()}])`);
  res.banks = banks;
  return (pal.bgCatchUp = res);
}

/**
 * The page's palette: the recording's, with every CARTRIDGE-SOURCED word
 * overwritten by the port's.
 *
 * NOT the other way round, and the direction is the honest part.  A word the
 * port has not sourced keeps the capture's value and is COUNTED as such; the
 * page prints both numbers.  Silently substituting the port's zeroes -- or the
 * seed's staging, which is the board's RAM and not the cartridge -- would look
 * finished and be a recording again by a different door.
 */
export function mergePalette(pal, capPal, out) {
  const n = Math.min(capPal.length, out?.length ?? capPal.length);
  const dst = out && out.length >= n ? out : new Uint16Array(capPal.length);
  dst.set(capPal.subarray(0, n));
  let fromCart = 0;
  for (let i = 0; i < n && i < pal.sourced.length; i++) {
    if (pal.sourced[i]) { dst[i] = pal.words[i]; fromCart++; }
  }
  dst.fromCartridge = fromCart;
  return dst;
}

/** How many of the port's cartridge-sourced words equal the BOARD's own
 *  palette RAM at `capPal`.  This is the direct comparison the brief asks for:
 *  palette RAM is in the capture, so unlike a sprite's pixels it can be checked
 *  entry for entry without an emulator. */
export function agreeWithBoard(pal, capPal) {
  let sourced = 0, agree = 0;
  const perBank = new Map();
  for (let i = 0; i < capPal.length && i < pal.sourced.length; i++) {
    if (!pal.sourced[i]) continue;
    sourced++;
    const bank = i < 0x400 ? (i >> 5) : null;
    const ok = pal.words[i] === capPal[i];
    if (ok) agree++;
    if (bank !== null) {
      const e = perBank.get(bank) ?? { n: 0, ok: 0 };
      e.n++; if (ok) e.ok++;
      perBank.set(bank, e);
    }
  }
  return { sourced, agree, perBank };
}
