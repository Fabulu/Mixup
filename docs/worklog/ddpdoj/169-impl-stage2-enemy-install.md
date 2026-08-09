# W169: Stage-2 enemy installation

Status: DONE

## Scope and premise correction

W168 left the live spawn cursor parked on stage 1's `$231704` terminator. The
missing boundary is not at the later background lock clock `$0264`. The ROM
installs stage 2 at clock zero during the world rebuild:

`$25FD38 -> jsr $26331E -> bsr.w $263386`

W167's `231/332 ported` result counts spawn records whose type has both a live
init-body and handler registration. The remaining 101 records are not 101
implementations. They contain only 14 distinct unknown enemy types, and every
record also depends on movement, prototype, palette, art, and handler closure.
W169 therefore ports the installer and the complete closed data family, then
stops at the first genuinely unknown type.

## Exact reset and caller order

`$26331E` is one indivisible reset-and-install routine:

- `lea $81332C,A0`
- `move.w #$1C26,D0`
- the DBRA loop clears `$1C27` words, inclusive `$81332C..$816B79`
- the exclusive end is `$816B7A`, exactly `$27E98A`'s item-pool base
- `$263330 bsr.w $263386`
- `$263334 rts`

The full `$25FD38` order is `$25FD24`, then direct calls to `$26331E`,
`$288E0C`, `$289084`, `$289AE0`, `$28AC3A`, `$289F3A`, `$27E98A`, and
`$28131E`, then type-1 background construction and RTS. The exporter pins this
order from the ROM.

The old port additionally called `clearPoolA`, attributed to `$27F87C`, during
this rebuild. That call is not in the ROM chain. An exhaustive full-image scan
of direct absolute and PC-relative JSR/JMP/BSR start sites finds exactly one
caller of `$27F87C`, `$2606E8`, in another scene path. W169 removes only the
spurious rebuild call. `clearPoolA` and its real path remain unchanged.

## Stage table and dependency closure

The five exact `$263336` rows are:

| Stage | Script | Aux | Resource `$1F` |
|---:|---:|---:|---:|
| 1 | `$230C6C` | `$23170C` | `$231852` |
| 2 | `$2325D0` | `$233038` | `$233194` |
| 3 | `$2342BA` | `$234FB2` | `$2350A8` |
| 4 | `$2358B0` | `$2364A8` | `$2365E2` |
| 5 | `$237978` | `$239190` | `$239396` |

For stage 2, the script has 332 eight-byte records and its `$FFFF` terminator
is at `$233030`. Its maximum aux index is 173; 149 indices are used. The aux
table is 174 words at `$233038..$233193` and abuts resource `$1F` at `$233194`.
The resource contains 174 strictly increasing stream starts and spans `$1126`
bytes through `$2342B9`, ending exactly at stage 3's script. The exporter now
carries the one exact dependency span `$2325D0..$2342B9` plus type `$95`'s
inseparable eight-byte run-length stub `$27782E..$277835`.

W133's deferred-palette statement was stale. W91's existing
`$222A78..$2252F8` window already contains all stage-2 spawn palette sources
`$2236F8..$2252F8`; no new palette export was required.

## Dynamic order and next boundary

A controlled 14,800-logic-frame VERSION-B MAME run used the existing W22 spawn
probe with named invulnerability, autoshot, and horizontal sweep interventions.
It is valid for installation and occurrence order, not unaided pacing. The
record-qualified evidence is committed in
`tools/w169-stage2-spawn-evidence.json`.

At logic frame 12360, stage index x4 is 4 and clock is zero. The cursor changes
from `$231704` to `$2325D0`, aux becomes `$233038`, resource slot `$1F` becomes
`$233194`, and deferred count is zero. The board then executes:

- clock `$0001`: ten type `$8B` records
- clock `$0008`: types `$10`, `$09`, `$8A`
- clock `$0009`: type `$09`
- clock `$000A`: types `$10`, `$09`
- clock `$000C`: types `$11`, `$11`, then type `$95`

The first 18 records complete in the port. Record `$232660`, type `$95`, uses
param 8, aux index `$050`, aux offset `$0A9C`, and movement
`$233C30..$233C6D` (62 bytes). Its run-length stub is `$27782E`, its init body
is `$277836`, and its handler is `$2779B6`. The port now stops loudly at
`$277836` on clock `$000C`. The unresolved art family beginning at
`$17479C` is left for the next dependency-closed enemy wave.

## Coverage and deliberate reds

`dojcoverage.py` now joins the 19 record-qualified board observations against
the ROM-derived 332-record static family in both directions. Stage-2 spawn
coverage is 231/332 ported, 101 unknown, 19 dynamically observed, and 313
static-minus-dynamic records. Dynamic-minus-static is zero.

Two relevant mutations were demonstrated and restored:

- calling `installStage` without the `$26331E` clear leaves the first reset word
  stale and fails the exact half-open endpoint test
- `--break-stage2-spawn-inventory` injects record `$2325C8`, fails the hard
  dynamic-minus-static inventory gate, and the clean report re-greens

The pre-existing W167 coverage-regression mutation also fails and restores.
The W102 boss coverage system remains unchanged and green.

## Verification

- Focused W133/W168/W169 tests: 12/12 passed, zero skipped.
- Full DOJ unit suite: 1,438/1,438 passed, zero skipped.
- `npm run typecheck`: passed.
- `python games/ddpdoj/tools/dojcoverage.py`: passed; both required mutations
  failed and restored.
- `python games/ddpdoj/tools/bosscoverage.py`: passed, 103/111 ported,
  zero live-unported, eight proven dead, dynamic-minus-static zero.
- `python games/ddpdoj/tools/oracle/pgm.py check --quick`: 52 passed, the same
  four inherited failures (stage end, chain expiry, bomb, laser bomb), zero
  skipped. After rebuilding the bundle, the inherited stage-end scenario now
  reaches the intended `$277836` boundary rather than an absent ROM window.
- `node games/ddpdoj/tools/export-web.mjs`: passed.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000%.
- `webgate.mjs`: passed.
- `node tools/publish.mjs --only ddpdoj --dry`: passed all unit, bundle, web,
  ROM-leak, and build gates; build id `20260809021019`; no deployment.
- `git diff --check`: passed.

No type `$95` body, handler, prototype, or art was guessed. No sound, replay,
hyper, bee implementation, Gradius, `$29540C`, or owner-decision behavior was
changed.
