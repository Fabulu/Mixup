# Game Boy hardware facts we had to learn - and the NES question each implies

These are DMG specifics, so they do **not** transfer to the NES directly. What transfers
is the *category*: every one of these is a place where the hardware, not the game code,
decided what appeared on screen, and every one cost us real work. Expect an NES
counterpart for each. **Measure it; do not assume it.**

Each section ends with the question to answer for Gradius before writing renderer code.

---

## Sprite-per-scanline limits, and what happens past them

The DMG draws at most **10 sprites per scanline**. The OAM scan keeps the first ten whose
Y covers the line, **in OAM order**, and drops the rest for that line. The drop set moves
as the game rotates its OAM queue, and that rotation **is** the flicker you see in the
original.

This is not an edge case. One of our levels puts 21 sprites on a line; eleven of them are
dropped by hardware every frame.

> **NES:** the limit is 8 per scanline, and exceeding it sets a status flag games
> deliberately use. Does Gradius rely on it? What is its drop behaviour, and does the game
> rotate OAM to distribute the flicker?

## Sprite-to-sprite priority is not the same rule as the per-line cut

We got this wrong and it cost 14 wrong pixels that took a full investigation to explain.
On the DMG:

- the **per-line selection** is by OAM index (the scan fills ten slots in order);
- the **priority among the survivors** is by **smallest X first**, ties broken by lower
  OAM index.

Two different rules on two different axes. Implementing priority as "lowest OAM index
wins" put a HUD bar over an enemy that the hardware draws in front. And sorting the whole
queue by X before taking ten per line breaks the crowded case badly - the split matters.

> **NES:** priority is by OAM index only, with no X rule, plus a background-priority bit
> per sprite. Confirm this against the hardware rather than inheriting our DMG logic.

## An OAM coordinate is a BYTE

The hardware adds a sprite's offset into an **8-bit** shadow-OAM byte. A record whose
coordinate runs past 255 **wraps**; it does not sail on the way a JavaScript number does.

A banner in one level comes out of the table at OAM Y = 257, which the hardware stores as
**1** - one row of each letter along the very top edge. We kept 257, decided it was
off-screen, and dropped four sprites. A sweep found 63, 135 and 15 out-of-range entries on
three different levels.

**The general lesson is wider than sprites:** anywhere the original does 8-bit arithmetic
into an 8-bit destination, your language's wider integers are a bug waiting to happen.
Wrap explicitly at every such boundary, and write a check that asserts the range.

> **NES:** OAM is 4 bytes per sprite, 64 sprites, Y and X both single bytes. Same trap,
> same shape.

## Mid-frame register writes are a rendering feature, not a glitch

The DMG's STAT interrupt lets a game change scroll and palette registers *between
scanlines*. Our port models this as a per-scanline band list, and its correctness is
checked by comparing **335,664 scanlines** of register values against the hardware.

Without modelling it, a parallax sky is simply absent, and no whole-frame screenshot
comparison will tell you why.

> **NES:** the equivalents are sprite-0 hit and mapper scanline IRQs (MMC3). Find out
> which Gradius uses and build the per-scanline comparison *before* the renderer, not
> after.

## Free-running counters, and why their boot phase is load-bearing

Two hardware-ticked counters never reset. Game logic gates on them with masks like
`& 7` and `& 1`, so their **phase** at gameplay start is part of correct behaviour. The
boot path lands every level at the same measured values. We seeded ours at zero, which put
every `& 7` cadence five frames out - invisible for 27 scenarios, because nothing that was
being compared consumed the raw phase until one specific gravity rule did.

> **NES:** find the equivalent free-running counters and **measure their value at the
> first gameplay frame** rather than starting from zero.

## Lag frames drop work

When the main loop does not finish before the interrupt, the hardware sets a flag and the
actor and enemy drivers **skip that iteration's updates**. Your port will never lag, so
everything downstream runs one step ahead from then on.

See `02-traps.md` § 6: bound it and tag it, do not chase it.

## Palette shadows are written in VBlank, and screens inherit them

Palette registers are written from RAM shadows during VBlank. Two consequences bit us:

- A level's init blanks the background palette so an intro plays over black, and a later
  routine restores it. Port the *restore* without the *seed* and there is nothing to
  restore from.
- A fade leaves the shadows at zero. If the next screen's entry path does not rewrite
  them, that screen runs **perfectly and invisibly**. This produced a reported "softlock"
  where the game was fully playable and every pixel was one shade.

> **NES:** palette RAM is written through PPU ports during VBlank. Same class of trap:
> find every path that changes palettes and check what restores them.

## Partial initialisation, and screens that inherit the last one's state

A sound-engine init does not clear the whole track block, so a song can start with the
previous song's frequency word still loaded - and one song's first event is a rest that
retriggers *without* writing a pitch, so it audibly plays whatever was there before.

Two songs "diverged at tick 0" for months purely because our port started from zeroes and
the hardware did not.

**General rule:** when something is wrong from its very first frame, ask what the
*previous* screen left in memory. Snapshot the real machine's state at the transition and
seed from it.

## A cue that plays the wrong sound is invisible to memory comparison

A sound-request routine takes the id in one register and a mask in another. Swap them and
a cue still plays, nothing crashes, and no memory comparison flags it - the game just
makes the wrong noise. Caught only because a person said the pickup chime sounded off.

**Build a cue-stream comparison** - every sound request the game makes, with id, mask and
the routine that asked - early. It is cheap and it catches a class nothing else does.
