const MIB = 1024 * 1024;

export const ARCHIVE_LIMITS = Object.freeze({
  maxArchives: 64,
  maxCompressedArchive: 64 * MIB,
  maxCompressedTotal: 96 * MIB,
  maxEntriesPerArchive: 32,
  maxEntriesTotal: 64,
  maxMemberSize: 16 * MIB,
  maxExpandedArchive: 64 * MIB,
  maxExpandedTotal: 96 * MIB,
  maxExpansionRatio: 200,
  maxPathComponents: 4,
  maxPathBytes: 240,
  maxComponentBytes: 100,
  maxDictionaryBytes: 64 * MIB,
  timeoutMs: 60_000,
});

const ZIP_MAGIC = Object.freeze([
  Object.freeze([0x50, 0x4b, 0x03, 0x04]),
  Object.freeze([0x50, 0x4b, 0x05, 0x06]),
]);
const ZIP_SPLIT_MAGIC = Object.freeze([0x50, 0x4b, 0x07, 0x08]);
const SEVEN_Z_MAGIC = Object.freeze([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const ARCHIVE_EXTENSION = /\.(zip|7z|rar)$/i;
function forbiddenCodePoint(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)
        || code === 0x061c || code === 0x200e || code === 0x200f
        || (code >= 0x202a && code <= 0x202e)
        || (code >= 0x2066 && code <= 0x2069)) return true;
  }
  return false;
}
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i;
const encoder = new TextEncoder();

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

export function magicArchiveKind(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? 0);
  if (startsWith(view, ZIP_SPLIT_MAGIC)) return 'split-zip';
  if (ZIP_MAGIC.some((signature) => startsWith(view, signature))) return 'zip';
  if (startsWith(view, SEVEN_Z_MAGIC)) return '7z';
  return null;
}

export function archiveKind(name, bytes) {
  const extension = String(name ?? '').match(ARCHIVE_EXTENSION)?.[1]?.toLowerCase() ?? null;
  const magic = magicArchiveKind(bytes);
  if (extension === 'rar') throw new Error(`${name}: RAR archives are not supported. Use ZIP or 7z.`);
  if (magic === 'split-zip') throw new Error(`${name}: split or spanned ZIP archives are not supported.`);
  if (extension === 'zip' || extension === '7z') {
    if (magic !== extension) {
      throw new Error(`${name}: the .${extension} extension does not match the archive signature.`);
    }
    return extension;
  }
  if (magic) throw new Error(`${name}: an archive signature requires a matching .zip or .7z extension.`);
  return null;
}

function pathBytes(value) {
  return encoder.encode(value).length;
}

