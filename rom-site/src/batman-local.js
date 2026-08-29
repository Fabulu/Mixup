import { boot } from '/games/batman/src/main.js';
import { createBatmanRomProvider } from '/games/batman/src/localrom.js';

const BATMAN_SHA256 = '152fc252bba7130e786d408eed310b3009b8e05834f8003dfbf514ec804cbaea';

function validatedInput(summary) {
  return summary.acceptedInputs?.find((input) => input.sha256 === BATMAN_SHA256
    && input.satisfiesNames.includes('Batman - Return of the Joker (USA, Europe).gb'));
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Local ROM preparation was superseded by a newer selection.');
  error.name = 'AbortError';
  throw error;
}

async function inputBytes(input, signal) {
  throwIfAborted(signal);
  if (input?.bytes instanceof ArrayBuffer) return new Uint8Array(input.bytes);
  if (!input?.file) throw new Error('The validated local Batman cartridge is unavailable.');
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  throwIfAborted(signal);
  return bytes;
}

async function yieldForTransform(signal) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

export class LocalBatmanRuntime {
  static async prepare(summary, options = {}) {
    if (!summary?.complete || summary.gameId !== 'batman') {
      throw new Error('Batman launch requires one complete exact local cartridge identity.');
    }
    const input = validatedInput(summary);
    if (!input) throw new Error('The validated local Batman cartridge is unavailable.');

    options.onStatus?.('Preparing Batman runtime data from the validated cartridge...');
    const bytes = await inputBytes(input, options.signal);
    await yieldForTransform(options.signal);
    const assets = createBatmanRomProvider(bytes);
    throwIfAborted(options.signal);
    return Object.freeze({ gameId: 'batman', assets });
  }

  static async createFromPrepared(prepared, canvas, options = {}) {
    if (prepared?.gameId !== 'batman' || !prepared.assets) {
      throw new Error('Batman launch requires prepared local cartridge data.');
    }
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Batman launch needs a canvas.');
    const config = options.config ?? {};
    const runtime = await boot(canvas, {
      ...config,
      assetProvider: prepared.assets,
      soundData: prepared.assets.soundData,
      onOptions: options.onOptions,
      onError: (message, error) => options.onError?.(error ?? new Error(message)),
    });
    return new LocalBatmanRuntime(runtime);
  }

  static async create(summary, canvas, options = {}) {
    const prepared = await LocalBatmanRuntime.prepare(summary, options);
    return LocalBatmanRuntime.createFromPrepared(prepared, canvas, options);
  }

  constructor(runtime) {
    this.runtime = runtime;
  }

  start() {}
  stop() { this.runtime.stop(); }
}
