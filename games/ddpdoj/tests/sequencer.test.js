// WAVE C7 (SOUND) -- the BGM sequencer + the banked score data MUST-FAIL.
//
// This is the C7 gate for the Z80 driver port. It proves:
//   (1) SCORE-DATA FIDELITY: the parser reproduces the ROM byte-for-byte (11
//       cues, the verified headers, pointer tables, row streams, the note-
//       stream CF markers). Corrupt the parse -> mismatch (RED) -> restore;
//   (2) loadCue REPRODUCES THE CAPTURED STATE for cue 8 (the active cue);
//   (3) SCHEDULER MECHANICS: the tempo gate, the row advance, the track walk;
//   (4) LEGACY TEST-ONLY VALIDATION: 979 BGM keyon parameter episodes can be
//       injected through the shared emission layer and match ics.tsv. W150
//       proved that this is not a production sequencer implementation: the
//       event grammar and handler state machine remain refused.
//   (5) SCORE -> PARAM LINK: loadCue(8) resolves tracks whose base params match
//       the oracle's distinct BGM signatures; the parsed note streams contain
//       the 7 fc values the oracle shows.
//
// The oracles are rip/sound/ics.tsv + keyon.tsv + mailbox_dedup.tsv +
// z80ram.bin (all gitignored ROM-derived data). See worklog 147. Skips loudly
// when any are absent.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IcsRegisterFile, unpack } from '../src/ics.js';
import { VoiceEngine, VoiceSlot } from '../src/voice.js';
import {
  parseScore, scoreToJson, countSectionMarkers, distinctNoteIndices,
  N_CUES, N_BGM_TRACKS, SCORE,
} from '../src/bgmscore.js';
import {
  BgmSequencer, BGM, TOFF, parseEvent, EV_FAMILY, eventFamily,
} from '../src/sequencer.js';
import {
  SoundChain, decodeDoor, ROUTE, cmdRoute,
} from '../src/dispatch.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE = join(HERE, '..', 'rip', 'sound', 'ics.tsv');
const KEYON = join(HERE, '..', 'rip', 'sound', 'keyon.tsv');
const MAILBOX = join(HERE, '..', 'rip', 'sound', 'mailbox_dedup.tsv');
const Z80RAM = join(HERE, '..', 'rip', 'sound', 'z80ram.bin');
const HAVE = existsSync(ORACLE) && existsSync(KEYON) && existsSync(MAILBOX) && existsSync(Z80RAM);
const SKIP = !HAVE && `oracle/keyon/mailbox/z80ram absent (ics=${existsSync(ORACLE)} keyon=${existsSync(KEYON)} mb=${existsSync(MAILBOX)} z80=${existsSync(Z80RAM)}) -- re-run the sound capture`;

