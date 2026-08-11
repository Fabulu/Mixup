# W282: the item producer, counted -- and 900 frames was the whole problem

Status: DONE. Suite 1970/1970 (1963 + 7), sweep 0 missing on both, run before the commit.

D16 and D17 both looked like missing draws. Neither is. This wave finishes the elimination
and hands over an instrument instead of an argument.

## Starting state

W281 committed and pushed at `60adca5`, suite 1963/1963.

## THE CHAIN, NOW SETTLED END TO END

    the DISPLAY     W281  COMPLETE. `$285D74` draws one icon per unit of `$81B6E0`
                          guarded by `$81B6E4`; measured at 1/2/3/5.
    the ALLOCATOR   W282  COMPLETE. All six kinds {0,4,8,$C,$10,$14} return a record
                          and mark a slot live, with ZERO counted notes.
    the PRODUCER    W282  fires, but rarely.

`spawnItem` was the last place a defect could have hidden, and it does not. Every kind
allocates, including `$C` -- the hyper stock, the one D16 needs -- and an unlisted kind throws
by address at `$27E86C` rather than quietly becoming a different item.

## AND THE ANSWER TO WHY EVERY PROBE SAW NOTHING IS EMBARRASSINGLY SIMPLE

    900 frames   from the laser-hold rung:  ZERO items
    5400 frames  from the same rung:        ONE item, kind $0, first live at frame 2576

**900 frames is too short to see a single item.** Every other gate in this repo runs 900 --
`w230descriptorsweep.mjs`, the trail gate, W281's own probes -- so every measurement that
went into D16 was taken in a window where the correct answer is zero. That one fact is why
the hyper display read as broken for two waves, and it is written into the instrument's header
so the next person pointing a 900-frame probe at an item question reads it first.

## WHAT IS AND IS NOT NOW KNOWN ABOUT D16

**Kind `$C` never spawns in 5400 frames.** So the hyper words being zero is, as far as this
window can tell, CORRECT: the display has nothing to show because the player has not been
given any hyper yet. That is a very different statement from "the bar is missing", which is
what the docket said.

What is NOT known is whether kind `$C` spawns later in the stage, and that is the open
question. It needs a run long enough to reach the parts of stage 1 that hand out hyper, which
this instrument can now do by argument rather than by editing a probe.

The lead worth following: **ONE item in ninety seconds is low.** `deathSeq85`'s own comment
records that the type-`$85` drop is GUARANTEED with no RNG in it -- "[M] no `$242B3C`,
`$242E24`, `$803916` or `$803917` appears anywhere in `$275AF2..$275B20`" -- so one drop means
exactly one type-`$85` death. The next question is not about items at all; it is how many
type-`$85` enemies the stage actually sends and whether they are reaching their death
sequence.

## THE INSTRUMENT

`tools/w282itemcensus.mjs`, on the same terms as `w230descriptorsweep.mjs`: boots the shipped
seed or a ladder rung, holds fire, and reports spawns by kind plus the four words every hyper
display reads.

    node games/ddpdoj/tools/w282itemcensus.mjs --lf 2000 --frames 5400

It counts **edges, not levels** -- live-this-frame-and-not-last -- because a single item that
sits on screen for 268 frames would otherwise read as 268 spawns. Asserted, because that is
the one bug an item census can have that makes its output look better than the truth.

It also prints the four hyper words next to the spawn count on purpose: zero words with a
non-zero spawn count would mean the COLLECT path is the gap, and zero in both means the
producer is. That distinction is the instrument's actual job.

## THE D5 PATTERN, USED DELIBERATELY

D5 was closed by delivering an instrument rather than a fix, and the same reasoning applies
here: "does the game emit X" had now been answered wrongly by reading code twice in two waves.
The test asserts the tool ships WITH its measurements recorded in its header, because a
baseline that lives only in a worklog is one refactor away from meaning nothing.

## Docket status

    D13 W279   D14 W280   D15 W279
    D16 the display and the allocator are both proven complete; the open question is
        narrowed to "does kind $C ever spawn in stage 1"
    D17 same producer, and it is now measurable
    D18 standing rule -- commit AND push every wave

## Order for the next wave

1. **How many type-`$85` enemies does stage 1 send, and do they reach `deathSeq85`?** That is
   the question one item in ninety seconds raises, and it is upstream of both D16 and D17. The
   spawn script is exported and stage 1 is closed at 339/339 records, so this is countable
   rather than speculative.
2. **Run the census long enough to answer the kind-`$C` question**, and if it never spawns in
   stage 1 at all, say so in the docket -- "correct for stage 1" is a legitimate and useful
   answer that stops the item being re-opened.
3. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`, whose table is windowed and
   whose dispatcher is read.
