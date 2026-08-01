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
// The port does not model the title screen or the mode-3 demo, so it cannot be
// booted cold and lined up with the cartridge. The comparison therefore SEEDS
// the port from the cartridge's own state at the scenario's align frame and
// free-runs from there. Two things follow and both are stated rather than
// buried:
//
//   * everything before the align frame is UNTESTED by this harness;
//     src/main.js's bootState() used to be on that list and is not any more --
//     `intro-boot` aligns at the mode-4 handover (frame 282) and the port
//     executes the stage intro itself from there (wave 4);
//   * the seed is real machine state, not invented state -- the failure mode
//     docs/knowledge/03 warns about ("a harness that sets up state the app
//     never has") is inverted here: the risk is that seeding HIDES an
//     initialisation bug, not that it invents an impossible frame. That is why
//     the compared windows are hundreds of frames long: an error in anything
//     the seed set has to survive the whole run to stay hidden.
//
// ===================== WAVE 10: SEEDING AT ANY FRAME =========================
//
// Until wave 10 the seed was $0000-$07FF and NOTHING ELSE, which is why every
// align frame in the corpus was 282, 400 or 614 -- frames early enough that the
// port could REBUILD the rest by running forward. Three things were missing and
// all three are here now, each read off the cartridge at the same $80B5:
//
//   the PPU nametable    2 KB, PPU $2000-$27FF. The screen the terrain streamer
//                        has spent N frames building. src/vram.js drainQueue
//                        writes it and only it.
//   palette RAM          32 B, $3F00-$3F1F.
//   hardware OAM         256 B. See the note at the assignment -- this one is
//                        provably redundant for the TRACE and is seeded anyway.
//   the collision map    $0500-$06FF, which was already inside seedRam and was
//                        deliberately NOT installed. See seedFromCartridge().
//
// WHAT IS NOT MISSING, measured rather than added:
//
//   the CHR bank         $2D is in seedRam and src/render/ppu.js chrBank()
//                        derives the mapper offset from it. The artifact
//                        carries `seedChrOffset` as an ASSERTION on that
//                        derivation, not as an input.
//   the build cursor     $54/$55/$57/$58 have been seeded since wave 1
//                        (09-DECIDED-seed-anywhere.md lists deriving them as
//                        work; they were already done). See the $54 block.
//
// THE COST, STATED: the deeper the align frame, the more the seed carries and
// the less the port has to produce. On a deep scenario the nametable, the
// palette and every collision cell written before the align frame are GIVEN.
// What is still the port's own work is every frame after it, which is why the
// deep scenario is compared over a window and not over one frame -- and why
// docs/worklog/gradius/10-impl-seed-anywhere.md corrupts port fields the seed
// also sets and shows the window still goes red.
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
 * Put the cartridge's state at the align frame into the port's state tree.
 *
 * Every line cites the address it reads, and the addresses are the ones
 * src/state.js already names -- this function invents no mapping of its own.
 *
 * @param {object} state  a fresh createState()
 * @param {object} seed   { ram, vram, palette, oam, chrBank, chrOffset } as
 *                        loadOracle() decodes it. `ram` is $0000-$07FF; the
 *                        rest is the video state, wave 10.
 *
 * RENAMED from seedFromRam in wave 10, because it is no longer only RAM. The
 * old name is not kept as an alias: a caller that still passes a bare
 * Uint8Array must fail loudly rather than seed 2 KB of CPU RAM and silently no
 * video, which on a deep align frame is a blank screen the comparison would
 * never see (nothing compares the nametable) and a collision map full of zeros
 * that would fly the ship through solid terrain.
 */
