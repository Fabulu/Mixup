#!/usr/bin/env node
// W594 selector causality witness and fresh-capture verifier.
// Raw MAME traces and event streams remain ignored. The tracked witness retains
// exact identities, read reductions, pairwise divergences, and intervention facts.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAUSALITY_SCHEMA = 'ddpdoj-w594-selector-causality-v1';
export const CAUSALITY_PAIRS = Object.freeze(['0/2', '0/4', '0/6', '2/2', '2/4', '2/6']);
export const CAUSALITY_SUFFIX =
  '2001=R;2033=;2050=A;2051=;2070=A;2071=;2100=A;2240=AR;2300=A;2360=';
export const CAUSALITY_ANCESTRY = Object.freeze(['2634FA', '2634FE', '26353A', '263652']);
export const CAUSALITY_TRACE_COLUMNS = Object.freeze([
  'lf', 'vf', 'cyc', 'work', 'spin', 'irq4', 'irq6', 'rel', 'build', 'armpc',
  'sprites', 'objn', 'objord', 'objlive', 'd_spr', 'd_ram', 'd_date', 'd_top',
  'd_pal', 'd_spb', 'd_bg', 'd_tx', 'pix', 'c390a', 'c390d', 'c390e', 'c392e',
  'c3930', 'c3932', 'sem', 'c3942', 'p1raw', 'p1edge', 'p1prev', 'p2raw',
  'p2edge', 'irq4ph', 'portin', 'c_enemy', 'c_collision', 'c_bullets', 'c_player',
  'c_options', 'c_shots', 'c_segments', 'c_beamctl', 'c_beamstate', 'c_display',
  'c_pstate', 'c_py', 'c_px', 'c_p24', 'c_p25', 'c_speed', 'c_laser',
  'c_enemy_n0', 'c_enemy_n1', 'c_enemy_n2', 'c_bullet_n', 'c_rankclock0',
  'c_rankclock1', 'c_rank', 'c_rng', 'c_hyper0', 'c_hyper1', 'c_power0',
  'c_power1', 'c_prod5', 'c_prod14', 'c_prod15', 'c_prod16', 'c_prod19',
]);
export const CAUSALITY_STATE_COLUMNS = Object.freeze([
  'c_enemy', 'c_collision', 'c_bullets', 'c_player', 'c_options', 'c_shots',
  'c_segments', 'c_beamctl', 'c_beamstate', 'c_display', 'c_pstate', 'c_py',
  'c_px', 'c_p24', 'c_p25', 'c_speed', 'c_laser', 'c_enemy_n0', 'c_enemy_n1',
  'c_enemy_n2', 'c_bullet_n', 'c_rankclock0', 'c_rankclock1', 'c_rank', 'c_rng',
  'c_hyper0', 'c_hyper1', 'c_power0', 'c_power1', 'c_prod5', 'c_prod14',
  'c_prod15', 'c_prod16', 'c_prod19',
]);
export const CAUSALITY_EVENT_COLUMNS = Object.freeze([
  'seq', 'kind', 'resultlf', 'cyc', 'pc', 'address', 'data', 'mask', 'prior',
  'a7', 'stackbase', 's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7',
]);
const NATURAL_EVENT_KINDS = Object.freeze([
  'bullet-spawn', 'enemy-allocator', 'enemy-handler', 'enemy-hp', 'enemy-init', 'selector',
]);
const INTERVENTION_EVENT_KINDS = Object.freeze([...NATURAL_EVENT_KINDS, 'selector-substitute']);
const BASELINE_WORDS = Object.freeze({
  '81043E': '0000', '810440': '0002', '8104A0': '0000', '8104A2': '0000',
  '813084': '0000', '813086': '00FF', '813088': '0002', '81308A': '00FF',
});
const HEX4 = /^[0-9A-F]{4}$/;
const HEX6 = /^[0-9A-F]{6}$/;
const HEX8 = /^[0-9A-F]{8}$/;
const SHA256 = /^[0-9a-f]{64}$/;

// Filled from the sorted-key canonical form after every intended witness update.
export const CAUSALITY_WITNESS_SHA256 =
  '039e84b8583d981bf27c60730141898d8d2a5e7f1706420c1c1a62f7ddafa10d';

function fail(message) { throw new Error(`W594 witness: ${message}`); }
function need(value, message) { if (!value) fail(message); }
function integer(value, label) { need(Number.isInteger(value), `${label} is not an integer`); }
function sha(value, label) { need(typeof value === 'string' && SHA256.test(value), `${label} is not SHA-256`); }
function exactKeys(object, expected, label) {
  need(object && typeof object === 'object' && !Array.isArray(object), `${label} is not an object`);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].map(String).sort();
  need(JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} keys ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function bytesOf(payload, label) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const text = bytes.toString('utf8');
  need(Buffer.from(text).equals(bytes), `${label} is not canonical UTF-8`);
  return { bytes, text };
}
function linesOf(payload, label) {
  const { bytes, text } = bytesOf(payload, label);
  need(bytes.at(-1) === 0x0a, `${label} has no terminal newline`);
  const lines = text.slice(0, -1).split('\n');
  need(lines.length > 1 && lines.every((line) => line !== ''), `${label} has empty or missing rows`);
  return { bytes, lines };
}

