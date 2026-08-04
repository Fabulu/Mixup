#!/usr/bin/env node
// WAVE 34 -- THE DAMAGE REACHABILITY SURVEY.
//
//   node tools/w34damagegate.mjs <trace.tsv> <seed.bin> --seed-lf N [--frames N]
//                                [--fire 20] [--no-fire] [--poke a=v,...]
//
// W33 §3 measured the wall this wave exists to move:
//
//   "the midboss $0D triggers at clk $00C5 = 197; it HALTS THE SCROLL until it
//    is killed; the port cannot kill anything, so the deepest clock any port
//    run can reach is 239.  Eight of the nine remaining stage-1 handlers have
//    their FIRST TRIGGER at clk 283, 322, 420, 424, 464, 481, 488..."
//
// So "did damage land" is not the question.  The question is **how far up the
// distance clock `$8130CE` can a port run now get, and which spawn records come
// into range**, and that is what this tool reports:
//
//   * MAX CLK -- the highest `$8130CE` the replay reached.
//   * every unported stage-1 handler, its FIRST TRIGGER CLOCK read out of the
//     spawn script at replay time (not a constant in this file), and whether
//     that clock is now inside the run.  **The denominator is read from the ROM
//     on every run**, so it cannot rot the way a hardcoded 8 would.
//   * BLOCKED BY -- the loud named throw that stopped the run, which for an
//     unported handler IS the evidence that it executed (W29 set that
//     precedent: `Unreached $275914`, 345 frames in).
//   * the ledger: P1's pending score `$81B4C0` (packed BCD), the chain counter
//     `$81B5DA`, the meter `$81B5C0` and its cap `$81B5B2`.
//
// ================= THE FIRING INPUT IS AN INTERVENTION, NAMED ===============
//
// `fly-around` is the only 2,200-frame port-vs-board window this project has,
// and **it never fires** -- "NO BUTTONS, and that is the whole design of this
// scenario" (its own `why`).  A run with no shots cannot damage anything, so
// this tool ANDs a synthetic Button-1 tap into the recorded port word.
//
// `docs/knowledge/09`: that makes it valid for COVERAGE and invalid for
// characterising play, and this file says so rather than leaving it to a
// reader.  Specifically:
//
//   * the taps are SINGLE-FRAME, every `--fire` logic frames (default 20), the
//     cadence `stage1-shot` measured.  A HOLD would enter the option object's
//     laser speed ramp and throw at `$24C164` -- a real gap, not this wave's.
//   * `--no-fire` reproduces the recorded input exactly and is the CONTROL: it
//     must give the same MAX CLK the port gave before this wave.
//   * nothing here is compared against the board.  This is a census.

import { readFileSync } from 'node:fs';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { SPAWN, REC, stageIndex, stageTableEntry } from '../src/spawn.js';
import { handlerMap } from '../src/handlers.js';
import { SHIP_MUTATE } from '../src/shipsprite.js';
import { freeEnemy } from '../src/initbody.js';

const FIRE_WORD = portWordFromBits([BIT.b1]);
const AUTO_WORD = portWordFromBits([BIT.b3]);

function readTsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const f = l.split('\t');
    const o = {};
    head.forEach((h, i) => { o[h] = f[i]; });
    return o;
  });
}

/**
 * THE DENOMINATOR, read out of the cartridge at run time.
 *
 * Walks stage 1's spawn script (8-byte records, `$FFFF` terminator), resolves
 * every record's type through the dispatcher's two half-tables, and returns one
 * row per DISTINCT HANDLER: its record count, its types, and the LOWEST trigger
 * clock any of its records carries.  That last number is the whole point --
 * a handler is reachable exactly when the run's clock passes it.
 */
export function stage1Handlers(rom, ram) {
  const st = stageTableEntry(rom, stageIndex(ram)).script;
  const out = new Map();
  for (let a = st; ; a += 8) {
    const trig = rom.u16(a + REC.trig);
    if (trig === 0xffff) break;
    const t = rom.u8(a + REC.type);
    const ent = (t < 0x80 ? SPAWN.TYPE_LO + t * SPAWN.TYPE_STRIDE
      : SPAWN.TYPE_HI + (t - 0x80) * SPAWN.TYPE_STRIDE);
    const h = rom.u32(ent + 4);
    let e = out.get(h);
    if (!e) { e = { recs: 0, types: new Set(), firstClk: 0xffff }; out.set(h, e); }
    e.recs++;
    e.types.add(t);
    if (trig < e.firstClk) e.firstClk = trig;
  }
  return out;
}

