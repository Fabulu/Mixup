# W168: Stage-2 BGELEM closure

Status: DONE

## Scope

Verify and close the ROM-backed eight-entry stage-2 background-element family, including its callers, data, art, dependencies, dynamic order, and the next honest runtime boundary.

## Premise and boundary

The premise at `ee6c19e` was exact. The W133 seed boots stage 2 and scrolls its exported column stream, then the first op `$10` dispatch refuses constructor `$2627AC`. W167 derives an eight-entry static stage-2 BGELEM table, sees six entries through updater-only W75 evidence, and finds zero ported entries.

Reading continuously from `$2627AC` through `$262B4B`, including past every apparent `rts`, shows one coherent bounded family. Seven entries use the common element-slot shape. Entry 7 is a single inseparable animated two-sprite variant whose updater reverse-walks the adjacent 32-pair table. Stage-3 code starts exactly at `$262B4C`. There was no evidence-supported reason to split the wave.

## Exact ROM inventory

The denominator is the adjacent eight-longword table `$26227E..$26229D`, reached through stage pointer `$262302[1]`.

| ID | Constructor | Updater | Data or animation | Y | Kind | Kill threshold | Sprite stub |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | `$2627AC` | `$2627CA` | `$27A078` | `$2EE0` | `$13` byte | `$5C00`, `lbge` | `$23DF2A`, bucket 2 |
| 1 | `$2627FE` | `$26281C` | `$2340C8` | `$1F20` | `$11` byte | `$3C00`, `lbge` | `$23DEFC`, bucket 1 |
| 2 | `$262850` | `$26286E` | `$2356B4` | `$2050` | `$12` byte | `$4000`, `lbge` | `$23DF2A`, bucket 2 |
| 3 | `$2628C0` | `$2628DE` | `$235BB8` | `$2A50` | `$12` byte | `$5400`, `lbge` | `$23DF2A`, bucket 2 |
| 4 | `$2628A2` | `$26286E` | `$2356B4` | `$2050` | `$0052` word | `$4000`, `lbge` | `$23DF2A`, bucket 2 |
| 5 | `$262912` | `$2628DE` | `$235BB8` | `$2A50` | `$0052` word | `$5400`, `lbge` | `$23DF2A`, bucket 2 |
| 6 | `$262930` | `$26294E` | `$27B49C` | `$1220` | `$15` byte | `$2400`, `lbge` | `$23DF2A`, bucket 2 |
| 7 | `$262982` | `$2629AE..$262A4A` | 32 pairs at `$262A4C..$262B4B` | constructed | constructed | clock `$22F` | `$23E056` and `$23DF58`, bucket 3 |

Entries 4 and 5 are real word-kind variants, not duplicate inventory accidents. They deliberately share entries 2 and 3's updater and art. This is why W75's updater-only evidence cannot distinguish the complete eight-entry dynamic set.

Entry 7 constructs updater `$2629AE`, reverse offset `$F8`, initial streams `$2376F4/$24CD34`, and two byte countdown fields set to 2. Its updater scroll-compensates the slot, begins the reverse animation walk at clock `$1F4`, draws the first stream only below `$21A`, draws the second stream through its lifetime, and frees the slot at `$22F`. The port includes the complete body and all 32 pairs, not a shortened common-handler interpretation.

## Dynamic occurrence evidence

A controlled 22,500-logic-frame VERSION-B board run used `w17stage.lua` with its named invulnerability and autoshot sweep interventions. This is valid for coverage and occurrence order only, not pacing. The exact observations are committed in `tools/w168-stage2-bgelem-evidence.json` and joined by ID, constructor, and updater in `dojcoverage.py`.

| Order | ID | Logic frame | Scroll clock | Constructor | Updater |
|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 14671 | `$0024` | `$2627AC` | `$2627CA` |
| 2 | 6 | 16415 | `$0091` | `$262930` | `$26294E` |
| 3 | 1 | 17679 | `$00E0` | `$2627FE` | `$26281C` |
| 4 | 2 | 19311 | `$0146` | `$262850` | `$26286E` |
| 5 | 3 | 19823 | `$0166` | `$2628C0` | `$2628DE` |
| 6 | 4 | 19855 | `$0168` | `$2628A2` | `$26286E` |
| 7 | 5 | 20367 | `$0188` | `$262912` | `$2628DE` |
| 8 | 7 | 21199 | `$01BC` | `$262982` | `$2629AE` |

The reusable join is now stage-2 BGELEM 8/8 ported, 8/8 dynamically observed, static-minus-dynamic zero, and dynamic-minus-static zero. An ID-qualified record is required because updater-only evidence collapses IDs 2/4 and 3/5.

## Port and art closure

`background.js` extends the live source registry with all eight ROM-derived rows. The common updater now supports stage 2's longword `bge` comparison and bucket-1 emitter while preserving stage 1's existing mutation seam. Entry 7 has its complete dedicated updater and uses the already-ported register-convention sprite-queue helpers.

The ROM export now covers `$2627AC..$262B4B`. The web exporter derives art from the live registry and verifies each constructor against `maincpu.bin`. It harvests seven simple descriptors and every longword in the 32-pair table. Their union is 53 distinct streams, all assigned to deferred structure shard 11. The web gate's stage-1 scenario remains pinned at the same 12,805 records, 101 live images, and first record 315; only the structurally harvested shard inventory grows from 158 to 211.

The controlled port run dispatches the same ID order as the board, crosses the old `$2627AC` stop, and reaches the stage-2 permanent lock at scroll clock `$0264`. It deliberately does not claim enemy content closure: the live spawn cursor remains parked on stage 1's `$231704` terminator because stage-2 enemy installation is the next honest boundary.

## Gates and deliberate reds

W168 adds four zero-skip tests: the exact ROM table and constructor dependencies, the exported 53-stream art closure, the complete controlled port occurrence order through the stage-2 lock, and a deliberate deletion of entry 0's constructor data field. The mutation goes red and the restored build re-greens.

The W167 gate now consumes the ID-qualified W168 evidence. Its deliberate coverage-regression and inventory-regression modes both went red and the restored report is green. The unchanged boss coverage gate remains intact.

## Verification

- Focused W167/W168 tests: 7/7 passed, zero skipped.
- Full DOJ unit suite: 1,433/1,433 passed, zero skipped.
- `npm run typecheck`: passed.
- `python games/ddpdoj/tools/dojcoverage.py`: passed, stage-2 BGELEM 8/8 static, 8 dynamic, zero inventory errors.
- Both `dojcoverage.py` deliberate red modes failed as required and restored green.
- `node games/ddpdoj/tools/webgate.mjs`: passed after pinning the ROM-derived shard-11 growth.
- `node tools/publish.mjs --only ddpdoj --dry`: passed unit, bundle, web, ROM-leak, and build gates; build id `20260809013424`; no deployment.
- `python games/ddpdoj/tools/oracle/pgm.py check --quick`: every W167/W168 coverage stage passed, 52 total passes, four inherited failures, zero skips. The unchanged starting-HEAD failures are stage end, chain expiry, bomb, and laser bomb.
- `git diff --check`: passed.

No sound, replay, hyper, bee, Gradius, `$29540C`, or owner-decision behavior changed.
