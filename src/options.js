// OPTIONS / sound test.  ROM: entry loc_00_3893, loop loc_00_38D5-$39E1.
//
// State 6 in the flow map, reached from the title with the cursor on OPTION.
// Three rows: GAME LEVEL (difficulty $C756), SOUND TEST ($FF80 index, $C713 the
// BCD number shown) and EXIT.
//
// The PANEL IS NOT DRAWN HERE. The title's own VRAM scripts already wrote
// "OPTION MODE / GAME LEVEL / SOUND TEST / EXIT" into the WINDOW tilemap, where
// it sits off-screen at rWY $90; this screen slides the window down to $45 and
// patches two dynamic fields into it. What LOOKS like a screen being drawn is a
// window slide plus the raster squash in raster.js.
//
// MEASURED on the cartridge inside the options loop (211 hits at $38D5, rWY
// confirmed $45 before reading anything -- an earlier probe that skipped that
// check was still on the title and produced two entirely fictitious dumps):
//
//   window row 0  OPTION MODE      row 3  NORMAL   at col 14 -> $9C6E
//   window row 2  GAME LEVEL       row 6  00       at col 16 -> $9CD0
//   window row 5  SOUND TEST       row 8  EXIT
//
// The difficulty blob ships with dest $00 $00 and sub_00_39E4 patches BOTH
// bytes -- $3A05 writes $9C into $C61B and $3A0A writes $6E into $C61C. Reading
// only the first patch gives $9C00, which lands NORMAL on top of OPTION MODE.

import { BTN } from './player.js';
import { runVramScript } from './vramscript.js';
import { GAMEPLAY_PALETTES } from './state.js';
import { drawMetasprite } from './render/metasprite.js';

/** Cursor rows. ROM: $C712 -- 0 GAME LEVEL, 1 SOUND TEST, 2 EXIT. */
export const ROW_DIFFICULTY = 0, ROW_SOUND = 1, ROW_EXIT = 2;
const ROWS = 3;

/** The blinking bat, same cycle as the title and round select (0:$3337). */
const CURSOR_IDS = [0x19, 0xC9, 0xCA, 0xCB];
const CURSOR_X = 0x28 - 8;                      // $39D9: C = $28

/** Sound-test range. $39B6 wraps the index at $2F, $39C3 the BCD at $47. */
const SOUND_MAX = 0x2E;
const SOUND_BCD_MAX = 0x46;

/** Window Y: parked ($90) and fully open ($45). ROM: $38C5 / $38D1. */
export const WY_PARKED = 0x90;
export const WY_OPEN = 0x45;

/**
 * ROM: sub_00_39E4 + sub_00_3A10 -- the only two things this screen draws.
 *
 * Both build a VRAM script in WRAM at $C61B and run it through sub_00_0A0E,
 * the same trick round select uses for its route digit. The difficulty blob
 * ships with a dest high byte of $00 which $3A05 patches to $9C, so these
 * write the WINDOW map, not the BG.
 */
function paintDifficulty(state, o) {
  const blob = state.tables?.optionsDifficulty?.[state.flow.difficulty];
  if (!blob || !o.windowMap) return;
  const script = Uint8Array.from(blob);
  script[0] = 0x9C;                             // $3A05: LD [$C61B],A
  script[1] = 0x6E;                             // $3A0A: LD [$C61C],A -- BOTH
  runVramScript(o.windowMap, script, { base: 0x9C00 });
}

/** ROM: sub_00_3A10 -- two BCD digits at $9CD0, tile = nibble + $80. */
function paintSoundNumber(state, o) {
  if (!o.windowMap) return;
  const bcd = o.soundBcd;
  runVramScript(o.windowMap, Uint8Array.from([
    0x9C, 0xD0, 0x02,                           // dest $9CD0, copy 2
    0x80 + ((bcd >> 4) & 0x0F),                 // $3A1F: high nibble
    0x80 + (bcd & 0x0F),                        // $3A29: low nibble
    0x00,
  ]), { base: 0x9C00 });
}

/**
 * Move the window. drawWindow reads windowLatchY, NOT windowY -- the latch
 * exists because the water's window register is $90 on odd frames and its
 * surface must not jump between them. Writing only windowY leaves the panel
 * invisible while every value looks correct in state.
 */
function setWindowY(state, y) {
  state.video.windowY = y;
  state.video.windowLatchY = y;
}

function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

/** ROM: BCD +1 / -1 via DAA ($39BE / $39A7). */
const bcdInc = (v) => {
  const lo = (v & 0x0F) + 1;
  let out = lo > 9 ? (v & 0xF0) + 0x10 : (v & 0xF0) | lo;
  if ((out & 0xF0) > 0x90) out = 0x00;
  return out > SOUND_BCD_MAX ? 0x00 : out;
};
const bcdDec = (v) => {
  if (v === 0) return SOUND_BCD_MAX;            // $39AF: borrow -> $46
  const lo = v & 0x0F;
  return lo === 0 ? (v & 0xF0) - 0x10 + 0x09 : v - 1;
};

/**
 * ROM: loc_00_3893, the entry.
 *
 * @param windowMap  the title's WINDOW tilemap ($9C00), mutated in place --
 *                   the panel already lives in it.
 */
