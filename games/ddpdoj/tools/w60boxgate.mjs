#!/usr/bin/env node
// WAVE 60 (I1) -- WHAT `$2459D0` UNBLOCKED, MEASURED, WITH A CONTROL.
//
//   node tools/w60boxgate.mjs [frames] [hold|tap|none] [--items N] [--json]
//
// W34's method, from the shipped bundle seed rather than from a trace: run the
// SAME frames with the SAME state and vary ONE thing, then report the pair.
// Here the varied thing is the input (fire vs no fire) and, for the ITEM
// half, an explicitly-labelled POKE.
//
// ======================== WHAT THIS TOOL CAN AND CANNOT SAY =================
//
//   * It is the PORT replayed against the shipped bundle seed.  **Nothing here
//     is compared against the board.**  No MAME was run.
//   * The fire input is an INTERVENTION (`docs/knowledge/09`): the shipped seed
//     is a no-button capture, so a firing run is valid for COVERAGE and invalid
//     for characterising play.
//   * `--items N` is a SECOND, LOUDER intervention.  Nothing in this port can
//     spawn an item -- `$27E812` is unported, wave I2 -- so the only way to
//     execute `$244D62`'s block 2 is to WRITE item records into `$816B7A` and
//     the live count into `$8171BA` by hand.  Every row produced under
//     `--items` says POKED.  It proves the block RUNS and flags; it proves
//     nothing about when the cartridge would put an item there.
//
// ============================ WHAT IT REPORTS ===============================
//
//   $2459D0 runs, split by ENTRY -- `$244D62` block 1 vs `$244D40`.  The split
//     is the point: `$81308C` is 1, so the tail alternates on `$80390C` and the
//     player-vs-bullet check runs at 59 Hz where the shot-vs-enemy check runs
//     at 30.
//   player flagged -- `$245A48 or.b #$10,(A4)` and `$244EC4 bset #$4,(A4)`,
//     which are the SAME bit and two different producers.
//   $249F8A -- whether the player-death path became reachable.  It is the bit
//     `src/player.js` throws on, and the invulnerability byte `($3e,A4)` is
//     what stands between the two; the tool prints that byte.
//   blocks 2/3/4 -- walks entered, records flagged, enemies rammed, and the HP
//     `$244ED2` actually removed.
//   THE LEDGER -- pending score, chain, meter, and every RANK word recon 59
//     §5 named: `$81B646` (the rank POWER term), `$81B64A` (the hyper EARN
//     accumulator), `$81B65C` (the hyper STOCK) and `$81309E` (rank itself).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { BIT } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { loadBundle } from '../src/web/assets.js';
import { DMG, bulletWindowSlots } from '../src/damage.js';

const ASSETS = fileURLToPath(new URL('../assets', import.meta.url));
const HOLD = portWordFromBits([BIT.b1]);
const NONE = 0xffff;

/** The words `20-OWNER-scoring-must-be-exact` makes semantics. */
export const LEDGER = {
  pending: 0x81b4c0, chain: 0x81b5da, meter: 0x81b5c0, meterCap: 0x81b5b2,
  rankPower: 0x81b646,   // $2608D2's power term -- recon 59 §5.1's 13-site word
  hyperEarn: 0x81b64a,   // $286774/$2867B4 accumulate; $287682 would spend it
  hyperStock: 0x81b65c,  // the word an item kind $C would raise
  rank: 0x81309e,        // $2608D2's output
  clk: 0x8130ce,
};

/**
 * THE POKE.  `n` item records into the six pools walked as one 25-slot array,
 * placed ON the player's current position so block 2's AABB must accept them.
 * Fields are recon 59 §1.2's: `+$00` status (bit 15 allocated | the kind),
 * `+$02`/`+$04` the position, `+$10`/`+$12` the half-extents ($0600 for every
 * kind, measured).  Nothing else is written, because nothing else is read by
 * `$244D94..$244DFE`.
 */
function pokeItems(ram, n, player) {
  const y = ram.u16(player + 0x02), x = ram.u16(player + 0x04);
  for (let i = 0; i < n; i++) {
    const rec = DMG.itemPool + i * DMG.itemStride;
    ram.setU16(rec + 0x00, 0x8000);
    ram.setU16(rec + 0x02, y);
    ram.setU16(rec + 0x04, x);
    ram.setU16(rec + 0x10, 0x0600);
    ram.setU16(rec + 0x12, 0x0600);
  }
  ram.setU16(DMG.itemCount, n);
}

