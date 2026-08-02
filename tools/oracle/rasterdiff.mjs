// The $0857 STAT program, port vs cartridge, PER SCANLINE.
//
//   node tools/oracle/rasterdiff.mjs                    # everything
//   node tools/oracle/rasterdiff.mjs --only l9-parallax-sky
//   node tools/oracle/rasterdiff.mjs --only l1-water-band --show 4
//
// Why per scanline and not per frame: a raster effect has no frame-level
// value.  Two of these scenarios differ from a correct port by ~10 pixels of
// SCX on 16 of 144 lines -- a whole-frame screenshot has twice called that
// "identical".  So both sides emit 144 rows of (SCX, SCY, BGP, OBP0, OBP1) and
// every row is compared.
//
// The oracle side is a MEASURED register stream, not a band list: rastertrace
// hooks each STAT arm's last instruction and reads rLY there, so the line a
// band starts on comes from the machine.  Expanding it here is just
// "carry each value forward until the next event".
//
// Rules inherited from regress.mjs / objregress.mjs:
//   * `warp` places the player, applied after frame 1 in both harnesses -- so
//     a warped scenario skips frame 1, whose SECOND HALF is already post-warp
//     on the cartridge (the warp lands mid-display-frame) while the port's is
//     not. Same one-frame harness skew regress.mjs calls `skipFrames`.
//   * lag frames ($C757) and FEEDER ORDERING FLIPS are both counted and
//     printed, and both are instruction-level timing (section 28). They are
//     reported as CONTEXT rather than as automatic failures: the pass/fail
//     here is the scanline diff itself, and a scenario that survives a lag
//     frame is stronger evidence, not weaker. Where a flip does move a
//     register -- it does on levels 9/10/11 -- the cap sits below it, and the
//     scenario comment says so.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './_env.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const show = parseInt(arg('show', '0'), 10);

const REG = ['scx', 'scy', 'bgp', 'obp0', 'obp1'];

