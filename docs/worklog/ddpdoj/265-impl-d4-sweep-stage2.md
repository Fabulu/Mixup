# W265: DOCKET D4 diagnosed, and D3's other half

Status: DONE. Suite 1821/1821 (1814 + 7), stage-1 sweep still 0 missing, both run before
the commit.

The owner reported "level 2's mid boss is mostly invisible except for two little
turrets." W264's worklog said the way in was to run the descriptor sweep DURING stage 2
rather than assume it shared D3's cause. It does not share it, and the sweep says so.

## Starting state

W264 committed at `7435bf0`, suite 1814/1814.

## The sweep can reach stage 2 now

W230's instrument only ever ran the shipped seed, which never leaves stage 1 -- so it had
been answering a question about stage 1 and being read as an answer about the game. It now
takes a checkpoint rung and a frame count:

    node tools/w230descriptorsweep.mjs                       the shipped seed, 900 frames
    node tools/w230descriptorsweep.mjs --lf 19500 --frames 9000

The rung form boots from `tools/oracle/out/w69/stage1-sweep`, the same ladder
`w133stage2boot.test.js` uses, and lf19500 is past the stage-1 boss timeout. It also
reports WHICH STAGES it visited and stops cleanly on a throw, naming the frame and the
address -- a sweep that dies silently answers nothing.

## D4 IS AN ASSET-HARVEST GAP, NOT A PRODUCER GAP

    stage indices visited: 0 1
    NOT in the bundle: 129 accounting for 19791 draws

That is the opposite of D3. D3's explosion was missing because its PRODUCER never ran; the
stage-2 art is missing because the page cannot resolve descriptors the port really draws.
The clusters are recognisable runs rather than scattered one-offs:

    $1BCACC..$1BCCE8   sixteen frames of stride $24  -- kind 0's own animation (below)
    $1CA0B0..$1CA254   another uniform run
    $12D650            a FAMILY START `export-web.mjs` names as the bound of the
                       $12D430 family and does not harvest
    $13032C $13770C $137238 $33252C   large one-offs

`export-web.mjs`'s own header warns about exactly this: "a harvest sized off a RUN would
miss it." The harvest was sized off runs that stayed in stage 1. Sizing these eight
families by their strides is the next wave; every one needs its extent pinned by code or
by a stride the way the existing entries are, not by what this run happened to draw.

## D3's OTHER HALF, and the sweep is what caught it

W264 wired the screen clear's allocator. The stage-2 run then stopped at frame 5937 on
`$27FA30` -- pool-A kind 0's BODY, which the driver reached precisely because the
allocation now happens. So W264 had traded a silent missing explosion for a throw, and the
instrument found it in the same run that answered D4.

`$27FA30` is now ported. It is short and all one shape:

    andi.w #$1800,D1 / bne         bits 11 or 12 set and it does NOTHING at all
    subq.b #$1,$18(a6) / bcc       the old-zero borrow on the anim timer
    addi.l #$24,$A(a6)             and the sprite steps $24...
    cmpi.l #$1BCD0C / move.l       ...WRAPPING on an exact value, in the same pass
    tst.w $803912 / bne            paused: keep the cached velocity, do not recompute
    tst.w $8130D2 / bne            frozen: recompute, but do not ramp the speed
    addq.b #$1,$1A(a6)             so the speed ramps every unfrozen frame
    $20(a6) into $4 then $2        one step, short axis then long
    bmi                            a NEGATIVE long axis is the free
    cmpi.w #$3C,$817F7E / bcs      under $3C live it always draws
    1 & D7 vs $80390C / beq        at or over it, ALTERNATE walk positions draw

That last gate is the interesting one: **a busy pool halves its draw rate by parity on the
walk index rather than dropping records.** The test proves it by allocating a genuinely
full pool and showing the two parities partition it exactly, with nothing freed.

With the body in, the run goes 2,385 frames further (5937 -> 8322) and draws 257 more
distinct descriptors. Its own sixteen-frame animation is in the missing set above, so the
explosion now runs and will be VISIBLE once the harvest ships `$1BCACC + $24*16`.

## Three things the tests corrected

- **The wrap is one pass, not two.** `addi` / `cmpi` / `move.l` are consecutive, so the
  frame that steps ONTO `$1BCD0C` is the frame that replaces it. `$1BCD0C` is never a
  value the record holds.
- **`$23EBA0` is bucket 8**, record convention -- not bucket 0, which is what the sweep
  reads. Asserting the wrong counter made a working draw look absent.
- **The pool's count cannot be forced.** Setting `$817F7E` to `$3C` with one real record
  makes the driver's own count-vs-slots check fire, correctly. The busy case has to be
  built by allocating.

## Order for the next wave

1. Size the eight missing families for `export-web.mjs`, starting with `$1BCACC + $24*16`
   (already pinned: kind 0's own wrap constant sizes it) and `$12D650`, whose family the
   exporter already names. Then re-run both sweep forms; stage 1 must stay at 0.
2. The stage-2 run's next stop is `$286AAA`, a score-chain arm, unrelated to either docket
   item.
