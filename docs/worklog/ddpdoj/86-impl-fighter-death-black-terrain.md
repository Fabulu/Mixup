# 86 -- IMPL: the fighter can die, and the black terrain gets its pictures

status: **IN PROGRESS**

started: 2026-08-06. wave: 86. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree. Anything from another
document is `[cited]` and named.

inputs read in full: `68-diag-invisible-collidables.md`,
`75-diag-laser-hold-run.md`, `81-impl-fighter-mech-art.md`,
`85-impl-boss-bucket-trace.md`, `83-NOTE-censored-census-and-the-sim-server.md`,
`39-OWNER-visible-play-before-sound.md`.

---

## 0. THE PREMISE, CHECKED FIRST -- and the SECOND item is a QUARTER of what
##    the brief describes

The brief told me to doubt three things. Two survive and one does not, and the
one that does not makes item 2 much smaller than it was sized.

| the brief says | `[M]` verdict |
|---|---|
| "`$274AF0` is the only thing standing between `$82` and death" | **TRUE.** `[M]` `tools/oracle/w27disasm.py 274AF0 274B70` is twenty-two instructions with no branch, and every callee it has is already ported: `$28615E` is `src/score.js scoreKill`, `$289004` is `src/effects.js spawnEffect`, `$263762` is `src/initbody.js freeEnemy`. The only outward call with no port is `$28C274`, and that is ONE SOUND REQUEST (§1.1) |
| "`$8B` and the black terrain are one object" | **TRUE, and unchanged.** `[cited: W75 §3.4]`; nothing I measured moves it |
| "`$232578` is the only missing bucket 2/3 element" | **FALSE both ways, and this is the correction.** `[M]` The port's ENTIRE NO-ART list over 6,500 steps is **ELEVEN distinct streams**, of which **FIVE** are background elements -- `$231520 $231C44 $232578 $232EAC $233630` -- and they are 7,027 of the 8,452 no-art records. **W68's "bucket 3 has 42" is CLOSED**: not one `$151xxx`, `$1723xx`, `$1725xx`, `$1727xx` or `$17Dxxx` address appears any more. W58, W66, W81 and W84 shipped them between them and nobody re-measured |

`[M]` The whole NO ART census, `.scratch/w86/noart.mjs`, 6,500 steps from the
shipped seed over the SHIPPED bundle with all 17 sprite shards fetched, fire
tapped every 4 and the ship sweeping, `$810424` poked so the run reaches lf8,500
(`docs/knowledge/09`: a poked run gives STATES):

```
[M] steps 6500  lf 2000..8500  records 497,562  drawn 489,110  NO ART 8,452
[M] $231C44 x1568  first step 3627   ** background element 8  **
[M] $232578 x1568  first step 4299   ** background element 9  **   <- W75's $8B
[M] $231520 x1504  first step 3755   ** background element 7  **
[M] $232EAC x1376  first step 4747   ** background element 10 **
[M] $233630 x1011  first step 5275   ** background element 11 **
[M] $07E8AC x 534  first step 5834      type $24's literal, $29709E
[M] $0022A8 x 276  first step   92
[M] $0022F0 x 276  first step  276
[M] $0650A8 x 138  first step   91
[M] $0650D0 x 138  first step  275
[M] $000000 x  63  first step  634      the known over-read, webgate's own
```

**Five of the eleven are 83.1 % of every no-art record, and all five are
background-element handlers 7..11.** They are also the biggest records on the
screen (`[cited: W55 §2.2]`, the 18x208 class), which is why they are the black
half of the playfield and `$07E8AC` is not.

### 0.1 AND WHY THE FIVE WERE MISSING -- a MEASURED FLOOR, again

`[M]` `tools/export-web.mjs` `STRUCTURE_STREAMS` is eighteen addresses, and
eight of them are background-element data pointers: `$22CBCC $22DA70 $22DED4
$22E508 $22F184 $22FE98 $23061C $233F34` -- handlers **0, 1, 2, 3, 4, 5, 6 and
12** of `src/background.js`'s thirteen. **Handlers 7, 8, 9, 10 and 11 are the
five missing streams, in order.** The block's own header says so out loud:

> *"they are reached from BACKGROUND-ELEMENT IMMEDIATES (`$2623A6..$262760`) and
> from tables no ported handler indexes, so there is no table for this file to
> walk to an extent ... THIS LIST IS A MEASURED FLOOR AND IT IS SAID SO HERE"*

`$2623A6` is constructor 0's immediate field and `$262760` is constructor 12's.
**The extent was named in the comment and the list was still taken off a
3,000-frame run**, which reaches handlers 0..6 and 12 and not 7..11 -- because
`[M]` those five first draw at steps 3,627..5,275, and the run stopped at 3,000.
That is `46-diag`'s tank hulls and W81 §1.3's `$272D7A` for the third time.

---

## 1. ITEM 1 -- `$274AF0`, AND THE FIGHTER DIES

