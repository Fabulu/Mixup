// THE THREE GUNS THE STEADY STATE STARTS -- E scripts 3, 4 and 13.  W95.
//
// ============================================================================
// WHY THESE THREE
// ============================================================================
// `[M]` with the ten of `src/bossphase.js` registered, the `stage1-sweep`
// ladder's 28 steady-state rungs (lf12,000..18,750) stop being blocked on their
// FIRST frame and run 40..200 frames each -- and every one of them then stops on
// exactly FOUR addresses:
//
//   $296752  E 13's INIT   15 rungs      $2952D8  F 2's INIT      3 rungs
//   $295E0E  E 3's INIT     8 rungs      $295F44  E 4's INIT      2 rungs
//
// 15 + 8 + 3 + 2 = 28.  This file is the three E scripts -- 25 of the 28.  F 2
// is NOT here and §"WHAT IS NOT HERE" at the foot says exactly why.
//
// ============================================================================
// **E 13 IS BULLET KIND 11, AND IT IS THE FIRST EXECUTION OF ANY W27 BODY**
// ============================================================================
// W27 transcribed all 39 bullet behaviour kinds in wave 27 and recon 48 §5
// measured that NOT ONE of them had ever run: the boss is the only reader of
// kinds 9 and 11 in stage 1, and the boss was unported.  `$2967D6` and
// `$2967EA` are kind 11's two generator sites (`move.l #$FFF9000B,D0`, and
// `D0 & $3F` = 11), and this file is what reaches them.
//
// > Code that has never run has never been tested.  If `src/mover.js`'s kind-11
// > body misbehaves, that is a FINDING and the worklog treats it as one.
//
// ============================================================================
// E 3 AND E 4 ARE THE SAME ROUTINE TWICE, AND THE COPY HAS A BUG IN THE ROM
// ============================================================================
// `$295E0E`/`$295E5E` (E 3) and `$295F44`/`$295F94` (E 4) are the LEFT and
// RIGHT part guns and they are instruction-for-instruction identical apart from
// four operands: the part position (`$22(A6)` / `$62(A6)`), the muzzle bias
// (`$F6C00140` / `$F6BFFEC0`) and the part-destroyed gate (`$3F(A6)` /
// `$7F(A6)`).
//
// **AND ONE MORE, WHICH IS NOT A PARAMETER.**  `[M]` E 3's init ends
// `$295E4C bcs.w $295E5E` -- "no live player, skip the aim" -- branching to its
// OWN step.  E 4's is `$295F82 bcs.w $295E5E` (`65 00 FE DA`, displacement
// -294 from `$295F84`), **the same target, which is E 3's STEP and not E 4's**.
// The copy kept the label.  So with both players dead, arming E 4 runs E 3's
// step against E 4's slot -- reading `$3F(A6)` where E 4 means `$7F(A6)` and
// firing from `$8(A4)`, which at that instant holds E 4's own muzzle because
// the init wrote it four instructions earlier.  It is transcribed as written;
// `e4-init-own-step` is the reading that "fixes" it.

import { u16, i16 } from './ram.js';
import { registerScript } from './scheduler.js';
import { aim256FromCaller, AimTables } from './aim.js';
import { drawSigned242FDE, drawWord242EC2, drawWord24328E } from './rng.js';
import { fire as fireBulletFan, WriteLog } from './bullets.js';
import { bossA5, bossA6 } from './boss.js';

const u8 = (v) => v & 0xff;
const asrw = (v, n) => (i16(v) >> n) & 0xffff;

/** `portdiff.mjs` / `breakage.mjs` are the only writers; `null` ships. */
export const W95G_MUTATE = { value: null };

export const W95G = {
  e3Init: 0x295e0e, e3Step: 0x295e5e,
  e4Init: 0x295f44, e4Step: 0x295f94,
  e13Init: 0x296752, e13Step: 0x296790,
  /** `$295DD2` -- FIFTEEN longwords indexed by `($AC(A6) + 7) * 4`, the SAME
   *  signed row selector OBJECT 3 (`$292BFA`, W82) uses for its sprite table.
   *  So the muzzle and the picture come off one number, and a wrong `$AC` puts
   *  the bullets somewhere the boss is not drawn. */
  armTable: 0x295dd2,
  fanTable: 0x2736fa,        // $2967C2 lea $2736FA -- type $80's narrow fan
  doneTail: 0x2958ce,        // `clr.w (a4) / rts`, recon 48 §1.4's landmark
  freeze: 0x8130d4,
  rank: 0x813098,
};

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

