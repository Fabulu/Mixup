// W173/W176: `$28AC72`'s word-threshold and `$28AC86`'s long-threshold cue
// spawners, plus the live `$28AD70` driver path.
// Type `$84` seeds four 14-byte threshold records at `$275276..$2752AE`.
// Every resulting cue starts as descriptor kind 0, then advances through the
// bounded kind-4 and (for the first two thresholds) kind-8 paths.
//
// =========================================================================
// W429: THE SECOND CUE SCRIPT, AND THE `not.b D3` NOBODY HAD PORTED
// =========================================================================
// `$28AE18` is a TWENTY-entry jump table indexed by the cue's kind byte
// offset (`$28ADBA moveq #$7C,D0 / and.w D2,D0 / lea ($58,PC),A4 /
// adda.w D0,A4 / movea.l (A4),A4 / jmp (A4)`). Ten distinct targets, and
// entries 10..19 REPEAT entries 0..9 -- the `$20` bit of the kind is not
// looked at. Six of the ten are 34-byte art bodies that differ only in a
// PC-relative `lea` and one `move.w #imm,($24,A6)`; the seventh (`$28AF34`)
// is a bare `nop` that falls into the shared tail, i.e. NO art at all.
//
//     kind $00 $28AE68  art $28B032  reload $0C     kind $18/$1C/$20/$24
//     kind $04 $28AE8A  art $28B050  reload $0C       -> $28AF34, no art
//     kind $08 $28AEAC  art $28B06E  reload $1C     kind $28..$4C mirror
//     kind $0C $28AECE  art $28B09C  reload $0C       $00..$24
//     kind $10 $28AEF0  art $28B0BA  reload $0C
//     kind $14 $28AF12  art $28B0D8  reload $1C
//
// **THE BRIEF SAID `$28AFD4` HOLDS 14 LIVE DESCRIPTORS. FOURTEEN ENTRIES ARE
// NON-ZERO; ONLY SIX ARE REACHABLE.** The dispatch table is indexed by words
// taken from a CUE SCRIPT, and the whole image contains exactly five referenced
// cue scripts -- `$28AF84` (18 refs), `$28AF8A` (26), `$28AF98` (2), `$28AFA0`
// (2), `$28AFA4` (2). Between them they name indices `$00 $04 $08 $0C $10 $14`
// and nothing else. `$28AF92` and the six scripts `$28AFB0..$28AFD2` that name
// `$18`/`$1C`/`$28`..`$3C` have ZERO references, so descriptors `$28B0F8`,
// `$28B106`, `$28B114`, `$28B122`, `$28B130` and `$28B13E` are unreachable in
// this revision and are deliberately NOT declared as ROM windows.
//
// **AND `$28ACFE..$28AD26` WAS MISSING FROM `installCue` ENTIRELY.** Before D3
// is stored the ROM does `tst.b D3 / bpl`, and on a NEGATIVE low byte
// `not.b D3` then flips bit 5 and bit 6 back, each gated on its own
// `jsr $242FDE` draw. Six of the fifty cue records in the image have that bit
// set, and FOUR of them feed the already-shipped kinds `$00`/`$04`, so this was
// live and wrong before this wave touched it. The hardware proves the port:
// every one of those six records carries `D3 = $0010FFBF`, and the five oracle
// snapshots that hold a live kind-$C cue read back `+$18 = $0010FF00` and
// `+$1C = $001E` -- `$BF -> not.b -> $40 -> eori.b #$40 -> $00`, exactly.

import { unreached } from './unported.js';
import { u16 } from './ram.js';
import { drawSigned242FDE } from './rng.js';
import { enqueueThroughStub } from './spritequeue.js';

export const CUE = Object.freeze({
  base: 0x81db90, stride: 0x26, slots: 10,
  count: 0x81dd0c, stagger: 0x81dd0e,
  dispatch: 0x28afd4, dispatchEntries: 20,
  emitterTable: 0x28af6c, emitterEntries: 6,
  artJump: 0x28ae18, artJumpEntries: 20,
  desc0: 0x28b024, desc4: 0x28b042, desc8: 0x28b060,
  descC: 0x28b08e, desc10: 0x28b0ac, desc14: 0x28b0ca,
  art0: 0x28b032, art0Frames: 4,
  art4: 0x28b050, art4Frames: 4,
  art8: 0x28b06e, art8Frames: 8,
  artC: 0x28b09c, artCFrames: 4,
  art10: 0x28b0ba, art10Frames: 4,
  art14: 0x28b0d8, art14Frames: 8,
});

