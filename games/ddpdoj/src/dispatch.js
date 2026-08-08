// THE Z80 CUE DISPATCH -- the NMI ingress (W142) + the MAIN-LOOP dispatcher
// (W144 / Wave C6). See docs/worklog/ddpdoj/142-impl-sound-wave-c3.md (the NMI
// ingress) and 144-impl-sound-c6.md (the main-loop dispatcher + the immediate
// note-on) and 143-recon-c-depth.md section C6 (the recon that sized this wave).
//
// The chain this module wires:
//   mailbox door (Wave A's src/sound.js: the [type][pan][id][chan] longword)
//     -> NMI ingress ($07F6): bank-select $09B7, enqueue to the MailboxQueue
//     -> MAIN LOOP ($0321): poll $3BB5, dequeue $3CDD, dispatch $41D0 over the
//        15-command table at $078E
//     -> cmd $00/$01 handler -> $3245 -> $3150 populator -> $62EC voice slot
//     -> Layer 2 (VoiceEngine.tick): emitKeyon (the $0B92 register programmer)
//     -> Layer 1 (IcsRegisterFile): logs the ics.tsv register stream
//
// THE W143 CORRECTION (load-bearing). W138 framed the main thread as idling;
// re-decoded, the main thread RUNS the cue dispatch loop at $0321 (verified:
// $07CA is literally `JP $0321`). So the cue->voice route is MAIN-LOOP driven,
// polled off the MailboxQueue the NMI drains into -- NOT purely interrupt-
// driven. The mailbox TYPE byte IS the command opcode the $41D0 switch dispatch
// (type $00 -> cmd $00, ... type $15 -> cmd $15). C6 ports this main-loop
// dispatch and REPLACES W142's injected paramsProvider(id) with the real
// $3245/$3150 populator fed by the empirical SfxParamTable.
//
// WHAT C6 OWNS and what it defers. C6 owns the main-loop dispatcher (the
// $078E table, the $41D0 switch, the $3BB5/$3CDD poll/dequeue) + the immediate
// note-on path (cmd $00/$01/$02 -> $3245 -> $3150 -> $62EC). The param data
// comes from the SfxParamTable (the 14 reconstructed SFX param-sets, keyed per
// door); the LIVE banked-score-data lookup (the $62EA sample-base + the 10-bit
// sample-descriptor index $3150 masks) is a C7 dependency. Cmd $0F ($34FB), the
// cue-id sequencer ($2E38, cmds $11/$12/$15), Layer 2 keyoff/ramp, and the
// historical door->keyon timeline are NAMED TODOs (C5/C7/C8).

import { Z80_BANK } from './z80.js';
import { IcsRegisterFile, N_VOICES } from './ics.js';
import { VoiceEngine, ENGINE } from './voice.js';

// --------------------------------------------------------------- the driver map
// NMI-ingress addresses (W142), cited from z80.js (the Wave B listing) by symbol
// so a reviewer checks any one against the disassembly.
export const DISPATCH = {
  nmiHandler:  0x0128,   // PUSH regs; CALL $07F6; OUT $8100; RETN
  cueDispatch: 0x07F6,   // bank-select; read $8200; payload from RAM $6001
  bankSelect:  0x09B7,   // byte = (base & $0F) | (tag & $F0); OUT $8400
  channelMgr:  0x0829,   // 40-slot channel manager (stride $10 = 16 bytes)
  cmp16:       0x4231,   // carry iff HL <= DE (the 16-bit compare; loop bound)
  N_SLOTS:     40,       // LD HL,$0028 at $0848 (the outer loop bound)
  SLOT_STRIDE: 0x10,     // LD HL,$0010; ADD HL,DE at $0851 (16 bytes per slot)
  CMD_CUE:     0x01,     // the NMI doorbell command (cue-with-payload)
};

// MAIN-LOOP addresses (C6), re-decoded in worklog 144 section 0.
export const MAINLOOP = {
  top:        0x0321,   // the main-loop entry: poll -> dequeue -> dispatch
  poll:       0x3BB5,   // non-empty test on the $6001 queue struct (HL=0 has work)
  dequeue:    0x3CDD,   // dequeue one message (bank-select + read cmd + copy)
  switchDisp: 0x41D0,   // JP (HL) switch over the command table
  cmdTable:   0x078E,   // the 15-command, 4-byte-stride table
  backEdge:   0x07CA,   // JP $0321 -- the main-loop return (verified literally)
  noteOn:     0x3245,   // the immediate note-on entry (cmd $00/$01/$02 call it)
  populator:  0x3150,   // the $62EC slot populator (alloc + write fields)
  slotAlloc:  0x311C,   // the $62EC slot allocator (called by $3150)
  regProg:    0x0B92,   // the ICS2115 register programmer (Layer 2 emitKeyon)
};

