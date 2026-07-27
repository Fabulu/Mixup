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
// Master reference §8 documents the formats. Quirks it proves, which this
// relies on: length counters are never enabled, the sweep is off forever, and
// silence is emergent (an unowned channel gets NRx2 = 0 every tick).

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

/** NR register bases per hardware channel; channel 2 is the wave channel. */
const NR_BASE = [0xFF10, 0xFF15, 0xFF1A, 0xFF1F];

/**
 * Operand widths, so the sequence walker stays in step even for opcodes whose
 * EFFECT is not implemented. Getting this wrong desynchronises the byte stream
 * and turns the rest of the song into noise, so it is transcribed from
 * master-ref §8 / tools/dumpsong.py rather than inferred.
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

/** Opcodes whose effect this port does not implement. Kept explicit. */
export const UNIMPLEMENTED_OPS = new Set([
  0xC8, 0xC9, 0xCA,                                      // channel-mask ops
  0xF5,                                                  // release envelope
]);

// SLIDE/DEFSLIDE. These are how the WAVE channel plays -- like drums on the
// noise channel, stubbing them out leaves the bass line silent.
//
// $44D3: a SLIDE reads a NOTE byte and then a duration (or FIXDUR), so it is a
// note with extra state, not a bare duration. $44F3 copies the preset's first
// byte into +$19, which $420A adds to the frequency every tick -- that is the
// slide itself. The presets live at $C80F + n*3.
const SLIDE_PLAY = { 0xD4: 5, 0xD5: 4, 0xD6: 3, 0xD7: 2, 0xD8: 1, 0xD9: 0 };
const SLIDE_DEF = { 0xDA: 5, 0xDB: 4, 0xDC: 3, 0xDD: 2, 0xDE: 1, 0xDF: 0 };

// DRUM/DEFDRUM. These are how the NOISE channel plays at all -- it has no
// notes of its own, so stubbing them out leaves the percussion silent.
// A preset is three bytes: {NR42, NR43, NR43-again}. The drum triggers with
// the first NR43 and RE-triggers on the next tick with the second, and that
// two-stage pitch drop is what makes it read as a hit rather than a beep.
const DRUM_PLAY = { 0xCB: 3, 0xCC: 2, 0xCD: 1, 0xCE: 0 };
const DRUM_DEF = { 0xCF: 3, 0xD0: 2, 0xD1: 1, 0xD2: 0 };

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

function makeTrack() {
  return {
    active: false,
    chan: 0,
    ptr: 0,            // +2/+3 sequence pointer
    fixdur: 0,         // +4
    dur: 1,            // +5 duration counter
    gateLimit: 0,      // +6
    gate: 0,           // +7
    transpose: 0,      // +8
    detune: 0x80,      // +9 -- $80 cancels the pitch table's -$80 bias
    freq: 0,           // +$0A/+$0B
    // Volume envelope: pairs of {NRx2 byte, ticks}, terminated by $FF + a
    // 16-bit loop address. The byte is a RAW NRx2 -- the hardware envelope
    // does the per-note shaping and the driver only re-points it, which is why
    // master-ref notes that every NRx2 write comes with a retrigger.
    volEnv: 0, volEnvPtr: 0, volEnvTimer: 0, volEnvVal: 0,
    keyOffEnv: 0,
    // Pitch envelope: one SIGNED byte per tick added to the frequency's low
    // byte, terminated by $80 + a 16-bit loop address.
    pitchEnv: 0, pitchEnvPtr: 0, pitchEnvDelay: 0, pitchBend: 0,
    volume: 0x0F,
    duty: 2,
    pan: 0xFF,
    legato: false,
    keyOn: false,
    ret: 0,            // 1-deep CALL return
    loopA: 0, loopAPtr: 0,
    loopB: 0, loopBPtr: 0,
    wavePtr: 0,
    drums: [null, null, null, null],
    drumNR42: 0, drumNext: 0, drumStage: 0,
    slides: [null, null, null, null, null, null],
    bendPerTick: 0,                // +$19, added to the frequency each tick
    slidePending: false, slideNote: 0, slideDur: 0,
  };
}

export function createDriver(data) {
  return {
    data,
    queue: [],                                    // $C6FB, 4 x 2 B
    tracks: Array.from({ length: TRACKS }, makeTrack),
    owner: [0, 0, 0, 0],                          // $C800-$C803, track+1
    writes: [],                                   // NR writes made this tick
    waveLoaded: -1,
  };
}

