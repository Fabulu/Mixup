# Task #288: White Label Stage 1 Type $31

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$31` Stage 1 boss-approach animation through the mature Black Label algorithm with edition-private initialization, palette selection, animation data, drawing, sound wrapper, and retirement.

## Shared algorithm and private resources

Type `$31` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before cartridge access or gameplay mutation. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$26974C` | `$1687C4` |
| Init body | `$269754` | `$1687CC` |
| Handler | `$2697F6` | `$16886E` |
| Record prototype | `$2697CE` | `$168846` |
| Sub-record prototype | `$2697DA` | `$168852` |
| Bespoke init hook | `$28CA60` | `$18B586` |
| Palette installer | `$24150A` | `$141844` |
| First bank table | `$2697B0` | `$168828` |
| First palette block | `$2251B8` | `$1251B8` |
| Second bank table | `$2697BA` | `$168832` |
| Second palette block | `$2250B8` | `$1250B8` |
| Animation table | `$26990E` | `$168986` |
| Record emitter | `$23F896` | `$13FBE4` |
| Sound wrapper | `$28C692` | `$18B1B8` |
| Free-enemy entry | `$263762` | `$1627DC` |

The White and Black initializer and handler regions differ only in relocated absolute operands. After those operands are normalized, their hashes are identical:

- Init: `c4f6ba49f70d013a2d09c465654c45a2b3d7ea03efe6bd9e21490d599d21b72f`
- Handler: `a7c1148c9c5fcba19a5f7ddca17b68d46d1f16dd937e75fecfd36978e41feacf`

The record and sub-record prototypes, palette-bank tables, 70-entry animation table, palette blocks, and emitter prefix are also byte-identical across editions. No opcode, branch, immediate, animation, palette, drawing, sound-command, or lifecycle deviation was found. The shared translation retains the existing counted bespoke-init limitation at Black `$28CA60` and records its exact White counterpart at `$18B586`; it does not invent behavior for that hook.

## Natural White route

The direct gameplay fixture spawns the authentic White Stage 1 Type `$31` record:

```text
record address:      $1316F4
record bytes:        01 E1 00 00 31 80 00 91
trigger:             $01E1
parameter:           $0000
type:                $31
flags:               $80
auxiliary index:     $091
auxiliary cell:      $13182E = $0BA2
movement resource:   $1323F4
low dispatch row:    $166A24
init stub/body:      $1687C4 / $1687CC
handler:             $16886E
```

Natural initialization installs record `$81364C`, sub-record `$81521C`, movement pointer `$1323F4`, handler `$16886E`, packed position `$40001C00`, loop count `$0006`, cue count `$0005`, and cue cadence `$0040`. With `$813094` zero, the two native bank tables select sprite banks `$0B` and `$0D`; both exact 64-byte White palette blocks are installed. The spawn cursor advances to `$1316FC`, the Stage 1 boss record.

One integrated gameplay test then drives the native White handler. It captures sound wrapper `$18B1B8`, reads the selected six bytes from the 8-byte-stride White animation table, advances the cursor by eight, writes short-axis position `$1C00`, resolves `$13FBE4` as the record-convention bucket-21 emitter, and emits one sprite request. A representative phase-2 update reads the final entry at cursor `$0228`, advances to `$0230`, and retires through shared `freeEnemy` semantics before drawing. Mature Black tests remain the authority for the complete three-phase state machine and mirrored two-sprite path.

## Exact sparse table adoption

Eight exact Build A windows add 786 declared bytes, all below `$200000`:

- `$1250B8 + $0040`: second palette block
- `$1251B8 + $0040`: first palette block
- `$13FBE4 + $0016`: record-convention sprite emitter
- `$166A24 + $0008`: low type-table entry `$31`
- `$1687C4 + $0008`: run-length initializer stub
- `$168828 + $0014`: both five-word loop palette-bank tables
- `$168846 + $0028`: contiguous record and sub-record prototypes
- `$168986 + $0230`: 70-entry animation table

The prototype window must be 40 bytes. The sub-record loader's final longword starts at `$168860` and ends at `$168864`; a shorter or abutting declaration cannot satisfy that whole read. Every tracked White read fits wholly inside one declared window, and the highest new exclusive endpoint is `$168BB6`. The additions create no overlap pair.

The exact executable identities are:

- Init `[$1687C4,$16886E)`: `91a2098c93051d8e0a93ba8cd6eea80653bafb7d2c0d4f10b5c0acd436965563`
- Handler `[$16886E,$168986)`: `9f55845d8135fff1a5265254d3c5bf311bbc5f7da8ed91d209ffa4cedc9e7a54`

The regenerated canonical JSON identity is SHA-256 `05214a45f52ae8861170b3be057e3f7d9e798c9f220d3645833e6ec8ed56e1ec`. Current cardinalities are:

- Global: 1,865 windows and 664,087 bytes
- White: 911 unique windows and 206,290 bytes
- White world runtime: 209 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes
- Black runtime projection: 954 windows and 457,797 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, ledger prose, and overlap accounting remain unchanged. Existing Type `$31` assets already cover the identical Black and White sprite pointers, so no new art harvest was added.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,865 ROM windows, 664,087 declared bytes, and `VERIFY OK`.

The explicit serial compatibility command covered only:

- `games/ddpdoj/tests/white-stage1-enemy31.test.js`
- `games/ddpdoj/tests/w36handlers.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 36/36 tests passed. Direct Type `$31` coverage is one integrated test for descriptors, map ownership, executable identity, sparse authority, natural spawn, both palette installs, White animation and emitter reads, White sound-wrapper capture, and representative retirement. A final `npm run typecheck` passed. `git diff --check` passed. White Label remains disabled and unpublished.
