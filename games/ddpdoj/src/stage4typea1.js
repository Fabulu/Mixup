// Stage-4 type $A1: one large background structure with a reverse 16-frame
// animation. Its movement stream owns position; the handler only performs the
// leave/re-entry lifetime gate, advances the sprite cursor, and draws bucket 1.

import { u16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { stepMovement } from './movement.js';
import { enqueueThroughStub } from './spritequeue.js';

const R = Object.freeze({
  sub: 0x06, onScreen: 0x16, timer: 0x18, reload: 0x19, art: 0x1a,
});
const S = Object.freeze({ posX: 0x02, sprite: 0x0a });

export function handlerA1(ram, rom, a5, ctx) {
  const root = ram.u32(a5 + R.sub);
  if (stepMovement(ram, rom, a5, ctx.tables, ctx.unported)) return;

  // `$27CF12..$27CF34`: only the carry from the SECOND add is observed.
  const biased = u16(ram.u16(root + S.posX) + 0x3800);
  const outside = biased + 0x2000 > 0xffff;
  if (outside) {
    if (ram.u8(a5 + R.onScreen) !== 0) {
      freeEnemy(ram, a5);
      return;
    }
  } else {
    ram.setU8(a5 + R.onScreen, 1);
  }

  // Byte SUBQ/BCC fires only when the old current byte was zero. The ROM
  // reload is zero, so the structure selects a new frame every handler call.
  const old = ram.u8(a5 + R.timer);
  ram.setU8(a5 + R.timer, old - 1);
  if (old === 0) {
    ram.setU8(a5 + R.timer, ram.u8(a5 + R.reload));
    const cursor = ram.u16(a5 + R.art);
    ram.setU32(root + S.sprite, rom.u32(0x27cf64 + cursor));
    const next = u16(cursor - 4);
    ram.setU16(a5 + R.art, cursor === 0 ? 0x003c : next);
  }

  enqueueThroughStub(ram, rom, 0x23d79e, root);
}
