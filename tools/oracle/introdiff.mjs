// Rebuild the stage-intro card (sub_00_333F) and hold it against the cartridge.
//
// Two things are checked, and the second is the one that matters:
//
//   PICTURE  every byte of $8000-$9FFF at four points of the build -- after the
//            fill and the three resource loads, and after each of the three
//            scripted frames. The card is painted on top of whatever screen
//            came before, so the recorded `before` snapshot is the base; on the
//            four ROUTE starts the port ALSO builds that base itself, out of
//            title -> round select, so those levels get an end-to-end check
//            with nothing recorded underneath them.
//   TIMING   the port's own tickStageIntro() driven frame by frame, against the
//            landmark frame numbers the recording carries: 60 blank, three
//            scripted, 180 held, 33 of fade, 276 in total -- plus the palette
//            the fade leaves on each of its four steps, and a START press
//            cutting the hold short with no fade at all.
//
// Landmarks are counted per sub_00_0A4F, which is the only thing in the whole
// routine that waits for a frame. A lag frame ($C757) therefore cannot move
// them: the recorder measures one, always on the build frame, where the LCD is
// off and three resource copies are in flight, and nothing on this screen ever
// reads $C757 (the actor and enemy drivers are not running -- there is no main
// loop yet). The check below asserts both halves of that.
//
// Usage:  node tools/oracle/introdiff.mjs [--record] [--level N]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runVramScript } from '../../games/batman/src/vramscript.js';
import { fillTilemap, blockCopy, buildTitleVram, buildRoundSelectVram }
  from '../../games/batman/src/vram.js';
import {
  buildStageIntroVram, loadStageIntro, showStageIntro, tickStageIntro,
  stageIntroTextScript, INTRO_ROUTE_LEVELS, INTRO_BOSS_LEVELS, showsStageIntro,
} from '../../games/batman/src/stageintro.js';
import { createState } from '../../games/batman/src/state.js';
import { BTN } from '../../games/batman/src/input.js';
import { ROOT, gamePath } from './_env.mjs';

const PY = process.env.PYTHON || 'python';
const DIR = path.join(ROOT, 'rip', 'oracle');

const LEVELS = [...INTRO_ROUTE_LEVELS, ...INTRO_BOSS_LEVELS].sort((a, b) => a - b);
const NON_INTRO = 2;
const CANCEL_LEVEL = 5;
const CANCEL_AT = 100;

const argv = process.argv.slice(2);
const only = argv.includes('--level')
  ? Number(argv[argv.indexOf('--level') + 1]) : null;
const record = argv.includes('--record');

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const ref = (l) => path.join(DIR, `intro-l${l}.json`);
const cancelRef = path.join(DIR, `intro-l${CANCEL_LEVEL}-cancel.json`);
const skipRef = path.join(DIR, `intro-l${NON_INTRO}.json`);

function rec(args, out) {
  execFileSync(PY, ['tools/oracle/stageintro.py', ...args, '--out', out],
    { cwd: ROOT, stdio: 'inherit' });
}

for (const l of LEVELS) {
  if (record || !fs.existsSync(ref(l))) {
    rec(['--level', String(l)], path.relative(ROOT, ref(l)).replace(/\\/g, '/'));
  }
}
if (record || !fs.existsSync(cancelRef)) {
  rec(['--level', String(CANCEL_LEVEL), '--start-at', String(CANCEL_AT)],
    path.relative(ROOT, cancelRef).replace(/\\/g, '/'));
}
if (record || !fs.existsSync(skipRef)) {
  rec(['--level', String(NON_INTRO)],
    path.relative(ROOT, skipRef).replace(/\\/g, '/'));
}

const manifest = JSON.parse(
  fs.readFileSync(gamePath('assets/manifest.json'), 'utf8'));
if (!manifest.stageIntro) {
  console.error('manifest has no stageIntro section - re-run export_assets.py');
  process.exit(1);
}
const spec = manifest.stageIntro;

