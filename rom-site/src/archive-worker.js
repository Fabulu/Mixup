/* global SevenZipWasm, importScripts */

importScripts('./vendor/sevenzip-wasm/sevenzip-wasm.js');

let stdout = [];
let stderr = [];
let outputLines = 0;
let outputCharacters = 0;
let outputExceeded = false;
let archiveKind = null;
let listed = false;
let extracted = false;

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

self.addEventListener('message', async (event) => {
  try {
    const message = event.data;
    const sevenZip = await sevenZipPromise;
    if (message?.action === 'list') {
      if (listed || extracted || (message.kind !== 'zip' && message.kind !== '7z')
          || !(message.bytes instanceof ArrayBuffer)) {
        throw new Error('Archive listing request is invalid.');
      }
      archiveKind = message.kind;
      sevenZip.FS.writeFile('/input.archive', new Uint8Array(message.bytes));
      const lines = run(sevenZip, [
        'l', `-t${archiveKind}`, '-slt', '-ba', '-bd', '-bsp0', '-bse1', '--',
        '/input.archive',
      ], 'Archive listing');
      listed = true;
      self.postMessage({ ok: true, phase: 'listed', lines });
      return;
    }
    if (message?.action === 'extract') {
      if (!listed || extracted || !Array.isArray(message.paths) || !message.paths.length
          || message.paths.some((path) => typeof path !== 'string')) {
        throw new Error('Archive extraction request is invalid.');
      }
      sevenZip.FS.mkdir('/output');
      run(sevenZip, [
        'x', `-t${archiveKind}`, '-y', '-bd', '-bb0', '-bso0', '-bsp0', '-bse1',
        '-o/output', '--', '/input.archive', ...message.paths,
      ], 'Archive extraction');
      extracted = true;
      const members = readOutput(sevenZip);
      self.postMessage({ ok: true, phase: 'extracted', members },
        members.map((member) => member.bytes));
      return;
    }
    throw new Error('Unknown archive worker request.');
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error?.message || String(error),
    });
  }
});
