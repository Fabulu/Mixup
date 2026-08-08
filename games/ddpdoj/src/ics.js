// THE ICS2115 REGISTER FILE + THE REGISTER-WRITE INTERPRETER -- Wave C Layer 1.
//
// See docs/worklog/ddpdoj/139-impl-sound-wave-c1.md (this wave) and
// 135-sound-architect-plan.md section 2 (Wave C, Layer 1). Wave B's listing
// (138-impl-sound-wave-b.md) settled the ICS port map this interpreter consumes.
//
// The Z80 talks to the ICS2115 through four I/O ports. Wave B decoded the three
// register primitives out of the ROM and confirmed the map:
//   $8000 = STATUS read (the IRQ/timer bits the INT handler samples at $010B)
//   $8001 = register-SELECT write (sets the current register number)
//   $8002 = data LOW byte (read/write)
//   $8003 = data HIGH byte (read/write)
// A register access always writes the register number to $8001 first, then
// reads or writes $8002/$8003. The three primitives:
//   writeReg16 ($02AE): reg->$8001, lo->$8002, hi->$8003 (16-bit regs, both lanes)
//   writeReg8hi ($02A4): reg->$8001, hi->$8003 (8-bit regs, HI lane; $8002 skipped)
//   readRegTimer ($02C3): reg->$8001, read from $8002 (timer regs live in LO)
//
// WHAT THIS WAVE OWNS and what it does not. Layer 1 owns the register FILE (the
// 32-voice + global state struct), the register-WRITE interpreter (consumes the
// port protocol), and the oracle comparison (state-exact against ics.tsv). The
// voice engine ($376C, the per-tick update) is Layer 2; the cue dispatch is
// Layer 3. The named register accessors below are provided FOR Layer 2 but this
// layer only STORES bytes and interprets the write protocol.

// ----------------------------------------------------------------- the port map
export const ICS_PORT = {
  status: 0x8000,   // read: IRQ/timer status bits
  regSel: 0x8001,   // write: register select (sets regSelect)
  dataLo: 0x8002,   // read/write: data low byte
  dataHi: 0x8003,   // read/write: data high byte
};

// ------------------------------------------------------------- the register set
// VERIFIED from ics.tsv (the 27 distinct registers DOJ touches):
//   per-voice synthesizer: $00-$11 (18 registers)
//   general-purpose: $40 $41 $42 $43 $4A $4B $4C $4D $4F (9 registers)
// Plus $5A/$A5 (sel-only reset artifacts; 6 rows; touch no state).
// (The brief said "26 = 19 + 7"; the lists were right, the arithmetic was off.)
export const N_VOICES = 32;
const PV_LAST = 0x11;    // last per-voice register ($00-$11)
const GL_LAST = 0x4F;    // last general register
const ARR = 0x50;        // Uint8Array size (index by register number $00-$4F)

// ------------------------------------------------- the authoritative-half table
// For each register, which data lane(s) DOJ actually writes. Derived from
// ics.tsv (which half(s) appear) and mechanically confirmed by the three Z80
// primitives: writeReg16 hits both lanes; writeReg8hi skips lo; the timer
// reader reads lo. 'both' = 16-bit, 'hi' = 8-bit hi-lane, 'lo' = 8-bit lo-lane,
// 'ro' = read-only (selected but never written). Layer 2 will emit writes
// respecting this; Layer 1 stores whatever lane is written.
/** @type {Record<string, 'both'|'hi'|'lo'|'ro'>} */
export const REG_HALF = {
  // per-voice $00-$11
  0x00: 'hi', 0x01: 'both', 0x02: 'both', 0x03: 'both',
  0x04: 'both', 0x05: 'both', 0x06: 'both', 0x07: 'hi',
  0x08: 'hi', 0x09: 'both', 0x0A: 'both', 0x0B: 'both',
  0x0C: 'hi', 0x0D: 'hi', 0x0E: 'hi', 0x0F: 'ro',
  0x10: 'hi', 0x11: 'hi',
  // general $40-$4F
  0x40: 'lo', 0x41: 'ro', 0x42: 'lo', 0x43: 'lo',
  0x4A: 'lo', 0x4B: 'ro', 0x4C: 'lo', 0x4D: 'lo',
  0x4F: 'lo',
};

