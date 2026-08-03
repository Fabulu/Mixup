// W25 HANDLER GATE -- the dynamic verdict for the six enemy handlers.  Replays
// EVERY six-handler enemy's whole life (init + one step per frame) and compares
// its sub-record position (($2,A6)/($4,A6)) against the board at every frame.
//
// This generalises W24's single-mover proof to all six handler types through
// the real per-frame dispatch cadence.  The position column is produced ENTIRELY
// by `$2638A6` stepMovement (W24) -- or, for the scroll-locked ground gun `$8B`,
// by `$24179E` scrollCompensate which `$27687E` calls directly instead of
// `$2638A6`.  The handlers' fire/damage/effect paths (noted, W26/W27/W28) never
// write `($2/$4,A6)`, so the position column is a clean done-when.
//
// CADENCE (W24, verbatim): the SPAWN row is the init position (post-`$263808`,
// pre-handler); each P row is +one step.  Port init == SPAWN (readMovementInit),
// and port step i (driven by the PREVIOUS row's globals) == P row i.
//
//   node tools/w25handlergate.mjs              # 0 divergent over all six types
//   node tools/w25handlergate.mjs --break vel  # RED: swap dY/dX -> diverge
//   node tools/w25handlergate.mjs --break skip # RED: skip one type's step

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { readMovementInit, stepMovement, scrollCompensate, applyVelocity } from '../src/movement.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const CORPUS = path.join(ROOT, 'tools', 'oracle', 'out', 'w25-handler-stage1.tsv');
const STREAMS_JSON = path.join(ROOT, 'assets', 'w24-movement', 'stage1-streams.json');
const MOVEMENT_JS = path.join(ROOT, 'src', 'movement.js');

const REC = 0x818000, SUB = 0x818060;
const NOOP = { note() {} };

// which position driver each handler calls per frame:
//   $2638A6 stepMovement : $11/$10/$82 (script-driven movers)
//   $2417DE applyVelocity: $05/$07/$27 (constant-velocity damage-first family)
//   $24179E scrollComp   : $8B (scroll-locked ground gun)
const DRIVER = {
  0x2688cc: 'step', 0x268232: 'step', 0x2747c6: 'step',
  0x269cea: 'vel', 0x26a2e2: 'vel',
  0x27687e: 'scroll',
};

function readCorpus(file) {
  // slot reuse is common (an enemy dies, the slot is reused next frame), so we
  // collect SPAWN->(next SPAWN|DEATH) ARCS per slot, not one sequence per slot.
  const arcs = [];                  // { handler, type, spawn, rows[] }
  const open = new Map();           // slot addr -> current arc (rows still open)
  for (const line of fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[0] === 'SPAWN') {
      // a new spawn closes any open arc for this slot (slot reused).
      if (open.has(c[2])) open.delete(c[2]);
      const arc = {
        handler: parseInt(c[3], 16), type: parseInt(c[4], 16),
        spawn: {
          lf: +c[1], x: parseInt(c[5], 16), y: parseInt(c[6], 16),
          cursor: parseInt(c[7], 16), param: parseInt(c[8], 16),
          classByte: parseInt(c[9], 16), scrollOdo: parseInt(c[10], 16),
          b03c: parseInt(c[11], 16), freeze: parseInt(c[12], 16),
          scroll: parseInt(c[13], 16),
        },
        rows: [],
      };
      arcs.push(arc);
      open.set(c[2], arc);
    } else if (c[0] === 'P') {
      const arc = open.get(c[2]);
      if (arc) arc.rows.push({
        lf: +c[1], x: parseInt(c[3], 16), y: parseInt(c[4], 16),
        freeze: parseInt(c[5], 16), scroll: parseInt(c[6], 16),
        b03c: parseInt(c[7], 16),
      });
    } else if (c[0] === 'DEATH') {
      open.delete(c[2]);            // the arc is closed
    }
  }
  return arcs;
}

// resolve the stream START from a post-init cursor (W24).  The cursor sits
// inside one of the dumped stage-1 streams; the START is that stream's ROM base.
function resolveStreamStart(cursor, streams) {
  for (const s of streams) {
    const rom = parseInt(s.rom.replace('$', ''), 16);
    if (cursor >= rom && cursor < rom + s.size) return rom;
  }
  return null;
}

function setupMover(ram, spawn, streamStart) {
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);
  ram.setU32(REC + 0x06, SUB);
  ram.setU16(REC + 0x0a, spawn.param);
  ram.setU16(REC + 0x04, 0);              // runLen 0 -> 1 sub-record
  ram.setU8(REC + 0x0d, spawn.classByte); // bit 0 gates scroll comp
  ram.setU32(REC + 0x12, streamStart);    // cursor at STREAM START
  ram.setU16(0x8130d0, spawn.scrollOdo);
  ram.setU16(0x80b03c, spawn.b03c);
}

