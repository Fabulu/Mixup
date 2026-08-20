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

/** The node pool at `$80FA86` holds TWENTY `$70`-byte nodes (`$80FA86 + 20 * $70 == $810346`,
 *  the root pool's own base -- the two pools ABUT, which is what proves both strides), so no
 *  legitimate chain runs past a root plus twenty. This bound turns a ROM infinite loop into a
 *  located throw. Moved here from `spawn.js` in W449 with the body it guards. */
const CHAIN_CAP = 20;

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
    if (node === 0) { freeAnimObjects246800(ram, root); return 0; }  // $246502 bsr $246800

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
      freeAnimObjects246800(ram, root);                 // $246502 bsr $246800
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

// ===========================================================================
// `$246532..$24660E` -- THE ONE BODY BEHIND `$246520`, `$24652A`, `$246704` AND `$246710`.
// W448: three files transcribed it independently and no two agreed.
// ===========================================================================
//
// `$246520 movem.l D1-D7/A0-A4,-(A7) / move.w #$1,D6 / bra.s $246532` and
// `$24652A movem.l D1-D7/A0-A4,-(A7) / move.w #$0,D6` (falling through) are TWO HEADS ON ONE
// BODY -- the `bra.s` at `$246528` lands on `$246532`, four bytes past `$24652E`. There is one
// routine here, not two, and `$246704`/`$246710` are the same shape again at `$246718`.
//
// **UNTIL W448 THIS BODY EXISTED THREE TIMES**: `loadAnimObjectsNoFill` here, `buildParts246520`
// in `spawn.js` and `chainLoaderBody` in `stageend.js`, all three allocating out of the SAME two
// pools -- `$810346` (3 x $30) and `$80FA86` (20 x $70). W447 measured the pools identical and
// called it the worst drift risk of the twenty-four doubly-claimed addresses. It was:
//
//   `$246608 moveq #-$1,D0`   the failure return is $FFFFFFFF on BOTH arms of BOTH entries.
//                             `stageend.js` had it; the other two returned 0.
//   `$24655E move.w #$8000,(A2)`   the node claim. `spawn.js` DID NOT HAVE IT -- it built chains
//                             out of slots it never marked occupied.
//   `$246562 move.w #$0,($20,A2)`  likewise absent from `spawn.js`.
//   `$246592 adda.w (A0)+,A3`  `adda.w` SIGN-EXTENDS. `spawn.js` read the bias unsigned.
//   `$2465C8 movea.l ($E,A2),A3 / $2465D4 move.w (A3)+,(A4)+`  the snapshot source is `($E)`,
//                             which is `$24627A[family]` = `$80E886`/`$80F086`/`$80F886` --
//                             **PALETTE RAM**. `spawn.js` read it out of ROM, which for its own
//                             only script (`$2701C8`, family 0, bias $480) means `$80ED06`:
//                             outside every declared ROM window and outside the 6 MiB image.
//   `($12,A2)`                the ROM does NOT write it in this body (only `$246410` does, from
//                             its fill word). `loadAnimObjectsNoFill` zeroed it anyway.
//   `$24654E move.w #$13,D6 / $2465E2 dbra D6,$246558`   ONE forward pass over the twenty slots,
//                             twenty visits TOTAL for the whole chain. `spawn.js` had this right;
//                             the other two restarted the scan from `$80FA86` for every node, so
//                             a pool with a freed hole BEHIND the cursor allocated differently.
//   `$246558`                 is entered unconditionally: the node loop is a DO-WHILE. A count
//                             word of 0 therefore consumes all twenty slots and FAILS; it does
//                             not return an empty chain. `stageend.js`'s `for (n < nodeCount)`
//                             was an invented entry test.
//
// The two dispatch tables and their different bounding disciplines:
//
//     $24627A   3 entries x 8 bytes, indexed by the script's family word used as a BYTE offset.
//               **Index 3 is `48E77F00` -- an INSTRUCTION.** So 0/8/$10 only, and the port
//               THROWS rather than clamping: the guard IS the semantics (W326). Entry n is
//               {palette base .l, dirty word .l} -- both in RAM.
//     $246B38   32 entries x 4 bytes, indexed by `(timing word & $1F) * 4`. The ROM's own
//               `andi.w #$1F` at `$2465A2` bounds it, so no guard is needed or wanted.

