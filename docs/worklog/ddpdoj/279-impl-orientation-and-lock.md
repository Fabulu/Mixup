# W279: DOCKET D13 and D15 -- the landscape insets, and the lock as a SETTING

Status: DONE. Suite 1942/1942 (1930 + 12, and four W268 tests updated), sweep 0 missing on
both the shipped seed and the stage-2 rung, both run before the commit. No skips.

Two of the five items the owner added this session, and both are `index.html` only -- no ROM
reading, which is why they went first.

## Starting state

W278 committed at `3d4e492`, suite 1930/1930. The owner then added D13..D17 to the docket
(`6e08cf7`).

## D13: THE HORIZONTAL INSETS WERE MISSING, AND LANDSCAPE IS EXACTLY WHERE THEY BITE

The page sets `viewport-fit=cover`, which is **opt-IN to painting under the system chrome**.
Once that is set the safe-area insets are not optional -- and only
`env(safe-area-inset-bottom)` was there.

A notched phone puts its cutout on a SHORT edge. So in portrait the inset that matters is
vertical, and **in landscape it is the left/right pair** -- which is the orientation D10 was
about in the first place. Held with the notch on the left, `#bar`'s buttons slid under it.

`body` now pads right/bottom/left. Two decisions recorded at the line and asserted:

* **the TOP inset is deliberately not padded.** `#bar` is a solid strip with its own bottom
  border and reads correctly under a status bar; padding above it would leave a transparent
  gap over a dark bar, which looks like a defect rather than like safety. The test asserts
  its absence so nobody completes the set by reflex.
* **`#bar` must NOT add the horizontal insets itself.** It is inside the padded box, so it
  would inset twice. That is the mistake this wave made and caught mid-edit, so it is pinned
  by a test rather than left to be re-made.

`#bar` also gains `flex-wrap: wrap` with a row gap, because D15 adds a fourth control and a
narrow phone would otherwise push the game's name off the strip.

## D15: THE LOCK WAS A SIDE EFFECT AND IS NOW THE PLAYER'S CHOICE

W268 called `screen.orientation.lock` on the way into fullscreen and ignored its failure.
Right as a bonus, wrong as a feature: it was not the player's decision, it did not persist,
and there was no way to turn it off without leaving fullscreen.

There is now a `LOCK` button. `applyLock()` is the ONE place that touches the API, and the
test asserts that -- no other call site may reintroduce a bare `await`.

**THE WANT AND THE STATE ARE DIFFERENT THINGS, and that is the whole design.** Every engine
that has `screen.orientation.lock` requires fullscreen for it, so a persisted
`lockWanted = true` on a fresh load **cannot be applied yet**. So:

* the button paints from the WANT (`LOCKED` / `LOCK`), not from `screen.orientation.type` --
  a button painted from the platform would read "off" on load and silently lose the setting;
* the want is re-asserted on every `fullscreenchange`, because entering fullscreen is the
  moment it can finally take effect and LEAVING drops it on the engine's side;
* turning it on asks for fullscreen **from inside the same click**, since the gesture is what
  grants it and a later attempt is refused.

**The lock follows the PICTURE, not the device**: `mode === 'tate' ? 'portrait' :
'landscape'`. TATE is the native presentation, but a player who chose WIDE wants to stay
landscape -- so the `TATE`/`WIDE` toggle re-locks to the other orientation.

Where the API does not exist the button hides itself, feature-detected on the METHOD. The
test also re-asserts the page-wide rule that there is no UA sniffing anywhere in the module.

## FOUR W268 TESTS UPDATED, AND NONE OF THEM WEAKENED

D15 changed behaviour W268 had pinned, so four of its tests failed. Each claim still holds;
what changed is the method:

* *"GESTURE-driven and never automatic"* -- there are now TWO click handlers that may request
  fullscreen. The test strips both and still requires the remainder to hold no request, so
  the claim is if anything stronger.
* *"the label repaints from the PLATFORM event"* -- the same handler now also calls
  `applyLock()`. The regex was updated; `paintFull` and `fit` still come first, in order.
* *"the orientation lock can never reject unhandled"* -- the call moved into `applyLock`, so
  the test now checks that function's `try`/`catch` AND that no other site touches the API.
  That is a better check than the old one, which only looked at the FULL path.
* *"entering or leaving fullscreen re-fits the canvas"* -- same regex update.

Updating a test because behaviour deliberately changed is fine; updating one to make a
weaker claim is not, so each replacement is spelled out above.

## The parse check, and no skips

The one assertion in this wave that is not a string match is "does the page's only module
actually parse". `vm.SourceTextModule` needs `--experimental-vm-modules`, which the suite does
not pass, and a skipped test is a hole. It shells `node --check` over the extracted source
written as `.mjs` instead -- ESM parsing, no flag, no skip. Worth remembering as the way to
syntax-check an inline page module from a test.

## Docket status

    D1  W226   D2  W226   D3  W264/265/266   D4  W265/266/267
    D5  W230   D6  W234   D7  W271           D8  W272
    D9  W227/228/231      D10 W268           D12 W253/263
    D11 partly landed (W232); the execution engine remains
    D13 FIXED (W279)      D14 open -- PWA    D15 FIXED (W279)
    D16 open -- the hyper bar outside hyper
    D17 open -- the in-stage medals

## Order for the next wave

1. **D14, the PWA.** Manifest, icons, service worker, registration. It needs a change to
   `tools/build-dist.mjs`: `INCLUDE` copies `games/<g>/*.html`, `game.json`, `src` and
   `assets`, so a `manifest.webmanifest`, `sw.js` and icon files at the game's root would
   NOT be copied into `dist/`. **And `sw.js` must sit at `games/ddpdoj/` and not under
   `src/`**, because a worker's default scope is its own directory and one at
   `games/ddpdoj/src/sw.js` would not cover `games/ddpdoj/index.html`; widening it needs a
   `Service-Worker-Allowed` header we do not control. The caching caveat is the sharded
   deferred sprite sheet -- a naive precache pulls every shard, so the shell is cache-first
   and the shards stay network-first.
2. **D16, the hyper bar outside hyper.** Settle what `$81B63E` means first: `hud.js` calls it
   `hyperActiveP1` and it has 92 references in build B, so the name may be wrong and the word
   may mean "the gauge is armed". If it is the latter the port already draws the bar
   correctly and the gap is whatever maintains the word.
3. **D17, the in-stage medals** -- the gap is upstream of the tally, which is reachable.
4. Then back to the tally's own arithmetic: the eight bonus lines at `$25FF52`, whose table
   W279 already windowed (`$25FF52+$28`, far end pinned by `$25FF7A`'s own `lea`).
