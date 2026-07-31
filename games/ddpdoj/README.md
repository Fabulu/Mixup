# DoDonPachi DaiOuJou — phase 3, preparatory only

**Status: no ROM, no code, no port.** This folder exists to answer one question ahead of
time, because answering it late would be expensive:

> **Can we build an oracle for this at all?**

Everything this project does rests on running the original binary as a reference and
diffing against it (`docs/knowledge/01-the-oracle-method.md`). Batman had PyBoy. Gradius
has Mesen. DaiOuJou would need MAME — and if MAME cannot give us execution hooks,
deterministic headless stepping and a readable framebuffer, then the method does not
apply and we would need to know that *before* committing to the game, not after.

## Why this one is different, and why it is the point

Batman taught **semantic reconstruction**. Gradius teaches **hardware-shaped time**.
DaiOuJou needs both, and it raises the stakes on the second one:

**Slowdown in a Cave shooter is a gameplay mechanic, not an artifact.** Dense bullet
patterns are survivable *because* the machine slows down; players time their movement
against it; scoring depends on it. A port with perfect logic and wrong slowdown is wrong
in precisely the way that matters most to the people who care about this game.

Read `docs/knowledge/06-lag-and-slowdown.md` before anything else here. The three
mechanisms it describes — dropped updates, partial completion, time dilation — are not
interchangeable, and **which one this hardware does decides the port's architecture**.

## ANSWERED — the oracle is viable, and both assumptions were wrong

**MAME 0.288 satisfies all three oracle criteria**, headless, unattended, on Windows, with
a working probe validated on a ROM we already own. `-video none` is a *documented* option
(no undocumented mode needed, unlike Mesen), two runs produced byte-identical output
including PNG bytes, and execution hooks work via `install_read_tap()` — an opcode fetch is
a read, so a read tap is an execution hook with CPU registers readable inside it.

**It is not Cave hardware.** DaiOuJou is an **IGS PolyGameMaster (PGM)** board —
68000 @ 20 MHz, Z80 @ 8.4672 MHz, IGS023 video — in `src/mame/igs/pgm.cpp`. The 1997
*DoDonPachi* is the Cave one. Reasoning carried over from "Cave board" needs re-checking.

**The refresh rate is 15625/264 = 59.185606060606… Hz**, a frame period of exactly
16.896 ms. Derived from the driver by two independent agents. The "about 54" estimate was
wrong by nearly five frames a second — which is exactly why it was never written down.

**Bullets are sprites**, and the sprite list is the first `0xa00` bytes of main RAM
(`0x800000-0x8009ff`), DMA'd to the IGS023 at vblank rising. **Hard cap 256 entries**,
10 bytes each, terminated early. That cap is a gameplay constraint and must be preserved —
see `docs/knowledge/06` on object scarcity.

**One fidelity caveat that must not be forgotten:** the IGS027A ARM7 protection ROM is
`NO_DUMP`. MAME simulates it in ~40 lines of C++ and **decrypts the 68k ROM in place**. The
protection does no game logic — good — but it means "the original binary" our oracle runs
is *a decrypted image plus a simulated device*. **Any hash this project pins must say
which.** That is a provenance question we have never had before.

See `NOTES-machine.md` for the full memory map, sprite format and set list.

## What we still do NOT know, and must not guess

This project's rule is that a number is not a fact until it is measured. Nothing below is
settled:

- **Whether the slowdown is deterministic.** If the same inputs produce the same slowdown
  on the same board, it can be verified frame-exactly. If not, the whole verification
  strategy changes.
- **Its granularity and mechanism**, per `06-lag-and-slowdown.md`.
- **Whether the game's own logic observes it.** If any counter or RNG advances per *loop
  iteration* rather than per frame, slowdown changes game *state* and not merely its pace
  — and that cannot be bolted on afterwards at any price. This is the single most important
  question in this folder.

## The ROM

**There is no ROM here and none is expected yet.** As with Batman and Gradius, nothing
ROM-derived will ever be committed, and the cartridge/board image is supplied by whoever
runs it. `.gitignore` already excludes `*.zip`-adjacent ROM forms for the other consoles;
add whatever MAME's set requires when the time comes.

The capability question can be answered **without** it — see below.

## How to prove the oracle without the ROM

MAME supports the Game Boy and the NES. We already have legal images for both from the
earlier phases. So MAME's Lua API can be validated end to end on a ROM we already own,
and that buys two things at once:

1. **Proof of capability** — execution hooks, memory access, headless determinism,
   framebuffer readback — on the same three criteria PyBoy and Mesen were judged by.
2. **A cross-check of Gradius.** Running the same NES ROM under both Mesen and MAME and
   getting the same per-frame state is far stronger evidence than either alone. Two
   independent emulators agreeing is a much better reference than one emulator asserted to
   be accurate.

Everything about the *driver* — the machine, the clocks, the memory map, the refresh rate
— is readable from MAME's source, which is public. That is a separate exercise from
running it and needs no ROM either.

## Where this sits

`games/ddpdoj/` per the multi-game layout. It is **not** in `games/index.json` and will
not be until there is something to boot.
