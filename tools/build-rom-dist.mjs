// Build the separate asset-free Mixup setup site into dist-rom/.
// This script uses a closed source allowlist. It never traverses a game assets/
// tree, and it has no publication exceptions.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_ROM = path.join(ROOT, 'dist-rom');
const SHELL_ALLOWLIST = Object.freeze([
  'rom-site/index.html',
  'rom-site/styles.css',
  'rom-site/src/archive-policy.js',
  'rom-site/src/archive-worker.js',
  'rom-site/src/archives.js',
  'rom-site/src/buildid.js',
  'rom-site/src/catalogue.js',
  'rom-site/src/diagnostics.js',
  'rom-site/src/files.js',
  'rom-site/src/idb.js',
  'rom-site/src/selection.js',
  'rom-site/src/setup.js',
]);
const RUNTIME_ROOTS = Object.freeze([
  'rom-site/src/local-shell.js',
  'rom-site/src/batman-local.js',
  'rom-site/src/gradius-local.js',
  'rom-site/src/ddpdoj-local.js',
]);
export const VENDOR_ALLOWLIST = Object.freeze([
  Object.freeze({
    source: 'node_modules/sevenzip-wasm/sevenzip-wasm.js',
    output: 'src/vendor/sevenzip-wasm/sevenzip-wasm.js',
    bytes: 80875,
    sha256: 'c946e4285c76c92001331b6cc3e06ea96dc142917ded6ee5d80fafd5deffafed',
  }),
  Object.freeze({
    source: 'node_modules/sevenzip-wasm/sevenzip-wasm.wasm',
    output: 'src/vendor/sevenzip-wasm/sevenzip-wasm.wasm',
    bytes: 1166682,
    sha256: '4337675b39b12a8d358de471e6e33507d55d0471d1e02108fe5202c0a26c89d6',
  }),
  Object.freeze({
    source: 'node_modules/sevenzip-wasm/LICENSE',
    output: 'src/vendor/sevenzip-wasm/LICENSE',
    bytes: 6288,
    sha256: 'bbc7b2904d894e2d36d2c3a0ad75a3b39c019ae26c9b1afb01c2c689972c1608',
  }),
]);
const FROM_MODULE_RE = /^\s*(?:import|export)\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_MODULE_RE = /^\s*import\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_MODULE_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function posixPath(value) { return value.split(path.sep).join('/'); }
function sha256(body) { return crypto.createHash('sha256').update(body).digest('hex'); }

function verifiedVendor(vendor) {
  const absolute = path.join(ROOT, vendor.source);
  const body = fs.readFileSync(absolute);
  if (body.length !== vendor.bytes || sha256(body) !== vendor.sha256) {
    throw new Error(`asset-free build: pinned vendor file changed: ${vendor.source}`);
  }
  return body;
}

function resolveModule(source, specifier) {
  if (specifier.startsWith('/')) return specifier.slice(1);
  if (!specifier.startsWith('.')) {
    throw new Error(`asset-free build: bare browser import ${specifier} in ${source}`);
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
}

function browserModuleClosure(roots) {
  const pending = roots.slice();
  const seen = new Set();
  while (pending.length) {
    const source = pending.pop();
    if (seen.has(source)) continue;
    if (!(source.startsWith('rom-site/src/') || source.startsWith('games/batman/src/')
        || source.startsWith('games/gradius/src/') || source.startsWith('games/ddpdoj/src/')
        || source.startsWith('shared/'))) {
      throw new Error(`asset-free build: browser module escapes approved source roots: ${source}`);
    }
    const absolute = path.join(ROOT, source);
    if (!fs.statSync(absolute).isFile()) {
      throw new Error(`asset-free build: browser module is not a file: ${source}`);
    }
    seen.add(source);
    const body = fs.readFileSync(absolute, 'utf8');
    for (const pattern of [FROM_MODULE_RE, SIDE_EFFECT_MODULE_RE, DYNAMIC_MODULE_RE]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(body))) {
        const dependency = resolveModule(source, match[1]);
        if (!dependency.endsWith('.js')) {
          throw new Error(`asset-free build: non-JavaScript browser import ${match[1]} in ${source}`);
        }
        pending.push(dependency);
      }
    }
  }
  return Array.from(seen).sort();
}

export const SOURCE_ALLOWLIST = Object.freeze(Array.from(new Set([
  ...SHELL_ALLOWLIST,
  ...browserModuleClosure(RUNTIME_ROOTS),
])).sort());
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
  return `/*\n  Cache-Control: no-store, must-revalidate\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\n\n/src/vendor/sevenzip-wasm/sevenzip-wasm.wasm\n  Content-Type: application/wasm\n`;
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

function outputRelative(source) {
  return source.startsWith('rom-site/') ? source.slice('rom-site/'.length) : source;
}

export function auditAssetFreeOutput(directory, options = {}) {
  const expected = [...SOURCE_ALLOWLIST.map(outputRelative),
    ...VENDOR_ALLOWLIST.map((vendor) => vendor.output),
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
    const body = fs.readFileSync(path.join(directory, relative));
    const vendor = VENDOR_ALLOWLIST.find((candidate) => candidate.output === relative);
    if (vendor) {
      if (body.length !== vendor.bytes || sha256(body) !== vendor.sha256) {
        throw new Error(`asset-free audit: pinned vendor output changed: ${relative}`);
      }
      continue;
    }
    const size = body.length;
    const limit = path.extname(relative).toLowerCase() === '.js' ? 768 * 1024 : 256 * 1024;
    if (size > limit) {
      throw new Error(`asset-free audit: hand-authored shell file exceeds ${limit} bytes: ${relative} (${size} bytes)`);
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
    const relative = outputRelative(source);
    const destination = path.join(DIST_ROM, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (relative === 'src/buildid.js') {
      fs.writeFileSync(destination, `export const BUILD_ID = '${buildId}';\n`);
    } else {
      fs.copyFileSync(sourcePath, destination);
    }
  }
  for (const vendor of VENDOR_ALLOWLIST) {
    const destination = path.join(DIST_ROM, vendor.output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, verifiedVendor(vendor));
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
