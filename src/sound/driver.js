// The sound engine.  ROM: 7:$412B, called from the TIMER interrupt at $095F.
//
// A tracker. Eight track slots (music 0-3, SFX 4-7) each own one of the four
// hardware channels; ownership lives in $C800-$C803 as track+1, so a HIGHER
// track index wins and SFX pre-empt music, with the music resuming when the
// SFX track hits END.
//
// Sequence bytes below $C8 are notes, indexed into the 84-entry pitch table at
// 7:$46D5 (LE16, biased -$80 so the detune byte's own $80 bias cancels). Bytes
// from $C8 up are opcodes dispatched through 7:$43CE.
//
// This does NOT touch Web Audio. It produces NR register writes, exactly as the
// cartridge does, and apu.js turns those into samples -- which is what makes it
// checkable: tools/oracle/sound.py records the real driver's write stream and
// the two can be diffed.
//
// The field names below are the ROM's channel-record offsets (master-ref §8 /
// docs/recon-4-audio.md §2.1), because every one of the bugs this file has had
// came from modelling the engine as something more abstract than it is. There
// is no "note off" and no "volume": there is a staged NRx2 byte (+$12), an
// envelope pointer that may or may not be pointing at anything (+$14/+$15),
// and a per-tick output stage that copies four staging bytes to the APU.
//
// Quirks this relies on, all proven by the register diff: length counters are
// never enabled, the sweep is off forever, silence is emergent (an unowned
// channel gets NRx2 = 0 every tick), and NRx2 is never written without an
// accompanying retrigger.

import { u8, u16 } from '../state.js';

const BASE = new URL('../../assets/', import.meta.url).href;

export const TRACKS = 8;
export const MUSIC_TRACKS = 4;

// Request masks, from the C byte of sub_00_0AE1. $03 (play + stop-all) is what
// music uses; SFX use $01.
export const REQ_PLAY = 0x01;
export const REQ_STOP = 0x02;
export const REQ_FADE_OUT = 0x04;
export const REQ_FADE_IN = 0x08;

// Track flag bits, +$00. Bits 0, 1 and 4 are cleared at the top of every tick
// by the `AND $EC` at $414E; bits 3 and 5 together by the `AND $D7` at $4389.
// Bit 6 (paused, $405D/$4083) has no port equivalent: the browser suspends the
// AudioContext instead of freezing the driver mid-phrase.
const F_ACTIVE = 0x80;
const F_LEGATO = 0x20;
const F_HICHG = 0x10;         // frequency HI changed -> NRx4 must be rewritten
const F_AUTO = 0x08;          // replay $C80B/$C80C instead of reading the stream
const F_WAVE = 0x02;          // waveform upload pending
const F_TRIG = 0x01;          // retrigger: write NRx2 and set NRx4 bit 7

/**
 * Operand widths, so the sequence walker stays in step. Transcribed from
 * master-ref §8 / tools/dumpsong.py rather than inferred, because getting one
 * wrong desynchronises the byte stream and turns the rest of the song to noise.
 *   b = 1 byte, w = 2 bytes, D = duration byte (absent when FIXDUR is on)
 */
const OPERANDS = {
  0xC8: 'b', 0xC9: 'b', 0xCA: 'b',                       // channel-mask ops
  0xCB: 'D', 0xCC: 'D', 0xCD: 'D', 0xCE: 'D',            // drums 3..0
  0xCF: 'bbb', 0xD0: 'bbb', 0xD1: 'bbb', 0xD2: 'bbb',    // define drum
  0xD3: '',                                              // FIXDUR off
  // A slide is note + duration ($44DF/$44E6 read one byte then, unless FIXDUR
  // is armed, a second).
  0xD4: 'nD', 0xD5: 'nD', 0xD6: 'nD', 0xD7: 'nD', 0xD8: 'nD', 0xD9: 'nD',
  0xDA: 'bbb', 0xDB: 'bbb', 0xDC: 'bbb',
  0xDD: 'bbb', 0xDE: 'bbb', 0xDF: 'bbb',
  0xE0: '', 0xE1: '', 0xE2: '', 0xE3: '', 0xE4: '',
  0xE5: '', 0xE6: '', 0xE7: '',                          // pan
  0xE8: 'b',                                             // vibrato
  0xE9: '', 0xEA: '',                                    // legato off/on
  0xEB: 'D',                                             // tie
  0xEC: 'b',                                             // duty
  0xED: '', 0xEE: 'w',                                   // ret / call
  0xEF: 'bw', 0xF0: 'bw',                                // loops
  0xF1: 'w',                                             // jump
  0xF2: 'b', 0xF3: 'b', 0xF4: 'b', 0xF5: 'b',
  0xF6: 'D',                                             // rest
  0xF7: 'b', 0xF8: 'w', 0xF9: 'b', 0xFA: 'w', 0xFB: 'w', 0xFC: 'w',
  0xFD: 'b', 0xFE: 'b',
  0xFF: '',                                              // end
};