let failed = 0;
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failed++; };

/** Byte diff -> {bad, first, runs}. */
function diff(got, want) {
  const runs = [];
  let bad = 0;
  let first = -1;
  let start = -1;
  for (let i = 0; i < want.length; i++) {
    if (got[i] !== want[i]) {
      bad++;
      if (first < 0) first = i;
      if (start < 0) start = i;
    } else if (start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, want.length - 1]);
  return { bad, first, runs };
}

function report(tag, got, want) {
  const d = diff(got, want);
  if (d.bad === 0) {
    console.log(`  ${tag.padEnd(34)} ${want.length}/${want.length} B`);
    return true;
  }
  console.log(`  ${tag.padEnd(34)} ${want.length - d.bad}/${want.length} B  `
    + `-- ${d.bad} differ in ${d.runs.length} run(s)`);
  for (const [a, b] of d.runs.slice(0, 8)) {
    console.log(`      $${(0x8000 + a).toString(16)}-$${(0x8000 + b).toString(16)}`
      + `  built=$${got[a].toString(16).padStart(2, '0')}`
      + ` real=$${want[a].toString(16).padStart(2, '0')}`);
  }
  failed++;
  return false;
}

/* -------------------------------------------------------------------------
 * The picture
 * ---------------------------------------------------------------------- */

// The route starts' base image, built rather than recorded: title -> round
// select, both of which titlediff.mjs already proves byte-exact.
function routeBase() {
  const t = manifest.title;
  const title = buildTitleVram({
    tiles: t.tiles.map((x) => ({ dest: x.dest, bytes: b64(x.bytes) })),
    scripts: t.scripts.map(b64),
    fill: t.fill,
  }, (v, s) => runVramScript(v, s));
  const rs = manifest.roundSelect;
  return buildRoundSelectVram({
    fill: rs.fill,
    tiles: rs.tiles.map((x) => ({ dest: x.dest, bytes: b64(x.bytes) })),
    scripts: rs.scripts.map(b64),
  }, (v, s) => runVramScript(v, s), title);
}

let totalBytes = 0;
let matchedBytes = 0;

