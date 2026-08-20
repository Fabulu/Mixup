// TYPE $42 -- THE STAGE-4 BOSS'S CHILDREN, handler `$2A3AF6`.
//
// A1 9 (`$2A30DC`) and A1 11 (`$2A31BA`) are the only two spawners of this type in
// the whole 6 MB image, and they hand every child the boss's own sub-record in
// `$1C(A5)`. The handler homes on the player, and when it ARRIVES it counts itself
// back through that pointer -- `$2A3D5A addq.w #$1,$19e(a0)` -- which is the word
// A1 9's rendezvous (`$2A3108`) waits on. Nothing else in the image touches `$19E`.
//
// IT CANNOT BE KILLED BY DAMAGE, and that is not an inference:
//
//     2a3b5e: jsr $286096              the hit lands, HP drops
//     2a3b64: move.w #$7fff,D0 / sub.w $18(a6),D0    the damage dealt
//     2a3b6c: cmp.w $8130E8,D0 / ble   record the biggest hit so far
//     2a3b82: move.w #$7fff,$18(a6)    <-- UNCONDITIONAL, full HP back
//     2a3b96: tst.w $18(a6) / bpl      ...so this is ALWAYS positive
//
// The kill arm at `$2A3B9E..$2A3BE4` is therefore unreachable from this path, and it
// is left as a loud named throw rather than transcribed: if it ever runs, either the
// reading above is wrong or something the port does not model wrote `$18(A6)`.
//
// `$8130F4` SPLITS THE ROUTINE IN THREE. A1 9 writes 0 at INIT and 1 on retirement;
// A4 id6 (`$2A11D4`) writes 2. So:
//
//   0 or 1   F5's phase: the homing body below, `$2A3B50..$2A3E15`
//   2        A4 id6's phase, and `$6C(A6)` -- the SIGN of the list's direction byte --
//            picks which half a child runs: `$2A3E16` for a negative one and
//            `$2A3E92` for a positive one. Both are translated (W257).
//
// The one arm still unread is `$2A3AFE`: a role-`$FF` child meeting `$8130F4 == 2`
// frees itself at once, and no translated path puts those two together, so it stays a
// loud throw rather than a guess.
//
// THE ROLES COME FROM THE SPAWNER and they are what `$2A3E92`'s half is built around:
// `$70` and `$71` are INVISIBLE aimers that publish a heading into `$8130E4`/`$8130E5`,
// and 0..7 fire a wide fan along it. A1 9 writes `$FF` as a constant, so F5's own
// formations have no aimers and no fan; A1 11's list is where 0..7 and `$70`/`$71`
// come from.
//
// THREE OF THAT HALF'S FOUR EMITTERS HAVE NO CALL SITE in this build. See
// `deadEmitter` below -- checked over the bytes, and counted rather than dropped.
//
// THE MODE FLIP IS THE PARENT FINISHING. `$2A3DE6 cmpi.w #$1,$8130F4` sets
// `$3A(A5) = 1`, and `$8130F4` becomes 1 exactly when A1 9 retires. So a child's
// second behaviour is triggered by its own parent's completion, through the same word.

import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';
import { freeEnemy } from './initbody.js';
import { scoreHit } from './score.js';
import { spawnEffect } from './effects.js';
import { aim256, AimTables } from './aim.js';
import { dist242494 } from './bossscripts.js';
import { applyShotVelocity241E34, offScreen242684 } from './movement.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { fire as fireBullet, WriteLog } from './bullets.js';

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

const G = {
  f0: 0x8130f0, f4: 0x8130f4, freeze: 0x8130d2,
  maxDamage: 0x8130e8, maxDamageD1: 0x8130ea,
  f2: 0x8130f2, aimA: 0x8130e4, aimB: 0x8130e5,
  scrollY: 0x813176, frameAlt: 0x80390a,
};

/** `$2A4272` -- the distance-to-speed ladder, walked until `$FFFF`. 24 rungs of
 *  (distance, speed): `$40*n` maps to `2n`, so a child further out closes faster. */
const LADDER = 0x2a4272;
/** One shot, through the generator the ROM names, with the call site carried for
 *  attribution the way `boss4.js`'s own emitters do. */
function shoot42(ram, rom, ctx, site, entry, a5, d0, d1, d2) {
  const result = fireBullet({ ram, rom, log: new WriteLog(ram) }, entry,
    { d0: d0 >>> 0, d1: d1 & 0xff, d2: d2 >>> 0, d3: 0, d4: 0, d5: 0, a5 });
  ctx.bulletSpawn?.(site, result);
}

/** `$2A4252` -- eight sprite descriptors on a uniform `$64` stride, which
 *  `$2A41F4 andi.w #$1F` is what bounds at eight. */
const DESCRIPTORS = 0x2a4252;