/**
 * Opcodes whose effect this port does not implement. Empty: the channel-mask
 * ops ($C8-$CA) and the release envelope ($F5) both landed, so nothing is
 * consumed-but-ignored any more.
 */
export const UNIMPLEMENTED_OPS = new Set([]);

// SLIDE/DEFSLIDE. These are how the WAVE channel plays -- like drums on the
// noise channel, stubbing them out leaves the bass line silent. The presets
// live at $C80F + n*3 and are DRIVER-GLOBAL, not per track.
//
// A preset is {per-tick pitch delta, ATTACK NOTE, ATTACK DURATION}: $450D
// reads bytes 1 and 2 and it is the PRESET's note that sounds first, for the
// preset's own duration. The note byte in the stream is the destination -- it
// goes to $C80B and the auto-note path replays it for the REMAINING duration
// ($4514 subtracts the attack from the total). So the ramp starts wherever the
// preset says and lands on the written note, which is why the bass settled at
// the right pitch even while starting from the wrong one.
const SLIDE_PLAY = { 0xD4: 5, 0xD5: 4, 0xD6: 3, 0xD7: 2, 0xD8: 1, 0xD9: 0 };
const SLIDE_DEF = { 0xDA: 5, 0xDB: 4, 0xDC: 3, 0xDD: 2, 0xDE: 1, 0xDF: 0 };

// DRUM/DEFDRUM. These are how the NOISE channel plays at all -- it has no
// notes of its own, so stubbing them out leaves the percussion silent.
// A preset is three bytes: {NRx2, attack NR43, sustain NR43}. The attack lasts
// exactly one tick ($447E writes 1 into +$05) and the auto-note path holds the
// sustain value for duration-1; that two-stage pitch drop is what makes it
// read as a hit rather than a beep. Also driver-global.
const DRUM_PLAY = { 0xCB: 3, 0xCC: 2, 0xCD: 1, 0xCE: 0 };
const DRUM_DEF = { 0xCF: 3, 0xD0: 2, 0xD1: 1, 0xD2: 0 };

// PAN_LEFT / PAN_RIGHT / PAN_CENTER, tables $4593/$4597/$459B, indexed by the
// HARDWARE channel. The value is the track's raw NR51 contribution.
const PAN_TABLE = {
  0xE5: [0x10, 0x20, 0x40, 0x80],
  0xE6: [0x01, 0x02, 0x04, 0x08],
  0xE7: [0x11, 0x22, 0x44, 0x88],
};

export async function loadSoundData() {
  const j = await fetch(BASE + 'sound.json').then((r) => r.json());
  return {
    tickHz: j.tickHz,
    pitch: Uint16Array.from(j.pitch),
    songs: j.songs,
    wave: Uint8Array.from(j.wave),
    bank: Uint8Array.from(j.bank),
    bankBase: j.bankBase,
  };
}

/** A track record: $C82D + slot*$24, all 36 bytes zero at hard init. */
function makeTrack() {
  return {
    flags: 0,          // +$00
    chan: 0,           // +$01
    ptr: 0,            // +$02/+$03  sequence pointer
    fixdur: 0,         // +$04
    dur: 0,            // +$05  duration counter
    gateLimit: 0,      // +$06  2 x the GATE operand; 0 = never key off
    gate: 0,           // +$07  key-off fires when +$05 == +$07
    transpose: 0,      // +$08
    detune: 0,         // +$09  unsigned, $80 at song start
    freqHi: 0,         // +$0A
    freqLo: 0,         // +$0B
    penvDelay: 0,      // +$0C  reload value
    penvCount: 0,      // +$0D
    penvPtr: 0,        // +$0E/+$0F  active pointer; HI byte 0 = disabled
    penvBase: 0,       // +$10/+$11
    nrx2: 0,           // +$12  the staged NRx2 byte -- this IS the volume
    venvCount: 0,      // +$13
    venvPtr: 0,        // +$14/+$15  active pointer; HI byte 0 = static
    venvBase: 0,       // +$16/+$17
    nrx1: 0,           // +$18  duty (bits 7-6) + length; written raw
    bend: 0,           // +$19  signed per-tick delta: vibrato AND slide
    pan: 0,            // +$1A  NR51 contribution
    wavePtr: 0,        // +$1B/+$1C
    relEnv: 0,         // +$1D/+$1E  release volume envelope
    relNib: 0,         // +$1F  NRx2 low nibble substituted by REST
    ret: 0,            // +$20/+$21  1-deep CALL return
    loopA: 0,          // +$22
    loopB: 0,          // +$23
  };
}

