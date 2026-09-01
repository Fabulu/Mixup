// Embedded Version A player initialization and nonfiring control through `$1494F2`.
// Shot producers, options, death, stage-clear flight, and the draw tail remain
// separate campaign slices. Reaching one of those branches is either a named
// boundary or a loud throw, never an unverified alias to Build B code.

import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { asr, i16, u16 } from './ram.js';
import { unreached } from './unported.js';
import { spawnWhitePlayerShot } from './white-shots.js';

const P = WHITE_LABEL_PROFILE.ramLayout.playerFields;
const RAM = WHITE_LABEL_PROFILE.ramLayout.addresses;
const CLAMP = WHITE_LABEL_PROFILE.selectorProfile.clamp;

const freezeOwner = (owner) => Object.freeze({
  ...owner,
  fresh: Object.freeze(owner.fresh.map((row) => Object.freeze(row))),
});

export const WHITE_PLAYER = Object.freeze({
  template: 0x14883c,
  templateWords: 49,
  update: 0x148bae,
  movementBoundary: 0x148e5e,
  autoShot: 0x148e5e,
  autoShotBoundary: 0x148eb2,
  button2: 0x148eb2,
  button2Boundary: 0x148ec8,
  shotCadence: 0x1491d0,
  shotInvalid: 0x149294,
  shotShip0: 0x1492a0,
  shotShip2: 0x1493d0,
  autoShotSetting: 0x80380f,
  button2Gate: 0x8130ce,
  drawTail: 0x1494f2,
  firstFrameBoundary: 0x1494f2,
  directionTable: 0x154898,
  foldTable: 0x141bee,
  speedPointers: 0x100920,
  speedBase: 0x100d20,
  speedStride: 0x0208,
  speedEntries: 65,
  speeds: Object.freeze([9, 15, 16, 18, 22]),
  openerP1: 0x154796,
  openerP2: 0x15479e,
  shipRows: 0x1547a6,
  formationCaps: 0x1547b6,
  speedRows: 0x1547bc,
  powerRows: 0x1547c8,
  rampRows: 0x154880,
  knockback: 0x1548a8,
  movementDisable: 0x8130d2,
  inputMask: 0x81296e,
  stageClear: 0x812972,
  knockbackDrag: 0x812954,
  xAdjustGate: 0x81308c,
  xAdjust: 0x813176,
  wallGate: 0x81317a,
  wallState: 0x81316c,
  requestP1: 0x8130fa,
  requestP2: 0x81311e,
  p1: freezeOwner({
    handler: 0x14889e,
    rec: 0x8103e6,
    option: 0x8104aa,
    liveBit: 1,
    bonus: 0x8128f4,
    powerList: 0x8127e4,
    d4: 0x812930,
    d6: 0x81292c,
    ship: 0x813084,
    style: 0x813088,
    opener: 0x154796,
    fresh: [[0x812910, 0], [0x812914, 2], [0x812916, 2]],
    freshLong: 0x81291c,
    freshWord: 0x812924,
  }),
  p2: freezeOwner({
    handler: 0x14891e,
    rec: 0x810448,
    option: 0x81050e,
    liveBit: 2,
    bonus: 0x812902,
    powerList: 0x8127ec,
    d4: 0x812932,
    d6: 0x81292e,
    ship: 0x813086,
    style: 0x81308a,
    opener: 0x15479e,
    fresh: [[0x812912, 0], [0x812918, 2], [0x81291a, 2]],
    freshLong: 0x812920,
    freshWord: 0x812926,
  }),
});

const SPEEDS = new Set(WHITE_PLAYER.speeds);

function requireWhitePlayers(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1Players', operation);
  return profile;
}

function owner(side) {
  return side === 0 ? WHITE_PLAYER.p1 : WHITE_PLAYER.p2;
}

function armRequest9(ram, side) {
  const record = side === 0 ? WHITE_PLAYER.requestP1 : WHITE_PLAYER.requestP2;
  ram.setU16(record, 9);
  ram.setU16(record + 2, 0);
}

