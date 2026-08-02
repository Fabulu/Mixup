// THE SOUND DRIVER. ROM: `$EC1E` (request) and `$ED02` (one tick per NMI).
//
// Called from the NMI at `$80A1`, immediately after `$809F INC $04` raises the
// frame lock and BEFORE `$80A4 JSR $81BF` reads the joypad. So in this port,
// as on the cartridge, SOUND ADVANCES BEFORE INPUT AND BEFORE ANY GAME LOGIC,
// and a request made by game code during frame N is not looked at until frame
// N+1's tick -- which is exactly why `$EC63` seeds the new channel's duration
// counter with 1 rather than 0.
//
// ============================ WHAT THIS SUBSYSTEM IS =========================
//
// MEASURED (00-recon-sound.md 8d): with read/write taps on all 2 KB of RAM,
// gated on "inside the $ED02..$80A4 window", over 1200 frames, the driver's
// entire footprint is
//
//     reads   $0000-$0010 $0015 $00B0-$00E5 $00F0 $00F4-$00F5 $00F8-$00FB
//             $01F3-$01F8
//     writes  $00B0-$00E2 $00F4-$00F5 $00F8-$00FB $01F3-$01F6
//
// and `$0000-$0010` is not semantic at all -- it is the 6502's dummy read at
// the un-indexed address during `zp,X` addressing, attributed to a PC to prove
// it ($0002@ED0C x2000 is `LDA $02,X`, $0000@ED52 is `DEC $00,X`). $01F3-$01F8
// is the stack. So the driver's state is ITS OWN FOUR STRUCTS, `$15`, and
// nothing else: no object count, no sprite count, no collision work. That is
// why this file has no coupling to any other and why the wave plan put it last.
//
// The one thing that DOES couple: **a dropped NMI drops a music tick.** The
// lock bail at `$8073` is upstream of `$80A1`, so lag stretches every note by
// one frame. MEASURED, `--tag boot`, 600 game frames:
//   nmiEntries = 601   lagFrames = 1   driverCalls = 600   gameFrames = 600
// i.e. driverCalls == nmiEntries - lagFrames. `state.work.audioTicks` is that
// number per frame, compared against the cartridge's own `$ED02` execution
// count (tools/oracle/objloop.lua), so the rule is a checked field and not a
// sentence in a comment.
//
// ======================= THE STATE IS ONE FLAT ARRAY =========================
//
// `state.snd` is $00B0-$00FF as bytes, indexed by ADDRESS, because the ROM's
// four 17-byte structs DELIBERATELY OVERLAP the globals that follow them and a
// port with four struct objects plus separate globals cannot express that:
//
//   * the triangle ($D2) never executes the `$10`/`$11` commands ($EDDD
//     `CPX #$D2 / BEQ`), so its +$B/+$C -- $DD and $DE -- are reused as the
//     ONE GLOBAL sub-phrase return address, shared by all four channels
//     ($ED8D writes it, $EDAA reads it, possibly many ticks later).
//   * the noise struct ($E3) is only used up to +$C, so its +$D..+$10 are the
//     fade globals $F0 $F1 $F2 $F3.
//
// Writing `snd[$DD]` and `snd[$D2 + 0x0B]` as the same byte is not a trick; it
// is what the cartridge does, and a port that gave each channel its own return
// slot would be a different program.
//
// =============================== WHAT IS AUDIO ===============================
//
// STATE-EXACTNESS IS THE BAR HERE AND SYNTHESIS IS NOT ATTEMPTED. Every APU
// write the ROM makes is reproduced into `state.apu` ($4000-$4017 as a shadow,
// so the last value written to each register is exact and inspectable) and
// counted, but nothing turns those registers into samples. `$4010-$4013` is
// never written by this cartridge at all -- MEASURED, a scan of every absolute
// access to $4000-$401F in the whole 32 KB PRG -- so the DMC channel does not
// exist here even though `$81AD` enables it with `$4015 = $1F`.

import { u8 } from './state.js';

/** The first address `state.snd` holds. $B0 is pulse 1's struct base. */
export const SND_BASE = 0xB0;
/** `$ED11 ADC #$11` -- the stride between the four structs. */
export const STRIDE = 0x11;
/** `$ED16 CMP #$F4` -- one past the last struct, i.e. the loop's terminator. */
export const STRUCT_END = 0xF4;

/**
 * Struct offsets, named. Evidence for each is the instruction that touches it
 * (00-recon-sound.md 4); the names are this port's, the offsets are the ROM's.
 */
export const OFF = {
  DUR: 0x00,      // $ED50 DEC $00,X   ticks until the next event
  LEN: 0x01,      // $EDCA STA $01,X   dialect A's default note length
  OWNER: 0x02,    // $EC93 STA $02,X   the sound index owning the channel, 0 free
  PTRLO: 0x03,    // $ED48 LDA $03,X
  PTRHI: 0x04,    // $ED4C LDA $04,X
  VOL: 0x05,      // $EE98 STA $05,X   dialect B's $4000+off byte
  LOOP: 0x06,     // $ECEB LDA $06,X   the $FE pass counter
  LAST3: 0x07,    // $EF85 CMP $07,X   the last $4003+off written (retrigger)
  SHADOW: 0x08,   // $EDD6 STA $08,X   shadow of $4000+off
  FLAG: 0x09,     // $ED81 ORA #$80    bit 7 in-sub-phrase, low 7 dialect
  BASEDUR: 0x0A,  // $EE95 STA $0A,X   dialect B's base duration
  SWEEP: 0x0B,    // $EDFC STA $0B,X   shadow of $4001+off
  DETUNE: 0x0C,   // $EDEA STA $0C,X   added to the period low byte
  REL: 0x0D,      // $EE54 LDA $0D,X   the release countdown
  RELOFF: 0x0E,   // $EEAA STA $0E,X
  RELRATE: 0x0F,  // $EEB0 STA $0F,X
  OCTAVE: 0x10,   // $EEBF STA $10,X   shift count = 4 - value ($EF54)
};

/** The globals that overlay the noise struct's unused tail ($E3 + $0D..$10). */
export const G = { F0: 0xF0, F1: 0xF1, F2: 0xF2, F3: 0xF3,
                   F4: 0xF4, F5: 0xF5, F6: 0xF6, F7: 0xF7,
                   F8: 0xF8, F9: 0xF9, FA: 0xFA, FB: 0xFB,
                   DD: 0xDD, DE: 0xDE };

const TRIANGLE = 0xD2;      // $EDDD/$EE9D/$EF62/$EF81 CPX #$D2
const PULSE2 = 0xC1;        // $EC95/$EEEA CPX #$C1

/**
 * THE SOUND ROM, bound once, module-wide.
 *
 * Every other table in this port is reached through `res` because every other
 * table is read by one subsystem. $EFCD is read from NINE call sites spread
 * across five files -- both shot spawns, the kill, the death, the extra life,
 * three power-up arms and the pause -- and on the cartridge every one of them
 * reaches it the way any 6502 routine reaches ROM: by address, with nothing
 * plumbed. Threading a parameter through `die()`, `addScore()` and
 * `requestSfx()` would be plumbing the machine does not have.
 *
 * So this is a module-level binding, and the justification is the same fact:
 * there is exactly ONE cartridge, and $EFCD is at $EFCD for the whole process.
 * It is set from two places, both of which are "the cartridge has been read":
 * `src/assets.js soundTables()`, i.e. the moment the sound ROM is decoded at
 * all, and `soundDriver()` at $80A1, which runs before any of the nine sites
 * can be reached on every single frame.
 *
 * Unbound, `soundRequest()` THROWS and names the fix. It does not read
 * `undefined` and produce a plausible wrong byte, and it does not quietly do
 * nothing -- a silent no-op here would make the whole priority rule
 * unfalsifiable.
 */
let SOUND_ROM = null;

export function bindSoundRom(tables) {
  SOUND_ROM = tables;
}