export function seedFromCartridge(state, seed) {
  if (ArrayBuffer.isView(seed) || Array.isArray(seed)) {
    throw new Error('seedFromCartridge(state, seed): `seed` is the object '
                  + 'loadOracle() returns ({ ram, vram, palette, oam, '
                  + 'chrBank, chrOffset }), not a bare RAM array. This used to '
                  + 'be seedFromRam(state, ram) -- see the WAVE 10 header.');
  }
  const ram = seed.ram;
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
  state.zp09 = r(0x09);                    // $09  the demo flag  ($9ADA gate)
  state.zp0A = r(0x0A);                    // $0A  players still in ($97C7)
  state.zp16 = r(0x16);                    // $16                 ($9ADA gate)
  state.zp.player = r(0x18);               // $18
  state.zp19 = r(0x19);                    // $19  the stage index (wave 4)
  // $17, the power-up rank. SEEDED even though $9C45 recomputes it on every
  // mode-5 tail, because the INTRO states never reach $9AC4 -- so on the two
  // intro scenarios the port would otherwise carry 0 where the cartridge carries
  // whatever the last played frame computed. $17 is BELOW $3D, so $9B3E's wipe
  // does not clear it either: it survives a death untouched.
  state.zp17 = r(0x17);                    // $17  the power-up rank (wave 7)
  state.zp33 = r(0x33);                    // $33  the button-code match count
  state.cheat[0] = r(0x3B);                // $3B,X
  state.cheat[1] = r(0x3C);
  state.zp4C = r(0x4C);                    // $4C  the death/intro countdown
  state.zp1C = r(0x1C);                    // $1C  the BGM de-dupe ($839B/$97E9)
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
  // $2A,X -- the next extra life's score threshold ($84D9). MEASURED $02 in the
  // seed of every scenario; src/score.js reads it and $84EE writes it back.
  state.extraLife[0] = r(0x2A);            // $2A,X
  state.extraLife[1] = r(0x2B);
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
  state.lives[1] = r(0x21);
  // $22/$24/$26/$28,X -- the per-player state $9B3E restores at every stage
  // intro (src/flow.js introReset) and $979D saves at every death (src/flow.js
  // respawn, wave 5). LIVE port state since that commit; still seeded, because a
  // window that aligns mid-play starts from whatever the last respawn left.
  //
  // $0500-$06FF, THE TERRAIN COLLISION MAP. WAVE 10 STARTED SEEDING IT and the
  // old reasoning is corrected here rather than deleted, because the old
  // reasoning was right about the corpus it was written for.
  //
  // It used to say: the port builds the map itself from the tiles its own
  // streamer queues ($9F55), that is what the terrain-death scenarios test, and
  // it is MEASURED all zero at align 400 of every scenario (stage 1's pages 0-3
  // contain no solid tile bits at all) -- so seeding it would copy 512 zeros
  // and hide the one initialisation the comparison wants to see.
  //
  // The measurement still holds and scen.py now PRINTS it per scenario
  // (`coll N/512 non-zero`), so this line is a no-op on every align-400
  // scenario and the terrain-death pokes still do all the work there. What
  // changed is that align is no longer always 400: at a deep align frame the
  // cartridge's map holds two camera pages of history the port cannot rebuild
  // without replaying from the intro, and a port seeded with 512 zeros there
  // flies through the ceiling. Seeding real machine state is the same
  // arrangement the camera and the sub-pixel accumulators have had since wave 1.
  //
  // WHAT IT COSTS, and it is a real cost: on a deep scenario every cell written
  // BEFORE the align frame is given to the port rather than derived by it.
  // Cells written after it are still the port's own $9F55 output. $0500-$06FF
  // is not in the watch list either way (99-final-verification.md 8.1).
  for (let i = 0; i < 0x200; i++) state.coll[i] = r(0x0500 + i);   // $0500-$06FF
  state.save22[0] = r(0x22); state.save22[1] = r(0x23);
  state.save24[0] = r(0x24); state.save24[1] = r(0x25);
  state.save26[0] = r(0x26); state.save26[1] = r(0x27);
  state.save28[0] = r(0x28); state.save28[1] = r(0x29);                // $21
  for (let i = 0; i < 12; i++) state.score[i] = r(0x07E0 + i);  // $07E0-$07EB
  // $0700-$079F, THE QUEUE PAGE ITSELF. Seeded for the same reason the camera
  // and the sub-pixel accumulators are: the page is not rebuilt from scratch
  // each frame -- a frame whose $0E is 1 leaves 39 bytes of the LAST frame's
  // packets sitting behind the cursor, and the drain reads $0700 forward, so a
  // port that started this page at zero would differ from the cartridge on
  // every byte past the cursor from the very first compared frame. What is
  // seeded is exactly what is watched (see scenarios.json `_watch`); $07A0 and
  // up is the rings and the score, seeded above as their own fields.
  for (let i = 0; i < 0xA0; i++) state.vram.q[i] = r(0x0700 + i);
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
  // ---- the sound driver (wave 8, src/sound.js) ---------------------------
  // $00B0-$00FF: the four 17-byte channel structs and the driver's scratch, as
  // ONE range, because that is what it is -- $DD/$DE is the triangle struct's
  // +$B/+$C and $F0-$F3 is the noise struct's +$D..+$10.
  //
  // SEEDING IT IS THE WHOLE COMPARISON. The corpus aligns at frame 400, by
  // which point the stage-1 BGM has been playing for ninety frames: the owner
  // bytes hold $13/$14/$15, the stream pointers are somewhere in the middle of
  // $F396/$F3B1/$F426, and the duration counters are mid-note. So the port does
  // not start a track -- it PICKS ONE UP IN FLIGHT and has to stay in phase with
  // it for hundreds of frames, which is a far stronger claim than starting from
  // silence and agreeing.
  for (let i = 0; i < 0x50; i++) state.snd[i] = r(0x00B0 + i);
  // $01A0-$01B0, where $9AF0 parks pulse 1's struct across a pause.
  for (let i = 0; i < 0x11; i++) state.sndSave[i] = r(0x01A0 + i);
  state.shadowOam.set(ram.subarray(0x0200, 0x0300));   // $0200-$02FF

  // ================= THE VIDEO SEED, wave 10 =============================
  // Everything below comes from probe.lua's PROBE_VIDEO blob, taken at the same
  // $80B5 as the RAM above. Nothing here is invented and nothing here is
  // derived: it is read off the PPU.

  // PPU $2000-$27FF -> state.vram.nt, which is a 4 KB image of $2000-$2FFF with
  // $2800/$2C00 folded onto $2000/$2400. MIRRORING IS VERTICAL -- iNES flags6 =
  // $31 and a live 4 KB read says $2000 == $2800 and $2400 == $2C00 while
  // $2000 != $2400 (src/vram.js drainQueue writes exactly this arrangement), so
  // the 2 KB blob IS the whole nametable and the mirror is written here rather
  // than dumped twice. scen.py asserts the two halves differ, so a mirrored
  // read cannot be seeded as if it were two screens.
  state.vram.nt.set(seed.vram, 0x000);
  state.vram.nt.set(seed.vram, 0x800);
  // $3F00-$3F1F. $3F10/$14/$18/$1C mirror $3F00/$04/$08/$0C on hardware and the
  // emulator's palette RAM already reports the folded values, so this is a
  // straight copy -- unlike drainQueue, which sees the WRITE and has to fold.
  state.vram.pal.set(seed.palette);
  // HARDWARE OAM. STATED PLAINLY: this is REDUNDANT FOR THE TRACE and is seeded
  // anyway. nmi()'s first act on frame align+1 is $8087's DMA (src/oam.js
  // oamDma), which rewrites all 256 bytes from the shadow seeded above before
  // anything reads them -- so no compared field can ever depend on this line.
  // It is here so that seedFromCartridge() leaves a COMPLETE machine, for any
  // consumer that wants to draw the align frame itself rather than step past
  // it; and scen.py measures how far the hardware OAM lags the shadow at the
  // sample point (`hwOAM vs shadow differs on N/256`), which is the two-frame
  // pipeline $8B10/$80A7 creates, printed rather than assumed.
  state.hwOam.set(seed.oam);

  // The two render bands. REDUNDANT FOR THE TRACE like hwOam and seeded for the
  // same reason: nmi() rebuilds all of bandA at $829D/$8293/$8298/$8A7D and
  // resets bandB.ran at its top, every frame, before anything draws. src/main.js
  // bootState() sets exactly these two, so a machine built by the seed and a
  // machine built by bootState() differ in nothing a renderer reads.
  state.bandA.chrBank = chrBank(state.ppu.chrSel);   // $8A9C LDY $2D
  state.bandB.chrBank = chrBank(2);                  // $9ABF LDY #$02

  // THE CHR BANK IS NOT SEEDED -- IT IS DERIVED, and this is the assertion that
  // keeps the derivation honest. $2D is seeded above and src/render/ppu.js's
  // chrBank() maps it through $8AA8 = `30 32 31 33`; the mapper offset is
  // bank * $2000.
  //
  // WHICH BAND'S OFFSET THE CARTRIDGE REPORTS DEPENDS ON THE SPLIT, and getting
  // that wrong is how the first version of this check failed: probe.lua samples
  // at $80B5, scanline ~231, which is AFTER $9AA3's sprite-0 spin -- so on a
  // frame whose split ran the emulator reports band B's bank ($9ABF LDY #$02 ->
  // bank 1 -> 8192), not $2D's. MEASURED on `idle` at align 400: $2D = 0, which
  // derives bank 0, and mapper.chrMemoryOffset0 = 8192. The artifact carries
  // the split flag so the rule below is the one sampleRow() uses per frame,
  // evaluated once at the seed against data neither side derived.
  if (seed.chrOffset !== undefined) {
    const bank = seed.splitRan ? chrBank(2) : chrBank(state.ppu.chrSel);
    if (bank * 0x2000 !== seed.chrOffset) {
      throw new Error(`seed: $2D = ${state.ppu.chrSel}, split `
                    + `${seed.splitRan ? 'ran' : 'did not run'} -> CHR offset `
                    + `${bank * 0x2000}, but the cartridge reported `
                    + `${seed.chrOffset} at the align frame. Either $8AA8's `
                    + `latch table ($30 $32 $31 $33) or the band model is wrong.`);
    }
  }
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
  //
  // $0020 used to live here. It is MODELLED now, but only as a seeded byte:
  // the HUD's st_88B6 reads it ($88C1 LDA $20,X) and renders it, and nothing in
  // the port writes it. The comparison is therefore true and weak -- lives are
  // 3 on every compared frame of all 17 scenarios. What gives it teeth is
  // tests/hud.test.js, which drives the three DIFFERENT values the video
  // captures caught (3 at f400, 1 at f1200, 0 at f3500) through the producer
  // and checks the nametable row it writes. Wave 5's $979D makes it live.
  //
  // THE LIST IS EMPTY AS OF WAVE 4. It held three entries -- $19 (stage index),
  // $24 (checkpoint) and $4C (the death countdown) -- and the $1B ladder needed
  // all three: $9663 tests $19, $9B68 reads $24,X into $3F and $55, and $96EF
  // counts $4C out. $19 and $24 are modelled the way $20 is (read by the port,
  // written only by wave 5's $979D); $4C is written by the port, at $96F6.
  // Three fewer SKIPPED fields. Do not re-add an entry here without the
  // measurement that says the port cannot model it.
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
    case 0x09: return state.zp09;
    case 0x0A: return state.zp0A;          // $97C7 LDA $0A -- the respawn switch
    case 0x15: return state.zp15;
    case 0x16: return state.zp16;
    case 0x18: return state.zp.player;
    case 0x17: return state.zp17;          // $9C5B STY $17 -- wave 7
    case 0x19: return state.zp19;          // $9B70 STA $19 -- wave 4
    case 0x22: return state.save22[0];
    case 0x23: return state.save22[1];
    case 0x24: return state.save24[0];     // the CHECKPOINT, $9B68 LDA $24,X
    case 0x25: return state.save24[1];
    case 0x26: return state.save26[0];
    case 0x27: return state.save26[1];
    case 0x28: return state.save28[0];
    case 0x29: return state.save28[1];
    case 0x33: return state.zp33;          // $9782 STY $33 -- src/flow.js
    case 0x3B: return state.cheat[0];
    case 0x3C: return state.cheat[1];
    case 0x4C: return state.zp4C;          // $96F6 DEC $4C
    case 0x1C: return state.zp1C;          // $839F STX $1C -- wave 8
    case 0x1A: return state.zp1A;
    case 0x1B: return state.substate;
    case 0x1E: return state.zp1E;          // $8B2B STA $1E
    case 0x1F: return state.zp1F;          // $8B25 STY $1F
    case 0x2D: return state.ppu.chrSel;
    case 0x2F: return state.oamBase;
    case 0x2A: return state.extraLife[0];   // $2A,X  $84D9 CMP $2A,X
    case 0x2B: return state.extraLife[1];
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
  // THE $0700 QUEUE AS AN IMAGE, not as a length. Until wave 4's test pass the
  // only compared byte of the whole page was $0E -- so three separate content
  // mutations (the $9C12 producers emitted in the wrong order, $9BFD/$9C02's
  // canned packets swapped, and $9BF5's `$19 + 8` made `+ 9`) were GREEN on all
  // 21 scenarios, because every one of them leaves the LENGTH alone. The page
  // is a real 256-byte image on both sides (src/state.js vram.q) and probe.lua
  // can read it, so it is compared as one. See scenarios.json `_watch` for why
  // the watched prefix stops at $074F.
  //
  // $07A0 AND UP IS NOT THE QUEUE. The cartridge's page $07 carries the queue,
  // the two 24-entry position rings ($07A0-$07D7) and the score ($07E0-$07EB)
  // in one page, and the PORT keeps the last two as their own fields -- so
  // vram.q[$A0..] is a hole in the port, not the ring. The bound is $079F and
  // the three ranges below stay authoritative for what they own.
  // $00B0-$00FF, the sound driver's whole zero page (src/sound.js). One range
  // for the same reason it is one array: the structs and the globals overlap.
  if (addr >= 0x00B0 && addr <= 0x00FF) return state.snd[addr - 0x00B0];
  // $01A0-$01B0, the pause save area ($9AF0/$9B33).
  if (addr >= 0x01A0 && addr <= 0x01B0) return state.sndSave[addr - 0x01A0];
  if (addr >= 0x0700 && addr < 0x07A0) return state.vram.q[addr - 0x0700];
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
  // WAVE 7 ADDED $42 AND $46, and they are the same admission as the four above:
  // values the CARTRIDGE ITSELF produces, that a button script cannot reach from
  // align 400 inside a window short enough to compare.
  //
  //   $42  the meter cursor. $894B INCs it on every capsule, so cell 5 or 6 is
  //        five or six capsules -- 00-recon-powerups.md needed a 2700-frame run
  //        to collect TWO. `capsule-sweep` pokes it for ONE FRAME at a time
  //        (`@+N`), thirteen times, which is exactly the shape the cartridge
  //        holds it in while B is down: $9A73 consumes it on the very next
  //        frame, so a HELD poke would be testing invented state. The six
  //        already-owned refusals in that scenario do NOT need the poke held --
  //        the arm itself keeps the value, which is what they are there to show.
  //   $46  the shield, five hits. $8997 is the sixth meter cell. Poked ONCE
  //        (`@+0`) it drains 5 -> 0 over 246 frames of ordinary play and the
  //        sixth contact kills; that is `capsule-shield`, and it matches the
  //        recon's own independent run of the same intervention.
  0x42: (s, v) => { s.zp.meter = v; },      // $42 meter,       $894B INC $42
  0x46: (s, v) => { s.zp.shield = v; },     // $46 shield,      $899D STA $46
  // $1F, the sprite-0 enable. NOT a power-up -- the second reason an address is
  // allowed here, and it is the same reason: the value is one the CARTRIDGE
  // produces and a button script cannot reach FROM ALIGN 400. $9C38
  // `A9 01 85 1F` is the stage-intro handover at game frame 309 of a boot.
  //
  // WAVE 4 NARROWED WHAT THIS IS FOR, and the note is corrected rather than
  // left: the port models $9C38 now (src/flow.js introTerrain), and the
  // `intro-boot` scenario compares the handover the port PRODUCES at frame 309
  // -- no poke. `s0-handover` stays because it injects the value into a
  // mid-play window, where the corpus otherwise has $1E = 1 and $1F = 2 on
  // every frame and BOTH terms of the split gate at $9A8C/$9A90 can be deleted
  // with the whole thing still green (measured, twice, by two agents).
  // It must be poked for ONE FRAME (`@+N`): $8B1A-$8B2B promotes 1 to 2 on the
  // very next display-list build, so a held 1 is a state no cartridge frame is
  // ever in.
  0x1F: (s, v) => { s.zp1F = v; },          // $1F sprite-0 enable, $9C38 STA $1F
  // WAVE 8 ADDED $F0, THE MUSIC FADE, and it is the $1F admission again: a
  // value the CARTRIDGE ITSELF produces, that no script can reach from align
  // 400 inside a window that survives.
  //
  // $8398 `INC $F0` is the only writer in the whole PRG. It needs $3E == 0 AND
  // $3F + 1 == $834F[$19] (camera page 3) AND $1B < $82, and the cartridge does
  // exactly that IN PLAY -- MEASURED off enemy-waves' own recorded rows,
  // w_00F0..w_00F3, with no poke of any kind:
  //
  //     f1849 (0,0,0,0)   f1850 (1,0,0,0)   f1855 (1,5,0,15)   f1865 (1,15,0,15)
  //
  // and then the run STOPS, because the ship dies at 1866 and compare.mjs
  // truncates there. That death is not avoidable by choosing a better script:
  // the corpus's own measurements put every other hold's first death between
  // 445 and 1180, and RD -- the one that survives longest -- is what
  // enemy-waves already is. So the cartridge reaches the fade and the corpus
  // can only ever see its first 16 frames, of ~530.
  //
  // Poked for ONE frame (`@+0`), because $F0 is a LATCH: $8394 BNE $839A means
  // $8398 never runs twice, and $EC95 (any request that targets pulse 2) is the
  // only thing that clears it. A held poke would be re-arming a latch the
  // cartridge sets once, which is invented state.
  0xF0: (s, v) => { s.snd[0xF0 - 0xB0] = v & 0xFF; },   // $F0 fade, $8398 INC $F0
};

