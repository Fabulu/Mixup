# Task #281: White Label Stage 1 Type $88

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$88` Stage 1 enemy through the mature Black Label algorithm with edition-private initialization, alternating turret aim, six-shot fire, bullet continuation, combat ownership, drops, effects, sound, and retirement.

## Shared algorithm and private resources

Type `$88` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before gameplay mutation or cartridge access. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$275D98` | `$174E3A` |
| Init body | `$275DA0` | `$174E42` |
| Handler | `$275F30` | `$174FD2` |
| Heading art | `$272D7A` | `$171DCE` |
| Fan vectors | `$2731FA` | `$17224E` |
| Aim entry | `$24203E` | `$142378` |
| Aim slew | `$242190` | `$1424CA` |
| Record emitter dispatch | `$27829C` | `$17733A` |
| Register emitter dispatch | `$2782E4` | `$177382` |
| Direct bullet entry | `$2813F0` | `$180474` |
| Two-way spread entry | `$281442` | `$1804C2` |
| Effect remap | `$278320` | `$1773BE` |
| Secondary burst | `$289B22` | `$18865E` |
| Death sound | `$28C2DC` | `$18AE02` |
| Free-enemy entry | `$263762` | `$1627DC` |

The implementation remains one shared Type `$88` algorithm selected by edition-owned resources. Resource-bound bullet dispatch now supports White bank-A direct fire and bank-A two-way spread without borrowing Black cartridge addresses or templates.

## Natural White route

The direct gameplay fixture spawns the authentic record at `$131304`:

```text
record bytes:       01 42 00 00 88 01 10 59
auxiliary cell:     $1317BE = $065E
movement record:    $131EB0
initial type:       $88
dispatch row:       $17D504
init stub/body:     $174E3A / $174E42
handler:            $174FD2
sub-record:         $81459C
```

Natural initialization follows the White movement record and preserves the mature Type `$88` state layout. The source clock also naturally spawns its adjacent Type `$82`; cartridge-read tracking keeps every White read inside one declared sparse window and below `$200000`.

Successive due frames preserve the old bit 6 alternation: the first frame aims turret A and the second aims turret B. Each live frame emits four sprite requests and runs the six native bullet call sites in order. At rank zero, all six bullets are kind `$04`; turret A steps through directions `0`, `-20`, and `-40`, while turret B steps through `0`, `+20`, and `+40` in bullet-byte units. White initialization installs exact continuation `$181470` on all six bullets, and the next bullet-driver frame dispatches it and moves every projectile.

The lethal P2 route preserves native ownership: kill event `[0x115, 0x08]`, zero P1 score, packed-BCD `$116` P2 score including the hit point, death sound `$18AE02`, seven Pool-A kind `$08` drops, four Pool-B effects with kinds `$0D`, `$0C`, `$0C`, and `$85`, two deferred `$18865E` bursts, and ordinary `freeEnemy` retirement.

## Exact sparse table adoption

Seven exact Build A windows add 506 declared bytes, all below `$200000`:

- `$171DCE + $0080`: heading-art table
- `$17224E + $0080`: fan vectors
- `$174E3A + $0008`: run-length initializer stub
- `$174F44 + $008E`: palette, prototypes, and cue list
- `$17547A + $002C`: sprites and death-drop vectors
- `$177382 + $0030`: 12-entry register emitter dispatch
- `$17D504 + $0008`: high type-table row `$88`

All seven windows are disjoint. The exact half-open executable identities are:

- Init `[$174E3A,$174FD2)`: `5e7ff6ebd4ecb64e5f8800791412767443431855a2a27244129b2a1e12de85fd`
- Handler `[$174FD2,$17547A)`: `11be73a632a6fdb1d2bbed7f93741a2b21cf4ee19cffb817f2fa236518502efb`

The regenerated canonical JSON identity is SHA-256 `4968485c1c53f9ab74bee48d34a643f41b762a5365a6398b3986629017b7bfea`. Current cardinalities are:

- Global: 1,840 windows and 662,931 bytes
- White: 886 windows and 205,134 bytes
- White world runtime: 184 windows
- White bullet runtime: 55 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, ledger prose, and overlap accounting remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,840 ROM windows, 662,931 declared bytes, and `VERIFY OK`.

The explicit serial integration command covered only:

- `games/ddpdoj/tests/white-stage1-enemy88.test.js`
- `games/ddpdoj/tests/white-bullets.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 24/24 tests passed. After the final byte-preserving `bullets.js` line-ending repair, the exact Type `$88` file passed again at 3/3 tests. Direct Type `$88` coverage remains exactly three combined tests: descriptor, manifest, and natural spawn; alternating live fire and bullet continuation; and lethal P2 ownership.

`npm run typecheck` passed after the final source repair. White Label remains disabled and unpublished.