/**
 * The four ported heads, on three axes: `field4` is D6 -> `($4,root)`, `field1e` is the constant
 * `($1E,node)` store, and `content` is the per-node seeding shape -- `$246582` reads the target
 * from the script (SIX words per node), `$24676A` hardcodes `$246BB8` (FOUR words per node).
 * A single unconditional fold would have mis-parsed one of the two.
 *
 * There is a FIFTH/SIXTH head at `$246610` (D6 = 1) and `$24661A` (D6 = 0), but they fall into a
 * DIFFERENT body at `$246622`, so they are not variants of these -- see `CHAIN_OTHER_BODY`.
 *
 * `content` is a STRING here, resolved to the frozen shape by `chainContentFor` below, because
 * the shapes are declared further down this file.
 */
export const CHAIN_SPECS = Object.freeze({
  // $246524 D6=1 / $246576 ($1E) := 0 / content $246582 is SIX words
  0x246520: Object.freeze({ site: 0x246520, field4: 1, field1e: 0, content: 'six' }),
  // $24652E D6=0 / $246576 ($1E) := 0 / content $246582 is SIX words
  0x24652a: Object.freeze({ site: 0x24652a, field4: 0, field1e: 0, content: 'six' }),
  // $246708 D6=1 / $246762 ($1E) := 1 / content $24676A is FOUR words, constant target
  0x246704: Object.freeze({ site: 0x246704, field4: 1, field1e: 1, content: 'four' }),
  // $246714 D6=0 / $246762 ($1E) := 1 / content $24676A is FOUR words, constant target
  0x246710: Object.freeze({ site: 0x246710, field4: 0, field1e: 1, content: 'four' }),
});

const chainContentFor = (spec) => (spec.content === 'six' ? CHAIN_CONTENT_24652A : CHAIN_CONTENT);

/**
 * `$246532..$24660E` (and its twin `$246718..$2467FE`) -- claim a root, allocate the script's
 * nodes out of the shared pool, link them at `($2C)` and seed each one's content.
 *
 * @param spec one of `CHAIN_SPECS`.
 * @returns the root address (the ROM's D0, `move.l A1,D0` at `$2465F8`), or **`$FFFFFFFF`** --
 *   `$246608 moveq #-$1,D0` -- when either pool runs dry. NOT zero.
 */
export function buildChain246532(ram, rom, table, spec) {
  const content = chainContentFor(spec);
  for (let s = 0; s < ANIM_OBJECT.rootSlots; s++) {          // $246538 moveq #$2,D7 + dbra = THREE
    const root = ANIM_OBJECT.roots + s * ANIM_OBJECT.rootStride;
    if (i16(ram.u16(root)) < 0) continue;                    // $24653A tst.w (A1) / $24653C bmi.w
    ram.setU16(root + N.status, 0x8000);                     // $246540 move.w #$8000,(A1)
    ram.setU16(root + N.mode, spec.field4);                  // $246544 move.w D6,($4,A1)

    let cursor = table;
    let remaining = rom.u16(cursor); cursor += 2;            // $24654C move.w (A0)+,D0
    let previous = root;
    let node = ANIM_OBJECT.nodes;                            // $246552 lea $80FA86,A2
    let dry = true;                                          // D0 after the loop: $FFFF unless BEQ
    // $24654E move.w #$13,D6 -- TWENTY VISITS FOR THE WHOLE CHAIN, not per node.
    for (let walk = 0; walk < ANIM_OBJECT.nodeSlots; walk++) {
      if (i16(ram.u16(node)) < 0) {                          // $246558 tst.w (A2) / $24655A bmi.w
        node += ANIM_OBJECT.nodeStride;                      // $2465DE lea ($70,A2),A2
        continue;                                            // $2465E2 dbra D6,$246558
      }
      ram.setU16(node + N.status, 0x8000);                   // $24655E move.w #$8000,(A2)
      ram.setU16(node + N.progress, 0);                      // $246562 move.w #$0,($20,A2)
      ram.setU32(node + N.next, 0);                          // $246568 move.l #$0,($2C,A2)
      ram.setU32(previous + N.next, node);                   // $246570 move.l A2,($2C,A1)
      previous = node;                                       // $246574 movea.l A2,A1
      ram.setU16(node + N.shared, spec.field1e);             // $246576 / $246762 -- THE ONE
      ram.setU16(node + 0x02, 0);                            // $24657C / $24675C
      // $246582..$2465D9 (or $24676A..$2467C3) is INSIDE this loop: `$2465E2`'s `dbra` closes
      // back over the seeding to the pool scan, so allocation and content are ONE loop.
      cursor = seedChainNode24676A(ram, rom, node, cursor, content);
      remaining = u16(remaining - 1);                        // $2465DA subq.w #1,D0
      if (remaining === 0) { dry = false; break; }           // $2465DC beq.s $2465E8
      node += ANIM_OBJECT.nodeStride;                        // $2465DE lea ($70,A2),A2
    }

    if (dry) {                                               // $2465E6 moveq #-$1,D0
      // $2465EC tst.w D0 / $2465EE bpl -- negative, so UNWIND. `$2465F0 move.l A1,D0` uses the
      // A1 that `$2465E8 movem.l (A7)+,A0-A1` just restored: the ROOT, not the tail. Without
      // this the root slot leaks permanently out of THREE.
      freeAnimObjects246800(ram, root);                      // $2465F2 bsr $246800
      return 0xffffffff;                                     // $2465F6 bra / $246608 moveq #-$1
    }
    return root;                                             // $2465F8 move.l A1,D0
  }
  return 0xffffffff;                                         // $246600/$246604 dbra / $246608
}