export function createDriver(data) {
  return {
    data,
    // $C6FB, four slots of {id, mask}. FLAT, and a slot is EMPTY only when
    // BOTH bytes are zero -- that is literally what $0AEE-$0AF4 tests, and it
    // is why cue $00 (the title theme) can be requested at all: its mask $03
    // is what makes the slot read as occupied.
    mail: new Uint8Array(8),
    // $FFA1, the timer ISR's read cursor. A BYTE OFFSET, not a slot index:
    // $097D adds 2 and $097F wraps at 7, so it walks 0, 2, 4, 6 forever.
    mailCursor: 0,
    // Diagnostics only -- how many requests sub_00_0AE1 found no room for.
    dropped: 0,
    tracks: Array.from({ length: TRACKS }, makeTrack),
    owner: [0, 0, 0, 0],                          // $C800-$C803, track+1
    nr51Mask: 0xFF,                               // $C806
    fadeCount: 0,                                 // $C807
    fadeIn: 0,                                    // $C808
    fadeOut: 0,                                   // $C809
    chmask: 0,                                    // $C80A, bit 7 = disabled
    autoNote: 0, autoDur: 0,                      // $C80B/$C80C
    autoNoise: 0, autoNoiseDur: 0,                // $C80D/$C80E
    // $C80F-$C82C. These are DRIVER-GLOBAL, not per track: the memset at
    // $4021 zeroes them and an SFX's DEFDRUM overwrites the music's preset in
    // the same slot. Zero-filled rather than empty so an undefined preset
    // behaves as the cartridge's does -- a silent hit, not a skipped event.
    slides: Array.from({ length: 6 }, () => [0, 0, 0]),
    drums: Array.from({ length: 4 }, () => [0, 0, 0]),
    // The four staging bytes, $FFD8-$FFDB, plus the NR50/NR51 shadows.
    sNrx1: 0, sNrx2: 0, sFreqLo: 0, sFreqHi: 0,
    nr50: 0x77,                                   // $FFDC
    nr51: 0,                                      // $FFDD
    writes: [],                                   // NR writes made this tick
    booted: false,
  };
}

/**
 * ROM: sub_00_0AE1. Post a request into the $C6FB mailbox.
 *
 * NOT a FIFO. $0AE5-$0B07 scans slots 0..3 in order and takes the FIRST one
 * whose two bytes are both zero; if none is free the request is dropped on the
 * floor, silently, with no return value. The consumer -- the timer ISR at
 * $096C -- does not drain in insertion order either: it reads ONE slot per
 * tick, round robin, so a request posted into a slot the cursor has just
 * passed waits four ticks while a later request in a lower slot goes first.
 *
 * That is the whole reason this is not a queue. Modelling it as one made the
 * port's cue latency ~1 tick against the cartridge's measured mean of 2.94
 * (histogram {1:9, 2:7, 3:14, 4:22}), and -- the audible part -- made it
 * impossible for the port to DROP a cue the cartridge drops, because a FIFO
 * that is drained every tick never fills. Level 12 spams cue $17 on nine
 * consecutive frames and the cartridge loses one of them.
 *
 * @returns the slot taken, or -1 if the mailbox was full.
 */
export function request(drv, id, mask = REQ_PLAY) {
  for (let s = 0; s < 4; s++) {
    const at = s * 2;
    if (drv.mail[at] !== 0 || drv.mail[at + 1] !== 0) continue;   // $0AEE/$0AF2
    drv.mail[at] = id & 0xFF;                    // $0AF7: LD A,B
    drv.mail[at + 1] = mask & 0xFF;              // $0AF9: LD A,C
    return s;
  }
  drv.dropped++;
  return -1;
}

/** ROM: sub_07_4036 -- stop everything and release every channel. */
export function stopAll(drv) {
  for (const t of drv.tracks) t.flags = 0;       // only +$00 is cleared
  drv.owner = [0, 0, 0, 0];
  drv.chmask = 0;
  drv.fadeCount = drv.fadeIn = drv.fadeOut = 0;
  drv.nr50 = 0x77;
}

/**
 * ROM: sub_07_40B8. A song header is a $FF-terminated list of
 * {track slot, hardware channel, sequence pointer}.
 *
 * Note what $40FA-$4126 deliberately does NOT clear: +$06, +$07, +$0A..+$10,
 * +$13..+$18, +$1A..+$20. A track inherits its previous duty, pan, gate, wave
 * pointer and envelope pointers, so an SFX can sound different on its first
 * play than on its second.
 */
