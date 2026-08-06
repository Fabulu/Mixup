// DELIBERATE BREAKAGE -- the red half of the gate.
//
// `docs/knowledge/03`: a check that has never been seen red is not a check.
// The wave brief names the one to try: "Red-validate by breaking the clamp
// order and watching the scenario fail."  Breaking it from OUTSIDE the port,
// through a named switch, keeps the shipped code honest -- there is no
// `if (TESTING)` inside player.js -- and makes the red run reproducible by
// anyone, from the command line, without editing a source file.
//
// Each mutation names the ROM address it falsifies and what a reader should
// expect to see move.  A mutation that does NOT go red is a finding.

import { RAM, P } from '../src/machine.js';
import { AUTOSHOT_MUTATE, CLAMP_ORDER, updatePlayer } from '../src/player.js';
import { SHIP_MUTATE } from '../src/shipsprite.js';
import { W82_MUTATE } from '../src/boss.js';
import { B2_MUTATE } from '../src/background.js';
import { W94_MUTATE } from '../src/bossscripts.js';
import { W95_MUTATE } from '../src/bossphase.js';
import { W95G_MUTATE } from '../src/bossguns.js';
import { W96_MUTATE } from '../src/bossarrival.js';

export const MUTATIONS = {
  // THE ONE THE BRIEF ASKS FOR.  $2495CA moves first ($2417F4 adds the vector
  // straight into the record) and $249608/$249648/$24966E/$24968A clamp
  // afterwards, subtracting the overshoot from the velocity accumulator.  A
  // port that clamps the position BEFORE the move is identical everywhere
  // except at a wall -- which is exactly why the scenario pins all four.
  'clamp-first': () => { CLAMP_ORDER.value = 'clamp-first'; },
  // The other order trap in the same routine: $23D12A reads $803974 BEFORE
  // overwriting it, so `edge` is against the PREVIOUS frame's raw.  Deriving
  // the edge after the store makes it permanently zero.
  'edge-after-store': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === RAM.p1edge) return orig(a, 0);
      return orig(a, v);
    };
  },
  // $24A42A: the bank decays by 4 toward zero.  Removing it leaves the ship
  // banked forever and moves the two animation longs at $8103F0/$8103FA.
  'no-tilt-decay': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === RAM.player1 + P.tilt) return orig(a, 0);
      return orig(a, v);
    };
  },
  // RENAMED IN WAVE 5, because the wave-4 name was a claim this check cannot
  // support.  `04-review.md` 5 measured it: the $200D20 quadrant tables hold
  // ZERO negative values in 64 levels x 65 entries, and $24183A's `asr.l #4`
  // runs BEFORE the quadrant negation at $241870/$241890/$2418B0 -- so a
  // faithful `lsr.l #4` swap is a provable NO-OP on every value the table can
  // supply, and this mutation never implemented one anyway (it adds
  // sign(dy)).  What it DOES validate is real and worth keeping: that `dy` is
  // compared to the unit, so one unit of movement per frame cannot hide.
  'dy-off-by-one': (game) => {
    const t = game.tables;
    const orig = t.vector.bind(t);
    t.vector = (s, a) => {
      const v = orig(s, a);
      return { dy: v.dy === 0 ? 0 : v.dy + Math.sign(v.dy), dx: v.dx };
    };
  },
  // WAVE 5.  $23BEBC/$23BECE/$23BEE0 mask the three copies of $80390A to
  // mod 4 / mod 8 / mod 16.  Wave 4 ported the copies without the masks and
  // nothing could see it, because those addresses were not compared columns.
  // This mutation restores wave 4's behaviour exactly, so the fix has a
  // permanent red half: it must move c3910/c3912/c3914 on the FIRST compared
  // frame.
  'no-phase-mask': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    const masked = new Set([RAM.frameCounterMod4, RAM.frameCounterMod8,
      RAM.frameCounterMod16]);
    r.setU16 = (a, v) => {
      if (masked.has(a)) return orig(a, r.u16(RAM.frameCounter));
      return orig(a, v);
    };
  },

  // ------------------------------------------------------------------ WAVE 8
  // Four mutations over the shot subsystem.  Each names the instruction it
  // falsifies and the column that must move, because a mutation whose name is
  // broader than what it breaks is the defect `05-review.md` filed against
  // `clamp-first`.

  // $24A32E, the four instructions that make $24A2D6 different from $24A222:
  // `subq.w #4,($44,A6) / bcc / move.w #$4,($44,A6)`, run ONCE PER SECONDARY
  // SPAWN.  This mutation is the port as it stood before the difference was
  // measured -- treat the three fillers as one routine and leave ($44,A6)
  // alone.  It must move `p44` on the first spawn and then `shot1`/`shot2` at
  // byte 181 (the fourth record's ($24,A6)), and it must break the sprite-
  // request containment, because ($24,A6) picks the record's ($a,A6).
  'no-secondary-tail': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === RAM.player1 + 0x44) return orig(a, r.u16(a));
      return orig(a, v);
    };
  },

  // $23F3DE `move.l D0,(A0)+` -- the FIRST longword of the 12-byte sprite
  // request, i.e. the drawn (y,x) the enqueue packs at $23F3C6..$23F3D8.
  // Adding one to the Y word falsifies exactly the enqueue's output and
  // nothing else in the port, so it must break SPRQ CONTAINMENT and leave the
  // 52 compared columns green.  That separation is the point: it proves the
  // containment check is a check and not decoration.
  'enqueue-off-by-one': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a >= 0x808854 && a < 0x808eb4 && ((a - 0x808854) % 12) === 0) {
        return orig(a, (v + 1) & 0xffff);
      }
      return orig(a, v);
    };
  },

  // $253BC6 `subq.w #4,($24,A6) / bcc / move.w #$4,($24,A6)` -- the animation
  // index the handler steps every frame, which picks the record's ($a,A6) at
  // $253BC0.  Freezing it must move `shot1`/`shot2` AND break containment.
  'no-anim-step': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      const inShots = a >= 0x810572 && a < 0x810c32;
      if (inShots && ((a - 0x810572) % 0x30) === 0x24) return orig(a, r.u16(a));
      return orig(a, v);
    };
  },

  // $253A7C/$253AA0 -- the LIVE SHOT COUNT $81295C.  It is a REPORTED column,
  // not a claimed one (the option pods make the two sides differ by
  // construction), so this mutation exists to prove the REPORTED channel is
  // real rather than decorative: it must change the printed drift and it must
  // NOT change the RESULT line.  A mutation expected to stay green is still a
  // measurement, as long as the expectation is written down first -- and the
  // runner reports it as EXPECTED-GREEN rather than as a pass.
  'no-live-count': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === 0x81295c) return orig(a, 0);
      return orig(a, v);
    };
  },

  // ----------------------------------------------------------------- WAVE 12
  // $249E78 `move.l (A0,D0.w),($14,A6)` writes the ship's X HALF-EXTENTS from
  // $2553F2, indexed by the tilt.  Wave 4 called that long `animB`, believed it
  // was animation, and never compared it; the hitbox has been BLOCKED since
  // wave 2 partly because of that.  This mutation banks the SPRITE correctly
  // and freezes the HITBOX at the tilt-0 entry -- a port that looks perfect on
  // screen and is wrong about every collision.  It must move `animb0`/`animb1`
  // during the L/R sweeps of fly-around (lf2320-2420 and lf2440-2540) and it
  // must leave every bucket-19 byte alone.
  'hitx-frozen': () => { SHIP_MUTATE.value = 'hitx-frozen'; },
  // $24C096 is RUN from wave 12 on.  Not running it is wave 11's behaviour, and
  // it must move the four option columns and both bucket-15 records.
  'no-option-object': () => { SHIP_MUTATE.value = 'no-option-object'; },
  // $24D12E moves each pod off the ship by one frame of its own velocity.
  // Skipping the move is EXACTLY WHAT THE PAGE'S SPLICE DID -- a rigid offset
  // from the ship -- so this mutation is the old behaviour, and if it stayed
  // green the gate would not be able to tell the two apart.
  'pods-rigid': () => { SHIP_MUTATE.value = 'pods-rigid'; },
  // $24D160/$24D164 `move.w D3,D0 / asr.w #2,D0`.  Rounding toward zero instead
  // of toward -infinity moves pod 1 by ONE unit of 1/64 px -- MEASURED $0C9E
  // against the board's $0C9D -- and the sprite enqueue's `asr.l #6` throws that
  // unit away, so NO PICTURE CAN EVER SEE IT.  It is red on `o1x` here and
  // declared EXPECTED-GREEN on `pgm.py shipgate`.  A real arithmetic difference
  // that the framebuffer cannot show is the argument for compared columns in
  // one line.
  'pod-asr-toward-zero': () => { SHIP_MUTATE.value = 'pod-asr-toward-zero'; },

  // ----------------------------------------------------------------- WAVE 79
  // `$2497AA`, THE AUTO-SHOT.  Seven mutations, all declared in `player.js`
  // itself (`AUTOSHOT_MUTATE`) so a reviewer can read the wrong port next to
  // the right one.  They only bite on a scenario that HOLDS BUTTON 3 -- on
  // `fly-around` and `stage1-play` the block never runs and every one of them
  // is a provable no-op, which is the honest reason `stage1-sweep` is the
  // ladder they are validated on.
  'autoshot-unported': () => { AUTOSHOT_MUTATE.value = 'autoshot-unported'; },
  'autoshot-dropped': () => { AUTOSHOT_MUTATE.value = 'autoshot-dropped'; },
  'autoshot-edge-cached':
    () => { AUTOSHOT_MUTATE.value = 'autoshot-edge-cached'; },
  'autoshot-every-frame':
    () => { AUTOSHOT_MUTATE.value = 'autoshot-every-frame'; },
  'autoshot-inverted': () => { AUTOSHOT_MUTATE.value = 'autoshot-inverted'; },
  'autoshot-on-edge': () => { AUTOSHOT_MUTATE.value = 'autoshot-on-edge'; },
  'autoshot-no-3c-gate': () => { AUTOSHOT_MUTATE.value = 'autoshot-no-3c-gate'; },
  'autoshot-no-optbit': () => { AUTOSHOT_MUTATE.value = 'autoshot-no-optbit'; },

  // ----------------------------------------------------------------- WAVE 82
  // D-SCRIPT 7 (`$2943B0`) AND THE FOUR A2 OBJECT ROUTINES -- the stage-1
  // boss's body animator and four of its seven sprite emitters.  Nine
  // mutations, all declared in `boss.js` itself (`W82_MUTATE`).
  //
  // THEY ONLY BITE WHERE THE BOSS IS ALIVE, i.e. from lf7,870 on, which on the
  // ladders this repo has means the LAST TWO RUNGS of `stage1-sweep` and
  // nothing else.  `fly-around` never reaches the boss and `stage1-play` and
  // `stage1-laser-hold` are still blocked ahead of it, so a green there is a
  // statement about reach and not about this code.
  'd7-bcc-inverted': () => { W82_MUTATE.value = 'd7-bcc-inverted'; },
  'd7-no-ramp': () => { W82_MUTATE.value = 'd7-no-ramp'; },
  'd7-unsigned-per': () => { W82_MUTATE.value = 'd7-unsigned-per'; },
  'd7-step-one': () => { W82_MUTATE.value = 'd7-step-one'; },
  'd7-wrap-ble': () => { W82_MUTATE.value = 'd7-wrap-ble'; },
  'obj2-no-attr': () => { W82_MUTATE.value = 'obj2-no-attr'; },
  'obj3-unsigned-ac': () => { W82_MUTATE.value = 'obj3-unsigned-ac'; },
  'obj3-no-bias': () => { W82_MUTATE.value = 'obj3-no-bias'; },
  'obj4-one-addi': () => { W82_MUTATE.value = 'obj4-one-addi'; },
  'obj4-index-1': () => { W82_MUTATE.value = 'obj4-index-1'; },
  'obj5-d0-clobbered': () => { W82_MUTATE.value = 'obj5-d0-clobbered'; },
  'obj5-mask-3f': () => { W82_MUTATE.value = 'obj5-mask-3f'; },

  // -------------------------------------------------------------- WAVE 85
  // THE BACKGROUND ELEMENTS' OWN BUCKET-2 STAGE, `$23DF2A`.  W82's twelve above
  // can only bite on `stage1-sweep`'s last two rungs, where the boss is; this
  // one bites wherever an element stages, which is most of the stage and all
  // nine of that ladder's GREEN segments.  It exists so the bucket-2 trace added
  // this wave is red-validated over the part of the stage the boss never
  // reaches, and not only at the one place it was built for.
  'elem-no-kind': () => { B2_MUTATE.value = 'elem-no-kind'; },

  // -------------------------------------------------------------- WAVE 94
  // THE STAGE-1 BOSS'S MOVEMENT LAYER -- MAIN scripts 6 and 7, their shared
  // tail `$29314C`, the waypoint draw `$2933DE`, the speed ramp `$293400` and
  // the distance `$242494`.
  //
  // **NONE OF THESE CAN GO RED ON ANY LADDER THIS REPO HOLDS, AND THAT IS
  // REPORTED RATHER THAN HIDDEN.**  MAIN 6 and 7 run only while the boss is
  // ALIVE, i.e. from lf~7,870 -- and every rung in that range is still BLOCKED
  // on the other ten of the steady state's twelve entry points.  The two rungs
  // that are not blocked (lf19,000 and lf19,250) are past the death, where the
  // MAIN sequencer is on id 1.  So the seam exists, the mutations are named,
  // and `tests/w94boss.test.js` is what actually drives each of them red.
  // W94's worklog 6.2 says this plainly instead of reporting a green.
  'ring-reversed': () => { W94_MUTATE.value = 'ring-reversed'; },
  'tail-both-plus80': () => { W94_MUTATE.value = 'tail-both-plus80'; },
  'tail-same-shift': () => { W94_MUTATE.value = 'tail-same-shift'; },
  'pick-one-draw': () => { W94_MUTATE.value = 'pick-one-draw'; },
  'ramp-unsigned': () => { W94_MUTATE.value = 'ramp-unsigned'; },
  'dist-no-aspect': () => { W94_MUTATE.value = 'dist-no-aspect'; },
  'main6-unsigned-arrive': () => { W94_MUTATE.value = 'main6-unsigned-arrive'; },
  // DECLARED EXPECTED-GREEN, with the measurement, BEFORE it was run --
  // see `W94_EXPECTED_GREEN` below and `src/bossscripts.js`'s own note.
  'main7-stale-target': () => { W94_MUTATE.value = 'main7-stale-target'; },

  // -------------------------------------------------------------- WAVE 95
  // THE STEADY STATE'S TEN (`src/bossphase.js`) AND THE THREE GUNS THEY START
  // (`src/bossguns.js`).  **UNLIKE W94's, THESE CAN GO RED ON A LADDER**: with
  // the twelve complete, `stage1-sweep`'s 28 steady-state rungs stop being
  // blocked on their first frame and 10 of them are compared end to end, so a
  // wrong port of this code moves a real segment.  W94 6.2's structural
  // objection is what this wave removed.
  //
  // Each name is the WRONG PORT it stands for, written next to the right one in
  // the source so a reviewer reads both.
  'main2-speed-20': () => { W95_MUTATE.value = 'main2-speed-20'; },
  'main5-ramp': () => { W95_MUTATE.value = 'main5-ramp'; },
  'd20-init-byte': () => { W95_MUTATE.value = 'd20-init-byte'; },
  'd20-wrap-ble': () => { W95_MUTATE.value = 'd20-wrap-ble'; },
  'f1-volley-bcc': () => { W95_MUTATE.value = 'f1-volley-bcc'; },
  'f1-start-d7': () => { W95_MUTATE.value = 'f1-start-d7'; },
  'f6-one-draw': () => { W95_MUTATE.value = 'f6-one-draw'; },
  'e0-bchg-slot': () => { W95_MUTATE.value = 'e0-bchg-slot'; },
  'e1-set-param': () => { W95_MUTATE.value = 'e1-set-param'; },
  'e1-one-draw': () => { W95_MUTATE.value = 'e1-one-draw'; },
  'e11-muzzle-order': () => { W95_MUTATE.value = 'e11-muzzle-order'; },
  'e4-init-own-step': () => { W95G_MUTATE.value = 'e4-init-own-step'; },
  'e13-word-scale': () => { W95G_MUTATE.value = 'e13-word-scale'; },
  // ---- W96, THE ARRIVAL ------------------------------------------------
  'd-init-fallthrough': () => { W96_MUTATE.value = 'd-init-fallthrough'; },
  'main0-speed-byte': () => { W96_MUTATE.value = 'main0-speed-byte'; },
  'main0-phase1-mask': () => { W96_MUTATE.value = 'main0-phase1-mask'; },
  'main0-arm-obj6': () => { W96_MUTATE.value = 'main0-arm-obj6'; },
  'main0-one-target': () => { W96_MUTATE.value = 'main0-one-target'; },
  'd0-one-draw': () => { W96_MUTATE.value = 'd0-one-draw'; },
  'd0-same-speed': () => { W96_MUTATE.value = 'd0-same-speed'; },
  'd2-wrap-blt': () => { W96_MUTATE.value = 'd2-wrap-blt'; },
  'emit-one-axis': () => { W96_MUTATE.value = 'emit-one-axis'; },
  'obj6-no-bias': () => { W96_MUTATE.value = 'obj6-no-bias'; },
};

