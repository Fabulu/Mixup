#!/usr/bin/env node
// W592 selector pairgate verifier.
//
// `verify` is deliberately offline: it reads only the tracked scenario corpus
// and compact witness. `capture` additionally checks ignored TSV/PNG output
// from a fresh MAME run, but never writes or rewrites either file.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PAIR_KEYS = ['0,2', '0,4', '0,6', '2,2', '2,4', '2,6'];

const SCOPE = 'Cold-boot selector evidence for six authentic VERSION-B fighter/style pairs. '
  + 'Effects, sprite buckets and pixel crops are not covered by W592.';
const CHOOSER = '560=D;570=;600=A;610=;1000=N;1010=;1100=N;1110=;1200=S;1210=';
const WATCH = 'mb84=813084,mb88=813088,cur08=813008:b,cur09=813009:b,'
  + 'cship=81043E,cstyle=810440,p24=81040A:b,p25=81040B:b,img=8103F0,'
  + 'hit=8103F6,speed1a=810400:b,laser38=81041E:b,speed39=81041F:b,'
  + 'powe4=8127E4:l,powe8=8127E8:l,stage=813092,pstate=8103E6,'
  + 'py=8103E8,px=8103EA';
const TAILS = {
  '0,2': '1500=A;1510=;1560=A;1570=;1700=A;1710=',
  '0,4': '1500=A;1510=;1530=R;1540=;1560=A;1570=;1700=A;1710=',
  '0,6': '1500=A;1510=;1520=R;1530=;1540=R;1550=;1560=A;1570=;1700=A;1710=',
  '2,2': '1460=R;1470=;1500=A;1510=;1560=A;1570=;1700=A;1710=',
  '2,4': '1460=R;1470=;1500=A;1510=;1530=R;1540=;1560=A;1570=;1700=A;1710=',
  '2,6': '1460=R;1470=;1500=A;1510=;1520=R;1530=;1540=R;1550=;1560=A;1570=;1700=A;1710=',
};
const TRACE_HASHES = {
  '0,2': '1c73c25092080039747a160e91e1c821e2a3fb77370869b8838288bb78f66c8a',
  '0,4': '52ee9c97b5c25c21ab64cee87e8e635c36cab45018c375f244f0e125dda40861',
  '0,6': '16a4afbedc7c2f7b0ebad31cd8ee033456ddf03951f397ffea2e4f369d813c5a',
  '2,2': '4a0f56e3a9887f9fa0661fbe02a8f0a09ad078a696275e1e8c2d27b9c6fddcef',
  '2,4': '0d53b45fc6dfd2768888075b016fe06c8fd5ba0957986d9b43bb9851d7e0fde1',
  '2,6': '8a970397cdbe238aff5660287fb4a9fb39e1c7fbdbe1e9b5bdb4375cfbe2beb0',
};
const PNG_HASHES = {
  '0,2': '848843dcb02430294c150cda533c133c259cb684d6ebd14daa5cd38e219712c7',
  '0,4': '6dd9f1ba4bd54ac912950e2271576509df924421d25a2cac02230ca047f4775c',
  '0,6': 'fbb99fa69e86339295d7ea1402acf79cf6b34c25340e615138272595c67167c7',
  '2,2': '082c9c7418451e42cd4ab2370afd7fa163903e2ec2e9bcd9f81284ad3e1bac96',
  '2,4': '23afef26ee4cc5b486cd5e1a3fb112821b707717c44515a52fe94a48de684146',
  '2,6': 'db8930e92e73beb38cbe73bfc6abf35f9608b9b91c9419ab45434646636e2978',
};

const FACT_KEYS = [
  'mailboxShip', 'mailboxStyle', 'savedShipCursor', 'savedStyleCursor',
  'cachedShip', 'cachedStyle', 'bombPlus24', 'bombPlus25', 'initialImageHighWord',
  'hitboxHighWord', 'speedIndex', 'laserFloor', 'baseSpeed', 'powerCursorE4',
  'powerCursorE8', 'p1State',
];

function fail(where, message) {
  throw new Error(`${where}: ${message}`);
}

function same(where, actual, expected) {
  if (actual !== expected) fail(where, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function exactKeys(where, value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(where, 'must be an object');
  }
  const got = Object.keys(value).sort();
  const want = [...expected].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(where, `keys ${JSON.stringify(got)} do not equal ${JSON.stringify(want)}`);
  }
}

function pairOf(key) {
  const [ship, style] = key.split(',').map(Number);
  return { ship, style };
}

