import test from 'node:test';
import assert from 'node:assert/strict';

import { ARCHIVE_LIMITS } from '../src/archive-policy.js';
import { expandArchives } from '../src/archives.js';

const zipMagic = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

function selectedFile(name, bytes, lastModified = 1, state = null) {
  const body = Uint8Array.from(bytes);
  return {
    name,
    size: body.byteLength,
    lastModified,
    async arrayBuffer() { return body.slice().buffer; },
    slice(from, to) {
      if (state) state.slices = (state.slices ?? 0) + 1;
      const part = body.slice(from, to);
      return { async arrayBuffer() { return part.buffer; } };
    },
  };
}

function createdFile(parts, name, init) {
  const bytes = Uint8Array.from(parts[0]);
  return {
    name,
    size: bytes.byteLength,
    lastModified: init.lastModified,
    async arrayBuffer() { return bytes.slice().buffer; },
    slice(from, to) {
      const part = bytes.slice(from, to);
      return { async arrayBuffer() { return part.buffer; } };
    },
  };
}

function fakeWorker(response, state = {}) {
  const listeners = new Map();
  return {
    addEventListener(name, listener) { listeners.set(name, listener); },
    postMessage(message) {
      state.messages ??= [];
      state.messages.push(message);
      const data = typeof response === 'function' ? response(message) : response;
      queueMicrotask(() => listeners.get('message')?.({ data }));
    },
    terminate() { state.terminated = (state.terminated ?? 0) + 1; },
  };
}

const LISTING = Object.freeze([
  'Path = set/member.rom', 'Folder = -', 'Size = 4',
  'Encrypted = -', 'Method = Deflate', 'Volume Index = 0', '',
]);

function workerFlow(options = {}) {
  return (message) => message.action === 'list'
    ? (options.list ?? { ok: true, phase: 'listed', lines: LISTING })
    : (options.extract ?? {
      ok: true,
      phase: 'extracted',
      members: [{ path: 'set/member.rom', bytes: Uint8Array.of(9, 8, 7, 6).buffer }],
    });
}

test('ordinary ROM files pass through without starting a worker', async () => {
  const raw = selectedFile('member.rom', [1, 2, 3]);
  let workers = 0;
  const result = await expandArchives([raw], {
    createWorker: () => { workers++; return fakeWorker(workerFlow()); },
  });
  assert.deepEqual(result.files, [raw]);
  assert.deepEqual([result.archives, result.members, workers], [0, 0, 0]);
});

test('folder scans ignore archive-like bytes in unrelated files without probing them', async () => {
  const state = {};
  const save = selectedFile('SLPM-65378 (AEDB8BB2).00.p2s', zipMagic, 1, state);
  let workers = 0;
  const result = await expandArchives([save], {
    archiveProbe: 'declared-only',
    createWorker: () => { workers++; return fakeWorker(workerFlow()); },
  });
  assert.deepEqual(result.files, [save]);
  assert.deepEqual([result.archives, result.members, workers, state.slices ?? 0], [0, 0, 0, 0]);
});

test('explicit files still reject disguised archives', async () => {
  const save = selectedFile('SLPM-65378 (AEDB8BB2).00.p2s', zipMagic);
  await assert.rejects(() => expandArchives([save]),
    /archive signature requires a matching \.zip or \.7z extension/);
});

test('folder scans still reject malformed files declared as archives', async () => {
  const archive = selectedFile('broken.zip', [1, 2, 3, 4, 5, 6, 7, 8]);
  await assert.rejects(() => expandArchives([archive], { archiveProbe: 'declared-only' }),
    /\.zip extension does not match the archive signature/);
});

test('a valid archive becomes ordinary local File-like members', async () => {
  const archive = selectedFile('owned.zip', zipMagic);
  const state = {};
  const progress = [];
  const result = await expandArchives([archive], {
    createWorker: () => fakeWorker(workerFlow(), state),
    createFile: createdFile,
    onProgress: (message) => progress.push(message),
  });
  assert.deepEqual([result.archives, result.members, result.files.length], [1, 1, 1]);
  assert.equal(result.files[0].name, 'member.rom');
  assert.equal(result.files[0].mixupRelativePath, 'owned.zip/set/member.rom');
  assert.deepEqual(new Uint8Array(await result.files[0].arrayBuffer()), Uint8Array.of(9, 8, 7, 6));
  assert.equal(state.messages[0].kind, 'zip');
  assert.equal(state.messages[0].name, 'owned.zip');
  assert.deepEqual(state.messages[1], { action: 'extract', paths: ['set/member.rom'] });
  assert.equal(state.terminated, 1);
  assert.match(progress[0], /Reading owned.zip locally/);
});