/** ROM: sub_00_0AE1. Four slots; a full queue silently drops the request. */
export function request(drv, id, mask = REQ_PLAY) {
  if (drv.queue.length < 4) drv.queue.push({ id, mask });
}

/** ROM: sub_07_4036 -- stop everything and release every channel. */
export function stopAll(drv) {
  for (const t of drv.tracks) { t.active = false; t.keyOn = false; }
  drv.owner = [0, 0, 0, 0];
}

/**
 * ROM: sub_07_40B8. A song header is a $FF-terminated list of
 * {track slot, hardware channel, sequence pointer}.
 */
export function play(drv, id) {
  const song = drv.data.songs[id];
  if (!song) return;
  for (const e of song.tracks) {
    const t = drv.tracks[e.slot & 7];
    Object.assign(t, makeTrack(), {
      active: true, chan: e.chan & 3, ptr: e.ptr, dur: 1,
    });
    drv.owner[e.chan & 3] = (e.slot & 7) + 1;   // higher index wins later
  }
}

const rd = (drv, addr) => drv.data.bank[(addr - drv.data.bankBase) & 0x3FFF];
const rdw = (drv, addr) => rd(drv, addr) | (rd(drv, addr + 1) << 8);

function write(drv, addr, value) {
  drv.writes.push([addr, value & 0xFF]);
}

/**
 * One driver tick.  ROM: sub_07_412B, 4096/69 = 59.36 Hz off the timer.
 *
 * @returns the NR writes this tick produced, oldest first.
 */
export function tick(drv) {
  drv.writes.length = 0;

  // $412B: the request byte is consumed before anything else.
  const req = drv.queue.shift();
  if (req) {
    if (req.mask & REQ_STOP) stopAll(drv);
    if (req.mask & REQ_PLAY) play(drv, req.id);
  }

  // $414D: walk every track. Ownership is recomputed from scratch so a track
  // that ended this tick hands its channel back the same tick.
  const owner = [0, 0, 0, 0];
  for (let i = 0; i < TRACKS; i++) {
    const t = drv.tracks[i];
    if (!t.active) continue;
    stepTrack(drv, t);
    if (t.active) owner[t.chan] = i + 1;         // $C800-$C803: higher wins
  }
  drv.owner = owner;

  emit(drv);
  return drv.writes;
}

/** ROM: $415B-$41EE. Advance one track's sequence and envelopes. */
function stepTrack(drv, t) {
  // A drum's second NR43 lands on the tick AFTER the hit, with its own
  // retrigger. That drop is the whole character of the sound, and it has to
  // happen before this tick's events so a fresh drum is not consumed by it.
  if (t.drumStage === 1) {
    t.freq = t.drumNext;
    t.retrigger = true;
    t.drumStage = 0;
  }

  // $415F: the duration counter gates everything. Only when it expires does
  // the track read another byte.
  t.dur = u8(t.dur - 1);
  if (t.dur === 0 && t.slidePending) {
    // $4389: flags bit 3 diverts this expiry into a replay of the slide's own
    // note, rather than a read from the sequence.
    t.slidePending = false;
    t.bendPerTick = 0;                          // $4396
    if (t.slideDur) note(drv, t, t.slideNote, t.slideDur);
  }

  if (t.dur === 0) {
    let guard = 0;
    // A run of opcodes can precede the next note; the guard stops a malformed
    // stream (or an unimplemented op that fails to consume) spinning forever.
    while (t.active && t.dur === 0 && guard++ < 64) readEvent(drv, t);
    if (t.dur === 0) t.dur = 1;
  } else if (t.gate !== 0 && t.dur === t.gate && !t.legato) {
    // $41F1: `CP (HL)` compares the REMAINING duration against the gate, so
    // the gate is a threshold, not a countdown -- the release fires when the
    // note has that many ticks left. Treating it as a countdown releases
    // almost immediately and drops the whole song onto its release envelope
    // after one tick, which is exactly what it sounded like.
    if (t.keyOffEnv) {
      t.volEnvPtr = t.keyOffEnv;                // $41F9: swap in the release
      t.volEnvTimer = 0;
    } else {
      t.keyOn = false;
    }
  }

  // $420A: +$19 is added into the frequency word every tick. This is the slide
  // (and the vibrato op writes the same field).
  if (t.bendPerTick) t.freq = u16(t.freq + t.bendPerTick);

  stepVolEnv(drv, t);
  stepPitchEnv(drv, t);
}

/** ROM: $416E. One byte: a note, or an opcode from the $43CE table. */
function readEvent(drv, t) {
  const b = rd(drv, t.ptr);
  t.ptr = u16(t.ptr + 1);
  if (b < 0xC8) { note(drv, t, b); return; }
  opcode(drv, t, b);
}

