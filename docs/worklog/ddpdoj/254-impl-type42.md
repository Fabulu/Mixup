# W254: type $42's init body, the Stage-4 boss's children

Status: DONE. Suite 1732/1732 (1725 + 7), run before the commit.

`$2A3952`, the init body of type `$42`, the enemy A1 9 spawns in formations. Step 1 of
[worklog 253](253-recon-type42.md)'s order; the handler's role-`$FF` path is step 2 and
is next.

## Starting state

W253 committed at `0007d19`, suite 1725/1725.

## What it does

`$2A394A` is a two-instruction runLen stub (`move.w #$4,$4(a5) / rts`), so the body is
8 bytes past the type table's init pointer -- the same `+8` rule type `$41` already uses,
which is why the port's BODY registry keys it at `$2A3952`.

The body loads a five-entry prototype, copies the position the spawner queued, and then
does three things that matter downstream:

- **`$21(a5)` -> `$3C(a6)`, the ROLE.** A1 9 writes `$FF` as a constant, so every child
  of a F5 formation is role `$FF`. Roles 0..7 and `$70`/`$71` come only from A1 11.
- **`$1A(a5)` sign-extended into `$26`, `$38` and `$48(a6)`, with `$6C(a6)` set from its
  sign.** A1 9's lists carry `$0E` and `$F2`, so this is where +14 and -14 become two
  directions. The same word lands in all three fields; extending only one would diverge
  later without diverging here, so the test asserts all three.
- **the launch vector.** `$241D34` (`MoveTables.shotVector`, already ported -- the
  twentieth positive availability check) with the speed byte and the angle, each half
  scaled by 8, added to THE PARENT's own `$22`/`$24` pair, and the long axis alone loses
  `$2000`. That relative positioning is what keeps a formation attached to the pod that
  launched it.

`$8D(a6)` is raised for angles `$10 $65 $BB $F0 $45 $9B`, which are six of the nine in
A1 9's two CLUSTERED formations and none of the eight in its two rings. So the flag says
which kind of formation a child belongs to, and the test asserts that correspondence
rather than the constant list.

## The detail the test found

`$2A3A12 move.w #$2000,$20(a5)` is a WORD, so its low half lands on `$21(a5)` -- the role
byte. The role survives only because `$2A3974` copied it into `$3C(A6)` twelve
instructions earlier. I had asserted the record still held `$FF` and it holds `$00`, and
the reason is the ROM clobbering a field it no longer needs. Reordering those two
instructions in a port would lose the role silently, so the assertion now pins the
clobber instead of the survival.

This also confirmed the drain copies the field at all: `$263478`'s fourteen longwords
include `+$1E`, which spans `$1E..$21`.

## The window

New: `$2A394A + $1AC`, stub through prototype as ONE window, the way type `$41`'s
`$2A37DC + $16C` already is. Three things have to be readable and only the last is
obvious:

- `$2A394C`, the runLen IMMEDIATE. `initDispatch` recovers it with `rom.u16(init + 2)`,
  so the stub is DATA even though it is code. My first attempt windowed only the
  prototype and the port threw on `$2A394C` at the first spawn, which is the mechanism
  working exactly as intended.
- `$2A3952`, the body, whose own `lea $2A3A6A` is why the prototype is reachable.
- `$2A3A6A`, the prototype: five LONG-form entries of 28 bytes, ending at `$2A3AF6`, the
  handler's own first instruction, with zero bytes between them.

`export-web.mjs` re-run afterwards.

## Also this wave

`initbody.test.js`'s body census went 69 -> 70 with `$2A3952` named. That file is CRLF in
the repo; the edit preserved it and the diff is four lines, no churn. (It cost two
attempts: a multi-line match against `\n` fails on a CRLF file, which is the mirror of
the trap the handoff already records about WRITING CRLF.)

## What is left

    type $42's handler $2A3AF6, roughly 2 KB, of which only the role-$FF path is
    reachable until A4 id6 ($2A11D4) is ported

Landmarks, all confirmed present in the port: `$2A3D5A` the parent-counter increment A1 9
waits on, `$286096` DAMAGE, `$289004` the fire-gen, `$263762` the free. Globals
`$8130E4`/`$8130E5` are written under a role test and nothing else in the port touches
them; whether the `$FF` path reaches them is the first thing to settle.

## Order for the next wave

1. Walk `$2A3AF6` with `$3C(a6) = $FF` only, and `unreached()` by role on 0..7 and
   `$70`/`$71` with the A1 11 / A4 id6 reason named.
2. Then close the loop end to end: F5 arm 6 starts A1 9, A1 9 spawns a formation, the
   children die into `$19E(a6)`, A1 9 retires, and arm 7 hands the cycle back to bit 2.
