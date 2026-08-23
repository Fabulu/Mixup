// Build the separate asset-free Mixup setup site into dist-rom/.
// This script uses a closed source allowlist. It never traverses a game assets/
// tree, and it has no publication exceptions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_ROM = path.join(ROOT, 'dist-rom');
export const SOURCE_ALLOWLIST = Object.freeze([
  'rom-site/index.html',
  'rom-site/styles.css',
  'rom-site/src/buildid.js',
  'rom-site/src/catalogue.js',
  'rom-site/src/diagnostics.js',
  'rom-site/src/files.js',
  'rom-site/src/idb.js',
  'rom-site/src/selection.js',
  'rom-site/src/setup.js',
]);
export const GENERATED_ALLOWLIST = Object.freeze(['_headers']);

const FORBIDDEN_SEGMENTS = new Set([
  'assets', 'rip', 'capture', 'seed', 'tables', 'shards', 'roms', 'archives',
]);
const FORBIDDEN_EXTENSIONS = new Set([
  '.bin', '.rom', '.gb', '.gbc', '.nes', '.zip', '.7z', '.rar', '.gz', '.nv', '.chd',
]);

function walk(directory, base = directory) {
  const entries = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`asset-free audit: symbolic link is forbidden: ${absolute}`);
    if (item.isDirectory()) entries.push(...walk(absolute, base));
    else entries.push(path.relative(base, absolute).split(path.sep).join('/'));
  }
  return entries.sort();
}

function generatedHeaders() {
  return `/*\n  Cache-Control: no-store, must-revalidate\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\n`;
}

function cartridgeCandidates(root) {
  const direct = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:gb|gbc|nes|rom|bin)$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name));
  const ddp = path.join(root, 'games', 'ddpdoj', 'rip', 'rom');
  if (fs.existsSync(ddp)) {
    direct.push(...walk(ddp).map((relative) => path.join(ddp, relative)));
  }
  return direct.filter((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
}

export function auditAssetFreeOutput(directory, options = {}) {
  const expected = [...SOURCE_ALLOWLIST.map((source) => source.replace(/^rom-site\//, '')),
    ...GENERATED_ALLOWLIST].sort();
  const actual = walk(directory);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((file) => !actual.includes(file));
    const extra = actual.filter((file) => !expected.includes(file));
    throw new Error(`asset-free audit: output differs from closed allowlist; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  }

  for (const relative of actual) {
    const segments = relative.toLowerCase().split('/');
    const extension = path.extname(relative).toLowerCase();
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
      throw new Error(`asset-free audit: forbidden path segment in ${relative}`);
    }
    if (FORBIDDEN_EXTENSIONS.has(extension)) {
      throw new Error(`asset-free audit: cartridge/archive extension is forbidden: ${relative}`);
    }
    const size = fs.statSync(path.join(directory, relative)).size;
    if (size > 256 * 1024) {
      throw new Error(`asset-free audit: hand-authored shell file exceeds 256 KiB: ${relative} (${size} bytes)`);
    }
  }

  const cartridges = (options.cartridges ?? cartridgeCandidates(ROOT)).map((file) => ({
    file, bytes: fs.readFileSync(file),
  }));
  let comparisons = 0;
  for (const relative of actual) {
    const body = fs.readFileSync(path.join(directory, relative));
    if (body.length < 16) continue;
    for (const cartridge of cartridges) {
      comparisons++;
      if (cartridge.bytes.indexOf(body) !== -1) {
        throw new Error(`asset-free audit: ${relative} is a verbatim ${body.length}-byte cartridge slice of ${path.relative(ROOT, cartridge.file)}`);
      }
    }
  }

  return { files: actual.length, bytes: actual.reduce((sum, relative) =>
    sum + fs.statSync(path.join(directory, relative)).size, 0), comparisons };
}

export function buildAssetFreeSite(options = {}) {
  const buildId = options.buildId ?? new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  if (!/^\d{14}$/.test(buildId)) throw new Error(`asset-free build: invalid build id ${buildId}`);

  fs.rmSync(DIST_ROM, { recursive: true, force: true });
  for (const source of SOURCE_ALLOWLIST) {
    const sourcePath = path.join(ROOT, source);
    if (!fs.statSync(sourcePath).isFile()) throw new Error(`asset-free build: allowlisted source is not a file: ${source}`);
    const relative = source.replace(/^rom-site\//, '');
    const destination = path.join(DIST_ROM, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (relative === 'src/buildid.js') {
      fs.writeFileSync(destination, `export const BUILD_ID = '${buildId}';\n`);
    } else {
      fs.copyFileSync(sourcePath, destination);
    }
  }
  fs.writeFileSync(path.join(DIST_ROM, '_headers'), generatedHeaders());

  const audit = auditAssetFreeOutput(DIST_ROM, options);
  return { buildId, ...audit };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const built = buildAssetFreeSite();
    console.log(`asset-free build id ${built.buildId}`);
    console.log(`asset-free audit PASS: ${built.files} files, ${built.bytes} bytes, ${built.comparisons} cartridge comparisons, zero exceptions`);
    console.log(`output ${path.relative(ROOT, DIST_ROM)}/`);
  } catch (error) {
    console.error(`REFUSING ASSET-FREE BUILD: ${error.message}`);
    process.exitCode = 1;
  }
}