/** W94's one mutation that is EXPECTED to change nothing, and the proof.
 *  Declared here so "it passed" cannot be read after the fact as evidence. */
export const W94_EXPECTED_GREEN = {
  'main7-stale-target': 'PROVABLE no-op: [M] $293642..$293690 touches (A4) at '
    + 'exactly two instructions and both are `adda.w (A4),A0` -- READS, at '
    + '$293648 and $293678. Nothing in the span writes it and none of the four '
    + 'callees can ($24203E/$242190 are pure, $293400 writes ($1a,A6), $2417DE '
    + 'writes ($2,A6)/($4,A6)), so the re-read at $293672 returns the same two '
    + 'words. Seen green deliberately by tests/w94boss.test.js, which asserts '
    + 'BYTE-IDENTICAL output under the mutation rather than "did not go red"',
};

/** W96's FIVE mutations that do NOT move a `stage1-sweep` segment, each with
 *  the measured reason.  **Five of W96's ten DO move one** -- `d0-same-speed`
 *  and `d2-wrap-blt` (8 segments each), `d-init-fallthrough` (1, 88 records),
 *  `d0-one-draw` (1, 143 records) and `emit-one-axis` (1) -- and all five below
 *  are driven RED in `tests/w96boss.test.js`, so the transcription is checked.
 *  What is declared here is only why the LADDER cannot see them.
 *
 *  **AND TWO OF THE FOUR NAME A HOLE IN THE INSTRUMENT, NOT IN THE WAVE.**
 *  Bucket-2 CONTAINMENT is one-directional by construction (W85 §1.3: the board
 *  has producers the port lacks), so a mutation that makes the port emit FEWER
 *  records cannot be red. `[M]` both of those two drop segment lf8,250 from
 *  **431 port records to 35** and the sweep reports "changed NOTHING". A
 *  RECORD-COUNT comparison would catch it; the ORDER report would not, because
 *  a shorter list is still a subsequence. That is a one-line change for a later
 *  wave, with this measurement behind it. */
