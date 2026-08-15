// THE PALETTE ANIMATION OBJECTS: loader `$246410` and frame driver `$24683E`.
//
// Three roots at `$810346` own linked chains drawn from twenty `$70`-byte
// nodes at `$80FA86`. Each node fades one contiguous palette range toward a
// ROM colour block and raises the matching palette-upload dirty word. Type
// `$8C` is the first ported enemy that requires this path during ordinary
// stage play, both for its spawn colours and its fifteen-part death fade.
//
// W386: the GAME-OVER screen is the second. Object slot [14] ($288BCE, staged by slot [13]'s
// state 4) opens a one-entry chain at `$288C2E` whose target is `$2252F8`, and until W386
// declared that 64-byte window every cold boot ended HERE, in `stepNode`, at frame +4,081.

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

// ===========================================================================
// `$24676A..$2467C3` -- THE PER-NODE CONTENT SEEDING `$246710` DOES AND THE PORT DID NOT.  W388.
// ===========================================================================
// This is the routine five waves of notes have called "the presentation tier" and deferred. It
// is 90 bytes, it reads three tables that ALREADY have declared ROM windows, and it is why
// `hiscoreScreen25B412`'s state 2 never finished.
//
// THE MECHANISM, end to end. `chainLoaderBody` in `stageend.js` ports `$246710`'s POOL
// LIFECYCLE byte for byte -- claim the root, allocate N nodes, link `($2C)`, seed
// `($18) := $FFFF0000` -- and stops there. It never writes `($6,node)`, the executor pointer.
// `runAnimObjects24683E` below skips any node whose `($6)` is zero, so those nodes were never
// stepped, `($18)` never drained, `chainCheck24681A` never summed to zero, and `$25B412` state 2
// waited forever. NOT A GATE: the cartridge has no branch that would hold here.
//
// WHY STATE 0 WORKED AND STATE 2 DID NOT, which is the detail that names the bug precisely:
// `hiscoreInit25B3DC` loads state 0's chain through `$24641A` -- `loadAnimObjects246410` above,
// which HAS its content seeding -- while state 1 loads state 2's chain through `$246710`, which
// did not. Same screen, two loaders, one of them hollow.
//
// THE BYTES, decoded this wave:
//
//   246768  3418            move.w (A0)+,D2            <- the family word
//   24676A  47fa fb0e       lea (-$4F2,PC),A3          -> $24676C-$4F2 = $24627A
//   24676E  2573 2004 0006  move.l ($4,A3,D2.w),($6,A2)   <- THE WRITER. The missing store.
//   246774  2673 2000       movea.l ($0,A3,D2.w),A3       <- the family's palette base
//   246778  d6d8            adda.w (A0)+,A3               <- plus the script's offset word
//   24677A  254b 000e       move.l A3,($E,A2)             <- N.current
//   24677E  257c 0024 6bb8 000a  move.l #$246BB8,($A,A2)  <- N.target: A CONSTANT, not a script
//                                                            field. $246BB8 is the all-zero
//                                                            bank W91 already declares. BLACK.
//   246786  3558 0004       move.w (A0)+,($4,A2)          <- words-minus-one
//   24678A  3618            move.w (A0)+,D3               <- timing index
//   24678C  0243 001f       andi.w #$1F,D3
//   246790  d643            add.w D3,D3
//   246792  d643            add.w D3,D3                   <- index * 4
//   246794  47fa 03a2       lea ($3A2,PC),A3           -> $246796+$3A2 = $246B38
//   246798  4e71            nop
//   24679A  d6c3            adda.w D3,A3
//   24679C  355b 0016       move.w (A3)+,($16,A2)         <- N.reload
//   2467A0  356a 0016 0014  move.w ($16,A2),($14,A2)      <- N.countdown := reload
//   2467A6  3553 001c       move.w (A3),($1C,A2)          <- N.step
//   2467AA  257c ffff 0000 0018  move.l #$FFFF0000,($18,A2)
//   2467B2  266a 000e       movea.l ($E,A2),A3
//   2467B6  382a 0004       move.w ($4,A2),D4
//   2467BA  49ea 0030       lea ($30,A2),A4
//   2467BE  38db            move.w (A3)+,(A4)+            <- SNAPSHOT the live palette
//   2467C0  51cc fffc       dbra D4,$2467BE               <- N+1, so words-minus-one is inclusive
//
// FOUR WORDS PER NODE, and the script bound confirms it: `$25BAAA` says 8 nodes and
// `2 + 8*8 = $42` is exactly W303's declared window length. No window is added by this wave.
//
// **WHY THIS IS A SECOND PASS AND NOT INLINE.** The ROM interleaves this block with the
// allocation `dbra` at `$2467CE`, but the allocator lives in `stageend.js`, which this wave does
// not own. Applying it as a second walk of the same `($2C)` chain in script order lands the
// IDENTICAL RAM: the allocation pass writes `($0) ($20) ($2C) ($1E) ($2) ($18)`, this pass
// writes `($6) ($A) ($E) ($4) ($14) ($16) ($1C) ($18) ($30..)`, the only field in both is
// `($18)` and both write the same `$FFFF0000`. Nothing this pass READS is written by the other.
// The proper home is `chainLoaderBody`, which would also fix `objslot15.js` and
// `objslot7pool.js`; see this wave's report.
export const CHAIN_CONTENT = Object.freeze({
  site: 0x24676a, end: 0x2467c4,      // $24676A..$2467C3 -- 90 bytes
  dispatch: 0x24627a,                 // $24676A lea (-$4F2,PC),A3
  timingTable: 0x246b38,              // $246794 lea ($3A2,PC),A3
  targetBank: 0x246bb8,               // $24677E move.l #$246BB8,($A,A2) -- the BLACK bank
  wordsPerNode: 4,                    // $246768/$246778/$246786/$24678A
});

