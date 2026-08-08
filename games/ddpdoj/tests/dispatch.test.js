// W152 live SFX Layer 3 gate. ROM/listing defines inventory and behavior;
// oracle timing and `after_door` history are deliberately absent here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { VOICE_REG } from '../src/ics.js';
import { DRIVER_PARAMS, driverParamsToJson, driverParamsFromJson }
  from '../src/driverparams.js';
import {
  DISPATCH, MAINLOOP, COMMAND_TABLE, ROUTE, CONTROL_MODE,
  bankSelectByte, DispatchState, MailboxQueue, ImmediateNoteOn,
  SelectorControl, MainLoop, SoundChain, cmdRoute, decodeDoor,
} from '../src/dispatch.js';
import {
  SOUND, SoundState, postWrapper, drainFrame, STREAMING_LEAVES,
} from '../src/sound.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const Z80 = new Uint8Array(readFileSync(join(HERE, '..', 'rip', 'sound', 'z80ram.bin')));
const JSON_PARAMS = driverParamsToJson(Z80);
const PARAMS = driverParamsFromJson(JSON_PARAMS);
const ASSET_PARAMS = JSON.parse(gunzipSync(readFileSync(join(HERE, '..', 'assets',
  'snd', 'driver-params.json.gz'))));

function door(selector, { cmd = 0x00, level = 0x49, channel = 0, lf = 1 } = {}) {
  return {
    lf, type: cmd, pan: level, id: selector & 0xff,
    chan: ((channel << 2) | (selector >> 8)) & 0xff,
  };
}

test('W152: the live dispatch map is the four-byte `$6001` route, not `$0829`', () => {
  assert.equal(DISPATCH.cueDispatch, 0x07f6);
  assert.equal(DISPATCH.queue, 0x6001);
  assert.equal(DISPATCH.queueElementSize, 4);
  assert.equal(DISPATCH.queueCapacity, 80);
  assert.equal(DISPATCH.controlWalker, 0x34fb);
  assert.equal(MAINLOOP.top, 0x0321);
  assert.equal(MAINLOOP.backEdge, 0x07ca);
  assert.equal(COMMAND_TABLE.size, 15);
  assert.equal(cmdRoute(0x00), ROUTE.NOTE_ON);
  assert.equal(cmdRoute(0x01), ROUTE.NOTE_ON);
  assert.equal(cmdRoute(0x02), ROUTE.NOTE_ON);
  for (const cmd of [0x0d, 0x0e, 0x0f, 0x10]) assert.equal(cmdRoute(cmd), ROUTE.CONTROL);
  assert.equal(bankSelectByte(1, 0xf0), 0xf1);
  const state = new DispatchState();
  assert.equal(state.bankBase, 1, 'live `$6150` base is already armed');
  assert.equal(state.bankSelect(0xf0), 0xf1);
  assert.equal(state.bankSelect(0), 1);
});

test('W152: door decode preserves four bytes and reconstructs all ten selector bits', () => {
  const packed = ((0x2a << 2) | 3) & 0xff;
  const got = decodeDoor({ door: 7, lf: 99, type: '$01', pan: '$7F',
    id: '$34', chan: `$${packed.toString(16)}` });
  assert.deepEqual(got, {
    door: 7, lf: 99, type: 1, pan: 0x7f, id: 0x34,
    chan: packed, packedChannel: packed, selector: 0x334, channel: 0x2a,
  });
  for (let selector = 0; selector < 0x400; selector++) {
    for (let channel = 0; channel < 0x40; channel++) {
      const decoded = decodeDoor(door(selector, { channel }));
      assert.equal(decoded.selector, selector);
      assert.equal(decoded.channel, channel);
    }
  }
});

test('W152: transformed driver parameters cover exact ranges and are immutable', () => {
  assert.equal(JSON_PARAMS.version, 2);
  assert.deepEqual(JSON_PARAMS.clock, { sourceRateAddress: 0x6168,
    sourceRateHz: 0x8133 });
  assert.equal(JSON_PARAMS.sfx.base, 0x7600);
  assert.equal(JSON_PARAMS.sfx.stride, 12);
  assert.equal(JSON_PARAMS.sfx.entries.length, 69);
  assert.equal(JSON_PARAMS.bgm.base, 0x6840);
  assert.equal(JSON_PARAMS.bgm.entries.length, 160);
  assert.equal(JSON_PARAMS.pitch.banks.length, 16);
  assert.ok(JSON_PARAMS.pitch.banks.every((row) => row.length === 60));
  assert.equal(PARAMS.pitch(0, 41), 0x00a0);
  assert.equal(PARAMS.pan(7), 0x7f);
  assert.equal(PARAMS.volume(0), PARAMS.volumeEntries[1]);
  for (let selector = 0; selector < DRIVER_PARAMS.sfxCount; selector++) {
    const record = PARAMS.sfx(selector);
    assert.ok(Object.isFrozen(record), `SFX record ${selector} is frozen`);
    assert.equal(record.sampleRateHz, Z80[0x7602 + selector * 12]
      | (Z80[0x7603 + selector * 12] << 8));
    assert.equal(record.oscFc, Math.floor(record.sampleRateHz * 0x400 / 0x8133));
  }
  assert.ok(Object.isFrozen(PARAMS));
  assert.throws(() => PARAMS.sfx(69), /0\.\.68/);
  assert.throws(() => PARAMS.sfx(-1), /0\.\.68/);
});