/** The two draw tails: `$2A4240` for mode 0 and `$2A4248` once `$71(A6)` latches. */
const DRAW_NORMAL = 0x23df2a, DRAW_LATCHED = 0x23f7c6;

/** `$2A3AF6` -- the ONLY `$8130F4 == 2` arm still unread: a role-`$FF` child that
 *  meets A4 id6 frees itself immediately, and no path this port has translated puts a
 *  role-`$FF` child and that flag together, so it stays a loud throw. `$2A3E16` and
 *  `$2A3E92`'s arms ARE translated now (W257). */
function f4IsTwo(ram, site, role) {
  if (ram.u16(G.f4) !== 2 || role !== 0xff) return false;
  unreached(site, `$8130F4 is 2 (A4 id6 is running) AND this child's role is $FF, so `
    + `$2A3AFE would free it immediately. A1 9 is the only spawner that writes role `
    + `$FF and A4 id6 stops A1 9 before raising this flag, so no translated path puts `
    + `the two together. Reaching here means A4 id6's own order is not what W257 read; `
    + `re-read $2A11D4, do NOT smooth`);
  return true;
}

/**
 * `$2A3AF6` -- the handler. A5 is the enemy record, A6 its sub-record.
 * @returns {boolean} true when it freed itself (the caller must stop touching A5).
 */
export function handler42(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  f4IsTwo(ram, 0x2a3afe, ram.u8(a6 + 0x3c));              // $2A3AF6/$2A3AFE

  // $2A3B0C -- the OTHER global arm. A4 id6 and A1 11's INIT both clear $8130F0, so
  // during F5's phase this is zero; transcribed both ways because it is four lines.
  if (ram.u16(G.f0) !== 0) {
    ram.setU16(G.maxDamage, 0);                           // $2A3B16
    ram.setU16(G.maxDamageD1, 0);                         // $2A3B1E
    if (ram.u8(a6 + 0x1f) !== 0) {                        // $2A3B26 tst.b/beq
      const q = spawnEffect(ram, ctx, 2);                 // $2A3B2E/$2A3B30
      ram.setU32(q + 0x02, ram.u32(a6 + 0x02));           // $2A3B36
      ram.setU16(q + 0x1a, ram.u16(a6 + 0x1a));           // $2A3B3C
      ram.setU16(q + 0x1e, 0x0010);                       // $2A3B42
    }
    freeEnemy(ram, a5);                                   // $2A3B48 jmp $263762
    return true;
  }

  // $2A3B50 -- A HIT LANDED. `$5C` is the hit-flag mask and `$A3` is its complement,
  // so the flags are consumed here rather than by the caller.
  const d1 = ram.u8(a6) & 0x5c;                           // $2A3B50/$2A3B52
  if (d1 !== 0) {
    ram.setU8(a6, ram.u8(a6) & 0xa3);                     // $2A3B58/$2A3B5C
    scoreHit(ram, ctx, a6, d1);                           // $2A3B5E jsr $286096
    // $2A3B64..$2A3B7C -- the LARGEST single hit this frame, kept for the boss's own
    // readers at $29FB78/$29FD40/$29FDA0, none of which is ported.
    const dealt = u16(0x7fff - ram.u16(a6 + 0x18));
    if (i16(dealt) > i16(ram.u16(G.maxDamage))) {
      ram.setU16(G.maxDamage, dealt);                     // $2A3B76
      ram.setU16(G.maxDamageD1, d1);                      // $2A3B7C
      // The port's `scoreHit` models `$286096` as returning nothing, so this stores
      // the d1 the ROM had going IN. Counted rather than assumed silent: `$8130EA`
      // has six references and three of its readers are unported boss code.
      ctx.unported?.note(0x2a3b7c, '$2A3B7C move.w D1,$8130EA -- D1 is whatever '
        + '$286096 left, which src/score.js does not model as an output. The store '
        + 'uses the pre-call value; $29FB78/$29FD40/$29FDA0 read it and are unported');
    }
    ram.setU16(a6 + 0x18, 0x7fff);                        // $2A3B82 -- FULL HP BACK
    ram.setU8(a6 + 0x1d,                                  // $2A3B88..$2A3B92 eor.b
      ram.u8(a6 + 0x1d) ^ ram.u8(a6 + 0x3f));
    if (i16(ram.u16(a6 + 0x18)) < 0) {                    // $2A3B96 tst.w/bpl
      unreached(0x2a3b9e, `$2A3B9E, type $42's kill arm -- UNREACHABLE. $2A3B82 `
        + `restores $18(A6) to $7FFF two instructions before $2A3B96 tests it, so `
        + `the test is always positive and this enemy cannot be killed by damage; `
        + `it dies by ARRIVING ($2A3D3E). Reaching here means something the port `
        + `does not model wrote $18(A6), which is a defect either way`);
    }
    ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x3e));              // $2A3BEA
  }

  // $2A3BF0 -- mode 1 only: leave the band and you are gone.  `$16(A5)` is the
  // HAS-BEEN-SEEN one-shot, so the free is off-screen-AFTER-on and never
  // off-screen alone -- a child that spawns outside and flies in is NOT freed.
  //
  //   2A3C0E: 4e b9 00 24 26 84   jsr    $242684
  //   2A3C14: 64 0e               bcc.s  $2A3C24     carry CLEAR = ON-screen
  //   2A3C16: 4a 2d 00 16         tst.b  ($16,A5)
  //   2A3C1A: 67 0e               beq.s  $2A3C2A     never seen -> carry on
  //   2A3C1C: 4e f9 00 26 37 62   jmp    $263762     seen, now off -> free
  //   2A3C24: 1b 7c 00 01 00 16   move.b #$1,($16,A5)
  //
  // W451: this was INVERTED here, both in the predicate and at this call site,
  // so a child was flagged while OFF-screen and freed the frame it came ON.
  if (ram.u8(a5 + 0x3a) === 1) {                          // $2A3BF0 cmpi.b #$1
    const y = i16(ram.u16(a6 + 0x04));
    if (y <= i16(0xfc00) || y >= 0x3c00) {                // $2A3BFA/$2A3C04
      freeEnemy(ram, a5);                                 // $2A3C1C
      return true;
    }
    if (offScreen242684(ram, a6)) {                       // $2A3C0E jsr / $2A3C14 bcc
      if (ram.u8(a5 + 0x16) !== 0) {                      // $2A3C16 tst.b / $2A3C1A beq
        freeEnemy(ram, a5);                               // $2A3C1C jmp $263762
        return true;
      }
    } else {
      ram.setU8(a5 + 0x16, 1);                            // $2A3C24 move.b #$1,($16,A5)
    }
  }

  // $2A3C2A -- the death pause freezes everything but the draw.
  if (ram.u16(G.freeze) === 0) {                          // $2A3C2A tst.w/bne
    if (moveAndHome(ram, rom, ctx, a5, a6)) return true;  // $2A3C34..$2A3E15
    // $2A3E16 / $2A3E92 -- the two halves A4 id6's `$8130F4 = 2` unlocks, and
    // `$6C(A6)` picks which. The init sets that word from the SIGN of the list's
    // direction byte, so a `$F2` child runs one and an `$0E` child the other.
    if (ram.u16(G.f4) === 2) {
      if (ram.u16(a6 + 0x6c) !== 0) phase3Negative(ram, ctx, a6);   // $2A3E22 bne
      else phase3Positive(ram, rom, ctx, a5, a6);                   // $2A3E9E bne
    }
    // $2A4116 cmpi.w #$2,$8130F4 / beq $2A41E2 -- the mode-0/1 shot section is
    // SKIPPED entirely while A4 id6 runs. Its phase has its own emitters above.
    if (ram.u16(G.f4) !== 2) shoot(ram, rom, ctx, a5, a6);   // $2A4116..$2A41E1
  }
  draw(ram, rom, ctx, a5, a6);                            // $2A41E2..$2A4250
  return false;
}

