// probe3.mjs -- palette / VRAM-queue / mid-frame register write census.
import fs from "node:fs";
import { NES, Controller } from "jsnes";
const romPath = process.argv[2], frames = +(process.argv[3] ?? 1100);
const nes = new NES({ onFrame: () => {}, onAudioSample: () => {} });
nes.loadROM(Array.from(fs.readFileSync(romPath), (b) => String.fromCharCode(b)).join(""));
const cpu = nes.cpu, hooks = new Map(), hook = (a, cb) => hooks.set(a, cb);
const orig = cpu.emulate.bind(cpu); let F = 0;
cpu.emulate = function () { const cb = hooks.get((cpu.REG_PC + 1) & 0xffff); if (cb) cb(cpu, nes, F); return orig(); };
const hx = (n, w = 2) => (n >>> 0).toString(16).toUpperCase().padStart(w, "0");

// --- every $2006 address the VRAM-update queue ($0700) programs
const vramAddrs = new Map(); const palFrames = new Set(); let queueHi = 0;
hook(0x8a69, (c) => { queueHi = c.REG_ACC; });                     // STA $2006 (high)
hook(0x8a70, (c, n, f) => {
  const a = (queueHi << 8) | c.REG_ACC;
  const bucket = a & 0xff00;
  vramAddrs.set(bucket, (vramAddrs.get(bucket) || 0) + 1);
  if (a >= 0x3f00 && a <= 0x3fff) { palFrames.add(f); palLog.push({ f, a }); }
});
const palLog = [];
// --- $2001 (PPUMASK) writes: value + scanline
const maskW = []; const ctrlW = new Map();
for (const a of [0x807f, 0x8096, 0x833b, 0x852b, 0x85c1, 0x9878, 0xb77f])
  hook(a, (c, n, f) => maskW.push({ f, pc: a, v: a === 0xb77f ? c.REG_Y : c.REG_ACC, scan: n.ppu.scanline - 21 }));
for (const a of [0x807c, 0x81b9, 0x829d, 0x832f, 0x8338, 0x8528, 0x85b6, 0x8a5f, 0x8a82, 0x9abc])
  hook(a, (c, n, f) => { const k = `$${hx(a, 4)}`; const m = ctrlW.get(k) || new Map();
    const v = a === 0x829d ? c.REG_X : c.REG_ACC; m.set(v, (m.get(v) || 0) + 1); ctrlW.set(k, m); });
// --- $2005 writes and the scanline they land on
const scrollW = new Map();
for (const a of [0x8293, 0x8298, 0x85b9, 0x85bc, 0x9ab2, 0x9ab5])
  hook(a, (c, n) => { const k = `$${hx(a, 4)}`; const s = n.ppu.scanline - 21;
    const m = scrollW.get(k) || new Map(); m.set(s, (m.get(s) || 0) + 1); scrollW.set(k, m); });

for (F = 0; F < frames; F++) {
  if (F >= 200 && F <= 210) nes.buttonDown(1, 3); else nes.buttonUp(1, 3);
  nes.frame();
}
const H = (s) => console.log("\n=== " + s + " ===");
H("PPU addresses programmed by the $0700 VRAM-update queue (bucketed by high byte)");
for (const [b, n] of [...vramAddrs].sort((a, b2) => a[0] - b2[0]))
  console.log(`  $${hx(b, 4)}-$${hx(b + 0xff, 4)}   ${n} transfers` +
    (b >= 0x3f00 ? "   <- PALETTE RAM" : b >= 0x2000 && b < 0x3000 ? "   <- nametable/attribute" : "   <- pattern table (CHR is ROM here, so this is a no-op unless CHR-RAM)"));
H("palette writes");
console.log(`  frames containing at least one $3Fxx transfer: ${palFrames.size} / ${frames}`);
console.log(`  first 20: ` + palLog.slice(0, 20).map((p) => `f${p.f}:$${hx(p.a, 4)}`).join(" "));
console.log(`  last 10 : ` + palLog.slice(-10).map((p) => `f${p.f}:$${hx(p.a, 4)}`).join(" "));
H("$2001 PPUMASK writes: value histogram per call site, and the scanline they land on");
{
  const per = new Map();
  for (const w of maskW) {
    const k = `$${hx(w.pc, 4)}`; const m = per.get(k) || { vals: new Map(), scans: new Map() };
    m.vals.set(w.v, (m.vals.get(w.v) || 0) + 1); m.scans.set(w.scan, (m.scans.get(w.scan) || 0) + 1);
    per.set(k, m);
  }
  for (const [k, m] of per) {
    console.log(`  ${k}  values: ` + [...m.vals].map(([v, n]) => `$${hx(v)}x${n}`).join(" ") +
      `   scanlines: ` + [...m.scans].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${s}x${n}`).join(" "));
  }
}
H("$2000 PPUCTRL writes: value histogram per call site");
for (const [k, m] of ctrlW) console.log(`  ${k}  ` + [...m].map(([v, n]) => `$${hx(v)}x${n}`).join(" "));
H("$2005 PPUSCROLL writes: scanline histogram per call site");
for (const [k, m] of scrollW)
  console.log(`  ${k}  ` + [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `scan ${s} x${n}`).join("  "));
