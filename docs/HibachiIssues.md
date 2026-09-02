Conversation I had about the Hibachi stuff. There are some issues. The chatbot is not right about the tank. It's not temporary invulnerability. It's a normal tank, just bigger, and usually just gets hit with normal shots. Needs investigation.




Playable Hibachi is gonna be sick

Yeah. The direction is getting way cooler than “haha, boss as player.”

The important part is that it’s becoming mechanically coherent: authentic Hibachi gun routines, a real cycling system, ordinary vs hyper pattern banks, proper bullet ownership/damage, clean retirement, launch presentation, and replay/state versioning. That’s starting to look like a genuinely designed alternate character with its own playstyle rather than a novelty toggle.

And because it’s reusing the real Hibachi machinery, the appeal is exactly the right kind of ridiculous: you’re not cosplaying as Hibachi, you’re weaponizing the boss logic itself.

why did we only get 12 Hibachi patterns instead of 16+4? I thought that's how many there were

We did get the full 16 + 4. I described it badly when I said “12 guns.”

There are two different counts in the code:

12 unique native gun IDs: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, A, B
20 selectable attack-pattern descriptors: 16 ordinary + 4 hyper

The 16 ordinary patterns break down as:

4 main patterns: guns 0–3
7 shared patterns: guns 5–B
5 alternate patterns: alternate implementations of guns 0–4

That gives 4 + 7 + 5 = 16.

Then hyper mode has another 4 patterns, reusing gun machinery 5–8 but treating them as separate hyper-bank descriptors. So the cycling table really has descriptor IDs 0–19: ordinary 0–15, hyper 16–19.

Why reuse IDs? Because a gun ID is not the same thing as a complete pattern. A pattern descriptor contains:

which bank it belongs to: ordinary or hyper
its cartridge pattern number
its family: main, shared, or alternate
the underlying gun ID
its specific init and per-frame step routines

For example, ordinary gun 0 appears once as a main pattern and again as an alternate pattern, with entirely different init/step functions. Likewise guns 5–8 appear in ordinary and hyper banks. They share some underlying Hibachi machinery, but they are separate selectable attacks.

So the real headline is:

Playable Hibachi currently cycles through all 16 ordinary patterns, and hyper switches to a separate set of 4 hyper patterns. Twenty total. Twelve is merely the count of distinct native gun-number identities underneath them.

My earlier wording made it sound like five patterns had vanished. They haven’t.

I thought Hibachi had 4 guns/patterns only available in loop 2. I wanted those to be the hypers. It sounds like that failed. Should've been patterns 1-4 or so. Can you check that?

You were right. The current implementation hits the “16 + 4” count, but it does not implement the intended meaning of those four hypers.

The four current hyper descriptors are:

Hyper pattern 1 → gun 5
Hyper pattern 2 → gun 6
Hyper pattern 3 → gun 7
Hyper pattern 4 → gun 8

They are labelled patterns 1–4 in the UI/state, but their actual behaviour comes from the ordinary shared gun routines 5–8.

That is wrong for your stated design because hibachiguns.js explicitly says:

gun-table entries 0–4 differ between the first loop and the later loop;
entries 5–D are byte-for-byte identical between both loops.

So guns 5–8 are precisely not the loop-2-only attacks. The tests even lock in this duplication explicitly: ordinary pattern 9 and hyper pattern 1 are treated as separate selectable patterns despite both using gun 5.

What the hypers probably should be

The four obvious normal later-loop attack implementations present in the source are:

gun0Init2A738A / gun0Step2A7400
gun1Init2A7850 / gun1Step2A78D0
gun2Init2A7AB2 / gun2Step2A7B20
gun3Init2A7E64 / gun3Step2A7E96

Those are from the later-loop/main table, and immediately afterward the file moves into the separate first-loop/alternate gun family.

So the intended hyper mapping was almost certainly:

Hyper selection	Correct underlying family
Hyper 1	later-loop main gun 0
Hyper 2	later-loop main gun 1
Hyper 3	later-loop main gun 2
Hyper 4	later-loop main gun 3

There is a wrinkle: the two cartridge tables reportedly differ at entries 0–4, technically five slots. Yet the current port exposes only main guns 0–3 as the clear, ordinary later-loop quartet; there is no equivalent normal main gun 4 in the playable imports. The first-loop alternate gun 4 exists and is marked non-finite. My inference is that the fifth differing entry is special or not one of the four normal loop-2 patterns you had in mind.

Why this is more than a four-line swap

The ordinary bank currently includes the later-loop main guns 0–3 already. Then the hyper bank duplicates shared guns 5–8. At the same time, shared guns C and D are absent from the selectable catalogue. So it looks like the redesign arranged implementations until it reached 16 ordinary + 4 hyper, rather than deriving the partition from:

first-loop patterns,
shared patterns,
later-loop-exclusive patterns.

A faithful correction should:

Map Hyper 1–4 to later-loop main guns 0–3.
Remove those four from the ordinary bank so they remain genuinely hyper-only.
Re-audit the complete ordinary-pattern inventory, particularly omitted shared guns C and D and the unusual table entry 4.
Update the tests that currently celebrate ordinary/hyper duplicates.
Bump or migrate the Playable Hibachi state schema from v2, because descriptor identities are fingerprinted into replays/checkpoints.

