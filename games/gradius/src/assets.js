// Loads what tools/export_assets.py and tools/export_metasprites.py pull out of
// the cartridge. Nothing under assets/ is committed -- it is ROM-derived and
// gitignored, the same arrangement games/batman/ uses.
//
// Resolved against THIS MODULE's URL, not the document's. A bare '../assets/'
// resolves relative to the page, so it only works while the page happens to sit
// one level above src/ and breaks the moment a launcher moves it.

import { bindSoundRom } from './sound.js';

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

/** assets/enemies/tables.json -> a byte reader. See romByteReader below. */
export function enemyTables(json) {
  return romByteReader(json, 'enemies/tables.json', 'enemy tables');
}

/**
 * assets/flow/tables.json -> the same byte reader for the mode-5 flow tables.
 *
 * Two ranges (wave 4): $9BCC-$9BEC, the stage-intro start positions, indexed
 * `$9BD4[$9BCC[$19] + ($3F >> 1)]` by $9B88-$9BB8; and $9785-$979C, the two
 * button-code strings $9765 matches, reached through pointers that are
 * themselves inside the block. Both are read at their CPU addresses for the
 * same reason the enemy tables are -- the second one is a POINTER TABLE the
 * ROM dereferences, and a decoded shape cannot express that.
 */
export function flowTables(json) {
  return romByteReader(json, 'flow/tables.json', 'flow tables');
}

/**
 * assets/collision/tables.json -> the same byte reader for `$C0C7` (wave 5).
 *
 * Two ranges: $BFDA-$BFE1, the four hit-box widths and four heights the sweep
 * indexes with the enemy's own box class `$0460,Y` ($C127/$C131); and
 * $C0FA-$C100, the death explosion's metasprite walk, indexed by `$0160`
 * ($C0E3 `LDA $C0FA,X`). Both are read at their CPU addresses because both are
 * indexed by a RAM byte -- a wrong index has to be a loud throw, not a
 * plausible metasprite id (the seventh byte of $C0FA is `$C101`'s `A9` opcode).
 */
export function collisionTables(json) {
  return romByteReader(json, 'collision/tables.json', 'collision tables');
}

/**
 * assets/weapons/tables.json -> the same byte reader for wave 6.
 *
 * Five ranges, every one of them indexed by a RAM byte: $A0E0-$A0E8 (the three
 * parameter tables, X = $44), $A1A4-$A1A9 (the missile's dy/dx, Y = 0 fly /
 * 1 crawl), $BE6E-$BE8F (the kill sound by enemy type, X = type AND $7F),
 * $BFCE-$BFD9 (the SHOT's hit box, Y = its subtype) and $BFC5-$BFCD (the
 * type-$9A hit threshold, Y = the rank $17).
 *
 * The enemy boxes at $BFDA/$BFDE are NOT here -- they are collision/tables.json
 * (wave 5), and the two blocks are deliberately adjacent in the ROM and
 * deliberately separate here: $BFD2,Y is the SHOT's width and $BFDA,X is the
 * ENEMY's, and the sweep at $BFFD/$C028 reads one of each.
 */
export function weaponTables(json) {
  return romByteReader(json, 'weapons/tables.json', 'weapon tables');
}

/**
 * assets/sound/tables.json -> the same byte reader for the $EC1E/$ED02 driver
 * (wave 8).
 *
 * Three ranges: $833F-$8355, the three interleaved 7-entry tables the BGM
 * selector $8357 reads with Y = $19; $ECB2-$ECB5, the four channel bases
 * ($EC42 LDX $ECB2,Y, and reading one past the end of THOSE FOUR BYTES is the
 * whole of the index-0 crash); and $EFB8-$FFF9, which is the pitch table, the
 * 64 3-byte sound records and every sequence stream IN ONE BLOCK, because
 * $EFCD-$EFCF is simultaneously record 0 and the last two entries of the pitch
 * table. The driver walks streams with a real 16-bit pointer and jumps around
 * inside them with $FD/$FE, so bytes at CPU addresses is the only shape that
 * can hold them.
 */
