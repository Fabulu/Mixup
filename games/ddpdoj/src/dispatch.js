// THE Z80 CUE DISPATCH -- Wave C Layer 3 (the LAST layer of Wave C).
//
// See docs/worklog/ddpdoj/142-impl-sound-wave-c3.md (this wave) and
// 135-sound-architect-plan.md section 2 (Wave C, Layer 3). Layer 1
// (src/ics.js, the ICS2115 register file) and Layer 2 (src/voice.js, the voice
// engine) ship; this layer is the NMI cue dispatch that COUPLES them.
//
// The chain this module wires:
//   mailbox door (Wave A's src/sound.js: the [type][pan][id][chan] longword)
//     -> Layer 3: bank-select $09B7, read command $8200, route the cue-id
//     -> Layer 3 populates a $62EC voice slot (via the CueRouter)
//     -> Layer 2: VoiceEngine.tick emits register writes
//     -> Layer 1: IcsRegisterFile logs them (the ics.tsv oracle stream)
//
// THE NMI FLOW (decoded in worklog 142 section 0; every address cited from the
// Wave B listing z80.js):
//   $0128 NMI handler: PUSH regs; CALL $07F6; ack via OUT $8100; RETN
//   $07F6 cue dispatch:
//     LD HL,$00F0; CALL $09B7            ; bank-select(tag $00F0)
//     LD HL,$8200; CALL $0147            ; inFromPort -> A = command byte
//     AND $0F; LD ($6151),A              ; command nibble -> RAM $6151
//     CP $01; JR NZ,restore              ; command $01 = cue-with-payload
//     LD DE,$0006; LD HL,$6001; CALL $3BEA   ; copy 6-byte payload to RAM $6001
//     ... enqueue to the channel manager ...
//     LD HL,$0000; CALL $09B7            ; bank-select($0000) restore; RET
//   $09B7 bank-select: byte = (base & $0F) | (tag & $F0); OUT($8400),byte;
//                        $614F := tag_lo
//   $0829 channel manager: 40 slots (LD HL,$0028), 16-byte stride (LD HL,$0010);
//                        sets $6150 := $01 (the persistent bank base)
//
// WHAT THIS WAVE OWNS and what it defers. Layer 3 owns the dispatch CORE: the
// bank-select arithmetic, the command decode, the channel-manager slot model,
// and the FULL-CHAIN WIRING (CueDispatch -> VoiceEngine -> IcsRegisterFile). The
// cue-id -> voice-param SCRIPTS (each id indexes Z80-side ROM tables for
// sample-address / fc / volume / pan and writes them into $62EC) are DEFERRED:
// this wave routes via an injectable `paramsProvider(id)` so the chain runs now
// with oracle-reconstructed params and later with live ROM-table params. Layer
// 2's ramp math / keyoff / loop wrap (worklog 141 TODOs) also remain.

import { Z80_PORT, Z80_BANK } from './z80.js';
import { IcsRegisterFile, ICS_PORT, N_VOICES } from './ics.js';
import { VoiceEngine, VoiceSlot, ENGINE } from './voice.js';

// --------------------------------------------------------------- the driver map
// Layer 3 addresses, cited from z80.js (the Wave B listing) by symbol so a
// reviewer checks any one against the disassembly. Restated here for the port's
// self-documentation; the canonical copy is z80.js Z80_ROM.
export const DISPATCH = {
  nmiHandler:  0x0128,   // PUSH regs; CALL $07F6; OUT $8100; RETN
  cueDispatch: 0x07F6,   // bank-select; read $8200; payload from RAM $6001
  bankSelect:  0x09B7,   // byte = (base & $0F) | (tag & $F0); OUT $8400
  channelMgr:  0x0829,   // 40-slot channel manager (stride $10 = 16 bytes)
  payloadCopy: 0x3BEA,   // window -> RAM $6001 copy (length DE, dest HL)
  cmp16:       0x4231,   // carry iff HL <= DE (the 16-bit compare; loop bound)
  // the channel-manager constants decoded from the $0829 prologue
  N_SLOTS:     40,       // LD HL,$0028 at $0848 (the outer loop bound)
  SLOT_STRIDE: 0x10,     // LD HL,$0010; ADD HL,DE at $0851 (16 bytes per slot)
  // the command nibble values
  CMD_CUE:     0x01,     // CP $01 at $0807 -- the cue-with-payload command
};

