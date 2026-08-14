// W373 -- $13CFBA, the coin and service read, DRIVEN. The edge behaviour is the whole point: a port
// that stores the level in $803954 coins up once per frame HELD, and that looks like a runaway
// credit counter rather than like a bug in this routine.
import test from 'node:test';
import assert from 'node:assert/strict';

async function fx() {
  const { coinRead13CFBA, coinPending13CF86, coinage13CE22, counterPulse13D068, COIN } = await import('../src/isr.js');
  const { Ram } = await import('../src/ram.js');
  const notes = [];
  return { coinRead13CFBA, coinPending13CF86, coinage13CE22, counterPulse13D068, COIN, ram: new Ram(),
    ctx: { unportedLog: { note: (a) => notes.push(a) } }, notes };
}

// The port is ACTIVE LOW: a switch reads 0 when pressed. $FFFF is "nothing pressed".
const IDLE = 0xffff;
const press = (bit) => (IDLE & ~(1 << bit)) & 0xffff;

test('W373 a HELD coin edges exactly ONCE', async () => {
  const { coinRead13CFBA, COIN, ram, ctx } = await fx();
  ram.setU16(COIN.prev, IDLE);                               // released last frame

  coinRead13CFBA(ram, press(5), ctx);
  assert.equal(ram.u16(COIN.edges), 1 << 5, 'frame 1: the edge fires');

  for (let i = 0; i < 30; i++) coinRead13CFBA(ram, press(5), ctx);
  assert.equal(ram.u16(COIN.edges), 0, 'thirty more frames HELD: no further edge');

  coinRead13CFBA(ram, IDLE, ctx);
  assert.equal(ram.u16(COIN.edges), 0, 'the release itself is not an edge either');
  coinRead13CFBA(ram, press(5), ctx);
  assert.equal(ram.u16(COIN.edges), 1 << 5, 'and pressing again edges again');
});

test('W373 the three words are three DIFFERENT things', async () => {
  const { coinRead13CFBA, COIN, ram, ctx } = await fx();
  ram.setU16(COIN.prev, IDLE);
  // Press bit 5 (in the mask) AND bit 0 (outside it), so the raw level and the edge word cannot
  // coincide by accident the way they do when only one in-mask bit is down.
  const w = press(5) & press(0);
  coinRead13CFBA(ram, w, ctx);
  assert.equal(ram.u16(COIN.prev), w, '$803952 holds this frame RAW, still active low');
  assert.equal(ram.u16(COIN.raw), (~w) & 0xffff, '$803950 holds it INVERTED, so 1 = pressed');
  assert.equal(ram.u16(COIN.edges), 1 << 5, '$803954 holds only the newly-pressed masked bits');
  assert.notEqual(ram.u16(COIN.raw), ram.u16(COIN.edges),
    'and the raw level is NOT the edge word -- storing one for the other is the D35 trap');
});

test('W373 the mask keeps bits 5, 6 and 7 and nothing else', async () => {
  const { coinRead13CFBA, COIN, ram, ctx } = await fx();
  for (let bit = 0; bit < 16; bit++) {
    ram.setU16(COIN.prev, IDLE);
    coinRead13CFBA(ram, press(bit), ctx);
    const want = (1 << bit) & COIN.mask;
    assert.equal(ram.u16(COIN.edges), want, `bit ${bit} ${want ? 'survives' : 'is masked out'}`);
  }
});