test('W152: regenerated artifact and manifest expose the validated deferred table', () => {
  assert.deepEqual(ASSET_PARAMS, JSON_PARAMS,
    'published semantic parameters equal a fresh transform of z80ram.bin');
  assert.ok(driverParamsFromJson(ASSET_PARAMS));
  const manifest = JSON.parse(readFileSync(join(HERE, '..', 'assets', 'manifest.json')));
  assert.equal(manifest.sound.driverParams, 'snd/driver-params.json.gz');
  assert.equal(manifest.sound.deferred, true);
});

test('W152: loader refuses bad version, layout, ranges, and counts', () => {
  const mutate = (fn) => { const value = structuredClone(JSON_PARAMS); fn(value); return value; };
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.version = 3; })), /version/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.clock.sourceRateAddress++; })),
    /source-rate address/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.sfx.entries[0].oscFc++; })),
    /\$0B92 conversion/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.sfx.base++; })), /base\/stride/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.sfx.entries.pop(); })), /69/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.sfx.entries[0].r11 = 256; })), /r11/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.bgm.entries[0].raw20 = -1; })), /raw20/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.bgm.entries[0].pitchBank = 16; })), /pitchBank/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.pitch.banks[0].pop(); })), /60/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.control.volume.entries[2] = 0x10000; })), /volume/);
});

test('W152: arbitrary selectors resolve `$7600 + selector*12` and program `$0B92` inputs', () => {
  for (const selector of [0, 13, 36, 68]) {
    const chain = new SoundChain(PARAMS);
    const message = chain.enqueueDoor(door(selector, { level: 0x49, channel: 0x2a }));
    assert.equal(message.selector, selector);
    assert.equal(message.channel, 0x2a);
    assert.equal(chain.runMainLoop(), 1);
    const logical = chain.engine.voices[0];
    assert.equal(logical.selector, selector);
    assert.equal(logical.icsVoice, -1, '`$3150` does not allocate the ICS voice');
    chain.tick();
    assert.equal(logical.icsVoice, 8, '`$37DB` performs the seeded ICS allocation');
    const record = PARAMS.sfx(selector);
    const voice = chain.rf.voices[8];
    assert.equal(voice.u16(VOICE_REG.fc), record.oscFc);
    assert.equal(voice.u8(VOICE_REG.saddr), record.r11);
    assert.equal(voice.u16(0x0b), record.r0B);
    assert.equal(voice.u16(0x0a), record.r0A);
    assert.equal(voice.u16(VOICE_REG.oscStrtLo), record.r0B);
    assert.equal(voice.u16(VOICE_REG.oscStrt), record.r0A);
    assert.equal(voice.u16(VOICE_REG.oscEndLo), record.r05);
    assert.equal(voice.u16(VOICE_REG.oscEnd), record.r04);
    assert.equal(voice.u8(VOICE_REG.pan), 0x7f);
    assert.equal(voice.u16(0x09), PARAMS.volume(0x49));
    assert.equal(voice.u8(VOICE_REG.oscConf), record.raw01 | 0x20);
  }
  const invalid = new SoundChain(PARAMS);
  invalid.enqueueDoor(door(69));
  assert.throws(() => invalid.runMainLoop(), /0\.\.68/,
    'selector 69 is a loud `$3150` bounds refusal');
});

test('W152: cmd `$02` selects the exact alternate OscConf family', () => {
  const chain = new SoundChain(PARAMS);
  chain.enqueueDoor(door(5, { cmd: 0x02 }));
  chain.runMainLoop();
  chain.tick();
  assert.equal(chain.rf.voices[8].u8(VOICE_REG.oscConf), PARAMS.sfx(5).raw01 | 0x08);
});

