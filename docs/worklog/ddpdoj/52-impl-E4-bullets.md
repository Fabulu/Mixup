# 52 — IMPL E4: the player's shots and the enemy bullets, VISIBLE

status: IN PROGRESS
started: 2026-08-05
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.
brief: the owner is playing the live build — "Shooting enemies with bullets
works, but you can't see the bullets and no explosions." The explosions are E5.
**Mine is that nothing draws the shot itself, or the enemy bullet.**
inputs read in full: 43-plan §4 E4, 40-recon, 44-impl-E1, 47-impl-E2,
50-recon-effects, 51-impl-L3, HANDOVER, `docs/knowledge/09` and `10`,
`26-review.md` F1–F4.

`[M]` = measured by me, this session, on this tree.

---

## 0. THE BRIEF'S PREMISE — TWO OF ITS THREE NUMBERS ARE WRONG, BOTH LOW

The brief's *shape* is exactly right: the shots and the bullets go down the same
emission path, nothing draws them, and E2's harvest-by-address + shard machinery
is the answer. Its **sizes** are a floor, and one of them by a factor of seven.

### 0.1 "bucket 14, nine streams, 2,184 bytes raw" — [M] it is **71 streams**

Recon 40 §5 measured the shots under `--no-pods` with a tap every four frames,
on a tree where any fire press threw `$24C180`. W45 and L3 removed that throw,
so **the OPTION PODS now fire too** — and they are a second shot producer
(`$24D480`, `src/options.js podShotSpawn`), writing type-`$8002` records into the
same 36-slot table `$810572`, dispatch entry [2] `$253E34`.

```
[M] 1,200 logic frames from the shipped seed, fire tapped every 4 frames:
      bucket 14 = 21,691 records, max 20 per frame   (recon 40: max 10)
      20 DISTINCT streams live in $810572, and ZERO of them are in the sheet
      -- and 11 of the 20 are in NEITHER of recon 40's nine
[M] the same run with fire HELD: 360 bucket-14 records, max 12 -- holding the
      button charges the beam and the ordinary cadence nearly stops
[M] nothing pressed: 0
```

**[M] ENUMERATED FROM THE CARTRIDGE, following the chain `src/shots.js` and
`src/options.js` walk: 71 distinct shot streams, 10.5 KiB gz.** Not nine, and
not 2,184 bytes. The chain, with what pins each end:

| producer | pointer table | entries harvested | why that many |
|---|---|---|---|
| ship primary | `$2554EA[0]` → `$255532` | 5 | `$249C48` indexes by ($20,A6)\*2, and ($20,A6) is the power 0,2,4,6,8 |
| ship secondary | `$255502[0]` → `$255546` | 5 | `$249C92`, same index |
| pod 0 | `$24D2FC[0]` → `$24D30C` | 5 | `$24D4F8`, same index |
| pod 1 | `$24D35C[0]` → `$24D36C` | 5 | `$24D4FC`, same index |

and per 38-byte template three chains, each with its own extent:

* the SPAWN's own descriptor — `$24A238 move.l (A2,D0.w),(A0)+` / `$24D548`,
  D0 = the player's ($42,A6) or the pod's ($52/$54,A6), which cycle **8,4,0** →
  3 longs;
* the per-frame animation — ($1e,A6) indexed by ($24,A6), which counts DOWN by
  4 and reloads to 4 on borrow (`$253BC6`), so **0..(what the spawn installed)**:
  {0,4} for the ship, {0,4,8} for the pods;
* the HIT re-point — `$253C76`'s `$24DEB2[tableIdx]` (nibble 0/8) or
  `$253F34`'s `$25014C[tableIdx]` (nibble 2/10). The block's
  `move.l (A0)+,$22(A6)` is a LONG whose **LOW word is the index the hit
  animation starts at**, counting down to 0: [M] 16 for the ship, 28 for the pods.

**[M] All 20 measured streams are inside the 71.** Measurement proves presence;
the enumeration bounds absence.

**DELIBERATELY NOT HARVESTED, named rather than omitted:** the `+4` LASER arm of
all four tables (`$25556E`, `$255582`, `$24D334`, `$24D394`). [M] Their templates
carry type words `$8004` / `$8006` = shot dispatch entries [4] and [6], and
`src/shots.js` throws `$254078` for [4] and has no [6] at all. Harvesting art for
a handler that does not exist is E2's `$268594` all over again.

### 0.2 "the impact pool `$27F95A` is E4's" — [M] IT IS NOT, AND IT IS NOT MINE

Recon 50 assigns me `$27F95A` because "its callers are the bullet block's". [M]
The callers are `$281D2E` (the screen clear) and `$281E3A` (the mover's
global-kill), so the *reference* is right. **The conclusion is not**, for the
reason L3 §3.1 already wrote down and this wave re-checked:

