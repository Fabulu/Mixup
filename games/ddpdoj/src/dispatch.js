// LIVE Z80 SOUND DISPATCH (W152).
//
// Four bytes cross the 68k/Z80 door: [command][level][selectorLo][packed].
// packed bits 1..0 are selector bits 9..8 and bits 7..2 are the channel. The
// `$6001` queue, `$0321` dispatcher, `$3245/$3150` immediate SFX path, and
// `$34FB` selector-matched controls are modelled here. BGM event handlers and
// the physical ICS oscillator remain separate layers.

import { Z80_BANK } from './z80.js';
import { IcsRegisterFile } from './ics.js';
import { VoiceEngine, ENGINE } from './voice.js';
import { BgmSequencer } from './sequencer.js';

export const DISPATCH = Object.freeze({
  nmiHandler: 0x0128,
  cueDispatch: 0x07F6,
  bankSelect: 0x09B7,
  queue: 0x6001,
  queueElementSize: 4,
  queueCapacity: 80,
  mainLoop: 0x0321,
  poll: 0x3BB5,
  dequeue: 0x3CDD,
  switchDisp: 0x41D0,
  cmdTable: 0x078E,
  backEdge: 0x07CA,
  noteOn: 0x3245,
  populator: 0x3150,
  slotAlloc: 0x311C,
  controlWalker: 0x34FB,
  regProg: 0x0B92,
});

// Kept as the older public name while its values are corrected to the live map.
export const MAINLOOP = Object.freeze({
  top: DISPATCH.mainLoop, poll: DISPATCH.poll, dequeue: DISPATCH.dequeue,
  switchDisp: DISPATCH.switchDisp, cmdTable: DISPATCH.cmdTable,
  backEdge: DISPATCH.backEdge, noteOn: DISPATCH.noteOn,
  populator: DISPATCH.populator, slotAlloc: DISPATCH.slotAlloc,
  regProg: DISPATCH.regProg,
});

export const COMMAND_TABLE = Object.freeze(new Map([
  [0x00, 0x0371], [0x01, 0x03E5], [0x02, 0x0468], [0x0D, 0x0527], [0x0E, 0x0592],
  [0x0F, 0x04DD], [0x10, 0x0521], [0x11, 0x05F0], [0x12, 0x065B], [0x13, 0x06C8],
  [0x14, 0x0700], [0x15, 0x0738], [0x16, 0x073E], [0x1D, 0x0776], [0x20, 0x077F],
]));

export const ROUTE = Object.freeze({
  NOTE_ON: 'noteOn',
  CONTROL: 'control',
  SEQUENCER: 'sequencer',
  OTHER: 'other',
});

export function cmdRoute(cmd) {
  if (cmd === 0x00 || cmd === 0x01 || cmd === 0x02) return ROUTE.NOTE_ON;
  if (cmd === 0x0D || cmd === 0x0E || cmd === 0x0F || cmd === 0x10) {
    return ROUTE.CONTROL;
  }
  if (cmd === 0x11 || cmd === 0x12 || cmd === 0x15) return ROUTE.SEQUENCER;
  return ROUTE.OTHER;
}

export const DISPATCH_PORT = Object.freeze({ bankLatch: 0x8400 });

/** `$09B7`: combine `$6150`'s low nibble with the requested bank tag. */
export function bankSelectByte(base, tag) {
  return ((base & 0x0f) | (tag & 0xf0)) & 0xff;
}

export class DispatchState {
  constructor() {
    // `$0829` is unrelated setup code, not a 40-slot cue queue. The uploaded
    // live image has `$6150=1`, which is the bank base `$07F6/$09B7` consumes.
    this.bankBase = 1;
    this.bankTag = 0;
    this.cmdNibble = 0;
    this.lastBankByte = 0;
    this.commandPort = 0;
  }
  bankSelect(tag) {
    this.bankTag = tag & 0xff;
    this.lastBankByte = bankSelectByte(this.bankBase, tag);
    return this.lastBankByte;
  }
  readCommand() {
    this.cmdNibble = this.commandPort & 0x0f;
    return this.cmdNibble;
  }
}