/** The six art bodies `$28AE18`'s jump table lands in, keyed by the kind byte
 *  offset `$28ADBA` computes. `art` is the body's PC-relative `lea` target and
 *  `reload` is its `move.w #imm,($24,A6)` -- BOTH read from the instruction,
 *  not derived from the descriptor. The correspondence `art == descriptor + 14`
 *  and `reload == descriptor+$0C` holds for these six and BREAKS for the six
 *  unreachable descriptors at `$28B0F8..$28B13E`, which carry no art of their
 *  own, so deriving either one would have been wrong. */
export const CUE_KINDS = Object.freeze({
  0x00: Object.freeze({ body: 0x28ae68, art: 0x28b032, reload: 0x0c, desc: 0x28b024 }),
  0x04: Object.freeze({ body: 0x28ae8a, art: 0x28b050, reload: 0x0c, desc: 0x28b042 }),
  0x08: Object.freeze({ body: 0x28aeac, art: 0x28b06e, reload: 0x1c, desc: 0x28b060 }),
  0x0c: Object.freeze({ body: 0x28aece, art: 0x28b09c, reload: 0x0c, desc: 0x28b08e }),
  0x10: Object.freeze({ body: 0x28aef0, art: 0x28b0ba, reload: 0x0c, desc: 0x28b0ac }),
  0x14: Object.freeze({ body: 0x28af12, art: 0x28b0d8, reload: 0x1c, desc: 0x28b0ca }),
});

/** The dispatch byte offsets any REFERENCED cue script actually names. Measured
 *  by scanning the image for longwords pointing into `$28AF84..$28AFD2`:
 *  `$28AF84 -> 00 04`, `$28AF8A -> 00 04 08`, `$28AF98 -> 0C 10 14`,
 *  `$28AFA0 -> 00`, `$28AFA4 -> 04`. `tests/w429cuekinds.test.js` re-derives
 *  this from the cartridge so the claim cannot go stale. */
export const CUE_REACHABLE_INDICES = Object.freeze([0x00, 0x04, 0x08, 0x0c, 0x10, 0x14]);

const F = Object.freeze({
  flags: 0x00, pos: 0x02, offset: 0x06, sprite: 0x0a, size: 0x0e,
  parent: 0x10, delta: 0x14, emitter: 0x18, script: 0x1e,
  descriptorWord: 0x1c, countdown: 0x22, phase: 0x24,
});

function descriptor(rom, index) {
  if ((index & 3) !== 0 || index >= CUE.dispatchEntries * 4) {
    unreached(CUE.dispatch + index, `$28ACDE cue descriptor byte offset $$${index
      .toString(16).toUpperCase()} is outside the 20-entry table`);
  }
  const addr = rom.u32(CUE.dispatch + index);
  if (!CUE_REACHABLE_INDICES.includes(index)) {
    // The eight remaining non-zero entries all point at $28B0F8..$28B13E, and
    // the six zero ones would send `$28ACE0 movea.l (0,A3,D0.w),A3` to
    // $000000. Neither is reachable: the only cue scripts that name indices
    // $18..$4C are the six at $28AFB0, $28AFB6, $28AFBE, $28AFC4, $28AFCC and
    // $28AFD0, and not one of the six has a single reference in the image.
    unreached(addr, `cue dispatch index $$${index.toString(16).toUpperCase()} `
      + `selects ${addr === 0 ? 'a ZERO entry'
        : `descriptor $${addr.toString(16).toUpperCase()}`}, and no REFERENCED `
      + 'cue script names that index -- the only scripts that name $18..$4C are '
      + 'the six at $28AFB0..$28AFD2, and none of the six is referenced anywhere '
      + 'in the cartridge');
  }
  return addr;
}

/** `$28AD2A/$28AD2C` on big-endian 68000 memory. The word copy writes both
 * bytes at cue `+$1C`, then `move.b D3,-2(A0)` replaces the byte at the lower
 * address, which is the word's HIGH byte. */
export function mergeDescriptorByte28AD2C(descriptorWord, d3) {
  return (((d3 & 0xff) << 8) | (descriptorWord & 0xff)) & 0xffff;
}