### 1.1 What it is

`[M]` `python tools/oracle/w27disasm.py 274AF0 274B70`:

```
[M] 274AF0  moveq #$42,D0 / jsr $28615E     the KILL SCORE
[M] 274AF8  jsr $28C274                     a SOUND cue
[M] 274AFE  moveq #$D,D0 / jsr $289004      explosion 1, then six fields
[M] 274B2A  move.w #$8,D0 / jsr $289004     explosion 2, then eight
[M] 274B64  jmp $263762                     free the record
```

`[M]` `$28C274` is `movem / move.w #$1,D0 / #$9E,D1 / #$1E,D2 / jsr $28C0AE` --
one request into the sound driver, which `39-OWNER` puts LAST. It stays a
counted note, exactly as `$275BA0` does in `deathSeq85`, and `noteEffect` is the
same helper.

`[M]` **D1 reaches `$274AF2` intact.** `$2747EE..$2747F4` builds the hit mask in
D1 and the only call between it and the death arm is `$27481C jsr $286096`,
whose body works in D2 and A0 (`$286096 btst / $28609E btst / $2860A8 move.w
$811F72,D2`). So `scoreKill(..., 0x42, d1)` takes the same `d1` `deathSeq85`
takes, and that is why that function already had the parameter.

`[M]` Both effect kinds are `<= $21`, so neither goes to `$289004`'s bit bucket
for being out of range, and `src/effects.js` drives both off the cartridge's own
34-entry script tables. **There is no per-kind code to write.**

### 1.2 The result, before and after

`[M]` `.scratch/w86/deaths.mjs`, 6,500 steps, measured by swapping
`src/handlers.js` for `git show HEAD:` and back -- same bundle, same input:

| | BEFORE (HEAD) | AFTER |
|---|---:|---:|
| `$274AF0` counted notes | **53, over 12 distinct records** | **0** |
| kills scored at value `$42` | **0** | **12** |
| kills, all types | 282 | **294** |
| score | 4,364 | **5,156** |
| effects allocated at `$274B00`/`$274B2E` | **none** | **12 + 12** |

**The 53-over-12 shape is the defect itself**: the same twelve fighters
re-entered the death arm on every later hit because none of them ever died.
W68 `[cited]` measured 213 notes in 7,000 frames of a different input and drew
the same conclusion.

### 1.3 The tests, and every one seen to fail

`games/ddpdoj/tests/w86death.test.js`, six tests.

```
[M] src/handlers.js at HEAD                        W86/1..5 RED, /6 GREEN
[M] MUTATION setU8(e2 + B.speed, 0x680)            W86/4 RED ALONE
[M] MUTATION setU16(e2 + B.f1c, 0x40)              W86/4 RED ALONE
[M] MUTATION e1 pos from ($2,A5)                   W86/3 RED ALONE
[M] MUTATION scoreKill(..., 0x25, d1)              W86/2 RED ALONE
[M] MUTATION first allocation kind $08, not $0D    W86/3 and /5 RED
```

**W86/6 staying green at HEAD is the point of it.** It is the control: a change
that freed the fighter on every hit would satisfy W86/1 and redden /6.

Two of the assertions deliberately refuse to read their subject through the
constant they are testing:

* **bucket `$10` is never compared with `$10`.** It is resolved through
  `EMIT_STUB`, `$288FF0`'s own five entries, and asserted to be `$23D852` --
  bucket 7, the layer type `$82` itself draws into.
* **"the fighter explodes" is not "two slots were allocated."** Both kinds are
  resolved in the cartridge's own `$221520` script table and each must name a
  descriptor list inside `$221740..$222617` whose first entry is a real stream.
  An explosion with an empty script is an invisible death.

And the fixture carries a DECOY at `($2,A5)` different from `($2,A6)`, because
W30 found exactly that swap eight instructions above this arm and a fixture
seeded with one value cannot see it.

---

## 2. ITEM 2 -- THE FIVE BACKGROUND ELEMENTS

(in progress)

---

## LOG (appended as findings arrived)

- opened. Read 68, 75, 81, 85, 83, 39. Disassembled `$274AF0..$274B64`,
  `$275B20..$275BA6`, `$2747C6..$274860`, `$286096`, `$28615E`, `$289004`,
  `$28C274`, `$26224A` and `$2623A4`/`$2625D8` before writing a line.
- `[M]` §0: **the brief's third doubt is refused.** The port's whole NO ART list
  over 6,500 steps is ELEVEN streams; W68's forty-two bucket-3 addresses are all
  gone. Five background elements are 83.1 % of what is left.
- `[M]` §0.1: **and the exporter's own comment names the extent it did not
  use.** `STRUCTURE_STREAMS` holds eight of the thirteen element immediates;
  the five it lacks are handlers 7..11, which no 3,000-frame run reaches.
- `[M]` §1.2: **twelve fighters now die** where HEAD logged 53 death-arm notes
  over the same twelve records and killed none of them.
