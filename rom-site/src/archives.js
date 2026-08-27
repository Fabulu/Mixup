import {
  ARCHIVE_LIMITS,
  archiveKind,
  parseSevenZipListing,
  rejectNestedArchive,
  validateArchiveEntries,
  validateArchiveSelection,
} from './archive-policy.js';

function formatBytes(value) {
  return new Intl.NumberFormat().format(value);
}

async function headerBytes(file) {
  return new Uint8Array(await file.slice(0, 8).arrayBuffer());
}

function workerError(value) {
  const message = typeof value === 'string' ? value : value?.message;
  return new Error(message || 'Archive worker failed without an error message.');
}

function abortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Archive intake was superseded by a newer selection.', 'AbortError');
  }
  const error = new Error('Archive intake was superseded by a newer selection.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function runWorker(file, kind, options = {}) {
  const createWorker = options.createWorker ?? (() =>
    new Worker(new URL('./archive-worker.js', import.meta.url)));
  const timeoutMs = options.timeoutMs ?? ARCHIVE_LIMITS.timeoutMs;
  throwIfAborted(options.signal);
  return file.arrayBuffer().then((buffer) => {
    throwIfAborted(options.signal);
    return new Promise((resolve, reject) => {
      const worker = createWorker();
      let settled = false;
      let entries = null;
      let timer = null;
      const abort = () => finish(reject, abortError());
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        worker.terminate();
        callback(value);
      };
      timer = setTimeout(() => finish(reject,
        new Error(`${file.name}: archive extraction exceeded ${timeoutMs / 1000} seconds.`)), timeoutMs);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) {
        abort();
        return;
      }
      worker.addEventListener('message', (event) => {
        try {
          if (!event.data?.ok) {
            finish(reject, workerError(event.data?.error));
            return;
          }
          if (event.data.phase === 'listed' && entries === null) {
            entries = parseSevenZipListing(event.data.lines, kind, options);
            const validated = validateArchiveEntries(kind, entries, file.size, options);
            worker.postMessage({
              action: 'extract',
              paths: validated.files.map((entry) => entry.path),
            });
            return;
          }
          if (event.data.phase === 'extracted' && entries !== null) {
            finish(resolve, { entries, members: event.data.members });
            return;
          }
          finish(reject, new Error(`${file.name}: archive worker phase was invalid.`));
        } catch (error) {
          finish(reject, error);
        }
      });
      worker.addEventListener('error', (event) => {
        finish(reject, workerError(event.error ?? event.message));
      }, { once: true });
      worker.postMessage({
        action: 'list',
        name: file.name,
        kind,
        bytes: buffer,
      }, [buffer]);
    });
  });
}

function validateWorkerResult(file, kind, result, options = {}) {
  if (!result || !Array.isArray(result.entries) || !Array.isArray(result.members)) {
    throw new Error(`${file.name}: archive worker returned an invalid result.`);
  }
  const validated = validateArchiveEntries(kind, result.entries, file.size, options);
  const byPath = new Map();
  for (const member of result.members) {
    if (!member || typeof member.path !== 'string' || !(member.bytes instanceof ArrayBuffer)) {
      throw new Error(`${file.name}: archive worker returned an invalid member.`);
    }
    if (byPath.has(member.path)) throw new Error(`${file.name}: duplicate extracted path ${member.path}.`);
    byPath.set(member.path, new Uint8Array(member.bytes));
  }
  if (byPath.size !== validated.files.length) {
    throw new Error(`${file.name}: extracted member count differs from the validated listing.`);
  }
  for (const entry of validated.files) {
    const bytes = byPath.get(entry.path);
    if (!bytes || bytes.byteLength !== entry.size) {
      throw new Error(`${file.name}: extracted size differs for ${entry.path}.`);
    }
    rejectNestedArchive(entry.path, bytes.subarray(0, 8));
  }
  return { ...validated, byPath };
}