/** Read this event's duration: FIXDUR if armed, otherwise the next byte. */
function duration(drv, t) {
  if (t.fixdur !== 0) return t.fixdur;          // $418A
  const d = rd(drv, t.ptr);
  t.ptr = u16(t.ptr + 1);
  return d;
}

/** ROM: $4182-$41CA. `fixedDur` is supplied by SLIDE, which read it already. */
function note(drv, t, n, fixedDur) {
  const dur = fixedDur !== undefined ? fixedDur : duration(drv, t);
  t.dur = dur || 1;
  t.bendPerTick = 0;                            // a plain note does not slide

  // $4191: the gate is min(duration, gateLimit), halved and less one -- so a
  // note sounds for a bit under half its slot unless GATE says otherwise.
  const g = t.gateLimit && dur > t.gateLimit ? t.gateLimit : dur;
  t.gate = u8((g >> 1) - 1);

  // $41A4: transpose applies to the note index, not the frequency.
  const idx = u8(n + t.transpose);
  if (t.chan === 3) {
    // $41AE: the noise channel takes the byte as a raw NR43 value.
    t.freq = idx;
  } else {
    // $41B5: LE16 from the pitch table, biased -$80, plus the detune byte
    // whose own $80 bias cancels it.
    const p = drv.data.pitch[idx] || 0;
    t.freq = u16(p + t.detune);
  }

  t.keyOn = true;
  t.retrigger = !t.legato;                      // legato holds the phase
  // Restart both envelopes from the top. Legato deliberately does NOT, which
  // is how a slurred phrase keeps one continuous swell.
  if (!t.legato) {
    t.volEnvPtr = t.volEnv;
    t.volEnvTimer = 0;
    t.pitchEnvPtr = t.pitchEnv;
    t.pitchBend = 0;
  }
}

