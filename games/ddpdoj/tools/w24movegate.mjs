// W24 MOVER-POSITION GATE -- the dynamic verdict for `$2638A6`.  Replays ONE
// scripted type-$11 mover's whole life (init + one stepMovement per frame) and
// compares its sub-record position (($2,A6)/($4,A6)) against the board at every
// frame.  The done-when is 0 divergent over the mover's whole life.
//
// WHY THIS WORKS (recon sec 6): the $11 handler `$2688CC` calls `jsr $2638A6`
// and otherwise only READS position or copies it to a child record -- it never
// writes ($2/$4,A6).  So a $11 mover's position is ENTIRELY the movement
// interpreter's output, and an interpreter-only replay must match the board.
//
// THE CORPUS is `w24-mover-stage1.tsv` (gitignored, ROM-derived): one SPAWN row
// (lf, posX, posY, freeze, scroll, streamPtr, param, scrollOdo) then one P row
// per frame to death.  The SPAWN row carries the param + $8130D0 the init reader
// needs to reproduce the spawn Y exactly.
//
// CADENCE: the lua taps at the pre-handler point (CURPC==$263502).  The SPAWN
// row is the init position (post-$263808, pre-handler); each P row is +one
// stepMovement (the previous frame's handler).  So port init == SPAWN, and port
// step i (driven by the PREVIOUS row's globals) == P row i.
//
//   node tools/w24movegate.mjs              # 0 divergent over the mover's life
//   node tools/w24movegate.mjs --break vel  # RED: swap dY/dX -> divergent

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { readMovementInit, stepMovement, MOVER } from '../src/movement.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const CORPUS = path.join(ROOT, 'tools', 'oracle', 'out', 'w24-mover-stage1.tsv');
const STREAMS_JSON = path.join(ROOT, 'assets', 'w24-movement', 'stage1-streams.json');
const MOVEMENT_JS = path.join(ROOT, 'src', 'movement.js');

const REC = 0x818000, SUB = 0x818060;
const NOOP = { note() {} };

function readRows(file) {
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[0] === 'SPAWN') {
      rows.push({
        spawn: true, lf: +c[1], clk: parseInt(c[2], 16),
        x: parseInt(c[3], 16), y: parseInt(c[4], 16),
        freeze: parseInt(c[5], 16), scroll: parseInt(c[6], 16),
        stream: parseInt(c[7], 16), param: parseInt(c[8], 16),
        scrollOdo: parseInt(c[9], 16), classByte: parseInt(c[10], 16),
        b03c: parseInt(c[11], 16),
      });
    } else if (c[0] === 'P') {
      rows.push({
        spawn: false, lf: +c[1], clk: parseInt(c[2], 16),
        x: parseInt(c[3], 16), y: parseInt(c[4], 16),
        freeze: parseInt(c[5], 16), scroll: parseInt(c[6], 16),
        b03c: parseInt(c[8], 16),
      });
    }
  }
  return rows;
}

function setupMover(ram, spawn, streamStart) {
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);
  ram.setU32(REC + 0x06, SUB);
  ram.setU16(REC + 0x0a, spawn.param);
  ram.setU16(REC + 0x04, 0);            // runLen 0 -> 1 sub-record
  ram.setU8(REC + 0x0d, spawn.classByte);   // bit 0 gates $24179E scroll comp
  ram.setU32(REC + 0x12, streamStart);  // movement cursor at the STREAM START
  ram.setU16(0x8130d0, spawn.scrollOdo);
  ram.setU16(0x80b03c, spawn.b03c);     // the cross-axis scroll comp longword
}

// The lua captured +$12 at the PRE-HANDLER point, which is the cursor AFTER the
// init reader ($263808) -- i.e. pointing AT the first HEAD byte, inside the
// stream, not at its start.  The port's readMovementInit needs the STREAM START
// (the 4-byte position prefix lives there).  Resolve it: find the dumped stream
// whose [rom, rom+size) contains the captured cursor and use its `rom`.
function resolveStreamStart(cursor) {
  const j = JSON.parse(fs.readFileSync(STREAMS_JSON, 'utf8'));
  for (const s of j.streams) {
    const rom = parseInt(s.rom.replace('$', ''), 16);
    if (cursor >= rom && cursor < rom + s.size) return { start: rom, idx: s.idx };
  }
  return null;
}

