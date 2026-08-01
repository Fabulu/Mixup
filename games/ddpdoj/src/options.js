// THE OPTION OBJECT -- `$24C096`, one of the 22 subsystem calls of object type 5
// that this port has counted and not run since wave 5.
//
// It is the single largest unlock in the combat recon's work list (§11 item 5)
// and it is three things at once:
//
//   1. THE TWO OPTION PODS -- their records, their motion, and their two
//      sprite records in bucket 15 plus two shadows in bucket 5.
//   2. THE SPEED RAMP the player feels when fire is held ($24C8BE down,
//      $24C8E4 up, both PC-relative from inside this routine, which is why
//      nothing in the port could ever reach them).
//   3. THE LASER.  `$24C164 btst #4,($40,A6)` is the laser gate and it is on the
//      RAW HELD input byte the player copies in at `$24C134` -- NOT on the edge
//      the shot cadence machine reads.  Everything behind it belongs to W24 and
//      is a loud named throw here, carrying `$24C180`.
//
// THE RECORD IS $64 BYTES, NOT $20 (machine.js `OPT`).  Pod 0 is the first $20,
// pod 1 the second, and the control block -- including the copied input bytes at
// +$40/+$41 -- starts at +$40.  Three waves of notes call `$8104AA` "the option
// record"; it is the option BLOCK, and `$8104CA` is inside it.
//
// THE OUTER LOOP IS A dbra OVER PLAYERS, and its shape is worth reading twice:
//
//   24c096: lea $8104AA,A6 / lea $8103E6,A4 / lea $811F32,A2 / moveq #1,D7
//   24c0a8: tst.w (A6) / bmi $24C0C8        P1 exists -> run it
//   24c0ae: moveq #0,D7
//   24c0b0: lea $81050E,A6 / lea $810448,A4 / lea $811F52,A2
//   24c0c2: tst.w (A6) / bmi $24C0C8        P2 exists -> run it
//   24c0c6: rts
//   ...
//   24c37e: dbra D7,$24C0B0                 after P1, fall into P2's setup
//
// so D7 is the PLAYER INDEX inverted (1 = P1, 0 = P2), and the `dbra` after P1
// re-enters at the P2 setup rather than at the top.  A port that models this as
// "for each player" gets the same answer; a port that models it as "for D7 in
// 1..0" and forgets that P1's absence SKIPS STRAIGHT to P2 does not.
//
// MEASURED on `fly-around`, all 2,233 drawn frames: P1's block is live
// (`(A6)` = $8003 for pod 0) and P2's is all zeros, so the `dbra` runs the P2
// setup and the `tst.w (A6) / bmi` sends it straight to the `rts`.

import { P, RAM, ROM, OPT } from './machine.js';
import { i16, u16, asr } from './ram.js';
import { unreached } from './unported.js';
import { enqueueRequest, enqueueRegisters, NAMED_BUCKETS } from './spritequeue.js';
import { groundPlane, SHIP_MUTATE } from './shipsprite.js';

/** The two players' blocks, in the ROM's own order: P1 first, P2 second. */
export const OPTION_BLOCKS = [
  { d7: 1, opt: RAM.p1Options, player: RAM.player1, laser: 0x811f32 },  // $24C096
  { d7: 0, opt: RAM.p2Options, player: RAM.player2, laser: 0x811f52 },  // $24C0B0
];

/** `$24BBAA` -- the per-FORMATION template table, indexed `(($5a,A4)-2)*2` into
 *  LONGWORDS, so only EVEN formations land on an entry.  MEASURED entries:
 *  $24BF6E, $24BFC8, $24C022 (formations 2, 4, 6). */
export const OPT_TEMPLATES = 0x24bbaa;
/** `$24C384` -- the per-formation dispatch, `bra.w` at a 4-byte stride and the
 *  same `(($5a,A4)-2)*2` index.  Arms: $24C390, $24C4F8, $24C690. */
