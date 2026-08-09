# 166: bee collection to chain-earned hyper feed

Status: DONE. Opened and closed 2026-08-09.

Wave: 166. Role: premise audit, ROM verification, and the smallest authentic
adapter port. Target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). All ROM
addresses below are build B.

This wave does not change bee or medal art, carrier damage, bee score, bomb
behavior, replay, tooltips, sound, or Gradius. The medal is still the bee. The
carrier and revealed bee still share authentic art. Only the laser head can
damage the hidden carrier, as W148 proved.

## Premise result

The original defect report remains true at HEAD `c848f6a`, despite W163.

W163 ported the complete `$287682/$287722` hyper grant pipeline. It did not
connect the bee caller. `src/bee.js` still replaced both collect-arm feeds with
notes:

- P1 `$27FBA2..$27FBEA`, which writes `$81B64A` and calls `$287682`;
- P2 `$27FB1C..$27FB68`, which writes `$81B64C` and calls `$287722`.

Therefore a collected bee scored correctly but contributed zero chain-earned
hyper progress in the JavaScript port. W163 made the callee safe to call; it
did not make this premise false.

## ROM boundary and complete caller sequence

`tools/oracle/w166bee.py` reads the decrypted VERSION-B image directly. It
pins the type `$8A` drop at `$2767DE..$2767EC`, the bee body's P1/P2 touch
dispatch, both mirrored collect entries, the complete gauge arms, and the
grantor caller inventories.

The authentic path is:

1. `$2767DE..$2767E6` passes the carrier's kind and layer to `$27F92A`.
2. Pool A's body reads P1 bit 12 or P2 bit 11 and enters the mirrored collect
   arm.
3. The arm loads chain meter and packed-BCD hit count. In 2P mode only, both
   arms replace them from `$81B60C/$81B610`; `$242AC6` converts the latter from
   binary to packed BCD.
4. Active hyper, zero meter, zero hits, and negative hits skip the feed.
5. Hits clamp at packed-BCD `$0200`.
6. `$242AF6` converts packed BCD to binary. The following binary loop adds
   `$48` for each complete group of 20 hits.
7. P1 adds the result to `$81B64A` and calls `$287682`; P2 adds it to
   `$81B64C` and calls `$287722`.
8. The saved registers restore the pre-clamp chain values, and the existing
   `$27FBEE` bee score path runs unchanged.

The checker reads through `$242AF6`'s actual RTS at `$242B1E` and through the
complete BCD-power table at `$242B20..$242B3B`. It also reads past the bee
routine's apparent end into the score/popup ladders, waypoint data, and the
next body at `$27FE0E`. No fall-through or inseparable callee remains inside
this boundary.

The direct grantor inventories remain exactly W163's six P1 and six P2 edges.
The bee sites are `$27FBE4` and `$27FB5E` respectively.

## Implementation

`src/bee.js` now transcribes only the refused caller adapter:

- authentic hyper/meter/hit gates;
- packed-BCD `$0200` clamp;
- BCD-to-binary hit conversion;
- binary groups-of-20 gain;
- mirrored `$81B64A/$81B64C` add;
- mirrored `grantHyper287682` call;
- the formerly noted shared 2P adjustment.

The implementation composes W163's existing grant, item collection,
activation, pending, duration, and rank-power machinery. It does not clone or
extend that lifecycle. The kind-16 flying arm remains the pre-existing named
refusal and is unrelated to this defect.

## Dynamic validation

### VERSION-B oracle

W159's controlled MAME capture is still present at
`.scratch/w159-oracle/w159-chain.tsv`. It is reproducible with:

```
python games/ddpdoj/tools/oracle/w159chain.py capture 5800
python games/ddpdoj/tools/oracle/w166bee.py --verify-mame
```

The only W159 gauge intervention occurs later at logic frame 4800. The natural
bee evidence predates it:

```
lf4344  gauge-write@27FBDE:81B64A=A3F
        gauge0-grant@2876A0:81B64A=0
        item_c_live=1, stock=0

lf4724  stock+@2530CA:81B65C=1
        hyper-gauge=95f@2530D0:81B642=95F
```

`w166bee.py --verify-mame` reparsed that 5,800-frame capture and passed these
exact assertions. This is the authentic board sequence: a natural bee collect
feeds earn, crosses the grant threshold, produces the kind-C item, and the item
then loads stock and gauge.

W148 separately proves the preceding hidden-carrier condition. Its controlled
board run placed a live type `$8A` carrier inside the laser head's box and
observed authentic damage followed by three bee allocations. Holding laser is
not a negative test because the head lives only about 21 of 8,000 frames;
tapping relays the head.

### Current JavaScript port

`tests/w166bee.test.js` starts with the authentic carrier-drop allocator shape,
sets the collision handshake's player touch bit, and dynamically proves:

- P1 packed-BCD 20 adds `$48`, crosses `$095F`, spawns kind `$0C`, collects it,
  activates it, and increments rank power at `$285A62`;
- packed-BCD 100 means five groups, not binary 256;
- packed-BCD 201 clamps to 200;
- P2 uses `$81B64C/$287722` and the pending bank rather than P1 state;
- the 2P adjustment converts binary `$81B610` before computing gain;
- active hyper, a broken chain, and fewer than 20 hits do not add bee earn.

The existing W111 bee score tests remain green, proving that this adapter did
not alter scoring, allocation, blink, collision, x2 behavior, or off-screen
freeing.

## Deliberate red validation

- `DDPDOJ_W166_MUTATION=drop-rank-feed` made four causal tests fail. The first
  left earn at `$0930` instead of granting; the BCD-100 case remained zero;
  P2 never banked; and the 2P adjustment produced no gain. Removing the
  mutation restored all six tests.
- `w166bee.py --break-opcode` flips an in-memory byte at `$27FBDE`. The exact
  P1 add-and-grant sequence fails. The ROM file is untouched. Removing the
  option restores the static pass.

## Gates

- Focused W111/W163/W166: 21 passed, 0 failed, 0 skipped, 0 todo.
- W166 current focused suite: 6 passed, 0 failed, 0 skipped, 0 todo.
- Full DOJ unit suite: 1,426 passed, 0 failed, 0 skipped, 0 todo.
- W166 static ROM inventory: pass.
- W166 preserved controlled MAME verification: pass.
- Bundle gate: 15,955,968/15,955,968 pixels identical over 159 frames.
- HTTP web gate: pass, including published-bundle and port-run checks.
- Publish dry gate: pass, build `20260809002628`; no deploy.

The three untracked user `c1` scripts were preserved and were not staged.
