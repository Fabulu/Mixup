# W270: the announcement's PRODUCER, and object [11] recon'd

Status: DONE. Suite 1836/1836 (1828 + 8), sweep 0 missing, both run before the commit.

W269 registered the announcement CONSUMER. This wave lands the four routines that write
what it reads, with a test that proves the two agree, and recons the object that calls them.

## Starting state

W269 committed at `f8776d9`, suite 1828/1828, object dispatch `[4]` registered.

## Four one-line routines, and the pairing is now PINNED

`announce260B30` -- object dispatch `[4]`, registered last wave -- reads a flag and a state
out of `$813162`/`$813166` twice a frame. These write them:

    $260A20   the SELECTOR: $813162 when D0 is zero, $813166 otherwise
    $260A88   post state 0                  unconditional
    $260A9A   post state $4   unless already $4
    $260AB6   post state $8                 unconditional
    $260AF2   post state $C   unless already $C

**The four states are exactly the four entries `$260B6A` covers**, which is how producer and
consumer are now KNOWN to agree rather than assumed to: the test drives each posted state
through the consumer, which throws by address on a state past its table, and reads the state
back out of the object's own `$4(a5)`.

The two GUARDED posters matter and the other two do not have the guard: re-posting a state
that is already up would restart the consumer's scroll from its first cell. The test
asserts the guard is on the STATE and not on the flag, by posting `$4` over an existing `$8`.

## `$260ACA` IS THE FIFTH LOOP-SPECIFIC RULE

    cmpi.b #$9,$803808 / bge   -> state 0        the config byte, at or past 9
    cmpi.b #$1,$80380B / beq   -> state 0
    tst.w $813098 / beq        \  LOOP 2 **and** stage 4 -> state $4
    cmpi.w #$4,$813092 / beq   /
    otherwise                  -> state $C

So the second loop's stage-4 clear announces something the first loop's does not. With
W241's zero-lives extend, W250's A1 6 ring and A4 id6's two, that is five.

## A REAL BUG THE TEST CAUGHT

`cmpi.b #$9,D0 / bge` is a BYTE compare and it is SIGNED. I wrote `i16(ram.u8(0x803808))`,
which reads `$F0` as 240 -- so every high config byte would have short-circuited to state 0
and the loop rule would never have run. The fix is `(b << 24) >> 24`, and the test drives
`$F0` with loop 2 and stage 4 set to prove the loop rule still fires.

That is the second time this session that `i16` on a BYTE has been the wrong sign
extension. Worth remembering as its own trap: the operand width in the mnemonic is the one
that decides, not the register's.

## Object dispatch [11], `$25DBB4` -- RECON, not implemented

It is 900 counted notes a run, and it is the caller these posters exist for. Three states on
`$2(a5)`:

    state 0   $25DB30   picks a 26-byte descriptor by $7(a5) ($25D952 or $25D96C) into
                        $8(a5), draws through $2533F6/$253448, POSTS state 0 via $260A88,
                        clears $C(a5), and arms $12(a5) = $4B0 and $14(a5) = 4
    state 1   $25DBB4   the gates: $28D53C (carry from $81DF20), $C(a5), the LOOP and STAGE
                        pair, $23C932, then $260ACA or $260A88
    state 2   $25DB7C   walks the descriptor with the $E/$F cursors against $25D986 (x) and
                        $25D98A (y), calls $2600D8, and tail-jumps $241292 (the self-kill)

Availability, checked one by one:

    $28D53C   6 instructions, a carry from $81DF20      -- trivial, unported
    $23C932   9 instructions, $803808 / $80395A/$803960 -- trivial, unported
    $2533F6   a text draw through $240E1A               -- $240E1A IS ported (hud.js)
    $253448   its mirror                                -- likewise
    $241292   the self-kill                             -- ported (hud.js)
    $2600D8   the descriptor walker                     -- UNPORTED and unread

So the object is one small routine away from transcribable, and `$2600D8` is the thing to
read first. Its callers are eleven sites across `$25CDxx`, `$25D5xx`, `$25DBxx`, `$2601xx`
and `$288A02`, none of them ported -- which is why this wave landed the shared protocol
rather than one caller: none of them now has to re-derive it.

## Also recorded

`$260A34`, which W243's worklog called "`$240EBC`, the FILL variant", is a THIRD thing: it
is the routine at `$260A34` that sets up D0/D1/D2/D3/D4 and then calls the fill. The port
reaches the fill correctly; the name in that worklog pointed one level too deep.

## Order for the next wave

1. `$2600D8`, then object `[11]` end to end. It is the largest remaining counted gap after
   the ISR family and it closes the announcement loop: producer, consumer and the object
   that drives both.
2. Then the four other caller regions, which share this protocol.