export function causalityWitnessSha256(witness) {
  return createHash('sha256').update(canonical(witness)).digest('hex');
}

export function substituteSelectorWord(data, mask, wanted) {
  need(Number.isInteger(data) && data >= 0 && data <= 0xffff, 'selector data is not a word');
  need(Number.isInteger(mask) && mask >= 0 && mask <= 0xffff, 'selector mask is not a word');
  need(Number.isInteger(wanted) && wanted >= 0 && wanted <= 0xffff,
    'selector baseline is not a word');
  return ((data & (~mask & 0xffff)) | (wanted & mask)) & 0xffff;
}

export function shouldSubstituteSelectorRead({ pc, address, mask, ancestry } = {}) {
  return pc === '2862C8'
    && address === '81043E'
    && mask === 'FFFF'
    && Array.isArray(ancestry)
    && ancestry.includes('2634FE')
    && ancestry.includes('26353A');
}

export function normalizeCausalityTrace(payload) {
  const { lines } = linesOf(payload, 'causal trace');
  const columns = lines[0].split('\t');
  need(JSON.stringify(columns) === JSON.stringify(CAUSALITY_TRACE_COLUMNS),
    'causal trace columns changed');
  const dateColumn = columns.indexOf('d_date');
  const normalized = [];
  for (let index = 0; index < lines.length; index++) {
    const fields = lines[index].split('\t');
    need(fields.length === columns.length, `causal trace line ${index + 1} width changed`);
    fields.splice(dateColumn, 1);
    normalized.push(fields.join('\t'));
  }
  return Buffer.from(`${normalized.join('\n')}\n`);
}

function parseTrace(payload) {
  const { lines } = linesOf(payload, 'causal trace');
  const columns = lines[0].split('\t');
  need(JSON.stringify(columns) === JSON.stringify(CAUSALITY_TRACE_COLUMNS),
    'causal trace columns changed');
  const rows = lines.slice(1).map((line, index) => {
    const fields = line.split('\t');
    need(fields.length === columns.length, `causal trace row ${index + 1} width changed`);
    const row = Object.fromEntries(columns.map((name, column) => [name, fields[column]]));
    need(Number(row.lf) === index + 1, `causal trace logic frame ${index + 1} changed`);
    const inWindow = index + 1 >= 2000 && index + 1 <= 2371;
    for (const name of CAUSALITY_STATE_COLUMNS) {
      need(inWindow ? row[name] !== '' : row[name] === '',
        `causal trace LF${index + 1} ${name} window coverage changed`);
    }
    return row;
  });
  return { columns, rows };
}

function ancestryOf(row) {
  const stack = Array.from({ length: 8 }, (_, index) => row[`s${index}`].slice(2).toUpperCase());
  return CAUSALITY_ANCESTRY.filter((address) => stack.includes(address));
}

function parseEvents(payload, arm) {
  need(arm === 'natural' || arm === 'intervention', `unknown event arm ${JSON.stringify(arm)}`);
  const { bytes, lines } = linesOf(payload, `${arm} events`);
  const columns = lines[0].split('\t');
  need(JSON.stringify(columns) === JSON.stringify(CAUSALITY_EVENT_COLUMNS),
    `${arm} event columns changed`);
  const allowed = arm === 'natural' ? NATURAL_EVENT_KINDS : INTERVENTION_EVENT_KINDS;
  const rows = lines.slice(1).map((line, index) => {
    const fields = line.split('\t');
    need(fields.length === columns.length, `${arm} event row ${index + 1} width changed`);
    const row = Object.fromEntries(columns.map((name, column) => [name, fields[column]]));
    need(Number(row.seq) === index + 1, `${arm} event sequence ${index + 1} changed`);
    need(allowed.includes(row.kind), `${arm} event kind ${JSON.stringify(row.kind)} changed`);
    const lf = Number(row.resultlf);
    need(Number.isInteger(lf) && lf >= 2000 && lf <= 2371,
      `${arm} event ${index + 1} is outside the requested result-frame bounds`);
    need(/^\d+$/.test(row.cyc), `${arm} event ${index + 1} cycle is malformed`);
    need(HEX6.test(row.pc) && HEX6.test(row.address) && HEX4.test(row.data)
      && HEX4.test(row.mask) && (row.prior === '' || HEX4.test(row.prior))
      && HEX6.test(row.a7) && HEX6.test(row.stackbase),
    `${arm} event ${index + 1} scalar encoding changed`);
    for (let stack = 0; stack < 8; stack++) {
      need(HEX8.test(row[`s${stack}`]), `${arm} event ${index + 1} stack ${stack} changed`);
    }
    const a7 = Number.parseInt(row.a7, 16);
    const base = Number.parseInt(row.stackbase, 16);
    need((base & 3) === 0 && base >= 0x800000 && base + 31 <= 0x81ffff,
      `${arm} event ${index + 1} stack window is outside SRAM`);
    need(a7 >= base && a7 <= base + 31,
      `${arm} event ${index + 1} A7 is outside its stack window`);
    row.ancestry = ancestryOf(row);
    return row;
  });
  return { bytes, rows };
}

