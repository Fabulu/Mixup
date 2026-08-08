# W164 player-death hyper/reset boundary

Status: COMPLETE

## Result

The W163 boundary was real, but its first apparent routine end was not the
coherent gameplay boundary. `$249F8A..$24A12E` initializes a player death and
returns; the same player's next-frame state is `$24A130..$24A21A`, which walks
the death animation, waits, clears and reconstructs the record, requests the
player reset, and jumps to the already-ported deferred object-kill queue.

Both P1 and P2 now execute that whole lifecycle. In authentic order a hit:

1. tears down the player's beam, clears the three death-reset medal counters,
   and adds `$0258` to the chain-earned hyper gauge with the `$095E` cap;
2. calls the existing hyper grantor, snapshots whether a hyper was active,
   ends the hyper, quarters persistent rank power, and clears hyper stock;
3. on no lives, clears the remaining active/gauge/request/pending hyper state
   without clearing the already-quartered persistent power;
4. installs the correct partial death palette and emits the ROM-selected item
   drops, including the zero-drop first transition of the counted arm;
5. enters the exact pointer-list animation and 32-count delay;
6. preserves only the ROM-selected state, formation and option-growth fields,
   clears all 49 words of the `$62`-byte player record, requests reset, and
   queues the current object ID for destruction.

This closes chain-earned hypers through their player-death sink. Bee rank feed
is unchanged. Bee/medal art, bomb behavior, replay/tooltips, sound, and Gradius
were not modified.

## ROM boundary and complete inventory

The full disassembly was read through `$24A440`, past the apparent `$24A12E`
`rts`, the later `$24A144/$24A156` returns, the final `$24A21A` jump, and into
the following unrelated player sprite routines. The coherent death-state
boundary is therefore `$24A21A jmp $241292`. `$24A220` begins a different draw
routine and is not folded into the death port.

`tools/oracle/w164death.py` directly checks the decrypted VERSION-B image. It
pins SHA-256 fingerprints for both contiguous state bodies, the complete set of
local conditional/loop/return edges, and complete absolute-long caller
inventories for:

- `$261116`, `$2532EA`, `$28C3A0`, and the P1/P2 beam wipe entries;
- `$27F898/$27F8AE`, `$287B9A/$287BB6`, and `$287682/$287722`;
- `$285AF2/$285C1C`, `$25392E/$253968`, and `$2531DE/$2531FE`;
- all nine `$27E812` item-spawn sites;
- the death-only `$26080A` reset call and all 14 `$241292` kill-queue edges.

The checker separately pins the P1/P2 end-quarter-stock-reset instruction
ordering, both death-gauge add/cap bodies, the eight death-palette descriptors
at `$25321E`, the six formation-growth bytes at `$2551FA`, and the complete
38-entry animation pointer list plus `$FFFFFFFF` terminator at
`$255B7C..$255C17`.

The three new exported windows contain only those live tables. No generated or
ROM-derived bundle output is committed.

## Implementation

`src/player.js` owns the two death states and their P1/P2 address maps. The
former hit refusal and later death-state refusal now enter these translations.
The implementation composes existing beam, item, HUD-stock, hyper-end/grant and
object-kill owners rather than cloning them.

`src/hyper.js` adds the mirrored `$25392E/$253968` no-lives reset. It explicitly
does not clear `$81B646/$81B648`: the caller quarters those words first and the
ROM reset bodies never write them.

`src/palette.js` adds `$2415A2`, the variable `(D1+1)`-word low-bank sprite
palette install used by the death descriptor rows. The P1 first row copies
seven words into bank 7; P2 copies three words into bank 8. Source extent,
destination bank, exact DBRA word count, provenance and dirty state are all
checked.

The only deliberately deferred callee is `$2532EA`, the death-time HUD draw.
It remains an address-counted presentation note when its ROM gate is open. It
does not own rank, stock, items, player state, reset, or the death animation,
and omitting it does not create a partial gameplay lifecycle.

## Dynamic board validation

`tools/oracle/w164death.lua` is a controlled VERSION-B MAME probe. After the
normal boot it reasserts only declared death inputs until the live player object
exists: hit bit, zero invulnerability, rank power `$0050`, stock 2, earn
`$0800`, and two lives. From the authentic `$249F8A` entry onward it makes no
further intervention.

The observed board transition is exact:

```
INIT  lf=2635 power=0014 stock=0000 earn=095E active=0000
              state=0100 anim=00255B7C medal=0000
RESET lf=2705 state=0000 formation=0002 keep20=0000 keep22=0000
              keep25=03 reset=0001 reset2=0000
```

The probe also records the ordered writes at the death gauge, cap, rank
quarter, stock clear, state install, animation start/step, delay, 49-word clear
restore, reset request, kill ID and kill stack. Reset is exactly 70 logic frames
after initialization, independently agreeing with the complete animation list
and the `$20` countdown.

## Red validation

- Static ROM RED: `w164death.py --break-opcode` flips the in-memory byte at
  `$24A00C`; the routine fingerprint fails. The ROM file is untouched.
- Dynamic RED: `w164death.py capture --break-capture` changes the parsed board
  result from `power=0014` to `power=0015`; the exact snapshot assertion fails.
- Port RED: `DDPDOJ_W164_MUTATION=skip-rank-quarter` leaves P1 power at 20 and
  P2 power at 7. The causal tests expect 5 and 1 and both fail. Removing the
  mutation restores 5/5 green.

## Gates

- Focused W34/W61/W63/W64/W65/W163/W164: 190/190 pass, zero skip/todo.
- Full DOJ unit suite: 1,417/1,417 pass, zero skip/todo.
- TypeScript gate: pass.
- W164 static inventory: pass; opcode mutation: fails as required.
- W164 controlled MAME capture: pass; capture mutation: fails as required.
- Web export: pass, 2,515 sprite streams and rebuilt ROM windows.
- Bundle gate: 15,955,968/15,955,968 pixels identical to MAME over 159 frames.
- HTTP web gate: pass, including the published-bundle load and port-run gates.
- Publish dry gate: pass, build `20260808234746`; no deploy.
