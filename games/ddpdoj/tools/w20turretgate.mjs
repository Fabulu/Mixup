#!/usr/bin/env node
// THE TURRET GATE -- wave 20.  The port's aim pair and turret block against the
// BOARD, angle for angle, frame for frame.
//
// The owner picked this test (`20-OWNER-scenarios-must-play.md` §3): the first
// enemies in stage 1 have turrets that track the ship continuously, so one run
// where the ship MOVES sweeps a large slice of the aim's input space, and a
// wrong table / quantisation / fixed-point convention shows up immediately
// instead of as a byte difference on frame 4,012.
//
// TWO COMPARISONS, KEPT SEPARATE, because they fail for different reasons:
//
//   ONE-STEP   for every (frame N, frame N+1) pair of the same record: feed the
//              BOARD's facing and cadence at N, plus the board's positions and
//              globals, and require the port to produce the board's facing at
//              N+1.  Isolates the aim, the muzzle offset, the target select and
//              the slew from any drift.
//   CLOSED-LOOP  seed the facing and the cadence ONCE, at the record's first
//              observed frame, then run the port's own state forward for the
//              record's whole life, taking only the position (produced by the
//              UNPORTED movement interpreter $2638A6) and the player position
//              from the board.  This is the one that catches a cadence that is
//              right on average and wrong in phase.
//
// WHERE THE SAMPLE POINT SITS IS MEASURED, NOT ASSUMED.  The board row is taken
// at the $803940 arm write; whether that instant precedes or follows the object
// driver inside the frame decides whether the inputs to the N->N+1 transition
// are row N's or row N+1's.  The gate evaluates BOTH and prints both, and the
// answer is the one that agrees on tens of thousands of rows -- a structural
// fact with a 6-bit output and 27,000 witnesses, not a fitted parameter.
//
//   node tools/w20turretgate.mjs
//   node tools/w20turretgate.mjs --corpus tools/oracle/out/w20-turret-invuln.tsv
//   node tools/w20turretgate.mjs --break no-slew
//
// MUTATIONS (every one must be SEEN RED; a check that cannot fail is the eighth
// defective check this project is looking for):
//   no-slew  no-muzzle  aim-every-frame  plain-atan2  no-p2-fallback
//   round-toward-zero  lut-generated  no-freeze-gate

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { AimTables } from '../src/aim.js';
import { TURRET, TURRET_HANDLERS, turretStep } from '../src/turret.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const ETAB = 0x81332c, ESTRIDE = 0x50;      // $263514 / $263568
const P1 = 0x8103e6, P2 = 0x810448;         // $24270A / $242710

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const MUTATIONS = ['no-slew', 'no-muzzle', 'aim-every-frame', 'plain-atan2',
  'no-p2-fallback', 'round-toward-zero', 'lut-generated', 'no-freeze-gate'];
let MUT = opt('--break', null);
if (MUT && MUT !== 'all' && !MUTATIONS.includes(MUT)) {
  console.error(`unknown mutation '${MUT}' -- have: ${MUTATIONS.join(' ')}`);
  process.exit(2);
}
// `--break all` re-runs the whole gate once per mutation, in one process, and
// FAILS if any of them leaves the result green. A mutation that stopped biting
// is exactly the "check that cannot fail" this project keeps finding.
if (MUT === 'all') {
  const self = fileURLToPath(import.meta.url);
  const { spawnSync } = await import('node:child_process');
  const rest = argv.filter((_, i) => argv[i] !== '--break' && argv[i - 1] !== '--break');
  let bad = 0;
  for (const m of MUTATIONS) {
    const r = spawnSync(process.execPath, [self, ...rest, '--break', m],
      { stdio: 'inherit' });
    if (r.status !== 0) { console.log(`FAIL mutation '${m}' did not go red`); bad++; }
  }
  console.log(bad === 0 ? `ALL ${MUTATIONS.length} MUTATIONS RED`
    : `${bad} MUTATION(S) NOT RED`);
  process.exit(bad === 0 ? 0 : 1);
}
const CORPUS = opt('--corpus',
  path.join(HERE, 'oracle', 'out', 'w20-turret-play.tsv'));