/** `$28ACFE..$28AD26`, run on D3 immediately before it is stored at `+$18`.
 *
 * `tst.b D3 / bpl` -- so this whole block is skipped unless the LOW BYTE is
 * negative. `not.b D3` complements only that byte; the two `btst`s are on a
 * data register and therefore modulo 32, but bits 5 and 6 of the long are bits
 * 5 and 6 of the low byte, so the byte view is exact. Each flip is gated on
 * `jsr $242FDE / bne` -- the eori happens when the draw returns ZERO.
 *
 * **THE DRAWS ARE OBSERVABLE STATE, NOT A DETAIL.** `$242FDE` bumps `$803917`,
 * so skipping this block did not merely mis-store one byte, it left the shared
 * draw cursor one or two steps behind for every other consumer that frame. */
export function selectEmitter28ACFE(ram, rom, d3) {
  if ((d3 & 0x80) === 0) return d3 >>> 0;              // $28ACFE tst.b / $28AD00 bpl
  let v = ((d3 & ~0xff) | (~d3 & 0xff)) >>> 0;         // $28AD02 not.b D3
  if ((v & 0x20) !== 0 && drawSigned242FDE(ram, rom) === 0) v ^= 0x20; // $28AD04..$28AD14
  if ((v & 0x40) !== 0 && drawSigned242FDE(ram, rom) === 0) v ^= 0x40; // $28AD16..$28AD26
  return v >>> 0;
}

function installCue(ram, rom, slot, parent, d2, d3, script, countLive) {
  const index = rom.u16(script); script += 2;          // $28ACD6
  const desc = descriptor(rom, index);                 // $28ACD8..$28ACE0
  let flags = rom.u16(desc);                           // $28ACE2
  if ((rom.u16(script) & 0x8000) !== 0) flags |= 0x0080; // $28ACE4..$28ACE8
  ram.setU16(slot + F.flags, flags);
  ram.setU32(slot + F.pos, ram.u32(parent + 0x02));
  ram.setU32(slot + F.offset, rom.u32(desc + 2));
  ram.setU16(slot + F.size, rom.u16(desc + 6));
  ram.setU32(slot + F.parent, parent);
  ram.setU32(slot + F.delta, d2);
  d3 = selectEmitter28ACFE(ram, rom, d3);              // $28ACFE..$28AD26
  ram.setU32(slot + F.emitter, d3);
  ram.setU16(slot + F.descriptorWord,
    mergeDescriptorByte28AD2C(rom.u16(desc + 8), d3));
  ram.setU32(slot + F.script, script);
  const timers = rom.u32(desc + 10);
  ram.setU32(slot + F.countdown, ((timers & 0xffff0000)
    | u16((timers & 0xffff) - ram.u16(CUE.stagger))) >>> 0); // $28AD32..$28AD3A
  if (countLive) ram.setU16(CUE.count, u16(ram.u16(CUE.count) + 1));
  const old = ram.u16(CUE.stagger);
  ram.setU16(CUE.stagger, old < 4 ? 0x0c : old - 4);   // $28AD3C..$28AD4A
}

/** `$28AC72`, the word-threshold entry used by enemy handlers. */
export function spawnCues28AC72(ram, rom, a5, a6) {
  let script = ram.u32(a5 + 0x44);
  for (;;) {
    const threshold = rom.u16(script);
    if ((threshold & 0x8000) !== 0 || threshold < ram.u16(a6 + 0x18)) break;
    let slot = null;
    for (let i = 0; i < CUE.slots; i++) {
      const at = CUE.base + i * CUE.stride;
      if (ram.u16(at) === 0) { slot = at; break; }
    }
    const d2 = rom.u32(script + 2);
    const d3 = rom.u32(script + 6);
    const cueScript = rom.u32(script + 10);
    script += 14;
    ram.setU32(a5 + 0x44, script);                     // both success and full
    if (slot !== null) installCue(ram, rom, slot, ram.u32(a5 + 0x06),
      d2, d3, cueScript, true);
  }
}

/** `$28AC86`, the long-threshold entry used by type `$8C`. D0 is the live
 * 32-bit damage accumulator at sub-record +$3C. Each record is sixteen bytes:
 * threshold.l followed by the same D2.l/D3.l/script.l payload `$28ACA0`
 * consumes for the word-threshold entry. */
export function spawnCues28AC86(ram, rom, a5, d0) {
  let script = ram.u32(a5 + 0x44);
  for (;;) {
    const threshold = rom.u32(script); script += 4;
    if ((threshold & 0x80000000) !== 0 || (threshold | 0) < (d0 | 0)) break;
    let slot = null;
    for (let i = 0; i < CUE.slots; i++) {
      const at = CUE.base + i * CUE.stride;
      if (ram.u16(at) === 0) { slot = at; break; }
    }
    const d2 = rom.u32(script);
    const d3 = rom.u32(script + 4);
    const cueScript = rom.u32(script + 8);
    script += 12;
    ram.setU32(a5 + 0x44, script);                     // success and full
    if (slot !== null) installCue(ram, rom, slot, ram.u32(a5 + 0x06),
      d2, d3, cueScript, true);
  }
}