export const OPT_FORMATIONS = { 2: 0x24c390, 4: 0x24c4f8, 6: 0x24c690 };
/** `$24C428`/`$24C460 move.w #$208,D3` -- the pod shadow's size word. */
export const POD_SHADOW_SIZE = 0x0208;
/** `$24C430`/`$24C468 move.b #$18,D4` -- a BYTE move over the word already in
 *  D4 from ($1c,A6)/($3c,A6), so the flip bits survive and only the colour is
 *  replaced.  MEASURED: pod 0 emits $0018, pod 1 $4018. */
export const POD_SHADOW_COLOUR = 0x18;

/**
 * `$24C096` -- the whole routine, as far as the laser gate.
 * @param ram
 * @param ctx  the Game context (`ctx.rom`, `ctx.prot`, `ctx.unportedLog`)
 */
export function runOptionObject(ram, ctx) {
  for (const b of OPTION_BLOCKS) {
    // $24C0AA / $24C0C2 `tst.w (A6) / bmi $24C0C8` -- bit 15 of the block's
    // first word.  Both players are tested with the SAME two instructions and
    // P1's failure falls straight into P2's setup.
    if ((ram.u16(b.opt + OPT.state) & 0x8000) === 0) continue;
    runOneBlock(ram, ctx, b);
  }
}

function runOneBlock(ram, ctx, b) {
  const { opt, player } = b;

  // $24C0C8 bset #0,($1,A6) / bne $24C134 -- the ONE-TIME INIT.  MEASURED: the
  // bit is already set at every sample point of every scenario in the corpus
  // (pod 0's state word is $8003 from lf1968 on), so the template copy below
  // has never been exercised by a gated run.  It is translated anyway, and it
  // is translated AS WRITTEN including the four-byte hole.
  if (!ram.bset8(opt + OPT.flags1, 0)) {
    copyTemplate(ram, ctx, b);
  }

  // $24C134 / $24C13A -- THE TWO BYTES THE COMBAT RECON WENT LOOKING FOR.
  // The player's RAW HELD input byte and its EDGE byte, copied into the option
  // block.  ($40,A6) is what the laser gate tests, and a from-scratch byte scan
  // of $200000-$2A0000 finds ZERO `btst #4,($18,An)` in build B -- the raw held
  // fire bit reaches the game through THIS COPY and nowhere else.
  ram.setU8(opt + OPT.raw, ram.u8(player + P.dirByte));    // $24C134
  ram.setU8(opt + OPT.edge, ram.u8(player + P.btnByte));   // $24C13A

  const st = ram.u16(opt + OPT.state);                     // $24C140 move.w (A6),D0
  if (st & 0x0200) {                                       // $24C142 btst #9
    unreached(0x24caa4, `bit 9 of the option block's state word sends $24C146 to `
      + `$24CAA4. MEASURED 0 on every sampled frame of fly-around`);
  }
  if (ram.btst8(player + P.state, 0)) {                     // $24C14A btst #0,(A4)
    unreached(0x24ca60, `bit 0 of the PLAYER's state byte sends $24C14E to `
      + `$24CA60 -- the same bit player.js already throws on at $249500 (the `
      + `death/respawn arm). The option object has its own arm for it`);
  }
  if ((st & 0x0002) === 0) {                                // $24C152 btst #1
    unreached(0x24c934, `bit 1 of the option block's state word is CLEAR, which `
      + `sends $24C156 to $24C934 -- the pods' not-yet-deployed path. MEASURED `
      + `set ($8003) on every sampled frame of fly-around`);
  }

  // $24C15A btst #5,(A4) / beq $24C164 ; $24C160 clr.w ($40,A6)
  // The one instruction that could stop the held bit reaching the gate -- and
  // PROBE_EXEC measured it 0 times over 600 held frames (10-recon-combat §2).
  if (ram.btst8(player + P.state, 5)) ram.setU16(opt + OPT.raw, 0);

  // $24C164 btst #4,($40,A6) / beq $24C29E -- THE LASER GATE.
  if (ram.u8(opt + OPT.raw) & 0x10) {
    laserThrow(ram, opt, player);
  }
  noLaser(ram, ctx, b);
}

