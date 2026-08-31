// THE MAIN LOOP -- build B's `$23BFDC`, seven calls and a `bra`.
//
// The order below is not a design; it is the measured phase order of one frame
// (wave 2 item 4, `phase.lua`, 1,901 build-B frames, ONE dominant signature and
// no second shape), with the interrupt half corrected to the handlers that
// actually run (see isr.js).  From one sample point to the next:
//
//    1  the loop SPINS on $803940                       $23C390
//    2  hardware sprite DMA, vblank rising edge         pgm.cpp screen_vblank
//    3  IRQ6: coin, THE INPUT READ, the (A) gate, the release
//    4  main-loop call #6, POST-VBLANK: derive the edges   $23D12A
//    5  call #0 COUNTERS                                   $23BE8C
//    6  call #1                                            $256D5A
//    7  call #2 THE OBJECT DRIVER                          $2410BC   77,725 cyc
//    8  call #3                                            $24683E
//    9  call #4 THE SPRITE LIST BUILD                      $23D2AE   15,594 cyc
//   10  call #5 ARM $803940 AND SPIN  <- THE SAMPLE POINT  $23C212
//
// THE COUNTERS ADVANCE PER LOOP ITERATION, NOT PER VBLANK, and the frame sync
// READS ONE OF THEM BACK.  That is the coupling that makes slowdown a state
// change rather than a pace change: $80390A tracks LOGIC frames and falls
// behind the display exactly as far as the game slows down (measured: it
// advanced 695 over a stretch in which 1,309 video frames passed).  So the
// port must never advance a counter from a host tick, and dilation must delay
// the WHOLE iteration rather than skip and catch up.
//
// videoFrame and logicFrame are separate compared fields, always.
//
// ---------------------------------------------------------------------------
// W375 -- A DECLARED DEVIATION FROM `NOTES-replay.md` §2, AND IT IS A WIDENING
// OF THE REPLAY CONTRACT, not a bug.
//
// That note says a run's state derives from (initial state, input words) and
// NOTHING ELSE, and every per-game field in the constructor below cites it.
// From this wave `Game` has a SECOND per-frame input: `this.coinPort`, the raw
// `$C08004` word, which the page writes before each `step()` and which
// `coinDebounce13CEC8` and `$13CFBA` both read.
//
// **THE `.replay` FORMAT DOES NOT CARRY IT.** `src/web/replay.js` fixes
// `portin.encoding === 'u16be'` with ONE word per logic frame and
// `decodePortinWords` throws on anything else, so a recording made while the
// owner was coining up REPRODUCES ONLY ITS PLAYER INPUT: the replayed run sees
// `COIN.idle` on every frame it was recorded with a coin held, and its credit
// count -- and anything downstream of it -- diverges. A recording taken with
// no coin key touched is unaffected, which is every existing fixture.
//
// `step()`'s signature is deliberately UNCHANGED for that reason: a second
// per-frame word is a FORMAT VERSION BUMP, not an argument. THE HONEST FIX,
// when someone wants coin-accurate recordings, is a v2 encoding carrying BOTH
// streams -- the existing `portin` block plus a sibling `coinin` block of the
// same shape (`u16be`, same count) -- with `validateReplay` requiring the two
// counts to match and a v1 file read back as `coinin` = all `$FFFF`, which is
// exactly what a v1 run already means. Until then this is a stated hole.
// ---------------------------------------------------------------------------

import { RAM, ROM, MACHINE } from './machine.js';
import { Ram, u16, i16 } from './ram.js';
import { postVblankEdges } from './input.js';
import { irq6, coinDebounce13CEC8, COIN } from './isr.js';
import { WorkBudget } from './budget.js';
import { frameSync } from './framesync.js';
import { runObjectDriver, ObjOrder } from './objdriver.js';
import { playerObject2491C0, FROZEN_GLOBALS } from './player.js';
import { UnportedLog, unreached } from './unported.js';
import { MoveTables } from './vectors.js';
import { RomWindows } from './rom.js';
import { drawByte242E24 } from './rng.js';
import { makeType5 } from './type5.js';
import { PLAYER_SLOTS } from './shots.js';
import { buildDisplayList } from './displaylist.js';
// W375 -- `$23BF74`, THE FRONT-END BOOT BLOCK.  See `boot()` below and
// src/frontend.js's header for the four places the disassembly it was ported
// from had to be corrected.
import {
  bootFrontEnd23BF74, operatorFactory256FA6, resetPrologue23BEEA,
} from './frontend.js';
import { ProtLatch } from './protsim.js';
import { snapshotBucket, NAMED_BUCKETS } from './spritequeue.js';
import { makeBackground, BgVram, TxVram, VideoRegs, SlotTable907000 } from './background.js';
import { makeStageClear, makeStage5Ending } from './stageend.js';
import { makeHudObject } from './hud.js';
import { makeRankObject, announce260B30 } from './rank.js';
import { tallyScreen25DBB4 } from './tallyscreen.js';
// W374: the FRONT-END SLOTS. Ported across W372-W374 and, until this wave, never registered --
// objSlot7/9/13/15/17 were each referenced only inside their own file, so four waves of screen work
// was driven by tests and unreachable from the driver.
//
// `objslot9.js` is imported as a NAMESPACE on purpose. `phase7_25D560`'s draw tail takes its seven
// draws as injected data keyed by the exact names that module exports (see `TAIL_25D560`), because
// `objslot9.js` already imports `objslot17.js` and importing back would be a cycle. Passing the
// namespace is what that injection point was designed for.
import * as slot9 from './objslot9.js';
import { objSlot7 } from './objslot7pool.js';
import { objSlot8 } from './objslot8.js';
// W387: slot [12], the NAME-ENTRY screen -- the frame the front end closes on itself.
import { objSlot12 } from './objslot12.js';
import { objSlot13 } from './objslot13.js';
// W375: slot [14], ported in W372 and left out of W374's registration pass.
import { objSlot14 } from './objslot14.js';
import { objSlot15 } from './objslot15.js';
import { objSlot17 } from './objslot17.js';
// `SOUND_WRAPPERS`/`STREAMING_LEAVES` were imported here only by W375's
// `$18B0D6` guard in `#ctx().soundPost`; that guard moved into `isr.js` as a
// counted `unported.note()`, so the two tables are no longer read in this file.
import { SoundState, drainFrame, postWrapperWithRuntime, postBgmCommand,
  soundFrameInput } from './sound.js';
import {
  PaletteState, flush24133C, catchUpObjectStream, catchUpBgPalette,
  catchUpTextPalette,
} from './palette.js';
import { runAnimObjects24683E } from './animobjects.js';
import { installBulletSpeedTransform, installBulletSpawnHook } from './bullets.js';
import { installScoreAddendTransform } from './score.js';
import {
  assertRunaheadInactive,
  beginRunaheadStep,
  restoreRunaheadState,
  RUNAHEAD_EXTERNAL_STATE,
  saveRunaheadState,
} from './runahead-state.js';

/** THE BUCKETS `pgm.py shipgate` SUBSTITUTES, in drain (= depth) order.
 *
 *  WAVE 44 CORRECTS THE COMMENT AND DELIBERATELY LEAVES THE ARRAY ALONE.  It
 *  used to say "the buckets the port has a PRODUCER for ... every other one of
 *  the thirty is still empty on the port's side", and that has been false since
 *  wave 29: [M] `40-recon-emission-path.md` §2.3, re-measured in wave 44, the
 *  port fills EIGHT of the thirty from the page's own seed -- 0, 2, 3, 5, 7,
 *  14, 15, 19 -- and bucket 0, THE ENEMIES, carries 14 to 62 records a frame.
 *
 *  This ARRAY is not a census and must not be widened to match one.  It is
 *  consumed by `tools/shipgate.mjs` (imported at :51, printed at :304) and by
 *  `this.staged` below, and it is the set that gate SUBSTITUTES into the
 *  board's own staged bytes.  Adding an entry changes what that gate compares;
 *  do it only while owning `shipgate`. */
export const PRODUCED_BUCKETS = [
  NAMED_BUCKETS.shadows,   // 5  -- the ship's and the pods' ground-plane shadows
  NAMED_BUCKETS.trail,     // 12 -- WAVE 67, the ship's AFTERIMAGE TRAIL
                           //       ($253604, reached from $24A53E).  Added
                           //       while owning `shipgate`, as the paragraph
                           //       above requires.  **It is deliberately NOT in
                           //       that gate's `CLAIMED_BUCKETS`**: the board
                           //       capture is `fly-around`, which never holds
                           //       the fire button, so `($3f,A6)` is 0 on all
                           //       2,301 frames and both sides are empty --
                           //       comparing them would be a check that sits
                           //       where two readings agree (knowledge/03).
                           //       `tools/w67trailgate.mjs` is the check.
  NAMED_BUCKETS.shots,     // 14 -- wave 8
  NAMED_BUCKETS.options,   // 15 -- the two option pods
  NAMED_BUCKETS.beam,      // 16 -- laser segments and the focused beam
  NAMED_BUCKETS.player,    // 19 -- the ship, its aura and its glow
];

/** The object dispatch table $240F62, as far as the port implements it.
 *  Entry [5] is PARTIAL -- see type5.js, WHICH IS THE AUTHORITY: `TYPE5_PORTED`
 *  holds TEN of its 23 subsystem calls, not the "NINE" this comment claimed
 *  until wave 44 (W33 added `$28AD54` and did not update this line).  Among them
 *  W29's enemy subsystem ($2634F4) and bullet subsystem ($281D9A + its timer
 *  $25354C).  18 of the 20 top-level entries now run. */
