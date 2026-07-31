// Shared test fixtures.
//
// Two kinds of input are used by this suite and they are kept apart on purpose:
//
//   * assets/  -- the ROM export. Present in any working tree that has run
//     tools/export_assets.py. Tests that need it FAIL when it is missing, they
//     do not skip, because a renderer silently running on a zero-filled tile
//     sheet is exactly the kind of green that means nothing.
//
//   * tools/oracle/out/video/  -- CAPTURED FRAMES from the running cartridge:
//     hardware OAM, palette RAM, both nametables, and Mesen's own framebuffer.
//     These are produced by an emulator run (videoprobe.py) and are not in the
//     tree by default, so tests that need them SKIP with a loud message naming
//     the command that regenerates them.
//
// The distinction matters: the first kind is "did the port build?", the second
// is "does the port agree with the cartridge?", and only the second is
// evidence.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const GAME = dirname(dirname(fileURLToPath(import.meta.url)));
export const ASSETS = join(GAME, 'assets');
export const CAPTURES = join(GAME, 'tools', 'oracle', 'out', 'video');

export function assetOrThrow(rel) {
  const p = join(ASSETS, rel);
  if (!existsSync(p)) {
    throw new Error(
      `assets/${rel} is missing. Run:\n`
      + `  python games/gradius/tools/export_assets.py\n`
      + `  python games/gradius/tools/export_metasprites.py`);
  }
  return p;
}

export const loadTiles = () => new Uint8Array(readFileSync(assetOrThrow('chr/tiles.u8')));
export const loadStages = () => JSON.parse(readFileSync(assetOrThrow('terrain/stages.json'), 'utf8'));

export function loadMetasprites() {
  const j = JSON.parse(readFileSync(assetOrThrow('metasprites.json'), 'utf8'));
  const table = {};
  for (const [k, v] of Object.entries(j.records)) table[Number(k)] = v;
  return table;
}

/** A captured frame, or null if the emulator run has not been done here. */
export function loadCapture(name) {
  const d = join(CAPTURES, name);
  if (!existsSync(join(d, 'dump.json'))) return null;
  const rd = (f) => new Uint8Array(readFileSync(join(d, f)));
  return {
    name,
    dump: JSON.parse(readFileSync(join(d, 'dump.json'), 'utf8')),
    nt: rd('nt.bin'),
    oam: rd('oam.bin'),
    pal: rd('pal.bin'),
    ram: rd('ram.bin'),
    fb: rd('fb.bin'),             // 256*240 RGB, what Mesen actually produced
  };
}

export function captureSkipMessage(name) {
  return `SKIP ${name}: no capture in tools/oracle/out/video/${name}/ `
       + `(ROM-derived; regenerate with `
       + `python games/gradius/tools/oracle/videoprobe.py --at <frame>)`;
}

/**
 * Turn a capture's `dump.json` into the frame record src/render/ppu.js wants.
 *
 * The CHR banks come out of the LATCH LOG, not out of a constant: every CNROM
 * write of the frame is recorded with the scanline it happened on, and a latch
 * in vblank (scanline >= 240) is band A's while one during the visible area is
 * the split's.
 */
export function frameFromCapture(cap) {
  const d = cap.dump;
  let bankA = 0, bankB = 0;
  for (const e of d.chrLatches) {
    if (e.sl >= 240 || e.sl < 0) bankA = e.bank; else bankB = e.bank;
  }
  const split = !!d.split_ran;
  return {
    bandA: {
      ctrl: d.bandA_ppuctrl, mask: d.bandA_ppumask,
      scrollX: d.bandA_scrollX, scrollY: d.bandA_scrollY, chrBank: bankA,
    },
    bandB: {
      ctrl: split ? d.split_bandB_ppuctrl : d.bandA_ppuctrl,
      chrBank: split ? bankB : bankA,
      ran: split,
    },
    nt: cap.nt, pal: cap.pal, oam: cap.oam,
  };
}

/** The resources src/nmi.js wants, loaded off disk instead of over fetch(). */
export function headlessResources(stageIndex = 0) {
  return {
    manifest: JSON.parse(readFileSync(assetOrThrow('manifest.json'), 'utf8')),
    tiles: loadTiles(),
    metasprites: loadMetasprites(),
    stage: loadStages().stages[stageIndex],
  };
}

/** Compare an RGBA frame against a captured 256x240 RGB framebuffer. */
export function diffAgainstFb(out, fb) {
  let bad = 0;
  const lines = new Map();
  for (let i = 0; i < 256 * 240; i++) {
    const w = out[i];
    const r = w & 0xFF, g = (w >>> 8) & 0xFF, b = (w >>> 16) & 0xFF;
    if (r !== fb[i * 3] || g !== fb[i * 3 + 1] || b !== fb[i * 3 + 2]) {
      bad++;
      const y = (i / 256) | 0;
      lines.set(y, (lines.get(y) || 0) + 1);
    }
  }
  return { bad, lines: [...lines.keys()].sort((a, b) => a - b) };
}