for (const level of LEVELS) {
  if (only && level !== only) continue;
  const r = JSON.parse(fs.readFileSync(ref(level), 'utf8'));
  const boss = INTRO_BOSS_LEVELS.includes(level);
  console.log(`\nlevel ${level} (${boss ? 'boss' : 'route start'})`);

  const before = Uint8Array.from(r.snaps.before.vram);
  const stages = [
    ['blank', 0], ['afterS1', 1], ['afterS2', 2], ['built', 3], ['held', 3],
  ];

  // 1. Replay the RECORDED events. This proves the mechanisms (fill, block
  //    copy, script) without trusting the export at all.
  {
    const v = Uint8Array.from(before);
    for (const e of r.events) {
      if (e.kind === 'fill') fillTilemap(v, e.value);
      else if (e.kind === 'copy' && e.dest >= 0x8000 && e.dest < 0xA000) {
        blockCopy(v, e.dest, Uint8Array.from(e.bytes));
      } else if (e.kind === 'script') runVramScript(v, Uint8Array.from(e.bytes));
    }
    report('replay of recorded events', v, Uint8Array.from(r.snaps.held.vram));
  }

  // 2. The SHIPPED path: buildStageIntroVram out of assets/manifest.json, at
  //    every one of the four images the card actually shows.
  for (const [tag, stage] of stages) {
    const want = Uint8Array.from(r.snaps[tag].vram);
    const got = buildStageIntroVram(spec, level, before,
      (v, s) => runVramScript(v, s), stage);
    totalBytes += want.length;
    if (report(`manifest build @ ${tag}`, got, want)) matchedBytes += want.length;
  }

  // 3. Route starts only: the same build with NOTHING recorded underneath it.
  if (INTRO_ROUTE_LEVELS.includes(level)) {
    const base = routeBase();
    // $99CD is the route cursor cell and is not part of the static build --
    // loc_00_0450 assembles a one-record script in WRAM and paints it every
    // frame from $C712 (titlediff.mjs carries the same exclusion). It is also
    // the one byte of the base the card cannot possibly care about: $3371's
    // $DC fill covers $9800-$9A3E, and the 8192/8192 below is the proof.
    const CURSOR_CELL = 0x99CD - 0x8000;
    const masked = Uint8Array.from(before);
    masked[CURSOR_CELL] = base[CURSOR_CELL];
    const d = diff(base, masked);
    if (d.bad) {
      fail(`round-select base differs from the cartridge in ${d.bad} B `
        + `(first $${(0x8000 + d.first).toString(16)})`);
    } else {
      console.log(`  ${'round-select base (- $99CD)'.padEnd(34)} 8191/8191 B`);
    }
    const got = buildStageIntroVram(spec, level, base,
      (v, s) => runVramScript(v, s), 3);
    report('title -> roundsel -> intro', got, Uint8Array.from(r.snaps.held.vram));
  }

  // 4. The boss append is the one branch the listing gets to lie about. Prove
  //    the concatenated buffer is byte-for-byte what the cartridge ran.
  const ranScript = r.events.filter((e) => e.kind === 'script').pop();
  const ours = stageIntroTextScript(spec, level);
  const theirs = Uint8Array.from(ranScript.bytes);
  if (ours.length !== theirs.length || ours.some((v, i) => v !== theirs[i])) {
    fail(`the $C61B text buffer differs: ours ${ours.length} B, `
      + `cartridge ${theirs.length} B`);
  } else {
    console.log(`  ${'$C61B text buffer'.padEnd(34)} ${theirs.length}/${theirs.length} B`
      + `${boss ? '  (level script + 0:$3485)' : ''}`);
  }
  if (boss !== (r.hits.append > 0)) fail('loc_00_343A ran on the wrong level');

  // 5. Does the card depend on the screen underneath it at all?
  //
  // It matters because the port models the base only for the four ROUTE
  // starts: a boss is reached from the LEVEL before it ($2836), whose VRAM the
  // port does not keep. rLCDC is $E7, so bit 4 is CLEAR and the BG reads
  // $8800 SIGNED -- ids $80-$FF at $8800, $00-$7F at $9000. If every id the
  // visible 20x18 window uses lands inside one of the three resources the card
  // loads for itself, then what was underneath cannot show through.
  {
    const held = Uint8Array.from(r.snaps.held.vram);
    const spans = spec.tiles.map((t) => [t.dest, t.dest + b64(t.bytes).length]);
    const inside = (a, n) => spans.some(([lo, hi]) => a >= lo && a + n <= hi);
    const strays = new Set();
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 20; col++) {
        const id = held[0x1800 + row * 32 + col];
        const at = id < 0x80 ? 0x9000 + id * 16 : 0x8800 + (id - 0x80) * 16;
        if (!inside(at, 16)) strays.add(id);
      }
    }
    if (strays.size) {
      fail(`${strays.size} visible tile id(s) come from OUTSIDE the card's own `
        + `resources: ${[...strays].map((v) => '$' + v.toString(16)).join(' ')}`);
    } else {
      console.log(`  ${'visible tiles all self-supplied'.padEnd(34)} `
        + 'resources $02/$1D/$05 cover every id');
    }

    // The emblem's OBJ tiles are $8000-based and land in the SAME blob -- so
    // the sprite half is self-supplied too.
    const log = drive(level, Uint8Array.from(r.snaps.before.vram), { max: 1 });
    const objStray = log.state.video.sprites.filter(
      (s) => !inside(0x8000 + s.tile * 16, 32));
    if (objStray.length) {
      fail(`${objStray.length} emblem tile(s) come from outside the card's `
        + 'own resources');
    }

    // And the shadow OAM the port produces, record for record, against the
    // cartridge's $C000 image on the same frame.
    const want = r.snaps.built.oam;
    const got = log.state.video.sprites;
    let oamBad = 0;
    for (let i = 0; i < 40; i++) {
      const w = want.slice(i * 4, i * 4 + 4);
      const g = got[i];
      const mine = g ? [(g.y + 16) & 0xFF, (g.x + 8) & 0xFF, g.tile, g.attr]
        : [0, 0, 0, 0];
      if (mine.some((v, k) => v !== w[k])) {
        if (oamBad++ === 0) {
          fail(`OAM record ${i}: port ${mine.map((v) => '$' + v.toString(16))}, `
            + `cartridge ${w.map((v) => '$' + v.toString(16))}`);
        }
      }
    }
    if (!oamBad) {
      console.log(`  ${'shadow OAM, metasprite $F2'.padEnd(34)} 40/40 records`);
    }

    // 6. ...so does the base matter for what is SEEN? Build the card over a
    //    blank 8 KB buffer and compare only what the hardware reads: the 20x18
    //    visible map cells, and the 16 bytes of every tile they and the emblem
    //    name. If that agrees, the wiring never has to hold on to the previous
    //    screen's VRAM -- which is the difference between the card working on a
    //    boss level and not.
    const blank = buildStageIntroVram(spec, level, new Uint8Array(0x2000),
      (v, s) => runVramScript(v, s), 3);
    let seenBad = 0;
    const ids = new Set();
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 20; col++) {
        const i = 0x1800 + row * 32 + col;
        if (blank[i] !== held[i]) seenBad++;
        ids.add(held[i]);
      }
    }
    const check = (at) => {
      for (let k = 0; k < 16; k++) if (blank[at - 0x8000 + k] !== held[at - 0x8000 + k]) seenBad++;
    };
    for (const id of ids) check(id < 0x80 ? 0x9000 + id * 16 : 0x8800 + (id - 0x80) * 16);
    for (const s of log.state.video.sprites) { check(0x8000 + s.tile * 16); check(0x8000 + (s.tile + 1) * 16); }
    if (seenBad) {
      fail(`built over a BLANK base, ${seenBad} visible byte(s) differ -- the `
        + 'card does depend on the screen underneath it');
    } else {
      console.log(`  ${'blank base, same visible screen'.padEnd(34)} `
        + `${ids.size} tile ids + 360 cells + 40 sprites`);
    }
  }
}

