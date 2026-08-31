// Embedded Version A reset and cold-cabinet bootstrap.
//
// The 23-call order and every cartridge table below come from Build A. The
// shared helpers are reused only where their observable RAM effect is exact.

import {
  clearLowRam23C652, clearSlotTable23C668, clearTx23C622, resetScrolls23C61E,
} from './background.js';
import { sectionFlagSet23C194 } from './displaylist.js';
import { inputAuxReset23D1F2, inputReset23D0D2 } from './frontend.js';
import { resetHud2884E2 } from './hud.js';
import { clearPlayerRam24A810, clearRankRam2603DA } from './objslot12.js';
import { objTableInit1413B6 } from './objalloc.js';
import { resetPalette2412FE, install2414BE } from './palette.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { clear1459FA } from './stageend.js';
import {
  camReset140E5C, clearWhiteSelectorFrontend15B8F2,
} from './white-hardware.js';
import { stageWhiteVersionChooser13C34C } from './white-frontend.js';

export { camReset140E5C, clearWhiteSelectorFrontend15B8F2 };

export const WHITE_RESET_PROLOGUE = Object.freeze([
  0x1563ae, 0x13c4aa, 0x146a52, 0x13c8f2, 0x13be0c, 0x14536c, 0x145398,
  0x13c590, 0x13c934, 0x13ca32, 0x18a3d4, 0x13ca66, 0x13d43e, 0x141638,
  0x1459fa, 0x13d55e, 0x1413b6, 0x15f72e, 0x140e5c, 0x1591e0, 0x149ec4,
  0x15b8f2, 0x187020,
]);

export const WHITE_RESET = Object.freeze({
  entry: 0x13c24e,
  afterCalls: 0x13c2d8,
  gaps: Object.freeze([0x1563ae, 0x13c4aa, 0x146a52, 0x13c8f2, 0x13be0c, 0x13c934, 0x18a3d4]),
  irqSite: 0x13c590,
  coinSite: 0x13ca66,
  coinTable: 0x13ca3e,
  creditTable: 0x13ca52,
  cameraSite: 0x140e5c,
  frontDrawSite: 0x1591e0,
  selectorClearSite: 0x15b8f2,
  irqTail: 0x13c556,
  irqFrom: 0x13c570,
  highScoreSite: 0x186f5c,
  sectionSite: 0x13c538,
  interruptSite: 0x13c566,
  txInstall: Object.freeze([
    Object.freeze([0x13c2f2, 0, 0x122638]),
    Object.freeze([0x13c300, 1, 0x122658]),
    Object.freeze([0x13c30e, 2, 0x122678]),
    Object.freeze([0x13c31c, 3, 0x122698]),
    Object.freeze([0x13c32a, 4, 0x1226b8]),
  ]),
});

export const WHITE_HISCORE_DEFAULTS = Object.freeze({
  site: 0x186f5c,
  entries: 5,
  hiScore: 0x81b448,
  blocks: Object.freeze([
    Object.freeze({ src: 0x186936, dst: 0x803824, size: 4, longs: 1 }),
    Object.freeze({ src: 0x18694a, dst: 0x8038b0, size: 2, longs: 1 }),
    Object.freeze({ src: 0x186954, dst: 0x803838, size: 4, longs: 3 }),
    Object.freeze({ src: 0x186990, dst: 0x80389c, size: 2, longs: 1 }),
    Object.freeze({ src: 0x18699a, dst: 0x803888, size: 2, longs: 1 }),
    Object.freeze({ src: 0x1869a4, dst: 0x803892, size: 2, longs: 1 }),
    Object.freeze({ src: 0x1869ae, dst: 0x8038a6, size: 2, longs: 1 }),
    Object.freeze({ src: 0x1869b8, dst: 0x803874, size: 2, longs: 1 }),
    Object.freeze({ src: 0x1869c2, dst: 0x80387e, size: 2, longs: 1 }),
  ]),
});

function requireWhiteReset(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'frontendBootstrap', operation);
}

function assertRam(ram, operation) {
  if (!ram || typeof ram.u8 !== 'function' || typeof ram.u16 !== 'function'
      || typeof ram.u32 !== 'function' || typeof ram.setU8 !== 'function'
      || typeof ram.setU16 !== 'function' || typeof ram.setU32 !== 'function') {
    throw new TypeError(`${operation} needs the DaiOuJou RAM interface`);
  }
}

