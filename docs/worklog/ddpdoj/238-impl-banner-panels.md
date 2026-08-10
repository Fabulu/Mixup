# W238: the stage-clear banner's panel

Status: COMPLETE

## Scope

W237 found that the sixty `$240DC2` calls per stage transition come from
`panel2851D2`, whose body the port did not translate: it noted three draws and
stepped two counters. That is the banner's lives, stock and bomb-row TEXT -- the
thing the owner sees, or rather does not, on a stage clear.

## Starting state

W237 is committed at `de18599`, suite 1646/1646.

## Every dependency was already available

- `$240DC2` is `txPrint240DC2` (W116).
- `$286ED6` and `$286F3E` are both `hyperStock286ED6(ram, rom, ctx, who)` (W118).
- `$23FA96` and `$23FAC4` are `enqueueRegisters` on BUCKET 25 -- `$80A6E4` /
  `$80AFE6`, the same `asr.l #6`, `andi.l #$7FF03FF`, `ori.l #$80008000` body. The
  only difference between the two is that `$23FAC4` pushes and pops A0 and D0,
  which is why the caller uses it inside a `dbra D0` loop and `$23FA96` outside
  one. In this port that distinction has no effect, so both are one call behind two
  named wrappers.

That is the sixth and seventh family member this session.

## Delivered

`panel2851D2` in full, as `panelBlock` run twice over a config. `$285206..$2852EA`
is P1 and `$2852EA..$2853C0` is P2, and they are mirror images:

- the LIVES word (`$8130BE`/`$8130C0`), `subq.w #1` then clamped to five, with a
  negative word skipping the block and zero falling past the loop with `$FFFF`;
- the icon loop, `dbra`, whose column steps `+$200` on P1 and `-$200` on P2, with
  the art a longword out of the side's own table at a stride of TWO;
- the hyper STOCK icon through `$23FA96`, only while that side's hyper is not up;
- bit 7 of `$81B61F` gating the REST of the block -- the `bpl` jumps past the
  stock-icon call as well as the text, which the first draft got wrong;
- the bomb row's text, `dbra`, stepping `+$100` on P1 and `-$100` on P2, skipped
  on a negative count but WITHOUT skipping the stock call after it;
- each side calling its own `$286ED6` / `$286F3E`.

Two ROM windows, and both extents abut windows the port already had rather than
resting on a run length: `$2881D2+$20` is four 8-byte tables (whose longword reads
at a stride of two deliberately overlap) ending exactly at W113's `$2881F2`, and
`$2883CE+$18` is six stock icons ending at `$2883E6`.

## Verification

`node --test games/ddpdoj/tests/w238banner-panel.test.js` -> 5/5: both tables
ending at the existing windows; one icon per life with the cap at six; zero and
negative lives words drawing nothing; the bomb row printing and bit 7 gating it;
and P2 stepping its column the opposite way from P1.

Full suite -> **1651/1651**. Sweep -> zero unresolvable descriptors.

Forcing `$242952` headlessly, the counted-gap list loses its three biggest lines:
`60 x $240DC2`, `59 x $286F3E` and the `48 x` pair of bucket-25 emitters. What is
left during a transition is all single calls.

## Debt created, and it is small

`d1Swap`/`d1AddLo` now exist in three files (`stageend.js`, `bee.js`, `hud.js`).
A FOURTH copy should move them into `ram.js` instead; the comment in `hud.js` says
so at the definition.

## What is left of D11

Single calls only: `$23C638` (result-screen palette cue), `$246410` (the
animation-object loader off `$28D7FE`), `$28D77C` (sixteen longwords into palette
RAM, which this port does not model at all), `$28C186` (the result-screen exit
handshake), `$28D6FC`, `$253794` (the option-pod teardown), `$240EBC` and
`$287ABE`, plus the four `$25FD38` subsystem resets. The panel's twin
`panel284FD2` -- the BOSS banner -- is still noted, and it will fall out of the
same shape: `hud.js` keeps the two apart on purpose, so expect a second
transcription rather than a parameter.
