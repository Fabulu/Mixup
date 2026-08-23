import { GAME_CATALOGUE, GAME_IDS } from './catalogue.js';

const ARCHIVE_RE = /\.(?:zip|7z|rar)$/i;

function allKnown() {
  return GAME_IDS.flatMap((gameId) => {
    const game = GAME_CATALOGUE[gameId];
    return [
      ...game.accepted.map((identity) => ({ gameId, identity, alternate: false })),
      ...(game.alternateForms ?? []).map((identity) => ({ gameId, identity, alternate: true })),
    ];
  });
}

function expectedView(identity) {
  if (!identity) return null;
  return {
    name: identity.name,
    size: identity.size,
    sha256: identity.sha256,
    inputForm: identity.inputForm,
  };
}

function actualView(actual) {
  return { name: actual.name, size: actual.size, sha256: actual.sha256 };
}

function result(status, actual, options = {}) {
  return {
    status,
    actual: actualView(actual),
    expected: expectedView(options.expected),
    knownIdentity: options.knownIdentity ?? null,
    satisfiesNames: options.satisfiesNames ?? [],
    likelyCauses: options.likelyCauses ?? [],
    correctiveAction: options.correctiveAction ?? null,
  };
}

export function classifyMetadata(gameId, actual) {
  const game = GAME_CATALOGUE[gameId];
  if (!game) throw new RangeError(`Unknown game id ${gameId}`);
  if (!actual || typeof actual.name !== 'string' || !Number.isSafeInteger(actual.size)
      || !/^[0-9a-f]{64}$/i.test(actual.sha256 ?? '')) {
    throw new TypeError('Actual file metadata needs name, integer size, and SHA-256');
  }

  const sha256 = actual.sha256.toLowerCase();
  const normalized = { ...actual, sha256 };
  const selectedKnown = [
    ...game.accepted.map((identity) => ({ identity, alternate: false })),
    ...(game.alternateForms ?? []).map((identity) => ({ identity, alternate: true })),
  ].find(({ identity }) => identity.sha256 === sha256 && identity.size === actual.size);

  if (selectedKnown) {
    const { identity, alternate } = selectedKnown;
    if (alternate) {
      return result('accepted-alternate-form', normalized, {
        expected: identity,
        satisfiesNames: identity.satisfiesNames,
        knownIdentity: `${game.title}: ${identity.inputForm}`,
        correctiveAction: identity.note,
      });
    }
    const renamed = actual.name !== identity.name;
    return result(renamed ? 'accepted-renamed' : 'accepted-exact', normalized, {
      expected: identity,
      satisfiesNames: [identity.name],
      knownIdentity: `${game.title}: ${identity.inputForm}`,
      likelyCauses: renamed
        ? ['The bytes are an exact accepted match, but the file was renamed. Renaming is allowed.']
        : [],
    });
  }

  const u45 = gameId === 'ddpdoj'
    ? game.accepted.find((identity) => identity.name === 'ddb10_10_8_434f.u45')
    : null;
  if (u45?.byteSwappedSha256 === sha256 && actual.size === u45.size) {
    return result('known-byte-swapped-program', normalized, {
      expected: u45,
      knownIdentity: 'ddpdojblk program member after 16-bit byte swapping',
      likelyCauses: [
        'This digest exactly matches the accepted raw u45 member after each 16-bit word has been byte-swapped.',
        'A tool likely exported MAME region order instead of the raw encrypted archive member order.',
      ],
      correctiveAction: 'Supply the raw extracted ddb10_10_8_434f.u45 member, or the separately documented decrypted 6 MiB maincpu form.',
    });
  }

  const knownElsewhere = allKnown().find(({ identity }) =>
    identity.sha256 === sha256 && identity.size === actual.size);
  if (knownElsewhere) {
    const other = GAME_CATALOGUE[knownElsewhere.gameId];
    return result('known-other-game', normalized, {
      expected: game.accepted.find((identity) => identity.name === actual.name),
      knownIdentity: `${other.title}: ${knownElsewhere.identity.inputForm}`,
      likelyCauses: ['This is an exact known input, but it belongs to another game selection.'],
      correctiveAction: `Choose ${other.title}, or supply the expected ${game.title} input.`,
    });
  }

  if (ARCHIVE_RE.test(actual.name)) {
    return result('unsupported-archive', normalized, {
      knownIdentity: 'Archive container, contents not inspected',
      likelyCauses: ['An archive container was selected instead of an extracted ROM file or MAME member.'],
      correctiveAction: gameId === 'ddpdoj'
        ? 'Extract the ddpdojblk ZIP or 7z locally, then select the ten listed members.'
        : 'Extract the archive locally, then select the complete cartridge image listed below.',
    });
  }

  const named = game.accepted.find((identity) => identity.name === actual.name);
  if (named) {
    const likelyCauses = [];
    if (actual.size !== named.size) {
      likelyCauses.push(`The file has ${actual.size} bytes; this member requires exactly ${named.size}. It may be truncated, headered differently, split, or combined.`);
    }
    if (actual.size === named.size) {
      likelyCauses.push('The filename and size match, but the SHA-256 does not. The bytes may be a different revision, region, bad dump, or modified image.');
    }
    if (named.name === 'ddp3blk_defaults.nv') {
      likelyCauses.push('A known bad ddpdojblk archive contains mismatched default NVRAM. Another archive with the same set name can also be shadowed in a MAME ROM path.');
    }
    return result('expected-name-wrong-bytes', normalized, {
      expected: named,
      likelyCauses,
      correctiveAction: 'Compare the actual and expected values, then source the exact legally owned revision without modifying it.',
    });
  }

  const sameSize = game.accepted.filter((identity) => identity.size === actual.size);
  return result('unknown', normalized, {
    likelyCauses: [
      ...(sameSize.length
        ? [`The size matches ${sameSize.map((identity) => identity.name).join(', ')}, but the digest matches no tracked identity.`]
        : ['The name, size, and digest match no tracked identity for this game.']),
      'Possible causes include a different region or revision, an encrypted/decrypted mismatch, a split/combined image, a copier header, or modified bytes. These are possibilities, not a revision assignment.',
    ],
    correctiveAction: 'Use the exact acquisition-neutral identity table below. Unknown digests are not assigned to a version.',
  });
}