/** `subq.b #1 / bcc` -- the OLD-ZERO BORROW this boss uses everywhere. */
function due8(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
}

/**
 * THREE OF THIS HALF'S FOUR EMITTERS HAVE NO CALL SITE. `$2A3E40`, `$2A3E76` and
 * `$2A40FE` each assemble a complete shot -- the angle out of `$28(A6)`, the position
 * out of `$2(A6)`, its own speed/kind longword -- and then fall straight into the next
 * cadence. There is no `4EB9` and no `4EF9` between the last `moveq` and the following
 * instruction, checked over the BYTES rather than read off a listing. This build has
 * them disabled and the cadences that paced them still run.
 *
 * The port keeps the cadences, which are observable in RAM, and COUNTS each dead setup
 * by address rather than dropping it: a shot that stops being mentioned is how a
 * missing emitter survives a green suite.
 */
function deadEmitter(ctx, site, which) {
  ctx.unported?.note(site, `${which} assembles a full shot and has NO call site in `
    + `this build -- no 4EB9/4EF9 between its last moveq and the next cadence. The `
    + `port runs the cadence and counts the shot that never happens`);
}

/** `$2A3E16` -- the half a NEGATIVE-direction child runs. Two cadences, both of whose
 *  emitters are absent, so today it keeps time and nothing else. */