/** `$24C16E..$24C29C` -- everything behind the laser gate.  W24's. */
function laserThrow(ram, opt, player) {
  unreached(ROM.optionLaser, `THE LASER. $24C164 `
    + `btst #4,($40,A6) is set -- P1 is HOLDING Button 1 and the raw held bit `
    + `arrived through $24C134's copy of the player's ($18,A6). This is the `
    + `board's OWN gate and it fires on the FIRST held frame with no dependence `
    + `on the speed index; the throw wave 9 put here fired on the fourth and `
    + `only when the ship was off its speed floor, so a player already at the `
    + `floor held fire and still got silence. MEASURED on the board, 600 held `
    + `frames (10-recon-combat §2): six shots at lf2001..2007, $8104AB bit 2 `
    + `latches at +17, the laser record $811EF2 goes live at +20 ($8200 -> `
    + `$8201/$9201) and $81295C falls to 0 for the rest of the hold. None of `
    + `that is ported: $24C180 jsr $2536FA, the ramp $24C8BE, the latch `
    + `$24C1A8 bset #2,($1,A6), the beam record $811EF2 and the 45 x $30 `
    + `segment table $811F72 are all W24. Speed index is now `
    + `${ram.u8(player + P.speedIdx)} and its floor ${ram.u8(player + P.laserFloor)}; `
    + `the option block's latch byte is `
    + `$${ram.u8(opt + OPT.flags1).toString(16).toUpperCase()}`);
}

/** `$24C29E..$24C382` -- the ordinary pod path. */
function noLaser(ram, ctx, b) {
  const { opt, player } = b;
  if (ram.i8(player + P.flags1) < 0) {                     // $24C29E tst.b ($1,A4)
    unreached(0x24c2a4, `bit 7 of the player's ($1,A4) sends $24C2A2 to the `
      + `laser RAMP-DOWN $24C8BE without the laser gate -- the knockback state. `
      + `MEASURED 0; player.js throws on the same bit at $2496A2`);
  }
  ram.setU16(player + 0x60, 0);                            // $24C2AC jsr $25370A
  rampUp(ram, player);                                     // $24C2B2 bsr $24C8E4
  ram.setU8(opt + 0x3f, 0x0a);                             // $24C2B6 move.b #$a
  if (ram.btst8(opt + OPT.state, 6)) {                     // $24C2BC btst #6,(A6)
    unreached(0x24c2c4, `bit 6 of the option block's state byte opens $24C2C4, `
      + `which clears five of the PLAYER's cadence bytes ($2a,$2b,$34,$35,$3f) `
      + `and calls $252714/$25275C. MEASURED 0 over fly-around`);
  }

  // $24C33A move.l ($2,A4),D0 / move.l D0,($2,A6) / move.l D0,($22,A6)
  // ONE longword: both pods are put ON the ship every frame, and the formation
  // routine then moves each of them off it by exactly one frame of its own
  // velocity.  That is why the measured pod offset is constant while the pods
  // are not "attached" by any constant in the ROM.
  const pos = ram.u32(player + P.posY);
  ram.setU32(opt + OPT.posY, pos);
  ram.setU32(opt + OPT.posY2, pos);

  if (ram.u8(opt + OPT.angle) === 0) {                     // $24C346 tst.b ($1b,A6)
    unreached(0x24c368, `pod 0's angle byte ($1b,A6) is 0, which takes $24C34A `
      + `to $24C368 -- a SINGLE $24D12E call plus $24CB3A, the pods-stowed `
      + `path. MEASURED $10 on every sampled frame`);
  }
  // $24C34C..$24C35E -- the formation dispatch, (($5a,A4)-2)*2 into `bra.w`s.
  const form = ram.u16(player + P.optFormation);
  if (form !== 2) {
    unreached(OPT_FORMATIONS[form] ?? 0x24c384, `option formation ${form}: `
      + `$24C356 indexes the $24C384 jump table with (($5a,A4)-2)*2 and each `
      + `entry is a 4-byte bra.w, so only EVEN formations land on one -- 2 -> `
      + `$24C390, 4 -> $24C4F8, 6 -> $24C690. MEASURED 2 on every frame of `
      + `every scenario in this corpus; the other two arms are unported`);
  }
  formation2(ram, ctx, b);                                 // $24C35E jsr (A0)
  // $24C360 lea ($20,A6),A6 -- translated for the record: A6 is reloaded by the
  // dbra's target ($24C0B0) or discarded at the rts, so it is dead. Saying so
  // is cheaper than a later reader wondering whether the port dropped it.
}