/** `lea $295DD2(pc),A0 / move.w $AC(A6),D2 / addq.w #$7,D2 / add.w D2,D2 /
 *  add.w D2,D2 / move.l (A0,D2.w),D2 / add.l $A2(A6),D2` -- the arm muzzle,
 *  taken off the SHADOW longword `$29314C` maintains, not off `$2(A6)`. */
function armMuzzle(rom, ram, a6) {
  const d2 = u16((i16(ram.u16(a6 + 0xac)) + 7) * 4);   // $29679E..$2967A6
  return ((rom.u32(W95G.armTable + i16(d2)) + ram.u32(a6 + 0xa2)) >>> 0);
}

// ===========================================================================
// E 3 and E 4 -- the two part guns
// ===========================================================================
const PART_GUN = {
  3: { pos: 0x22, bias: 0xf6c00140, dead: 0x3f, init: 0x295e0e, step: 0x295e5e },
  4: { pos: 0x62, bias: 0xf6bffec0, dead: 0x7f, init: 0x295f44, step: 0x295f94 },
};

/**
 * `$295E0E` / `$295F44`.  **BOTH INITs FALL THROUGH INTO A STEP**, and the last
 * two instructions are a no-op branch that says so: `cmpi.b #$2,$3(A4) /
 * bne.w <the next address>` -- BOTH arms land on the same instruction, so the
 * compare decides nothing.  It is transcribed as the dead pair it is.
 *
 * @returns {number} the STEP the init falls into: E 3's OWN for id 3, and
 *   **E 3's for id 4 as well when the aim declines** -- the ROM's copy bug.
 */
export function partGunInit(ram, rom, ctx, a4, a5, a6, id) {
  const f = PART_GUN[id];
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $295E0E bchg.b #$0,$3(a5)
  ram.setU16(a4 + 0x04, 0x0004);                       // $295E14 -- $4=0, $5=4
  ram.setU16(a4 + 0x06, 0x0820);                       // $295E1A -- $6=8, $7=$20
  // $295E20 jsr $242FDE / subq.b #$1,D0 / add.b D0,$7(A4) -- the CADENCE is
  // jittered by a SIGNED table byte minus one, and `$7(A4)` is the reload, so
  // the jitter persists for the whole life of the gun rather than one shot.
  ram.setU8(a4 + 0x07, u8(ram.u8(a4 + 0x07)
    + u8(drawSigned242FDE(ram, rom) - 1)));            // $295E26/$295E28
  const d0 = (ram.u32(a6 + f.pos) + f.bias) >>> 0;     // $295E2C/$295E30 addi.l
  ram.setU32(a4 + 0x08, d0);                           // $295E36
  ram.setU8(a4 + 0x0c, 0x80);                          // $295E3A
  // $295E40 movem.w $8(A4),D0-D1 -- SELF IS THE MUZZLE THE LINE ABOVE JUST
  // COMPUTED, read back out of the slot as two words.  So the gun aims from
  // where its bullets will appear, not from the boss's centre.
  const r = aim256FromCaller(aimTables(rom), ram, a5,
    ram.u16(a4 + 0x08), ram.u16(a4 + 0x0a));           // $295E46 jsr $24226E
  if (r.carry) {
    // THE ROM'S COPY BUG, §header.  E 4 branches into E 3's step.
    const into = (id === 4 && W95G_MUTATE.value !== 'e4-init-own-step') ? 3 : id;
    return into;
  }
  ram.setU8(a4 + 0x0c, r.dir & 0xff);                  // $295E50 move.b d1,$c(a4)
  return id;                                           // the dead cmpi/bne pair
}