// The PGM-specific control latches the channel manager programs (besides $8400).
// $094F in $0829 does a second OUT to $8300 -- a sound-control latch. Recorded,
// not interpreted (their semantics are invisible to the ics.tsv register stream).
export const DISPATCH_PORT = {
  bankLatch:  0x8400,   // the bank-select byte (written by $09B7)
  ctrlLatch:  0x8300,   // a second control latch (written by $0829 at $094F)
};

// ================================================================= bank-select
/**
 * The $09B7 bank-select BYTE -- a pure function of (base, tag). Decoded from the
 * disassembly (worklog 142 section 0): masks base with $000F, masks tag with
 * $00F0, ORs them. The result's low byte is written to port $8400 to program the
 * PGM bank register that maps the 68k's $C10000-window payload into Z80 $6000.
 *
 * With the channel-manager base $6150=$01 and the NMI tag $00F0: ($01 & $0F) |
 * ($F0 & $F0) = $F1. The NMI-tail restore $09B7($0000): ($01 & $0F) | ($00 & $F0)
 * = $01.
 *
 * @param base the persistent bank base (RAM $6150)
 * @param tag the bank-select argument (the NMI passes $00F0)
 * @returns the byte written to port $8400
 */
export function bankSelectByte(base, tag) {
  return ((base & 0x0F) | (tag & 0xF0)) & 0xFF;
}

// =================================================================== NMI state
/**
 * The Z80-side dispatch state -- the bank-mapping bytes and the command nibble
 * the NMI handler touches. Modeled as a small struct (not the full 64 KiB RAM)
 * because only these cells affect the dispatch behaviour the port reproduces.
 * The full Z80Ram (src/z80.js) is the upload oracle's concern, not the chain's.
 */
export class DispatchState {
  constructor() {
    this.bankBase = 0x00;     // RAM $6150: the persistent bank base ($0829 sets $01)
    this.bankTag = 0x00;      // RAM $614F: the bank tag (arg_lo, written by $09B7)
    this.cmdNibble = 0x00;    // RAM $6151: in($8200) & $0F
    this.lastBankByte = 0x00; // the byte last written to port $8400 (for inspection)
    this.lastCtrlByte = 0x00; // the byte last written to port $8300
    this.commandPort = 0x00;  // the raw byte on port $8200 (the doorbell payload)
  }

  /**
   * $09B7 -- bank-select. Compute the byte, write it to the $8400 latch, store
   * the tag low byte to $614F. Mirrors the disassembly exactly.
   */
  bankSelect(tag) {
    this.bankTag = tag & 0xFF;
    this.lastBankByte = bankSelectByte(this.bankBase, tag);
    return this.lastBankByte;
  }

  /**
   * $07FC-$0804 -- read the sound-command port $8200, mask the command nibble,
   * store to $6151. Returns the nibble. `commandPort` is set by the doorbell
   * (the test harness / Wave A writes the cue byte there before the NMI runs).
   */
  readCommand() {
    this.cmdNibble = this.commandPort & 0x0F;
    return this.cmdNibble;
  }
}

// ====================================================== the channel manager slots
/**
 * One channel-manager slot ($0829's 40-slot queue). Each slot is 16 bytes
 * (stride $10) in the Z80; this model carries the cue assigned to it. A slot is
 * free when `cue === null`. The slot's internal byte layout (the state the
 * channel-manager script interpreter reads) is DEFERRED -- the 40-slot queue is
 * an INTERMEDIATE not observable in ics.tsv, so the port models it behaviourally.
 */