function censusOf(rows) {
  const census = {};
  for (const row of rows) census[row.kind] = (census[row.kind] || 0) + 1;
  return Object.fromEntries(Object.entries(census).sort(([a], [b]) => a.localeCompare(b)));
}

export function selectorReadSummary(rows, kind = 'selector') {
  const groups = new Map();
  for (const row of rows) {
    if (row.kind !== kind) continue;
    const ancestry = row.ancestry || ancestryOf(row);
    const value = kind === 'selector-substitute' ? row.prior : row.data;
    const returned = kind === 'selector-substitute' ? row.data : undefined;
    const tuple = [row.pc, row.address, row.mask, value, returned || '', ...ancestry].join('|');
    let fact = groups.get(tuple);
    if (!fact) {
      fact = {
        pc: row.pc, address: row.address, mask: row.mask, value,
        count: 0, firstLogicFrame: Number(row.resultlf), lastLogicFrame: Number(row.resultlf),
        ancestry,
      };
      if (returned !== undefined) fact.returned = returned;
      groups.set(tuple, fact);
    }
    fact.count += 1;
    fact.firstLogicFrame = Math.min(fact.firstLogicFrame, Number(row.resultlf));
    fact.lastLogicFrame = Math.max(fact.lastLogicFrame, Number(row.resultlf));
  }
  return [...groups.values()].sort((a, b) => {
    const ak = [a.pc, a.address, a.mask, a.value, a.returned || '', a.ancestry.join(',')].join('|');
    const bk = [b.pc, b.address, b.mask, b.value, b.returned || '', b.ancestry.join(',')].join('|');
    return ak.localeCompare(bk);
  });
}

export function semanticEventOrder(payload, arm) {
  const parsed = parseEvents(payload, arm);
  const columns = ['kind', 'resultlf', 'pc', 'address', 'data', 'mask', 'prior', 'a7'];
  const lines = [columns.join('\t')];
  for (const row of parsed.rows) {
    if (row.kind === 'selector-substitute') continue;
    lines.push(columns.map((name) => row[name]).join('\t'));
  }
  return Buffer.from(`${lines.join('\n')}\n`);
}

export function filterInterventionEvents(payload) {
  const parsed = parseEvents(payload, 'intervention');
  const header = CAUSALITY_EVENT_COLUMNS.join('\t');
  let sequence = 0;
  const lines = [header];
  for (const row of parsed.rows) {
    if (row.kind === 'selector-substitute') continue;
    sequence += 1;
    lines.push(CAUSALITY_EVENT_COLUMNS.map((name) => name === 'seq' ? String(sequence) : row[name]).join('\t'));
  }
  return Buffer.from(`${lines.join('\n')}\n`);
}

function firstTraceDivergences(naturalPayload, interventionPayload) {
  const natural = parseTrace(naturalPayload);
  const intervention = parseTrace(interventionPayload);
  need(natural.rows.length === intervention.rows.length, 'intervention trace row count changed');
  const changed = {};
  for (const column of CAUSALITY_TRACE_COLUMNS) {
    if (column === 'd_date') continue;
    const row = natural.rows.findIndex((entry, index) => entry[column] !== intervention.rows[index][column]);
    if (row >= 0) changed[column] = row + 1;
  }
  return changed;
}

export function verifyCausalityScenarios(scenarios) {
  const spec = scenarios?.paircausality;
  need(spec?.schema === 'ddpdoj-pair-causality-scenarios-v1', 'scenario schema changed');
  exactKeys(spec, [
    'schema', 'why', 'frames', 'fromLogicFrame', 'toLogicFrame', 'suffix',
    'selectorRanges', 'ancestryReturns', 'eventPcs', 'intervention', 'baselineWords',
  ], 'causality scenario');
  need(spec.frames === 2372 && Number(spec.fromLogicFrame) === 2000
    && Number(spec.toLogicFrame) === 2371, 'scenario bounds changed');
  need(spec.why
    === 'W594 runs the unchanged W593 natural suffix and separates direct enemy selector reads from earlier player-position, hit, RNG, rank, and damage causes.',
  'scenario purpose changed');
  need(spec.suffix === CAUSALITY_SUFFIX, 'scenario suffix changed');
  need(spec.selectorRanges === '813084-81308B,81043E-810441,8104A0-8104A3',
    'scenario selector ranges changed');
  need(spec.ancestryReturns === CAUSALITY_ANCESTRY.join(','),
    'scenario ancestry returns changed');
  need(spec.eventPcs === '24505E,245A44,281568,28187A,263538,263650,2636D6',
    'scenario event PCs changed');
  need(spec.intervention === 'ancestry-classified-reads-only-to-0/2',
    'scenario intervention changed');
  need(spec.baselineWords
    === '813084=0000,813086=00FF,813088=0002,81308A=00FF,81043E=0000,810440=0002,8104A0=0000,8104A2=0000',
  'scenario baseline selector words changed');
  return true;
}

