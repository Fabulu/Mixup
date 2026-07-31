// probe2.mjs -- second measurement pass: OAM rotation / 8-per-scanline drops /
// free-running counters / palette / the exact shape of the status-bar split.
//
// npm i jsnes ; node probe2.mjs <rom.nes> [frames] [--press START@200-210]
// All output is ROM-derived. Do not commit it.

import fs from "node:fs";
import { NES, Controller } from "jsnes";

const args = process.argv.slice(2);
const romPath = args[0];
const frames = parseInt(args[1] ?? "1200", 10);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
const BUTTONS = { A: Controller.BUTTON_A, B: Controller.BUTTON_B, SELECT: Controller.BUTTON_SELECT,
  START: Controller.BUTTON_START, UP: Controller.BUTTON_UP, DOWN: Controller.BUTTON_DOWN,
  LEFT: Controller.BUTTON_LEFT, RIGHT: Controller.BUTTON_RIGHT };
const presses = (opt("press", "") || "").split(",").filter(Boolean).map((s) => {
  const [b, r] = s.split("@"); const [a, z] = r.split("-");
  return { btn: BUTTONS[b.toUpperCase()], from: +a, to: z ? +z : +a };
});
const settle = parseInt(opt("settle", "400"), 10);   // ignore frames before this

const rom = fs.readFileSync(romPath);
const nes = new NES({ onFrame: () => {}, onAudioSample: () => {} });
nes.loadROM(Array.from(rom, (b) => String.fromCharCode(b)).join(""));

const cpu = nes.cpu, ppu = nes.ppu;
const hooks = new Map();
const hook = (a, cb) => hooks.set(a, cb);
const orig = cpu.emulate.bind(cpu);
let F = 0;
cpu.emulate = function () {
  const cb = hooks.get((cpu.REG_PC + 1) & 0xffff);
  if (cb) cb(cpu, nes, F);
  return orig();
};

// --- split geometry: where in the frame each step of the split happens
const split = { exitScan: new Map(), afterDelay: new Map(), scrollWrite: new Map(),
                chrWrite: new Map(), n: 0 };
const rec = (m, v) => m.set(v, (m.get(v) || 0) + 1);
const sc = () => nes.ppu.scanline - 21;
hook(0x9aaa, () => { split.n++; rec(split.exitScan, sc()); });   // spin just exited
hook(0x9aad, () => rec(split.afterDelay, sc()));                 // after JSR $8BC3
hook(0x9ab2, () => rec(split.scrollWrite, sc()));                // 1st STX $2005
hook(0x8aa1, (c) => { if (c.REG_Y === 2) rec(split.chrWrite, sc()); });

// --- NMI re-entry (lag) guard: $04 non-zero at NMI entry means the frame is dropped
let nmi = 0, dropped = 0;
hook(0x8073, (c, n) => { nmi++; if (n.cpu.mem[0x04] !== 0) dropped++; });

// --- zero page census, sampled at NMI entry (a stable point in the game's own loop)
const zpHist = Array.from({ length: 0x100 }, () => []);
hook(0x806a, (c, n) => { for (let a = 0; a < 0x100; a++) zpHist[a].push(n.cpu.mem[a]); });

// --- run
const oamFrames = [];
for (F = 0; F < frames; F++) {
  for (const p of presses) {
    if (F >= p.from && F <= p.to) nes.buttonDown(1, p.btn); else nes.buttonUp(1, p.btn);
  }
  nes.frame();
  if (F >= settle) {
    oamFrames.push({ f: F, oam: Uint8Array.from(nes.ppu.spriteMem),
      ptr2F: nes.cpu.mem[0x2f], ptr9C: nes.cpu.mem[0x9c], budget9F: nes.cpu.mem[0x9f] });
  }
}

const hx = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
const H = (s) => console.log("\n=== " + s + " ===");
console.log(`rom=${romPath} frames=${frames} settleAfter=${settle}`);

