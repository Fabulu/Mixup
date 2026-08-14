# Goal prompts that keep the agent working without looping

A `/goal` condition is evaluated by a model against the transcript. It has no idea what is
feasible in one session and no access to the repo. So a condition phrased as **completion of
unbounded work** ("finish everything") can never evaluate true, blocks every attempt to stop,
and the session ends in a loop.

Phrase the condition around **what the session must have done**, not around the project being
finished. The wording below drives the same continuous working behaviour and can actually clear.

---

## The one to use

```
Work continuously on the ddpdoj docket in my stated order (D33-D35, D37-D39, D36 LAST),
picking the cheapest verified progress each time. Follow the standing rules: at least 90% of
effort in playable product code, one focused smoke per meaningful change, drive every port
rather than only compiling it, never guess a value the cartridge does not define.

You may stop when ALL of these hold, and not before:
  1. the suite is green with zero skips and the gate exits 0,
  2. the tree is clean and everything is pushed,
  3. docs/NEXT_AGENT_HANDOFF.md names the next task and its measured size, and
  4. you have EITHER landed at least one verified unit of work this session
     OR hit something that genuinely needs my decision and said so plainly.

Do not stop merely because a subsystem is large. Do not claim work is finished when it is
mapped or measured. If you are running low on context, say so, finish the unit you are on,
update the handoff, and then stop -- that satisfies this goal.
```

---

## Why each clause is there

* **"in my stated order"** keeps the priority you set without restating the docket.
* **"cheapest verified progress"** stops the agent picking a 2 KB screen when a 60-byte routine
  is available, which is what actually produced landed work.
* **"drive every port"** is the rule that earned its keep: five defects this session passed
  every static check and every ROM assertion, and all five were caught by executing the code.
* **Clause 4's `OR`** is the escape hatch the looping goal lacked. A blocker you must decide on
  is a legitimate end state, not a failure.
* **The last paragraph** blocks the two failure modes in opposite directions: stopping early
  because something looks big, and declaring victory on recon.

## Variants

**Short session:**

```
Make one verified unit of progress on the ddpdoj docket, cheapest first. Stop when the suite is
green, everything is pushed, and the handoff names the next task with its measured size.
```

**Specific target:**

```
Port object-dispatch slot [14] ($288C6C) top-down, with a driving smoke, moving any census pins
it touches. Stop when it runs green and is pushed, or when you hit a dependency that needs a
decision from me.
```

**Open-ended but bounded by judgement:**

```
Keep working on ddpdoj until you would be guessing rather than reading. Then update the handoff
and stop, telling me what you would have guessed at.
```

## What not to write

* "finish everything" / "complete the docket" -- unbounded completion, loops forever.
* "keep working until I tell you to stop" -- only clears on an explicit stop from you, so it
  also loops if you walk away.
* Anything whose truth depends on work you know spans sessions.
