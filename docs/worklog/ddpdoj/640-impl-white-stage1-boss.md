# Task #289: White Label Stage 1 boss

Status: **implemented and focused acceptance green**. White Label now routes the natural Stage 1 Type `$0E` boss and its Type `$1E` children through the mature Black Label algorithms with edition-private cartridge resources, scheduler identities, sounds, and lifecycle behavior.

## Shared algorithms and private resources

Type `$0E` and Type `$1E` now have canonical, recursively frozen Black and White resource graphs. Initializers and handlers require exact descriptor identity before cartridge access or gameplay mutation. The White world removes Black handler identities and installs its native routes:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Type `$0E` low row | `$267894` | `$16690C` |
| Type `$0E` init stub | `$2926DA` | `$1910C6` |
| Type `$0E` init body | `$2926E2` | `$1910CE` |
| Type `$0E` record prototype | `$2927F6` | `$1911EA` |
| Type `$0E` sub prototypes | `$292806` | `$1911FA` |
| Type `$0E` handler | `$292902` | `$1912F6` |
| A0 main root | `$293104` | `$191AF8` |
| A1 E-script root | `$295856` | `$1942A2` |
| A2 object root | `$292932` | `$191326` |
| A3 D-script root | `$29370A` | `$1920F6` |
| A4 F-script root | `$294F68` | `$1939C0` |
| Type `$1E` low row | `$267914` | `$16698C` |
| Type `$1E` init stub | `$296D82` | `$1957B8` |
| Type `$1E` init body | `$296D8A` | `$1957C0` |
| Type `$1E` sub prototype | `$296DBC` | `$1957F2` |
| Type `$1E` handler | `$296DD6` | `$19580C` |
| Type `$1E` animation table | `$296F68` | `$19599E` |
| Type `$1E` emitter identity | `$23F7C6` | `$13FB14` |
| Retirement entry | `$263762` | `$1627DC` |

Scheduler aliases retain the native White source address in `ctx.bossScriptAddress` while calling the mature shared callback. Handler-bound resource context carries the edition descriptor through nested boss, bullet, effect, score, item, palette, rendering, and stage-advance operations. There is no broad runtime address translation.

The native Type `$0E` record is:

```text
$1316FC: 01 E8 00 00 0E 80 00 92
$131704: FF FF FF FF FF FF FF FF
```

Natural initialization loads the native record and nine sub-record prototypes, installs five native scheduler roots, activates the object-6 and F0 records, installs the White palettes, and enables boss HP display.

## Verified White behavior

The shared algorithms accept only the cartridge differences proven by the canonical White Build A image. Notable differences include:

- D6 state 4 does not write the wait field.
- D6 state 5 executes immediately, emits its native composite sound sequence, processes the eight-entry `$192D40` burst table, creates three exact eleven-particle positioned groups, sets wait `$80`, and enters state 6 without the Black final blast or screen shake.
- E8 uses White normal speed and facing `$2020`.
- E12 has no Black HP gate and emits exactly five calls from each of two muzzles, starting at angle `$80` with step `$0C`.
- E14 and E56 retain their verified White speed, backoff, step, and cadence values.
- Type `$0E` and Type `$1E` retain native retirement entry identities while sharing `freeEnemy` semantics.

White sound wrapper identities remain in the canonical descriptors. `postBossSound` is the single narrow translation boundary to the existing runtime sound API. White wrapper `$18AEB8` emits the exact request sequence `$28C392`, `$28C310`, `$28C392`.

Type `$1E` rendering directly invokes the already-decoded bucket-22 enqueue operation. Its native emitter identity `$13FB14` remains in the descriptor and executable ledger, but is not exposed as ordinary runtime cartridge data.

## Sparse Build A authority

The port adds 56 exact runtime data windows. Every new White window is below `$200000`; every cartridge read must fit wholly inside one descriptor, and adjacent or overlapping descriptors are never stitched. Existing Aim, bullet, effect, item, score, and shared world windows were reused rather than duplicated.

Four executable identities are pinned independently against the canonical raw image:

- Type `$0E` init `[$1910C6,$1912F6)`: `598bb902364ace359687cf9e06a3aef842c20a50955bc9b2ac4e2958eaf363e3`
- Type `$0E` handler `[$1912F6,$191326)`: `c91b79f6d8b6ac90699acd56f67ee3ecb44aa608cfa45fa08551053cf5bba2c0`
- Type `$1E` init `[$1957B8,$19580C)`: `81c8e133efc102538173f67e5f4dd59d1e3c9f12dd0d54c85706f11d75ffac6d`
- Type `$1E` handler `[$19580C,$19599E)`: `d6e8382b6d2861d87663834d14ac22f1bc8ed9a2b20a5b76064db0c6e2263388`

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported the canonical image SHA-256 `4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`, 100 reachable spawn templates, 1,921 ROM windows, 668,715 declared bytes, and `VERIFY OK`. Generated cartridge data and assets remain ignored and are not part of the commit.

## Focused verification

The integrated White boss acceptance test covers natural spawning, native scheduler dispatch, Type `$1E` construction and bucket-22 drawing, sparse whole-read authority, exact D6 state 5, and exact E12 fan behavior. Mature Black tests remain the authority for unchanged boss matrices.

```text
node --test --test-concurrency=1 games/ddpdoj/tests/white-stage1-boss.test.js
# tests 1
# pass 1
# fail 0

npm run typecheck
> mixup@0.1.0 typecheck
> tsc -p tsconfig.json
```

Focused acceptance and the final post-change typecheck are green. White Label remains disabled and unpublished.
