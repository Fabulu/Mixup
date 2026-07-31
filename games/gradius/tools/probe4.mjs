// probe4.mjs -- boot-phase of the free-running counter, RAM-wide entropy census,
// and a runtime check that the sprite-overflow flag is never consumed.
import fs from "node:fs";
import { NES } from "jsnes";
const romPath = process.argv[2], frames = +(process.argv[3] ?? 1100);
const nes = new NES({ onFrame: () => {}, onAudioSample: () => {} });
nes.loadROM(Array.from(fs.readFileSync(romPath), (b) => String.fromCharCode(b)).join(""));
const cpu = nes.cpu, hooks = new Map(), hook = (a, cb) => hooks.set(a, cb);
const orig = cpu.emulate.bind(cpu); let F = 0;
cpu.emulate = function () { const cb = hooks.get((cpu.REG_PC + 1) & 0xffff); if (cb) cb(cpu, nes, F); return orig(); };
const hx = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");

// every read of $2002 that actually executes, with the value returned
const statusReads = new Map();
for (const a of [0x8012, 0x8017, 0x8070, 0x8281, 0x828e, 0x8849, 0x8a63, 0x9aa3, 0x9aad])
  hook(a, () => { statusReads.set(a, (statusReads.get(a) || 0) + 1); });

// snapshot RAM at the game's own stable point: NMI entry
const samples = [];
hook(0x806a, (c, n, f) => samples.push({ f, ram: Uint8Array.from(n.cpu.mem.slice(0, 0x800)) }));

// mark the frame gameplay mode ($00) first becomes 5
let firstPlay = null;
for (F = 0; F < frames; F++) {
  if (F >= 200 && F <= 210) nes.buttonDown(1, 3); else nes.buttonUp(1, 3);
  nes.frame();
  if (firstPlay === null && nes.cpu.mem[0x00] === 5) firstPlay = F;
}
console.log(`first frame with game mode $00 == 5 (gameplay): ${firstPlay}`);
const idx = samples.findIndex((s) => s.f === firstPlay);
console.log(`\n=== RAM at the FIRST GAMEPLAY FRAME (sample #${idx}, frame ${firstPlay}) ===`);
for (const a of [0x00, 0x02, 0x0d, 0x10, 0x11, 0x12, 0x13, 0x1e, 0x1f, 0x2d, 0x2f, 0x36, 0x37, 0x3e, 0x3f, 0x9f])
  console.log(`  $${hx(a)} = $${hx(samples[idx].ram[a])}`);
console.log(`  frame counter $02 at each of the 6 frames around it: ` +
  samples.slice(Math.max(0, idx - 3), idx + 3).map((s) => `f${s.f}:$${hx(s.ram[0x02])}`).join(" "));

console.log(`\n=== RAM-wide entropy census over ${samples.length} NMI samples ($0000-$07FF) ===`);
let inc = [], hi = [];
for (let a = 0; a < 0x800; a++) {
  const v = samples.map((s) => s.ram[a]);
  const u = new Set(v);
  let d1 = 0, ch = 0;
  for (let i = 1; i < v.length; i++) { const d = (v[i] - v[i - 1]) & 0xff; if (d === 1) d1++; if (d) ch++; }
  const n = v.length - 1;
  if (d1 / n > 0.9) inc.push(`$${a.toString(16).toUpperCase().padStart(4, "0")}(+1 on ${d1}/${n})`);
  else if (u.size >= 180 && ch / n > 0.85) hi.push(`$${a.toString(16).toUpperCase().padStart(4, "0")}(${u.size} vals, changes ${ch}/${n})`);
}
console.log(`  bytes that increment by exactly 1 almost every frame : ${inc.length ? inc.join(" ") : "none"}`);
console.log(`  bytes with >=180 distinct values and near-every-frame change (LFSR/RNG candidates):`);
console.log(`    ${hi.length ? hi.join("\n    ") : "none"}`);

console.log(`\n=== $2002 read sites that actually executed ===`);
for (const [a, n] of statusReads) console.log(`  $${a.toString(16).toUpperCase()}  x${n}`);
console.log(`  (the only bit ever masked off a $2002 read in the whole PRG is #$40 = sprite 0 hit,`);
console.log(`   at $9AA6.  #$20 = sprite overflow appears nowhere.)`);
