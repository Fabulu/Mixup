Okay, I got some advice from bro, but first, you have to publish your stuff. Then, the gameover is broken, no letters of countdown and then a whitenoise screen. 
You have to test through game over with oracle. Shouldn't be hard. Turn on being able to be hurt and lose all your lives as you run into shots. EZ. 

Also, you have no attract screen, no selection of ships and pilots. I know you worked on all those, but all we got is the first HTML selection screen.
That stuff should go in game. I know we have it so what's keeping you from putting it in?

Now, the bro advice:

So, what's left for full game? We have loops... Oh, right, gameover is fuked and we have no actual diplaying start screen with attract and all. I know we have the code but it's not displaying at all. Write me a message I can put in an md in the repo. On next push they'll conflct and agent will read it. Tell thm what to do

The repo already contains the front-end sequencer, warning/credit text paths, and continue-panel routines; the missing proof is that the real cold-boot and Game Over lifecycle reaches the visible framebuffer end to end.

Paste this into something conspicuous such as OWNER-NEXT-PRIORITY.md:

# OWNER DIRECTIVE — FINISH THE ACTUAL BLACK LABEL GAME

**READ THIS BEFORE RESOLVING ANY CONFLICT INVOLVING THIS FILE.**

This is the current owner priority and overrides stale handoff instructions, wave plans, cleanup ideas, mods, formation work, and further route-proof work.

Do not delete this file as “stale” until the acceptance criteria below are green **and the result is published and confirmed live**.

---

## Why this is now the priority

W619 closes the complete Black Label gameplay-route matrix:

- all six authentic ship/style pairs;
- all five stages;
- both loops;
- endings and terminal reset.

That proves the playable campaign machinery. It does **not** prove that this is a complete arcade game.

Two owner-visible blockers remain:

1. **The real front end is not actually displaying.**  
   The repository contains the warning screen, credit line, high-score screens, attract sequencer, demos, title/front-end machinery, text routines, palettes, and screen dispatch code, but the browser does not visibly present the expected cabinet boot/attract cycle.

2. **The real Game Over lifecycle is broken.**  
   Losing the final life does not reliably produce the correct visible continue countdown, Game Over, high-score/name-entry handling, and return to attract mode.

“Code exists” is not completion. A dispatcher changing state in RAM is not completion. A unit test calling an isolated screen routine is not completion. A terminal-reset route witness is not completion.

**The player must see and use the complete cabinet lifecycle on the actual canvas.**

---

# Stop doing these until this closes

Do not spend the next waves on:

- more loop-route hashes or selector proofs;
- more formation hardening;
- new mods;
- playable Hibachi;
- White Label;
- causality dissertations;
- unrelated cleanup;
- documentation-only victory laps.

W619 has closed the gameplay-route question. The next frontier is the missing shell around the game.

A diagnosis-only commit is acceptable only if it adds a **failing end-to-end regression test that identifies the first broken boundary**. Do not merely write another report saying the routines already exist.

---

# Required work, in order

## 1. Reproduce the blank/bypassed front end end to end

Add an exact-production-bundle test that begins from the same state as a genuine fresh browser load.

Requirements:

- instantiate the real `Demo` / `Game`;
- do not directly call screen-arm functions as the final proof;
- do not apply an authentic gameplay selection early;
- do not jump to LF2000;
- do not seed a stage;
- supply idle cabinet input and allow the cartridge front end to advance naturally;
- run the real object driver, deferred TX path, display-list build, renderer, and presented framebuffer.

Instrument the complete path and locate the **first point at which expected visible output disappears**:

1. front-end boot/reset;
2. type-8 object staging and allocator commit;
3. `objSlot8` dispatch;
4. arm 13 warning-screen text production;
5. deferred TX queue;
6. IRQ/TX flush into `TxVram`;
7. sprite/display-list production where applicable;
8. renderer consumption;
9. final canvas/framebuffer presentation.

Do not assume the screen code is wrong. Determine whether the failure is:

- `Game.boot()` entering at the wrong point;
- the omitted `$23BEEA..$23BF73` reset prologue leaving required state uninitialised;
- type 8 being staged but never committed or dispatched;
- the web bootstrap applying selection or starting gameplay too early;
- deferred text being written but never flushed;
- valid `TxVram` being ignored by the renderer;
- the one-frame presentation hold hiding or discarding front-end output;
- palette/video-register state never reaching the browser renderer;
- reset clearing the frame immediately after it is produced;
- or some other measured boundary.

Relevant existing pieces include, but are not limited to:

- `src/frontend.js`
  - `bootFrontEnd23BF74`
  - the deliberately omitted `$23BEEA..$23BF73` reset prologue
- `src/objslot8.js`
  - the front-end/attract sequencer
  - the expected cycle `13 -> 2 -> 12 -> 9 -> 1 -> 5 -> 2 ...`
- `src/fronttext.js`
  - `$259FF8` warning-screen text
  - `$23CFDE` credit/free-play line
- `src/hiscorescreen.js`
- `src/objslot9.js`
- `src/objslot12.js`
- `src/objslot13.js`
- `src/objslot15.js`
- `src/objslot17.js`
- `src/main.js`
- `src/web/app.js`
- deferred TX flushing, `TxVram`, palette state, display-list production, and the final renderer

Do not replace these with an HTML imitation.

`start.html` is a host-side launcher. It is **not** DaiOuJou’s title screen, warning screen, high-score screen, or attract mode.

---

## 2. Make the authentic front-end cycle visibly run

