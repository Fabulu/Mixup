// THE PALETTE ANIMATION OBJECTS: loader `$246410` and frame driver `$24683E`.
//
// Three roots at `$810346` own linked chains drawn from twenty `$70`-byte
// nodes at `$80FA86`. Each node fades one contiguous palette range toward a
// ROM colour block and raises the matching palette-upload dirty word. Type
// `$8C` is the first ported enemy that requires this path during ordinary
// stage play, both for its spawn colours and its fifteen-part death fade.

import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';

export const ANIM_OBJECT = Object.freeze({
  roots: 0x810346, rootStride: 0x30, rootSlots: 3,
  nodes: 0x80fa86, nodeStride: 0x70, nodeSlots: 20,
});

const N = Object.freeze({
  status: 0x00, mode: 0x04, writer: 0x06, target: 0x0a, current: 0x0e,
  fill: 0x12, countdown: 0x14, reload: 0x16, active: 0x18,
  step: 0x1c, shared: 0x1e, progress: 0x20, next: 0x2c, snapshot: 0x30,
});

const TARGETS = Object.freeze({
  0x00: { current: 0x80e886, dirty: 0x80fa66 },
  0x08: { current: 0x80f086, dirty: 0x80fa68 },
  0x10: { current: 0x80f886, dirty: 0x80fa6a },
});

function timing(index) {
  index &= 0x1f;                                      // $246496
  if (index === 0) return [0, 4];
  if (index === 1) return [0, 3];
  if (index === 2) return [0, 2];
  if (index === 3) return [0, 1];
  return [index - 3, 1];                              // `$246B38` entries 4..31
}

function clearChain(ram, root) {
  let at = root;
  while (at !== 0) {
    const next = ram.u32(at + N.next);
    ram.setU16(at + N.status, 0);                     // $246806
    ram.setU16(at + N.mode, 0);                       // $246808
    at = next;
  }
}

/** `$246410`, the counted palette-animation loader. The table is
 * `count.w`, followed by `count` fourteen-byte entries:
 * `{fill.w, target-family.w, current-offset.w, target.l, words-minus-one.w,
 * timing-index.w}`. Returns the root address, or zero when either pool is
 * full, matching the ROM's all-or-nothing chain cleanup. */
/** W372: `mode` is D6, and the ROM has TWO ENTRY POINTS that differ only in it -- `$246410` sets
 *  `#$1` and falls into the body at `$246422`; `$24641A` sets `#$0` and falls into the same body two
 *  instructions later. Exactly the shape `buildParts246520`/`$24652A` has. So `$24641A` is not a
 *  routine to port: it is this one called with 0, and slot [7]'s `$2907E2` state 3 is its caller. */
