# Task #277: White Label Stage 1 Type $0D and deferred Type $1C

Status: **green for the focused source and table acceptance set**. White Label now executes its Stage 1 Type `$0D` midboss and deferred Type `$1C` child through shared, descriptor-driven algorithms while preserving the static Black Label routes.

## Shared edition descriptors and dispatch

Type `$0D` and Type `$1C` each have one shared implementation selected by canonical, recursively frozen, edition-bound resource graphs. Initializer and handler map construction validates the descriptor against the enclosing world edition. Mutable, cloned, malformed, incomplete, foreign, and cross-edition graphs are rejected before RAM mutation or cartridge access.

The principal edition identities are:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Type `$0D` init stub | `$26B47C` | `$16A4F4` |
| Type `$0D` init body | `$26B484` | `$16A4FC` |
| Type `$0D` handler | `$26B6FA` | `$16A772` |
| Type `$0D` cue cursor | `$26B6EA` | `$16A762` |
| Type `$1C` init stub | `$26C1C2` | `$16B224` |
| Type `$1C` init body | `$26C1CA` | `$16B22C` |
| Type `$1C` handler | `$26C20C` | `$16B26E` |
| Fixed-D1 `$00` enqueue | `$263684` | `$1626FE` |
| Free-enemy retirement | `$263762` | `$1627DC` |

Black keeps its static handler routes at `$26B6FA` and `$26C20C`. White type-table rows select the White descriptor pair without exposing any White cartridge read at or above `$200000`.

## Native Type `$0D` behavior

The shared handler preserves the native targeting and combat paths for P1, P2, survivor fallback, and both-dead fire suppression. White bullet kinds `$03`, `$04`, and `$07` execute directly, including the resource-bound `bank-b-spread-two` generator. The mature Black tests remain the semantic oracle. White acceptance covers only edition deviations: descriptor selection, the masked natural route, White bullet sites, targeting ownership, the P2 score mask `$08`, edition-private effects and animation, and the deferred child.

Lethal handling enqueues Type `$1C` through White entry `$1626FE` with fixed D1 `$00` semantics. The damage-owner mask remains in record offset `$28`, and a full queue returns the native dummy record at `$816B2A` without mutating queue state.

The former cue and animation notes are replaced by direct execution. Black reads its native Build B animation list at `$26C0FC`; White reads its native Build A list at `$16B15E`. Neither edition projects the other edition's cartridge address.

## Corrected native movement route

The White native resolver masks the auxiliary index before its lookup:

```text
source record:                 $130FCC
trigger clock:                 $00C5
auxiliary word:                $1040
native mask:                   $1040 & $0FFF = $0040
lookup cell:                   $13178C
lookup offset:                 $0456
resource base:                 $131852
movement root:                 $131852 + $0456 = $131CA8
stored cursor after four bytes: $131CAC
natural position:              $8A401C00
```

Movement `$134A58` assumed the native `#$0FFF` mask was absent, so it was rejected rather than special-cased. The descriptor, natural-spawn test, cursor assertion, and position assertion all use the corrected native route.

## Deferred Type `$1C`

Type `$1C` initialization loads both native prototypes, writes literal position `$38001C00`, and does not read a movement stream. Its handler reads the edition-selected painter source and writes exactly 23 columns by 9 rows, for 207 longwords. Each source value receives tile base `$32A90000`; destination low words wrap with mask `$00FF` for both the default `$9000BC` and alternate `$9000A4` rings.

The object retires only when the clock equals `$0105`. A missing VRAM context throws before silently dropping the 207 writes.

## Exact table adoption

Exactly 16 Build A ROM windows were added, totaling `$700` declared bytes. A seventeenth Task #277 window exports Black's native `$26C0FC + $C6` death animation-object list, so the Black profile-filtered handler never depends on White-only cartridge data. The six White exact half-open executable identities are:

- Helpers `[$16A1FC,$16A4F4)`: `ba2987fd694cb37d4744bc6443417c54e354fc8f49954b818981aa4af3309510`
- Type `$0D` init `[$16A4F4,$16A772)`: `1707ab8741cdfa53a8a7024e9b59fa10c77b65c2fa2241e9334ae70fdfa61c50`
- Type `$0D` handler `[$16A772,$16B05E)`: `6d7f753fed5d621e96a8ba7b83121201dba62c114683a55025a6f9efac04e882`
- Animation list `[$16B15E,$16B224)`: `786e2d5bb3c62d497996e6ab2477d839ab184e927f2c78d2995e1d96cabf7102`
- Type `$1C` init `[$16B224,$16B26E)`: `afad6a3cb03d91b2766bec3978c767ff06af1a11c1afa4da8b6eee029a764e00`
- Type `$1C` handler `[$16B26E,$16B2C8)`: `a842eba7976b281f1ffcd8dfb7abd52f8f38ec602b6377804ab071e21bbd7d21`

The regenerated canonical JSON identity is SHA-256 `1b9afa448cbbaa1fe5898b81590aecd52edb84295a3afa48a4020230e9f05856`. Current cardinalities are:

- Global: 1,820 windows and 661,787 bytes
- White: 866 windows and 203,990 bytes
- Black runtime: 954 windows and 457,797 bytes
- Historical Black: 950 windows and 457,529 bytes

Only current generated-table identity and cardinality pins changed. Historical Black identities remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

Generation reported 1,820 windows and 661,787 bytes. Verification reported `VERIFY OK`.

The final explicit serial command covered only:

- `games/ddpdoj/tests/w31midboss.test.js`
- `games/ddpdoj/tests/white-stage1-midboss.test.js`

Result: 31/31 tests passed in 5.6 seconds. The White direct file passed 9/9 scenarios. The acceptance set deliberately reuses Black as the behavioral oracle and limits new White coverage to changed addresses, resources, ownership, effects, animation, the fixed-D1 child, both Type `$1C` destinations, exact retirement, and the below-`$200000` read boundary. Duplicate manifest assertions, malformed-descriptor permutations, symmetric lethal and fallback replays, queue-full subsystem replay, extra retirement clocks, and synthetic missing-context coverage were removed.

`npm run typecheck` passed. The previously regenerated table remains `VERIFY OK`. White Label remains disabled and unpublished.