export class ChannelSlot {
  constructor() {
    this.cue = null;   // {type, pan, id, chan} or null when free
  }
  get free() { return this.cue === null; }
}

/**
 * $0829 -- the 40-slot channel manager. Holds the 40 slots and the bank base
 * $6150 (set to $01 on first enqueue, the $0925 path). `enqueue` walks for a free
 * slot round-robin and assigns the cue; `take` peeks/slots for the router.
 */
export class ChannelManager {
  constructor() {
    this.slots = Array.from({ length: DISPATCH.N_SLOTS }, () => new ChannelSlot());
    this.cursor = 0;          // the round-robin search start
    this.baseArmed = false;   // $6150 starts $00; $0829 sets $01 on first cue
  }

  /**
   * Enqueue one cue. Walks the 40 slots round-robin from `cursor` for a free
   * slot; assigns the cue; returns the slot index (or -1 if all 40 are full, the
   * `$0020` error path at $081C). On the first successful enqueue, arms the bank
   * base $6150 := $01 (the $0925 `LD A,$01; LD ($6150),A` path).
   */
  enqueue(cue) {
    for (let step = 0; step < DISPATCH.N_SLOTS; step++) {
      const i = (this.cursor + step) % DISPATCH.N_SLOTS;
      if (this.slots[i].free) {
        this.slots[i].cue = cue;
        this.cursor = (i + 1) % DISPATCH.N_SLOTS;
        if (!this.baseArmed) { this.baseArmed = true; }
        return i;
      }
    }
    return -1;   // queue full (the $0020 error-handler path)
  }

  /** The bank base $6150 the channel manager owns. $00 until first cue, then $01. */
  get bankBase() { return this.baseArmed ? 0x01 : 0x00; }

  /** Count of occupied slots (for the coverage / structural test). */
  get occupied() { return this.slots.reduce((n, s) => n + (s.free ? 0 : 1), 0); }
}

// ============================================================ the cue-id router
/**
 * Routes a cue-id to the voice parameters that populate a $62EC VoiceSlot. The
 * cue-id -> params lookup is the DEFERRED part (each id indexes Z80-side ROM
 * tables for sample-address / fc / volume / pan; the script interpreter that
 * reads them is a later wave). This wave takes an injectable `paramsProvider(id)`
 * so the chain runs now with oracle-reconstructed params and later with live
 * ROM-table params.
 *
 * The provider returns a `VoiceSlot`-shaped object (the params the cue deposits);
 * `null` means "id not in the table / no keyon" (some cues are control-only).
 */
export class CueRouter {
  /**
   * @param {(id: number) => (Partial<VoiceSlot>|null)} paramsProvider
   *   returns the voice params for a cue-id, or null if the cue does not keyon.
   */
  constructor(paramsProvider) {
    this.paramsProvider = paramsProvider;
  }

  /**
   * Populate a VoiceSlot from a cue. Looks up the id's params via the provider
   * and, if the cue keys on, acquires an ICS voice and binds it. Returns the
   * populated slot (state = KEYON) or null if the cue does not keyon.
   */
  route(cue, engine) {
    const params = this.paramsProvider(cue.id);
    if (!params) return null;   // control-only cue (no keyon)
    const icsVoice = engine.acquireIcsVoice(0x01);
    const slot = engine.voices[icsVoice];
    // Apply the cue-id params (the provider's values -- oracle-reconstructed now,
    // ROM-table-derived once the scripts are ported).
    Object.assign(slot, params);
    slot.icsVoice = icsVoice;
    slot.state = ENGINE.STATE_KEYON;
    return slot;
  }
}

// ============================================================ the full-chain hub
/**
 * The full-chain harness: Layer 3 (CueDispatch) -> Layer 2 (VoiceEngine) ->
 * Layer 1 (IcsRegisterFile). One place that wires the three layers the way the
 * real Z80 does, so a gate can drive mailbox doors through the whole chain and
 * compare the emitted register writes to ics.tsv.
 *
 * The engine's per-tick walk (Layer 2) and the register file (Layer 1) are the
 * existing classes; this class owns the Layer 3 dispatch state + the channel
 * manager + the router, and the frame/tick boundary the INT handler drives.
 */
