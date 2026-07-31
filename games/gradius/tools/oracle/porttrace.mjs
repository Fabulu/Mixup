// porttrace.mjs -- the PORT side of the oracle comparison.
//
// This is the counterpart of tools/oracle/probe.lua: it runs games/gradius/src
// for a scripted input and emits a per-frame state vector in EXACTLY the shape
// probe.lua emits -- same field names, same key order, same integers -- so the
// two can be diffed field by field without either side reformatting the other.
//
// ============================== THE SAMPLE POINT =============================
//
// probe.lua hooks $80B5 (`STA $04`), the last instruction of the NMI's work.
// The port's `nmi()` IS that handler, so the equivalent instant is "immediately
// after nmi() returns, before the frame lock is considered cleared". That is
// why `guard` is emitted as 1 rather than read from `state.lock`: at $80B5 the
// `INC $04` from $809F still stands and the `STA $04` has not executed. Getting
// this backwards would be exactly the one-instruction slip PROBE.md caught with
// its own guard assertion.
//
// Fields are read at that instant and nowhere else. In particular `scrollX`
// ($12) is read AFTER $9A79 has latched it for the next frame, which is what
// the oracle reads too -- the renderer's band A uses the PREVIOUS value and
// that distinction is src/nmi.js's business, not this file's.
//
// ================================ SEEDING ====================================
//
// The port does not model the title screen, the mode-3 demo, or the 28-frame
// stage-intro sub-state, so it cannot be booted cold and lined up with the
// cartridge. The comparison therefore SEEDS the port from the cartridge's own
// $0000-$07FF at the scenario's align frame and free-runs from there. Two
// things follow and both are stated rather than buried:
//
//   * everything before the align frame is UNTESTED by this harness, including
//     src/main.js's bootState();
//   * the seed is real machine state, not invented state -- the failure mode
//     docs/knowledge/03 warns about ("a harness that sets up state the app
//     never has") is inverted here: the risk is that seeding HIDES an
//     initialisation bug, not that it invents an impossible frame. That is why
//     the compared windows are hundreds of frames long: an error in anything
//     the seed set has to survive the whole run to stay hidden.
//
// ============================ WHAT IS NOT PRODUCED ===========================
//
// Five of probe.lua's fields have no port counterpart, and they are listed in
// the output as `notProduced` rather than filled with a plausible zero:
//
//   scanline, cpuCycle   hardware timing; the port has no cycle model at all
//   spriteOverflow       PPU state; not modelled
//   oamBudget ($9F)      the sprite budget is explicitly not ported (oam.js)
//   splitSpins           the count of $9AA3 busy-wait iterations; the port
//                        models the split as two raster bands, not as a spin
//   pad2 ($9D)           player 2's shift register; the port has one controller
//
// Three more are produced but DERIVED rather than stored, and are tagged so
// that a match is not over-read: `pad1` (the port claims $9C's low bits are
// $0007), `chrOffset` (bank x $2000) and `sprite0Hit`.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createState } from '../../src/state.js';
import { nmi } from '../../src/nmi.js';
import { chrBank } from '../../src/render/ppu.js';
import { headlessResources } from '../../tests/helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCEN_DEFS = join(HERE, 'scenarios.json');
export const SCEN_OUT = join(HERE, 'out', 'scen');

// ---------------------------------------------------------------- input -----
// The same grammar probe.lua parses, and the same bit layout $0007 uses --
// MEASURED (PROBE.md 4), not the NES standard order taken on faith:
//   RIGHT $01  LEFT $02  DOWN $04  UP $08  START $10  SELECT $20  B $40  A $80
const BIT = { R: 0x01, L: 0x02, D: 0x04, U: 0x08, S: 0x10, E: 0x20, B: 0x40, A: 0x80 };

export function parseScript(s) {
  const out = [];
  for (const seg of s.split(',')) {
    const m = /^\s*(\d+)\s*:\s*([A-Za-z]*)\s*$/.exec(seg);
    if (!m) throw new Error(`bad script segment: ${JSON.stringify(seg)}`);
    let mask = 0;
    for (const c of m[2].toUpperCase()) {
      if (!(c in BIT)) throw new Error(`unknown button '${c}' in ${seg}`);
      mask |= BIT[c];
    }
    for (let i = 0; i < Number(m[1]); i++) out.push(mask);
  }
  return out;
}

