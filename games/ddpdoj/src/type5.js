// OBJECT DISPATCH ENTRY [5] -- `$28B5E0`, priority $18, one of the eight live
// slots in the top-level table.  Wave 5 called it "the one that owns the
// weapons" and counted "15 subsystem calls"; `05-review.md` re-counted and got
// 23, and 23 is right:
//
//   28b5e0: tst.b ($2,A5) / beq $28b5a8
//   28b5e6: jsr $289b80   $2634f4   $28ad54   $27f95a   $288e4e   $2890f2
//           $255dd8   >>> $253A70 <<<   $24c096   $254680   $255042   $28a098
//           $2527ce   $24a458   $24a46c   $24a440   $24a44c   $27e99e
//           $252bd0   $281d9a   $25354c   $25292a   $252a52
//   28b670: tst.w $81308c / beq $28b730 ...
//
// **THIS FILE RUNS NINETEEN OF THE TWENTY-THREE AND COUNTS THE OTHER FOUR.**
// (W45 added #10 `$254680` and #11 `$255042`, the beam's segment driver and its
// draw.  Both were counted as "three of the thirteen unported calls, with no
// indication that they are the laser" -- `37-recon-laser.md` §5.)
// (W33 added call #3, `$28AD54`, and only its FIRST LOOP -- see the case body.)
// `TYPE5_PORTED` below is the authority; this paragraph is not.  It said "EXACTLY
// ONE" from wave 8 until wave 29 -- through wave 12 adding five -- and W28's
// recon read it and reported "the port has 1 of 23" as a measured fact.  A stale
// header comment in this project is not decoration, it is a wrong number with a
// citation attached, and it cost a recon its headline.  Keep it correct or
// delete it.
//
// The partial-handler cost is real and is stated here rather than discovered:
//
//  * A partial handler is not a handler.  Anything the thirteen unported calls
//    write is missing from the port, so any compared column that depends on them
//    diverges.  The gate's answer to that is to compare the SHOT TABLE SLOTS
//    THE PLAYER'S OWN SPAWN CAN REACH (slots 14..17 and 21..24) and nothing
//    else in that table -- the option pods' shots go into slots 7..12 through
//    $24C096, which is now RUN (wave 12).
//  * `$28B5E0`'s own entry test `tst.b ($2,A5) / beq $28B5A8` is translated,
//    because a handler that ran when the board's did not would be worse than
//    one that does less.
//  * The thirteen are counted through `UnportedLog`, so a run always prints
//    what it did NOT do next to what it did.  Wave 4 set that precedent for
//    whole dispatch entries; this was the first use of it INSIDE one.
//
// ------------------------------------------------ WAVE 29: THE INTEGRATION
//
// Calls #2 (`$2634F4`) and #20 (`$281D9A`) are the ENTRY POINTS of the enemy and
// bullet subsystems.  W21-W27 ported both stacks -- the spawn walker, the 58-slot
// driver, six handlers, 21 init bodies, the movement interpreter, the mover and
// all 37 bullet behaviour bodies -- and W28 then measured that **no module under
// `src/` imported any of them**: they were reachable only from their own tests
// and their own gates.  Wiring them here is what turns that transcription into
// executing code, and the first thing it produced was a loud named throw at
// `$275914` -- an enemy handler nobody has ported -- 345 logic frames into the
// page's own seed.  See `src/enemyframe.js` and `src/bulletdriver.js`.
//
// Call #21 (`$25354C`) came with #20: it is the six-instruction timer that arms
// #20's screen clear, and half a machine is worse than none.
//
// $28B5A8 (the `beq` target) is not translated either -- it is the not-yet-
// started branch and it is a named throw if ($2,A5) is ever 0.
//
// ------------------------------------------------------- WAVE 9: THE LASER
//
// A play report: "holding the fire button does nothing, does not throw, does
// not freeze."  It was diagnosed here, and this is where the fix goes.
//
// The held bit ARRIVES -- measured, 400 held frames give `$803970` bit 4 set on
// 400 of them.  The shot cadence machine reads the EDGE mirror `$803972`
// ($249B48 `btst #$4,($19,A6)`), which is the BOARD's own behaviour, so "one
// burst on press and then quiet" is faithful and not a bug.
//
// What the board ALSO does with a held fire button, and this port does not, is
// the LASER SPEED RAMP, measured in wave 4 §4 on scenario `speedmodes`:
//
//   Button 1 held -> ($1a,A4) 22 -> 21 -> ... -> 12, one step every 4 frames
//                    (applied dY 246 -> 134); released -> back up, one per frame
//   the writers:   $24C8CE `subq.b #1,($1a,A4)` and $24C900 `addq.b #1,($1a,A4)`
//   the routines:  $24C8BE (down) and $24C8E4 (up), A4 = the PLAYER record,
//                  A6 = the OPTION record
//
// and both live inside `$24C096` -- the option object, called from `$28B616`,
// which is ONE OF THE 22 THIS FILE COUNTS AND DOES NOT RUN.  `$24C8BE` has no
// absolute-long caller (checked: it is reached PC-relative from inside
// $24C096), so nothing in the port could ever have reached it.
//
// SO THE ANSWER WAS (b): the path is reached and quietly does nothing.  The
// silence had a second half: the spawn's selector is `btst #$0,($1,A6)` on the
// player record ($249C1C/$249C32). W163 translated the hyper request that sets
// it, and W188 translated the resulting `$254078` shot family.
//
// The 22 calls cannot ALL become throws -- they run every frame regardless of
// input, and a throw there is a page that never boots.  So the throw is put on
// exactly the condition under which the board's ramp WOULD MOVE SOMETHING, and
// it counts the hold first: `$24C8C8 subq.b #1,($4b,A6) / bne` reloads ($4b,A6)
// to ((($5a,A4)-2)>>1)+4 = 4 for the measured formation 2, so a tap of 1..3
// frames never moves ($1a,A4) and the port is not diverging yet.  On the FOURTH
// consecutive held frame it would, and that is where this throws.
//
// That threshold is also what keeps wave 8's work reachable from the page:
// `stage1-shot` fires SINGLE-FRAME taps every 20 logic frames, so the gate
// never trips it, and a player can still tap to run the ported spawn.

