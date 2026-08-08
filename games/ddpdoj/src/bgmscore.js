// Semantic BGM score extraction and strict runtime rehydration (W153).
//
// The live Z80 loader at `$2E38` reads one cue header, a row-selector array,
// and an aligned `tracks * df` grid of little-endian stream pointers. This
// module exports that topology as immutable numeric structure. It never exposes
// a contiguous slice of the uploaded Z80 image.

export const SCORE_VERSION = 2;
export const N_CUES = 11;
export const N_BGM_TRACKS = 8;
export const TRACK_STRIDE = 0x29;
export const CUE_BLOCK_ADDRS = Object.freeze([
  0xa600, 0xa696, 0xa6e2, 0xa778, 0xa80e, 0xa87a,
  0xa954, 0xa98c, 0xb6d0, 0xb7ec, 0xbe90,
]);

// `$28B814` is the complete live 68k score-group inventory. `$28B884` selects
// one entry and `$28CF36` transforms its 18-byte cue descriptors into the Z80
// `$A600` topology. Group 0 is merely the boot-time image captured in
// z80ram.bin; stage 1 selects group 1 before posting cue 0.
export const SCORE_GROUPS = Object.freeze([
  Object.freeze({ id: 0, descriptorAddr: 0x2ae118, cueCount: 11 }),
  Object.freeze({ id: 1, descriptorAddr: 0x2b240a, cueCount: 2 }),
  Object.freeze({ id: 2, descriptorAddr: 0x2b58f6, cueCount: 2 }),
  Object.freeze({ id: 3, descriptorAddr: 0x2b974a, cueCount: 2 }),
  Object.freeze({ id: 4, descriptorAddr: 0x2bc366, cueCount: 1 }),
  Object.freeze({ id: 5, descriptorAddr: 0x2c0472, cueCount: 2 }),
  Object.freeze({ id: 6, descriptorAddr: 0x2c2f38, cueCount: 1 }),
]);

export const SCORE = Object.freeze({
  cueTable: 0x0070,
  cueCountPtr: 0x0052,
  cueTablePtr: 0x0050,
  gCount: 0x62e2,
  gTable: 0x62e4,
  HDR_ROWLEN: 0,
  HDR_TRACKS: 1,
  HDR_DF: 2,
  HDR_PAD: 3,
  rowStreamOff: 4,
});

const byte = (name, value) => integer(name, value, 0, 0xff);
const word = (name, value) => integer(name, value, 0, 0xffff);

function integer(name, value, lo, hi) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new TypeError(`BGM score: ${name} must be an integer in ${lo}..${hi}`);
  }
  return value;
}

function object(name, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`BGM score: ${name} must be an object`);
  }
  return value;
}

function array(name, value, count) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new TypeError(`BGM score: ${name} must contain exactly ${count} entries`);
  }
  return value;
}

function m16(bytes, address) {
  return bytes[address] | (bytes[address + 1] << 8);
}

/** `$2E9F-$2ED1`: the pointer grid begins on the next even address. */
export function pointerTableAddress(blockAddr, rowlen) {
  return blockAddr + SCORE.rowStreamOff + rowlen + (rowlen & 1);
}

export class CueBlock {
  constructor(id, blockAddr, rowlen, tracks, df) {
    this.id = id;
    this.blockAddr = blockAddr;
    this.rowlen = rowlen;
    this.tracks = tracks;
    this.df = df;
    this.rowStreamAddr = blockAddr + SCORE.rowStreamOff;
    this.ptrTableAddr = pointerTableAddress(blockAddr, rowlen);
    this.rowStream = [];
    // Flat, track-major grid: entry `(track * df) + selector`.
    this.ptrTable = [];
    this.noteStreamAddrs = [];
    this.noteStreams = [];
  }

  pointerIndex(track, selector) {
    integer('track', track, 0, this.tracks - 1);
    integer('selector', selector, 0, this.df - 1);
    return track * this.df + selector;
  }

  streamPointer(track, selector) {
    return this.ptrTable[this.pointerIndex(track, selector)];
  }

  noteStream(track, selector) {
    return this.noteStreams[this.pointerIndex(track, selector)];
  }
}

function finishCue(cue) {
  Object.freeze(cue.rowStream);
  Object.freeze(cue.ptrTable);
  Object.freeze(cue.noteStreamAddrs);
  for (const stream of cue.noteStreams) Object.freeze(stream);
  Object.freeze(cue.noteStreams);
  return Object.freeze(cue);
}