test('W373 the pending flags are exact-value words and reading them CONSUMES them', async () => {
  const { coinPending13CF86, COIN, ram } = await fx();
  ram.setU16(COIN.pendA, COIN.pendValue);
  ram.setU16(COIN.pendB, COIN.pendValue);
  assert.equal(coinPending13CF86(ram), 0x03, 'both pending');
  assert.equal(ram.u16(COIN.pendA), 0, 'A consumed');
  assert.equal(ram.u16(COIN.pendB), 0, 'B consumed');
  assert.equal(coinPending13CF86(ram), 0, 'and a second read finds nothing');

  // cmpi.w against $0080 exactly -- not a bit test. $0081 and $0180 both read as nothing.
  for (const v of [0x0081, 0x0180, 0x0001, 0xffff]) {
    ram.setU16(COIN.pendA, v);
    assert.equal(coinPending13CF86(ram), 0, `$${v.toString(16)} is not $0080`);
    assert.equal(ram.u16(COIN.pendA), v, '  ...and a non-match is NOT consumed');
  }
});

test('W373 the pending bits merge into the SAME word the edges use', async () => {
  const { coinRead13CFBA, COIN, ram, ctx } = await fx();
  ram.setU16(COIN.prev, IDLE);
  ram.setU16(COIN.pendA, COIN.pendValue);
  const d1 = coinRead13CFBA(ram, press(5), ctx);
  assert.equal(d1, (1 << 5) | 0x01, 'the returned word carries the edge AND the pending bit');
  // $13CF86 starts moveq #$0,D1, so it destroys the edges in the register; $13CFE4 reads them back
  // out of $803954. If the port kept them in a local the store could silently stop mattering.
  assert.equal(ram.u16(COIN.edges), 1 << 5, 'and $803954 still holds the edges alone');
});

test('W373 IRQ6 no longer reports the coin read as unported', async () => {
  const { irq6 } = await import('../src/isr.js');
  const { ROM } = await import('../src/machine.js');
  const { Ram } = await import('../src/ram.js');
  const notes = [];
  const ram = new Ram();
  try {
    irq6(ram, IDLE, { unportedLog: { note: (a) => notes.push(a) } });
  } catch { /* the rest of IRQ6 needs a fuller ctx; the note list is what matters */ }
  assert.ok(!notes.includes(ROM.isr6Coin),
    '$13CFBA is called now, not noted as ISR6 jsr #1');
});

test('W373 bit 5 RETURNS -- the other two arms are only tested when it is clear', async () => {
  const { coinRead13CFBA, COIN, ram, ctx } = await fx();
  ram.setU8(COIN.dipCoinage, 0x11);                          // a band that touches the coin count
  ram.setU16(COIN.prev, IDLE);
  // Bits 5 and 6 edge on the SAME frame. Bit 6 is in the mask, so both reach D1... but bit 5's arm
  // returns before $13D002 is ever reached.
  ram.setU16(COIN.pendA, COIN.pendValue);                    // this sets D1 bit 0 as well
  coinRead13CFBA(ram, press(5), ctx);
  assert.equal(ram.u8(COIN.creditA), 1, 'slot 1 was credited exactly once');
  assert.equal(ram.u8(COIN.counterA), 0,
    'and $80394C was NOT bumped -- that lives in the bit-0 arm, which bit 5 skipped');
});

test('W373 with bit 5 clear, the bit-0 arm runs and bumps the mechanical counter', async () => {
  const { coinRead13CFBA, COIN, ram, ctx } = await fx();
  ram.setU8(COIN.dipCoinage, 0x11);
  ram.setU16(COIN.prev, IDLE);
  ram.setU16(COIN.pendA, COIN.pendValue);                    // D1 bit 0, no bit 5
  coinRead13CFBA(ram, IDLE, ctx);
  assert.equal(ram.u8(COIN.creditA), 1, 'slot 1 credited');
  assert.equal(ram.u8(COIN.counterA), 1, 'and NOW $80394C was bumped');
});

test('W373 $13CE22: free play does nothing and nine credits is a hard stop', async () => {
  const { coinage13CE22, COIN, ram } = await fx();
  ram.setU8(COIN.dipCoinage, 0x12);                          // free play
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA), 0);
  assert.equal(ram.u8(COIN.creditA + 2), 0, 'free play credits nothing');

  ram.setU8(COIN.dipCoinage, 0x00);
  ram.setU8(COIN.creditsPerCoin, 5);
  ram.setU8(COIN.creditA + 2, 9);                            // already at nine
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA + 2), 9, 'the entry test is == 9 exactly, and it stops there');
});