/**
 * Seed `$246710`'s per-node content across an already-allocated chain.
 *
 * @param root the player-slot handle `chainLoader246710` returned (`($2C,root)` is the head).
 * @param scriptAddr the same script address the loader was given: a count word then four words
 *   per node -- `{family.w, current-offset.w, words-minus-one.w, timing-index.w}`.
 */
export function seedChainContent24676A(ram, rom, root, scriptAddr) {
  if ((root >>> 0) === 0 || (root >>> 0) === 0xffffffff) return 0;
  let node = ram.u32(root + N.next);
  let table = scriptAddr;
  const count = rom.u16(table); table += 2;
  let seeded = 0;

  for (let i = 0; i < count && node !== 0; i++) {
    const family = rom.u16(table); table += 2;              // $246768 move.w (A0)+,D2
    const offset = rom.i16(table); table += 2;              // $246778 adda.w (A0)+,A3
    const wordsMinusOne = rom.u16(table); table += 2;       // $246786 move.w (A0)+,($4,A2)
    const timingIndex = rom.u16(table); table += 2;         // $24678A move.w (A0)+,D3

    const targetFamily = TARGETS[family];
    if (!targetFamily) {
      unreached(CHAIN_CONTENT.site, `$246710 content seeding: target-family byte offset $${family
        .toString(16).toUpperCase()} is outside the three-entry $24627A table`);
    }
    const [reload, step] = timing(timingIndex);             // $24679C/$2467A6 via $246B38

    ram.setU32(node + N.writer, targetFamily.dirty);        // $24676E ($4,A3,D2.w) -> ($6,A2)
    const current = targetFamily.current + offset;          // $246774/$246778
    ram.setU32(node + N.current, current);                  // $24677A
    ram.setU32(node + N.target, CHAIN_CONTENT.targetBank);  // $24677E -- the CONSTANT
    ram.setU16(node + N.mode, wordsMinusOne);               // $246786
    ram.setU16(node + N.reload, reload);                    // $24679C
    ram.setU16(node + N.countdown, reload);                 // $2467A0
    ram.setU16(node + N.step, step);                        // $2467A6
    ram.setU32(node + N.active, 0xffff0000);                // $2467AA -- same value, rewritten
    // $2467BE/$2467C0 -- `dbra` runs words-minus-one PLUS ONE times.
    for (let k = 0; k <= wordsMinusOne; k++)
      ram.setU16(node + N.snapshot + k * 2, ram.u16(current + k * 2));

    seeded++;
    node = ram.u32(node + N.next);                          // $2467CA lea ($70,A2),A2
  }
  return seeded;
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
  // W386: THE CONDITIONAL STRIDE IS ON THE **TARGET**, NOT ON THE CURRENT, and this port
  // had the two transposed. The executor's prologue and its two increments, verbatim:
  //
  //   246884  246c 000a     movea.l ($A,A4),A2    <- N.target, the ROM cursor
  //   246888  266c 000e     movea.l ($E,A4),A3    <- N.current, the RAM cursor
  //   246890  7c00          moveq #$0,D6
  //   246892  4a6c 001e     tst.w ($1E,A4)        <- N.shared
  //   246896  6602          bne.s $24689A
  //   246898  7c02          moveq #$2,D6
  //   ...
  //   246B24  544b          addq.w #2,A3          <- CURRENT, ALWAYS 2
  //   246B28  d4c6          adda.w D6,A2          <- TARGET, 2 or 0
  //
  // So a non-zero `shared` re-reads ONE ROM colour for every entry of the range, which is
  // what the field's name says it does. Transposed, it instead rewrote one RAM word from a
  // walking ROM cursor. Every ported caller leaves `shared` at 0 ($246466 and its no-fill
  // twin both clear it), so both strides are 2 on every live path and no measured behaviour
  // moves; the two arms are only distinguishable with the field set directly.
  const targetStride = ram.u16(node + N.shared) === 0 ? 2 : 0;
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
    target += targetStride;                          // $246B28 adda.w D6,A2
    current += 2;                                    // $246B24 addq.w #2,A3
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