// ------------------------------------------------------- WAVE 12: THE ANSWER
//
// Wave 9's throw was on the SPEED RAMP and the combat recon measured two things
// wrong with it (10-recon-combat §2):
//
//   * it fired on the FOURTH held frame, whereas the board's laser gate
//     `$24C164 btst #4,($40,A6)` is entered on the FIRST; and
//   * `speedIdx !== laserFloor` meant A PLAYER ALREADY AT THE SPEED FLOOR COULD
//     HOLD FIRE AND STILL GET SILENCE -- the exact failure the throw existed to
//     prevent, narrowed instead of removed.
//
// The gate is now the board's own: the raw held bit, `RAM.p1raw & $10`, reaching
// `$24C164` through `$24C134`'s byte copy, with NO speed-index condition.  The
// throw lives in `src/options.js` where the instruction is, not here, because
// the option object is now RUN rather than counted -- and running it is what
// turns "the pods are spliced" into "the pods are computed".
//
// `laserRampWouldMove` survives as a PURE PREDICATE with no callers in the
// shipped path: the ramp is real, `rampUp` in options.js ports its other half,
// and tests still pin its shape.  It is no longer a gate on anything.

import { unreached } from './unported.js';
import { runShotDriver } from './weapons.js';
import { shotHandlers } from './shots.js';
import { runOptionObject } from './options.js';
import { drawShip, drawShipAlt, SHIP_MUTATE } from './shipsprite.js';
import { RAM, ROM } from './machine.js';
import { runEnemyFrame, enemyHandlerMap } from './enemyframe.js';
import { reapSubRecords, SUB_REAPER } from './spawn.js';
import { runBulletDriver, runClearTimer } from './bulletdriver.js';
import { runType5Tail } from './damage.js';
import { notePerFrameLedger } from './score.js';
import { runSegmentDriver, runBeamDraw } from './laser.js';
import { runSparkDriver } from './spark.js';
import { runEffectDriver, runPoolCDriver, runSubEffectDriver } from './effects.js';
import { runItemDriver } from './items.js';
import { runPoolADriver } from './bee.js';
import { bombDriver255DD8 } from './bomb.js';
import { runCueDriver28AD70 } from './cues.js';