export const W96_EXPECTED_GREEN = {
  'main0-speed-byte': 'THE INSTRUMENT IS ONE-DIRECTIONAL: [M] with the speed '
    + 'byte zeroed MAIN 0 never closes to $1800, phase 1 never starts, the '
    + '$2932D6 handoff never runs, and OBJECT 0..5 and D 0..3 are never armed '
    + '-- so segment lf8,250 emits 35 bucket-2 records instead of 431 and every '
    + 'one of the 35 is still contained. MAIN 0 runs 124 frames instead of 81 '
    + 'and its state differs on its FIRST frame; the unit test reads it there.',
  'main0-phase1-mask': 'THE SAME HOLE: [M] carrying the phase-0 mask `& $3F` '
    + 'into phase 1 wraps ($11A,A6) at $40, so it never reaches $180, the '
    + 'handoff never runs and the same 431 -> 35 drop follows. [M] the first '
    + 'MAIN 0 frame that differs is frame 40, where clean has $11A = $40 and '
    + 'the mutation has $0.',
  'main0-arm-obj6': 'BUCKET 7 IS NOT TRACED: reading the `jsr $25994A` at '
    + '$293362 as a sixth `$2598E6` leaves OBJECT 6 armed, and OBJECT 6 is the '
    + 'ONLY producer this wave adds that writes bucket 7 ($807450/$80AFC8, '
    + 'through $23E08C). [M] the bucket-2 record count and every traced column '
    + 'are unchanged (431 records, 0 missing). The `stage1-sweep` trace has a '
    + '`sprq2` column and no bucket-7 column -- W85 section 8 note 3 already '
    + 'listed bucket 7 as one of the four that are "the same job and the same '
    + 'three-file change", and this is the first wave with a reason to do it.',
  'obj6-no-bias': 'BUCKET 7 IS NOT TRACED, the same reason as main0-arm-obj6 '
    + 'and the second of the two: $292F4A is the ONLY consumer of the $292F60 '
    + 'bias and its only output is a bucket-7 record through $23E08C. [M] the '
    + 'mutation changes no verdict, no first divergence and no bucket-2 count '
    + 'on any of the 71 segments. It is also the mutation that most wants a '
    + 'bucket-7 column, because [M] OBJECT 6 is the ONLY producer running at '
    + 'all during MAIN 0 -- the whole descent, 81 frames of segment lf8,250, '
    + 'emits nothing the ladder can compare. THE ARRIVAL IS THE PART OF THIS '
    + 'BOSS THE INSTRUMENT IS BLIND TO, and naming that is this wave second '
    + 'measurement about the oracle rather than about the port.',
  'main0-one-target': 'PROVABLE NO-OP, and the claim it falsifies was WITHDRAWN '
    + '(src/bossarrival.js item 5): the target is ($5400, $1C00 - $813172) and '
    + 'its only input is $813172, which src/background.js writes once a frame '
    + 'at $261508 -- nothing between $29321C and $29325C can change it. [M] '
    + 'BYTE-IDENTICAL on all 81 MAIN 0 frames of segment lf8,250 in ($11A,A6), '
    + 'the phase byte, the speed byte and the position longword -- asserted as '
    + 'identity in tests/w96boss.test.js, not as "did not go red". The second '
    + 'instance of W94 section 2.1 main7-stale-target.',
};