function verifySelectorFact(fact, label, intervention = false) {
  exactKeys(fact, intervention
    ? ['pc', 'address', 'mask', 'value', 'returned', 'count', 'firstLogicFrame',
      'lastLogicFrame', 'ancestry']
    : ['pc', 'address', 'mask', 'value', 'count', 'firstLogicFrame',
      'lastLogicFrame', 'ancestry'], label);
  need(HEX6.test(fact.pc) && HEX6.test(fact.address) && HEX4.test(fact.mask)
    && HEX4.test(fact.value) && (!intervention || HEX4.test(fact.returned)),
  `${label} encoding changed`);
  integer(fact.count, `${label} count`);
  integer(fact.firstLogicFrame, `${label} first logic frame`);
  integer(fact.lastLogicFrame, `${label} last logic frame`);
  need(fact.count > 0 && fact.firstLogicFrame >= 2000
    && fact.lastLogicFrame <= 2371 && fact.firstLogicFrame <= fact.lastLogicFrame,
  `${label} bounds changed`);
  need(Array.isArray(fact.ancestry)
    && fact.ancestry.every((entry) => CAUSALITY_ANCESTRY.includes(entry)),
  `${label} ancestry changed`);
}

function verifyIdentity(identity, label, intervention = false) {
  exactKeys(identity, intervention
    ? ['logicFrames', 'rows', 'bytes', 'sha256', 'census', 'filteredSha256', 'orderSha256']
    : ['logicFrames', 'rows', 'bytes', 'sha256', 'census', 'orderSha256'], label);
  need(JSON.stringify(identity.logicFrames) === JSON.stringify([2000, 2371]),
    `${label} bounds changed`);
  integer(identity.rows, `${label} rows`);
  integer(identity.bytes, `${label} bytes`);
  need(identity.rows > 0 && identity.bytes > 0, `${label} is empty`);
  sha(identity.sha256, `${label} digest`);
  sha(identity.orderSha256, `${label} semantic order digest`);
  if (intervention) sha(identity.filteredSha256, `${label} filtered digest`);
  const kinds = intervention ? INTERVENTION_EVENT_KINDS : NATURAL_EVENT_KINDS;
  exactKeys(identity.census, kinds, `${label} census`);
  let sum = 0;
  for (const kind of kinds) {
    integer(identity.census[kind], `${label} ${kind} count`);
    need(identity.census[kind] > 0, `${label} has no ${kind} events`);
    sum += identity.census[kind];
  }
  need(sum === identity.rows, `${label} census does not sum to rows`);
}

function verifyTraceIdentity(trace, label) {
  exactKeys(trace, ['logicFrames', 'causalLogicFrames', 'rows', 'normalizedBytes',
    'normalization', 'sha256'], label);
  need(JSON.stringify(trace.logicFrames) === JSON.stringify([1, 2372])
    && JSON.stringify(trace.causalLogicFrames) === JSON.stringify([2000, 2371]),
  `${label} bounds changed`);
  need(trace.rows === 2372 && trace.normalization === 'omit-d_date-only-v1',
    `${label} coverage changed`);
  integer(trace.normalizedBytes, `${label} normalized bytes`);
  need(trace.normalizedBytes > 0, `${label} is empty`);
  sha(trace.sha256, `${label} digest`);
}