export const TYPE5 = {
  handler: 0x28b5e0,
  entryTest: 0x28b5e0,      // tst.b ($2,A5)
  notStarted: 0x28b5a8,
  poolCDriver: 0x289b80,    // $28B5E6 -- pool-C death satellites        (W194)
  enemyFrame: 0x2634f4,     // $28B5EC -- the spawn walker + the 58-slot driver
  subReaper: 0x28ad54,      // $28B5F2 -- reaper plus cue driver fall-through (W173)
  bulletDriver: 0x281d9a,   // $28B658 -- the screen clear + THE MOVER
  clearTimer: 0x25354c,     // $28B65E -- the screen clear's arming timer
  shotDriver: 0x253a70,     // $28B610 -- the ONE call this port makes
  optionObject: 0x24c096,   // $28B616 -- where the LASER RAMP lives
  segmentDriver: 0x254680,  // $28B61C -- THE BEAM's 32-slot segment driver (W45)
  beamDraw: 0x255042,       // $28B622 -- THE BEAM's draw                   (W45)
  sparkDriver: 0x28a098,    // $28B628 -- POOL E, THE SHOT'S IMPACT SPARK (W53)
  effectDriver: 0x288e4e,   // $28B5FE -- POOL B, THE DEATH EXPLOSION     (W54)
  subEffectDriver: 0x2890f2,// $28B604 -- POOL D, secondary debris        (W191)
  impactDriver: 0x27f95a,   // $28B5F4 -- POOL A, THE BEE/IMPACT DRIVER   (W111)
  itemDriver: 0x27e99e,     // $28B64C -- THE ITEM, pool family six       (W61)
  bombDriver: 0x255dd8,     // $28B5F8 -- **THE BOMB**, call #7            (W64)
  laserRampDown: 0x24c8be,  // inside it; $24C8CE is the write
  /** ($4b,A6)'s reload with the measured formation ($5a,A4) = 2: (2-2>>1)+4. */
  laserRampFrames: 4,
  /** The 23 `jsr` targets in ROM order, read from `xref.py dasm 28B5E0 180`. */
  calls: [
    0x289b80, 0x2634f4, 0x28ad54, 0x27f95a, 0x288e4e, 0x2890f2, 0x255dd8,
    0x253a70, 0x24c096, 0x254680, 0x255042, 0x28a098, 0x2527ce, 0x24a458,
    0x24a46c, 0x24a440, 0x24a44c, 0x27e99e, 0x252bd0, 0x281d9a, 0x25354c,
    0x25292a, 0x252a52,
  ],
};

/**
 * Is the board's laser speed ramp about to move ($1a,A4)?
 *
 * PURE and exported so `tests/type5.test.js` can drive it without a Game.
 * `held` is how many consecutive logic frames P1 has held Button 1.
 *
 * The DOWN ramp is a no-op while ($1a,A4) is already at the ($38,A4) floor
 * ($24C8C2 `cmp.b ($38,A4),D0 / beq`), so a port that has somehow reached the
 * floor is not diverging by standing still.  The port never moves the index, so
 * in practice this is "held for four frames".
 */
export function laserRampWouldMove(held, speedIdx, laserFloor) {
  return held >= TYPE5.laserRampFrames && speedIdx !== laserFloor;
}