/** W95's SEVEN mutations that do NOT move a `stage1-sweep` segment, each with
 *  the measured or proven reason it cannot.  Declared here so a green cannot be
 *  read after the fact as evidence -- W82 and W94 set this precedent and this is
 *  the third and largest instance.  **All seven are driven RED in
 *  `tests/w95boss.test.js`**, so the transcriptions are checked; what is stated
 *  below is only why the LADDER cannot see them.  The six that DO move a
 *  segment are `main2-speed-20`, `main5-ramp`, `d20-wrap-ble` (18 of 28),
 *  `f1-volley-bcc`, `f6-one-draw` and `e1-one-draw`. */
export const W95_EXPECTED_GREEN = {
  'd20-init-byte': "PROVEN FROM THE BOARD'S OWN RAM: D 20 is armed only by F 6 "
    + 'state 0, which first does `D.stop 7` -- and [M] at every one of the 28 '
    + 'steady-state rungs where the MAIN sequencer is on 7 (the rendezvous F 6 '
    + "waits for), the board's $AF(A6) is ALREADY $00. Clearing the word and "
    + 'clearing the byte therefore agree on every frame these windows cover. '
    + "Same shape as W82's d7-no-ramp declaration.",
  'f1-start-d7': 'UNREACHED: F 1 state 3 needs E 1, E 3 and E 4 all idle, and '
    + 'the mutation then differs from the shipped `moveq #$3,D0` only on the '
    + '$FFFF terminator arm with an RNG byte of exactly 0. The unit test drives '
    + 'that arm directly and the wrong port starts F 2 there.',
  'e0-bchg-slot': 'A DOUBLE NO-OP, both halves provable. (1) $3(A5) is the '
    + 'TARGET INDEX $242716 reads, and src/aim.js measured that P2 alive word '
    + '$810448 is $0000 on all 12,281 rows of the recon capture -- so the '
    + '$24270A fallback rescues every aim onto P1 whichever way the byte points. '
    + '(2) the slot byte the mutation writes instead, $3(A4), is OVERWRITTEN two '
    + 'instructions later by `$2958F8 move.w #$1001,$2(A4)`.',
  'e1-set-param': 'THE RESIDUE IS ZERO: $C(A4) is only non-zero once E 1 has '
    + 'been armed before in the same slot, and `add` and `set` agree on 0. The '
    + 'unit test seeds a residue and the two readings then differ.',
  'e11-muzzle-order': 'HP-GATED SHUT: `$296614 cmpi.l #$48CC,$16(A5) / bcc` '
    + "returns before the volley, and [M] the board's HP0 over the 28 "
    + 'steady-state rungs runs $147A4 down to $F44F -- never below $48CC. So E '
    + '11 STEP does not execute one shot on this ladder, and its INIT does not '
    + 're-run because the gate also stops the counter that retires the slot. '
    + 'The same measurement covers E 0.',
  'e4-init-own-step': 'UNREACHABLE WITH A LIVE PLAYER: the ROM copy bug '
    + "($295F82 bcs.w $295E5E, E 3's step) is on the CARRY arm of $24226E, "
    + 'which is "both players dead". The ladder holds P1 invulnerable throughout.',
  'e13-word-scale': 'PROVABLE NO-OP, exhaustively: over all 65,536 word values '
    + '`u8(u8(2x)*2)` and `u8(4x)` differ on ZERO, because doubling a byte twice '
    + 'IS multiplying by four mod 256. The test asserts BYTE-IDENTICAL output '
    + 'rather than "did not go red", as W94 2.1 did for main7-stale-target.',
};