/** `$246520`, the mode-ONE head. `$246524 move.w #$1,D6 / $246528 bra.s $246532`. */
export function loadAnimObjects246520(ram, rom, table) {
  return buildChain246532(ram, rom, table, CHAIN_SPECS[0x246520]);
}

/** `$24652A`, the mode-ZERO head. Mode-zero roots are not auto-retired by `$24683E`; their owner
 * keeps the returned handle and explicitly frees the chain through `$246800`. */
export function loadAnimObjects24652A(ram, rom, table) {
  return buildChain246532(ram, rom, table, CHAIN_SPECS[0x24652a]);
}

/**
 * `$246800` -- THE CHAIN FREE, AND AS OF W449 THE ONLY BODY.
 *
 * W447's audit found `$246800` transcribed THREE times and W449 merged them: this file's
 * private `clearChain` (which `freeAnimObjects246800` wrapped), `spawn.js freeChain246800`
 * and `stageend.js chainFree246800`. The survivor is HERE because `animobjects.js` is a LEAF
 * -- it imports only `ram.js` and `unported.js` -- and `stageend.js` already imports it, so
 * merging the other way would have turned that edge into a cycle. Same rule, same survivor as
 * W448.
 *
 * THE BYTES, off the image this wave:
 *
 *     246800  2f00              move.l D0,-(A7)
 *     246802  2f08              move.l A0,-(A7)          <- TWO pushes, NOT a movem.l
 *     246804  2040              movea.l D0,A0            <- THE LOOP TOP
 *     246806  4250              clr.w (A0)
 *     246808  317c 0000 0004    move.w #$0,($4,A0)
 *     24680e  2028 002c         move.l ($2C,A0),D0
 *     246812  66f0              bne.s $246804            <- $246814 - $10 = $246804
 *     246814  205f              movea.l (A7)+,A0
 *     246816  201f              move.l (A7)+,D0
 *     246818  4e75              rts
 *
 * **IT IS A DO-WHILE AND THE ENTRY TEST WAS INVENTED.** `$246804` is the branch target and
 * `$246806 clr.w (A0)` is the very next instruction, so nothing between the prologue and the
 * first release tests D0. This export used to read `if (root !== 0) clearChain(ram, root)` --
 * the W446 `if (made.ok)` shape, a guard with no branch behind it -- **and the CALLER has no
 * such test either**: `$27C720 202d 0034` is `move.l ($34,A5),D0` and `$27C724 4eb9 0024 6800`
 * is the `jsr` immediately after it. Same at `$28D704`/`$28D708` and `$291FBC`/`$291FCA`. The
 * ROM frees the head unconditionally and relies on every one of its **TWENTY-ONE** callers
 * passing a live pointer -- 21 measured this wave by scanning `$230000..$2B0000` for `bsr`/`jsr`
 * targets: `$246502`, `$2465F2`, `$2466E6`, `$2467E0`, `$24686C` and sixteen `jsr.l`s.
 *
 * THE TWO REFUSALS BELOW ARE NOT GATES. THEY ARE THE BOARD'S OWN FAULTS, LOCATED.
 *
 * `head == 0`: the ROM would `clr.w ($0)`, writing into the 68000 vector table. W341 refused it
 *   by address because a null here means the caller's `($2C)` bookkeeping is already wrong, and
 *   swallowing it would hide that.
 *
 * `head == $FFFFFFFF`: **the cartridge genuinely faults here, so the port must stop too.**
 *   `$246608`, `$2465E6`, `$2464F6` and `$246518` are all `70 ff` (`moveq #-$1,D0`), so every
 *   failure arm in this family returns `$FFFFFFFF` and the callers store it verbatim --
 *   `stage4type9f.js` writes it into `($34,A5)` at `$27CB6E`, the only writer, and `$27C724`
 *   frees it with no test. On the 68000 `movea.l D0,A0` makes A0 = `$FFFFFFFF`, the 24-bit bus
 *   takes that to `$FFFFFF`, and a WORD `clr.w` at an ODD address is an ADDRESS ERROR (vector
 *   3). There is no guard to port. The port raises instead of pretending the free succeeded --
 *   a crash the board also has is not a defect to be smoothed over.
 *
 * @param head the chain head (the ROM's D0 on entry)
 * @returns {number} how many links were released
 */
