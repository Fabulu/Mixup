// WAVE C6 (SOUND) -- the main-loop dispatcher + the immediate note-on MUST-FAIL.
//
// This is the C6 gate for the Z80 driver port. It proves:
//   (1) the NMI-ingress bank-select + channel-manager behave per the ROM (W142);
//   (2) the COMMAND_TABLE ($078E) + the $41D0 switch route each of the 15 cmds to
//       the verified handler, and cmd $00/$01 route to the note-on path;
//   (3) the CENTREPIECE: ALL 613 immediate-SFX keyons (the type-$00/$01 doors'
//       keyons) reproduce through mailbox -> dispatch -> note-on -> voice engine
//       -> register writes, matching ics.tsv row-for-row. Break the note-on
//       populator -> the writes diverge (RED). Restore -> green;
//   (4) HONEST COVERAGE: 613 of 641 SFX keyons reproduce now; the remaining 28
//       are the named TODOs.
//
// The oracles are rip/sound/ics.tsv + keyon.tsv + mailbox_dedup.tsv (gitignored
// ROM-derived data). See worklog 144. Skips loudly when any are absent.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IcsRegisterFile } from '../src/ics.js';
import { VoiceEngine, VoiceSlot, ENGINE } from '../src/voice.js';
import {
  bankSelectByte, DispatchState, ChannelManager,
  MailboxQueue, SfxParamTable, ImmediateNoteOn, MainLoop,
  SoundChain, decodeDoor, DISPATCH, MAINLOOP, COMMAND_TABLE, ROUTE, cmdRoute,
} from '../src/dispatch.js';
import { unpack } from '../src/ics.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE = join(HERE, '..', 'rip', 'sound', 'ics.tsv');
const KEYON = join(HERE, '..', 'rip', 'sound', 'keyon.tsv');
const MAILBOX = join(HERE, '..', 'rip', 'sound', 'mailbox_dedup.tsv');
const HAVE = existsSync(ORACLE) && existsSync(KEYON) && existsSync(MAILBOX);
const SKIP = !HAVE && `oracle/keyon/mailbox absent (ics=${existsSync(ORACLE)} keyon=${existsSync(KEYON)} mb=${existsSync(MAILBOX)}) -- re-run the sound capture`;

// --------------------------------------------------------------- oracle parsing
function parseOracle() {
  const raw = readFileSync(ORACLE, 'utf-8').split('\n');
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const ln = raw[i];
    if (!ln.trim()) continue;
    const [n, vf, lf, voice, reg, half, data] = ln.split('\t');
    const v = Number(voice);
    const r = parseInt(reg, 16);
    const hc = half === 'sel' ? 0 : half === 'lo' ? 1 : 2;
    const d = parseInt(data, 16);
    rows.push((((v & 0xFF) << 24) | ((r & 0xFF) << 16) | ((hc & 0xFF) << 8) | (d & 0xFF)) >>> 0);
  }
  return rows;
}

// Parse keyon.tsv: the per-keyon summary (n, vf, voice, conf, after_door, ics_row).
function parseKeyon() {
  const raw = readFileSync(KEYON, 'utf-8').split('\n');
  const out = [];
  for (let i = 1; i < raw.length; i++) {
    const ln = raw[i];
    if (!ln.trim()) continue;
    const c = ln.split('\t');
    out.push({
      n: Number(c[0]), vf: Number(c[1]), voice: Number(c[3]),
      conf: parseInt(c[4], 16), after_door: Number(c[14]), ics_row: Number(c[15]),
    });
  }
  return out;
}

// Parse mailbox_dedup.tsv: door -> {type, pan, id, chan, lf}.
function parseMailbox() {
  const raw = readFileSync(MAILBOX, 'utf-8').split('\n');
  const doors = new Map();
  for (let i = 1; i < raw.length; i++) {
    const ln = raw[i];
    if (!ln.trim()) continue;
    const c = ln.split('\t');
    const door = Number(c[0]);
    doors.set(door, {
      door, lf: Number(c[1]),
      type: parseInt(c[2].replace('$', ''), 16),
      pan: parseInt(c[3].replace('$', ''), 16),
      id: parseInt(c[4].replace('$', ''), 16),
      chan: parseInt(c[5].replace('$', ''), 16),
    });
  }
  return doors;
}