function phase3Negative(ram, ctx, a6) {
  if (due8(ram, a6 + 0x74)) {                             // $2A3E2A subq.b/bcc
    ram.setU8(a6 + 0x74, ram.u8(a6 + 0x75));              // $2A3E32
    if (ram.u8(a6 + 0x1f) !== 0) {                        // $2A3E38 tst.b/beq
      deadEmitter(ctx, 0x2a3e40, '$2A3E40 (the $74 cadence, D0 = $00020003)');
    }
  }
  if (due8(ram, a6 + 0x5e)) {                             // $2A3E60 subq.b/bcc
    ram.setU8(a6 + 0x5e, ram.u8(a6 + 0x5f));              // $2A3E68
    if (ram.u8(a6 + 0x1f) !== 0) {                        // $2A3E6E tst.b/beq
      deadEmitter(ctx, 0x2a3e76, '$2A3E76 (the $5E cadence, D0 = $FFFA0023)');
    }
  }
}

/**
 * `$2A3EA6..$2A3F1A` -- the OSCILLATOR. `$8C(A6)` is a signed step added to the
 * record's speed byte, and it is NEGATED at either end of a `$20..$60` band, so the
 * child breathes in and out rather than settling. `$86(A6)` gates it and `$8A`/`$8B`
 * is the delay before each swing.
 */
function phase3Oscillator(ram, a5, a6) {
  if (ram.u16(a6 + 0x86) === 0) {                         // $2A3EA6 cmpi.w #$0
    if (due8(ram, a6 + 0x8a)) {                           // $2A3EB0 subq.b/bcc
      ram.setU8(a6 + 0x8a, ram.u8(a6 + 0x8b));            // $2A3EB8
      ram.setU16(a6 + 0x86, 1);                           // $2A3EBE
    }
  }
  if (ram.u16(a6 + 0x86) !== 1) return;                   // $2A3EC4 cmpi.w #$1/bne
  if (!due8(ram, a6 + 0x88)) return;                      // $2A3ECE subq.b/bcc
  ram.setU8(a6 + 0x88, ram.u8(a6 + 0x89));                // $2A3ED6
  ram.setU8(a5 + 0x1a,                                    // $2A3EDC/$2A3EE0 add.b
    (ram.u8(a5 + 0x1a) + ram.u8(a6 + 0x8c)) & 0xff);
  // $2A3EE4 tst.b $8c(a6) / bpl -- which END of the band this step is walking towards.
  const speed = ram.u8(a5 + 0x1a);                        // read UNSIGNED, as `moveq`
  if ((ram.u8(a6 + 0x8c) & 0x80) !== 0) {                 // negative step
    if (speed > 0x20) return;                             // $2A3EF2 cmpi.w #$20/bgt
  } else if (speed < 0x60) return;                        // $2A3F0E cmpi.w #$60/blt
  ram.setU8(a6 + 0x8c, (-ram.u8(a6 + 0x8c)) & 0xff);      // $2A3EFA/$2A3F16 neg.b
  ram.setU16(a6 + 0x86, 0);                               // $2A3EFE/$2A3F1A
}

/**
 * `$2A3F20..$2A3FC0` -- the SWEEP, three states over the turn rate `$38(A6)`:
 *
 *   0  waits for `$8130F2`, which A4 id6 raises at `$2A12B2`, then arms and sets `$7C`
 *   1  takes `$6A(A6)` off `$38(A6)` on the `$6E` tick until `$38 <= 4`, then state 2
 *      with a fresh `$6E` of `$60`
 *   2  keeps taking it off until `|$38|` reaches `$78(A6)`, then back to 0 with `$6A`
 *      NEGATED and `$78` widened by 2, capped at `$10`
 *
 * So the turn sweeps out and back, a little wider each pass, and `$78` is the only
 * thing that grows.
 */
function phase3Sweep(ram, a6) {
  if (ram.u16(a6 + 0x66) === 0) {                         // $2A3F20 cmpi.w #$0
    if (ram.u16(G.f2) !== 0) {                            // $2A3F2A tst.w/beq
      ram.setU16(a6 + 0x66, 1);                           // $2A3F34
      ram.setU16(a6 + 0x7c, 1);                           // $2A3F3A
    }
  }
  if (ram.u16(a6 + 0x66) === 1 && due8(ram, a6 + 0x6e)) { // $2A3F40/$2A3F4A
    ram.setU8(a6 + 0x6e, ram.u8(a6 + 0x6f));              // $2A3F52
    ram.setU16(a6 + 0x38,                                 // $2A3F58/$2A3F5C sub.w
      u16(ram.u16(a6 + 0x38) - ram.u16(a6 + 0x6a)));
    if (i16(ram.u16(a6 + 0x38)) <= 4) {                   // $2A3F60 cmpi.w #$4/bgt
      ram.setU16(a6 + 0x66, 2);                           // $2A3F6A
      ram.setU8(a6 + 0x6e, 0x60);                         // $2A3F70
    }
  }
  if (ram.u16(a6 + 0x66) === 2 && due8(ram, a6 + 0x6e)) { // $2A3F76/$2A3F80
    ram.setU8(a6 + 0x6e, ram.u8(a6 + 0x6f));              // $2A3F88
    ram.setU16(a6 + 0x38,                                 // $2A3F8E/$2A3F92
      u16(ram.u16(a6 + 0x38) - ram.u16(a6 + 0x6a)));
    const mag = Math.abs(i16(ram.u16(a6 + 0x38)));        // $2A3F96..$2A3F9E bpl/neg
    if (mag >= i16(ram.u16(a6 + 0x78))) {                 // $2A3FA4 cmp.w/blt
      ram.setU16(a6 + 0x66, 0);                           // $2A3FAA
      ram.setU16(a6 + 0x6a, u16(-i16(ram.u16(a6 + 0x6a))));  // $2A3FB0 neg.w
      if (ram.u16(a6 + 0x78) !== 0x10) {                  // $2A3FB4 cmpi.w #$10/beq
        ram.setU16(a6 + 0x78, u16(ram.u16(a6 + 0x78) + 2));  // $2A3FBE addq.w #$2
      }
    }
  }
}