function emitCue(ram, rom, cue) {
  const flags = ram.u16(cue + F.flags);
  const kind = flags & 0x7c;                 // $28ADBA moveq #$7C / and.w D2,D0
  const spec = CUE_KINDS[kind];
  if (spec === undefined) {
    // $18..$24 (and their $28..$4C mirrors) reach `$28AF34`, a bare `nop` into
    // the shared tail. They are not ported because no reachable descriptor
    // carries those kinds -- the only descriptors that do are $28B0F8..$28B13E
    // and nothing references the cue scripts that select them. $50 and up run
    // off the END of the twenty-entry table and would `jmp` into the code
    // that follows it.
    unreached(CUE.artJump + kind, kind >= CUE.artJumpEntries * 4
      ? `live cue kind byte offset $${kind.toString(16).toUpperCase()} runs off `
        + `the end of $28AE18's ${CUE.artJumpEntries}-entry art jump table`
      : `live cue kind byte offset $${kind.toString(16).toUpperCase()} is in `
        + '$28AE18\'s table but no REACHABLE descriptor carries it');
  }
  const table = spec.art, reload = spec.reload;

  const phase = ram.u16(cue + F.phase);
  if (phase > reload || (phase & 3) !== 0) {
    unreached(table + phase, `cue phase $${phase.toString(16).toUpperCase()} is `
      + `outside its 0..$${reload.toString(16).toUpperCase()} stride-4 art table`);
  }
  ram.setU32(cue + F.sprite, rom.u32(table + phase));
  ram.setU16(cue + F.phase, phase < 4 ? reload : phase - 4);
  const parent = ram.u32(cue + F.parent);
  ram.setU32(cue + F.pos, (ram.u32(parent + 0x02) + ram.u32(cue + F.delta)) >>> 0);
  let sel = ram.u16(cue + F.emitter);
  if ((ram.u8(cue) & 1) !== 0) sel = u16(ram.u8(parent + 0x1e) << 2);
  if ((sel & 3) !== 0 || sel >= CUE.emitterEntries * 4) {
    unreached(CUE.emitterTable + sel, `cue emitter byte offset $${sel
      .toString(16).toUpperCase()} is outside the six-entry table`);
  }
  enqueueThroughStub(ram, rom, rom.u32(CUE.emitterTable + sel), cue);
}

/** `$28AD70..$28AF6A`, after the 150-slot enemy sub-record reaper. */
export function runCueDriver28AD70(ram, rom) {
  let remaining = ram.u16(CUE.count);
  let live = 0, emitted = 0, freed = 0, advanced = 0;
  for (let i = 0; i < CUE.slots && remaining !== 0; i++) {
    const cue = CUE.base + i * CUE.stride;
    if (ram.u16(cue) === 0) continue;
    remaining--; live++;
    const parent = ram.u32(cue + F.parent);
    const parentFlags = ram.u16(parent);
    if ((parentFlags & 0x8000) === 0 || (parentFlags & 0xff) >= 0x80
        || ram.u8(0x8130f8) >= 0x80) {
      ram.setU16(cue, 0);
      ram.setU16(CUE.count, u16(ram.u16(CUE.count) - 1));
      freed++;
      continue;
    }
    if (ram.u16(0x80390c) === 0) continue;
    // `$28ADAC tst.b d2` tests the low byte of the word loaded from `(A6)`.
    if ((ram.u8(cue + 1) & 0x80) === 0) {
      const countdown = ram.u16(cue + F.countdown);
      ram.setU16(cue + F.countdown, u16(countdown - 1));
      if (countdown === 1) {
        if ((ram.u8(cue) & 0x02) !== 0) {
          unreached(0x28ade8, `type $84 reached cue bit-1 child allocation, `
            + `outside its replace-in-place descriptor path`);
        }
        installCue(ram, rom, cue, parent, ram.u32(cue + F.delta),
          ram.u32(cue + F.emitter), ram.u32(cue + F.script), false);
        advanced++;
      }
    }
    emitCue(ram, rom, cue); emitted++;
  }
  return { live, emitted, freed, advanced };
}
