# W174: Stage-2 type `$90`

Status: COMPLETE

## 1. Premise and boundary

The premise was correct, with one data correction carried forward from the
read-only closure. Stage 2 stopped at record `$2328D0`, clock `$0085`, type
`$90`. Its movement index `$037` resolves to `$233670..$233676`, whose exact
bytes are `7C 00 3D 00 40 00`. The earlier W161 note had copied type `$8F`'s
unrelated `$2340CC` bytes.

Type `$90` occurs once in the 332-record stage-2 script. After it and the
already ported families that follow, the next chronological unsupported record
is `$2329C0`, clock `$00B8`, type `$96`, body `$27A454`, handler `$27A548`,
movement index `$03C`. The seeded port reaches that exact body. The live cursor
remains `$2329B8` because the unknown init callback throws before `$263444` can
write back the advanced `$2329C0` cursor. This is 125 completed records and the
type `$96` allocation is attempt 126; 122 attempts allocate and four decline.

## 2. Static closure

The complete bounded family is:

- run-length stub `$279802..$27980A`, one sub-record;
- init body `$27980A..$279856`;
- five palette pairs `$279856..$279860`;
- six-word record prototype `$279860..$27986C`;
- one 28-byte long-form sub-record prototype `$27986C..$279888`, carrying the
  sole sprite stream `$2351AC`;
- handler countdown tail `$279888..$279898` and normal entry
  `$279898..$279A92`;
- four-word damage-particle table `$279A92..$279A9A`, values `$0480`, `$0600`,
  `$0740`, `$08C0`;
- next local type `$91` stub `$279A9A` and the chronological type `$96` stub
  `$27A44C`, both read past their apparent boundaries to prove the next code
  start.

The handler has no address-register indirect call and no `$281xxx` bullet
generator call. Its only draw is direct `$23D762`, bucket 0. The ROM exporter
pins the loader calls, both prototype extents, palette bytes, tail entry, direct
call closure, absence of indirect and bullet calls, particle table, one script
occurrence, corrected movement bytes, and type `$96` frontier.

## 3. Ported behavior

`src/initbody.js` now copies the exact prototypes, reads movement position, and
copies the palette bytes in the cartridge's order: `(A0)` to sub-record `+$1D`,
the same `(A0)+` byte to record `+$1A`, then the adjacent byte to `+$1B`.
Nonzero `$813098` clears the whole record `+$1E` word.

`src/handlers.js` now ports:

- movement-first normal lifecycle and the exact two-word carry boundary;
- the record `+$1C` HP transition, `$7FFF/$7EFF` revival, second-phase
  `$0400/$0300` installation, and unsigned `$1000/$0F00` clamp;
- hit scoring and palette flash;
- the threshold particle loop, including one `$2431F4` shared RNG draw per
  DBRA iteration and a ROM-indexed low word under high word `$08C0` for the
  counted shared `$27F8FA` dependency;
- death sound `$28C2DC`, score `$32`, flags `$8080`, exact effect kinds
  `$0D,$0D,$85`, bucket remap, offsets, delays, and hook fields;
- the post-death byte countdown at record `+$17`, drawing on no borrow and
  freeing on borrow;
- the one direct bucket-0 sprite emission.

The effect-pool field writes use explicit word and long writes. The init's
adjacent palette byte copies are tested with distinct values, so a swapped
big-endian byte placement is observable. No inseparable per-frame subsystem or
indirect emitter family was found.

The web exporter derives the one art stream from the live `TYPE90_ART` source
constant and validates it with `romExtent`. The published sheet now contains
2,671 sprite streams, one more than W173.

## 4. Controlled board attempt

`w25handler.lua` now recognizes handler `$279898` and can record `X90` rows for
lifecycle, thresholds, palette, art, and bucket-0 emission. The wave's single
bounded attempt was:

```
python games/ddpdoj/tools/oracle/w25run.py 13720 w174-type90 --fire 1250
```

It completed in 88 seconds with 13,720 logic frames, 13,772 video frames, and
`fails=0`, but recorded only stage-1 handlers. No `X90` row exists in the
4,602,800-byte TSV. `tools/w174-stage2-type90-evidence.json` records this as
`NO_STAGE2_TYPE90`. It was not retried, and lifecycle or emitter observations
are not claimed from the board.

## 5. Reusable coverage and backlog

The live registries, never a hand list, now report:

- enemy types: 34/256 ported, 92 unknown, 130 null;
- stage-2 spawn script: 313/332 ported, 19 unknown, 0 null;
- stage-2 dynamic-minus-static: zero;
- stage-2 static-minus-dynamic: 304 record-qualified entries.

The exact ordered backlog is renamed `stage2_enemy_frontier_type96`, contains
19 records, and begins `$2329C0/$00B8/$96/$27A454/$27A548/$03C`. Boss coverage
is unchanged at 103/111, with zero live-unported and eight entries proven DEAD.

## 6. Checks capable of failing

- Replacing the particle-table lookup with hardcoded `$279A92` made W174/5
  fail: two distinct RNG-selected vectors collapsed to one. Restoring
  `$279A92 + index*2` re-greened it.
- `dojcoverage.py --break-coverage` removes a live registry entry and fails.
- `dojcoverage.py --break-stage2-spawn-inventory` injects a dynamic record
  outside the static inventory and fails. The restored coverage run is green.
- The seeded stage-2 boot now demands the exact `$27A454/$00B8` stop and exact
  125-completed/126th-attempt cursor and allocation accounting.

## 7. Verification

- Focused handler/init/integration/W133/W167/W169/W174 suite: 52 passed, zero
  failed, zero skipped.
- Full DOJ suite: 1,476 passed, zero failed, zero skipped.
- `npm run typecheck`: passed.
- `export-tables.py --verify`: passed, 231 ROM windows, 267,150 bytes.
- `dojcoverage.py`: green; dynamic-minus-static zero.
- `bosscoverage.py`: 103/111, zero live-unported, eight DEAD.
- `export-web.mjs`: passed; 2,671 streams across 18 shards.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000 percent.
- `webgate.mjs --assets games/ddpdoj/assets`: passed.
- `node tools/publish.mjs --only ddpdoj --dry`: passed, build
  `20260809055803`; no deployment.
- `git diff --check`: passed.

The three owner `c1_*.py` files remain untracked and untouched. No sound,
replay, hyper, bee, Gradius, or existing gameplay behavior was changed.
