// W173/W176: `$28AC72`'s word-threshold and `$28AC86`'s long-threshold cue
// spawners, plus the live `$28AD70` driver path.
// Type `$84` seeds four 14-byte threshold records at `$275276..$2752AE`.
// Every resulting cue starts as descriptor kind 0, then advances through the
// bounded kind-4 and (for the first two thresholds) kind-8 paths.

import { unreached } from './unported.js';
import { u16 } from './ram.js';
import { enqueueThroughStub } from './spritequeue.js';

export const CUE = Object.freeze({
  base: 0x81db90, stride: 0x26, slots: 10,
  count: 0x81dd0c, stagger: 0x81dd0e,
  dispatch: 0x28afd4, dispatchEntries: 20,
  emitterTable: 0x28af6c, emitterEntries: 6,
  desc0: 0x28b024, desc4: 0x28b042, desc8: 0x28b060,
  art0: 0x28b032, art0Frames: 4,
  art4: 0x28b050, art4Frames: 4,
  art8: 0x28b06e, art8Frames: 8,
});

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
  if (addr !== CUE.desc0 && addr !== CUE.desc4 && addr !== CUE.desc8) {
    unreached(addr, `cue descriptor $${addr.toString(16).toUpperCase()} is not `
      + `in type $84's bounded kind-0/kind-4/kind-8 closure`);
  }
  return addr;
}

/** `$28AD2A/$28AD2C` on big-endian 68000 memory. The word copy writes both
 * bytes at cue `+$1C`, then `move.b D3,-2(A0)` replaces the byte at the lower
 * address, which is the word's HIGH byte. */
export function mergeDescriptorByte28AD2C(descriptorWord, d3) {
  return (((d3 & 0xff) << 8) | (descriptorWord & 0xff)) & 0xffff;
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
  const kind = flags & 0x7c;
  let table, reload;
  if (kind === 0) { table = CUE.art0; reload = 0x0c; }
  else if (kind === 4) { table = CUE.art4; reload = 0x0c; }
  else if (kind === 8) { table = CUE.art8; reload = 0x1c; }
  else unreached(0x28ae18 + kind, `live cue kind byte offset $${kind
    .toString(16).toUpperCase()} is outside type $84's kind-0/kind-4/kind-8 closure`);

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
