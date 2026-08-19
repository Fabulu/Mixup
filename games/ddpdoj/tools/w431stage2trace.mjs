#!/usr/bin/env node
// WAVE 431 -- THE STATE TRACE FOR A STAGE-2 RUNG.
//
//   node games/ddpdoj/tools/w431stage2trace.mjs --lf 17900 [--frames 400]
//        [--manifest DIR/manifest.json] [--every 25] [--hyper] [--input HEX]
//
// WHY THIS EXISTS.  W431's brief asserted `tools/oracle/out` holds no stage-2
// rung.  It holds 92 of them, in the ladder the brief itself names.  A green
// `seedcmp` segment proves the port and the board AGREE; it does not prove the
// state is INTERESTING.  This prints what a rung actually contains and whether
// it MOVES: the stage word, live enemy records by type, the pool-A dispatch
// index census, pool-B/C/D occupancy and the boss record's own HP.  A stall
// shows up as a flat state vector, which is the failure mode the brief names.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { readTrace } from './portdiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const A = {
  lf: null, frames: 400, every: 25, hyper: false, input: null, sweep: false,
  script: null,
  stage: null,
  manifest: path.join(HERE, 'oracle/out/w69/stage1-laser-hold/manifest.json'),
  tables: path.join(HERE, '../rip/port/player.tables.json'),
};
for (let i = 2; i < process.argv.length; i++) {
  const v = () => process.argv[++i];
  switch (process.argv[i]) {
    case '--lf': A.lf = +v(); break;
    case '--frames': A.frames = +v(); break;
    case '--every': A.every = +v(); break;
    case '--manifest': A.manifest = v(); break;
    case '--tables': A.tables = v(); break;
    case '--hyper': A.hyper = true; break;
    // `--script "lf=FFCB;lf=FFDB"` -- a SYNTHETIC input word from the given
    // logic frame on.  The board's own `portin` is used until the first entry,
    // and any frame this overrides is a frame the comparison no longer owns:
    // the run stops being a reproduction and becomes a bench.  Labelled on
    // every run that uses it, for docs/knowledge/09's reason.
    case '--script': A.script = v(); break;
    case '--sweep': A.sweep = true; break;
    case '--stage': A.stage = +v(); break;
    case '--input': A.input = parseInt(v(), 16); break;
    default: throw new Error(`unknown argument ${process.argv[i]}`);
  }
}

// ---- the addresses, every one cited on its use
const G = { stage: 0x813092, distClock: 0x8130ce };
const ENEMY = { table: 0x81332c, slots: 58, stride: 0x50, type: 0x0c };
const PA = { base: 0x8171be, stride: 0x2c, slots: 80 };
const PB = { base: 0x81b732, stride: 0x38, slots: 80 };
const PC = { base: 0x81cdee, stride: 0x30, slots: 30 };
const PD = { base: 0x81c8ec, stride: 0x40, slots: 20 };
const BOSS_TYPE = 0x30;         // $297120 -- THE STAGE-2 BOSS, W183
const SAT_TYPE = 0x4d;          // $29BB26 -- its satellite, W185
const HYPER_P1 = 0x81b63e;      // $27FBA2 tst.w -- hyper-active gate
const RANK_P1 = 0x81b64a;       // $27FBDE add.w D0 -- hyper earn accumulator