// ------------------------------------------------------------- the seed -----
/**
 * Put the cartridge's RAM into the port's state tree.
 *
 * Every line cites the address it reads, and the addresses are the ones
 * src/state.js already names -- this function invents no mapping of its own.
 */
export function seedFromRam(state, ram) {
  const r = (a) => ram[a];

  state.mode = r(0x00);                    // $00
  state.frame = r(0x02);                   // $02
  // $04 is 1 at the sample point ($809F's INC, $80B5 not yet run). The port's
  // frame function expects to be entered with the lock CLEAR, i.e. one
  // instruction later, so this is 0 on purpose.
  state.lock = 0;                          // $04, one instruction after $80B5
  state.input.pressed = r(0x05);           // $05
  state.input.held = r(0x07);              // $07
  // The ROM computes the edge against the PREVIOUS held byte, not a separate
  // latch (src/input.js), so the shift register the port needs for frame N+1 is
  // exactly $0007 as it stands at the end of frame N.
  state.input.prev = r(0x07);

  state.ppu.blank = r(0x0D);               // $0D
  state.ppu.ctrl = r(0x10);                // $10
  state.ppu.mask = r(0x11);                // $11
  state.ppu.scrollX = r(0x12);             // $12
  state.ppu.scrollY = r(0x13);             // $13
  state.zp15 = r(0x15);                    // $15
  state.zp.player = r(0x18);               // $18
  state.zp1A = r(0x1A);                    // $1A  ($BBBD LDA $19 / ORA $1A)
  state.substate = r(0x1B);                // $1B
  state.zp1E = r(0x1E);                    // $1E
  state.zp1F = r(0x1F);                    // $1F
  // Derived from $1F by $8B1A-$8B2B, and rewritten by the first buildDisplayList
  // this run makes. Seeded anyway so the value is never briefly wrong.
  state.ppu.spriteZeroOn = r(0x1F) !== 0;
  state.ppu.chrSel = r(0x2D);              // $2D
  state.oamBase = r(0x2F);                 // $2F
  state.zp.autofire = r(0x35);             // $35
  state.oamCursor = r(0x36);               // $36
  state.build.gate = r(0x3A);              // $3A
  state.cam.sub = r(0x3D);                 // $3D
  state.cam.lo = r(0x3E);                  // $3E
  state.cam.hi = r(0x3F);                  // $3F
  state.zp.speed = r(0x40);                // $40
  state.zp.missile = r(0x41);              // $41
  state.zp.meter = r(0x42);                // $42
  state.zp.weapon = r(0x44);               // $44
  state.zp.options = r(0x45);              // $45
  state.zp.shield = r(0x46);               // $46
  state.zp48 = r(0x48);                    // $48  the HUD's four-phase rotation
  // The HUD producers' inputs. $20,X is read by $88C1 and $07E0-$07EA by
  // $88FD/$893A/$8940. The port does not yet COMPUTE any of them -- wave 5
  // (lives), wave 6 (score) -- so seeding them is what makes src/hud.js's
  // output comparable at all. They are constants across every window this
  // corpus compares; see the SEEDED INPUTS note in src/state.js.
  state.lives[0] = r(0x20);                // $20
  state.lives[1] = r(0x21);                // $21
  for (let i = 0; i < 12; i++) state.score[i] = r(0x07E0 + i);  // $07E0-$07EB
  state.build.lo = r(0x54);                // $54
  state.build.hi = r(0x55);                // $55
  state.build.ahead = r(0x57);             // $57
  state.build.prog = r(0x58);              // $58
  state.zp5B = r(0x5B);                    // $5B
  state.zp5C = r(0x5C);                    // $5C
  // ---- the enemy spawn engine (wave 3, src/enemies.js) -------------------
  // The corpus aligns at frame 400 and stage 1's first wave fires at 378, so
  // the seed is ALWAYS mid-flight: $60 = 2, $6A:$6B somewhere inside $A844's
  // list, and slot 21 already holding a fan enemy. That is the point -- the
  // port has to pick up a squadron in motion, not just start one.
  state.spawn.z5D = r(0x5D);               // $5D
  state.spawn.z60 = r(0x60);               // $60
  state.spawn.z61 = r(0x61);               // $61
  state.spawn.z64 = r(0x64);               // $64
  state.spawn.z65 = r(0x65);               // $65
  state.spawn.z66 = r(0x66);               // $66
  state.spawn.z67 = r(0x67);               // $67
  state.spawn.z69 = r(0x69);               // $69
  state.spawn.z6A = r(0x6A);               // $6A
  state.spawn.z6B = r(0x6B);               // $6B
  state.spawn.z6C = r(0x6C);               // $6C
  state.spawn.z6D = r(0x6D);               // $6D
  state.spawn.z6E = r(0x6E);               // $6E
  state.spawn.z6F = r(0x6F);               // $6F
  state.spawn.zA8 = r(0xA8);               // $A8
  state.zp47 = r(0x47);                    // $47
  state.zp49 = r(0x49);                    // $49
  // $0048,Y is only ever written with Y = $49, and $A3FB forces $49 into {2,3}.
  // Indices 0 and 1 are $48 (state.zp48, the HUD's rotation) and $49 itself,
  // and are left alone rather than shadowed with a second copy of them.
  state.squad[2] = r(0x004A);              // $4A
  state.squad[3] = r(0x004B);              // $4B
  // $9B is NOT seeded. By the $80B5 sample point it no longer holds the tilt
  // code -- $A100/$A106 have reused it for the A button (NOTES-player.md 2),
  // and the port recomputes it at $A043 before anything reads it. Seeding it
  // would import a value the ROM itself has already thrown away.
  state.zp.tilt = 1;                       // $A043 LDA #$01

  for (let i = 0; i < 32; i++) {
    state.obj.status[i] = r(0x0100 + i);   // $0100+i
    state.obj.anim[i] = r(0x0120 + i);     // $0120+i
    state.obj.timer[i] = r(0x0140 + i);    // $0140+i
    state.obj.animFrame[i] = r(0x0160 + i);// $0160+i (index 0 aliases the ring)
    state.obj.attrMask[i] = r(0x0180 + i); // $0180+i
    state.obj.type[i] = r(0x0300 + i);     // $0300+i
    state.obj.y[i] = r(0x0320 + i);        // $0320+i
    state.obj.yf[i] = r(0x0340 + i);       // $0340+i
    state.obj.x[i] = r(0x0360 + i);        // $0360+i
    state.obj.xf[i] = r(0x0380 + i);       // $0380+i
    state.obj.carrier[i] = r(0x03A0 + i);  // $03A0+i  -- overlaps $03B0 at 16..21
    state.obj.yvel[i] = r(0x03B0 + i);     // $03B0+i  -- ...and at 0..5. See
    state.obj.yvelf[i] = r(0x03E0 + i);    // $03E0+i     state.js on the overlap:
    state.obj.style[i] = r(0x0400 + i);    // $0400+i     both are seeded from the
    state.obj.xvel[i] = r(0x0420 + i);     // $0420+i     SAME RAM, which is what
    state.obj.xvelf[i] = r(0x0440 + i);    // $0440+i     the cartridge has, and
    state.obj.s0460[i] = r(0x0460 + i);    // $0460+i     only the enemy indices
    state.obj.s0480[i] = r(0x0480 + i);    // $0480+i     12..21 are ever compared.
    state.obj.s04A0[i] = r(0x04A0 + i);    // $04A0+i
    state.obj.s04C0[i] = r(0x04C0 + i);    // $04C0+i
    state.obj.s04E0[i] = r(0x04E0 + i);    // $04E0+i
  }
  state.ring.cursor = r(0x0160);           // $0160
  for (let i = 0; i < 0x18; i++) {
    state.ring.x[i] = r(0x07A0 + i);       // $07A0-$07B7
    state.ring.y[i] = r(0x07C0 + i);       // $07C0-$07D7
  }
  state.shadowOam.set(ram.subarray(0x0200, 0x0300));   // $0200-$02FF
  // hwOam is deliberately NOT seeded: it is filled by the first ported frame's
  // $8087 DMA from exactly this shadow, which is what the cartridge's hardware
  // OAM holds at the next sample too.
  return state;
}

