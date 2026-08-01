# WAVE 12 REVIEW — the ship becomes fully real

status: **DONE** — every headline measurement reproduces; two defects the gate
cannot see (one silent omission, one inverted branch) and one over-claim on the
page and in the ledger.
wave: 12   role: reviewer   started: 2026-08-01
commit under review: `e2043f7`
target: `ddpdojblk`, VERSION-B (`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 B).

Everything below is a number I produced on this machine in this session. Where I
quote the implementer I say so.

---

## 1. WHAT I RE-RAN, AND WHAT CAME BACK

```
python games/ddpdoj/tools/oracle/pgm.py verify
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  refresh_hz=59.185606061  cycles_per_frame=337920

python games/ddpdoj/tools/oracle/pgm.py shipgate            (FRESH, both MAME runs)
  SEED   lf=2000   2200 logic frames compared (lf 2001..4200)
  bucket  5  0rec:1100f 3rec:1100f
  bucket 15  2rec:2200f
  bucket 19  1rec:1100f 3rec:1100f
  STAGED BYTES  divergent bucket-frames: 0
  EMITTED LIST  divergent frames: 0
  RESULT 0 DIVERGENT FRAMES over 2200 logic frames, staged AND emitted
  DIGEST b800b1edb6670f7b
  BUILD required=B frames_on_required=3501 frames_on_other=699

pgm.py shipgate --reuse --break all
  no-aura 1100/1942  aura-phase-flat 1031/1031  no-glow 1100/1942
  glow-without-prot 1100/1100  pods-rigid 3300/2200  no-shadow 1100/2035
  shadow-no-borrow 10/10  pod-asr-toward-zero 10/10  ship-order-swapped 1100/1100
  no-option-object 3300/2200        -- ALL TEN RED
  hitx-frozen 0/0                   -- GREEN, as declared
  RED VALIDATION: 10 mutations, 10 red as declared; 0 behaved wrongly

pgm.py flyaround                                            (FRESH)
  COLS 66 compared ... animb0 animb1 hity0 hity1 o0y o0x o1y o1x ohold oedge
       oadel oaidx oanim optilt opglow ...
  OPTION columns COMPARED (the option object $24C096 is ported, wave 12)
  DIVERGE scroll  first at lf=2321: port=0 board=65472
  RESULT 1 of 66 columns diverged                                     exit 1

pgm.py flyaround --reuse --break hitx-frozen
  DIVERGE animb0 first at lf=2321: port=128 board=112
  DIVERGE animb1 first at lf=2443: port=128 board=112
  RESULT 3 of 66 columns diverged        RED OK

pgm.py shotgate                                             (FRESH)
  SEED lf=4447  13 logic frames compared (lf 4448..4460)
  COLS 72 compared ... b19 b15 b5 ...
  BLOCKED at lf4461 by the named throw $24C180
  RESULT 0 of 72 columns diverged; and the run was BLOCKED   exit 1

node --test games/ddpdoj/tests/       163 tests, 163 pass
pgm.py demogate                       PASS 15955968/15955968 = 100.0000%
node tools/webgate.mjs                PASS 11 files, one frame 100352 px
python tools/export-tables.py --verify VERIFY OK, tables byte-identical
                                       (d95b93ec…c3a2 before and after)
```

`shotgate` reproduces exactly as the implementer reported: wave 8's 856-frame
gate is down to **13 compared frames**. Disclosed, correctly labelled, and still
a standing gate that no longer covers what it was built to cover.
`tools/bundlegate.mjs` needs `--assets --dump --tsv` and is not reachable as
`node tools/bundlegate.mjs`; the wave did not claim it and I did not run it.

Every headline number in `12-impl-ship-fully-real.md` reproduces. `scroll` is
pre-existing (11-review §4b) and W14's.

The tilt claim checks out too — read off the fresh `fly-around.tsv`, lf>2000:

```
ptilt distinct: -32 -28 -24 -20 -16 -12 -8 -4 0 4 8 12 16 20 24 28 32
animb0 range 0..128   animb1 range 0..128
hity0 = {128} constant   hity1 = {256} constant
```

## 2. THE ROM, SPOT-CHECKED

Read out of `out/maincpu.bin` (decrypted image) this session, not quoted:

| claim | ROM |
|---|---|
| `$2553CA[0]` = `$2553F2` | `0x2553f2` ✓ |
| hitbox tilt −$20 / 0 / +$20 | `0000,0080` / `0080,0080` / `0080,0000` ✓ |
| build A `$1549AE` is `$C0/$C0` (6 px vs 4 px) | ✓ |
| image `$25533A[0]`=`$255362`, `$1200/$1520/$1840` step `$64` | ✓ |
| glow geom `$255A22[0]`→`$255A2A` = `F880 FC00 0220` | ✓ |
| deploy ramp `$24C928` = `E0 E0 F0 E8 E8 F8`, all ×8 | ✓ |
| `$24BBAA` = `$24BF6E $24BFC8 $24C022` | ✓ |
| enqueue stubs `$23EFC0`/`$23F1FA`/`$23F104`/`$23F2CA` | verbatim ✓ |
| `$24D164` is `bra $24D16A` (no fall-through into the ÷2 arm) | ✓ |
| `$24C422` is `$FE00FF00`, `$249EBC` is `$FE00FE00` | ✓ |
| `$25370A` = `clr.w ($60,A4) / rts` | ✓ |
| `$24C0E8..$24C116` = 7 longs, 4-byte hole, 15 longs, 1 word = $64 | ✓ |
| no new `$13xxxx`/`$14xxxx` address anywhere in the wave's diff | ✓ (only the pre-existing ISR block, which `NOTES-build-split.md` licenses) |

Feeder census re-run (`xref.py callers`), confirming §9 against the plan's
"four":

```
23F104  $24A538 $24A6C4          } bucket 19: SEVEN static feeders,
23F1FA  $24A532 $24A632          } three of them reached in fly-around
23F294  $24A700 $24A730 $24A756  }
23F2CA  $24C8B4 $24CCC6 $24CDB6 $24CFB0 $24D17E $24D1F8 $24D27A   (15: seven)
23EFC0  $249EE2      23EFEE  $24C438 $24C470 + 12 more            (5: fifteen)
```

## 3. RED VALIDATION I DID MYSELF (undeclared mutations)

`--break all` only proves the mutations the implementer thought of. I wrote one
that is not in the list, by hand, in the shipped file:

```
src/options.js podShadow():  0xfe00ff00  ->  0xfe00fe00
  (i.e. give the pods' shadows the SHIP's bias -- the one byte that differs
   between $24C422 and $249EBC and that no declared mutation touches)

