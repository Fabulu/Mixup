# W224: Stage-4 boss phase-1 transition

Status: COMPLETE

## Scope

Translate the next live Stage-4 boss path beginning when `$29FE10` crosses the
`$00023000` HP threshold and starts A4 id1 at `$2A019E`. Follow its scheduler
descendants to the next genuine live frontier, add only required assets/data,
and demonstrate it with one focused boss smoke.

## Starting state

- W223 is committed at `5428666`.
- The complete first-phase F3/F4 attack loop runs without an unknown routine.
- The damage controller reaches A4 id1 before the later `$0000C400` low-HP
  branch, so this is the earliest honest damage-driven frontier.

## Delivered

- Translated A4/F1 `$2A019E/$2A01D8`, the destruction conductor: two byte
  effects on old-zero borrow timing, four sequential word-timer states, and the
  exact per-state bursts, effect-table emissions, sounds, and A2 stops.
- Translated its four exact effect tables `$2A046A`, `$2A0484`, `$2A0492`, and
  `$2A04D0` through their `$FFFF` terminators, 2/1/5/6 rows.
- Translated MAIN2 `$29F80A/$29F822` and MAIN3 `$29F826/$29F840`, including the
  aimed approach to `$6000` / `$1C00 - $813172`, the `$1400` and `$0200`
  distance gates, the A3/D0 start, and the A4 id5 handoff on arrival.
- Translated A3/D0 `$2A13CC/$2A13E8`, the part swap: cursor `+$106` advances by
  4 on every third scheduler call and terminates on exact equality with `$003C`,
  then stops object 6, activates objects 9/7/8, rewrites the linked hit
  geometry and part status, clears boss `+$168`, and retires itself.
- Translated A2 objects 6 through 9 at `$29EFD2`, `$29F2DE`, `$29F37A`, and
  `$29F03E`: the opening damaged hull, both linked parts with their shared
  overlay, and the settled hull with its fixed overlay stream.
- Exported the exact new ROM windows for F1, MAIN2/3, and D0, plus five sprite
  tables and immediate stream `$000DAFC4`.

Exact ROM hashes:

- `$2A019E..$2A051A`, length `$037C`:
  `29396afa0d61d95a89e47332de56ea13cfaa466f1c20c866dcc55a5e24cdc9e9`
- `$29F80A..$29F8CC`, length `$00C2`:
  `36407e0eee1231efba5b07884db6c3caf8b7fa5d6fc9fcc70535e68e2383dee8`
- `$2A13C8..$2A1462`, length `$009A`:
  `aa1ccf139b04d01adc736d2ef09a183788a2c787e001847a350f3289a426a3aa`

## Exact asset delta

Sprite stream total is now 3958, exactly 56 new streams. Historical Stage-4
manifest-count assertions in W211 through W220 were mechanically updated from
3902 to 3958.

| Table | Entries | Distinct | Added |
| --- | ---: | ---: | ---: |
| `$29F002` | 15 | 15 | 15 |
| `$29F096` | 16 | 16 | 16 |
| `$29F336` | 8 | 8 | 8 |
| `$29F356` | 8 | 8 | 8 |
| `$29F3D0` | 8 | 8 | 8 |
| `$DAFC4` | 1 | 1 | 1 |

## Timing and fidelity behavior proved

- F1 INIT falls through into STEP and spends its initial word timer tick, so
  state 0 fires on the following boss pass.
- All F1 state checks are sequential, so a promoted state spends its newly
  written timer in the same call. State 0 writes `8` and the test observes `7`.
- F1 starts MAIN2 in the same scheduler walk that runs F1 INIT, because
  `$2596C6` walks A4 before A0. MAIN3 likewise starts D0 in its own walk,
  because A3 follows A0.
- MAIN3 starts A4 id5 only after reaching the target; because MAIN is walked
  after A4, id5 would begin on the following pass.
- D0 INIT falls through, changing timer `$0202` to current byte 1 on its first
  call while A2 object 6 draws cursor row 0 in that same pass. D0 then takes 44
  further passes and exactly 15 advances to walk all fifteen opening rows.
- The Stage-4 boss linked main-hit damage aggregation uses the maximum damage
  delta, not the sum or minimum.

## Focused verification

`node --test games/ddpdoj/tests/w224stage4boss.test.js games/ddpdoj/tests/w220stage4boss.test.js`

Result: 4/4 pass. The smoke drives the real Type-$40 boss from its spawn record
through MAIN0's terminal handoff, crosses `$00023000` with its timeout still
live, then proves F1 arming, MAIN2, all four destruction states with their exact
effect kinds/sites/fields and sounds, the MAIN3 and D0 handoff, the full
fifteen-row D0 walk against `$29F002`, the terminal part swap, and one damaged
body draw pass whose records match all five new tables and `$000DAFC4`. No
unported gap is reached anywhere in the transition.

## Next live frontier

A4/F5 `$2A0CF6/$2A0D16`, which MAIN3 starts once the transition reaches its
target. Fatal damage remains the separate death conductor at `$29FE8A`, and the
low-HP branch at `$29FE52` is still ahead of it.