/**
 * Watched addresses the port deliberately does not model, and WHY. `peek`
 * returning null is what marks a field unproduced; this table is what stops
 * that null from being silent. A null with no entry here is a bug in the port
 * or in the watch list, and compare.mjs says so.
 */
export const UNMODELLED = {
  // $001E/$001F used to live here as "modelled as a boolean". They are real
  // bytes now (src/oam.js ports $8B1A-$8B2B), because the split gate at
  // $9A8C/$9A90 reads both and a boolean cannot express the $1F == 1 handover
  // frame. Two fewer SKIPPED fields.
  '0019': 'stage index. The port loads one stage\'s assets and has no $19; the '
        + 'streamer\'s stage-4 collision skip ($9F4F CPY #$04) is carried as a '
        + 'per-stage flag in assets/terrain/stages.json instead. Constant 0 '
        + 'across this corpus. Wave 4 introduces the stage machinery.',
  // $0020 used to live here. It is MODELLED now, but only as a seeded byte:
  // the HUD's st_88B6 reads it ($88C1 LDA $20,X) and renders it, and nothing in
  // the port writes it. The comparison is therefore true and weak -- lives are
  // 3 on every compared frame of all 17 scenarios. What gives it teeth is
  // tests/hud.test.js, which drives the three DIFFERENT values the video
  // captures caught (3 at f400, 1 at f1200, 0 at f3500) through the producer
  // and checks the nametable row it writes. Wave 5's $979D makes it live.
  '0024': 'checkpoint index for player $18 ($24,X). Set by $979D as '
        + 'min($3F AND $0E, 8) at the death, read by the respawn. Wave 5.',
  '004C': 'the death/dying countdown. $C1D6 loads it with $78 and $96EF counts '
        + 'it out; the port has neither ($C1D6 is wave 5, the $1B ladder is '
        + 'wave 4). Watched from now so waves 4-5 are judged against recorded '
        + 'cartridge data rather than data recorded after the fact.',
};