export function defaultHandlers(rom, vram, opts = {}) {
  return new Map([
    // WAVE 63 (B1).  $240F62[0] = $28D520, priority $0009 -- THE PER-FRAME
    // LEDGER.  `$28D52E jsr $2842B0` is the pending -> total DRAIN and
    // `$28D534 jsr $28444E` holds **$284636/$2847D4, THE TWO CHAIN METER
    // DECREMENTS** and the two `bsr`s the HYPER goes in (`$284460`/`$284464`).
    // src/score.js has NOTED this entry by address since wave 34 precisely so
    // that the decrement would land in the cartridge's own slot rather than one
    // this project chose -- see src/hud.js's header, which also settles recon
    // 38 3.3's open question about where the player object sits relative to the
    // RANK object (the answer is this table's own second longword).
    [0, makeHudObject(rom)],
    // WAVE 13.  $240F62[1] = $26127A, THE BACKGROUND: the scroll VM, both
    // cameras and the tilemap ring (src/background.js).  Adding this entry is
    // what makes $813176 and $8130CE move on every existing gate -- both were
    // in player.js's FROZEN_GLOBALS until this wave.
    [1, makeBackground(rom, vram, opts)],
    [2, playerObject2491C0],    // $240F62[2] = $2491C0, P1
    [3, playerObject2491C0],    // $240F62[3] = $249246, P2
    // W243. $240F62[4] = $260B30 IS TRANSLATED -- `announce260B30` in rank.js, with
    // w243announce.test.js driving it against the cartridge -- but it is NOT
    // REGISTERED HERE YET, and the reason is an artifact and not the code.
    //
    // The object reads its text list out of $260D22, a window W243 added. The
    // `.replay` regression fixtures embed their OWN `player.tables.json` as
    // `seed.tablesB64` (w132liveplay.test.js:137), frozen when the oracle recorded
    // them, so a subsystem that reads a NEW window throws $260D2A inside them no
    // matter what `rip/` or the web bundle now contain. Registering it turns five
    // replay gates red for a stale artifact.
    //
    // W269 REGISTERED IT, and WITHOUT rebuilding the artifact. The hold-back was right
    // about the cause and wrong about the only fix: a fixture's frozen ROM WINDOW LIST is
    // a port artifact, not game state -- it says which cartridge bytes the port lets
    // itself read, never what those bytes are. `adoptCurrentWindows` (src/rom.js) PROVES
    // the current list is a byte-superset of a fixture's and then substitutes it, so a
    // subsystem translated after a recording can run inside it. This entry was the single
    // most-counted gap in the whole game: 1800 notes over a 900-frame run, because it
    // runs TWICE a frame.
    [4, announce260B30],   // $240F62[4] = $260B30, the per-side announcement text

    // $240F62[5] = $28B5E0, PARTIAL: 10 of its 23 jsr targets (`TYPE5_PORTED`
    // is the authority and says so itself).  W29: this entry
    // is now the one that drives the ENEMIES and the BULLET POOL, so a frame
    // here can throw by address from deep inside a handler nobody has ported --
    // which is the point (docs/knowledge/10: a failure is strong evidence).
    [5, makeType5(rom)],
    // WAVE 62 (S1).  $240F62[6] = $28D63C, priority $000A (read out of the
    // cartridge through RomWindows, not carried as a literal).  THE STAGE-CLEAR
    // OBJECT: `$242952` creates it with the NEXT stage number in ($4,A5), its
    // init destroys the background object through `$25FCFA`, its state 2 writes
    // `$813092`/`$813094`/`$813096` through `$25FD0C` and its state 3 rebuilds
    // the world through `$25FD38`.  It is the machine ALL FIVE stages advance
    // through -- see src/stageend.js, including its ONE declared deviation.
    [6, makeStageClear(rom)],
    // WAVE 127 (Wave A, Tier 1).  $240F62[10] = $260794, priority $001F (the
    // HIGHEST of all 20 -- runs FIRST every frame, before the player `$1C` and
    // the ledger `$09`).  THE RANK OBJECT: it owns the rank clock `$8130C6` and
    // the recompute `$2608D2` that writes the dynamic-difficulty output
    // `$81309E` (= base[stage] + clock>>8 on the no-hyper corpus).  Until W127
    // this entry was absent and `$81309E` was frozen at its seed value for the
    // whole run (W120's verdict).  See src/rank.js, including its ONE declared
    // deviation (the cold-boot-only state-0 INIT).  CORPUS-SAFE: the recompute
    // reads no chain/score state, so it cannot perturb the frame-exact chain
    // decrement in entry [0].
    [10, makeRankObject(rom)],
    // W276.  $240F62[11] = $25DBB4, THE STAGE-CLEAR SCREEN, and the score tally is
    // inside it -- `$25DB7C` state 2's `jsr $2600D8` is the call the owner meant by
    // "maybe even score totalling, which I see none of".
    //
    // PARTIAL AND IT SAYS SO. State 0 and state 2 are transcribed; state 1's gates
    // and the MENU CURSOR at `$25DD0C` are one counted note naming the six routines
    // still missing. Registering it is right anyway for the reason entry [5] gives:
    // this was 900 unattributed notes a run, and now the notes name the state they
    // came from and the object's two working states actually run.
    [11, tallyScreen25DBB4],

    // W374: THE FRONT END, REGISTERED. Entries [7], [9], [13], [15] and [17] were all ported
    // across W372-W374 and none of them was in this map, so every screen the last three waves
    // built was unreachable from the driver -- correct code that could not run.
    //
    // THE SIGNATURE ADAPTS. `runObjectDriver` calls `h(ram, slot, slotIndex, ctx)`; the five
    // dispatchers take `(ram, rom, a5, ctx)`. `slotObject` is the same shape as `makeType5(rom)`
    // and the other factories above: it closes over `rom` and drops the slot INDEX, which none of
    // the five reads.
    //
    // PARTIAL, AND THEY SAY SO. Every one of these still carries counted `note()`s for the
    // routines below it -- slot [9]'s `$25CB94` tail, slot [17]'s six state-7 callees, and the
    // rest. Registering them is right for the same reason entry [5] gives: unattributed notes
    // become notes that name the state they came from, and the working states actually run.
    [7, slotObject(objSlot7, rom)],
    // W375. $240F62[8] = $25A770, priority $0018 -- the ATTRACT SEQUENCER and credit gate
    // (src/objslot8.js). It is the object that answers D41: coin and start alone do not reach the
    // game, because this is the state machine that reads the credit counter, arms the join poll and
    // stages the type it hands off to. Ported this wave; registering it takes the dispatch table to
    // 16 of 20.
    //
    // W390 CORRECTION -- this list was STALE (trap 14). W389 ported arm 12's $25C2AE/$25C2EA and
    // W390 arm 9's $25C3E8/$25C424, and all four are real calls now.
    //
    // W391 CORRECTION -- and it was stale AGAIN, one wave later, for the same reason. W391 ports
    // arms 1 and 3's $25BBB4, $25BD7C and $25BDE0, so those three are real calls too.
    //
    // W392 CORRECTION -- stale a THIRD time, and this is the one that empties the list. W392
    // ports arm 5's $25C592 and $25C6D4, so **NO arm sub-machine is counted any anywhere in
    // objslot8.js**: the sequencer's spine plus arms 0, 1, 2, 3, 5, 9, 12, 13 and 14 all run
    // here for real. And the machine no longer PARKS. A cold boot walks
    // 13 -> 2 -> 12 -> 9 -> 1 -> 5 at +1, +302, +574, +878, +1182, +1918, and arm 5's own
    // $10 + $960 - 1 = 2,415 frames then hand it back to arm 2 at +4,334 through
    // teardown25A9B2 -- an attract loop that cycles every 4,032 frames with no coin in it.
    [8, slotObject(objSlot8, rom)],
    [9, slotObject(slot9.objSlot9, rom)],
    // W387. $240F62[12] = $28F3AC, priority $0009 (read out of $240FC6, not carried as a
    // literal) -- the NAME-ENTRY screen (src/objslot12.js),
    // and REGISTERING IT IS WHAT CLOSES THE FRONT-END LOOP. Slot [14] stages dispatch type $C at
    // +4,414 of a real cold boot and, until this entry existed, `$240FC2` was a counted note once
    // per frame from that frame to the end of time: the machine reached a screen with no handler
    // and stayed there. Its state 1 finds `$8130CC` empty -- nobody owes a name -- and falls into
    // `$28F368`, which stages dispatch type 8, the ATTRACT SEQUENCER. attract -> coin -> play ->
    // game over -> attract, closed.
    //
    // PARTIAL, AND IT SAYS SO. The SPINE is transcribed ($28F2BA, $28F368, $28F3AC and the two
    // per-side heads) and it makes ~700 lines of already-ported name-entry body in
    // `src/hiscorename.js` reachable for the first time -- W301 through W382 wrote it and nothing
    // ever called it. Three draw routines below it ($28FAF4, $28FB8A, $28FC36) and the clear
    // `$259C4A` are counted notes with measured extents. NONE of them is on the cold-boot path:
    // w387slot12.test.js asserts the note set added by this entry is EMPTY on a real boot.
    [12, slotObject(objSlot12, rom)],
    [13, slotObject(objSlot13, rom)],
    // W375. $240F62[14] = $288C6C, priority $0014 -- the TRANSITIONAL object (src/objslot14.js): it
    // draws ONE sprite through $23DECE from a rank-selected table, and when its $012C counter passes
    // zero it stages a create of dispatch type $C and kills itself. PORTED IN W372 and REGISTERED
    // HERE IN W375 -- it was the first front-end slot written and the one W374's registration pass
    // missed, so for three waves it was correct code the driver could not reach.
    //
    // ITS STATE 0 READS `ctx.videoRegs` AND `ctx.tx` UNGUARDED, which `Game#ctx()` does not carry
    // under those names (it has `video` and `txvram`). That is the same shape slots [9] and [17]
    // already have -- `clearTx23C622(ctx.tx)` in both -- so registering [14] adds no new exposure;
    // the front end reaching state 0 from the driver is one gap for all three, not one per slot.
    [14, slotObject(objSlot14, rom)],
    [15, slotObject(objSlot15, rom)],
    // Slot [17] is the ONE that needs more than the adapter. `phase7_25D560`'s draw tail takes its
    // seven draws as injected data (`ctx.selectDraws`) rather than importing them, because
    // `objslot9.js` already imports `objslot17.js`. Seed it ONCE, in place, rather than spreading
    // `ctx` -- a fresh object per frame would silently drop anything a subsystem writes onto `ctx`
    // itself. `??=` so a caller that supplies its own set (the tests do) still wins.
    [17, (ram, slot, _slotIndex, ctx) => {
      if (ctx) ctx.selectDraws ??= slot9;                // the namespace IS the keyed set
      return objSlot17(ram, rom, slot, ctx);
    }],
    // W503. $240F62[$13] = $28EE88, priority $001E. Stage 5's result F8 arm
    // creates this ending-tally object and leaves type 6 parked in state $15.
    // The handler preserves remaining lives on loop 1, drains the loop-2 life
    // and item bonuses, waits for the $28D8C4 chain, then stages type 7.
    [19, makeStage5Ending(rom)],
  ]);
}

