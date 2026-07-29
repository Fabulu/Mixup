// Replay tools/oracle/punchreach.py's sweep against the PORT's hit tests.
//
// Cartridge side: rip/oracle/punchreach.json (hooked loc_00_2653/$271F/$272A
// and a forced jt_01_6107 attack tick). Port side: meleeHitTest() driven at
// the same probe-relative offsets, and _internals.attackProbe() on a fake
// record at the same world offsets from a pinned player. Exits non-zero on
// any point where the two envelopes disagree.
//
//   node tools/oracle/punchreach.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meleeHitTest, _internals, createEnemies } from '../../src/enemies.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const rec = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'rip', 'oracle', 'punchreach.json'), 'utf8'));

// A level of open air, wide enough for the world coordinates the sweeps use.
const cells = new Uint8Array(128 * 16 * 2);

function makeState(facing) {
  return {
    frame: 0x40,
    parity: 0,
    camera: { x: 0, y: 0 },
    player: {
      facing, dead: false, hp: 10, iframes: 0, halfW: 15, halfH: 16,
      x: 0x3080, y: 0x1700, vx: 0, vy: 0,
    },
    enemies: createEnemies(),
    level: { number: 3, bossId: 0, width: 128, cells },
    flow: { bossMode: 0, paused: false },
    tunables: { enemyStunFrames: 0x3C, meleeDamage: 2, critWindow: 8 },
    tables: {
      enemyContactDamage: [0x00, 0x02, 0x02, 0x02, 0x00, 0x00, 0x00,
                           0x01, 0x02, 0x01, 0x02, 0x81, 0x00],
      levelDamageBonus: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 1],
    },
    sound: { queue: [] },
  };
}

let bad = 0;
const report = (tag, key, val, cart, port) => {
  if (cart !== port) {
    bad++;
    console.log(`  MISMATCH ${tag} ${key}=${val}: cartridge=${cart} port=${port}`);
  }
};

// ---- punch envelope -------------------------------------------------------
// The recorded probe point is probeS = playerS + (±14, -5); replaying needs
// only the probe-relative offset. Place the probe at a fixed screen point and
// the fake enemy at probeS + (dx, dy), exactly as the hook did.
for (const e of rec.punch) {
  const st = makeState(e.facing);
  const P = 100;                       // probe screen X and Y
  const probeX = (P - 8) << 4;         // -> screenX = P with camera 0
  const probeY = (P - 0x10) << 4;      // -> screenY = P
  const r = st.enemies[0];
  r[0] = 0x80;
  r[2] = 0x01;
  r[7] = (P + e.dx) & 0xFF;
  r[8] = (P + e.dy) & 0xFF;
  r[0x0B] = rec.box.halfW;
  r[0x0C] = rec.box.halfH;
  r[0x16] = 40;
  const port = meleeHitTest(st, probeX, probeY) === 0xFF ? 'hit' : 'miss';
  const cart = e.result === 'hit' ? 'hit' : 'miss';
  report(e.phase, 'dx,dy', `${e.dx},${e.dy}`, cart, port);
}

// ---- enemy melee envelope -------------------------------------------------
for (const m of rec.melee) {
  const st = makeState(0);
  const p = st.player;
  const r = st.enemies[0];
  const ex = (p.x + m.dx * 16) & 0xFFFF;
  const ey = (p.y + m.dy * 16) & 0xFFFF;
  r[0] = 0x88;
  r[2] = 0x01;
  r[5] = m.dx > 0 ? 1 : 0;
  r[0x0E] = ex >> 8;
  r[0x0F] = ex & 0xFF;
  r[0x10] = ey >> 8;
  r[0x11] = ey & 0xFF;
  r[0x14] = 5;
  r[0x16] = 40;
  r[0x1E] = 0x0E;
  r[0x1F] = 0xF7;
  const port = _internals.attackProbe(st, r) === 0xFF ? true : false;
  report(m.phase, 'dx,dy', `${m.dx},${m.dy}`, m.hit, port);
}

const n = rec.punch.length + rec.melee.length;
if (bad) {
  console.log(`\n${bad}/${n} sweep points DISAGREE with the cartridge`);
  process.exit(1);
}
console.log(`all ${n} sweep points agree with the cartridge ` +
            `(${rec.punch.length} punch, ${rec.melee.length} melee)`);