pgm.py shipgate --reuse
  STAGED BYTES  divergent bucket-frames: 1100
  EMITTED LIST  divergent frames: 1100          RED
```

Restored from `HEAD` and hashed both ways:

```
before  fad07d0b0d7d348a23372469720676f304cb680e5079a4688aa076471d923680  src/options.js
        b4f34174f2f3aa757514d43c6f9d28a2677dbe7a347715cdca394979f643a19d  src/shipsprite.js
after   fad07d0b…3680  src/options.js      IDENTICAL
        b4f34174…a19d  src/shipsprite.js   IDENTICAL
```

A second undeclared mutation, aimed at the OTHER instrument:

```
src/options.js runOneBlock():  delete `ram.setU8(opt + OPT.edge, ...)`  ($24C13A)

pgm.py shipgate --reuse   0 staged / 0 list       GREEN  (correctly blind:
                                                   the edge byte is in no record)
pgm.py flyaround --reuse  DIVERGE oedge first at lf=2001: port=0 board=1
                          RESULT 2 of 66 columns diverged        RED
```

so the two instruments are genuinely complementary, and `oedge` — one of the
columns this wave added — is a check that can fail.

Restored again; hashes identical both ways; 163/163 tests pass; `shipgate`
re-run returns `DIGEST b800b1edb6670f7b`, the same digest as the fresh run, so
nothing leaked.

Plus the declared `hitx-frozen` separation, verified in both directions (green
on `shipgate`, red on `flyaround`'s `animb0`/`animb1`) — that one is real and it
is the best thing in the wave.

## 4. FINDINGS

See the returned verdict. In short:

* **F1 (blocking-adjacent, correctness): `$24A460`'s `bmi` is INVERTED in
  `drawShipAlt`.** `24a460: 6b08  bmi $24a46a` — the RTS. The board takes the
  RTS when the player IS live (bit 15 set → N set) and only tests bit 8 when it
  is NOT. `src/shipsprite.js` returns when NOT live and tests bit 8 when live,
  and its own transcription comment mislabels the branch (`not live -> rts`).
  `tests/ship.test.js` seeds `$8100` (live + bit 8) and asserts the throw, so
  the test locks the inversion in — 11-review F1's pattern again.
* **F2 (moderate): formation 2 does not end at `$24C470`.** All five paths out
  of `$24C390` converge on `$24C476`, which is `btst #4,($41,A6)` and a further
  ~30 instructions writing `($1,A6)` bits 3/4 and the player's `($34,A4)`/
  `($35,A4)`, one arm of which `bra`s to `$24D480`. The port returns instead,
  with no throw and no `note()`. MEASURED inert on `fly-around`
  (`$8103E6+$35 = 0`, `$8104AB = $03`, edge byte 0), which is why the gate is
  green — but §8 of the worklog says "none is a quiet return" and this is one.