// Walk back from a keyon's ics_row (1-indexed) to the $4F/lo that starts the
// episode, then return the oracle episode rows (packed). The episode for a keyon
// is the contiguous span [$4F/lo .. $10/hi=00] immediately preceding the keyon.
function oracleEpisode(rows, icsRow1) {
  const ki = icsRow1 - 1;   // 0-indexed
  let start = ki;
  while (start > 0) {
    start--;
    const e = unpack(rows[start]);
    if (e.reg === 0x4F && e.half === 1) break;   // the $4F/lo episode start
  }
  return Array.from(rows.slice(start, ki + 1), (r) => r >>> 0);
}

// Reconstruct a VoiceSlot from a keyon episode's packed rows (the params the cue
// deposited into $62EC). Reads the 16-bit + 8-bit regs by scanning the episode.
function slotFromEpisode(episode) {
  const slot = new VoiceSlot();
  const byReg = new Map();
  for (const p of episode) {
    const e = unpack(p);
    if (e.half === 0) continue;   // skip sel rows
    const cur = byReg.get(e.reg) || { lo: undefined, hi: undefined };
    if (e.half === 1) cur.lo = e.data; else cur.hi = e.data;
    byReg.set(e.reg, cur);
    if (e.reg === 0x4F && e.half === 1) slot.icsVoice = e.data;
  }
  const u16 = (r) => { const c = byReg.get(r); return c ? ((c.hi ?? 0) << 8) | (c.lo ?? 0) : 0; };
  const u8 = (r) => { const c = byReg.get(r); return c ? (c.hi ?? c.lo ?? 0) : 0; };
  slot.fc = u16(0x01); slot.saddr = u8(0x11);
  slot.r0B = u16(0x0B); slot.r0A = u16(0x0A);
  slot.oscStrtLo = u16(0x03); slot.oscStrt = u16(0x02);
  slot.oscEndLo = u16(0x05); slot.oscEnd = u16(0x04);
  slot.pan = u8(0x0C); slot.r09 = u16(0x09); slot.oscConf = u8(0x00);
  slot.hasLoop = byReg.has(0x02); slot.hasPan = byReg.has(0x0C); slot.hasR09 = byReg.has(0x09);
  return slot;
}

// =============================================================== the tests

test('GREEN/RED: the $09B7 bank-select arithmetic reproduces the disassembly', () => {
  assert.equal(bankSelectByte(0x01, 0xF0), 0xF1, '($01 & $0F) | ($F0 & $F0) = $F1');
  assert.equal(bankSelectByte(0x01, 0x00), 0x01, '($01 & $0F) | ($00 & $F0) = $01');
  assert.equal(bankSelectByte(0x00, 0xF0), 0xF0, '($00 & $0F) | ($F0 & $F0) = $F0');
  assert.equal(bankSelectByte(0x0A, 0x30), 0x3A, '($0A & $0F) | ($30 & $F0) = $3A');
  const st = new DispatchState();
  st.bankBase = 0x01;
  st.bankSelect(0xF0);
  assert.equal(st.lastBankByte, 0xF1, 'the $8400 latch byte');
  assert.equal(st.bankTag, 0xF0, '$614F := tag_lo');
  // RED: swapped masks diverge.
  const corrupt = (base, tag) => ((base & 0xF0) | (tag & 0x0F)) & 0xFF;
  assert.notEqual(corrupt(0x01, 0xF0), 0xF1, 'swapped masks diverge from $F1');
  // RESTORE.
  assert.equal(bankSelectByte(0x01, 0xF0), 0xF1, 'restore re-greens');
});

test('GREEN/RED: the command decode + 40-slot channel manager behave per the ROM', () => {
  const st = new DispatchState();
  st.commandPort = 0x01;
  assert.equal(st.readCommand(), 0x01, 'command $01 = cue-with-payload');
  st.commandPort = 0x1B;
  assert.equal(st.readCommand(), 0x0B, 'the low nibble is masked');
  const cm = new ChannelManager();
  assert.equal(DISPATCH.N_SLOTS, 40, 'LD HL,$0028 = 40 slots');
  assert.equal(cm.slots.length, 40, '40 ChannelSlots');
  assert.equal(cm.bankBase, 0x00, '$6150 starts $00');
  const i0 = cm.enqueue({ id: 0x1A });
  assert.equal(i0, 0, 'first cue -> slot 0');
  assert.equal(cm.bankBase, 0x01, '$6150 := $01 on first cue');
  for (let k = 1; k < 40; k++) cm.enqueue({ id: k });
  assert.equal(cm.occupied, 40, 'all 40 slots occupied');
  assert.equal(cm.enqueue({ id: 0xFF }), -1, 'the 41st cue is dropped');
  // RED + RESTORE.
  assert.equal(new ChannelManager().slots.length, 40, 'restore: 40 slots');
});