/** Mutations that are EXPECTED to leave the RESULT line green, with the reason.
 *  Declared here, before the run, so "it passed" cannot be read after the fact
 *  as "the gate is fine". */
export const EXPECTED_GREEN = {
  'no-live-count': 'the live-shot count $81295C is a REPORTED column, not a '
    + 'claimed one -- this mutation must move its printed drift (measured: 106 '
    + 'differing frames -> 124) and must NOT move the RESULT line',
};

/** WAVE 12.5 -- the `pgm.py firegate` mutations that are EXPECTED to leave the
 *  RESULT line green ON `stage1-shot`, each with the MEASUREMENT that says why
 *  and the test that DOES see it fail.  Declared before the run, for the same
 *  reason `EXPECTED_GREEN` is: an unexplained pass is not evidence.
 *
 *  All three numbers below are from `out/w12_5/stage1-shot.fire.tsv`, 2,572
 *  frames, lf2001..4572. */
export const FIRE_EXPECTED_GREEN = {
  'edge-on-raw': 'MEASURED: the raw byte ($40,A6) and the edge byte ($41,A6) '
    + 'agree on bit 4 on ALL 2,572 frames -- `stage1-shot` taps Button 1 for '
    + 'exactly one frame at a time, so every held frame is also an edge frame. '
    + 'Seen red instead by tests/fire.test.js "the gate is the EDGE byte", '
    + 'which supplies raw=$10 with edge=$00 -- the state a HOLD produces',
  'burst-mask-6': 'MEASURED: ($21,A4) is 0 on all 2,572 frames (the whole word '
    + '($20,A4) is 0), so `lsr.b #1` and the ship twin\'s `lsr.w #1 / andi.b '
    + '#6` both yield 0 and the difference cannot appear. Seen red instead by '
    + 'tests/fire.test.js "$24C48E is lsr.b with NO mask", which sets '
    + '($21,A4) = $0E: $0E>>1 = 7, 7 & 6 = 6',
  'delay-no-two': 'MEASURED: bit 0 of ($1,A4) is 0 on all 2,572 frames and '
    + '($20,A4) is never 8, so $24C4EC\'s `moveq #$2,D0` arm is never taken '
    + 'and the reload is always ($36,A4). Seen red instead by '
    + 'tests/fire.test.js "$24C4E4 compares the WORD ($20,A4) against 8"',
};

