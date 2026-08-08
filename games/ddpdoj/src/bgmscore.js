// THE BGM SCORE DATA -- Wave C7a. The parsed ~7.2 KB score blob resident in the
// uploaded Z80 image (z80ram.bin), decoded into a JS structure the BGM sequencer
// (src/sequencer.js) consumes at runtime.
//
// See docs/worklog/ddpdoj/145-recon-c7-bgm.md (the C7 recon) and
// 147-impl-sound-c7-bgm.md sec 0 (the premise check, every address re-decoded).
//
// THE BLOB LAYOUT (resident in Z80 RAM, NOT runtime-paged -- W145's correction).
// The 68k uploads the full 64 KiB Z80 image (program + globals + score data)
// through the `$C10000` window once at sound-boot; the score is then plain RAM.
//   cue table        `$0070`-`$0085`   (11 LE pointers + the count at `$0052`)
//   per-cue blocks   `$A600`-`$C300`   (~7.2 KB)
// Each per-cue block:
//   [4-byte header]  data[0]=rowlen (-> `$62E1`), data[1]=tracks (-> `$62E0`=8),
//                    data[2]=df (-> `$62DF`), data[3]=pad
//   [row stream]     at block+4 (-> `$62DB`); rowlen+1 bytes; read one selector
//                    byte per tempo-step by `$25F2`.
//   [pointer table]  at block+4+rowlen+1 (-> `$62DD`); 8 LE pointers (one per
//                    track) into the note-event streams. The 8 tracks SHARE one
//                    table: track t reads the entry at table + t*2 (W145 sec 2).
//   [note streams]   the melody bytes: `[note][dur][vel]` triples with `$CF`
//                    section markers; the event byte's top 2 bits select a
//                    handler via the switch at `$2BC6` (W147 sec 0 refinement 2).
//
// WHAT THIS MODULE OWNS. The PARSE -- a pure function of the 64 KiB image that
// walks the cue table, the 11 blocks, the headers, the row streams, the pointer
// tables and the note streams, and emits the JS structure. The shipped artifact
// is this structure (a transformation, not a verbatim ROM slice -- passes the
// verbatim-art guard with no new exception, W145 sec 7 option (a)).

// --------------------------------------------------------------- the driver map
// The Z80-RAM addresses the score layout is keyed on. Re-decoded in worklog 147
// sec 0; cited by symbol so a reviewer checks any one against the disassembly.
export const SCORE = {
  cueTable:    0x0070,   // the 11-entry LE pointer table (set at boot by `$1419`)
  cueCountPtr: 0x0052,   // the 16-bit count (= `$000B` = 11); `[`$62E2`]` -> here
  cueTablePtr: 0x0050,   // the 16-bit table base (= `$0070`); `[`$62E4`]` -> here
  gCount:      0x62E2,   // Z80 global: pointer to the count (`$0052`)
  gTable:      0x62E4,   // Z80 global: pointer to the table (`$0070`)
  // the per-cue header byte indices (the `$2E7E`-`$2E91` parse)
  HDR_ROWLEN: 0,         // data[0] -> `$62E1` (row length / selector count)
  HDR_TRACKS: 1,         // data[1] -> `$62E0` (track count, always `$08`)
  HDR_DF:     2,         // data[2] -> `$62DF`
  HDR_PAD:    3,         // data[3] (unused)
  rowStreamOff:  4,      // block + 4 -> `$62DB` (row stream start)
};

export const N_CUES = 11;         // `[[$62E2]]` = `[$0052]` = `$000B`
export const N_BGM_TRACKS = 8;    // `$62E0` = data[1] = `$08`
export const TRACK_STRIDE = 0x29; // 41 bytes per track struct at `$6184`

// --------------------------------------------------------------- little-endian
function m16(b, a) { return (b[a] | (b[a + 1] << 8)) & 0xFFFF; }

// --------------------------------------------------------------- a parsed cue
/**
 * One parsed BGM cue block. Carries the header fields, the row/selector stream,
 * the shared 8-entry pointer table, and the per-track note-event stream bytes.
 *
 * The note-event bytes are captured raw (from the track's stream-start pointer
 * to the next stream's start, or the next cue block / end-of-data). The event
 * INTERPRETATION -- the top-2-bits switch, the `[note][dur][vel]` triple, the
 * `$CF` section marker -- is the sequencer's job; this module only locates the
 * bytes. The bounds are best-effort (streams are not length-prefixed); the
 * sequencer walks them byte-by-byte and stops at the cue's end.
 */
export class CueBlock {
  constructor(id, blockAddr, rowlen, tracks, df) {
    this.id = id;
    this.blockAddr = blockAddr;   // the Z80-RAM address of the data block
    this.rowlen = rowlen;         // data[0] -> `$62E1`
    this.tracks = tracks;         // data[1] -> `$62E0` (always 8)
    this.df = df;                 // data[2] -> `$62DF`
    this.rowStreamAddr = 0;       // block + 4 -> `$62DB`
    this.ptrTableAddr = 0;        // rowStream + rowlen + 1 -> `$62DD`
    /** @type {number[]} the selector bytes read one per tempo-step */
    this.rowStream = [];
    /** @type {number[]} the 8 LE note-stream pointers (ptrTable[t]) */
    this.ptrTable = [];
    /** @type {number[][]} per-track raw note-event bytes */
    this.noteStreams = [];
    /** @type {number[]} per-track note-stream start addresses (the Z80 ptr) */
    this.noteStreamAddrs = [];
  }
}

