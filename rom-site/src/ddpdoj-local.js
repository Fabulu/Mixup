import { Game, RAM } from '/games/ddpdoj/src/main.js';
import { FullRom } from '/games/ddpdoj/src/rom.js';
import {
  buildMainCpu, soundAssetsFromLocalRoms, tablesFromMainCpu,
} from '/games/ddpdoj/src/localrom.js';
import { soundRuntimeFromStage1Seed } from '/games/ddpdoj/src/soundruntime.js';
import { APPROVED_SOUND_POLICIES } from '/games/ddpdoj/src/soundpolicy.js';
import {
  applyHitboxOverlay, applyPostFrameMods, applyPreFrameMods, applyPresentationMods,
  createModState, modGameOptions, prepareModCabinetBoot, transformModInput,
  transformModTiming,
} from '/games/ddpdoj/src/mods.js';
import {
  beginFormationCreditedRun, createFormationState, prepareFormationFrame,
  resolveFormationAuthenticSelection,
} from '/games/ddpdoj/src/formation.js';
import { loadRegions } from '/games/ddpdoj/src/render/regions.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
} from '/games/ddpdoj/src/render/igs023.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '/games/ddpdoj/src/render/spritelist.js';
import { zoomRamWords } from '/games/ddpdoj/src/zoomtable.js';
import {
  attachInput, pollInput, currentPortWord, currentCoinWord,
  tickCoinPulse, attachCoinKeys, clearCoin, clearKeyboard, clearTouch,
} from '/games/ddpdoj/src/web/input.js';

const GRAPHICS = Object.freeze([
  'pgm_t01s.rom',
  'cave_t04401w064.u19',
  'cave_a04401w064.u7',
  'cave_a04402w064.u8',
  'cave_b04401w064.u1',
]);

const BASE_FRAME_MS = 1000 / 60;
let inputAttached = false;

function ensureInput(target) {
  if (inputAttached) return;
  attachInput(target);
  attachCoinKeys(target, document);
  inputAttached = true;
}

function inputFor(summary, name) {
  return summary.acceptedInputs?.find((input) => input.satisfiesNames.includes(name)) ?? null;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Local ROM preparation was superseded by a newer selection.');
  error.name = 'AbortError';
  throw error;
}

async function readInput(input, label, signal) {
  throwIfAborted(signal);
  if (input?.bytes instanceof ArrayBuffer) return new Uint8Array(input.bytes);
  if (!input?.file) throw new Error(`Validated local input for ${label} is unavailable.`);
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  throwIfAborted(signal);
  return bytes;
}

async function yieldForTransform(signal) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

async function localData(summary, options = {}) {
  const { onStatus, signal } = options;
  const decrypted = summary.acceptedInputs?.find((input) =>
    input.satisfiesNames.includes('ddb10_10_8_434f.u45')
    && input.satisfiesNames.includes('ddp3_bios.u37'));
  onStatus?.('Preparing the local DaiOuJou program image...');
  let maincpu;
  if (decrypted) {
    const bytes = await readInput(decrypted, 'decrypted maincpu', signal);
    await yieldForTransform(signal);
    maincpu = await buildMainCpu({ decrypted: bytes });
  } else {
    const bios = await readInput(inputFor(summary, 'ddp3_bios.u37'),
      'ddp3_bios.u37', signal);
    const program = await readInput(inputFor(summary, 'ddb10_10_8_434f.u45'),
      'ddb10_10_8_434f.u45', signal);
    await yieldForTransform(signal);
    maincpu = await buildMainCpu({ bios, program });
  }
  throwIfAborted(signal);

  const graphics = new Map();
  for (const name of GRAPHICS) {
    onStatus?.(`Reading validated graphics member ${name} from memory...`);
    graphics.set(name, await readInput(inputFor(summary, name), name, signal));
  }
  onStatus?.('Assembling local IGS023 graphics regions...');
  await yieldForTransform(signal);
  const regions = loadRegions((name) => graphics.get(name));
  throwIfAborted(signal);

  onStatus?.('Preparing local DaiOuJou sound data and runtime tables...');
  const sampleRom = await readInput(inputFor(summary, 'cave_m04401b032.u17'),
    'cave_m04401b032.u17', signal);
  await yieldForTransform(signal);
  const soundAssets = soundAssetsFromLocalRoms(maincpu, sampleRom);
  const tables = tablesFromMainCpu(maincpu);
  throwIfAborted(signal);
  return Object.freeze({
    gameId: 'ddpdoj',
    maincpu,
    regions,
    soundAssets,
    tables,
    rom: new FullRom(maincpu),
  });
}

function copySpriteList(game, out) {
  for (let index = 0; index < out.length; index++) {
    out[index] = game.ram.u16(RAM.spriteList + index * 2);
  }
}

export class LocalDdpdojRuntime {
  static async prepare(summary, options = {}) {
    if (!summary?.complete || summary.gameId !== 'ddpdoj') {
      throw new Error('DaiOuJou launch requires one complete exact local identity set.');
    }
    return localData(summary, options);
  }