/**
 * Read one CPU address out of the port's state, or `null` when the port does
 * not model it. This is what turns probe.lua's `--watch` list into compared
 * fields without either side hand-maintaining a second mapping.
 */
export function peek(state, addr) {
  switch (addr) {
    case 0x00: return state.mode;
    case 0x02: return state.frame;
    case 0x04: return 1;                   // the value AT $80B5, see the header
    case 0x05: return state.input.pressed;
    case 0x07: return state.input.held;
    case 0x0D: return state.ppu.blank;
    // $0E is the $0700 queue's byte cursor, and $0700 is a real 256-byte image
    // in the port too (src/vram.js). Its value at the $80B5 sample point is
    // whatever the frame's producers appended plus the one $00 that $8641 adds
    // at $80B0: 1 on an even frame, 9 / 15 / 40 on the odd frames the HUD's
    // four phases run ($8898, src/hud.js), 38 on a frame that also streamed a
    // terrain block. Both halves of the old w_000E divergence -- the missing
    // $8641 byte (wave 1) and the missing HUD (wave 2) -- were visible here.
    case 0x0E: return state.vram.cursor;
    case 0x10: return state.ppu.ctrl;
    case 0x11: return state.ppu.mask;
    case 0x12: return state.ppu.scrollX;
    case 0x13: return state.ppu.scrollY;
    case 0x15: return state.zp15;
    case 0x18: return state.zp.player;
    case 0x1A: return state.zp1A;
    case 0x1B: return state.substate;
    case 0x1E: return state.zp1E;          // $8B2B STA $1E
    case 0x1F: return state.zp1F;          // $8B25 STY $1F
    case 0x2D: return state.ppu.chrSel;
    case 0x2F: return state.oamBase;
    case 0x35: return state.zp.autofire;
    case 0x36: return state.oamCursor;
    case 0x3A: return state.build.gate;
    case 0x3D: return state.cam.sub;
    case 0x3E: return state.cam.lo;
    case 0x3F: return state.cam.hi;
    case 0x20: return state.lives[0];      // $20,X -- $88C1, src/hud.js
    case 0x21: return state.lives[1];
    case 0x40: return state.zp.speed;
    case 0x41: return state.zp.missile;
    case 0x42: return state.zp.meter;      // $8A35, the meter cursor
    case 0x44: return state.zp.weapon;
    case 0x45: return state.zp.options;
    case 0x46: return state.zp.shield;     // $8A24
    case 0x48: return state.zp48;          // $88A4 INC $48 -- REAL port state
    case 0x54: return state.build.lo;
    case 0x55: return state.build.hi;
    case 0x57: return state.build.ahead;
    case 0x58: return state.build.prog;
    case 0x5B: return state.zp5B;
    case 0x5C: return state.zp5C;
    case 0x47: return state.zp47;          // $47  $AEC8 INC $47
    case 0x49: return state.zp49;          // $49  $A3FB, the squadron group id
    case 0x4A: return state.squad[2];      // $0048+$49, $49 = 2
    case 0x4B: return state.squad[3];      // $0048+$49, $49 = 3
    case 0x5D: return state.spawn.z5D;
    case 0x60: return state.spawn.z60;
    case 0x61: return state.spawn.z61;
    case 0x64: return state.spawn.z64;
    case 0x65: return state.spawn.z65;
    case 0x66: return state.spawn.z66;
    case 0x67: return state.spawn.z67;
    case 0x69: return state.spawn.z69;
    case 0x6A: return state.spawn.z6A;     // the wave cursor, low
    case 0x6B: return state.spawn.z6B;     // ...and high
    case 0x6C: return state.spawn.z6C;
    case 0x6D: return state.spawn.z6D;
    case 0x6E: return state.spawn.z6E;
    case 0x6F: return state.spawn.z6F;
    case 0x0160: return state.ring.cursor;
    default: break;
  }
  if (addr >= 0x0100 && addr < 0x0120) return state.obj.status[addr - 0x0100];
  if (addr >= 0x0120 && addr < 0x0140) return state.obj.anim[addr - 0x0120];
  if (addr >= 0x0140 && addr < 0x0160) return state.obj.timer[addr - 0x0140];
  if (addr >= 0x0161 && addr < 0x0180) return state.obj.animFrame[addr - 0x0160];
  if (addr >= 0x0180 && addr < 0x01A0) return state.obj.attrMask[addr - 0x0180];
  if (addr >= 0x0200 && addr < 0x0300) return state.shadowOam[addr - 0x0200];
  if (addr >= 0x0300 && addr < 0x0320) return state.obj.type[addr - 0x0300];
  if (addr >= 0x0320 && addr < 0x0340) return state.obj.y[addr - 0x0320];
  if (addr >= 0x0340 && addr < 0x0360) return state.obj.yf[addr - 0x0340];
  if (addr >= 0x0360 && addr < 0x0380) return state.obj.x[addr - 0x0360];
  if (addr >= 0x0380 && addr < 0x03A0) return state.obj.xf[addr - 0x0380];
  // $03A0 and $03B0 are only $10 apart, so their 32-entry arrays OVERLAP and
  // an address in $03B0-$03B5 is ambiguous in the abstract. It is NOT ambiguous
  // in the ROM: every writer of the $03B0 array folds in the +$0C ($03BC,X with
  // X = 0..9), so $03B0-$03B5 is only ever the CARRIER byte of enemy slots
  // 16..21. The ranges below say exactly that, address by address, instead of
  // letting a `< 0x03C0` catch-all decide it (see state.js).
  if (addr >= 0x03A0 && addr <= 0x03B5) return state.obj.carrier[addr - 0x03A0];
  if (addr >= 0x03B6 && addr < 0x03D0) return state.obj.yvel[addr - 0x03B0];
  if (addr >= 0x03E0 && addr < 0x0400) return state.obj.yvelf[addr - 0x03E0];
  if (addr >= 0x0400 && addr < 0x0420) return state.obj.style[addr - 0x0400];
  if (addr >= 0x0420 && addr < 0x0440) return state.obj.xvel[addr - 0x0420];
  if (addr >= 0x0440 && addr < 0x0460) return state.obj.xvelf[addr - 0x0440];
  if (addr >= 0x0460 && addr < 0x0480) return state.obj.s0460[addr - 0x0460];
  if (addr >= 0x0480 && addr < 0x04A0) return state.obj.s0480[addr - 0x0480];
  if (addr >= 0x04A0 && addr < 0x04C0) return state.obj.s04A0[addr - 0x04A0];
  if (addr >= 0x04C0 && addr < 0x04E0) return state.obj.s04C0[addr - 0x04C0];
  if (addr >= 0x04E0 && addr < 0x0500) return state.obj.s04E0[addr - 0x04E0];
  if (addr >= 0x07A0 && addr < 0x07B8) return state.ring.x[addr - 0x07A0];
  if (addr >= 0x07C0 && addr < 0x07D8) return state.ring.y[addr - 0x07C0];
  if (addr >= 0x07E0 && addr < 0x07EC) return state.score[addr - 0x07E0];
  return null;                             // the port does not model it
}