export function verifyCausalityWitness(witness) {
  exactKeys(witness, ['schema', 'oracle', 'scenario', 'verdict', 'reader',
    'causalColumns', 'pairs', 'comparisons'], 'witness');
  need(witness.schema === CAUSALITY_SCHEMA, `schema ${JSON.stringify(witness.schema)}`);
  exactKeys(witness.oracle, ['emulator', 'set', 'version', 'decryptedMainCpu'], 'oracle');
  need(witness.oracle.emulator === 'MAME 0.288' && witness.oracle.set === 'ddpdojblk'
    && witness.oracle.version === 'B', 'oracle identity changed');
  exactKeys(witness.oracle.decryptedMainCpu, ['size', 'fnv64'], 'main CPU identity');
  need(witness.oracle.decryptedMainCpu.size === 6291456
    && witness.oracle.decryptedMainCpu.fnv64 === 'D4C25CA9C91B9D47',
  'decrypted main CPU identity changed');

  exactKeys(witness.scenario, ['frames', 'logicFrames', 'suffix', 'selectorRanges',
    'ancestryReturns', 'ancestryCallSites', 'eventPcs', 'baselineWords', 'intervention'],
  'witness scenario');
  need(witness.scenario.frames === 2372
    && JSON.stringify(witness.scenario.logicFrames) === JSON.stringify([2000, 2371]),
  'witness scenario bounds changed');
  need(witness.scenario.suffix === CAUSALITY_SUFFIX, 'witness scenario suffix changed');
  need(JSON.stringify(witness.scenario.selectorRanges) === JSON.stringify([
    ['813084', '81308B'], ['81043E', '810441'], ['8104A0', '8104A3'],
  ]), 'witness selector ranges changed');
  need(JSON.stringify(witness.scenario.ancestryReturns) === JSON.stringify(CAUSALITY_ANCESTRY),
    'witness ancestry returns changed');
  need(JSON.stringify(witness.scenario.ancestryCallSites) === JSON.stringify([
    '2634F6', '2634FA', '263538', '263650',
  ]), 'witness ancestry call sites changed');
  need(JSON.stringify(witness.scenario.eventPcs) === JSON.stringify([
    '24505E', '245A44', '281568', '28187A', '263538', '263650', '2636D6',
  ]), 'witness event PCs changed');
  need(JSON.stringify(witness.scenario.baselineWords) === JSON.stringify(BASELINE_WORDS),
    'witness baseline words changed');
  need(witness.scenario.intervention === 'ancestry-classified-reads-only-to-0/2',
    'witness intervention changed');
  need(JSON.stringify(witness.causalColumns) === JSON.stringify(CAUSALITY_STATE_COLUMNS),
    'causal column list changed');

  exactKeys(witness.verdict, ['directEnemyAncestryReadObserved',
    'firstEnemyAndBulletDivergencesAreIndirect', 'directWaveSchedulingObserved',
    'directObservedEffect', 'sourceStatus', 'interventionStatus'], 'verdict');
  need(witness.verdict.directEnemyAncestryReadObserved === true
    && witness.verdict.firstEnemyAndBulletDivergencesAreIndirect === true
    && witness.verdict.directWaveSchedulingObserved === false,
  'causality verdict changed');
  need(witness.verdict.directObservedEffect
    === 'per-hit-chain-meter-refill-and-score-display-only',
    'direct effect is overstated or changed');
  need(witness.verdict.sourceStatus === 'src/score.js chainHit already performs the exact lookup',
    'source status changed');
  need(witness.verdict.interventionStatus
    === '0/2 control unchanged; no enemy, collision, bullet, damage, rank, or RNG state changed',
  'intervention verdict changed');

  exactKeys(witness.reader, ['pc', 'address', 'mask', 'instruction', 'continuation',
    'table', 'ancestry', 'classification'], 'direct reader');
  need(witness.reader.pc === '2862C8' && witness.reader.address === '81043E'
    && witness.reader.mask === 'FFFF'
    && witness.reader.instruction === 'move.w $81043E.l,D2',
  'direct reader instruction changed');
  need(JSON.stringify(witness.reader.continuation) === JSON.stringify([
    '2862CE lea $287DF4.l,A0', '2862D4 move.w (A0,D2.w),$81B5E0.l',
  ]), 'direct reader continuation changed');
  need(JSON.stringify(witness.reader.table) === JSON.stringify({
    address: '287DF4', indexScaling: 'none-selector-is-byte-offset',
    entries: [{ selector: 0, refill: 20 }, { selector: 2, refill: 18 }],
  }), 'direct reader table meaning changed');
  need(JSON.stringify(witness.reader.ancestry) === JSON.stringify(['2634FE', '26353A']),
    'direct reader ancestry changed');
  need(witness.reader.classification === 'enemy-hit-chain-refill-not-wave-scheduling',
    'direct reader classification changed');

  need(Array.isArray(witness.pairs) && witness.pairs.length === CAUSALITY_PAIRS.length,
    'pair count is not six');
  const pairs = new Map();
  for (const pair of witness.pairs) {
    exactKeys(pair, ['key', 'ship', 'style', 'trace', 'events', 'selectorReads',
      'intervention'], `${pair?.key || 'unknown'} pair`);
    need(CAUSALITY_PAIRS.includes(pair.key) && !pairs.has(pair.key),
      `unknown or duplicate pair ${JSON.stringify(pair.key)}`);
    need(pair.key === `${pair.ship}/${pair.style}`, `${pair.key} selector fields disagree`);
    pairs.set(pair.key, pair);
    verifyTraceIdentity(pair.trace, `${pair.key} natural trace`);
    verifyIdentity(pair.events, `${pair.key} natural events`);
    need(Array.isArray(pair.selectorReads) && pair.selectorReads.length > 0,
      `${pair.key} has no selector read summary`);
    pair.selectorReads.forEach((fact, index) =>
      verifySelectorFact(fact, `${pair.key} selector read ${index}`));
    need(pair.selectorReads.reduce((sum, fact) => sum + fact.count, 0)
      === pair.events.census.selector, `${pair.key} selector summary count changed`);
    const direct = pair.selectorReads.filter((fact) => fact.ancestry.length > 0);
    need(direct.length === 1, `${pair.key} direct selector reader count changed`);
    need(direct[0].pc === witness.reader.pc && direct[0].address === witness.reader.address
      && direct[0].mask === witness.reader.mask
      && JSON.stringify(direct[0].ancestry) === JSON.stringify(witness.reader.ancestry),
    `${pair.key} direct selector identity changed`);
    need(direct[0].value === (pair.ship === 0 ? '0000' : '0002'),
      `${pair.key} direct selector value changed`);

    exactKeys(pair.intervention, ['target', 'trace', 'events', 'substitutions',
      'changedTraceColumns', 'changedCausalColumns'], `${pair.key} intervention`);
    need(pair.intervention.target === '0/2', `${pair.key} intervention target changed`);
    verifyTraceIdentity(pair.intervention.trace, `${pair.key} intervention trace`);
    verifyIdentity(pair.intervention.events, `${pair.key} intervention events`, true);
    need(Array.isArray(pair.intervention.substitutions)
      && pair.intervention.substitutions.length === 1,
    `${pair.key} substitution identity count changed`);
    verifySelectorFact(pair.intervention.substitutions[0],
      `${pair.key} selector substitution`, true);
    const substitution = pair.intervention.substitutions[0];
    need(substitution.pc === direct[0].pc && substitution.address === direct[0].address
      && substitution.mask === direct[0].mask && substitution.value === direct[0].value
      && substitution.returned === '0000' && substitution.count === direct[0].count
      && substitution.firstLogicFrame === direct[0].firstLogicFrame
      && substitution.lastLogicFrame === direct[0].lastLogicFrame
      && JSON.stringify(substitution.ancestry) === JSON.stringify(direct[0].ancestry),
    `${pair.key} substitution did not cover exactly the direct reads`);
    need(pair.intervention.events.census['selector-substitute'] === direct[0].count,
      `${pair.key} substitution event count changed`);
    need(pair.intervention.events.orderSha256 === pair.events.orderSha256,
      `${pair.key} intervention changed semantic event ordering`);
    exactKeys(pair.intervention.changedTraceColumns,
      Object.keys(pair.intervention.changedTraceColumns), `${pair.key} changed trace columns`);
    for (const [column, logicFrame] of Object.entries(pair.intervention.changedTraceColumns)) {
      need(CAUSALITY_TRACE_COLUMNS.includes(column) && column !== 'd_date',
        `${pair.key} unknown changed trace column ${column}`);
      integer(logicFrame, `${pair.key} ${column} first divergence`);
      need(logicFrame >= 2000 && logicFrame <= 2372,
        `${pair.key} ${column} divergence is outside the experiment`);
    }
    need(Array.isArray(pair.intervention.changedCausalColumns),
      `${pair.key} intervention causal-column reduction is not an array`);
    const expectedCausalChanges = pair.ship === 0 ? [] : ['c_display'];
    need(JSON.stringify(pair.intervention.changedCausalColumns)
      === JSON.stringify(expectedCausalChanges),
    `${pair.key} intervention changed enemy, collision, bullet, damage, rank, RNG, or producer state`);
    if (pair.ship === 2) {
      need(pair.intervention.changedTraceColumns.c_display === direct[0].firstLogicFrame,
        `${pair.key} display change did not begin with the first substituted chain refill`);
    }
    if (pair.key === '0/2') {
      need(pair.intervention.trace.sha256 === pair.trace.sha256
        && pair.intervention.events.filteredSha256 === pair.events.sha256
        && Object.keys(pair.intervention.changedTraceColumns).length === 0,
      'unchanged 0/2 intervention control changed state or events');
    }
  }
  need([...pairs.keys()].sort().join(',') === [...CAUSALITY_PAIRS].sort().join(','),
    'one or more authentic pairs are absent');

  const expectedComparisons = [];
  for (let left = 0; left < CAUSALITY_PAIRS.length; left++) {
    for (let right = left + 1; right < CAUSALITY_PAIRS.length; right++) {
      expectedComparisons.push(`${CAUSALITY_PAIRS[left]}|${CAUSALITY_PAIRS[right]}`);
    }
  }
  need(Array.isArray(witness.comparisons) && witness.comparisons.length === 15,
    'pairwise comparison count is not 15');
  const seenComparisons = new Set();
  for (const comparison of witness.comparisons) {
    exactKeys(comparison, ['key', 'left', 'right', 'sameShip', 'firstDivergence',
      'enemyCause', 'bulletCause', 'directReadExplanation'],
    `${comparison?.key || 'unknown'} comparison`);
    need(comparison.key === `${comparison.left}|${comparison.right}`
      && expectedComparisons.includes(comparison.key) && !seenComparisons.has(comparison.key),
    `unknown or duplicate comparison ${JSON.stringify(comparison.key)}`);
    seenComparisons.add(comparison.key);
    const left = pairs.get(comparison.left);
    const right = pairs.get(comparison.right);
    need(left && right, `${comparison.key} names an unknown pair`);
    need(comparison.sameShip === (left.ship === right.ship),
      `${comparison.key} same-ship classification changed`);
    exactKeys(comparison.firstDivergence, CAUSALITY_STATE_COLUMNS,
      `${comparison.key} first divergences`);
    for (const [column, logicFrame] of Object.entries(comparison.firstDivergence)) {
      need(logicFrame === null || (Number.isInteger(logicFrame)
        && logicFrame >= 2000 && logicFrame <= 2371),
      `${comparison.key} ${column} first divergence is invalid`);
    }
    const causeField = comparison.sameShip ? 'c_rng' : 'c_px';
    const explanation = comparison.sameShip ? 'same-ship-selector-value-is-identical'
      : 'first-direct-read-occurs-after-both-targets';
    for (const [name, targetColumn] of [['enemyCause', 'c_enemy'], ['bulletCause', 'c_bullets']]) {
      const cause = comparison[name];
      exactKeys(cause, ['field', 'logicFrame', 'targetLogicFrame'],
        `${comparison.key} ${name}`);
      need(cause.field === causeField
        && cause.logicFrame === comparison.firstDivergence[causeField]
        && cause.targetLogicFrame === comparison.firstDivergence[targetColumn]
        && Number.isInteger(cause.logicFrame) && Number.isInteger(cause.targetLogicFrame)
        && cause.logicFrame < cause.targetLogicFrame,
      `${comparison.key} ${name} is not strictly earlier than its target`);
    }
    need(comparison.directReadExplanation === explanation,
      `${comparison.key} direct-read explanation changed`);
    if (!comparison.sameShip) {
      const firstDirect = Math.min(
        ...left.selectorReads.filter((fact) => fact.ancestry.length).map((fact) => fact.firstLogicFrame),
        ...right.selectorReads.filter((fact) => fact.ancestry.length).map((fact) => fact.firstLogicFrame));
      need(firstDirect > comparison.enemyCause.targetLogicFrame
        && firstDirect > comparison.bulletCause.targetLogicFrame,
      `${comparison.key} direct read no longer follows both first targets`);
    }
  }
  need([...seenComparisons].sort().join(',') === expectedComparisons.sort().join(','),
    'pairwise comparison matrix changed');
  need(causalityWitnessSha256(witness) === CAUSALITY_WITNESS_SHA256,
    'canonical digest changed');
  return true;
}

