import { Game, MACHINE, RAM } from '../../games/ddpdoj/src/main.js';
import { FullRom } from '../../games/ddpdoj/src/rom.js';
import {
  buildMainCpu, soundAssetsFromLocalRoms, tablesFromMainCpu,
} from '../../games/ddpdoj/src/localrom.js';
import {
  soundRuntimeFromAssets, soundRuntimeFromSnapshot, soundRuntimeFromStage1Seed,
} from '../../games/ddpdoj/src/soundruntime.js';
import { DdpdojCadence } from '../../games/ddpdoj/src/cadence.js';
import { APPROVED_SOUND_POLICIES } from '../../games/ddpdoj/src/soundpolicy.js';
import {
  applyHitboxOverlay, applyPostFrameMods, applyPreFrameMods, applyPresentationMods,
  assertReplayCompatible, bindModGame, createModState, exportModReplaySeed,
  modGameOptions, prepareModCabinetBoot, restoreModReplaySeed, validateModReplaySeed,
  transformCartridgeSlowdown, transformModInput, transformModTiming,
} from '../../games/ddpdoj/src/mods.js';
import { projectRunahead, RunaheadProjectionError } from '../../games/ddpdoj/src/runahead.js';
import {
  assertFormationReplayCompatible, beginFormationCreditedRun, createFormationState,
  prepareFormationFrame, resolveFormationAuthenticSelection,
} from '../../games/ddpdoj/src/formation.js';
import {
  PLAYABLE_HIBACHI_CONFLICT, projectPlayableHibachiTelemetry,
} from '../../games/ddpdoj/src/playablehibachi.js';
import { loadRegions } from '../../games/ddpdoj/src/render/regions.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
} from '../../games/ddpdoj/src/render/igs023.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '../../games/ddpdoj/src/render/spritelist.js';
import { zoomRamWords } from '../../games/ddpdoj/src/zoomtable.js';
import {
  attachInput, pollInput, currentPortWord, currentCoinWord, createCoinProjection,
  tickCoinPulse, attachCoinKeys, clearCoin, clearKeyboard, clearTouch,
} from '../../games/ddpdoj/src/web/input.js';
import { COIN } from '../../games/ddpdoj/src/isr.js';
import {
  armPlayback, armRecorder, b64, beBytesFromWords, PERIOD_FRAMES,
  sha256Hex, stopRecorder, validateReplay,
} from '../../games/ddpdoj/src/web/replay.js';
import {
  assertPreparedEditionIdentity, authenticP2Joined, latchAuthenticP2Joined,
  localReplaySeedArm, localReplayTables, localReplayTablesMatch,
  resolvePreparedEditionIdentity, sealPreparedEditionIdentity,
} from './ddpdoj-local-state.js';

const GRAPHICS = Object.freeze([
  'pgm_t01s.rom',
  'cave_t04401w064.u19',
  'cave_a04401w064.u7',
  'cave_a04402w064.u8',
  'cave_b04401w064.u1',
]);

const BASE_FRAME_MS = 1000 / MACHINE.refreshHz;
let inputAttached = false;

function requestedEdition(options = {}) {
  return options.profile ?? options.profileId
    ?? options.config?.profile ?? options.config?.profileId;
}

function assertLocalRuntimeEdition(owner) {
  const edition = resolvePreparedEditionIdentity(owner?.profile);
  if (owner?.runtime !== edition.runtime
      || owner.game?.profile !== edition.profile
      || owner.game?.runtime !== edition.runtime
      || owner.game?.ram?.ramLayout !== edition.profile.ramLayout) {
    throw new TypeError('Mixup local DaiOuJou runtime edition identity is inconsistent.');
  }
  return edition;
}

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

