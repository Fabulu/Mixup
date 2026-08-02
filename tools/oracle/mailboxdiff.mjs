// Port side of the $C6FB mailbox oracle.
//
// tools/oracle/mailbox.py records, off the cartridge, every sub_00_0AE1 call
// (id, mask, the slot it took, and how many driver ticks had already run) and
// every ISR tick (the cursor, and what it found). This replays the same
// posting schedule through src/sound/driver.js and requires:
//
//   * the SLOT each request lands in to agree -- that is $0AE5's first-free
//     scan, not an append;
//   * the TICK each request is consumed on to agree -- that is $096C's round
//     robin, not a drain in insertion order;
//   * the DROPS to agree -- $0B07 loses a request when all four slots are
//     taken, and a FIFO that is drained every tick never can.
//
//   python tools/oracle/mailbox.py --frames 1200 --level 1 --name L01
//   python tools/oracle/mailbox.py --frames 60 --level 12 --warp 90,27 --name L12FIRE
//   python tools/oracle/mailbox.py --frames 600 --level 12 --spam 0x17 --name SPAM12
//   node   tools/oracle/mailboxdiff.mjs --name L01
//   node   tools/oracle/mailboxdiff.mjs --all
//
// L12FIRE is level 12's shooter spamming cue $17 on ten consecutive frames --
// the case the whole fix is for. The cartridge LOSES one of them, and so now
// does the port, on the same request. SPAM12 drives the producer at one
// request per frame for 600 frames: 70 of 666 dropped on both sides.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();
const { loadSoundData, createDriver, request, tick } = await imp('src/sound/driver.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const dir = path.join(ROOT, 'rip', 'oracle');
const files = argv.includes('--all')
  ? fs.readdirSync(dir).filter((f) => /^mailbox_.*\.json$/.test(f)).map((f) => path.join(dir, f))
  : [path.join(dir, `mailbox_${arg('name', 'L01')}.json`)];

const data = await loadSoundData();
let failed = false;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`(no recording at ${path.relative(ROOT, file)} -- run tools/oracle/mailbox.py)`);
    failed = true;
    continue;
  }
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const drv = createDriver(data);
  drv.booted = true;                       // the cartridge booted long ago
  // The recording starts mid-run, so adopt the cursor the cartridge was on.
  // Everything else starts empty: any request still in flight from before the
  // window was consumed inside the first four ticks and is not in `posts`.
  drv.mailCursor = rec.reads.length ? rec.reads[0].cursor : 0;

  const byTick = new Map();
  rec.posts.forEach((p, i) => {
    if (!byTick.has(p.tick)) byTick.set(p.tick, []);
    byTick.get(p.tick).push(i);
  });

  const slotGot = new Array(rec.posts.length).fill(null);
  const consumedGot = new Array(rec.posts.length).fill(null);
  const liveSlot = new Map();              // slot -> post index

  for (let t = 0; t < rec.ticks; t++) {
    for (const i of byTick.get(t) ?? []) {
      const s = request(drv, rec.posts[i].id, rec.posts[i].mask);
      slotGot[i] = s < 0 ? null : s;
      if (s >= 0) liveSlot.set(s, i);
    }
    // What is this tick about to take? Read it before tick() clears the slot.
    const at = drv.mailCursor;
    const busy = drv.mail[at] !== 0 || drv.mail[at + 1] !== 0;
    const owner = liveSlot.get(at >> 1);
    tick(drv);
    if (busy && owner !== undefined) {
      consumedGot[owner] = t;
      liveSlot.delete(at >> 1);
    }
  }

  /**
   * $0AE1's slot scan runs with interrupts ENABLED -- only the two-byte write
   * at $0AF6-$0AFB sits inside a DI. So when the mailbox is saturated the timer
   * ISR can free a slot in the middle of the scan, and which of two
   * back-to-back requests gets it depends on where in the scan the interrupt
   * landed. That is instruction-level timing and out of scope by
   * docs/03-VERIFICATION.md §28, exactly like a lag frame.
   *
   * It shows up as a clean SWAP: the cartridge gave slot S to request i and
   * dropped i+1, the port did the reverse. Counted and named rather than
   * tolerated blindly -- anything that is not a swap still fails.
   */
  const swapped = (i, j) => {
    if (j < 0 || j >= rec.posts.length) return false;
    if (Math.abs(rec.posts[j].tick - rec.posts[i].tick) > 1) return false;
    return (rec.posts[j].slot ?? null) === slotGot[i]
        && (rec.posts[i].slot ?? null) === slotGot[j];
  };

  const rows = [];
  let bad = 0; let races = 0;
  const hist = {}; const histRom = {};
  let drops = 0; let dropsRom = 0;
  rec.posts.forEach((p, i) => {
    const okSlot = (p.slot ?? null) === slotGot[i];
    const okCons = (p.consumed ?? null) === consumedGot[i];
    if (p.slot === null) dropsRom++;
    if (slotGot[i] === null) drops++;
    if (p.consumed !== null && p.slot !== null) {
      const d = p.consumed - p.tick + 1;
      histRom[d] = (histRom[d] || 0) + 1;
    }
    if (consumedGot[i] !== null && slotGot[i] !== null) {
      const d = consumedGot[i] - p.tick + 1;
      hist[d] = (hist[d] || 0) + 1;
    }
    if (!okSlot || !okCons) {
      const race = swapped(i, i - 1) || swapped(i, i + 1);
      if (race) races++; else bad++;
      if (rows.length < 12) {
        rows.push(`  ${race ? 'RACE' : 'BAD '} #${i} t${p.tick} `
          + `$${p.id.toString(16)}/$${p.mask.toString(16)}  `
          + `slot rom=${p.slot} port=${slotGot[i]}  `
          + `consumed rom=${p.consumed} port=${consumedGot[i]}`);
      }
    }
  });

  const mean = (h) => {
    const n = Object.values(h).reduce((a, b) => a + b, 0);
    const s = Object.entries(h).reduce((a, [k, v]) => a + (+k) * v, 0);
    return n ? s / n : 0;
  };
  const fmt = (h) => '{' + Object.keys(h).sort().map((k) => `${k}:${h[k]}`).join(', ') + '}';
  const tag = path.basename(file).replace(/^mailbox_|\.json$/g, '');
  console.log(`${tag.padEnd(8)} ${String(rec.posts.length).padStart(4)} requests  `
    + `${bad ? `FAIL ${bad} mismatched` : 'MATCH'}`
    + (races ? `  (+${races} $0AE1/ISR scan races, §28)` : ''));
  console.log(`         latency rom ${fmt(histRom)} mean ${mean(histRom).toFixed(2)}`);
  console.log(`         latency port ${fmt(hist)} mean ${mean(hist).toFixed(2)}`);
  console.log(`         drops rom ${dropsRom}, port ${drops}`);
  for (const r of rows) console.log(r);
  if (bad) failed = true;
}

process.exit(failed ? 1 : 0);