  static async createFromPrepared(prepared, canvas, options = {}) {
    if (prepared?.gameId !== 'ddpdoj' || !prepared.maincpu || !prepared.regions
        || !prepared.soundAssets || !prepared.tables || !prepared.rom) {
      throw new Error('DaiOuJou launch requires prepared local ROM data.');
    }
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('DaiOuJou launch needs a canvas.');

    const {
      regions, soundAssets, tables, rom,
    } = prepared;
    const config = options.config ?? {};
    const audio = config.audio ?? null;
    const soundRuntime = audio
      ? soundRuntimeFromStage1Seed(soundAssets, APPROVED_SOUND_POLICIES, 0)
      : null;
    const loadout = config.loadout ?? null;
    const modState = loadout?.ids?.length ? createModState(loadout) : null;
    if (modState) prepareModCabinetBoot(modState);
    const formationState = createFormationState(config.formation);
    const formationSelection = formationState
      ? resolveFormationAuthenticSelection(formationState.mode, config.authenticSelection)
      : null;
    if (formationState && !formationSelection) {
      throw new Error('Formation mode received an invalid P1 selection.');
    }
    let game = null;
    let gameOptions = { ...(modGameOptions(modState) ?? {}) };
    if (formationState) {
      const cabinetRunStartHook = gameOptions.cabinetRunStartHook;
      gameOptions = {
        ...gameOptions,
        cabinetRunStartHook: (ram, event) => {
          cabinetRunStartHook?.(ram, event);
          if (event?.demo) return;
          const firstRun = !formationState.foundation;
          beginFormationCreditedRun(formationState, game, formationSelection);
          if (firstRun) {
            options.onStatus?.(`${formationState.mode.name} joined the credited run.`);
          }
        },
      };
    }
    game = new Game(new Uint8Array(0x20000), tables, {
      rom,
      palCatchUp: false,
      seedArm: 0,
      coinTick: tickCoinPulse,
      ...(audio ? { soundSink: audio } : {}),
      ...gameOptions,
    });
    game.boot({ cabinetFrontend: true });
    if (soundRuntime) audio.setChip(soundRuntime);

    ensureInput(canvas);
    return new LocalDdpdojRuntime(game, regions, canvas, {
      ...options,
      audio,
      modState,
      formationState,
      mode: config.mode,
    });
  }

  static async create(summary, canvas, options = {}) {
    const prepared = await LocalDdpdojRuntime.prepare(summary, options);
    return LocalDdpdojRuntime.createFromPrepared(prepared, canvas, options);
  }

  constructor(game, regions, canvas, options = {}) {
    this.game = game;
    this.renderer = new Renderer(regions);
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('A 2D canvas context is unavailable.');
    this.onError = options.onError ?? null;
    this.audio = options.audio ?? null;
    this.modState = options.modState ?? null;
    this.formationState = options.formationState ?? null;
    this.rowscroll = new Uint16Array(SCREEN_H);
    this.zoomram = zoomRamWords();
    this.spritebuffer = new Uint16Array(SPRITE_LIMIT * RAM_STRIDE);
    this.paletteRgb = new Uint8Array(game.palette.words.length * 3);
    this.rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rotated = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rgba = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4);
    this.hitboxRam = this.modState?.loadout.presentation.hitboxes
      ? game.ram.clone() : null;
    this.mode = null;
    this.image = null;
    this.setMode(options.mode === 'yoko' ? 'yoko' : 'tate');
    this.running = false;
    this.request = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    copySpriteList(game, this.spritebuffer);
  }

  setMode(mode) {
    const next = mode === 'yoko' ? 'yoko' : 'tate';
    if (next === this.mode && this.image) return;
    this.mode = next;
    const width = next === 'yoko' ? SCREEN_W : SCREEN_H;
    const height = next === 'yoko' ? SCREEN_H : SCREEN_W;
    this.canvas.width = width;
    this.canvas.height = height;
    this.image = new ImageData(this.rgba, width, height);
  }

  fit(container) {
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const scale = Math.max(1, Math.floor(Math.min(
      container.clientWidth * dpr / this.canvas.width,
      container.clientHeight * dpr / this.canvas.height,
    )));
    this.canvas.style.width = `${this.canvas.width * scale / dpr}px`;
    this.canvas.style.height = `${this.canvas.height * scale / dpr}px`;
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
    this.audio?.setMuted(true);
    this.audio?.resync();
    clearKeyboard();
    clearTouch();
    clearCoin();
  }

  toggleSound() {
    if (!this.audio) return false;
    this.audio.setMuted(!this.audio.muted);
    return !this.audio.muted;
  }

  frame(time) {
    if (!this.running) return;
    try {
      pollInput();
      this.accumulator += Math.min(100, time - this.lastTime);
      this.lastTime = time;
      let period = transformModTiming(this.modState,
        BASE_FRAME_MS * Math.max(1, this.game.armedVblanks || 1));
      let steps = 0;
      while (this.accumulator >= period && steps < 8) {
        this.accumulator -= period;
        copySpriteList(this.game, this.spritebuffer);
        if (this.hitboxRam) this.hitboxRam.b.set(this.game.ram.b);
        applyPreFrameMods(this.modState, this.game.ram);
        const modWord = transformModInput(this.modState,
          currentPortWord(), this.game.logicFrame);
        const portWord = this.formationState
          ? prepareFormationFrame(this.formationState, this.game, modWord)
          : modWord;
        this.game.coinPort = currentCoinWord();
        this.game.step(portWord);
        if (this.modState?.loadout.presentation.dropSpriteHold) {
          copySpriteList(this.game, this.spritebuffer);
          if (this.hitboxRam) this.hitboxRam.b.set(this.game.ram.b);
        }
        applyPostFrameMods(this.modState, this.game.ram);
        steps++;
        period = transformModTiming(this.modState,
          BASE_FRAME_MS * Math.max(1, this.game.armedVblanks || 1));
      }
      this.audio?.pump();
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
    applyPresentationMods(this.modState, this.rgb);
    applyHitboxOverlay(this.modState, this.hitboxRam ?? this.game.ram, this.rgb);
    const output = this.mode === 'yoko'
      ? this.rgb
      : rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rotated);
    rgbToRgba(output, this.rgba);
    this.context.putImageData(this.image, 0, 0);
  }
}