const SCENARIOS = [
  // --- mode 2/3/4: the levels 9/10/11 parallax sky -------------------------
  // $0E8A arms it for $FFB0 in {9, $0A, $0B} and nowhere else. Three fires a
  // frame at lines 0 / $30 / $40 -- MEASURED, and fixed, so the whole effect is
  // which scroll each band carries. Level 9 is already bit-exact for 620 frames
  // in regress.mjs, so a divergence here is the raster program's.
  //
  // Capped at 100 because the `layers` feeder flips at f101 (measured): from
  // there the line-0 band starts reading the PREVIOUS iteration's $C742
  // instead of the next one's, and no port can predict which side of that
  // race a frame lands on. 300 frames were run to find it.
  { name: 'l9-parallax-sky', level: 9, frames: 100, script: '100:' },

  // The same chain with the camera MOVING, which is the case that separates
  // band 3 ("SCX = $FFA9") from the two free-running layers. Same f101 cap;
  // the camera race would arrive at f115 anyway.
  { name: 'l9-parallax-walk', level: 9, frames: 100, script: '20:,80:R' },

  // Levels 10 and 11 run the identical arm off a different camera clamp, a
  // different $FFAA and a different $FFB1 boot phase ($53, not $6D), so they
  // re-prove the port is reading the level's own scroll. Level 11 is also
  // Boss 3, whose camera Y is the one src/camera.js has a measured special
  // case for. Feeder flips measured at f89 and f97.
  { name: 'l10-parallax-sky', level: 10, frames: 88, script: '88:' },
  { name: 'l11-parallax-sky', level: 11, frames: 96, script: '96:' },

  // --- mode 6: the levels 1/2 water band ------------------------------------
  // $0EC3 arms it for levels 1 and 2 with rLYC = $80. The chain fires every
  // FOUR lines from the water-surface line $C755 down to $8F, adds the
  // 0:$09A2 sine to $FFA9 and forces OBP1 = $80 / OBP0 = $90 -- so a sprite
  // below the waterline is drawn through a different palette, which is the
  // half of the effect that is visible unconditionally.
  //
  // Column 60 rather than 74: at 74 the rising water lands its $2E8D hit and
  // the knockback moves the camera, and a moving camera is a CAMERA RACE (see
  // below) from f145 on. At column 60 the camera never moves for 600 frames
  // and the surface still sweeps from off-screen ($C755 = $90) to line 0, so
  // the band count runs the whole 0..36 range. Both lag frames (f2, f227,
  // f458) are inside the window and the scenario is bit-exact through them.
  // Capped at 450: at f457 the level ENDS ($FFA9/$FFAA and rBGP all drop to
  // 0 and the STAT chain stops firing -- the rising water finally kills him),
  // and comparing a raster program against a screen that is being faded out
  // proves nothing. 600 frames were run to find that edge.
  { name: 'l1-water-band', level: 1, frames: 450, warp: '60,28', script: '450:' },

  // A second column, so the chain is proved against a different $FFA9 and a
  // different surface schedule rather than one lucky placement.
  { name: 'l1-water-band-col50', level: 1, frames: 400, warp: '50,28',
    script: '400:' },

  // Level 2 re-proves the arm with no warp at all, off a different map, a
  // different camera and the $53 boot phase.
  // skip: 1 for a MEASURED reason, not a convenience. On frame 1 the surface
  // leaves the screen mid-chain: the first 15 bands fire normally and the one
  // at line 60 reads $C755 = $90 -- iteration 2's value, written while the
  // beam was between line 56 and line 60 -- and takes $08FE's disable path,
  // so the bottom 84 lines keep the plain camera. The port renders one
  // coherent frame per tick and cannot know iteration 2's surface, same class
  // as the camera race. Every frame after that is bit-exact, including 398
  // frames of the $C755 >= $90 "no wobble at all" path.
  { name: 'l2-water-band', level: 2, frames: 400, script: '400:', skip: 1 },

  // --- mode 0/1: the level-6 $FFCC track parallax ---------------------------
  // $0F11, and level 6 only. Two arms alternating on rLYC $70 and $22 -- so
  // exactly TWO fires a frame, measured. Lines $22-$6F take $FFCC
  // (loc_00_2EF4's derived scroll, the same track the type-$0B conveyor deck
  // rides) and $FFAA-2; lines $70+ and 0-$21 take the plain camera. The -2 is
  // gated on $FFB1 & 7 == 0, so it is a one-frame-in-eight judder rather than
  // a standing offset.
  { name: 'l6-track-parallax', level: 6, frames: 400, script: '400:' },
  //
  // The walking variant matters because it is the only scenario in which the
  // band's SCX actually MOVES: $FFCC is loc_00_2EF4 chasing the player's
  // column, so walking is what makes the middle third of the screen scroll at
  // a different rate from the rest.
  { name: 'l6-track-parallax-walk', level: 6, frames: 300, script: '20:,280:R' },
];

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

/** Expand the measured event stream of one frame into 144 register rows. */
function expand(frame) {
  const cur = { scx: frame.base.scx, scy: frame.base.scy, bgp: frame.base.bgp,
                obp0: frame.base.obp0, obp1: frame.base.obp1 };
  const evs = frame.bands.slice().sort((a, b) => a.ly - b.ly);
  const rows = [];
  let i = 0;
  for (let y = 0; y < 144; y++) {
    while (i < evs.length && evs[i].ly <= y) {
      const e = evs[i++];
      cur.scx = e.scx; cur.scy = e.scy; cur.bgp = e.bgp;
      cur.obp0 = e.obp0; cur.obp1 = e.obp1;
    }
    rows.push([cur.scx, cur.scy, cur.bgp, cur.obp0, cur.obp1]);
  }
  return rows;
}