export function showOptions(state, windowMap) {
  state.options = {
    cursor: ROW_DIFFICULTY,      // $38BA: $C712 = 0
    soundIndex: 0,               // $38BD: $FF80 = 0
    soundBcd: 0,                 // $38B2-ish: $C713 cleared with it
    wy: WY_PARKED,               // $38C5: park, then slide to $45
    closing: false,
    windowMap,
  };
  setWindowY(state, WY_PARKED);
  state.video.windowMap = windowMap;
  state.video.windowDither = false;   // the panel is opaque, unlike the water
  // $38A5: OBP1's shadow goes to $1B for this screen only. BGP is left alone
  // here -- the raster arm sets it to $1B per scanline once the squash starts.
  state.video.obp1 = 0x1B;

  requestSound(state, 0x25, 0x03);              // $3893: LD BC,$2503
  paintDifficulty(state, state.options);        // $3899
  paintSoundNumber(state, state.options);       // $389F
  return state.options;
}

export function hideOptions(state) {
  setWindowY(state, WY_PARKED);
  state.video.windowMap = null;
  state.video.obp1 = GAMEPLAY_PALETTES.obp1;    // $390C: back to $E4
  state.options = null;
}

/**
 * ROM: loc_00_38D5. One iteration.
 * @returns 'options' to stay, 'title' once EXIT has been taken and the window
 *          has slid back off screen.
 */
export function tickOptions(state) {
  const o = state.options;
  state.frame = (state.frame + 1) & 0xFF;
  state.video.sprites.length = 0;

  // $38C9 / $391B: the window slides one step a frame, in on entry and back
  // out on exit. Nothing else in the loop runs until it has arrived -- the
  // ROM spins on sub_00_0C1F / sub_00_0A4F in both directions.
  if (o.closing) {
    if (o.wy < 0x81) { o.wy++; setWindowY(state, o.wy); return 'options'; }
    return 'title';                             // $3934: JP loc_00_02C4
  }
  if (o.wy > WY_OPEN) {
    o.wy--;
    setWindowY(state, o.wy);
    drawCursor(state, o);
    return 'options';
  }

  const p = state.input.pressed;

  // $38D7: ANY d-pad press blips, before deciding what it does.
  if (p & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT)) requestSound(state, 0x0E);

  if (p & BTN.UP) {                             // $394A: -1, wrapping to 2
    o.cursor = o.cursor === 0 ? ROWS - 1 : o.cursor - 1;
  } else if (p & BTN.DOWN) {                    // $3959: +1, wrapping at 3
    o.cursor = o.cursor + 1 >= ROWS ? 0 : o.cursor + 1;
  } else if (p & BTN.RIGHT) {                   // $3968
    if (o.cursor === ROW_DIFFICULTY) {          // $3980: +1 wrapping at 3
      state.flow.difficulty = state.flow.difficulty + 1 >= 3
        ? 0 : state.flow.difficulty + 1;
      paintDifficulty(state, o);                // $398C
    } else if (o.cursor === ROW_SOUND) {        // $39B3
      o.soundIndex = o.soundIndex + 1 > SOUND_MAX ? 0 : o.soundIndex + 1;
      o.soundBcd = bcdInc(o.soundBcd);
      paintSoundNumber(state, o);               // $39CB
    }
  } else if (p & BTN.LEFT) {                    // $3974
    if (o.cursor === ROW_DIFFICULTY) {          // $3991: -1 wrapping to 2
      state.flow.difficulty = state.flow.difficulty === 0
        ? 2 : state.flow.difficulty - 1;
      paintDifficulty(state, o);
    } else if (o.cursor === ROW_SOUND) {        // $399C
      o.soundIndex = o.soundIndex === 0 ? SOUND_MAX : o.soundIndex - 1;
      o.soundBcd = bcdDec(o.soundBcd);
      paintSoundNumber(state, o);
    }
  } else if (p & BTN.A) {                       // $3937: A only on SOUND TEST
    if (o.cursor === ROW_SOUND) {
      // $393F: B = $FF80, C = $03 -- the raw index, and mask $03 so it
      // replaces whatever is playing. This is how the sound test auditions
      // music as well as effects.
      requestSound(state, o.soundIndex, 0x03);
    }
  } else if (p & BTN.START) {                   // $38F8: START only on EXIT
    if (o.cursor === ROW_EXIT) {
      o.closing = true;                         // $3905 onward
      o.cursor = ROW_DIFFICULTY;
      o.soundBcd = 0;
      state.video.obp1 = GAMEPLAY_PALETTES.obp1;   // $390C
      state.raster.closing = 1;                 // $3910: $C766 = 1
      requestSound(state, 0x25, 0x03);          // $3915
      return 'options';
    }
  }

  drawCursor(state, o);
  return 'options';
}

/** ROM: $39CE -- cursor Y from the 3-byte table at 1:$7C5C, X fixed at $28. */
function drawCursor(state, o) {
  const manifest = state.titleManifest;
  const ys = state.tables?.optionsCursorY;
  if (!manifest || !ys) return;
  const id = CURSOR_IDS[(state.frame & 0x18) >> 3];
  drawMetasprite(state, manifest.metasprites.table1, id,
                 CURSOR_X, (ys[o.cursor] ?? ys[0]) - 16, 0);
}