export function loadAnimObjects246410(ram, rom, table, mode = 1) {
  let root = 0;
  for (let i = 0; i < ANIM_OBJECT.rootSlots; i++) {
    const at = ANIM_OBJECT.roots + i * ANIM_OBJECT.rootStride;
    if (i16(ram.u16(at)) >= 0) { root = at; break; }
  }
  if (root === 0) return 0;                            // $246510..$24651E

  ram.setU16(root + N.status, 0x8000);
  ram.setU16(root + N.mode, mode);                    // D6: 1 from $246410, 0 from $24641A
  ram.setU32(root + N.next, 0);
  let previous = root;
  let left = rom.u16(table); table += 2;              // $24643C

  while (left !== 0) {
    let node = 0;
    for (let i = 0; i < ANIM_OBJECT.nodeSlots; i++) {
      const at = ANIM_OBJECT.nodes + i * ANIM_OBJECT.nodeStride;
      if (i16(ram.u16(at)) >= 0) { node = at; break; }
    }
    if (node === 0) { clearChain(ram, root); return 0; }

    ram.setU16(node + N.status, 0x8000);
    ram.setU16(node + N.progress, 0);
    ram.setU32(node + N.next, 0);
    ram.setU32(previous + N.next, node);
    previous = node;
    ram.setU16(node + N.shared, 0);
    ram.setU16(node + 0x02, 0);

    const fill = rom.u16(table); table += 2;
    const family = rom.u16(table); table += 2;
    const targetFamily = TARGETS[family];
    if (!targetFamily) {
      clearChain(ram, root);
      unreached(0x246478, `$246410 target-family byte offset $${family
        .toString(16).toUpperCase()} is outside the three-entry $24627A table`);
    }
    const current = targetFamily.current + rom.i16(table); table += 2;
    const target = rom.u32(table); table += 4;
    const wordsMinusOne = rom.u16(table); table += 2;
    const timingIndex = rom.u16(table); table += 2;
    const [reload, step] = timing(timingIndex);

    // `$24627A[family+4]` is the animation executor's write callback. For the
    // three palette families it resolves to the matching dirty-word address;
    // keeping the resolved address in RAM preserves the board's node layout.
    ram.setU32(node + N.writer, targetFamily.dirty);
    ram.setU32(node + N.current, current);
    ram.setU32(node + N.target, target);
    ram.setU16(node + N.fill, fill);
    ram.setU16(node + N.mode, wordsMinusOne);
    ram.setU16(node + N.reload, reload);
    ram.setU16(node + N.countdown, reload);
    ram.setU16(node + N.step, step);
    ram.setU32(node + N.active, 0xffff0000);
    ram.setU16(targetFamily.dirty, 1);
    for (let i = 0; i <= wordsMinusOne; i++) {
      ram.setU16(current + i * 2, fill);
      ram.setU16(node + N.snapshot + i * 2, fill);
    }
    left--;
  }
  return root;                                        // $246508
}

/** `$246520`, the no-fill palette-animation loader used by the stage-2 boss
 * death. Entries omit `$246410`'s fill word and snapshot the live palette
 * instead of overwriting it before the fade begins. */
function loadAnimObjectsNoFill(ram, rom, table, rootMode, site) {
  let root = 0;
  for (let i = 0; i < ANIM_OBJECT.rootSlots; i++) {
    const at = ANIM_OBJECT.roots + i * ANIM_OBJECT.rootStride;
    if (i16(ram.u16(at)) >= 0) { root = at; break; }
  }
  if (root === 0) return 0;

  ram.setU16(root + N.status, 0x8000);
  ram.setU16(root + N.mode, rootMode);
  ram.setU32(root + N.next, 0);
  let previous = root;
  let left = rom.u16(table); table += 2;

  while (left !== 0) {
    let node = 0;
    for (let i = 0; i < ANIM_OBJECT.nodeSlots; i++) {
      const at = ANIM_OBJECT.nodes + i * ANIM_OBJECT.nodeStride;
      if (i16(ram.u16(at)) >= 0) { node = at; break; }
    }
    if (node === 0) { clearChain(ram, root); return 0; }

    ram.setU16(node + N.status, 0x8000);
    ram.setU16(node + N.progress, 0);
    ram.setU32(node + N.next, 0);
    ram.setU32(previous + N.next, node);
    previous = node;
    ram.setU16(node + N.shared, 0);
    ram.setU16(node + 0x02, 0);

    const family = rom.u16(table); table += 2;
    const targetFamily = TARGETS[family];
    if (!targetFamily) {
      clearChain(ram, root);
      unreached(site, `$${site.toString(16).toUpperCase()} target-family byte offset $${family
        .toString(16).toUpperCase()} is outside the three-entry $24627A table`);
    }
    const current = targetFamily.current + rom.i16(table); table += 2;
    const target = rom.u32(table); table += 4;
    const wordsMinusOne = rom.u16(table); table += 2;
    const timingIndex = rom.u16(table); table += 2;
    const [reload, step] = timing(timingIndex);

    ram.setU32(node + N.writer, targetFamily.dirty);
    ram.setU32(node + N.current, current);
    ram.setU32(node + N.target, target);
    ram.setU16(node + N.fill, 0);
    ram.setU16(node + N.mode, wordsMinusOne);
    ram.setU16(node + N.reload, reload);
    ram.setU16(node + N.countdown, reload);
    ram.setU16(node + N.step, step);
    ram.setU32(node + N.active, 0xffff0000);
    for (let i = 0; i <= wordsMinusOne; i++)
      ram.setU16(node + N.snapshot + i * 2, ram.u16(current + i * 2));
    left--;
  }
  return root;
}