function census(ram) {
  const c = {
    stage: ram.u16(G.stage), dist: ram.u16(G.distClock),
    types: new Map(), enemy: 0, boss: 0, sat: 0, bossHp: null, bossDead: null,
    bossMain: null,
    px: ram.u16(0x8103ea), py: ram.u16(0x8103e8),
    paKinds: new Map(), pa: 0, pb: 0, pc: 0, pd: 0,
  };
  for (let i = 0; i < ENEMY.slots; i++) {
    const r = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(r) === 0) continue;
    c.enemy++;
    const t = ram.u8(r + ENEMY.type);
    c.types.set(t, (c.types.get(t) ?? 0) + 1);
    if (t === BOSS_TYPE) {
      c.boss++;
      // THE HP IS ON THE SUB-RECORD, NOT THE ENEMY RECORD.  `$263524 movea.l
      // ($6,A5),A6` is the indirection, and boss2.js's PARTS table gives the
      // four part HP words as A6 displacements $58/$78/$98/$B8 -- all past the
      // $50-byte enemy stride, which is how you know they cannot be on A5.
      const sub = ram.u32(r + 0x06);
      c.bossHp = [0x58, 0x78, 0x98, 0xb8].map((o) => ram.u16(sub + o));
      c.bossDead = [0x5f, 0x7f, 0x9f, 0xbf].map((o) => ram.u8(sub + o));
      // AND THE ONE THAT ACTUALLY MOVES.  W431 read the four PART words first
      // and concluded the boss took no damage; it is `($16,A5)` -- a LONGWORD on
      // the enemy record, `$298332 move.l ($16,A5)` -- that the body's own
      // hitbox drains, and on the stage1-laser-hold ladder it falls 179,648 ->
      // 142,598 over lf18000..lf19500 while all four part words hold at $5000.
      // A stall check that omits it reports a live boss fight as flat.
      c.bossMain = ram.u32(r + 0x16);
    }
    if (t === SAT_TYPE) c.sat++;
  }
  for (let i = 0; i < PA.slots; i++) {
    const v = ram.u16(PA.base + i * PA.stride);
    if (v === 0) continue;
    c.pa++;
    const k = (v & 0x7c) >> 2;      // $27F97E andi.w #$7C / $27F980, the index
    c.paKinds.set(k, (c.paKinds.get(k) ?? 0) + 1);
  }
  for (let i = 0; i < PB.slots; i++) if (ram.u16(PB.base + i * PB.stride)) c.pb++;
  for (let i = 0; i < PC.slots; i++) if (ram.u16(PC.base + i * PC.stride)) c.pc++;
  for (let i = 0; i < PD.slots; i++) if (ram.u16(PD.base + i * PD.stride)) c.pd++;
  return c;
}

// `portWordFromBits` in src/input.js: a pressed BIT b clears port bit (b+1)&15
// of an all-ones word, so D+B1 = $FFDB (the ladder's own constant) and
// D+R+B1 = $FFCB.  Written here as hex so nothing has to be re-derived.
const SCRIPT = A.script
  ? A.script.split(';').filter(Boolean).map((kv) => {
    const [lf, w] = kv.split('=');
    return [Number(lf), parseInt(w, 16)];
  }).sort((a, b) => a[0] - b[0])
  : [];
function scriptWord(lf) {
  let w = null;
  for (const [at, v] of SCRIPT) { if (lf >= at) w = v; else break; }
  return w;
}

const fmtK = (m) => [...m.entries()].sort((a, b) => a[0] - b[0])
  .map(([k, v]) => `k${k}:${v}`).join(',') || '-';

const man = JSON.parse(fs.readFileSync(A.manifest, 'utf8'));
const dir = path.dirname(A.manifest);

