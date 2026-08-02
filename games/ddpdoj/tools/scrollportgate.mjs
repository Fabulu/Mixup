#!/usr/bin/env node
// THE SCROLL PORT GATE -- `src/background.js` against the board, frame for frame.
//
//   node tools/scrollportgate.mjs [tsv] [--entry 0x38] [--k 1620]
//                                       [--break NAME] [--break all]
//
// WHAT THIS IS, AND WHY IT IS NOT `scrollgate.py`.  `scrollgate.py` compares a
// PYTHON MODEL of $2612A0/$262062/$261F76/$240B94 against a measured TSV and
// reports 0 divergent frames over 10,431 logic frames of stage 1
// (`17-impl-invuln-stage-run.md` §2).  This runs the PORT -- the JavaScript the
// browser executes -- against the SAME TSV, on more columns.  Nothing here
// imports the Python model's arithmetic: two independent translations of one
// listing that each agree with the board is worth more than one translation
// checked twice (`17-impl` §12 item 5 makes the same argument the other way).
//
// THE SEED IS THE ROM, NOT A RAM DUMP.  The port's own `$26114C` builds the
// object from the listing: the entry clock, the 15-column pre-fill, the script
// install and `$26200E`'s fast-forward.  So a divergence at frame 1 is an INIT
// defect and a divergence at frame 200 is a VM defect, and the two cannot be
// confused.  The board's own init lands at lf1618 (measured: `$80B016` and
// `$80B038` step to $800 on that frame and on no other), the two warm-up
// dispatches are lf1619/lf1620, and the first handler frame is lf1621 -- which
// is exactly `k + 1` with wave 17's `k = 1620`.
//
// WHAT IS SUPPLIED FROM THE BOARD, and every one of these is an INPUT this
// wave does not claim, declared here rather than discovered later:
//
//   $8130D2  the background freeze -- and THE WINDOW ENDS AT ITS FIRST RISING
//            EDGE, for a reason this wave measured rather than assumed.  Its
//            three writers are all unported ($25FD82 from the life machine,
//            from the banner, and from the stage-clear path) and they raise it
//            at DIFFERENT POINTS INSIDE THE FRAME relative to the background
//            object, so a port that is fed only the sample-point value cannot
//            know whether the handler ran on the edge frame:
//              STAGE CLEAR (w17-stage1-invuln-p2, lf12052): $8130D2 = 1 at the
//                sample point AND $80B012 advanced one more $100 step on that
//                frame -- the handler ran, then the flag went up.
//              DEATH PAUSE (bg-deep, lf3289): $8130D2 = 1 at the sample point
//                and $80B012/$81318C did NOT advance -- the flag went up first.
//            Same flag, opposite answer, 8,763 frames apart.  Guessing either
//            way is wrong on the other run by $20..$100 for the rest of it
//            (MEASURED: 814 frames on bg-deep with the stage-clear reading,
//            308 on the wave-17 corpus with the death reading).  So the window
//            STOPS, loudly, and W18/W28 own the ordering.  This is also
//            exactly `scrollgate.py`'s effective window: 10,431 frames on the
//            wave-17 corpus, 1,668 on bg-deep -- the two published numbers.
//   $81316E  the cross-axis delta.  `$26146C` IS PORTED (src/background.js) but
//            it is a function of the PLAYER RECORD, and this TSV carries no
//            player.  `pgm.py flyaround` drives and compares it instead.
//   $813096  the stage index x 4.  Written by $25FD0C, the flow layer.
//   $81317E  the external freeze.  NEVER WRITTEN in 16,000 logic frames (W17
//            §3c) -- supplied anyway, so "it stayed 0" is a watch.
//   $813180  the external speed push, and its two values.  See EXT_SPEED_PUSH.
//   $80B054  the SCREEN SHAKE offsets, written by $260EC8 -- unported (W18/W30)
//   $80B056  and measured live for 42 frames of the boss (W17 §9).  They are
//            supplied for one reason: without them the `upload-subtracts-shake`
//            red switch cannot go red, because subtracting a zero the port
//            never writes is a no-op.  With them the CLEAN run stays green and
//            the mutation reddens exactly 42 frames -- which is the proof that
//            $140FFE, not $240CC0, is the routine that runs.
//
// WHAT IS COMPARED: eleven columns, of which the first four are the ones
// `20-plan` §2 makes the done-when for W14 and W16.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { makeBackground, BgVram, VideoRegs, uploadRegs, BGRAM, BGO, CAM }
  from '../src/background.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// `bgrecon.lua:181`'s row, 1-based in the Lua and 0-based here.  W17's