/** ROM: the $43CE jump table. */
function opcode(drv, t, op) {
  const shape = OPERANDS[op];
  if (shape === undefined) { t.active = false; return; }

  // Read operands FIRST, so the pointer is correct even for ops whose effect
  // is not implemented. A desynchronised stream is far worse than a missing
  // effect: everything after it decodes as garbage.
  const args = [];
  for (const k of shape) {
    if (k === 'b' || k === 'n') { args.push(rd(drv, t.ptr)); t.ptr = u16(t.ptr + 1); }
    else if (k === 'w') { args.push(rdw(drv, t.ptr)); t.ptr = u16(t.ptr + 2); }
    else if (k === 'D' || k === 'S') args.push(duration(drv, t));
  }

  if (SLIDE_DEF[op] !== undefined) {                      // $DA-$DF
    t.slides[SLIDE_DEF[op]] = args;
    return;
  }
  if (SLIDE_PLAY[op] !== undefined) {                     // $D4-$D9
    const p = t.slides[SLIDE_PLAY[op]];
    // The note is a real note: same pitch table, transpose and detune path.
    note(drv, t, args[0], args[1]);
    // $44F3: the preset's first byte becomes the per-tick frequency delta.
    t.bendPerTick = p ? ((p[0] << 24) >> 24) : 0;
    // $44EF sets flags bit 3, which makes the NEXT duration expiry replay
    // this same note from $C80B/$C80C instead of reading the stream, with the
    // bend cleared ($4396). So a slide is two events: the pitch ramp, then the
    // note settling at its true frequency and holding there.
    t.slidePending = true;
    t.slideNote = args[0];
    t.slideDur = args[1];
    return;
  }

  if (DRUM_DEF[op] !== undefined) {                       // $CF-$D2
    t.drums[DRUM_DEF[op]] = args;
    return;
  }
  if (DRUM_PLAY[op] !== undefined) {                      // $CB-$CE
    const p = t.drums[DRUM_PLAY[op]];
    t.dur = args[0] || 1;
    if (!p) { t.keyOn = false; return; }
    t.drumNR42 = p[0];
    t.freq = p[1];                                        // NR43 stage 1
    t.drumNext = p[2];                                    // NR43 stage 2
    t.drumStage = 1;
    t.keyOn = true;
    t.retrigger = true;
    return;
  }

  if (UNIMPLEMENTED_OPS.has(op)) {
    // Slides still consume a duration, so the timing stays right even though
    // the pitch ramp does not happen.
    if (shape.includes('D') || shape.includes('S')) { t.dur = args[0] || 1; t.keyOn = false; }
    return;
  }

  switch (op) {
    case 0xD3: t.fixdur = 0; break;                       // FIXDUR off
    case 0xE0: t.pitchEnv = 0; t.pitchBend = 0; break;
    // $E1 "delay 0" leaves the envelope idle rather than starting it: with it
    // armed, channel 1 holds a flat $73 on the cartridge while an accumulating
    // envelope would walk it up to $83 within five ticks. $E2/$E3 arm it.
    case 0xE1: t.pitchEnv = 0; t.pitchBend = 0; break;
    case 0xE2: t.pitchEnvDelay = 1; break;                // delay 1
    case 0xE3: t.pitchEnvDelay = 1; t.gateLimit = 0; break;
    case 0xE4: t.gateLimit = 0; break;                    // GATE off
    case 0xE5: t.pan = 0xF0; break;                       // left
    case 0xE6: t.pan = 0x0F; break;                       // right
    case 0xE7: t.pan = 0xFF; break;                       // centre
    case 0xE8: t.vibrato = args[0]; break;
    case 0xE9: t.legato = false; break;
    case 0xEA: t.legato = true; break;
    case 0xEB:                                            // TIE: hold, no retrigger
      t.dur = args[0] || 1;
      t.retrigger = false;
      break;
    case 0xEC: t.duty = args[0] & 3; break;
    case 0xED:                                            // RET
      // $ED with an empty return slot is a no-op that falls through, not an
      // error -- several sequences rely on it.
      if (t.ret) { t.ptr = t.ret; t.ret = 0; }
      break;
    case 0xEE: t.ret = t.ptr; t.ptr = args[0]; break;     // CALL
    case 0xEF:                                            // LOOP_B
      if (t.loopB === 0) t.loopB = args[0];
      if (--t.loopB > 0) t.ptr = args[1];
      break;
    case 0xF0:                                            // LOOP_A
      if (t.loopA === 0) t.loopA = args[0];
      if (--t.loopA > 0) t.ptr = args[1];
      break;
    case 0xF1: t.ptr = args[0]; break;                    // JUMP
    case 0xF2: t.fixdur = args[0]; break;
    case 0xF3: t.detune = args[0]; break;
    case 0xF4: t.transpose = args[0]; break;
    case 0xF6:                                            // REST
      t.dur = args[0] || 1;
      t.keyOn = false;
      break;
    case 0xF7: t.pitchEnvDelay = args[0]; break;
    case 0xF8: t.pitchEnv = args[0]; t.pitchEnvPtr = args[0]; t.pitchBend = 0; break;
    case 0xF9: t.gateLimit = args[0]; break;
    case 0xFA: t.keyOffEnv = args[0]; break;
    case 0xFB: t.wavePtr = args[0]; break;
    case 0xFC:
      t.volEnv = args[0];
      t.volEnvPtr = args[0];
      t.volEnvTimer = 0;
      break;
    case 0xFD: t.pan = args[0]; break;
    case 0xFE: t.volume = args[0] & 0x0F; break;
    case 0xFF: t.active = false; t.keyOn = false; break;  // END
    default: break;
  }
}

/**
 * Volume envelope: {NRx2, ticks} pairs, `$FF` + a 16-bit address to loop.
 *
 * The value is a raw NRx2, so the hardware envelope runs inside each step and
 * the driver only re-points it. A step change therefore has to retrigger the
 * channel, or the new envelope would not take effect (writing NRx2 without a
 * trigger is the "zombie envelope" case, which this engine never relies on).
 */
function stepVolEnv(drv, t) {
  if (!t.volEnv) return;
  // Decrement THEN test: the pair's byte is how many ticks the step lasts in
  // total, counting the tick it was read on. Testing first holds every step
  // one tick too long, and the error compounds down the envelope.
  if (t.volEnvTimer > 0 && --t.volEnvTimer > 0) return;

  let p = t.volEnvPtr;
  for (let guard = 0; guard < 8; guard++) {
    const v = rd(drv, p);
    if (v !== 0xFF) {
      t.volEnvVal = v;
      t.volEnvTimer = rd(drv, u16(p + 1));
      t.volEnvPtr = u16(p + 2);
      t.envChanged = true;
      return;
    }
    p = rdw(drv, u16(p + 1));                   // $FF: loop
  }
  t.volEnv = 0;                                 // malformed -- stop reading it
}