function soundRom() {
  if (!SOUND_ROM) {
    throw new Error('sound: the ROM tables are not bound. src/assets.js '
                  + 'soundTables() binds them when assets/sound/tables.json is '
                  + 'decoded, and soundDriver() binds them at $80A1 on every '
                  + 'frame. A unit test that requests a sound without either '
                  + 'must call bindSoundRom(loadSoundTables()) first.');
  }
  return SOUND_ROM;
}

/**
 * The driver's per-call context. `fa`/`fb`/`f4`/`f5` are ACCESSORS ON REAL RAM,
 * not locals, and that is not tidiness: $F4/$F5 and $FA/$FB are zero-page bytes
 * the ROM writes ($ED4A/$ED4E store the stream pointer, $EE45/$EE47 walk it
 * BACKWARDS for the release ramp, $EE26/$EE2B/$EECA/$EF4C/$EF52/$EF75/$EF7F all
 * store into the period pair) and they are inside the range the comparison
 * watches. A port that kept them in JS variables would agree on every note and
 * differ on four bytes of zero page for ever.
 */
function makeT(state, base, off) {
  return {
    base, off, state, rom: soundRom(),
    get fa() { return state.snd[G.FA - SND_BASE]; },
    set fa(v) { state.snd[G.FA - SND_BASE] = v & 0xFF; },
    get fb() { return state.snd[G.FB - SND_BASE]; },
    set fb(v) { state.snd[G.FB - SND_BASE] = v & 0xFF; },
    get f4() { return state.snd[G.F4 - SND_BASE]; },
    set f4(v) { state.snd[G.F4 - SND_BASE] = v & 0xFF; },
    get f5() { return state.snd[G.F5 - SND_BASE]; },
    set f5(v) { state.snd[G.F5 - SND_BASE] = v & 0xFF; },
  };
}

/** Read one zero-page byte of the driver's own state. */
function z(state, a) {
  if (a < SND_BASE || a > 0xFF) {
    throw new Error(`sound: $${a.toString(16).toUpperCase()} is outside `
                  + `$B0-$FF, the only RAM the driver touches`);
  }
  return state.snd[a - SND_BASE];
}

/** Write one. */
function zw(state, a, v) {
  if (a < SND_BASE || a > 0xFF) {
    throw new Error(`sound: $${a.toString(16).toUpperCase()} is outside `
                  + `$B0-$FF, the only RAM the driver touches`);
  }
  state.snd[a - SND_BASE] = v & 0xFF;
}

/**
 * One APU register write. `off` is the offset from $4000, so `$4000,X` with
 * X = $F9 (0/4/8/$0C) is `apu(state, chanOff + 0, v)` and the two absolute
 * writes at $ED6B/$ED70 are `apu(state, 8, ...)` / `apu(state, 0x0C, ...)`.
 *
 * ================== HOW THE REGISTER SIDE IS ACTUALLY COMPARED ==============
 *
 * The shadow itself CANNOT be compared against the cartridge: APU registers are
 * write-only, so probe.lua's `--watch` (which reads RAM) cannot see them, and
 * the port's shadow starts at zero where the cartridge's has history from
 * before the align frame. What IS comparable is **the writes made during the
 * frame** -- address, value and order -- so every write feeds a rolling
 * digest that both sides compute the same way and both reset each frame:
 *
 *     h = (h * 31 + (off << 8) + value) & 0xFFFF
 *
 * `apuWrites` counts them and `apuDigest` identifies them; the pair separates
 * "a write is missing" from "a write has the wrong value". objloop.lua computes
 * exactly this from a $4000-$400F write callback on the real cartridge. The
 * range stops at $400F on purpose: $4014 is OAM DMA (src/oam.js, once a frame),
 * and $4015/$4017 are written once per RUN at $81AD/$81B2, before any window
 * this corpus compares.
 */
function apu(state, off, v) {
  if (off < 0 || off > 0x17) {
    throw new Error(`sound: APU offset ${off} is outside $4000-$4017`);
  }
  v &= 0xFF;
  state.apu[off] = v;
  // WAVE 13: the same writes, kept in order rather than only hashed, because a
  // synthesiser needs the sequence and the digest is one-way. See the apuLog
  // note in src/state.js -- the digest below is computed from exactly these
  // pairs in exactly this order, which is what ties src/audio/apu.js's input to
  // the field the corpus already compares. Nothing else reads it and it changes
  // no compared value; the register stream this function produces is identical
  // to what it produced before this line existed (MEASURED: the whole corpus,
  // 42 scenarios, 14098 frames, unchanged).
  state.apuLog.push(off, v);
  if (off <= 0x0F) {
    state.work.apuWrites++;
    state.work.apuDigest = (state.work.apuDigest * 31 + (off << 8) + v) & 0xFFFF;
  }
}

// ===========================================================================
// $EC1E -- THE REQUEST
// ===========================================================================

/**
 * `$EC1E`. The request code arrives in A (there is no request RAM byte), and
 * it is TWO fields:
 *
 *   nnrrrrrr    rrrrrr = the sound INDEX into the 63-record table at $EFCD
 *               nn     = (number of consecutive records - 1)
 *
 * derived from `$EC26 ROL A x3 / AND #$03 -> $E0` and `$EC2F AND #$3F -> $DF`.
 * (The three ROLs shift the incoming carry into bit 2, which `AND #$03` then
 * discards -- so the routine does NOT depend on the caller's carry, and this
 * port does not have to model one.)
 *
 * ===================== PRIORITY, AND IT IS LOAD-BEARING =====================
 *
 *   EC45  A5 DF     LDA $DF
 *   EC47  F0 04     BEQ $EC4D      index 0 skips the test (see the throw below)
 *   EC49  D5 02     CMP $02,X      $02,X = the index currently owning the channel
 *   EC4B  90 48     BCC $EC95      index < owner -> REJECTED, silently
 *
 * MEASURED on a 1200-frame autofire run: 123 requests, 51 channel-records
 * accepted, and of 83 shot-SFX ($01) requests **73 were issued while pulse 1's
 * owner byte was $13 and were rejected**. The stage-1 BGM's pulse-1 part owns
 * $B2 = $13 from game frame 310 to 822; every shot fired in that window makes
 * NO SOUND AT ALL. A port that always plays the shot is audibly wrong for the
 * first ~8.5 seconds of every stage-1 life -- so the silence is the correct
 * behaviour and this test is the thing that produces it.
 *
 * ======================= WHY THIS TAKES NO `res` ============================
 *
 * Every other table in this port is reached through `res` because every other
 * table is read by ONE subsystem. $EFCD is read from nine call sites spread
 * across five files -- both shot spawns, the kill, the death, the extra life,
 * three power-up arms, the pause -- and on the cartridge they reach it the way
 * any 6502 routine reaches ROM: by address, with nothing plumbed. Threading a
 * parameter through `die()`, `addScore()` and `requestSfx()` would be plumbing
 * the machine does not have, so the ROM reader is BOUND ONCE PER FRAME instead,
 * by `soundDriver()` at $80A1 -- which the cartridge runs before any of those
 * nine sites can be reached, in every frame, without exception.
 *
 * @param {object} state
 * @param {number} req    the request byte, as it arrives in A
 */