export function verifyCausalityTrace(witness, pairKey, arm, payload) {
  const pair = witness?.pairs?.find((entry) => entry.key === pairKey);
  need(pair, `trace pair ${JSON.stringify(pairKey)} is not authentic`);
  need(arm === 'natural' || arm === 'intervention', `unknown trace arm ${JSON.stringify(arm)}`);
  const identity = arm === 'natural' ? pair.trace : pair.intervention.trace;
  const parsed = parseTrace(payload);
  need(parsed.rows.length === identity.rows, `${pairKey} ${arm} trace row count changed`);
  const normalized = normalizeCausalityTrace(payload);
  need(normalized.length === identity.normalizedBytes,
    `${pairKey} ${arm} normalized trace byte count changed`);
  need(createHash('sha256').update(normalized).digest('hex') === identity.sha256,
    `${pairKey} ${arm} normalized trace SHA-256 changed`);
  return true;
}

export function verifyCausalityEvents(witness, pairKey, arm, payload) {
  const pair = witness?.pairs?.find((entry) => entry.key === pairKey);
  need(pair, `event pair ${JSON.stringify(pairKey)} is not authentic`);
  need(arm === 'natural' || arm === 'intervention', `unknown event arm ${JSON.stringify(arm)}`);
  const identity = arm === 'natural' ? pair.events : pair.intervention.events;
  const parsed = parseEvents(payload, arm);
  need(parsed.rows.length === identity.rows && parsed.bytes.length === identity.bytes,
    `${pairKey} ${arm} event size changed`);
  need(createHash('sha256').update(parsed.bytes).digest('hex') === identity.sha256,
    `${pairKey} ${arm} event SHA-256 changed`);
  need(JSON.stringify(censusOf(parsed.rows)) === JSON.stringify(identity.census),
    `${pairKey} ${arm} event census changed`);
  const order = semanticEventOrder(payload, arm);
  need(createHash('sha256').update(order).digest('hex') === identity.orderSha256,
    `${pairKey} ${arm} semantic event ordering changed`);
  const summary = selectorReadSummary(parsed.rows,
    arm === 'natural' ? 'selector' : 'selector-substitute');
  const expected = arm === 'natural' ? pair.selectorReads : pair.intervention.substitutions;
  need(JSON.stringify(summary) === JSON.stringify(expected),
    `${pairKey} ${arm} selector read reduction changed`);
  if (arm === 'intervention') {
    const filtered = filterInterventionEvents(payload);
    need(createHash('sha256').update(filtered).digest('hex') === identity.filteredSha256,
      `${pairKey} intervention changed non-substitution events`);
    const rows = parsed.rows;
    for (let index = 0; index < rows.length; index++) {
      if (rows[index].kind !== 'selector-substitute') continue;
      const original = rows[index - 1];
      need(original?.kind === 'selector' && original.pc === rows[index].pc
        && original.address === rows[index].address && original.mask === rows[index].mask
        && original.data === rows[index].prior && original.resultlf === rows[index].resultlf
        && original.cyc === rows[index].cyc
        && JSON.stringify(original.ancestry) === JSON.stringify(rows[index].ancestry)
        && shouldSubstituteSelectorRead(original)
        && shouldSubstituteSelectorRead(rows[index]),
      `${pairKey} substitution event is not paired with exactly one eligible direct read`);
      const wanted = Number.parseInt(BASELINE_WORDS[rows[index].address], 16);
      need(Number.isInteger(wanted), `${pairKey} substitution address has no 0/2 word`);
      need(Number.parseInt(rows[index].data, 16) === substituteSelectorWord(
        Number.parseInt(original.data, 16), Number.parseInt(original.mask, 16), wanted),
      `${pairKey} substitution has incorrect big-endian lane merging`);
    }
  }
  return true;
}