function browserFile(bytes, name, source, options = {}) {
  const createFile = options.createFile ?? ((parts, fileName, init) =>
    new File(parts, fileName, init));
  const file = createFile([bytes], name, {
    type: 'application/octet-stream',
    lastModified: source.lastModified || 0,
  });
  return file;
}

export async function expandArchives(files, options = {}) {
  throwIfAborted(options.signal);
  const selected = Array.from(files ?? []);
  const raw = [];
  const archives = [];
  for (const file of selected) {
    throwIfAborted(options.signal);
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.slice !== 'function') continue;
    const kind = archiveKind(file.name, await headerBytes(file));
    throwIfAborted(options.signal);
    if (!kind) {
      raw.push(file);
      continue;
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0
        || file.size > (options.maxCompressedArchive ?? ARCHIVE_LIMITS.maxCompressedArchive)) {
      throw new Error(`${file.name}: archive size must be between 1 and ${formatBytes(options.maxCompressedArchive ?? ARCHIVE_LIMITS.maxCompressedArchive)} bytes.`);
    }
    archives.push({ file, kind });
  }
  if (archives.length > (options.maxArchives ?? ARCHIVE_LIMITS.maxArchives)) {
    throw new Error(`Select at most ${options.maxArchives ?? ARCHIVE_LIMITS.maxArchives} archives at once.`);
  }
  const compressedTotal = archives.reduce((sum, archive) => sum + archive.file.size, 0);
  if (compressedTotal > (options.maxCompressedTotal ?? ARCHIVE_LIMITS.maxCompressedTotal)) {
    throw new Error(`Selected archives exceed ${formatBytes(options.maxCompressedTotal ?? ARCHIVE_LIMITS.maxCompressedTotal)} compressed bytes.`);
  }

  const expanded = [];
  const summaries = [];
  const memberBasenames = new Set();
  const maxExpandedTotal = options.maxExpandedTotal ?? ARCHIVE_LIMITS.maxExpandedTotal;
  const maxEntriesTotal = options.maxEntriesTotal ?? ARCHIVE_LIMITS.maxEntriesTotal;
  const maxExpandedArchive = options.maxExpandedArchive ?? ARCHIVE_LIMITS.maxExpandedArchive;
  const maxEntriesPerArchive = options.maxEntriesPerArchive
    ?? ARCHIVE_LIMITS.maxEntriesPerArchive;
  for (let index = 0; index < archives.length; index++) {
    throwIfAborted(options.signal);
    const { file, kind } = archives[index];
    const consumed = validateArchiveSelection(summaries, options);
    const archiveOptions = {
      ...options,
      maxExpandedArchive: Math.min(maxExpandedArchive,
        maxExpandedTotal - consumed.expandedBytes),
      maxEntriesPerArchive: Math.min(maxEntriesPerArchive,
        maxEntriesTotal - consumed.entries),
    };
    options.onProgress?.(`Reading ${file.name} locally (${index + 1}/${archives.length})...`);
    const result = await runWorker(file, kind, archiveOptions);
    throwIfAborted(options.signal);
    const validated = validateWorkerResult(file, kind, result, archiveOptions);
    summaries.push({
      compressedBytes: file.size,
      expandedBytes: validated.expandedBytes,
      entries: validated.entries,
    });
    validateArchiveSelection(summaries, options);

    for (const entry of validated.files) {
      const basename = entry.path.slice(entry.path.lastIndexOf('/') + 1);
      const folded = basename.toLocaleLowerCase('en-US');
      if (memberBasenames.has(folded)) {
        throw new Error(`Selected archives contain duplicate member basename ${basename}.`);
      }
      memberBasenames.add(folded);
      const member = browserFile(validated.byPath.get(entry.path), basename, file, options);
      Object.defineProperty(member, 'mixupRelativePath', {
        value: `${file.name}/${entry.path}`,
        configurable: true,
      });
      expanded.push(member);
    }
  }
  throwIfAborted(options.signal);
  return {
    files: [...raw, ...expanded],
    archives: archives.length,
    members: expanded.length,
    summary: validateArchiveSelection(summaries, options),
  };
}
