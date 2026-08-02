#!/usr/bin/env node
// THE WAVE-18 BACKGROUND-ELEMENT GATE -- `src/background.js` against the board,
// frame for frame, on the element slots AND their bucket-2 staged bytes.
//
//   node tools/w18gate.mjs [tsv] [--k 1620] [--break delete-handler0-data]
//
// WHAT THIS IS. `scrollportgate.mjs` proved the scroll program, the camera and
// the clock at 0 divergent over 10,431 frames. This runs the SAME port object
// over the W18 element-window TSV (`w18elem.lua`'s recording) and compares the
// things W18 owns: the 8 element slots' live mask/count (every constructor
// writes `+8`, the field the recorder masks), and the 12-byte sprite records
// the updaters stage into bucket 2 via `$23DF2A` (PC `$23DF4E`). The done-when
// (20-plan §2 W18) is the first three elements at 0 divergent on both.
//
// WHAT IS SUPPLIED FROM THE BOARD (declared, not discovered):
//   $813176 scrollDelta -- the cross axis is a function of the PLAYER RECORD
//            and this TSV carries no player; the driver subtracts it from
//            every slot's +4 each frame, so it is fed in (`pgm.py flyaround`
//            drives and compares it instead).
//   $813170 scrollPrev -- ditto; op $10 reads it once per spawn.
//   $81316E crossDelta -- for $240C22 (the TX camera), which produces the
//            $80B03C the elements read through $24179E. The port computes
//            $80B03C itself; $81316E is compared as a watch below.
//   $813096 stage index x4, $8130D2 freeze (window ends at its first rising
//            edge -- see scrollportgate's header for the intra-frame reason).
//
// WHAT IS COMPARED: emask/ecount, the element-sourced staged bytes (the port
// stages ONLY element records, so the board's stream is filtered to PC
// `$23DF4E`), and $80B03C as a sanity watch (it is what every element reads).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import {
  makeBackground, BgVram, VideoRegs, uploadRegs, BGRAM, CAM, ESLOT,
} from '../src/background.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// w18elem.lua's row (TAB-separated). 1-based there, 0-based here.
//   lf d0ce d0d2 d190 d176 d170 d096 d16e b03c(long) shake emask ecount stream
const COL = {
  lf: 0, d0ce: 1, d0d2: 2, d176: 4, d170: 5, d096: 6, d16e: 7, b03c: 8,
  emask: 10, ecount: 11, stream: 12,
};
const B2_BASE = 0x805cc8;   // $23DF2A lea
const B2_COUNT = 0x80afc4;  // $23DF4E addi.w #$C
const ELEM_PC = 0x23df4e;   // the element stage's counter-bump PC

/** Mutations declared GREEN on this gate, before the run, with a reason. */
export const EXPECTED_GREEN = {};

export const MUTATIONS = {
  'delete-handler0-data': "zero handler 0's constructor `data` field "
    + '($22CBCC -> 0). Must diverge the staged bytes of every frame element 0 '
    + '(id 12, the first BGELEM) is alive, and NOTHING else -- the slot mask '
    + 'is unaffected because +8 is still written',
};

function readTsv(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const p = line.split('\t');
    if (p.length < 13) continue;
    out.push(p);
  }
  return out;
}

/** The port's element-slot live mask/count, computed exactly as the recorder
 *  does: a slot is "live" when its +8 (updater pointer) is non-zero. */
function elemMask(ram) {
  let m = 0, n = 0;
  for (let s = 0; s < 8; s++) {
    if (ram.u32(BGRAM.elemSlots + s * 0x20 + ESLOT.update) !== 0) {
      m |= (1 << s); n++;
    }
  }
return { m, n };
}

/** The 12-byte records the port staged this frame, as 24-hex strings (the
 *  recorder's format). Reads $805CC8 + 0 .. counter, then the caller drains. */
function portStaged(ram) {
  const n = ram.u16(B2_COUNT) / 12;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = B2_BASE + i * 12;
    const pos = ram.u32(o), data = ram.u32(o + 4), y = ram.u16(o + 8), k = ram.u16(o + 10);
    out.push((`${pos.toString(16).padStart(8, '0')}${data.toString(16).padStart(8, '0')}`
      + `${y.toString(16).padStart(4, '0')}${k.toString(16).padStart(4, '0')}`).toUpperCase());
  }
  return out;
}

/** The board's element records for a frame: the stream column filtered to the
 *  element stage PC, keeping only the 24-hex payload. */
function boardStaged(streamCell) {
  if (!streamCell) return [];
  const out = [];
  for (const entry of streamCell.split(',')) {
    const idx = entry.indexOf(':');
    if (idx < 0) continue;
    const pc = parseInt(entry.slice(0, idx), 16);
    if (pc === ELEM_PC) out.push(entry.slice(idx + 1));
  }
  return out;
}