export function play(drv, id) {
  if (drv.chmask & 0x80) return;                 // $40C6: sound disabled
  const song = drv.data.songs[id];
  if (!song) return;
  for (const e of song.tracks) {
    const t = drv.tracks[e.slot & 7];
    if (t.flags & F_ACTIVE) drv.owner[t.chan] = 0;
    t.flags = F_ACTIVE;
    t.chan = e.chan & 3;
    t.ptr = e.ptr;
    t.fixdur = 0;
    t.dur = 1;                                   // fire on the very next tick
    t.gateLimit = 0;
    t.gate = 0;
    t.transpose = 0;
    t.detune = 0x80;                             // cancels the table's bias
    t.penvBase &= 0xFF;                          // +$11 = 0 -> disabled
    t.nrx2 = 0;
    t.bend = 0;
    t.ret = 0;
    t.loopA = 0;
    t.loopB = 0;
  }
}

const rd = (drv, addr) => drv.data.bank[(addr - drv.data.bankBase) & 0x3FFF];
const rdw = (drv, addr) => rd(drv, addr) | (rd(drv, addr + 1) << 8);

function write(drv, addr, value) {
  drv.writes.push([addr, value & 0xFF]);
}

/** ROM: sub_07_4000, run once from $019E. */
function hwInit(drv) {
  write(drv, 0xFF26, 0x00);
  write(drv, 0xFF26, 0x80);
  write(drv, 0xFF25, 0x00);
  write(drv, 0xFF24, 0x77);
  write(drv, 0xFF1C, 0x00);
  write(drv, 0xFF1A, 0x80);
  write(drv, 0xFF1E, 0x80);
  write(drv, 0xFF10, 0x08);
}

/**
 * One driver tick.  ROM: sub_07_412B, 4096/69 = 59.36 Hz off the timer.
 *
 * @returns the NR writes this tick produced, oldest first.
 */
export function tick(drv) {
  drv.writes.length = 0;
  if (!drv.booted) { drv.booted = true; hwInit(drv); }

  // $096C-$0988, the timer ISR's half of the mailbox -- which runs BEFORE
  // sub_07_412B and is the only reader $C6FB has.
  //
  // It takes ONE slot per tick, at $FFA1, and advances the cursor by 2 with a
  // wrap at 7 EVERY tick, whether the slot held anything or not. So the four
  // slots are served strictly round robin, not oldest-first, and an empty slot
  // costs a tick just like a full one. Then it zeroes both bytes ($0986-$0988)
  // -- again unconditionally -- which is what frees the slot for $0AE1.
  const at = drv.mailCursor;
  const id = drv.mail[at];                       // $0975 -> $FFD3
  const mask = drv.mail[at + 1];                 // $0978 -> $FFD2
  const next = at + 2;                           // $097D: ADD A,$02
  drv.mailCursor = next < 7 ? next : 0;          // $097F: CP $07 / JR C
  drv.mail[at] = 0;
  drv.mail[at + 1] = 0;

  // $412B: the mask is consumed in a fixed order -- reset, start, fade in,
  // fade out. A zero mask is a no-op, which is what an empty slot produces.
  if (mask) {
    if (mask & REQ_STOP) stopAll(drv);
    if (mask & REQ_PLAY) play(drv, id);
    if (mask & REQ_FADE_IN) {                    // $40A0
      drv.fadeCount = 0x0A; drv.fadeIn = 0x0A; drv.fadeOut = 0;
    }
    if (mask & REQ_FADE_OUT) {                   // $40AC
      drv.fadeCount = 0; drv.fadeIn = 0; drv.fadeOut = 0x12;
    }
  }

  drv.nr51 = 0;                                  // $FFDD, rebuilt each tick
  for (let i = 0; i < TRACKS; i++) stepTrack(drv, drv.tracks[i], i);

  // $433F: silence is emergent. A channel nobody owns gets NRx2 = 0, which
  // switches its DAC off. The wave channel's entry here is NR32 ($FF1C), not
  // NR30 -- the wave DAC is never turned back off.
  for (let c = 0; c < 4; c++) if (!drv.owner[c]) write(drv, 0xFF12 + c * 5, 0x00);

  write(drv, 0xFF24, drv.nr50);
  write(drv, 0xFF25, drv.nr51 & drv.nr51Mask);
  fader(drv);
  return drv.writes;
}

/** ROM: $4360-$4388. NR50 walks by $11 (one step in both outputs) per period. */
function fader(drv) {
  if (drv.fadeCount !== 0) { drv.fadeCount--; return; }
  if (drv.fadeIn !== 0) {
    drv.fadeCount = drv.fadeIn;
    const v = drv.nr50 + 0x11;
    if (v <= 0xFF) drv.nr50 = v;                 // stop on carry
    return;
  }
  if (drv.fadeOut !== 0) {
    drv.fadeCount = drv.fadeOut;
    const v = drv.nr50 - 0x11;
    if (v >= 0) drv.nr50 = v;                    // stop on borrow
  }
}

