# W22b IMPL - the deferred-queue DRAIN field-copy fix (review F1)

status: **DONE**
wave: 22b   role: implementer (DAIOUJOU)   started/finished: 2026-08-02
target of review: `22-review.md` finding **F1 (MODERATE)**, plus **F2 (MINOR)**.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER).  Every address is build B
(file offset == 68000 address in `tools/oracle/out/maincpu.bin`).

The spawn-walker review (commit `592667c`) APPROVED W22 with one MODERATE
defect: the deferred-queue drain `processDeferred` copies only 7 of the 16
fields the cartridge copies.  Latent today (the queue is unfed - 0 deferred
spawns in the port - because the handlers that enqueue are W25/W29), but it
will diverge the moment W25 ports a handler that enqueues a deferred spawn
with real state in `+$2A..+$4A`.  This wave fixes the drain byte-exact and
adds the field-fidelity test the review asked for.

Scope: `src/spawn.js` and `tests/spawn.test.js` only.

---

## 1. THE FIELD LIST - re-derived from maincpu.bin (capstone 5.0.7, m68k 000)

Disassembly of the drain `$263446` (A4 = queue slot, A0 = enemy record):

```
$263472  11 6C 00 02 00 02   move.b  $2(a4), $2(a0)        +$2   BYTE
$263478  21 6C 00 12 00 12   move.l  $12(a4), $12(a0)      +$12  LONG
$26347E  21 6C 00 16 00 16   move.l  $16(a4), $16(a0)      +$16  LONG
$263484  21 6C 00 1A 00 1A   move.l  $1a(a4), $1a(a0)      +$1A  LONG
$26348A  21 6C 00 1E 00 1E   move.l  $1e(a4), $1e(a0)      +$1E  LONG
$263490  21 6C 00 22 00 22   move.l  $22(a4), $22(a0)      +$22  LONG
$263496  21 6C 00 26 00 26   move.l  $26(a4), $26(a0)      +$26  LONG  <- port stopped here
$26349C  21 6C 00 2A 00 2A   move.l  $2a(a4), $2a(a0)      +$2A  LONG
$2634A2  21 6C 00 2E 00 2E   move.l  $2e(a4), $2e(a0)      +$2E  LONG
$2634A8  21 6C 00 32 00 32   move.l  $32(a4), $32(a0)      +$32  LONG
$2634AE  21 6C 00 36 00 36   move.l  $36(a4), $36(a0)      +$36  LONG
$2634B4  21 6C 00 3A 00 3A   move.l  $3a(a4), $3a(a0)      +$3A  LONG
$2634BA  21 6C 00 3E 00 3E   move.l  $3e(a4), $3e(a0)      +$3E  LONG
$2634C0  21 6C 00 42 00 42   move.l  $42(a4), $42(a0)      +$42  LONG
$2634C6  21 6C 00 46 00 46   move.l  $46(a4), $46(a0)      +$46  LONG
$2634CC  31 6C 00 4A 00 4A   move.w  $4a(a4), $4a(a0)      +$4A  WORD
$2634D2  33 C6 00 81 5E A8   move.w  d6, $815ea8.l         (the pop)
```

Confirmed: **1 byte + 14 longwords + 1 word = 16 fields.**  This matches the
reviewer's list exactly.  The prologue is unchanged (`$263446 move.w $815ea8,D6`
... `$263468 jsr $2636d6` allocEnemy ... `$26346E bcs $2634d2`).  The init call
is `$2634E4 bsr $2635f6`, AFTER the copy - so the copy runs to completion
before any init body throws (W23), which is what makes the field-fidelity test
possible.

## 2. THE FIX (src/spawn.js)

`processDeferred` now copies all sixteen fields, citing the ROM address of each
group:

```js
ram.setU8(r.addr + 0x02, ram.u8(a + 0x02));    // $263472 move.b ($2,A4),($2,A0)
for (const off of [0x12, 0x16, 0x1a, 0x1e, 0x22, 0x26,  // $263478..$263496
                   0x2a, 0x2e, 0x32, 0x36, 0x3a, 0x3e, 0x42, 0x46])  // $26349c..$2634c6
  ram.setU32(r.addr + off, ram.u32(a + off));
ram.setU16(r.addr + 0x4a, ram.u16(a + 0x4a));  // $2634cc move.w ($4a,A4),($4a,A0)
```

Two stale comments corrected in the same file: the `SPAWN` block (the drain
copies `+$2/+$12..+$46/+$4A`, not `+$12..+$26`) and the `25 entries` cap
(`$C80 / $50 = 40 entries`; code and test were already correct at 40).

## 3. THE TEST + RULE 4 (tests/spawn.test.js)

`processDeferred copies ALL 16 drain fields ($263472..$2634CC) -- the F1 gate`
enqueues a type-$11 spawn, writes a distinct value into every drain field on
the queue slot the way a W25 handler would, drains (catching the init+8 body
throw), and asserts each field reached the enemy record at `bandCommon`.

One faithful wrinkle: `+$3E` is a longword in the drain (`$2634BA`) but init's
`$26364C clr.w ($3e,A5)` (which runs after the copy, before the body throws)
zeros its top word, so only the low word at `+$40` survives - the test asserts
both the cleared top word and the surviving low word, documenting the real
hardware interaction rather than papering over it.

**RULE 4 - SEEN RED, RESTORED, SHA-VERIFIED both ways.**

| state of `processDeferred` drain | F1-gate test | `sha256 src/spawn.js` |
|---|---|---|
| broken (7 fields, loop `0x12..0x26`, no `+$4A` word) | **RED** at `+$2A`: `expected 707428464 actual 0` | (transient) |
| fixed (16 fields, this wave) | **GREEN** (all 16 fields) | `74b912dfd8e3ae7c86783b72570d623b03351f578b710df44a0db2bc809e34dc` |

The broken version reddens at the FIRST missing tail field (`+$2A`), not at a
field the old 7-field copy already covered - so the test specifically guards
the F1 truncation.  Restored to the fixed SHA above (byte-identical).

## 4. NO REGRESSION

- `node --test games/ddpdoj/tests/` = **335 pass, 0 fail, 0 skip** (was 334; +1
  the F1 gate).  The two real-tables tests ran (not skipped).
- `node games/ddpdoj/tools/w22spawngate.mjs` = **cursor 0/10742 divergent,
  spawn counter 339 = 339, terminus $231704** - unchanged from the review; the
  drain fix is on the field-copy path, not the cursor/spawn-counter path the
  gate measures (the queue is still unfed in the port).
- No file outside `src/spawn.js` and `tests/spawn.test.js` is touched in
  `src/` or `tests/`.

