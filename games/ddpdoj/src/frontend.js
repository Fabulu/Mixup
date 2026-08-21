// THE FRONT-END BOOT BLOCK -- `$23BF74..$23BFDB`, and the loop it falls into.
//
// Every byte below was re-decoded from `rip/sound/maincpu.bin` with
// `python tools/aligned.py sweep` in THIS wave, not restated from a brief. Four
// things the brief for W375 said are wrong, and each one is corrected here with
// the bytes that settle it.
//
// ===========================================================================
// 1. `$23BF74` IS NOT A ROUTINE ENTRY, AND IT DOES NOT END AT `$23BFDC`
// ===========================================================================
// [M] `python tools/aligned.py check 0x23beea 0x23c008 0x23bf74 0x23bfdc 0x23c006`
// decodes `$23BEEA..$23C007` as FIFTY-TWO instructions with no flow break, and
// reports `$23BF74` `$23BFDC` `$23C006` all BOUNDARY. So:
//
//   * the routine is `$23BEEA` -- the one `palette.js` already names, entered by
//     `jmp` from `$23B7D8` (cold) and `$23B7F2` (warm). `$23BF74` is TWENTY-THREE
//     `jsr`s into it, not the top of anything;
//   * the block does not stop after `move.w #$D,($4,A0)`. It falls straight into
//     `$23BFDC`, the seven-call main loop, and `$23C006 60 d4` is `bra.s` back to
//     `$23BFDC` -- displacement `$D4` = -44, PC = `$23C008`, target `$23BFDC`.
//     **THE ROUTINE NEVER RETURNS.** Its real extent is `$23BF74..$23C007`, and
//     `$23C008` is a DIFFERENT routine that only looks like the tail (§3).
//
// [M] the twenty-three calls `$23BEEA..$23BF73` runs BEFORE this block:
//
//   23BEEA jsr $256E18   23BEF0 jsr $23C106   23BEF6 jsr $247374
//   23BEFC jsr $23C586   23BF02 jsr $23BE0C   23BF08 jsr $245C8E
//   23BF0E jsr $245CBA   23BF14 jsr $23C1EC   23BF1A jsr $23C5C8
//   23BF20 jsr $23C6C6   23BF26 jsr $28B8AE   23BF2C jsr $23C6FA
//   23BF32 jsr $23D0D2   23BF38 jsr $2412FE   23BF3E jsr $24631C
//   23BF44 jsr $23D1F2   23BF4A jsr $24107C   23BF50 jsr $2603D4
//   23BF56 jsr $240B0E   23BF5C jsr $259C4A   23BF62 jsr $24A810
//   23BF68 jsr $25C57E   23BF6E jsr $2884E2
//
// `bootFrontEnd23BF74` runs NONE of them and says so with one counted note. Four
// ARE already ported under other names (`$24107C` objTableInit24107C, `$240B0E`
// camReset, `$25C57E` clear25C57E, `$24631C` clear24631C) and running them from
// here would be this wave choosing an execution order the sweep has not verified
// past `$23BEEA`'s own callees. The block this file owns is the block it decodes.
//
// ===========================================================================
// 2. `$23BF74`'s SIX CALLS, VERBATIM
// ===========================================================================
//   23BF74  4eb9 0028841e   jsr $28841E     the FACTORY high-score table
//   23BF7A  4eb9 0023c194   jsr $23C194     $80393C |= 1, then COMMIT it (§3)
//   23BF80  4eb9 0023c1c2   jsr $23C1C2     $80393E := 0, then IPL := 0 (§4)
//   23BF86  41f9 00222638   lea $222638,A0 / 7000 moveq #$0,D0 / jsr $2414BE
//   23BF94  41f9 00222658   lea $222658,A0 / 7001 moveq #$1,D0 / jsr $2414BE
//   23BFA2  41f9 00222678   lea $222678,A0 / 7002 moveq #$2,D0 / jsr $2414BE
//   23BFB0  41f9 00222698   lea $222698,A0 / 7003 moveq #$3,D0 / jsr $2414BE
//   23BFBE  41f9 002226b8   lea $2226B8,A0 / 7004 moveq #$4,D0 / jsr $2414BE
//   23BFCC  303c 0008       move.w #$8,D0
//   23BFD0  4eb9 00241182   jsr $241182     stage a CREATE of dispatch type 8
//   23BFD6  317c 000d 0004  move.w #$D,($4,A0)
//   23BFDC  ...the main loop
//
// `$23BFD6` writes through **A0**, the record `$241182` left staged -- not A5,
// and not the table slot, which does not exist yet. On a full create queue
// `$241182` hands back the DUMMY at `$80D51C` and the cartridge writes through
// that just the same, so this port does too (`teardown25A9B2` has the same shape).
//
// The five palette blocks are `$20` bytes apart and ALREADY WINDOWED: W93
// declared `(0x222638, 0x00C0)` in `tools/export-tables.py:1896`, which covers
// banks 0..5 contiguously. This wave declared no new window.
//
// ===========================================================================
// 3. `$23C194` IS NOT `or.w #1,$80393C` AND STOPPING. IT TAIL-JUMPS.
// ===========================================================================
// `displaylist.js` has said since wave 11 that `$23C194` is "`move.w #1,D0 /
// or.w D0,$80393C`". THE FIRST TWO INSTRUCTIONS ARE RIGHT AND THE ROUTINE IS
// FOUR BYTES LONGER THAN THAT:
//
//   [M] 23C194  30 3c 00 01        move.w #$1,D0
//   [M] 23C198  81 79 00 80 39 3c  or.w   D0,$80393C
//   [M] 23C19E  60 00 fe 68        bra.w  $23C008        <- NOT an rts
//
// and its twin, which `displaylist.js` also inlines as the RAM half only:
//
//   [M] 23C1A2  30 3c 00 01        move.w #$1,D0
//   [M] 23C1A6  46 40              not.w  D0             -> $FFFE
//   [M] 23C1A8  c1 79 00 80 39 3c  and.w  D0,$80393C
//   [M] 23C1AE  60 00 fe 58        bra.w  $23C008
//
// Both displacements resolve to the SAME address and it is the one the linear
// sweep of `$23BEEA` stopped just short of: `$23C1A0 + $FE68 = $23C008` and
// `$23C1B0 + $FE58 = $23C008` (`bra.w`'s base is the EXTENSION WORD's address).
//
//   [M] 23C008  41 f9 00 b0 e0 00  lea    $B0E000,A0
//   [M] 23C00E  30 b9 00 80 39 3c  move.w $80393C,(A0)
//   [M] 23C014  4e 75              rts
//
// So the flag word is MIRRORED INTO THE IGS023 CONTROL REGISTER on every set and
// every clear, and the port never wrote `$B0E000` at all -- `background.js:363`
// says as much in prose ("the caller is not on the main loop's seven-call path
// and is NOT identified here"). It IS on it: call #4 opens with `$23C1A2` and
// closes with `$23C194`. That half now lives in `displaylist.js` beside the
// `sectionFlag` constant it already owned, and this file imports the setter.
//
// ===========================================================================
// 4. `$23C1C2` -- WHAT IT READS, WHAT IT WRITES, WHAT IT RETURNS
// ===========================================================================
//   [M] 23C1C2  2f 00              move.l D0,-(A7)        save the caller's D0
//   [M] 23C1C4  70 00              moveq  #$0,D0
//   [M] 23C1C6  33 c0 00 80 39 3e  move.w D0,$80393E
//   [M] 23C1CC  60 e4              bra.s  $23C1B2         <- again NOT an rts
//
// `$60E4` is -28 from PC = `$23C1CE`, so the target is `$23C1B2`, which is the
// instruction immediately after `$23C1A2`'s `bra.w` and is a SHARED TAIL:
//
//   [M] 23C1B2  e1 48              lsl.w  #$8,D0          level -> SR bits 10-8
//   [M] 23C1B4  40 c1              move   SR,D1
//   [M] 23C1B6  02 41 f8 ff        andi.w #$F8FF,D1       clear the old IPL
//   [M] 23C1BA  82 40              or.w   D0,D1
//   [M] 23C1BC  46 c1              move   D1,SR
//   [M] 23C1BE  20 1f              move.l (A7)+,D0        restore the caller's
//   [M] 23C1C0  4e 75              rts
//
// THE CONTRACT: reads NOTHING (the `moveq` makes D0 zero before it is used, and
// SR is read only to be masked); writes `$80393E := 0` and the 68000 interrupt
// priority mask := 0, i.e. ENABLE ALL INTERRUPTS; returns NOTHING -- D0 is popped
// back to whatever the caller had, so it is register-transparent. The obvious
// reading, "it returns the old mask", is wrong: nothing is left anywhere.
//
// [M] AND ITS SIBLING IS THE DISABLE, sharing the same tail:
//
//   [M] 23C1CE  2f 00              move.l D0,-(A7)
//   [M] 23C1D0  40 c0              move   SR,D0
//   [M] 23C1D2  02 40 07 00        andi.w #$700,D0        extract the old IPL
//   [M] 23C1D6  e1 48              lsl.w  #$8,D0          <- LEFT, on bits 10-8
//   [M] 23C1D8  33 c0 00 80 39 3e  move.w D0,$80393E
//   [M] 23C1DE  70 07              moveq  #$7,D0
//   [M] 23C1E0  60 d0              bra.s  $23C1B2         mask := 7
//
// `$23C1D6` shifts bits 10-8 LEFT by eight, off the top of the word, so `$80393E`
// is stored ZERO no matter what the mask was. That is what the bytes say and it
// is transcribed, not corrected -- `$23C1CE` is outside this unit and is recorded
// here only because it is what proves `$23C1B2` is shared rather than `$23C1C2`'s
// own tail (decoding trap 6: a tail reached by a branch is not private).
//
// THE PORT HAS NO STATUS REGISTER. IRQ4 and IRQ6 are driven from `Game#step()`'s
// vblank loop, not by a modelled 68000, so the mask write has no modelled effect
// and is a COUNTED note rather than a silent no-op. The `$80393E` write is real
// and is made.