export function normalizeArchivePath(value, options = {}) {
  const original = String(value ?? '');
  if (!original || original.startsWith('/') || original.startsWith('\\')
      || /^[a-z]:/i.test(original) || original.startsWith('//')) {
    throw new Error(`Unsafe archive path: ${JSON.stringify(original)}`);
  }
  let normalized = original.replaceAll('\\', '/').normalize('NFC');
  if (options.directory && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  const components = normalized.split('/');
  if (!normalized || components.length > (options.maxComponents ?? ARCHIVE_LIMITS.maxPathComponents)
      || components.some((component) => !component || component === '.' || component === '..')) {
    throw new Error(`Unsafe archive path: ${JSON.stringify(original)}`);
  }
  if (pathBytes(normalized) > (options.maxPathBytes ?? ARCHIVE_LIMITS.maxPathBytes)) {
    throw new Error(`Archive path is too long: ${JSON.stringify(original)}`);
  }
  for (const component of components) {
    if (pathBytes(component) > (options.maxComponentBytes ?? ARCHIVE_LIMITS.maxComponentBytes)
        || forbiddenCodePoint(component) || component.includes(':')
        || /[<>"|?*]/.test(component) || /^[-@]/.test(component)
        || /[ .]$/.test(component) || WINDOWS_DEVICE.test(component)) {
      throw new Error(`Unsafe archive path component: ${JSON.stringify(component)}`);
    }
  }
  return normalized;
}

function assertInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is not a safe nonnegative integer.`);
}

function methodAllowed(kind, method) {
  const tokens = String(method ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  if (kind === 'zip') return tokens.every((token) => /^(?:Store|Deflate)$/i.test(token));
  return tokens.every((token) => /^(?:Copy|LZMA2?:\d+(?::(?:lc|lp|pb)\d+)*)$/i.test(token));
}

const LISTING_KEYS = new Set([
  'Path', 'Folder', 'Size', 'Packed Size', 'Modified', 'Created', 'Accessed',
  'Attributes', 'Encrypted', 'Comment', 'CRC', 'Method', 'Characteristics',
  'Host OS', 'Version', 'Volume Index', 'Offset', 'Block', 'Symbolic Link',
  'Hard Link',
]);

function dictionaryBytes(method) {
  const exponent = String(method ?? '').match(/\bLZMA2?:(\d+)/i)?.[1];
  if (exponent == null) return null;
  const bits = Number(exponent);
  if (!Number.isInteger(bits) || bits < 0 || bits > 30) {
    throw new Error(`Archive listing has invalid LZMA dictionary ${exponent}.`);
  }
  return 2 ** bits;
}

export function parseSevenZipListing(lines, kind, options = {}) {
  if (kind !== 'zip' && kind !== '7z') throw new Error(`Unsupported archive kind ${kind}`);
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > (options.maxLines ?? 2048)) {
    throw new Error('Archive technical listing has an invalid line count.');
  }
  const records = [];
  let fields = new Map();
  const finish = () => {
    if (!fields.size) return;
    const path = fields.get('Path');
    if (path == null) throw new Error('Archive listing record has no path.');
    const folder = fields.get('Folder') === '+'
      || /^D/i.test(String(fields.get('Attributes') ?? '').trim());
    const sizeText = fields.get('Size');
    if (sizeText == null || !/^\d+$/.test(sizeText)) {
      throw new Error(`${path}: archive listing has an invalid size.`);
    }
    if (fields.get('Symbolic Link') || fields.get('Hard Link')) {
      throw new Error(`${path}: archive links are not supported.`);
    }
    if (fields.has('Volume Index') && fields.get('Volume Index') !== '0') {
      throw new Error(`${path}: multivolume archives are not supported.`);
    }
    records.push({
      path,
      type: folder ? 'directory' : 'file',
      size: Number(sizeText),
      encrypted: fields.get('Encrypted') === '+',
      method: fields.get('Method') ?? '',
      dictionaryBytes: dictionaryBytes(fields.get('Method')),
    });
    fields = new Map();
  };

  for (const value of lines) {
    const line = String(value);
    if (pathBytes(line) > (options.maxLineBytes ?? 4096)) {
      throw new Error('Archive technical listing contains an overlong line.');
    }
    if (line === '') {
      finish();
      continue;
    }
    const separator = line.indexOf(' = ');
    if (separator <= 0) throw new Error('Archive technical listing contains a malformed line.');
    const key = line.slice(0, separator);
    if (!LISTING_KEYS.has(key)) throw new Error(`Archive listing contains unknown field ${key}.`);
    if (fields.has(key)) throw new Error(`Archive listing repeats field ${key}.`);
    fields.set(key, line.slice(separator + 3));
  }
  finish();
  return records;
}

export function validateArchiveEntries(kind, entries, compressedSize, options = {}) {
  const limits = { ...ARCHIVE_LIMITS, ...options };
  if (kind !== 'zip' && kind !== '7z') throw new Error(`Unsupported archive kind ${kind}`);
  assertInteger(compressedSize, 'Archive compressed size');
  if (compressedSize === 0 || compressedSize > limits.maxCompressedArchive) {
    throw new Error(`Archive compressed size exceeds ${limits.maxCompressedArchive} bytes.`);
  }
  if (!Array.isArray(entries) || entries.length === 0
      || entries.length > limits.maxEntriesPerArchive) {
    throw new Error(`Archive entry count must be between 1 and ${limits.maxEntriesPerArchive}.`);
  }

  const paths = new Set();
  const basenames = new Set();
  const files = [];
  let expandedBytes = 0;
  for (const entry of entries) {
    const type = entry?.type;
    if (type !== 'file' && type !== 'directory') {
      throw new Error(`Archive contains unsupported entry type ${String(type)}.`);
    }
    const path = normalizeArchivePath(entry.path, {
      directory: type === 'directory',
      maxComponents: limits.maxPathComponents,
      maxPathBytes: limits.maxPathBytes,
      maxComponentBytes: limits.maxComponentBytes,
    });
    const foldedPath = path.toLocaleLowerCase('en-US');
    if (paths.has(foldedPath)) throw new Error(`Archive contains duplicate path ${path}.`);
    paths.add(foldedPath);
    if (type === 'directory') continue;

    assertInteger(entry.size, `${path} expanded size`);
    if (entry.size === 0 || entry.size > limits.maxMemberSize) {
      throw new Error(`${path} expanded size must be between 1 and ${limits.maxMemberSize} bytes.`);
    }
    if (entry.encrypted) throw new Error(`${path} is encrypted.`);
    if (!methodAllowed(kind, entry.method)) {
      throw new Error(`${path} uses unsupported ${kind} method ${String(entry.method)}.`);
    }
    if (entry.dictionaryBytes != null) {
      assertInteger(entry.dictionaryBytes, `${path} dictionary size`);
      if (entry.dictionaryBytes > limits.maxDictionaryBytes) {
        throw new Error(`${path} dictionary exceeds ${limits.maxDictionaryBytes} bytes.`);
      }
    }

    const basename = path.slice(path.lastIndexOf('/') + 1).toLocaleLowerCase('en-US');
    if (basenames.has(basename)) throw new Error(`Archive contains duplicate basename ${basename}.`);
    basenames.add(basename);
    expandedBytes += entry.size;
    if (expandedBytes > limits.maxExpandedArchive) {
      throw new Error(`Archive expands beyond ${limits.maxExpandedArchive} bytes.`);
    }
    files.push({ ...entry, path });
  }
  if (!files.length) throw new Error('Archive contains no regular files.');
  if (expandedBytes / compressedSize > limits.maxExpansionRatio) {
    throw new Error(`Archive expansion ratio exceeds ${limits.maxExpansionRatio}:1.`);
  }
  return { files, expandedBytes, entries: entries.length };
}

export function validateArchiveSelection(archives, options = {}) {
  const limits = { ...ARCHIVE_LIMITS, ...options };
  if (!Array.isArray(archives) || archives.length > limits.maxArchives) {
    throw new Error(`Select at most ${limits.maxArchives} archives at once.`);
  }
  let compressedBytes = 0;
  let expandedBytes = 0;
  let entries = 0;
  for (const archive of archives) {
    assertInteger(archive.compressedBytes, 'Archive compressed size');
    assertInteger(archive.expandedBytes, 'Archive expanded size');
    assertInteger(archive.entries, 'Archive entry count');
    compressedBytes += archive.compressedBytes;
    expandedBytes += archive.expandedBytes;
    entries += archive.entries;
  }
  if (compressedBytes > limits.maxCompressedTotal) {
    throw new Error(`Selected archives exceed ${limits.maxCompressedTotal} compressed bytes.`);
  }
  if (expandedBytes > limits.maxExpandedTotal) {
    throw new Error(`Selected archives exceed ${limits.maxExpandedTotal} expanded bytes.`);
  }
  if (entries > limits.maxEntriesTotal) {
    throw new Error(`Selected archives exceed ${limits.maxEntriesTotal} total entries.`);
  }
  return { compressedBytes, expandedBytes, entries };
}

export function rejectNestedArchive(path, bytes) {
  if (ARCHIVE_EXTENSION.test(path) || magicArchiveKind(bytes)) {
    throw new Error(`${path}: nested archives are not accepted.`);
  }
}
