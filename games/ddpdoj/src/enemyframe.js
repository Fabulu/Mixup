// `$2634F4` -- THE ENEMY SUBSYSTEM'S ONE FRAME, and the wire that finally runs
// it.  WAVE 29 (the INTEGRATION wave).
//
// ===================== WHAT WAS WRONG BEFORE THIS FILE EXISTED ==============
//
// W21..W27 ported the spawn walker (`src/spawn.js`), the 58-slot enemy driver
// (`src/enemies.js`), the six stage-1 handlers (`src/handlers.js`), the 21
// stage-1 init bodies (`src/initbody.js`), the movement interpreter
// (`src/movement.js`), the prototype loaders (`src/enemyproto.js`), the aim pair
// (`src/aim.js`) and the turrets (`src/turret.js`).  W28's recon then MEASURED
// that no module under `src/` imported any of them: their only callers were
// their own tests and their own gates.  A transcription that never executes has
// been verified against the listing and against nothing else.
//
// THE BOARD'S OWN WIRING POINT is object dispatch entry [5] (`$28B5E0`), a list
// of 23 `jsr`s.  Call #2 is `$2634F4`, and it is five instructions:
//
//   2634F4: move.l A5,-(A7)
//   2634F6: bsr.w  $2633BE      the SPAWN WALKER, and -- by FALL-THROUGH at
//                               $263444 -> $263446 -- the deferred-queue drain
//   2634FA: bsr.w  $263502      the 58-slot ENEMY DRIVER
//   2634FE: movea.l (A7)+,A5
//   263500: rts
//
// **`$2633BE` DOES NOT END AT ITS WALK.**  `$263444 move.l A2,(A3)` writes the
// cursor back and then falls straight into `$263446 move.w $815EA8,D6`, the
// deferred-queue drain, which is what actually reaches `$2634F2 rts`.  Reading
// `$2633BE` as "the walker" and stopping at the cursor write-back drops the
// whole deferred half.  `src/spawn.js`'s `runSpawnWalker` already ports both
// halves; its docstring named the routine `$2634F4`, which is the CALLER, not
// what it implements -- corrected there this wave.
//
// ======================= WHAT RUNS AND WHAT THROWS ==========================
//
// The dispatch that decides is `$263532 movea.l ($4C,A5),A1 / $263538 jsr (A1)`
// -- the handler is a FUNCTION POINTER IN THE RECORD, written by the init body.
// `runEnemyDriver` looks the pointer up in the map this file builds; a pointer
// the map does not hold is a LOUD NAMED THROW carrying that pointer as its
// `romAddress` (`src/enemies.js`, `unreached(h, ...)`).  There is no stub, no
// quiet return and no plausible default: an enemy whose handler is unported
// stops the frame and names the routine.
//
// The same is true one level up.  A spawn record whose TYPE resolves to an init
// body outside W23's 21 throws from `runInitBodyAddr` by address, and a movement
// script the interpreter cannot follow throws from `stepMovement`.
//
// ============================ THE CONTEXT SHIM ==============================
//
// Two names for one object, and they were introduced by different waves:
// `Game`'s per-frame context calls the log `unportedLog` (`src/main.js`), and
// every handler in `src/handlers.js` reads `ctx.unported`.  The gates fed the
// handlers a hand-built context, so nothing ever noticed.  It is shimmed HERE,
// once, rather than renamed across two files this wave is not reviewing.

import { runSpawnWalker } from './spawn.js';
import { runEnemyDriver } from './enemies.js';
import { handlerMap } from './handlers.js';

/** The addresses this file is the port of. */
export const ENEMY_FRAME = {
  entry: 0x2634f4,        // type-5 call #2, `$28B5EC jsr $2634F4`
  walker: 0x2633be,       // `$2634F6 bsr.w` -- walk + (fall-through) drain
  driver: 0x263502,       // `$2634FA bsr.w` -- the 58-slot driver
};

/**
 * Adapt `src/handlers.js`'s (ram, rom, a5, ctx) signature to the enemy driver's
 * (ram, rec, slot, ctx).  Built once per Game so the Map identity is stable and
 * `runEnemyDriver`'s `handlers.get(h)` miss is the ONLY place a missing handler
 * is decided.
 */
export function enemyHandlerMap(rom) {
  const m = new Map();
  for (const [addr, fn] of handlerMap()) {
    m.set(addr, (ram, rec, slot, ctx) => { void slot; fn(ram, rom, rec, ctx); });
  }
  return m;
}

/**
 * `$2634F4` -- one frame of the enemy subsystem: spawn walk + deferred drain,
 * then the 58-slot driver.
 *
 * ORDER IS SEMANTICS, not tidiness: a record the walker spawns THIS frame is
 * already in the table when `$263502` runs, so it takes its first handler step
 * on its spawn frame.  Swapping the two `bsr`s would delay every enemy in the
 * game by one frame.
 *
 * @param ram   the board's main RAM
 * @param rom   the declared cartridge windows
 * @param ctx   `Game`'s per-frame context (see `src/main.js` `#ctx()`)
 * @param handlers  the map from `enemyHandlerMap`
 * @returns {{script:number, deferred:number, driven:number}} counts, for the
 *          runner to print -- a subsystem that did nothing must be visible as
 *          having done nothing.
 */
export function runEnemyFrame(ram, rom, ctx, handlers) {
  const u = ctx.unportedLog;
  const { script, deferred } = runSpawnWalker(ram, rom, u);   // $2634F6
  const driven = runEnemyDriver(ram, handlers, hctx(ctx));    // $2634FA
  return { script, deferred, driven };
}

/** `Game`'s ctx as `src/handlers.js` expects it (see THE CONTEXT SHIM above). */
export function hctx(ctx) {
  return { ...ctx, unported: ctx.unportedLog };
}