test('W373 $13CE22: the $00..$08 band MULTIPLIES and clamps at nine', async () => {
  const { coinage13CE22, COIN, ram } = await fx();
  ram.setU8(COIN.dipCoinage, 0x03);
  ram.setU8(COIN.creditsPerCoin, 4);
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA + 2), 4, 'one coin gave $803957 credits');
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA + 2), 8);
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA + 2), 9, '12 would overflow, so it clamps at nine');
});

test('W373 $13CE22: the $09..$10 band DIVIDES through a carry counter', async () => {
  const { coinage13CE22, COIN, ram } = await fx();
  ram.setU8(COIN.dipCoinage, 0x0a);
  ram.setU8(COIN.coinsPerCredit, 3);                         // three coins per credit
  for (let i = 0; i < 2; i++) coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA), 2, 'two coins counted');
  assert.equal(ram.u8(COIN.creditA + 2), 0, '  ...and no credit yet');
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA), 0, 'the third coin RESET the coin count');
  assert.equal(ram.u8(COIN.creditA + 2), 1, '  ...and gave one credit');
});

test('W373 $13CE22: the $11 band bumps the COIN count and not the credit count', async () => {
  const { coinage13CE22, COIN, ram } = await fx();
  ram.setU8(COIN.dipCoinage, 0x11);
  coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA), 1, '(A0) bumped');
  assert.equal(ram.u8(COIN.creditA + 2), 0,
    'and ($2,A0) did NOT -- $13CE52 sends $11 past both remaining bands');
  for (let i = 0; i < 20; i++) coinage13CE22(ram, COIN.creditA);
  assert.equal(ram.u8(COIN.creditA), 9, 'clamped at nine like every other write');
});

test('W373 the slot-2 DIP decides whether both slots share one credit block', async () => {
  const shared = await fx();
  shared.ram.setU8(shared.COIN.dipCoinage, 0x00);
  shared.ram.setU8(shared.COIN.creditsPerCoin, 1);
  shared.ram.setU8(shared.COIN.dipSlot2, 0x00);              // NOT 1 -> share slot 1's block
  shared.ram.setU16(shared.COIN.prev, IDLE);
  shared.ram.setU16(shared.COIN.pendB, shared.COIN.pendValue);   // D1 bit 1, the slot-2 arm
  shared.coinRead13CFBA(shared.ram, IDLE, shared.ctx);
  assert.equal(shared.ram.u8(shared.COIN.creditA + 2), 1, 'shared: slot 1 got the credit');
  assert.equal(shared.ram.u8(shared.COIN.creditB + 2), 0, '  ...and slot 2 got none');

  const split = await fx();
  split.ram.setU8(split.COIN.dipCoinage, 0x00);
  split.ram.setU8(split.COIN.creditsPerCoin, 1);
  split.ram.setU8(split.COIN.dipSlot2, 0x01);               // EXACTLY 1 -> its own block
  split.ram.setU16(split.COIN.prev, IDLE);
  split.ram.setU16(split.COIN.pendB, split.COIN.pendValue);
  split.coinRead13CFBA(split.ram, IDLE, split.ctx);
  assert.equal(split.ram.u8(split.COIN.creditB + 2), 1, 'split: slot 2 got its own credit');
  assert.equal(split.ram.u8(split.COIN.creditA + 2), 0);
});