* `$27F8F8` is the ALLOCATOR over the impact pool `$8171BE` (70 × `$2C`);
* its only DRIVER is `$27F95A`, type-5 call #4, unported;
* allocating without the driver consumes all 70 slots and then fails silently
  forever — W33's leak one level down, which is recon 50's own warning.

**This wave allocates from NO pool.** It writes into records that already exist
(`$809C4C`/`$809274`, the two staging buffers the board's own bulk writer
`$281D9A` writes) and calls no allocator. `$27F8F8` stays the counted note L3
made it. Porting `$27F95A` is E5/E7's, with its driver, or not at all.

### 0.3 What the brief is right about

* the shots and the bullets are the SAME path — buckets 14, 22 and 23 of the
  same thirty, drained by the same call #4, into the same `$800000` list;
* the art is the real cost — [M] 276 new streams, 21.3 KiB gz, against ~40 lines
  of sink;
* E2's machinery is the answer and it needed no new mechanism.

---

## 1. THE BULLETS: [M] BUCKETS 22 AND 23 ARE EMPTY, MEASURED

```
[M] 1,200 frames, nothing pressed:  bucket 22 = 0,  bucket 23 = 0
[M] 1,200 frames, fire tapped:      bucket 22 = 0,  bucket 23 = 0
[M] and the pool is BUSY the whole time: 14,172 live bullet record-frames with
    nothing pressed, 68 distinct descriptors, first at lf+40 = +0.7 s
```

`src/mover.js spriteEmit` opens `if (!ctx.sprites) return;` and
`src/bulletdriver.js` passes no sink, so the board's own bulk writer runs and
writes both counters from cursors that never moved.

**[M] ENUMERATED FROM THE CARTRIDGE AND FROM THE PORT'S OWN TRANSCRIPTION (every
line of which cites its ROM address): 213 distinct bullet streams, 205 of them
absent, 10.8 KiB gz.** Six sources, each with its extent:

| source | entries | what pins it |
|---|---:|---|
| `$281956[k]` → template +6 | 39 | the 39 kinds; `bullets.js` proves both ends |
| `$283D4C` muzzle table +4 | 32 | `$2820D0 andi.w #$F8` → d0 ≤ $F8, idx = d0\*3/2 |
| `setU32(base+$0a, imm)` immediates | 31 | the transcription's own ROM immediates |
| `animateRenderOffsWrap` runs | 20 runs | each is (base0, step, limit) from the listing |
| `$283C4C` dir tables `$282714`/`$2830EA` | 9 offsets each | `((dir+4)>>2)&$3E` → 32 slots, 9 distinct |
| `$2822EC` dir rings `$2821FA`/`$282C8E` | 9 × 4 | `(dir+4)&$F8`, then ($16,A6) = $C,8,4,0 |
| `$283704` | 6 | `$2836EE` steps $14,$10,$C,8,4,0 |

**[M] Every one of the 213 is a valid stream start in the mask ROM's own chain**
(`streamExtent` throws otherwise) — which is the check that says the extents are
right rather than plausible.

### 1.1 **`26-review` F2 IS NOT LATENT. IT IS VISIBLE IN A MEASUREMENT.** [M]

F2 says kind 19's continuation steps `base+$A` by `+$24` with no wrap, where
`$282B7A cmpi.l #$1c1e38,(A6) / bne / move.l #$1c1bf8,(A6)` wraps.

**[M] The measured descriptor set contains `$1c1e5c`, `$1c1e80` and `$1c1ea4`,
which are PAST `$1c1e38` and are in NO enumerated source.** They are the port
running off the end of the animation, exactly as the review predicted — three
addresses of proof that the defect is real and not a reading. Fixed in this wave.

---

## LOG (appended as findings arrive)

- opened.
- §0.1 [M]: **the brief's "nine streams / 2,184 bytes" is a floor.** 20 streams
  measured, **71 enumerated from the cartridge, 10.5 KiB gz** — and the reason
  is that L3 unblocked the OPTION PODS, a second shot producer recon 40's
  `--no-pods` intervention had deleted.
- §0.2 [M]: **the brief's `$27F95A` assignment is refused, with L3's reason.**
  Its allocator without its driver is W33's leak one level down. This wave
  allocates from no pool.
- §1 [M]: buckets 22 and 23 measured EMPTY over 1,200 frames both with and
  without fire, while 14,172 live bullet record-frames went past. **213 bullet
  streams enumerated, 205 absent, 10.8 KiB gz**, all 213 valid stream starts.
- §1.1 [M]: **`26-review` F2 is observable** — three descriptors past the wrap.