// `w17stage.lua` keeps columns 1..25 byte-for-byte identical to it on purpose.
const COL = {
  lf: 0, b012: 7, b016: 8, b034: 9, b038: 10, b054: 11, b056: 12,
  d176: 13, d16e: 14, d0ce: 15, d096: 16, d18a: 17, d18c: 18, d186: 19,
  d0d2: 20, bgx: 23, bgy: 24,
  // 26.. are wave 17's
  d190: 25, d0da: 26, d17e: 27, d180: 28, scr0: 29, scr1: 30, b03c: 31,
};

/**
 * THE EXTERNAL SPEED PUSH, and it is the one place this gate carries a number
 * that is not in the TSV.
 *
 * `$2612AA` consumes `$813180`/`$813182`/`$813184` and the TSV records only the
 * FLAG.  Wave 17 measured the whole event, once, in the whole stage:
 *
 *   lf4377/clk00F8@261100: 813180=0001
 *   lf4377/clk00F8@261108: 813182=0020
 *   lf4377/clk00F8@26110E: 813184=0020
 *   lf4378/clk00F8@2612B4: 813180=0000     <- $2612B4 consumes and clears it
 *
 * and measured that it was a NO-OP, because the script's own record at clock
 * $00F0 had already set speed $0020.  That is a coincidence, not a licence, so
 * the port runs the consumer arm and this table feeds it the values the board
 * pushed.  A push at any OTHER frame is a hard failure below, not a shrug: it
 * would mean the corpus has an event wave 17 did not see.
 *
 * THE FRAME IS THE ROW'S, NOT THE WRITE TAP'S, and the difference is a frame.
 * The TSV shows `$813180 = 1` at the SAMPLE POINT of lf4378 -- i.e. the
 * background handler of that frame had already run when the writer fired, so
 * `$2612B4` consumes it on lf4379.  (That ordering is itself evidence about
 * where `$2610FE`'s unidentified caller sits in the object table: after the
 * background object.)  So the key below is the row that SHOWS the flag, and the
 * gate arms the push for the frame AFTER it.
 */
const EXT_SPEED_PUSH = new Map([[4378, [0x0020, 0x0020]]]);

/**
 * THE RED SWITCHES.  A gate nobody has watched fail is not a gate, and this
 * project has shipped four.  Each is a MISREADING A CAREFUL PERSON WOULD MAKE,
 * names the instruction it falsifies, and says which columns must move.
 */
export const MUTATIONS = {
  'clock-per-frame': '$8130CE ticks once per FRAME instead of once per $200 of '
    + 'scroll. It is an odometer ($26132C), not a frame counter. Must move '
    + 'every column, first at the first speed change',
  'loop-word-as-iterations': "op-$04's loop word read as EXTRA passes rather "
    + 'than as the pass count ($262134). Must move the clock at the first repeat',
  'len-not-lenplus1': "$262130's `addq.w #1,D0` dropped, so the countdown is "
    + 'armed at len. The unfreeze lands 4 frames early',
  'reload-lenplus1': "the OTHER half of the same trap: $261FD0 reloads at len, "
    + 'not len+1. Only a gate that has both can tell the two readings apart',
  'cond-word-honoured': "the record's second word treated as a condition. "
    + '$262082 is an unconditional `addq.w #2,A1`; the word is $FFFF on all 57 '
    + 'stage-1 records, so honouring it executes NOTHING',
  'commit-the-fraction': '$240BA4 dropped: the whole accumulator is committed '
    + 'to $80B012 instead of (acc & ~$3F). Must move b012 and b034 ONLY -- if '
    + 'it moves the clock, the columns are not independent',
  'upload-subtracts-shake': 'the register upload ported from build B ($240CC0, '
    + 'which subtracts $80B054/$80B056) instead of build A ($140FFE, which does '
    + "not).  Must move bgx/bgy on exactly the boss's 42 shake frames and "
    + 'NOTHING else -- see src/isr.js',
  'no-fast-forward': "$26200E skipped, so the object starts at record 0 "
    + 'whatever its entry clock. Green at entry clock 0 BY CONSTRUCTION and '
    + 'red on the attract demo -- declared, see EXPECTED_GREEN',
  'prefill-14-columns': '$261202 `moveq #$e,D7` read as 14 columns instead of '
    + '15 (dbra runs D7+1 times). Must move d18a on the FIRST compared frame',
  'freeze-stops-the-scroll': 'op $0C read as freezing the SCROLL rather than '
    + 'the CLOCK. ($8,A5) is read at $261324 ONLY, guarding $26132C; the camera '
    + '($261308), the column writer ($26133C) and the TX camera ($26138A) are '
    + 'outside it. Must move b012/b034/d18a/d18c on the opening freeze -- '
    + 'stage 1 is frozen from frame 52 to frame 279 and scrolls 1,824 px in '
    + 'between (W19 §2)',
};

