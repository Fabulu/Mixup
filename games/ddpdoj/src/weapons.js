// THE PLAYER-SHOT SUB-DRIVER -- `$253A70`, reached from top-level object type 5
// (`$28B5E0`, dispatch entry [5], priority $18) at `$28B610`.
//
// FOUND THE SAME WAY AS THE ENEMY DRIVER (see enemies.js): `objhunt.lua` over
// the stage-1 opening reported `W pc=253AA6 n=10048 off=810576..810A26
// stride=48`, an $30-byte table walked per record; `xref.py lea 810572` found
// `$253A70 lea $810572,A6`; `xref.py callers 253A70` found exactly one caller,
// `$28B610`.
//
//   253A70: lea $810572,A6          THE P1 SHOT TABLE
//   253A76: move.w $813176,D6       the frame's scroll delta
//   253A7C: clr.w $81295C           the LIVE SHOT COUNT
//   253A86: lea $8103E6,A4          A4 = the player record
//   253A8C: lea $81B63E,A5
//   253A92: swap D6 / move.w #$1,D6 / swap D6     <- the OUTER two-player
//   253A9A: moveq #$23,D7                            counter is parked in D6's
//   253A9C: move.w (A6),D1 / beq $253ABE              HIGH word while its LOW
//   253AA0: addq.w #1,$81295C                         word carries the scroll
//   253AA6: sub.w D6,($4,A6)        SCROLL COMPENSATION
//   253AAA: D0 = (D1 & $F) * 4
//   253AB2: lea ($253ADE,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
//   253ABE: lea ($30,A6),A6
//   253AC2: dbra D7,$253A9C
//   253AC6: lea $810448,A4 / lea $81B640,A5
//   253AD2: swap D6 / dbra D6,$253A98
//
// GEOMETRY: **36 slots x $30 per player** (`moveq #$23,D7` then `dbra`), P1 at
// $810572..$810C31 and P2 at $810C32..$8112F1 -- and A6 is simply left where the
// first pass ended, which is why the two tables are adjacent and why the second
// pass needs no `lea`.  $810C32 is independently confirmed: the shot spawn at
// $249D3E loads it by name for P2.
//
// $81295C IS NOT BOOKKEEPING.  Wave 4's frame-sync governor ($23C272) sums
// `$81B40C + $81295C + 2*$81295E` and compares it against a threshold -- so the
// number of live player shots feeds the arm/hysteresis decision.  A port that
// leaves this counter at 0 while shots are on screen changes WHEN the frame is
// armed, not just what is drawn.
//
// THE DISPATCH: 16 longwords at $253ADE, indexed by `(A6) & $F`.  Read out of
// the image with `xref.py ptrtable 253ADE 4 16`:
//
//   [ 0] $253B1E  [ 4] $254078  [ 8] $253BDA  [12] $254136
//   [ 1] $253C98  [ 5] $2541BC  [ 9] $253D52  [13] $25427A
//   [ 2] $253E34  [ 6] $254300  [10] $253EC6  [14] $2543A4
//   [ 3] $253F56  [ 7] $25442A  [11] $253FE8  [15] $2544CE
//
// MEASURED over the 2,600-frame `stage1-open` scenario (`w5recon.lua`, hooking
// the driver's own `sub.w D6,($4,A6)` write at $253AA6, which executes exactly
// once per live shot), the type words that actually occur are
//
//   8048:3842 814A:2585 83CA:1285 82C8:668 8000:259 8040:256 8140:255
//   8042:252 8002:252 80C8:169 81CA:165 80C2:21 8082:21 83C8:12 81C0:3 80C0:3
//
// -- 16 distinct words but only **FOUR distinct low nibbles: 0, 2, 8, A**, so
// only four of the sixteen handlers ($253B1E, $253E34, $253BDA, $253EC6) are
// ever reached in the opening.  Live shots peak at 20 per frame and are 0 on
// 2,025 of the 2,600 frames.
//
// NONE OF THE FOUR IS TRANSLATED IN WAVE 5.  The walk, the scroll compensation
// and the live count are, because they are shared by every shot; the dispatch
// is a loud named throw carrying the handler's ROM address.  $253B1E's tail is
// `jmp $23F3AE`, the sprite ENQUEUE -- so translating a shot handler pulls in
// the sprite request pipeline, which is wave 6's job and is named here rather
// than discovered later.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';