export function soundRequest(state, req) {
  req = u8(req);
  // The port's own per-frame record of what was requested, kept from wave 6
  // (src/state.js `sfx`). It is not the driver's state and it is not a ROM
  // byte; it is what tests/weapons.test.js and tests/powerup.test.js hold the
  // CALL SITES to, independently of what the driver then does with the call.
  state.sfx.push(req);

  const snd = soundRom();
  // ===================== THE SCRATCH BYTES ARE STRUCT BYTES ==================
  // $DF, $E0, $E1 and $E8 are not spare RAM: $DF is the TRIANGLE struct's +$0D,
  // $E0 its +$0E, $E1 its +$0F and $E8 the NOISE struct's +$05. The reuse is
  // deliberate and safe on the cartridge for a reason that is itself in the
  // code -- the triangle skips every instruction that touches +$0D..+$0F
  // ($EE9D, $EEDD, $EE3C) and the noise is always dialect A, which never reads
  // +$05. A port that kept these four in JS locals would be right about every
  // note and wrong about four bytes of zero page on every single request, which
  // is precisely what the watched $00B0-$00FB range exists to catch.
  zw(state, 0xDF, req);                           // $EC1E STA $DF
  zw(state, 0xE0, (req >> 6) & 0x03);             // $EC24-$EC2B ROL x3 / AND #$03
  zw(state, 0xDF, req & 0x3F);                    // $EC2D-$EC31 AND #$3F
  let e8 = u8(z(state, 0xDF) * 3);                // $EC33-$EC37 ASL/CLC/ADC, 8-bit

  for (;;) {
    zw(state, 0xE8, e8);                          // $EC38 STY $E8
    const apuOff = snd.read(0xEFCD + e8);         // $EC3A LDA $EFCD,Y
    zw(state, 0xE1, apuOff);                      // $EC3D STA $E1
    const chIdx = apuOff >> 2;                    // $EC3F/$EC40 LSR A x2
    if (chIdx > 3) {
      // $EC42 `LDX $ECB2,Y` with Y = 48. The channel-base table is FOUR bytes,
      // so the cartridge reads $ECE2 -- an opcode -- as a channel base and
      // then indexes zero page with it. Reached by exactly one thing: a request
      // whose low six bits are 0 ($00 $40 $80 $C0), because record 0 does not
      // exist -- $EFCD-$EFCF is the last two entries of the PITCH table
      // ($03C0's low byte and the whole of $038A), the two tables overlapping
      // by two bytes on purpose.
      //
      // MEASURED: every request the cartridge issued in eleven scripted runs
      // was $01 $06 $0D $3B $7D $90 $93 $F7 or $FC. None has low 6 bits 0. So
      // this is a crash-shaped bug the game never triggers, and a loud throw is
      // the only honest port of it.
      throw new Error(`$EC42 LDX $ECB2,Y: request $${req.toString(16).toUpperCase()}`
                    + ` selects record ${z(state, 0xDF)}, whose apuOffset is `
                    + `$${apuOff.toString(16).toUpperCase()} -> channel index `
                    + `${chIdx}, off the end of the four-entry $ECB2 table. `
                    + `A request with low 6 bits 0 has no record: $EFCD is the `
                    + `PITCH table's last two entries.`);
    }
    const base = snd.read(0xECB2 + chIdx);        // $EC42 LDX $ECB2,Y

    // $EC45-$EC4B. Note the ROM tests $DF, which is the index of the record
    // this pass is about -- and $DF is not reloaded per pass, so for a
    // multi-channel request every record is judged against the FIRST index.
    const df = z(state, 0xDF);
    const accept = df === 0 || df >= z(state, base + OFF.OWNER);
    if (accept) {
      zw(state, base + OFF.OWNER, 0);             // $EC4D/$EC4F -- free it first
      const lo = snd.read(0xEFCE + e8);           // $EC53
      const hi = snd.read(0xEFCF + e8);           // $EC5A
      zw(state, base + OFF.PTRLO, lo);            // $EC56
      zw(state, G.F6, lo);                        // $EC58
      zw(state, base + OFF.PTRHI, hi);            // $EC5D
      zw(state, G.F7, hi);                        // $EC5F
      // $EC61/$EC63 LDY #$01 / STY $00,X. ONE, not zero: $ED50's DEC takes it
      // to 0 on the NEXT driver call, so the first command of a newly started
      // sound is parsed one frame after the request. That single frame is the
      // difference between snddata.py's 512 decoded ticks and the 513 frames of
      // channel ownership measured on the cartridge.
      zw(state, base + OFF.DUR, 1);
      zw(state, base + OFF.LOOP, 0);              // $EC66 STY $06,X (Y = 0 now)
      if (base !== TRIANGLE) {                    // $EC68/$EC6A CPX #$D2 / BEQ
        zw(state, base + OFF.LAST3, 0);           // $EC6C
        zw(state, base + OFF.DETUNE, 0);          // $EC6E
        zw(state, base + OFF.SWEEP, 0);           // $EC70
      }
      // $EC72 LDA ($F6),Y with Y = 0 -- the stream's FIRST byte, read here and
      // never again by this routine.
      const first = snd.read(lo | (hi << 8));
      // $EC74/$EC76: a stream whose first byte is 0 forces $DF to 0, so $EC93
      // leaves the owner at 0 and the driver never ticks the channel -- the
      // record is a STOP marker and its bytes are NEVER PARSED. Records
      // $3C-$3F are the four of them and all point at $F08F, which is two
      // bytes into the middle of the $3B pause jingle; that is harmless
      // precisely because nothing reads it as a sequence.
      if (first === 0) zw(state, 0xDF, 0);
      // $EC78-$EC7F: $09,X = 0 when the first byte's high nibble is $2 (dialect
      // A, raw periods), 1 otherwise (dialect B, notes). A STOP record takes
      // the 1 arm, because A is still 0 at $EC78 and 0 != $20.
      zw(state, base + OFF.FLAG, (first & 0xF0) === 0x20 ? 0 : 1);
      // $EC81-$EC8E: silence the channel while it is being re-pointed. $30 is
      // "constant volume 0" for the three volume registers; the TRIANGLE's
      // $4008 wants a plain 0 instead, which is what `CPY #$08` selects.
      const q = apuOff === 8 ? 0 : 0x30;
      apu(state, apuOff + 0, q);                  // $EC8B STA $4000,Y
      apu(state, apuOff + 1, q);                  // $EC8E STA $4001,Y
      zw(state, base + OFF.OWNER, z(state, 0xDF)); // $EC91/$EC93
    }
    // $EC95 -- ON BOTH PATHS, accepted or rejected. Any request that TARGETS
    // pulse 2 resets the music fade, whether or not it was allowed to play.
    if (base === PULSE2) {                        // $EC95/$EC97 CPX #$C1
      zw(state, G.F0, 0);                         // $EC9B
      zw(state, G.F1, 0);                         // $EC9D
      zw(state, G.F2, 0);                         // $EC9F
    }
    zw(state, 0xE0, u8(z(state, 0xE0) - 1));      // $ECA1 DEC $E0
    if (z(state, 0xE0) & 0x80) return;            // $ECA3 BMI $ECAD
    e8 = u8(z(state, 0xE8) + 3);                  // $ECA5-$ECAA LDY $E8 / INY x3
  }
}

// ===========================================================================
// $ED02 -- ONE TICK, ONCE PER NON-DROPPED NMI
// ===========================================================================

/**
 * `$ED02`. Four iterations over the channel bases, then the fade epilogue.
 *
 *   ED02  A2 B0 / A0 00      X = $B0 (pulse 1), Y = 0 (its APU offset)
 *   ED06  86 F8 / 84 F9      $F8 = struct base, $F9 = APU offset
 *   ED0A  B5 02 / F0 03      owner == 0 -> the channel is free, skip it
 *   ED0E  20 46 ED           JSR $ED46
 *   ED11  A5 F8 / 18 / 69 11 / C9 F4 / D0 23    next base; $F4 ends the loop
 *   ED3D  AA / A5 F9 / 18 / 69 04 / A8 / 90 C0  next APU offset, always taken
 *
 * THERE IS NO TEMPO DIVIDER ANYWHERE. One tick is one non-dropped NMI and
 * tempo lives entirely in the duration bytes -- confirmed from the data side:
 * snddata.py decodes index $13 (the stage-1 pulse-1 part) to 512 ticks purely
 * from the ROM bytes, and the cartridge held $B2 = $13 for 513 game frames
 * (310..822 inclusive) = 1 setup frame + 512.
 */