/** `$24C8E4` -- the speed ramp UP, one index per frame toward ($39,A4). */
function rampUp(ram, player) {
  // $24C8E4 tst.w $811F72 / beq $24C8F6 ; $24C8EE btst #6,($1,A4) / bne -> rts
  if (ram.u16(0x811f72) !== 0 && ram.btst8(player + P.flags1, 6)) return;
  const idx = ram.u8(player + P.speedIdx);                 // $24C8F6
  if (idx === ram.u8(player + P.baseSpeed)) return;        // $24C8FA cmp.b ($39,A4)
  ram.setU8(player + P.speedIdx, (idx + 1) & 0xff);        // $24C900 addq.b #1
}

/**
 * `$24C390` -- FORMATION 2, the only one the corpus runs.  Advances the pods'
 * shared animation, moves each pod, and draws their two shadows.
 */
function formation2(ram, ctx, b) {
  const { opt, player } = b;
  // $24C390 subq.b #1,($42,A6) / bcc $24C3CC -- an ANIMATION delay, not a frame
  // counter: when it borrows, the sprite long steps and reloads from ($43,A6).
  const d = (ram.u8(opt + OPT.animDelay) - 1) & 0xff;
  ram.setU8(opt + OPT.animDelay, d);
  if (ram.u8(opt + OPT.animDelay) === 0xff) {              // the `bcc` = no borrow
    ram.setU8(opt + OPT.animDelay, ram.u8(opt + OPT.animReload));   // $24C396
    const idx = ram.u16(opt + OPT.animIdx);               // $24C39C ($44,A6)
    const spriteTbl = ram.u32(opt + OPT.animTable);       // $24C3A0 ($46,A6)
    const sprite = ctx.rom.u32(spriteTbl + idx);          // $24C3A4 (A0,D0.w)
    ram.setU32(opt + OPT.anim, sprite);                   // $24C3A8 ($a,A6)
    ram.setU32(opt + OPT.pod + OPT.anim, sprite);         // $24C3AC ($2a,A6)
    const shadowTbl = ram.u32(opt + OPT.shadowTable);     // $24C3B0 ($58,A6)
    const shadow = ctx.rom.u32(shadowTbl + idx);          // $24C3B4
    ram.setU32(opt + OPT.shadow0, shadow);                // $24C3B8 ($5c,A6)
    ram.setU32(opt + OPT.shadow1, shadow);                // $24C3BC ($60,A6)
    // $24C3C0 subq.w #4,($44,A6) / bcc -- the UNSIGNED borrow again.
    ram.setU16(opt + OPT.animIdx,
      idx < 4 ? ram.u16(opt + OPT.animIdxReload) : u16(idx - 4));  // $24C3C6
  }

  movePod(ram, ctx, b, opt);                               // $24C3CC bsr $24D12E
  movePod(ram, ctx, b, opt + OPT.pod);                     // $24C3D0/$24C3D4

  // $24C3DC..$24C402 -- the SAME four gates as the ship's shadow, in the same
  // order, and the $80390C one is the phase that makes the pods' shadows and
  // their sprites alternate exactly as the ship's do.
  if (ram.u16(0x812970) !== 0) return;                     // $24C3DC
  if (ram.u16(0x80390c) !== 0) return;                     // $24C3E6
  if (ram.u16(0x813098) !== 0) return;                     // $24C3F0
  if (ram.u16(0x813092) === 2) return;                     // $24C3FA
  if (SHIP_MUTATE.value === 'no-shadow') return;
  podShadow(ram, opt, OPT.posY, OPT.flipColour, OPT.shadow0);        // $24C406
  podShadow(ram, opt, OPT.posY2, OPT.pod + OPT.flipColour, OPT.shadow1); // $24C43E
  void player;
}