/**
 * `$2A402E..$2A40E2` -- THE ROLE FAN, the only emitter in this half with a call site,
 * and the reason roles `$70`/`$71` exist at all.
 *
 *   `$2A3FC2`  roles $70 and $71 PUBLISH their own heading into `$8130E5`/`$8130E4`
 *   `$2A402E`  roles 0..3 read `$8130E4` and 4..7 read `$8130E5`, then `+$80`
 *   spread     0/4 -> -$10   1/5 -> -$4   2/6 -> +$4   3/7 -> +$10
 *   D6         set for the four `$10` roles, and D6 PICKS THE GENERATOR:
 *              `$2816F6` when zero, `$281764` when not
 *
 * So two invisible siblings aim and eight visible ones fire a wide fan along it, with
 * the outer pairs firing a different bullet class from the inner pairs. Publishing
 * through a global is what lets a child fire along a heading it never computed.
 */
const ROLE_FAN = {
  0: { d1: -0x10, d6: 1 }, 1: { d1: -0x04, d6: 0 },
  2: { d1: +0x04, d6: 0 }, 3: { d1: +0x10, d6: 1 },
  4: { d1: -0x10, d6: 1 }, 5: { d1: -0x04, d6: 0 },
  6: { d1: +0x04, d6: 0 }, 7: { d1: +0x10, d6: 1 },
};

/** `$2A3E92` -- the half a POSITIVE-direction child runs. */
function phase3Positive(ram, rom, ctx, a5, a6) {
  phase3Oscillator(ram, a5, a6);                          // $2A3EA6..$2A3F1A
  phase3Sweep(ram, a6);                                   // $2A3F20..$2A3FC0

  // $2A3FC2 -- the AIMERS. Both are invisible ($2A4202 skips their draw) and this is
  // their whole job.
  const role = ram.u8(a6 + 0x3c);
  if (role === 0x70 || role === 0x71) {
    const d1 = ((ram.u16(a6 + 0x28) >> 4) & 0xff) + ram.u8(a6 + 0x5a);  // $2A3FD6..$2A3FE0
    ram.setU8(role === 0x70 ? G.aimA : G.aimB, d1 & 0xff);  // $2A3FEC/$2A3FF6
  }

  // $2A4000 -- the fan's cadence, which the aimers themselves skip.
  if (due8(ram, a6 + 0x8e)) {                             // $2A4000 subq.b/bcc
    ram.setU8(a6 + 0x8e, ram.u8(a6 + 0x8f));              // $2A4008
    if (role !== 0x70 && role !== 0x71                    // $2A400E..$2A4022
      && ram.u8(a6 + 0x1f) !== 0) {                       // $2A4026 tst.b/beq
      const spread = ROLE_FAN[role];
      if (spread) {
        const base = role <= 3 ? ram.u8(G.aimA) : ram.u8(G.aimB);  // $2A4030/$2A4040
        const d1 = (base + 0x80 + spread.d1) & 0xff;      // $2A4046 + the spread
        shoot42(ram, rom, ctx, spread.d6 !== 0 ? 0x2a40e2 : 0x2a40d8,
          spread.d6 !== 0 ? 0x281764 : 0x2816f6,          // $2A40D2 tst.w D6/bne
          a5, 0xfffd0007, d1, ram.u32(a6 + 0x02));        // $2A404A/$2A4050
      }
    }
  }

  // $2A40E8 -- and the third disabled emitter's cadence.
  if (ram.u8(a6 + 0x1f) !== 0 && due8(ram, a6 + 0x58)) {  // $2A40E8/$2A40F0
    ram.setU8(a6 + 0x58, ram.u8(a6 + 0x59));              // $2A40F8
    deadEmitter(ctx, 0x2a40fe, '$2A40FE (the $58 cadence, D0 = $FFFE000B)');
  }
}