// THE 15-COMMAND TABLE at $078E -- verified byte-for-byte against z80ram.bin
// (worklog 144 section 0). 4-byte stride [cmd][00][addr_lo][addr_hi], scanned
// by $41D0 which JP (HL) to the handler. The mailbox TYPE byte IS the key.
// Route families (confirmed by scanning each handler for CALL $3245/$2E38):
//   immediate note-on: $00/$01/$02 -> $3245 (C6)
//   cue-id sequencer:  $11/$12     -> $2E38 (C7)
//   direct global:     $14         -> $0EE7 (timer/config; later)
//   other:             $0D/$0E/$0F/$10/$13/$15/$16/$1D/$20 (C7+ / out of scope)
export const COMMAND_TABLE = Object.freeze(new Map([
  [0x00, 0x0371], [0x01, 0x03E5], [0x02, 0x0468], [0x0D, 0x0527], [0x0E, 0x0592],
  [0x0F, 0x04DD], [0x10, 0x0521], [0x11, 0x05F0], [0x12, 0x065B], [0x13, 0x06C8],
  [0x14, 0x0700], [0x15, 0x0738], [0x16, 0x073E], [0x1D, 0x0776], [0x20, 0x077F],
]));

// The command-route families (which handler family each cmd targets).
export const ROUTE = {
  NOTE_ON:    'noteOn',     // cmd $00/$01/$02 -> $3245 (C6)
  SEQUENCER:  'sequencer',  // cmd $11/$12 -> $2E38 (C7)
  OTHER:      'other',      // remaining cmds (deferred)
};

/** The route family for a command opcode (the family the $41D0 switch arms). */
export function cmdRoute(cmd) {
  if (cmd === 0x00 || cmd === 0x01 || cmd === 0x02) return ROUTE.NOTE_ON;
  if (cmd === 0x11 || cmd === 0x12) return ROUTE.SEQUENCER;
  return ROUTE.OTHER;
}

// The PGM-specific control latches the channel manager programs (besides $8400).
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
 */
export function bankSelectByte(base, tag) {
  return ((base & 0x0F) | (tag & 0xF0)) & 0xFF;
}

// =================================================================== NMI state
/**
 * The Z80-side dispatch state -- the bank-mapping bytes and the command nibble
 * the NMI handler touches. Modeled as a small struct (not the full 64 KiB RAM)
 * because only these cells affect the dispatch behaviour the port reproduces.
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
  bankSelect(tag) {
    this.bankTag = tag & 0xFF;
    this.lastBankByte = bankSelectByte(this.bankBase, tag);
    return this.lastBankByte;
  }
  readCommand() {
    this.cmdNibble = this.commandPort & 0x0F;
    return this.cmdNibble;
  }
}

// ====================================================== the channel manager slots
/**
 * One channel-manager slot ($0829's 40-slot queue). Each slot is 16 bytes
 * (stride $10) in the Z80; this model carries the cue assigned to it.
 */
export class ChannelSlot {
  constructor() { this.cue = null; }
  get free() { return this.cue === null; }
}

/**
 * $0829 -- the 40-slot channel manager (NMI side). Holds the 40 slots and the
 * bank base $6150 (set to $01 on first enqueue, the $0925 path).
 */
export class ChannelManager {
  constructor() {
    this.slots = Array.from({ length: DISPATCH.N_SLOTS }, () => new ChannelSlot());
    this.cursor = 0;
    this.baseArmed = false;
  }
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
    return -1;   // queue full
  }
  get bankBase() { return this.baseArmed ? 0x01 : 0x00; }
  get occupied() { return this.slots.reduce((n, s) => n + (s.free ? 0 : 1), 0); }
}

// ====================================================== the main-loop queue ($6001)
/**
 * The Z80-RAM queue struct at $6001: the NMI drains the 68k mailbox ring into
 * it, and the main loop dequeues from it. `$3BB5` is the non-empty poll (reads
 * struct+$0C); `$3CDD` is the dequeue (bank-select + read cmd + copy one msg).
 * Modeled as a FIFO of decoded messages -- the queue is an intermediate not
 * observable in ics.tsv, so the port models it behaviourally.
 */
export class MailboxQueue {
  constructor() { this.msgs = []; }
  /** $3BB5 -- non-empty test (returns true if there is work to dequeue). */
  poll() { return this.msgs.length > 0; }
  /** $3CDD -- dequeue one message (the head). Returns undefined if empty. */
  dequeue() { return this.msgs.shift(); }
  /** The NMI-side enqueue (drains the mailbox ring into this struct). */
  enqueue(msg) { this.msgs.push(msg); }
  get empty() { return this.msgs.length === 0; }
  get length() { return this.msgs.length; }
}