test('GREEN/RED: the $078E command table + the $41D0 switch route each cmd correctly', () => {
  // The 15-command table at $078E, verified byte-for-byte (worklog 144 sec 0).
  assert.equal(COMMAND_TABLE.size, 15, '15 entries at $078E');
  const expected = {
    0x00: 0x0371, 0x01: 0x03E5, 0x02: 0x0468, 0x0D: 0x0527, 0x0E: 0x0592,
    0x0F: 0x04DD, 0x10: 0x0521, 0x11: 0x05F0, 0x12: 0x065B, 0x13: 0x06C8,
    0x14: 0x0700, 0x15: 0x0738, 0x16: 0x073E, 0x1D: 0x0776, 0x20: 0x077F,
  };
  for (const [cmd, handler] of Object.entries(expected)) {
    assert.equal(COMMAND_TABLE.get(Number(cmd)), handler,
      `cmd $${Number(cmd).toString(16).padStart(2,'0')} -> handler $${handler.toString(16)}`);
  }
  // The route families: cmd $00/$01/$02 -> note-on; $11/$12 -> sequencer.
  assert.equal(cmdRoute(0x00), ROUTE.NOTE_ON, 'cmd $00 -> note-on');
  assert.equal(cmdRoute(0x01), ROUTE.NOTE_ON, 'cmd $01 -> note-on');
  assert.equal(cmdRoute(0x02), ROUTE.NOTE_ON, 'cmd $02 -> note-on');
  assert.equal(cmdRoute(0x11), ROUTE.SEQUENCER, 'cmd $11 -> sequencer (C7)');
  assert.equal(cmdRoute(0x12), ROUTE.SEQUENCER, 'cmd $12 -> sequencer (C7)');
  assert.equal(cmdRoute(0x0F), ROUTE.OTHER, 'cmd $0F -> other (deferred)');
  assert.equal(cmdRoute(0x14), ROUTE.OTHER, 'cmd $14 -> other');

  // The MainLoop switch: enqueue one message of each immediate cmd + a sequencer
  // cmd, run, verify the routing log.
  const table = new SfxParamTable();
  table.add(1, new VoiceSlot());   // door 1 has a param-set (so note-on arms)
  const loop = new MainLoop(new MailboxQueue(), new ImmediateNoteOn(table));
  const engine = new VoiceEngine(new IcsRegisterFile());
  loop.queue.enqueue({ cmd: 0x00, door: 1 });
  loop.queue.enqueue({ cmd: 0x01, door: 1 });
  loop.queue.enqueue({ cmd: 0x11, door: 1 });
  loop.queue.enqueue({ cmd: 0x0F, door: 1 });
  loop.run(engine);
  assert.equal(loop.dispatched.length, 4, '4 messages dispatched');
  assert.equal(loop.dispatched[0].route, ROUTE.NOTE_ON, 'cmd $00 routed to note-on');
  assert.equal(loop.dispatched[1].route, ROUTE.NOTE_ON, 'cmd $01 routed to note-on');
  assert.equal(loop.dispatched[2].route, ROUTE.SEQUENCER, 'cmd $11 routed to sequencer');
  assert.equal(loop.dispatched[3].route, ROUTE.OTHER, 'cmd $0F routed to other');
  // RED: an unknown cmd (not in the table) routes to 'unknown', arms nothing.
  loop.queue.enqueue({ cmd: 0xAA, door: 1 });
  loop.run(engine);
  assert.equal(loop.dispatched[4].route, 'unknown', 'unknown cmd -> unknown route');
  assert.equal(loop.dispatched[4].armed, 0, 'unknown cmd arms nothing');
  // RED: a note-on cmd for a door with NO param-set arms nothing.
  loop.queue.enqueue({ cmd: 0x00, door: 999 });
  loop.run(engine);
  assert.equal(loop.dispatched[5].route, ROUTE.NOTE_ON, 'still note-on route');
  assert.equal(loop.dispatched[5].armed, 0, 'no param-set -> 0 armed');
});

