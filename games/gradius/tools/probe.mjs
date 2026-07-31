// probe.mjs -- headless NES measurement harness for Gradius.
//
// Purpose: answer the "does Gradius actually use this hardware feature" half of
// the platform questions by RUNNING the cartridge, not by reading the listing.
//
// Requires: npm i jsnes   (pure JS, no compiler, no GUI, deterministic)
// Usage:    node probe.mjs <rom.nes> [frames] [--press START@120,...] [--what a,b,c]
//
// Everything it prints is measured. Output is ROM-derived: do not commit it.

import fs from "node:fs";
import { NES, Controller } from "jsnes";

const args = process.argv.slice(2);
const romPath = args[0];
const frames = parseInt(args[1] ?? "600", 10);
const opt = (name, def) => {
  const i = args.indexOf("--" + name);
  return i === -1 ? def : args[i + 1];
};
const what = new Set((opt("what", "all")).split(","));
const on = (k) => what.has("all") || what.has(k);

// ---- press script: BUTTON@frame[-frame] , ...
const BUTTONS = {
  A: Controller.BUTTON_A, B: Controller.BUTTON_B,
  SELECT: Controller.BUTTON_SELECT, START: Controller.BUTTON_START,
  UP: Controller.BUTTON_UP, DOWN: Controller.BUTTON_DOWN,
  LEFT: Controller.BUTTON_LEFT, RIGHT: Controller.BUTTON_RIGHT,
};
const presses = [];
for (const spec of (opt("press", "") || "").split(",").filter(Boolean)) {
  const [btn, range] = spec.split("@");
  const [a, b] = range.split("-");
  presses.push({ btn: BUTTONS[btn.toUpperCase()], from: +a, to: b ? +b : +a });
}

const rom = fs.readFileSync(romPath);
const romStr = Array.from(rom, (b) => String.fromCharCode(b)).join("");

let lastFrameBuf = null;
const nes = new NES({
  onFrame: (fb) => { lastFrameBuf = fb; },
  onAudioSample: () => {},
});
nes.loadROM(romStr);

// ---------------------------------------------------------------- exec hooks
const hooks = new Map();          // addr -> {count, cb}
const hook = (addr, cb) => hooks.set(addr, { count: 0, cb });
const cpu = nes.cpu;
const origEmulate = cpu.emulate.bind(cpu);
let curFrame = 0;
cpu.emulate = function () {
  const pc = (cpu.REG_PC + 1) & 0xffff;
  const h = hooks.get(pc);
  if (h) { h.count++; if (h.cb) h.cb(cpu, nes, curFrame); }
  return origEmulate();
};

// ---------------------------------------------------------------- probes
const stats = {
  spr0PollIters: 0, spr0PollFrames: 0, spr0HitScan: new Map(),
  chrWrites: [], chrWriteFrames: new Set(),
  nmiEntries: 0, nmiSkipped: 0,
  oamDma: 0,
  perScanlineMax: new Map(),   // frame -> {scan, count}
  overflowFrames: 0,
  vblankPoll: 0,
};

// $9AA3  LDA $2002 / AND #$40 / BEQ $9AA3   -- the sprite-0-hit spin
hook(0x9aa3, () => { stats.spr0PollIters++; });
// $9AAD  the instruction right after the spin exits
hook(0x9aad, (c, n, f) => {
  stats.spr0PollFrames++;
  const scan = n.ppu.scanline - 21;
  stats.spr0HitScan.set(scan, (stats.spr0HitScan.get(scan) || 0) + 1);
});
// $8AA1  STA $8AA8,Y  -- the CNROM bank register write
hook(0x8aa1, (c, n, f) => {
  const y = c.REG_Y;
  const addr = 0x8aa8 + y;
  const val = n.mmap.load(addr);
  stats.chrWrites.push({ frame: f, y, addr, val, bank: val & 3, scan: n.ppu.scanline - 21 });
  stats.chrWriteFrames.add(f);
});
// $806A NMI entry, $80B7 the "skip everything" exit, $8087 OAM DMA
hook(0x806a, () => { stats.nmiEntries++; });
hook(0x8087, () => { stats.oamDma++; });
hook(0x8075, (c) => { if (c.REG_ACC !== 0) {} });   // placeholder
hook(0x80b7, () => {});