if (!fs.existsSync(TABLES)) {
  console.error(`MISSING ${TABLES} -- run: python tools/export-tables.py`);
  process.exit(2);
}
if (!fs.existsSync(CORPUS)) {
  console.error(`MISSING ${CORPUS} -- run: python tools/oracle/w20run.py 6000 `
    + `w20-turret-play`);
  process.exit(2);
}

const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
const rom = new RomWindows(tables.rom);
const aimT = new AimTables(rom);

// ---------------------------------------------------------------- the corpus
const H = (s) => parseInt(s, 16);
const frames = new Map();          // lf -> { g, rows: [] }
let eRows = 0, fRows = 0;
for (const line of fs.readFileSync(CORPUS, 'utf8').split('\n')) {
  if (!line) continue;
  const p = line.split('\t');
  const lf = Number(p[1]);
  if (p[0] === 'F') {
    fRows++;
    const f = frames.get(lf) ?? { rows: [] };
    f.g = { clk: H(p[2]), d0d2: H(p[3]), pal: H(p[4]), py: H(p[5]), px: H(p[6]),
            p2al: H(p[7]), p2y: H(p[8]), p2x: H(p[9]),
            nlive: Number(p[10]), nturret: Number(p[11]), lives: Number(p[12]),
            // $263502 clr.w $815E9C -- ONE per enemy-driver pass. See the Lua.
            drv: Number(p[13] ?? 1), drvBump: Number(p[14] ?? 0) };
    frames.set(lf, f);
  } else if (p[0] === 'E') {
    eRows++;
    const f = frames.get(lf) ?? { rows: [] };
    f.rows.push({
      slot: Number(p[10]), flags: H(p[11]), type: H(p[12]), targ: H(p[13]),
      hand: H(p[14]), facing: H(p[15]), cad: H(p[16]), rel: H(p[17]),
      gfx: H(p[18]), st20: H(p[19]), sub: H(p[20]), sy: H(p[21]), sx: H(p[22]),
      s0: H(p[23]), s1b: H(p[24]),
    });
    frames.set(lf, f);
  }
}
const lfs = [...frames.keys()].sort((a, b) => a - b);

// ------------------------------------------------------------------ the model
const ram = new Ram();       // ONE image, rewritten per row -- 128 KiB x 27,000
                             // allocations is the difference between 2 s and 4 min

/** Put the board's frame `g` and record `r` into the RAM image the port reads.
 *  Only the fields the ported code touches are written, and each one names the
 *  instruction that reads it, so a reader can check the seeding is not smuggling
 *  an answer in. */
function seed(g, r, facing, cad) {
  ram.setU16(P1, g.pal); ram.setU16(P1 + 2, g.py); ram.setU16(P1 + 4, g.px);
  ram.setU16(P2, g.p2al); ram.setU16(P2 + 2, g.p2y); ram.setU16(P2 + 4, g.p2x);
  ram.setU16(TURRET.freezeGate, g.d0d2);            // $268A0E tst.w $8130D2
  const a5 = ETAB + r.slot * ESTRIDE;
  ram.setU8(a5 + 0x03, r.targ);                     // $242716 tst.b ($3,A5)
  ram.setU8(a5 + TURRET.cadenceOff, cad);           // $268A1A
  ram.setU8(a5 + TURRET.reloadOff, r.rel);          // $268A20
  ram.setU8(a5 + TURRET.facingOff, facing);         // $268A38 / $268A42
  ram.setU32(a5 + TURRET.subOff, r.sub);            // $263524 movea.l ($6,A5),A6
  ram.setU32(a5 + TURRET.gfxOff, r.gfx);            // $268A54
  ram.setU16(r.sub + 2, r.sy); ram.setU16(r.sub + 4, r.sx);  // $268A26
  return a5;
}

const key = (r) => `${r.slot}:${r.sub.toString(16)}:${r.hand.toString(16)}`;
const isTurret = (r) => TURRET_HANDLERS.has(r.hand);
/** bit 7 of ($20,A5) -- the handler took the DEATH path ($2689C8 tst.b/bpl) and
 *  the turret block did not run at all.  Excluded, and counted. */
const dead = (r) => (r.st20 & 0x80) !== 0;

