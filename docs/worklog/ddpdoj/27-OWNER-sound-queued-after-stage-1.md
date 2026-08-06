# OWNER DECISION - DaiOuJou SOUND is queued for the END of stage 1

owner, 2026-08-04. Binding on whoever picks up the queue.

> "I think DoJ sound should be queued at the end of stage one. So run 5 recons
> and a fable architect for it after stage 1 finishes and then run waves for it.
> No, make it 10 recons. 5 on the code base, 5 on the web. I want all the info
> we can get for it."

## THE TRIGGER

**Not now.** Sound starts when DaiOuJou stage 1 is COMPLETE - the capture ledger
empty, `capture.bin` deleted, the stage playable start to finish from ported
code. Until then it stays out of the queue entirely.

## THE SHAPE OF THE ROUND

**TEN recons, then a FABLE architect, then implementation waves.**

- **5 recons on the CODE BASE.** The ROM, the disassembly, our own port. What
  the sound driver is, where its tables live, how the game addresses it, what
  RAM it touches, what the ICS2115 register interface looks like from the 68000
  side, how cues are triggered and by whom.
- **5 recons on the WEB.** Hardware documentation for the ICS2115 (the WaveFront
  synth on the PGM board), the PGM sound subsystem generally, and any existing
  public analysis. The owner supplied the starting reference:
  the ICS2115 is a wavetable part, not a handful of programmable channels.
- **Then a FABLE architect** to consolidate all ten into one plan.
- **Then waves**, per the standing loop: implement, then review + QA + tests.

The owner's instruction on scale is explicit - "I want all the info we can get
for it." This is deliberately more recon than any previous round on either
game, because the subsystem is less like anything already ported than any other
remaining work.

## WHY THIS IS BIGGER THAN IT SOUNDS

The owner's earlier framing, which is the reason for ten recons rather than the
usual five:

> "The sound side is no longer comparable to reproducing a handful of Game Boy
> sound channels."

Batman's audio was a small number of DMG channels driven by a table - fully
transcribable. The PGM's ICS2115 is a wavetable synthesiser with sample memory,
per-voice envelopes and its own command interface. The port's existing sound
work (`games/ddpdoj/NOTES-sound.md`) is a starting point, not a foundation.

Treat the recon output as the INVENTORY (`docs/knowledge/09`): enumerate what
exists statically before deciding what can be ported. Do not let a plan get
written from measurement of a few cues.

## WHAT THIS DOES NOT CHANGE

Sound is NOT a prerequisite for a complete stage 1, and stage 1 must not wait
for it. Lag remains separately unscheduled and remains, per the owner, the
hardest problem on this project.
