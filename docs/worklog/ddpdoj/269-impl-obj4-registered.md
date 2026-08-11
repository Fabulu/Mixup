# W269: object dispatch [4] registered, and the replay fixtures unblocked

Status: DONE. Suite 1828/1828, sweep 0 missing, both run before the commit.

`$240F62[4] = $260B30` was **the single most-counted gap in the game**: 1800 notes over a
900-frame run, because it runs twice a frame. W243 translated it and tested it against the
cartridge, then left it unregistered for twenty-six waves. It is registered now, and
without rebuilding the artifact the hold-back said was required.

## Starting state

W268 committed at `7c89383`, suite 1828/1828, D10 closed.

    before:  1800 x $240F82 object dispatch entry [4] -- handler not ported in wave 4
    after:   (gone from the counted-gap list entirely)

## The hold-back was right about the cause and wrong about the only fix

`main.js` carried a precise note: the object reads its text list out of `$260D22`, a window
W243 added, and the `.replay` fixtures embed their OWN `player.tables.json` as
`seed.tablesB64`, frozen when the oracle recorded them. So registering the entry threw
`$260D2A` inside five replay gates "no matter what `rip/` or the web bundle now contain",
and the stated fix was to rebuild `tools/oracle/out/w69/fly-around` from the oracle.

I reproduced that first, exactly: registering it turned those gates red on `$260D2A`.

But the frozen tables are not all one kind of thing. Almost all of it SHOULD be frozen --
the speed quadrants, the folds, the shot templates are derived data and a recording is only
reproducible against the same derivation. **The `rom` window list is different in kind: it
does not say what the cartridge contains, it says which cartridge bytes this port lets
itself read.** Freezing that froze a PORT artifact alongside genuine game state, and that is
why a subsystem translated after a recording could never run inside one.

## `adoptCurrentWindows`, and it PROVES rather than asserts

`src/rom.js` gained one function. It substitutes the current window list into a fixture's
tables, but only after checking that **every byte the frozen list could serve resolves in
the current list to the same value**. If that holds the current list is a strict superset,
and the substitution cannot change any value the port computes -- it can only turn an
`Unreached` into a read of bytes the cartridge always had.

Both failure modes throw by address rather than being smoothed:

- an address the frozen list covers and the current one does not means a window was
  NARROWED since the recording, which is a real regression;
- a byte that differs means the CARTRIDGE behind the two exports differs, which is not a
  window-list problem at all and means the fixture is genuinely stale.

Neither fired: the current export is a byte-superset of the fixture's, and the 383 windows
now include the twenty-odd this session added.

It is wired in three places -- both fixture sites in `w132liveplay.test.js` and
`validateReplayObject` in `tools/replay.mjs`. The last one reads `rip/port/player.tables.json`
lazily and caches it, so every caller of `verifyReplay` benefits with no signature change,
and a tree with no cartridge extracted keeps the frozen behaviour instead of failing.

## What D7 turned out not to be

The handoff sent me at D7 (the hyper gauges) with "the remaining `$240DC2` call sites in
`items.js`" as the route. Following it:

- The two `$240DC2` sites left in `items.js` are `$2878CC` and `$28795C`, the `$8130BE`
  ITEM ICON ROW. Not the gauge.
- `hyper.js` has **no `note()` and no `unreached()` at all**, so there is no counted gap for
  a gauge draw anywhere in the hyper subsystem.
- All five references to `$81B642` are logic: `$285AEA` is the countdown and its expiry,
  `$25393C` and `$253976` are the clears, and the port has all of them.
- `$81B64A`'s `$2875xx` cluster looked like a painter and is the hyper ITEM SPAWNER
  (`jsr $27E912`, `allocHyper`), with a `$95F` cap.
- Object dispatch entry [11] is the other big per-frame gap; its handler `$25DBB4` reads
  `$813098` and `$813092` and is STAGE/LOOP progression, not the gauge.

So D7 is not reachable from any of the leads recorded for it, and a 900-frame stage-1 run
never gets hyper, so the sweep cannot see the draw either. The honest next step for D7 is a
scenario that HAS hyper up -- the oracle can record one -- and then reading the counted gaps
from that. Guessing at painters is what this repo has an instrument to avoid.

Rather than keep hunting, I took the largest measured gap instead, which is the same
discipline: the instrument names the work.

## The two censuses that moved

`top_objects` 7/20 -> 8/20 in `w167coverage.test.js`. That one line is the whole cost, and
it is the census doing its job: a registration that changed coverage without the number
moving would mean the tool was not counting it.

## Order for the next wave

1. **Object dispatch entry [11], `$25DBB4`** -- 900 notes a run, now the largest gap after
   the ISR family. It is stage/loop progression reading `$813098` and `$813092`, and it
   calls `$260ACA`/`$260A88`. Loop-related, which the end goal needs anyway.
2. D7 needs a hyper-up scenario before it can be diagnosed; treat the lead in the handoff as
   spent.
3. D8's exhausts: `src/shipsprite.js` against the ROM.