export function freeAnimObjects246800(ram, head) {
  const first = head >>> 0;
  if (first === 0) {
    unreached(0x246800, '$246800 was called with a NULL chain head. It is a do-while with no '
      + 'entry test, so the ROM would clear address 0 -- all twenty-one of its callers are '
      + "expected to pass a live pointer, and a null here means the caller's ($2C) chain "
      + 'bookkeeping is already wrong');
  }
  if (first === 0xffffffff) {
    unreached(0x246804, "$246800 was called with $FFFFFFFF, the failure return of this family's "
      + 'loaders ($246608/$2465E6/$2464F6/$246518 are all `moveq #-$1,D0`). The board does not '
      + 'guard it either: $246804 movea.l D0,A0 then $246806 clr.w (A0) is a WORD access at the '
      + 'odd address $FFFFFF, which is a 68000 ADDRESS ERROR. A caller freed a load that failed');
  }
  let at = first;
  let n = 0;
  for (;;) {
    ram.setU16(at + N.status, 0);                     // $246806 clr.w (A0)
    ram.setU16(at + N.mode, 0);                       // $246808 move.w #$0,($4,A0)
    n += 1;
    const next = ram.u32(at + N.next) >>> 0;          // $24680E move.l ($2C,A0),D0
    if (next === 0) return n;                         // $246812 bne $246804
    if (n > CHAIN_CAP) {
      unreached(0x246812, `$246800 followed more than ${CHAIN_CAP} ($2C) links. The node pool at `
        + '$80FA86 holds only twenty $70-byte nodes, so a longer chain means a cycle -- which the '
        + 'ROM would loop on forever, and a hanging suite is a worse way to learn that than a '
        + 'failing one');
    }
    at = next;
  }
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
// **W389 -- IT IS NOW INLINE, WHICH IS WHERE THE ROM PUTS IT.** W388 applied this as a second
// walk of the same `($2C)` chain because `stageend.js` was out of that wave's scope, and noted
// that the proper home is `chainLoaderBody`. It is there now: `seedChainNode24676A` below is one
// node's worth, `chainLoaderBody` calls it from inside its own allocation loop exactly where
// `$2467CE`'s `dbra` closes over it, and the script cursor advances once instead of twice. That
// fixes `objslot15.js`, `objslot7pool.js` and `hiscorename.js` at the same time, which is what
// W388's report asked for. `seedChainContent24676A` stays as the whole-chain wrapper so the
// second-pass form can still be exercised on its own.
export const CHAIN_CONTENT = Object.freeze({
  site: 0x24676a, end: 0x2467c4,      // $24676A..$2467C3 -- 90 bytes
  dispatch: 0x24627a,                 // $24676A lea (-$4F2,PC),A3
  timingTable: 0x246b38,              // $246794 lea ($3A2,PC),A3
  targetBank: 0x246bb8,               // $24677E move.l #$246BB8,($A,A2) -- the BLACK bank
  wordsPerNode: 4,                    // $246768/$246778/$246786/$24678A
  indexSite: 0x24676e,                // $24676E move.l ($4,A3,D2.w),($6,A2) -- what INDEXES $24627A
});

/**
 * `$24652A`'S OWN CONTENT BLOCK, `$246582..$2465D9`, decoded in W389 -- because the brief said
 * `$24652A` had none and **the image says otherwise**. Instruction for instruction it is the same
 * block as `$24676A` with ONE extra store, and that store is the difference in the SCRIPT SHAPE:
 *
 *   246582  3418            move.w (A0)+,D2               <- family, as $246768
 *   246584  47fa fcf4       lea (-$30C,PC),A3          -> $246586-$30C = $24627A, the SAME table
 *   246588  2573 2004 0006  move.l ($4,A3,D2.w),($6,A2)   <- the SAME writer store
 *   24658E  2673 2000       movea.l ($0,A3,D2.w),A3
 *   246592  d6d8            adda.w (A0)+,A3               <- offset, as $246778
 *   246594  254b 000e       move.l A3,($E,A2)
 *   246598  2558 000a       move.l (A0)+,($A,A2)          <- **THE TARGET, FROM THE SCRIPT, LONG**
 *   24659C  3558 0004       move.w (A0)+,($4,A2)          <- words-minus-one
 *   2465A0  3618            move.w (A0)+,D3               <- timing index
 *   2465AA  47fa 058c       lea ($58C,PC),A3           -> $2465AC+$58C = $246B38, the SAME table
 *   2465C0  257c ffff 0000 0018  move.l #$FFFF0000,($18,A2)
 *   2465D4  38db / 2465D6 51cc fffc   the SAME palette snapshot
 *
 * So `$24652A`'s script is SIX words per node, not four, and its target is per-node rather than
 * the constant `$246BB8`. The two shapes are therefore NOT interchangeable and a single fold
 * would have mis-parsed one of them; `CHAIN_LOADERS` in `stageend.js` carries the shape per head.
 */
export const CHAIN_CONTENT_24652A = Object.freeze({
  site: 0x246582, end: 0x2465da,      // $246582..$2465D9
  dispatch: 0x24627a,                 // $246584 lea (-$30C,PC),A3
  timingTable: 0x246b38,              // $2465AA lea ($58C,PC),A3
  targetBank: 0,                      // there is none: $246598 reads it from the script
  targetFromScript: true,             // $246598 move.l (A0)+,($A,A2)
  wordsPerNode: 6,                    // family, offset, target.l, words-minus-one, timing
  indexSite: 0x246588,                // $246588 move.l ($4,A3,D2.w),($6,A2) -- what INDEXES $24627A
});

/**
 * ONE node's worth of `$24676A..$2467C3` (or of its `$24652A` twin), seeded into `node` from the
 * script cursor `table`.
 *
 * @param shape `CHAIN_CONTENT` (four words, constant target) or `CHAIN_CONTENT_24652A` (six
 *   words, target read from the script).
 * @returns the advanced script cursor -- `table + shape.wordsPerNode * 2`.
 */
export function seedChainNode24676A(ram, rom, node, table, shape = CHAIN_CONTENT) {
  const family = rom.u16(table); table += 2;                // $246768 move.w (A0)+,D2
  // `adda.w` SIGN-EXTENDS its source, so the offset word is signed. Sign-extended here from
  // `u16` rather than read through `rom.i16`, because `chainLoaderBody` is reached from fixtures
  // whose `rom` face has only `u8/u16/u32/bytes` -- and a loader that needs a wider face than
  // its callers provide is a loader that throws in five existing tests.
  const offset = i16(rom.u16(table)); table += 2;           // $246778 adda.w (A0)+,A3
  let target = shape.targetBank;                            // $24677E move.l #$246BB8,($A,A2)
  if (shape.targetFromScript) {                             // $246598 move.l (A0)+,($A,A2)
    target = rom.u32(table); table += 4;
  }
  const wordsMinusOne = rom.u16(table); table += 2;         // $246786 move.w (A0)+,($4,A2)
  const timingIndex = rom.u16(table); table += 2;           // $24678A move.w (A0)+,D3

  const targetFamily = TARGETS[family];
  if (!targetFamily) {
    // Named for the INSTRUCTION that indexes the table, not for the block start: W341 pinned
    // $246588 and it is the right address to name.
    const at = shape.indexSite;
    unreached(at, `$${at.toString(16).toUpperCase()} content seeding: `
      + `target-family byte offset $${family.toString(16).toUpperCase()} is outside the `
      + 'three-entry $24627A table');
  }
  const [reload, step] = timing(timingIndex);               // $24679C/$2467A6 via $246B38

  ram.setU32(node + N.writer, targetFamily.dirty);          // $24676E ($4,A3,D2.w) -> ($6,A2)
  const current = targetFamily.current + offset;            // $246774/$246778
  ram.setU32(node + N.current, current);                    // $24677A
  ram.setU32(node + N.target, target >>> 0);                // $24677E / $246598
  ram.setU16(node + N.mode, wordsMinusOne);                 // $246786
  ram.setU16(node + N.reload, reload);                      // $24679C
  ram.setU16(node + N.countdown, reload);                   // $2467A0
  ram.setU16(node + N.step, step);                          // $2467A6
  ram.setU32(node + N.active, 0xffff0000);                  // $2467AA / $2465C0
  // $2467BE/$2467C0 -- `dbra` runs words-minus-one PLUS ONE times.
  for (let k = 0; k <= wordsMinusOne; k++)
    ram.setU16(node + N.snapshot + k * 2, ram.u16(current + k * 2));
  return table;
}

/**
 * Seed `$246710`'s per-node content across an already-allocated chain.
 *
 * Kept as the SECOND-PASS form W388 shipped. `chainLoaderBody` now seeds inline, so no live path
 * calls this; it is the shape the ablation drives against, and calling it on an already-seeded
 * chain is idempotent (every field it writes is a function of the script and of `($E)`'s RAM,
 * neither of which the allocator moves).
 *
 * @param root the player-slot handle `chainLoader246710` returned (`($2C,root)` is the head).
 * @param scriptAddr the same script address the loader was given: a count word then four words
 *   per node -- `{family.w, current-offset.w, words-minus-one.w, timing-index.w}`.
 */
export function seedChainContent24676A(ram, rom, root, scriptAddr, shape = CHAIN_CONTENT) {
  if ((root >>> 0) === 0 || (root >>> 0) === 0xffffffff) return 0;
  let node = ram.u32(root + N.next);
  let table = scriptAddr;
  const count = rom.u16(table); table += 2;
  let seeded = 0;

  for (let i = 0; i < count && node !== 0; i++) {
    table = seedChainNode24676A(ram, rom, node, table, shape);
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
      // **W435: THE SECOND CLAUSE IS A PORT INVENTION AND THE ROM HAS NO SUCH
      // TEST.** [M] `$24687A 4a 54` is `tst.w (A4)` and `$24687C 67 00 02 B0`
      // its `beq` -- the STATUS word is the whole gate -- and `$246880 22 6c
      // 00 06` then loads `($6,A4)` into A1 unconditionally, so a zero there
      // makes `$246B20 move.w #$1,(A1)` a wild write to address 0. The clause
      // was added when `$24652A`'s chains were built content-light, and that
      // reason is GONE: W435 switched `CHAIN_LOADERS[0].content` on, so every
      // node this port builds now carries a real writer. It is kept only as the
      // refusal to make that wild write. Nothing live depends on it -- measured
      // by dropping it and re-running the stage1-laser-hold ladder.
      if (ram.u16(node + N.status) !== 0 && ram.u32(node + N.writer) !== 0) {
        stepNode(ram, rom, node);
      }
      activeSum = u16(activeSum + ram.u16(node + N.active));
      nodes++;
      node = ram.u32(node + N.next);
    }
    if (ram.u16(root + N.mode) === 1 && activeSum === 0) {
      freeAnimObjects246800(ram, root); freed++;        // $24686C bsr $246800
    }
  }
  return { roots, nodes, freed };
}
