// Port counterpart to tools/oracle/econmaxhp.py.
//
// $FF8E (max HP) has two writers in the whole cartridge: $0202 (boot) and
// 1:$4D70 (the +2 pickup). Level init writes neither it nor $FF8A. The port's
// resetPlayer writes BOTH on every initLevel, and only main.js's walk-off
// transition patches them back -- so this replays each screen handoff the
// frame loop can take and prints what the run is left holding.
//
// Usage: node tools/oracle/econhp.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel, clearLevel } = await imp('src/level.js');
const { resolveLoadout } = await imp('src/mods.js');
const { continueLevel, ROUTE_LEVEL } = await imp('src/roundselect.js');

const mk = async (lvl) => {
  const s = createState(makeTunables());
  s.loadout = resolveLoadout([]);
  await initLevel(s, lvl);
  // exactly what the +2 pickup leaves behind ($4D70/$4D72/$4D91)
  s.player.hpMax = 16; s.player.hp = 16; s.flow.maxHpTaken = 0x01;
  return s;
};
const show = (tag, s) => console.log(
  `  ${tag.padEnd(24)} lvl=${String(s.level.number).padStart(2)}  hpMax=${String(s.player.hpMax).padStart(2)}` +
  `  hp=${String(s.player.hp).padStart(2)}  maxHpTaken=${s.flow.maxHpTaken}`);

console.log('=== CONTINUE (round select, mode 1) ===');
{
  const s = await mk(3);
  show('upgraded on level 3', s);
  const n = continueLevel(s);                 // $0482/$0498
  show('after continueLevel()', s);
  await initLevel(s, n);                      // what main.js's enterLevel does
  show('after the reload', s);
}

console.log('\n=== START a route from the menu ===');
{
  const s = await mk(3);
  show('upgraded on level 3', s);
  await initLevel(s, ROUTE_LEVEL[0]);
  show('after route 0 loads', s);
}

console.log('\n=== route clear that warps straight to level 12 ===');
{
  const s = await mk(11);
  s.flow.routeMask = 0x03;
  show('upgraded on level 11', s);
  const next = clearLevel(s);
  console.log(`  clearLevel -> ${next.to} ${next.level ?? ''}`);
  await initLevel(s, next.level);
  show('after level 12 loads', s);
}

console.log('\n=== ordinary walk-off (main.js carries these by hand) ===');
{
  const s = await mk(3);
  show('upgraded on level 3', s);
  const carried = { hp: s.player.hp, hpMax: s.player.hpMax };
  await initLevel(s, 4);
  s.player.hp = carried.hp; s.player.hpMax = carried.hpMax;
  show('after level 4 loads', s);
}
