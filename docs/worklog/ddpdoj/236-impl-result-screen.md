# W236: the stage-clear banner's colours

Status: COMPLETE

## Scope

Docket D11's next piece. W232 measured the transition and found its presentation
counted rather than run; six of those counted calls were `$24150A`.

## Starting state

W235 is committed at `3a0291d`, suite 1634/1634.

## The finding, and it is the same shape as W233's

`$24150A` was NOT unported. `install24150A` has been in `palette.js` since W91, and
`stageend.js` already imported it and already used it for the result screen's seven
installs (W125). The banner's own installs were noted with the words "data;
`$24150A` is counted everywhere in this port", which had stopped being true.

That is the third stale-premise note this session, after `$240DC2` (ported in W116,
still noted at five call sites) and `$23F82A`/`$23EC20`/`$289AF4` being family
members. The lesson is worth stating plainly: **when a note says a subsystem is
unported, check whether it still is.**

## Delivered

- The banner's per-stage palette, at both call sites (`$28ECF6` and `$28ED44`,
  which are the same five instructions twice). `$28EE1E` is five (picture, palette)
  PAIRS: W232 harvested the first longword of each pair as a sprite stream, and
  this is the other one -- 64 bytes into bank `$17`, chosen by the per-stage art
  byte. `loadBannerArt` takes `ctx.rom` rather than a new parameter, because
  `bannerStep28ECCE` is exported and neither caller passes one.
- The slide-out's palette (`$28EA40`): the bank is a word out of `$28EA4A` indexed
  by `$813094`, the same byte lands in both sprites' attribute low bytes, and the
  source is the fixed 64 bytes at `$246BF8`.
- Two ROM windows, both pinned rather than guessed: `$2256B8+$140` is five
  contiguous 64-byte banks, and `$28EA4A+$A` is five words ending exactly at
  `$28EA54`, which is `RESULT_ROM.bannerDfecOut` -- data this same file already
  reads.

## Verification

`node --test games/ddpdoj/tests/w236banner-palette.test.js` -> 4/4: both halves of
`$28EE1E` live and its window stopping after the fifth palette; the install running
on the banner's first frame and no longer being counted; two different art bytes
installing different bytes (a single install cannot show that the index is used);
and the slide-out table's five words with its far end pinned by the DFEC seed.

Forcing `$242952` headlessly, every `$24150A` line is gone from the counted-gap
list. Full suite -> **1642/1642**. Sweep -> zero unresolvable descriptors.

## What is still counted during a transition

`$240DC2` (60 calls, the `items.js` sites -- the printer is ported, the call sites
are not), `$286F3E` and `$287ABE` (HUD rows, the counted-draw family), `$240EBC`,
`$23C638` (result-screen palette cue), `$246410` (animation-object load),
`$28D77C` (sixteen longwords of palette RAM, which this port does not model),
`$28C186` (result-screen exit handshake), `$28D6FC`, `$253794` (option-pod
teardown), and the four `$25FD38` subsystem resets.

Next on this item: the `items.js` printer sites, because they are the biggest count
and D7's gauges are likely on the same road.