export function survey(tsvPath, seedPath, tablesPath, opts = {}) {
  const rows = readTsv(tsvPath);
  const seed = new Uint8Array(readFileSync(seedPath));
  const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
  const byLf = new Map(rows.map((r) => [Number(r.lf), r]));
  const seedLf = opts.seedLf ?? Number(rows[0].lf);
  const start = byLf.get(seedLf);
  if (!start) throw new Error(`the trace has no logic frame ${seedLf}`);
  if (start.portin === undefined) {
    throw new Error('the trace has no `portin` column');
  }
  let game = new Game(seed, tables, {
    logicFrame: seedLf, videoFrame: Number(start.vf),
  });
  const pokes = (opts.poke ?? '').split(',').filter(Boolean).map((kv) => {
    const [a, v] = kv.split('=');
    return [parseInt(a, 16), parseInt(v, 16)];
  });
  // ------------------------------------------------------------ --no-pods
  // The OPTION OBJECT ($24C096, type-5 call #9) throws at `$24C164` on the
  // FIRST frame Button 1's RAW bit is held -- the laser gate, W12's fix to
  // wave 9's narrowed throw, and a genuine unported subsystem.  A single-frame
  // tap holds the raw bit for that frame, so a firing survey cannot run with
  // the option object live.  `no-option-object` is `src/type5.js`'s OWN
  // declared mutation (wave 11's behaviour restored): the call is COUNTED and
  // not run.  It costs the pods' shots -- slots 7..12 of the shot table, which
  // also damage enemies -- so this survey UNDERSTATES the board's damage rate
  // and says so.
  const savedMutate = SHIP_MUTATE.value;
  if (opts.noPods) SHIP_MUTATE.value = 'no-option-object';
  const handlers = stage1Handlers(game.rom, game.ram);
  // ---------------------------------------------------------- --stub-unported
  // A COVERAGE INTERVENTION, and `docs/knowledge/09` is explicit about what it
  // is worth: "valid evidence for what does this code do GIVEN this state, and
  // invalid evidence for this is what the game does."
  //
  // Without it the survey stops at the FIRST unported handler the clock brings
  // into range, and one loud throw cannot answer "how many of the eight".  With
  // it each unported handler is registered as a stub that COUNTS its dispatch
  // and then frees the enemy -- which is exactly what the cartridge's own dummy
  // handler `$26781C` does (`jmp $263762`) for a type that has none.
  //
  // The enemies it frees would have DONE something, so everything downstream of
  // the first stub is off-distribution.  The number this produces is therefore
  // "how many of the eight does the clock reach", NOT "the port plays the stage".
  const stubbed = new Map();
  const savedHandlers = new Map();
  if (opts.stub) {
    const HM = handlerMap(game.rom);
    for (const [h] of handlers) {
      if (HM.has(h)) continue;
      savedHandlers.set(h, HM.get(h));
      HM.set(h, (ram, rom2, a5) => {
        stubbed.set(h, (stubbed.get(h) ?? 0) + 1);
        freeEnemy(ram, a5);
      });
    }
    // `makeType5` snapshots `handlerMap()` when the Game is built, so the stubs
    // have to be in place BEFORE construction.  Rebuild from the same seed.
    game = new Game(seed, tables, {
      logicFrame: seedLf, videoFrame: Number(start.vf),
    });
  }
  try {

  let ran = 0, blocked = null, lf = seedLf, maxClk = 0, hits = 0, taps = 0;
  const clkAt = [];
  for (lf = seedLf + 1; ; lf++) {
    const row = byLf.get(lf);
    // ------------------------------------------------------------- --free
    // FREE RUN.  Without `--free` the survey stops where the recorded trace
    // stops, which for `fly-around` is lf4200 -- 2,200 frames, and the midboss
    // is alive for the last 1,100 of them.  `--free N` keeps stepping past the
    // end of the trace with a SYNTHESISED input and no board rows at all.  It
    // is the same construction W19 §2.3 used (`freerun.mjs`, 13,000 frames from
    // the port's own state) and it carries the same caveat: nothing is compared,
    // and the numbers are the PORT's, not the cartridge's.
    if (!row && !opts.free) break;
    if (opts.frames && ran >= opts.frames) break;
    if (opts.free && ran >= opts.free) break;
    for (const [a, val] of pokes) game.ram.setU8(a, val);
    let word = row ? Number(row.portin) : 0xffff;
    // THE OWNER'S OWN SCRIPT, `docs/knowledge/09`'s last section: "sit
    // bottom-centre, hold the shot or laser, and move left and right a little.
    // That is enough to kill most of what appears without needing a route."
    // `--stick` is that, minus the hold (which throws at $24C164): DOWN every
    // frame to pin the bottom wall, and a slow left-right sweep on a 512-frame
    // cycle so the ship crosses everything the stage puts in front of it.
    if (opts.stick) {
      const bits = [BIT.down];
      bits.push((ran % 512) < 256 ? BIT.right : BIT.left);
      word &= portWordFromBits(bits);
    }
    if (opts.auto) { word &= AUTO_WORD; taps++; }
    else if (opts.fire && (lf % opts.fire) === 0) { word &= FIRE_WORD; taps++; }
    try {
      game.step(word);
    } catch (e) {
      if (e.name !== 'Unreached') throw e;
      blocked = { lf, addr: e.romAddress, message: e.message };
      break;
    }
    ran++;
    const clk = game.ram.u16(0x8130ce);
    if (clk > maxClk) { maxClk = clk; clkAt.push([clk, lf]); }
    const d = game.damageFrame;
    if (d) hits += d.hitsA + d.hitsB;
  }
  return { game, ran, blocked, from: seedLf + 1, to: lf - 1, maxClk, hits,
    taps, handlers, clkAt, stubbed };
  } finally {
    SHIP_MUTATE.value = savedMutate;
    const HM = handlerMap(game.rom);
    for (const [h] of savedHandlers) HM.delete(h);
  }
}