async function localData(summary, options, edition) {
  const { onStatus, signal } = options;
  const { profile } = edition;
  const decrypted = summary.acceptedInputs?.find((input) =>
    input.satisfiesNames.includes('ddb10_10_8_434f.u45')
    && input.satisfiesNames.includes('ddp3_bios.u37'));
  onStatus?.('Preparing the local DaiOuJou program image...');
  let maincpu;
  if (decrypted) {
    const bytes = await readInput(decrypted, 'decrypted maincpu', signal);
    await yieldForTransform(signal);
    maincpu = await buildMainCpu({ decrypted: bytes }, { profile });
  } else {
    const bios = await readInput(inputFor(summary, 'ddp3_bios.u37'),
      'ddp3_bios.u37', signal);
    const program = await readInput(inputFor(summary, 'ddb10_10_8_434f.u45'),
      'ddb10_10_8_434f.u45', signal);
    await yieldForTransform(signal);
    maincpu = await buildMainCpu({ bios, program }, { profile });
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
  const soundAssets = soundAssetsFromLocalRoms(maincpu, sampleRom, profile);
  const tables = tablesFromMainCpu(maincpu, profile);
  throwIfAborted(signal);
  return sealPreparedEditionIdentity({
    gameId: 'ddpdoj',
    maincpu,
    regions,
    soundAssets,
    tables,
    rom: new FullRom(maincpu),
  }, profile);
}

const PRIVATE_SPRITE_PALETTE_BASE = 0x1000;

function copySpriteList(game, out, privatePaletteOut = null) {
  for (let index = 0; index < out.length; index++) {
    out[index] = game.ram.u16(RAM.spriteList + index * 2);
  }
  if (privatePaletteOut) {
    privatePaletteOut.fill(-1);
    const source = game.displayList?.privatePaletteBanks;
    if (source) privatePaletteOut.set(source);
  }
}

function beWords(bytes) {
  const words = new Uint16Array(bytes.length / 2);
  for (let index = 0; index < words.length; index++) {
    words[index] = (bytes[index * 2] << 8) | bytes[index * 2 + 1];
  }
  return words;
}

export class LocalDdpdojRuntime {
  static async prepare(summary, options = {}) {
    const edition = resolvePreparedEditionIdentity(requestedEdition(options));
    if (!summary?.complete || summary.gameId !== 'ddpdoj') {
      throw new Error('DaiOuJou launch requires one complete exact local identity set.');
    }
    return localData(summary, options, edition);
  }

  static async createFromPrepared(prepared, canvas, options = {}) {
    const edition = assertPreparedEditionIdentity(prepared, requestedEdition(options));
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
      ? soundRuntimeFromStage1Seed(soundAssets, APPROVED_SOUND_POLICIES, 0, 0)
      : null;
    const loadout = config.loadout ?? null;
    const modState = loadout?.ids?.length ? createModState(loadout) : null;
    if (modState) prepareModCabinetBoot(modState);
    const formationState = createFormationState(
      config.formation, config.formationRoster ?? null);
    if (formationState && modState?.playableHibachi) {
      throw new Error(PLAYABLE_HIBACHI_CONFLICT);
    }
    const runaheadFrames = modState?.loadout.presentation.runaheadFrames ?? 0;
    if (formationState && runaheadFrames) {
      throw new Error('Formation mode cannot be combined with runahead.');
    }
    const formationSelection = formationState
      ? resolveFormationAuthenticSelection(
          formationState.mode, config.authenticSelection ?? formationState.roster[0])
      : null;
    if (formationState && !formationSelection) {
      throw new Error('Formation mode received an invalid P1 selection.');
    }
    if (formationState && config.formationRoster != null && config.authenticSelection != null
        && (formationSelection.ship !== formationState.roster[0].ship
          || formationSelection.style !== formationState.roster[0].style)) {
      throw new Error('Formation P1 selection does not match its roster.');
    }
    if (formationState && config.formationRoster == null && config.authenticSelection != null) {
      formationState.roster = Object.freeze([
        formationSelection, ...formationState.roster.slice(1),
      ]);
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
      profile: edition.profile,
      rom,
      palCatchUp: false,
      seedArm: 0,
      coinTick: tickCoinPulse,
      ...(audio ? { soundSink: audio } : {}),
      ...gameOptions,
    });
    bindModGame(modState, game);
    game.boot({ cabinetFrontend: true });
    if (soundRuntime) audio.setChip(soundRuntime);

    ensureInput(options.target ?? canvas);
    return new LocalDdpdojRuntime(game, regions, canvas, {
      ...options,
      audio,
      edition,
      soundAssets,
      modState,
      formationState,
      runaheadFrames,
      tables,
      rom,
      mode: config.mode,
    });
  }

  static async create(summary, canvas, options = {}) {
    const prepared = await LocalDdpdojRuntime.prepare(summary, options);
    return LocalDdpdojRuntime.createFromPrepared(prepared, canvas, options);
  }

  constructor(game, regions, canvas, options = {}) {
    const edition = options.edition;
    if (!edition || game?.profile !== edition.profile || game?.runtime !== edition.runtime
        || game?.ram?.ramLayout !== edition.profile.ramLayout) {
      throw new TypeError('Mixup local DaiOuJou Game edition identity is inconsistent.');
    }
    Object.defineProperties(this, {
      profile: { value: edition.profile },
      runtime: { value: edition.runtime },
    });
    this.game = game;
    this.renderer = new Renderer(regions);
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('A 2D canvas context is unavailable.');
    this.onError = options.onError ?? null;
    this.onP2Joined = options.onP2Joined ?? null;
    this.onReplayUpdate = options.onReplayUpdate ?? null;
    this.onTelemetry = options.onTelemetry ?? null;
    this.audio = options.audio ?? null;
    this.soundAssets = options.soundAssets ?? null;
    this.modState = options.modState ?? null;
    this.formationState = options.formationState ?? null;
    this.runaheadFrames = options.runaheadFrames ?? 0;
    this.runaheadView = null;
    this.preparedTables = options.tables;
    this.tables = options.tables;
    this.rom = options.rom;
    this.recorder = null;
    this.playback = null;
    this.replayGeneration = 0;
    this.p2Joined = authenticP2Joined(game.ram.u16(RAM.playerCountM1), this.formationState);
    this.rowscroll = new Uint16Array(SCREEN_H);
    this.zoomram = zoomRamWords();
    this.spritebuffer = new Uint16Array(SPRITE_LIMIT * RAM_STRIDE);
    this.spritePrivatePaletteBanks = new Int8Array(SPRITE_LIMIT);
    this.runaheadSpritebuffer = new Uint16Array(SPRITE_LIMIT * RAM_STRIDE);
    this.runaheadPrivatePaletteBanks = new Int8Array(SPRITE_LIMIT);
    this.runaheadBg = this.runaheadFrames ? new Uint16Array(game.vram.w.length) : null;
    this.runaheadTx = this.runaheadFrames ? new Uint16Array(game.txvram.w.length) : null;
    this.runaheadRegs = this.runaheadFrames ? {} : null;
    this.runaheadPalette = this.runaheadFrames
      ? new Uint16Array(game.palette.words.length) : null;
    this.runaheadHitboxRam = null;
    this.privateSpritePaletteWords = this.modState?.playableHibachi?.privatePaletteWords ?? null;
    this.renderPaletteWords = this.privateSpritePaletteWords
      ? new Uint16Array(PRIVATE_SPRITE_PALETTE_BASE + this.privateSpritePaletteWords.length)
      : null;
    this.paletteRgb = new Uint8Array(
      (this.renderPaletteWords?.length ?? game.palette.words.length) * 3,
    );
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
    this.cadence = new DdpdojCadence(BASE_FRAME_MS);
    copySpriteList(game, this.spritebuffer, this.spritePrivatePaletteBanks);
    this.onP2Joined?.(this.p2Joined);
  }

  resyncTiming() {
    this.cadence.reset();
    this.lastTime = this.running ? performance.now() : 0;
  }

  updateP2Joined() {
    const joined = latchAuthenticP2Joined(
      this.p2Joined,
      this.game.ram.u16(RAM.playerCountM1),
      this.formationState,
    );
    if (joined === this.p2Joined) return;
    this.p2Joined = joined;
    this.onP2Joined?.(joined);
  }

  isRecording() {
    return Boolean(this.recorder);
  }

  inPlayback() {
    return Boolean(this.playback && !this.playback.ended);
  }

  emitReplay(state) {
    try { this.onReplayUpdate?.(state); } catch { /* status UI cannot stop play */ }
  }

  async armRecording() {
    assertLocalRuntimeEdition(this);
    assertFormationReplayCompatible(this.formationState, 'REC');
    assertReplayCompatible(this.modState, 'REC', { allowPlayableHibachi: true });
    if (this.recorder) return this.recorder;
    if (this.inPlayback()) {
      throw new Error('REC is unavailable while a replay is playing.');
    }
    if (this.playback?.ended) this.playback = null;

    clearCoin();
    const replayGeneration = this.replayGeneration;
    const game = this.game;
    const tables = localReplayTables(this.tables);
    const tablesBytes = new TextEncoder().encode(JSON.stringify(tables));
    const tablesSha256 = await sha256Hex(tablesBytes);
    if (this.replayGeneration !== replayGeneration
        || this.game !== game || this.inPlayback()) {
      throw new Error('REC could not arm because the active game changed.');
    }
    const soundState = this.audio?.snapshotGameAudio?.() ?? null;
    if (this.audio && !soundState) {
      throw new Error('REC needs the exact local sound state before it can arm.');
    }
    this.recorder = armRecorder(game, {
      periodFrames: PERIOD_FRAMES,
      seed: {
        lf: game.logicFrame,
        vf: game.videoFrame,
        arm: game.armedVblanks,
        ramB64: b64(game.ram.b.slice()),
        bgB64: b64(beBytesFromWords(game.vram.w)),
        tablesB64: b64(tablesBytes),
        mods: exportModReplaySeed(this.modState),
        ...(soundState ? { sound: soundState } : {}),
      },
      version: {
        git: 'unknown',
        tablesSha256,
        buildId: 'mixup-local',
      },
      scenario: 'mixup-local',
      poke: '',
    });
    return this.recorder;
  }

  async stopRecording() {
    if (!this.recorder) return null;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder.n < 1) {
      throw new Error('REC needs at least one complete logic frame before it can save.');
    }
    return stopRecorder(recorder);
  }

  playFrom(obj) {
    const edition = assertLocalRuntimeEdition(this);
    assertFormationReplayCompatible(this.formationState, 'PLAY');
    if (this.recorder) {
      throw new Error('Stop and save REC before loading a replay.');
    }
    if (this.inPlayback()) {
      throw new Error('A replay is already playing.');
    }

    const parsed = validateReplay(obj, { profile: edition.profile });
    let candidateModState = this.modState;
    let replayModCandidate = null;
    if (parsed.modSeed) {
      replayModCandidate = validateModReplaySeed(
        parsed.modSeed, this.modState?.loadout ?? { ids: [] },
      );
      candidateModState = replayModCandidate.state;
    } else {
      assertReplayCompatible(this.modState, 'PLAY');
    }
    const replayTables = localReplayTables(parsed.tables);
    if (!localReplayTablesMatch(replayTables, this.preparedTables)) {
      throw new Error('Replay tables do not match the exact local Black Label ROM identity selected in Mixup.');
    }
    const seedArm = localReplaySeedArm(
      obj.seed,
      parsed.ram,
      RAM.semaphore - MACHINE.ramBase,
    );
    const game = new Game(parsed.ram, this.preparedTables, {
      profile: edition.profile,
      rom: this.rom,
      logicFrame: obj.seed.lf,
      videoFrame: obj.seed.vf,
      seedArm,
      bgSeed: beWords(parsed.bg),
      coinTick: tickCoinPulse,
      ...(this.audio ? { soundSink: this.audio } : {}),
      ...(modGameOptions(candidateModState) ?? {}),
    });
    if (replayModCandidate) restoreModReplaySeed(replayModCandidate, game);
    const verifier = armPlayback(game, obj);

    clearKeyboard();
    clearTouch();
    clearCoin();
    if (this.audio) {
      const soundRuntime = obj.seed.sound
        ? soundRuntimeFromSnapshot(
            this.soundAssets, APPROVED_SOUND_POLICIES, obj.seed.sound)
        : soundRuntimeFromAssets(this.soundAssets, APPROVED_SOUND_POLICIES);
      this.audio.resetGameAudio(soundRuntime);
    }
    if (replayModCandidate) this.modState = candidateModState;
    this.game = game;
    this.tables = this.preparedTables;
    this.privateSpritePaletteWords = this.modState?.playableHibachi?.privatePaletteWords ?? null;
    this.renderPaletteWords = this.privateSpritePaletteWords
      ? new Uint16Array(PRIVATE_SPRITE_PALETTE_BASE + this.privateSpritePaletteWords.length)
      : null;
    this.paletteRgb = new Uint8Array(
      (this.renderPaletteWords?.length ?? game.palette.words.length) * 3,
    );
    if (this.modState) this.modState.runtime.ghost = null;
    this.hitboxRam = this.modState?.loadout.presentation.hitboxes
      ? game.ram.clone() : null;
    this.runaheadView = null;
    copySpriteList(game, this.spritebuffer, this.spritePrivatePaletteBanks);
    this.p2Joined = authenticP2Joined(game.ram.u16(RAM.playerCountM1));
    this.onP2Joined?.(this.p2Joined);
    this.resyncTiming();
    this.playback = {
      obj,
      words: parsed.words,
      coinWords: parsed.coinWords,
      pokes: parsed.pokes,
      count: parsed.words.length,
      index: 0,
      verifier,
      ended: false,
      pending: null,
      needCheck: false,
      result: null,
    };
    this.emitReplay({
      kind: 'playing',
      lf: obj.seed.lf,
      count: this.playback.count,
    });
    return this.playback;
  }

  endPlayback() {
    if (!this.playback || this.playback.ended) return;
    const playback = this.playback;
    playback.ended = true;
    clearKeyboard();
    clearTouch();
    clearCoin();
    const prior = playback.pending;
    const pending = Promise.resolve(prior)
      .then(() => playback.verifier.finalize())
      .then((result) => {
        playback.result = result;
        this.emitReplay({
          kind: result.green ? 'green' : 'red',
          result,
          lf: playback.obj.seed.lf,
          count: playback.count,
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        playback.result = { green: false, error: message };
        this.emitReplay({ kind: 'error', error: message });
      });
    playback.pending = pending;
  }

  pollPlayback() {
    const playback = this.playback;
    if (!playback || playback.ended || playback.pending || !playback.needCheck) return;
    playback.needCheck = false;
    let pending;
    pending = playback.verifier.check()
      .then((divergent) => {
        if (divergent) {
          this.emitReplay({
            kind: 'divergent',
            divergent,
            compared: playback.verifier.n,
          });
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emitReplay({ kind: 'error', error: message });
      })
      .finally(() => {
        if (playback.pending === pending) playback.pending = null;
      });
    playback.pending = pending;
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
    const availableScale = Math.min(
      container.clientWidth * dpr / this.canvas.width,
      container.clientHeight * dpr / this.canvas.height,
    );
    const scale = availableScale < 1 ? availableScale : Math.floor(availableScale);
    this.canvas.style.width = `${this.canvas.width * scale / dpr}px`;
    this.canvas.style.height = `${this.canvas.height * scale / dpr}px`;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.cadence.reset();
    this.lastTime = performance.now();
    this.request = requestAnimationFrame((time) => this.frame(time));
  }

  stop() {
    this.running = false;
    this.cadence.reset();
    this.lastTime = 0;
    this.replayGeneration++;
    cancelAnimationFrame(this.request);
    this.recorder = null;
    if (this.playback) this.playback.ended = true;
    this.playback = null;
    this.runaheadView = null;
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

  _captureRunaheadHold() {
    copySpriteList(
      this.game, this.runaheadSpritebuffer, this.runaheadPrivatePaletteBanks,
    );
    let hitboxRam = null;
    if (this.modState?.loadout.presentation.hitboxes) {
      if (!this.runaheadHitboxRam) this.runaheadHitboxRam = this.game.ram.clone();
      else this.runaheadHitboxRam.b.set(this.game.ram.b);
      hitboxRam = this.runaheadHitboxRam;
    }
    return {
      spritebuffer: this.runaheadSpritebuffer,
      spritePrivatePaletteBanks: this.runaheadPrivatePaletteBanks,
      hitboxRam,
    };
  }

  _captureRunaheadView(baseLogicFrame, depth, hold) {
    const game = this.game;
    const bg = this.runaheadBg ?? new Uint16Array(game.vram.w.length);
    const tx = this.runaheadTx ?? new Uint16Array(game.txvram.w.length);
    const regs = this.runaheadRegs ?? {};
    const palette = this.runaheadPalette ?? new Uint16Array(game.palette.words.length);
    this.runaheadBg = bg;
    this.runaheadTx = tx;
    this.runaheadRegs = regs;
    this.runaheadPalette = palette;
    bg.set(game.vram.w);
    tx.set(game.txvram.w);
    Object.assign(regs, {
      bg_scale: game.video.bg_scale,
      bg_yscroll: game.video.bg_yscroll,
      bg_xscroll: game.video.bg_xscroll,
      tx_yscroll: game.video.tx_yscroll,
      tx_xscroll: game.video.tx_xscroll,
      ctrl: game.video.ctrl,
    });
    palette.set(game.palette.words);
    return {
      baseLogicFrame,
      logicFrame: game.logicFrame,
      depth,
      bg,
      tx,
      regs,
      palette,
      playableHibachi: projectPlayableHibachiTelemetry(
        this.modState?.playableHibachi, game.ram,
      ),
      ...hold,
    };
  }

  _projectRunahead(rawWord) {
    const depth = this.runaheadFrames;
    if (!depth || this.inPlayback()) return null;
    const game = this.game;
    const baseLogicFrame = game.logicFrame;
    const coin = createCoinProjection();
    const dropSpriteHold = this.modState?.loadout.presentation.dropSpriteHold;
    let hold = null;
    try {
      return projectRunahead(game, depth, (target, frame) => {
        const finalFrame = frame === depth - 1;
        if (finalFrame && !dropSpriteHold) hold = this._captureRunaheadHold();
        applyPreFrameMods(this.modState, target.ram);
        const word = transformModInput(this.modState, rawWord, target.logicFrame);
        target.coinPort = coin?.currentWord() ?? 0xffff;
        const phase = target.ram.u16(COIN.irq4Phase);
        const videoFrame = target.videoFrame;
        target.step(word);
        coin?.advanceVblanks(phase, target.videoFrame - videoFrame);
        if (finalFrame && dropSpriteHold) hold = this._captureRunaheadHold();
        applyPostFrameMods(this.modState, target.ram);
      }, () => this._captureRunaheadView(baseLogicFrame, depth, hold));
    } catch (error) {
      if (error instanceof RunaheadProjectionError) return null;
      throw error;
    }
  }

  step({ project = true } = {}) {
    const game = this.game;
    const inPlayback = this.inPlayback();
    this.runaheadView = null;
    copySpriteList(game, this.spritebuffer, this.spritePrivatePaletteBanks);
    if (this.hitboxRam) this.hitboxRam.b.set(game.ram.b);
    if (inPlayback) {
      for (const [address, value] of this.playback.pokes) {
        game.ram.setU8(address, value);
      }
    }
    applyPreFrameMods(this.modState, game.ram);
    const playbackIndex = inPlayback ? this.playback.index++ : -1;
    const rawWord = inPlayback
      ? this.playback.words[playbackIndex]
      : currentPortWord();
    const coinWord = inPlayback
      ? this.playback.coinWords[playbackIndex]
      : currentCoinWord();
    const modWord = transformModInput(this.modState, rawWord, game.logicFrame);
    const portWord = this.formationState
      ? prepareFormationFrame(this.formationState, game, modWord)
      : modWord;
    if (this.recorder) this.recorder.input(portWord, coinWord);
    game.coinPort = coinWord;
    game.step(portWord);
    if (this.modState?.loadout.presentation.dropSpriteHold) {
      copySpriteList(game, this.spritebuffer, this.spritePrivatePaletteBanks);
      if (this.hitboxRam) this.hitboxRam.b.set(game.ram.b);
    }
    applyPostFrameMods(this.modState, game.ram);
    if (project && !inPlayback && this.runaheadFrames) {
      this.runaheadView = this._projectRunahead(rawWord);
    }
    this.updateP2Joined();
    if (this.recorder) this.recorder.feed();
    if (inPlayback) {
      const bounds = this.playback.verifier.periodBounds.length;
      this.playback.verifier.feed();
      if (this.playback.verifier.periodBounds.length > bounds) {
        this.playback.needCheck = true;
      }
      if (this.playback.index >= this.playback.count) this.endPlayback();
    }
    return inPlayback ? null : rawWord;
  }

  /** Detached read-only presentation telemetry for the local shell. */
  stats() {
    return {
      logicFrame: this.game.logicFrame,
      displayLogicFrame: this.runaheadView?.logicFrame ?? this.game.logicFrame,
      runaheadActive: this.runaheadView?.depth ?? 0,
      playableHibachi: this.runaheadView
        ? this.runaheadView.playableHibachi
        : projectPlayableHibachiTelemetry(
          this.modState?.playableHibachi, this.game.ram,
        ),
    };
  }

  frame(time) {
    if (!this.running) return;
    try {
      pollInput();
      let elapsed = time - this.lastTime;
      this.lastTime = time;
      if (elapsed > 200 || elapsed < 0) {
        this.cadence.reset();
        elapsed = 0;
      }
      let liveRawWord = null;
      const timing = this.cadence.advance(elapsed, {
        logicPeriodMs: () => transformModTiming(
          this.modState,
          BASE_FRAME_MS * transformCartridgeSlowdown(
            this.modState, this.game.armedVblanks,
          ),
        ),
        stepLogic: () => {
          liveRawWord = this.step({ project: false });
        },
        stepSound: () => this.audio?.tick(),
        maxLogicSteps: 8,
      });
      if (timing.logicSteps && liveRawWord !== null && this.runaheadFrames) {
        this.runaheadView = this._projectRunahead(liveRawWord);
      }
      this.pollPlayback();
      this.draw();
      this.onTelemetry?.(this.stats().playableHibachi);
      this.audio?.pump();
      this.request = requestAnimationFrame((next) => this.frame(next));
    } catch (error) {
      this.stop();
      this.onError?.(error);
    }
  }

  draw(view = this.runaheadView) {
    const indexed = this.renderer.renderIndexed({
      bg: view?.bg ?? this.game.vram.w,
      tx: view?.tx ?? this.game.txvram.w,
      rowscroll: this.rowscroll,
      zoomram: this.zoomram,
      spritebuffer: view?.spritebuffer ?? this.spritebuffer,
      spritePrivatePaletteBanks: view?.spritePrivatePaletteBanks
        ?? this.spritePrivatePaletteBanks,
      spritePrivatePaletteBase: PRIVATE_SPRITE_PALETTE_BASE,
      regs: view?.regs ?? this.game.video,
    }, { spriteStride: RAM_STRIDE });
    let palette = view?.palette ?? this.game.palette.words;
    if (this.renderPaletteWords) {
      this.renderPaletteWords.fill(0);
      this.renderPaletteWords.set(palette);
      this.renderPaletteWords.set(
        this.privateSpritePaletteWords, PRIVATE_SPRITE_PALETTE_BASE,
      );
      palette = this.renderPaletteWords;
    }
    paletteRgb(palette, this.paletteRgb);
    resolveRgb(indexed, this.paletteRgb, this.rgb);
    applyPresentationMods(this.modState, this.rgb);
    applyHitboxOverlay(
      this.modState,
      view?.hitboxRam ?? this.hitboxRam ?? this.game.ram,
      this.rgb,
    );
    const output = this.mode === 'yoko'
      ? this.rgb
      : rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rotated);
    rgbToRgba(output, this.rgba);
    this.context.putImageData(this.image, 0, 0);
  }
}