/** The nine of the 23 `jsr` targets the port RUNS, by their position in the
 *  ROM's own call order.  Everything else is still counted.  The four ship-draw
 *  entries come BEFORE the option object in that order and that matters: the
 *  ship's records reach bucket 19 while the pods' reach bucket 15, and the two
 *  buckets drain at different depths, so the ORDER WITHIN a bucket is what a
 *  byte-for-byte gate can see.
 *
 *  WAVE 29 added #2, #20 and #21.  #2 and #20 are the two that matter: they are
 *  the entry points of the ENEMY and BULLET subsystems, and until this wave
 *  nothing under `src/` imported `spawn.js`, `handlers.js`, `mover.js` or
 *  `turret.js` at all -- W28 measured it.  #21 is six instructions and is the
 *  timer that arms #20's screen clear; porting it with #20 keeps that one
 *  machine whole rather than half-wired. */
export const TYPE5_PORTED = new Set([
  0x289b80,   // #1  POOL C: satellite/death-effect driver             (W194)
  0x2634f4,   // #2  THE ENEMY SUBSYSTEM: spawn walk + deferred drain + driver (W29)
  0x28ad54,   // #3  SUB-RECORD REAPER (W33) + cue driver fall-through (W173)
  0x253a70,   // #8  the player-shot driver (wave 8)
  0x24c096,   // #9  THE OPTION OBJECT (wave 12) -- and THE BEAM (W45)
  0x254680,   // #10 THE BEAM's segment driver, 32 slots x 2 players (W45)
  0x255042,   // #11 THE BEAM's draw (W45)
  0x24a458,   // #14 the ship's alt entry, P1 (wave 12)
  0x24a46c,   // #15 ...P2
  0x24a440,   // #16 the ship's draw, P1 (wave 12)
  0x24a44c,   // #17 ...P2
  0x281d9a,   // #20 THE BULLET SUBSYSTEM: screen clear + the mover (W29)
  0x25354c,   // #21 the screen clear's arming timer (W29)
  // W53 (E5a).  #12 is `$28A098`, and `40-recon` 3.3 filed it as "bucket 20's
  // BULK WRITER -- cheap in pixels (195 px), THE FIRST PRE-EMPTIVE SACRIFICE".
  // `50-recon` 1.7 corrected that and this wave ports it: it is the DRIVER of
  // the shot's impact spark, pool E, and W11's 195 px was measured on
  // `stage1-open`, a scenario that never fires a shot, so it was never evidence
  // about this call at all.  It ships in the SAME COMMIT as its allocator
  // `$289F54` (`src/shots.js firstHit` -> `src/spark.js spawnSpark`), because a
  // pool with a producer and no consumer is W33 4's leak.
  0x28a098,   // #12 THE SHOT'S IMPACT SPARK: pool E's driver + bucket 20 (W53)
  // W54 (E5b).  #5 is `$288E4E`, THE DEATH EXPLOSION's driver.  It ships in the
  // same commit as its allocator `$289004` (`src/effects.js spawnEffect`, called
  // from ~25 death arms in `src/handlers.js` and `src/midboss.js`) for W33 §4's
  // reason. W191 completes the immediately following pool-D allocator and
  // driver, so the secondary debris requested here is consumed in the same
  // type-5 call order as the ROM.
  0x288e4e,   // #5  THE DEATH EXPLOSION: pool B's driver, buckets 0/1/2/3/7 (W54)
  0x2890f2,   // #6  POOL D: secondary debris allocator + driver          (W191)
  // W111 (M1).  #4 is `$27F95A`, POOL A's driver -- the bee/impact pool's 80-
  // slot walk, scroll, 5-bit kind dispatch and the bee body (blink, off-screen
  // free, collect + flat/chain-multiply award through $286128).  It ships in
  // the SAME COMMIT as its allocator `$27F92A` (`src/bee.js allocBee27F92A`,
  // called from `handlers.js deathSeq8A`) for W33 sec 4's reason, and the
  // reserved-ten allocator REFUSES the 18 non-bee kinds.  This is FOURTH of
  // twenty-three, between the sub-record reaper (#3) and the explosion (#5),
  // and the position is load-bearing: the bee's idle-step emit at $27FCE2
  // reaches bucket 0 (or whichever layer the fill picked) through the same
  // per-record stubs the explosion uses, so running it BEFORE #5 means an
  // explosion's records stack on top of the bee's rather than the reverse.
  0x27f95a,   // #4  THE BEE/IMPACT: pool A's driver, the bee body        (W111)
  // W61 (I2).  #18 is `$27E99E`, THE ITEM's driver, and it has been LISTED in
  // `calls` since wave 8 and never made -- recon 59 §7's "one type-5 call
  // listed but not called".  It ships in the SAME COMMIT as its allocator
  // `$27E812` (`src/items.js spawnItem`, called from `handlers.js deathSeq85`)
  // for W33 §4's reason, and the pool it drives is the sixth family, not one of
  // `50-recon`'s five.
  0x27e99e,   // #18 THE ITEM: the 25-slot family's driver, bucket 17    (W61)
  // W64 (B2).  #7 is `$255DD8`, THE BOMB's driver -- the script machine that
  // runs the `$811F72` record `$249A4A` allocates, and the ONLY thing that
  // can free it (`$2564F0`, reached from the script's own terminator).  It
  // ships with `src/bomb.js`'s allocator in one commit.
  0x255dd8,   // #7  THE BOMB: $255E3E's three phases and $2564F0's teardown (W64)
]);