/** Adapt a front-end slot dispatcher to `runObjectDriver`'s `(ram, slot, slotIndex, ctx)` call.
 *  All seven ([7], [8], [9], [13], [14], [15], [17]) take `(ram, rom, a5, ctx)` and none reads
 *  the index. */
function slotObject(fn, rom) {
  return (ram, slot, _slotIndex, ctx) => fn(ram, rom, slot, ctx);
}

export class Game {
  #cabinetFrontend = false;
  #runaheadHandlers = null;
  #runaheadVideo = null;
  #runaheadExternalState = null;

  /**
   * @param seed     Uint8Array(0x20000) -- a snapshot of the board's main RAM
   *                 at a sample point, taken by `frame.lua`'s PROBE_RAMDUMP.
   * @param tables   the JSON from tools/export-tables.py.
   * @param opts     { videoFrame, logicFrame, budgetUnits }
   */
  constructor(seed, tables, opts = {}) {
    this.ram = new Ram(seed);
    // WAVE 8: the cartridge, as a set of declared windows.  The shot spawn
    // follows pointers out of a ROM template, so the port reads ROM the way the
    // 68000 does and throws BY ADDRESS on anything the exporter did not cover.
    this.rom = opts.rom ?? new RomWindows(tables.rom);
    this.tables = new MoveTables(tables, this.rom);
    this.gov = Object.fromEntries(
      Object.entries(tables.gov).map(([k, v]) => [k, v.words]));
    this.budget = new WorkBudget(opts.budgetUnits);
    // WAVE 12: the $500000 latch, PER GAME rather than per module.  A module
    // global would be shared state between two replays and NOTES-replay.md §2
    // forbids exactly that -- state derives from (initial state, input words)
    // and nothing else.  See src/protsim.js for what it is and is not.
    this.prot = new ProtLatch();
    this.unportedLog = new UnportedLog();
    this.order = new ObjOrder();
    // WAVE 13.  $900000, the BG tilemap ring, and the IGS023 scroll registers.
    // Neither is main RAM, so neither can live in `this.ram`; both are PER GAME
    // for the reason `prot` is (NOTES-replay.md §2 -- state derives from
    // (initial state, input words) and nothing else).  `bgSeed` is the board's
    // own ring at the seed frame: without it the port would draw fifteen
    // columns into an empty ring and the other forty-nine would be blank.
    this.vram = new BgVram(opts.bgSeed);
    this.slotTable = new SlotTable907000();
    // W115: `$904000`, the TX (text) tilemap.  Starts BLANK -- the score-digit
    // flush `$185DC4` (ISR6-gated) writes the P1/P2 score cells into it each
    // frame; the OTHER text (lives, bombs, credits, chain-high-water) still
    // goes through the unported `$240DC2` / `$141258` path, so those cells
    // stay zero (transparent) until Wave C'.  PER GAME, like `vram` and
    // `video`, for NOTES-replay.md §2's reason.
    this.txvram = new TxVram();
    this.video = opts.video ?? new VideoRegs();
    this.#runaheadVideo = opts.video == null ? this.video : null;
    this.scrollEvents = [];
    this.bgMutate = opts.bgMutate ?? null;
    this.handlers = opts.handlers
      ?? defaultHandlers(this.rom, this.vram, { mutate: opts.bgMutate ?? null });
    this.#runaheadHandlers = opts.handlers == null ? new Map(this.handlers) : null;
    // Seeded, not counted from zero: the port starts mid-game, and a counter
    // that started at 0 would compare against nothing.
    this.logicFrame = opts.logicFrame ?? 0;
    this.videoFrame = opts.videoFrame ?? 0;
    this.irq6Count = 0; this.releases = 0; this.objn = 0;
    // THE SEED IS TAKEN INSIDE THE ARM'S WRITE TAP, so the byte in the dump is
    // the PRE-arm 0, not the 1 the instruction is about to store: `frame.lua`
    // reads main RAM from the tap callback and a 68000 write tap fires before
    // the value lands.  Restoring it here is not a fudge -- without it the
    // port's first IRQ6 finds a zero semaphore, takes the (A) gate and reports
    // `rel=0` against the board's 1, which is exactly what the first run of
    // this comparison did.  $23C212 always writes 1; the governor can raise it
    // afterwards, and `irq6` being a compared column is what would catch that.
    this.armedVblanks = opts.seedArm ?? 1;
    this.ram.setU8(RAM.semaphore, this.armedVblanks);
    // W375 -- THE COIN PORT, `$C08004`, RAW AND ACTIVE LOW. A PUBLIC FIELD the
    // caller writes before each `step()` (the page does it in `Demo.step`), not
    // a `step()` argument: see this file's header for why the signature cannot
    // grow a second per-frame word without a `.replay` format bump.
    //
    // `$FFFF` IS NOTHING PRESSED, and it is the default for a reason -- a
    // harness that never assigns this (every existing test, `tools/replay.mjs`,
    // the headless runner) sees exactly the coin behaviour it saw before this
    // wave: no edges, no taps, no credits. Until now `isr.js:51` read
    // `ctx.coinPort ?? COIN.idle` and NOTHING ANYWHERE SET IT, so the port was
    // idle forever and an inserted coin could not reach `$80395A`.
    this.coinPort = COIN.idle;
    // ...and the PULSE ADVANCE that must run in lockstep with the debounce.
    // `src/web/input.js`'s `currentCoinWord()` is deliberately PURE, because
    // `$13CFBA` reads the port every video frame and `$13CEC8` reads it every
    // TWO -- advancing inside the read would make the answer depend on who
    // asked last. `tickCoinPulse` is the advance, and `step()` calls this hook
    // at the ONE site `coinDebounce13CEC8` is called, never anywhere else.
    // Optional: null in every headless caller, which drives `coinPort` directly.
    this.coinTick = opts.coinTick ?? null;
    // Optional per-Game host seams. They carry no catalogue knowledge: a caller
    // either supplies a function or the simulation has no callback at all.
    if (opts.beeRecordHook != null) {
      if (typeof opts.beeRecordHook !== 'function') {
        throw new TypeError('Game beeRecordHook must be a function');
      }
      this.beeRecordHook = opts.beeRecordHook;
    }
    if (opts.bulletSpeedTransform != null) {
      if (typeof opts.bulletSpeedTransform !== 'function') {
        throw new TypeError('Game bulletSpeedTransform must be a function');
      }
      this.bulletSpeedTransform = opts.bulletSpeedTransform;
      installBulletSpeedTransform(this.ram, opts.bulletSpeedTransform);
    }
    for (const name of [
      'bulletSpawnHook',
      'bulletRetireHook',
      'playerWeaponHook',
      'playerWeaponActiveHook',
      'playerSpriteFilter',
      'playerGrazeHook',
      'playerDamageTransform',
      'lethalHitHook',
      'deathPositionCapture',
      'respawnPositionTransform',
      'playerPositionTransform',
      'objectDriverHook',
      'enemyDeathHook',
      'friendlyBulletConvertHook',
      'enemyBulletCollisionFilter',
      'scoreAddendTransform',
      'stageScriptInstallHook',
      'backgroundRepeatRestoreHook',
      'stageAdvanceTransform',
      'cabinetRunStartHook',
      'cabinetRunEndHook',
      'virtualSpriteRequestHook',
      'privateDamageTailHook',
    ]) {
      if (opts[name] == null) continue;
      if (typeof opts[name] !== 'function') {
        throw new TypeError(`Game ${name} must be a function`);
      }
      this[name] = opts[name];
    }
    if (this.bulletSpawnHook) installBulletSpawnHook(this.ram, this.bulletSpawnHook);
    if (this.scoreAddendTransform) {
      installScoreAddendTransform(this.ram, this.scoreAddendTransform);
    }
    this.#runaheadExternalState = opts[RUNAHEAD_EXTERNAL_STATE] ?? null;
    if (this.#runaheadExternalState != null) {
      const external = this.#runaheadExternalState;
      if (typeof external.save !== 'function' || typeof external.restore !== 'function'
          || !external.callbacks || typeof external.callbacks !== 'object') {
        throw new TypeError('Game runahead external state adapter is invalid');
      }
      for (const [name, callback] of Object.entries(external.callbacks)) {
        if (typeof callback !== 'function' || this[name] !== callback) {
          throw new TypeError(`Game runahead callback ${name} does not match its adapter`);
        }
      }
    }
    this.wallHits = [];
    this.allocEvents = new Map();
    this.bulletSpawns = new Map();   // WAVE 30, see #ctx()'s bulletSpawn
    this.bulletKinds = new Map();    // WAVE 33, see #ctx()'s bulletKind
    this.effectSpawns = new Map();   // WAVE 54, see #ctx()'s effectSpawn
    this.itemSpawns = new Map();     // WAVE 61, see #ctx()'s itemSpawn
    this.itemCollects = new Map();   // WAVE 61, see #ctx()'s itemCollect
    this.stageEndEvents = [];        // WAVE 62, see #ctx()'s bossEvent
    this.hudEvents = new Map();      // WAVE 63, see #ctx()'s hudEvent
    this.bombEvents = new Map();     // WAVE 64, see #ctx()'s bombEvent
    this.bombMarks = [];
    this.bombHits = 0;
    // WAVE 65 -- `$2456A6`'s three pools, kept apart because they are three
    // different laws (`$208` once, `$1E0` to everything, ERASE).
    this.beamHitsA = 0; this.beamHitsB = 0; this.beamErased = 0;
    this.beamDamageFrames = 0;
    this.bombDraws = 0;
    this.hudMarks = [];
    this.kills = { n: 0, score: 0, byValue: new Map() };  // WAVE 34, killEvent
    this.shotSpawns = new Map();
    this.shotTableFull = 0;
    this.frameRequests = [];        // bucket offsets from COMPARED slots
    this.frameRequestsOther = [];   // ...and from the option pods'
    this.shotRequests = 0;
    this.frozen = FROZEN_GLOBALS.map(([a, why]) => ({
      addr: a, value: this.ram.u16(a), why,
    }));
    // WAVE A (SOUND) -- the cue post/queue. PER GAME for NOTES-replay.md's
    // reason (state derives from initial state + input only). The ring, head,
    // tail, master volume and debounce counters all live in main RAM (seeded by
    // the snapshot, exactly as every other RAM field is); this object owns only
    // the shadow/log/digest triple the sound gate compares per frame. See
    // src/sound.js for the engine and the byte-exactness claim.
    this.sound = new SoundState();
    if (opts.soundSink != null && typeof opts.soundSink.command !== 'function') {
      throw new TypeError('Game soundSink must expose command(input)');
    }
    // Policy-neutral ownership boundary. Game produces one compact mailbox
    // command after its real drain. The host advances the independent Z80 and
    // ICS2115 clock, including periods in which the 68000 logic is waiting.
    this.soundSink = opts.soundSink ?? null;
    this.soundInput = new Uint8Array(0);
    // WAVE 91 -- THE PALETTE, and it is PER GAME for the same reason `prot` and
    // `vram` are (NOTES-replay.md §2).  Until this wave the port modelled none
    // of it and every sprite on the page was coloured by one frozen instant of
    // `capture.bin`; `src/palette.js`'s header is the whole subsystem.
    this.palette = new PaletteState();
    // ...and the catch-up.  The stage's OBJECT STREAM is the palette installer
    // and the seed resumes mid-stage, so the entries the board already consumed
    // are replayed OUT OF THE CARTRIDGE before the first frame.  It takes one
    // integer from the recording (how far the cursor had advanced) and every
    // byte of colour from the ROM -- see catchUpObjectStream's own header, and
    // §2 of `docs/worklog/ddpdoj/91-impl-sprite-palette.md` for why that is a
    // weaker bargain than the `bgSeed` this constructor already accepts.
    if (opts.palCatchUp !== false) {
      catchUpObjectStream(this.ram, this.rom, this.palette,
        { note: (a, w) => this.unportedLog.note(a, w) });
      // WAVE 92 -- THE BACKGROUND THIRD, and it is one call with no cursor in
      // it: `$2611C4 moveq #$0,D0 / moveq #$1F,D1 / jsr $2415E8` inside the
      // scroll VM's per-stage init, 32 banks from the cartridge block
      // `$261252[$813096]`.  That init ran before the seed and will never run
      // here, so it is replayed for the same reason the object stream is --
      // and this one takes NOTHING from the recording, not even an integer.
      catchUpBgPalette(this.ram, this.rom, this.palette,
        { note: (a, w) => this.unportedLog.note(a, w) });
      // WAVE 93 -- ELEVEN of the fifteen TEXT banks.  The reset path
      // `$23BF86..$23BFCC` contributes five unconditional installs in `$23BEEA`,
      // which both `$23B7D8` (cold) and `$23B7F2` (warm) jmp to.  The machine
      // cannot be mid-stage-1 without having run them.
      //
      // The seed's active state>0 type-$0A object separately proves `$2605C8`'s
      // initializer chain ran.  Catch-up therefore replays its eleven entries:
      // ten direct installs plus bank 13 through `$260704 -> $288574 -> $288590`.
      // Banks 0..4 overlap the reset list, leaving eleven unique sourced banks:
      // 0..8, 11, and 13.  Banks 9, 10, 12, and 14 remain the recording's.
      catchUpTextPalette(this.ram, this.rom, this.palette,
        { note: (a, w) => this.unportedLog.note(a, w) });
      // The first flush, so the port has a palette before frame 1 rather than
      // one frame late.  $23C454 runs it once per loop iteration and the board
      // had run it thousands of times before the seed was taken.
      //
      // W92: THIS ALSO RUNS `$241404` ONCE, which is a frame of the background
      // fade the board had already run -- so the port's four animated words are
      // one step ahead of the recording's frame 0 and level with its frame 1.
      // That is stated rather than corrected: correcting it would mean winding
      // `$80FA6C` backwards by a step the seed does not carry, which is
      // inventing state to make a number look better.  `92-impl` §4.3.
      flush24133C(this.ram, this.palette);
    }
  }