import { u16 } from './ram.js';
import { hiscoreDefaults28841E } from './hiscore.js';
import { sectionFlagSet23C194 } from './displaylist.js';
import { install2414BE } from './palette.js';
import { stageCreate } from './objalloc.js';

export const BOOT = Object.freeze({
  reset: 0x23beea,          // the routine $23BF74 lives inside
  site: 0x23bf74,           // the block this file owns
  loop: 0x23bfdc,           // where it falls through to -- Game#step()
  loopBack: 0x23c006,       // 60 d4 bra.s $23BFDC
  end: 0x23c008,            // one past the block; ALSO $23C194's tail (§3)
  hiscore: 0x28841e,        // $23BF74
  sectionSet: 0x23c194,     // $23BF7A
  intEnable: 0x23c1c2,      // $23BF80
  iplTail: 0x23c1b2,        // the shared `move D1,SR` tail
  iplShadow: 0x80393e,      // $23C1C6 move.w D0,$80393E
  iplEnableLevel: 0x0,      // $23C1C4 moveq #$0,D0
  // $23BF86..$23BFCB -- five `lea block,A0 / moveq #n,D0 / jsr $2414BE`.
  // The same five `palette.js` carries as TX_BOOT_INSTALLS; kept here as the
  // (site, bank, block) triples the CODE has, so a divergence is a test failure
  // and not a silent disagreement between two lists.
  txInstalls: Object.freeze([
    Object.freeze([0x23bf8e, 0, 0x222638]),
    Object.freeze([0x23bf9c, 1, 0x222658]),
    Object.freeze([0x23bfaa, 2, 0x222678]),
    Object.freeze([0x23bfb8, 3, 0x222698]),
    Object.freeze([0x23bfc6, 4, 0x2226b8]),
  ]),
  screenType: 0x08,         // $23BFCC move.w #$8,D0 -- object dispatch [8]
  screenState: 0x000d,      // $23BFD6 move.w #$D,($4,A0) -- arm 13, the WARNING
  stateField: 0x04,         // ...and ($4,A0) is arm 0's INITIAL-STATE word
  dispatch: 0x240f62,       // $241182 takes the priority from here, never a literal
});