/** Handlers this module dispatches to, built once per Game. */
export function makeType5(rom) {
  const handlers = shotHandlers();
  const enemyHandlers = enemyHandlerMap(rom);
  return function type5(ram, slot, index, ctx) {
    if (ram.u8(slot + 2) === 0) {                       // $28B5E0 tst.b ($2,A5)
      unreached(TYPE5.notStarted, `object type 5's "not started" branch `
        + `($28B5E0 tst.b ($2,A5) / beq $28B5A8) -- ($2,A5) is 0. MEASURED `
        + `non-zero on every frame of the compared window`);
    }
    for (const c of TYPE5.calls) {
      switch (c) {
        case TYPE5.poolCDriver:                         // $28B5E6 -> $289B80
          ctx.poolCFrame = runPoolCDriver(ram, rom, ctx);
          ctx.poolCSink?.(ctx.poolCFrame);
          break;
        case TYPE5.enemyFrame:                          // $28B5EC -> $2634F4
          ctx.enemyFrame = runEnemyFrame(ram, rom, ctx, enemyHandlers);
          break;
        case TYPE5.bulletDriver:                        // $28B658 -> $281D9A
          // `notes` is what src/mover.js calls the log; `ram` is not on Game's
          // ctx at all.  Both are supplied here, once, rather than renamed
          // across two files this wave is not the reviewer for.
          ctx.bulletFrame = runBulletDriver({ ...ctx, ram, rom,
            notes: ctx.unportedLog });
          break;
        case TYPE5.clearTimer:                          // $28B65E -> $25354C
          runClearTimer(ram);
          break;
        case TYPE5.shotDriver:                          // $28B610
          ctx.shotsProcessed = runShotDriver(ram, rom, handlers, ctx);
          break;
        case TYPE5.optionObject:                        // $28B616 -> $24C096
          // The `no-option-object` mutation is wave 11's behaviour restored:
          // count the call and do not run it.  It must move the four option
          // columns and both bucket-15 records.
          if (SHIP_MUTATE.value === 'no-option-object') {
            ctx.unportedLog.note(c, 'MUTATION no-option-object');
          } else {
            runOptionObject(ram, ctx);
          }
          break;
        case TYPE5.segmentDriver:                       // $28B61C -> $254680
          // WAVE 45.  Calls #10 and #11 are TWO THIRDS OF THE BEAM and they
          // are wired together with #9 for the reason W37 §6 gives: the beam is
          // a bootstrap across frame boundaries -- #9 seeds a segment, #10's
          // handler sets the bit both of #9's builders wait on, and #11 draws
          // what #9 laid down.  Any two of the three is a machine that arms and
          // never fires.
          ctx.laserSegments = runSegmentDriver(ram, ctx);
          break;
        case TYPE5.beamDraw:                            // $28B622 -> $255042
          ctx.laserDrawn = runBeamDraw(ram, ctx);
          break;
        case TYPE5.sparkDriver:                         // $28B628 -> $28A098
          // WAVE 53.  It runs HERE, twelfth of twenty-three, and the position
          // matters for the same reason W12's ship-draw ordering did: this call
          // OVERWRITES bucket 20's counter (`$28A1B4 move.w A4,$80AFDE`, a bulk
          // writer, `src/spritequeue.js` 3), so anything that appended to
          // bucket 20 earlier in the frame would be silently discarded.
          // Nothing in this port does -- [M] bucket 20 read 0 records on every
          // frame of every run before this wave -- and that is measurement, not
          // proof: the board's own writers into bucket 20 are unenumerated.
          ctx.sparkFrame = runSparkDriver(ram, rom, ctx);
          break;
        case TYPE5.effectDriver:                        // $28B5FE -> $288E4E
          // WAVE 54.  FIFTH of twenty-three, and the position is load-bearing
          // for the opposite reason to the spark's: pool B emits through the
          // PER-RECORD stubs `$23D762`/`$23D79E`/`$23D7DA`/`$23D816`/`$23D852`,
          // which APPEND to buckets 0, 1, 2, 3 and 7 (`enqueueThroughStub`), so
          // every other producer into those five buckets that runs LATER in the
          // frame stacks on top of these records rather than replacing them.
          // Running it out of order changes the DEPTH ORDER inside a bucket,
          // which is exactly what `dlgate`'s staged-bytes replay can see.
          // The telemetry goes onto ctx AND onto ctx.effectSink if a caller
          // supplied one -- the pool census (54-impl-E5b) reconciles an
          // independent 80-slot scan against $81C8EA using `freed` and
          // `delayed`, and neither is recoverable from RAM after the frame.
          ctx.effectFrame = runEffectDriver(ram, rom, ctx);
          ctx.effectSink?.(ctx.effectFrame);
          break;
        case TYPE5.subEffectDriver:                     // $28B604 -> $2890F2
          ctx.subEffectFrame = runSubEffectDriver(ram, rom, ctx);
          ctx.subEffectSink?.(ctx.subEffectFrame);
          break;
        case TYPE5.itemDriver:                          // $28B64C -> $27E99E
          // WAVE 61.  EIGHTEENTH of twenty-three, and the position decides two
          // things a gate can see.  It runs AFTER the explosion (#5) and after
          // the beam (#10/#11), so an item's bucket-17 records sit on top of
          // theirs; and it runs BEFORE `$28B670`, the collision pass in this
          // file's tail, so an item flagged by block 2 on frame N is COLLECTED
          // on frame N+1 at the earliest -- recon 59 §5.2's open ordering item,
          // and this port answers it the only way it may: by running the call
          // where the ROM's own `jsr` list puts it.
          ctx.itemFrame = runItemDriver(ram, rom, ctx);
          ctx.itemSink?.(ctx.itemFrame);
          break;
        case TYPE5.subReaper:                           // $28B5F2 -> $28AD54
          // WAVE 33 ports the reaper half of `$28AD54`: the twelve
          // instructions $28AD54..$28AD6C that turn a DYING sub-record (byte 0
          // == 1, written by `$263762`) into a FREE one (byte 0 == 0, the only
          // thing `$2635D8` accepts).  Until this wave nothing performed that
          // transition and the 150-slot pool filled permanently: MEASURED
          // 100 of 100 common slots occupied from lf2906 of the fly-around
          // replay, with fifteen enemies alive, after which every spawn was
          // silently dropped.  See src/spawn.js's SUB_REAPER block.
          //
          // W173 closes its inseparable fall-through at `$28AD70`, the driver
          // over type `$84`'s bounded kind-0/kind-4/kind-8 `$81DB90` cues.
          ctx.subReaped = reapSubRecords(ram);
          ctx.cueFrame = runCueDriver28AD70(ram, rom);
          break;
        case TYPE5.impactDriver:                          // $28B5F4 -> $27F95A
          // WAVE 111.  FOURTH of twenty-three, between the sub-record reaper
          // (#3) and the explosion (#5), and the position is load-bearing for
          // the same reason as #5's: the bee's idle-step emit at $27FCE2
          // reaches bucket 0 (or whichever layer the fill picked) through the
          // same per-record stubs `$23D762`/`$23D79E`/`$23D7DA`/`$23D816`/
          // `$23D852` the explosion uses, so anything that appends to those
          // buckets LATER in the frame stacks on top.  Running it out of order
          // changes the DEPTH ORDER inside a bucket.
          ctx.impactFrame = runPoolADriver(ram, rom, ctx);
          break;
        // WAVE 64 (B2).  #7 is `$255DD8`, **THE BOMB'S DRIVER**, and it has
        // been a counted note since wave 8.  It ships in the SAME COMMIT as
        // its allocator (`src/bomb.js fireBomb2498E2`, the `$249A4A move.w
        // D2,(A1)` that makes `$811F72` negative) and as its teardown
        // (`$2564F0`, which wipes all 45 records), for W33 �4's reason -- and
        // here the reason is sharper than usual, because the record is not
        // just a pool slot: while it is live it turns on `$24560A`'s damage,
        // `$286876`'s chain machine, the explosion pool's interlock and four
        // more gates.  A driver-less allocation would leave every one of them
        // on for the rest of the stage.
        case TYPE5.bombDriver:                          // $28B5F8 -> $255DD8
          // `no-bomb-driver` is W64's control and it is HEAD's behaviour: the
          // call is COUNTED and not run, exactly as it was from wave 8 to
          // wave 63.  It has to live here for the same reason
          // `no-option-object` does -- the dispatch is a `switch` over the
          // ROM's own list and there is no seam outside this file.
          if (SHIP_MUTATE.value === 'no-bomb-driver') {
            ctx.unportedLog.note(c, 'MUTATION no-bomb-driver');
          } else {
            ctx.bombDrove = bombDriver255DD8(ram, rom, ctx);
          }
          break;
        case ROM.shipDrawAltP1:                         // $24A458
          drawShipAlt(ram, RAM.player1, ctx);
          break;
        case ROM.shipDrawAltP2:                         // $24A46C
          drawShipAlt(ram, RAM.player2, ctx);
          break;
        case ROM.shipDrawP1:                            // $24A440
          drawShip(ram, RAM.player1, ctx);
          break;
        case ROM.shipDrawP2:                            // $24A44C
          drawShip(ram, RAM.player2, ctx);
          break;
        default:
          ctx.unportedLog.note(c, `object type 5 ($28B5E0) subsystem call -- `
            + `${TYPE5.calls.length - TYPE5_PORTED.size} of its `
            + `${TYPE5.calls.length} jsr targets are still unported`);
      }
    }
    // ---------------------------------------------------------------- W34
    // $28B670 -- THE TAIL, and the only thing in build B that reaches
    // `$244D62` (four absolute callers, all of them here).  Until this wave it
    // was a counted note, and with it noted the port could not reduce any
    // enemy's HP at all: nothing died, the midboss never released the scroll,
    // and the distance clock `$8130CE` stopped at 239 with eight of the
    // nineteen stage-1 handlers' first trigger beyond it (W33 §3).
    //
    // IT RUNS HERE, AFTER THE TWENTY-THREE CALLS, BECAUSE THAT IS WHERE IT IS.
    // The enemy frame (call #2) has already refreshed `$815E9E`/`$815EA0` and
    // the shot driver (call #8) has already moved the shots, so the pass sees
    // this frame's positions -- which is what makes `$80390C`'s per-frame
    // alternation a 30 Hz collision check rather than an accident.
    ctx.damage = runType5Tail(ram, ctx);
    notePerFrameLedger(ctx);
    void index;
  };
}
