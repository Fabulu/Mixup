// THE Z80 SOUND DRIVER -- the uploaded program and the address map Wave C ports.
//
// Wave B (Sound). See docs/worklog/ddpdoj/138-impl-sound-wave-b.md and the
// architect plan docs/worklog/ddpdoj/135-sound-architect-plan.md section 2.
//
// The Z80 has 64 KiB RAM and NO ROM (pgm.cpp:29). Its whole program is uploaded
// through the $C10000 shared window by the 68k early in boot, and the upload
// source is a verbatim, stride-1 copy sitting in the decrypted 68k image at
// $2C348A (length $5B98 = 23448 bytes). This module reconstructs the program
// from THAT window (the cartridge, the way the 68k sends it); z80ram.bin under
// rip/sound/ is the byte-match ORACLE only -- gitignored, never shipped.
//
// WHAT THIS WAVE OWNS and what it does not. Wave B owns the UPLOAD (one
// function), the BANK-MAPPING settlement (section 2 of the worklog), and the
// LISTING -- the verified 3-layer address map that Wave C ports from. The
// INT/NMI behaviour, the cue scripts and the voice engine are Wave C. The
// address constants below are exported so Wave C cites them by name rather than
// re-deriving them, and so a reviewer can check any one against the listing.

// ---------------------------------------------------------------- the Z80 space
export const Z80 = {
  ramSize: 0x10000,        // 64 KiB. The Z80's whole address space is RAM.
  // THE UPLOAD. Source is in the decrypted 68k image; length is $5B98 (23448).
  // NOTE: $5B98 = 23448. Some older briefs carried "23416" ($5B78); the hex
  // figure wins and the byte-match proves it.
  uploadSrc: 0x2C348A,
  uploadLen: 0x5B98,       // 23448 bytes -> Z80 RAM $0000..$5B97
  // The CODE REGION matches z80ram.bin byte-for-byte. $0000..$0085 (134 bytes)
  // is volatile scratch (reset vector + init state); the 31 bytes that diverge
  // after upload ALL live there.
  codeStart: 0x0086,
  codeEnd:   0x5B97,       // inclusive. Region span = $5B12 = 23314 bytes.
};

// ---------------------------------------------------------------- ICS2115 ports
// REFINEMENT over 135 (which said "port 1 = reg select; ports 2/3 = lo/hi").
// The register primitives load BC,$8001 and INC BC upward, so the precise map:
//   $8000 = STATUS read (the IRQ/timer bits the INT handler samples at $010B)
//   $8001 = register-SELECT write (the register number)
//   $8002 = data LOW byte
//   $8003 = data HIGH byte
// $8000 is a READ (status), not a write port. Wave C's register-file model
// consumes this protocol: write $8001 sets regSelect; $8002/$8003 land in
// voice[currentVoice][regSelect] per C5's authoritative-half table.
export const ICS = {
  status:  0x8000,   // read at INT $010B for the IRQ bits (bit0 = timer-0)
  regSel:  0x8001,   // write: register select
  dataLo:  0x8002,   // read/write: data low byte
  dataHi:  0x8003,   // read/write: data high byte
};

// ---------------------------------------------------------------- driver map
// Every address below is DECODED in worklog 138 section 3 (the listing). Cited
// here by name so Wave C ports them by symbol and a reviewer checks any one
// against the disassembly. The main thread idles at idleLoop (`JR $`); ALL
// behaviour is in the two interrupt handlers (INT drives the voice engine, NMI
// drives the cue dispatch).
export const Z80_ROM = {
  // --- reset + vectors
  reset:     0x0000,   // IM 1; JP $0100
  resetInit: 0x0100,   // LD SP,$6840; OUT $8100; JP $02EE (the init)
  nmiVector: 0x0066,   // Z80 NMI entry -> JP $0128
  intVector: 0x0038,   // INT mode-1 vector -> JP $010B
  idleLoop:  0x114C,   // `18 FE` = JR $ (infinite loop). The main thread parks here.
  // --- LAYER 1: register primitives (the COMPLETE hardware interface, 7 routines)
  outToPort:      0x0142,   // write E to port HL
  inFromPort:     0x0147,   // read port HL -> A
  writeReg16:     0x02AE,   // reg(L), lo(E), hi(D) -> $8001/$8002/$8003
  writeReg8hi:    0x02A4,   // reg(L), hi(E) -> $8001/$8003 (8-bit, hi lane)
  readReg16:      0x0298,   // reg(L) -> E(lo), H(hi)
  readReg8hi:     0x028E,   // reg(L) -> A from $8003 (hi)
  readRegTimer:   0x02C3,   // reg(L) -> A from $8002 (LO; where timer regs live)
  // --- LAYER 2: the voice engine + its INT driver
  intBody:        0x010B,   // INT handler: reads status $8000; bit1 -> $0FEA; bit0(timer-0) -> $0FC8
  timerService:   0x0FC8,   // gates on reg $43 timer bit, then CALLs $25F2 + voice engine
  voiceEngine:    0x376C,   // THE 32-voice per-tick update over the $62EC array
  voiceArray:     0x62EC,   // the per-voice state array the engine walks
  // --- LAYER 3: cue dispatch (NMI work)
  nmiHandler:     0x0128,   // PUSH regs; CALL $07F6; ack via OUT $8100; RETN
  cueDispatch:    0x07F6,   // bank-select; read port $8200; payload from RAM $6001
  bankSelect:     0x09B7,   // ORs the tag ($00F0) with the persistent base ($6150)
  channelMgr:     0x0829,   // 40-slot channel manager (prologue LD HL,$0028 = 40)
};

