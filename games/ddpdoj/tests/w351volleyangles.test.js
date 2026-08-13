// W351: verify T55's literal volley angle lists against the CARTRIDGE's own instruction stream.
//
// The lists are hand-derived from the emit/addq sequence. Hand-derived is exactly what got the first
// handler55 reverted, so the derivation is checked here rather than trusted: walk the ROM bytes, pull
// the backoff out of the `subi.w`, the per-shot steps out of each `addq.b`, and the inter-cluster jump
// out of each `addi.b`, then rebuild the offsets and compare.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TYPE_SPECS } from '../src/handlers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROM = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const HAVE = fs.existsSync(ROM);

// $55's two volleys, as (loop top, dbra address). maincpu.bin is addressed by RAW FILE OFFSET.
const VOLLEYS = [
  { name: 'ordinary', top: 0x27263a, dbra: 0x27267a, backoffAt: 0x27262e, counterAt: 0x272632 },
  { name: 'finale', top: 0x27269a, dbra: 0x272706, backoffAt: 0x27268e, counterAt: 0x272692 },
];

function rebuild(buf, v) {
  const backoff = buf.readUInt16BE(v.backoffAt);        // the subi.w immediate
  const passes = buf.readUInt16BE(v.counterAt) + 1;     // move.w #$N,D7 -> N+1 passes (DBcc)
  // Walk the loop body collecting per-shot steps: addq.b #N,Dn is 0x5N01 with N in the top nibble.
  const steps = [];
  for (let a = v.top; a < v.dbra; a += 2) {
    const w = buf.readUInt16BE(a);
    if ((w & 0xf1ff) === 0x5001) steps.push((w >> 9) & 0x7 || 8);   // addq.b #data,D1
  }
  const inter = buf.readUInt16BE(v.dbra + 2);           // addi.b #N,D1 immediate at dbra+2
  const perPass = steps.length + 1;                    // one more emit than there are steps
  const out = [];
  let d1 = -backoff;
  for (let p = 0; p < passes; p += 1) {
    for (let s = 0; s < perPass; s += 1) {
      out.push(d1);
      d1 += s < perPass - 1 ? steps[s] : inter;
    }
  }
  return { out, backoff, passes, perPass, inter };
}

test('W351: T55 volley angles match the cartridge instruction stream', { skip: !HAVE }, () => {
  const buf = fs.readFileSync(ROM);
  const T55 = TYPE_SPECS.get(0x55);
  assert.ok(T55, 'T55 is registered');
  for (const v of VOLLEYS) {
    const spec = v.name === 'ordinary' ? T55.volleyOrdinary : T55.volleyFinale;
    const r = rebuild(buf, v);
    assert.equal(r.backoff, spec.backoff, `${v.name} backoff from the subi.w`);
    assert.deepEqual([...spec.angles], r.out,
      `${v.name}: ${r.passes} passes x ${r.perPass} emits, inter-cluster +${r.inter}`);
    // The call SITES, scanned as `jsr <emit>` (0x4eb9 + the 32-bit target) inside the loop body. The
    // handler passes these to ctx.bulletSpawn, so a transcription slip would misattribute every bullet.
    const found = [];
    for (let a = v.top; a < v.dbra; a += 2) {
      if (buf.readUInt16BE(a) === 0x4eb9 && buf.readUInt32BE(a + 2) === spec.emit) found.push(a);
    }
    assert.deepEqual([...spec.sites], found, `${v.name} jsr sites, in order`);
    assert.equal(spec.angles.length % spec.sites.length, 0,
      `${v.name}: ${spec.angles.length} shots must divide evenly by ${spec.sites.length} emit sites, `
      + 'since the site cycles per shot within a pass');

    // Symmetry is the independent check: the ROM aims at the centre, so the set must mirror.
    // `-x` on the centre shot gives -0, and strict deepEqual distinguishes -0 from 0, so normalise it.
    const mirrored = [...spec.angles].map((x) => (x === 0 ? 0 : -x)).reverse();
    assert.deepEqual([...spec.angles], mirrored, `${v.name} must be symmetric about the aim`);
  }
});
