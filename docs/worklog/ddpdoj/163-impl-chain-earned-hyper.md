# W163 chain-earned hyper progression

Status: COMPLETE

## Result

The owner's missing gameplay link was real and narrow at its head, but not at
its tail. The live chain code already raises the packed-BCD count, refills the
meter on hits, and lets `$284636/$2847D4` drain the meter when hits stop. The
port stopped at the cap clamp immediately before the chain-to-hyper earn tail:

```
$286674 ROM gain tables -> $81B64A/$81B64C earn
        -> $287682/$287722 grant
        -> kind $0C/$14 item -> collect -> stock
        -> Button 2 request -> $285A12/$285B3C activation
        -> stock added to $81B646/$81B648 rank power
```

That whole P1/P2 path now runs. Chain-earned stock is therefore not merely a
pickup or a visible counter: using it increments the persistent power word
that the already-ported type-10 rank calculation charges at 16 rank units per
level while a hyper is active.

No bee/medal/bomb authenticity was changed. Bee rank feed remains outside this
wave. Sound, replay, tooltips, and the separate chain-bar presentation defect
were not touched.

## ROM boundary and inventory

`tools/oracle/w163hyper.py` checks the decrypted VERSION-B image directly. It
pins the complete absolute caller inventories for both grantors, both pending
flush routines, and the hyper allocator, plus instruction fingerprints for:

- `$286674..$2866CA` and the P2 mirror: cap gain, stock adjustment, doubling,
  earn add, and grant tail;
- `$287682..$2877B6`: threshold, stock/pending refusal, immediate spawn and
  pending bank for both players;
- `$27E912/$27F6E4`, `$27EF50/$27F254`, and `$2530BE/$2530E6`: allocation,
  item body, collection, stock increment, and `$095F` gauge load;
- `$249868..$2498DE`: request, beam reset, player flag, cancel arm, and cadence
  rejoin;
- `$285A12..$285C5C`: activation, rank-power accumulation and cap, stock spend,
  established-chain maintenance, duration drain, ordinary end and P2 mirror;
- `$249970/$2499C0`: bomb-during-hyper end and the call-site `-3` power sink.

The static RED control flips the `$285A62` rank-power opcode in memory and the
checker fails at that exact address. No ROM-derived file is modified.

The exported ROM windows add only the data reached by these routines: the
power-zero-inclusive `$252B42..$252BCF` request tables, pending/request modes,
normal/active cap gains, stock adjustments, the end-flash table, and the
hyper-item motion table through its next data boundary.

## Implementation

`src/hyper.js` owns the mirrored hyper state machine. `score.js` runs the cap
earn tail and its grant jump. `items.js` accepts kinds `$0C/$14`, implements the
position allocator/fill, moves and draws both item bodies, and collects into
stock/gauge. `player.js` selects hyper when stock is non-zero and correctly
rejoins `$249B2C` cadence rather than returning from the player update. `hud.js`
runs activation/duration in the authentic type-0 frame slot. `bomb.js` delegates
pending flush and bomb-during-hyper end/debit to the shared implementation.

The active tail also restores `$285ABA/$285BE4`: once the chain is at least BCD
10 and its meter remains non-zero, a hyper refreshes the three chain-maintenance
words to `$78`. Without hits, the existing HUD gate continues to decrement the
meter to zero and clears both chain accumulators.

## Explicit next boundary

Player death is not partially ported. `$249542` still throws at the entry to
the 212-instruction `$249F8A` death routine. That executable refusal is the
ROM-proved next-wave boundary. A death wave must translate the routine in
order, including `$285AF2/$285C1C` end, `$24A00C/$24A0AA` rank-power quarter,
stock clear, death gauge grant, item grant calls, player reset, and both mirrors.
Cherry-picking only the quarter or stock clear here would leave a half-run death
with invented state.

The `$243D14/$243D5A` request arms now drive the existing `$81B410/$81B412`
bullet-clear machine. Their `$244074` per-bullet score walk remains the older
counted presentation/scoring boundary; it does not feed the chain earn words.

## Validation

- Focused W34/W61/W63/W64/W163: 141/141 pass, zero skip/todo.
- Full DOJ unit suite: 1,412/1,412 pass, zero skip/todo.
- TypeScript gate: pass.
- W163 static inventory: pass; opcode mutation: exit 1 as required.
- W163 port mutation `drop-cap-feed`: two causal pipeline tests fail; clean
  rerun passes.
- Existing W159 dynamic oracle: 5,800 logic frames pass. It independently pins
  hit/refill/one-per-frame decay/break/restart, same-frame threshold grant,
  natural kind-C collection, chain TX and bucket-25 presentation.
- Web export: pass, 2,515 sprite streams and regenerated ROM windows.
- Bundle gate: 15,955,968/15,955,968 pixels identical to MAME over 159 frames.
- HTTP web gate: pass, including published bundle load and port-run gates.
- Publish dry gate: pass, build `20260808231309`; no deploy.