const rows = [];
for (const s of SCENARIOS) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const common = ['--frames', String(s.frames), '--script', s.script,
                  '--level', String(s.level)];
  if (s.warp) common.push('--warp', s.warp);

  run('python', ['tools/oracle/rastertrace.py', ...common]);
  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, `rip/oracle/raster_L${String(s.level).padStart(2, '0')}.json`),
    'utf8')).frames;

  run('node', ['tools/oracle/rasterport.mjs', ...common]);
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/port/raster.json'),
                                       'utf8')).frames;

  const skip = s.skip ?? (s.warp ? 1 : 0);   // see the `warp` note at the top
  const n = Math.min(o.length, p.length);
  const bad = [];          // one entry per register: the FIRST bad (frame,line)
  const seen = new Set();
  let badLines = 0;
  for (let i = skip; i < n; i++) {
    const oo = expand(o[i]);
    const pp = p[i].lines;
    for (let y = 0; y < 144; y++) {
      let lineBad = false;
      for (let r = 0; r < REG.length; r++) {
        if (oo[y][r] === pp[y][r]) continue;
        lineBad = true;
        if (!seen.has(REG[r])) {
          seen.add(REG[r]);
          bad.push({ reg: REG[r], frame: i + 1, line: y,
                     oracle: oo[y][r], port: pp[y][r],
                     ctx: o[i].in });
        }
      }
      if (lineBad) badLines++;
    }
  }

  // The FEEDER RACE, measured. The main loop body runs during the visible part
  // of the frame it is scrolling, so whether $058B / $2F5C / $2E65 beats the
  // band that reads it is a question of how far the CPU got before that
  // scanline -- instruction-level timing, out of scope by section 28. The
  // usual reading is stable for a hundred frames or so and then flips for a
  // stretch, so a scenario is capped below its first flip exactly as it is
  // capped below the first lag frame.
  const flips = [];
  const firstOrder = {};
  for (const f of o.slice(0, n)) {
    for (const [tag, idx] of Object.entries(f.feedFirst || {})) {
      if (!(tag in firstOrder)) { firstOrder[tag] = idx; continue; }
      if (firstOrder[tag] !== idx) flips.push(`${tag}@f${f.f}`);
    }
  }

  // The CAMERA RACE, and it is the same shape as the feeder race but bigger.
  // Every arm that scrolls relative to the camera reads $FFA9/$FFAA AT THE
  // SCANLINE, and the camera routine ($05B7) has already run for the NEXT
  // iteration by then. So on a frame where the camera moves, the cartridge
  // draws lines 0..(first band) with iteration N's scroll and everything below
  // with iteration N+1's -- one picture built from two frames. Measured on
  // level 1: at f145 the VBlank base is $FFA9 = 88 and all twelve water bands
  // read 89, which is f146's value.
  //
  // A port that renders one coherent frame per tick cannot reproduce that
  // without lagging the whole picture by a frame, which would be wrong for
  // sprites, the window and the HUD. It is the same class as the lag frame:
  // instruction-level timing, section 28. So it is measured, listed, and the
  // scenarios are capped below the first occurrence.
  const camRace = o.slice(0, n)
    .filter((f) => f.bands.some((b) => b.ffa9 !== f.in.ffa9 || b.ffaa !== f.in.ffaa))
    .map((f) => f.f)
    .filter((fr) => fr > skip);

  rows.push({ name: s.name, frames: n - skip, bad, badLines,
              lines: (n - skip) * 144,
              fires: [...new Set(o.map((f) => f.bands.length))].sort((a, b) => a - b),
              lag: o.filter((f) => f.in.lag).map((f) => f.f),
              flips, camRace, knownFail: s.knownFail || null,
              sample: o[Math.min(2, o.length - 1)] });
  process.stderr.write('done\n');
}

const W = Math.max(24, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(W) +
            'frames   lines  bad lines  regs  verdict');
