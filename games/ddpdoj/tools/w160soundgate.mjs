#!/usr/bin/env node
// W160 independent ROM/register-capture gate for the two live audible faults.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { sfxRateToOscFc } from '../src/driverparams.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
function check(condition, message) {
  checks++;
  if (!condition) throw new Error(`W160 sound gate: ${message}`);
}
function le16(bytes, address) { return bytes[address] | (bytes[address + 1] << 8); }

const z80 = new Uint8Array(fs.readFileSync(path.join(ROOT, 'rip', 'sound', 'z80ram.bin')));
check(le16(z80, 0x6168) === 0x8133, 'live driver source-rate word [$6168] drifted');
check(le16(z80, 0x7602) === 0x5622, 'selector 0 Hz descriptor drifted');
check(sfxRateToOscFc(le16(z80, 0x7602), le16(z80, 0x6168)) === 0x02aa,
  'selector 0 `$0B92` OscFC conversion is not $02AA');
check(le16(z80, 0x7602 + 36 * 12) === 0x7d00, 'selector 36 Hz descriptor drifted');
check(sfxRateToOscFc(le16(z80, 0x7602 + 36 * 12), le16(z80, 0x6168)) === 0x03de,
  'selector 36 `$0B92` OscFC conversion is not $03DE');

const ics = fs.readFileSync(path.join(ROOT, 'rip', 'sound', 'ics.tsv'), 'utf8');
check(ics.includes('51581\t2035\t1999\t16\t01\tsel\t01\n'
  + '51582\t2035\t1999\t16\t01\tlo\tAA\n'
  + '51583\t2035\t1999\t16\t01\thi\t02'),
  'raw selector-0 ICS write is not OscFC $02AA');
check(/\t01\tlo\tEF\r?\n[^\n]*\t01\thi\t01/.test(ics),
  'raw ICS stream lacks the 16,000 Hz -> $01EF family');
check(/\t01\tlo\t55\r?\n[^\n]*\t01\thi\t01/.test(ics),
  'raw ICS stream lacks the 11,025 Hz -> $0155 family');
check(ics.includes('51595\t2035\t1999\t16\t02\tsel\t02\n'
  + '51596\t2035\t1999\t16\t02\tlo\t00\n'
  + '51597\t2035\t1999\t16\t02\thi\t00'),
  'selector-0 accumulator start write drifted');
check(ics.includes('51601\t2035\t1999\t16\t04\tsel\t04\n'
  + '51602\t2035\t1999\t16\t04\tlo\t55\n'
  + '51603\t2035\t1999\t16\t04\thi\t03'),
  'selector-0 end write is not $403555');

const mailbox = fs.readFileSync(path.join(ROOT, 'rip', 'sound', 'mailbox_dedup.tsv'), 'utf8');
check(mailbox.includes('6\t1562\t$12\t$EB\t$00\t$00'),
  'stage-one lf1562 type-$12/id-0 start door is absent');

const main = fs.readFileSync(path.join(ROOT, 'rip', 'sound', 'maincpu.bin'));
check(main.subarray(0x25d5c2, 0x25d5c8).toString('hex') === '4eb90028cb9c',
  '$25D5C2 is not JSR $28CB9C');
check(main.subarray(0x26209e, 0x2620a4).toString('hex') === '2039008131c4',
  '$26209E does not load the deferred cue callback');
check(main.subarray(0x2620b4, 0x2620b6).toString('hex') === '4e90',
  '$2620B4 is not JSR (A0)');

const params = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'assets',
  'snd', 'driver-params.json.gz'))));
check(params.version === 2, 'published driver-params schema is not v2');
check(params.clock?.sourceRateAddress === 0x6168 && params.clock?.sourceRateHz === 0x8133,
  'published source-rate provenance drifted');
check(params.sfx.entries[0].sampleRateHz === 0x5622
  && params.sfx.entries[0].oscFc === 0x02aa,
  'published selector 0 semantics drifted');
check(params.sfx.entries[36].sampleRateHz === 0x7d00
  && params.sfx.entries[36].oscFc === 0x03de,
  'published selector 36 semantics drifted');

const dispatch = fs.readFileSync(path.join(ROOT, 'src', 'dispatch.js'), 'utf8');
check(dispatch.includes('slot.fc = descriptor.oscFc;'),
  'production immediate SFX path does not consume converted OscFC');
check(!dispatch.includes('descriptor.initialFc'),
  'production still consumes the false raw-word-as-OscFC meaning');
const background = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
check(background.includes('ctx.soundPost?.(call);'),
  'live `$2620B4` deferred callback is not routed to Game sound');
const app = fs.readFileSync(path.join(ROOT, 'src', 'web', 'app.js'), 'utf8');
check(app.includes('soundRuntimeFromStage1Seed') && app.includes('sound.setChip(runtime)'),
  'browser does not attach the pre-rolled singleton runtime');

console.log(`W160 sound gate: ${checks}/${checks} ROM, capture, artifact and route checks pass`);