// ----------------------------------------------- per-voice register name aliases
// For documentation and for Layer 2's named accessors. Semantics from frame.lua
// (the oracle capture tool) + the architect plan. Registers not decoded by
// frame.lua are stored as opaque bytes (Layer 2 will name them when it ports
// $376C). See worklog 139 section 0 for the full decode table.
export const VOICE_REG = {
  oscConf:  0x00,  // 8-bit hi: format/loop bits (conf&1=ulaw, conf&4=8bit, else 16bit)
  fc:       0x01,  // 16-bit: OscFC, the phase increment (15-bit frequency control)
  oscStrt:  0x02,  // 16-bit: OscStrt hi+mid (bits 23-8 of the 24-bit loop/osc start)
  oscStrtLo:0x03,  // 16-bit: OscStrt lo (bits 7-0 of the 24-bit start; hi lane only)
  oscEnd:   0x04,  // 16-bit: OscEnd hi+mid (bits 23-8 of the 24-bit loop/osc end)
  oscEndLo: 0x05,  // 16-bit: OscEnd lo (bits 7-0 of the 24-bit end; hi lane only)
  // $06: 16-bit opaque (Layer 2 will name)
  // $07: 8-bit hi opaque (frame.lua's vol decode looks at the wrong lane; the
  //     known $07 half-byte bug. Stored faithfully; Layer 2/E settle the field.)
  // $08: 8-bit hi opaque
  // $09/$0A/$0B: 16-bit opaque (Layer 2 will name -- likely OscAcc/VIncr/VolAcc)
  pan:      0x0C,  // 8-bit hi: OscPan
  vCtl:     0x0D,  // 8-bit hi: VCtl ($01=arm, $03=fire; the volume-ramp gate)
  activeOsc:0x0E,  // 8-bit hi: active-oscillator count ($1F=31 in the corpus)
  irqv:     0x0F,  // read-only: IRQ-voice register
  oscCtl:   0x10,  // 8-bit hi: OscCtl ($00=keyon, $0F=keyoff)
  saddr:    0x11,  // 8-bit hi: sample-address bank byte
};

// ------------------------------------------------------------- the global regs
export const GLOB_REG = {
  timer0:   0x40,  // 8-bit lo: timer-0 preset
  // $41: read-only
  timer1:   0x42,  // 8-bit lo: timer-1 preset
  timerStat:0x43,  // 8-bit lo: timer-status (the bit the INT handler polls)
  // $4A: 8-bit lo (memory config / control)
  // $4B: read-only
  // $4C/$4D: 8-bit lo (control)
  voiceSel: 0x4F,  // 8-bit lo: voice-select (sets currentVoice)
};

// ----------------------------------------------------------------- a voice slot
/**
 * One voice's register cells. Raw lo/hi byte arrays indexed by register number
 * ($00-$4F). Only $00-$11 are ever written per-voice, but the full range is
 * allocated so a divergence report names a register number, with no translation
 * layer for a bug to hide behind (the project's flat-state rule, src/ram.js).
 */
export class IcsVoice {
  constructor() {
    this.lo = new Uint8Array(ARR);
    this.hi = new Uint8Array(ARR);
  }
  /** The 16-bit value of register `reg` ((hi<<8)|lo). For 16-bit regs. */
  u16(reg) { return (this.hi[reg] << 8) | this.lo[reg]; }
  /** The byte value of an 8-bit register, from its authoritative lane. */
  u8(reg) {
    const h = REG_HALF[reg];
    return h === 'lo' ? this.lo[reg] : this.hi[reg];
  }
}

// half codes for the packed log
const SEL = 0, LO = 1, HI = 2;
/** Map the ics.tsv `half` string to the packed-log code. */
export function halfCode(half) {
  return half === 'sel' ? SEL : half === 'lo' ? LO : HI;
}

// ------------------------------------------------------------- the register file
/**
 * The virtual ICS2115 register file + the register-write interpreter.
 *
 * The shadow/log/digest triple (Gradius sound.js's pattern, lifted): every write
 * feeds the register cells (the shadow), the packed write log (regLog), and the
 * rolling per-frame digest (regDigest). The oracle comparison checks all three
 * against ics.tsv.
 */
export class IcsRegisterFile {
  constructor() {
    this.voices = Array.from({ length: N_VOICES }, () => new IcsVoice());
    this.glob = new IcsVoice();     // general registers ($40-$4F) share IcsVoice's lo/hi arrays
    this.currentVoice = 0;          // snd.osc in frame.lua; the voice per-voice writes target
    this.regSelect = 0;             // snd.reg_select; the register number $8001 last selected
    this.activeOsc = 31;            // snd.active; the active-osc count ($0E), init 31 (frame.lua)
    // The triple.
    this.regLog = [];               // packed Uint32 per write: (voice<<24)|(reg<<16)|(half<<8)|data
    this.regDigest = 0;             // rolling 16-bit hash, folded per write; reset per frame
    this.frameWrites = 0;           // writes this frame (all three lanes)
    this.totalWrites = 0;
  }

  /** Reset the per-frame digest/count (called at the frame boundary). */
  resetFrame() {
    this.regDigest = 0;
    this.frameWrites = 0;
  }