/** ROM: $414D-$432E. One track: events, modulation, output. */
function stepTrack(drv, t, idx) {
  t.flags &= 0xEC;                               // $414E: clear bits 0, 1, 4
  if (!(t.flags & F_ACTIVE)) return;

  // $415F: the duration counter gates everything. Only when it expires does
  // the track read another byte -- or replay the auto-note.
  t.dur = u8(t.dur - 1);
  if (t.dur !== 0) {
    // $41EF: `CP (HL)` compares the REMAINING duration against the gate, so
    // the gate is a THRESHOLD, not a countdown -- the release fires when the
    // note has that many ticks left. This is what cuts the main volume
    // envelope off partway through a step: song $02's channel-1 envelope
    // reads {$F1,3}{$C0,3}{$A0,2}{$90,0}, but the gate arrives two ticks into
    // the $C0 step, so $A0 and $90 are data the hardware never sees.
    if (t.dur === t.gate && !(t.flags & F_LEGATO)) {
      t.venvPtr = t.relEnv;                      // $41F9: swap in the release
      t.venvCount = 1;
    }
  } else if (!eventPhase(drv, t)) {
    return;                                      // END: $46D2 skips the output
  }

  modulate(drv, t);
  output(drv, t, idx);
}

/**
 * The duration expired: either replay the auto-note or walk the stream.
 * @returns false if the track hit END and must not produce output this tick.
 */
function eventPhase(drv, t) {
  if (t.flags & F_AUTO) return autoNote(drv, t); // $4166 -> $4389
  return runStream(drv, t);
}

/**
 * ROM: $4389. The second half of a DRUM or a SLIDE: the value stashed in
 * $C80B/$C80C (pitched) or $C80D/$C80E (noise) is played for the remaining
 * duration. A zero remainder falls through to the stream instead.
 */
function autoNote(drv, t) {
  t.flags &= 0xD7;                               // clear LEGATO and AUTO
  let n, d;
  if (t.chan === 3) {
    d = drv.autoNoiseDur;
    n = drv.autoNoise;
  } else {
    t.bend = 0;                                  // $4396: the ramp stops here
    d = drv.autoDur;
    n = drv.autoNote;
  }
  if (d === 0) return runStream(drv, t);         // $439C / $43B7
  t.dur = d;
  t.gate = gateFor(t, d);
  noteTail(drv, t, n);
  return true;
}

/** ROM: $416E. Read events until one produces a note, a rest or a tie. */
function runStream(drv, t) {
  for (let guard = 0; guard < 256; guard++) {
    const b = rd(drv, t.ptr);
    t.ptr = u16(t.ptr + 1);
    if (b < 0xC8) { note(drv, t, b); return true; }
    const r = opcode(drv, t, b);
    if (r !== CONTINUE) return r === PLAYED;
  }
  t.flags = 0;                                   // malformed stream; bail out
  return false;
}

const CONTINUE = 0;   // JP $416E -- read another event
const PLAYED = 1;     // JP $420A/$419A -- this event ends the phase
const ENDED = 2;      // $FF END -- the track is done, no output this tick

/** Read this event's duration: FIXDUR if armed, otherwise the next byte. */
function duration(drv, t) {
  if (t.fixdur !== 0) return t.fixdur;           // $418A
  const d = rd(drv, t.ptr);
  t.ptr = u16(t.ptr + 1);
  return d;
}

/** ROM: $4191/$43A4/$45C7. gate = (min(dur, +$06) >> 1) - 1. */
function gateFor(t, dur) {
  // GATE_OFF leaves +$06 at 0, so `min` is 0 and the gate byte comes out $FF:
  // a duration counter counting down from below $FF can never equal it, which
  // is how "no key-off" is expressed. Special-casing 0 to "no gate" is the
  // same thing, but computing it the ROM's way keeps GATE $01 honest too.
  return u8((((dur < t.gateLimit ? dur : t.gateLimit)) >> 1) - 1);
}

/** ROM: $4182-$4199, then the shared tail. */
function note(drv, t, n) {
  const dur = duration(drv, t);
  t.dur = dur;
  t.gate = gateFor(t, dur);
  noteTail(drv, t, n);
}

/**
 * ROM: $41A4-$41ED. Pitch lookup and the envelope reload, shared by notes,
 * drums, slides and the auto-note replay.
 */
