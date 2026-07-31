// Loads what tools/export_assets.py and tools/export_metasprites.py pull out of
// the cartridge. Nothing under assets/ is committed -- it is ROM-derived and
// gitignored, the same arrangement games/batman/ uses.
//
// Resolved against THIS MODULE's URL, not the document's. A bare '../assets/'
// resolves relative to the page, so it only works while the page happens to sit
// one level above src/ and breaks the moment a launcher moves it.

const BASE = new URL('../assets/', import.meta.url).href;

async function fetchOrExplain(rel, how) {
  const r = await fetch(BASE + rel);
  // Checking r.ok is not optional here. A 404 on a .bin yields an EMPTY
  // ArrayBuffer, so the tile sheet comes out zero-filled and the game draws a
  // WRONG PICTURE instead of throwing -- which stays invisible to every
  // headless check, because they compare state and never load the tiles.
  if (!r.ok) throw new Error(`assets/${rel} missing (${r.status}). Run: ${how}`);
  return r;
}

const EXPORT = 'python games/gradius/tools/export_assets.py';
const EXPORT_MS = 'python games/gradius/tools/export_metasprites.py';

/**
 * assets/hud/packets.json -> the array src/hudpackets.js indexes.
 *
 * One Uint8Array per canned packet, RAW: the $FF/$FE/$FD control codes stay in,
 * because $85F3 is what interprets them. Indexed by packet id, so the array is
 * built by `index` rather than by position -- a table with a missing entry must
 * come out as a hole that throws at $85F7, not as a silent shift.
 */
export function hudPacketTable(json) {
  const out = [];
  for (const p of json.packets) out[p.index] = Uint8Array.from(p.bytes);
  if (out.length !== json.table.entries) {
    throw new Error(`assets/hud/packets.json: ${out.length} packets for a `
                  + `${json.table.entries}-entry table at ${json.table.rom}`);
  }
  return out;
}

export async function loadResources(stageIndex = 0) {
  const [manifest, tilesBuf, stages, ms, hud] = await Promise.all([
    fetchOrExplain('manifest.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('chr/tiles.u8', EXPORT).then((r) => r.arrayBuffer()),
    fetchOrExplain('terrain/stages.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('metasprites.json', EXPORT_MS).then((r) => r.json()),
    fetchOrExplain('hud/packets.json', EXPORT).then((r) => r.json()),
  ]);

  const tiles = new Uint8Array(tilesBuf);
  // 2048 tiles x 64 bytes: 4 CHR banks x 2 pattern tables x 256 tiles, one byte
  // per pixel. Asserted rather than trusted, because a short read here is
  // exactly the silent-wrong-picture case above.
  if (tiles.length !== 2048 * 64) {
    throw new Error(`chr/tiles.u8 is ${tiles.length} bytes, expected ${2048 * 64}`);
  }

  const metasprites = {};
  for (const [k, v] of Object.entries(ms.records)) metasprites[Number(k)] = v;

  return { manifest, tiles, metasprites, stage: stages.stages[stageIndex],
           hudPackets: hudPacketTable(hud) };
}

/** The frame rate, read from game.json. It is spelled ONCE, in that file. */
export async function loadGameJson() {
  const r = await fetch(new URL('../game.json', import.meta.url).href);
  if (!r.ok) throw new Error(`game.json missing (${r.status})`);
  return r.json();
}

/**
 * Palettes. NOT decoded from the ROM's `$FD`/`$FE`/`$FF` canned-packet script
 * -- that format has never been transcribed. What the manifest claims is
 * narrower and checkable: these ROM bytes are byte-identical to palette RAM
 * MEASURED on the cartridge at a stage-1 gameplay frame. Entries carrying
 * `corroboration: null` have no such measurement and are not used here.
 */
export function gameplayPalette(manifest) {
  const p = manifest.palettes;
  const out = new Uint8Array(32);
  out.set(p['gameplay.bg01'].colours, 0x00);   // $3F00-$3F07, measured
  out.set(p['bgHigh.entry8'].colours, 0x08);   // $3F08-$3F0F, measured
  out.set(p['gameplay.sprites'].colours, 0x10);// $3F10-$3F1F, measured
  return out;
}