export const SHOT = {
  p1Table: 0x810572,       // $253A70 lea $810572,A6
  p2Table: 0x810c32,       // $810572 + 36 * $30, and $249D3E by name
  slots: 36,               // $253A9A moveq #$23,D7 then dbra
  stride: 0x30,            // $253ABE lea ($30,A6),A6
  scrollDelta: 0x813176,   // $253A76 move.w $813176,D6
  liveCount: 0x81295c,     // $253A7C clr.w / $253AA0 addq.w #1
  dispatch: 0x253ade,      // $253AB2 lea ($253ADE,PC),A0
  p1Rec: 0x8103e6,         // $253A86 lea $8103E6,A4
  p2Rec: 0x810448,         // $253AC6 lea $810448,A4
};

/** The 16 dispatch entries, read from the image with `xref.py ptrtable`. */
export const SHOT_HANDLERS = [
  0x253b1e, 0x253c98, 0x253e34, 0x253f56, 0x254078, 0x2541bc, 0x254300,
  0x25442a, 0x253bda, 0x253d52, 0x253ec6, 0x253fe8, 0x254136, 0x25427a,
  0x2543a4, 0x2544ce,
];

/** The four the stage-1 opening actually reaches, with their measured counts. */
export const SHOT_HANDLERS_SEEN = new Map([
  [0x253b1e, 259 + 256 + 255 + 3 + 3], [0x253e34, 668 + 252 + 252 + 21 + 21],
  [0x253bda, 3842 + 169 + 12], [0x253ec6, 2585 + 1285 + 165],
]);

/**
 * $253A70 -- one pass of the player-shot driver, both players.
 * @param handlers Map from handler ROM address to fn(ram, rec, slot, player, ctx)
 */
export function runShotDriver(ram, handlers, ctx) {
  ram.setU16(SHOT.liveCount, 0);                        // $253A7C
  const scroll = i16(ram.u16(SHOT.scrollDelta));        // $253A76
  let processed = 0;
  for (let pl = 0; pl < 2; pl++) {                      // $253AD4 dbra D6 (high)
    const base = pl === 0 ? SHOT.p1Table : SHOT.p2Table;
    for (let i = 0; i < SHOT.slots; i++) {              // $253A9A / $253AC2
      const rec = base + i * SHOT.stride;               // $253ABE
      const t = ram.u16(rec);                           // $253A9C move.w (A6),D1
      if (t === 0) continue;                            // $253A9E beq
      ram.setU16(SHOT.liveCount, u16(ram.u16(SHOT.liveCount) + 1));  // $253AA0
      // $253AA6 -- every live shot is pulled by the scroll BEFORE its handler
      // runs.  This is the instruction the wave-5 census hooks.
      ram.setU16(rec + 4, u16(i16(ram.u16(rec + 4)) - scroll));
      const h = SHOT_HANDLERS[t & 0xf];                 // $253AAA..$253ABA
      const fn = handlers?.get(h);
      if (!fn) {
        unreached(h, `player-shot handler $${h.toString(16).toUpperCase()} `
          + `(dispatch entry [${t & 0xf}] of the 16 at $253ADE), for the record `
          + `at $${rec.toString(16).toUpperCase()} with type word `
          + `$${t.toString(16).toUpperCase()}. Wave 5 measured only FOUR of the `
          + `sixteen reached in the stage-1 opening ($253B1E $253E34 $253BDA `
          + `$253EC6) and translated NONE; $253B1E ends in `
          + `jmp $23F3AE, the sprite enqueue, so translating one pulls in the `
          + `sprite request pipeline`);
      }
      fn(ram, rec, i, pl, ctx);                         // $253ABC jsr (A0)
      processed++;
    }
  }
  return processed;
}