/** WAVE 79 -- the `$2497AA` mutations that are EXPECTED to leave `stage1-sweep`
 *  GREEN, each with the MEASUREMENT that says why and the test that DOES see it
 *  fail.  Declared before the run, for the same reason `EXPECTED_GREEN` and
 *  `FIRE_EXPECTED_GREEN` are: an unexplained pass is not evidence.
 *
 *  Both are the same finding about the ROM.  `$2497BA`'s ($3c,A6) gate and
 *  `$2497E4`'s bchg divider each enforce the SAME alternation when Button 3 is
 *  simply held, so on a ladder that holds it and nothing else, dropping either
 *  one is a provable no-op.  They come apart only where one of them stops
 *  running -- and `stage1-sweep` never enters either of those states.
 *
 *  MEASURED: `seedcmp.mjs --manifest .../stage1-sweep --segment 3250 --break
 *  <name>` returns `1 green, 0 red` for both, against `1 green` clean and
 *  `1 red` for the other five. */
export const AUTOSHOT_EXPECTED_GREEN = {
  'autoshot-every-frame': 'MEASURED: `$2497BA` already suppresses the frame '
    + 'AFTER a fire, because `$249B50` set ($3c,A6) on it -- so dropping '
    + '`$2497E4` divider changes nothing while the cadence machine is '
    + 'running. It is observable only when `$249B40 bne $249E4E` returns before '
    + '`$249B50`, i.e. while the LASER holds ($3f,A6) non-zero. Seen red '
    + 'instead by tests/w79autoshot.test.js under the `laser-hold` scenario',
  'autoshot-no-3c-gate': 'MEASURED: the converse -- with `$2497E4` divider '
    + 'intact, dropping ($3c,A6) leaves the same 1,0,1,0 alternation for a '
    + 'pure hold. It is observable when a REAL Button-1 edge sets ($3c,A6) '
    + 'while the block is inert, which `stage1-sweep` never does (it holds '
    + 'Button 3 alone from lf1890). Seen red instead by '
    + 'tests/w79autoshot.test.js under the `after-real-edge` scenario',
};

