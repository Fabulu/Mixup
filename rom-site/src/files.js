export function normalizeFiles(groups) {
  const files = [];
  const seen = new Set();
  for (const group of groups) {
    for (const file of Array.from(group ?? [])) {
      if (!file || typeof file.arrayBuffer !== 'function') continue;
      const relative = file.mixupRelativePath || file.webkitRelativePath || file.name;
      const key = `${relative}\u0000${file.size}\u0000${file.lastModified ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(file);
    }
  }
  return files;
}

export function filesFromInput(input) {
  return normalizeFiles([input?.files]);
}

function entryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readEntryBatch(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function filesFromEntry(entry, path, output, limits, depth = 0) {
  if (depth > limits.maxDepth) throw new Error(`Dropped folder nesting exceeds ${limits.maxDepth} levels.`);
  if (entry.isFile) {
    const file = await entryFile(entry);
    Object.defineProperty(file, 'mixupRelativePath', {
      value: `${path}${entry.name}`, configurable: true,
    });
    output.push(file);
    if (output.length > limits.maxFiles) throw new Error(`Dropped selection exceeds ${limits.maxFiles} files.`);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  for (;;) {
    const batch = await readEntryBatch(reader);
    if (!batch.length) break;
    for (const child of batch) {
      await filesFromEntry(child, `${path}${entry.name}/`, output, limits, depth + 1);
    }
  }
}

export async function filesFromDataTransfer(dataTransfer, options = {}) {
  const limits = {
    maxFiles: options.maxFiles ?? 2048,
    maxDepth: options.maxDepth ?? 32,
  };
  const entries = Array.from(dataTransfer?.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  if (!entries.length) return normalizeFiles([dataTransfer?.files]);

  const dropped = [];
  for (const entry of entries) await filesFromEntry(entry, '', dropped, limits);
  return normalizeFiles([dropped]);
}

export async function collectDirectoryFiles(handle, options = {}) {
  const files = [];
  const maxFiles = options.maxFiles ?? 2048;
  const visit = async (directory, prefix = '') => {
    for await (const entry of directory.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        Object.defineProperty(file, 'mixupRelativePath', {
          value: `${prefix}${entry.name}`, configurable: true,
        });
        files.push(file);
        if (files.length > maxFiles) throw new Error(`Selected folder exceeds ${maxFiles} files.`);
      } else if (entry.kind === 'directory' && options.recursive !== false) {
        await visit(entry, `${prefix}${entry.name}/`);
      }
    }
  };
  await visit(handle);
  return normalizeFiles([files]);
}

export async function chooseDirectory(showPicker = globalThis.showDirectoryPicker) {
  if (typeof showPicker !== 'function') {
    throw new Error('Persistent folder access is not supported by this browser. Use the folder or file input instead.');
  }
  return showPicker({ mode: 'read' });
}

export function describeSelection(files) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return { count: files.length, totalBytes };
}