// The PGM-specific I/O ports (not ICS2115). One-line classification each.
export const Z80_PORT = {
  nmiAck:   0x8100,   // written at reset ($0100) and at the NMI tail ($013C). Control/bank latch.
  cmdRead:  0x8200,   // the sound-command read port. `in($8200) & $0F` = command nibble.
};

// The bank-mapping state bytes in Z80 RAM. The NMI reads cues through a BANKED
// shared window: bank-select $09B7 (called with $00F0) ORs the tag with the
// persistent base to map the 68k's $C10000-window payload into Z80 RAM's $6000
// region. So the command-1 payload is read at RAM $6001, NOT at $0006 (which is
// inside the uploaded program). Worklog 138 section 2 has the full arithmetic.
export const Z80_BANK = {
  tag:        0x00F0,   // the NMI's bank-select argument (LD HL,$00F0 at $07F6)
  tagStore:   0x614F,   // RAM: the bank tag (arg_lo written here by $09B7)
  base:       0x6150,   // RAM: the persistent bank base (read by $09B7)
  cmdNibble:  0x6151,   // RAM: the command nibble (in($8200) & $0F, written at $07F6)
  timerStat:  0x6161,   // RAM: reg $43 timer-status snapshot (written at $0FC8)
  payload:    0x6001,   // RAM: command-1 cue payload source (length 6)
};

/**
 * The Z80 RAM model. A flat Uint8Array(64 KiB) -- the same rule src/ram.js
 * states: keep the original layout so a divergence report names a Z80 address a
 * person can look up, with no translation layer for a bug to hide behind.
 */
export class Z80Ram {
  constructor() {
    this.b = new Uint8Array(Z80.ramSize);
    this.dv = new DataView(this.b.buffer);
  }
  u8(a) { return this.b[a]; }
  u16(a) { return this.dv.getUint16(a, false); }
  setU8(a, v) { this.b[a] = v & 0xff; }
  setU16(a, v) { this.dv.setUint16(a, v & 0xffff, false); }
}

/**
 * Upload the Z80 program: copy $5B98 bytes from the decrypted 68k ROM window at
 * $2C348A into the Z80 RAM at offset 0. This is the verbatim, stride-1 copy the
 * 68k performs through the $C10000 window at boot. After this, Z80 RAM
 * $0086..$5B97 holds the driver program; $0000..$0085 is volatile scratch the
 * running Z80 then initializes (it diverges from the freshly-uploaded image at
 * exactly 31 bytes, all in that scratch prefix -- see assertUploadMatches).
 *
 * @param rom the RomWindows built from player.tables.json (carries the
 *            Z80_UPLOAD window added in export-tables.py).
 * @param target optional Z80Ram to upload into (a fresh one is made if absent)
 * @returns the populated Z80Ram
 */
export function uploadZ80Program(rom, target) {
  const z = target ?? new Z80Ram();
  // Read the upload source one window-backed byte at a time, the way the rest
  // of the port reads the cartridge -- so a missing/narrow window is a LOUD
  // THROW BY ADDRESS from RomWindows, never a silent short copy.
  for (let i = 0; i < Z80.uploadLen; i++) {
    z.b[i] = rom.u8(Z80.uploadSrc + i);
  }
  return z;
}

// ---------------------------------------------------------------- verification
/** The uploaded code-region bytes ($0086..$5B97), as a subarray view. */
export function codeRegionBytes(z80) {
  return z80.b.subarray(Z80.codeStart, Z80.codeEnd + 1);
}

/**
 * Compare an uploaded Z80Ram against the runtime oracle (rip/sound/z80ram.bin,
 * 64 KiB). Returns the list of indices that differ across the uploaded span
 * $0000..$5B97. The CONTRACT (worklog 138 section 0): the code region
 * $0086..$5B97 matches byte-for-byte (zero differences); every difference lives
 * in the $0000..$0085 volatile-scratch prefix, and there are exactly 31 of them.
 *
 * @param oracleBytes the raw bytes of rip/sound/z80ram.bin
 */
export function uploadDiffs(z80, oracleBytes) {
  const diffs = [];
  const span = Math.min(Z80.uploadLen, oracleBytes.length);
  for (let i = 0; i < span; i++) {
    if (z80.b[i] !== oracleBytes[i]) diffs.push(i);
  }
  return diffs;
}

/** True iff every differing index is inside the volatile-scratch prefix. */
export function diffsOnlyInScratch(diffs) {
  return diffs.every((i) => i < Z80.codeStart);
}