function powerOffset(ram, rec) {
  let index = u16(u16(ram.u16(rec + 0x5a) - 2) * 2);
  index = u16(index + ram.u16(rec + 0x58));
  return u16(index * 4);
}

function copyPowerRows(ram, rom, c, rec) {
  const offset = powerOffset(ram, rec);
  ram.setU32(c.powerList, rom.u32(WHITE_PLAYER.powerRows + offset));
  ram.setU32(c.powerList + 4, rom.u32(WHITE_PLAYER.powerRows + offset + 4));
}

function initialize(ram, rom, slot, c, ctx) {
  const rec = c.rec;
  const fresh = ram.u8(slot + 0x06) === 0;
  const d4 = ram.u16(c.d4);
  const d6 = ram.u16(c.d6);

  ram.setU16(rec + 0x58, ram.u16(c.ship));
  ram.setU16(rec + 0x5a, ram.u16(c.style));
  if (fresh) {
    for (const [address, value] of c.fresh) ram.setU16(address, value);
    ram.setU32(c.freshLong, 0x001c3c5c);
    ram.setU16(c.freshWord, 0x0101);
  }

  ram.setU16(c.option, 0x8000);
  for (const address of [0x812970, WHITE_PLAYER.inputMask, WHITE_PLAYER.stageClear]) {
    ram.setU16(address, 0);
  }

  const keep58 = ram.u32(rec + 0x58);
  const keep20 = ram.u32(rec + 0x20);
  const keep25 = ram.u8(rec + 0x25);
  ram.setU16(rec, ram.u16(rec) | rom.u16(WHITE_PLAYER.template));
  if (fresh) {
    for (let word = 1; word < WHITE_PLAYER.templateWords; word++) {
      ram.setU16(rec + word * 2, rom.u16(WHITE_PLAYER.template + word * 2));
    }
  }
  ram.setU32(rec + 0x58, keep58);
  ram.setU8(rec + P.playerIdx, ram.u8(slot + 0x07));

  let skipPower = !fresh;
  if (fresh) {
    ram.setU16(c.bonus, 0);
    ram.setU32(c.bonus + 0x02, 0);
    ram.setU32(c.bonus + 0x06, 0);
    ram.setU16(c.bonus + 0x0a, 0);
    ram.setU16(c.bonus + 0x0c, 0);
    const cap = WHITE_PLAYER.formationCaps + i16(u16(ram.u16(rec + 0x5a) - 2));
    const initial = rom.u8(cap);
    ram.setU8(rec + 0x24, initial);
    ram.setU8(rec + 0x25, rom.u8(cap + 1));
    if (d6 !== 0) {
      ram.setU32(rec + 0x20, keep20);
      ram.setU8(rec + 0x24, keep25);
      ram.setU8(rec + 0x25, keep25);
      skipPower = d4 !== 0;
    }
    if (!skipPower) {
      ram.setU8(rec + 0x24, initial);
      ram.setU8(rec + 0x25, initial);
      ram.setU32(rec + 0x20, 0);
      copyPowerRows(ram, rom, c, rec);
    }
  }

  armRequest9(ram, ram.u8(slot + 0x07) === 0 ? 0 : 1);
  if (ram.u16(0x803926) !== 0) {
    unreached(0x148a70, 'the Version A forced-power player initializer is outside the movement slice');
  }

  ram.setU8(rec + P.invuln, 0xf0);
  let source = c.opener;
  ram.setU32(rec + 0x02, rom.u32(source));
  ram.setU16(rec + 0x1c, rom.u16(source + 4));
  ram.setU8(rec + 0x54, rom.u8(source + 6));
  ram.setU8(rec + 0x55, rom.u8(source + 7));
  ram.setU8(rec + 0x3b, ram.u8(rec + P.dirLatch));
  ram.setU8(rec + 0x56, ram.u8(rec + 0x54));
  ram.setU16(rec + P.posY, ram.u16(slot + 0x08));
  ram.setU16(rec + P.posX, ram.u16(slot + 0x0a));

  source = WHITE_PLAYER.shipRows + u16(ram.u16(rec + 0x58) * 4);
  ram.setU32(rec + P.animA, rom.u32(source));
  ram.setU32(rec + P.hitYPlus, rom.u32(source + 4));

  const styleIndex = u16(ram.u16(rec + 0x5a) - 2) * 2;
  const speedIndex = u16(styleIndex + ram.u16(rec + 0x58));
  const rampIndex = u16(styleIndex * 2 + ram.u16(rec + 0x58) * 2);
  source = WHITE_PLAYER.speedRows + speedIndex;
  ram.setU8(rec + P.speedIdx, rom.u8(source));
  ram.setU8(rec + P.baseSpeed, rom.u8(source));
  ram.setU8(rec + P.laserFloor, rom.u8(source + 1));
  ram.setU16(rec + 0x2c, rom.u16(WHITE_PLAYER.rampRows + rampIndex));
  ram.setU16(rec + 0x36, rom.u16(WHITE_PLAYER.rampRows + rampIndex + 2));

  ctx?.playerEvent?.('init', ram.u8(slot + 0x07), ram.u16(rec + P.posY),
    ram.u16(rec + P.posX));
  return Object.freeze({ phase: 'initialized', boundary: WHITE_PLAYER.firstFrameBoundary });
}

