# W172: Stage-2 type `$8F`

Status: COMPLETE, NOT DEPLOYED

## Result

The stage-2 type `$8F` family is ported from its exact ROM closure:

- stub/body `$277514/$27751C..$277598`
- five palette pairs `$27759A..$2775A4`
- six-word record prototype `$2775A4..$2775B0`
- one 28-byte sub-record prototype `$2775B0..$2775CC`
- handler `$2775CC..$27782E`, bounded by type `$95`'s stub
- heading art table `$272EFA`, 32 entries pointing to `$154710 + $A4*i`
- fixed first-death stream `$155B90`, completing a 33-stream family
- firing vectors `$27327A`, 32 longwords
- movement streams already inside W169's closed stage-2 resource span

The init copies both prototypes, consumes the movement prefix, aims through
`$24202C`, selects the heading stream, applies the `$8130B6` cadence bias, and
indexes the palette pairs by the raw stage-times-two byte offset.

The handler preserves movement, on-screen lifetime, damage and palette flash,
aim cadence and slew, the direct `$2813F0` shot with its ROM vector, salvo
reloads, score and sound calls, and the two-stage death. The first negative-HP
hit scores 8, spawns kind `$84`, switches to `$155B90`, reloads HP to `$0300`,
and stays live. The second scores 8, posts `$28C25A`, spawns kind `$0C`, and
frees the enemy.

The two shared second-death callees `$289AF4` and `$27F8EE` remain counted by
their exact addresses and register inputs. `$27F8EE` allocates general pool-A
kind 2, not the bee-only reserved ten. Porting that shared family would require
its own dependency closure and was not fabricated here.

## Indirect emitter audit

Both handler draw sites perform the same indexed lookup:

`$27829C + (sub+$1E)*4 -> record-convention emitter`

The prototype starts at index 0, whose pointer is `$23D762`, bucket 0. There is
no `$2782E4` register-convention call in type `$8F`. Both the ordinary and
bit-7 special paths resolve the pointer from ROM on every call. A deliberate
hardcoded-index mutation made the index-5 unit case red because bucket 7 no
longer received the record; restoring the indexed lookup re-greened it.

The nearby W172 translation has no other indirect emitter dispatch. Heading
art, firing vectors, effect remaps, and the `$278314` secondary word remain
ROM-derived. Direct callees are statically pinned by the exporter.

## Occurrences and corrected frontier

The ROM stage-2 script contains 11 type-`$8F` records, in exact order:

`$2327D0/$0045`, `$2327D8/$0046`, `$232978/$00AD`, `$232988/$00B0`,
`$2329C8/$00C0`, `$2329E0/$00CF`, `$2329E8/$00D1`, `$2329F8/$00D5`,
`$232A08/$00D7`, `$232A10/$00D7`, `$232EA8/$018B`.

The brief's claimed next runtime boundary, `$232EC0` type `$94`, was not the
first chronological unsupported record. It is only the record after the final
type-`$8F` occurrence. A controlled port boot reaches the true first boundary:

- record `$232820`
- clock `$0054`
- type `$84`
- init body `$275154`
- handler `$2752B0`

The next type's exact run-length-1 stub `$27514C..$275154` is exported so the
port stops by body address, not on an accidental missing ROM window. The boot
consumes exactly 74 records before leaving `$232820` pending and records 70
successful allocations; four authentically decline.

W167 coverage now reports stage 2 at 310/332 records, leaving 22 unknown. Its
config holds all 22 remaining records as ordered machine-readable rows with
record, trigger, type, init, handler, movement index, and exact movement span.
The gate re-derives this list from the live registries and ROM on every run and
refuses stale, reordered, or hand-selected data.

## Controlled MAME result

One bounded board attempt was run as required: `w172-type8f`, 13,720 logic
frames, labelled auto-fire plus dormant isolate/two-stage-kill controls. It
completed in 137 seconds with `fails=0`, but reached only stage-1 handlers. The
4,602,800-byte TSV contains no `X8F`, `E8F`, or `I8F` row. Per the one-attempt
cap it was not retried.

`tools/w172-stage2-type8f-evidence.json` records this negative result. It does
not promote a static occurrence, unit result, or port run into board evidence.
Lifecycle, emitter address, firing, and death are therefore ROM/static plus
port-unit verified in this wave, not claimed as controlled-board observations.

## Checks capable of failing

- Hardcoding the live emitter index to zero made W172/3b red; restored.
- `dojcoverage.py --break-coverage` lost one baseline registry token and went
  red; restored.
- `dojcoverage.py --break-stage2-spawn-inventory` injected record `$2325C8`
  outside the static inventory and went red; restored.
- The exporter refuses drift in the loader sequence, prototypes, handler
  bounds, direct-call closure, both indirect sites, heading pointers, death
  immediate, firing vectors, all 11 occurrences, and both frontier meanings.

## Verification

- Focused W167/W169/W172/handler/init/stage-2 boot tests: green, zero skipped.
- Full DOJ unit suite: 1,459 passed, 0 failed, 0 skipped.
- `npm run typecheck`: passed.
- `export-tables.py`: passed, 228 ROM windows.
- `dojcoverage.py`: 32/256 enemy types and 310/332 stage-2 records, inventory
  errors zero; both deliberate reds observed and restored.
- `bosscoverage.py`: unchanged, 103/111 ported, zero live-unported, eight DEAD.
- `export-web.mjs`: passed; shard 17 contains type `$8F`'s 33 art streams and
  remains a derived multi-family asset.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000%.
- `webgate.mjs`: passed.
- `node tools/publish.mjs --only ddpdoj --dry`: passed, build
  `20260809043743`; no deployment.
- `git diff --check`: passed.

The three owner `c1_*.py` files remain untracked and untouched. No sound,
replay, hyper, bee, Gradius, or `$29540C` behavior changed.