test('valid declared ZIP files still expand during folder scans', async () => {
  const archive = selectedFile('owned.ZIP', zipMagic);
  let workers = 0;
  const result = await expandArchives([archive], {
    archiveProbe: 'declared-only',
    createWorker: () => { workers++; return fakeWorker(workerFlow()); },
    createFile: createdFile,
  });
  assert.deepEqual([result.archives, result.members, workers], [1, 1, 1]);
  assert.equal(result.files[0].name, 'member.rom');
});

test('folder searches skip malformed archives and keep reading valid candidates', async () => {
  const broken = selectedFile('broken.zip', zipMagic);
  const valid = selectedFile('owned.zip', zipMagic);
  let workers = 0;
  const result = await expandArchives([broken, valid], {
    archiveProbe: 'declared-only',
    skipInvalidArchives: true,
    createWorker: () => {
      workers++;
      return workers === 1
        ? fakeWorker({ ok: false, error: 'bad central directory' })
        : fakeWorker(workerFlow());
    },
    createFile: createdFile,
  });
  assert.deepEqual([result.archives, result.members, result.skippedArchives], [1, 1, 1]);
  assert.equal(result.files[0].name, 'member.rom');
  assert.deepEqual(result.archiveErrors,
    [{ name: 'broken.zip', message: 'bad central directory' }]);
});

test('folder searches keep same-named members from separate archives', async () => {
  const archives = [selectedFile('first.zip', zipMagic), selectedFile('second.zip', zipMagic)];
  const result = await expandArchives(archives, {
    archiveProbe: 'declared-only',
    skipInvalidArchives: true,
    createWorker: () => fakeWorker(workerFlow()),
    createFile: createdFile,
  });
  assert.deepEqual([result.archives, result.members, result.skippedArchives], [2, 2, 0]);
  assert.deepEqual(result.files.map((file) => file.mixupRelativePath), [
    'first.zip/set/member.rom', 'second.zip/set/member.rom',
  ]);
  assert.deepEqual(result.archiveErrors, []);
});

test('worker errors, listing mismatches, and nested archives fail closed', async () => {
  const archive = selectedFile('owned.zip', zipMagic);
  await assert.rejects(() => expandArchives([archive], {
    createWorker: () => fakeWorker({ ok: false, error: 'bad central directory' }),
  }), /bad central directory/);
  await assert.rejects(() => expandArchives([archive], {
    createWorker: () => fakeWorker(workerFlow({
      extract: { ok: true, phase: 'extracted', members: [] },
    })),
  }), /member count differs/);
  await assert.rejects(() => expandArchives([archive], {
    createWorker: () => fakeWorker(workerFlow({
      list: {
        ok: true,
        phase: 'listed',
        lines: [
          'Path = nested.bin', 'Size = 4', 'Encrypted = -',
          'Method = Deflate', 'Volume Index = 0', '',
        ],
      },
      extract: {
        ok: true,
        phase: 'extracted',
        members: [{ path: 'nested.bin', bytes: zipMagic.slice(0, 4).buffer }],
      },
    })),
  }), /nested archives/);
});

