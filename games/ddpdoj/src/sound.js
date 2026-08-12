// THE 68K CUE POST/QUEUE -- state-exact against the de-duped mailbox.tsv oracle.
//
// Wave A (Sound). See docs/worklog/ddpdoj/136-impl-sound-wave-a.md and the
// architect plan docs/worklog/ddpdoj/135-sound-architect-plan.md section 2.
//
// The 68k posts a sound cue through one of six ENTRY routines. Each entry gates
// on three RAM words, optionally runs the TAIL (pan subtract + master volume +
// clamp), packs [type][pan][id][chan<<2] into a longword, and enqueues it onto a
// 100-slot ring. A per-frame BIOS pump dequeues one longword, writes it to the
// $C10006 payload window, and rings the Z80 NMI doorbell ($C00002 := $0001).
// mailbox.tsv under rip/sound/ is exactly that doorbell stream, frame-exact.
//
// STATE LIVES IN MAIN RAM, not in this module. The ring ($81DD1E), the head/tail
// cursors ($81DEAE/$81DEB0), the master volume ($81DEB4) and the two debounce
// counters ($81DEB6/$81DEB8) are all in the $800000-$81FFFF main RAM the rest of
// the port already models, so a future frame-level gate can inspect them with no
// translation layer (the same rule ram.js header states). This module only owns
// the SHADOW/LOG/DIGEST triple -- the Gradius sound.js pattern, lifted -- which a
// gate compares per frame against the de-duped mailbox.
//
// WHAT THIS WAVE PROVES, and what it does not. The post+tail+pack+enqueue+drain
// transform is BYTE-EXACT against every cue door in mailbox.tsv (650 of 653 cue
// doors reproduce; 2 are the $7676 Z80-upload artifact, 1 is a rare id=$41 BGM
// cue). That is the transform-level gate in tests/sound.test.js. Frame-for-frame
// alignment -- which logic frame each door fires on -- additionally needs a full
// stage1-deep replay, and the port has no stage1-deep seed or portin recording
// (the mailbox capture ran inside MAME, not through the port harness). That is
// the measured deferral; the engine that the replay would exercise is here.

import { UnportedLog } from './unported.js';

// RAM addresses (build B; main RAM at $800000). Every one measured from the
// disassembly, not assumed.
export const SOUND = {
  ring:      0x81DD1E, // 100 longword slots (400 bytes); the cue ring buffer
  head:      0x81DEAE, // word; DEQUEUE cursor. +4, wraps $190 -> 0.
  tail:      0x81DEB0, // word; ENQUEUE cursor. +4, wraps $190 -> 0.
  masterVol: 0x81DEB4, // word; clr.w at sound-init ($18AAE0/$28BFBA). 0 across stage 1.
  debounceA: 0x81DEB6, // byte; id=$1E re-trigger guard ($28C5E4 writes 2). Drain decrements.
  debounceB: 0x81DEB8, // byte; id=$24 re-trigger guard ($28C714 writes 3). Drain decrements.
  // THE THREE GATES. The port READS them exactly as the 68k does.
  gateEnableB: 0x80380A, // byte; tst.b in every entry. Sound-enable.
  gateEnableW: 0x80392A, // word; tst.w in every entry. Sound-enable.
  // DUAL-ROLE (highest risk in the architect plan). This word is BOTH the sound
  // mute gate AND the midboss column selector (handlers.js reads it to pick 47
  // vs 41). Gameplay OWNS the write; sound CONSUMES the same value. The sound
  // side NEVER writes $803926 -- writing it here would desync the midboss column
  // selector, which is exactly the entanglement the plan warns about.
  gateDual:    0x803926, // word; tst.w in every entry. READ ONLY here.
  // The two scratch words the BIOS pump rebuilds the doorbell byte from. They do
  // not affect the mailbox (data is always $0001); modelled for completeness.
  dd18: 0x81DD18,
  dd1a: 0x81DD1A,
};