/** The real `$6001` 80 by 4-byte FIFO, represented as decoded records. */
export class MailboxQueue {
  constructor() { this.msgs = []; }
  poll() { return this.msgs.length > 0; }
  dequeue() { return this.msgs.shift(); }
  peek() { return this.msgs[0]; }
  enqueue(message) {
    if (this.msgs.length >= DISPATCH.queueCapacity) {
      throw new Error('sound dispatch: $6001 queue overflow (80 records)');
    }
    this.msgs.push(message);
  }
  get empty() { return this.msgs.length === 0; }
  get length() { return this.msgs.length; }
}

function requireParams(params) {
  if (!params || typeof params.sfx !== 'function'
    || typeof params.pan !== 'function' || typeof params.volume !== 'function') {
    throw new Error('sound dispatch: validated driver parameters are not loaded');
  }
  return params;
}

/** `$3245 -> $3150`: selector-indexed logical slot population. */
export class ImmediateNoteOn {
  constructor(driverParams) { this.params = driverParams; }

  handle(message, engine) {
    const params = requireParams(this.params);
    const descriptor = params.sfx(message.selector); // loud 0..68 bound
    const slot = engine.acquireSlot();                // `$311C`, first free
    const alternate = message.cmd === 0x02;
    slot.selector = message.selector;
    slot.icsVoice = -1;                               // `$37DB` allocates it
    slot.fc = descriptor.initialFc;
    slot.saddr = descriptor.r11;
    slot.r0B = descriptor.r0B;
    slot.r0A = descriptor.r0A;
    slot.oscStrtLo = descriptor.r0B;
    slot.oscStrt = descriptor.r0A;
    slot.oscEndLo = descriptor.r05;
    slot.oscEnd = descriptor.r04;
    // `$0B92` receives constant pan index 7 and the command's second byte as
    // its volume level. A zero level uses the word at `$5999` (entry one).
    slot.pan = params.pan(7);
    slot.r09 = params.volume(message.pan);
    slot.oscConf = alternate ? (descriptor.raw01 | 0x08)
      : (descriptor.raw01 | 0x20);
    slot.hasLoop = true;
    slot.hasPan = true;
    slot.hasR09 = true;
    slot.state = ENGINE.STATE_KEYON;
    return [slot];
  }
}

export const CONTROL_MODE = Object.freeze({ FC: 0, VOLUME: 1, RELEASE: 2 });

/** `$34FB-$35D0`: operate on every active logical slot with one selector. */
export class SelectorControl {
  constructor(driverParams) { this.params = driverParams; }

  walk(selector, value, mode, engine) {
    if (!Number.isInteger(selector) || selector < 0 || selector > 0x3ff) {
      throw new RangeError(`sound control: selector ${selector} is outside 10 bits`);
    }
    let affected = 0;
    for (const slot of engine.voices) {
      if (!slot.active || slot.selector !== selector) continue;
      if (mode === CONTROL_MODE.RELEASE) {
        if (slot.icsVoice >= 0) engine.releaseVoiceIfBusy(slot.icsVoice);
        slot.state = 0;
        slot.selector = -1;
      } else {
        if (slot.icsVoice < 0) {
          throw new Error('sound control: matching slot has not reached `$37DB`');
        }
        if (mode === CONTROL_MODE.FC) {
          engine.writeVoiceFrequency(slot.icsVoice, value & 0xffff);
        } else if (mode === CONTROL_MODE.VOLUME) {
          const params = requireParams(this.params);
          engine.writeVoiceVolume(slot.icsVoice, params.volume(value & 0xff));
        } else {
          throw new RangeError(`sound control: unknown $34FB mode ${mode}`);
        }
      }
      affected++;
    }
    return affected;
  }

  releaseAll(engine) {
    let affected = 0;
    for (const slot of engine.voices) {
      if (!slot.active) continue;
      if (slot.icsVoice >= 0) engine.releaseVoiceIfBusy(slot.icsVoice);
      slot.state = 0;
      slot.selector = -1;
      affected++;
    }
    return affected;
  }
}

export class MainLoop {
  constructor(queue, immediateNoteOn, controls, sequencer = null) {
    this.queue = queue;
    this.inote = immediateNoteOn;
    this.controls = controls;
    this.sequencer = sequencer;
    this.dispatched = [];
  }

  run(engine) {
    let armed = 0;
    while (this.queue.poll()) armed += this._dispatch(this.queue.dequeue(), engine);
    return armed;
  }