/**
 * The injection flags, and the reason they exist.
 *
 * docs/knowledge/01: "Late content is unreachable from a script. Add injection
 * flags to BOTH harnesses so they stay comparable, and apply them at the SAME
 * point on both sides."
 *
 * Gradius's power-ups are unreachable from a button script, because collecting
 * one needs the firing code the port does not have. The consequence was
 * measured, not guessed: over the whole button-only corpus $40 and $45 read 0
 * on every frame, so `step` is exactly $0100, the low byte is zero, and BOTH
 * sub-pixel accumulators stay 0 forever. A mutation that deleted the fraction
 * add entirely (`no-subpixel`) left the gate GREEN on 2,860 frames -- the
 * corpus reached the code and interrogated none of its parameters, which is
 * exactly the failure docs/knowledge/03 describes.
 *
 * So a scenario may carry a `poke`, e.g. "0040=6". probe.lua writes it at
 * $80B5 AFTER taking its sample; this does the same, at the same instant, so
 * the two sides stay frame-aligned. Only addresses that are a POWER-UP RESULT
 * are allowed -- these are values the cartridge itself produces at $89A1 etc.,
 * not invented state.
 */
export const POKEABLE = {
  0x40: (s, v) => { s.zp.speed = v; },      // $40 SPEED level, $89A1 INC $40
  0x41: (s, v) => { s.zp.missile = v; },    // $41 missile,     $89B3 INC $41
  0x44: (s, v) => { s.zp.weapon = v; },     // $44 weapon,      $89C7 STA $44
  0x45: (s, v) => { s.zp.options = v; },    // $45 Options,     $89D3 INC $45
  // $1F, the sprite-0 enable. NOT a power-up -- the second reason an address is
  // allowed here, and it is the same reason: the value is one the CARTRIDGE
  // produces and a button script cannot reach. $9C38 `A9 01 85 1F` is the
  // stage-intro handover, and it lives at frames 282-314 of a boot, i.e. before
  // this corpus's align of 400 and inside a sub-state the port does not model.
  // It must be poked for ONE FRAME (`@+N`): $8B1A-$8B2B promotes 1 to 2 on the
  // very next display-list build, so a held 1 is a state no cartridge frame is
  // ever in. Without it, $1E = 1 and $1F = 2 on all 3341 compared frames and
  // BOTH terms of the split gate at $9A8C/$9A90 can be deleted with the whole
  // corpus still green -- measured, twice, by two different agents.
  0x1F: (s, v) => { s.zp1F = v; },          // $1F sprite-0 enable, $9C38 STA $1F
};