// The six entry routines and the cue TYPE each posts. The 'gate' field selects
// which branch logic applies; 'tail' is whether the pan/master/clamp runs.
const ENTRY = {
  0x28C02A: { type: 0x00, gate: 'bgm',  tail: true  }, // BGM / streaming-music
  0x28C074: { type: 0x02, gate: 'sfx',  tail: true  }, // T2 (ungated channel)
  0x28C0AE: { type: 0x01, gate: 'sfx',  tail: true  }, // SFX
  0x28C0E8: { type: 0x0F, gate: 'none', tail: false }, // -> $28BB4A (streaming)
  0x28C0FC: { type: 0x10, gate: 'none', tail: false }, // -> $28BB76 (streaming)
  0x28C10C: { type: 0x20, gate: 'none', tail: false }, // -> $28BB8A (streaming)
};

/**
 * The cue-wrapper table: wrapper-addr -> {id, pan, channel, entry}. Auto-extracted
 * via capstone (see .scratch/sound_wave_a/extract_wrappers.py); every constant is
 * the literal the 68k move.w-immediate loads before its jsr to the entry. Each
 * wrapper is a 5-line constant-set + call; the id/pan/channel are fixed per call
 * site, the entry picks the type and gate. Two wrappers ($28C5E4/$28C714) carry a
 * debounce guard ('deb') that suppresses retriggering until the drain has ticked
 * the counter down to zero. */