// ---------------------------------------------------------------- 1. split
H("status-bar split: measured PPU scanline of each step (jsnes scanline-21)");
const show = (label, m) => {
  const e = [...m].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([v, n]) => `${v} (x${n})`).join("  ");
  console.log(`  ${label.padEnd(34)} ${e}`);
};
console.log(`  frames that ran the split: ${split.n} / ${frames}`);
show("spin on $2002 bit6 exits at", split.exitScan);
show("after JSR $8BC3 (cycle padding)", split.afterDelay);
show("first STX $2005 lands at", split.scrollWrite);
show("CHR bank -> 1 lands at", split.chrWrite);

// ---------------------------------------------------------------- 2. lag
H("NMI re-entry guard ($04)");
console.log(`  NMI entries: ${nmi}   entries where $04 != 0 (frame's work dropped): ${dropped}`);

// ---------------------------------------------------------------- 3. counters
H("zero-page free-running counters (sampled at NMI entry $806A)");
const N = zpHist[0].length;
const lo = Math.max(0, N - 600);
for (let a = 0; a < 0x100; a++) {
  const v = zpHist[a].slice(lo);
  if (v.length < 10) continue;
  let inc1 = 0, dec1 = 0, changed = 0;
  const uniq = new Set(v);
  for (let i = 1; i < v.length; i++) {
    const d = (v[i] - v[i - 1]) & 0xff;
    if (d === 1) inc1++; else if (d === 0xff) dec1++;
    if (d !== 0) changed++;
  }
  const n = v.length - 1;
  if (inc1 / n > 0.95) console.log(`  $${hx(a)}  +1 every frame  (${inc1}/${n})  range seen ${uniq.size} values  <- FREE-RUNNING FRAME COUNTER`);
  else if (uniq.size > 200 && changed / n > 0.9) console.log(`  $${hx(a)}  ${uniq.size} distinct values, changes ${changed}/${n} frames  <- high-entropy, RNG candidate`);
}
H("value of each counter at the FIRST frame of gameplay (boot phase)");
{
  // first frame where the split runs is a good "gameplay has started" marker
  const first = Math.max(0, settle - zpHist[0].length + 0);
  console.log(`  (sample index ${settle} of ${N} NMI entries)`);
  for (const a of [0x00, 0x01, 0x02, 0x03, 0x04, 0x0d, 0x10, 0x11, 0x12, 0x13, 0x1b, 0x1e, 0x1f, 0x2d, 0x2f, 0x3e, 0x3f]) {
    const v = zpHist[a];
    console.log(`  $${hx(a)}  first=${hx(v[0])}  atNMI#100=${hx(v[100] ?? 0)}  atNMI#${settle}=${hx(v[settle] ?? 0)}  last=${hx(v[v.length - 1])}`);
  }
}

// ---------------------------------------------------------------- 4. OAM rotation
H("OAM base pointer rotation ($2F, written every frame at $8B45)");
{
  const s = oamFrames.slice(0, 12).map((r) => hx(r.ptr2F)).join(" ");
  console.log(`  $2F over 12 consecutive frames : ${s}`);
  const deltas = new Map();
  for (let i = 1; i < oamFrames.length; i++) {
    const d = (oamFrames[i].ptr2F - oamFrames[i - 1].ptr2F) & 0xff;
    deltas.set(d, (deltas.get(d) || 0) + 1);
  }
  console.log(`  per-frame delta histogram      : ` +
    [...deltas].sort((a, b) => b[1] - a[1]).map(([d, n]) => `+$${hx(d)} x${n}`).join("  "));
  const slots = new Set(oamFrames.map((r) => r.ptr2F >> 2));
  console.log(`  distinct starting OAM slots     : ${slots.size} of 64`);
}