export function soundDriver(state, res) {
  // $EFCD and $ECB2 are ROM and the 6502 reaches them by address. See
  // soundRequest() above for why they are bound here rather than threaded.
  bindSoundRom(res.soundTables);
  // docs/knowledge/06's per-signal instrumentation: "audio advanced" is its own
  // field, not an inference from a lag boolean. It is counted here, at the one
  // place $ED02 is entered, and reset by src/nmi.js at the top of every frame.
  state.work.audioTicks++;

  let base = 0xB0;                                // $ED02 LDX #$B0
  let off = 0;                                    // $ED04 LDY #$00
  for (;;) {
    zw(state, G.F8, base);                        // $ED06 STX $F8
    zw(state, G.F9, off);                         // $ED08 STY $F9
    if (z(state, base + OFF.OWNER) !== 0) {       // $ED0A/$ED0C
      tickChannel(state, base, off);              // $ED0E JSR $ED46
    }
    const next = u8(z(state, G.F8) + STRIDE);     // $ED11-$ED14
    if (next === STRUCT_END) break;               // $ED16/$ED18 CMP #$F4
    base = next;                                  // $ED3D TAX
    off = off + 4;                                // $ED3E-$ED43 (never carries)
  }

  // ---- $ED1A-$ED3C: the fade epilogue -------------------------------------
  // $F1 counts to $30 -- 48 frames -- then $F2++ and, once pulse 2's faded
  // volume $F3 drops below 7, the TRIANGLE is killed outright.
  //
  // MEASURED, and no longer by intervention alone. The cartridge arms this
  // itself: enemy-waves' recorded rows read w_00F0 0 at game frame 1849 and 1
  // at 1850, with the $EEE6 arm running at 1855 -- and then the ship dies at
  // 1866 and the window ends, which is why 16 frames of a ~530-frame fade is
  // all the corpus ever saw. The REST of it is the `fade-music` scenario
  // (wave 8's test pass): the same one-frame $F0 poke the recon used, in
  // long-idle's window, compared frame by frame against the cartridge --
  //   f448 $F2=1, then 496 544 592 640 688 736 784 832 880 928 976, exactly 48
  //   apart; $D4 (the triangle's own owner byte) goes to 0 at f880; $F2 is
  //   INCed to 12 at 976 and pulled back to $0B at 991 by $EEF4.
  if (z(state, G.F0) === 0) return;               // $ED1A/$ED1C
  zw(state, G.F1, u8(z(state, G.F1) + 1));        // $ED1E INC $F1
  if (z(state, G.F1) !== 0x30) return;            // $ED20-$ED24
  zw(state, G.F2, u8(z(state, G.F2) + 1));        // $ED26 INC $F2
  zw(state, G.F1, 0);                             // $ED28/$ED2A
  // $ED2C-$ED30 `LDA $F3 / CMP #$07 / BPL $ED3C`: the branch is on the SIGN of
  // ($F3 - 7) as an 8-bit value, so it skips whenever $F3 >= 7 and falls
  // through -- killing the triangle -- only while $F3 is 0..6.
  if ((u8(z(state, G.F3) - 7) & 0x80) === 0) return;
  zw(state, 0xD4, 0);                             // $ED32/$ED34 STA $D4
  apu(state, 0x08, 0);                            // $ED36 STA $4008
  apu(state, 0x09, 0);                            // $ED39 STA $4009
}

// ===========================================================================
// $ED46 -- ONE CHANNEL
// ===========================================================================

/**
 * `$ED46`. DEC the duration; when it reaches 0, parse the next event.
 *
 * The loop below is `$ECE5`'s doing: every control command ($FD/$FE/$FF's
 * sub-phrase return) ends `LDA #$01 / STA $00,X / BNE $ED46` -- a JUMP back to
 * the top of this routine, not a call -- so a chain of them all executes
 * WITHIN ONE TICK and the stack never grows.
 */
function tickChannel(state, base, off) {
  const T = makeT(state, base, off);
  for (;;) {
    // $ED46 executions, counted here rather than at the JSR: `$ECE5 BNE $ED46`
    // re-enters this routine WITHOUT returning, so a frame in which one channel
    // chains three control commands reads 4, not 1 -- and objloop.lua's exec
    // hook on $ED46 counts the cartridge's the same way. docs/knowledge/06 asks
    // for the per-object-loop count as its own signal; this is the sound
    // driver's, and unlike `audioTicks` it VARIES (0..4 owned channels, plus
    // every chained command).
    state.work.audioChannels++;
    T.fa = z(state, base + OFF.PTRLO);            // $ED48/$ED4A
    T.fb = z(state, base + OFF.PTRHI);            // $ED4C/$ED4E
    zw(state, base + OFF.DUR, u8(z(state, base + OFF.DUR) - 1));  // $ED50
    if (z(state, base + OFF.DUR) !== 0) {         // $ED52 BEQ $ED77
      // ---- $ED54-$ED73: PAUSE, and it FREEZES rather than stops -----------
      // With $15 set the driver undoes its own DEC, so every duration counter
      // stands still and the music resumes on exactly the tick it stopped on
      // -- MEASURED: the driver-cycle sequence for frames 491-499 and 562-570
      // is byte-identical (466,466,466,447,745,787,466,436,436).
      //
      // The channel whose owner is $3B is EXEMPT ($ED58 CMP #$3B), and that is
      // the whole mechanism by which the pause jingle plays while everything
      // else is silent.
      if (state.zp15 !== 0 && z(state, base + OFF.OWNER) !== 0x3B) {
        freezeAndSilence(T, 0);                   // $ED5E, with Y still 0
        return;
      }
      releaseRamp(T);                             // $ED74 JMP $EE35
      return;
    }
    if (parseEvents(T, 0) !== 'again') return;    // $ED77, entered with Y = 0
  }
}

/**
 * `$ED5E-$ED73` -- the freeze arm. Reached twice: from `$ED54` when a paused
 * channel's duration would have been decremented, and from `$EE86` when a
 * paused dialect-B channel's duration actually hit 0.
 *
 * `$ED60 TYA` is why this takes a `y`: the value stored into `$07,X` and the
 * three APU registers is the 6502's Y register, which is 0 on the first path
 * and whatever the dialect-B parser had reached on the second.
 */
function freezeAndSilence(T, y) {
  const { state, base, off } = T;
  zw(state, base + OFF.DUR, u8(z(state, base + OFF.DUR) + 1));  // $ED5E INC $00,X
  zw(state, base + OFF.LAST3, y);                 // $ED60/$ED61 TYA / STA $07,X
  apu(state, off + 2, y);                         // $ED65 STA $4002,X
  apu(state, off + 3, y);                         // $ED68 STA $4003,X
  apu(state, 0x08, y);                            // $ED6B STA $4008  (absolute)
  apu(state, 0x0C, 0x30);                         // $ED6E/$ED70 STA $400C
}

// ===========================================================================
// $ED77 -- the command dispatcher, shared by both dialects
// ===========================================================================

/**
 * `$ED77`. Reads one byte and splits three ways:
 *
 *   < $FD   a note -- $EDB5 picks the dialect
 *   $FD     call a sub-phrase; the return address goes in the GLOBAL $DD/$DE
 *   $FE     loop: `cnt lo hi`, cnt = TOTAL passes, +4 bytes on the last one
 *   $FF     return from the sub-phrase, or END the stream and free the channel
 *
 * `y` is a parameter and not always 0: `$EEA1 JMP $ED77` re-enters this
 * dispatcher from inside dialect B's `$Dn` handler on the TRIANGLE channel,
 * with Y already advanced past the two operand bytes. That is what makes the
 * triangle's missing decay byte work, and it is also why `$ECB6` below can
 * write a non-zero owner.
 *
 * @returns {'again'|'done'} 'again' == $ECE5, i.e. re-enter $ED46 this tick
 */