/** Pitch envelope: one signed byte per tick, `$80` + a 16-bit address loops. */
function stepPitchEnv(drv, t) {
  if (!t.pitchEnv) { t.pitchBend = 0; return; }
  if (t.pitchEnvDelay > 0) { t.pitchEnvDelay--; return; }

  let p = t.pitchEnvPtr;
  for (let guard = 0; guard < 8; guard++) {
    const v = rd(drv, p);
    if (v !== 0x80) {
      // $2E is stored as a signed offset to the frequency's LOW byte, and it
      // accumulates rather than replacing.
      t.pitchBend = u16(t.pitchBend + ((v << 24) >> 24));
      t.pitchEnvPtr = u16(p + 1);
      return;
    }
    p = rdw(drv, u16(p + 1));
  }
  t.pitchEnv = 0;
}

/**
 * Push every channel's state to the NR registers.  ROM: $42F9-$4330.
 *
 * Silence is emergent, exactly as on hardware: a channel nobody owns gets its
 * envelope register zeroed, which switches its DAC off. There is no explicit
 * note-off anywhere in the engine.
 */
function emit(drv) {
  write(drv, 0xFF26, 0x80);                     // APU on
  let panning = 0;

  for (let c = 0; c < 4; c++) {
    const o = drv.owner[c];
    const base = NR_BASE[c];
    if (!o) {
      if (c === 2) write(drv, 0xFF1A, 0x00);    // wave DAC off
      else write(drv, base + 2, 0x00);          // NRx2 = 0 -> DAC off
      continue;
    }
    const t = drv.tracks[o - 1];
    // The envelope byte IS NRx2. Silence is a zero envelope, not a mute flag.
    const nrx2 = t.keyOn ? (t.volEnv ? t.volEnvVal : (t.volume << 4)) : 0x00;
    // A new envelope step only takes effect on a retrigger.
    const trig = t.keyOn && (t.retrigger || t.envChanged);
    t.retrigger = false;
    t.envChanged = false;
    panning |= t.pan & (0x11 << c);

    // Master-ref §8: the pitch envelope "clamps at the LO byte" -- the bend is
    // added to the low byte and does NOT carry into the high byte, so a sweep
    // wraps within its octave instead of climbing out of it. (Vibrato is the
    // one that does carry.)
    const freq = (t.freq & 0xFF00) | u8(t.freq + t.pitchBend);

    if (c === 3) {
      // Noise: the value IS NR43, and there is no frequency word. Drums carry
      // their own NR42 rather than using the track's volume envelope.
      write(drv, 0xFF20, 0x00);
      write(drv, 0xFF21, t.drumNR42 || nrx2);
      write(drv, 0xFF22, t.freq & 0xFF);
      if (trig) write(drv, 0xFF23, 0x80);
      continue;
    }

    if (c === 2) {
      // Wave: no envelope register at all, so the level is NR32's 2-bit output
      // shift. Inherently legato -- it only retriggers on a waveform upload.
      if (t.wavePtr && drv.waveLoaded !== t.wavePtr) {
        write(drv, 0xFF1A, 0x00);               // DAC off while rewriting
        for (let i = 0; i < 16; i++) write(drv, 0xFF30 + i, rd(drv, t.wavePtr + i));
        drv.waveLoaded = t.wavePtr;
      }
      // $42E5 copies the SAME staging byte the squares send to NRx2 into
      // NR32 instead. The wave channel has no envelope register, so that byte
      // is read as the 2-bit output shift -- the envelope still shapes the
      // level, just coarsely.
      const on = nrx2 !== 0;
      write(drv, 0xFF1A, on ? 0x80 : 0x00);
      write(drv, 0xFF1C, on ? (nrx2 & 0x60) : 0x00);
      write(drv, 0xFF1D, freq & 0xFF);
      write(drv, 0xFF1E, (trig ? 0x80 : 0) | ((freq >> 8) & 7));
      continue;
    }

    // Squares. Length counters are never enabled, so NRx1 is duty only.
    //
    // NRx4 is written ONLY on a retrigger ($431C) or when the frequency's high
    // bits changed ($4315) -- never unconditionally. Writing it every tick is
    // audibly harmless, since the trigger bit is write-only, but it is not
    // what the cartridge does and it makes every register comparison diverge.
    write(drv, base + 1, t.duty << 6);
    write(drv, base + 2, nrx2);
    write(drv, base + 3, freq & 0xFF);
    const hi = (freq >> 8) & 7;
    if (trig) write(drv, base + 4, 0x80 | hi);
    else if (hi !== t.lastHi) write(drv, base + 4, hi);
    t.lastHi = hi;
  }

  write(drv, 0xFF24, 0x77);                     // master volume, as $4058
  write(drv, 0xFF25, panning || 0xFF);
}