test('W152: `$34FB` cmd `$0F` releases matches and leaves nonmatches active', () => {
  const chain = new SoundChain(PARAMS);
  for (const selector of [13, 13, 24]) {
    chain.enqueueDoor(door(selector));
    chain.runMainLoop();
    chain.tick();
  }
  assert.equal(chain.engine.voices.filter((slot) => slot.active).length, 3);
  chain.enqueueDoor(door(13, { cmd: 0x0f }));
  chain.runMainLoop();
  assert.equal(chain.loop.dispatched.at(-1).affected, 2);
  assert.equal(chain.engine.voices.filter((slot) => slot.active).length, 1);
  assert.equal(chain.engine.voices.find((slot) => slot.active).selector, 24);

  chain.enqueueDoor(door(63, { cmd: 0x0f }));
  chain.runMainLoop();
  assert.equal(chain.loop.dispatched.at(-1).affected, 0, 'nonmatch is a no-op');
  assert.equal(chain.engine.voices.find((slot) => slot.active).selector, 24);
});

test('W152: cmds `$0D/$0E` write converted volume and the following-record FC word', () => {
  const chain = new SoundChain(PARAMS);
  chain.enqueueDoor(door(9));
  chain.runMainLoop();
  chain.tick();
  const voice = chain.engine.voices[0].icsVoice;

  chain.enqueueDoor(door(9, { cmd: 0x0d, level: 0x33 }));
  chain.runMainLoop();
  assert.equal(chain.rf.voices[voice].u16(0x09), PARAMS.volume(0x33));

  chain.enqueueDoor(door(9, { cmd: 0x0e }));
  chain.enqueueDoor({ type: 0x34, pan: 0x12, id: 0, chan: 0 });
  chain.runMainLoop();
  assert.equal(chain.rf.voices[voice].u16(VOICE_REG.fc), 0x1234);
  assert.equal(chain.loop.dispatched.at(-1).payload.cmd, 0x34,
    'the second complete record was consumed as `$3CBB` payload');

  const missing = new SoundChain(PARAMS);
  missing.enqueueDoor(door(9, { cmd: 0x0e }));
  assert.throws(() => missing.runMainLoop(), /next queue record/);
});

test('W152: a production wrapper door reaches the live selector path without history', () => {
  const ram = new Ram();
  const sound = new SoundState();
  ram.setU8(SOUND.gateEnableB, 1);
  assert.equal(postWrapper(ram, sound, 0x28c714), true, 'shot wrapper posts');
  const drained = drainFrame(ram, sound, 77);
  assert.equal(drained.selector, 0x24);
  assert.equal(drained.channel, 3);
  const chain = new SoundChain(PARAMS);
  chain.enqueueDoor(drained);
  assert.equal(chain.runMainLoop(), 1);
  chain.tick();
  assert.equal(chain.rf.voices[8].u16(VOICE_REG.fc), PARAMS.sfx(0x24).oscFc);
});

test('W152: the `$28CB60` stage-clear leaf resolves index 9 and type `$11`', () => {
  const ram = new Ram();
  const sound = new SoundState();
  assert.equal(STREAMING_LEAVES.get(0x28cb60).index, 9);
  assert.equal(postWrapper(ram, sound, 0x28cb60), true);
  const drained = drainFrame(ram, sound, 8);
  assert.equal(drained.type, 0x11);
  assert.equal(drained.selector, 9);
  assert.equal(drained.pan, 0xeb, '$FF through `$28BFEC` becomes $EB');
  assert.deepEqual(sound.streamingResolvers, [
    { wrapper: 0x28cb60, index: 9, group: 0, id: 9, type: 0x11 },
  ]);
});

test('W152: queue capacity is exact and overflow is loud', () => {
  const queue = new MailboxQueue();
  for (let i = 0; i < 80; i++) queue.enqueue({ cmd: 0 });
  assert.equal(queue.length, 80);
  assert.throws(() => queue.enqueue({ cmd: 0 }), /overflow/);
});

test('W152: production dispatch contains no history-key or fictional manager', () => {
  const source = readFileSync(join(HERE, '..', 'src', 'dispatch.js'), 'utf8');
  assert.doesNotMatch(source, /after_door|byDoor|SfxParamTable|ChannelManager/);
  assert.ok(new ImmediateNoteOn(PARAMS));
  assert.ok(new SelectorControl(PARAMS));
  assert.ok(new MainLoop(new MailboxQueue(), new ImmediateNoteOn(PARAMS),
    new SelectorControl(PARAMS)));
  assert.equal(CONTROL_MODE.RELEASE, 2);
});