/**
 * `ADDR=VAL` (held for the whole compared window) or `ADDR=VAL@F-F` (absolute
 * game frames). scen.py turns a scenario's `@+N` into the absolute form so both
 * harnesses read the SAME string; probe.lua has always spoken it.
 */
export function parsePokes(spec) {
  if (!spec) return [];
  return spec.split(',').filter(Boolean).map((seg) => {
    const m = /^\s*\$?([0-9A-Fa-f]+)\s*=\s*(\d+)\s*(?:@\s*(\d+)\s*-\s*(\d+)\s*)?$/.exec(seg);
    if (!m) throw new Error(`bad poke ${JSON.stringify(seg)} (want ADDR=VAL[@FROM-TO])`);
    const addr = parseInt(m[1], 16);
    if (!POKEABLE[addr]) {
      throw new Error(`$${m[1]} is not pokeable: only values the cartridge itself `
                    + `produces are (${Object.keys(POKEABLE).map((a) => '$' + Number(a).toString(16)).join(' ')})`);
    }
    return { addr, val: Number(m[2]),
             from: m[3] === undefined ? null : Number(m[3]),
             to: m[4] === undefined ? null : Number(m[4]) };
  });
}

/** probe.lua's KEYS, verbatim and in its order. */
export const PROBE_KEYS = [
  'frame', 'guard', 'mode', 'counter', 'pad1', 'pad2', 'pressed', 'held',
  'playerX', 'playerY', 'opt1X', 'opt1Y', 'opt2X', 'opt2Y',
  'ppuctrl', 'scrollX', 'scrollY', 'scrollLo', 'scrollHi',
  'chrBank', 'oamBase', 'oamBudget', 'chrOffset',
  'sprite0Hit', 'spriteOverflow', 'scanline', 'cpuCycle',
  'splitSpins', 's0y', 's0t', 's0a', 's0x',
];
/** objloop.lua's counters, appended by scen.py in this order. */
export const WORK_KEYS = ['slotsVisited', 'msExpanded', 'spriteRecords',
                          'spritesStored', 'enemySlots', 'lagged'];