function parseEvents(T, y) {
  const { state, base } = T;
  for (;;) {
    const c = rd(T, y);                           // $ED77 LDA ($FA),Y
    if (c < 0xFD) {                               // $ED79/$ED7B BCC $EDB5
      // $EDB5-$EDBB: the dialect flag, with bit 7 (in-sub-phrase) masked off.
      const r = (z(state, base + OFF.FLAG) & 0x7F) === 0
        ? dialectA(T, y)                          // $EDBE raw 11-bit periods
        : dialectB(T, y);                         // $EE82 notes + octave
      if (typeof r === 'number') { y = r; continue; }   // $EEA1 JMP $ED77
      return r;
    }
    if (c === 0xFD) {                             // $ED7D BNE $ED98
      // $ED7F-$ED83: mark the channel as inside a sub-phrase.
      zw(state, base + OFF.FLAG, z(state, base + OFF.FLAG) | 0x80);
      y = fetchPointer(T, y);                     // $ED85 JSR $ECC7 (y += 2)
      y = u8(y + 1);                              // $ED88 INY
      const ret = (T.fa | (T.fb << 8)) + y;       // $ED89-$ED93
      // ONE SLOT FOR ALL FOUR CHANNELS. $DD/$DE is not per-channel state -- it
      // is $D2 + $0B and $D2 + $0C, the triangle struct's unused sweep and
      // detune bytes. Two channels inside sub-phrases at once would share it.
      // 00-recon-sound.md could not construct a case that breaks it and neither
      // has this port; it is reproduced exactly as it is rather than fixed.
      zw(state, G.DD, ret & 0xFF);
      zw(state, G.DE, (ret >> 8) & 0xFF);
      return chain(T);                            // $ED95 JMP $ECE5
    }
    if (c === 0xFE) {                             // $ED98/$ED9A
      loopCommand(T, y);                          // $ED9C JMP $ECEB
      return chain(T);
    }
    // ---- $FF -------------------------------------------------------------
    if ((z(state, base + OFF.FLAG) & 0x80) === 0) {   // $ED9F/$EDA1 BMI $EDA6
      endStream(T, y);                            // $EDA3 JMP $ECB6
      return 'done';
    }
    zw(state, base + OFF.FLAG, z(state, base + OFF.FLAG) & 0x7F);   // $EDA6/$EDA8
    zw(state, base + OFF.PTRLO, z(state, G.DD));  // $EDAA/$EDAC
    zw(state, base + OFF.PTRHI, z(state, G.DE));  // $EDAE/$EDB0
    return chain(T);                              // $EDB2 JMP $ECE5
  }
}

/** `$ECE5` -- `$00,X := 1` and jump back to `$ED46`. */
function chain(T) {
  zw(T.state, T.base + OFF.DUR, 1);               // $ECE5/$ECE7
  return 'again';                                 // $ECE9 BNE $ED46
}

/** `$ECC7` -- `$03/$04,X := stream[y+1], stream[y+2]`; leaves Y at y+2. */
function fetchPointer(T, y) {
  y = u8(y + 1);                                  // $ECC7 INY
  zw(T.state, T.base + OFF.PTRLO, rd(T, y));      // $ECC8/$ECCA
  y = u8(y + 1);                                  // $ECCC INY
  zw(T.state, T.base + OFF.PTRHI, rd(T, y));      // $ECCD/$ECCF
  return y;
}

/**
 * `$ECEB` -- the `$FE cnt lo hi` loop.
 *
 * `cnt` is the number of TOTAL passes, not the number of repeats: `$06,X + 1`
 * is compared against it and the block is left when they are equal. That is
 * the check snddata.py's `--selfcheck` was made to fail on purpose -- decoding
 * the loop as `c == cnt + 1` gives index $13 640 ticks instead of 512, against
 * the 513 frames of ownership the cartridge was measured holding.
 *
 * The counter `$06,X` is ONE BYTE PER CHANNEL, not one per loop, which is why
 * several BGM streams never terminate at all: a second $FE resets the first's
 * count and neither ever completes.
 */
function loopCommand(T, y) {
  const { state, base } = T;
  const a = u8(z(state, base + OFF.LOOP) + 1);    // $ECEB-$ECEE
  y = u8(y + 1);                                  // $ECF0 INY -- points at cnt
  const cnt = rd(T, y);                           // $ECF1 CMP ($FA),Y
  if (a === cnt) {                                // $ECF3 BEQ $ECD2 -- last pass
    zw(state, base + OFF.LOOP, 0);                // $ECD2/$ECD4
    const end = ((T.fa | (T.fb << 8)) + u8(y + 3)) & 0xFFFF;   // $ECD6-$ECE3
    zw(state, base + OFF.PTRLO, end & 0xFF);
    zw(state, base + OFF.PTRHI, (end >> 8) & 0xFF);
    return;
  }
  // $ECF5 BMI $ECFA / $ECF7 SEC SBC #$01: a count that has somehow passed cnt
  // steps BACK by one instead of wrapping -- so the counter does not advance
  // and does not wrap.
  //
  // NOTE CORRECTED BY WAVE 8's TEST PASS: this used to say "no measured stream
  // reaches it". A REAL STREAM DOES. Arm counters on this line over the
  // 8-scenario / 3,822-frame subset read loop_bmi = 70 and loop_sbc = 1, the
  // one being in enemy-waves, and deleting the arm gives `1 failures:
  // enemy-waves w_00D8@1848`. One field of one scenario on one frame is the
  // whole of its corpus coverage, so it is also pinned by
  // tests/sound-unwitnessed.test.js.
  const stored = (u8(a - cnt) & 0x80) !== 0 ? a : u8(a - 1);
  zw(state, base + OFF.LOOP, stored);             // $ECFA
  fetchPointer(T, y);                             // $ECFC JSR $ECC7
}

/**
 * `$ECB6` -- the end of a stream: free the channel and silence it.
 *
 *   ECB6  98        TYA           <- A := Y
 *   ECB7  94 02     STY $02,X     <- the OWNER becomes Y, not a literal 0
 *   ECB9  E0 D2     CPX #$D2 / F0 04 BEQ $ECC1
 *   ECBD  94 0C     STY $0C,X
 *   ECBF  A9 30     LDA #$30      <- ...and only the non-triangle path gets $30
 *   ECC1  A6 F9     LDX $F9 / 9D 00 40  STA $4000,X
 *
 * THE Y IS NOT COSMETIC. It is 0 on every ordinary path, so "the channel is
 * freed" is true in practice -- but a TRIANGLE stream that reaches its `$FF`
 * through `$EEA1` (the `$Dn` handler's re-dispatch) arrives here with Y = 2,
 * and would leave the owner at 2 and write 2 to $4008. Ported literally rather
 * than as `owner = 0`, because the difference between a translation and a
 * reading is exactly this kind of line.
 */
function endStream(T, y) {
  const { state, base, off } = T;
  let a = y;                                      // $ECB6 TYA
  zw(state, base + OFF.OWNER, y);                 // $ECB7 STY $02,X
  if (base !== TRIANGLE) {                        // $ECB9/$ECBB
    zw(state, base + OFF.DETUNE, y);              // $ECBD STY $0C,X
    a = 0x30;                                     // $ECBF LDA #$30
  }
  apu(state, off + 0, a);                         // $ECC1/$ECC3
}

// ===========================================================================
// DIALECT A -- the SFX parser, $EDBE
// ===========================================================================

/**
 * `$EDBE`. Optional `$2n vv` (note length, volume), then any number of
 * `$11 vv` (detune) / `$10 vv` (sweep) / `$F8 vv` (volume) prefixes, then a
 * TWO-BYTE RAW PERIOD `hi lo` of which only the low 3 bits of `hi` are used.
 *
 * The `$EDEC INY / BNE $EDBE` at the end of the detune arm loops back to the
 * TOP, so a stream may re-specify its length between detunes.
 */
