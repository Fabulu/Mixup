# Delegation policy

Use `gpt-5.6-luna` for basic, mechanical, well-bounded subagent work, including file discovery, straightforward audits, housekeeping, routine test triage, and simple documentation or code edits.

Do not force Luna for complex research, architecture, difficult debugging, or fidelity-critical ROM translation. Use the inherited or otherwise appropriate stronger model for those tasks.

Model overrides require a bounded context fork. Every spawn brief must include all local context needed to complete the task.

# Ultimate project objective

Complete the full DoDonPachi DaiOuJou Black Label Version-B game as a readable JavaScript translation verified against the ROM, including all stages, bosses, loops, systems, presentation, sound, and authentic timing and slowdown.

Individual queues and waves are milestones, not the finish line. After each one, the orchestrator continues recon -> architect -> implement -> verify -> publish until the full game is complete.

# Worklog numbering policy

Historical filenames are immutable. Numeric gaps and killed-wave numbers are never reused. Before spawning or starting a new wave, enumerate live `docs/worklog/<game>` filenames matching `^digits-`, choose max+1, then atomically reserve that number by creating the fixed path `<N>-RESERVED.md` with an `apply_patch` Add File operation. The Add File operation must fail if the fixed reservation already exists. All contenders for N must use the exact same RESERVED basename. If creation fails, rescan and try the new max+1. Immediately rename the reservation to the real worklog and open it with `IN PROGRESS` before task work. If killed before rename, retain `RESERVED` as `ABANDONED` so the number remains spent.