export const NOT_PRODUCED = ['pad2', 'oamBudget', 'spriteOverflow',
                             'scanline', 'cpuCycle', 'splitSpins'];
export const DERIVED = ['pad1', 'chrOffset', 'sprite0Hit', 'guard'];

function sampleRow(state, frame, watch, lagged) {
  const bank = state.bandB.ran ? state.bandB.chrBank : state.bandA.chrBank;
  const row = {
    frame,
    guard: 1,                                   // $04 at $80B5, see the header
    mode: state.mode,                           // $00
    counter: state.frame,                       // $02
    pad1: state.input.held,                     // $9C -- DERIVED, see header
    pad2: null,
    pressed: state.input.pressed,               // $05
    held: state.input.held,                     // $07
    playerX: state.obj.x[0],                    // $0360
    playerY: state.obj.y[0],                    // $0320
    opt1X: state.obj.x[1], opt1Y: state.obj.y[1],   // $0361 / $0321
    opt2X: state.obj.x[2], opt2Y: state.obj.y[2],   // $0362 / $0322
    ppuctrl: state.ppu.ctrl,                    // $10
    scrollX: state.ppu.scrollX,                 // $12
    scrollY: state.ppu.scrollY,                 // $13
    scrollLo: state.cam.lo,                     // $3E
    scrollHi: state.cam.hi,                     // $3F
    chrBank: state.ppu.chrSel,                  // $2D
    oamBase: state.oamBase,                     // $2F
    oamBudget: null,
    // The mapper offset the emulator reports at the sample point. $80B5 is at
    // scanline ~231, i.e. AFTER the split at $9AA3 has re-latched CHR, so the
    // bank in force is band B's whenever the split ran.
    chrOffset: bank * 0x2000,
    // The split spins on sprite 0's hit and the sample is taken long after it,
    // so the flag is set whenever the split ran with a live sprite 0.
    sprite0Hit: (state.bandB.ran && state.ppu.spriteZeroOn) ? 1 : 0,
    spriteOverflow: null,
    scanline: null,
    cpuCycle: null,
    splitSpins: null,
    // HARDWARE OAM, not the shadow: probe.lua reads nesSpriteRam, which holds
    // what $8087 DMA'd at the top of this frame.
    s0y: state.hwOam[0], s0t: state.hwOam[1],
    s0a: state.hwOam[2], s0x: state.hwOam[3],
    slotsVisited: state.work.slotsVisited,
    msExpanded: state.work.msExpanded,
    spriteRecords: state.work.spriteRecords,
    spritesStored: state.work.spritesStored,
    // $ADE5 entries this frame. docs/knowledge/06 model (C): the enemy loop is
    // fixed-shape, and this is the field that holds that claim to account
    // rather than leaving it as a comment (src/state.js work.enemySlots).
    enemySlots: state.work.enemySlots,
    lagged,
  };
  for (const a of watch) row[`w_${a}`] = peek(state, parseInt(a, 16));
  return row;
}

// ------------------------------------------------------------- the trace ----
/**
 * Run the port over one scenario.
 *
 * @param {object} o
 *   o.script   the full input script, boot prefix included
 *   o.frames   total game frames the oracle sampled
 *   o.align    the frame the seed was taken at; tracing starts at align+1
 *   o.seed     Uint8Array(2048) of the cartridge's RAM, or null for bootState
 *   o.watch    array of 4-hex-digit address strings
 *   o.neuter   a deliberate break, for red-validating the comparison
 */
