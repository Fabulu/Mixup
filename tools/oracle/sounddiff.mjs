// Diff the ported sound driver's NR write stream against the cartridge's.
//
// The recorder (tools/oracle/sound.py) hooks the real driver's store
// instructions, so both sides are "what this tick wrote". Registers are
// compared as a per-tick STATE, not as a write sequence: the two drivers may
// legitimately write the same register a different number of times inside one
// tick, and only the value the tick leaves behind is audible.
//
//   node tools/oracle/sounddiff.mjs --id 2
//   node tools/oracle/sounddiff.mjs --id 2 --show 24
//   node tools/oracle/sounddiff.mjs --file rip/oracle/sound_U10.json
//   node tools/oracle/sounddiff.mjs --all      # every recording in rip/oracle

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();
const { loadSoundData, createDriver, request, tick } = await imp('src/sound/driver.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const id = parseInt(arg('id', '2'), 0);
const mask = parseInt(arg('mask', '3'), 0);
const show = parseInt(arg('show', '0'), 10);

// The registers that decide what you hear. NR51 IS compared: it is rebuilt
// from scratch every tick out of each owning track's +$1A, so it moves with
// the PAN opcodes and is worth pinning. NR50 is in too -- constant $77 unless
// a fade is running, which is exactly why a stray write to it should fail.
// Only NR52 is excluded: it is written once at init and its low bits are
// read-only channel status, so comparing it proves nothing.
const WATCH = [
  ['ch1', [0xFF11, 0xFF12, 0xFF13, 0xFF14]],
  ['ch2', [0xFF16, 0xFF17, 0xFF18, 0xFF19]],
  ['ch3', [0xFF1A, 0xFF1C, 0xFF1D, 0xFF1E]],
  ['ch4', [0xFF21, 0xFF22, 0xFF23]],
  ['mix', [0xFF24, 0xFF25]],
];
const ALL = WATCH.flatMap(([, r]) => r);

// --file names a recording made with a different prefix, e.g. the `--under`
// runs that record an SFX pre-empting live music. --all sweeps every recording
// in rip/oracle instead, which is the whole-corpus gate.
const all = argv.includes('--all');
const recPath = (n) => path.join(ROOT, `rip/oracle/sound_${n}.json`);

const data = await loadSoundData();

/**
 * Seed the port from the cartridge's own $C800-$C94C at the instant the song
 * starts, when the recording carries it.
 *
 * sub_07_40B8 clears only part of a track record, so a song inherits the
 * previous one's gate, duty, pan, wave pointer, envelope pointers AND its
 * frequency word. Song $00's first event is a REST, which retriggers without
 * writing a pitch -- so its very first tick goes out at the frequency the
 * PREVIOUS song left behind, and no amount of correct sequence decoding can
 * produce that from a cold start. Seeding makes the diff a test of the driver
 * instead of a test of the recorder's boot history; it is also the only direct
 * proof that the port's record layout matches the cartridge's.
 */
function seed(drv, ram) {
  const w = (i) => ram[i] | (ram[i + 1] << 8);          // little-endian pair
  const wBE = (i) => (ram[i] << 8) | ram[i + 1];        // active env pointers
  for (let c = 0; c < 4; c++) drv.owner[c] = ram[c];
  drv.nr51Mask = ram[0x06];
  drv.fadeCount = ram[0x07];
  drv.fadeIn = ram[0x08];
  drv.fadeOut = ram[0x09];
  drv.chmask = ram[0x0A];
  drv.autoNote = ram[0x0B];
  drv.autoDur = ram[0x0C];
  drv.autoNoise = ram[0x0D];
  drv.autoNoiseDur = ram[0x0E];
  for (let i = 0; i < 6; i++) drv.slides[i] = [ram[0x0F + i * 3], ram[0x10 + i * 3], ram[0x11 + i * 3]];
  for (let i = 0; i < 4; i++) drv.drums[i] = [ram[0x21 + i * 3], ram[0x22 + i * 3], ram[0x23 + i * 3]];
  for (let s = 0; s < 8; s++) {
    const b = 0x2D + s * 0x24;
    Object.assign(drv.tracks[s], {
      flags: ram[b], chan: ram[b + 1], ptr: w(b + 2), fixdur: ram[b + 4],
      dur: ram[b + 5], gateLimit: ram[b + 6], gate: ram[b + 7],
      transpose: ram[b + 8], detune: ram[b + 9],
      freqHi: ram[b + 0x0A], freqLo: ram[b + 0x0B],
      penvDelay: ram[b + 0x0C], penvCount: ram[b + 0x0D],
      penvPtr: wBE(b + 0x0E), penvBase: w(b + 0x10),
      nrx2: ram[b + 0x12], venvCount: ram[b + 0x13],
      venvPtr: wBE(b + 0x14), venvBase: w(b + 0x16),
      nrx1: ram[b + 0x18], bend: ram[b + 0x19], pan: ram[b + 0x1A],
      wavePtr: w(b + 0x1B), relEnv: w(b + 0x1D), relNib: ram[b + 0x1F],
      ret: w(b + 0x20), loopA: ram[b + 0x22], loopB: ram[b + 0x23],
    });
  }
  drv.booted = true;      // the cartridge's $4000 init happened long ago
}

/** Fold a tick's writes into a register snapshot. */
function applyInto(state, writes) {
  for (const [a, v] of writes) state[a] = v;
  return state;
}

/**
 * Replay one recording. Registers are compared as a per-tick STATE, not as a
 * write sequence: the two drivers may legitimately write the same register a
 * different number of times inside one tick, and only the value the tick
 * leaves behind is audible.
 */
function compare(file, rows) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const useId = rec.id ?? 0;
  const useMask = rec.mask ?? mask;
  const drv = createDriver(data);
  if (rec.ram && rec.ramBase === 0xC800) seed(drv, rec.ram);
  request(drv, useId, useMask);

  const oracle = {};
  const port = {};
  const bad = new Map();          // register -> first differing tick
  let firstBad = null;
  const n = rec.ticks.length;

  for (let i = 0; i < n; i++) {
    applyInto(oracle, rec.ticks[i]);
    applyInto(port, tick(drv));
    for (const r of ALL) {
      if ((oracle[r] ?? 0) === (port[r] ?? 0)) continue;
      if (!bad.has(r)) bad.set(r, { tick: i, oracle: oracle[r], port: port[r] });
      if (firstBad === null) firstBad = i;
    }
    if (rows && i < rows) {
      const row = ALL.map((r) => {
        const o = oracle[r] ?? 0, p = port[r] ?? 0;
        const s = o === p ? o.toString(16).padStart(2, '0')
          : `${o.toString(16).padStart(2, '0')}/${p.toString(16).padStart(2, '0')}`;
        return s.padStart(6);
      }).join('');
      console.log(String(i).padStart(3) + row);
    }
  }
  if (rows) console.log('    ' + ALL.map((r) => ('$' + r.toString(16)).padStart(6)).join(''));
  return { id: useId, n, bad, firstBad };
}