function tiltDecay(ram, rec) {
  const tilt = i16(ram.u16(rec + P.tilt));
  if (tilt !== 0) ram.setU16(rec + P.tilt, u16(tilt + (tilt < 0 ? 4 : -4)));
}

function tiltRamp(ram, rec, limit, step) {
  if (i16(ram.u16(rec + P.tilt)) === limit) return;
  const delay = i16(u16(ram.u16(rec + P.tiltDelay) - 1));
  ram.setU16(rec + P.tiltDelay, u16(delay));
  if (delay >= 0) return;
  ram.setU16(rec + P.tiltDelay, 2);
  ram.setU16(rec + P.tilt, u16(i16(ram.u16(rec + P.tilt)) + step));
}

function vector141B4C(rom, speed, angle) {
  if (!SPEEDS.has(speed)) {
    unreached(0x141b5a, `Version A player speed ${speed} has no measured movement resource`);
  }
  const pointerAddress = WHITE_PLAYER.speedPointers + speed * 4;
  const pointer = rom.u32(pointerAddress);
  const expected = WHITE_PLAYER.speedBase + speed * WHITE_PLAYER.speedStride;
  if (pointer !== expected) {
    unreached(0x141b5a, `Version A speed ${speed} points to $${pointer.toString(16).toUpperCase()}`);
  }
  const folded = rom.u16(WHITE_PLAYER.foldTable + (angle & 0x3f) * 8);
  if ((folded & 7) !== 0 || folded > (WHITE_PLAYER.speedEntries - 1) * 8) {
    unreached(0x141b6a, `Version A player fold offset $${folded.toString(16).toUpperCase()} escaped its quadrant`);
  }
  let dy = asr(rom.u32(pointer + folded), 4);
  let dx = asr(rom.u32(pointer + folded + 4), 4);
  const quadrant = angle & 0x30;
  if (quadrant === 0x10) dy = -dy;
  else if (quadrant === 0x20) { dy = -dy; dx = -dx; }
  else if (quadrant === 0x30) dx = -dx;
  return { dy: i16(dy), dx: i16(dx) };
}

function wallHit1601A4(ram, ctx, side) {
  if (ram.u16(WHITE_PLAYER.wallGate) !== 0) ram.setU16(WHITE_PLAYER.wallState, 0);
  ctx?.wallHit?.(0x1601a4, side);
}

function appliedVelocity(ram, address, overshoot) {
  ram.setU16(address, u16(i16(ram.u16(address)) - i16(overshoot)));
}