export function verifyCausalityComparison(witness, pairKey,
  naturalTrace, naturalEvents, interventionTrace, interventionEvents) {
  verifyCausalityTrace(witness, pairKey, 'natural', naturalTrace);
  verifyCausalityEvents(witness, pairKey, 'natural', naturalEvents);
  verifyCausalityTrace(witness, pairKey, 'intervention', interventionTrace);
  verifyCausalityEvents(witness, pairKey, 'intervention', interventionEvents);
  const pair = witness.pairs.find((entry) => entry.key === pairKey);
  const changed = firstTraceDivergences(naturalTrace, interventionTrace);
  need(JSON.stringify(changed) === JSON.stringify(pair.intervention.changedTraceColumns),
    `${pairKey} intervention first-divergence columns changed`);
  const changedCausal = Object.keys(changed).filter((column) =>
    CAUSALITY_STATE_COLUMNS.includes(column));
  need(JSON.stringify(changedCausal) === JSON.stringify(pair.intervention.changedCausalColumns),
    `${pairKey} intervention causal-column verdict changed`);
  const naturalOrder = semanticEventOrder(naturalEvents, 'natural');
  const interventionOrder = semanticEventOrder(interventionEvents, 'intervention');
  need(interventionOrder.equals(naturalOrder),
    `${pairKey} intervention changed semantic event ordering`);
  if (pairKey === '0/2') {
    const filtered = filterInterventionEvents(interventionEvents);
    need(filtered.equals(Buffer.isBuffer(naturalEvents) ? naturalEvents : Buffer.from(naturalEvents)),
      '0/2 intervention control changed an event outside substitution records');
  }
  return true;
}