  /** The context every ported routine gets.  No clock is reachable from it. */
  #ctx(speculative = false) {
    const installedPrivateShotHook = /** @type {any} */ (this).privateShotObjectHook;
    const privateShotObjectHook = installedPrivateShotHook
      ? (invokingCtx) => installedPrivateShotHook(this, invokingCtx)
      : null;
    const installedPrivateOptionHook = /** @type {any} */ (this).privateOptionObjectHook;
    const privateOptionObjectHook = installedPrivateOptionHook
      ? () => installedPrivateOptionHook(this)
      : null;
    const installedPrivateSegmentHook = /** @type {any} */ (this).privateSegmentDriverHook;
    const privateSegmentDriverHook = installedPrivateSegmentHook
      ? () => installedPrivateSegmentHook(this)
      : null;
    const installedPrivateBeamDrawHook = /** @type {any} */ (this).privateBeamDrawHook;
    const privateBeamDrawHook = installedPrivateBeamDrawHook
      ? () => installedPrivateBeamDrawHook(this)
      : null;
    const installedPrivateDamageHook = /** @type {any} */ (this).privateDamageTailHook;
    const privateDamageTailHook = installedPrivateDamageHook
      ? (invokingCtx) => installedPrivateDamageHook(this, invokingCtx)
      : null;
    const installedPrivateReceiptHook = /** @type {any} */ (this).privateDamageReceiptHook;
    const privateDamageReceiptHook = installedPrivateReceiptHook
      ? (event) => installedPrivateReceiptHook(this, event)
      : null;
    const installedPrivateScoreEventHook = /** @type {any} */ (this).privateScoreEventHook;
    const privateScoreEventHook = installedPrivateScoreEventHook
      ? (event) => installedPrivateScoreEventHook(this, event)
      : null;
    const installedPrivateScoreFrameHook = /** @type {any} */ (this).privateScoreFrameHook;
    const privateScoreFrameHook = installedPrivateScoreFrameHook
      ? (event) => installedPrivateScoreFrameHook(this, event)
      : null;
    return {
      tables: this.tables,
      rom: this.rom,
      prot: this.prot,          // WAVE 12: the $500000 latch, on the ship's own
                                // draw path through $24A5B6 (src/protsim.js)
      ...(this.beeRecordHook ? { beeRecordHook: this.beeRecordHook } : {}),
      ...(this.bulletSpeedTransform
        ? { bulletSpeedTransform: this.bulletSpeedTransform } : {}),
      ...(this.bulletSpawnHook ? { bulletSpawnHook: this.bulletSpawnHook } : {}),
      ...(this.bulletRetireHook ? { bulletRetireHook: this.bulletRetireHook } : {}),
      ...(this.playerWeaponHook ? { playerWeaponHook: this.playerWeaponHook } : {}),
      ...(this.playerWeaponActiveHook
        ? { playerWeaponActiveHook: this.playerWeaponActiveHook } : {}),
      ...(this.playerSpriteFilter ? { playerSpriteFilter: this.playerSpriteFilter } : {}),
      ...(this.playerGrazeHook ? { playerGrazeHook: this.playerGrazeHook } : {}),
      ...(this.playerDamageTransform
        ? { playerDamageTransform: this.playerDamageTransform } : {}),
      ...(this.lethalHitHook ? { lethalHitHook: this.lethalHitHook } : {}),
      ...(this.deathPositionCapture
        ? { deathPositionCapture: this.deathPositionCapture } : {}),
      ...(this.respawnPositionTransform
        ? { respawnPositionTransform: this.respawnPositionTransform } : {}),
      ...(this.playerPositionTransform
        ? { playerPositionTransform: this.playerPositionTransform } : {}),
      ...(this.objectDriverHook ? { objectDriverHook: this.objectDriverHook } : {}),
      ...(privateShotObjectHook ? { privateShotObjectHook } : {}),
      ...(privateOptionObjectHook ? { privateOptionObjectHook } : {}),
      ...(privateSegmentDriverHook ? { privateSegmentDriverHook } : {}),
      ...(privateBeamDrawHook ? { privateBeamDrawHook } : {}),
      ...(privateDamageTailHook ? { privateDamageTailHook } : {}),
      ...(privateDamageReceiptHook ? { privateDamageReceiptHook } : {}),
      ...(privateScoreEventHook ? { privateScoreEventHook } : {}),
      ...(privateScoreFrameHook ? { privateScoreFrameHook } : {}),
      ...(this.enemyDeathHook ? { enemyDeathHook: this.enemyDeathHook } : {}),
      ...(this.friendlyBulletConvertHook
        ? { friendlyBulletConvertHook: this.friendlyBulletConvertHook } : {}),
      ...(this.enemyBulletCollisionFilter
        ? { enemyBulletCollisionFilter: this.enemyBulletCollisionFilter } : {}),
      ...(this.stageScriptInstallHook
        ? { stageScriptInstallHook: this.stageScriptInstallHook } : {}),
      ...(this.backgroundRepeatRestoreHook
        ? { backgroundRepeatRestoreHook: this.backgroundRepeatRestoreHook } : {}),
      ...(this.stageAdvanceTransform
        ? { stageAdvanceTransform: this.stageAdvanceTransform } : {}),
      ...(this.cabinetRunStartHook
        ? { cabinetRunStartHook: this.cabinetRunStartHook } : {}),
      ...(this.cabinetRunEndHook
        ? { cabinetRunEndHook: this.cabinetRunEndHook } : {}),
      // WAVE 57: the BG videoram, because an ENEMY HANDLER writes it.  Type
      // $1C ($26C20C, what the midboss's death spawns) copies 23 x 9 map
      // longwords into $9000xx -- the same array `$240D9A` writes through
      // `writeMapLong`.  It is the first handler in this port that is not a
      // sprite producer, and a caller that omits `vram` reaches a loud named
      // throw at $26C226 rather than dropping 207 longwords.
      vram: this.vram,
      // W375, THE SAME OBJECT UNDER THE FRONT END'S NAME, and for the same
      // reason `tx` and `videoRegs` are below. `ctx.bgVram?.clear23C638?.()` is
      // how slot [14]'s state 0 clears the BG tilemap ($288BDA jsr $23C638,
      // objslot14.js:40) and how `screenWipe23C6C6` tails out ($23C650,
      // background.js:1610) -- which is slot [7]'s state 0. Both reads are
      // GUARDED, so before this alias the clear silently never ran: the same
      // defect as `tx`/`videoRegs`, only quiet instead of fatal.
      // PROVEN THE SAME OBJECT, not a same-named lookalike: `clear23C638()` is
      // `BgVram`'s own zero-argument method (background.js:214, `this.w.fill(0)`)
      // and `stageend.js:513` already calls it as `ctx.vram.clear23C638()` off
      // this very key. `BgVram#setLong(row, col, v)` and `TxVram#setLong(addr, v)`
      // are the pair with the same name and different signatures; nothing on this
      // path touches either.
      bgVram: this.vram,
      // The newly modeled $907000 table and full cabinet presentation belong to a real
      // $23BEEA boot lifecycle. Seeded probes and replays never executed that reset and retain
      // their exact pre-W621 front-end contract when an ending later hands back to type 8.
      ...(this.#cabinetFrontend ? {
        cabinetFrontend: true,
        slotTable: this.slotTable,
      } : {}),
      // W115: the TX tilemap, because the ISR6-gated score-digit flush
      // `$185DC4` writes the P1/P2 score cells into it.  A caller that omits
      // it (every main-loop handler) does not reach the flush; the flush is
      // dispatched from `irq6`, which reads `ctx.txvram` itself.
      txvram: this.txvram,
      // W375, THE SAME OBJECT UNDER THE FRONT END'S NAME. `clearTx23C622(ctx.tx)`
      // is how three of the six front-end slots open their state 0 -- [9]
      // ($25C9A0), [14] ($288BD4) and [17] ($25CDC0) -- and `txString25A14C(ctx.tx,
      // ..)` is how [9] ($25D1AC) and [17] ($25D3DC) write their labels. All of
      // them read `ctx.tx` UNGUARDED, so from the frame W374/W375 registered
      // those slots in `defaultHandlers` each one threw
      // "Cannot read properties of undefined (reading 'setLong')" the moment it
      // reached state 0 (measured, driven through `runObjectDriver`).
      // An ALIAS, not a rename: `irq6` dispatches the score-digit flush off
      // `ctx.txvram` itself and twenty-eight other reads use that name, so
      // renaming would move a one-key gap into every subsystem. `clearTx23C622`
      // and `txString25A14C` only ever call `TxVram#setLong`, which is what
      // `this.txvram` is -- the SAME object, so a write through either name is
      // visible through the other.
      tx: this.txvram,
      // colour banks -- the scroll VM's object stream ($2620F2), the bomb
      // ($260852/$26085C), three enemy init bodies, the boss and the stage
      // banner.  A caller that omits it gets the counted note it always had
      // rather than a silently missing install, which is the difference
      // between "this bank is the recording's" and "this bank is wrong".
      palette: this.palette,
      unportedLog: this.unportedLog,
      // W375, THE SAME LOG UNDER THE FRONT END'S NAME. The six front-end slot
      // files call `ctx.unported?.note(..)` at about thirty sites, and until this
      // line every one of them was a NO-OP from the driver: `#ctx()` carried the
      // log only as `unportedLog` (the name twenty-eight reads elsewhere use) and
      // only `enemyframe.js:118` re-aliased it with `{...ctx, unported:
      // ctx.unportedLog}`. So the mechanism that keeps an unported callee
      // COUNTABLE rather than an invisible skip -- the whole point of
      // src/unported.js -- was switched off for exactly the six files W374/W375
      // connected to the driver. An ALIAS, not a rename: `unportedLog` stays.
      unported: this.unportedLog,
      // WAVE A (SOUND). Post a cue by wrapper address -- the one-for-one
      // replacement for the counted `note(ctx, 0x28Cxxx, ...)` placeholders the
      // sound wave removes. Runs the gate, tail, packer and ring enqueue from
      // src/sound.js; returns true if the cue posted. See sound.js.
      soundPost: (addr) => {
        // EVERY ADDRESS GOES STRAIGHT THROUGH, and an unmapped one THROWS.
        //
        // W375 briefly guarded `$18B0D6` here: all three of `$13CFBA`'s arms
        // called `ctx.soundPost(COIN.arms.hook)` with an address `sound.js` maps
        // in neither `WRAPPERS` nor `STREAMING_LEAVES`, so the first credited
        // coin threw before ever reaching `coinage13CE22`. That guard is GONE and
        // the fix is at the call site: `isr.js`'s `coinHook18B0D6` counts the
        // hook with `unported.note()` under its own ROM address, exactly as
        // `irq6` already counted the neighbouring `$18ACC0`. A BIOS-range routine
        // nobody has read is an UNPORTED CALL, not a sound post that needs
        // special handling at the sound boundary.
        //
        // Nothing narrows the throw any more, and nothing should: an unmapped
        // wrapper is a loud gap, not a silent drop (sound.js:366). A guard here
        // would hide the next call site that gets the address wrong.
        //
        // `$28CAFC->$28B884` synchronously installs the selected score group
        // before the leaf posts its ordinary four-byte door. Keep that side
        // effect ordered at the sound boundary; it is not a fifth payload byte.
        return postWrapperWithRuntime(
          this.ram,
          this.sound,
          speculative ? null : this.soundSink,
          addr,
        );
      },
      // W426 -- THE SIBLING API, AND THE REASON THE ADDRESS-ONLY ONE CANNOT
      // CARRY IT. `$28C186` is `$28C170`'s twin in the `$28BBAC` tier, except
      // that `$28C170` loads BOTH registers (`move.w #$15,D0 / moveq #0,D1`)
      // while `$28C186` loads only D0 (`move.w #$16,D0`) and falls into
      // `jsr $28BBAC` with the CALLER's D1. An address is therefore the whole
      // command for one of them and only half of it for the other, so
      // `soundPost` refuses `$28C186` (sound.js `postWrapper`) rather than
      // defaulting D1 to 0, and this key is where the other half arrives.
      //
      // NO `soundSink` HOP. `postWrapperWithRuntime`'s extra step exists purely
      // to pre-select a streaming score GROUP for `STREAMING_LEAVES`; this tier
      // has no group, no id, no pan and no channel -- the packed word is the
      // entire payload -- so going straight to `postBgmCommand` is the faithful
      // call, not a shortcut. An address that is not in this tier throws there,
      // loudly, exactly as an unmapped wrapper throws above.
      //
      // Three call sites in the whole image, all measured: `$291FAA`
      // (objslot15) and `$28DE70` (stageend) are `moveq #0,D1`; `$2621CC`
      // (background's scroll VM) is `move.w (A2)+,D1` off the stage script.
      soundPostD1: (addr, d1) => postBgmCommand(this.ram, this.sound, addr, d1),
      // WAVE 8: every record the shot spawn creates, and every frame it could
      // not.  Printed by the runner for the same reason `allocEvents` is: a
      // spawn that silently did nothing is indistinguishable from a spawn that
      // was never called.
      shotSpawn: (kind, addr) => {
        this.shotSpawns.set(kind, (this.shotSpawns.get(kind) ?? 0) + 1);
        if (kind === 'secondary-full') this.shotTableFull++;
        void addr;
      },
      // Bucket offsets appended by ONE shot slot, so the gate's containment
      // check can be restricted to the ten records it also compares byte for
      // byte.  Slots 0..12 are the OPTION PODS' shots -- created by $24D484,
      // which is unported -- and the port's copies of them are stale the moment
      // the board respawns one; including their requests would make the check
      // red for a reason that is not a defect, and excluding them silently
      // would make it meaningless.  So they are excluded BY NAME and counted.
      shotRequests: (player, slot, from, to) => {
        if (to === from) return;
        const compared = player === 0
          && ((slot >= PLAYER_SLOTS.primary[0] && slot <= PLAYER_SLOTS.primary[1])
            || (slot >= PLAYER_SLOTS.secondary[0] && slot <= PLAYER_SLOTS.secondary[1]));
        for (let o = from; o < to; o += 12) {
          (compared ? this.frameRequests : this.frameRequestsOther).push(o);
        }
      },
      // W375 -- THE COIN PORT, read by `irq6` -> `coinRead13CFBA` ($13CFBA,
      // IRQ6's FIRST call). It is a SEPARATE key from the `portWord` argument
      // on purpose: `$C08000` is the PLAYER port and `$C08004` is the coin one,
      // and `$13CFBA` does its own `lea $C08004,A0`. Handing it `portWord`
      // credits a coin whenever a player holds a button in the `$E0` mask,
      // which is how that defect was caught (isr.js:48).
      coinPort: this.coinPort,
      // W519: slot [14] calls the shared $242E24 draw once per visible frame. The
      // existing function advances the authentic shared counter and reads the declared
      // 128-byte cartridge table; exposing it here removes the old zero-rank fallback.
      rankByte: drawByte242E24,
      budget: this.budget,
      order: this.order,
      // WAVE 13.  The video registers the ISR6-gated $140FFE uploads, and the
      // scroll VM's own event log: every SPAWN, BGELEM, CUE and FLAG the
      // program executed, with the record's clock value.  The events are what
      // makes "the port skipped an opcode" visible -- an unported CALLEE is
      // counted in unportedLog, but WHICH record reached it is here.
      video: this.video,
      // W375, the same object under the front end's name, and for the same
      // reason `tx` is above. `resetScrolls23C61E(ctx.videoRegs)` is slot [14]'s
      // very first instruction ($288BCE) and `screenWipe23C6C6` (slot [7]'s
      // state 0, $23C6C6) opens with it too. Both read `ctx.videoRegs`
      // UNGUARDED, so registering [14] made it throw "Cannot set properties of
      // undefined (setting 'tx_yscroll')" on its first frame (measured).
      // `resetScrolls23C61E` writes exactly `tx_yscroll`, `tx_xscroll`,
      // `bg_yscroll` and `bg_xscroll` -- four `VideoRegs` fields, which is what
      // `this.video` is. An ALIAS, not a rename: the scroll VM and the ISR6
      // upload path read `ctx.video`.
      videoRegs: this.video,
      bgMutate: this.bgMutate,
      scrollEvent: (e) => {
        this.scrollEvents.push({ lf: this.logicFrame, ...e });
      },
      wallHit: (addr, which) => {
        // $261126: `tst.w $81317A / beq -> rts; else clr.w $81316C`.  Ported
        // exactly, and recorded, because "the ship pinned the wall" is the
        // event the fly-around scenario exists to compare.
        this.wallHits.push({ lf: this.logicFrame + 1, which });
        if (this.ram.u16(0x81317a) !== 0) this.ram.setU16(0x81316c, 0);
      },
      // WAVE 5: the allocator is ported (src/objalloc.js).  Every non-OK
      // outcome -- create-queue full, no slot low enough, slot 19 evicted by a
      // priority insert, kill queue full -- is COUNTED and printed, because the
      // brief calls allocation failure gameplay and a silently-handled failure
      // is exactly what that sentence forbids.
      allocEvent: (kind, n) => {
        this.allocEvents.set(kind, (this.allocEvents.get(kind) ?? 0) + n);
      },
      // WAVE 33.  The ENEMY spawn's own outcomes, counted for the same reason
      // and in the same map.  Two of the four are FAILURES the board also has
      // ($263748 band full, $263622 the sub-record run not fitting) and until
      // this wave the port could not see either -- which is how a sub-record
      // leak that discarded EVERY spawn from lf2906 onwards survived four
      // waves with green gates.  A drop that is real must still be visible.
      spawnEvent: (kind, type) => {
        const k = `spawn-${kind}`;
        this.allocEvents.set(k, (this.allocEvents.get(k) ?? 0) + 1);
        void type;
      },
      // WAVE 30.  Every ENEMY FIRE that reached a bullet generator, keyed by
      // the ROM address of the `jsr` that made it, with the per-core outcome
      // (spawned / declined by the freeze gate / DROPPED because the pool was
      // full).  Printed for the same reason `allocEvents` is: until this wave
      // no handler fire reached the pool at all, and "the fan ran and the pool
      // refused it" must not look the same as "the fan never ran".
      bulletSpawn: (site, res) => {
        const k = `$${site.toString(16).toUpperCase()}`;
        const e = this.bulletSpawns.get(k)
          ?? { fired: 0, spawned: 0, declined: 0, dropped: 0 };
        e.fired++;
        for (const r of (Array.isArray(res) ? res : [res])) {
          if (!r) continue;
          if (r.declined) e.declined++;
          else if (r.carry) e.dropped++;
          else e.spawned++;
        }
        this.bulletSpawns.set(k, e);
      },
      // WAVE 33.  Every BEHAVIOUR BODY that EXECUTED, keyed by the kind index
      // and carrying the address `$282030[kind]` resolved to.  `bulletSpawn`
      // above counts FIRES by call site and cannot answer W27 review F1, which
      // is a question about KINDS: 517,445 live-slot rows across every recorded
      // mover corpus contain only {3,4,5,6,7,12,13,19}, and no measurement in
      // this repo reported the port's own set.  The hook fires at `$281F0E`'s
      // `jsr (A1)` -- the ONE instant a behaviour body runs -- so it counts the
      // thing the finding is about and not a proxy for it.
      // WAVE 34.  Every `$28615E` -- A KILL -- with the score value its call
      // site carried.  `freeEnemy` cannot stand in for this: it also fires on
      // the off-screen exit every handler has, and "how many enemies did the
      // player destroy" and "how many records were recycled" are different
      // questions that this port answered with one number until now.
      killEvent: (d0, d1) => {
        this.kills.n++;
        this.kills.score += d0;
        this.kills.byValue.set(d0, (this.kills.byValue.get(d0) ?? 0) + 1);
        void d1;
      },
      bulletKind: (kind, addr) => {
        const e = this.bulletKinds.get(kind) ?? { addr, n: 0 };
        e.n++;
        this.bulletKinds.set(kind, e);
      },
      // WAVE 54.  `$288E4E`'s per-frame telemetry, published because THE POOL
      // CENSUS NEEDS TWO NUMBERS RAM DOES NOT KEEP.  `$81C8EA` counts records
      // that were live AND past their spawn delay when the driver visited them,
      // and the three frees never decrement it -- so an independent 80-slot
      // scan reconciles as `scan == $81C8EA - freed + delayed`, and `freed` and
      // `delayed` exist only inside the frame.  Kept as a plain field rather
      // than a callback because nothing in the port reads it.
      effectSink: (t) => { this.effectFrame = t; },
      /** Every `$289004` that returned a REAL slot, by kind and by call site.
       *  The bit-bucket returns are NOT here -- they go to `unportedLog` with
       *  their own address, which is the whole point of counting them. */
      effectSpawn: (kind, site) => {
        const k = `$${kind.toString(16).toUpperCase()}@$${site.toString(16).toUpperCase()}`;
        this.effectSpawns.set(k, (this.effectSpawns.get(k) ?? 0) + 1);
      },
      // WAVE 61 (I2), THE ITEM.  Same shape as the two above and for the same
      // reason: `$27E812` returning NULL (the pool was full, or the kind was
      // REFUSED) goes to `unportedLog` under its own address, so this map holds
      // only the allocations that produced a real slot -- which is what makes
      // `itemSpawns` minus the census's high-water mark a statement rather than
      // a restatement.
      // WAVE 62 (S1), THE STAGE END.  Two hooks, and they exist because every
      // link in the chain from the boss's timeout to `$25FD38` happens exactly
      // ONCE in a whole run: a counter that only ever reads 1 is useless, but
      // the FRAME each link fired on is the wave's entire result.  `bossEvent`
      // is `$294F5A`, `$293E16` and `$29291E`; `stageEndEvent` is `$25FCFA`,
      // `$25FD0C` and `$25FD38`.
      bossEvent: (kind, clk) => {
        this.stageEndEvents.push([kind, this.logicFrame, clk]);
      },
      stageEndEvent: (kind, v) => {
        this.stageEndEvents.push([kind, this.logicFrame, v]);
      },
      // WAVE 63 (B1).  The three events object type 0 produces that RAM does
      // not keep: `meter-` (a chain-meter decrement, `$284636`/`$2847D4`),
      // `meter0` (the frame it reached zero and `$284640`/`$284646` wiped the
      // two accumulators) and `extend` (`$284350 addq.w #$1` -- a free life).
      // A COUNT, because the whole point of this wave is that a chain the port
      // starts now expires: "the meter is 0" cannot distinguish a chain that
      // ran out from one that never started, and only the decrement can.
      hudEvent: (kind, who, v) => {
        const k = `${kind}/p${who + 1}`;
        this.hudEvents.set(k, (this.hudEvents.get(k) ?? 0) + 1);
        if (kind === 'meter0' || kind === 'extend') {
          this.hudMarks.push([kind, who, this.logicFrame, v]);
        }
      },
      // WAVE 64 (B2).  What the BOMB does that RAM does not keep.  `press` is
      // every press of Button 2 with its OUTCOME ('fired', 'fired+partner' or
      // one of the three refusals), `damage` the number of pool slots
      // `$24560A` hit on a frame, `phase` the script phase `$255E3E` moved
      // into, `teardown` the frame `$2564F0` ran and WHICH chains it reset,
      // and `cooldown-expired` `$2564BA`.  A count, because "the record is 0"
      // cannot distinguish a bomb that finished from one that never fired.
      // W65 adds the LASER BOMB's five: `beam-arm` (the `$243DA0` cancel, once
      // per press), `beam-init` (`$255FE2`'s install), `beam-phase`, and the
      // two PER-FRAME ones -- `beam-seg` (`$2561AA`'s drawn/killed) and
      // `beam-damage` (`$2456A6`'s poolA/poolB/bullets).  The per-frame ones
      // are counted and NOT marked, for the same reason `damage` is not.
      bombEvent: (kind, v) => {
        const k = `${kind}:${v}`;
        this.bombEvents.set(k, (this.bombEvents.get(k) ?? 0) + 1);
        if (kind !== 'damage' && kind !== 'draw'
          && kind !== 'beam-seg' && kind !== 'beam-damage') {
          this.bombMarks.push([kind, this.logicFrame, v]);
        }
        if (kind === 'damage') this.bombHits += v;
        if (kind === 'beam-damage') {
          const [a, b, e] = String(v).split('/').map(Number);
          this.beamHitsA += a; this.beamHitsB += b; this.beamErased += e;
          this.beamDamageFrames += 1;
        }
        if (kind === 'draw') this.bombDraws += 1;
      },
      itemSink: (t) => { this.itemFrame = t; },
      itemSpawn: (kind, site) => {
        const k = `$${kind.toString(16).toUpperCase()}@$${site.toString(16).toUpperCase()}`;
        this.itemSpawns.set(k, (this.itemSpawns.get(k) ?? 0) + 1);
      },
      /** Every item COLLECTED, by the player mask the collision wrote into the
       *  status word and by which of `$286128`'s two immediates it scored.
       *  `$10` is an ordinary pickup and `$1000` is one taken when the thing it
       *  grants was ALREADY AT MAXIMUM -- recon 59 §4.3's fork. */
      itemCollect: (mask, score) => {
        const k = `mask$${mask.toString(16).toUpperCase()}/score$${score.toString(16)}`;
        this.itemCollects.set(k, (this.itemCollects.get(k) ?? 0) + 1);
      },
    };
  }

  /** $23BE8C -- main-loop call #0. */
  #counters() {
    this.ram.setU16(RAM.frameCounter, u16(this.ram.u16(RAM.frameCounter) + 1));
    this.ram.bchg8(RAM.altPhase, 0);                                // $23BE92
    let p = u16(this.ram.u16(RAM.mod3Phase) + 1);                   // $23BE9A
    if (p === 3) p = 0;                                             // $23BEA0/$23BEAC
    this.ram.setU16(RAM.mod3Phase, p);
    // $23BEB2..$23BEE0 -- THREE derived phase counters, each a COPY of
    // $80390A followed by its own mask.  Wave 4 ported the first copy and none
    // of the three masks; `04-review.md` 4 measured the result ($803910 =
    // 3501 against the board's 1, $803912/$803914 never written).  The masks
    // are what stage and enemy scripts key off, so this is a wave-5 blocker,
    // not a tidy-up: `c3910`/`c3912`/`c3914` are compared columns from now on
    // and the fly-around scenario is RED without these three lines (measured --
    // see the worklog).
    const c = this.ram.u16(RAM.frameCounter);
    this.ram.setU16(RAM.frameCounterMod4, c & 0x3);    // $23BEB2 / $23BEBC
    this.ram.setU16(RAM.frameCounterMod8, c & 0x7);    // $23BEC4 / $23BECE
    this.ram.setU16(RAM.frameCounterMod16, c & 0xf);   // $23BED6 / $23BEE0
  }

  /** $23C212 -- main-loop call #5.  See framesync.js: it is a five-way
   *  decision with a dynamic governor, not an arm. */
  #frameSync() { return frameSync(this.ram, this.gov); }

  /**
   * ONE LOGIC FRAME.  `portWord` is the value the IRQ6 input read takes off
   * $C08000 -- one word per LOGIC frame, which is exactly what a replay
   * records (NOTES-replay.md constraint 3; measured input lead is ZERO).
   */
  saveRunaheadState(depth) {
    return saveRunaheadState(
      this,
      this.#runaheadHandlers,
      this.#runaheadVideo,
      this.#runaheadExternalState,
      depth,
    );
  }

  restoreRunaheadState(checkpoint) {
    restoreRunaheadState(this, checkpoint);
  }

  /**
   * Boots the front end from zeroed RAM and stores its setup result.
   *
   * @returns the frontend.js result record: which banks installed, what the
   *   section flag and the control register ended at, and the staged record.
   */
  boot({ cabinetFrontend = false } = {}) {
    assertRunaheadInactive(this, 'Game boot');
    /*
     * `$23BF74..$23BFDB` -- THE FRONT-END BOOT BLOCK, and the gap it closes.
     *
     * `hiscore.js` has exported `hiscoreDefaults28841E` since W301 and, until this
     * wave, **NOTHING IN `src/` CALLED IT**: fourteen test files did, and the port
     * did not. `tests/w375slot8.test.js:718` recorded that as "`Game#boot()` DOES
     * NOT DO THIS", which was true twice over -- there was no `boot()` at all. This
     * is it, and the factory table is its first instruction, because `$23BF74 jsr
     * $28841E` is the block's first instruction.
     *
     * **IT IS NOT CALLED FROM THE CONSTRUCTOR AND MUST NOT BE.** Every existing
     * caller hands `Game` a MID-GAME snapshot (`rip/web/seed.bin` and the `.replay`
     * fixtures), and `$28841E` overwrites `$803824..$8038B9` with the FACTORY
     * table. On a seed taken mid-attract that is a no-op only because the shipped
     * seed happens to hold the factory table (hiscore.js:355 measured exactly
     * that); on a seed taken after somebody scored it would silently rewrite the
     * board's own high scores and every column downstream of them. `boot()` is for
     * a caller that starts from ZEROED RAM, which is what a cold boot is. The production browser
     * passes `cabinetFrontend: true`; direct legacy fixtures omit it so their seeded presentation
     * and counted compatibility notes remain unchanged while still running this reset prologue.
     *
     * THE FALL-THROUGH IS `step()`. The block does not return on the board: it runs
     * off the end of `$23BFDB` into `$23BFDC`, the seven-call main loop, whose last
     * instruction is `$23C006 bra.s $23BFDC`. So `boot()` then `step()` repeatedly
     * IS `$23BF74`, whole, and the object it stages -- dispatch type 8 at state
     * `$D` -- is picked up by the very next `step()`'s `commitCreates`.
     */
    this.#cabinetFrontend = cabinetFrontend;
    const ctx = this.#ctx();
    // Main RAM is the board's NVRAM. The published browser starts with no saved
    // cabinet image, so provision the cartridge's own `$259512` factory block
    // through `$256FA6` before the reset reads coinage and continue policy.
    if (cabinetFrontend) operatorFactory256FA6(this.ram, this.rom);
    const reset = resetPrologue23BEEA(this.ram, this.rom, this.palette, ctx);
    this.bootResult = {
      ...bootFrontEnd23BF74(this.ram, this.rom, this.palette, ctx, true),
      reset,
    };
    return this.bootResult;
  }

  step(portWord) {
    const speculative = beginRunaheadStep(this);
    const ctx = this.#ctx(speculative);
    this.budget.beginFrame();
    this.irq6Count = 0; this.releases = 0;
    this.frameRequests = []; this.frameRequestsOther = [];

    // 1-3: the spin, the vblank(s) and the IRQ6(s).  `armedVblanks` of them:
    // the first armedVblanks-1 find the semaphore still non-zero and release
    // one count each; the LAST one drops it to zero and lets the loop out.
    for (let v = 0; v < this.armedVblanks; v++) {
      this.videoFrame++;
      this.irq6Count++;
      // W375 -- THE IRQ4 PHASE, and it is the ONLY route into `$13CEC8`.
      //
      // IRQ4 FIRES ONCE PER VIDEO FRAME, measured on this build: `MARK IRQ4
      // n=2617` against `MARK IRQ6 n=2617` over 1,901 logic frames
      // (docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md:47). So it
      // belongs in THIS loop, alongside the IRQ6 dispatch, and not once per
      // logic frame -- a dilated frame sees N vblanks and therefore N IRQ4s.
      //
      // BEFORE `irq6`, because that is the cartridge's order at the only rate
      // that can distinguish them: `$13CEC8` WRITES `$803968`/`$80396E` and
      // `$13CFBA` -> `$13CF86` READS AND CONSUMES them, so a tap finalised on
      // this video frame is credited on this video frame. Running the debounce
      // after the ISR would delay every credit by two video frames and would be
      // invisible in anything but a frame-exact comparison.
      //
      //   $1453B6  addq.w #$1,$80FA84
      //   $1453BC  andi.w #$1,$80FA84      <- and it WRITES BACK; the word is 0/1
      //   $1453C4  bne.w $1453DE           <- so the body runs on every OTHER IRQ4
      //   $1453C8  move.w #$1,$80FA82 / jsr $13CEC8 / move.w #$0,$80FA82
      //
      // `$80FA82` is the REENTRANCY GUARD at `$1453AC` and it gates NOTHING
      // here: there is no second context in a single-threaded port that could
      // re-enter, so writing 1 and then 0 around a synchronous call is a pair of
      // stores no reader could ever observe between. Transcribed as
      // `COIN.irq4Guard` in isr.js and deliberately not enforced -- honouring it
      // would be modelling a race this port cannot have.
      this.ram.setU16(COIN.irq4Phase, u16(this.ram.u16(COIN.irq4Phase) + 1));
      this.ram.setU16(COIN.irq4Phase, this.ram.u16(COIN.irq4Phase) & 0x1);
      if (this.ram.u16(COIN.irq4Phase) === 0) {              // $1453C4 bne -- SKIPPED unless 0
        coinDebounce13CEC8(this.ram, this.coinPort);         // $1453D0 jsr $13CEC8
        // THE CONTRACT (src/web/input.js:209): the pulse advances EXACTLY where
        // the debounce is called. Ticking it per video frame would halve the
        // hold the ROM counts; ticking it twice per call would quarter it, and
        // either way a held key credits at the wrong rate or not at all.
        if (!speculative) this.coinTick?.();
      }
      if (irq6(this.ram, portWord, ctx)) this.releases++;
    }
    if (this.ram.u8(RAM.semaphore) !== 0) {
      unreached(ROM.syncSpin, `the semaphore is still $${this.ram.u8(RAM.semaphore)
        .toString(16)} after ${this.armedVblanks} vblank(s); the port's spin `
        + `model and the arm value disagree`);
    }

    postVblankEdges(this.ram);                        // 4: $23D12A, call #6
    this.#counters();                                 // 5: $23BE8C, call #0
    this.unportedLog.note(ROM.call1, 'main-loop call #1 ($256D5A)');
    this.objn = runObjectDriver(this.ram, this.handlers, ctx);   // 7: $2410BC
    // WAVE 29.  What the two newly-wired subsystems did this frame, lifted off
    // the per-frame ctx so a runner can PRINT it.  A subsystem that did nothing
    // must be visible as having done nothing -- the bullet driver runs every
    // frame over a pool nothing fills yet, and `{cleared:0, live:0}` is how a
    // reader learns that without reading src/.
    this.enemyFrame = ctx.enemyFrame ?? null;    // {script, deferred, driven}
    this.bulletFrame = ctx.bulletFrame ?? null;  // {cleared, live}
    // WAVE 34.  What object type 5's TAIL did: `{hitsA, hitsB, anyShot}` from
    // `$244D62`, or `null` on the frames the tail took `$28B728 jmp $244D40`
    // (the player-box-only entry, which damages nothing).  Same reason as the
    // two above -- a subsystem that did nothing must be visible as having done
    // nothing, and the tail runs on ALTERNATE frames by `$80390C`, so `null`
    // is the ordinary answer half the time.
    this.damageFrame = ctx.damage ?? null;
    // WAVE 67.  How many bucket-12 records `$253604` appended this frame, 0..5
    // per live player.  Same reason as the three above -- a producer that did
    // nothing must be visible as having done nothing, and `$253604`'s whole
    // defect history is that "did nothing" and "was never called" looked the
    // same.  `tools/w67trailgate.mjs` reads this AND the bucket counter.
    this.trailRecords = ctx.trailRecords ?? 0;
    // WAVE 90.  How many LASER IMPACT EFFECTS ($289FC0/$289FDA) the beam draw
    // spawned this frame, 0..2. Same reason as the four above, and here it is
    // sharper than usual: the call site's middle gate is `$80390C`, the
    // per-frame alternation word, so **ZERO IS THE CORRECT ANSWER ON HALF THE
    // FRAMES A BEAM IS ON** and a reader who saw only a total could not tell
    // that from "it never fired". The owner's word for this is "sometimes".
    this.beamImpacts = ctx.beamImpacts ?? 0;
    this.animFrame = runAnimObjects24683E(this.ram, this.rom); // 8: $24683E
    // 9: call #4, $23D2AE, THE SPRITE LIST BUILD.  PORTED WHOLE in wave 11
    // (src/displaylist.js): the sum, the pre-emptive drop policy, the 29-bucket
    // drain with the equality cap and the abandon-the-tail carry, the emit with
    // its 32-bit `asr.l`/`add.l` pair and the OR-ed flip byte, the terminator
    // and the thirty-counter reset.
    //
    // WHAT IT DRAWS TODAY, corrected in wave 44: [M] EIGHT of the thirty
    // buckets carry records from the page's own seed -- 0 (THE ENEMIES, 14 to
    // 62 a frame), 2 and 3 (background elements and the midboss), 5 (the ship's
    // and the pods' ground shadows), 7, 14 (the shots, wave 8), 15 (the two
    // option pods) and 19 (THE SHIP, its aura and its glow).  This used to say
    // "twenty-six of the thirty still have no producer, so the list is those
    // four plus a terminator", which stopped being true at wave 29 and stayed
    // on the page until the list was finally drawn.  The transform itself is gated to the byte
    // by `pgm.py dlgate` and the four producers by `pgm.py shipgate`, both of
    // which feed the port the BOARD's staged bytes for everything they do not
    // claim -- the capture is the gate's INPUT, never its output.
    // How many 12-byte sprite REQUESTS the shot handlers appended this frame,
    // read off $80AFD6 the instant before call #4's tail zeroes it.
    this.shotRequests = this.ram.u16(0x80afd6) / 12;
    // WAVE 85 -- THE SAME READ, ON BUCKET 2 ($805CC8/$80AFC4), and it needs no
    // per-producer instrumentation the way bucket 14 does.  Bucket 14's
    // containment check has to EXCLUDE the option pods' shot records by name,
    // because the port carries stale copies of slots it does not model, so
    // `ctx.shotRequests` records offsets slot by slot.  Bucket 2 has no such
    // problem: the port only ever writes it from code the port HAS ported, and
    // call #4's tail ($23D70C) zeroes every counter, so at the top of a logic
    // frame $80AFC4 is 0 and EVERY record the port wrote this frame lies in
    // [0, $80AFC4) -- the counter read here IS the port's own record set.
    //
    // BEING PRODUCER-AGNOSTIC IS THE POINT, not a shortcut.  Two files name
    // bucket 2 directly today --
    //   * `src/background.js` `elemStage`, the 13 stage-1 background element
    //     updaters through its own inline copy of `$23DF2A` (W40's census: 35
    //     call sites in $2623F4..$2631CA, and the BULK of the bucket), and
    //   * `src/boss.js` `emit23E020`, the stage-1 boss's A2 OBJECT routines
    //     (W82), through `spritequeue.js enqueueRegisters` on bucket 2 --
    // but `resolveEmitStub` reads a stub's bucket OUT OF THE CARTRIDGE, and the
    // stubs the enemy tables point at resolve to buckets 0, 1, 2, 3 and 7.  So
    // a handler this port already has can start feeding bucket 2 without any
    // file naming it, and a counter read catches that where a hand-kept list of
    // producers would not.
    this.bucket2Bytes = this.ram.u16(0x80afc4);
    // WAVE 12: the four buckets this port has producers for, snapshotted at the
    // board's own $23D382 sample point -- after every producer, before the
    // counters are cleared.  `pgm.py shipgate` compares these against the
    // board's dump of the same instant.  Diagnostic only; call #4 reads RAM.
    this.staged = PRODUCED_BUCKETS.map((b) => snapshotBucket(this.ram, b));
    // W612. An attached private actor or constructor-provided mod may supply
    // already-encoded host requests after every object updater and before call
    // #4. Validation happens before the hook can run or call #4 can mutate RAM,
    // and the returned records never enter physical staging buckets.
    let virtualRequests;
    const virtualSpriteRequestHook = /** @type {any} */ (this).virtualSpriteRequestHook;
    if (virtualSpriteRequestHook != null) {
      if (typeof virtualSpriteRequestHook !== 'function') {
        throw new TypeError('Game virtualSpriteRequestHook must be a function');
      }
      virtualRequests = virtualSpriteRequestHook(this);
    }
    this.displayList = buildDisplayList(this.ram, {                  // $23D2AE
      virtualRequests,
      // THE $80B054 WATCH, counted and printed like every other honest gap:
      // $23D6A6 is the `add.l $80B054,D1` whose behaviour changes if it moves.
      warn: (m) => this.unportedLog.note(0x23d6a6, `WATCH ${m}`),
      // W375 -- steps (a) and (j) each `bra.w $23C008`, which mirrors $80393C
      // into $B0E000. The port had the RAM half and not the register half; see
      // displaylist.js's `sectionCommit23C008`. On the shipped seed $80393C is
      // $001F, exactly the value `VideoRegs` was constructed with, so this makes
      // the register FOLLOW the word it was already hard-coded to match rather
      // than changing what any renderer sees.
      videoRegs: this.video,
    });
    // WAVE 91 -- `$23C454 jsr $24133C`, THE PALETTE UPLOAD.  It sits in the
    // block `$23C44C tst.b $803940 / beq $23C472` runs while the vblank
    // semaphore is still armed, i.e. once per loop iteration that reached the
    // spin -- which is once per `step()` in this port's model.  It reads the
    // three staging areas out of main RAM, writes the port's own $A00000, and
    // clears the three dirty flags; nothing else in the port reads or writes
    // any of the six addresses, so this line cannot move a compared column.
    this.paletteFlush = flush24133C(this.ram, this.palette);   // $24133C
    this.armedVblanks = this.#frameSync();            // 10: THE SAMPLE POINT
    // WAVE A (SOUND) -- the completed-iteration drain. The 68k pumps the cue
    // ring once per logic iteration (the BIOS pump $18ACE0, mailbox PC $18AD78);
    // the debounce guards tick down at the top of the sibling $28C19A. Posts
    // accumulate in the ring during the object driver above; this drains one
    // longword and records it in the shadow/log/digest the sound gate compares.
    // Tagged with the logic frame that just completed, before the increment
    // below. Delivery is a command boundary only. The host cadence advances the
    // independent sound hardware after this logic step when deadlines coincide.
    // See src/sound.js drainFrame for the dead-code-trap and ACK notes.
    this.soundFrame = drainFrame(this.ram, this.sound, this.logicFrame);
    this.soundInput = soundFrameInput(this.soundFrame);
    if (!speculative && this.soundSink && this.soundInput.length !== 0) {
      this.soundSink.command(this.soundInput);
    }
    this.logicFrame++;
    return this;
  }

  /** Live slots, counted at the sample point straight out of the table, the
   *  same way `frame.lua` computes `objlive`. */
  objlive() {
    let n = 0;
    for (let i = 0; i < 20; i++) {
      if (this.ram.u16(RAM.objTable + i * 0x50) !== 0) n++;
    }
    return n;
  }
}

export { MACHINE, RAM, i16 };