// `$242684` -- W451 DELETED this file's `onScreen`, which was an INVENTION and
// not a transcription.  Kept here as the record of what it got wrong, because
// its doc claimed to be `$242684` and nothing in the file contradicted it:
//
//     function onScreen(ram, a6) {
//       const y = i16(ram.u16(a6 + 0x02)), x = i16(ram.u16(a6 + 0x04));
//       return y >= -0x400 && y <= 0x6400 && x >= -0x400 && x <= 0x4000;
//     }
//
//   * NO `$24268C add.w $813172`.  The scroll term is simply absent, so the
//     test did not move with the playfield at all.
//   * THE AXES ARE SWAPPED.  `move.l ($2,A6),D0` puts A6+$04 in D0.w, and the
//     three word adds before `$242698 swap` run on D0.w -- so +$04 is the
//     axis that gets `#$1C00`/`$813172`/`#$9000` and +$02 the one that gets
//     `#$800`/`#$8000`.  This had them the other way round.
//   * BOTH BANDS ARE MADE UP.  The ROM's are `u16(($4,A6)+$1C00+$813172) <
//     $7000` and `u16(($2,A6)+$800) < $8000`, i.e. signed [-$800,$77FF] on
//     +$02.  `-$400..$6400` and `-$400..$4000` are in neither `addi.w`.
//   * IT RETURNED THE OPPOSITE SENSE and the call site inverted with it, so
//     the two errors did not cancel -- they compounded (see $2A3C0E above).
//
// The surrounding `$2A3BFA`/`$2A3C04` band on +$04 pins that word into
// (-$400, $3C00) before the call, which is why the bogus `x` half of the
// condition was inert and only the +$02 half and the polarity ever showed.

/** `$2A3C34..$2A3E15` -- the homing. */
function moveAndHome(ram, rom, ctx, a5, a6) {
  const parent = ram.u32(a5 + 0x1c);
  ram.setU32(a5 + 0x30, ram.u32(parent + 0x22));          // $2A3C34/$2A3C38
  ram.setU16(a5 + 0x30,                                   // $2A3C3E/$2A3C42 sub.w
    u16(ram.u16(a5 + 0x30) - ram.u16(a5 + 0x20)));

  // $2A3C46..$2A3C5A -- the CURRENT heading's vector, scaled by 8.
  const v = ctx.tables.shotVector(ram.u8(a5 + 0x1a), ram.u16(a6 + 0x28) >> 4);
  let d2 = u16(v.dy << 3), d3 = u16(v.dx << 3);

  if (ram.u8(a5 + 0x3a) === 1) {                          // $2A3C5C cmpi.b #$1
    // $2A3C66 -- mode 1 tracks its own remembered anchor, scroll-compensated.
    ram.setU16(a6 + 0x32, u16(ram.u16(a6 + 0x32) - ram.u16(G.scrollY)));
    d2 = u16(d2 + ram.u16(a6 + 0x30));                    // $2A3C70
    d3 = u16(d3 + ram.u16(a6 + 0x32));                    // $2A3C74
  } else {
    d2 = u16(d2 + ram.u16(parent + 0x22));                // $2A3C80
    d3 = u16(d3 + ram.u16(parent + 0x24));                // $2A3C84
  }
  d2 = u16(d2 - ram.u16(a5 + 0x20));                      // $2A3C88
  ram.setU16(a6 + 0x06, d2);                              // $2A3C8C -- THE TARGET
  ram.setU16(a6 + 0x08, d3);                              // $2A3C90

  // $2A3C94..$2A3CA6 -- aim at that target, 256-step, straight into the heading.
  ram.setU8(a6 + 0x1b, aim256(aimTables(rom),
    ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), d2, d3));

  // $2A3CAA..$2A3CD8 -- and the SPEED comes off the distance ladder: $40 becomes 1,
  // $7FFF-far stays at the $40 default the line below writes first.
  const far = dist242494(ram.u16(a6 + 0x02), ram.u16(a6 + 0x04), d2, d3);
  ram.setU8(a6 + 0x1a, 0x40);                             // $2A3CBC
  for (let a = LADDER; ; a += 4) {                        // $2A3CC8 move.w (a4)+
    const rung = rom.u16(a);
    if (rung === 0xffff) break;                           // $2A3CCA cmpi.w #$FFFF
    const speed = rom.u16(a + 2);                         // $2A3CD2
    if (i16(far) <= i16(rung)) {                          // $2A3CD4 cmp.w/bgt
      ram.setU8(a6 + 0x1a, speed & 0xff);                 // $2A3CD8
      break;
    }
  }
  applyShotVelocity241E34(ram, ctx.tables, a6);           // $2A3CDC jsr $241E34

  // $2A3CE2..$2A3D22 -- the heading SLEWS: $26(a6) per frame into $28(a6), and $26
  // itself walks one step at a time towards $38 on the $3A/$3B cadence.
  ram.setU16(a6 + 0x28,
    u16(ram.u16(a6 + 0x28) + ram.u16(a6 + 0x26)) & 0x0fff);  // $2A3CE6/$2A3CEA
  ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3a) - 1);            // $2A3CF0 subq.b
  if (ram.u8(a6 + 0x3a) === 0xff) {                       // $2A3CF4 bcc
    ram.setU8(a6 + 0x3a, ram.u8(a6 + 0x3b));              // $2A3CF8
    const want = i16(ram.u16(a6 + 0x38)), have = i16(ram.u16(a6 + 0x26));
    if (have < want) ram.setU16(a6 + 0x26, u16(have + 1));   // $2A3D10 addq.w
    else if (have > want) ram.setU16(a6 + 0x26, u16(have - 1));  // $2A3D1C subq.w
  }

  // $2A3D24..$2A3D5C -- ARRIVAL. The heading's top byte at either extreme means the
  // child is on top of its target, and this is the ONE place it retires itself.
  const head = (ram.u16(a6 + 0x28) >> 4) & 0xff;          // $2A3D24..$2A3D2A
  if ((head >= 0xfe || head <= 1) && ram.u8(a6 + 0x1f) === 0) {  // $2A3D2E..$2A3D42
    ram.setU8(a6 + 0x1f, 1);                              // $2A3D46 -- once
    ram.setU16(a6 + 0x18, 0x7fff);                        // $2A3D4C
    ram.setU16(a6 + 0x00, 0xa001);                        // $2A3D52
    const p = ram.u32(a5 + 0x1c);                         // $2A3D56
    ram.setU16(p + 0x19e, u16(ram.u16(p + 0x19e) + 1));   // $2A3D5A -- THE COUNT
  }

  return mode1(ram, a5, a6);                              // $2A3D5E..$2A3E15
}

