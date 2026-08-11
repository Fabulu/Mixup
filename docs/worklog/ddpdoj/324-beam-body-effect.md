# W324: the beam-body effect `$289F96`, D24's first piece

Status: suite **2334/2334**, green, no skips (2328 + 6). `dojcoverage.py` 81/256, both OK lines.

Docket **D24**: the owner reported "Hyper when it hits just cuts off, it's missing all the hit
sprites. Might be similar to laser." **The guess was right and it named the family.** This wave
takes the one member of that family the port had left as a counted note.

## THE FAMILY WAS THREE QUARTERS DONE AND NOBODY HAD SAID SO OUT LOUD

`src/laser.js`'s header carried this line for many waves:

    $289F96 $289FC0 $289FDA  -- the effect family, unported for W34 §1.6's reason.

W53 ported `$289F54`. W90 ported `$289FC0` and `$289FDA`. **Nothing updated that line, and
nothing joined "the owner cannot see the beam's hits" to "one head of the beam's effect family
is still a note".** The note itself was honest and precise -- `laser.js:705` named the address,
the reason and the fact that it fires on a divider inside a reachable handler -- it just never
got revisited once its stated reason expired.

`spark.js` even described the missing head exactly, inside the `unreached` of the routine next
to it: "`$289F96` -- the beam's SEGMENT producer, which shares this template -- is a THIRD head
and is unported: it allocates TWO records and picks its half from `($1A,A6)`". Everything needed
to do this wave had been written down. **The gap was between two files, not in either of them.**

## THE ROUTINE

    289f96  movem.l D0-D7/A0-A6,-(A7)
    289f9a  moveq #$1,D1              <- TWO RECORDS. The only head that does
    289f9c  lea ($28a506,PC),A2          the SAME template as $289FC0/$289FDA
    289fa2  moveq #$0,D0                 kind 0, the same fill tail
    289fa4  lea $81D394,A0            }
    289faa  moveq #$0,D7              }  P1's half...
    289fac  tst.w ($1a,A6) / bne      }  ...kept if ($1A,A6) is NON-ZERO
    289fb4  lea $81D790,A0            }
    289fba  moveq #$1,D7              }  P2's half otherwise
    289fbc  bra $28a060                  the same shared tail

`codexref` gives it exactly ONE caller: `$25485E`, inside `hBody` -- the segment handler the
port dispatches for **types 1, 6, 11, 16**, i.e. the same role across four of the five beam
families. That is why the symptom is a whole class of hit sprites rather than one sprite.

### D1 WAS A HARDCODED ZERO, AND THAT IS THE INTERESTING PART

`poolETail` had:

    let d1 = 0;                       // $289F60/$289FF8 moveq

Perfectly correct, and cited to two real `moveq` sites -- because all three callers that
existed set D1 to zero. `$289F9A moveq #$1,D1` is the fourth, and the shared tail's
`$28A086 subq.b #1,D1 / bcs` is what turns that 1 into a second pass of the allocation loop.
So D1 is the **extra-record counter**, and this head places two records where the others place
one. It is now a defaulted parameter, so the three existing callers read unchanged.

A constant that is right for every caller you have is not the same as a constant.

### AND THE PLAYER SENSE IS INVERTED, FOR THE THIRD TIME IN ONE SUBSYSTEM

`bne` on `($1A,A6)` KEEPS the pair already loaded, which is P1's. So **non-zero selects P1**.
Together with the two conventions W90 already documented:

    laser.js BEAM[].d7      1 for P1     the segment record's player word
    $289FC0/$289FDA D7      0 for P1     the pool half and the power word
    $289F96 ($1A,A6)        non-0 = P1   read from the record, not the entry point

Three conventions, one subsystem. This head needs its own exported function rather than a third
`BEAM_IMPACT` row precisely because the other two are addresses that each hard-code a half,
while this is one address that reads a field -- a row keyed on `at` would have had nothing to
key on.

## THE PART WORTH READING: THREE PINNED FRAME COUNTS MOVED, AND WHY THAT IS RIGHT

Wiring one `jsr` moved three tests. `W227` and `W228` had the death at frame **426**; it is now
**424**. `W231`'s reset was at 497 and its respawn init at 498; they are now 495 and 496.

The cause is not subtle once found: pool E's `fillSlot` draws the shared RNG at
`$28A204 jsr $242FFC`. A port that skipped the call also skipped its draws, so **every later
draw in the run came out one step early**. Running the call consumes what the board consumes and
everything downstream lands two frames sooner.

**These three scenarios are W226's HYPER scenario** -- they hold Button 1 with the hyper on,
which is exactly the case the owner described. So the newly-wired effect fires precisely where
the missing sprites were reported, which is the strongest evidence available here that this is
D24's mechanism and not merely an adjacent one.

**The new numbers are NOT board-verified and the tests now say so.** 424 is this port with the
draws; 426 was this port without them. Only an oracle trace of the death frame can say which
matches the machine. What IS established is that the board makes the call, so making it is the
more faithful of the two. An oracle check on that frame is worth a future wave and is recorded
in the test rather than left as a comfortable silence.

## A PROCESS MISTAKE, RECORDED BECAUSE IT COST A DEPLOY

The W323 publish **refused**, correctly, with `REFUSING TO PUBLISH: "ddpdoj unit tests" failed`
and the three failures above. It was launched in the background and then this wave kept editing
`spark.js` and `laser.js` in the same tree, so the publish ran the suite mid-edit and caught a
transient red state that was real at that instant.

**Do not background a publish and keep editing the same working tree.** The publish takes ~40
minutes and runs three games' suites and gates against the files as they are when it reaches
them, not as they were when it started. Either publish and wait, or finish the wave first. The
gate behaved exactly as designed; the error was entirely in the sequencing.

Build `20260811171409` (W320-era) therefore remains the live one, and W321..W324 have not been
deployed. Publishing them is the next action.

## What this does NOT close

D24 is not finished. This is its first piece and the arithmetic reason to believe in it, not a
confirmation. **The owner has to look at a hyper laser hit on a deployed build carrying this
wave and say whether the sprites are there**, because the port cannot see its own screen. The
second half of the report -- "the normal hyper bullets feel a bit off" -- is untouched and is
deliberately not bundled; the docket says to ask what "off" means rather than guess.

## Order for the next wave

1. **PUBLISH W321..W324**, then ask about D24. That is D27's cadence and this is exactly the
   case it is for: four waves landed, one visible fix among them, nothing deployed.
2. **D20/D23 together** -- the medal COUNT and the bigger medals. Both are "which kinds does
   pool A really emit", and kind 16 (`$40`, the flying variant) still throws `Unreached
   $280CEE` **after claiming a slot**, which would be both a missing medal and a leaked slot.
   Start there.
3. **D22** -- the medal pickup cue, independent of the above and cheap: find the site and post
   it the way the enemy death arms already do.
4. **D25** -- the transition length, with an oracle frame count rather than an opinion.
5. Then stage 5's `$1A` (now the biggest clean type at four records), `$81`, `$49`/`$4A`/`$4B`.
6. `$8130D8`'s rename, still owed since W320, now with four witnesses.