const stat = () => ({ n: 0, bad: 0, first: null, badCad: 0, badGfx: 0 });
const one = { a: stat(), b: stat() };     // hypothesis a = inputs from row N
const closed = stat();                    //             b = inputs from row N+1
let resyncs = 0, excludedDead = 0, excludedGap = 0, seeded = 0;
let excludedNoDriver = 0, aimedSteps = 0, multiPass = 0;
const octantsSeen = new Set();
const perType = new Map();
const facingsSeen = new Set(), dirsSeen = new Set();
const portState = new Map();

for (let i = 0; i + 1 < lfs.length; i++) {
  const lfA = lfs[i], lfB = lfs[i + 1];
  if (lfB !== lfA + 1) continue;                    // never bridge a gap
  const A = frames.get(lfA), B = frames.get(lfB);
  // THE ENEMY DRIVER DID NOT RUN between these two sample points -- measured,
  // not inferred, from the $263502 `clr.w $815E9C` write tap.  It happens in
  // the player-death / respawn window and it is why the first pass of this gate
  // reported 9,888 cadence divergences: the port was right and the board's
  // handler simply never executed.  Nothing in any enemy record changed, so the
  // closed-loop state carries over untouched and the pair is not compared.
  if (B.g.drv === 0) { excludedNoDriver += A.rows.filter(isTurret).length; continue; }
  if (B.g.drv > 1) multiPass++;
  const bByKey = new Map();
  for (const r of B.rows) bByKey.set(key(r), r);
  for (const rA of A.rows) {
    if (!isTurret(rA)) continue;
    const rB = bByKey.get(key(rA));
    if (!rB) { portState.delete(key(rA)); excludedGap++; continue; }
    if (dead(rA) || dead(rB)) {
      portState.delete(key(rA)); excludedDead++; continue;
    }
    const spec = TURRET_HANDLERS.get(rA.hand);
    facingsSeen.add(rA.facing);
    const t = perType.get(spec.type) ?? { n: 0, bad: 0 };
    perType.set(spec.type, t);

    // ---- ONE-STEP, both sample-point hypotheses
    for (const [name, g, r] of [['a', A.g, rA], ['b', B.g, rB]]) {
      const s = one[name];
      const a5 = seed(g, { ...rA, sy: r.sy, sx: r.sx }, rA.facing, rA.cad);
      const res = turretStep(aimT, ram, rom, a5, spec, MUT);
      if (res.dir >= 0) dirsSeen.add(res.dir);
      if (name === 'b' && res.aimed) {
        aimedSteps++;
        // the octant $24204C..$242068 builds, recomputed here purely so the
        // COVERAGE line has a denominator the recon can be compared against
        // (recon §7: 8 octants x 129 ratios = 1,032 internal states)
        const sy = (r.sy + spec.muzzleY) & 0xffff, sx = r.sx;
        let o = 8;
        let dx = (sx + 0x1800) & 0xffff, tx = (g.px + 0x1800) & 0xffff;
        let dy = (sy + 0x1800) & 0xffff, ty = (g.py + 0x1800) & 0xffff;
        let ax = dx < tx ? (tx - dx) : (dx - tx); if (dx < tx) o = 0;
        let ay = dy < ty ? (ty - dy) : (dy - ty); if (dy < ty) o += 4;
        if ((ax + (ax >> 1)) < ay) o += 2;
        octantsSeen.add(o);
      }
      const gotF = ram.u8(a5 + TURRET.facingOff);
      const gotC = ram.u8(a5 + TURRET.cadenceOff);
      const gotG = ram.u32(a5 + TURRET.gfxOff);
      s.n++;
      if (gotF !== rB.facing) {
        s.bad++;
        if (!s.first) {
          s.first = `lf${lfA}->${lfB} slot${rA.slot} type$${spec.type
            .toString(16)} facing ${rA.facing}->port ${gotF} board ${rB.facing}`
            + ` self=(${rA.sy.toString(16)},${rA.sx.toString(16)})`
            + ` player=(${g.py.toString(16)},${g.px.toString(16)})`
            + ` cad=${rA.cad} d0d2=${g.d0d2}`;
        }
      }
      if (gotC !== rB.cad) s.badCad++;
      if (gotG !== rB.gfx) s.badGfx++;
      if (name === 'b') { t.n++; if (gotF !== rB.facing) t.bad++; }
    }

    // ---- CLOSED LOOP.  Inputs are the POST-move position and the post-move
    // player position (hypothesis b, see the header); the facing and the
    // cadence are the PORT's own, carried forward from the record's first
    // observed frame.  That is the half that can drift.
    let st = portState.get(key(rA));
    if (!st) { st = { facing: rA.facing, cad: rA.cad }; seeded++; }
    const a5 = seed(B.g, { ...rA, sy: rB.sy, sx: rB.sx }, st.facing, st.cad);
    turretStep(aimT, ram, rom, a5, spec, MUT);
    const cf = ram.u8(a5 + TURRET.facingOff);
    const cc = ram.u8(a5 + TURRET.cadenceOff);
    closed.n++;
    if (cf !== rB.facing) {
      closed.bad++;
      if (!closed.first) {
        closed.first = `lf${lfA}->${lfB} slot${rA.slot} type$${spec.type
          .toString(16)} port ${cf} board ${rB.facing}`;
      }
      resyncs++;
      portState.set(key(rA), { facing: rB.facing, cad: rB.cad });  // re-seed
    } else {
      portState.set(key(rA), { facing: cf, cad: cc });
    }
  }
}

