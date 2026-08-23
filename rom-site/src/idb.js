const DATABASE = 'mixup-local-rom-folders';
const VERSION = 1;
const STORE = 'handles';
const DIRECTORY_KEY = 'rom-directory';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

export async function openHandleDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB?.open) return null;
  const request = indexedDB.open(DATABASE, VERSION);
  request.addEventListener('upgradeneeded', () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  }, { once: true });
  return requestResult(request);
}

async function useStore(mode, operation, openDatabase = openHandleDatabase) {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(STORE, mode);
    const value = await operation(transaction.objectStore(STORE));
    await new Promise((resolve, reject) => {
      transaction.addEventListener('complete', resolve, { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    return value;
  } finally {
    database.close();
  }
}

export async function saveDirectoryHandle(handle, openDatabase) {
  if (!handle || handle.kind !== 'directory') throw new TypeError('A directory handle is required');
  const result = await useStore('readwrite', (store) => requestResult(store.put(handle, DIRECTORY_KEY)), openDatabase);
  return result !== null;
}

export async function loadDirectoryHandle(openDatabase) {
  return useStore('readonly', (store) => requestResult(store.get(DIRECTORY_KEY)), openDatabase);
}

export async function forgetDirectoryHandle(openDatabase) {
  const result = await useStore('readwrite', (store) => requestResult(store.delete(DIRECTORY_KEY)), openDatabase);
  return result !== null;
}

export async function queryDirectoryPermission(handle) {
  if (!handle?.queryPermission) return 'unsupported';
  return handle.queryPermission({ mode: 'read' });
}

// Call this only inside a user-triggered event. Automatic startup reuse calls
// queryDirectoryPermission and never reaches this function.
export async function requestDirectoryPermission(handle) {
  if (!handle?.requestPermission) return 'unsupported';
  return handle.requestPermission({ mode: 'read' });
}

export async function reusableDirectory(openDatabase) {
  const handle = await loadDirectoryHandle(openDatabase);
  if (!handle) return { handle: null, permission: 'missing' };
  const permission = await queryDirectoryPermission(handle);
  return { handle, permission };
}