/** `$295E5E` / `$295F94`. */
export function partGunStep(ram, rom, ctx, a4, a5, a6, id) {
  const f = PART_GUN[id];
  // `$295E62 bne.w $2958CE` -- the SHARED "script done" tail recon 48 §1.4
  // names as the landmark that bounds tables D and E.  A destroyed part retires
  // its gun rather than silencing it, so the slot is freed for another script.
  if (ram.u8(a6 + f.dead) !== 0) { ram.setU16(a4, 0); return; }   // $295E5E
  const t = ram.u8(a4 + 0x04);                         // $295E66 subq.b #$1
  ram.setU8(a4 + 0x04, u8(t - 1));
  if (t !== 0) return;                                 // $295E6A bcc.w -> rts
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));             // $295E6E
  // `$295E74 tst.w $8130D4 / bne` -- the freeze SKIPS THE VOLLEY but still runs
  // the tail, so `$10(A4)` advances and `$2(A4)` counts down while frozen.  A
  // port that returned here would make the gun outlive the freeze.
  if (ram.u16(W95G.freeze) === 0) {                    // $295E7A bne.w
    const mode = ram.u8(a4 + 0x03);
    // **MODE 0 FIRES NOTHING.**  `$295E96 move.l #$10007,D0 / move.l D0,D6 /
    // move.b $C(A4),D1 / bra` -- three register loads and a branch to the tail,
    // with no `jsr` anywhere in the arm.  F 1's state-1 gun starts E 3/E 4 with
    // `$3(A0) := 0` (`$2951E4`), so THE FIRST FOUR TICKS OF EVERY PART GUN ARE
    // SILENT.  That is a phase of the attack, not a missing transcription.
    // **AND MODES 1 AND >=2 ARE THE SAME BLOCK TWICE** ($295EB0 and $295EF4 are
    // instruction-for-instruction identical), so the compare at `$295EA6`
    // selects between two copies of one fan.
    if (mode !== 0) {
      const d0 = ((ram.u16(a4 + 0x10) << 16) | 0x0007) >>> 0;     // $295EB0..$295EBA
      const d2 = ram.u32(a4 + 0x08);                   // $295E84 move.l $8(a4),d2
      // `$295EBE tst.w $813098` -- RANK, and it changes BOTH the spread and the
      // COUNT: rank 0 fires 3 shots $14 apart from `$C(A4)-$14`; rank != 0
      // fires 7 shots $A apart from `$C(A4)-$1E`.  The two arms are symmetric
      // about `$C(A4)` in both cases, which is the reading that validates them.
      const hard = ram.u16(W95G.rank) !== 0;           // $295EC4 bne
      let d1 = u8(ram.u8(a4 + 0x0c) - (hard ? 0x1e : 0x14));      // $295EC8/$295ED8
      const d5 = hard ? 0x0a : 0x14;                   // $295ECC/$295EDC
      const n = (hard ? 6 : 2) + 1;                    // $295ED0/$295EE0 + dbra
      for (let k = 0; k < n; k++) {                    // $295EE4..$295EEC
        const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x281708,
          { d0, d1, d2, d3: 0, d4: 0, d5: 0, a5 });    // $295EE4 jsr $281708
        ctx.bulletSpawn?.(f.step === 0x295e5e ? 0x295ee4 : 0x29601a, res);
        d1 = u8(d1 + d5);                              // $295EEA add.b d5,d1
      }
      // D4 IS NEVER SET IN THIS ROUTINE and it is passed to the generator.
      // `[M]` that is safe and the reason is checkable: `$2815C6[7]` is
      // `$2818AC`, the spawn-init that writes NOTHING, so kind 7 reads no
      // register beyond D0/D1/D2.  Passing 0 is therefore not a guess -- it is
      // a value the cartridge provably cannot observe.
    }
  }
  ram.setU16(a4 + 0x10, u16(ram.u16(a4 + 0x10) + 4));  // $295F34 addq.w #$4
  const n2 = u8(ram.u8(a4 + 0x02) - 1);                // $295F38 subq.b #$1
  ram.setU8(a4 + 0x02, n2);
  if (n2 === 0) ram.setU16(a4, 0);                     // $295F3C/$295F40 clr.w (a4)
}