function finishMovement(ram, rom, rec, ctx, ownerIndex, d2, d3, skipClamps) {
  const direction = ram.u8(rec + P.dirByte);
  if (!skipClamps) {
    if ((direction & 0x04) !== 0) {
      ram.setU16(rec, ram.u16(rec) | 0x0020);
      tiltRamp(ram, rec, -0x20, -4);
      if (u16(d3) <= CLAMP.xMin) {
        const overshoot = u16(d3 - CLAMP.xMin);
        appliedVelocity(ram, rec + P.velX, overshoot);
        d3 = CLAMP.xMin;
        wallHit1601A4(ram, ctx, 'x min');
      }
    } else if ((direction & 0x08) !== 0) {
      ram.setU16(rec, ram.u16(rec) | 0x0020);
      tiltRamp(ram, rec, 0x20, 4);
      if (u16(d3) >= CLAMP.xMax) {
        const overshoot = u16(d3 - CLAMP.xMax);
        appliedVelocity(ram, rec + P.velX, overshoot);
        d3 = CLAMP.xMax;
        wallHit1601A4(ram, ctx, 'x max');
      }
    } else {
      tiltDecay(ram, rec);
    }

    if ((direction & 0x01) !== 0) {
      if (u16(d2) > CLAMP.yMax) {
        const overshoot = u16(d2 - CLAMP.yMax);
        appliedVelocity(ram, rec + P.velY, overshoot);
        d2 = CLAMP.yMax;
      }
    } else if ((direction & 0x02) !== 0 && u16(d2) < CLAMP.yMin) {
      const overshoot = u16(d2 - CLAMP.yMin);
      appliedVelocity(ram, rec + P.velY, overshoot);
      d2 = CLAMP.yMin;
    }
  }

  if (ram.i8(rec + P.flags1) < 0) {
    const timer = ram.u16(rec + P.knockTimer);
    if (timer !== 0) {
      const amount = rom.u16(WHITE_PLAYER.knockback + timer);
      ram.setU16(rec + P.knock, u16(ram.u16(rec + P.knock) - amount));
      ram.setU16(rec + P.shadowBias, amount);
      ram.setU16(rec + P.knockTimer, u16(timer - 2));
    }
    if (ram.u16(WHITE_PLAYER.knockbackDrag) !== 0) {
      ram.setU16(rec + P.velY, u16(ram.u16(rec + P.velY) - 0x48));
      d2 = u16(d2 - 0x48);
    }
    if (u16(d2) < CLAMP.yMin) {
      ram.setU16(rec + P.velY,
        u16(ram.u16(rec + P.velY) + u16(CLAMP.yMin - d2)));
      d2 = CLAMP.yMin;
    }
  }

  ram.setU16(rec + P.posY, u16(d2));
  ram.setU16(rec + P.posX, u16(d3));
  if (ram.u16(WHITE_PLAYER.xAdjustGate) === 0 && !ram.btst8(rec + P.flags1, 5)) {
    ram.setU16(rec + P.posX,
      u16(ram.u16(rec + P.posX) - ram.u16(WHITE_PLAYER.xAdjust)));
  }
  const post = postMovement148E5E(ram, rom, rec, ctx, ownerIndex);
  return Object.freeze({ phase: 'moved', boundary: post.boundary,
    y: ram.u16(rec + P.posY), x: ram.u16(rec + P.posX) });
}

function autoShot148E5E(ram, rec, ownerIndex) {
  if (ram.u8(WHITE_PLAYER.autoShotSetting) === 0
      || !ram.btst8(rec + P.dirByte, 6)
      || ram.u8(rec + 0x3c) !== 0) return;
  const options = owner(ownerIndex).option;
  ram.bclr8(rec + P.btnByte, 4);
  ram.bclr8(rec + P.flags1, 3);
  ram.bclr8(options + P.flags1, 3);
  if (ram.bchg8(rec + P.flags1, 4) !== 0) return;
  ram.bset8(rec + P.flags1, 3);
  ram.bset8(options + P.flags1, 3);
  ram.bset8(rec + P.btnByte, 4);
}

/**
 * `$148E5E..$148EB1`: Version A's auto-shot edge synthesizer.
 *
 * The exporter pins this 84-byte block as an exact copy of Build B
 * `$2497AA..$2497FD`. The recurring tick runs this immediately before cadence,
 * so cadence sees a synthetic edge in the same frame rather than a cached byte.
 */