function main() {
  const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
  if (!fs.existsSync(TABLES)) { console.error('FAIL player.tables.json missing'); return 1; }
  if (!fs.existsSync(CORPUS)) {
    console.error(`SKIP ${path.basename(CORPUS)} missing -- run `
      + '`python tools/oracle/w24moverun.py 4200 w24-mover-stage1` (~1 min)');
    return 0;                            // SKIP not FAIL (corpus is gitignored)
  }

  const spec = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(spec.rom);
  const realTables = new MoveTables(spec, rom);
  // the RED mutation lives IN THE GATE (a wrapper that corrupts the velocity),
  // never in src/movement.js -- SHA-verify the source is byte-identical both ways.
  const tables = brk === 'vel'
    ? { vector: (s, h) => { const v = realTables.vector(s, h); return { dy: v.dx, dx: v.dy }; } }
    : realTables;

  const rows = readRows(CORPUS);
  const spawn = rows.find((r) => r.spawn);
  if (!spawn) { console.error('FAIL no SPAWN row in corpus'); return 1; }
  const pRows = rows.filter((r) => !r.spawn);
  // the captured `stream` is the post-init cursor (at the HEAD byte); resolve
  // the stream START so readMovementInit reads the position prefix.
  const stream = resolveStreamStart(spawn.stream);
  if (!stream) {
    console.error(`FAIL cursor $${spawn.stream.toString(16)} is not inside any `
      + `dumped stage-1 stream (the mover may use a stage-2+ stream)`);
    return 1;
  }

  const ram = new Ram(null);
  setupMover(ram, spawn, stream.start);
  readMovementInit(ram, rom, REC, NOOP);     // -> spawn position

  // the SHA-256 of src/movement.js, BEFORE and AFTER (unchanged: the mutation
  // is the gate's wrapper, not the source).  RULE 4 both-ways discipline.
  const sha = crypto.createHash('sha256').update(fs.readFileSync(MOVEMENT_JS)).digest('hex');

  let divergent = 0, firstDiv = null;
  const cmp = (row, tag) => {
    const px = ram.u16(SUB + 0x02), py = ram.u16(SUB + 0x04);
    if (px !== row.x || py !== row.y) {
      divergent++;
      if (!firstDiv) firstDiv = { lf: row.lf, tag, px, py, bx: row.x, by: row.y };
    }
  };
  cmp(spawn, 'SPAWN(init)');

  // step i uses the PREVIOUS row's globals (the handler at lf K+i-1 read those,
  // producing the position at lf K+i).  Compare the result with the current row.
  let prev = spawn;
  for (const row of pRows) {
    ram.setU16(0x8130d2, prev.freeze);       // $2638A6 tst.w $8130d2
    ram.setU16(0x813172, prev.scroll);       // escape #9 / init (unused by $11)
    ram.setU16(0x80b03c, prev.b03c);         // $24179E cross-axis scroll comp
    stepMovement(ram, rom, REC, tables, NOOP);
    cmp(row, 'P');
    prev = row;
  }

  const life = pRows.length;
  const pct = (100 * (1 - divergent / Math.max(1, life + 1))).toFixed(2);
  console.log(`CORPUS ${path.basename(CORPUS)}`);
  console.log(`SUBJECT $11 stream=$${stream.start.toString(16)} (idx $${stream.idx.toString(16)}) `
    + `lf ${spawn.lf}..${spawn.lf + life} (${life} steps)`);
  console.log(`RESULT mover-position divergent: ${divergent} of ${life + 1} `
    + `(${pct} % match)${brk ? `  [break=${brk}]` : ''}`);
  if (firstDiv) {
    console.log(`  first divergence lf=${firstDiv.lf} ${firstDiv.tag}: `
      + `port=($${firstDiv.px.toString(16)},$${firstDiv.py.toString(16)}) `
      + `board=($${firstDiv.bx.toString(16)},$${firstDiv.by.toString(16)})`);
  } else {
    console.log(`  port init pos ($${ram.u16(SUB + 0x02).toString(16)},`
      + `$${ram.u16(SUB + 0x04).toString(16)}) matches the board's whole-life track`);
  }
  console.log(`  src/movement.js sha256 ${sha.slice(0, 16)} (unchanged by --break: `
    + `the mutation is the gate's velocity wrapper)`);

  if (brk) return divergent > 0 ? 0 : 1;     // RED: mutation MUST diverge
  return divergent === 0 ? 0 : 1;
}

process.exit(main());