/** `$2A3D5E..$2A3E15` -- mode 1's own ramp, and the flip into it. */
function mode1(ram, a5, a6) {
  if (ram.u8(a5 + 0x3a) === 1) {                          // $2A3D5E cmpi.b #$1
    if (ram.u16(a6 + 0x56) !== 0) {                       // $2A3D68 tst.w/beq
      ram.setU16(a6 + 0x56, u16(ram.u16(a6 + 0x56) - 1));  // $2A3D70 subq.w
      if (ram.u16(a6 + 0x56) === 0) {                     // $2A3D74 bne
        ram.setU16(a6 + 0x26, ram.u16(a6 + 0x48));        // $2A3D78 -- turn back on
        ram.setU16(a6 + 0x38, ram.u16(a6 + 0x48));        // $2A3D7E
        ram.setU8(a6 + 0x71, 0);                          // $2A3D84
      }
    } else {
      if (ram.u8(a6 + 0x71) === 0) {                      // $2A3D8E cmpi.b #$0
        ram.setU8(a5 + 0x1a, ram.u8(a5 + 0x1a) - 1);      // $2A3D98 subq.b
        if (i16((ram.u8(a5 + 0x1a) << 24) >> 24) <= 8) {  // $2A3D9C cmpi.b #$8/bgt
          ram.setU8(a5 + 0x1a, 8);                        // $2A3DA6 -- the FLOOR
          ram.setU8(a6 + 0x71, 1);                        // $2A3DAC -- and latch
          ram.setU8(a6 + 0x7e, 0x40);                     // $2A3DB2
          ram.setU8(a6 + 0x7f, 0);                        // $2A3DB8
        }
      }
      if (ram.u8(a6 + 0x71) === 1) {                      // $2A3DBE cmpi.b #$1
        const d0 = ram.u8(a5 + 0x1a) + 2;                 // $2A3DCE addq.w #$2
        // $2A3DD4 bgt $2A3C1C -- the ramp running past $FF is a FREE, not a clamp.
        if (d0 > 0xff) { freeEnemy(ram, a5); return true; }
        ram.setU8(a5 + 0x1a, d0);                         // $2A3DD8
      }
    }
    return false;
  }
  // $2A3DE6 -- THE FLIP, and its trigger is A1 9 RETIRING ($2A3126 writes the 1).
  if (ram.u16(G.f4) !== 1) return false;                  // $2A3DE6 cmpi.w #$1/bne
  ram.setU8(a5 + 0x3a, 1);                                // $2A3DF2
  ram.setU16(a6 + 0x48, ram.u16(a6 + 0x26));              // $2A3DF8 -- remember it
  ram.setU16(a6 + 0x26, 0);                               // $2A3DFE
  ram.setU16(a6 + 0x38, 0);                               // $2A3E02
  ram.setU16(a6 + 0x56, 0x0060);                          // $2A3E06 -- the hold
  ram.setU32(a6 + 0x30, ram.u32(ram.u32(a5 + 0x1c) + 0x22));  // $2A3E0C/$2A3E10
  return false;
}