function report(r) {
  console.log(`\nsong $${r.id.toString(16)}: ${r.n} ticks compared`);
  for (const [name, regs] of WATCH) {
    const broke = regs.filter((reg) => r.bad.has(reg));
    console.log(`  ${name}: ${broke.length ? 'DIFF at ' + broke.map((reg) => {
      const b = r.bad.get(reg);
      return `$${reg.toString(16)} t${b.tick} (${b.oracle}!=${b.port})`;
    }).join(', ') : 'match'}`);
  }
  console.log(r.firstBad === null
    ? '\nMATCH - the ported driver reproduces the cartridge'
    : `\nfirst divergence at tick ${r.firstBad} of ${r.n}`);
}

if (all) {
  const dir = path.join(ROOT, 'rip/oracle');
  const files = fs.readdirSync(dir).filter((f) => /^sound_.*\.json$/.test(f)).sort();
  if (!files.length) {
    console.error('no recordings in rip/oracle -- run tools/oracle/sound.py first');
    process.exit(2);
  }
  let failed = 0;
  let ticks = 0;
  for (const f of files) {
    const r = compare(path.join(dir, f), 0);
    ticks += r.n;
    const ok = r.firstBad === null;
    if (!ok) failed++;
    console.log(`  ${ok ? 'MATCH' : 'DIFF '}  ${f.padEnd(18)} ${String(r.n).padStart(5)} ticks` +
      (ok ? '' : `  first at t${r.firstBad}: ` +
        [...r.bad].map(([reg, b]) => `$${reg.toString(16)}(${b.oracle}!=${b.port})`).join(' ')));
  }
  console.log(`\n${files.length - failed}/${files.length} recordings match, ${ticks} ticks compared`);
  process.exit(failed ? 1 : 0);
}

const named = arg('file', null);
const file = named ? path.join(ROOT, named)
  : recPath(id.toString(16).padStart(2, '0').toUpperCase());
if (!fs.existsSync(file)) {
  console.error(`no recording at ${file}\n  run: python tools/oracle/sound.py --id ${id} --mask ${mask}`);
  process.exit(2);
}
const result = compare(file, show);
report(result);
process.exit(result.firstBad === null ? 0 : 1);