/**
 * The SECOND kind of pokeable address: the terrain collision map at
 * $0500-$06FF. Wave 5 added it and waves 6-7 reuse the same channel.
 *
 * Same admission rule as POKEABLE's: a value the CARTRIDGE ITSELF produces. The
 * map is written by $9F55 from the tile indices the streamer just queued,
 * thresholded at $9FB4[$19] -- solid cells are ordinary output of ordinary
 * stage data. What a button script cannot do is REACH one: 00-recon-terrain.md
 * measured stage 1's pages 0-3 as containing zero solid tile bits, and this
 * corpus never gets past camera page 0, so `$C3A3` returns 0 on all 242 calls of
 * every scenario and `$C2C1` -- one of the four routes into the death -- is
 * unreachable. Poking one cell is the only way to exercise it.
 *
 * The ADDRESS is not computed here and must not be: the point of the
 * `terrain-death` scenario is to prove that src/terrain.js's probeCollision()
 * indexes the map the same way $C3D3 does, so the cell has to come from
 * somewhere else. It comes from tools/oracle/kill.lua, which re-implements
 * $C3D3 independently and then asserts on the cartridge that $C2C1 fires:
 *
 *   python games/gradius/tools/oracle/kill.py --frames 640 \
 *       --script "200:,10:S,190:,240:" --at 500
 *     mode=hit   poked=[0x5b3]  $C2C1 fired at 501, $1B -> $A0 at 501
 *     mode=miss  poked=[0x5b4]  $C2C1 never fired
 *     mode=none  poked=[]       $C2C1 never fired
 *
 * A port whose index arithmetic is off by anything reads a different cell, sees
 * 0, and flies on -- which is a divergence on w_0100/w_001B/w_004C from the very
 * next frame.
 */
