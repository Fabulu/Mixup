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

import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hudPacketTable, enemyTables, flowTables,
         collisionTables, weaponTables, soundTables } from '../src/assets.js';

export const GAME = dirname(dirname(fileURLToPath(import.meta.url)));
export const ASSETS = join(GAME, 'assets');
export const CAPTURES = join(GAME, 'tools', 'oracle', 'out', 'video');

/**
 * A UNIT TEST THAT PINS THE CARTRIDGE AND IS EXPECTED TO FAIL, because the port
 * is wrong and fixing it is not this agent's job.
 *
 * The oracle comparison has had this mechanism since wave 0
 * (scenarios.json `knownFail`, tools/oracle/compare.mjs); the unit suite had
 * nothing, so a test writer forbidden from touching src/ had exactly two bad
 * options: write the assertion the PORT satisfies -- which is how wave 1 ended
 * up with a test asserting that a $5B freeze is permanent, blessing the defect
 * and BLOCKING the ROM-faithful fix -- or leave the defect unpinned.
 *
 * Semantics, deliberately the same as compare.mjs's:
 *
 *   the assertions FAIL  -> the test passes, and prints the diagnosis loudly
 *   the assertions PASS  -> THE TEST FAILS: "SURPRISE PASS". Somebody fixed the
 *                           port; unwrap the assertions and keep them.
 *
 * So the annotation retires itself and cannot rot. Every one of these carries
 * the ROM bytes it was derived from -- an unproven `knownFail` is just a
 * disabled test with a better name.
 *
 * @param {string} name  what the CARTRIDGE does (never what the port does)
 * @param {string} why   the measurement, the addresses, and who should fix it
 * @param {(t:any)=>void} fn  the assertions, written as if the port were right
 */
export function knownFail(name, why, fn) {
  test(`[knownFail] ${name}`, (t) => {
    let err = null;
    try {
      fn(t);
    } catch (e) {
      // A thrown TypeError/ReferenceError means the test itself is broken, not
      // that the port is. Only an assertion counts as the expected failure.
      if (!(e && (e.code === 'ERR_ASSERTION' || e instanceof RangeError))) throw e;
      err = e;
    }
    if (err === null) {
      throw new Error(
        `SURPRISE PASS -- the port now satisfies this and the knownFail is STALE.\n`
        + `  ${name}\n`
        + `  Delete the knownFail() wrapper in this file and keep the assertions\n`
        + `  as an ordinary test. Do not delete the assertions.\n`
        + `  Why it was annotated: ${why}`);
    }
    t.diagnostic(`KNOWN FAIL (the PORT is wrong; the assertion above is the CARTRIDGE)`);
    t.diagnostic(`  ${name}`);
    t.diagnostic(`  first failing assertion: ${String(err.message).split('\n')[0]}`);
    t.diagnostic(`  ${why.replace(/\n\s*/g, ' ')}`);
    // stderr, not stdout: the TAP stream on stdout must stay parseable, and a
    // knownFail has to be visible on a run nobody reads the diagnostics of.
    process.stderr.write(`  [knownFail] ${name}\n`);
  });
}

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
export const loadHudPackets = () =>
  hudPacketTable(JSON.parse(readFileSync(assetOrThrow('hud/packets.json'), 'utf8')));
export const loadEnemyTables = () =>
  enemyTables(JSON.parse(readFileSync(assetOrThrow('enemies/tables.json'), 'utf8')));
export const loadFlowTables = () =>
  flowTables(JSON.parse(readFileSync(assetOrThrow('flow/tables.json'), 'utf8')));
export const loadCollisionTables = () =>
  collisionTables(JSON.parse(readFileSync(assetOrThrow('collision/tables.json'), 'utf8')));
export const loadWeaponTables = () =>
  weaponTables(JSON.parse(readFileSync(assetOrThrow('weapons/tables.json'), 'utf8')));
export const loadSoundTables = () =>
  soundTables(JSON.parse(readFileSync(assetOrThrow('sound/tables.json'), 'utf8')));
export const loadScreenImages = () => {
  const j = JSON.parse(readFileSync(assetOrThrow('screens/nametables.json'), 'utf8'));
  return { playfield: Uint8Array.from(j.playfield.bytes),
           title: Uint8Array.from(j.title.bytes) };
};

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

/**
 * The six inputs the $8898 producers read, out of a capture's own RAM image.
 *
 * Shared by tests/hud.test.js and tests/terrain.test.js because both need the
 * status bar drawn with the values the CARTRIDGE had when its nametable was
 * captured -- and those values differ between captures, which is the whole
 * reason the lives producer's two suppression arms are covered at all
 * ($20 = 3 at f400, 1 at f1200, 0 at f3500).
 *
 * This is a mirror of porttrace.mjs seedFromCartridge's HUD block. It is
 * duplicated rather than imported because porttrace.mjs imports this file.
 */
export function seedHudInputs(state, ram) {
  state.zp.player = ram[0x18];              // $18
  state.lives[0] = ram[0x20];               // $20,X
  state.lives[1] = ram[0x21];
  state.zp.missile = ram[0x41];             // $41
  state.zp.meter = ram[0x42];               // $42
  state.zp.weapon = ram[0x44];              // $44
  state.zp.options = ram[0x45];             // $45
  state.zp.shield = ram[0x46];              // $46
  state.obj.status[0] = ram[0x0100];        // $0100 -- $89E3's early exit
  for (let i = 0; i < 12; i++) state.score[i] = ram[0x07E0 + i];   // $07E0-$07EB
  return state;
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
  const stages = loadStages().stages;
  return {
    manifest: JSON.parse(readFileSync(assetOrThrow('manifest.json'), 'utf8')),
    tiles: loadTiles(),
    metasprites: loadMetasprites(),
    stage: stages[stageIndex],            // the INITIAL stage (unit suite)
    stages,                               // the FULL array; runtime reads [state.zp19]
    hudPackets: loadHudPackets(),
    enemyTables: loadEnemyTables(),
    flowTables: loadFlowTables(),
    collisionTables: loadCollisionTables(),
    weaponTables: loadWeaponTables(),
    soundTables: loadSoundTables(),
    screenImages: loadScreenImages(),
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