/* -------------------------------------------------------------------------
 * The timing
 * ---------------------------------------------------------------------- */

function drive(level, base, opts = {}) {
  const { startAt = null, max = 600 } = opts;
  const state = createState();
  // NOT set: state.titleManifest. main.js assigns it only on the title boot
  // path, so a harness that assigns it is testing a state the app may not
  // have (docs/03 lesson 38 -- that is the line that hid the ending's missing
  // credit circle). The card gets its metasprite table from the manifest
  // handed to loadStageIntro, not from state; MEASURED, deleting the
  // assignment leaves this tool's result unchanged (EXACT MATCH,
  // 327680/327680 VRAM bytes across 8 levels, and every timing landmark).
  state.sound = { queue: [] };
  state.player.hp = 3;
  state.player.hpMax = 10;
  const art = loadStageIntro(manifest, level, base);
  showStageIntro(state, art);

  const log = { stage: [], fade: [], sprites: [], done: null };
  for (let f = 1; f <= max; f++) {
    state.input.pressed = (startAt !== null && f === startAt + 1) ? BTN.START : 0;
    const prevStage = state.stageIntro.stage;
    // Whether THIS frame is one of sub_00_0A7F's, i.e. the fade was already
    // armed when the frame began. The frame that arms it is still a hold frame
    // and still draws the emblem ($3468 precedes $347F).
    const fading = !!state.stageIntro.fade;
    const r = tickStageIntro(state);
    if (state.stageIntro.stage !== prevStage) log.stage.push(f);
    if (fading) {
      log.fade.push([f, state.video.bgp, state.video.obp0, state.video.obp1]);
    }
    log.sprites.push(state.video.sprites.length);
    if (r === 'done') { log.done = f; break; }
  }
  log.vram = art.vram;
  log.state = state;
  log.art = art;
  return log;
}