// ============================================ the empirical SFX param-set table
/**
 * The door -> param-set map, reconstructed from the oracle. The real $3150
 * populator resolves the param-set from a 10-bit sample-descriptor INDEX in the
 * 6-byte message payload (`masked = arg & $03FF; addr = [$62EA] + masked*12`),
 * validated against the limit `[[$62E8]]`. That index lives in the banked score
 * data loaded from the 68k ROM (a C7 dependency), and the dedup mailbox TSV
 * captures only 4 of the 6 payload bytes -- so the param-set CANNOT be derived
 * from the mailbox columns alone (worklog 144 section 0: all 368 type-$00
 * id-$0D doors share identical pan/chan yet map to 10 distinct param-sets).
 *
 * The recon-sanctioned shortcut: ship the 14 distinct param-sets reconstructed
 * from the 1620-episode clustering, keyed per-door via the oracle's `after_door`
 * map. One door maps to 1 or 2 ordered param-sets (94 doors trigger 2 keyons).
 * The param-set carries the SOUND params (fc, saddr, oscStrt/End, ...); the
 * VOICE is assigned separately (the allocator, or oracle-injection in tests).
 */
export class SfxParamTable {
  constructor() { this.byDoor = new Map(); }
  /** Append one param-set for a door (a door may carry 1 or 2, in order). */
  add(doorNum, params) {
    if (!this.byDoor.has(doorNum)) this.byDoor.set(doorNum, []);
    this.byDoor.get(doorNum).push(params);
  }
  /** The ordered param-set(s) for a door (1 or 2), or null if the door has none. */
  get(doorNum) { return this.byDoor.get(doorNum) ?? null; }
  /** The number of doors that carry at least one param-set. */
  get size() { return this.byDoor.size; }
}

// ============================================================= the note-on path
/**
 * The cmd $00/$01 -> $3245 -> $3150 populator. Allocates a $62EC slot, writes
 * the door's param-set into it, arms state=KEYON. The $0B92 register programmer
 * (Layer 2's emitKeyon) runs on the next tick. The param data comes from the
 * SfxParamTable (the empirical reconstruction; the live $62EA lookup is C7).
 */
export class ImmediateNoteOn {
  constructor(sfxParams) { this.sfxParams = sfxParams; }

  /**
   * Handle one cmd $00/$01 message ($3245 -> $3150). Looks up the door's
   * param-set(s) and populates slot(s). Returns the armed slots (0, 1, or 2).
   *
   * @param message the dequeued message (carries `door` for the param lookup)
   * @param engine the VoiceEngine (Layer 2)
   * @param assignVoice optional fn(keyonIdx, slot) -> voice index. Defaults to
   *   the engine's round-robin allocator ($3E8F). The must-fail injects the
   *   oracle voice to isolate the populator from the deferred allocator timing
   *   (the allocator cannot track the oracle's voice history without keyoff,
   *   the C5 TODO).
   * @returns {VoiceSlot[]} the armed slots (state = KEYON)
   */
  handle(message, engine, assignVoice) {
    const sets = this.sfxParams.get(message.door);
    if (!sets) return [];   // no param-set (control-only door, or not in table)
    const armed = [];
    for (let i = 0; i < sets.length; i++) {
      const voice = assignVoice
        ? assignVoice(i, sets[i])
        : engine.acquireIcsVoice(0x01);
      const slot = engine.voices[voice];
      // $3150 writes the struct fields from the resolved sample descriptor.
      Object.assign(slot, sets[i]);
      slot.icsVoice = voice;
      slot.state = ENGINE.STATE_KEYON;
      armed.push(slot);
    }
    return armed;
  }
}

// ============================================================ the main-loop ($0321)
/**
 * The $0321 main-loop dispatcher. Polls the MailboxQueue ($3BB5), dequeues one
 * message ($3CDD), dispatches via the COMMAND_TABLE ($41D0 switch). Routes cmd
 * $00/$01/$02 to ImmediateNoteOn; cmd $11/$12 to the (stubbed) sequencer; other
 * cmds are logged for the deferred TODOs. `run()` drains the queue completely
 * (the $0321 loop until poll returns empty).
 */
export class MainLoop {
  constructor(queue, immediateNoteOn) {
    this.queue = queue;
    this.inote = immediateNoteOn;
    /** Log of every dispatched message: {cmd, handler, route, message, armed}. */
    this.dispatched = [];
  }