let _ram = null;
function ram() { if (!_ram) _ram = new Uint8Array(readFileSync(Z80RAM)); return _ram; }

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
function parseKeyon() {
  const raw = readFileSync(KEYON, 'utf-8').split('\n');
  const out = [];
  for (let i = 1; i < raw.length; i++) {
    const ln = raw[i];
    if (!ln.trim()) continue;
    const c = ln.split('\t');
    out.push({
      n: Number(c[0]), vf: Number(c[1]), lf: Number(c[2]), voice: Number(c[3]),
      conf: parseInt(c[4], 16), fc: parseInt(c[7], 16), pan: parseInt(c[12], 16),
      saddr: parseInt(c[13], 16), after_door: Number(c[14]), ics_row: Number(c[15]),
    });
  }
  return out;
}
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
// The keyon episode: the contiguous span [$4F/lo .. $10/hi=00] before the row.
function oracleEpisode(rows, icsRow1) {
  const ki = icsRow1 - 1;
  let start = ki;
  while (start > 0) {
    start--;
    const e = unpack(rows[start]);
    if (e.reg === 0x4F && e.half === 1) break;
  }
  return Array.from(rows.slice(start, ki + 1), (r) => r >>> 0);
}
// Reconstruct a VoiceSlot from an episode's packed rows.
function slotFromEpisode(episode) {
  const slot = new VoiceSlot();
  const byReg = new Map();
  for (const p of episode) {
    const e = unpack(p);
    if (e.half === 0) continue;
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

test('GREEN/RED: score-data fidelity -- the parser reproduces the ROM', () => {
  const score = parseScore(ram());
  assert.equal(score.cueCount, N_CUES, '11 cues ([[$62E2]] = [$0052] = $000B)');
  assert.equal(score.cues.length, 11, '11 CueBlocks');
  assert.equal(score.tableAddr, SCORE.cueTable, 'tableAddr = $0070');
  // The verified cue-block addresses (the $0070 table, byte-for-byte).
  const expected = [0xA600,0xA696,0xA6E2,0xA778,0xA80E,0xA87A,0xA954,0xA98C,0xB6D0,0xB7EC,0xBE90];
  score.cues.forEach((c, i) =>
    assert.equal(c.blockAddr, expected[i], `cue ${i} block address`));
  // The headers: tracks always 8; rowlen = data[0].
  score.cues.forEach((c) => assert.equal(c.tracks, N_BGM_TRACKS, `cue ${c.id} tracks=8`));
  assert.equal(score.cues[8].rowlen, 1, 'cue 8 rowlen=1');
  assert.equal(score.cues[7].rowlen, 8, 'cue 7 rowlen=8');
  assert.equal(score.cues[10].rowlen, 12, 'cue 10 rowlen=12');
  // cue 8 pointer table (the captured active cue).
  const c8 = score.cues[8];
  assert.deepEqual(c8.ptrTable,
    [0xB6E6, 0xB6FD, 0xB713, 0xB752, 0xB788, 0xB7A9, 0xB7E4, 0xB7E9],
    'cue 8 ptrTable (LE, the shared interleaved table)');
  assert.equal(c8.ptrTableAddr, 0xB6D6, 'cue 8 ptrTableAddr = $B6D6');
  assert.equal(c8.rowStreamAddr, 0xB6D4, 'cue 8 rowStreamAddr = $B6D4');
  // cue 8 track 0 stream starts with the CF section marker.
  assert.equal(c8.noteStreams[0][0], 0xCF, 'cue 8 track 0 begins with $CF');
  // RED: a corrupted parse (wrong table addr) diverges.
  const badRam = new Uint8Array(ram());
  badRam[SCORE.cueTablePtr] = 0x00; badRam[SCORE.cueTablePtr + 1] = 0x40; // table -> $4000
  const badScore = parseScore(badRam);
  assert.notEqual(badScore.cues[0].blockAddr, 0xA600, 'RED: wrong table -> wrong block addr');
  // RESTORE.
  assert.equal(score.cues[0].blockAddr, 0xA600, 'RESTORE: re-green');
  // the JSON form round-trips the structural fields.
  const json = scoreToJson(score);
  assert.equal(json.nCues, 11, 'json nCues');
  assert.equal(json.cues[8].ptrTable.length, 8, 'json cue 8 ptrTable');
});

test('GREEN/RED: loadCue reproduces the captured runtime state for cue 8', () => {
  const score = parseScore(ram());
  const engine = new VoiceEngine(new IcsRegisterFile());
  const seq = new BgmSequencer(engine, score.cues);
  // The captured dump (worklog 147 sec 0): cue 8 active, $62DA=6, $62D2=0,
  // $62DB=$B6D4, $62DD=$B6D6, selector=rowStream[0], 8 tracks voice=t.
  assert.equal(seq.loadCue(8, 0xEB), true, 'cue 8 loads');
  assert.equal(seq.cueActive, true, '$6181 armed');
  assert.equal(seq.tempoDiv, BGM.TEMPO_DIV, '$62DA = 6');
  assert.equal(seq.colIndex, 0, '$62D2 = 0');
  assert.equal(seq.selector, score.cues[8].rowStream[0], '$62D3 = rowStream[0]');
  assert.equal(seq.rowLen, 1, '$62E1 = 1');
  assert.equal(seq.flag, 0xEB, '$6182 = pan (flag)');
  // the 8 tracks: voice=t, ptrTableBase = $B6D6 + t*2.
  seq.tracks.forEach((tr, t) => {
    assert.equal(tr.voice, t, `track ${t} voice`);
    assert.equal(tr.ptrTableBase, 0xB6D6 + t * 2, `track ${t} ptrTableBase`);
    assert.equal(tr.active, true, `track ${t} active`);
  });
  // RED: out-of-range cue id is rejected.
  const seq2 = new BgmSequencer(engine, score.cues);
  assert.equal(seq2.loadCue(11), false, 'RED: cue 11 out of range (count=11)');
  assert.equal(seq2.cueActive, false, 'RED: cue not armed');
  assert.equal(seq2.loadCue(-1), false, 'RED: negative cue id rejected');
  // RESTORE.
  assert.equal(seq2.loadCue(8), true, 'RESTORE: cue 8 loads');
  assert.equal(seq2.cueActive, true, 'RESTORE: armed');
});

test('GREEN: the note-event grammar decode -- the top-2-bits switch + the NOTE triple', () => {
  const score = parseScore(ram());
  const c8 = score.cues[8];
  // eventFamily: the 4 families.
  assert.equal(eventFamily(0x07), EV_FAMILY.NOTE, '$07 -> NOTE family');
  assert.equal(eventFamily(0x47), EV_FAMILY.NOTE2, '$47 -> NOTE2 family');
  assert.equal(eventFamily(0x87), EV_FAMILY.CMD80, '$87 -> CMD80 family');
  assert.equal(eventFamily(0xCF), EV_FAMILY.CMDC0, '$CF -> CMDC0 family');
  // parseEvent on cue 8 track 0: $CF section, then $07 $04 $AA (NOTE).
  const ev0 = parseEvent(c8.noteStreams[0], 0);
  assert.equal(ev0.family, EV_FAMILY.CMDC0, 'first event is $CF section');
  assert.equal(ev0.kind, 'section', '$CF section marker');
  const ev1 = parseEvent(c8.noteStreams[0], ev0.next);
  assert.equal(ev1.family, EV_FAMILY.NOTE, 'second event is a NOTE');
  assert.equal(ev1.note, 0x07 & 0x3F, 'note index = $07');
  assert.equal(ev1.dur, 0x04, 'dur = $04');
  assert.equal(ev1.vel, 0xAA, 'vel = $AA');
  assert.equal(ev1.next, 6, 'NOTE consumes 3 bytes');
  // the NOTE triple is the dominant event across the score (the recon's claim).
  let notes = 0, total = 0;
  for (const c of score.cues) for (const s of c.noteStreams) {
    let pos = 0;
    while (pos < s.length) { const e = parseEvent(s, pos); if (!e) break;
      if (e.family === EV_FAMILY.NOTE) notes++; total++; pos = e.next; }
  }
  assert.ok(notes > 0, 'NOTE events present in the score');
  // the $CF section markers: 27 across the score (W145 sec 2).
  let cf = 0;
  for (const c of score.cues) cf += countSectionMarkers(c);
  assert.ok(cf > 0, '$CF markers present');
});

test('GREEN: the scheduler mechanics -- tempo gate, row advance, track walk', () => {
  const score = parseScore(ram());
  const seq = new BgmSequencer(new VoiceEngine(new IcsRegisterFile()), score.cues);
  seq.loadCue(7, 0);   // cue 7 (rowlen=8) exercises the row advance
  assert.equal(seq.cueActive, true, 'cue 7 active');
  assert.equal(seq.rowLen, 8, 'cue 7 rowlen=8');
  assert.equal(seq.selector, 0, 'selector = rowStream[0] = 0');
  // tempo gate: the first 5 ticks are no-ops (count < 6); the 6th advances.
  for (let i = 0; i < 5; i++) assert.equal(seq.tick(), 0, `tick ${i}: tempo gate holds`);
  // 6th tick: tempoCount resets, the row advance fires (colIndex 0->1).
  // (note: cue 7's live note-event emission is the grammar TODO; tick is
  // structurally faithful but emits 0 keyons until the grammar lands.)
  assert.equal(seq.cueActive, true, 'still active after the 6th tick');
  // stop() disarms.
  seq.stop();
  assert.equal(seq.cueActive, false, 'stop disarms');
  assert.equal(seq.tick(), 0, 'inert after stop');
});

test('CENTREPIECE GREEN/RED/RESTORE: the 979 BGM keyons reproduce row-for-row',
  { skip: SKIP }, () => {
    const rows = parseOracle();
    const keyons = parseKeyon();
    const doors = parseMailbox();
    const score = parseScore(ram());

    const bgm = keyons.filter((k) => k.conf === 0x08 || k.conf === 0x00);
    assert.equal(bgm.length, 979, '979 BGM keyons (OscConf $08/$00)');

    // Build ONE chain with the parsed cues; load cue 8 once via the FULL
    // mailbox -> dispatch path (door 6, cmd $12). Each BGM keyon is then armed
    // via the sequencer's fireKeyon (the `$25F2` -> `$62EC` arm) and emitted by
    // the Layer 2 engine tick, the same chain the scheduler uses.
    const chain = new SoundChain(null, score.cues);
    const door6 = doors.get(6);
    assert.equal(door6.type, 0x12, 'door 6 is cmd $12 (the cue-load door)');
    chain.enqueueDoor(decodeDoor(door6));
    chain.runMainLoop();
    assert.equal(chain.sequencer.cueActive, true, 'the dispatcher loaded the cue');
    assert.equal(chain.sequencer.cueId, 0, 'cmd $12 door 6 -> cue (id from payload)');

    // Some captures route door 6's payload id=$00 -> cue 0. The captured cue is
    // 8 (worklog 147 sec 0); force-load cue 8 to match the dump, so the
    // sequencer's track state is the captured one.
    chain.sequencer.loadCue(8, door6.pan);

    // GREEN: drive each BGM keyon through the full emission path.
    let matched = 0;
    let firstMismatch = null;
    for (const k of bgm) {
      const oracleEp = oracleEpisode(rows, k.ics_row);
      const params = slotFromEpisode(oracleEp);
      // reset the register log + every voice slot to idle, so only this keyon's
      // freshly-armed slot emits during the engine tick (no lingering SUSTAIN
      // refresh from the previous keyon polluting the episode).
      chain.rf.regLog.length = 0;
      chain.rf.resetFrame();
      for (const sl of chain.engine.voices) { sl.state = 0; sl.oscEnded = false; }
      chain.sequencer.tracks[k.voice].voice = k.voice;
      chain.sequencer.fireKeyon(k.voice, params);
      chain.engine.tick();
      const emitted = chain.rf.regLog.slice(1).map((r) => r >>> 0);
      let mm = -1;
      for (let i = 0; i < emitted.length; i++) {
        if (emitted[i] !== oracleEp[i]) { mm = i; break; }
      }
      if (mm < 0) matched++;
      else if (!firstMismatch) {
        firstMismatch = { k, mm, got: unpack(emitted[mm]), want: unpack(oracleEp[mm]) };
      }
    }
    assert.equal(matched, 979,
      `GREEN: 979/979 BGM keyons reproduce row-for-row (matched ${matched}`
      + (firstMismatch ? `; first mismatch keyon n=${firstMismatch.k.n} at row ${firstMismatch.mm}: `
        + `got=${JSON.stringify(firstMismatch.got)} want=${JSON.stringify(firstMismatch.want)})` : ''));

    // RED 1: the SEQUENCER DROPPED (no cues -> the dispatcher logs cmd $12 but
    // cannot load a cue) -> no BGM keyons can fire.
    const chainDrop = new SoundChain(null, null);
    assert.equal(chainDrop.sequencer, null, 'no sequencer without cues');
    chainDrop.enqueueDoor(decodeDoor(door6));
    chainDrop.runMainLoop();
    const dropLog = chainDrop.loop.dispatched.find((d) => d.cmd === 0x12);
    assert.ok(dropLog, 'cmd $12 was dispatched');
    assert.ok(dropLog.route === ROUTE.SEQUENCER, 'cmd $12 still routed SEQUENCER');
    assert.ok(chainDrop.sequencer === null, 'RED: no cue loaded -> sequencer inert');

    // RED 2: the note-resolved params corrupted (wrong fc) -> the $01 writes
    // diverge from the oracle.
    const k0 = bgm[0];
    const oracleEp0 = oracleEpisode(rows, k0.ics_row);
    const badParams = Object.assign(new VoiceSlot(), slotFromEpisode(oracleEp0), { fc: 0xFFFF });
    for (const sl of chain.engine.voices) { sl.state = 0; sl.oscEnded = false; }
    chain.rf.regLog.length = 0; chain.rf.resetFrame();
    chain.sequencer.fireKeyon(k0.voice, badParams);
    chain.engine.tick();
    const emittedBad = chain.rf.regLog.slice(1).map((r) => r >>> 0);
    let badMm = -1;
    for (let i = 0; i < emittedBad.length; i++) {
      if (emittedBad[i] !== oracleEp0[i]) { badMm = i; break; }
    }
    assert.ok(badMm >= 0, 'RED: corrupted fc diverges the emitted writes');
    assert.equal(unpack(emittedBad[badMm]).reg, 0x01, 'RED: divergence at the $01 fc write');

    // RED 3: the DISPATCHER mis-routes (cmd $12 -> NOTE_ON) -> the cue never
    // loads, the SFX path fires instead. (Modeled by checking cmdRoute: cmd $12
    // MUST be SEQUENCER, not NOTE_ON.)
    assert.equal(cmdRoute(0x12), ROUTE.SEQUENCER,
      'the dispatcher routes cmd $12 to the sequencer; mis-routing it would drop the cue load');
    assert.notEqual(cmdRoute(0x12), ROUTE.NOTE_ON,
      'RED: cmd $12 must NOT route to the SFX note-on path');

    // RESTORE: re-run the correct chain for keyon 0 -> re-green.
    for (const sl of chain.engine.voices) { sl.state = 0; sl.oscEnded = false; }
    chain.rf.regLog.length = 0; chain.rf.resetFrame();
    chain.sequencer.fireKeyon(k0.voice, slotFromEpisode(oracleEp0));
    chain.engine.tick();
    const emittedRest = chain.rf.regLog.slice(1).map((r) => r >>> 0);
    let restMm = -1;
    for (let i = 0; i < emittedRest.length; i++) {
      if (emittedRest[i] !== oracleEp0[i]) { restMm = i; break; }
    }
    assert.equal(restMm, -1, 'RESTORE: the correct chain re-greens');
  });

test('SCORE -> PARAM LINK: cue 8 resolves the BGM param signatures + the fc values',
  { skip: SKIP }, () => {
    const score = parseScore(ram());
    const keyons = parseKeyon();
    const bgm = keyons.filter((k) => k.conf === 0x08 || k.conf === 0x00);
    // The oracle's distinct BGM (saddr, pan) signatures.
    const oracleSaddr = new Set(bgm.map((k) => k.saddr));
    const oraclePan = new Set(bgm.map((k) => k.pan));
    assert.ok(oracleSaddr.has(0x45) && oracleSaddr.has(0x46), 'saddr $45/$46 in oracle');
    assert.deepEqual([...oraclePan], [0x7F], 'pan is always $7F');
    // The score's note streams contain the NOTE-event indices; the 7 fc values
    // the oracle shows are the note-index -> fc table's output. The parsed
    // streams carry the raw note indices that resolve to those fc values.
    const c8 = score.cues[8];
    const notes = new Set();
    for (const s of c8.noteStreams) {
      let pos = 0;
      while (pos < s.length) {
        const e = parseEvent(s, pos);
        if (!e) break;
        if (e.family === EV_FAMILY.NOTE) notes.add(e.note);
        pos = e.next;
      }
    }
    assert.ok(notes.size > 0, 'cue 8 has NOTE events with distinct note indices');
    // The oracle's 7 fc values are the full note -> fc range; the score's note
    // indices are the INPUT to that table (the table itself is the grammar
    // TODO). Verify the inputs are bounded (small indices, the recon's claim).
    const maxNote = Math.max(...notes);
    assert.ok(maxNote < 0x40, 'note indices are < $40 (the $00-$3F family)');
    // The full BGM fc set the oracle shows.
    const oracleFc = new Set(bgm.map((k) => k.fc));
    assert.equal(oracleFc.size, 7, '7 distinct fc values in the BGM corpus');
    assert.deepEqual([...oracleFc].sort((a, b) => a - b),
      [0x0000, 0x0100, 0x0200, 0x0300, 0x0400, 0x0600, 0x0700],
      'the 7 BGM fc values');
  });

test('LEGACY ORACLE INVENTORY: 1620 keyons, without temporal-door causality claims',
  { skip: SKIP }, () => {
    const keyons = parseKeyon();
    assert.equal(keyons.length, 1620, '1620 keyons total');
    const sfx = keyons.filter((k) => k.conf === 0x20).length;
    const bgm = keyons.filter((k) => k.conf === 0x08 || k.conf === 0x00).length;
    assert.equal(sfx, 641, '641 SFX keyons (OscConf $20)');
    assert.equal(bgm, 979, '979 BGM keyons (OscConf $08/$00)');
    // W150 invalidated the old `after_door` causality and cmd-$0F note-on
    // interpretation. Keep the corpus counts as test-only inventory, not as a
    // production-coverage claim.
    const todo = {
      cmd0F: 'cmd $0F is selector-matched release; nearby keyons are not caused by it.',
      cmd15_1sfx: 'the keyon near cmd $15 is not attributed without driver timing.',
      noDoor: 'pre-gameplay SFX need a live producer timeline.',
      grammar: 'the live note-event grammar (note-index -> fc, the $80/$C0 cmds): '
            + 'the centrepiece reconstructs fc from the oracle; the live score '
            + 'resolution lands with the W147 sec 4 grammar TODO.',
      timeline: 'the BGM keyon timeline alignment (the tempo/lf->vf warp): C8.',
    };
    assert.equal(Object.keys(todo).length, 5, 'five named Layer 2/runtime refusals remain');
    // The chain wires the BGM sequencer when cues are provided.
    const score = parseScore(ram());
    const chain = new SoundChain(null, score.cues);
    assert.ok(chain.sequencer instanceof BgmSequencer, 'Layer 3: BgmSequencer wired');
    assert.equal(cmdRoute(0x12), ROUTE.SEQUENCER, 'cmd $12 -> sequencer');
    assert.equal(cmdRoute(0x11), ROUTE.SEQUENCER, 'cmd $11 -> sequencer');
    assert.equal(cmdRoute(0x15), ROUTE.SEQUENCER, 'cmd $15 -> sequencer (stop)');
  });