export const POKEABLE_RANGES = [
  { from: 0x0500, to: 0x06FF, why: 'the terrain collision map ($9F55 writes it, '
      + '$C3D3 reads it)', set: (s, a, v) => { s.coll[a - 0x0500] = v; } },
];

function pokeFor(addr) {
  if (POKEABLE[addr]) return (s, v) => POKEABLE[addr](s, v);
  for (const r of POKEABLE_RANGES) {
    if (addr >= r.from && addr <= r.to) return (s, v) => r.set(s, addr, v);
  }
  return null;
}

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
    const set = pokeFor(addr);
    if (!set) {
      throw new Error(`$${m[1]} is not pokeable: only values the cartridge itself `
                    + `produces are (`
                    + Object.keys(POKEABLE).map((a) => '$' + Number(a).toString(16)).join(' ')
                    + POKEABLE_RANGES.map((r) => ` $${r.from.toString(16)}-$${r.to.toString(16)}`).join('')
                    + ')');
    }
    return { addr, set, val: Number(m[2]),
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
                          'spritesStored', 'enemySlots', 'lagged',
                          'audioTicks', 'audioChannels', 'apuWrites',
                          'apuDigest'];

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
    // ---- the sound driver's four signals, wave 8 --------------------------
    // docs/knowledge/06 asks for the signals to be instrumented SEPARATELY
    // rather than inferred from one lag boolean. `audioTicks` is the lag rule
    // ($ED02 runs below $8073's bail, so a dropped NMI drops a music tick);
    // `audioChannels` is $ED46's own count, which varies with what is playing
    // AND with control commands chained inside one tick; the two APU fields are
    // the register-level comparison probe.lua cannot make, because the
    // registers are write-only -- the writes MADE this frame are compared
    // instead, by count and by an ordered digest of (offset, value).
    audioTicks: state.work.audioTicks,
    audioChannels: state.work.audioChannels,
    apuWrites: state.work.apuWrites,
    apuDigest: state.work.apuDigest,
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
 *   o.stopOnThrow  catch an unported-path throw and return it as `threw`
 *                  instead of propagating. compare.mjs's DEEP REACH block only.
 */