export function soundTables(json) {
  const t = romByteReader(json, 'sound/tables.json', 'sound tables');
  // Bound module-wide the moment the cartridge's sound ROM is decoded: the
  // driver's nine callers reach $EFCD by address, not through `res`. See the
  // note on bindSoundRom in src/sound.js.
  bindSoundRom(t);
  return t;
}

/**
 * A byte reader addressed the way the 6502 is, over a list of exported CPU
 * ranges. Shared by the enemy and flow tables.
 *
 * WHY A BYTE READER AND NOT A DECODED STRUCTURE. The spawn engine's indexing is
 * 8-bit and WRAPS ($A36D `LDA $98 / ASL / ASL` is (cmd*4) AND $FF; $A3E6
 * `ASL A / TAX` is ($66*2) AND $FF), it reads its four descriptor bytes through
 * a 16-bit pointer built by adding an offset to a table address ($A397), and it
 * walks the wave lists with a real CPU pointer in `$6A:$6B` -- which is a
 * COMPARED field against the cartridge. A pre-decoded "array of waves" can
 * express none of those three. So src/enemies.js and src/flow.js read bytes at
 * CPU addresses.
 *
 * A read outside the exported ranges THROWS with the address. It is not a
 * defensive nicety: the update loop's animator indexes $ADC1 with status*4, so
 * a status of 9 or more walks off the end of the nine groups into code, and the
 * ROM would happily return an instruction byte as a metasprite id.
 */
function romByteReader(json, file, label) {
  const blocks = json.blocks.map((b) => ({
    name: b.name,
    base: parseInt(b.rom.replace('$', ''), 16),
    bytes: Uint8Array.from(b.bytes),
  }));
  for (const b of blocks) {
    if (b.bytes.length === 0) {
      throw new Error(`assets/${file}: block ${b.name} is empty`);
    }
  }
  const hex = (a) => `$${a.toString(16).toUpperCase().padStart(4, '0')}`;
  const read = (addr) => {
    for (const b of blocks) {
      const i = addr - b.base;
      if (i >= 0 && i < b.bytes.length) return b.bytes[i];
    }
    throw new Error(
      `${label}: ${hex(addr)} is not in any exported range (`
      + blocks.map((b) => `${b.name} ${hex(b.base)}-${hex(b.base + b.bytes.length - 1)}`)
        .join(', ') + '). Either the port indexed a table out of bounds or '
      + 'export_assets.py needs to export the range.');
  };
  return { blocks, read, word: (a) => read(a) | (read(a + 1) << 8) };
}

export async function loadResources(stageIndex = 0) {
  const [manifest, tilesBuf, stages, ms, hud, enemies, flow, coll, weap, snd] = await Promise.all([
    fetchOrExplain('manifest.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('chr/tiles.u8', EXPORT).then((r) => r.arrayBuffer()),
    fetchOrExplain('terrain/stages.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('metasprites.json', EXPORT_MS).then((r) => r.json()),
    fetchOrExplain('hud/packets.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('enemies/tables.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('flow/tables.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('collision/tables.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('weapons/tables.json', EXPORT).then((r) => r.json()),
    fetchOrExplain('sound/tables.json', EXPORT).then((r) => r.json()),
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

  // `stages` is the FULL 7-entry array; runtime reads the LIVE stage as
  // `res.stages[state.zp19]` so the seamless `$96CF` transition into stage 2+
  // streams the right terrain and reads the right boss/end pages. `stage` is
  // the INITIAL stage (the one `stageIndex` selects) and is kept for the unit
  // suite, which calls `streamBlock(s, res.stage)` with stage 0 and never
  // transitions; nothing in the runtime reads `res.stage` after boot.
  return { manifest, tiles, metasprites,
           stage: stages.stages[stageIndex], stages: stages.stages,
           hudPackets: hudPacketTable(hud), enemyTables: enemyTables(enemies),
           flowTables: flowTables(flow),
           collisionTables: collisionTables(coll),
           weaponTables: weaponTables(weap),
           soundTables: soundTables(snd) };
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