function assertRom(rom, operation) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function') {
    throw new TypeError(`${operation} needs the DaiOuJou ROM interface`);
  }
}

/** `$13C590`: reset A's IRQ bytes and five-word hardware state, leaving `$803930` intact. */
export function irqStateReset13C590(ram) {
  ram.setU8(0x803940, 0);
  ram.setU8(0x803942, 0);
  for (const address of [0x80392e, 0x803932, 0x803934, 0x803936, 0x803938]) {
    ram.setU16(address, 0);
  }
}

/** `$13CA66`: initialize coin state from the two Version A operator tables. */
export function coinDipInit13CA66(ram, rom) {
  ram.setU16(0x803948, 0);
  ram.setU8(0x80394a, 0);
  for (let address = 0x80394b; address <= 0x80394f; address++) ram.setU8(address, 0);
  for (const address of [0x803950, 0x803952, 0x803954]) ram.setU16(address, 0);
  for (const address of [0x803958, 0x80395a, 0x80395b, 0x80395c, 0x80395e,
    0x803960, 0x803961, 0x803962]) ram.setU8(address, 0);
  const dip = ram.u8(0x803808);
  ram.setU8(0x803956, rom.u8(WHITE_RESET.coinTable + dip));
  ram.setU8(0x803957, rom.u8(WHITE_RESET.creditTable + dip));
  ram.setU8(0x803959, 2);
  ram.setU8(0x80395f, 2);
  for (const base of [0x803964, 0x80396a]) {
    ram.setU8(base, 0);
    ram.setU8(base + 1, 0);
    ram.setU16(base + 2, 0);
    ram.setU16(base + 4, 0);
  }
}

/** `$1591E0`: clear only the narrow Version A front-draw fields. */
export function frontDrawReset1591E0(ram) {
  ram.setU16(0x81e0da, 0);
  ram.setU16(0x812e08, 0);
  ram.setU16(0x812e28, 0);
  for (let address = 0x812e4c; address <= 0x812e52; address += 2) ram.setU16(address, 0);
}

function screenWipe13CA32(ram, ctx) {
  if (ctx?.videoRegs) resetScrolls23C61E(ctx.videoRegs);
  if (ctx?.tx) clearTx23C622(ctx.tx);
  ctx?.bgVram?.clear23C638?.();
  clearLowRam23C652(ram);
  if (ctx?.slotTable) clearSlotTable23C668(ctx.slotTable);
  const roots = [0x13c9ea, 0x13ca00, 0x13ca16];
  const blocks = [[0xa01000, 128], [0xa00800, 512], [0xa00000, 512]];
  for (let i = 0; i < roots.length; i++) {
    const [base, longs] = blocks[i];
    if (ctx?.hwVram?.clear) {
      ctx.hwVram.clear(base, longs * 4);
    } else {
      ctx?.unported?.note(roots[i], `$${roots[i].toString(16).toUpperCase()} clears ${longs} `
        + `longwords at $${base.toString(16).toUpperCase()} in Version A hardware VRAM`);
    }
  }
}

/** `$186F5C`: install Version A's nine factory high-score arrays in cartridge order. */
export function hiscoreDefaults186F5C(ram, rom) {
  for (const block of WHITE_HISCORE_DEFAULTS.blocks) {
    for (let i = 0; i < WHITE_HISCORE_DEFAULTS.entries; i++) {
      for (let item = 0; item < block.longs; item++) {
        const offset = (i * block.longs + item) * block.size;
        if (block.size === 4) ram.setU32(block.dst + offset, rom.u32(block.src + offset));
        else ram.setU16(block.dst + offset, rom.u16(block.src + offset));
      }
    }
    if (block.dst === 0x803824) {
      ram.setU32(WHITE_HISCORE_DEFAULTS.hiScore, ram.u32(block.dst));
    }
  }
}

/** `$13C566`: clear the IRQ shadow and follow A's `$13C570` branch to `$13C556`. */
export function interruptEnable13C566(ram, ctx) {
  ram.setU16(0x80393e, 0);
  ctx?.unported?.note(WHITE_RESET.irqTail,
    `$13C556 sets the 68000 interrupt mask to level 0 from $13C570; the browser `
    + 'vblank loop has no status register, while the RAM shadow is modeled');
  return Object.freeze({ shadow: ram.u16(0x80393e), level: 0 });
}

