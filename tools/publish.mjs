// publish.mjs -- gate, build, deploy, and CONFIRM the deploy landed.
//
// One command, because publishing by hand is four steps and the fourth one is
// the one that gets skipped. Cloudflare Pages deploys are NOT atomic: a poll
// immediately after "Deployment complete!" has returned the PREVIOUS build's
// document more than once in this project, including on the deploy that added
// Gradius. So this polls until it sees the new build id repeatedly, and exits
// non-zero if it never does.
//
//   node tools/publish.mjs                 gate every game, then publish
//   node tools/publish.mjs --only gradius  gate only Gradius (the fast path)
//   node tools/publish.mjs --only ddpdoj   gate only DaiOuJou
//   node tools/publish.mjs --dry           gate and build, do not deploy
//
// THE GATE IS THE ARBITER. If a stage is red this refuses to deploy. That is
// the whole point of running it from a script instead of from memory: the
// temptation to publish "just this once" past a red stage does not survive
// being written down as an exit code.

import { execFileSync, execSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : args[onlyIdx + 1];

const SITE = 'https://gbtman.pages.dev';
const PROJECT = 'gbtman';

// `shell` is not decoration on Windows: npx is a .cmd shim, and execFileSync
// without a shell cannot spawn it -- it fails ENOENT before wrangler is ever
// reached. Node's own tools (process.execPath) are real executables and must
// NOT get a shell, because then their arguments go through cmd.exe quoting.
function run(label, cmd, cmdArgs, opts = {}) {
  process.stdout.write(`\n=== ${label}\n`);
  try {
    const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
    process.stdout.write(out.split('\n').slice(-14).join('\n') + '\n');
    return out;
  } catch (e) {
    process.stdout.write((e.stdout || '').split('\n').slice(-30).join('\n') + '\n');
    process.stderr.write(`\nREFUSING TO PUBLISH: "${label}" failed.\n`);
    process.exit(1);
  }
}

// ---- 1. the gates ---------------------------------------------------------
// Gradius first: it is the game being iterated on, so it is the one most likely
// to be red, and a red stage should be reported before Batman's PyBoy stages
// spend two minutes proving something nobody changed. Cheapest-likeliest first
// is the same rule tools/test-all.mjs uses internally.
if (only === null || only === 'gradius') {
  run('gradius unit tests', process.execPath, ['--test', 'games/gradius/tests/']);
  const g = run('gradius gate', process.execPath, ['games/gradius/tools/test-all.mjs']);
  if (!/GREEN/.test(g) || !/0 SKIPPED/.test(g)) {
    console.error('\nREFUSING TO PUBLISH: the Gradius gate is not GREEN with 0 SKIPPED.');
    console.error('A SKIP IS NOT A PASS -- see docs/worklog/README.md.');
    process.exit(1);
  }
}

// DaiOuJou. Two stages, and the second one is the reason this game can be
// published at all: `bundlegate.mjs` renders the page's whole demo path off the
// 363 KiB EXPORTED BUNDLE -- not off the 58 MiB of cartridge every other gate
// in that game uses -- and compares it to MAME's own framebuffers. If the
// exporter ever drops a tile or a sprite stream the picture stays plausible and
// only this number moves, so it runs before every deploy.
if (only === null || only === 'ddpdoj') {
  run('ddpdoj unit tests', process.execPath, ['--test', 'games/ddpdoj/tests/']);
  const d = run('ddpdoj bundle gate', process.execPath, [
    'games/ddpdoj/tools/bundlegate.mjs',
    '--assets', 'games/ddpdoj/assets',
    '--dump', 'games/ddpdoj/rip/pix-demo',
    '--tsv', 'games/ddpdoj/tools/oracle/out/w6/demo.tsv']);
  if (!/^PASS/m.test(d) || !/100\.0000%/.test(d)) {
    console.error('\nREFUSING TO PUBLISH: the DaiOuJou bundle gate is not 100.0000%.');
    console.error('Rebuild the bundle: node games/ddpdoj/tools/export-web.mjs');
    process.exit(1);
  }
  // And the FETCH path, over a real HTTP origin, through the same httpReader
  // the page uses. Nobody in this project has a browser; this is the closest
  // anything gets to opening the page.
  const w = run('ddpdoj web fetch gate', process.execPath,
    ['games/ddpdoj/tools/webgate.mjs', '--assets', 'games/ddpdoj/assets']);
  if (!/^PASS/m.test(w)) {
    console.error('\nREFUSING TO PUBLISH: the DaiOuJou fetch gate is red.');
    process.exit(1);
  }
}

if (only === null || only === 'batman') {
  const b = run('batman gate', process.execPath, ['tools/test-all.mjs']);
  if (!/ALL GREEN/.test(b) || !/0 skipped/.test(b)) {
    console.error('\nREFUSING TO PUBLISH: the Batman gate is not ALL GREEN with 0 skipped.');
    process.exit(1);
  }
}

// ---- 2. build (this is also the ROM-leak guard) ---------------------------
// build-dist.mjs reads every ROM in the repo root and refuses to emit a dist/
// containing any file that appears verbatim inside one. It is the last thing
// standing between an exporter intermediate and a public URL, so it runs on
// every publish and is never skipped.
//
// It has NO allowlist. It used to have one, holding the player's 6974-byte tile
// pool, which is why every build published before this one carried verbatim
// cartridge graphics. The pool is now replaced at copy time by original
// placeholder art (tools/make-placeholder-tiles.mjs); the local tree keeps the
// real tiles so the oracle still measures against the cartridge.
const built = run('build dist', process.execPath, ['tools/build-dist.mjs']);
const buildId = (built.match(/build id\s+(\d{14})/) || [])[1]
  || execSync('node -e "const fs=require(\'fs\');const s=fs.readFileSync(\'dist/games/batman/src/buildid.js\',\'utf8\');process.stdout.write((s.match(/[0-9]{14}/)||[])[0]||\'\')"', { encoding: 'utf8' }).trim();

if (!/^\d{14}$/.test(buildId)) {
  console.error(`\nREFUSING TO PUBLISH: could not read a build id (got ${JSON.stringify(buildId)}).`);
  console.error('Without it there is no way to confirm the deploy landed, and an');
  console.error('unconfirmable deploy is the failure mode this script exists to prevent.');
  process.exit(1);
}
console.log(`\nbuild id ${buildId}`);

if (dry) { console.log('\n--dry: built and gated, not deployed.'); process.exit(0); }

// ---- 3. deploy ------------------------------------------------------------
run('deploy', 'npx', ['wrangler', 'pages', 'deploy', 'dist',
  `--project-name=${PROJECT}`, '--commit-dirty=true'], { shell: true });

// ---- 4. CONFIRM IT LANDED -------------------------------------------------
// Not optional, and not one poll. The edge can still be serving the previous
// build when wrangler prints success. Require the new id on several
// consecutive polls before believing it, and check Gradius is actually
// reachable rather than assuming the game select implies it.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let streak = 0;
let last = null;

for (let i = 1; i <= 20 && streak < 3; i++) {
  const q = `?cb=${Math.random()}`;
  try {
    const idTxt = await (await fetch(`${SITE}/games/batman/src/buildid.js${q}`)).text();
    const live = (idTxt.match(/\d{14}/) || [])[0];
    const reg = await (await fetch(`${SITE}/games/index.json${q}`)).json();
    const grad = await fetch(`${SITE}/games/gradius/${q}`);
    // DaiOuJou's page AND one of its assets. The page is static HTML and will
    // 200 whether or not the bundle deployed; a bundle file that 404s yields an
    // EMPTY buffer in the browser, and a zero-filled tile sheet renders a
    // perfectly plausible empty starfield. So confirm a real asset URL, not
    // just the document that references it.
    const doj = await fetch(`${SITE}/games/ddpdoj/${q}`);
    const dojAsset = await fetch(`${SITE}/games/ddpdoj/assets/manifest.json${q}`);
    const ok = live === buildId && grad.status === 200
      && doj.status === 200 && dojAsset.status === 200
      && reg.some((g) => g.id === 'gradius') && reg.some((g) => g.id === 'ddpdoj');
    streak = ok ? streak + 1 : 0;
    last = `live=${live} gradius=${grad.status} ddpdoj=${doj.status}/${dojAsset.status}`
      + ` games=${reg.map((g) => g.id).join(',')}`;
    console.log(`poll ${String(i).padStart(2)}  ${last}  ${ok ? `ok (${streak}/3)` : 'not yet'}`);
  } catch (e) {
    streak = 0;
    console.log(`poll ${String(i).padStart(2)}  fetch failed: ${e.message}`);
  }
  if (streak < 3) await sleep(5000);
}

if (streak < 3) {
  console.error(`\nDEPLOY NOT CONFIRMED after 20 polls. Last: ${last}`);
  console.error(`Expected build id ${buildId}. The upload may have succeeded and the`);
  console.error('edge not yet caught up -- re-run the poll before re-deploying.');
  process.exit(1);
}

console.log(`\nPUBLISHED and confirmed: build ${buildId}`);
console.log(`  ${SITE}/`);
console.log(`  ${SITE}/games/gradius/`);
console.log(`  ${SITE}/games/ddpdoj/`);
