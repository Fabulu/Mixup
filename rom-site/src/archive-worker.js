/* global SevenZipWasm, importScripts */

importScripts('./vendor/sevenzip-wasm/sevenzip-wasm.js');

let stdout = [];
let stderr = [];
let outputLines = 0;
let outputCharacters = 0;
let outputExceeded = false;
let archiveKind = null;
let phase = 'idle';

const MAX_OUTPUT_LINES = 1024;
const MAX_OUTPUT_CHARACTERS = 256 * 1024;

function captureOutput(target, line) {
  if (outputExceeded) return;
  const text = String(line);
  outputLines += 1;
  outputCharacters += text.length + 1;
  if (outputLines > MAX_OUTPUT_LINES || outputCharacters > MAX_OUTPUT_CHARACTERS) {
    outputExceeded = true;
    return;
  }
  target.push(text);
}

const sevenZipPromise = SevenZipWasm({
  locateFile: (name) => new URL(`./vendor/sevenzip-wasm/${name}`, self.location.href).href,
  print: (line) => captureOutput(stdout, line),
  printErr: (line) => captureOutput(stderr, line),
});

function resetOutput() {
  stdout = [];
  stderr = [];
  outputLines = 0;
  outputCharacters = 0;
  outputExceeded = false;
}

function run(sevenZip, args, operation) {
  resetOutput();
  let status;
  try {
    status = sevenZip.callMain([...args]);
  } catch (error) {
    throw new Error(`${operation} aborted: ${error?.message || String(error)}`);
  }
  if (outputExceeded) {
    throw new Error(`${operation} decoder output exceeded the safe listing limit.`);
  }
  if (status !== 0) throw new Error(`${operation} returned status ${status}.`);
  if (stderr.length) throw new Error(`${operation} reported: ${stderr.join(' ')}`);
  return stdout.slice();
}

function readOutput(sevenZip, directory = '/output', prefix = '') {
  const members = [];
  for (const name of sevenZip.FS.readdir(directory)) {
    if (name === '.' || name === '..') continue;
    const absolute = `${directory}/${name}`;
    const relative = `${prefix}${name}`;
    const stat = sevenZip.FS.lstat(absolute);
    if (sevenZip.FS.isLink(stat.mode)) throw new Error(`${relative}: extracted links are forbidden.`);
    if (sevenZip.FS.isDir(stat.mode)) {
      members.push(...readOutput(sevenZip, absolute, `${relative}/`));
      continue;
    }
    if (!sevenZip.FS.isFile(stat.mode)) {
      throw new Error(`${relative}: extracted entry is not a regular file.`);
    }
    const bytes = sevenZip.FS.readFile(absolute).slice();
    members.push({ path: relative, bytes: bytes.buffer });
  }
  return members;
}

function removeTree(sevenZip, path) {
  const stat = sevenZip.FS.lstat(path);
  if (!sevenZip.FS.isDir(stat.mode)) {
    sevenZip.FS.unlink(path);
    return;
  }
  for (const name of sevenZip.FS.readdir(path)) {
    if (name === '.' || name === '..') continue;
    removeTree(sevenZip, `${path}/${name}`);
  }
  sevenZip.FS.rmdir(path);
}

function cleanupArchive(sevenZip) {
  if (sevenZip.FS.analyzePath('/output').exists) removeTree(sevenZip, '/output');
  if (sevenZip.FS.analyzePath('/input.archive').exists) {
    sevenZip.FS.unlink('/input.archive');
  }
  archiveKind = null;
  phase = 'idle';
  resetOutput();
}

self.addEventListener('message', async (event) => {
  try {
    const message = event.data;
    const sevenZip = await sevenZipPromise;
    if (message?.action === 'list') {
      if (phase !== 'idle' || (message.kind !== 'zip' && message.kind !== '7z')
          || !(message.bytes instanceof ArrayBuffer)) {
        throw new Error('Archive listing request is invalid.');
      }
      archiveKind = message.kind;
      sevenZip.FS.writeFile('/input.archive', new Uint8Array(message.bytes));
      const lines = run(sevenZip, [
        'l', `-t${archiveKind}`, '-slt', '-ba', '-bd', '-bsp0', '-bse1', '--',
        '/input.archive',
      ], 'Archive listing');
      phase = 'listed';
      self.postMessage({ ok: true, phase: 'listed', lines });
      return;
    }
    if (message?.action === 'discard') {
      if (phase !== 'listed') throw new Error('Archive discard request is invalid.');
      cleanupArchive(sevenZip);
      self.postMessage({ ok: true, phase: 'discarded' });
      return;
    }
    if (message?.action === 'extract') {
      if (phase !== 'listed' || !Array.isArray(message.paths) || !message.paths.length
          || message.paths.some((path) => typeof path !== 'string')) {
        throw new Error('Archive extraction request is invalid.');
      }
      sevenZip.FS.mkdir('/output');
      run(sevenZip, [
        'x', `-t${archiveKind}`, '-y', '-bd', '-bb0', '-bso0', '-bsp0', '-bse1',
        '-o/output', '--', '/input.archive', ...message.paths,
      ], 'Archive extraction');
      const members = readOutput(sevenZip);
      cleanupArchive(sevenZip);
      self.postMessage({ ok: true, phase: 'extracted', members },
        members.map((member) => member.bytes));
      return;
    }
    throw new Error('Unknown archive worker request.');
  } catch (error) {
    let reusable = false;
    try {
      const sevenZip = await sevenZipPromise;
      cleanupArchive(sevenZip);
      reusable = true;
    } catch {
      // A failed cleanup makes this worker session unusable.
    }
    self.postMessage({
      ok: false,
      error: error?.message || String(error),
      reusable,
    });
  }
});