  /**
   * Drain the queue: poll + dequeue + dispatch until empty.
   * @param engine the VoiceEngine (passed to the note-on handler)
   * @param assignVoice optional voice-assignment override (see ImmediateNoteOn)
   * @returns {number} the count of note-on slots armed this run
   */
  run(engine, assignVoice) {
    let armed = 0;
    while (this.queue.poll()) {                 // $3BB5 (loop while non-empty)
      const msg = this.queue.dequeue();         // $3CDD
      armed += this._dispatch(msg, engine, assignVoice);
    }
    return armed;
  }

  /** $41D0 -- the switch over the $078E table. Returns the slots armed. */
  _dispatch(message, engine, assignVoice) {
    const cmd = message.cmd;
    const handler = COMMAND_TABLE.get(cmd);
    if (handler === undefined) {
      this.dispatched.push({ cmd, handler: null, route: 'unknown', message, armed: 0 });
      return 0;
    }
    const route = cmdRoute(cmd);
    let armed = 0;
    if (route === ROUTE.NOTE_ON) {
      const slots = this.inote.handle(message, engine, assignVoice);
      armed = slots.length;
    }   // SEQUENCER ($2E38) and OTHER cmds: stubbed (C7 TODO)
    this.dispatched.push({ cmd, handler, route, message, armed });
    return armed;
  }
}

// ============================================================ the full-chain hub
/**
 * The full-chain harness: NMI ingress -> main-loop dispatch -> Layer 2 ->
 * Layer 1. `enqueueDoor` is the $07F6 NMI ingress (bank-select + decode +
 * enqueue to the MailboxQueue); `runMainLoop` is the $0321 dispatch loop;
 * `tick` is the Layer 2 per-frame walk. The injected paramsProvider of W142 is
 * GONE: the SfxParamTable + the real dispatcher replace it.
 */
export class SoundChain {
  /**
   * @param sfxParams the SfxParamTable (door -> param-sets). Defaults empty; the
   *   test harness builds it from the oracle (buildSfxParamTable).
   */
  constructor(sfxParams = new SfxParamTable()) {
    this.rf = new IcsRegisterFile();
    this.engine = new VoiceEngine(this.rf);
    this.state = new DispatchState();
    this.chan = new ChannelManager();
    this.queue = new MailboxQueue();
    this.inote = new ImmediateNoteOn(sfxParams);
    this.loop = new MainLoop(this.queue, this.inote);
    this.sfxParams = sfxParams;
    this.doorCount = 0;
    this.keyonCount = 0;
  }

  /**
   * NMI ingress ($07F6): bank-select the payload window, decode the cue, enqueue
   * a message to the MailboxQueue (the $6001 struct the main loop dequeues
   * from), and enqueue the cue to the channel manager (the 40-slot NMI queue).
   * The mailbox TYPE byte is the command opcode the main loop dispatches.
   * @param door {door, lf, type, pan, id, chan} (decoded by decodeDoor)
   * @returns the enqueued message
   */
  enqueueDoor(door) {
    this.doorCount++;
    this.state.bankSelect(Z80_BANK.tag);
    this.state.commandPort = door.type;   // the TYPE byte IS the cmd opcode
    this.state.readCommand();
    const message = {
      cmd: door.type,                     // $41D0 switch key
      door: door.door ?? this.doorCount,  // the param-table key (oracle unit)
      pan: door.pan, id: door.id, chan: door.chan, lf: door.lf,
    };
    this.queue.enqueue(message);
    this.chan.enqueue({ type: door.type, pan: door.pan, id: door.id, chan: door.chan });
    this.state.bankBase = this.chan.bankBase;
    this.state.bankSelect(0x0000);
    return message;
  }

  /**
   * Run the main-loop dispatcher over all queued messages ($0321 drains the
   * queue). Returns the count of note-on slots armed this run.
   * @param assignVoice optional voice-assignment override (see ImmediateNoteOn)
   */
  runMainLoop(assignVoice) {
    const armed = this.loop.run(this.engine, assignVoice);
    this.keyonCount += armed;
    return armed;
  }

  /** Layer 2 per-tick walk (the INT handler's timer-0 -> $376C path). */
  tick() {
    this.rf.resetFrame();
    this.engine.tick();
  }
}

// ---------------------------------------------------------- mailbox door decode
/**
 * Decode one mailbox row into the door the NMI ingress consumes. The cue
 * longword is `[type][pan][id][chan]` (Wave A's packLongword). The dedup TSV
 * already carries these columns decoded; this helper accepts either shape and
 * normalizes hex strings to numbers.
 */
export function decodeDoor(door) {
  const num = (v) => (typeof v === 'string' ? parseInt(v.replace('$', ''), 16) : v);
  return {
    door: door.door != null ? Number(door.door) : undefined,
    lf: Number(door.lf),
    type: num(door.type),
    pan: num(door.pan),
    id: num(door.id),
    chan: num(door.chan),
  };
}