  /**
   * Consume one Z80 I/O write to the ICS2115 port space. This is the protocol
   * the register primitives emit (writeReg16/writeReg8hi build their sequences
   * out of OUT(C),x to $8001/$8002/$8003). Port $8000 is the status READ; a
   * write to it is a no-op (the chip ignores it).
   */
  write(port, data) {
    data &= 0xFF;
    switch (port) {
      case ICS_PORT.regSel: // $8001: register select
        this.regSelect = data;
        this._record(SEL, data); // for SEL, the logged data is the reg-select byte
        return;
      case ICS_PORT.dataLo: // $8002: data low
        this._dataWrite(LO, data);
        return;
      case ICS_PORT.dataHi: // $8003: data high
        this._dataWrite(HI, data);
        return;
      default:
        // $8000 (status read) or outside the ICS port space: ignore.
        return;
    }
  }

  /**
   * A data-lane write (lo or hi). Handles the two registers with write
   * side-effects ($4F voice-select, $0E active-osc) then stores the byte.
   */
  _dataWrite(half, data) {
    const reg = this.regSelect;
    // $4F voice-select: a LO write selects the voice. frame.lua updates snd.osc
    // BEFORE logging, so the ics.tsv `voice` column for a $4F write is the NEW
    // voice. The modulo (data % (1+activeOsc)) is faithful to frame.lua; with
    // activeOsc=31 (always, in the corpus) it is data % 32 = data.
    if (reg === GLOB_REG.voiceSel && half === LO) {
      this.currentVoice = data % (1 + this.activeOsc);
      this._record(half, data);
      return;
    }
    // Store the byte in the right cell.
    if (reg <= PV_LAST) {
      // per-voice register ($00-$11)
      this.voices[this.currentVoice][half === LO ? 'lo' : 'hi'][reg] = data;
    } else if (reg >= 0x40 && reg <= GL_LAST) {
      // general register ($40-$4F)
      this.glob[half === LO ? 'lo' : 'hi'][reg] = data;
    }
    // $0E active-osc extract: a HI write updates activeOsc (frame.lua:
    // snd.active = (data>>8) & 0x1F; the hi lane already carries the raw byte).
    if (reg === VOICE_REG.activeOsc && half === HI) {
      this.activeOsc = data & 0x1F;
    }
    this._record(half, data);
  }

  /**
   * Record one write in the log + digest. `data` is the byte written (for SEL,
   * the reg-select byte; for LO/HI, the data byte). The packed log entry
   * encodes (voice, reg, half, data) as a Uint32, matching the ics.tsv columns
   * for the row-for-row oracle comparison.
   */
  _record(half, data) {
    const reg = this.regSelect;
    const packed = ((this.currentVoice & 0xFF) << 24)
      | ((reg & 0xFF) << 16)
      | ((half & 0xFF) << 8)
      | (data & 0xFF);
    this.regLog.push(packed >>> 0);
    this.regDigest = IcsRegisterFile.fold(this.regDigest, this.currentVoice, reg, half, data);
    this.frameWrites++;
    this.totalWrites++;
  }

  /**
   * The rolling 16-bit digest over one write. Gradius's polynomial (h*31+byte),
   * folded over the four identifying bytes (voice, reg, half, data) so a change
   * to ANY one moves the digest. Both the interpreter and the oracle side
   * compute this the same way.
   */
  static fold(digest, voice, reg, half, data) {
    let h = digest;
    h = (h * 31 + (voice & 0xFF)) & 0xFFFF;
    h = (h * 31 + (reg & 0xFF)) & 0xFFFF;
    h = (h * 31 + (half & 0xFF)) & 0xFFFF;
    h = (h * 31 + (data & 0xFF)) & 0xFFFF;
    return h;
  }
}

// ------------------------------------------------------------- oracle replay aid
/**
 * Convert one ics.tsv row into the port write(s) that produced it, and feed them
 * to the register file. A sel row -> write($8001, data); a lo row -> write($8002,
 * data); a hi row -> write($8003, data). The `voice` column is NOT passed (the
 * interpreter reconstructs it from $4F writes); the test verifies the two agree.
 *
 * @param rf the register file
 * @param half 'sel' | 'lo' | 'hi'
 * @param data the raw byte
 */
export function replayRow(rf, half, data) {
  switch (half) {
    case 'sel': rf.write(ICS_PORT.regSel, data); return;
    case 'lo':  rf.write(ICS_PORT.dataLo, data); return;
    case 'hi':  rf.write(ICS_PORT.dataHi, data); return;
    default: throw new Error(`ics: unknown half '${half}'`);
  }
}

/** Unpack a regLog entry -> {voice, reg, half, data}. */
export function unpack(packed) {
  return {
    voice: (packed >>> 24) & 0xFF,
    reg:   (packed >>> 16) & 0xFF,
    half:  (packed >>> 8) & 0xFF,
    data:   packed & 0xFF,
  };
}