function noteTail(drv, t, n) {
  const idx = u8(n + t.transpose);               // $41A8: transpose the INDEX
  if (t.chan === 3) {
    // $41AE: the noise channel bypasses the pitch table. The note byte is a
    // raw NR43 and the "frequency HI" byte is forced to the channel number, 3,
    // which is what makes NR44 read $03/$83.
    t.freqHi = 3;
    t.freqLo = idx;
  } else {
    // $41B5: LE16 from the pitch table, biased -$80, plus the detune byte
    // whose own $80 bias cancels it.
    const p = drv.data.pitch[idx] || 0;
    const lo = (p & 0xFF) + t.detune;
    t.freqLo = lo & 0xFF;
    t.freqHi = u8((p >> 8) + (lo > 0xFF ? 1 : 0));
  }

  // Restart both envelopes from the top. Legato deliberately does NOT, which
  // is how a slurred phrase keeps one continuous swell -- and it is also how
  // SLIDE suppresses the reload it has already done for itself.
  if (!(t.flags & F_LEGATO)) {
    t.penvCount = t.penvDelay;
    t.penvPtr = t.penvBase;
    t.venvPtr = t.venvBase;
    t.venvCount = 1;
  }
  t.flags |= F_TRIG;                             // $41EA
}

/** ROM: the $43CE jump table. */
function opcode(drv, t, op) {
  const shape = OPERANDS[op];
  if (shape === undefined) { t.flags = 0; return ENDED; }

  // Read operands FIRST, so the pointer is correct even for ops whose effect
  // is not implemented. A desynchronised stream is far worse than a missing
  // effect: everything after it decodes as garbage.
  const args = [];
  for (const k of shape) {
    if (k === 'b' || k === 'n') { args.push(rd(drv, t.ptr)); t.ptr = u16(t.ptr + 1); }
    else if (k === 'w') { args.push(rdw(drv, t.ptr)); t.ptr = u16(t.ptr + 2); }
    else if (k === 'D') args.push(duration(drv, t));
  }

  if (SLIDE_DEF[op] !== undefined) {                      // $DA-$DF
    drv.slides[SLIDE_DEF[op]] = args;
    return CONTINUE;
  }
  if (SLIDE_PLAY[op] !== undefined) {                     // $D4-$D9
    slide(drv, t, drv.slides[SLIDE_PLAY[op]], args[0], args[1]);
    return PLAYED;
  }
  if (DRUM_DEF[op] !== undefined) {                       // $CF-$D2
    drv.drums[DRUM_DEF[op]] = args;
    return CONTINUE;
  }
  if (DRUM_PLAY[op] !== undefined) {                      // $CB-$CE
    drum(drv, t, drv.drums[DRUM_PLAY[op]], args[0]);
    return PLAYED;
  }
  if (PAN_TABLE[op]) {                                    // $E5-$E7
    t.pan = PAN_TABLE[op][t.chan];
    return CONTINUE;
  }

  switch (op) {
    // $C8/$C9/$CA: the only writers of $C80A. Bit 7 is "sound disabled" and
    // blocks every later song start at $40C6 -- the game's global sound mute.
    case 0xC8: drv.chmask ^= args[0]; break;
    case 0xC9: drv.chmask |= args[0]; break;
    case 0xCA: drv.chmask &= args[0]; break;
    case 0xD3: t.fixdur = 0; break;                       // FIXDUR off
    case 0xE0: t.penvBase &= 0xFF; break;                 // PITCHENV off
    // $E1-$E3 set the pitch envelope's DELAY, they do not disarm it. A delay
    // of 0 reloads +$0D with 0, which the `DEC` turns into $FF -- so the
    // envelope simply never gets to run, which is why channel 1 holds a flat
    // $73 on the cartridge instead of walking up to $83.
    case 0xE1: t.penvDelay = 0; break;
    case 0xE2: t.penvDelay = 1; break;
    case 0xE3: t.penvDelay = 1; t.gateLimit = 0; break;   // falls into $E4
    case 0xE4: t.gateLimit = 0; break;                    // GATE off
    case 0xE8: t.bend = args[0]; break;                   // VIBRATO -> +$19
    case 0xE9: t.flags &= ~F_LEGATO; break;
    case 0xEA: t.flags |= F_LEGATO; break;
    case 0xEB: {                                          // TIE: new duration
      const d = args[0];                                  // and gate, no note
      t.dur = d;
      t.gate = gateFor(t, d);
      return PLAYED;                                      // $45D8 -> $420A
    }
    case 0xEC: t.nrx1 = args[0]; break;                   // DUTY: raw NRx1
    case 0xED:                                            // RET
      // $ED with an empty return slot is a no-op that falls through, not an
      // error -- every music track in this ROM ends its intro with one.
      if (t.ret) { t.ptr = t.ret; t.ret = 0; }
      break;
    case 0xEE: t.ret = t.ptr; t.ptr = args[0]; break;     // CALL
    case 0xEF: loop(t, 'loopB', args); break;
    case 0xF0: loop(t, 'loopA', args); break;
    case 0xF1: t.ptr = args[0]; break;                    // JUMP
    case 0xF2: t.fixdur = args[0]; break;
    case 0xF3: t.detune = args[0]; break;
    case 0xF4: t.transpose = args[0]; break;
    case 0xF5: t.relNib = args[0]; break;                 // RELEASE_ENV
    case 0xF6: rest(drv, t, args[0]); return PLAYED;
    case 0xF7: t.penvDelay = args[0]; break;
    case 0xF8: t.penvBase = args[0]; break;
    case 0xF9: t.gateLimit = u8(args[0] * 2); break;      // $468F: ADD A,A
    case 0xFA: t.relEnv = args[0]; break;
    case 0xFB: t.flags |= F_WAVE; t.wavePtr = args[0]; break;
    case 0xFC: t.venvBase = args[0]; break;
    case 0xFD: t.pan = args[0]; break;                    // PAN_RAW
    // $FE sets a RAW NRx2, not a 0-15 level: SFX $10 (punch/batarang) opens
    // with $E0, i.e. volume 14 with no sweep. Masking it to the low nibble
    // reads that as volume 0 and the sound never happens at all. It also
    // kills the volume envelope (+$17 = 0).
    case 0xFE: t.venvBase &= 0xFF; t.nrx2 = args[0]; break;
    case 0xFF:                                            // END
      drv.owner[t.chan] = 0;
      t.flags = 0;
      return ENDED;
    default: break;
  }
  return CONTINUE;
}