export function gate(tsvPath, { k = 1620, mutate = null, tablesPath = null } = {}) {
  const rows = readTsv(tsvPath);
  const tables = JSON.parse(readFileSync(
    tablesPath ?? `${HERE}../rip/port/player.tables.json`, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const video = new VideoRegs();
  const unportedLog = new UnportedLog();
  const ctx = { unportedLog };
  const A5 = 0x80e240;                        // object slot 0 ($2410C4 lea)

  ram.setU16(BGRAM.stageX4, parseInt(rows[0][COL.d096], 16));
  ram.setU16(A5 + 0x06, 0);                   // ($6,A5) entry clock 0 -- stage start
  const handler = makeBackground(rom, vram, { mutate, crossFromBoard: true });

  // the three warm-up dispatches (init + bset#1 + bset#3)
  for (let i = 0; i < 3; i++) handler(ram, A5, 0, ctx);

  const first = { emask: null, ecount: null, stream: null, b03c: null };
  const div = { emask: 0, ecount: 0, stream: 0, b03c: 0 };
  let compared = 0, last = k, frozenAt = null, elemFrames = 0;
  let prevClock = null;

  for (const r of rows) {
    const lf = Number(r[COL.lf]);
    if (lf <= k) continue;
    const d0ce = parseInt(r[COL.d0ce], 16);
    if (prevClock !== null && prevClock !== 0 && d0ce === 0) break;  // stage end
    prevClock = d0ce;
    if (parseInt(r[COL.d0d2], 16) !== 0) { frozenAt = lf; break; }   // window ends

    // ---- the inputs (all declared in the header) ----
    ram.setU16(BGRAM.bgFreeze, 0);
    ram.setU16(BGRAM.scrollDelta, parseInt(r[COL.d176], 16));
    ram.setU16(BGRAM.scrollPrev, parseInt(r[COL.d170], 16));
    ram.setU16(BGRAM.crossDelta, parseInt(r[COL.d16e], 16));
    ram.setU16(BGRAM.stageX4, parseInt(r[COL.d096], 16));
    ram.setU16(B2_COUNT, 0);                  // drain bucket 2 (the display list)

    uploadRegs(ram, video);
    handler(ram, A5, 0, ctx);

    // ---- compare ----
    const em = elemMask(ram);
    const boardEmask = parseInt(r[COL.emask], 10);   // recorder writes %d
    const boardEcount = parseInt(r[COL.ecount], 10);
    if (em.m !== boardEmask) {
      div.emask++;
      if (!first.emask) first.emask = { lf, port: em.m, board: boardEmask };
    }
    if (em.n !== boardEcount) {
      div.ecount++;
      if (!first.ecount) first.ecount = { lf, port: em.n, board: boardEcount };
    }
    const ps = portStaged(ram);
    const bs = boardStaged(r[COL.stream]);
    const sIdx = ps.findIndex((x, i) => x !== bs[i]);
    if (ps.length !== bs.length || sIdx >= 0) {
      div.stream++;
      if (!first.stream) {
        first.stream = { lf, port: ps[sIdx] ?? `(none, port has ${ps.length})`,
          board: bs[sIdx] ?? `(none, board has ${bs.length})` };
      }
    }
    if (em.n > 0 || bs.length > 0) elemFrames++;
    // $80B03C sanity watch (the longword the elements read through $24179E)
    const portB03c = ram.u32(CAM.txNegL);
    const boardB03c = parseInt(r[COL.b03c], 16);
    if (portB03c !== boardB03c) {
      div.b03c++;
      if (!first.b03c) first.b03c = { lf, port: portB03c, board: boardB03c };
    }
    compared++; last = lf;
  }

  return { compared, last, frozenAt, first, div, elemFrames, unportedLog };
}

function main() {
  const argv = process.argv.slice(2);
  const opts = { tsv: `${HERE}oracle/out/w18-elem.tsv`, k: 1620, break: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--break') opts.break = argv[++i];
    else if (argv[i] === '--k') opts.k = Number(argv[++i]);
    else if (!argv[i].startsWith('--')) opts.tsv = argv[i];
  }
  if (opts.break && !MUTATIONS[opts.break]) {
    console.error(`unknown mutation "${opts.break}"; have: ${Object.keys(MUTATIONS).join(', ')}`);
    return 2;
  }
  const { tsv, k, break: brk } = opts;
  console.log(`TSV   ${tsv}`);
  console.log(`MUTATE ${brk ?? '(none)'}`);
  const res = gate(tsv, { k, mutate: brk });
  const green = res.div.emask === 0 && res.div.ecount === 0 && res.div.stream === 0;
  console.log(`FRAMES ${res.compared} compared (lf${k + 1}..${res.last})`
    + (res.frozenAt ? `, window ended at lf${res.frozenAt} ($8130D2 rose)` : '')
    + `, ${res.elemFrames} with active elements`);
  console.log(`DIVERGENT emask=${res.div.emask} ecount=${res.div.ecount} `
    + `staged=${res.div.stream} b03c=${res.div.b03c}`);
  for (const [c, f] of Object.entries(res.first)) {
    if (!f) continue;
    const v = c === 'stream'
      ? `port=${f.port} board=${f.board}`
      : `port=${f.port} board=${f.board}`;
    console.log(`  first ${c} divergence @ lf${f.lf}: ${v}`);
  }
  console.log(green ? 'GATE GREEN' : 'GATE RED');
  return green ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