function expectedFacts(key, live) {
  const { ship, style } = pairOf(key);
  const styleIndex = style / 2 - 1;
  if (!live) {
    return {
      mailboxShip: ship, mailboxStyle: style,
      savedShipCursor: ship / 2, savedStyleCursor: styleIndex,
      cachedShip: 0, cachedStyle: 0, bombPlus24: 0, bombPlus25: 0,
      initialImageHighWord: 0, hitboxHighWord: 0, speedIndex: 0, laserFloor: 0,
      baseSpeed: 0, powerCursorE4: 0, powerCursorE8: 0, p1State: 0,
    };
  }
  const speed = ship === 0 ? 0x16 : 0x13;
  const laserFloor = style === 2 ? 0x0c : (ship === 0 ? 0x10 : 0x0f);
  const cursorE4 = 0x25523c + styleIndex * 0x14 + (ship / 2) * 0x0a;
  return {
    mailboxShip: ship, mailboxStyle: style,
    savedShipCursor: ship / 2, savedStyleCursor: styleIndex,
    cachedShip: ship, cachedStyle: style,
    bombPlus24: 4 - style / 2, bombPlus25: 4 - style / 2,
    initialImageHighWord: 0, hitboxHighWord: ship === 0 ? 0x80 : 0x100,
    speedIndex: speed, laserFloor, baseSpeed: speed,
    powerCursorE4: cursorE4, powerCursorE8: cursorE4 + 0x3c,
    p1State: 0x8000,
  };
}

function checkFacts(where, value, expected) {
  exactKeys(where, value, FACT_KEYS);
  for (const key of FACT_KEYS) same(`${where}.${key}`, value[key], expected[key]);
}

export function validatePairgateScenarios(defs) {
  same('scenarios.set', defs?.set, 'ddpdojblk');
  const gate = defs?.pairgate;
  exactKeys('scenarios.pairgate', gate,
    ['schema', 'why', 'frames', 'build', 'chooserPrefix', 'snapshotLogicFrame', 'watch', 'pairs']);
  same('scenarios.pairgate.schema', gate.schema, 'ddpdoj-pairgate-selector-scenarios-v1');
  same('scenarios.pairgate.frames', gate.frames, 2050);
  same('scenarios.pairgate.build', gate.build, 'B');
  same('scenarios.pairgate.chooserPrefix', gate.chooserPrefix, CHOOSER);
  same('scenarios.pairgate.snapshotLogicFrame', gate.snapshotLogicFrame, 2000);
  same('scenarios.pairgate.watch', gate.watch, WATCH);
  if (!Array.isArray(gate.pairs)) fail('scenarios.pairgate.pairs', 'must be an array');
  same('scenarios.pairgate.pairs.length', gate.pairs.length, PAIR_KEYS.length);
  gate.pairs.forEach((pair, index) => {
    const where = `scenarios.pairgate.pairs[${index}]`;
    exactKeys(where, pair, ['ship', 'style', 'tail']);
    const key = PAIR_KEYS[index];
    const expected = pairOf(key);
    same(`${where}.ship`, pair.ship, expected.ship);
    same(`${where}.style`, pair.style, expected.style);
    same(`${where}.tail`, pair.tail, TAILS[key]);
  });
  return true;
}

const TRANSITIONS = {
  lastBuildA: { lf: 699, vf: 713 },
  firstBuildB: { lf: 700, vf: 722 },
  beforeSelectorCommit: { lf: 1616, vf: 1651 },
  selectorCommit: { lf: 1617, vf: 1652 },
  beforePlayerCreation: { lf: 1967, vf: 2003, p1State: 0 },
  playerCreated: { lf: 1968, vf: 2004 },
  liveSnapshot: { lf: 2000, vf: 2036 },
};

