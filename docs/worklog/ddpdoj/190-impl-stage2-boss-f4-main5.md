# W190: Stage-2 boss F4 and MAIN5

Status: COMPLETE

## Scope

Statically map and translate A4/F4 at `$2993B4/$299406` and MAIN5 at
`$297CC2/$297CFA`, the two next-pass scripts scheduled by W189's F1 and MAIN3.
Include compact same-frame descendants and preserve the completed F1/F2/F3/F8
paths. Use one focused regression and one seeded product smoke.

## Starting state

- W189 is committed, pushed, and live as build `20260809212505`.
- Stage-2 spawn coverage is 332/332 with zero unsupported spawn records.
- The boss can enter part-loss, low-HP, and primary death phases.
- F4 and MAIN5 are the next normal-play scheduler frontiers.

## Static findings

### MAIN5

MAIN5 is `$297CC2..$297D6A`. Its init retires every A1/E2 slot, saves the
boss root as a persistent anchor, creates a signed RNG target around that
anchor, and falls directly into its first movement step. Each old-zero cadence
ramps speed toward 2, applies velocity, checks the post-movement distance, and
chooses a fresh target when the boss reaches the current one. The anchor is
never replaced by the moving position.

### F4 dual conductor

F4 is `$2993B4..$29962E`. It contains two independent state tracks which run
in literal source order on every scheduler call. A state transition in an
early section can therefore execute a later section immediately. The first
track extends and retracts boss-part draw selectors through D6, D9, and the
already translated D10 while scheduling the four-emitter E13 barrage. The
second track alternates widening E14 fans with E1 aimed volleys.

The direct new closure consists of D6 `$2980FA/$298106`, D9
`$2981EC/$2981F2`, E1 `$299B54/$299B74`, E13 `$29B00A/$29B024`, and E14
`$29B0A6/$29B0D0`. All four attack leaves fall through from init into step.
Their visible output uses the existing bullet generators and vector tables;
no new sprite, sound, palette, or effect asset is required.

F4 preserves three different timer senses: byte borrow from an old zero,
word result-zero countdowns, and the E13-group byte result-zero counter. E1's
aim jitter oscillates between zero and one signed step. E14 toggles the boss
record side bit before aiming and keeps its `$80` fallback when no live player
exists.

## Implementation

- Added MAIN5 with E2 retirement, signed target jitter, speed cadence,
  post-movement distance, and eight-part placement.
- Added the complete F4 dual-track conductor.
- Added A3/D6 and A3/D9 selector drivers.
- Added A1/E1, E13, and E14 bullet leaves with their exact rank branches,
  vector indexing, call order, parameters, and self-retirement timing.
- Added seven exact ROM windows and SHA-256 closure pins.
- Reused the existing scheduler, aim, RNG, movement, and bullet helpers; no
  parallel implementation path or new asset harvest was introduced.

## Verification

- Export verification: green, 287 ROM windows and all W190 hashes pinned.
- Focused W190 regression: 1/1 green. It proves both MAIN5 init fallthrough
  and E2 retirement, then proves F4 starts D6 and E14 and that both execute
  later in the same scheduler pass with live bullet output.
- Existing seeded Stage-2 product smoke: 4/4 green, including the 9,000-frame
  boss budget.
- Release unit gate: 1,538/1,538 green.

## Result

The two W189 frontiers are closed. Stage 2 now has its anchored phase-one boss
movement and the persistent F4 alternating attack conductor, including every
new script F4 directly starts. Pool-D `$289098/$2890F2` secondary death debris
remains a separate visible fidelity closure; primary boss death presentation
is unchanged and complete.

The installed type-`$30` scheduler graph now has no unsupported reachable
entry. A full static start-site scan found no producer for the defensive E12
waits in F4 and no starts for dormant F5-F7. The next honest live Stage-2
fidelity closure is pool D `$289098/$2890F2`, which the translated boss-death
effects already request. After pool D, delivery moves to the Stage-3 entry
instead of translating unreachable boss scripts.

## Release

- implementation commit: `53c3315`
- documentation commit: `f44ca54`
- production build: `20260809215527`
- deployment: `https://1868dad2.gbtman.pages.dev`
- production URL: `https://gbtman.pages.dev/games/ddpdoj/`
- production confirmation: three consecutive checks reported the expected
  build ID and HTTP 200 for the DOJ page and asset manifest