// ---------------------------------------------------------------- the verdict
const pct = (bad, n) => (n ? (100 * (n - bad) / n).toFixed(4) : '0.0000');
console.log(`CORPUS ${path.basename(CORPUS)}  frames=${lfs.length} `
  + `Frows=${fRows} Erows=${eRows}`);
console.log(`TABLES ${rom.byteCount} B of ROM windows; aim LUT64[10]=`
  + `${aimT.lut64[10]} base64=[${aimT.base64}] sub64=[${aimT.sub64.map(Number)}]`);
if (MUT) console.log(`MUTATION ${MUT}`);
for (const [name, s] of Object.entries(one)) {
  console.log(`ONE-STEP(${name}) pairs=${s.n} facing_divergent=${s.bad} `
    + `(${pct(s.bad, s.n)} %)  cadence_divergent=${s.badCad}  `
    + `gfx_divergent=${s.badGfx}`);
  if (s.first) console.log(`   first: ${s.first}`);
}
console.log(`CLOSED-LOOP steps=${closed.n} divergent=${closed.bad} `
  + `(${pct(closed.bad, closed.n)} %) seeded=${seeded} resyncs=${resyncs}`);
if (closed.first) console.log(`   first: ${closed.first}`);
console.log(`EXCLUDED death-path=${excludedDead} record-vanished=${excludedGap} `
  + `driver-did-not-run=${excludedNoDriver} (measured at $263502, not inferred)`);
console.log(`AIMED steps that actually reached $24200A = ${aimedSteps} of `
  + `${one.b.n} pairs; frames with >1 driver pass = ${multiPass}`);
for (const [ty, t] of [...perType].sort()) {
  console.log(`TYPE $${ty.toString(16).toUpperCase()} pairs=${t.n} divergent=${t.bad}`);
}
console.log(`COVERAGE distinct board facings=${facingsSeen.size}/64  `
  + `distinct aim outputs produced=${dirsSeen.size}/64  `
  + `octants=${[...octantsSeen].sort((a, b) => a - b).join(',')} `
  + `(${octantsSeen.size}/8)`);

// THE VERDICT IS TAKEN ON HYPOTHESIS b -- inputs from the row AFTER the
// transition.  That is not a fitted choice: $2688CC opens `jsr $2638A6` (the
// movement interpreter) and aims 260 bytes later, so the position the aim sees
// is the POST-move position of the same frame, which is the one the next sample
// point reports.  The gate evaluates both and prints both; hypothesis a is left
// in the output precisely so the difference stays visible.
const ok = one.b.n > 0 && one.b.bad === 0 && one.b.badCad === 0
  && one.b.badGfx === 0 && closed.bad === 0;
if (MUT) {
  console.log(ok ? `RESULT NOT RED -- mutation ${MUT} changed nothing. A check `
    + `that cannot fail is a defect.` : `RESULT RED under ${MUT} (as required)`);
  process.exit(ok ? 1 : 0);
}
console.log(ok ? `RESULT 0 DIVERGENT on facing, cadence and sprite over `
  + `${one.b.n} one-step pairs and ${closed.n} closed-loop steps`
  : `RESULT DIVERGENT`);
process.exit(ok ? 0 : 1);