// count NMI frames where $04 != 0 on entry (a dropped/lag frame)
hook(0x8073, (c, n) => { if (n.cpu.mem[0x04] !== 0) stats.nmiSkipped++; });

// ---------------------------------------------------------------- run
function setButtons(f) {
  for (const p of presses) {
    if (f >= p.from && f <= p.to) nes.buttonDown(1, p.btn);
    else nes.buttonUp(1, p.btn);
  }
}

const perFrame = [];
for (curFrame = 0; curFrame < frames; curFrame++) {
  setButtons(curFrame);
  nes.frame();

  // sprites-per-scanline census from the OAM shadow the game DMAs
  const oam = nes.ppu.spriteMem;
  const counts = new Int32Array(240);
  const big = (nes.ppu.f_spriteSize === 1) ? 16 : 8;
  let live = 0;
  for (let i = 0; i < 64; i++) {
    const y = oam[i * 4];
    if (y >= 0xef) continue;      // conventional "hidden" values
    live++;
    for (let s = y + 1; s < y + 1 + big && s < 240; s++) counts[s]++;
  }
  let maxScan = 0, maxN = 0, over = 0;
  for (let s = 0; s < 240; s++) {
    if (counts[s] > maxN) { maxN = counts[s]; maxScan = s; }
    if (counts[s] > 8) over++;
  }
  perFrame.push({
    f: curFrame,
    mode: nes.cpu.mem[0x00], frameCtr: nes.cpu.mem[0x02], nmiFlag: nes.cpu.mem[0x04],
    scrollX: nes.cpu.mem[0x12], scrollY: nes.cpu.mem[0x13],
    ctrlShadow: nes.cpu.mem[0x10], maskShadow: nes.cpu.mem[0x11],
    chrIdx: nes.cpu.mem[0x2d], splitFlag: nes.cpu.mem[0x1e], splitPhase: nes.cpu.mem[0x1f],
    liveSprites: live, maxPerScan: maxN, maxScan, scansOver8: over,
    spr0: [oam[0], oam[1], oam[2], oam[3]],
  });
  if (over > 0) stats.overflowFrames++;
}

// ---------------------------------------------------------------- report
const H = (s) => console.log("\n=== " + s + " ===");
console.log(`rom=${romPath}  frames=${frames}  presses=${JSON.stringify(presses)}`);

if (on("frames")) {
  H("per-frame state (every 30th frame)");
  console.log("  f  mode ctr nmi sX sY ctrl mask chr spl phase live max@scan >8  spr0(Y,tile,attr,X)");
  for (const r of perFrame) {
    if (r.f % 30 && r.f !== frames - 1) continue;
    console.log(
      `${String(r.f).padStart(4)}  ${hex(r.mode)}  ${hex(r.frameCtr)} ${hex(r.nmiFlag)} ` +
      `${hex(r.scrollX)} ${hex(r.scrollY)} ${hex(r.ctrlShadow)}  ${hex(r.maskShadow)}  ` +
      `${hex(r.chrIdx)}  ${hex(r.splitFlag)}  ${hex(r.splitPhase)}   ` +
      `${String(r.liveSprites).padStart(3)}  ${String(r.maxPerScan).padStart(3)}@${String(r.maxScan).padStart(3)} ` +
      `${String(r.scansOver8).padStart(3)}  ${r.spr0.map(hex).join(" ")}`);
  }
}

if (on("spr0")) {
  H("sprite-0 hit split");
  console.log(`  frames that reached the spin exit : ${stats.spr0PollFrames} / ${frames}`);
  console.log(`  total spin iterations             : ${stats.spr0PollIters}`);
  console.log(`  mean iterations per split frame   : ${(stats.spr0PollIters / Math.max(1, stats.spr0PollFrames)).toFixed(1)}`);
  console.log(`  emulator scanline at spin exit    :`);
  for (const [s, n] of [...stats.spr0HitScan].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`      scanline ${String(s).padStart(4)}  x${n}`);
}