// ===========================================================================
// E 13 -- $296752 / $296790.  BULLET KIND 11, AND THE WHOLE VOLLEY IS ONE FRAME
// ===========================================================================
// **E 13 DOES NOT SPREAD ITS WORK OVER FRAMES.**  `$2968DA subq.w #$1,$6(A4) /
// bne.w $2967FA` loops back INSIDE the same call, so one dispatch of this
// script fires 32 kind-11 bullets and `3 * $6(A4)` kind-7 bullets and then
// `clr.w (A4)` retires the slot.  `$6(A4)` is not the script's own: F 6 writes
// it through `$259A18`'s return value (`$2957E4 move.w $E(A4),$6(A0)`), and F 6
// steps that from 6 upward -- so the ladder gets longer every burst.
//
// **THE INIT DOES NOT FALL THROUGH.**  `$29678E rts` -- E 0, E 1 and E 13 are
// the three E scripts that end in one, against E 3 and E 4 which do not.
//
// **`$296796 bne.w $2968E2` RETIRES THE SLOT WHEN FROZEN**, where E 3 and E 4's
// identically-placed `tst.w $8130D4` merely skips the volley.  Two scripts, one
// gate word, opposite meanings -- and the difference is which label the branch
// carries.
export function e13Init296752(ram, rom, a4, a5, a6) {
  ram.setU16(a4 + 0x08, 8);                            // $296752
  ram.setU16(a4 + 0x0a, 0);                            // $296758
  ram.setU16(a4 + 0x0c, 0);                            // $29675E
  // $296764 move.w $AC(A6),D0 / addi.w #$20,D0 / add.b D0,D0 / add.b D0,D0
  // -- **the two doublings are BYTE ops on a value formed as a WORD**, so the
  // row index is biased into 0..$3F and then multiplied by four AS A BYTE, and
  // anything at or above $40 wraps instead of overflowing.  A port that used
  // `* 4` on the word would give a different angle for exactly the rows the
  // sweep in F 6 spends most of its time on.
  const d0 = u16(ram.u16(a6 + 0xac) + 0x20);           // $296764/$296768
  ram.setU8(a4 + 0x10, W95G_MUTATE.value === 'e13-word-scale'
    ? u8(d0 * 4) : u8(u8(d0 * 2) * 2));                // $29676C/$29676E/$296770
  // $296774 movem.w $A2(A6),D0-D1 / jsr $24226E -- self is THE SHADOW, the
  // five-frame-lagged position `$29314C` maintains, so the arms aim from where
  // the boss was and not from where it is.
  const r = aim256FromCaller(aimTables(rom), ram, a5,
    ram.u16(a6 + 0xa2), ram.u16(a6 + 0xa4));           // $29677A
  if (!r.carry) ram.setU8(a4 + 0x10, r.dir & 0xff);    // $296780/$296784
  ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);         // $296788 bchg.b #$0,$3(a5)
}

export function e13Step296790(ram, rom, ctx, a4, a5, a6) {
  if (ram.u16(W95G.freeze) !== 0) { ram.setU16(a4, 0); return; }  // $296790/$296796
  // ---- $29679A: THE KIND-11 RING, sixteen pairs.
  let d2 = armMuzzle(rom, ram, a6);                    // $29679A..$2967AC
  let d1 = u8(drawWord242EC2(ram, rom));               // $2967B0/$2967B6 move.b d0,d1
  const d0k11 = 0xfff9000b >>> 0;                      // $2967BA -- KIND 11
  for (let k = 0; k < 16; k++) {                       // $2967C0 moveq #$F / dbra
    // `$2967C8 move.w D1,D3 / addq.w #$2,D3 / andi.w #$FC,D3 / move.l
    // (A0,D3.w),D3` -- the SAME `((angle+2) & $FC)` lookup into `$2736FA` the
    // midboss's big fan uses, so the two share a table and a rounding rule.
    const look = (a) => rom.u32(W95G.fanTable + (u16(a + 2) & 0xfc));
    const d6 = u8(d1);                                 // $2967D4 move.b d1,d6
    for (const ang of [d6, u8(d6 + 4)]) {              // $2967D6 / $2967EA
      const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x2817b8,
        { d0: d0k11, d1: ang, d2, d3: look(ang), d4: 0, d5: 0, a5 });
      ctx.bulletSpawn?.(ang === d6 ? 0x2967d6 : 0x2967ea, res);
    }
    d1 = u8(d6 + 0x10);                                // $2967F0/$2967F2
  }
  // ---- $2967FA: THE KIND-7 TRIPLET, repeated `$6(A4)` times IN THIS FRAME.
  // The `dbra`-free outer loop is a `bne` on a WORD, so `$6(A4) == 0` on entry
  // would run it 65,536 times; F 6 never writes 0 (`$2957E4` copies `$E(A4)`,
  // which starts at 6 and only grows) and nothing else starts E 13.
  for (;;) {
    const shot = (sub, adj, site) => {
      ram.setU16(a4 + 0x12, asrw(drawWord24328E(ram, rom), 3));  // $2967FA/$296800
      const p = u16(ram.u8(a4 + 0x04) - sub);          // $296806/$29680C subi.w
      const d0 = ((p << 16) | 0x0007) >>> 0;           // $296810/$296812 -- KIND 7
      const ang = u8(ram.u8(a4 + 0x10) + adj);         // $296816 (+3 / -3)
      d2 = (armMuzzle(rom, ram, a6) + 0) >>> 0;        // $29681A..$29682C
      d2 = ((d2 & 0xffff0000) | u16(d2 + ram.u16(a4 + 0x12))) >>> 0;  // $296830 add.w
      const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x281708,
        { d0, d1: ang, d2, d3: 0, d4: 0, d5: 0, a5 });
      ctx.bulletSpawn?.(site, res);
    };
    // **THE THREE SUBTRAHENDS ARE $14, $15, $16 AND THEY ARE NOT THREE
    // DIFFERENT VALUES.**  `$4(A4)` is incremented by one BETWEEN the first and
    // the second, so the parameters are `b-$14`, `b-$14` and `b-$15` -- the
    // first two are equal.  Writing the constants as the ROM writes them keeps
    // that visible; folding them would hide the increment that causes it.
    shot(0x14, 0, 0x296838);                           // $296838
    ram.setU8(a4 + 0x04, u8(ram.u8(a4 + 0x04) + 1));   // $29683E addq.b #$1
    ram.setU16(a4 + 0x0a, u16(ram.u16(a4 + 0x0a) + 2));            // $296842
    ram.setU16(a4 + 0x0c, u16(ram.u16(a4 + 0x0c) + 2));            // $296846
    shot(0x15, 3, 0x29688c);                           // $29684A..$29688C
    shot(0x16, -3, 0x2968d4);                          // $296892..$2968D4
    const n = u16(ram.u16(a4 + 0x06) - 1);             // $2968DA subq.w #$1
    ram.setU16(a4 + 0x06, n);
    if (n === 0) break;                                // $2968DE bne.w $2967FA
  }
  ram.setU16(a4, 0);                                   // $2968E2 clr.w (a4)
}