export function tracePort(o) {
  const res = o.res || headlessResources(0);
  const buttons = parseScript(o.script);
  const state = createState();
  if (o.seed) seedFromCartridge(state, o.seed);
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
  //
  // WAVE 10 ADDED FOUR, and they exist for one reason: seeding INVERTS the
  // usual trap. The normal risk is a harness inventing state the app never
  // has; here the risk is that the seed HIDES a bug, because a wrong port value
  // is overwritten by real machine state before anything reads it -- and the
  // deeper the align frame, the more the seed carries and the less the port has
  // to produce. These four DELETE or CORRUPT part of what the seed installs, so
  // "is the comparison looking at this at all?" is a measurement instead of an
  // argument. What each one is measured to do is in
  // docs/worklog/gradius/10-impl-seed-anywhere.md.
  const n = o.neuter || '';
  const lagAt = /^laginject=(\d+)$/.exec(n);
  const NEUTERS = ['lead1', 'seed-x+1', 'seed-nosub',
                   'seed-nt+1', 'seed-pal+1', 'seed-coll0', 'seed-oam0'];
  if (n && !lagAt && !NEUTERS.includes(n)) {
    throw new Error(`unknown neuter ${JSON.stringify(n)}; have: `
                  + `${NEUTERS.join(', ')}, laginject=<frame>`);
  }
  if (n === 'seed-x+1') state.obj.x[0] = (state.obj.x[0] + 1) & 0xFF;
  if (n === 'seed-nosub') { state.obj.xf.fill(0); state.obj.yf.fill(0); }
  // ONE nametable byte, in the middle of the visible left screen. Not a fill:
  // a single wrong tile is what a streamer bug actually looks like, and the
  // VIDEO block has to catch that and not just a blanked screen.
  if (n === 'seed-nt+1') state.vram.nt[0x123] = (state.vram.nt[0x123] + 1) & 0xFF;
  if (n === 'seed-pal+1') state.vram.pal[5] = (state.vram.pal[5] + 1) & 0xFF;
  // The collision map as it would be WITHOUT wave 10's seeding line -- 512
  // zeros, which is what every pre-wave-10 trace started from.
  if (n === 'seed-coll0') state.coll.fill(0);
  if (n === 'seed-oam0') state.hwOam.fill(0);

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
      p.set(state, p.val);
    }
  };
  applyPokes(o.align);

  const rows = [];
  let lagCum = 0;
  // WAVE 10. `stopOnThrow` catches an unported-path throw and REPORTS it as
  // data instead of propagating. It exists for exactly one caller -- the DEEP
  // REACH block in compare.mjs, which asserts that a named ROM address is
  // reached at a named frame -- and it is deliberately NOT the default:
  // a scenario without an `expectThrow` annotation must still crash the run,
  // because a throw the harness swallows is a port that stopped working while
  // the gate stayed green. compare.mjs checks the message against the declared
  // ROM address, so this cannot silence an unrelated error either.
  let threw = null;
  for (let g = o.align + 1; g < o.frames; g++) {
    // probe.lua applies INPUT[gframe+1] at the inputPolled of the NMI that
    // produces sample `gframe`, i.e. the 0-based script entry `g`. The lead is
    // ZERO on this machine and this line is where that is encoded.
    let b = buttons[g] ?? 0;
    if (n === 'lead1') b = buttons[g - 1] ?? 0;   // the Game Boy's lead, wrongly
    const forceLag = lagAt ? Number(lagAt[1]) === g : false;
    let ran;
    try {
      ran = nmi(state, b, res, forceLag);
    } catch (e) {
      if (!o.stopOnThrow) throw e;
      threw = { atFrame: g, message: String((e && e.message) || e) };
      break;
    }
    // `lagged` is DROPPED NMIs ATTRIBUTED TO THIS ROW, which is what objloop.lua
    // counts: its gframe only advances at $80B5, so a drop caused by a frame
    // whose own work overran is recorded against that frame, not against the
    // row that never happened. Two sources, and they are different things:
    //   ran === false   the port was TOLD to drop this NMI (the laginject
    //                   neuter). The row then repeats the previous state.
    //   state.frameDrops  the frame RAN and cost the next NMI -- $882C, once
    //                   per stage load. src/flow.js fullScreenLoad().
    const drops = ran ? state.frameDrops : 1;
    if (drops) lagCum += drops;
    rows.push(sampleRow(state, g, o.watch, drops));
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
    // null unless stopOnThrow was set AND a throw was caught: { atFrame, message }
    threw,
    // THE VIDEO THE PORT ENDED UP WITH, at the last traced frame. Copies, not
    // views: `state` keeps mutating if a caller runs another trace on it, and a
    // comparison that silently followed the live arrays would compare a frame
    // to itself. Only the 2 KB of real nametable is taken -- $2800-$2FFF is the
    // vertical mirror src/vram.js writes and is not a second screen.
    finalVideo: {
      nt: Uint8Array.prototype.slice.call(state.vram.nt, 0, 0x800),
      pal: Uint8Array.prototype.slice.call(state.vram.pal),
      oam: Uint8Array.prototype.slice.call(state.hwOam),
      // Not video, but the same argument: $0500-$06FF is seeded now and is in
      // no watch list, so the only thing that can hold $9F55's derivation to
      // account is the map the port ENDS the window with.
      coll: Uint8Array.prototype.slice.call(state.coll),
    },
    frames: rows,
  };
}