/** The twenty-three calls of `$23BEEA..$23BF73` this block does not run, and the
 *  four of them this port already has under another name. Listed so the note
 *  below can name them rather than say "some". */
export const RESET_PROLOGUE = Object.freeze([
  0x256e18, 0x23c106, 0x247374, 0x23c586, 0x23be0c, 0x245c8e, 0x245cba,
  0x23c1ec, 0x23c5c8, 0x23c6c6, 0x28b8ae, 0x23c6fa, 0x23d0d2, 0x2412fe,
  0x24631c, 0x23d1f2, 0x24107c, 0x2603d4, 0x240b0e, 0x259c4a, 0x24a810,
  0x25c57e, 0x2884e2,
]);

/**
 * `$23C1B2` -- the shared tail. Sets the 68000 interrupt priority mask to `d0`
 * and restores the caller's D0.
 *
 * @param level  D0 on entry, 0..7. `lsl.w #$8` is what puts it in SR bits 10-8.
 * @param from   the branch site, for the note ($23C1CC or $23C1E0).
 * @returns the level, so a caller can record what it asked for.
 */
export function iplSet23C1B2(level, ctx, from) {
  ctx?.unported?.note(BOOT.iplTail,
    `$23C1BC move D1,SR -- set the 68000 interrupt mask to level ${level}, `
    + `reached from $${from.toString(16).toUpperCase()}. THIS PORT HAS NO STATUS `
    + 'REGISTER: IRQ4 and IRQ6 are driven from Game#step()\'s vblank loop, so a '
    + 'mask this port honoured would have nothing to mask. The RAM half '
    + '($80393E) is written by the caller and IS real');
  return level;
}