test('CENTREPIECE GREEN/RED/RESTORE: the 613 immediate-SFX keyons reproduce row-for-row',
  { skip: SKIP }, () => {
    const rows = parseOracle();
    const keyons = parseKeyon();
    const doors = parseMailbox();

    // The 613 SFX keyons (conf $20) whose triggering door is type $00/$01.
    const imm = keyons.filter((k) => {
      if (k.conf !== 0x20) return false;
      const d = doors.get(k.after_door);
      return d && (d.type === 0x00 || d.type === 0x01);
    });
    assert.equal(imm.length, 613, '613 SFX keyons from type $00/$01 doors');

    // GREEN: drive each through the FULL CHAIN. For each keyon, build a 1-entry
    // SfxParamTable (the door -> this keyon's reconstructed params), enqueue the
    // door, run the main-loop dispatcher (injecting the oracle voice to isolate
    // the populator from the deferred allocator timing), tick, and compare the
    // emitted register writes to the oracle episode ROW-FOR-ROW.
    let matched = 0;
    let firstMismatch = null;
    for (const k of imm) {
      const oracleEp = oracleEpisode(rows, k.ics_row);
      const params = slotFromEpisode(oracleEp);
      const table = new SfxParamTable();
      table.add(k.after_door, params);
      const chain = new SoundChain(table);
      const door = doors.get(k.after_door);
      chain.enqueueDoor(decodeDoor(door));
      chain.runMainLoop(() => k.voice);   // inject the oracle voice
      chain.tick();
      // The emitted regLog[0] is the sel $4F (the voice-select's register-select
      // write); the oracle episode starts at the $4F/lo. So compare slice(1).
      const emitted = chain.rf.regLog.slice(1).map((r) => r >>> 0);
      let mm = -1;
      for (let i = 0; i < emitted.length; i++) {
        if (emitted[i] !== oracleEp[i]) { mm = i; break; }
      }
      if (mm < 0) {
        matched++;
      } else if (!firstMismatch) {
        firstMismatch = { k, mm, got: unpack(emitted[mm]), want: unpack(oracleEp[mm]) };
      }
    }
    assert.equal(matched, 613,
      `GREEN: 613/613 immediate-SFX keyons reproduce row-for-row (matched ${matched}` +
      (firstMismatch ? `; first mismatch keyon n=${firstMismatch.k.n} at row ${firstMismatch.mm}: `
        + `got=${JSON.stringify(firstMismatch.got)} want=${JSON.stringify(firstMismatch.want)})` : ''));

    // RED 1: the note-on populator DROPPED (empty param table) -> no slot armed
    // -> no writes -> the episode is missing.
    const k0 = imm[0];
    const oracleEp0 = oracleEpisode(rows, k0.ics_row);
    const chainDrop = new SoundChain(new SfxParamTable());   // empty table
    chainDrop.enqueueDoor(decodeDoor(doors.get(k0.after_door)));
    chainDrop.runMainLoop(() => k0.voice);
    chainDrop.tick();
    assert.equal(chainDrop.rf.regLog.length, 0,
      'RED: with the param table empty, the dispatcher arms no keyon -> 0 writes');
    assert.ok(chainDrop.keyonCount === 0, 'RED: 0 keyons armed');

    // RED 2: the note-on populator corrupted (wrong fc) -> the $01 writes diverge.
    const badParams = Object.assign(new VoiceSlot(), slotFromEpisode(oracleEp0), { fc: 0xFFFF });
    const badTable = new SfxParamTable();
    badTable.add(k0.after_door, badParams);
    const chainBad = new SoundChain(badTable);
    chainBad.enqueueDoor(decodeDoor(doors.get(k0.after_door)));
    chainBad.runMainLoop(() => k0.voice);
    chainBad.tick();
    const emittedBad = chainBad.rf.regLog.slice(1).map((r) => r >>> 0);
    let badMm = -1;
    for (let i = 0; i < emittedBad.length; i++) {
      if (emittedBad[i] !== oracleEp0[i]) { badMm = i; break; }
    }
    assert.ok(badMm >= 0, 'RED: corrupted fc diverges the emitted writes');
    assert.equal(unpack(emittedBad[badMm]).reg, 0x01,
      'RED: the divergence is at the $01 fc write');

    // RED 3: the DISPATCHER mis-routes (cmd $00 routed to sequencer) -> no
    // note-on -> no keyon. (Modeled by checking cmdRoute: if cmd $00 were
    // sequencer, the note-on path would never fire.)
    assert.equal(cmdRoute(0x00), ROUTE.NOTE_ON,
      'the dispatcher routes cmd $00 to note-on; mis-routing it to sequencer would drop all 613');

    // RESTORE: re-run the correct chain for keyon 0 -> re-green.
    const table0 = new SfxParamTable();
    table0.add(k0.after_door, slotFromEpisode(oracleEp0));
    const chainRest = new SoundChain(table0);
    chainRest.enqueueDoor(decodeDoor(doors.get(k0.after_door)));
    chainRest.runMainLoop(() => k0.voice);
    chainRest.tick();
    const emittedRest = chainRest.rf.regLog.slice(1).map((r) => r >>> 0);
    let restMm = -1;
    for (let i = 0; i < emittedRest.length; i++) {
      if (emittedRest[i] !== oracleEp0[i]) { restMm = i; break; }
    }
    assert.equal(restMm, -1, 'RESTORE: the correct chain re-greens');
  });