function main() {
  const argv = process.argv.slice(2);
  const brk = argv.includes('--break') ? argv[argv.indexOf('--break') + 1] : null;
  const skipType = brk === 'skip' ? argv[argv.indexOf('--break') + 2] : null;
  if (!fs.existsSync(TABLES)) { console.error('FAIL player.tables.json missing'); return 1; }
  if (!fs.existsSync(CORPUS)) {
    console.error(`SKIP ${path.basename(CORPUS)} missing -- run `
      + '`python tools/oracle/w25run.py 5200 w25-handler-stage1` (~3 min)');
    return 0;
  }

  const spec = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(spec.rom);
  const realTables = new MoveTables(spec, rom);
  const tables = brk === 'vel'
    ? { vector: (s, h) => { const v = realTables.vector(s, h); return { dy: v.dx, dx: v.dy }; } }
    : realTables;

  const streams = JSON.parse(fs.readFileSync(STREAMS_JSON, 'utf8')).streams;
  const arcs = readCorpus(CORPUS);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(MOVEMENT_JS)).digest('hex');

  const ram = new Ram(null);
  let divergent = 0, compared = 0, firstDiv = null;
  const byType = {};   // type -> { spawn, rows, divergent }
  let noStream = 0, skippedArcs = 0;

  for (const s of arcs) {
    const driver = DRIVER[s.handler] || 'step';
    byType[s.type] = byType[s.type] || { spawn: 0, rows: 0, divergent: 0 };
    byType[s.type].spawn++;
    byType[s.type].rows += s.rows.length;

    // Every type runs readMovementInit at spawn (it sets position + heading/
    // speed from the script).  All six need the stream start resolved.
    const streamStart = resolveStreamStart(s.spawn.cursor, streams);
    if (streamStart === null) { noStream++; skippedArcs++; continue; }

    setupMover(ram, s.spawn, streamStart);
    readMovementInit(ram, rom, REC, NOOP);     // -> spawn position (+cursor state)

    let px = ram.u16(SUB + 0x02), py = ram.u16(SUB + 0x04);
    compared++;
    if (px !== s.spawn.x || py !== s.spawn.y) {
      divergent++; byType[s.type].divergent++;
      if (!firstDiv) firstDiv = { lf: s.spawn.lf, tag: 'SPAWN', handler: s.handler,
        px, py, bx: s.spawn.x, by: s.spawn.y };
    }

    // step i uses the PREVIOUS row's globals (W24 cadence).
    let prev = s.spawn;
    for (const row of s.rows) {
      if (skipType && s.type === parseInt(skipType, 16)) { prev = row; continue; }
      ram.setU16(0x8130d2, prev.freeze);
      ram.setU16(0x813172, prev.scroll);
      ram.setU16(0x80b03c, prev.b03c);
      if (driver === 'scroll') scrollCompensate(ram, REC);
      else if (driver === 'vel') applyVelocity(ram, tables, REC);
      else stepMovement(ram, rom, REC, tables, NOOP);
      px = ram.u16(SUB + 0x02); py = ram.u16(SUB + 0x04);
      compared++;
      if (px !== row.x || py !== row.y) {
        divergent++; byType[s.type].divergent++;
        if (!firstDiv) firstDiv = { lf: row.lf, tag: 'P', handler: s.handler,
          px, py, bx: row.x, by: row.y };
      }
      prev = row;
    }
  }

  const pct = (100 * (1 - divergent / Math.max(1, compared))).toFixed(4);
  console.log(`CORPUS ${path.basename(CORPUS)}`);
  console.log(`SIX HANDLERS -- ${arcs.length} spawn arcs (${skippedArcs} skipped: no stage-1 stream), ${compared} position samples`);
  console.log(`RESULT handler-position divergent: ${divergent} of ${compared} (${pct} % match)`
    + `${brk ? `  [break=${brk}${skipType ? ` type=$${skipType}` : ''}]` : ''}`);
  for (const t of Object.keys(byType).sort()) {
    const b = byType[t];
    console.log(`  type $${t}: ${b.spawn} enemies, ${b.rows} steps, ${b.divergent} divergent`);
  }
  if (firstDiv) {
    console.log(`  first divergence lf=${firstDiv.lf} ${firstDiv.tag} handler=$${firstDiv.handler.toString(16)}: `
      + `port=($${firstDiv.px.toString(16)},$${firstDiv.py.toString(16)}) `
      + `board=($${firstDiv.bx.toString(16)},$${firstDiv.by.toString(16)})`);
  } else if (compared > 0) {
    console.log(`  all six handler types' position tracks match the board at 0 divergent`);
  }
  console.log(`  src/movement.js sha256 ${sha.slice(0, 16)} (unchanged by --break: `
    + `the mutation is the gate's wrapper)`);

  if (brk) return divergent > 0 ? 0 : 1;     // RED: mutation MUST diverge
  return divergent === 0 ? 0 : 1;
}

process.exit(main());
