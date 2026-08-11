# W268: DOCKET D10 CLOSED

Status: DONE. Suite 1828/1828 (1821 + 7), stage-1 sweep 0 missing, both run before the
commit.

The owner reported "if the website is shown on mobile devices, if you orient it in
landscape mode, the browser bar takes up most screen real estate."

## Starting state

W267 committed at `9ce75ec`, suite 1821/1821, D4 closed.

## What was already right, and why it was not enough

The docket's own note said the page "wants a fullscreen request on first input plus
`viewport-fit=cover` and `100dvh`". Two of those three were already there:

    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    height: 100vh; height: 100dvh;

and there is a landscape letterbox rule that puts the pad beside the picture rather than
under it. `100dvh` FOLLOWS the URL bar, which is the only thing CSS can do here, and it
means nothing ever goes under the fold.

What it cannot do is get the bar off the screen. In landscape on a phone the bar is a large
fraction of a short viewport, so `dvh` correctly shrinks the picture instead -- and a
smaller picture is exactly what the owner saw and described as the bar taking the screen.

## Only the Fullscreen API removes chrome, and it needs a tap

So this is a **FULL** button in the bar, not an automatic call. "A fullscreen request on
first input" as the docket phrased it would work, but a button is better: it is reversible,
it is discoverable, and it does not surprise someone who tapped to shoot.

Three details, each pinned by `w268fullscreen.test.js`:

- **iPhone Safari has no `Element.requestFullscreen` at all.** There is no polyfill for
  that, so the button HIDES itself rather than offering something that cannot work. The
  detection is on the element (`document.documentElement.requestFullscreen ||
  ...webkitRequestFullscreen`) and never on a UA string; the test strips comments before
  checking that, because the prose deliberately names iPhone Safari and a naive grep would
  read the explanation as sniffing.
- **`screen.orientation.lock` throws on engines that have it but are not yet in
  fullscreen**, and an unguarded `await` surfaces as an unhandled rejection -- in the
  browser console, which on this page is where the PORT reports real defects. It gets its
  own `try` and its failure is ignored on purpose: locking is a bonus, not the feature.
- **the label repaints from `fullscreenchange`, not from the click.** The user can leave
  fullscreen with the system gesture or Escape, which does not click our button, so a
  click-painted label would go wrong. `paintFull` reads the current
  `document.fullscreenElement` rather than a local flag, and the test asserts there is no
  shadow copy to drift.

Both transitions call `fit()`, because `pickScale` chooses an INTEGER scale for the box it
was given and a page that did not re-fit would keep the scale it picked for the old one.

The button carries a `data-help`, so INFO's help list -- generated from
`#bar [data-help]` -- picks it up with no second edit.

## The test is source-text, and says so

`web-page.test.js` states the rule this file follows: the suite must run without a
cartridge and without a browser, so these assert the CONTRACT the fullscreen code keeps
rather than its rendered effect. What they cannot do is prove it looks right on a phone.
They can and do prove it is gesture-driven, that there is no request anywhere outside the
click handler, that the no-API path removes the button, that the repaint is
platform-driven, and that the orientation lock cannot reject unhandled.

## Docket status

    D1  fixed (W226)          D7  open -- hyper gauges
    D2  fixed (W226)          D8  open -- ship exhausts
    D3  fixed (W264/265/266)  D9  fixed (W227/228/231)
    D4  fixed (W265/266/267)  D10 FIXED (W268)
    D5  fixed (W230)          D11 partly fixed; the rest is the animation-object
    D6  fixed (W234)              execution engine, and $28C186 is a BGM command
                              D12 fixed (W253/263 handoffs)

Nine of twelve closed. `docs/DOCKET.md` rewritten for D3, D4 and D10 in this commit --
those three entries still described the state four waves ago, and D3/D4's entry still
carried the assumption that they shared a cause.

## Order for the next wave

1. **D7, the hyper gauges.** The gauge word does count (`$81B642` steps down by 2 per
   frame while hyper is up, verified headlessly in W226), so it is presentation. The
   handoff's route in is the remaining `$240DC2` call sites in `items.js`, each of which
   needs its own register-setup transcription.
2. Then D8, the ship's large exhausts: `src/shipsprite.js` against the ROM.
3. D11's remainder is the animation-object execution engine, whose way in is the node code
   pointers at `$24627A` rather than the chain root.