* **F3 (moderate): the page and the ledger overstate what stopped being
  replayed.** `capture.js splice()` writes words 0/1 for all eight records and
  words 2/3 for the ship only; words 4–7 (size, flip/colour) of all eight and
  words 2/3 of the other seven still come out of `capture.bin`. `index.html`
  says the recording supplies "which display-list slot they occupy, and nothing
  else", and PLAN L2/L3 say the same. The GATE's claim is sound; the PAGE's is
  not.
* **F4 (minor): the corrected declaration was only half-corrected.**
  `tools/breakage.mjs` and `tests/ship.test.js` still say
  `pod-asr-toward-zero` is "declared EXPECTED-GREEN on `pgm.py shipgate`", and
  breakage.mjs still says "NO PICTURE CAN EVER SEE IT" — both refuted by the
  gate's own 10/2,200 list divergences.
* **F5 (minor): `pgm.py check` never runs `shipgate`.** The wave's own gate is
  not a stage of the check runner (nor is wave 8's `shotgate`).
* **F6 (informational): two of the four "hitbox columns" are free.** `hity0`
  and `hity1` are constant `$0080`/`$0100` on the board over the whole window
  and nothing in the port writes them. Disclosed in `state.js`; do not quote
  "four hitbox columns" as four checks.
* **F7 (informational): `type5.js`'s new comment says the four ship-draw entries
  come BEFORE the option object.** `$28B616` is `$24C096` and `$28B634..$28B646`
  are the ship's — the option object is FIRST. The code iterates `TYPE5.calls`
  in ROM order and is right; the comment is backwards. Same block says "the five
  of the 23" over a `Set` of six.
* **F8 (informational, not this wave):** the shared default git index carries
  118 staged deletions (87 `games/ddpdoj`, 23 `docs/worklog`, 8
  `games/gradius`). Anyone who commits without `git read-tree HEAD` first will
  delete them. The documented private-index flow avoids it.

11-review **F1** (`spritequeue.js:348` `(widthByte & 0x3e) >> 1`) and **F2**
(`$23C008`'s `$B0E000` write) are both still open, as the implementer said.
