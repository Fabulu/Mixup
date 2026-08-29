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

async function headerBytes(file, options) {
  const bytes = await beforeArchiveDeadline(file.slice(0, 8).arrayBuffer(), options);
  return new Uint8Array(bytes);
}

const DECLARED_ARCHIVE = /\.(?:zip|7z|rar)$/i;

function shouldProbeArchive(name, mode) {
  return mode === 'strict' || DECLARED_ARCHIVE.test(String(name ?? ''));
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

function archiveTimeoutError(timeoutMs) {
  const error = new Error(`Archive intake exceeded ${timeoutMs / 1000} seconds.`);
  error.name = 'ArchiveIntakeTimeoutError';
  return error;
}

function archiveNow(options) {
  return (options.now ?? (() => performance.now()))();
}

function archiveTimeRemaining(options) {
  return Math.max(0, options.deadline - archiveNow(options));
}

function throwIfArchiveTimedOut(options) {
  if (archiveTimeRemaining(options) <= 0) {
    throw archiveTimeoutError(options.timeoutMs);
  }
}

function beforeArchiveDeadline(promise, options) {
  throwIfAborted(options.signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const abort = () => finish(reject, abortError());
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      callback(value);
    };
    timer = setTimeout(() => finish(reject,
      archiveTimeoutError(options.timeoutMs)), archiveTimeRemaining(options));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function selectionLimitError(message) {
  const error = new Error(message);
  error.name = 'ArchiveSelectionLimitError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function runWorker(file, kind, options = {}) {
  const createWorker = options.createWorker ?? (() =>
    new Worker(new URL('./archive-worker.js', import.meta.url)));
  const timeoutMs = options.timeoutMs ?? ARCHIVE_LIMITS.timeoutMs;
  const deadline = Number.isFinite(options.deadline)
    ? options.deadline : archiveNow(options) + timeoutMs;
  const deadlineOptions = { ...options, timeoutMs, deadline };
  throwIfAborted(options.signal);
  return beforeArchiveDeadline(file.arrayBuffer(), deadlineOptions).then((buffer) => {
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
        archiveTimeoutError(timeoutMs)), archiveTimeRemaining(deadlineOptions));
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
  const archiveProbe = options.archiveProbe ?? 'strict';
  if (!['strict', 'declared-only'].includes(archiveProbe)) {
    throw new RangeError(`Unknown archive probe mode ${archiveProbe}.`);
  }
  const timeoutMs = options.timeoutMs ?? ARCHIVE_LIMITS.timeoutMs;
  const deadlineOptions = {
    ...options,
    timeoutMs,
    deadline: archiveNow(options) + timeoutMs,
  };
  const selected = Array.from(files ?? []);
  const raw = [];
  const archives = [];
  const skipped = [];
  const maxArchives = options.maxArchives ?? ARCHIVE_LIMITS.maxArchives;
  const maxCompressedArchive = options.maxCompressedArchive
    ?? ARCHIVE_LIMITS.maxCompressedArchive;
  const maxCompressedTotal = options.maxCompressedTotal ?? ARCHIVE_LIMITS.maxCompressedTotal;
  let compressedTotal = 0;
  for (const file of selected) {
    throwIfAborted(options.signal);
    throwIfArchiveTimedOut(deadlineOptions);
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.slice !== 'function') continue;
    if (!shouldProbeArchive(file.name, archiveProbe)) {
      raw.push(file);
      continue;
    }
    try {
      const kind = archiveKind(file.name, await headerBytes(file, deadlineOptions));
      throwIfAborted(options.signal);
      if (!kind) {
        raw.push(file);
        continue;
      }
      if (!Number.isSafeInteger(file.size) || file.size <= 0
          || file.size > maxCompressedArchive) {
        throw new Error(`${file.name}: archive size must be between 1 and ${formatBytes(maxCompressedArchive)} bytes.`);
      }
      if (archives.length >= maxArchives) {
        throw selectionLimitError(`Select at most ${maxArchives} archives at once.`);
      }
      if (compressedTotal + file.size > maxCompressedTotal) {
        throw selectionLimitError(`Selected archives exceed ${formatBytes(maxCompressedTotal)} compressed bytes.`);
      }
      archives.push({ file, kind });
      compressedTotal += file.size;
    } catch (error) {
      if (!options.skipInvalidArchives || error?.name === 'AbortError'
          || error?.name === 'ArchiveSelectionLimitError'
          || error?.name === 'ArchiveIntakeTimeoutError') throw error;
      skipped.push({ name: String(file.name ?? ''), message: error.message });
    }
  }

  const expanded = [];
  const summaries = [];
  const maxExpandedTotal = options.maxExpandedTotal ?? ARCHIVE_LIMITS.maxExpandedTotal;
  const maxEntriesTotal = options.maxEntriesTotal ?? ARCHIVE_LIMITS.maxEntriesTotal;
  const maxExpandedArchive = options.maxExpandedArchive ?? ARCHIVE_LIMITS.maxExpandedArchive;
  const maxEntriesPerArchive = options.maxEntriesPerArchive
    ?? ARCHIVE_LIMITS.maxEntriesPerArchive;
  for (let index = 0; index < archives.length; index++) {
    throwIfAborted(options.signal);
    throwIfArchiveTimedOut(deadlineOptions);
    const { file, kind } = archives[index];
    const consumed = validateArchiveSelection(summaries, options);
    const archiveOptions = {
      ...deadlineOptions,
      maxExpandedArchive: Math.min(maxExpandedArchive,
        maxExpandedTotal - consumed.expandedBytes),
      maxEntriesPerArchive: Math.min(maxEntriesPerArchive,
        maxEntriesTotal - consumed.entries),
    };
    options.onProgress?.(`Reading ${file.name} locally (${index + 1}/${archives.length})...`);
    let validated;
    try {
      const result = await runWorker(file, kind, archiveOptions);
      throwIfAborted(options.signal);
      validated = validateWorkerResult(file, kind, result, archiveOptions);
    } catch (error) {
      if (!options.skipInvalidArchives || error?.name === 'AbortError'
          || error?.name === 'ArchiveIntakeTimeoutError') throw error;
      skipped.push({ name: String(file.name ?? ''), message: error.message });
      continue;
    }
    try {
      const archiveSummary = {
        compressedBytes: file.size,
        expandedBytes: validated.expandedBytes,
        entries: validated.entries,
      };
      validateArchiveSelection([...summaries, archiveSummary], options);

      const archiveBasenames = new Set();
      const archiveMembers = [];
      for (const entry of validated.files) {
        const basename = entry.path.slice(entry.path.lastIndexOf('/') + 1);
        const folded = basename.toLocaleLowerCase('en-US');
        if (archiveBasenames.has(folded)) {
          throw new Error(`${file.name} contains duplicate member basename ${basename}.`);
        }
        archiveBasenames.add(folded);
        const member = browserFile(validated.byPath.get(entry.path), basename, file, options);
        Object.defineProperty(member, 'mixupRelativePath', {
          value: `${file.name}/${entry.path}`,
          configurable: true,
        });
        archiveMembers.push(member);
      }
      summaries.push(archiveSummary);
      expanded.push(...archiveMembers);
    } catch (error) {
      if (!options.skipInvalidArchives || error?.name === 'AbortError'
          || error?.name === 'ArchiveIntakeTimeoutError') throw error;
      skipped.push({ name: String(file.name ?? ''), message: error.message });
    }
  }
  throwIfAborted(options.signal);
  throwIfArchiveTimedOut(deadlineOptions);
  return {
    files: [...raw, ...expanded],
    archives: summaries.length,
    members: expanded.length,
    skippedArchives: skipped.length,
    archiveErrors: skipped,
    summary: validateArchiveSelection(summaries, options),
  };
}