for (const r of rows) {
  console.log(r.name.padEnd(W) + String(r.frames).padStart(6) +
              String(r.lines).padStart(8) + String(r.badLines).padStart(11) +
              String(r.bad.length).padStart(6) + '  ' +
              (r.knownFail ? (r.bad.length ? 'xfail' : 'XPASS')
                           : (r.bad.length ? 'FAIL' : 'ok')));
}
for (const r of rows) {
  if (r.lag.length) {
    console.log(`\n  ${r.name}: lag frames inside the window (${r.lag.join(', ')}) ` +
                '-- section 28. Listed, not failed: the scanline diff above ' +
                'is the verdict, and surviving a lag frame is stronger ' +
                'evidence than avoiding one.');
  }
  if (r.camRace.length) {
    console.log(`
  ${r.name}: camera-race frames (${r.camRace.slice(0, 10).join(', ')}` +
                `${r.camRace.length > 10 ? ', ...' : ''}) -- an arm read a ` +
                '$FFA9/$FFAA the VBlank base did not have, i.e. the cartridge ' +
                'built this picture out of two iterations. The cap sits below ' +
                'the first of these.');
  }
  if (r.flips.length) {
    console.log(`\n  ${r.name}: feeder/band ordering flips inside the window ` +
                `(${r.flips.slice(0, 8).join(', ')}` +
                `${r.flips.length > 8 ? ', ...' : ''}) -- a feeder ran on the ` +
                'other side of a band from where it usually does. Harmless ' +
                'unless the value it feeds actually changed on that frame; ' +
                'where it did, the scenario cap sits below it.');
  }
  if (show) {
    console.log(`\n  ${r.name}: STAT fires per frame ${JSON.stringify(r.fires)}, ` +
                `sample frame ${r.sample.f}:`);
    console.log(`    base  scx=${r.sample.base.scx} scy=${r.sample.base.scy} ` +
                `bgp=${r.sample.base.bgp} obp0=${r.sample.base.obp0} ` +
                `obp1=${r.sample.base.obp1} wy=${r.sample.base.wy}`);
    for (const b of r.sample.bands.slice(0, show)) {
      console.log(`    ly${String(b.ly).padStart(3)} mode ${b.mode}  ` +
                  `scx=${b.scx} scy=${b.scy} bgp=${b.bgp} ` +
                  `obp0=${b.obp0} obp1=${b.obp1} -> lyc=${b.lyc}`);
    }
  }
  if (!r.bad.length) continue;
  console.log(`\n  ${r.name} - first bad scanline per register:`);
  for (const d of r.bad) {
    console.log(`    ${d.reg} @ f${d.frame} line ${d.line}: ` +
                `oracle ${d.oracle}, port ${d.port}` +
                `   [$FFA9=${d.ctx.ffa9} $FFAA=${d.ctx.ffaa} $FFB1=${d.ctx.ffb1} ` +
                `$C742=${d.ctx.c742} $C743=${d.ctx.c743} $C755=${d.ctx.c755} ` +
                `$FFCC=${d.ctx.ffcc}]`);
  }
}

for (const r of rows) {
  if (r.knownFail && !r.bad.length) {
    console.log(`
  ${r.name}: XPASS -- it carries a knownFail that no longer `
                + 'reproduces. Delete the annotation.');
  } else if (r.knownFail) {
    console.log(`
  ${r.name}: xfail (diagnosed, not fixed) -- ${r.knownFail}`);
  }
}

// A knownFail scenario is allowed to diverge but NOT allowed to start passing
// silently: an XPASS fails the run and says to delete the annotation.
const ok = rows.every((r) => (r.knownFail ? r.bad.length > 0 : !r.bad.length));
console.log('\n' + (ok
  ? `PASS - ${rows.length}/${rows.length} raster scenarios bit-exact against ` +
    `the ROM, ${rows.reduce((a, r) => a + r.lines, 0)} scanlines`
  : 'FAIL - a scanline register diverged from the ROM'));
process.exit(ok ? 0 : 1);
