# W175: Stage-2 type `$96`

Status: COMPLETE

## Scope

Close type `$96` at stage-2 record `$2329C0`, clock `$00B8`, from exact ROM
evidence through the next chronological unsupported record.

## 1. Premise and boundary

The premise was current. Stage 2 had one type `$96` record, at `$2329C0`,
clock `$00B8`, movement index `$03C`. Its exact dependency closure is:

- run-length stub `$27A44C`, init `$27A454..$27A4EE`, death tail
  `$27A4EE..$27A548`, and handler `$27A548..$27A9EC`;
- movement `$23369A..$2336A2`, exact bytes
  `8A 00 24 00 81 04 40 00`;
- record prototype `$27A4BA..$27A4D2`, long sub-record prototype
  `$27A4D2..$27A4EE`, and five adjacent big-endian palette pairs at
  `$27A4B0..$27A4BA`;
- 16 animation/update pairs at `$27A9EC..$27AA6C`, selecting consecutive
  sprite streams `$2731B4 + $684*i`, plus fixed death stream `$2799F4`;
- the existing `$27829C` emitter table, indexed live by sub-record word `$1E`,
  at both `$27A544` and `$27A784`;
- the existing fire vector table `$2736FA`, `$2817B8` bullet generator, damage
  and score calls, nine `$289004` death effects, and `$243E02`'s inseparable
  guarded screen-clear arm.

The first chronological unsupported record is `$232C00`, clock `$0118`, type
`$8C`, init `$2789F6`, handler `$278C0E`, movement index `$03F`. Its exact
run-length stub `$2789EE..$2789F6` is exported so the live seeded run stops at
the body by address. The next backlog has 18 records. Nothing after that
boundary is claimed.

## 2. Translation

`src/initbody.js` now copies the exact prototypes, installs stage-dependent
cadence 6 or 2, subtracts the low byte of `$8130BC` from record byte `$1D`,
and preserves adjacent palette byte order.

`src/handlers.js` ports the complete state machine:

- entry/off-screen lifetime and active HP gate, including the bomb-laser
  sign-controlled decrement of one or two;
- hit scoring, palette flash, low-HP palette, and packed-BCD kill score `$256`;
- state 0 wait, all 16 opening frames, alternating six/seven-bullet fan,
  closing frames, and phase toggle;
- both ROM-indexed draw sites, normal and death-tail movement, delayed fixed
  death art, sound `$28C2DC`, and all nine effect records in ROM order.

`src/midboss.js` now exposes the second authentic screen-clear arm. `$243E02`
shares `$243E7C`'s guard and score walk but writes big-endian mode word `$FFFF`
instead of zero. The existing `$243E7C` behavior remains unchanged.

## 3. Coverage and art

The reusable coverage registry derives 35/256 enemy types and 314/332 stage-2
records as ported. It reports 18 unknown records, static-minus-dynamic 304, and
dynamic-minus-static zero. The exact machine-readable backlog is now
`stage2_enemy_frontier_type8c`.

The exporter derives all 16 animation streams from `TYPE96_ART` and validates
the fixed death immediate with `romExtent`. The published atlas now contains
2,688 streams across 18 shards. No art address is guessed.

## 4. Controlled evidence

No new MAME attempt was made. W174's single bounded attempt with the same
stage-2 scenario did not leave the stage-1 menu/demo path, so repeating it had
no reasonable chance of producing type `$96` lifecycle evidence. This wave
uses exact ROM static/caller/table evidence, focused port-unit tests, and the
controlled seeded port run. The seeded run reaches clock `$0118`, completes
the exact 198-record prefix with 194 allocations and four authentic declines,
then throws at type `$8C` body `$2789F6`.

## 5. Checks that failed deliberately

- Hardcoding the `$27829C` emitter index to zero made W175/3 fail when live
  index 5 should redirect both draw arms to `$23D852`, bucket 7. Restoring the
  ROM lookup re-greened it.
- Changing `$243E02`'s mode from `$FFFF` to zero made W175/6 fail. Restoring
  the distinct mode re-greened it.
- The inherited DOJ coverage mutation and dynamic-minus-static inventory
  mutation remain green-after-red in W167.

## 6. Verification

- Focused W175 and stage-2 integration/coverage suites: passed, zero skips.
- Full DOJ suite: 1,482 passed, zero failed, zero skipped.
- `npm run typecheck`: passed.
- `export-tables.py --verify`: passed, 232 ROM windows, 268,726 bytes.
- `dojcoverage.py`: 314/332 stage-2, dynamic-minus-static zero.
- `bosscoverage.py`: 103/111, zero live-unported, eight DEAD.
- `export-web.mjs`: passed, 2,688 streams across 18 shards.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000 percent.
- `webgate.mjs --assets games/ddpdoj/assets`: passed.
- `node tools/publish.mjs --only ddpdoj --dry`: passed, build
  `20260809062532`; no deployment.
- `git diff --check`: passed.

The three owner `c1_*.py` files remain untracked and untouched. No deployment
was made.
