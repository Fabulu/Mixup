// VRAM helpers that are not the script interpreter.  ROM: sub_00_34A4.
//
// The port does not emulate VRAM in general -- levels carry their tiles as a
// decoded cache. These exist for the screens that are BUILT rather than loaded:
// the title, the menus, the intro cards and the ending, all of which assemble a
// real $8000-$9FFF image out of block copies, fills and VRAM scripts.

/** `vram[0]` is this CPU address. */
export const VRAM_BASE = 0x8000;

/**
 * Clear the BG tilemap.  ROM: sub_00_34A4.
 *
 * The original does this with the STACK, not a loop: it points SP at $9A3F and
 * PUSHes DE 287 times, writing two bytes a push downwards, then stores the
 * fill byte at $9800 by hand ($34B7).
 *
 * That leaves a real edge worth reproducing. The pushes cover $9801-$9A3E and
 * the explicit store covers $9800, so the filled range is $9800-$9A3E -- 575
 * bytes. A 32x18 visible screen is 576. **$9A3F is never written**, so the
 * bottom-right corner of the visible map keeps whatever was there before.
 * Filling a tidy 576 bytes instead puts one wrong tile on screen.
 */
export function fillTilemap(vram, value) {
  const start = 0x9800 - VRAM_BASE;
  const end = 0x9A3E - VRAM_BASE;             // inclusive; $9A3F stays put
  vram.fill(value & 0xFF, start, end + 1);
}

/**
 * The VRAM state the boot path leaves before any screen is built.
 * ROM: $01AB-$01C9 and $0223-$022C.
 *
 * Same stack trick as sub_00_34A4, one size up: SP = $9FFF and 1023 PUSHes of
 * $2F2F cover $9801-$9FFE, then $9800 is stored by hand ($01BB). So the filled
 * range is $9800-$9FFE and **$9FFF is never written** -- the identical
 * off-by-one, at the other end of the map.
 *
 * Then $8000-$97FF is zeroed ($01C1), and $9C00-$9CDF gets $2F again ($0223),
 * which the big fill has already covered. Reproduced because it is what runs,
 * and because a later change to either fill would otherwise silently diverge.
 */
export function bootClearVram(vram) {
  vram.fill(0x2F, 0x9800 - VRAM_BASE, 0x9FFF - VRAM_BASE);   // $9800-$9FFE
  vram.fill(0x00, 0x8000 - VRAM_BASE, 0x9800 - VRAM_BASE);   // $01C1: tiles
  vram.fill(0x2F, 0x9C00 - VRAM_BASE, 0x9CE0 - VRAM_BASE);   // $0223: redundant
}

/**
 * Check a manifest screen block before indexing into it.
 *
 * Without this a stale cached manifest -- one that has `title` but predates
 * `tiles`, say -- surfaces as "cannot read properties of undefined (reading
 * 'map')", which names neither the file nor the field and sends you looking at
 * the code rather than at the cache. Reported from a phone that had a mixed
 * copy while the same build was fine on desktop.
 */
export function requireScreenSpec(spec, name) {
  const missing = ['tiles', 'scripts', 'fill'].filter((k) => spec?.[k] === undefined);
  if (!spec || missing.length) {
    throw new Error(
      `assets/manifest.json ${!spec ? 'has no "' + name + '" section'
        : '"' + name + '" is missing: ' + missing.join(', ')}. `
      + 'Most likely a stale cached copy -- hard-reload the page. '
      + 'If that does not help, re-run: python tools/export_assets.py');
  }
  return spec;
}

/** ROM: sub_00_09FB, the byte-at-a-time block copier. */
export function blockCopy(vram, dest, bytes) {
  const at = dest - VRAM_BASE;
  if (at < 0 || at + bytes.length > vram.length) {
    throw new Error(`block copy to $${dest.toString(16)} leaves VRAM`);
  }
  vram.set(bytes, at);
}

/**
 * Build the title screen's VRAM the way the cartridge does.
 * ROM: the boot path through $01AB, then $022E / $027D / $0291 / $02AB.
 *
 * Replaces what used to be assets/title.vram.bin, an 8 KB snapshot of the
 * finished article. tools/oracle/titlediff.mjs holds the two against each
 * other: all 8192 bytes agree.
 *
 * @param spec  manifest.title -- {tiles: [{dest, bytes}], scripts: [], fill}
 * @param run   the VRAM script interpreter (passed in to keep this module free
 *              of a cycle back through vramscript.js)
 */
export function buildTitleVram(spec, run) {
  const vram = new Uint8Array(0x2000);
  bootClearVram(vram);

  // The tile bitmaps land first: the boot path copies them before the
  // copyright screen, and $01C1's clear has already run by then.
  for (const t of spec.tiles) blockCopy(vram, t.dest, t.bytes);

  // $022E runs the copyright script, then $027D re-clears the BG map before
  // the title's own two scripts. Order matters -- the fill would erase the
  // copyright text if it came second, which is exactly what it is for.
  run(vram, spec.scripts[0]);
  fillTilemap(vram, spec.fill);
  run(vram, spec.scripts[1]);
  run(vram, spec.scripts[2]);
  return vram;
}

/**
 * Build the round-select / continue screen.  ROM: $035B-$0372.
 *
 * Applied ON TOP of the title's VRAM -- the cartridge never reclears the tile
 * area between the two, it refills the BG map to $00 and adds its own artwork
 * over what the title left. Starting from a blank buffer instead leaves the
 * shared font blob half-missing, because only part of it is recopied.
 *
 * Order matters and is not the title's: the fill comes FIRST here, before the
 * copies and the single script.
 *
 * @param titleVram  the finished title image; copied, not mutated
 */
export function buildRoundSelectVram(spec, run, titleVram) {
  const vram = Uint8Array.from(titleVram);
  fillTilemap(vram, spec.fill);                 // $0361: D = $00
  for (const t of spec.tiles) blockCopy(vram, t.dest, t.bytes);
  for (const s of spec.scripts) run(vram, s);
  return vram;
}
