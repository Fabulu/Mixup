// Build, deploy, and confirm the separate asset-free Mixup site.
// This script never invokes tools/publish.mjs and never reads or deploys dist/.
//
//   node tools/publish-rom.mjs --dry   build and audit dist-rom only
//   node tools/publish-rom.mjs         deploy dist-rom to mixup.pages.dev

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const SITE = 'https://mixup.pages.dev';
const EXISTING_SITE = 'https://gbtman.pages.dev';
const PROJECT = 'mixup';
const BRANCH = 'main';
const dry = process.argv.slice(2).includes('--dry');

function run(label, command, args, options = {}) {
  process.stdout.write(`\n=== ${label}\n`);
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8', maxBuffer: 1 << 25, ...options,
    });
    process.stdout.write(output.split('\n').slice(-16).join('\n') + '\n');
    return output;
  } catch (error) {
    process.stdout.write((error.stdout || '').split('\n').slice(-30).join('\n') + '\n');
    process.stderr.write((error.stderr || '').split('\n').slice(-30).join('\n') + '\n');
    console.error(`REFUSING ASSET-FREE PUBLISH: ${label} failed.`);
    process.exit(1);
  }
}

async function fetchExistingBuildId() {
  const response = await fetch(`${EXISTING_SITE}/games/batman/src/buildid.js?cb=${Math.random()}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`existing production build id returned HTTP ${response.status}`);
  const text = await response.text();
  const buildId = (text.match(/\d{14}/) || [])[0];
  if (!buildId) throw new Error('existing production did not return a 14-digit build id');
  return buildId;
}

let existingBuildId = null;
if (!dry) {
  try {
    existingBuildId = await fetchExistingBuildId();
    console.log(`existing gbtman build before deploy: ${existingBuildId}`);
  } catch (error) {
    console.error(`REFUSING ASSET-FREE PUBLISH: cannot establish existing production baseline: ${error.message}`);
    process.exit(1);
  }
}

const built = run('build and audit dist-rom', process.execPath, ['tools/build-rom-dist.mjs']);
const buildId = (built.match(/asset-free build id\s+(\d{14})/) || [])[1];
if (!buildId) {
  console.error('REFUSING ASSET-FREE PUBLISH: the builder did not report a 14-digit build id.');
  process.exit(1);
}

run('asset-free browser release gate', 'python',
  ['tools/browser-release-gate.py', '--dist-rom', 'dist-rom']);

if (dry) {
  console.log(`\n--dry: asset-free build ${buildId} audited, not deployed.`);
  process.exit(0);
}

run('deploy dist-rom to mixup', 'npx', [
  'wrangler', 'pages', 'deploy', 'dist-rom',
  `--project-name=${PROJECT}`, `--branch=${BRANCH}`, '--commit-dirty=true',
], { shell: true });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let streak = 0;
let last = 'no poll completed';
for (let attempt = 1; attempt <= 20 && streak < 3; attempt++) {
  const suffix = `?cb=${Math.random()}`;
  try {
    const [shellResponse, idResponse, oldLive] = await Promise.all([
      fetch(`${SITE}/${suffix}`, { cache: 'no-store' }),
      fetch(`${SITE}/src/buildid.js${suffix}`, { cache: 'no-store' }),
      fetchExistingBuildId(),
    ]);
    const idText = await idResponse.text();
    const liveBuildId = (idText.match(/\d{14}/) || [])[0];
    const oldUnchanged = oldLive === existingBuildId;
    const ok = shellResponse.status === 200 && idResponse.status === 200
      && liveBuildId === buildId && oldUnchanged;
    streak = ok ? streak + 1 : 0;
    last = `shell=${shellResponse.status} live=${liveBuildId} gbtman=${oldLive} unchanged=${oldUnchanged}`;
    console.log(`poll ${String(attempt).padStart(2)}  ${last}  ${ok ? `ok (${streak}/3)` : 'not yet'}`);
  } catch (error) {
    streak = 0;
    last = `fetch failed: ${error.message}`;
    console.log(`poll ${String(attempt).padStart(2)}  ${last}`);
  }
  if (streak < 3) await sleep(5000);
}

if (streak < 3) {
  console.error(`\nDEPLOY NOT CONFIRMED after 20 polls. Last: ${last}`);
  console.error(`Expected mixup build ${buildId} and unchanged gbtman build ${existingBuildId}.`);
  process.exit(1);
}

console.log(`\nPUBLISHED and confirmed: asset-free build ${buildId}`);
console.log(`  ${SITE}/`);
console.log(`  existing production unchanged at build ${existingBuildId}`);