/** `$24C406..$24C43C` and its verbatim twin `$24C43E..$24C474`. */
function podShadow(ram, opt, posOff, flipOff, shadowOff) {
  // $24C422 addi.l #$FE00FF00,D1 -- note the SECOND word differs from the
  // ship's $FE00FE00: the pods' shadows sit one pixel further along the short
  // axis. Translated as written.
  const d1 = groundPlane(ram.u16(opt + posOff), ram.u16(opt + posOff + 2),
    0xfe00ff00);
  const d3 = POD_SHADOW_SIZE;                              // $24C428 move.w #$208
  // $24C42C move.w ($1c,A6),D4 / $24C430 move.b #$18,D4 -- a WORD load then a
  // BYTE store into the same register, so D4 keeps the flip bits and takes the
  // shadow's colour. MEASURED $0018 and $4018.
  const d4 = (ram.u16(opt + flipOff) & 0xff00) | POD_SHADOW_COLOUR;
  const d2 = ram.u32(opt + shadowOff);                     // $24C434 ($5c,A6)
  enqueueRegisters(ram, NAMED_BUCKETS.shadows, d1, d2, d3, d4);  // jsr $23EFEE
}

/**
 * `$24D12E` -- one pod's move and its bucket-15 enqueue.
 *
 *   24d132: move.b ($1a,A6),D0 / and.b ($1b,A6),D1   speed, angle & $3F
 *   24d13a: jsr $241812                              THE SHIP'S OWN VECTOR ROUTINE
 *   24d140: move.w D2,D0 / asr.w #3,D0 / sub.w D0,D2     D2 = 7/8 dY
 *   24d146: add.w D2,($2,A6)
 *   24d14a: btst #0,($1,A4) / beq $24D158
 *   24d152:   move.w D3,D0 / asr.w #2,D0 / add.w D0,D3   D3 = 5/4 dX
 *   24d158: cmpi.w #$6,($5a,A4) / beq $24D166
 *   24d160:   move.w D3,D0 / asr.w #2,D0                 D0 = dX/4
 *   24d166:   move.w D3,D0 / asr.w #1,D0                 ...or dX/2 at formation 6
 *   24d16a: add.w D0,D3 / add.w D3,($4,A6)
 *   24d170: tst.w $812970 / bne -> rts
 *   24d178: tst.b ($1,A4) / bmi $24D188
 *   24d17e: jmp $23F2CA                              THE BUCKET-15 ENQUEUE
 *
 * ASR ON A NEGATIVE VALUE ROUNDS TOWARD -INFINITY and that is visible in the
 * measurement, not a theoretical worry: pod 0 (angle $10) lands at posX + $822
 * and pod 1 (angle $30) at posX - $823, one unit further out, because
 * `asr.w #2` of -1666 is -417 and of +1666 is +416.
 */
function movePod(ram, ctx, b, pod) {
  const { player } = b;
  const speed = ram.u8(pod + OPT.speedIdx);                // $24D132
  const angle = ram.u8(pod + OPT.angle) & 0x3f;            // $24D136 and.b $3F
  const v = ctx.tables.vector(speed, angle);               // $24D13A jsr $241812
  // THE WRONG PORT: `asr.w` rounds toward -infinity, and the difference is
  // exactly one unit on the pod that moves in -X.  MEASURED on the board: pod 0
  // sits at posX + $822 and pod 1 at posX - $823, and the asymmetry IS the
  // rounding.  A port that used `Math.trunc(dx/4)` gets pod 1 one unit wrong on
  // every frame of every run.
  const sh = (x, n) => (SHIP_MUTATE.value === 'pod-asr-toward-zero'
    ? Math.trunc(x / (1 << n)) : asr(x, n));

  let dy = i16(v.dy);
  dy = i16(dy - i16(sh(dy, 3)));                           // $24D142/$24D144
  let dx = i16(v.dx);
  if (ram.btst8(player + P.flags1, 0)) {                   // $24D14A btst #0,($1,A4)
    dx = i16(dx + i16(sh(dx, 2)));                         // $24D152..$24D156
  }
  // $24D158 cmpi.w #$6,($5a,A4): formation 6 halves instead of quartering.
  const extra = ram.u16(player + P.optFormation) === 6
    ? i16(sh(dx, 1)) : i16(sh(dx, 2));
  dx = i16(dx + extra);                                    // $24D16A add.w D0,D3
  if (SHIP_MUTATE.value !== 'pods-rigid') {
    // THE WRONG PORT: leave the pods where $24C33A put them -- ON the ship.
    // That is what the page's SPLICE did (a constant offset from the ship), so
    // this mutation is the old behaviour, and the gate has to be able to see it.
    ram.setU16(pod + OPT.posY, u16(i16(ram.u16(pod + OPT.posY)) + dy));  // $24D146
    ram.setU16(pod + OPT.posX, u16(i16(ram.u16(pod + OPT.posX)) + dx));  // $24D16C
  }

  if (ram.u16(0x812970) !== 0) return;                     // $24D170 -> rts
  if (ram.i8(player + P.flags1) < 0) {                     // $24D178 tst.b/bmi
    unreached(0x24d188, `$24D188: the knockback path takes the pod through the `
      + `$24D28E ramp and a SECOND enqueue at $24D1F8 instead of $24D17E. `
      + `MEASURED: ($1,A4) bit 7 is 0 on every sampled frame`);
  }
  enqueueRequest(ram, NAMED_BUCKETS.options, pod);         // $24D17E jmp $23F2CA
}