// ------------------------------------------------------------------ sweep mode
// EVERY RUNG, SEEDED AND STEPPED.  A rung census alone samples the pool every
// 100 frames and a pool-A record that lives for twenty frames is invisible to
// it -- which is exactly the shape of kinds 3 and 4, both allocated on a DEATH
// TAIL and freed shortly after.  This runs the frames BETWEEN the rungs, so a
// kind that is ever allocated anywhere on the route is seen.
if (A.sweep) {
  const tables0 = JSON.parse(fs.readFileSync(A.tables, 'utf8'));
  const trace0 = readTrace(path.join(dir, man.trace));
  const pokes0 = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));
  const everKinds = new Map(), everTypes = new Set();
  let rungsRun = 0, framesRun = 0, blockedN = 0, stalled = 0;
  for (const rg of man.rungs) {
    const s0 = new Uint8Array(fs.readFileSync(path.join(dir, man.dir, rg.ram)));
    const st = (s0[0x13092] << 8) | s0[0x13093];       // $813092 - $800000
    if (A.stage !== null && st !== A.stage) continue;
    const bp = path.join(dir, man.dir, rg.bg);
    let bg;
    if (fs.existsSync(bp)) {
      const b = new Uint8Array(fs.readFileSync(bp));
      bg = Array.from({ length: b.length >> 1 }, (_, i) => (b[i * 2] << 8) | b[i * 2 + 1]);
    }
    const g = new Game(s0, tables0, { logicFrame: rg.lf, videoFrame: rg.vf, bgSeed: bg });
    const local = new Map(); const dg = new Set();
    let n = 0, blk = null;
    for (let lf = rg.lf + 1; lf <= rg.lf + A.frames; lf++) {
      const r0 = trace0.byLf.get(lf);
      if (!r0) break;
      for (const [a, v] of pokes0) g.ram.setU8(a, v);
      try { g.step(Number(r0.portin)); } catch (e) {
        if (e.name !== 'Unreached') throw e;
        blk = { lf, addr: e.romAddress, message: e.message }; break;
      }
      n++;
      const c = census(g.ram);
      for (const [k, v] of c.paKinds) {
        local.set(k, (local.get(k) ?? 0) + v);
        everKinds.set(k, (everKinds.get(k) ?? 0) + v);
      }
      for (const t of c.types.keys()) everTypes.add(t);
        dg.add(`${c.enemy}/${c.pa}/${c.pb}/${c.pc}/${c.pd}/${c.dist}/${c.px}/`
        + `${c.py}/${c.bossMain}/${c.bossHp}`);
    }
    rungsRun++; framesRun += n;
    if (blk) blockedN++;
    if (dg.size <= 1) stalled++;
    console.log(`lf${String(rg.lf).padEnd(6)} st${st} ${String(n).padStart(3)}f `
      + `${String(dg.size).padStart(3)} distinct  A ${fmtK(local).padEnd(30)}`
      + (blk ? `  BLOCKED $${blk.addr?.toString(16).toUpperCase()} @lf${blk.lf}` : ''));
  }
  console.log(`
SWEEP ${rungsRun} rungs, ${framesRun} logic frames stepped, `
    + `${blockedN} blocked, ${stalled} STALLED (<=1 distinct state vector)`);
  console.log(`POOL-A DISPATCH INDICES EVER LIVE: ${fmtK(everKinds)}`);
  console.log(`ENEMY TYPES EVER LIVE: ${[...everTypes].sort((a, b) => a - b)
    .map((t) => `$${t.toString(16).toUpperCase()}`).join(' ')}`);
  process.exit(0);
}

const rung = man.rungs.find((r) => r.lf === A.lf);
if (!rung) {
  throw new Error(`no rung at lf${A.lf}; the ladder has lf`
    + man.rungs.map((r) => r.lf).join(','));
}
const seed = new Uint8Array(fs.readFileSync(path.join(dir, man.dir, rung.ram)));
const bgPath = path.join(dir, man.dir, rung.bg);
let bgSeed;
if (fs.existsSync(bgPath)) {
  const b = new Uint8Array(fs.readFileSync(bgPath));
  bgSeed = Array.from({ length: b.length >> 1 }, (_, i) => (b[i * 2] << 8) | b[i * 2 + 1]);
}
const tables = JSON.parse(fs.readFileSync(A.tables, 'utf8'));
const trace = readTrace(path.join(dir, man.trace));

const game = new Game(seed, tables, { logicFrame: A.lf, videoFrame: rung.vf, bgSeed });
// THE LADDER'S OWN INTERVENTION, carried out of the manifest rather than
// reinvented -- portdiff.mjs applies it at exactly this point in the frame.
const pokes = (man.poke || '').split(',').filter(Boolean)
  .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));
if (A.hyper) {
  // D56's hard requirement: the bench must HAVE a hyper.  This is a SEEDED
  // intervention and is labelled as one on every run that uses it.
  game.ram.setU16(RANK_P1, 0xffff);
  game.ram.setU16(HYPER_P1, 1);
}