export async function run({ frames = 3000, mode = 'tap', items = 0 } = {}) {
  const read = async (name) => new Uint8Array(fs.readFileSync(path.join(ASSETS, name)));
  const bundle = await loadBundle(read, { shards: 'all' });
  const g = new Game(bundle.seed, bundle.tables, {
    profile: bundle.profile,
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  const R = g.ram;
  const P1 = DMG.p1rec;

  const s = {
    frames: 0, err: null,
    boxPass: 0, boxD40: 0, flaggedByBullet: 0, flaggedByRam: 0,
    block2Walks: 0, itemsFlagged: 0,
    block3Walks: 0, impactsFlagged: 0,
    rams: 0, ramHp: 0, ramKills: 0,
    fa7eSet: 0, invulnValues: new Map(), windows: new Set(),
    itemPoolMax: 0, itemCountMax: 0, itemLeakFrames: 0,
    bit4Frames: 0,
  };

  for (let i = 0; i <= frames; i++) {
    R.setU8(0x810424, 0xff);                       // the page's own intervention
    if (items) pokeItems(R, items, P1);            // POKED -- see the header
    const inp = i === 0 ? NONE : (mode === 'hold' ? HOLD
      : mode === 'tap' ? ((i % 4 === 0) ? HOLD : NONE) : NONE);
    try { g.step(inp); } catch (e) { s.err = `step ${i}: ${e.message}`; break; }
    s.frames = i;

    const d = g.damageFrame?.player;
    if (d?.boxRun) {
      if (d.entry === DMG.passNoPlayer) s.boxD40++; else s.boxPass++;
      if (d.hitPlayer) s.flaggedByBullet++;
      if (d.rammed) { s.rams++; s.flaggedByRam++; }
      if (R.u16(DMG.itemCount) !== 0 && d.entry !== DMG.passNoPlayer) s.block2Walks++;
      if (R.u16(DMG.impactCount) !== 0 && d.entry !== DMG.passNoPlayer) s.block3Walks++;
      s.itemsFlagged += d.items ?? 0;
      s.impactsFlagged += d.impacts ?? 0;
    }
    if (R.u16(DMG.fa7e) !== 0) s.fa7eSet++;
    if ((R.u8(P1) & 0x10) !== 0) s.bit4Frames++;
    const inv = R.u8(P1 + 0x3e);
    s.invulnValues.set(inv, (s.invulnValues.get(inv) ?? 0) + 1);
    s.windows.add(bulletWindowSlots(R));

    // --- the ITEM POOL CENSUS, E5b's standard: every slot every frame, and the
    // count word reconciled against it.  This wave ALLOCATES FROM NO POOL, so
    // the honest result is that the census never moves unless --items poked it.
    let live = 0;
    for (let k = 0; k < 25; k++) {
      if (R.u16(DMG.itemPool + k * DMG.itemStride) !== 0) live++;
    }
    if (live > s.itemPoolMax) s.itemPoolMax = live;
    const cw = R.u16(DMG.itemCount);
    if (cw > s.itemCountMax) s.itemCountMax = cw;
    if (cw !== live) s.itemLeakFrames++;

    // --- ram damage, taken from the block itself rather than inferred: the
    // record `$244ED2` decremented, its HP before and after.  An inferred
    // version over-counted, because a shot can kill on the same frame.
    if (d?.ram) {
      s.ramHp++;
      if ((d.ram.hp0 & 0x8000) === 0 && (d.ram.hp1 & 0x8000) !== 0) s.ramKills++;
    }
  }

  const L = {};
  for (const [k, a] of Object.entries(LEDGER)) L[k] = R.u16(a);
  return {
    mode, items, ...s,
    invuln: [...s.invulnValues].map(([v, n]) => `$${v.toString(16)}x${n}`).join(' '),
    windows: [...s.windows].join(','),
    kills: g.kills.n, killScore: g.kills.score,
    ledger: L,
    throws: [...g.unportedLog.calls.entries()]
      .filter(([k]) => /^\$(249F8A|24A130|2459D0|244D40)/.test(k))
      .map(([k, n]) => `${n} x ${k}`),
  };
}

function fmt(r) {
  const L = r.ledger;
  return [
    `MODE ${r.mode}${r.items ? `  --items ${r.items} (POKED)` : ''}  frames ${r.frames}`
      + (r.err ? `   STOPPED: ${r.err}` : ''),
    `  $2459D0 runs      ${r.boxPass} via $244D62 block 1 + ${r.boxD40} via $244D40`
      + `  = ${r.boxPass + r.boxD40}`,
    `  player FLAGGED    ${r.flaggedByBullet} by a bullet ($245A48), `
      + `${r.flaggedByRam} by a ram ($244EC4);  $80FA7E set on ${r.fa7eSet} frames`,
    `  ($3e,A4) invuln   ${r.invuln}      bit 4 held on ${r.bit4Frames} frames`,
    `  bullet window     ${r.windows} slots`,
    `  BLOCK 2 (items)   ${r.block2Walks} walks, ${r.itemsFlagged} records flagged`,
    `  BLOCK 3 (impact)  ${r.block3Walks} walks, ${r.impactsFlagged} records flagged`,
    `  BLOCK 4 (ram)     ${r.rams} rams, ${r.ramHp} HP removed, ${r.ramKills} kills`,
    `  ITEM POOL CENSUS  max live ${r.itemPoolMax} of 25, max $8171BA `
      + `${r.itemCountMax}, count-vs-slots disagreements ${r.itemLeakFrames}`,
    `  kills / score     ${r.kills} / ${r.killScore}`,
    `  LEDGER            pending $${L.pending.toString(16)} chain ${L.chain} `
      + `meter ${L.meter}/${L.meterCap} clk ${L.clk}`,
    `  RANK WORDS        $81B646=${L.rankPower} $81B64A=${L.hyperEarn} `
      + `$81B65C=${L.hyperStock} $81309E=${L.rank}`,
    r.throws.length ? `  NOTED             ${r.throws.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')
  || process.argv[1]?.endsWith('w60boxgate.mjs')) {
  const argv = process.argv.slice(2);
  const frames = Number(argv.find((a) => /^\d+$/.test(a)) ?? 3000);
  const mode = argv.find((a) => ['hold', 'tap', 'none'].includes(a)) ?? 'tap';
  const iAt = argv.indexOf('--items');
  const items = iAt >= 0 ? Number(argv[iAt + 1]) : 0;
  const r = await run({ frames, mode, items });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else console.log(fmt(r));
}