export function tracePort(o) {
  const res = o.res || headlessResources(0);
  const buttons = parseScript(o.script);
  const state = createState();
  if (o.seed) seedFromRam(state, o.seed);
  else throw new Error('tracePort needs a seed; cold boot is not comparable '
                     + '(the port does not model frames 0-' + o.align + ')');

  // --- the deliberate breaks. Harness-level only: things a port could get
  // wrong that are NOT a line of src/. Source-level breaks are done by editing
  // src/ and restoring, which is the house method (docs/knowledge/03).
  //
  // An UNKNOWN name is an error, not a no-op. Found by feeding the self-check
  // stage a misspelt neuter: the comparison still exited non-zero (for an
  // unrelated reason) and the stage reported "RED (good)". A break that does
  // not break, validating a check that therefore is not validated -- the exact
  // shape of a decorative test.
  const n = o.neuter || '';
  const lagAt = /^laginject=(\d+)$/.exec(n);
  if (n && !lagAt && !['lead1', 'seed-x+1', 'seed-nosub'].includes(n)) {
    throw new Error(`unknown neuter ${JSON.stringify(n)}; have: lead1, `
                  + `seed-x+1, seed-nosub, laginject=<frame>`);
  }
  if (n === 'seed-x+1') state.obj.x[0] = (state.obj.x[0] + 1) & 0xFF;
  if (n === 'seed-nosub') { state.obj.xf.fill(0); state.obj.yf.fill(0); }

  // probe.lua applies its pokes at $80B5 AFTER writing the sample row, so the
  // seed we were handed is the UNPOKED frame-`align` state and the first poked
  // frame is align+1. Apply the align-frame poke here to match, then again
  // after every row.
  // A poke with a window applies only at $80B5 of the frames inside it, which is
  // what probe.lua does with the same string. `at` is the game frame whose
  // $80B5 this is -- the poke therefore first BITES on `at + 1`, on both sides.
  const pokes = parsePokes(o.poke);
  const applyPokes = (at) => {
    for (const p of pokes) {
      if (p.from !== null && (at < p.from || at > p.to)) continue;
      POKEABLE[p.addr](state, p.val);
    }
  };
  applyPokes(o.align);

  const rows = [];
  let lagCum = 0;
  for (let g = o.align + 1; g < o.frames; g++) {
    // probe.lua applies INPUT[gframe+1] at the inputPolled of the NMI that
    // produces sample `gframe`, i.e. the 0-based script entry `g`. The lead is
    // ZERO on this machine and this line is where that is encoded.
    let b = buttons[g] ?? 0;
    if (n === 'lead1') b = buttons[g - 1] ?? 0;   // the Game Boy's lead, wrongly
    const forceLag = lagAt ? Number(lagAt[1]) === g : false;
    const ran = nmi(state, b, res, forceLag);
    if (!ran) lagCum++;
    rows.push(sampleRow(state, g, o.watch, ran ? 0 : 1));
    applyPokes(g);                                // same instant as probe.lua
  }
  return {
    tool: 'games/gradius/tools/oracle/porttrace.mjs',
    port: 'games/gradius/src',
    samplePoint: '$80B5',
    scenario: o.name || null,
    inputScript: o.script,
    align: o.align,
    gameFrames: rows.length,
    lagFrames: lagCum,
    poke: o.poke || null,
    neuter: o.neuter || null,
    fields: [...PROBE_KEYS, ...WORK_KEYS, ...o.watch.map((a) => `w_${a}`)],
    notProduced: NOT_PRODUCED,
    derived: DERIVED,
    frames: rows,
  };
}

/** Load a recorded oracle artifact and pull the seed out of it. */
export function loadOracle(name) {
  const p = join(SCEN_OUT, `${name}.json`);
  if (!existsSync(p)) return null;
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  doc.seed = Buffer.from(doc.seedRam, 'base64');
  if (doc.seed.length !== 2048) {
    throw new Error(`${name}: seedRam is ${doc.seed.length} bytes, want 2048`);
  }
  return doc;
}

// ------------------------------------------------------------------ CLI -----
function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args.set(argv[i].slice(2), argv[i + 1] ?? '1');
  }
  const name = args.get('scenario');
  if (!name) {
    console.log('usage: node porttrace.mjs --scenario <name> [--neuter X] [--out f.json]');
    return 2;
  }
  const defs = JSON.parse(readFileSync(SCEN_DEFS, 'utf8'));
  const oracle = loadOracle(name);
  if (!oracle) {
    console.error(`no oracle artifact for ${name}. Run:\n`
                + `  python games/gradius/tools/oracle/scen.py --only ${name}`);
    return 3;
  }
  const doc = tracePort({
    name,
    script: oracle.inputScript,
    frames: oracle.gameFrames,
    align: oracle.align,
    seed: oracle.seed,
    watch: defs.watch,
    poke: oracle.poke,
    neuter: args.get('neuter') || null,
  });
  const out = args.get('out') || join(SCEN_OUT, `${name}.port.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc));
  const last = doc.frames[doc.frames.length - 1];
  console.log(`  ${name}: ${doc.gameFrames} frames traced -> ${out}`);
  console.log(`  final: X=${last.playerX} Y=${last.playerY} `
            + `$3E=${last.scrollLo} $12=${last.scrollX} $2F=${last.oamBase} `
            + `slots=${last.slotsVisited} stored=${last.spritesStored}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('porttrace.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