export async function sha256Hex(file, digest = globalThis.crypto?.subtle?.digest?.bind(globalThis.crypto.subtle)) {
  if (typeof digest !== 'function') throw new Error('Web Crypto SHA-256 is not available in this browser.');
  const bytes = await file.arrayBuffer();
  const hash = new Uint8Array(await digest('SHA-256', bytes));
  return Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function inspectInventory(files, options = {}) {
  const digest = options.digest;
  const items = [];
  for (const file of files) {
    const sha256 = await sha256Hex(file, digest);
    items.push({ file, metadata: { name: file.name, size: file.size, sha256 } });
  }

  const games = Object.fromEntries(GAME_IDS.map((gameId) => {
    const reports = items.map(({ metadata }) => classifyMetadata(gameId, metadata));
    return [gameId, summarizeReports(gameId, reports, {
      files: items.map(({ file }) => file),
    })];
  }));
  return { items, games };
}

export async function inspectFiles(gameId, files, options = {}) {
  if (!GAME_CATALOGUE[gameId]) throw new RangeError(`Unknown game id ${gameId}`);
  return (await inspectInventory(files, options)).games[gameId];
}

export function summarizeReports(gameId, reports, options = {}) {
  const game = GAME_CATALOGUE[gameId];
  if (!game) throw new RangeError(`Unknown game id ${gameId}`);
  const counts = new Map();
  for (const report of reports) {
    for (const name of report.satisfiesNames) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const missing = game.accepted
    .filter((identity) => !counts.has(identity.name))
    .map((identity) => expectedView(identity));
  const duplicates = Array.from(counts, ([name, count]) => ({ name, count }))
    .filter(({ count }) => count > 1);
  const conflicts = reports.filter((report) => report.expected?.name
    && report.actual.name === report.expected.name
    && !report.status.startsWith('accepted'));
  const acceptedFiles = [];
  const seenFiles = new Set();
  for (let index = 0; index < reports.length; index++) {
    if (!reports[index].status.startsWith('accepted')
        || reports[index].satisfiesNames.length === 0) continue;
    const file = options.files?.[index];
    if (file && !seenFiles.has(file)) {
      seenFiles.add(file);
      acceptedFiles.push(file);
    }
  }
  const extras = reports.filter((report) => report.satisfiesNames.length === 0);
  const complete = missing.length === 0 && duplicates.length === 0
    && conflicts.length === 0;
  return { gameId, reports, missing, duplicates, conflicts, extras, acceptedFiles, complete };
}

export function formatDiagnostic(summary) {
  const lines = [`Mixup local ROM diagnostic for ${summary.gameId}`];
  for (const report of summary.reports) {
    lines.push('', `${report.status}: ${report.actual.name}`,
      `  actual size: ${report.actual.size}`,
      `  actual SHA-256: ${report.actual.sha256}`);
    if (report.expected) {
      lines.push(`  expected name: ${report.expected.name ?? '(name is not an identity)'}`,
        `  expected size: ${report.expected.size}`,
        `  expected SHA-256: ${report.expected.sha256}`,
        `  expected form: ${report.expected.inputForm}`);
    }
    if (report.knownIdentity) lines.push(`  known identity: ${report.knownIdentity}`);
    for (const cause of report.likelyCauses) lines.push(`  possible cause: ${cause}`);
    if (report.correctiveAction) lines.push(`  action: ${report.correctiveAction}`);
  }
  if (summary.missing.length) {
    lines.push('', 'Missing required inputs:');
    for (const identity of summary.missing) {
      lines.push(`  ${identity.name}: ${identity.size} bytes, SHA-256 ${identity.sha256}`);
    }
  }
  if (summary.duplicates.length) {
    lines.push('', 'Duplicate identities:');
    for (const duplicate of summary.duplicates) lines.push(`  ${duplicate.name}: ${duplicate.count} copies`);
  }
  if (summary.conflicts.length) {
    lines.push('', 'Conflicting required filenames:');
    for (const conflict of summary.conflicts) {
      lines.push(`  ${conflict.actual.name}: supplied bytes do not match the required identity`);
    }
  }
  lines.push('', summary.complete
    ? 'Required identity set complete. Additional files, if any, remain listed separately. Game boot is not enabled in this foundation build.'
    : 'Identity validation is not complete. No ROM bytes were uploaded or saved.');
  return lines.join('\n');
}