function dialectA(T, y) {
  const { state, base, off } = T;
  for (;;) {
    let c = rd(T, y);                             // $EDBE LDA ($FA),Y
    if ((c & 0xF0) === 0x20) {                    // $EDC0-$EDC4
      zw(state, base + OFF.LEN, c & 0x0F);        // $EDC6-$EDCA
      y = u8(y + 1);                              // $EDCC INY
      const v = rd(T, y);                         // $EDCD
      apu(state, off + 0, v);                     // $EDD1 STA $4000,X
      zw(state, base + OFF.SHADOW, v);            // $EDD6 STA $08,X
      y = u8(y + 1);                              // $EDD8 INY
    }
    zw(state, base + OFF.DUR, z(state, base + OFF.LEN));  // $EDD9/$EDDB
    if (base === TRIANGLE) break;                 // $EDDD/$EDDF BEQ $EE22
    c = rd(T, y);                                 // $EDE1
    if (c === 0x11) {                             // $EDE3/$EDE5
      y = u8(y + 1);
      zw(state, base + OFF.DETUNE, rd(T, y));     // $EDE8/$EDEA
      y = u8(y + 1);                              // $EDEC INY
      if (y !== 0) continue;                      // $EDED BNE $EDBE
      // Y wrapped to 0 and the BNE was NOT taken, so the cartridge falls into
      // the $10 test at $EDEF with A still holding the DETUNE OPERAND. No
      // stream in this cartridge is 256 bytes of prefixes, so nothing reaches
      // it; it is here because the alternative is a `continue` that is subtly
      // not what the ROM does.
      c = z(state, base + OFF.DETUNE);
    }
    if (c === 0x10) {                             // $EDEF/$EDF1
      y = u8(y + 1);                              // $EDF3
      const v = rd(T, y);                         // $EDF4
      y = u8(y + 1);                              // $EDF6
      apu(state, off + 1, v);                     // $EDF9 STA $4001,X
      zw(state, base + OFF.SWEEP, v);             // $EDFC/$EDFE
    }
    // $EE00-$EE04: bit 4 of the $4000 shadow is the APU's "constant volume"
    // flag. Only when it is set does the parser look for a volume update.
    if ((z(state, base + OFF.SHADOW) & 0x10) === 0) break;
    zw(state, base + OFF.SHADOW, z(state, base + OFF.SHADOW) & 0xF0);  // $EE06-$EE0A
    let v = rd(T, y);                             // $EE0C
    if (v === 0xF8) { y = u8(y + 1); v = rd(T, y); }   // $EE0E-$EE13
    // $EE15-$EE19: the HIGH nibble of that byte becomes the volume. When the
    // byte was not $F8 the cursor did not move, so the PERIOD's high byte is
    // what supplies it -- surprising, and exactly what the ROM does.
    const a = (v >> 4) | z(state, base + OFF.SHADOW);
    zw(state, base + OFF.SHADOW, a);              // $EE1B
    apu(state, off + 0, a);                       // $EE1F
    break;
  }
  // ---- $EE22-$EE32: the raw period, then the write and the advance ---------
  T.f4 = rd(T, y) & 0x07;                         // $EE22-$EE26 AND #$07
  y = u8(y + 1);                                  // $EE28
  T.f5 = rd(T, y);                                // $EE29/$EE2B
  writePeriod(T);                                 // $EE2F JSR $EF62
  advance(T, y);                                  // $EE32 JMP $EFA6
  return 'done';
}

// ===========================================================================
// DIALECT B -- the music parser, $EE82
// ===========================================================================

/**
 * `$EE82`. Optional `$Dn vv [dd]`, optional `$En`, then ONE note byte
 * `NNNNdddd`.
 *
 * TWO THINGS A RE-IMPLEMENTATION GETS WRONG BY DEFAULT:
 *
 * 1. **`duration = base * (dddd + 1)`, by repeated addition** ($EECE-$EED5 is
 *    `LDA $0A,X / CLC / ADC $0A,X / DEC $F4 / BNE`), NOT `base << dddd`. The
 *    recon falsified the shift reading against the cartridge: decoding index
 *    $13 with a shift gives 768 ticks where the measured ownership window is
 *    513 frames = 1 + 512. The adds are chained WITHOUT a CLC, so the carry
 *    from one add feeds the next -- reproduced below, though no real stream
 *    gets near 256 (base <= 15, multiplier <= 15).
 * 2. **The triangle's `$Dn` command is TWO bytes, not three** ($EE9D
 *    `CPX #$D2 / JMP $ED77`): it has no decay pair, and it jumps back to the
 *    DISPATCHER rather than falling on to the octave test -- so the byte after
 *    it is dispatched as a command, `$FF` and `$FD` included.
 *
 * @returns {'done'|number} a number means `$EEA1 JMP $ED77` -- re-dispatch at
 *                          that Y
 */
function dialectB(T, y) {
  const { state, base, off } = T;
  // $EE82-$EE86: paused, and dialect B has NO $3B exemption -- it does not need
  // one, because the pause jingle ($3B) is a dialect-A sound.
  if (state.zp15 !== 0) { freezeAndSilence(T, y); return 'done'; }

  let c = rd(T, y);                               // $EE89
  if ((c & 0xF0) === 0xD0) {                      // $EE8B/$EE8D
    zw(state, base + OFF.BASEDUR, c & 0x0F);      // $EE91-$EE95
    y = u8(y + 1);                                // $EE97
    zw(state, base + OFF.VOL, rd(T, y));          // $EE98
    y = u8(y + 1);                                // $EE9C
    if (base === TRIANGLE) return y;              // $EE9D-$EEA1 JMP $ED77
    const dd = rd(T, y);                          // $EEA4
    zw(state, base + OFF.RELOFF, dd >> 4);        // $EEA6-$EEAA
    zw(state, base + OFF.RELRATE, dd & 0x0F);     // $EEAC-$EEB0
    y = u8(y + 1);                                // $EEB2
  }
  c = rd(T, y);                                   // $EEB3
  if ((c & 0xF0) === 0xE0) {                      // $EEB5/$EEB7
    zw(state, base + OFF.OCTAVE, c & 0x0F);       // $EEBB-$EEBF
    y = u8(y + 1);                                // $EEC1
  }
  // $EEC2 JSR $EFA6 advances $03/$04,X PAST the note byte, and $EEC5 DEY then
  // steps Y back on to it. The pointer is committed BEFORE the note is even
  // read, which is why nothing below has to remember to advance it.
  advance(T, y);                                  // $EEC2
  // $EECA STA $F4 -- the multiplier goes into REAL RAM and the loop below DECs
  // it there. It matters at the $80B5 sample point and it was MEASURED: on a
  // REST ($EF35 CMP #$0C returns at $EF44) nothing writes $F4 again, so the
  // byte the cartridge leaves is the counted-out 0 rather than the `$F4 | $08`
  // a note would leave. The port kept the multiplier in a JS local at first and
  // w_00F4 diverged on exactly the four frames of `idle` that play a rest
  // (f415, f455, f495, f535 -- rom 0, port 8).
  T.f4 = rd(T, y) & 0x0F;                         // $EEC5-$EECA
  let a;
  if (T.f4 === 0) {                               // $EECC BEQ $EED9
    a = z(state, base + OFF.BASEDUR);             // $EED9
  } else {
    a = z(state, base + OFF.BASEDUR);             // $EECE
    let carry = 0;                                // $EED0 CLC
    do {
      const s = a + z(state, base + OFF.BASEDUR) + carry;   // $EED1 ADC $0A,X
      carry = s > 0xFF ? 1 : 0;
      a = s & 0xFF;
      T.f4 = u8(T.f4 - 1);                        // $EED3 DEC $F4
    } while (T.f4 !== 0);                         // $EED5 BNE $EED1
  }
  zw(state, base + OFF.DUR, a);                   // $EEDB STA $00,X

  if (base === TRIANGLE) {                        // $EEDD/$EEDF BEQ $EF26
    a = z(state, base + OFF.VOL);                 // $EF26
  } else {
    zw(state, base + OFF.REL, u8(a + z(state, base + OFF.RELOFF)));  // $EEE1-$EEE4
    // $EEE6-$EEEC: the fade only ever touches PULSE 2's volume.
    if (z(state, G.F0) !== 0 && base === PULSE2) {
      if (z(state, G.F2) >= 0x0B) zw(state, G.F2, 0x0B);   // $EEEE-$EEF6
      zw(state, base + OFF.RELOFF, 6);            // $EEF8/$EEFA
      // $EEFC-$EF08: the release RATE depends on which sound owns pulse 2 --
      // $13 is the stage-1 pulse-1 part's index. It is spelled as an ABSOLUTE
      // `LDA $C3` rather than `LDA $02,X`, but this arm only runs with X = $C1
      // ($EEEA CPX #$C1 four instructions above), so $C3 is $02,X: pulse 2's
      // OWN owner byte, not another channel's. (The note here used to call it a
      // cross-channel read. Corrected in wave 8's test pass, which needed to
      // know what to vary to reach the other arm -- and the answer is "give
      // pulse 2 to a different sound", which is what
      // tests/sound-unwitnessed.test.js does with request $19.)
      zw(state, base + OFF.RELRATE, z(state, 0xC3) === 0x13 ? 0x0D : 0x05);
      zw(state, base + OFF.REL,
         u8(z(state, base + OFF.DUR) + z(state, base + OFF.RELOFF)));  // $EF0A-$EF0F
      let v = (z(state, base + OFF.VOL) & 0x0F) - z(state, G.F2);      // $EF11-$EF16
      if (v < 0) v = 0;                           // $EF18/$EF1A BPL $EF1C
      zw(state, G.F3, v);                         // $EF1C
      a = (z(state, base + OFF.VOL) & 0xF0) | z(state, G.F3);          // $EF1E-$EF22
      if (a === 0) a = z(state, base + OFF.VOL);  // $EF24 BNE $EF28, else $EF26
    } else {
      a = z(state, base + OFF.VOL);               // $EF26
    }
  }
  zw(state, base + OFF.SHADOW, a);                // $EF28 STA $08,X
  apu(state, off + 0, a);                         // $EF2A-$EF2C

  // ---- $EF2F: the note itself ---------------------------------------------
  const note = rd(T, y) >> 4;                     // $EF2F-$EF34 LSR A x4
  if (note === 0x0C) {                            // $EF35/$EF37 CMP #$0C
    // A REST. `CPX #$08` at $EF3B tests the APU OFFSET (X was reloaded from
    // $F9 at $EF2A), so the triangle gets a plain 0 and everything else $30.
    apu(state, off + 0, off === 8 ? 0 : 0x30);    // $EF39-$EF41
    return 'done';                                // $EF44 RTS
  }
  // $EF45-$EF52: the 12-entry big-endian pitch table, one octave, C..B.
  const ti = 0xEFB8 + ((note << 1) & 0xFF);       // $EF47 ASL A / TAY
  T.f4 = T.rom.read(ti);                          // $EF49/$EF4C
  T.f5 = T.rom.read(ti + 1);                      // $EF4F/$EF52
  // ---- $EF54-$EF60: the octave shift, LITERALLY ---------------------------
  //   EF54  B4 10     LDY $10,X
  //   EF56  98 / C9 04 / F0 07      Y == 4 -> done
  //   EF5B  46 F4 / 66 F5           the 16-bit period >>= 1
  //   EF5F  C8 / D0 F4              INY, and BNE back
  // If the data ever carries an octave ABOVE 4 the loop wraps Y through 256
  // and shifts ~252 times, which is ~5,000 cycles for one note. 00-recon-sound
  // could not close whether real data reaches it (measured
  // octaveLoopIters.max = 13 per frame across everything it could make play,
  // and forcing the suspect stream on to the triangle produced no spike). The
  // literal loop is correct either way, and a port has no cycle budget to
  // care -- so it is written as the ROM has it and the open question stays
  // open rather than being resolved by a `min()`.
  let yo = z(state, base + OFF.OCTAVE);           // $EF54
  for (;;) {
    if (yo === 4) break;                          // $EF57/$EF59 BEQ $EF62
    T.f5 = ((T.f4 & 1) << 7) | (T.f5 >> 1);       // $EF5D ROR $F5
    T.f4 = T.f4 >> 1;                             // $EF5B LSR $F4
    yo = u8(yo + 1);                              // $EF5F INY
    if (yo === 0) break;                          // $EF60 BNE $EF56 -- not taken
  }
  writePeriod(T);                                 // falls through into $EF62
  return 'done';
}

