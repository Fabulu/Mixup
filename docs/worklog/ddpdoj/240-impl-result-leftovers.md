# W240: the ring clear, and two more stale notes

Status: COMPLETE

## Scope

D11's remaining single calls. Family/stale check first, which is now the standing
first move of any wave.

## Starting state

W239 is committed at `046cc22`, suite 1655/1655.

## What the check found

- `$287ABE` and `$287AF0` are `bombStock287ABE(ram, rom, ctx, who)`, ported in W118.
- `$240EBC` is `txPrint240EBC`, ported in W116.
- `$246410` is `loadAnimObjects246410`, ported and used by four other modules.

So three of the seven leftovers were already available. Two of them were being
counted at a live site.

## Delivered

- **`$23C638` is not a "palette cue".** It is `lea $900000,A0 / move.w #$FFF,D0 /
  move.l #$0,(A0)+ / dbra` -- FOUR THOUSAND NINETY-SIX longword clears of the BG
  TILEMAP RING, which this port models. That is what takes the ground away on a
  stage clear, and the note had it as a palette call for four waves.
  `BgVram.clear23C638()` does it, and the caller counts what is NOT modelled by
  address: the ROM clears `$4000` bytes and this ring is the `$1000`-byte 64x16
  window, so the remainder is outside anything the port reads.
- The banner end's two bomb-stock sites (`$284CA0`/`$284CCC`), each with its row
  routine and its text, whose registers are the cartridge's own and differ only in
  the column (`$200` against `$1400`).

## Verification

`node --test games/ddpdoj/tests/w240ring-clear.test.js` -> 3/3.

The important one is live. From `rip/web/seed.bin`, sixty frames of play put
background in the ring, `$242952` is forced, and then the ring is **emptied on frame
67** and **rebuilt by frame 400** with real column writes. Both halves are asserted,
because a clear with no rebuild would be a permanently blank background and would
look like a fix while being a regression.

Full suite -> **1658/1658**. Sweep -> zero unresolvable descriptors.

## What is left of D11, and it is nearly nothing

- `$253794`, the option-pod teardown: a real routine, five gates on `$813098`,
  `$812934`, `$81293C` and `$8130BE` before its body. Next.
- `$28C186` (the exit handshake, whose body `$28BBAC` is the sound tier) and
  `$28D6FC` (DEV-2, the anim chain, which `chainLoader24652A` builds and
  `chainFree246800` frees).
- `$28D77C`: sixteen longwords into `$A00000+$5C0`, PALETTE RAM, which this port
  does not model at all. Not translation work until it does.
- The four `$25FD38` subsystem resets: W62's deliberate scope line, not a gap.

## The pattern, for the record

Eight stale premises found in this session's waves: `$240DC2` (W116), `$24150A`
(W91), `$2810CA` (W111), `$286ED6`/`$286F3E` (W118), `$287ABE`/`$287AF0` (W118),
`$240EBC` (W116), `$246410`, and `$23C638` mislabelled as a palette cue when it is
a tilemap clear. Plus seven "new" routines that were family members. Checking first
has never once been wasted.