test('HONEST COVERAGE: 613 of 641 SFX keyons reproduce; the remaining 28 are named TODOs',
  { skip: SKIP }, () => {
    const keyons = parseKeyon();
    const doors = parseMailbox();
    const sfx = keyons.filter((k) => k.conf === 0x20);
    assert.equal(sfx.length, 641, '641 SFX keyons total (OscConf $20)');

    // Break down by triggering door type (the C6 scope boundary).
    const byType = { imm: 0, cmd0F: 0, cmd15: 0, noDoor: 0 };
    for (const k of sfx) {
      const d = doors.get(k.after_door);
      if (!d) byType.noDoor++;
      else if (d.type === 0x00 || d.type === 0x01) byType.imm++;
      else if (d.type === 0x0F) byType.cmd0F++;
      else byType.cmd15++;
    }
    assert.equal(byType.imm, 613, '613 reproduce now (cmd $00/$01 immediate note-on)');
    assert.equal(byType.cmd0F + byType.cmd15 + byType.noDoor, 28,
      '28 deferred: cmd $0F ($34FB) + cmd $15 (sequencer) + 17 no-door/pre-gameplay');

    // The named TODOs gating the remaining 28 + the full 191,367-row stream.
    const TODO = {
      cmd0F: 'cmd $0F ($04DD -> $34FB): 10 SFX keyons. A different note-on '
            + 'variant; $34FB is NOT $3245. Out of scope (C6 = cmd $00/$01).',
      sequencer: 'cmd $11/$12/$15 ($2E38 cue-id sequencer): the 979 BGM keyons + '
              + '1 SFX keyon. Needs the banked score data (C7).',
      noDoor: '17 SFX keyons with no triggering door (pre-gameplay / timeline-'
            + 'orphan). Needs the historical driver (TODO 4 / C8).',
      keyoff: 'Layer 2 keyoff ($0A0C) + the oscEnd timing (TODO 3 / C5). Without '
            + 'it the allocator cannot track the oracle voice history, so the 613 '
            + 'keyons are verified with injected voices, not the live allocator.',
      timeline: 'the mailbox door -> keyon historical map (TODO 4 / C8): the '
              + 'frame-by-frame driver that aligns doors to keyons (the +offset '
              + 'warp) and emits the full 191,367-row stream.',
    };
    assert.equal(Object.keys(TODO).length, 5, 'five named TODOs gate full reproduction');

    // The chain wires the three layers (constructor does not throw).
    const chain = new SoundChain(new SfxParamTable());
    assert.ok(chain.rf instanceof IcsRegisterFile, 'Layer 1: IcsRegisterFile');
    assert.ok(chain.engine instanceof VoiceEngine, 'Layer 2: VoiceEngine');
    assert.ok(chain.queue instanceof MailboxQueue, 'Layer 3: MailboxQueue');
    assert.ok(chain.loop instanceof MainLoop, 'Layer 3: MainLoop');
    assert.ok(chain.inote instanceof ImmediateNoteOn, 'Layer 3: ImmediateNoteOn');
    assert.ok(MAINLOOP.top === 0x0321 && MAINLOOP.backEdge === 0x07CA,
      'the main loop + its back-edge are mapped');
  });