if (on("chr")) {
  H("CNROM CHR bank register writes ($8AA1 STA $8AA8,Y)");
  console.log(`  total writes: ${stats.chrWrites.length} over ${stats.chrWriteFrames.size} frames`);
  const byY = new Map();
  for (const w of stats.chrWrites) {
    const k = `Y=${w.y} addr=$${w.addr.toString(16)} val=$${w.val.toString(16)} bank=${w.bank}`;
    byY.set(k, (byY.get(k) || 0) + 1);
  }
  for (const [k, n] of byY) console.log(`    ${k}   x${n}`);
  console.log("  first 12 writes with the emulator scanline they happened on:");
  for (const w of stats.chrWrites.slice(0, 12))
    console.log(`    frame ${String(w.frame).padStart(4)}  scanline ${String(w.scan).padStart(4)}  bank ${w.bank}`);
}

if (on("sprites")) {
  H("sprites per scanline (over the whole run, from the OAM the game DMAs)");
  let worstF = null;
  for (const r of perFrame) if (!worstF || r.maxPerScan > worstF.maxPerScan) worstF = r;
  console.log(`  frames with at least one scanline over 8 sprites : ${stats.overflowFrames} / ${frames}`);
  console.log(`  worst frame  : ${worstF.f}  ->  ${worstF.maxPerScan} sprites on scanline ${worstF.maxScan}`);
  console.log(`  live sprites (Y < $EF) range: ` +
    `${Math.min(...perFrame.map(r => r.liveSprites))} .. ${Math.max(...perFrame.map(r => r.liveSprites))}`);
}

if (on("oam")) {
  H("final OAM (64 x 4 bytes) as DMAed from $0200");
  const oam = nes.ppu.spriteMem;
  for (let i = 0; i < 64; i++) {
    const [y, t, a, x] = [oam[i * 4], oam[i * 4 + 1], oam[i * 4 + 2], oam[i * 4 + 3]];
    const attr = `pal${a & 3}${a & 0x20 ? " BEHIND-BG" : ""}${a & 0x40 ? " FLIPH" : ""}${a & 0x80 ? " FLIPV" : ""}`;
    console.log(`  #${String(i).padStart(2)} $0${(0x200 + i * 4).toString(16)}  Y=${hex(y)} tile=${hex(t)} attr=${hex(a)} X=${hex(x)}   ${attr}` +
      (y >= 0xef ? "   (hidden)" : ""));
  }
}

if (on("pal")) {
  H("palette RAM at end of run (PPU $3F00-$3F1F)");
  const v = nes.ppu.vramMem;
  const row = (base, label) => {
    let s = `  ${label} `;
    for (let i = 0; i < 16; i++) s += hex(v[base + i]) + " ";
    console.log(s);
  };
  row(0x3f00, "BG  $3F00:");
  row(0x3f10, "SPR $3F10:");
  console.log("  jsnes mirrored copies: imgPalette=" +
    Array.from(nes.ppu.imgPalette ?? []).length + " sprPalette=" +
    Array.from(nes.ppu.sprPalette ?? []).length);
}

if (on("pix")) {
  H("framebuffer sanity (last frame)");
  const fb = lastFrameBuf;
  const uniq = new Set();
  for (let i = 0; i < fb.length; i++) uniq.add(fb[i]);
  console.log(`  pixels=${fb.length}  distinct colours=${uniq.size}`);
  // row-average brightness every 16 scanlines, so a "blank screen" is obvious
  for (let y = 0; y < 240; y += 16) {
    let sum = 0;
    for (let x = 0; x < 256; x++) { const p = fb[y * 256 + x]; sum += (p & 255) + ((p >> 8) & 255) + ((p >> 16) & 255); }
    console.log(`    scanline ${String(y).padStart(3)}  mean RGB ${(sum / 768).toFixed(1)}`);
  }
}

if (on("hooks")) {
  H("execution-hook counts (proof the emulator gives us hooks)");
  for (const [a, h] of hooks) console.log(`  $${a.toString(16).toUpperCase()}  executed ${h.count} times`);
}

function hex(n) { return (n & 0xff).toString(16).toUpperCase().padStart(2, "0"); }