// ===========================================================================
// $EE35 / $EF62 / $EFA6 -- the shared tails
// ===========================================================================

/**
 * `$EE35` -- the release ramp, run on every tick of a dialect-B channel whose
 * duration did NOT reach 0.
 *
 * It walks the local pointer copy BACK by one byte ($EE41-$EE47) to look at
 * the note that is currently sounding, and does nothing if that note is a REST
 * (`$Cn`). Note that this modifies `$FA/$FB`, not `$03/$04,X`: the copy is
 * reloaded at the top of every `$ED46`, so the damage is deliberate and local.
 */
function releaseRamp(T) {
  const { state, base, off } = T;
  if ((z(state, base + OFF.FLAG) & 0x7F) === 0) return;   // $EE35-$EE3B dialect A
  if (base === TRIANGLE) return;                  // $EE3C-$EE40
  if (T.fa === 0) T.fb = u8(T.fb - 1);            // $EE41-$EE45
  T.fa = u8(T.fa - 1);                            // $EE47
  if ((rd(T, 0) & 0xF0) === 0xC0) return;         // $EE49-$EE53 a REST
  let d = u8(z(state, base + OFF.REL) - 1);       // $EE54-$EE57
  zw(state, base + OFF.REL, d);                   // $EE59
  if (d === z(state, base + OFF.DUR)) {           // $EE5B CMP $00,X / BNE $EE67
    // $EE5F-$EE66: SEC / SBC $0F,X, then BCC or BEQ continue. Both mean
    // d <= rate; anything else returns.
    if (d > z(state, base + OFF.RELRATE)) return;
  } else {
    d = u8(d - 1);                                // $EE67/$EE68
    zw(state, base + OFF.REL, d);                 // $EE6A
  }
  // $EE6C-$EE75: the volume nibble, one step down, and nothing when it is 0.
  if ((z(state, base + OFF.SHADOW) & 0x0F) === 0) return;
  const v = u8(z(state, base + OFF.SHADOW) - 1);  // $EE76/$EE78
  zw(state, base + OFF.SHADOW, v);                // $EE7A
  apu(state, off + 0, v);                         // $EE7C/$EE7E
}

/**
 * `$EF62` -- write the 16-bit period, with the detune add and the RETRIGGER
 * GUARD.
 *
 * The guard ($EF85-$EF93) is what stops a repeated note from restarting the
 * APU's length counter: if the byte about to go to `$4003+off` is the same one
 * that went there last time, AND the channel is in constant-volume mode, AND
 * its sweep shadow is 0, the write is SKIPPED. `$07,X` is only updated when the
 * value actually differs.
 */
function writePeriod(T) {
  const { state, base, off } = T;
  if (base < TRIANGLE) {                          // $EF62/$EF64 CPX #$D2 / BCS
    // $EF66-$EF6C: a period of 0 gets no detune (both bytes tested).
    if (T.f4 !== 0 || T.f5 !== 0) {
      const d = z(state, base + OFF.DETUNE);      // $EF6E
      if (d !== 0) {                              // $EF70 BEQ $EF7B
        const s = d + T.f5;                       // $EF72/$EF73 CLC / ADC $F5
        T.f5 = s & 0xFF;                          // $EF75
        if (s > 0xFF) T.f4 = u8(T.f4 + 1);        // $EF77/$EF79 INC $F4
      }
    }
  }
  const a = T.f4 | 0x08;                          // $EF7B/$EF7D ORA #$08
  T.f4 = a;                                       // $EF7F
  let write4003 = true;
  if (base !== TRIANGLE) {                        // $EF81/$EF83 BEQ $EF97
    if (a === z(state, base + OFF.LAST3)) {       // $EF85 CMP $07,X / BNE $EF95
      if ((z(state, base + OFF.SHADOW) & 0x10) !== 0        // $EF89-$EF8D
          && z(state, base + OFF.SWEEP) === 0) {  // $EF8F/$EF91/$EF93
        write4003 = false;
      }
    } else {
      zw(state, base + OFF.LAST3, a);             // $EF95 STA $07,X
    }
  }
  if (write4003) apu(state, off + 3, T.f4);       // $EF97-$EF9B
  apu(state, off + 2, T.f5);                      // $EF9E-$EFA2
}

/**
 * `$EFA6` -- `$03/$04,X := $FA:$FB + Y + 1`, high byte only touched on carry.
 * Leaves Y at y+1, which dialect B immediately undoes with its own `DEY`.
 */
