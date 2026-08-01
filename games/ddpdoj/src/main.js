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

import { RAM, ROM, MACHINE } from './machine.js';
import { Ram, u16, i16 } from './ram.js';
import { postVblankEdges } from './input.js';
import { irq6 } from './isr.js';
import { WorkBudget } from './budget.js';
import { frameSync } from './framesync.js';
import { runObjectDriver, ObjOrder } from './objdriver.js';
import { updatePlayer, FROZEN_GLOBALS } from './player.js';
import { UnportedLog, unreached } from './unported.js';
import { MoveTables } from './vectors.js';

/** The object dispatch table $240F62, as far as wave 4 implements it. */
export function defaultHandlers() {
  return new Map([
    [2, updatePlayer],    // $240F62[2] = $2491C0, P1
    [3, updatePlayer],    // $240F62[3] = $249246, P2
  ]);
}

export class Game {
  /**
   * @param seed     Uint8Array(0x20000) -- a snapshot of the board's main RAM
   *                 at a sample point, taken by `frame.lua`'s PROBE_RAMDUMP.
   * @param tables   the JSON from tools/export-tables.py.
   * @param opts     { videoFrame, logicFrame, budgetUnits }
   */
  constructor(seed, tables, opts = {}) {
    this.ram = new Ram(seed);
    this.tables = new MoveTables(tables);
    this.gov = Object.fromEntries(
      Object.entries(tables.gov).map(([k, v]) => [k, v.words]));
    this.budget = new WorkBudget(opts.budgetUnits);
    this.unportedLog = new UnportedLog();
    this.order = new ObjOrder();
    this.handlers = opts.handlers ?? defaultHandlers();
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
    this.wallHits = [];
    this.allocEvents = new Map();
    this.frozen = FROZEN_GLOBALS.map(([a, why]) => ({
      addr: a, value: this.ram.u16(a), why,
    }));
  }

  /** The context every ported routine gets.  No clock is reachable from it. */
  #ctx() {
    return {
      tables: this.tables,
      unportedLog: this.unportedLog,
      budget: this.budget,
      order: this.order,
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
  step(portWord) {
    const ctx = this.#ctx();
    this.budget.beginFrame();
    this.irq6Count = 0; this.releases = 0;

    // 1-3: the spin, the vblank(s) and the IRQ6(s).  `armedVblanks` of them:
    // the first armedVblanks-1 find the semaphore still non-zero and release
    // one count each; the LAST one drops it to zero and lets the loop out.
    for (let v = 0; v < this.armedVblanks; v++) {
      this.videoFrame++;
      this.irq6Count++;
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
    this.unportedLog.note(ROM.call3, 'main-loop call #3 ($24683E)');
    this.unportedLog.note(ROM.spriteBuild,
      'main-loop call #4: THE SPRITE LIST BUILD ($23D2AE) -- wave 6');
    this.armedVblanks = this.#frameSync();            // 10: THE SAMPLE POINT
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