/**
 * ROM: $4610. The counter is loaded AND the jump taken on the first encounter,
 * so `LOOP $01` plays the body twice. Decrementing on entry instead loses one
 * repetition of every loop in every song.
 */
function loop(t, field, args) {
  if (t[field] === 0) { t[field] = args[0]; t.ptr = args[1]; return; }
  if (--t[field] !== 0) t.ptr = args[1];
}

/**
 * ROM: $464B. REST is not a note-off flag: it writes NRx2 directly. With no
 * RELEASE_ENV set that byte is 0 (silence); with one, the envelope's CURRENT
 * top nibble is kept and only the low nibble is replaced, so the note decays
 * from wherever the release envelope had got to. That is why song $02's
 * channel 1 sits on $72 through its rests -- $70 from the release envelope,
 * $02 from `RELEASE_ENV $02`.
 */
function rest(drv, t, dur) {
  t.dur = dur;
  t.gate = 0;
  const b = t.relNib;
  t.nrx2 = b === 0 ? 0 : ((t.nrx2 & 0xF0) | b);
  t.venvCount = 1;
  t.venvPtr &= 0xFF;                             // +$14 = 0 -> static
  t.flags |= F_TRIG;                             // $41E9
}

/** ROM: $446A. Attack for one tick, then the sustain value for duration-1. */
function drum(drv, t, p, dur) {
  t.dur = 1;                                     // $447E, before the duration
  t.nrx2 = p[0];
  drv.autoNoise = p[2];
  drv.autoNoiseDur = u8(dur - 1);
  t.flags |= F_AUTO;
  noteTail(drv, t, p[1]);
}

/** ROM: $44D3. The preset's note ramps; the stream's note is the destination. */
function slide(drv, t, p, n, dur) {
  drv.autoNote = n;                              // $C80B
  drv.autoDur = dur;                             // $C80C
  t.flags |= 0x28;                               // $44F0: LEGATO + AUTO
  t.bend = p[0];                                 // +$19: the ramp itself

  // $44FB: the volume envelope is reloaded here rather than in the note tail,
  // because LEGATO was just set and the tail's reload is skipped.
  t.venvPtr = t.venvBase;
  t.venvCount = 1;

  const attackDur = p[2];
  t.dur = attackDur;
  const rem = drv.autoDur - attackDur;
  if (rem >= 0) drv.autoDur = rem;               // $4517
  else { t.dur = drv.autoDur; drv.autoDur = 0; } // attack longer than the note
  t.gate = 0;                                    // $4524
  noteTail(drv, t, p[1]);
}

/**
 * ROM: $420A-$429D. Everything that runs EVERY tick regardless of events:
 * the slide/vibrato accumulator, the pitch envelope and the volume envelope.
 */