/** `$2A4116..$2A41E1` -- the shot, gated on having ARRIVED. */
function shoot(ram, rom, ctx, a5, a6) {
  if (ram.u8(a6 + 0x1f) === 0) return;                    // $2A4122 tst.b/beq
  if (ram.u8(a5 + 0x3a) !== 1) {                          // $2A412A cmpi.b #$1/beq
    if (ram.u8(a6 + 0x4e) === 0) {                        // $2A4134 tst.b/bne
      if ((ram.u16(G.frameAlt) & 0x1f) !== 0) return;     // $2A413C/$2A4142
      ram.setU8(a6 + 0x4e, ram.u8(a6 + 0x4f));            // $2A41A8
      ram.setU8(a6 + 0x50, (ram.u16(a6 + 0x28) >> 4) & 0xff);  // $2A41AE..$2A41B8
    }
  } else {
    ram.setU8(a6 + 0x50, (ram.u16(a6 + 0x28) >> 4) & 0xff);  // $2A414E..$2A4158
    if ((ram.u16(G.frameAlt) & 3) !== 0) return;          // $2A415C/$2A4162
    // $2A416A..$2A41A4 -- mode 1's own shot, and once $71 latches it fires BACKWARDS
    // ($80) from a shorter speed class, and only below $600 and only if $8D is clear.
    let d1 = ram.u8(a6 + 0x50);
    let d0 = 7;
    if (ram.u8(a6 + 0x71) === 1) {                        // $2A4178 cmpi.b #$1
      d1 = (d1 + 0x80) & 0xff;                            // $2A4182 addi.b #$80
      d0 = (d0 - 0x60000) >>> 0;                          // $2A4186 subi.l #$60000
      if (i16(ram.u16(a6 + 0x02)) <= 0x600) return;       // $2A418C/$2A4192 ble
      if (ram.u8(a6 + 0x8d) !== 0) return;                // $2A4196 tst.b/bne
    }
    shoot42(ram, rom, ctx, 0x2a419e, 0x281764, a5, d0, d1, ram.u32(a6 + 0x02));
    return;                                               // $2A41A4 bra
  }
  // $2A41BC -- the mode-0 cadence, and $281708 rather than $281764.
  ram.setU8(a6 + 0x4c, ram.u8(a6 + 0x4c) - 1);            // $2A41BC subq.b
  if (ram.u8(a6 + 0x4c) !== 0xff) return;                 // $2A41C0 bcc
  ram.setU8(a6 + 0x4c, ram.u8(a6 + 0x4d));                // $2A41C4
  shoot42(ram, rom, ctx, 0x2a41d8, 0x281708, a5, 7,
    ram.u8(a6 + 0x50), ram.u32(a6 + 0x02));               // $2A41D8
  ram.setU8(a6 + 0x4e, ram.u8(a6 + 0x4e) - 1);            // $2A41DE subq.b
}

/** `$2A41E2..$2A4250` -- the animation cursor and the draw. */
function draw(ram, rom, ctx, a5, a6) {
  ram.setU8(a5 + 0x3e, ram.u8(a5 + 0x3e) - 1);            // $2A41E2 subq.b
  if (ram.u8(a5 + 0x3e) === 0xff) {                       // $2A41E6 bcc
    ram.setU8(a5 + 0x3e, ram.u8(a5 + 0x3f));              // $2A41EA
    ram.setU16(a5 + 0x3c, u16(ram.u16(a5 + 0x3c) + 4) & 0x001f);  // $2A41F0/$2A41F4
  }
  if (ram.u8(a6 + 0x1f) === 0) return;                    // $2A41FA tst.b/beq -> rts
  const role = ram.u8(a6 + 0x3c);
  if (role === 0x70 || role === 0x71) return;             // $2A4202/$2A420C

  const d2 = rom.u32(DESCRIPTORS + ram.u16(a5 + 0x3c));   // $2A4216..$2A4220
  const d3 = 0x0620;                                      // $2A4222
  const d4 = ram.u16(a6 + 0x1c);                          // $2A4228
  const d1 = (ram.u32(a6 + 0x02) + 0xfa00fc00) >>> 0;     // $2A422C/$2A4230 addi.l
  const stub = ram.u8(a6 + 0x71) === 1 ? DRAW_LATCHED : DRAW_NORMAL;  // $2A4236
  enqueueRegistersThroughStub(ram, rom, stub, d1, d2, d3, d4);
  void ctx;
}