export class SoundChain {
  /**
   * @param {(id: number) => (Partial<VoiceSlot>|null)} paramsProvider
   *   the cue-id -> voice-params provider (oracle-reconstructed now; ROM-table
   *   later). Required: without it the chain cannot populate $62EC.
   */
  constructor(paramsProvider) {
    this.rf = new IcsRegisterFile();
    this.engine = new VoiceEngine(this.rf);
    this.state = new DispatchState();
    this.chan = new ChannelManager();
    this.router = new CueRouter(paramsProvider);
    this.doorCount = 0;
    this.keyonCount = 0;
  }

  /**
   * Dispatch one mailbox door (the $07F6 flow). The door carries the decoded cue
   * `{type, pan, id, chan}` (Wave A's packLongword output). The flow:
   *   1. bank-select($00F0) -- program the bank register for the payload window
   *   2. read command ($8200) -- command $01 = cue-with-payload (stage 1 always)
   *   3. enqueue the cue to the channel manager (the 40-slot queue)
   *   4. route the cue-id -> populate a $62EC voice slot (keyon arm)
   *   5. bank-select($0000) -- restore
   * Returns the bound ICS voice index, or -1 if the cue did not keyon.
   */
  dispatchDoor(door) {
    this.doorCount++;
    // 1. bank-select the payload window (the NMI's $00F0 tag).
    this.state.bankSelect(Z80_BANK.tag);
    // 2. read the command. stage-1 doors are always command $01 (cue-with-
    //    payload); the doorbell carries the cue. Set the command port so the
    //    read reproduces the nibble the Z80 sees.
    this.state.commandPort = DISPATCH.CMD_CUE;
    const cmd = this.state.readCommand();
    if (cmd !== DISPATCH.CMD_CUE) {
      this.state.bankSelect(0x0000);   // the non-$01 path: restore + RET
      return -1;
    }
    // 3. enqueue the cue to the channel manager.
    const cue = { type: door.type, pan: door.pan, id: door.id, chan: door.chan };
    this.chan.enqueue(cue);
    // arm the bank base the channel manager owns ($6150 := $01 on first cue).
    this.state.bankBase = this.chan.bankBase;
    // 4. route the cue-id -> populate a $62EC slot.
    const slot = this.router.route(cue, this.engine);
    if (slot) this.keyonCount++;
    // 5. bank-select restore (the NMI tail).
    this.state.bankSelect(0x0000);
    return slot ? slot.icsVoice : -1;
  }

  /**
   * Run one Layer 2 per-tick walk (the INT handler's timer-0 -> $376C path).
   * Emits register writes for every active voice (keyon episodes + refreshes).
   * Call once per frame to drive the sustain refresh stream.
   */
  tick() {
    this.rf.resetFrame();
    this.engine.tick();
  }
}

// ---------------------------------------------------------- mailbox door decode
/**
 * Decode one mailbox row into the cue the dispatch consumes. The mailbox
 * `payload_since_last_door` carries the 68k-side writes to the $C10000 window;
 * the cue longword is `[type][pan][id][chan]` (Wave A's packLongword). The dedup
 * TSV already carries these columns decoded; this helper accepts either shape.
 *
 * @param door {lf, type, pan, id, chan} (the dedup row) -- type/pan/id/chan may
 *   be hex strings or numbers.
 * @returns {lf, type, pan, id, chan} with numeric fields
 */
export function decodeDoor(door) {
  const num = (v) => (typeof v === 'string' ? parseInt(v.replace('$', ''), 16) : v);
  return {
    lf: Number(door.lf),
    type: num(door.type),
    pan: num(door.pan),
    id: num(door.id),
    chan: num(door.chan),
  };
}