/**
 * Load a recorded oracle artifact and pull the seed out of it.
 *
 * A MISSING FIELD IS A HARD ERROR, NOT A DEFAULT. Wave 99 wrote this lesson
 * down after the display-list block: an artifact recorded before a seed field
 * existed would otherwise seed the port with nothing, and the comparison would
 * go green over a port that had been handed less state than it should have. So
 * a pre-wave-10 artifact fails here, naming the command that fixes it.
 */
export function loadOracle(name) {
  const p = join(SCEN_OUT, `${name}.json`);
  if (!existsSync(p)) return null;
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  const b64 = (field, want) => {
    if (doc[field] === undefined) {
      throw new Error(`${name}: the artifact has no ${field}. It was recorded `
                    + `before wave 10 added the video seed. Re-record it:\n`
                    + `  python games/gradius/tools/oracle/scen.py --only ${name}`);
    }
    const buf = Buffer.from(doc[field], 'base64');
    if (buf.length !== want) {
      throw new Error(`${name}: ${field} is ${buf.length} bytes, want ${want}`);
    }
    return buf;
  };
  doc.seed = {
    ram: b64('seedRam', 2048),          // $0000-$07FF
    vram: b64('seedVram', 2048),        // PPU $2000-$27FF
    palette: b64('seedPalette', 32),    // $3F00-$3F1F
    oam: b64('seedOam', 256),           // hardware OAM
    chrBank: doc.seedChrBank,           // $2D at the align frame
    chrOffset: doc.seedChrOffset,       // mapper.chrMemoryOffset0
    splitRan: doc.seedSplitRan,         // did $9AA3 fire on the align frame
  };
  // The END-OF-WINDOW video. NOT a seed -- it is what compare.mjs holds the
  // port's own output against. Same missing-field rule: a pre-wave-10 artifact
  // must fail here rather than quietly skip the check.
  doc.final = {
    frame: doc.finalFrame,
    nt: b64('finalVram', 2048),
    pal: b64('finalPalette', 32),
    oam: b64('finalOam', 256),
    ntChanged: doc.ntChanged,
    ntHalvesDiffer: doc.ntHalvesDiffer,
    coll: b64('finalColl', 512),        // $0500-$06FF at the same frame
    collChanged: doc.collChanged,
  };
  if (doc.seedChrOffset === undefined) {
    throw new Error(`${name}: the artifact has no seedChrOffset (wave 10). `
                  + `Re-record: python games/gradius/tools/oracle/scen.py `
                  + `--only ${name}`);
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