/** Parse the complete live score topology from the uploaded 64 KiB Z80 image. */
export function parseScore(ram, nCues, scoreEnd = 0x10000) {
  if (!(ram instanceof Uint8Array) || ram.length < 0x10000) {
    throw new TypeError('BGM score parse requires the complete 64 KiB Z80 image');
  }
  const count = nCues ?? m16(ram, SCORE.cueCountPtr);
  const tableAddr = m16(ram, SCORE.cueTablePtr);
  const cues = [];
  for (let id = 0; id < count; id++) {
    const blockAddr = m16(ram, tableAddr + id * 2);
    const rowlen = ram[blockAddr + SCORE.HDR_ROWLEN];
    const tracks = ram[blockAddr + SCORE.HDR_TRACKS];
    const df = ram[blockAddr + SCORE.HDR_DF];
    const cue = new CueBlock(id, blockAddr, rowlen, tracks, df);
    cue.rowStream = Array.from(ram.subarray(cue.rowStreamAddr,
      cue.rowStreamAddr + rowlen));
    const pointerCount = tracks * df;
    for (let i = 0; i < pointerCount; i++) {
      const pointer = m16(ram, cue.ptrTableAddr + i * 2);
      cue.ptrTable.push(pointer);
      cue.noteStreamAddrs.push(pointer);
    }
    cues.push(cue);
  }

  for (let id = 0; id < cues.length; id++) {
    const cue = cues[id];
    const end = id + 1 < cues.length ? cues[id + 1].blockAddr : scoreEnd;
    for (let i = 0; i < cue.noteStreamAddrs.length; i++) {
      const start = cue.noteStreamAddrs[i];
      const next = i + 1 < cue.noteStreamAddrs.length
        ? cue.noteStreamAddrs[i + 1] : end;
      cue.noteStreams.push(Array.from(ram.subarray(start, next)));
    }
    finishCue(cue);
  }
  return Object.freeze({ version: SCORE_VERSION, cues: Object.freeze(cues),
    cueCount: count, tableAddr });
}

const be16 = (bytes, address) => (bytes[address] << 8) | bytes[address + 1];
const be32 = (bytes, address) => ((bytes[address] * 0x1000000)
  + (bytes[address + 1] << 16) + (bytes[address + 2] << 8)
  + bytes[address + 3]) >>> 0;

/** `$28CF36`: reconstruct every live score group from semantic 68k records. */
export function parseScoreGroups(maincpu) {
  if (!(maincpu instanceof Uint8Array) || maincpu.length <= 0x2c2f38) {
    throw new TypeError('BGM score groups require the complete maincpu image');
  }
  const groups = [];
  for (const spec of SCORE_GROUPS) {
    const ram = new Uint8Array(0x10000);
    ram[SCORE.cueTablePtr] = SCORE.cueTable & 0xff;
    ram[SCORE.cueTablePtr + 1] = SCORE.cueTable >>> 8;
    ram[SCORE.cueCountPtr] = spec.cueCount;
    let output = 0xa600;
    for (let id = 0; id < spec.cueCount; id++) {
      const descriptor = spec.descriptorAddr + id * 18;
      ram[SCORE.cueTable + id * 2] = output & 0xff;
      ram[SCORE.cueTable + id * 2 + 1] = output >>> 8;
      const rowlen = maincpu[descriptor];
      const tracks = maincpu[descriptor + 1];
      const df = maincpu[descriptor + 2];
      if (tracks !== N_BGM_TRACKS || rowlen === 0 || df === 0) {
        throw new RangeError(`BGM score group ${spec.id} cue ${id} descriptor layout mismatch`);
      }
      const rowPtr = be32(maincpu, descriptor + 4);
      const lengthsPtr = be32(maincpu, descriptor + 8);
      const streamsPtr = be32(maincpu, descriptor + 12);
      const streamsLength = be16(maincpu, descriptor + 16);
      const rowBytes = rowlen + (rowlen & 1);
      const pointerCount = tracks * df;
      const streamBase = output + 4 + rowBytes + pointerCount * 2;
      const end = streamBase + streamsLength;
      for (const [name, start, length] of [
        ['header', descriptor, 4], ['row stream', rowPtr, rowBytes],
        ['length grid', lengthsPtr, pointerCount * 2],
        ['note streams', streamsPtr, streamsLength],
      ]) {
        if (start < 0 || length < 0 || start + length > maincpu.length) {
          throw new RangeError(`BGM score group ${spec.id} cue ${id} ${name} is outside maincpu`);
        }
      }
      if (end > 0x10000) {
        throw new RangeError(`BGM score group ${spec.id} cue ${id} overflows Z80 RAM`);
      }
      ram.set(maincpu.subarray(descriptor, descriptor + 4), output);
      ram.set(maincpu.subarray(rowPtr, rowPtr + rowBytes), output + 4);
      let cumulative = 0;
      const pointerBase = output + 4 + rowBytes;
      for (let i = 0; i < pointerCount; i++) {
        const pointer = streamBase + cumulative;
        ram[pointerBase + i * 2] = pointer & 0xff;
        ram[pointerBase + i * 2 + 1] = pointer >>> 8;
        cumulative += be16(maincpu, lengthsPtr + i * 2);
      }
      // `$28CF36` copies a word-rounded body. A single final padding byte is
      // permitted; no descriptor may hide a missing or extra event extent.
      if (cumulative > streamsLength || streamsLength - cumulative > 1) {
        throw new RangeError(`BGM score group ${spec.id} cue ${id} stream extent mismatch`);
      }
      ram.set(maincpu.subarray(streamsPtr, streamsPtr + streamsLength), streamBase);
      output = end;
    }
    const score = parseScore(ram, spec.cueCount, output);
    groups.push(Object.freeze({ id: spec.id, descriptorAddr: spec.descriptorAddr,
      cueCount: spec.cueCount, tableAddr: score.tableAddr, endAddr: output,
      cues: score.cues }));
  }
  return Object.freeze({ version: SCORE_VERSION, groups: Object.freeze(groups),
    // Compatibility view for recon tools: the uploaded boot bank is group 0.
    cues: groups[0].cues, cueCount: groups[0].cueCount, tableAddr: SCORE.cueTable });
}

