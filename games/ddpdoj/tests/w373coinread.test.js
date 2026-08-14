// W373 -- $13CFBA, the coin and service read, DRIVEN. The edge behaviour is the whole point: a port
// that stores the level in $803954 coins up once per frame HELD, and that looks like a runaway
// credit counter rather than like a bug in this routine.
import test from 'node:test';
import assert from 'node:assert/strict';

async function fx() {
  const { coinRead13CFBA, coinPending13CF86, COIN } = await import('../src/isr.js');
  const { Ram } = await import('../src/ram.js');
  const notes = [];
  return { coinRead13CFBA, coinPending13CF86, COIN, ram: new Ram(),
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