function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let file = path.join(here, 'oracle', 'w594-selector-causality.json');
  let pair = null;
  let arm = null;
  let trace = null;
  let events = null;
  let naturalTrace = null;
  let naturalEvents = null;
  let interventionTrace = null;
  let interventionEvents = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--pair') pair = argv[++index];
    else if (arg === '--arm') arm = argv[++index];
    else if (arg === '--trace') trace = argv[++index];
    else if (arg === '--events') events = argv[++index];
    else if (arg === '--natural-trace') naturalTrace = argv[++index];
    else if (arg === '--natural-events') naturalEvents = argv[++index];
    else if (arg === '--intervention-trace') interventionTrace = argv[++index];
    else if (arg === '--intervention-events') interventionEvents = argv[++index];
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
    else if (file !== path.join(here, 'oracle', 'w594-selector-causality.json')) {
      fail('more than one witness path');
    } else file = arg;
  }
  const captureMode = trace !== null || events !== null || arm !== null;
  const compareMode = naturalTrace !== null || naturalEvents !== null
    || interventionTrace !== null || interventionEvents !== null;
  need(!(captureMode && compareMode), 'capture and comparison modes are separate');
  need(!captureMode || (pair && arm && trace && events),
    '--pair, --arm, --trace and --events are required together');
  need(!compareMode || (pair && naturalTrace && naturalEvents
    && interventionTrace && interventionEvents),
  'comparison mode requires one pair and all four capture paths');
  need(captureMode || compareMode || pair === null,
    '--pair requires a capture or comparison mode');
  const witness = JSON.parse(readFileSync(file, 'utf8'));
  const scenarios = JSON.parse(readFileSync(path.join(here, 'oracle', 'scenarios.json'), 'utf8'));
  verifyCausalityScenarios(scenarios);
  verifyCausalityWitness(witness);
  if (captureMode) {
    verifyCausalityTrace(witness, pair, arm, readFileSync(trace));
    verifyCausalityEvents(witness, pair, arm, readFileSync(events));
    console.log(`CAUSALITYGATE CAPTURE OK: ${pair} ${arm}`);
  } else if (compareMode) {
    verifyCausalityComparison(witness, pair,
      readFileSync(naturalTrace), readFileSync(naturalEvents),
      readFileSync(interventionTrace), readFileSync(interventionEvents));
    console.log(`CAUSALITYGATE INTERVENTION OK: ${pair}`);
  } else {
    console.log(`CAUSALITYGATE VERIFY OK: ${CAUSALITY_PAIRS.length} pairs, 15 comparisons`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(String(error.stack || error));
    process.exitCode = 1;
  }
}
