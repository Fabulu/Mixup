**What this changes**

**ROM sites**
<!-- The addresses this is a translation of. Every non-obvious line should
     carry one in a comment too. -->

**What you measured**
<!-- Not what you believe the code does -- what you observed, with values.
     "I hooked $1B34 and it fires on frame 1 with $FF80 = 2" beats any
     amount of reasoning about the listing. -->

**Verification**
- [ ] `npm test` passes
- [ ] `npm run test-all` run locally — which stages, and what they said:
- [ ] any new check was validated by reverting the fix and watching it FAIL
- [ ] nothing ROM-derived is committed

<!-- That third box is the one that matters most. Two checks in this
     project's history sat green through the bug they were written for. -->