export function whiteAutoShot148E5E(ram, rec, slot, profileRequest) {
  requireWhitePlayers(profileRequest, 'White Label Stage 1 auto-shot');
  const marker = ram.u8(slot + 0x07);
  if (marker !== 0 && marker !== 1) {
    throw new RangeError(`White Label auto-shot owner marker ${marker} is outside {0, 1}`);
  }
  autoShot148E5E(ram, rec, marker);
  return Object.freeze({
    phase: 'auto-shot', boundary: WHITE_PLAYER.autoShotBoundary, ownerIndex: marker,
  });
}

const cadenceTail1494F2 = () => Object.freeze({
  phase: 'cadence', boundary: WHITE_PLAYER.drawTail,
});

function shotCadence1491D0(ram, rom, rec, ctx, ownerIndex) {
  const hyper = ram.btst8(rec + P.flags1, 0) !== 0;
  ram.setU8(rec + 0x56, ram.u8(rec + (hyper ? 0x55 : 0x54)));
  if (ram.u8(rec + 0x3f) !== 0) return cadenceTail1494F2();

  if (ram.btst8(rec + P.btnByte, 4)) {
    ram.setU8(rec + 0x3c, 1);
    const source = hyper ? 8 : ram.u8(rec + 0x21);
    ram.setU8(rec + 0x2b, (((source >> 1) & 6) + ram.u8(rec + 0x2d)) & 0xff);
    if (ram.bclr8(rec + P.flags1, 3)) {
      ram.bset8(rec + P.state, 3);
      ram.setU8(rec + 0x2b, 0);
    } else if (ram.bclr8(rec + P.state, 3)) {
      ram.setU8(rec + 0x2a, 1);
      return cadenceTail1494F2();
    }
  } else {
    ram.setU8(rec + 0x3c, 0);
    ram.bclr8(rec + P.state, 3);
    ram.bclr8(rec + P.flags1, 4);
    if (ram.u8(rec + 0x2b) === 0) return cadenceTail1494F2();
    ram.setU8(rec + 0x2a, (ram.u8(rec + 0x2a) - 1) & 0xff);
    if (ram.u8(rec + 0x2a) !== 0) return cadenceTail1494F2();
    ram.setU8(rec + 0x2b, (ram.u8(rec + 0x2b) - 1) & 0xff);
    ram.bset8(rec + P.state, 3);
    ram.bset8(rec + P.flags1, 4);
  }

  const ship = ram.u16(rec + 0x58);
  const reload = hyper || (ship === 0 && ram.u16(rec + 0x20) === 8)
    ? 2 : ram.u8(rec + 0x2c);
  ram.setU8(rec + 0x2a, reload);
  if (ship === 0 || ship === 2) {
    spawnWhitePlayerShot(ram, rom, rec, ctx, ownerIndex);
    return cadenceTail1494F2();
  }
  unreached(WHITE_PLAYER.shotInvalid,
    `the White Label shot ship selector ${ship} is outside {0, 2}`);
}

/** `$1491D0..$1494F1`: Version A's ordinary-shot cadence through its producer seam. */
export function whiteShotCadence1491D0(ram, rom, rec, ctx, ownerIndex, profileRequest) {
  requireWhitePlayers(profileRequest, 'White Label Stage 1 shot cadence');
  return shotCadence1491D0(ram, rom, rec, ctx, ownerIndex);
}

function postMovement148E5E(ram, rom, rec, ctx, ownerIndex) {
  autoShot148E5E(ram, rec, ownerIndex);
  if (ram.u16(WHITE_PLAYER.button2Gate) >= 4 && ram.btst8(rec + P.dirByte, 5)) {
    unreached(WHITE_PLAYER.button2Boundary,
      'the White Label held Button 2 bomb and hyper path is outside this player slice');
  }
  return shotCadence1491D0(ram, rom, rec, ctx, ownerIndex);
}