console.log('\ntiming');
{
  const r = JSON.parse(fs.readFileSync(ref(1), 'utf8'));
  const base = Uint8Array.from(r.snaps.before.vram);
  const log = drive(1, base);

  const want = { blank: r.marks.afterS1 - 1, s1: r.marks.afterS1,
                 s2: r.marks.afterS2, text: r.marks.hold,
                 fade: r.marks.fade, done: r.marks.returned };
  const gotStages = log.stage;
  const ok = (name, got, exp) => {
    if (got === exp) console.log(`  ${name.padEnd(34)} ${got}`);
    else fail(`${name}: port ${got}, cartridge ${exp}`);
  };
  ok('script 1 applied on frame', gotStages[0], want.s1);
  ok('script 2 applied on frame', gotStages[1], want.s2);
  ok('text applied on frame', gotStages[2], want.text);
  ok('first sub_00_0A7F frame', log.fade.length ? log.fade[0][0] : -1,
     want.fade + 1);
  ok('sub_00_0A7F frames', log.fade.length, want.done - want.fade);
  ok('total frames', log.done, want.done);
  ok('blank frames before frame 1 paint', want.s1 - 1, spec.blankFrames);
  ok('held frames', want.fade - want.text, spec.holdFrames);
  ok('fade frames', want.done - want.fade, 0x21);

  // The emblem is 40 records on EVERY frame, the fade included.
  //
  // This used to assert that the fade frames queue ZERO sprites, because
  // sub_00_0A7F contains no sub_00_0BC6. It does not redraw -- but it does
  // not clear shadow OAM either, and the hardware keeps displaying what is
  // there. MEASURED: 40 live OAM entries on every frame of the fade while
  // BGP and OBP0 step E4 -> 90 -> 40 -> 00. Our shadow OAM is a queue rebuilt
  // per tick, so "does not redraw" would mean "vanishes", and it did: the
  // ring disappeared the moment the fade started, leaving the card's hard BG
  // edge bare for 33 frames. introscreen.mjs now compares a fade frame's
  // PIXELS as well, which is the check that would have caught it.
  const drawn = log.sprites;
  if (drawn.some((n) => n !== 40)) fail('the emblem is not 40 sprites every frame');
  else console.log(`  ${'emblem sprites per frame'.padEnd(34)} 40 x ${drawn.length}`);

  // The palette the fade leaves, against the cartridge's own $FFAD/$FFAE/$FFAF.
  const samples = new Map(r.samples.map((s) => [s.frame, s]));
  let palBad = 0;
  for (const [f, bgp, obp0, obp1] of log.fade) {
    const s = samples.get(f);
    if (!s) continue;
    if (s.FFAD !== bgp || s.FFAE !== obp0 || s.FFAF !== obp1) {
      if (palBad++ === 0) {
        fail(`fade palette at frame ${f}: port `
          + `${[bgp, obp0, obp1].map((v) => '$' + v.toString(16))}, cartridge `
          + `${[s.FFAD, s.FFAE, s.FFAF].map((v) => '$' + v.toString(16))}`);
      }
    }
  }
  if (!palBad) {
    console.log(`  ${'fade palettes, all 33 frames'.padEnd(34)} `
      + `${log.fade.length}/${log.fade.length}`);
  }
}