const WRAPPERS = {
  0x28C25A: { id: 0x00, pan: 0xB4, ch: 0x1E, entry: 0x28C0AE }, // SFX id=0 (40x)
  0x28C274: { id: 0x01, pan: 0x9E, ch: 0x1E, entry: 0x28C0AE },
  0x28C28E: { id: 0x02, pan: 0x80, ch: 0x1E, entry: 0x28C0AE },
  0x28C2A8: { id: 0x03, pan: 0x8A, ch: 0x1E, entry: 0x28C0AE }, // SFX id=3 (34x)
  0x28C2C2: { id: 0x04, pan: 0x80, ch: 0x1E, entry: 0x28C0AE },
  0x28C2DC: { id: 0x05, pan: 0xA8, ch: 0x1E, entry: 0x28C02A },
  0x28C2F6: { id: 0x06, pan: 0xA8, ch: 0x1E, entry: 0x28C02A },
  0x28C310: { id: 0x07, pan: 0xFF, ch: 0x1E, entry: 0x28C02A },
  0x28C392: { id: 0x06, pan: 0xA8, ch: 0x1E, entry: 0x28C02A }, // boss: passes through to id=6
  0x28C3A0: { id: 0x0C, pan: 0xB2, ch: 0x3E, entry: 0x28C02A },
  0x28C3BA: { id: 0x0D, pan: 0x5D, ch: 0x0A, entry: 0x28C02A }, // BGM id=D (368x, music)
  0x28C3EE: { id: 0x15, pan: 0x5D, ch: 0x0A, entry: 0x28C02A }, // hyper-shot fire
  0x28C408: { id: 0x0E, pan: 0x80, ch: 0x28, entry: 0x28C074 },
  0x28C422: { id: 0x0E, pan: 0x80, ch: 0x29, entry: 0x28C074 },
  0x28C43C: { id: 0x0E, pan: 0x80, ch: 0x28, entry: 0x28C0E8 }, // type $F (8x)
  0x28C452: { id: 0x0E, pan: 0x80, ch: 0x29, entry: 0x28C0E8 },
  0x28C468: { id: 0x12, pan: 0x80, ch: 0x28, entry: 0x28C074 },
  0x28C482: { id: 0x12, pan: 0x80, ch: 0x29, entry: 0x28C074 },
  0x28C49C: { id: 0x12, pan: 0x80, ch: 0x28, entry: 0x28C0E8 },
  0x28C4B2: { id: 0x12, pan: 0x80, ch: 0x29, entry: 0x28C0E8 },
  0x28C4C8: { id: 0x16, pan: 0xE6, ch: 0x28, entry: 0x28C074 },
  0x28C4E2: { id: 0x16, pan: 0xFA, ch: 0x29, entry: 0x28C074 },
  0x28C4FC: { id: 0x16, pan: 0x80, ch: 0x28, entry: 0x28C0E8 },
  0x28C512: { id: 0x16, pan: 0x80, ch: 0x29, entry: 0x28C0E8 },
  0x28C528: { id: 0x0F, pan: 0xE4, ch: 0x28, entry: 0x28C02A },
  0x28C542: { id: 0x13, pan: 0xE4, ch: 0x28, entry: 0x28C02A },
  0x28C55C: { id: 0x10, pan: 0xFF, ch: 0x28, entry: 0x28C02A },
  0x28C576: { id: 0x14, pan: 0xFF, ch: 0x28, entry: 0x28C02A },
  0x28C5B0: { id: 0x17, pan: 0xFF, ch: 0x00, entry: 0x28C02A },
  0x28C5CA: { id: 0x1D, pan: 0xE4, ch: 0x01, entry: 0x28C02A }, // item pickup
  0x28C5E4: { id: 0x1E, pan: 0xFF, ch: 0x01, entry: 0x28C0AE,
    deb: [SOUND.debounceA, 2], debAlways: true },
  0x28C610: { id: 0x1E, pan: 0xFF, ch: 0x01, entry: 0x28C02A },
  0x28C62A: { id: 0x1F, pan: 0xFF, ch: 0x01, entry: 0x28C02A },
  0x28C644: { id: 0x20, pan: 0xFF, ch: 0x01, entry: 0x28C02A },
  0x28C65E: { id: 0x21, pan: 0xFF, ch: 0x01, entry: 0x28C02A },
  0x28C678: { id: 0x22, pan: 0xFF, ch: 0x01, entry: 0x28C02A },
  0x28C692: { id: 0x1C, pan: 0x80, ch: 0x02, entry: 0x28C02A },
  0x28C6AC: { id: 0x18, pan: 0x80, ch: 0x00, entry: 0x28C02A },
  0x28C6C6: { id: 0x19, pan: 0x80, ch: 0x00, entry: 0x28C02A }, // tally bonus-event
  0x28C6E0: { id: 0x1A, pan: 0xFF, ch: 0x00, entry: 0x28C02A },
  0x28C6FA: { id: 0x1B, pan: 0x94, ch: 0x00, entry: 0x28C02A },
  0x28C714: { id: 0x24, pan: 0x62, ch: 0x03, entry: 0x28C0AE, deb: [SOUND.debounceB, 3] }, // shot (172x)
  0x28C740: { id: 0x24, pan: 0x80, ch: 0x03, entry: 0x28C02A },
  0x28C75A: { id: 0x25, pan: 0x80, ch: 0x03, entry: 0x28C02A },
  0x28C7A8: { id: 0x28, pan: 0xFF, ch: 0x0A, entry: 0x28C074 },
  0x28C7C2: { id: 0x28, pan: 0x80, ch: 0x0A, entry: 0x28C0E8 },
  0x28C7D8: { id: 0x2D, pan: 0xFF, ch: 0x0A, entry: 0x28C02A },
  0x28C812: { id: 0x29, pan: 0xD2, ch: 0x0A, entry: 0x28C02A },
  0x28C82C: { id: 0x2A, pan: 0x80, ch: 0x0A, entry: 0x28C074 },
  0x28C846: { id: 0x2A, pan: 0x80, ch: 0x0A, entry: 0x28C0E8 },
  0x28C85C: { id: 0x2B, pan: 0xFF, ch: 0x0A, entry: 0x28C02A },
  0x28C876: { id: 0x2C, pan: 0xFF, ch: 0x0A, entry: 0x28C074 },
  0x28C890: { id: 0x2C, pan: 0x80, ch: 0x0A, entry: 0x28C0E8 },
  0x28C8A6: { id: 0x2E, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C8C0: { id: 0x2F, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C8DA: { id: 0x30, pan: 0xDC, ch: 0x0A, entry: 0x28C02A },
  0x28C8F4: { id: 0x31, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C90E: { id: 0x32, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C928: { id: 0x33, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C942: { id: 0x34, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C95C: { id: 0x35, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C976: { id: 0x36, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C990: { id: 0x37, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C9AA: { id: 0x38, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C9C4: { id: 0x39, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C9DE: { id: 0x3A, pan: 0x80, ch: 0x0A, entry: 0x28C02A },
  0x28C9F8: { id: 0x3B, pan: 0xFF, ch: 0x14, entry: 0x28C02A }, // power-up
  0x28CA12: { id: 0x3C, pan: 0xFF, ch: 0x14, entry: 0x28C02A },
  0x28CA60: { id: 0x3F, pan: 0xFF, ch: 0x14, entry: 0x28C02A },
  0x28CA7A: { id: 0x40, pan: 0xFF, ch: 0x14, entry: 0x28C02A }, // boss warning
};

// W150: the real streaming leaf wrappers call one of two score-index resolvers
// and tail-jump into `$28C11C` (type $12) or `$28C146` (type $11). The first
// word is passed through `$28B884`; W162 preserves that synchronous group
// upload at the runtime boundary before posting the ordinary four-byte door.
// The second word becomes the selector.
export const STREAMING_LEAVES = Object.freeze(new Map([
  [0x28CB38, { index: 7,  group: 0, id: 7, type: 0x12 }],
  [0x28CB4C, { index: 8,  group: 0, id: 8, type: 0x11 }],
  [0x28CB60, { index: 9,  group: 0, id: 9, type: 0x11 }],
  [0x28CB74, { index: 10, group: 0, id: 10, type: 0x12 }],
  [0x28CB88, { index: 12, group: 1, id: 1, type: 0x12 }],
  [0x28CB9C, { index: 11, group: 1, id: 0, type: 0x12 }],
  [0x28CBB0, { index: 13, group: 2, id: 0, type: 0x12 }],
  [0x28CBC4, { index: 14, group: 5, id: 1, type: 0x12 }],
  [0x28CBD8, { index: 15, group: 3, id: 0, type: 0x12 }],
  [0x28CBEC, { index: 16, group: 4, id: 0, type: 0x12 }],
  [0x28CC00, { index: 17, group: 3, id: 1, type: 0x12 }],
  [0x28CC14, { index: 18, group: 6, id: 0, type: 0x12 }],
  [0x28CC28, { index: 19, group: 5, id: 0, type: 0x12 }],
]));

/** The id=$44 sentinel: the BGM entry $28C02A silently drops any cue whose id is
 *  $44 (cmpi.w #$44,d0; beq -> rts). No wrapper in the table emits id=$44; this
 *  constant exists so the gate can name the behaviour and a caller can verify it.
 *  Confirmed: no note() site and no inline caller passes $44 (architect plan open
 *  item, RESOLVED). */
export const NOOP_SENTINEL_ID = 0x44;

// --------------------------------------------------------------- core primitives

/** $28BFEC -- the pan/master-volume tail. D1=pan in/out; D2=id (for the $1D
 *  exception); returns the clamped pan byte. Verified byte-exact against every
 *  mailbox pan: masterVol is 0 across stage 1 and gateDual is 0, so the whole
 *  transform collapses to `pan - $14` (pan - $3C is never taken). */
export function tailPan(ram, id, panArg) {
  let p = panArg;
  if (id !== 0x1D) p -= 0x14;
  if (ram.u16(SOUND.gateDual) !== 0) p -= 0x3C;
  p += ram.u16(SOUND.masterVol);
  if (p > 0xFF) p = 0xFF;
  if (p < 0x00) p = 0x00;
  return p;
}

/** $28BB04 -- pack [type][pan][id][chan<<2|(id>>8)&3] into one longword. */
export function packLongword(type, pan, id, chan) {
  const lo = (((chan & 0xFF) << 2) | ((id >> 8) & 3)) & 0xFFFF;
  const idByte = (id << 8) & 0xFFFF;
  const lowWord = (idByte | lo) & 0xFFFF;
  const highWord = (((type & 0xFF) << 8) | (pan & 0xFF)) & 0xFFFF;
  return ((highWord << 16) | lowWord) >>> 0;
}

/** The three-gate decision, per entry. Returns true if the cue POSTS.
 *  - 'bgm'  ($28C02A): the id=$44 sentinel always drops; otherwise the enable
 *    bits short-circuit to POST, and when only gateDual is live, id=$17 is the
 *    single id that still posts.
 *  - 'sfx'  ($28C074/$28C0AE): POST unless all three gates are in the quiescent
 *    state (enableB==0, enableW==0, gateDual!=0).
 *  - 'none' (streaming $28C0E8/$28C0FC/$28C10C): always posts. */
function gatePasses(ram, gate, id) {
  if (gate === 'none') return true;
  const enB = ram.u8(SOUND.gateEnableB);
  const enW = ram.u16(SOUND.gateEnableW);
  if (enB !== 0 || enW !== 0) return true;     // enable bits short-circuit to POST
  const dual = ram.u16(SOUND.gateDual);
  if (gate === 'bgm') {
    if (id === NOOP_SENTINEL_ID) return false; // the $44 drop
    if (dual === 0) return true;
    return id === 0x17;                        // only id $17 posts under gateDual
  }
  // 'sfx'
  return dual === 0;
}

/** $28BAA0 -- enqueue one longword onto the ring. Returns false if the ring is
 *  full (the 68k sets the carry flag and drops; the one-slot gap is preserved).
 *  HEAD ($81DEAE) is the dequeue cursor; TAIL ($81DEB0) the enqueue cursor. */
export function enqueue(ram, longword) {
  let d1 = (ram.u16(SOUND.head) - 4 + 0x190) % 0x190; // head-4, wrapped
  if (d1 === ram.u16(SOUND.tail)) return false;        // full (leave-one-empty)
  ram.setU32(SOUND.ring + ram.u16(SOUND.tail), longword);
  let t = ram.u16(SOUND.tail) + 4;
  if (t >= 0x190) t = 0;
  ram.setU16(SOUND.tail, t);
  return true;
}

/** $28BA5E / $18A584 -- dequeue one longword, or null if empty. The two are
 *  byte-identical in the ROM and share the same ring. */
export function dequeue(ram) {
  const h = ram.u16(SOUND.head);
  if (h === ram.u16(SOUND.tail)) return null;   // empty
  const v = ram.u32(SOUND.ring + h);
  let nh = h + 4;
  if (nh >= 0x190) nh = 0;
  ram.setU16(SOUND.head, nh);
  return v;
}

// --------------------------------------------------------------- the state + API

/** The shadow/log/digest triple (Gradius sound.js's pattern, lifted). PER GAME
 *  for NOTES-replay.md's reason (state derives from initial state + input only).
 *  The ring/head/tail/master/debounce live in main RAM; this class owns only the
 *  gate's compared fields. */
export class SoundState {
  constructor() {
    this.doorLog = [];      // [{lf, type, pan, id, chan, word}] per drained door
    this.shadow = [];       // the longwords drained, in order (the mailbox row sequence)
    this.frameDoors = [];   // doors drained THIS frame (cleared each drainFrame sweep)
    this.framePosts = 0;    // cues enqueued this frame (incl. gate-dropped counted separately)
    this.frameDrops = 0;    // cues the gate dropped this frame
    this.digest = 0;        // rolling 16-bit hash, folded per drained door
    this.postCount = 0;     // total enqueues
    this.dropCount = 0;     // total gate drops
    this.doorCount = 0;     // total drained doors
    this.streamingResolvers = []; // exact leaf/index/group facts from `$28B884`
  }
  /** Gradius's polynomial, applied to the drained longword. All four bytes are
   *  mixed (type/pan/id/chan) so a change to ANY one -- including the pan the
   *  tail computes -- moves the digest. */
  static fold(digest, word) {
    const b0 = (word >>> 24) & 0xFF, b1 = (word >>> 16) & 0xFF;
    const b2 = (word >>> 8) & 0xFF, b3 = word & 0xFF;
    return (((((digest * 31 + b0) * 31 + b1) * 31 + b2) * 31 + b3) & 0xFFFF);
  }
}

/** $28BFBA / $18AAE0 -- sound-init. Clears master volume, the debounce counters
 *  and the fade words, and sets the ring-related $81DEB2. The port resumes
 *  mid-game so this does not normally run; it exists so a cold-boot path and the
 *  unit test can establish the documented post-init state. */
export function initSound(ram) {
  ram.setU16(0x81DEB2, 0x7D);
  ram.setU16(SOUND.masterVol, 0);
  ram.setU8(SOUND.debounceA, 0);
  ram.setU8(SOUND.debounceA + 1, 0);
  ram.setU8(SOUND.debounceB, 0);
  ram.setU16(0x81DEBA, 0);
  ram.setU16(0x81DEBC, 0);
}

/** Run one entry: gate, (tail), pack, enqueue, shadow update. Returns true if
 *  the cue posted (enqueued). This is the shared body the wrappers fall into. */
export function postEntry(ram, sound, entryAddr, id, panArg, chan) {
  const e = ENTRY[entryAddr];
  if (!e) throw new Error(`sound.postEntry: unknown entry $${entryAddr.toString(16)}`);
  if (!gatePasses(ram, e.gate, id)) { sound.dropCount++; sound.frameDrops++; return false; }
  let pan = panArg;
  if (e.tail) pan = tailPan(ram, id, panArg);
  // For the streaming no-tail entries $28BB4A/$28BB76/$28BB8A the pan byte the
  // packer emits is 0 (they set only the type and rely on chan/id from D2/D3).
  // The WRAPPERS table already carries panArg=0 for those, so packLongword is
  // correct either way; keep panArg authoritative for the tail entries.
  if (!e.tail) pan = 0;
  const word = packLongword(e.type, pan, id, chan);
  if (enqueue(ram, word)) {
    sound.postCount++; sound.framePosts++;
    return true;
  }
  // ring full -> dropped (the 68k sets the interrupt mask and returns; a full ring
  // under sustained posting is a real failure mode the gate should see).
  sound.dropCount++; sound.frameDrops++;
  return false;
}

/** Post by WRAPPER address -- the API every note() site calls. Looks up the
 *  wrapper, applies its debounce guard if any, and runs the entry. This replaces
 *  `note(ctx, 0x28Cxxx, '...')` one-for-one. */
export function postWrapper(ram, sound, wrapperAddr) {
  const w = WRAPPERS[wrapperAddr];
  if (!w) {
    if (STREAMING_LEAVES.has(wrapperAddr)) {
      return postStreamingLeaf(ram, sound, wrapperAddr);
    }
    // An unmapped wrapper is a loud gap, not a silent drop.
    throw new Error(`sound.postWrapper: no wrapper at $${wrapperAddr.toString(16).toUpperCase()}`
      + ` -- add it to WRAPPERS or fix the call site`);
  }
  if (w.deb) {
    const [addr, val] = w.deb;
    if (ram.u8(addr) !== 0) return false;   // still debouncing -> suppressed
    const posted = postEntry(ram, sound, w.entry, w.id, w.pan, w.ch);
    // `$28C5E4` writes its guard after the attempted `$28C0AE` call even when
    // the sound ring is full. Other guarded wrappers arm only on a real post.
    if (posted || w.debAlways) ram.setU8(addr, val);
    return posted;
  }
  return postEntry(ram, sound, w.entry, w.id, w.pan, w.ch);
}

/** The streaming-BGM rejoiners $28C11C (type $12) and $28C146 (type $11). The
 *  poller $28BE76 calls these with D0=id, D1=pan after gating on gateDual. They
 *  run the tail and pack through the $28BB9E variant (same longword shape). */
export function postStreamingRejoiner(ram, sound, rejoinerAddr, id, panArg) {
  if (rejoinerAddr !== 0x28C11C && rejoinerAddr !== 0x28C146) {
    throw new Error(`sound.postStreamingRejoiner: unknown rejoiner `
      + `$${rejoinerAddr.toString(16).toUpperCase()}`);
  }
  if (ram.u16(SOUND.gateDual) !== 0) { sound.dropCount++; sound.frameDrops++; return false; }
  const type = rejoinerAddr === 0x28C11C ? 0x12 : 0x11;
  const pan = tailPan(ram, id, panArg);
  const word = packLongword(type, pan, id, 0);
  if (enqueue(ram, word)) { sound.postCount++; sound.framePosts++; return true; }
  sound.dropCount++; sound.frameDrops++;
  return false;
}

/** `$28CB38-$28CC28`: resolve the fixed score index, then run the real tail. */
export function postStreamingLeaf(ram, sound, wrapperAddr) {
  const leaf = STREAMING_LEAVES.get(wrapperAddr);
  if (!leaf) {
    throw new Error(`sound.postStreamingLeaf: no leaf at `
      + `$${wrapperAddr.toString(16).toUpperCase()}`);
  }
  sound.streamingResolvers.push({ wrapper: wrapperAddr, index: leaf.index,
    group: leaf.group, id: leaf.id, type: leaf.type });
  const rejoiner = leaf.type === 0x12 ? 0x28C11C : 0x28C146;
  return postStreamingRejoiner(ram, sound, rejoiner, leaf.id, 0xff);
}

/** `$28CAFC`: preserve `$28B884`'s synchronous group upload before the leaf's
 * ordinary four-byte queue post. The upload is a side effect, never payload. */
export function postWrapperWithRuntime(ram, sound, runtimeSink, wrapperAddr) {
  const leaf = STREAMING_LEAVES.get(wrapperAddr);
  if (leaf) runtimeSink?.selectScoreGroup?.(leaf.group);
  return postWrapper(ram, sound, wrapperAddr);
}

/** $28C19A + $18ACE0 -- the per-frame drain. The debounce counters decrement
 *  unconditionally at the top of $28C19A (whether or not the ring is empty), and
 *  the BIOS pump $18ACE0 dequeues one longword and would doorbell. In the corpus
 *  the mailbox PC is exclusively $18AD78 (the BIOS pump), so the pump drains
 *  first and $28C19A's own ringer ($28C226/$28C252) is dead code (the architect
 *  plan's dead-code trap). We model the LIVE observable: one dequeue, recorded
 *  into the shadow/log/digest. The $C00004 ACK is immediate-post (the corpus
 *  acked within every frame); flagged for Wave C if the Z80 timeline differs. */
export function drainFrame(ram, sound, lf) {
  sound.frameDoors = [];
  sound.framePosts = 0;
  sound.frameDrops = 0;
  // $28C19A top: decrement the debounce guards.
  if (ram.u8(SOUND.debounceA) !== 0) ram.setU8(SOUND.debounceA, ram.u8(SOUND.debounceA) - 1);
  if (ram.u8(SOUND.debounceB) !== 0) ram.setU8(SOUND.debounceB, ram.u8(SOUND.debounceB) - 1);
  // $18ACE0: dequeue one longword; if present, write $C10006/$C10008 + doorbell.
  const word = dequeue(ram);
  if (word === null) return null;
  const type = (word >>> 24) & 0xFF;
  const pan = (word >>> 16) & 0xFF;
  const id = (word >>> 8) & 0xFF;
  const chan = word & 0xFF;
  const selector = id | ((chan & 3) << 8);
  const channel = chan >> 2;
  const door = { lf, type, pan, id, chan, packedChannel: chan,
    selector, channel, word };
  sound.doorLog.push(door);
  sound.shadow.push(word);
  sound.frameDoors.push(door);
  sound.digest = SoundState.fold(sound.digest, word);
  sound.doorCount++;
  return door;
}

/**
 * The complete per-logic-frame boundary consumed by the live sound runtime.
 * An empty frame is zero bytes; a drained 68k/Z80 door is its exact four bytes.
 * This deliberately carries no decoded or oracle-only parameter history.
 */
export function soundFrameInput(door) {
  if (door === null || door === undefined) return new Uint8Array(0);
  const bytes = [door.type, door.pan, door.id, door.packedChannel ?? door.chan];
  for (let i = 0; i < bytes.length; i++) {
    if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 0xff) {
      throw new TypeError(`sound frame input: byte ${i} is outside 0..255`);
    }
  }
  return Uint8Array.from(bytes);
}

/** Convenience for handlers: post by wrapper and (if a sound state is absent,
 *  e.g. in a unit test without a full Game) degrade to a counted note instead of
 *  throwing. The 68k never crashes on a cue post, and neither does the port. */
export function soundPost(ctx, wrapperAddr) {
  const g = ctx?.__game;
  if (g && g.sound && g.ram) {
    return postWrapper(g.ram, g.sound, wrapperAddr);
  }
  ctx?.unportedLog?.note(wrapperAddr, 'sound cue (no SoundState on this ctx)');
  return false;
}

/** The wrapper table (read-only export for tests and the gate). */
export const SOUND_WRAPPERS = WRAPPERS;
export const SOUND_ENTRY = ENTRY;

/**
 * `$28D53C` -- THE `$81DF20` BUSY GATE.  Five instructions, **SIX callers**.  W344.
 *
 *     28d53c  tst.w $81DF20
 *     28d542  beq $28D54C
 *     28d546  ori  #$1,SR / rts        non-zero -> carry SET
 *     28d54c  andi #$FFFE,SR / rts     zero     -> carry CLEAR
 *
 * **Carry SET means "not now".** That is this codebase's convention, now seen in five routines:
 * `$281842`'s full pool (W336), `$26DC00`'s retry (W340), `$26FF9E`'s still-moving (W343), `$2593F8`'s
 * search (W344) and this. All of them write SR directly with `ori`/`andi` rather than relying on an
 * arithmetic side effect, so **when a caller has a `bcs`/`bcc` with no obvious flag source, look for an
 * explicit SR write in the callee** -- and read the polarity AT the `ori`/`andi`, never at the caller's
 * branch. I got that backwards once on `$26FFE2` (W343) having read the caller correctly.
 *
 * The transition screen's phase-0 arm uses it as its first real gate: `$25DC68 jsr $28D53C / bcs $25DCC0`
 * abandons the START press when this returns busy.
 *
 * **`$81DF20`'s MEANING IS NOT MEASURED.** It has exactly three references -- this routine, `$28D59E` and
 * `$28D5EC` -- all inside `$28D5xx`, so it is that subsystem's own flag and nothing outside writes it. The
 * port models the GATE, not the flag: whatever sets `$81DF20` is in the two unread siblings.
 *
 * @returns {boolean} true when the caller should proceed (carry CLEAR), false when it should not
 */
export function busyGate28D53C(ram) {
  return ram.u16(0x81df20) === 0;                          // $28D53C tst.w / $28D542 beq
}
