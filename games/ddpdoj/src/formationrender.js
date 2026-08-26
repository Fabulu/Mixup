// Private P3 sprite requests for the three-pilot foundation.
//
// This module never stages cartridge buckets and never calls the Boolean P1/P2
// draw paths. It owns only presentation state supplied by one attached Game.

import { P } from './machine.js';
import { i16, u16 } from './ram.js';
import { NAMED_BUCKETS, encodeRegisterRequest } from './spritequeue.js';
import { TRAIL, packD1 } from './shipsprite.js';

const STAGE_DRAW_FREEZE = 0x812970;
const STAGE_CLEAR = 0x812972;
const BODY_LONG_OFFSET = 0xfa00;
const BODY_SHORT_OFFSET = 0xfc00;
const BODY_FLIP = 0x0000;
const P3_STYLE = 6;

const TRAIL_TAPS = Object.freeze([15, 12, 9, 6, 3]);

/** Allocate every mutable P3 render value for one Game. */
export function createThreePilotRenderState() {
  return {
    requests: [],
    positionHistory: new Uint32Array(TRAIL.entries),
    imageHistory: new Uint32Array(TRAIL.entries),
    animationPhase: 0,
    animationDelay: 0,
    actorId: 0,
    hookCalls: 0,
  };
}

function clearRenderState(render) {
  render.requests.length = 0;
  render.positionHistory.fill(0);
  render.imageHistory.fill(0);
  render.animationPhase = 0;
  render.animationDelay = 0;
  render.actorId = 0;
  return render.requests;
}

function updateAnimation(render, directions, angle) {
  let limit = 0;
  let step = 0;
  if ((angle & 0x80) === 0 && (directions & 0x04) !== 0) {
    limit = -0x20;
    step = -4;
  } else if ((angle & 0x80) === 0 && (directions & 0x08) !== 0) {
    limit = 0x20;
    step = 4;
  }

  if (step === 0) {
    if (render.animationPhase < 0) render.animationPhase += 4;
    else if (render.animationPhase > 0) render.animationPhase -= 4;
    return;
  }
  if (render.animationPhase === limit) return;
  render.animationDelay--;
  if (render.animationDelay >= 0) return;
  render.animationDelay = 2;
  render.animationPhase += step;
}

function push(render, bucket, bytes) {
  render.requests.push({ bucket, bytes });
}

function seedHistory(render, position, image) {
  render.positionHistory.fill(position);
  render.imageHistory.fill(image);
}

function advanceHistory(render, position, image) {
  for (let i = TRAIL.entries - 1; i > 0; i--) {
    render.positionHistory[i] = render.positionHistory[i - 1];
    render.imageHistory[i] = render.imageHistory[i - 1];
  }
  render.positionHistory[0] = position;
  render.imageHistory[0] = image;
}

/**
 * Produce body bucket 19 and afterimage bucket 12 requests for one attached P3.
 * The trail keeps the native routine's 16 slots, five taps, phase gate, coarse skip,
 * longword bias, size, and colour. It is presentation-owned here because this
 * wave deliberately creates no P3 beam byte or weapon state.
 */
export function renderThreePilotRequests(state, game) {
  const render = state?.render;
  if (!render || !Array.isArray(render.requests)) {
    throw new TypeError('three-pilot render state is not installed');
  }
  render.hookCalls++;
  render.requests.length = 0;

  const player = state.binding?.player;
  const memory = state.memory;
  const attached = state.game === game && game?.ram && game?.tables;
  const live = attached && state.lifecycle === 'alive'
    && memory.u16(player + P.state) === 0x8000;
  if (!live || game.ram.u16(STAGE_CLEAR) !== 0
      || game.ram.u16(STAGE_DRAW_FREEZE) !== 0) {
    return clearRenderState(render);
  }

  const actorChanged = render.actorId !== state.actorId;
  if (actorChanged) clearRenderState(render);

  const selector = memory.u16(player + P.shipSel);
  if (selector !== 0 && selector !== 2) {
    throw new RangeError(`P3 ship selector ${selector} is outside the cartridge set {0, 2}`);
  }
  const style = memory.u16(player + P.optFormation);
  if (style !== P3_STYLE) {
    throw new RangeError(`P3 style ${style} is not the private style ${P3_STYLE}`);
  }

  const directions = memory.u16(state.binding.input.raw) & 0x0f;
  updateAnimation(render, directions, game.tables.angleFor(directions));
  const animation = game.tables.anim(u16(render.animationPhase), selector);
  const image = packD1(animation.a[0], animation.a[1]) >>> 0;
  const y = memory.u16(player + P.posY);
  const x = memory.u16(player + P.posX);
  const position = packD1(y, x) >>> 0;

  const bodyPosition = packD1(
    u16(i16(y) + i16(BODY_LONG_OFFSET)),
    u16(i16(x) + i16(BODY_SHORT_OFFSET)),
  );
  push(render, NAMED_BUCKETS.player,
    encodeRegisterRequest(bodyPosition, image, TRAIL.size, BODY_FLIP));

  if (actorChanged) {
    render.actorId = state.actorId;
    seedHistory(render, position, image);
    return render.requests;
  }
  advanceHistory(render, position, image);

  if (game.ram.u16(0x80390c) === 0) return render.requests;
  const coarseNow = (position & TRAIL.coarse) >>> 0;
  for (const tap of TRAIL_TAPS) {
    const oldPosition = render.positionHistory[tap] >>> 0;
    if (((oldPosition & TRAIL.coarse) >>> 0) === coarseNow) continue;
    const trailPosition = (oldPosition + TRAIL.bias) >>> 0;
    push(render, NAMED_BUCKETS.trail, encodeRegisterRequest(
      trailPosition,
      render.imageHistory[tap] >>> 0,
      TRAIL.size,
      TRAIL.flip,
    ));
  }
  return render.requests;
}