/** `$24652A`, the mode-zero direct entry into the no-fill loader. Mode-zero
 * roots are not auto-retired by `$24683E`; their owner keeps the returned
 * handle and explicitly frees the chain through `$246800`. */
export function loadAnimObjects24652A(ram, rom, table) {
  return loadAnimObjectsNoFill(ram, rom, table, 0, 0x246588);
}

export function loadAnimObjects246520(ram, rom, table) {
  return loadAnimObjectsNoFill(ram, rom, table, 1, 0x246588);
}

/** `$246800`, free one animation-object root and its linked node chain. */
export function freeAnimObjects246800(ram, root) {
  if (root !== 0) clearChain(ram, root);
}

function moveChannel(current, target) {
  if (current === target) return current;
  if (target > current) {
    current++;
    if (current === 0x10) current++;
    return Math.min(current, 0x1f);
  }
  current--;
  if (current === 0x10) current--;
  return Math.max(current, 0);
}

function stepNode(ram, rom, node) {
  if (ram.u16(node + N.active) === 0) return;
  const oldCountdown = ram.u16(node + N.countdown);
  ram.setU16(node + N.countdown, oldCountdown - 1);
  if (oldCountdown !== 0) return;                     // $2468A6 bcc
  ram.setU16(node + N.countdown, ram.u16(node + N.reload));
  if (ram.u16(node + N.progress) === 0x20) return;

  const step = ram.u16(node + N.step);
  const progress = u16(ram.u16(node + N.progress) + step);
  ram.setU16(node + N.progress, progress);
  if (i16(progress) >= 0x20) {
    ram.setU16(node + N.active, 0);
    ram.setU16(node + N.status, 0);
  }

  let target = ram.u32(node + N.target);
  let current = ram.u32(node + N.current);
  const currentStride = ram.u16(node + N.shared) === 0 ? 2 : 0;
  for (let i = 0; i <= ram.u16(node + N.mode); i++) {
    const want = rom.u16(target);
    let have = ram.u16(current);
    if ((want & 0x7fff) !== (have & 0x7fff)) {
      let r = (have >>> 10) & 0x1f;
      let g = (have >>> 5) & 0x1f;
      let b = have & 0x1f;
      const tr = (want >>> 10) & 0x1f;
      const tg = (want >>> 5) & 0x1f;
      const tb = want & 0x1f;
      for (let n = 0; n < step; n++) {
        r = moveChannel(r, tr); g = moveChannel(g, tg); b = moveChannel(b, tb);
      }
      have = ((r << 10) | (g << 5) | b) & 0x7fff;
      ram.setU16(current, have);                       // $246B1E
      ram.setU16(ram.u32(node + N.writer), 1);        // $246B20
    }
    target += 2;
    current += currentStride;
  }
}

/** `$24683E`, main-loop call #3. Advances all live chains and frees a mode-1
 * root once every node's active word has drained to zero. */
export function runAnimObjects24683E(ram, rom) {
  let roots = 0, nodes = 0, freed = 0;
  for (let i = 0; i < ANIM_OBJECT.rootSlots; i++) {
    const root = ANIM_OBJECT.roots + i * ANIM_OBJECT.rootStride;
    if (i16(ram.u16(root)) >= 0) continue;
    roots++;
    let node = ram.u32(root + N.next);
    let activeSum = 0;
    while (node !== 0) {
      // Result-screen `$24652A` chains are still deliberately content-light
      // (stageend.js DEV-2): their executor pointer at +$06 is zero. They
      // predate this palette executor and must remain inert until that distinct
      // presentation family is ported. `$246410` always seeds a nonzero writer.
      if (ram.u16(node + N.status) !== 0 && ram.u32(node + N.writer) !== 0) {
        stepNode(ram, rom, node);
      }
      activeSum = u16(activeSum + ram.u16(node + N.active));
      nodes++;
      node = ram.u32(node + N.next);
    }
    if (ram.u16(root + N.mode) === 1 && activeSum === 0) {
      clearChain(ram, root); freed++;
    }
  }
  return { roots, nodes, freed };
}
