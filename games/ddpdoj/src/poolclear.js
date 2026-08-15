// W380 -- THE TWO POOL CLEARS THAT HAD NO PORT.
//
// `$28B5A8` (object type 5's "not started" branch) and `$25FD38` (REBUILD THE
// WORLD) call the SAME EIGHT subsystem resets, in different orders.  Six of the
// eight already had a port when this wave started:
//
//   $27E98A  items.js   clearItemPool          $816B7A, $322 words
//   $28131E  bullets.js poolClear + poolPark   $817F8C, $1A4A words, then park
//   $288E0C  effects.js clearEffectPool        $81B732, $8DD  words
//   $289084  effects.js clearSubEffectPool     $81C8EC, $281  words
//   $289F3A  spark.js   clearPool              $81D394, $3FE  words
//   $26331E  spawn.js   resetAndInstallStage26331E  $81332C, $1C27 words + install
//
// The two below are the whole remainder.  Both are eighteen bytes and both are
// the same five instructions as the six above, so they live together here
// rather than being pushed into two files this wave does not own.
//
// THE EXTENTS CROSS-CHECK EACH OTHER, and that is the proof that the `dbra`
// arithmetic (trap 2: `dbra` runs N+1 times) is right in all eight.  Five of
// the clears tile RAM with NO GAP and NO OVERLAP -- each one's exclusive end is
// the next one's `lea`:
//
//   $288E0C  $81B732 + $8DD*2 = $81C8EC   == $289084's lea
//   $289084  $81C8EC + $281*2 = $81CDEE   == $289AE0's lea   (POOL_C.base)
//   $289AE0  $81CDEE + $2D3*2 = $81D394   == $289F3A's lea   (SPARK.p1Base)
//   $289F3A  $81D394 + $3FE*2 = $81DB90   == $28AC3A's lea   (CUE.base)
//   $28AC3A  $81DB90 + $C0 *2 = $81DD10
//
// and the enemy/item pair tiles the same way ($81332C + $1C27*2 = $816B7A ==
// `$27E98A`'s lea).  An off-by-one in any single count would break the tiling.

import { POOL_C } from './effects.js';
import { CUE } from './cues.js';

/** `$289AE6 move.w #$2D2,D0` + the dbra's own pass. */
export const POOL_C_CLEAR_WORDS = 0x2d3;

/** `$28AC40 move.w #$BF,D0` + the dbra's own pass. */
export const CUE_CLEAR_WORDS = 0xc0;

/**
 * `$289AE0..$289AF3` -- 18 bytes.  Clear the WHOLE of pool C.
 *
 *   289ae0: 41f9 0081cdee   lea     $81CDEE,A0
 *   289ae6: 303c 02d2       move.w  #$2D2,D0
 *   289aea: 30fc 0000       move.w  #$0,(A0)+
 *   289aee: 51c8 fffa       dbra    D0,$289AEA
 *   289af2: 4e75            rts
 *
 * `$2D2` + the dbra's own pass = `$2D3` = 723 words = 1,446 bytes, and the
 * SPAN is what makes this worth transcribing as a loop instead of a field list:
 * pool C is 30 slots x `$30` = 1,440 bytes ending at `$81D38D`, so the clear
 * also takes `$81D38E` (POOL_C.count, `$2890E0`'s `addq.w`) and the two words
 * after it, and stops EXACTLY on `$81D394`, pool E's base.
 *
 * Two absolute-long callers: `$25FD4C` (inside `$25FD38`) and `$28B5C0`
 * (inside `$28B5A8`).  W380 wires the second; the first still carries the
 * counted note `$25FD38` has always had, in a file this wave does not own.
 */
export function clearPoolC289AE0(ram) {
  for (let i = 0; i < POOL_C_CLEAR_WORDS; i++) {         // $289AEE dbra
    ram.setU16(POOL_C.base + i * 2, 0);                  // $289AEA move.w #0,(A0)+
  }
}

/**
 * `$28AC3A..$28AC4D` -- 18 bytes.  Clear the WHOLE cue pool.
 *
 *   28ac3a: 41f9 0081db90   lea     $81DB90,A0
 *   28ac40: 303c 00bf       move.w  #$BF,D0
 *   28ac44: 30fc 0000       move.w  #$0,(A0)+
 *   28ac48: 51c8 fffa       dbra    D0,$28AC44
 *   28ac4c: 4e75            rts
 *
 * `$BF` + the dbra's own pass = `$C0` = 192 words = 384 bytes, and `$81DB90`
 * holds exactly 10 slots x `$26` = 380 bytes plus `CUE.count` (`$81DD0C`) and
 * `CUE.stagger` (`$81DD0E`).  384 = 380 + 4, EXACT -- the pool and both of its
 * scalars and nothing else.
 *
 * `$28AC3A` is also the far end that PINS `$28ABE0`'s 64-byte RNG table
 * (`src/rng.js` RNG_28ABE0: "`$28AC3A` is `lea $81DB90,A0` -- code").  That
 * citation was written from the same bytes and it is confirmed here.
 *
 * Two absolute-long callers: `$25FD52` and `$28B5C6`, exactly as for pool C.
 */
export function clearCuePool28AC3A(ram) {
  for (let i = 0; i < CUE_CLEAR_WORDS; i++) {            // $28AC48 dbra
    ram.setU16(CUE.base + i * 2, 0);                     // $28AC44 move.w #0,(A0)+
  }
}