/**
 * `$23C1C2` -- clear the interrupt-mask shadow and ENABLE ALL INTERRUPTS.
 *
 * Register-transparent: `$23C1C2 move.l D0,-(A7)` and the tail's `$23C1BE
 * move.l (A7)+,D0` are a pair, so the routine returns nothing at all.
 *
 * @returns {{shadow:number, level:number}} diagnostics, NOT a 68000 return value.
 */
export function interruptEnable23C1C2(ram, ctx) {
  ram.setU16(BOOT.iplShadow, 0);                      // $23C1C6 move.w D0,$80393E
  const level = iplSet23C1B2(BOOT.iplEnableLevel, ctx, 0x23c1cc);   // $23C1CC bra.s
  return { shadow: ram.u16(BOOT.iplShadow), level };
}

/**
 * `$23BF74..$23BFDB` -- the six calls that arm the front end, then fall into the
 * main loop at `$23BFDC`. **IT DOES NOT RETURN ON THE BOARD**; here the fall-through
 * is `Game#step()`, called repeatedly, which is `$23BFDC..$23C006 bra.s $23BFDC`.
 *
 * @param pal  the `PaletteState` the five `$2414BE` installs write through. A
 *             caller without one gets five counted notes and no palette, the same
 *             bargain the guarded direct `$2414BE` front-end callers already make.
 * @returns {{hiscore:boolean, sectionFlag:number, ctrl:number, banks:number,
 *            skipped:number, made:object, state:number}}
 */
export function bootFrontEnd23BF74(ram, rom, pal, ctx) {
  // The twenty-three calls ahead of this block. ONE note, not twenty-three: the
  // gap is "this port enters $23BEEA at $23BF74", which is a single fact.
  ctx?.unported?.note(BOOT.reset,
    `$23BEEA..$23BF73 -- the ${RESET_PROLOGUE.length} jsr's the reset routine `
    + `runs BEFORE $23BF74 (`
    + RESET_PROLOGUE.map((a) => `$${a.toString(16).toUpperCase()}`).join(' ')
    + '). This port enters the straight line at $23BF74. $24107C, $240B0E, '
    + '$25C57E and $24631C are ported under other names and the rest are not; '
    + 'running only the four would be an execution order nothing has verified');

  hiscoreDefaults28841E(ram, rom);                    // $23BF74 jsr $28841E
  // $23BF7A jsr $23C194 -- and its `bra.w $23C008` tail, which is why this
  // writes the video control register too. See §3 of this file's header.
  const sectionFlag = ram.u16(0x80393c);
  const ctrl = sectionFlagSet23C194(ram, ctx?.videoRegs);
  const irq = interruptEnable23C1C2(ram, ctx);        // $23BF80 jsr $23C1C2

  // $23BF86..$23BFCB -- FIVE installs, unconditional, no branch between them.
  let banks = 0; let skipped = 0;
  for (const [site, bank, block] of BOOT.txInstalls) {
    if (!pal) {
      skipped++;
      ctx?.unported?.note(site, `$${site.toString(16).toUpperCase()} jsr $2414BE `
        + `-- TEXT bank ${bank} from $${block.toString(16).toUpperCase()} with no `
        + 'PaletteState on this chain');
      continue;
    }
    install2414BE(ram, pal, bank, rom.bytes(block, 32), site,
      `$${block.toString(16).toUpperCase()} (the RESET path $23BF86..$23BFCC)`);
    banks++;
  }

  // $23BFCC move.w #$8,D0 / $23BFD0 jsr $241182 / $23BFD6 move.w #$D,($4,A0).
  // The priority comes out of the DISPATCH TABLE, never from here -- hence the
  // callback (`$24119C move.w ($4,A0,D1.w),D1`).
  const made = stageCreate(ram, BOOT.screenType,
    (t) => rom.u16(BOOT.dispatch + t * 8 + 4));
  ram.setU16(made.addr + BOOT.stateField, u16(BOOT.screenState));

  return {
    hiscore: true, sectionFlag: ram.u16(0x80393c), sectionFlagBefore: sectionFlag,
    ctrl, ipl: irq, banks, skipped, made,
    state: ram.u16(made.addr + BOOT.stateField),
  };
}