function modulate(drv, t) {
  // $420A: +$19 is added into the 16-bit frequency every tick and WRITTEN
  // BACK, so it accumulates permanently until the next note reloads it.
  const vib = t.bend;
  const lo = vib < 0x80 ? t.freqLo + vib : t.freqLo - (0x100 - vib);
  t.freqLo = lo & 0xFF;
  if (lo > 0xFF) { t.freqHi = u8(t.freqHi + 1); t.flags |= F_HICHG; }
  else if (lo < 0) { t.freqHi = u8(t.freqHi - 1); t.flags |= F_HICHG; }
  drv.sFreqLo = t.freqLo;
  drv.sFreqHi = t.freqHi;

  // $4237: pitch envelope. One SIGNED byte per tick, $80 + a 16-bit address
  // loops. It is applied to the STAGING byte only and does NOT accumulate --
  // each tick adds one table entry to the note's own frequency, which is what
  // makes the ±6 table at $50AF a vibrato instead of a runaway ramp. It also
  // clamps rather than carrying, so a sweep can never leave its octave.
  t.penvCount = u8(t.penvCount - 1);
  if (t.penvCount === 0) {
    t.penvCount = 1;                             // $423B: once per tick after
    if (t.penvPtr >> 8) {
      let p = t.penvPtr;
      for (let guard = 0; guard < 8; guard++) {
        const v = rd(drv, p);
        p = u16(p + 1);
        if (v < 0x80) {
          const a = drv.sFreqLo + v;
          drv.sFreqLo = a > 0xFF ? 0xFF : a;
          break;
        }
        if (v > 0x80) {
          const a = drv.sFreqLo - (0x100 - v);
          drv.sFreqLo = a < 0 ? 0 : a;
          break;
        }
        p = rdw(drv, p);                         // $80: loop
      }
      t.penvPtr = p;
    }
  }

  // $4268: volume envelope. {NRx2, ticks} pairs, $FF + a 16-bit address to
  // loop. The value is a RAW NRx2, so the hardware envelope runs inside each
  // step and the driver only re-points it -- which is why a step change also
  // sets the retrigger bit.
  t.venvCount = u8(t.venvCount - 1);
  if (t.venvCount !== 0 || !(t.venvPtr >> 8)) {
    drv.sNrx2 = t.nrx2;                          // $429B: static
  } else {
    let p = t.venvPtr;
    let v = 0;
    for (let guard = 0; guard < 8; guard++) {
      v = rd(drv, p);
      p = u16(p + 1);
      if (v !== 0xFF) break;
      p = rdw(drv, p);
    }
    drv.sNrx2 = v;
    t.nrx2 = v;
    t.venvCount = rd(drv, p);
    t.venvPtr = u16(p + 1);
    t.flags |= F_TRIG;                           // $4293
  }
  drv.sNrx1 = t.nrx1;                            // $42A3
}

/**
 * ROM: $42A5-$432E. Arbitration, then copy the four staging bytes out.
 *
 * NRx4 is written ONLY on a retrigger ($431C) or when the frequency's high
 * bits changed ($4315) -- never unconditionally. Writing it every tick is
 * audibly harmless, since the trigger bit is write-only, but it is not what
 * the cartridge does and it makes every register comparison diverge.
 */
function output(drv, t, idx) {
  const hw = t.chan;
  const me = idx + 1;
  const own = drv.owner[hw];
  if (me !== own) {
    if (me < own) return;                        // $42B1: lower priority
    drv.owner[hw] = me;                          // claim it
    t.flags |= 0x03;                             // retrigger + reupload wave
  }

  if (hw === 2) {
    if (t.flags & F_WAVE) {
      // The waveform upload is the ONLY thing that retriggers the wave
      // channel; ordinary notes just rewrite NR33/NR34, so it is inherently
      // legato. NR30 ends up holding $FFDB|$80 -- the frequency HI byte with
      // bit 7 set, not a clean $80. Only bit 7 means anything to the DAC.
      write(drv, 0xFF1A, 0x00);
      if (t.wavePtr) {
        for (let i = 0; i < 16; i++) write(drv, 0xFF30 + i, rd(drv, u16(t.wavePtr + i)));
      }
      drv.sFreqHi |= 0x80;
      write(drv, 0xFF1A, drv.sFreqHi);
      t.flags |= F_TRIG;
    }
    // $42E5: the wave channel has no envelope register, so the SAME staging
    // byte the squares send to NRx2 goes to NR32 and is read as the 2-bit
    // output shift. The three shared "envelopes" at $47DB/$47E0/$47E5 exist
    // purely to supply $20/$40/$60 as one-entry looping envelopes.
    write(drv, 0xFF1C, drv.sNrx2);
    write(drv, 0xFF1D, drv.sFreqLo);
    if (t.flags & (F_TRIG | F_HICHG)) write(drv, 0xFF1E, drv.sFreqHi);
  } else {
    // Squares and noise. Length counters are never enabled, so NRx1 is duty
    // only -- and it is written every tick, which is what keeps them disabled.
    const base = 0xFF11 + hw * 5;
    write(drv, base, drv.sNrx1);
    if (t.flags & F_TRIG) {
      write(drv, base + 1, drv.sNrx2);
      write(drv, base + 2, drv.sFreqLo);
      write(drv, base + 3, drv.sFreqHi | 0x80);
    } else {
      write(drv, base + 2, drv.sFreqLo);
      if (t.flags & F_HICHG) write(drv, base + 3, drv.sFreqHi);
    }
  }

  drv.nr51 |= t.pan;                             // $4326
}
