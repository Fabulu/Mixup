// hwrules.mjs -- MEASURE the two NES sprite rules the Game Boy port got wrong, by
// injecting synthetic OAM into the running cartridge and looking at the pixels the
// emulator's PPU actually produced.  No inference, no reading of docs.
//
//   rule 1  sprite-to-sprite priority: is it OAM index, or (as on the DMG) smallest X?
//   rule 2  the per-scanline cut: which 8 of 10 sprites survive?
//
// Method: boot the real cartridge, run a fixed input script to a stable gameplay
// frame, and on the LAST frame only, overwrite the shadow OAM page at $0200 in the
// instruction immediately before the game's own `STY $4014` OAM DMA ($8085).  Then
// diff the framebuffer against a run whose last frame hid every sprite.
// Each configuration is a fresh boot, so nothing depends on emulator save states.
//
//   npm i jsnes ; node hwrules.mjs "Gradius (USA).nes" [warmFrames]
// Output is ROM-derived. Do not commit it.

import fs from "node:fs";
import { NES, Controller } from "jsnes";

const romPath = process.argv[2];
const WARM = +(process.argv[3] ?? 600);
const romStr = Array.from(fs.readFileSync(romPath), (b) => String.fromCharCode(b)).join("");

const Y = 0x30;          // scanline band in the black starfield
const TILE = 0x8d;       // 8x16: odd byte -> pattern table $1000, tiles $8C/$8D (116/128 px opaque)
const row = Y + 6;

function run(patchLastFrame) {
  let fb = null;
  const nes = new NES({ onFrame: (b) => { fb = Uint32Array.from(b); }, onAudioSample: () => {} });
  nes.loadROM(romStr);
  const cpu = nes.cpu;
  let armed = false, applied = 0;
  const orig = cpu.emulate.bind(cpu);
  cpu.emulate = function () {
    if (armed && ((cpu.REG_PC + 1) & 0xffff) === 0x8085) { patchLastFrame(cpu.mem); applied++; }
    return orig();
  };
  for (let f = 0; f < WARM; f++) {
    if (f >= 200 && f <= 210) nes.buttonDown(1, Controller.BUTTON_START);
    else nes.buttonUp(1, Controller.BUTTON_START);
    armed = (f === WARM - 1);
    nes.frame();
  }
  return { fb, applied, oam: Uint8Array.from(nes.ppu.spriteMem), mode: cpu.mem[0] };
}

const hide = (m) => { for (let i = 0; i < 64; i++) m[0x200 + i * 4] = 0xf4; };
const put = (m, i, y, tile, attr, x) => {
  m[0x200 + i * 4] = y; m[0x201 + i * 4] = tile; m[0x202 + i * 4] = attr; m[0x203 + i * 4] = x;
};

const base = run(hide);
console.log(`warm=${WARM} frames; game mode $00=$${base.mode.toString(16)}; ` +
  `OAM patch applied ${base.applied}x on the last frame`);
const visible = Array.from({ length: 64 }, (_, i) => base.oam[i * 4]).filter((y) => y < 0xef).length;
console.log(`baseline visible sprites after the patch: ${visible} (must be 0 for the test to mean anything)`);

const XA = 60, XB = 56;
const onlyA = run((m) => { hide(m); put(m, 1, Y, TILE, 0x02, XA); });
const onlyB = run((m) => { hide(m); put(m, 40, Y, TILE, 0x03, XB); });
const both = run((m) => { hide(m); put(m, 1, Y, TILE, 0x02, XA); put(m, 40, Y, TILE, 0x03, XB); });

const px = (r, x, y) => r.fb[y * 256 + x];
console.log("\n=== rule 1: sprite-to-sprite priority ===");
console.log(`  sprite #1  OAM index 1,  X=${XA}, palette 2  -> wins under "lowest OAM index" (NES)`);
console.log(`  sprite #40 OAM index 40, X=${XB}, palette 3  -> wins under "smallest X"      (DMG)`);
const cols = [];
for (let x = 0; x < 256; x++)
  if (px(onlyA, x, row) !== px(base, x, row) && px(onlyB, x, row) !== px(base, x, row) &&
      px(onlyA, x, row) !== px(onlyB, x, row)) cols.push(x);
console.log(`  overlap columns opaque in BOTH and distinguishable: [${cols.join(",")}]`);
if (!cols.length) {
  console.log("  INCONCLUSIVE -- pick another TILE / Y.");
} else {
  let a = 0, b = 0, n = 0;
  for (const x of cols) {
    const p = px(both, x, row);
    if (p === px(onlyA, x, row)) a++; else if (p === px(onlyB, x, row)) b++; else n++;
  }
  console.log(`  columns where the combined frame shows sprite #1  (lower index): ${a}`);
  console.log(`  columns where the combined frame shows sprite #40 (smaller X) : ${b}`);
  console.log(`  columns matching neither                                      : ${n}`);
  console.log(`  VERDICT: ${a && !b ? "PRIORITY IS BY OAM INDEX. The DMG smallest-X rule does NOT apply."
    : b && !a ? "priority follows X -- contradicts the NES documentation, investigate"
    : "ambiguous"}`);
}

console.log("\n=== rule 2: which sprites survive the 8-per-scanline cut ===");
{
  const xs = [16, 32, 48, 64, 80, 96, 112, 128, 144, 160];
  const asc = run((m) => { hide(m); xs.forEach((x, k) => put(m, 20 + k, Y, TILE, 0x02, x)); });
  const desc = run((m) => { hide(m); xs.forEach((x, k) => put(m, 29 - k, Y, TILE, 0x02, x)); });
  const drawn = (r) => xs.filter((x) => {
    for (let d = 0; d < 8; d++) if (px(r, x + d, row) !== px(base, x + d, row)) return true;
    return false;
  });
  const dA = drawn(asc), dD = drawn(desc);
  console.log(`  10 sprites on scanline ${row}. OAM index ASCENDING with X (index 20 -> X=16):`);
  console.log(`     drawn at X = [${dA.join(",")}]  (${dA.length} of 10)`);
  console.log(`  same X positions, OAM index DESCENDING with X (index 20 -> X=160):`);
  console.log(`     drawn at X = [${dD.join(",")}]  (${dD.length} of 10)`);
  const ok = dA.length === 8 && dD.length === 8 &&
    dA.join() === xs.slice(0, 8).join() && dD.join() === xs.slice(2).join();
  console.log(`  VERDICT: ${ok
    ? "exactly 8 survive, and the survivors are the 8 LOWEST OAM INDICES regardless of X."
    : "unexpected -- see the two lists above"}`);
}
