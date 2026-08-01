#!/usr/bin/env node
// WHAT THE MATCHER TOOK, AND WHAT IT LEFT  (wave 9).
//
//     node games/ddpdoj/tools/attachreport.mjs [--assets games/ddpdoj/assets]
//
// WHY THIS EXISTS, and it is the durable half of wave 9's fix.
//
// `pixpack.mjs` printed "three offsets accepted at 161/161 frames" and stopped.
// It said nothing about the records it had CONSIDERED AND DROPPED -- and two of
// those were the player's own exhaust and all three of the player's shadows.
// The page shipped for two waves with the player's biggest attached sprite
// flying off on the recorded path, and the matcher's output looked clean the
// whole time. A rejected candidate is a finding, not noise.
//
// So this prints EVERY appearance class in the capture with its conditional
// score, accepted or not, sorted by score, with the accept/reject line drawn in
// the middle. If somebody re-captures, re-packs, or changes the scenario, this
// is the command that says whether the player is still whole -- and if a record
// is missing from the picture, this is where its score will be.
//
// THE TEST IS CONDITIONAL ON PRESENCE. See `src/render/capture.js`'s header:
// alternate-frame drawing is how this hardware faked transparency, so "how
// often is it present" measures the artwork, not the attachment.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/web/assets.js';
import { ATTACH_MIN_SCORE, ATTACH_MIN_FRAMES } from '../src/render/capture.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
if (!fs.existsSync(path.join(ASSETS, 'manifest.json'))) {
  console.error(`${ASSETS}/manifest.json is missing -- run: `
    + 'node games/ddpdoj/tools/export-web.mjs');
  process.exit(2);
}

const bundle = await loadBundle(async (name) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, name))));
const cap = bundle.cap;
const rep = cap.attachmentReport();

console.log(`ATTACHMENT, conditional on presence -- ${cap.length} capture frames`);
console.log(`accept: score >= ${(ATTACH_MIN_SCORE * 100).toFixed(0)}% over `
  + `>= ${ATTACH_MIN_FRAMES} frames\n`);
console.log('class                 size    present  phase        model   '
  + 'offset        score  verdict');
let drawn = false;
for (const r of rep) {
  if (!drawn && r.verdict !== 'ACCEPT') {
    console.log('  ' + '-'.repeat(88) + '   <-- everything below here was '
      + 'TESTED AND REJECTED');
    drawn = true;
  }
  console.log(`${r.cls.padEnd(20)} ${(r.size ?? '').padEnd(7)} `
    + `${String(r.present).padStart(4)}/${String(r.of ?? cap.length).padEnd(4)} `
    + `${(r.phase ?? '').padEnd(11)}  ${(r.model ?? '-').padEnd(7)} `
    + `${(r.dx === undefined ? '' : `(${r.dx},${r.dy})`).padEnd(12)} `
    + `${(r.score * 100).toFixed(1).padStart(5)}%  ${r.verdict}`);
}

const acc = rep.filter((r) => r.verdict === 'ACCEPT');
const small = rep.filter((r) => r.verdict.startsWith('sample<'));
// The gap that means anything is against classes that HAD the sample and still
// failed the score. A class seen once scores 100% on 1/1 by definition; that is
// what the minimum sample is for, and folding it into the gap would hide the
// real separation.
const rej = rep.filter((r) => r.verdict === 'reject');
const worstAcc = acc.length ? Math.min(...acc.map((r) => r.score)) : 0;
const bestRej = Math.max(0, ...rej.map((r) => r.score));
console.log(`\n${acc.length} accepted, ${rej.length} rejected on SCORE, `
  + `${small.length} rejected for too small a SAMPLE.`);
console.log(`worst accepted ${(worstAcc * 100).toFixed(1)}%  vs  `
  + `best rejected-on-score ${(bestRej * 100).toFixed(1)}%   -- a gap of `
  + `${((worstAcc - bestRej) * 100).toFixed(1)} points.`);
if (small.length) {
  console.log(`  (the ${small.length} sample-limited classes each appear on `
    + `${small.map((r) => r.present).join('/')} frame(s); a class seen once `
    + 'scores 100% by definition, which is what the minimum sample is for)');
}

// The per-frame count, which is what actually reaches the screen.
const per = {};
for (const fr of cap.attached()) per[fr.length] = (per[fr.length] ?? 0) + 1;
console.log(`records spliced per frame: ${JSON.stringify(per)}`);

// ORDERING. A higher display-list index draws IN FRONT on this hardware, so a
// shadow that ended up in front of the ship would be obviously wrong. splice
// never reorders, but check the capture's own order so the claim is measured.
const { parseSpriteList } = await import('../src/render/spritelist.js');
let behind = 0, front = 0, noShip = 0;
for (let i = 0; i < cap.length; i++) {
  const recs = cap.attached()[i];
  const ship = recs.find(([, m, dx, dy]) => m === 'rigid' && dx === -24 && dy === -16);
  if (!ship) { noShip++; continue; }
  for (const [idx, m] of recs) {
    if (m !== 'ground') continue;
    if (idx < ship[0]) behind++; else front++;
  }
}
console.log(`ordering: ground-plane (shadow) records drawn BEHIND the ship `
  + `${behind}, IN FRONT ${front}${front ? '  <-- WRONG' : ''}`
  + `${noShip ? `, ${noShip} frames with no ship record` : ''}`);
void parseSpriteList;

if (bestRej >= ATTACH_MIN_SCORE || front) process.exit(1);