// --------------------------------------------------------------- the parser
/**
 * Parse the BGM score blob out of the 64 KiB Z80 image. Pure: same image -> same
 * structure. Mirrors the `$2E38` loader's table lookup + header parse + row-
 * stream / pointer-table resolution, so the structure the sequencer consumes is
 * exactly what the Z80 dereferences at runtime.
 *
 * @param {Uint8Array} ram the 64 KiB z80ram.bin image
 * @param {number} [nCues] override the cue count (defaults to `[0x0052]` = 11)
 * @returns {{cues: CueBlock[], cueCount: number, tableAddr: number}}
 */
export function parseScore(ram, nCues) {
  const count = nCues ?? m16(ram, SCORE.cueCountPtr);
  const tableAddr = m16(ram, SCORE.cueTablePtr);
  const cues = [];
  const allStreamStarts = [];
  for (let c = 0; c < count; c++) {
    const block = m16(ram, tableAddr + c * 2);
    const rowlen = ram[block + SCORE.HDR_ROWLEN];
    const tracks = ram[block + SCORE.HDR_TRACKS];
    const df = ram[block + SCORE.HDR_DF];
    const cue = new CueBlock(c, block, rowlen, tracks, df);
    cue.rowStreamAddr = block + SCORE.rowStreamOff;
    cue.ptrTableAddr = cue.rowStreamAddr + rowlen + 1;
    // row stream: rowlen+1 bytes (the +1 is the `$2EBC` INC after the ADD).
    cue.rowStream = Array.from(ram.subarray(cue.rowStreamAddr, cue.rowStreamAddr + rowlen + 1));
    // pointer table: 8 LE pointers (one per track). Track t reads table + t*2.
    cue.ptrTable = [];
    cue.noteStreamAddrs = [];
    for (let t = 0; t < N_BGM_TRACKS; t++) {
      const p = m16(ram, cue.ptrTableAddr + t * 2);
      cue.ptrTable.push(p);
      cue.noteStreamAddrs.push(p);
      allStreamStarts.push(p);
    }
    cues.push(cue);
  }
  // Bound each note stream within its cue's block range. Streams are not
  // length-prefixed; the Z80 walks them byte-by-byte while the cue is active and
  // a cue's data is self-contained within [blockAddr, nextBlockAddr). Some cues
  // (e.g. cue 0) carry pointer values outside their own range -- degenerate /
  // unplayed cues whose tables the 68k upload built differently; only cue 8 is
  // active in the captured run (the 979 BGM keyons). For those, the stream is
  // left empty rather than capturing unrelated image bytes.
  const cueAddrs = cues.map((c) => c.blockAddr);
  const blockEnd = (c) => (c + 1 < cues.length ? cueAddrs[c + 1] : ram.length);
  for (let c = 0; c < cues.length; c++) {
    const cue = cues[c];
    const lo = cue.blockAddr;
    const hi = blockEnd(c);
    const validStarts = cue.noteStreamAddrs.filter((a) => a >= lo && a < hi).sort((a, b) => a - b);
    cue.noteStreams = [];
    for (let t = 0; t < N_BGM_TRACKS; t++) {
      const start = cue.noteStreamAddrs[t];
      if (start < lo || start >= hi) { cue.noteStreams.push([]); continue; }
      let next = hi;
      for (const s of validStarts) { if (s > start) { next = s; break; } }
      cue.noteStreams.push(Array.from(ram.subarray(start, next)));
    }
  }
  return { cues, cueCount: count, tableAddr };
}

// --------------------------------------------------------------- the shipped form
/**
 * Build the shippable score structure (the form `assets/snd/bgm-score.json`
 * takes). Same content as `parseScore` but serialised as plain arrays so the
 * web build reads it without the 64 KiB image. The note streams ship as hex
 * strings (compact, human-readable, and a transformation the verbatim-art guard
 * accepts -- it is not one contiguous ROM slice).
 */
export function scoreToJson(score) {
  return {
    nCues: score.cueCount,
    tableAddr: score.tableAddr,
    cues: score.cues.map((c) => ({
      id: c.id,
      blockAddr: c.blockAddr,
      rowlen: c.rowlen,
      tracks: c.tracks,
      df: c.df,
      rowStreamAddr: c.rowStreamAddr,
      ptrTableAddr: c.ptrTableAddr,
      rowStream: c.rowStream.slice(),
      ptrTable: c.ptrTable.slice(),
      noteStreamAddrs: c.noteStreamAddrs.slice(),
      noteStreams: c.noteStreams.map((bytes) =>
        bytes.map((x) => x.toString(16).padStart(2, '0')).join('')),
    })),
  };
}

// --------------------------------------------------------------- helpers (tests)
/** Count the `$CF` section markers across a cue's note streams. */
export function countSectionMarkers(cue) {
  let n = 0;
  for (const s of cue.noteStreams) for (const b of s) if (b === 0xCF) n++;
  return n;
}

/** The distinct non-zero byte values in the `$00`-`$3F` (note) slot across a
 *  cue's note streams -- the note indices the sequencer walks. */
export function distinctNoteIndices(cue) {
  const set = new Set();
  for (const s of cue.noteStreams) {
    for (const b of s) {
      if ((b & 0xC0) === 0x00 && b !== 0x00) set.add(b & 0x3F);
    }
  }
  return [...set].sort((a, b) => a - b);
}