/**
 * `$24C0D2..$24C116` -- the one-time template copy, AS WRITTEN.
 *
 *   24c0d2: lea ($24BBAA,PC),A0
 *   24c0d6: move.w ($5a,A4),D0 / subi.w #$2,D0 / add.w D0,D0
 *   24c0e0: movea.l (A0,D0.w),A0            <-- LONGWORDS at a *2 index
 *   24c0e4: lea ($6,A6),A1
 *   24c0e8: move.l (A0)+,(A1)+  x7          +$06..+$21
 *   24c0f6: addq.w #4,A1                    +$22..+$25 ARE NOT WRITTEN
 *   24c0f8: move.l (A0)+,(A1)+  x15         +$26..+$61
 *   24c116: move.w (A0)+,(A1)+              +$62..+$63
 *
 * 90 template bytes into 94 record bytes with a four-byte hole.  Then five byte
 * copies out of the player and a `clr.w ($16,A2)` on the laser block.
 *
 * NEVER EXERCISED BY A GATED RUN: the init bit is already set at every sample
 * point in the corpus.  It is here so that a scenario which starts before the
 * pods deploy does not hit a hole, and it is labelled so nobody reads its
 * presence as coverage.
 */
function copyTemplate(ram, ctx, b) {
  const { opt, player, laser } = b;
  const form = ram.u16(player + P.optFormation);           // $24C0D6
  const tmpl = ctx.rom.u32(OPT_TEMPLATES + u16(form - 2) * 2);   // $24C0E0
  let src = tmpl, dst = opt + 0x06;                        // $24C0E4 lea ($6,A6)
  for (let k = 0; k < 7; k++) {                            // $24C0E8 x7
    ram.setU32(dst, ctx.rom.u32(src)); src += 4; dst += 4;
  }
  dst += 4;                                                // $24C0F6 addq.w #4,A1
  for (let k = 0; k < 15; k++) {                           // $24C0F8 x15
    ram.setU32(dst, ctx.rom.u32(src)); src += 4; dst += 4;
  }
  ram.setU16(dst, ctx.rom.u16(src));                       // $24C116 move.w

  const d0 = ram.u8(player + P.dirLatch);                  // $24C118 ($1d,A4)
  ram.setU8(opt + 0x1d, d0);                               // $24C11C
  ram.setU8(opt + 0x3d, d0);                               // $24C120
  const pw = ram.u8(player + 0x56);                        // $24C124 ($56,A4)
  ram.setU8(laser + 0x1d, pw);                             // $24C128 ($1d,A2)
  ram.setU8(laser + 0x1e, pw);                             // $24C12C ($1e,A2)
  ram.setU16(laser + 0x16, 0);                             // $24C130 clr.w ($16,A2)
}

export { OPT, ROM };
