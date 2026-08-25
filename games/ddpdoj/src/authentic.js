// Authentic Black Label Version-B cartridge selection.
//
// This is deliberately separate from mods.  The browser seed is already a live
// mid-stage snapshot, so changing only the two selector mailboxes would leave
// the initialized player record and option template stale.

import { MACHINE, P, RAM, OPT } from './machine.js';
import { runOptionObject } from './options.js';
import {
  install24150A, materializeSpriteTextPalette, paletteSet241688,
} from './palette.js';
import { BUCKETS } from './spritequeue.js';

export const AUTHENTIC_SHIPS = Object.freeze([0, 2]);
export const AUTHENTIC_STYLES = Object.freeze([2, 4, 6]);
export const DEFAULT_AUTHENTIC_SELECTION = Object.freeze({ ship: 0, style: 2 });

/** Cartridge table indexes used by `$2491C0`, including the default pair. */
export function authenticSelectionIndices(ship, style) {
  if (!AUTHENTIC_SHIPS.includes(ship) || !AUTHENTIC_STYLES.includes(style)) return null;
  const doubledStyle = (style - 2) * 2;
  return Object.freeze({
    initial: 0x2551ea + ship * 4,
    powerOffset: (doubledStyle + ship) * 4,
    speedIndex: doubledStyle + ship,
    rampIndex: doubledStyle * 2 + ship * 2,
  });
}

export function normalizeAuthenticSelection(value) {
  if (!value || typeof value !== 'object') return null;
  const ship = value.ship ?? DEFAULT_AUTHENTIC_SELECTION.ship;
  const style = value.style ?? DEFAULT_AUTHENTIC_SELECTION.style;
  if (!AUTHENTIC_SHIPS.includes(ship) || !AUTHENTIC_STYLES.includes(style)) return null;
  if (ship === DEFAULT_AUTHENTIC_SELECTION.ship
      && style === DEFAULT_AUTHENTIC_SELECTION.style) return null;
  return Object.freeze({ ship, style });
}

export function authenticSelectionFromParams(params) {
  const hasShip = params?.has?.('ship') ?? false;
  const hasStyle = params?.has?.('style') ?? false;
  if (!hasShip && !hasStyle) return null;
  const shipText = hasShip ? params.get('ship') : '0';
  const styleText = hasStyle ? params.get('style') : '2';
  if (!AUTHENTIC_SHIPS.map(String).includes(shipText)
      || !AUTHENTIC_STYLES.map(String).includes(styleText)) return null;
  return normalizeAuthenticSelection({ ship: Number(shipText), style: Number(styleText) });
}

/** Empty for the exact default, otherwise the complete selector query. */
export function authenticSelectionQuery(value) {
  const selected = normalizeAuthenticSelection(value);
  return selected ? `?ship=${selected.ship}&style=${selected.style}` : '';
}

/**
 * Recreate the 33 option passes between P1 creation at LF1968 and the LF2000
 * browser seed. The replay runs on a RAM clone, so its temporary sprite queues,
 * counters, and phase writes cannot advance the live mid-stage world.
 * Only the cartridge-derived P1 option block returns to live RAM.
 */
function warmAuthenticOptions(game) {
  if (!game.tables) return;

  const replay = game.ram.clone();
  for (let frame = 0; frame < 33; frame++) {
    replay.setU8(RAM.altPhase, frame % 2 === 0 ? 1 : 0);
    for (const bucket of BUCKETS) replay.setU16(bucket.counter, 0);
    runOptionObject(replay, { rom: game.rom, tables: game.tables });
  }
  const begin = RAM.p1Options - MACHINE.ramBase;
  game.ram.b.set(replay.b.subarray(begin, begin + OPT.stride), begin);
}

/**
 * Apply an explicit non-default P1 selection to an already constructed ordinary
 * browser Game. Every derived value below is the direct read performed by the
 * cartridge's `$2491C0` initializer. A full Game also replays the bounded option
 * history that happened before the LF2000 seed; a small unit fixture without
 * movement tables retains the initializer's `$8000` option state.
 */
export function applyAuthenticSelection(game, value) {
  const selected = normalizeAuthenticSelection(value);
  if (!selected) return null;

  const { ram, rom } = game;
  const { ship, style } = selected;
  const { initial, powerOffset, speedIndex, rampIndex } =
    authenticSelectionIndices(ship, style);
  const rec = RAM.player1;

  ram.setU16(0x813084, ship);                              // $2491FC source
  ram.setU16(0x813088, style);                             // $249204 source
  ram.setU8(0x813008, ship / 2);                           // saved ship cursor
  ram.setU8(0x813009, (style - 2) / 2);                    // saved style cursor
  ram.setU16(rec + P.shipSel, ship);
  ram.setU16(rec + P.optFormation, style);

  const styleValue = rom.u8(0x2551fa + (style - 2));       // cartridge style lookup
  ram.setU8(rec + 0x24, styleValue);
  ram.setU8(rec + 0x25, styleValue);

  ram.setU32(rec + P.animA, rom.u32(initial));             // $249432
  ram.setU32(rec + P.hitYPlus, rom.u32(initial + 4));

  ram.setU32(0x8127e4, rom.u32(0x25520c + powerOffset));   // $249368..$249376
  ram.setU32(0x8127e8, rom.u32(0x255210 + powerOffset));

  const speed = rom.u8(0x255200 + speedIndex);             // $24944A..$2494A0
  ram.setU8(rec + P.speedIdx, speed);                      // $2494C0
  ram.setU8(rec + P.baseSpeed, speed);                     // $2494C4
  ram.setU8(rec + P.laserFloor, rom.u8(0x255201 + speedIndex));
  ram.setU8(rec + P.invuln, 0xd0);                           // measured LF2000 timer
  ram.setU16(rec + 0x2c, rom.u16(0x2552c4 + rampIndex));  // $2494D4
  ram.setU16(rec + 0x36, rom.u16(0x2552c6 + rampIndex));  // $2494D8

  for (let word = 0; word < 50; word++) {
    ram.setU16(RAM.p1Options + word * 2, 0);
  }
  ram.setU16(RAM.p1Options + OPT.state, 0x8000);           // $2492C8
  warmAuthenticOptions(game);

  // `$25F456` indexes the three eight-byte style records at `$25F868`; each
  // record's second longword is the 64-byte source installed as sprite bank 23.
  // `$25CDB0` separately calls `$241688` with D0 = 0 for P1. Its D1 gate selects
  // fighter 0's arm at zero and fighter 2's arm at nonzero. Copy only the
  // resulting sprite and text regions: entering `$24133C` here would also run
  // the unrelated `$241404` background fade one extra time.
  if (game.palette) {
    const styleRow = 0x25f868 + (style - 2) * 4;
    const stylePalette = rom.u32(styleRow + 4);
    install24150A(ram, game.palette, 0x17, rom.bytes(stylePalette, 64),
      0x25f456, 'selected style presentation palette');
    paletteSet241688(ram, game.palette, rom, 0, ship / 2);
    materializeSpriteTextPalette(ram, game.palette);
  }

  return selected;
}
