// Private Build A Stage 1 world composition. This is deliberately not wired to Game.

import { asr, i16 } from './ram.js';
import { makeBackground } from './background.js';
import { buildDisplayList } from './displaylist.js';
import { enemyHandlerMap } from './enemyframe.js';
import { ObjOrder, runObjectDriver } from './objdriver.js';
import { WorkBudget } from './budget.js';
import { UnportedLog, unreached } from './unported.js';
import { resetAndInstallStage26331E } from './spawn.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { createWhiteStage1Handlers } from './white-runtime.js';
import { bootWhiteCabinet13C24E } from './white-reset.js';
import { WHITE_WORLD_RESOURCES } from './world-resources.js';

function createWorldMoveTables(rom, resources) {
  const v = resources.movement;
  return Object.freeze({
    vector(speedIndex, angleByte) {
      const angle = angleByte & 0x3f;
      const table = rom.u32(v.speedPointers + (speedIndex & 0xff) * 4);
      const folded = rom.u16(v.fold + angle * 8);
      if ((folded & 7) !== 0 || folded > 64 * 8) {
        unreached(v.fold + angle * 8, `world movement fold $${folded.toString(16)} escaped`);
      }
      let dy = asr(rom.u32(table + folded), 4);
      let dx = asr(rom.u32(table + folded + 4), 4);
      const quadrant = angle & 0x30;
      if (quadrant === 0x10) dy = -dy;
      else if (quadrant === 0x20) { dy = -dy; dx = -dx; }
      else if (quadrant === 0x30) dx = -dx;
      return { dy: i16(dy), dx: i16(dx) };
    },
  });
}

/** Create the capability-gated private White Label Stage 1 machine. */
export function createWhiteStage1Machine(
  rom, pal, vram, profileRequest = WHITE_LABEL_PROFILE,
) {
  const profile = resolveGameProfile(profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1WorldPrivate',
    'private White Label Stage 1 world machine');
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function' || typeof rom.bytes !== 'function') {
    throw new TypeError('private White Label Stage 1 world machine needs cartridge windows');
  }
  if (!vram || typeof vram.setLong !== 'function') {
    throw new TypeError('private White Label Stage 1 world machine needs background VRAM');
  }

  const resources = WHITE_WORLD_RESOURCES;
  const tables = createWorldMoveTables(rom, resources);
  const enemyHandlers = enemyHandlerMap(rom, resources);
  const handlers = createWhiteStage1Handlers(rom, profile);
  handlers.set(1, makeBackground(rom, vram, {}, resources));

  const privateWorld = Object.freeze({
    resources, tables, enemyHandlers,
    resetSpawn(ram, suppliedRom, ctx) {
      if (suppliedRom !== rom) throw new TypeError('White world reset cartridge changed');
      return resetAndInstallStage26331E(
        ram, rom, ctx?.unportedLog, ctx?.prot, ctx?.stageScriptInstallHook, resources,
      );
    },
  });

  function context(ctx = {}) {
    if (!ctx || typeof ctx !== 'object') throw new TypeError('White machine context must be an object');
    const log = ctx.unportedLog ?? ctx.unported ?? new UnportedLog();
    Object.assign(ctx, {
      profile, runtime, rom, palette: ctx.palette ?? pal,
      unportedLog: log, unported: log,
      budget: ctx.budget ?? new WorkBudget(), order: ctx.order ?? new ObjOrder(),
      stage1WorldPrivate: privateWorld,
    });
    return ctx;
  }

  return Object.freeze({
    boot(ram, ctx = {}) {
      const c = context(ctx);
      return bootWhiteCabinet13C24E(ram, rom, pal, c, profile);
    },
    step(ram, ctx = {}) {
      const c = context(ctx);
      c.budget.beginFrame();
      const objects = runObjectDriver(ram, handlers, c);
      const displayList = buildDisplayList(ram, {
        warn: c.warn, videoRegs: c.videoRegs,
        virtualRequests: c.virtualRequests, resources,
      });
      return Object.freeze({ objects, enemyFrame: c.enemyFrame ?? null, displayList });
    },
    handlers,
    profile,
  });
}