/** `$13C24E..$13C2D7`: execute all 23 Version A reset calls in native order. */
export function resetWhitePrologue13C24E(ram, rom, pal, ctx, profileRequest) {
  requireWhiteReset(profileRequest, 'White Label reset prologue');
  assertRam(ram, 'White Label reset prologue');
  assertRom(rom, 'White Label reset prologue');
  const calls = [];
  for (const site of WHITE_RESET_PROLOGUE) {
    let modeled = true;
    switch (site) {
      case 0x14536c: ram.setU8(0x80fa80, 0); break;
      case 0x145398:
        ram.setU16(0x80fa84, 0);
        ram.setU16(0x80fa82, 0);
        break;
      case 0x13c590: irqStateReset13C590(ram); break;
      case 0x13ca32: screenWipe13CA32(ram, ctx); break;
      case 0x13ca66: coinDipInit13CA66(ram, rom); break;
      case 0x13d43e: inputReset23D0D2(ram); break;
      case 0x141638: resetPalette2412FE(ram, pal); break;
      case 0x1459fa: clear1459FA(ram); break;
      case 0x13d55e: inputAuxReset23D1F2(ram); break;
      case 0x1413b6: objTableInit1413B6(ram); break;
      case 0x15f72e: clearRankRam2603DA(ram); break;
      case 0x140e5c: camReset140E5C(ram); break;
      case 0x1591e0: frontDrawReset1591E0(ram); break;
      case 0x149ec4: clearPlayerRam24A810(ram); break;
      case 0x15b8f2: clearWhiteSelectorFrontend15B8F2(ram); break;
      case 0x187020: resetHud2884E2(ram); break;
      default:
        modeled = false;
        ctx?.unported?.note(site, `$${site.toString(16).toUpperCase()} is an explicit `
          + 'unmodeled call in the Version A reset prologue');
        break;
    }
    calls.push(Object.freeze({ site, modeled }));
  }
  const modeled = calls.reduce((count, call) => count + Number(call.modeled), 0);
  return Object.freeze({
    calls: Object.freeze(calls),
    modeled,
    unported: calls.length - modeled,
    coinsPerCredit: ram.u8(0x803956),
    creditsPerCoin: ram.u8(0x803957),
  });
}

/** Complete cold Version A bootstrap through native type `$14` staging. */
export function bootWhiteCabinet13C24E(ram, rom, pal, ctx, profileRequest) {
  requireWhiteReset(profileRequest, 'White Label cold bootstrap');
  assertRam(ram, 'White Label cold bootstrap');
  assertRom(rom, 'White Label cold bootstrap');
  if (pal && typeof rom.bytes !== 'function') {
    throw new TypeError('White Label cold bootstrap palette installation needs ROM byte windows');
  }

  const reset = resetWhitePrologue13C24E(ram, rom, pal, ctx, profileRequest);
  hiscoreDefaults186F5C(ram, rom);
  const sectionFlagBefore = ram.u16(0x80393c);
  const ctrl = sectionFlagSet23C194(ram, ctx?.videoRegs);
  const irq = interruptEnable13C566(ram, ctx);

  let banks = 0;
  let skipped = 0;
  for (const [site, bank, source] of WHITE_RESET.txInstall) {
    if (!pal) {
      skipped++;
      ctx?.unported?.note(site, `$${site.toString(16).toUpperCase()} installs Version A text `
        + `bank ${bank} from $${source.toString(16).toUpperCase()} with no palette state`);
      continue;
    }
    install2414BE(ram, pal, bank, rom.bytes(source, 32), site,
      `$${source.toString(16).toUpperCase()} Version A reset text palette`);
    banks++;
  }

  const staged = stageWhiteVersionChooser13C34C(ram, rom, profileRequest);
  return Object.freeze({
    reset,
    hiscore: true,
    sectionFlagBefore,
    sectionFlag: ram.u16(0x80393c),
    ctrl,
    irq,
    banks,
    skipped,
    gate: staged.gate,
    made: staged.made,
  });
}