/** Mutations declared GREEN on THIS gate, BEFORE the run, with the reason.
 *  An unexplained pass is not evidence. */
export const EXPECTED_GREEN = (entry) => (entry !== 0 ? {} : {
  'no-fast-forward': 'the wave-17 corpus is a STAGE START, ENTRY CLOCK 0, and '
    + '$26200E returns immediately when $8130CE is 0 ($26200E tst.w/beq) -- so '
    + 'at THIS entry clock the mutation removes nothing. It is red on an '
    + 'attract-entry trace: `node tools/scrollportgate.mjs '
    + 'tools/oracle/out/bg-attract.tsv --entry 0x38 --k 2636 --break '
    + 'no-fast-forward`, MEASURED red on all 9 of that trace columns. The '
    + 'declaration is ENTRY-CLOCK CONDITIONAL for exactly that reason: a '
    + 'blanket expected-green here would excuse the mutation everywhere',
});

const COMPARED = ['d0ce', 'd18a', 'd18c', 'b012', 'b016', 'b034', 'b038',
  'b03c', 'scr0', 'scr1', 'bgx', 'bgy'];

function readTsv(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const p = line.split('\t');
    if (p.length < 25) continue;
    out.push(p);
  }
  return out;
}

export function gate(tsvPath, {
  entry = 0, k = 1620, mutate = null, tablesPath = null,
} = {}) {
  const rows = readTsv(tsvPath);
  const tables = JSON.parse(readFileSync(
    tablesPath ?? `${HERE}../rip/port/player.tables.json`, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const video = new VideoRegs();
  const unportedLog = new UnportedLog();
  const events = [];
  const ctx = { unportedLog, scrollEvent: (e) => events.push(e) };
  const A5 = 0x80e240;                        // object slot 0 ($2410C4 lea)

  const hasCol = (n) => rows.length && rows[0].length > COL[n];
  ram.setU16(BGRAM.stageX4, parseInt(rows[0][COL.d096], 16));
  ram.setU16(A5 + BGO.entryClock, entry);     // ($6,A5), $25FD7A writes 0

  const handler = makeBackground(rom, vram, {
    mutate, crossFromBoard: true,
  });

  // THE THREE WARM-UP DISPATCHES.  $26127A is a state machine: the first call
  // runs the init, the second sets bit 1, the third sets bit 3, and only the
  // fourth reaches $2612A0.  The board's are lf1618/1619/1620.
  for (let i = 0; i < 3; i++) handler(ram, A5, 0, ctx);

  const first = new Map();
  const diverged = new Map(COMPARED.map((c) => [c, 0]));
  let compared = 0, frozen = 0, last = k, resetAt = null;
  let prevClock = null;
  let pending = null;
  let frozenAt = null;
  let blocked = null;
  const pushSeen = [];

  for (const r of rows) {
    const lf = Number(r[COL.lf]);
    if (lf <= k) continue;
    const d0ce = parseInt(r[COL.d0ce], 16);
    // A row whose clock has returned to 0 is the stage ENDING ($25FD2E's dbra
    // clear) or a reset; either way the window ends (`scrollgate.py`'s rule).
    if (prevClock !== null && prevClock !== 0 && d0ce === 0) { resetAt = lf; break; }
    prevClock = d0ce;

    // ---- the inputs, all declared in the header ----
    // The freeze is an INPUT and the window ends at its first rising edge --
    // see the header for the two measurements that say why it has to.
    if (parseInt(r[COL.d0d2], 16) !== 0) { frozenAt = lf; break; }
    ram.setU16(BGRAM.bgFreeze, 0);
    ram.setU16(BGRAM.crossDelta, parseInt(r[COL.d16e], 16));
    ram.setU16(BGRAM.stageX4, parseInt(r[COL.d096], 16));
    if (hasCol('d17e')) ram.setU16(BGRAM.extFreeze, parseInt(r[COL.d17e], 16));
    ram.setU16(CAM.shakeX, parseInt(r[COL.b054], 16));
    ram.setU16(CAM.shakeY, parseInt(r[COL.b056], 16));
    if (pending) {                             // armed by the PREVIOUS row
      pushSeen.push(lf);
      ram.setU16(BGRAM.extSpeed, 1);
      ram.setU16(BGRAM.extSpeedBg, pending[0]);
      ram.setU16(BGRAM.extSpeedTx, pending[1]);
      pending = null;
    }

    // 1. IRQ6, gated: $140FFE uploads last frame's camera to the registers.
    uploadRegs(ram, video, { subtractShake: mutate === 'upload-subtracts-shake' });
    // 2. main-loop call #2 -> $240F62[1] -> $26127A -> $2612A0.
    //    A NAMED THROW IS A RESULT, NOT A CRASH (`docs/knowledge/08`): it says
    //    the port stopped, where, and why, and it must not destroy the
    //    divergence report gathered up to that point -- which is what tells a
    //    reader whether the throw is the CAUSE or a downstream consequence.
    try {
      handler(ram, A5, 0, ctx);
    } catch (e) {
      blocked = { lf, name: e.name, message: e.message.split('.')[0] };
      break;
    }
    // 3. the sample point.
    const port = {
      d0ce: ram.u16(BGRAM.clock), d18a: ram.u16(BGRAM.ringCursor),
      d18c: ram.u16(BGRAM.colAccum),
      b012: ram.u32(CAM.bgLong), b016: ram.u32(CAM.bgCross),
      b034: ram.u32(CAM.txLong), b038: ram.u32(CAM.txCross),
      b03c: ram.u16(CAM.txNegL),
      scr0: ram.u32(BGRAM.scr0), scr1: ram.u32(BGRAM.scr1),
      bgx: video.bg_xscroll, bgy: video.bg_yscroll,
    };
    const board = {
      d0ce, d18a: parseInt(r[COL.d18a], 16), d18c: parseInt(r[COL.d18c], 16),
      b012: parseInt(r[COL.b012], 16), b016: parseInt(r[COL.b016], 16),
      b034: parseInt(r[COL.b034], 16), b038: parseInt(r[COL.b038], 16),
      // the TSV column is `read_u32(0xb03c)`, i.e. $80B03C in the HIGH word
      // and $80B03E in the low.  $80B03C is the one $24179E reads.
      b03c: hasCol('b03c') ? (parseInt(r[COL.b03c], 16) >>> 16) & 0xffff : null,
      scr0: hasCol('scr0') ? parseInt(r[COL.scr0], 16) : null,
      scr1: hasCol('scr1') ? parseInt(r[COL.scr1], 16) : null,
      bgx: parseInt(r[COL.bgx], 16), bgy: parseInt(r[COL.bgy], 16),
    };
    for (const c of COMPARED) {
      if (board[c] === null || board[c] === undefined) continue;
      if (port[c] !== board[c]) {
        diverged.set(c, diverged.get(c) + 1);
        if (!first.has(c)) first.set(c, { lf, port: port[c], board: board[c] });
      }
    }
    compared++; last = lf;
    if (hasCol('d180') && parseInt(r[COL.d180], 16) !== 0) {
      pending = EXT_SPEED_PUSH.get(lf);
      if (!pending) {
        throw new Error(`$813180 is set at the sample point of lf${lf} and `
          + `EXT_SPEED_PUSH has no measured ($813182,$813184) pair for that `
          + `frame. The TSV records only the FLAG, so the gate cannot invent `
          + `the values -- re-measure with w17stage.lua's HUNT taps and add the `
          + `row, or the port's $2612AA arm runs on a fabricated speed.`);
      }
    }
  }

  return { compared, frozen, last, resetAt, frozenAt, first, diverged, events, blocked,
    unportedLog, vram, pushSeen,
    columns: COMPARED.filter((c) => rows.length
      && (COL[c] === undefined || rows[0].length > COL[c])) };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i < 0 ? d : argv[i + 1];
  };
  const pos = argv.filter((a) => !a.startsWith('--')
    && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
  const tsv = pos[0] ?? `${HERE}oracle/out/w17-stage1-invuln-p2.tsv`;
  const entry = Number(flag('entry', 0));
  const k = Number(flag('k', 1620));
  const brk = flag('break');

  const names = brk === 'all' ? Object.keys(MUTATIONS) : (brk ? [brk] : []);
  if (brk && brk !== 'all' && !MUTATIONS[brk]) {
    console.error(`unknown mutation "${brk}"; have: ${Object.keys(MUTATIONS).join(', ')}`);
    return 2;
  }

  console.log(`TSV   ${tsv}`);
  console.log(`ENTRY clock $${entry.toString(16).padStart(4, '0')}  `
    + `sim frame 0 at lf${k}  (the board's own init is at lf${k - 2}, its two `
    + `warm-up dispatches at lf${k - 1}/lf${k})`);

  const clean = gate(tsv, { entry, k });
  console.log(`FRAMES ${clean.compared} compared (lf${k + 1}..${clean.last})`
    + (clean.resetAt ? `, window ended at lf${clean.resetAt} (the clock `
      + `returned to 0 -- the stage END or a reset)` : '')
    + (clean.frozenAt ? `, window ended at lf${clean.frozenAt}: $8130D2 rose `
      + `and its INTRA-FRAME ORDER against the background object is unported `
      + `(see the header -- the stage clear and the death pause disagree)` : ''));
  console.log(`COLS   ${clean.columns.length}: ${clean.columns.join(' ')}`);
  console.log(`EXTSPEED $813180 consumed on ${clean.pushSeen.length} frame(s)`
    + `${clean.pushSeen.length ? ` (lf ${clean.pushSeen.join(',')})` : ''} -- `
    + `$2612AA..$2612CC, values from EXT_SPEED_PUSH (W17 §3d)`);
  const kinds = new Map();
  for (const e of clean.events) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  console.log(`SCROLL EVENTS the port's VM executed: `
    + [...kinds].map(([kd, n]) => `${kd}=${n}`).join(' '));
  console.log(`MAP COLUMNS written into $900000 by $240D76: ${clean.vram.columnsWritten}`);
  if (clean.blocked) {
    console.log(`BLOCKED at lf${clean.blocked.lf} by a named throw: `
      + `${clean.blocked.message}`);
  }
  console.log(`UNPORTED callees (counted, never silent):`);
  for (const l of clean.unportedLog.report()) console.log('  ' + l);

  let rc = 0;
  if (clean.first.size === 0 && !clean.blocked) {
    console.log(`RESULT 0 DIVERGENT FRAMES on ${clean.columns.length} columns `
      + `over ${clean.compared} logic frames`);
  } else {
    for (const [c, d] of [...clean.first].sort((a, b) => a[1].lf - b[1].lf)) {
      console.log(`DIVERGE ${c.padEnd(6)} first at lf${d.lf}: port=`
        + `${d.port.toString(16)} board=${d.board.toString(16)}  `
        + `(${clean.diverged.get(c)} frames)`);
    }
    console.log(`RESULT ${clean.first.size} of ${clean.columns.length} columns diverged`);
    rc = 1;
  }

  for (const m of names) {
    console.log(`\n---- MUTATION ${m} ----\n  ${MUTATIONS[m]}`);
    let r;
    try {
      r = gate(tsv, { entry, k, mutate: m });
    } catch (e) {
      console.log(`  THREW: ${e.message.split('\n')[0]}  -- RED (a named throw `
        + `is a result)`);
      continue;
    }
    const moved = [...r.diverged].filter(([, n]) => n > 0);
    const expected = EXPECTED_GREEN(entry)[m];
    if (moved.length === 0 && !r.blocked) {
      if (expected) {
        console.log(`  EXPECTED-GREEN, declared before the run: ${expected}`);
      } else {
        console.log(`  *** STILL GREEN over ${r.compared} frames -- THE GATE `
          + `CANNOT SEE THIS MISREADING. That is a finding, not a pass.`);
        rc = 1;
      }
    } else {
      console.log(`  RED on ${moved.length} column(s): `
        + moved.map(([c, n]) => `${c}=${n}`).join(' ')
        + `  first ${[...r.first][0]?.[0]}@lf${[...r.first][0]?.[1].lf}`);
      if (expected) {
        console.log(`  *** DECLARED EXPECTED-GREEN AND WENT RED -- one of the `
          + `two is wrong.`);
        rc = 1;
      }
    }
  }
  return rc;
}

if (process.argv[1]?.endsWith('scrollportgate.mjs')) process.exit(main());
