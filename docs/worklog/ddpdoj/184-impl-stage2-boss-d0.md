# W184: Stage-2 boss initial A3 scripts

Status: COMPLETE

## Scope

Statically map A3/D0 init `$297F54` and step `$297F60`, then use the same static
pass to close and translate every A3 script armed by the stage-2 boss bootstrap:
D0, D2, D11, D12, and D13. Stop at the next honest scheduler dependency.

## Starting state

- W183 is committed, pushed, and live as build `20260809140956`.
- Stage-2 spawn coverage is 332/332 records with zero unknown.
- Enemy-type coverage is 43/256.
- The controlled boot stops at `$297F54`, clock `$01DC`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Static analysis first

- The complete 14-pair A3 table is `$297EE0..$297F50`. A4 script 0 arms IDs
  0, 2, 11, 12, and 13 in that exact slot order.
- D0 is the self-contained `$297F54..$297F84` selector driver. Its init has no
  RTS and falls directly into step, yielding counter/reload/cursor `[2,2,4]`.
- D2 `$298002..$29804C` owns a six-word selector table. D11
  `$298244..$29826E` cycles the overlay selector. D12 `$29826E..$2982BC`
  seeds two side selectors from the existing RNG and advances them modulo
  `$40`. D13 `$2982BC..$298310` enqueues type `$4D` satellites through the
  existing deferred queue and preserves the ROM's dummy-write behavior when
  that queue is full.
- None of the five scripts needs new sprite art. Once all five are registered,
  the same scheduler pass reaches A2 object 0 at `$297462`.
- The next static pass already found the coming rendering boundary: the whole
  eleven-object A2 closure is `$297462..$297950`, and its tables plus type `$4D`
  reference 176 distinct sprite streams absent from the current bundle. Those
  streams must be harvested before the A2 objects become visible.

## Delivered

- Registered all ten init/step entry points for D0, D2, D11, D12, and D13.
- Preserved every init-to-step fall-through, byte-counter borrow test, exact
  equality wrap, RNG call order, packed-long position add, and scheduler-call
  cadence.
- Reused `$242EC2` and `$263684` through the existing RNG and deferred-spawn
  translations. No new scheduler, queue, or rendering mechanism was invented.
- Advanced the controlled stage-2 runtime from `$297F54` through the complete
  initial A3 set to A2 object 0 `$297462` at the same `$01DC` clock.

## ROM boundaries

- D0 `$297F54..$297F84`, SHA-256
  `e14a920322a5ac9e26f8642f714dcd881027f497e27d99df83e7bf49beec90d2`.
- D2 `$298002..$29804C`, SHA-256
  `155488ea8da1f481edf15969af24647b7669515b740aa0fb137eba0962d84c9a`.
- D11 `$298244..$29826E`, SHA-256
  `d9a6eaf08adfb86a256eeecf6860904dab99a17475a9da53115d31680fdbb99f`.
- D12 `$29826E..$2982BC`, SHA-256
  `973365bef1b33127c51697e63a82c65bdcc6cb0b030ad29aa80c5da874531030`.
- D13 `$2982BC..$298310`, SHA-256
  `b77abccb13198e39c07215c3fd44453b4741891323720bd13f8c522cd33bdd73`.

## Verification and release

- The six focused W183/W184 checks pass, including the real handler scheduler
  order, all five A3 slot IDs, D0/D2 state, and D13's queued type `$4D` position.
- The focused controlled boot reaches `$297462` after 30 seconds of real stage
  execution. ROM export verification covers 252 windows and 281,012 bytes.
- Asset export remains at 2,743 sprite streams. The distribution build passed
  the 285-file, 12-ROM leak guard with the six existing deliberate exceptions.
- Implementation commit: `ceec584` (`ddpdoj: port stage 2 boss arrival scripts`).
- Live build: `20260809144557`, deployment `https://834fbc3d.gbtman.pages.dev`.
  Production served the new build three consecutive times and Gradius returned
  HTTP 200.

## Next frontier

Statically close and translate the eleven A2 boss-part objects beginning at
`$297462`, harvest their 176 missing sprite streams into the boss shard first,
then continue into D13's queued type `$4D` child at `$29BB1E/$29BB26`.