function update(ram, rom, slot, c, ctx, ownerIndex) {
  const rec = c.rec;
  const marker = ram.u8(slot + 0x07);
  ram.setU8(rec + P.playerIdx, marker);
  if (ram.btst8(rec + P.state, 0)) {
    unreached(0x1497d4, 'Version A player death state is outside the movement slice');
  }
  if (ram.u16(WHITE_PLAYER.stageClear) !== 0) {
    unreached(0x149a16, 'Version A stage-clear player state is outside the movement slice');
  }
  if (ram.bclr8(rec + P.state, 5)) {
    ram.bclr8(rec + P.flags1, 2);
    ram.setU8(rec + P.speedIdx, ram.u8(rec + P.baseSpeed));
  }
  if (ram.u8(rec + P.invuln) !== 0) {
    ram.bclr8(rec + P.state, 4);
    if (ram.u8(rec + P.invuln) !== 0xff) {
      ram.setU8(rec + P.invuln, ram.u8(rec + P.invuln) - 1);
    }
  } else {
    ram.setU8(rec + P.dirLatch, ram.u8(rec + 0x3b));
    if (ram.bclr8(rec + P.state, 4)) {
      unreached(0x14962e, 'Version A player hit handling is outside the movement slice');
    }
  }
  ram.setU16(rec + P.state, ram.u16(rec + P.state) & 0xffdf);
  if (ram.u8(rec + P.hitTimer) !== 0) {
    ram.setU8(rec + P.hitTimer, ram.u8(rec + P.hitTimer) - 1);
  }

  const p2Input = marker !== 0;
  ram.setU8(rec + P.dirByte, ram.u16(p2Input ? RAM.p2raw : RAM.p1raw) & 0xff);
  ram.setU8(rec + P.btnByte, ram.u16(p2Input ? RAM.p2edge : RAM.p1edge) & 0xff);
  ram.setU32(rec + P.velY, 0);
  if (ram.u16(WHITE_PLAYER.inputMask) !== 0) {
    ram.setU8(rec + P.dirByte, ram.u8(rec + P.dirByte) & 0x0f);
    ram.setU8(rec + P.btnByte, ram.u8(rec + P.btnByte) & 0x0f);
    ram.setU8(rec + P.invuln, 0xff);
  }

  const direction = ram.u8(rec + P.dirByte);
  const angle = rom.u8(WHITE_PLAYER.directionTable + (direction & 0x0f));
  ram.setU8(rec + P.angle, angle);
  if ((angle & 0x80) !== 0) {
    tiltDecay(ram, rec);
    return finishMovement(ram, rom, rec, ctx, ownerIndex,
      ram.u16(rec + P.posY), ram.u16(rec + P.posX), true);
  }

  let dy = 0, dx = 0;
  if (ram.u16(WHITE_PLAYER.movementDisable) === 0) {
    ({ dy, dx } = vector141B4C(rom, ram.u8(rec + P.speedIdx), angle));
    ram.setU16(rec + P.posY, u16(ram.u16(rec + P.posY) + dy));
    ram.setU16(rec + P.posX, u16(ram.u16(rec + P.posX) + dx));
  }
  ram.setU16(rec + P.velY, u16(dy));
  ram.setU16(rec + P.velX, u16(dx));
  ram.setU16(rec + P.lastVelX, u16(dx));
  return finishMovement(ram, rom, rec, ctx, ownerIndex,
    ram.u16(rec + P.posY), ram.u16(rec + P.posX), false);
}

function tick(ram, rom, slot, ctx, profileRequest, side) {
  requireWhitePlayers(profileRequest, 'White Label Stage 1 player tick');
  const c = owner(side);
  const marker = ram.u8(slot + 0x07);
  if (marker !== side) {
    throw new RangeError(`White Label type-${side + 2} owner marker ${marker} must be ${side}`);
  }
  ram.setU16(0x813090, ram.u16(0x813090) | c.liveBit);
  if (ram.bset8(slot + 0x03, 0)) return update(ram, rom, slot, c, ctx, side);
  return initialize(ram, rom, slot, c, ctx);
}

/** `$14889E`: Version A type 2, the native P1 owner. */
export function whitePlayerP1Tick14889E(ram, rom, slot, ctx, profileRequest) {
  return tick(ram, rom, slot, ctx, profileRequest, 0);
}

/** `$14891E`: Version A type 3, the native P2 owner. */
export function whitePlayerP2Tick14891E(ram, rom, slot, ctx, profileRequest) {
  return tick(ram, rom, slot, ctx, profileRequest, 1);
}