From a fresh load with no input, the actual game canvas must visibly traverse the cartridge-owned front end.

At minimum prove:

- the initial warning/front-end screen is visibly drawn;
- the credit or free-play line is visibly drawn;
- the subsequent high-score/title/attract screens are visibly distinct;
- the attract demos visibly run gameplay;
- each demo returns to the front-end cycle;
- the cycle continues for multiple laps without a reload;
- coin input visibly changes the credit state;
- START with a valid credit reaches the authentic selection/gameplay path;
- START without a credit does not silently bypass the gate.

The final regression must validate presentation, not merely control state.

Use deterministic framebuffer hashes, exact TX/palette/display-list snapshots, or another strong visual oracle at named landmarks. A test that only says “arm 13 ran” is insufficient.

Where browser behavior is ambiguous, collect a MAME witness for ordering, durations, RAM state, TX contents, and visible frames. Do not invent timing or screen order.

---

## 3. Reproduce Game Over from a natural final-life death

Create a separate exact-bundle end-to-end test that begins in genuine gameplay and kills P1 naturally until no reserve life remains.

Do not directly set the continue-screen dispatcher state as the final proof.

The test must follow the real chain:

**player hit → death animation → life debit → no remaining life → gameplay handoff → continue machinery → continue or Game Over → high-score/name-entry decision → front end**

Record the first point where the current browser diverges.

Inspect the existing machinery rather than rewriting it:

- player death and life debit;
- `objslot13.js`;
- `continuescreen.js`;
- credit ownership and START edges;
- score qualification;
- `hiscore.js`;
- `hiscorename.js`;
- `hiscorescreen.js`;
- object-table reset and front-end restaging;
- TX/display-list/framebuffer presentation.

The continue panel code existing in isolation does not settle whether the real last-life path creates it, feeds it the right state, displays it, accepts a credit, times out correctly, and returns to attract mode.

---

## 4. Close both Game Over branches

### Continue accepted

Prove visibly and through state that:

- the continue prompt/countdown appears;
- inserting a credit updates the correct pool;
- pressing START during the allowed interval accepts the continue;
- P1 is restored through the authentic path;
- lives, bombs, hyper, rank, score, stage state, and player actor state follow cartridge behavior;
- gameplay resumes rather than starting an unrelated fresh run;
- stale death/continue/front-end objects are retired.

### Continue rejected or expired

Prove visibly and through state that:

- the countdown advances at the authentic cadence;
- timeout reaches the real Game Over path;
- Game Over is visibly presented;
- score qualification is evaluated;
- qualifying scores enter the real name-entry screen;
- non-qualifying scores skip it correctly;
- name entry completes or times out correctly;
- the high-score table is updated correctly;
- the game returns to the normal visible attract cycle;
- a new credit and START can begin another game without reloading the page.

Also preserve the already-working ending route:

**ending → name entry where applicable → reset → visible attract mode**

Do not use a host reload as the reset mechanism.

Close one-player behavior first. Add at least one regression ensuring genuine P2/co-op state has not been broken, but do not let co-op scope defer the basic one-player cabinet lifecycle.

---

# Required test quality

Final gates must:

- use the exact production bundle;
- use the real `Game`/`Demo` integration path;
- begin from cold boot or a natural gameplay state appropriate to the test;
- drive real cabinet input edges;
- run the real object scheduler;
- include the real deferred text and renderer paths;
- verify visible output;
- verify important RAM/object topology;
- reject unknown fixture fields;
- fail loudly on missing required assets;
- report an asset absence as **skip, not pass**, where repository convention requires it.

Add landmark evidence for at least:

1. warning/front-end frame;
2. high-score/title frame;
3. attract-demo gameplay frame;
4. credit-line update;
5. selection/gameplay handoff;
6. continue prompt;
7. late continue-countdown frame;
8. visible Game Over;
9. name entry or high-score screen;
10. return to attract.

A “nonblank framebuffer” assertion alone is too weak. Pin which screen is being shown through state plus deterministic visual evidence.

---

# Non-solutions

The following do not satisfy this directive:

- drawing replacement text with HTML or canvas overlays;
- adding a host-side “GAME OVER” message;
- forcing a direct reload;
- jumping directly to selection/gameplay on page load;
- directly invoking screen functions and calling that integration;
- asserting only that TX RAM changed;
- asserting only that a screen object was allocated;
- proving only that the state machine eventually resets;
- adding another route witness;
- explaining that all the required routines have already been ported.

The point is to connect the existing authentic machinery all the way to what the player sees.

---

# Definition of done

Black Label is “the full game” only when this entire loop works on the actual browser canvas:

**cold boot  
→ warning/title/high-score/attract cycle  
→ coin/free-play display  
→ START  
→ authentic selection  
→ gameplay  
→ death and continue  
→ continue or Game Over  
→ score/name entry  
→ high-score/attract  
→ another playable run**

And separately:

**complete ending  
→ ending presentation  
→ score/name entry  
→ visible attract cycle**

This must run without manual RAM intervention, checkpoint injection, direct state forcing, or browser reload.

---

# Publish requirement

Completion on `main` is not completion for the owner.

After the gates are green:

1. regenerate exported web assets if any ROM windows or exported tables changed;
2. run the full publication gate;
3. deploy the build;
4. record the build ID and commit;
5. verify the live URL, not merely local source;
6. manually confirm cold boot, attract display, START, final-life Game Over, and return to attract.
7. also publish the asset-free one

Do not mark this directive complete until the owner can load the hosted page and visibly experience the entire cabinet lifecycle.