// ============================================================= REGISTRATION
registerScript(0x295e0e, (ram, rom, ctx, a4) => {      // E 3 INIT
  const a5 = bossA5(ctx, 0x295e0e), a6 = bossA6(ctx, 0x295e0e);
  const into = partGunInit(ram, rom, ctx, a4, a5, a6, 3);
  partGunStep(ram, rom, ctx, a4, a5, a6, into);        // FALL-THROUGH
});
registerScript(0x295e5e, (ram, rom, ctx, a4) =>
  partGunStep(ram, rom, ctx, a4, bossA5(ctx, 0x295e5e), bossA6(ctx, 0x295e5e), 3));

registerScript(0x295f44, (ram, rom, ctx, a4) => {      // E 4 INIT
  const a5 = bossA5(ctx, 0x295f44), a6 = bossA6(ctx, 0x295f44);
  const into = partGunInit(ram, rom, ctx, a4, a5, a6, 4);
  // `into` is 3 when the aim declined -- the ROM's `bcs.w $295E5E`, §header.
  partGunStep(ram, rom, ctx, a4, a5, a6, into);
});
registerScript(0x295f94, (ram, rom, ctx, a4) =>
  partGunStep(ram, rom, ctx, a4, bossA5(ctx, 0x295f94), bossA6(ctx, 0x295f94), 4));

registerScript(0x296752, (ram, rom, ctx, a4) =>        // E 13 INIT -- `rts`
  e13Init296752(ram, rom, a4, bossA5(ctx, 0x296752), bossA6(ctx, 0x296752)));
registerScript(0x296790, (ram, rom, ctx, a4) =>
  e13Step296790(ram, rom, ctx, a4, bossA5(ctx, 0x296790), bossA6(ctx, 0x296790)));

// NOTE, because it is the thing that makes these three legible: **NONE of them
// initialises its own `$2(A4)`, `$3(A4)`, `$4(A4)` or `$6(A4)`.**  Those come
// from the STARTER, through the address `$259A18` returns -- F 1 writes E 3 and
// E 4's mode and shot count (`$2951DE`/`$295242`), F 6 writes E 13's
// (`$2957D8`..`$2957E4`).  The scripts started WITHOUT parameters (E 0, E 11)
// set every field they read in their own inits, and the ones started WITH
// parameters leave exactly those fields alone.  That split is what makes
// `$259A18`'s return value load-bearing rather than convenient, and it is
// checkable against the listing in both directions.
