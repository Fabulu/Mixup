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
import { RomWindows } from './rom.js';
import { makeType5 } from './type5.js';
import { PLAYER_SLOTS } from './shots.js';
import { buildDisplayList } from './displaylist.js';
import { ProtLatch } from './protsim.js';
import { snapshotBucket, NAMED_BUCKETS } from './spritequeue.js';
import { makeBackground, BgVram, VideoRegs } from './background.js';
import { makeStageClear } from './stageend.js';

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
  NAMED_BUCKETS.shots,     // 14 -- wave 8
  NAMED_BUCKETS.options,   // 15 -- the two option pods
  NAMED_BUCKETS.player,    // 19 -- the ship, its aura and its glow
];

/** The object dispatch table $240F62, as far as the port implements it.
 *  Entry [5] is PARTIAL -- see type5.js, WHICH IS THE AUTHORITY: `TYPE5_PORTED`
 *  holds TEN of its 23 subsystem calls, not the "NINE" this comment claimed
 *  until wave 44 (W33 added `$28AD54` and did not update this line).  Among them
 *  W29's enemy subsystem ($2634F4) and bullet subsystem ($281D9A + its timer
 *  $25354C).  4 of the 20 top-level entries. */
export function defaultHandlers(rom, vram, opts = {}) {
  return new Map([
    // WAVE 13.  $240F62[1] = $26127A, THE BACKGROUND: the scroll VM, both
    // cameras and the tilemap ring (src/background.js).  Adding this entry is
    // what makes $813176 and $8130CE move on every existing gate -- both were
    // in player.js's FROZEN_GLOBALS until this wave.
    [1, makeBackground(rom, vram, opts)],
    [2, updatePlayer],    // $240F62[2] = $2491C0, P1
    [3, updatePlayer],    // $240F62[3] = $249246, P2
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
    // WAVE 8: the cartridge, as a set of declared windows.  The shot spawn
    // follows pointers out of a ROM template, so the port reads ROM the way the
    // 68000 does and throws BY ADDRESS on anything the exporter did not cover.
    this.rom = new RomWindows(tables.rom);
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
    this.video = opts.video ?? new VideoRegs();
    this.scrollEvents = [];
    this.bgMutate = opts.bgMutate ?? null;
    this.handlers = opts.handlers
      ?? defaultHandlers(this.rom, this.vram, { mutate: opts.bgMutate ?? null });
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
    this.bulletSpawns = new Map();   // WAVE 30, see #ctx()'s bulletSpawn
    this.bulletKinds = new Map();    // WAVE 33, see #ctx()'s bulletKind
    this.effectSpawns = new Map();   // WAVE 54, see #ctx()'s effectSpawn
    this.itemSpawns = new Map();     // WAVE 61, see #ctx()'s itemSpawn
    this.itemCollects = new Map();   // WAVE 61, see #ctx()'s itemCollect
    this.stageEndEvents = [];        // WAVE 62, see #ctx()'s bossEvent
    this.kills = { n: 0, score: 0, byValue: new Map() };  // WAVE 34, killEvent
    this.shotSpawns = new Map();
    this.shotTableFull = 0;
    this.frameRequests = [];        // bucket offsets from COMPARED slots
    this.frameRequestsOther = [];   // ...and from the option pods'
    this.shotRequests = 0;
    this.frozen = FROZEN_GLOBALS.map(([a, why]) => ({
      addr: a, value: this.ram.u16(a), why,
    }));
  }

  /** The context every ported routine gets.  No clock is reachable from it. */
  #ctx() {
    return {
      tables: this.tables,
      rom: this.rom,
      prot: this.prot,          // WAVE 12: the $500000 latch, on the ship's own
                                // draw path through $24A5B6 (src/protsim.js)
      // WAVE 57: the BG videoram, because an ENEMY HANDLER writes it.  Type
      // $1C ($26C20C, what the midboss's death spawns) copies 23 x 9 map
      // longwords into $9000xx -- the same array `$240D9A` writes through
      // `writeMapLong`.  It is the first handler in this port that is not a
      // sprite producer, and a caller that omits `vram` reaches a loud named
      // throw at $26C226 rather than dropping 207 longwords.
      vram: this.vram,
      unportedLog: this.unportedLog,
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
      budget: this.budget,
      order: this.order,
      // WAVE 13.  The video registers the ISR6-gated $140FFE uploads, and the
      // scroll VM's own event log: every SPAWN, BGELEM, CUE and FLAG the
      // program executed, with the record's clock value.  The events are what
      // makes "the port skipped an opcode" visible -- an unported CALLEE is
      // counted in unportedLog, but WHICH record reached it is here.
      video: this.video,
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
  step(portWord) {
    const ctx = this.#ctx();
    this.budget.beginFrame();
    this.irq6Count = 0; this.releases = 0;
    this.frameRequests = []; this.frameRequestsOther = [];

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
    this.unportedLog.note(ROM.call3, 'main-loop call #3 ($24683E)');
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
    // WAVE 12: the four buckets this port has producers for, snapshotted at the
    // board's own $23D382 sample point -- after every producer, before the
    // counters are cleared.  `pgm.py shipgate` compares these against the
    // board's dump of the same instant.  Diagnostic only; call #4 reads RAM.
    this.staged = PRODUCED_BUCKETS.map((b) => snapshotBucket(this.ram, b));
    this.displayList = buildDisplayList(this.ram, {                  // $23D2AE
      // THE $80B054 WATCH, counted and printed like every other honest gap:
      // $23D6A6 is the `add.l $80B054,D1` whose behaviour changes if it moves.
      warn: (m) => this.unportedLog.note(0x23d6a6, `WATCH ${m}`),
    });
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