  _dispatch(message, engine) {
    const cmd = message.cmd;
    const handler = COMMAND_TABLE.get(cmd);
    if (handler === undefined) {
      this.dispatched.push({ cmd, handler: null, route: 'unknown', message, armed: 0 });
      return 0;
    }
    const route = cmdRoute(cmd);
    let armed = 0, affected = 0, payload = null;
    if (route === ROUTE.NOTE_ON) {
      // Cmd `$01` first releases matching active slots through mode 2, then
      // follows the same `$3245` note-on path as cmd `$00`.
      if (cmd === 0x01) {
        affected = this.controls.walk(message.selector, 0, CONTROL_MODE.RELEASE, engine);
      }
      armed = this.inote.handle(message, engine).length;
    } else if (route === ROUTE.CONTROL) {
      if (cmd === 0x0D) {
        affected = this.controls.walk(message.selector, message.pan,
          CONTROL_MODE.VOLUME, engine);
      } else if (cmd === 0x0E) {
        // `$0592 -> $3CBB` dequeues one additional complete four-byte record;
        // `$415E` reads its first little-endian word as the new OscFC value.
        payload = this.queue.dequeue();
        if (!payload) throw new Error('sound dispatch: cmd $0E needs its next queue record');
        const value = (payload.cmd | (payload.pan << 8)) & 0xffff;
        affected = this.controls.walk(message.selector, value, CONTROL_MODE.FC, engine);
      } else if (cmd === 0x0F) {
        affected = this.controls.walk(message.selector, 0, CONTROL_MODE.RELEASE, engine);
      } else if (cmd === 0x10) {
        affected = this.controls.releaseAll(engine); // `$0521 -> $35D1`
      }
    } else if (route === ROUTE.SEQUENCER && this.sequencer) {
      if (cmd === 0x15) this.sequencer.stop();
      else this.sequencer.loadCue(message.selector, message.pan, cmd === 0x12);
    }
    this.dispatched.push({ cmd, handler, route, message, armed, affected, payload });
    return armed;
  }
}

/** Live Layer 3 hub. `SoundRuntime` owns its per-frame/core integration. */
export class SoundChain {
  constructor(driverParams = null, cues = null) {
    this.rf = new IcsRegisterFile();
    this.engine = new VoiceEngine(this.rf);
    this.state = new DispatchState();
    this.queue = new MailboxQueue();
    this.inote = new ImmediateNoteOn(driverParams);
    this.controls = new SelectorControl(driverParams);
    this.sequencer = cues ? new BgmSequencer(this.engine, cues, driverParams) : null;
    this.loop = new MainLoop(this.queue, this.inote, this.controls, this.sequencer);
    this.driverParams = driverParams;
    this.cues = cues;
    this.doorCount = 0;
    this.keyonCount = 0;
  }

  enqueueDoor(input) {
    const door = decodeDoor(input);
    this.doorCount++;
    this.state.bankSelect(Z80_BANK.tag);
    this.state.commandPort = door.type;
    this.state.readCommand();
    const message = {
      cmd: door.type, door: door.door ?? this.doorCount, lf: door.lf,
      pan: door.pan, id: door.id, chan: door.chan,
      packedChannel: door.packedChannel,
      selector: door.selector, channel: door.channel,
    };
    this.queue.enqueue(message);
    this.state.bankSelect(0);
    return message;
  }

  runMainLoop() {
    const armed = this.loop.run(this.engine);
    this.keyonCount += armed;
    return armed;
  }

  tick(resetFrame = true) {
    if (resetFrame) this.rf.resetFrame();
    if (this.sequencer) this.sequencer.tick();
    this.engine.tick();
  }
}

/** Decode and preserve all four raw door bytes plus their packed semantics. */
export function decodeDoor(door) {
  const num = (value) => typeof value === 'string'
    ? parseInt(value.replace('$', ''), 16) : value;
  const type = num(door.type), pan = num(door.pan), id = num(door.id);
  const packedChannel = num(door.packedChannel ?? door.chan);
  for (const [name, value] of Object.entries({ type, pan, id, packedChannel })) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new TypeError(`sound door: ${name} must be one byte`);
    }
  }
  return {
    door: door.door != null ? Number(door.door) : undefined,
    lf: Number(door.lf ?? 0),
    type, pan, id,
    chan: packedChannel,
    packedChannel,
    selector: id | ((packedChannel & 3) << 8),
    channel: packedChannel >> 2,
  };
}