/** Serialize the decoded topology; byte streams become even-length hex. */
export function scoreToJson(score) {
  if (Array.isArray(score.groups)) {
    return { version: SCORE_VERSION, groups: score.groups.map((group) => ({
      id: group.id, descriptorAddr: group.descriptorAddr, nCues: group.cueCount,
      tableAddr: group.tableAddr, endAddr: group.endAddr,
      cues: scoreToJson({ cueCount: group.cueCount, tableAddr: group.tableAddr,
        cues: group.cues }).cues,
    })) };
  }
  return {
    version: SCORE_VERSION,
    nCues: score.cueCount,
    tableAddr: score.tableAddr,
    cues: score.cues.map((cue) => ({
      id: cue.id,
      blockAddr: cue.blockAddr,
      rowlen: cue.rowlen,
      tracks: cue.tracks,
      df: cue.df,
      rowStreamAddr: cue.rowStreamAddr,
      ptrTableAddr: cue.ptrTableAddr,
      rowStream: cue.rowStream.slice(),
      ptrTable: cue.ptrTable.slice(),
      noteStreamAddrs: cue.noteStreamAddrs.slice(),
      noteStreams: cue.noteStreams.map((stream) =>
        stream.map((value) => value.toString(16).padStart(2, '0')).join('')),
    })),
  };
}

function decodeHex(name, value) {
  if (typeof value !== 'string' || (value.length & 1) !== 0
    || !/^[0-9a-f]*$/i.test(value)) {
    throw new TypeError(`BGM score: ${name} must be even-length hexadecimal`);
  }
  const bytes = [];
  for (let i = 0; i < value.length; i += 2) bytes.push(parseInt(value.slice(i, i + 2), 16));
  return bytes;
}

