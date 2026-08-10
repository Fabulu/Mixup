// Stage-4 boss type $41: the small missiles emitted by A1/E5.
//
// They decelerate to zero while their display heading rotates, acquire a
// player, accelerate back to speed $24, and use the common direction-indexed
// bullet art through the extent-scaled bucket-22 emitter.

import { i16, u16 } from './ram.js';
import { freeEnemy } from './initbody.js';
import { applyVelocity } from './movement.js';
import { AimTables, aim64AtTarget } from './aim.js';
import { emitScaled } from './bossarrival.js';

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let tables = AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); AIM_TABLES.set(rom, tables); }
  return tables;
}

function due8(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
}

function offScreen242684(ram, root) {
  let y = u16(ram.u16(root + 0x04) + 0x1c00);
  y = u16(y + ram.u16(0x813172));
  if (y + 0x9000 > 0xffff) return true;
  return u16(ram.u16(root + 0x02) + 0x0800) + 0x8000 > 0xffff;
}

/** `$29EC22`. Returns the 68000 carry flag consumed by `$2A3864`. */
function screenClearImpact29EC22(ram, ctx, root, hitMask) {
  let d0 = u16(ram.u16(0x811f72) | ram.u16(0x8130f8));
  let allocate = false;
  if (i16(d0) < 0) {
    d0 = ram.u16(0x811f72);
    if (d0 === 0 || (d0 & 1) === 0) {
      d0 = 0;
      allocate = true;
    } else if ((hitMask & 0x5c) !== 0) {
      return true;
    } else if (i16(ram.u16(0x8130f8)) >= 0) {
      // Continue through the common screen-clear arm below.
    } else {
      d0 = 0;
      allocate = true;
    }
  }
  if (!allocate) {
    if (ram.u16(0x81b410) === 0) return false;
    d0 = ram.u16(0x81b412);
    if (i16(d0) < 0) {
      ram.setU8(root + 0x01, 0x80);
      return true;
    }
  }
  // `$27F8F8`'s general screen-clear impact family remains a counted visual
  // dependency. The caller always consumes carry and frees this missile, so
  // gameplay lifetime and collision semantics remain exact.
  ctx.unportedLog?.note(0x27f8f8,
    `$29EC6A screen-clear impact allocation (D0=$${d0.toString(16).toUpperCase()})`);
  return true;
}

export function handler41(ram, rom, a5, ctx) {
  const root = ram.u32(a5 + 0x06);
  const hit = ram.u8(root) & 0x5c;
  if (hit !== 0) {
    ram.setU8(root, ram.u8(root) & 0xa3);
    ram.setU16(root + 0x18, 0x7fff);
  }
  if (ram.u16(0x8130e2) !== 0
      || screenClearImpact29EC22(ram, ctx, root, hit)) {
    freeEnemy(ram, a5);
    return;
  }
  if (offScreen242684(ram, root)) {
    if (ram.u8(a5 + 0x16) !== 0) {
      freeEnemy(ram, a5);
      return;
    }
  } else {
    ram.setU8(a5 + 0x16, 1);
  }

  applyVelocity(ram, ctx.tables, a5);
  let state = ram.u8(a5 + 0x17);
  if (state === 0) {
    ram.setU8(a5 + 0x1a, (ram.u8(a5 + 0x1a) + 4) & 0x3f);
    if (due8(ram, a5 + 0x18)) {
      ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));
      const speed = u16(ram.u8(root + 0x1a) - 1) & 0xff;
      ram.setU8(root + 0x1a, speed);
      if (speed === 0) {
        ram.setU8(a5 + 0x17, 1);
        ram.setU16(a5 + 0x18, 0);
        const aimed = aim64AtTarget(aimTables(rom), ram, a5, root);
        // `$2417DE` left D1 as the current heading masked to six bits. When
        // both players are dead `$24202C` returns with that caller value.
        const direction = aimed.carry ? ram.u8(root + 0x1b) & 0x3f : aimed.dir;
        ram.setU8(a5 + 0x1a, direction);
        ram.setU8(root + 0x1b, direction);
        state = 1;
      }
    }
  }
  if (state === 1 && due8(ram, a5 + 0x18)) {
    ram.setU8(a5 + 0x18, ram.u8(a5 + 0x19));
    if (ram.u8(root + 0x1a) !== 0x24)
      ram.setU8(root + 0x1a, ram.u8(root + 0x1a) + 1);
  }

  const headingOffset = (ram.u8(a5 + 0x1a) + 1) & 0x3e;
  ram.setU8(root + 0x1c, rom.u16(0x283d0c + headingOffset));
  const listOffset = rom.u16(0x2822ec + headingOffset * 4);
  const list = rom.u32(0x2821fa + listOffset);
  const sprite = rom.u32(list);
  emitScaled(ram, rom, 22, (ram.u32(root + 0x02) + 0xfe00fe00) >>> 0,
    sprite, 0x0210, ram.u16(root + 0x1c), 0xf800f800);
}