So yes: the implementation currently failed your actual requirement. It produced four things called “hyper patterns 1–4,” but they are ordinary cross-loop patterns wearing hyper labels, not the four later-loop-only attacks.

No fix has been published

As of Wednesday, 2 September 2026, main is still at e2e89e9, committed on 1 September at 08:49 Zurich time. The commit is merely “ddpdoj: refresh source audit gates”: it changes audit/test bookkeeping and mentions Playable Hibachi’s native Button‑2 bomb/hyper route, but it does not change the pattern catalogue, hibachiguns.js, or the four hyper mappings.

There are also no open pull requests containing a pending correction. I found no public commit dated 2 September, and the obvious w597-hyper-assets branch is already merged and 94 commits behind main; it was about proving hyper artwork, not repairing the gun selection.

Verdict

It is still wrong publicly. The four hyper selections still amount to shared guns 5–8, rather than the four loop‑2 versions of guns 0–3.

Whatever was supposed to repair this either:

has not reached a commit,
exists only locally and has not been pushed, or
stopped without publishing.

The acceptance test for the eventual fix should be brutally explicit:

Hyper 1–4 dispatch loop‑2 gun variants 0–3, and none of those four variants remains selectable in the ordinary bank.

The current test that approves an ordinary pattern and a hyper pattern both resolving to gun 5 must be deleted or inverted.

news?
No new push — and there is one important correction

main is still e2e89e9, unchanged since 1 September 2026, 08:49 Zurich time. There is no newer commit, no open pull request, and no fresh work branch ahead of main. The newest named work branch, w621-cabinet-front-end, is already 61 commits behind it.

So the Hibachi hyper-gun selection is still not publicly corrected.

I missed something important previously: main is red

The latest GitHub Actions run for e2e89e9 failed. Three of the four jobs passed:

Batman tests passed.
DDPDOJ/Gradius asset-free tests and syntax checks passed.
TypeScript checking passed.

The failure is specifically the no-rom-data job, at “Refuse bulk ROM literals in game source.”

That guard scans all game src/ trees and rejects single-quoted hexadecimal blobs of 24 characters or more, because those resemble embedded ROM data that should have been exported rather than committed in source.

Verdict

The public state is currently:

wrong Hibachi mappings + no attempted correction + red repository-hygiene CI.

It does not look like a widespread executable regression—the actual public unit, syntax, and type checks passed. But the agent plainly did not leave the repository in a releasable, self-consistent state. It appears to have stopped after adding or exposing embedded ROM-like data, refreshing some audits around it, and never completing either the cleanup or your actual gun correction.

also found a specific bigger tank near end of stage 1 that's immune to Hibachi fire. Odd. probably tons of those in the game

Ah — I found the exact bastard. This particular tank is probably not a Hibachi bug.

It is almost certainly enemy Type $80, which the source describes as the second-largest Stage‑1 enemy after the midboss: a large body with two independently aiming turrets. It has an explicit shield timer at ($36,A5). While that timer remains active, its handler rewrites both HP records to 0x7FFF every frame, making accumulated damage impossible. When the timer finally underflows, both HP values drop to 0x1400, and only then does the tank become killable.

So it is not merely heavily armored. It has actual scripted entrance invulnerability:

damage happens → next handler update restores absurd HP → damage effectively disappears.

That applies to ordinary ships too, although their continuous stream and hit effects may make it less obvious. Hibachi’s bullets are stronger but individually discrete, so watching them seemingly accomplish nothing makes the immunity much more noticeable.

After the shield expires, Hibachi should work on it. Hibachi’s damage pass walks all 150 normal enemy subrecords, and Type $80 owns two adjacent subrecords. Its handler explicitly combines hit flags from both and reconciles their HP values, so the multipart construction is accounted for. Hibachi deals 0x0100 nominal damage per bullet; depending on the ordinary-shot reduction gate, that becomes either 0x100 or 0xC0. Against 0x1400 post-shield HP, that is about 20–27 actual bullet contacts.

The visual diagnostic is:

Bullet disappears or produces a hit response, but tank survives early on: intentional shield.
Bullet visibly passes through the hull: Hibachi’s zero-sized point collision missed the tank’s actual hit rectangles.
Once it has fully entered and fired for a while, ordinary shots kill it but Hibachi still cannot: genuine bug.

Your broader worry is still valid, though. Hibachi does not feed authentic bullets into the complete native player-shot collision machinery. It runs a separate adapter that reduces each bullet to a single point, tests that point against enemy rectangles, and applies an ordinary-shot-style receipt. That can diverge on multipart targets, gaps between visible art and hitboxes, indirect bullets whose ownership was not propagated, and enemies with unusual damage semantics. The repository already contains things like Type $47, where the standard +0x18 HP field is merely a per-frame damage sink and the real HP lives elsewhere.

So: this tank is very likely deliberately shielded, not evidence of dozens of immune enemies. But the observation still highlights that Playable Hibachi needs a full damage-receiver regression sweep rather than tests against only generic enemies. The tank should become a test with two phases: demonstrably immune while shielded, demonstrably damaged by Hibachi immediately after the shield drops.