/** Strictly validate and freeze the deferred `bgm-score.json` artifact. */
export function scoreFromJson(input) {
  const json = typeof input === 'string' ? JSON.parse(input) : input;
  object('root', json);
  if (json.version !== SCORE_VERSION) {
    throw new RangeError(`BGM score: unsupported version ${json.version}`);
  }
  array('groups', json.groups, SCORE_GROUPS.length);
  const groups = json.groups.map((rawGroup, groupId) => {
    const spec = SCORE_GROUPS[groupId];
    const group = object(`groups[${groupId}]`, rawGroup);
    if (group.id !== groupId || group.descriptorAddr !== spec.descriptorAddr
        || group.nCues !== spec.cueCount || group.tableAddr !== SCORE.cueTable) {
      throw new RangeError(`BGM score: group ${groupId} inventory/layout mismatch`);
    }
    const endAddr = word(`group ${groupId} endAddr`, group.endAddr);
    array(`group ${groupId} cues`, group.cues, spec.cueCount);
    return { spec, group, endAddr };
  });
  const hydrated = groups.map(({ spec, group, endAddr }, groupId) => {
  const cues = [];
  for (let id = 0; id < spec.cueCount; id++) {
    const raw = object(`group ${groupId} cues[${id}]`, group.cues[id]);
    if (raw.id !== id) throw new RangeError(`BGM score: cue ${id} id mismatch`);
    const blockAddr = word(`cue ${id} blockAddr`, raw.blockAddr);
    if ((groupId === 0 && blockAddr !== CUE_BLOCK_ADDRS[id])
        || (id === 0 && blockAddr !== 0xa600)) {
      throw new RangeError(`BGM score: cue ${id} block layout mismatch`);
    }
    const rowlen = byte(`cue ${id} rowlen`, raw.rowlen);
    const tracks = byte(`cue ${id} tracks`, raw.tracks);
    const df = byte(`cue ${id} df`, raw.df);
    if (tracks !== N_BGM_TRACKS || rowlen === 0 || df === 0) {
      throw new RangeError(`BGM score: cue ${id} must have 8 tracks and nonzero rowlen/df`);
    }
    if (id > 0 && blockAddr <= cues[id - 1].blockAddr) {
      throw new RangeError(`BGM score: cue ${id} blocks are not strictly ascending`);
    }
    const cue = new CueBlock(id, blockAddr, rowlen, tracks, df);
    if (raw.rowStreamAddr !== cue.rowStreamAddr
      || raw.ptrTableAddr !== cue.ptrTableAddr) {
      throw new RangeError(`BGM score: cue ${id} derived address mismatch`);
    }
    cue.rowStream = array(`cue ${id} rowStream`, raw.rowStream, rowlen)
      .map((value, i) => integer(`cue ${id} rowStream[${i}]`, value, 0, df - 1));
    const pointerCount = tracks * df;
    cue.ptrTable = array(`cue ${id} ptrTable`, raw.ptrTable, pointerCount)
      .map((value, i) => word(`cue ${id} ptrTable[${i}]`, value));
    cue.noteStreamAddrs = array(`cue ${id} noteStreamAddrs`, raw.noteStreamAddrs,
      pointerCount).map((value, i) => word(`cue ${id} noteStreamAddrs[${i}]`, value));
    cue.noteStreams = array(`cue ${id} noteStreams`, raw.noteStreams, pointerCount)
      .map((value, i) => decodeHex(`cue ${id} noteStreams[${i}]`, value));
    cues.push(cue);
  }

  for (let id = 0; id < cues.length; id++) {
    const cue = cues[id];
    const end = id + 1 < cues.length ? cues[id + 1].blockAddr : endAddr;
    const pointerDataEnd = cue.ptrTableAddr + cue.ptrTable.length * 2;
    if (cue.ptrTable[0] !== pointerDataEnd) {
      throw new RangeError(`BGM score: cue ${id} pointer topology has a leading gap`);
    }
    for (let i = 0; i < cue.ptrTable.length; i++) {
      const pointer = cue.ptrTable[i];
      if (pointer !== cue.noteStreamAddrs[i]) {
        throw new RangeError(`BGM score: cue ${id} pointer/address grid mismatch`);
      }
      if (pointer < pointerDataEnd || pointer >= end
        || (i > 0 && pointer <= cue.ptrTable[i - 1])) {
        throw new RangeError(`BGM score: cue ${id} pointer topology is invalid`);
      }
      const next = i + 1 < cue.ptrTable.length ? cue.ptrTable[i + 1] : end;
      if (cue.noteStreams[i].length !== next - pointer) {
        throw new RangeError(`BGM score: cue ${id} stream ${i} extent mismatch`);
      }
    }
    finishCue(cue);
  }
  return Object.freeze({ id: groupId, descriptorAddr: spec.descriptorAddr,
    cues: Object.freeze(cues), cueCount: spec.cueCount,
    tableAddr: SCORE.cueTable, endAddr });
  });
  return Object.freeze({ version: SCORE_VERSION, groups: Object.freeze(hydrated),
    cues: hydrated[0].cues, cueCount: hydrated[0].cueCount,
    tableAddr: SCORE.cueTable });
}

export function countSectionMarkers(cue) {
  let count = 0;
  for (const stream of cue.noteStreams) {
    for (const value of stream) if (value === 0xcf) count++;
  }
  return count;
}

export function distinctNoteIndices(cue) {
  const notes = new Set();
  for (const stream of cue.noteStreams) {
    for (const value of stream) if (value > 0 && value < 0x40) notes.add(value - 1);
  }
  return [...notes].sort((a, b) => a - b);
}
