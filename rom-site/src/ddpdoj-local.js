import { Game, RAM } from '/games/ddpdoj/src/main.js';
import { FullRom } from '/games/ddpdoj/src/rom.js';
import {
  buildMainCpu, tablesFromMainCpu, installColdBootDefaults,
} from '/games/ddpdoj/src/localrom.js';
import { loadRegions } from '/games/ddpdoj/src/render/regions.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
} from '/games/ddpdoj/src/render/igs023.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '/games/ddpdoj/src/render/spritelist.js';
import { zoomRamWords } from '/games/ddpdoj/src/zoomtable.js';
import {
  attachInput, pollInput, currentPortWord, currentCoinWord,
  tickCoinPulse, attachCoinKeys, clearCoin,
} from '/games/ddpdoj/src/web/input.js';

const GRAPHICS = Object.freeze([
  'pgm_t01s.rom',
  'cave_t04401w064.u19',
  'cave_a04401w064.u7',
  'cave_a04402w064.u8',
  'cave_b04401w064.u1',
]);

function inputFor(summary, name) {
  return summary.acceptedInputs?.find((input) => input.satisfiesNames.includes(name)) ?? null;
}

async function readInput(input, label) {
  if (!input?.file) throw new Error(`Validated local input for ${label} is unavailable.`);
  return new Uint8Array(await input.file.arrayBuffer());
}

async function localData(summary, onStatus) {
  const decrypted = summary.acceptedInputs?.find((input) =>
    input.satisfiesNames.includes('ddb10_10_8_434f.u45')
    && input.satisfiesNames.includes('ddp3_bios.u37'));
  onStatus?.('Preparing the local DaiOuJou program image...');
  const maincpu = decrypted
    ? await buildMainCpu({ decrypted: await readInput(decrypted, 'decrypted maincpu') })
    : await buildMainCpu({
      bios: await readInput(inputFor(summary, 'ddp3_bios.u37'), 'ddp3_bios.u37'),
      program: await readInput(inputFor(summary, 'ddb10_10_8_434f.u45'), 'ddb10_10_8_434f.u45'),
    });

  const graphics = new Map();
  for (const name of GRAPHICS) {
    onStatus?.(`Reading local graphics member ${name}...`);
    graphics.set(name, await readInput(inputFor(summary, name), name));
  }
  onStatus?.('Assembling local IGS023 graphics regions...');
  return {
    maincpu,
    regions: loadRegions((name) => graphics.get(name)),
  };
}

function copySpriteList(game, out) {
  for (let index = 0; index < out.length; index++) {
    out[index] = game.ram.u16(RAM.spriteList + index * 2);
  }
}

export class LocalDdpdojRuntime {
  static async create(summary, canvas, options = {}) {
    if (!summary?.complete || summary.gameId !== 'ddpdoj') {
      throw new Error('DaiOuJou launch requires one complete exact local identity set.');
    }
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('DaiOuJou launch needs a canvas.');

    const { maincpu, regions } = await localData(summary, options.onStatus);
    const rom = new FullRom(maincpu);
    const tables = tablesFromMainCpu(maincpu);
    const game = new Game(new Uint8Array(0x20000), tables, {
      rom,
      palCatchUp: false,
      coinTick: tickCoinPulse,
    });
    game.boot();
    installColdBootDefaults(game.ram);

    attachInput(window);
    attachCoinKeys(window, document);
    return new LocalDdpdojRuntime(game, regions, canvas, options);
  }

  constructor(game, regions, canvas, options = {}) {
    this.game = game;
    this.renderer = new Renderer(regions);
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('A 2D canvas context is unavailable.');
    this.onError = options.onError ?? null;
    this.rowscroll = new Uint16Array(SCREEN_H);
    this.zoomram = zoomRamWords();
    this.spritebuffer = new Uint16Array(SPRITE_LIMIT * RAM_STRIDE);
    this.paletteRgb = new Uint8Array(game.palette.words.length * 3);
    this.rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rotated = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rgba = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4);
    this.image = new ImageData(this.rgba, SCREEN_H, SCREEN_W);
    this.canvas.width = SCREEN_H;
    this.canvas.height = SCREEN_W;
    this.running = false;
    this.request = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    copySpriteList(game, this.spritebuffer);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.request = requestAnimationFrame((time) => this.frame(time));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.request);
    clearCoin();
  }

  frame(time) {
    if (!this.running) return;
    try {
      pollInput();
      this.accumulator += Math.min(100, time - this.lastTime);
      this.lastTime = time;
      let steps = 0;
      while (this.accumulator >= 1000 / 60 && steps < 4) {
        copySpriteList(this.game, this.spritebuffer);
        this.game.coinPort = currentCoinWord();
        this.game.step(currentPortWord());
        this.accumulator -= 1000 / 60;
        steps++;
      }
      this.draw();
      this.request = requestAnimationFrame((next) => this.frame(next));
    } catch (error) {
      this.stop();
      this.onError?.(error);
    }
  }

  draw() {
    const indexed = this.renderer.renderIndexed({
      bg: this.game.vram.w,
      tx: this.game.txvram.w,
      rowscroll: this.rowscroll,
      zoomram: this.zoomram,
      spritebuffer: this.spritebuffer,
      regs: this.game.video,
    }, { spriteStride: RAM_STRIDE });
    paletteRgb(this.game.palette.words, this.paletteRgb);
    resolveRgb(indexed, this.paletteRgb, this.rgb);
    rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rotated);
    rgbToRgba(this.rotated, this.rgba);
    this.context.putImageData(this.image, 0, 0);
  }
}
