import { boot } from '/games/batman/src/main.js';
import { createBatmanRomProvider } from '/games/batman/src/localrom.js';

const BATMAN_SHA256 = '152fc252bba7130e786d408eed310b3009b8e05834f8003dfbf514ec804cbaea';

function validatedInput(summary) {
  return summary.acceptedInputs?.find((input) => input.sha256 === BATMAN_SHA256
    && input.satisfiesNames.includes('Batman - Return of the Joker (USA, Europe).gb'));
}

export class LocalBatmanRuntime {
  static async create(summary, canvas, options = {}) {
    if (!summary?.complete || summary.gameId !== 'batman') {
      throw new Error('Batman launch requires one complete exact local cartridge identity.');
    }
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Batman launch needs a canvas.');
    const input = validatedInput(summary);
    if (!input?.file) throw new Error('The validated local Batman cartridge is unavailable.');

    options.onStatus?.('Extracting Batman runtime data in this browser...');
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const assets = createBatmanRomProvider(bytes);
    const runtime = await boot(canvas, {
      assetProvider: assets,
      soundData: assets.soundData,
      onError: (message, error) => options.onError?.(error ?? new Error(message)),
    });
    return new LocalBatmanRuntime(runtime);
  }

  constructor(runtime) {
    this.runtime = runtime;
  }

  start() {}
  stop() { this.runtime.stop(); }
}