function advance(T, y) {
  const { state, base } = T;
  y = u8(y + 1);                                  // $EFA6 INY
  const s = y + T.fa;                             // $EFA7-$EFA9 TYA / CLC / ADC $FA
  zw(state, base + OFF.PTRLO, s & 0xFF);          // $EFAD STA $03,X
  if (s > 0xFF) zw(state, base + OFF.PTRHI, u8(T.fb + 1));   // $EFAF-$EFB5
  return y;
}

/** `LDA ($FA),Y` -- the stream byte, at a real CPU address. */
function rd(T, y) {
  return T.rom.read(((T.fa | (T.fb << 8)) + y) & 0xFFFF);
}

// ===========================================================================
// THE CALLERS
// ===========================================================================

/**
 * `$8357` -- called from the play arm at `$9A5B` on EVERY mode-5 play frame.
 *
 *   8357  A4 19 / B9 46 83 / 85 2D   $2D := $8346[$19]   the CHR select
 *   835E  A5 09 / F0 01 / 60         the DEMO plays no music
 *   8363  A5 1B / 29 70 / D0 31      dying / next-stage / game over -> nothing
 *   8369  A6 3E / D0 2D              **$3E != 0 -> nothing**
 *   836D  A5 3F / BE 3F 83 / D9 4F 83 / F0 24   $3F == $834F[$19] -> the AREA theme
 *   8377  18 / 69 01 / D9 4F 83 / F0 0F        $3F + 1 == it -> the FADE
 *   837F  B0 02 / A2 93                        below it -> the $93 stage BGM
 *   8383  D9 3D 9A / F0 06 / 90 11 / A2 A5     at/past the boss page -> $A5
 *
 * `$8369` IS THE WHOLE CADENCE. $3E is the camera's low byte and it advances
 * half a pixel a frame, so this routine does something on exactly the two
 * frames out of every 512 where $3E is 0 -- and on the first play frame after
 * a stage intro, because `$9B3E` zeroes $3E. That is where the stage BGM the
 * recon measured starting at game frame 310 comes from.
 *
 * `$2D` was the only part of this routine the port had before wave 8, spelled
 * as "$8346[0] = 0 so $2D stays 0". It is read from the exported table now.
 */
export function setBgm(state, res) {
  const t = res.soundTables;
  const stage = state.zp19;                       // $8357 LDY $19
  state.ppu.chrSel = t.read(0x8346 + stage);      // $8359/$835C STA $2D
  if (state.zp09 !== 0) return;                   // $835E-$8362 the demo
  if (state.substate & 0x70) return;              // $8363-$8367 AND #$70
  if (state.cam.lo !== 0) return;                 // $8369/$836B LDX $3E / BNE
  let a = state.cam.hi;                           // $836D LDA $3F
  let x = t.read(0x833F + stage);                 // $836F LDX $833F,Y
  const threshold = t.read(0x834F + stage);       // $8372 CMP $834F,Y
  if (a !== threshold) {
    a = u8(a + 1);                                // $8377/$8378 CLC / ADC #$01
    if (a === threshold) { fadeStep(state); return; }        // $837A-$837D BEQ $838E
    if (a < threshold) x = 0x93;                  // $837F BCS $8383 / $8381 LDX #$93
    // $8383 CMP $9A3D,Y -- the stage's boss page. The port loads ONE stage's
    // assets, so $9A3D[$19] is res.stage.bossPage, the same byte read by the
    // same instruction at $9A4F (src/nmi.js playArm).
    const boss = res.stage.bossPage;
    if (a === boss) { fadeStep(state); return; }  // $8386 BEQ $838E
    if (a > boss) x = 0xA5;                       // $8388 BCC $839B / $838A LDX #$A5
  }
  setBgmCode(state, x);                            // $839B
}

/**
 * `$838E-$8398` -- the fade, and it is the ONLY setter of `$F0` in the PRG.
 *
 * NOTE CORRECTED BY WAVE 8's TEST PASS. This used to say the game situation
 * that reaches it "is not established". IT IS: `$3E == 0` AND `$3F + 1 ==
 * $834F[$19]` (stage 1: camera page 3) AND `$1B < $82`, and the cartridge does
 * it in ordinary play -- MEASURED off the corpus's own enemy-waves rows,
 * w_00F0 = 0 at game frame 1849 and 1 at 1850, with no poke of any kind. What
 * the corpus cannot do is FOLLOW it: the ship dies at 1866 and the window is
 * truncated there, 16 frames into a ~530-frame fade. See the `fade-music`
 * scenario for the rest, and tests/sound-unwitnessed.test.js for the two
 * constants ($EEF0's clamp, $ED2C's threshold) that only it can redden.
 *
 * `$F0` is a LATCH: $8394's BNE means $8398 never runs twice, and $EC95 -- any
 * request that targets pulse 2 -- is the only thing that clears it.
 */
function fadeStep(state) {
  if (state.substate >= 0x82) return;             // $838E-$8392 CMP #$82 / BCS
  if (z(state, G.F0) !== 0) return;               // $8394/$8396
  zw(state, G.F0, u8(z(state, G.F0) + 1));        // $8398 INC $F0
}

/**
 * `$839B` -- set the background music, de-duplicated on `$1C`.
 *
 *   839B  E4 1C / F0 FB       already playing this code -> nothing at all
 *   839F  86 1C               $1C := the code
 *   83A1  A9 7D / 20 1E EC    request $7D  (records $3D $3E: stop pulse2 + tri)
 *   83A6  A5 1C / 4C 1E EC    then the code itself
 */
export function setBgmCode(state, code) {
  if (state.zp1C === code) return;                // $839B/$839D CPX $1C / BEQ
  state.zp1C = code;                              // $839F STX $1C
  soundRequest(state, 0x7D);                      // $83A1/$83A3
  soundRequest(state, state.zp1C);                // $83A6/$83A8
}

/** `$83AB` -- `LDA #$FC / JMP $EC1E`: stop all four channels. Six call sites. */
export function stopAllSound(state) {
  soundRequest(state, 0xFC);                      // $83AB/$83AD
}

// ===========================================================================
// PAUSE -- the struct save and restore
// ===========================================================================

/**
 * `$9AF0-$9AF8` -- copy pulse 1's whole 17-byte struct to `$01A0-$01B0`, then
 * request the pause jingle `$3B`.
 *
 * Only PULSE 1 is saved, because only pulse 1 is overwritten: `$3B`'s record
 * targets it, and the driver's freeze arm keeps every other channel's counters
 * exactly where they were.
 */
export function pauseSaveChannel(state) {
  for (let i = 0x10; i >= 0; i--) {               // $9AF0-$9AF8 LDX #$10 / DEX / BPL
    state.sndSave[i] = z(state, 0xB0 + i);
  }
  soundRequest(state, 0x3B);                      // $9AFA/$9AFC JMP $EC1E
}

/**
 * `$9B27-$9B3B` -- the resume.
 *
 *   9B27  85 B2               $B2 := 0     <- PROVABLY DEAD, see below
 *   9B29  A9 30 / 8D 00 40    $4000 := $30
 *   9B2E  A5 D7 / 8D 08 40    $4008 := $D7, the TRIANGLE's own volume shadow
 *   9B33  A2 10 / BD A0 01 / 95 B0 / CA / 10 F8   $B0-$C0 := $01A0-$01B0
 *
 * `$9B27`'s store is dead and is ported anyway: `$B2` is `$B0 + 2`, i.e. inside
 * the range the restore loop four instructions later overwrites from the saved
 * copy. Leaving out a store because nothing reads it is how a port acquires a
 * difference nobody can find later -- and writing it in the ROM's ORDER is what
 * makes that visible instead of arguable.
 */
export function pauseRestoreChannel(state) {
  zw(state, 0xB2, 0);                             // $9B27 STA $B2 (A = 0)
  apu(state, 0x00, 0x30);                         // $9B29/$9B2B STA $4000
  apu(state, 0x08, z(state, 0xD7));               // $9B2E/$9B30 STA $4008
  for (let i = 0x10; i >= 0; i--) {               // $9B33-$9B3B
    zw(state, 0xB0 + i, state.sndSave[i]);
  }
}