function bcd(v) { return v.toString(16).padStart(8, '0'); }

function main(argv) {
  const [tsv, seedBin] = argv;
  const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
  const seedLf = argv.includes('--seed-lf') ? Number(arg('--seed-lf')) : undefined;
  const frames = Number(arg('--frames', 0));
  const fire = argv.includes('--no-fire') ? 0 : Number(arg('--fire', 20));
  const poke = arg('--poke', '');
  const tables = arg('--tables',
    new URL('../rip/port/player.tables.json', import.meta.url).pathname
      .replace(/^\/([A-Za-z]:)/, '$1'));
  const r = survey(tsv, seedBin, tables, { seedLf, frames, fire, poke,
    auto: argv.includes('--auto'), noPods: argv.includes('--no-pods'),
    free: Number(arg('--free', 0)), stick: argv.includes('--stick'),
    stub: argv.includes('--stub-unported') });

  console.log(`FRAMES ${r.ran} stepped (lf${r.from}..lf${r.to})`);
  console.log(`INPUT  ${fire ? `recorded stick + a single-frame Button-1 tap `
    + `every ${fire} logic frames (${r.taps} taps) -- AN INTERVENTION, valid `
    + `for coverage only` : 'the recorded input, unmodified (the CONTROL)'}`);
  console.log(`HITS   ${r.hits} shot-vs-enemy overlaps damaged an enemy`);
  const k = r.game.kills;
  console.log(`KILLS  ${k.n} enemies reached $28615E, carrying `
    + `${[...k.byValue.entries()].sort((a, b) => a[0] - b[0])
      .map(([v, n]) => `${v.toString(16)}x${n}`).join(' ') || '-'}`);
  console.log(`MAXCLK $${r.maxClk.toString(16).toUpperCase()} = ${r.maxClk}`
    + `   (the distance clock $8130CE)`);
  if (r.blocked) {
    console.log(`BLOCKED at lf${r.blocked.lf} by $${
      (r.blocked.addr ?? 0).toString(16).toUpperCase()}`);
    console.log(`        ${r.blocked.message.split('\n')[0]}`);
  } else {
    console.log('BLOCKED no -- the whole window ran');
  }
  const ported = new Set(handlerMap(r.game.rom).keys());
  const rows = [...r.handlers.entries()].sort((a, b) => a[1].firstClk - b[1].firstClk);
  const un = rows.filter(([h]) => !ported.has(h));
  const inRange = un.filter(([, e]) => e.firstClk <= r.maxClk);
  console.log(`HANDLERS ${rows.length} distinct in stage 1's script; `
    + `${rows.length - un.length} ported, ${un.length} not`);
  console.log(`REACHABLE ${inRange.length} of ${un.length} unported handlers `
    + `have a record at or below clk ${r.maxClk}`);
  if (argv.includes('--stub-unported')) {
    console.log('STUBBED   -- a COVERAGE INTERVENTION (docs/knowledge/09): each '
      + 'unported handler counts its dispatch and frees the enemy, as the '
      + "cartridge's own dummy handler $26781C does. Everything after the first "
      + 'stub is off-distribution.');
  }
  for (const [h, e] of un) {
    const types = [...e.types].map((t) => '$' + t.toString(16).toUpperCase());
    console.log(`  $${h.toString(16).toUpperCase()}  first clk `
      + `${String(e.firstClk).padStart(4)}  ${String(e.recs).padStart(3)} recs`
      + `  types ${types.join(' ').padEnd(10)}`
      + `  ${e.firstClk <= r.maxClk ? 'IN RANGE' : 'beyond  '}`
      + `  ${r.stubbed.has(h) ? `EXECUTED x${r.stubbed.get(h)} <<<` : ''}`);
  }
  const ram = r.game.ram;
  console.log('LEDGER P1 pending $81B4C0 = ' + bcd(ram.u32(0x81b4c0))
    + `  chain $81B5DA = ${ram.u16(0x81b5da).toString(16)}`
    + `  meter $81B5C0 = ${ram.u16(0x81b5c0)}`
    + `  cap $81B5B2 = ${ram.u16(0x81b5b2)}`);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