test('W373 IRQ6 does not feed the PLAYER port into the coin read', async () => {
  // $13CFBA does its own `lea $C08004,A0`; IRQ6's portWord is $C08000. Handing IRQ6's word to the
  // coin read credits a coin whenever a player holds a button inside the $E0 mask, and it broke six
  // unrelated frame-level tests before it was caught.
  const { irq6 } = await import('../src/isr.js');
  const { COIN } = await import('../src/isr.js');
  const { Ram } = await import('../src/ram.js');
  const ram = new Ram();
  ram.setU16(COIN.prev, IDLE);
  ram.setU8(COIN.dipCoinage, 0x00);
  ram.setU8(COIN.creditsPerCoin, 1);
  try {
    // A player holding the button on bit 5 of the PLAYER port, thirty frames.
    for (let i = 0; i < 30; i++) irq6(ram, press(5), { unportedLog: { note: () => {} } });
  } catch { /* the rest of IRQ6 wants a fuller ctx; the credit count is what matters */ }
  assert.equal(ram.u8(COIN.creditA + 2), 0, 'no credits appeared from player input');
  assert.equal(ram.u16(COIN.edges), 0, 'and no coin edge was recorded');
});

test('W373 $13D068 is a SIX-frame pulse, not a single store', async () => {
  const { counterPulse13D068, COIN, ram } = await fx();
  const port = [];
  const ctx = { coinCounterPort: (v) => port.push(v), counterTrigger13CC50: () => 0x22,
    unportedLog: { note: () => {} } };
  ram.setU8(COIN.dipSlot2, 0x01);                            // non-zero -> drive $13CC50's value

  counterPulse13D068(ram, ctx);
  assert.deepEqual(port, [0x22], 'the trigger drove the port with its own value');
  assert.equal(ram.u8(COIN.pulseState), 1);
  assert.equal(ram.u8(COIN.pulseCount), COIN.pulseFrames, 'armed for six frames');

  // The count is armed to 6 and decremented once per frame, so SIX state-1 frames are needed, not
  // five: the arming frame is state 0's and does not decrement.
  for (let i = 0; i < 5; i++) counterPulse13D068(ram, ctx);
  assert.deepEqual(port, [0x22], 'still energised after five, still one write');
  assert.equal(ram.u8(COIN.pulseState), 1, '  ...and still in state 1');
  counterPulse13D068(ram, ctx);
  assert.equal(ram.u8(COIN.pulseState), 2, 'the SIXTH frame moved it on');
  assert.deepEqual(port.length, 2, 'and de-energised it');
  assert.equal(port[1], 0x0000, 'with a ZERO write');

  for (let i = 0; i < 6; i++) counterPulse13D068(ram, ctx);
  assert.equal(ram.u8(COIN.pulseState), 0, 'six more frames de-energised, then back to idle');
  counterPulse13D068(ram, ctx);
  assert.equal(ram.u8(COIN.pulseState), 1, 'and the trigger fires again from state 0');
  assert.equal(port.length, 3, 'a second pulse, so this is a repeating solenoid drive');
});

test('W373 the slot-2 DIP picks the pulse PATTERN as well as the credit block', async () => {
  const { counterPulse13D068, COIN, ram } = await fx();
  const port = [];
  const ctx = { coinCounterPort: (v) => port.push(v), counterTrigger13CC50: () => 0x22,
    unportedLog: { note: () => {} } };
  ram.setU8(COIN.dipSlot2, 0x00);                            // ZERO -> the literal $F
  counterPulse13D068(ram, ctx);
  assert.deepEqual(port, [0x000f], '$80380B zero writes the literal $F, not the trigger value');
});

test('W373 without $13CC50 the pulse never STARTS -- the safe half', async () => {
  const { counterPulse13D068, COIN, ram } = await fx();
  const notes = [];
  const port = [];
  const ctx = { coinCounterPort: (v) => port.push(v), unportedLog: { note: (a) => notes.push(a) } };
  for (let i = 0; i < 40; i++) counterPulse13D068(ram, ctx);
  assert.deepEqual(port, [], 'nothing driven');
  assert.equal(ram.u8(COIN.pulseState), 0, 'and it stayed idle rather than stuck energised');
  assert.ok(notes.includes(COIN.trigger), 'the gap is counted');
});