console.log(`RUNG lf${A.lf} vf${rung.vf}  ${rung.ram}  ladder ${man.scenario}`);
console.log(`INTERVENTION ${man.intervention || '(none)'}`);
if (SCRIPT.length) {
  console.log(`W431 SYNTHETIC INPUT: ${SCRIPT.map(([l, w]) =>
    `lf${l}=$${w.toString(16).toUpperCase()}`).join(' ')} -- LABELLED. From the `
    + 'first entry on this run is a BENCH, not a reproduction of the board.');
}
if (A.hyper) {
  console.log('W431 HYPER FORCED: $81B64A=$FFFF, $81B63E=1 -- LABELLED. '
    + 'This is a seeded bench, not a picture of play.');
}
console.log('lf      stage dist  enemy boss sat bossHp(4 parts)     A   Akinds                 '
  + 'B  C  D   px    py    bossMain($16,A5)');

function row(lf, c) {
  console.log(`${String(lf).padEnd(7)} ${String(c.stage).padEnd(5)} ${String(c.dist).padEnd(5)} `
    + `${String(c.enemy).padEnd(5)} ${String(c.boss).padEnd(4)} ${String(c.sat).padEnd(3)} `
    + `${(c.bossHp === null ? '-' : c.bossHp.map((h) => h.toString(16).toUpperCase()).join('/')).padEnd(19)} `
    + `${String(c.pa).padEnd(3)} ${fmtK(c.paKinds).padEnd(22)} ${String(c.pb).padEnd(2)} `
    + `${String(c.pc).padEnd(2)} ${String(c.pd).padEnd(3)} `
    + `$${c.px.toString(16).toUpperCase().padEnd(5)} $${c.py.toString(16).toUpperCase().padEnd(5)} `
    + `${c.bossMain === null ? '-' : c.bossMain}`);
}

const first = census(game.ram);
row(A.lf, first);
const seen = new Map(), typesEver = new Set();
for (const [k, v] of first.paKinds) seen.set(k, (seen.get(k) ?? 0) + v);
for (const t of first.types.keys()) typesEver.add(t);

let blocked = null, stepped = 0;
const digest = [];
for (let lf = A.lf + 1; lf <= A.lf + A.frames; lf++) {
  const r = trace.byLf.get(lf);
  if (!r) break;
  for (const [a, v] of pokes) game.ram.setU8(a, v);
  try {
    game.step(scriptWord(lf) ?? A.input ?? Number(r.portin));
  } catch (e) {
    if (e.name !== 'Unreached') throw e;
    blocked = { lf, addr: e.romAddress, message: e.message };
    break;
  }
  stepped++;
  const c = census(game.ram);
  for (const [k, v] of c.paKinds) seen.set(k, (seen.get(k) ?? 0) + v);
  for (const t of c.types.keys()) typesEver.add(t);
  digest.push(`${c.enemy}/${c.pa}/${c.pb}/${c.pc}/${c.pd}/${c.bossHp}/${c.dist}/`
    + `${c.px}/${c.py}/${c.bossMain}`);
  if (lf % A.every === 0) row(lf, c);
}

console.log(`\nSTEPPED ${stepped} of ${A.frames} logic frames`
  + (blocked
    ? `  BLOCKED at lf${blocked.lf} $${blocked.addr?.toString(16).toUpperCase()}: `
      + blocked.message.slice(0, 200)
    : ''));
// THE ANTI-STALL CHECK.  A rung that boots and does nothing is worse than no
// rung, because the next wave will trust it.
const distinct = new Set(digest).size;
console.log(`STATE VECTORS ${distinct} distinct of ${digest.length} frames -- `
  + `${distinct <= 1 ? 'STALLED' : 'ADVANCING'}`);
console.log(`ENEMY TYPES EVER LIVE: ${[...typesEver].sort((a, b) => a - b)
  .map((t) => `$${t.toString(16).toUpperCase()}`).join(' ')}`);
console.log(`POOL-A DISPATCH INDICES EVER LIVE: ${fmtK(seen)}`);
console.log(`beamHitsA=${game.beamHitsA} beamHitsB=${game.beamHitsB} `
  + `beamErased=${game.beamErased} beamDamageFrames=${game.beamDamageFrames}`);