// START cuts the hold short, and skips the fade entirely.
{
  const c = JSON.parse(fs.readFileSync(cancelRef, 'utf8'));
  const base = Uint8Array.from(c.snaps.before.vram);
  const log = drive(CANCEL_LEVEL, base, { startAt: CANCEL_AT });
  if (log.done !== c.marks.returned) {
    fail(`START at frame ${CANCEL_AT}: port ends on ${log.done}, `
      + `cartridge on ${c.marks.returned}`);
  } else {
    console.log(`  ${'START cuts the hold short'.padEnd(34)} `
      + `frame ${log.done} (cartridge ${c.marks.returned})`);
  }
  if (c.hits.fade !== 0) fail('the cartridge faded after a cancelled card');
  if (log.fade.length) fail('the port faded after a cancelled card');
  else console.log(`  ${'cancelled card runs no fade'.padEnd(34)} `
    + `cartridge sub_00_0A7F hits: ${c.hits.fade}`);
}

// The eight-level gate, and its complement.
{
  const skip = JSON.parse(fs.readFileSync(skipRef, 'utf8'));
  if (showsStageIntro(NON_INTRO) || skip.hits.build !== 0
      || skip.totalFrames !== 0) {
    fail(`level ${NON_INTRO} should RET at $3364 costing 0 frames; `
      + `cartridge spent ${skip.totalFrames}`);
  } else {
    console.log(`  ${'level 2 RETs at $3364'.padEnd(34)} 0 frames, both`);
  }
}

// HP: loc_00_3365 is the route starts' one extra instruction.
{
  let hpBad = 0;
  let n = 0;
  for (const level of LEVELS) {
    if (only && level !== only) continue;
    n++;
    const r = JSON.parse(fs.readFileSync(ref(level), 'utf8'));
    const wantRefill = INTRO_ROUTE_LEVELS.includes(level);
    if ((r.hits.hp > 0) !== wantRefill) {
      fail(`level ${level}: cartridge loc_00_3365 hits ${r.hits.hp}`);
      hpBad++;
      continue;
    }
    const log = drive(level, Uint8Array.from(r.snaps.before.vram), { max: 1 });
    const refilled = log.state.player.hp === log.state.player.hpMax;
    if (refilled !== wantRefill) {
      fail(`level ${level}: port refilled HP = ${refilled}, ROM = ${wantRefill}`);
      hpBad++;
    }
  }
  if (!hpBad) {
    console.log(`  ${'loc_00_3365 HP refill'.padEnd(34)} `
      + `route starts only, ${n}/${n} levels agree`);
  }
}

/* -------------------------------------------------------------------------
 * Lag frames -- out of scope by §28, but bounded rather than ignored
 * ---------------------------------------------------------------------- */
console.log('\nlag frames ($C757, docs/03-VERIFICATION.md §28)');
{
  let worst = 0;
  for (const level of LEVELS) {
    if (only && level !== only) continue;
    const r = JSON.parse(fs.readFileSync(ref(level), 'utf8'));
    worst = Math.max(worst, r.lagFrames);
    const first = r.samples.find((s) => s.lag > 0);
    if (r.marks.returned !== 276) {
      fail(`level ${level} ran ${r.marks.returned} frames, not 276`);
    }
    if (first && first.frame > 1) {
      fail(`level ${level}: a lag frame at ${first.frame}, not on the build frame`);
    }
  }
  console.log(`  at most ${worst} per showing, always on frame 1 -- the build `
    + 'frame, where the LCD is off (sub_00_09DD) and three resource copies run');
  console.log('  it cannot skew this comparison: every landmark is counted per '
    + 'sub_00_0A4F,');
  console.log('  and all eight levels land on 276 regardless. Nothing on this '
    + 'screen reads');
  console.log('  $C757 -- the actor and enemy drivers only run under the main '
    + 'loop, which');
  console.log('  sub_00_333F precedes.');
}

console.log('');
if (failed) {
  console.log(`STAGE INTRO REGRESSION -- ${failed} check(s) failed`);
  process.exit(1);
}
console.log(`EXACT MATCH -- ${matchedBytes}/${totalBytes} VRAM bytes across `
  + `${only ? 1 : LEVELS.length} level(s), built from ROM data, not captured.`);
process.exit(0);