test('archive workers time out, abort, and are always terminated', async () => {
  const archive = selectedFile('owned.zip', zipMagic);
  const timeoutState = {};
  const stalledWorker = (state) => ({
    addEventListener() {},
    postMessage() {},
    terminate() { state.terminated = (state.terminated ?? 0) + 1; },
  });
  await assert.rejects(() => expandArchives([archive], {
    createWorker: () => stalledWorker(timeoutState),
    timeoutMs: 5,
  }), /exceeded/);
  assert.equal(timeoutState.terminated, 1);

  const abortState = {};
  const controller = new AbortController();
  const pending = expandArchives([archive], {
    createWorker: () => stalledWorker(abortState),
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(() => pending, (error) => error.name === 'AbortError');
  assert.equal(abortState.terminated, 1);
});

test('serial archive workers share one intake timeout budget', async () => {
  const archives = [selectedFile('first.zip', zipMagic), selectedFile('second.zip', zipMagic)];
  let clock = 0;
  let workers = 0;
  await assert.rejects(() => expandArchives(archives, {
    timeoutMs: 60,
    now: () => clock,
    createWorker: () => {
      workers++;
      return fakeWorker((message) => {
        const response = workerFlow()(message);
        if (message.action === 'extract') clock = 61;
        return response;
      });
    },
    createFile: createdFile,
  }), (error) => error.name === 'ArchiveIntakeTimeoutError'
    && error.message === 'Archive intake exceeded 0.06 seconds.');
  assert.equal(workers, 1, 'the expired shared deadline must prevent another worker');
});

test('folder archive skipping never swallows the shared timeout', async () => {
  const archive = selectedFile('stalled.zip', zipMagic);
  const state = {};
  const stalledWorker = {
    addEventListener() {},
    postMessage() {},
    terminate() { state.terminated = (state.terminated ?? 0) + 1; },
  };
  await assert.rejects(() => expandArchives([archive], {
    archiveProbe: 'declared-only',
    skipInvalidArchives: true,
    createWorker: () => stalledWorker,
    timeoutMs: 5,
  }), (error) => error.name === 'ArchiveIntakeTimeoutError');
  assert.equal(state.terminated, 1);
});

test('archive timeout includes loading the complete archive bytes', async () => {
  const archive = selectedFile('stalled.zip', zipMagic);
  archive.arrayBuffer = () => new Promise(() => {});
  let workers = 0;
  await assert.rejects(() => expandArchives([archive], {
    createWorker: () => { workers++; return fakeWorker(workerFlow()); },
    timeoutMs: 5,
  }), (error) => error.name === 'ArchiveIntakeTimeoutError');
  assert.equal(workers, 0);
});

test('aggregate expanded limits reject a later listing before extraction', async () => {
  const archives = [selectedFile('first.zip', zipMagic), selectedFile('second.zip', zipMagic)];
  const states = [];
  await assert.rejects(() => expandArchives(archives, {
    maxExpandedTotal: 6,
    createWorker: () => {
      const state = {};
      states.push(state);
      return fakeWorker(workerFlow(), state);
    },
    createFile: createdFile,
  }), /expands beyond 2 bytes/);
  assert.equal(states.length, 2);
  assert.equal(states[0].messages.filter((message) => message.action === 'extract').length, 1);
  assert.equal(states[1].messages.filter((message) => message.action === 'extract').length, 0);
  assert.equal(states[0].terminated, 1);
  assert.equal(states[1].terminated, 1);
});

test('selection-wide archive limits are enforced without flattening member namespaces', async () => {
  const archives = Array.from({ length: ARCHIVE_LIMITS.maxArchives + 1 }, (_, index) =>
    selectedFile(`owned-${index}.zip`, zipMagic));
  const limitMessage = new RegExp(`at most ${ARCHIVE_LIMITS.maxArchives} archives`);
  await assert.rejects(() => expandArchives(archives), limitMessage);
  await assert.rejects(() => expandArchives(archives, {
    archiveProbe: 'declared-only', skipInvalidArchives: true,
  }), limitMessage);

  let call = 0;
  const result = await expandArchives(archives.slice(0, 2), {
    createWorker: () => {
      const path = `set-${call++}/member.rom`;
      return fakeWorker(workerFlow({
        list: {
          ok: true,
          phase: 'listed',
          lines: [
            `Path = ${path}`, 'Size = 4', 'Encrypted = -',
            'Method = Deflate', 'Volume Index = 0', '',
          ],
        },
        extract: {
          ok: true,
          phase: 'extracted',
          members: [{ path, bytes: Uint8Array.of(1, 2, 3, 4).buffer }],
        },
      }));
    },
    createFile: createdFile,
  });
  assert.deepEqual([result.archives, result.members, result.files.length], [2, 2, 2]);
  assert.deepEqual(result.files.map((file) => file.mixupRelativePath), [
    'owned-0.zip/set-0/member.rom', 'owned-1.zip/set-1/member.rom',
  ]);
});
