# Task #276: White Label Stage 1 Type $20 family

Status: **green for the focused source and table acceptance set**. White Label now runs Types `$20`, `$21`, `$22`, and `$23` through the cartridge-authentic scripted-carrier initializer and handler while retaining private Build A identities and the static Black Label route.

## Edition descriptors and dispatch

Both editions expose recursively frozen Type `$20` family descriptors with algorithm `type20`. Each descriptor owns its four type aliases, init stub and body, handler, sub-record prototype, scroll-compensation routine, caller-D1 deferred enqueue, and free-enemy retirement entry.

The edition identities are:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$272A42` | `$171A96` |
| Init body | `$272A4A` | `$171A9E` |
| Sub-record prototype | `$272A90` | `$171AE4` |
| Handler | `$272AAC` | `$171B00` |
| Scroll compensation | `$24179E` | `$141AD8` |
| Caller-D1 enqueue | `$263690` | `$16270A` |
| Free-enemy retirement | `$263762` | `$1627DC` |

All four low type-table cells point to the same edition-private pair. Initializer and handler maps select the shared algorithm through the complete frozen descriptor. The static Black initializer and handler remain in their base registries, so a partial descriptor map that replaces an unrelated algorithm cannot remove Black Type `$20` accidentally. Foreign or incomplete White graphs refuse before RAM mutation or cartridge access.

## Native carrier behavior

The initializer loads the native sub-record prototype and consumes the movement prefix into position, child type, finite-salvo count, and cooldown. Parameter words are masked to their low byte. A first parameter of `$02` is the cartridge escape form: it sets the no-scroll-compensation flag and takes the child type from the following word.

The handler does not run the movement interpreter, draw a sprite, or fire a bullet. It optionally applies cross-axis scroll compensation, performs the signed visibility test, honors freeze, and decrements the live cooldown byte with borrow semantics. A zero cooldown therefore fires immediately, then reloads from the paired low byte.

Each firing uses the caller-D1 deferred enqueue and copies the consumed movement pointer plus carrier position into the queue. The direct White test drains real deferred children and proves that the first five Stage 1 carriers create Type `$11`, the sixth creates Type `$10`, the caller class byte is preserved, and both children remain owned by P1. A zero salvo word runs forever. A finite salvo retires through native `freeEnemy` semantics after its final child. Seen offscreen carriers retire, unseen ones survive, and a full deferred queue still receives the three unconditional dummy-record writes at `$816B2A`.

## Stage 1 source closure

The six native carrier records and resolved movement streams are:

| Source | Clock | Type | Movement | Child | Salvo | Cooldown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `$130F7C` | `$00BC` | `$20` | `$131CAE` | `$11` | `$06` | `$34` |
| `$1312D4` | `$0139` | `$20` | `$13201E` | `$11` | `$04` | `$40` |
| `$1313C4` | `$015F` | `$20` | `$13203A` | `$11` | `$06` | `$38` |
| `$1313DC` | `$0162` | `$20` | `$132058` | `$11` | `$05` | `$38` |
| `$13145C` | `$0178` | `$20` | `$132126` | `$11` | `$0A` | `$38` |
| `$13146C` | `$0179` | `$21` | `$132148` | `$10` | `$07` | `$50` |

The first natural record allocates the boss-band enemy at `$8133CC`, the sub-record at `$81459C`, consumes the stream through `$131CB8`, and installs White handler `$171B00`. The direct source test also resolves and initializes all six streams independently, so later unsupported records cannot hide any carrier data path.

## Exact table adoption

Three disjoint White world-runtime windows add 68 declared bytes:

- `$16699C + $20`, the four low type-table cells
- `$171A96 + $08`, the run-length init stub
- `$171AE4 + $1C`, the sub-record prototype

Measured table changes are 1,800 to 1,803 global windows and 659,729 to 659,797 declared bytes. Overlap pairs remain 79. The unique White family is 850 windows and 202,198 bytes. White world runtime is 150 windows and 17,465 bytes. The Black live projection remains 953 windows and 457,599 bytes, and the pre-White projection remains 950 windows and 457,529 bytes.

The regenerated canonical JSON identity is SHA-256 `9dc911b15a5639dec488741f9234f7cc6b89e764744f94dcf6ecc46d826550ba`. Only the 27 current-table pins were replaced. Historical reconstructed hashes remain unchanged.

Raw executable identities use exact half-open cartridge ranges:

- Init `[$171A96,$171B00)`: `9746e0503c757eb8ae8120c0f4ea54692cc10ab084cc06d85fb7724a6562cb5b`
- Handler `[$171B00,$171B9C)`: `972f09ee88d4efaafdb3c7f4b92206cc8fc4caf9522d23174d26439bdb1dd`

## Focused verification

The required command order was:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`
4. `npm run typecheck`
5. Explicit `node --test --test-concurrency=1` files only

Regeneration reported 1,803 windows and 659,797 bytes. The browser export regenerated the ignored packaged table from that exact source identity. Verification reported `VERIFY OK`, and typecheck passed.

Focused results:

- `w33carrier.test.js`: 13/13 passed, preserving the complete Black carrier behavior.
- `white-stage1-enemy20.test.js`: 9/9 passed.
- `edition-profile.test.js`: 14/14 passed after adopting the three exact White manifest rows.
- `handlers.test.js`, `w442hyperbeamimpact.test.js`, `w443hyperbeamart.test.js`, `w562hibachiopeningbatch.test.js`, and `white-stage1-enemy8b.test.js`: all non-ledger assertions passed in the affected metadata and parity run.
- The 27 current-table ledger files passed through explicit serial execution.

Every tracked White Type `$20` family cartridge read ended below `$200000`. No sprite, sound, ROM, capture, checkpoint, or generated asset is part of this patch. White Label remains disabled and unpublished.