/** W82.  Mutations expected to leave the ladder green, declared BEFORE the run.
 *
 *  `obj3-unsigned-ac` reads `$AC(A6)` as UNSIGNED instead of signed.  It is a
 *  PROVABLE no-op, not a weak check: `i16(x) == x (mod 65536)`, `$292C06 lsl.w
 *  #$5` is a WORD shift and `$292C08 adda.w` sign-extends only afterwards, so
 *  the two readings are the same instruction.  [M] over all 65,536 word values
 *  of `$AC` the row offset differs on ZERO.  This wave's first draft claimed the
 *  opposite in a source comment and the comment was WITHDRAWN.
 *
 *  The rest of W82's mutations bite only where the boss is alive -- lf7,870 on
 *  -- which on the ladders this repo has is the LAST TWO RUNGS of
 *  `stage1-sweep`.  A green anywhere else is a statement about reach.
 */
export const W82_EXPECTED_GREEN = {
  'obj3-unsigned-ac': 'PROVABLE no-op: the `lsl.w #$5` truncates to a word '
    + 'before `adda.w` sign-extends, so signed and unsigned readings of $AC are '
    + 'the same instruction. [M] 0 of 65,536 values differ. Seen green '
    + 'deliberately by tests/w82stageend.test.js, which asserts BYTE-IDENTICAL '
    + 'output under the mutation rather than merely "did not go red"',
};

export function breakage(name, game) {
  CLAMP_ORDER.value = 'rom';   // never leak a mutation between runs
  SHIP_MUTATE.value = null;    // ...and the same for wave 12's seam
  AUTOSHOT_MUTATE.value = null;  // ...and wave 79's
  W82_MUTATE.value = null;       // ...and wave 82's
  B2_MUTATE.value = null;        // ...and wave 85's
  W94_MUTATE.value = null;       // ...and wave 94's
  W95_MUTATE.value = null;       // ...and wave 95's ten
  W95G_MUTATE.value = null;      // ...and wave 95's three guns
  W96_MUTATE.value = null;       // ...and wave 96's arrival
  const m = MUTATIONS[name];
  if (!m) {
    throw new Error(`unknown mutation "${name}"; have: ${Object.keys(MUTATIONS).join(', ')}`);
  }
  m(game);
  return name;
}

export { updatePlayer };
