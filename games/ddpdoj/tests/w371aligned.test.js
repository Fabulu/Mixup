// W371: the ALIGNED BOUNDARY SWEEP, tested against facts verified by hand BEFORE it existed.
//
// Three spec errors this session came from tools that read addresses without alignment, and one of
// them survived because the TEST meant to catch it had the same flaw as the data. So this tool is
// checked against hand-read fixtures, not against another scanner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = !existsSync(ROM) && 'no decrypted ROM';
const IMG = SKIP ? null : readFileSync(ROM);

function run(args) {
  return execFileSync('python', ['tools/aligned.py', ...args],
    { cwd: 'games/ddpdoj', encoding: 'utf8' });
}

test('W371 the sweep calls $26F702 MID-INSTRUCTION and $26F704 a boundary', { skip: SKIP }, () => {
  // The exact pair that produced the bad subroutine entry and the dropped fifth draw call. Both were
  // read by hand first; this asserts the tool reaches the same answer independently.
  const out = run(['check', '0x26f650', '0x26f718', '0x26f702', '0x26f704']);
  assert.match(out, /\$26F702\s+MID-INSTRUCTION/, '$26F702 is the bsr.w displacement, not an entry');
  assert.match(out, /\$26F704\s+BOUNDARY/, '$26F704 is the first of the five draw calls');
});

test('W371 all five tail-call sites are boundaries', { skip: SKIP }, () => {
  // The start is $26F650, not the handler entry: the prologue's `jmp $263762` at $26F61A is a flow
  // break, and the sweep now REFUSES to run through one. Sweeping from $26F5F2 stops there and reports
  // these as UNVERIFIED, which is the honest answer rather than a guess.
  const out = run(['check', '0x26f650', '0x26f718',
    '0x26f704', '0x26f708', '0x26f70c', '0x26f710', '0x26f714']);
  const bounds = [...out.matchAll(/\$([0-9A-F]{6})\s+BOUNDARY/g)].map((m) => m[1]);
  assert.deepEqual(bounds, ['26F704', '26F708', '26F70C', '26F710', '26F714'], 'all five, in order');
});

test('W371 the W362 fixture: Hibachi\'s ELEVEN part offsets, $1A0 EIGHTH', { skip: SKIP }, () => {
  // The acceptance fixture recorded for this tool long before it was written. The eleven `lea` sites
  // are NOT uniform -- the first is `lea (A6),A0`, two bytes, while the rest are `lea (d16,A6),A0`,
  // four. That size change is precisely what a fixed-stride scan gets wrong.
  const out = run(['sweep', '0x2a4622', '0x2a46b2']);
  assert.match(out, /\$2A4622\s+41 d6\b/, 'the first is lea (A6),A0 -- offset 0, TWO bytes');
  const offs = [...out.matchAll(/41 ee ([0-9a-f]{2}) ([0-9a-f]{2})/g)]
    .map((m) => parseInt(m[1] + m[2], 16));
  assert.deepEqual(offs, [0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0, 0x140, 0x160, 0x180],
    '$1A0 comes EIGHTH, and $E0/$100/$120 never appear -- transcribe the list, do not loop it');
});

test('W371 the sweep REFUSES rather than resynchronising', { skip: SKIP }, () => {
  // The refusal path, and it is reachable on real data: $2A4446 is HIBACHI's sub-record prototype,
  // whose first word is $A000 -- an A-line opcode no 68000 decoder accepts. It must STOP and name the
  // address. A decoder that resynchronised here would recreate the failure it exists to prevent.
  const out = run(['sweep', '0x2a4446', '0x2a4460']);
  assert.match(out, /STOPPED at \$2A4446: opcode A000/, 'it stops, and it says where and why');
  assert.match(out, /none of it is guessed/, 'and it states that nothing past the stop was decoded');
  assert.match(out, /0 instructions/, 'with no boundaries claimed at all');
});

test('W371 the KNOWN LIMITATION: data that happens to decode is NOT detected', { skip: SKIP }, () => {
  // Recorded as a test so it cannot be forgotten by whoever trusts this tool next. $2A443C is five
  // words of RECORD PROTOTYPE data (verified in W369), and it decodes cleanly into three plausible
  // instructions. A linear sweep cannot tell code from data that looks like code -- it can only tell
  // you where instruction boundaries fall IF the span is code.
  const out = run(['sweep', '0x2a443c', '0x2a4446']);
  assert.match(out, /3 instructions/, 'pure data, decoded without complaint');
  assert.doesNotMatch(out, /STOPPED/, 'and NO refusal, because every word happened to be legal');
  // So `check` must always be given a start the caller knows is an entry point. That is the contract,
  // and this test is the evidence for why the contract is not optional.
});

test('W371 the sweep STOPS at a flow break instead of decoding padding', { skip: SKIP }, () => {
  // The correction that mattered most. Sweeping across the `rts` at $26F982 and the eight padding
  // bytes after it made the tool report $26F98C as MID-INSTRUCTION -- but $26F98C is a genuine bsr.w
  // target from $26F97A, so that verdict was FALSE. A false MID-INSTRUCTION is worse than none: it
  // reads as proof of exactly the error this tool was built to find.
  const out = run(['check', '0x26f90e', '0x26f9a2', '0x26f98c']);
  assert.match(out, /flow break at \$26F982/, 'it names the break and where it stopped');
  assert.match(out, /\$26F98C\s+UNVERIFIED/, 'and reports UNVERIFIED, not a wrong verdict');
  assert.doesNotMatch(out, /\$26F98C\s+MID-INSTRUCTION/, 'the false verdict must not come back');
});

test('W371 a bsr target OUTRANKS the sweep -- $26F98C is a real entry point', { skip: SKIP }, () => {
  // The precedence rule, asserted against the cartridge rather than against the tool. $26F97A is a
  // bsr.w to $26F98C, which settles it: something branches there, so it is an entry point, whatever a
  // linear sweep that crossed padding to reach it says.
  assert.equal(IMG.readUInt16BE(0x26f97a), 0x6100, '$26F97A bsr.w');
  assert.equal(0x26f97c + IMG.readInt16BE(0x26f97c), 0x26f98c, '  ...to $26F98C');
  assert.equal(IMG.readUInt16BE(0x26f97e), 0x6100, '$26F97E bsr.w');
  assert.equal(0x26f980 + IMG.readInt16BE(0x26f980), 0x26fa56, '  ...to $26FA56, the other OFF setter');
  assert.equal(IMG.readUInt16BE(0x26f982), 0x4e75, '$26F982 rts -- the break the sweep stops at');
});
