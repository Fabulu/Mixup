import { boot, fitCanvas } from '/games/gradius/src/main.js';
import { createGradiusLocalResources, GRADIUS_LOCAL_GAME } from '/games/gradius/src/localrom.js';

const GRADIUS_SHA256 = '38c44e0e6f531a2779271f10cd4daa08ee2616c59c49d476b6f4e9dc482bf5f3';

function validatedInput(summary) {
  return summary.acceptedInputs?.find((input) => input.sha256 === GRADIUS_SHA256
    && input.satisfiesNames.includes('Gradius (USA).nes'));
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
  if (!input?.file) throw new Error('The validated local Gradius cartridge is unavailable.');
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  throwIfAborted(signal);
  return bytes;
}

async function yieldForTransform(signal) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

export class LocalGradiusRuntime {
  static async prepare(summary, options = {}) {
    if (!summary?.complete || summary.gameId !== 'gradius') {
      throw new Error('Gradius launch requires one complete exact local cartridge identity.');
    }
    const input = validatedInput(summary);
    if (!input) throw new Error('The validated local Gradius cartridge is unavailable.');

    options.onStatus?.('Preparing Gradius runtime data from the validated cartridge...');
    const bytes = await inputBytes(input, options.signal);
    await yieldForTransform(options.signal);
    const resources = createGradiusLocalResources(bytes);
    throwIfAborted(options.signal);
    return Object.freeze({ gameId: 'gradius', resources });
  }

  static async createFromPrepared(prepared, canvas, options = {}) {
    if (prepared?.gameId !== 'gradius' || !prepared.resources) {
      throw new Error('Gradius launch requires prepared local cartridge data.');
    }
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Gradius launch needs a canvas.');
    const config = options.config ?? {};
    const runtime = await boot(canvas, {
      ...config,
      resources: prepared.resources,
      game: GRADIUS_LOCAL_GAME,
      target: options.target ?? window,
      onError: (error) => options.onError?.(error),
    });
    return new LocalGradiusRuntime(runtime, canvas, config.audio ?? null);
  }

  static async create(summary, canvas, options = {}) {
    const prepared = await LocalGradiusRuntime.prepare(summary, options);
    return LocalGradiusRuntime.createFromPrepared(prepared, canvas, options);
  }

  constructor(runtime, canvas, audio) {
    this.runtime = runtime;
    this.canvas = canvas;
    this.audio = audio;
  }

  start() {}
  fit(container) { fitCanvas(this.canvas, container); }
  toggleSound() {
    if (!this.audio) return false;
    this.audio.setMuted(!this.audio.muted);
    return !this.audio.muted;
  }
  stop() {
    this.runtime.stop();
    this.audio?.setMuted(true);
    this.audio?.resync();
  }
}
