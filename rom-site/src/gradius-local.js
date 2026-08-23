import { boot } from '/games/gradius/src/main.js';
import { createGradiusLocalResources, GRADIUS_LOCAL_GAME } from '/games/gradius/src/localrom.js';

const GRADIUS_SHA256 = '38c44e0e6f531a2779271f10cd4daa08ee2616c59c49d476b6f4e9dc482bf5f3';

function validatedInput(summary) {
  return summary.acceptedInputs?.find((input) => input.sha256 === GRADIUS_SHA256
    && input.satisfiesNames.includes('Gradius (USA).nes'));
}

export class LocalGradiusRuntime {
  static async create(summary, canvas, options = {}) {
    if (!summary?.complete || summary.gameId !== 'gradius') {
      throw new Error('Gradius launch requires one complete exact local cartridge identity.');
    }
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Gradius launch needs a canvas.');
    const input = validatedInput(summary);
    if (!input?.file) throw new Error('The validated local Gradius cartridge is unavailable.');

    options.onStatus?.('Extracting Gradius runtime data in this browser...');
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const resources = createGradiusLocalResources(bytes);
    canvas.width = 256;
    canvas.height = 240;
    const runtime = await boot(canvas, {
      resources,
      game: GRADIUS_LOCAL_GAME,
      target: window,
      onError: (error) => options.onError?.(error),
    });
    return new LocalGradiusRuntime(runtime);
  }

  constructor(runtime) {
    this.runtime = runtime;
  }

  start() {}
  stop() { this.runtime.stop(); }
}