export function validatePairgateWitness(witness, defs) {
  validatePairgateScenarios(defs);
  exactKeys('witness', witness, ['schema', 'scope', 'oracle', 'capture', 'pairs']);
  same('witness.schema', witness.schema, 'ddpdoj-pairgate-selector-witness-v1');
  same('witness.scope', witness.scope, SCOPE);
  exactKeys('witness.oracle', witness.oracle,
    ['mame', 'set', 'build', 'maincpuSize', 'decryptedMaincpuFnv64']);
  same('witness.oracle.mame', witness.oracle.mame, '0.288 (mame0288)');
  same('witness.oracle.set', witness.oracle.set, 'ddpdojblk');
  same('witness.oracle.build', witness.oracle.build, 'B');
  same('witness.oracle.maincpuSize', witness.oracle.maincpuSize, 6291456);
  same('witness.oracle.decryptedMaincpuFnv64', witness.oracle.decryptedMaincpuFnv64,
    'D4C25CA9C91B9D47');
  exactKeys('witness.capture', witness.capture,
    ['frames', 'snapshotLogicFrame', 'snapshotPng', 'watch']);
  same('witness.capture.frames', witness.capture.frames, 2050);
  same('witness.capture.snapshotLogicFrame', witness.capture.snapshotLogicFrame, 2000);
  exactKeys('witness.capture.snapshotPng', witness.capture.snapshotPng, ['width', 'height']);
  same('witness.capture.snapshotPng.width', witness.capture.snapshotPng.width, 224);
  same('witness.capture.snapshotPng.height', witness.capture.snapshotPng.height, 448);
  same('witness.capture.watch', witness.capture.watch, WATCH);
  exactKeys('witness.pairs', witness.pairs, PAIR_KEYS);

  for (const key of PAIR_KEYS) {
    const pair = witness.pairs[key];
    const where = `witness.pairs[${JSON.stringify(key)}]`;
    exactKeys(where, pair, [
      'ship', 'style', 'script', 'trace', 'snapshotLf2000', 'transitions',
      'selectorCommit', 'playerCreated', 'liveLf2000',
    ]);
    const expected = pairOf(key);
    same(`${where}.ship`, pair.ship, expected.ship);
    same(`${where}.style`, pair.style, expected.style);
    same(`${where}.script`, pair.script, `${CHOOSER};${TAILS[key]}`);
    exactKeys(`${where}.trace`, pair.trace,
      ['rows', 'firstLogicFrame', 'lastLogicFrame', 'sha256']);
    same(`${where}.trace.rows`, pair.trace.rows, 2050);
    same(`${where}.trace.firstLogicFrame`, pair.trace.firstLogicFrame, 1);
    same(`${where}.trace.lastLogicFrame`, pair.trace.lastLogicFrame, 2050);
    same(`${where}.trace.sha256`, pair.trace.sha256, TRACE_HASHES[key]);
    exactKeys(`${where}.snapshotLf2000`, pair.snapshotLf2000, ['videoFrame', 'sha256']);
    same(`${where}.snapshotLf2000.videoFrame`, pair.snapshotLf2000.videoFrame, 2036);
    same(`${where}.snapshotLf2000.sha256`, pair.snapshotLf2000.sha256, PNG_HASHES[key]);
    exactKeys(`${where}.transitions`, pair.transitions, Object.keys(TRANSITIONS));
    for (const [name, transition] of Object.entries(TRANSITIONS)) {
      exactKeys(`${where}.transitions.${name}`, pair.transitions[name], Object.keys(transition));
      for (const [field, value] of Object.entries(transition)) {
        same(`${where}.transitions.${name}.${field}`, pair.transitions[name][field], value);
      }
    }
    checkFacts(`${where}.selectorCommit`, pair.selectorCommit, expectedFacts(key, false));
    checkFacts(`${where}.playerCreated`, pair.playerCreated, expectedFacts(key, true));
    checkFacts(`${where}.liveLf2000`, pair.liveLf2000, expectedFacts(key, true));
  }
  return true;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseTrace(traceBytes) {
  const lines = traceBytes.toString('utf8').trimEnd().split(/\r?\n/);
  if (lines.length < 2) fail('capture.trace', 'has no data rows');
  const header = lines[0].split('\t');
  const required = [
    'lf', 'vf', 'build', 'mb84', 'mb88', 'cur08', 'cur09', 'cship', 'cstyle',
    'p24', 'p25', 'img', 'hit', 'speed1a', 'laser38', 'speed39', 'powe4',
    'powe8', 'pstate',
  ];
  for (const name of required) {
    if (!header.includes(name)) fail('capture.trace.header', `missing ${name}`);
  }
  const rows = lines.slice(1).map((line, index) => {
    const fields = line.split('\t');
    if (fields.length !== header.length) fail(`capture.trace.row${index + 1}`, 'wrong column count');
    return Object.fromEntries(header.map((name, i) => [name, Number(fields[i])]));
  });
  return rows;
}

const TRACE_FACT = {
  mailboxShip: 'mb84', mailboxStyle: 'mb88', savedShipCursor: 'cur08',
  savedStyleCursor: 'cur09', cachedShip: 'cship', cachedStyle: 'cstyle',
  bombPlus24: 'p24', bombPlus25: 'p25', initialImageHighWord: 'img', hitboxHighWord: 'hit',
  speedIndex: 'speed1a', laserFloor: 'laser38', baseSpeed: 'speed39',
  powerCursorE4: 'powe4', powerCursorE8: 'powe8', p1State: 'pstate',
};

function factsFromRow(row) {
  return Object.fromEntries(FACT_KEYS.map((key) => [key, row[TRACE_FACT[key]]]));
}

export function validatePairgateCapture({ witness, defs, key, traceBytes, pngBytes }) {
  validatePairgateWitness(witness, defs);
  if (!PAIR_KEYS.includes(key)) fail('capture.key', `unknown pair ${JSON.stringify(key)}`);
  const expected = witness.pairs[key];
  same('capture.trace.sha256', sha256(traceBytes), expected.trace.sha256);
  const rows = parseTrace(traceBytes);
  same('capture.trace.rows', rows.length, expected.trace.rows);
  same('capture.trace.firstLogicFrame', rows[0].lf, expected.trace.firstLogicFrame);
  same('capture.trace.lastLogicFrame', rows.at(-1).lf, expected.trace.lastLogicFrame);
  const byLf = new Map(rows.map((row) => [row.lf, row]));
  const at = (lf) => {
    const row = byLf.get(lf);
    if (!row) fail('capture.trace', `missing logic frame ${lf}`);
    return row;
  };
  for (const [name, transition] of Object.entries(expected.transitions)) {
    const row = at(transition.lf);
    same(`capture.transitions.${name}.vf`, row.vf, transition.vf);
  }
  same('capture.transitions.lastBuildA.build', at(699).build, 1);
  same('capture.transitions.firstBuildB.build', at(700).build, 2);
  const beforeSelector = at(1616);
  for (const column of ['mb84', 'mb88', 'cur08', 'cur09']) {
    same(`capture.beforeSelectorCommit.${column}`, beforeSelector[column], 0);
  }
  if (rows.some((row) => row.lf < 700 && row.build === 2)) {
    fail('capture.transitions.firstBuildB', 'VERSION-B appeared before lf700');
  }
  if (rows.some((row) => row.lf > 699 && row.build === 1)) {
    fail('capture.transitions.lastBuildA', 'VERSION-A was retained after lf699');
  }
  checkFacts('capture.selectorCommit', factsFromRow(at(1617)), expected.selectorCommit);
  checkFacts('capture.playerCreated', factsFromRow(at(1968)), expected.playerCreated);
  checkFacts('capture.liveLf2000', factsFromRow(at(2000)), expected.liveLf2000);
  same('capture.beforePlayerCreation.p1State', at(1967).pstate, 0);
  const firstLive = rows.find((row) => row.pstate !== 0);
  same('capture.firstLivePlayer.lf', firstLive?.lf, 1968);

  same('capture.png.sha256', sha256(pngBytes), expected.snapshotLf2000.sha256);
  if (pngBytes.length < 24 || pngBytes.subarray(1, 4).toString('ascii') !== 'PNG') {
    fail('capture.png', 'not a PNG');
  }
  same('capture.png.width', pngBytes.readUInt32BE(16), 224);
  same('capture.png.height', pngBytes.readUInt32BE(20), 448);
  return true;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function usage() {
  console.error('usage: pairgate.mjs verify <witness.json> <scenarios.json>');
  console.error('   or: pairgate.mjs capture <witness.json> <scenarios.json> <ship,style> <trace.tsv> <lf2000.png>');
}

function main(argv) {
  const [command, witnessPath, scenariosPath, key, tracePath, pngPath] = argv;
  if (!command || !witnessPath || !scenariosPath) {
    usage();
    return 2;
  }
  const witness = readJson(witnessPath);
  const defs = readJson(scenariosPath);
  if (command === 'verify' && argv.length === 3) {
    validatePairgateWitness(witness, defs);
    console.log(`PAIRGATE VERIFY OK: ${PAIR_KEYS.length} selector pairs, tracked facts and hashes`);
    return 0;
  }
  if (command === 'capture' && argv.length === 6) {
    validatePairgateCapture({
      witness, defs, key,
      traceBytes: readFileSync(tracePath),
      pngBytes: readFileSync(pngPath),
    });
    console.log(`PAIRGATE CAPTURE OK: pair ${key}, trace and lf2000 PNG`);
    return 0;
  }
  usage();
  return 2;
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`PAIRGATE FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