// ---------------------------------------------------------------- 5. 8-per-line
H("hardware 8-sprites-per-scanline cut, applied to the OAM the game DMAs");
{
  const big = (nes.ppu.f_spriteSize === 1) ? 16 : 8;
  console.log(`  PPUCTRL sprite size at end of run: ${big}x${big === 16 ? 16 : 8}`);
  let worst = null, framesOver = 0, totalDropped = 0, maxDroppedOneFrame = 0;
  const dropSetByFrame = [];
  for (const r of oamFrames) {
    const perScan = new Int32Array(240);
    const dropped = new Set();
    let maxN = 0, maxScan = 0;
    for (let s = 0; s < 240; s++) {
      let found = 0;
      for (let i = 0; i < 64; i++) {           // OAM ORDER, first 8 win
        const y = r.oam[i * 4];
        if (y >= 0xef) continue;
        if (s >= y + 1 && s < y + 1 + big) {
          found++;
          if (found > 8) dropped.add(i);
        }
      }
      perScan[s] = found;
      if (found > maxN) { maxN = found; maxScan = s; }
    }
    if (maxN > 8) framesOver++;
    totalDropped += dropped.size;
    maxDroppedOneFrame = Math.max(maxDroppedOneFrame, dropped.size);
    dropSetByFrame.push([...dropped].sort((a, b) => a - b));
    if (!worst || maxN > worst.maxN) worst = { f: r.f, maxN, maxScan, dropped: [...dropped] };
  }
  console.log(`  frames sampled                         : ${oamFrames.length}`);
  console.log(`  frames with a scanline over 8 sprites  : ${framesOver}`);
  console.log(`  worst scanline seen                    : ${worst.maxN} sprites on scanline ${worst.maxScan} (frame ${worst.f})`);
  console.log(`  most sprites dropped in one frame      : ${maxDroppedOneFrame}`);
  console.log(`  first 8 frames' dropped-OAM-index sets :`);
  for (let i = 0; i < Math.min(8, dropSetByFrame.length); i++)
    console.log(`     frame ${oamFrames[i].f}: [${dropSetByFrame[i].join(",")}]`);
}

// ---------------------------------------------------------------- 6. OAM layout
H("OAM occupancy: which slots the emitter actually uses, and the step between them");
{
  const r = oamFrames[oamFrames.length - 1];
  const used = [];
  for (let i = 0; i < 64; i++) if (r.oam[i * 4] < 0xef) used.push(i);
  console.log(`  frame ${r.f}: ${used.length} visible sprites in slots [${used.join(",")}]`);
  console.log(`  Y byte values seen for hidden slots: ` +
    [...new Set(Array.from({ length: 64 }, (_, i) => r.oam[i * 4]).filter((y) => y >= 0xef))]
      .map(hx).join(" "));
  let minY = 255, maxY = 0, minX = 255, maxX = 0;
  for (const r2 of oamFrames) for (let i = 0; i < 64; i++) {
    const y = r2.oam[i * 4], x = r2.oam[i * 4 + 3];
    if (y >= 0xef) continue;
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  }
  console.log(`  visible-sprite Y range over run: $${hx(minY)}..$${hx(maxY)}   X range: $${hx(minX)}..$${hx(maxX)}`);
  const attrs = new Map();
  for (const r2 of oamFrames) for (let i = 0; i < 64; i++) {
    if (r2.oam[i * 4] >= 0xef) continue;
    const a = r2.oam[i * 4 + 2];
    attrs.set(a, (attrs.get(a) || 0) + 1);
  }
  console.log(`  attribute bytes seen: ` +
    [...attrs].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([a, n]) => `$${hx(a)}(pal${a & 3}${a & 0x20 ? "+bg" : ""}${a & 0x40 ? "+H" : ""}${a & 0x80 ? "+V" : ""})x${n}`).join(" "));
  const unusedBits = [...attrs.keys()].reduce((m, a) => m | a, 0);
  console.log(`  OR of all attribute bytes = $${hx(unusedBits)}  (bits 2-4 are unimplemented on the NES and read back as 0)`);
}

// ---------------------------------------------------------------- 7. palette
H("palette RAM $3F00-$3F1F at end of run");
{
  const v = nes.ppu.vramMem;
  let s = "  BG :"; for (let i = 0; i < 16; i++) s += " " + hx(v[0x3f00 + i]);
  console.log(s);
  s = "  SPR:"; for (let i = 0; i < 16; i++) s += " " + hx(v[0x3f10 + i]);
  console.log(s);
}
