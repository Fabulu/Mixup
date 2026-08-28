import * as BatmanInput from '/games/batman/src/input.js';
import * as BatmanMods from '/games/batman/src/mods.js';
import * as GradiusInput from '/games/gradius/src/input.js';
import * as GradiusMods from '/games/gradius/src/mods.js';
import { GradiusAudio } from '/games/gradius/src/audio/output.js';
import * as DdpInput from '/games/ddpdoj/src/web/input.js';
import * as DdpMods from '/games/ddpdoj/src/mods.js';
import * as Formation from '/games/ddpdoj/src/formation.js';

const GAME_IDS = new Set(['batman', 'gradius', 'ddpdoj']);

const BATMAN_ENTRIES = Object.freeze([
  Object.freeze({ id: 0, name: 'Title screen', kind: 'title' }),
  ...Array.from({ length: 14 }, (_, index) => Object.freeze({
    id: index + 1, name: `Stage ${index + 1}`, kind: 'level',
  })),
  Object.freeze({ id: 99, name: 'Ending', kind: 'ending' }),
]);

const BATMAN_DIFFICULTIES = Object.freeze([
  Object.freeze({ value: 0, name: 'Easy, no water damage' }),
  Object.freeze({ value: 1, name: 'Normal, cartridge default' }),
  Object.freeze({ value: 2, name: 'Hard, tougher bosses' }),
]);

const GRADIUS_ENTRIES = Object.freeze([
  Object.freeze({ id: 0, name: 'Title screen' }),
  Object.freeze({ id: 1, name: 'Stage 1, Volcano' }),
  Object.freeze({ id: 2, name: 'Stage 2, Stonehenge' }),
  Object.freeze({ id: 3, name: 'Stage 3, Moai' }),
  Object.freeze({ id: 4, name: 'Stage 4, Inverse Volcano' }),
  Object.freeze({ id: 5, name: 'Stage 5, Tentacles' }),
  Object.freeze({ id: 6, name: 'Stage 6, Cell' }),
  Object.freeze({ id: 7, name: 'Stage 7, Fortress' }),
]);

const GRADIUS_START_OPTIONS = Object.freeze([
  Object.freeze({ key: 'weapon', name: 'Weapon', values: Object.freeze([
    Object.freeze({ value: 0, name: 'Normal' }), Object.freeze({ value: 1, name: 'Laser' }),
    Object.freeze({ value: 2, name: 'Double' }),
  ]) }),
  Object.freeze({ key: 'options', name: 'Options', values: Object.freeze([
    Object.freeze({ value: 0, name: 'None' }), Object.freeze({ value: 1, name: 'One' }),
    Object.freeze({ value: 2, name: 'Two' }),
  ]) }),
  Object.freeze({ key: 'missile', name: 'Missile', values: Object.freeze([
    Object.freeze({ value: 0, name: 'Off' }), Object.freeze({ value: 1, name: 'On' }),
  ]) }),
  Object.freeze({ key: 'shield', name: 'Shield', values: Object.freeze([
    Object.freeze({ value: 0, name: 'Off' }), Object.freeze({ value: 5, name: 'Full, 5 hits' }),
  ]) }),
  Object.freeze({ key: 'speed', name: 'Speed', values: Object.freeze([
    Object.freeze({ value: 0, name: '1, stock' }), Object.freeze({ value: 1, name: '2' }),
    Object.freeze({ value: 2, name: '3' }), Object.freeze({ value: 3, name: '4' }),
    Object.freeze({ value: 4, name: '5' }),
  ]) }),
  Object.freeze({ key: 'meter', name: 'Power meter', values: Object.freeze([
    Object.freeze({ value: 0, name: 'Empty' }), Object.freeze({ value: 1, name: 'Speed up' }),
    Object.freeze({ value: 2, name: 'Missile' }), Object.freeze({ value: 3, name: 'Double' }),
    Object.freeze({ value: 4, name: 'Laser' }), Object.freeze({ value: 5, name: 'Option' }),
    Object.freeze({ value: 6, name: 'Shield' }),
  ]) }),
]);

const GAME_COPY = Object.freeze({
  batman: Object.freeze({
    subtitle: 'Choose a quick setup. Open Customize only if you want a different stage or individual mods.',
    hint: 'Enter: start  Arrows: move  X: jump  Y/Z: attack  Shift: select',
  }),
  gradius: Object.freeze({
    subtitle: 'Choose a quick setup. Open Customize only for a stage, starting kit, or individual mods.',
    hint: 'Enter: start  Arrows: move  X and Y/Z: fire and power up  Shift: select',
  }),
  ddpdoj: Object.freeze({
    subtitle: 'Play the original cabinet, choose a preset, or fly two or three ships together.',
    hint: '5: coin  Enter: start  Arrows: move  Y/Z: shot  X: bomb  C: rapid shot',
  }),
});

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function records(value) {
  if (Array.isArray(value)) return value.map((item, index) => {
    if (item && typeof item === 'object') {
      return { key: item.id ?? String(index), value: item };
    }
    return { key: String(item), value: { id: String(item), name: String(item) } };
  });
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([key, item]) => ({ key, value: item }));
}

function itemId(record) {
  return String(record.value?.id ?? record.key);
}

function itemName(record) {
  return String(record.value?.name ?? record.value?.label ?? record.key);
}

function itemDescription(record) {
  return String(record.value?.description ?? record.value?.summary
    ?? record.value?.blurb ?? record.value?.effect ?? '');
}

function presetIds(preset) {
  const ids = preset?.mods ?? preset?.ids ?? preset?.modIds ?? preset?.loadout ?? [];
  return Array.isArray(ids) ? ids.map(String) : [];
}

function resolvedIds(loadout, fallback) {
  const ids = loadout?.ids ?? loadout?.mods ?? loadout?.selectedIds;
  if (Array.isArray(ids)) return ids.map((value) => typeof value === 'string' ? value : value.id);
  return [...fallback];
}

function sameIds(left, right) {
  if (left.length !== right.length) return false;
  const a = new Set(left);
  return right.every((id) => a.has(id));
}

function conflictMessages(loadout) {
  const conflicts = loadout?.conflicts ?? loadout?.warnings ?? [];
  const values = conflicts instanceof Map ? [...conflicts.values()] : conflicts;
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    if (typeof value === 'string') return value;
    if (value.message || value.description) return value.message ?? value.description;
    const dropped = value.dropped ?? value.losers ?? (value.loser ? [value.loser] : []);
    return `${value.winner ?? 'A selected mod'} replaces ${dropped.length ? dropped.join(', ') : 'another mod'}.`;
  });
}

export function computeIntegerFit(logicalWidth, logicalHeight,
  availableWidth, availableHeight, pixelRatio = 1) {
  const width = Math.max(1, Number(logicalWidth) || 1);
  const height = Math.max(1, Number(logicalHeight) || 1);
  const dpr = Math.max(1, Number(pixelRatio) || 1);
  const scale = Math.max(1, Math.floor(Math.min(
    Math.max(1, availableWidth) * dpr / width,
    Math.max(1, availableHeight) * dpr / height,
  )));
  return {
    scale,
    cssWidth: width * scale / dpr,
    cssHeight: height * scale / dpr,
  };
}

function setIntegerCanvasFit(canvas, viewport, logicalWidth, logicalHeight) {
  const fit = computeIntegerFit(logicalWidth, logicalHeight,
    viewport.clientWidth, viewport.clientHeight, globalThis.devicePixelRatio ?? 1);
  canvas.dataset.scale = String(fit.scale);
  canvas.style.width = `${fit.cssWidth}px`;
  canvas.style.height = `${fit.cssHeight}px`;
  return fit;
}

function selectField(labelText, values, selected, onChange) {
  const label = element('label');
  label.append(document.createTextNode(labelText));
  const select = document.createElement('select');
  for (const value of values) {
    const option = document.createElement('option');
    option.value = String(value.value);
    option.textContent = value.name;
    option.selected = String(value.value) === String(selected);
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  label.append(select);
  return label;
}

class LocalShell {
  constructor() {
    this.shell = document.querySelector('#local-shell');
    this.picker = document.querySelector('#local-picker');
    this.pickerTitle = document.querySelector('#local-picker-title');
    this.pickerSubtitle = document.querySelector('#local-picker-subtitle');
    this.pickerContent = document.querySelector('#local-picker-content');
    this.summary = document.querySelector('#local-loadout-summary');
    this.original = document.querySelector('#local-clear');
    this.startButton = document.querySelector('#local-start');
    this.gameScreen = document.querySelector('#game-screen');
    this.gameTitle = document.querySelector('#local-game-title');
    this.gameStatus = document.querySelector('#local-game-status');
    this.picture = document.querySelector('#local-picture');
    this.sound = document.querySelector('#local-sound');
    this.fullscreen = document.querySelector('#local-fullscreen');
    this.viewport = document.querySelector('#local-viewport');
    this.canvas = document.querySelector('#game-canvas');
    this.hint = document.querySelector('#local-control-hint');
    this.dpad = document.querySelector('#local-dpad');
    this.padButtons = document.querySelector('#local-pad-buttons');
    this.states = new Map();
    this.runtime = null;
    this.options = null;
    this.gameId = null;
    this.generation = 0;
    this.booting = false;
    this.fitRequest = 0;
    this.dpadPointer = null;
    this.dpadMask = 0;
    this.syntheticCodes = new Set();
    this.gradiusAudio = null;
    this.opener = null;
    this.backgroundStates = new Map();

    if (!this.shell || !this.canvas || !this.pickerContent) {
      throw new Error('The local game shell markup is incomplete.');
    }

    this.pickerGames = document.querySelector('#local-picker-games');
    this.gameGames = document.querySelector('#local-game-games');
    this.gameMods = document.querySelector('#local-game-mods');
    this.pickerGames.addEventListener('click', () => this.close());
    this.gameGames.addEventListener('click', () => this.close());
    this.gameMods.addEventListener('click', () => this.showPicker());
    this.original.addEventListener('click', () => this.resetCurrent());
    this.startButton.addEventListener('click', () => this.startGame());
    this.fullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.picture.addEventListener('click', () => this.togglePicture());
    this.sound.addEventListener('click', () => this.toggleSound());

    for (const name of ['resize', 'orientationchange']) {
      globalThis.addEventListener(name, () => this.scheduleFit());
    }
    globalThis.visualViewport?.addEventListener('resize', () => this.scheduleFit());
    document.addEventListener('fullscreenchange', () => {
      this.fullscreen.textContent = document.fullscreenElement ? 'EXIT FULL' : 'FULLSCREEN';
      this.scheduleFit();
    });
    globalThis.addEventListener('pagehide', () => this.stopGame());
    globalThis.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearInput();
    });
    document.addEventListener('keydown', (event) => {
      if (!this.shell.hidden && event.code === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    this.attachDpad();
  }

  initialState(gameId) {
    if (gameId === 'batman') return {
      mods: new Set(), preset: 'original', entry: 0, difficulty: 1,
    };
    if (gameId === 'gradius') return {
      mods: new Set(), preset: 'original', entry: 0, sound: true,
      weapon: 0, options: 0, missile: 0, shield: 0, speed: 0, meter: 0,
    };
    return {
      mods: new Set(), preset: 'original', formation: '', mode: 'tate',
    };
  }

  lockBackground() {
    if (this.backgroundStates.size) return;
    for (const child of document.body.children) {
      if (child === this.shell) continue;
      this.backgroundStates.set(child, {
        inert: child.inert,
        ariaHidden: child.getAttribute('aria-hidden'),
      });
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
    }
  }

  unlockBackground() {
    for (const [child, state] of this.backgroundStates) {
      child.inert = state.inert;
      if (state.ariaHidden == null) child.removeAttribute('aria-hidden');
      else child.setAttribute('aria-hidden', state.ariaHidden);
    }
    this.backgroundStates.clear();
  }

  open(options) {
    if (!GAME_IDS.has(options?.gameId) || !options.summary?.complete) {
      throw new Error('A complete validated local game is required.');
    }
    this.stopGame();
    this.opener = options.opener instanceof HTMLElement
      ? options.opener
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.options = options;
    this.gameId = options.gameId;
    if (!this.states.has(this.gameId)) this.states.set(this.gameId, this.initialState(this.gameId));
    this.lockBackground();
    this.shell.hidden = false;
    document.body.dataset.localView = 'true';
    this.showPicker(false);
    return this;
  }

  stop() { this.close(); }

  close(notify = true) {
    if (this.shell.hidden) return;
    this.stopGame();
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    this.shell.hidden = true;
    this.picker.hidden = false;
    this.gameScreen.hidden = true;
    delete document.body.dataset.localView;
    const callback = this.options?.onClose;
    const opener = this.opener;
    this.options = null;
    this.gameId = null;
    this.opener = null;
    this.unlockBackground();
    if (notify) callback?.();
    opener?.focus?.({ preventScroll: true });
  }

  state() { return this.states.get(this.gameId); }

  api() {
    if (this.gameId === 'batman') return BatmanMods;
    if (this.gameId === 'gradius') return GradiusMods;
    return DdpMods;
  }

  resolvedLoadout() {
    const state = this.state();
    const api = this.api();
    if (this.gameId === 'gradius') {
      return api.resolveLoadout?.([...state.mods], {
        weapon: state.weapon,
        options: state.options,
        missile: state.missile,
        shield: state.shield,
        speed: state.speed,
        meter: state.meter,
      }) ?? { ids: [...state.mods] };
    }
    return api.resolveLoadout?.([...state.mods]) ?? { ids: [...state.mods] };
  }

  resetCurrent() {
    this.states.set(this.gameId, this.initialState(this.gameId));
    this.renderPicker();
  }

  showPicker(stop = true) {
    if (stop) this.stopGame();
    this.shell.hidden = false;
    this.gameScreen.hidden = true;
    this.picker.hidden = false;
    this.renderPicker();
    this.picker.scrollTop = 0;
    this.pickerGames.focus({ preventScroll: true });
  }

  renderPicker() {
    const state = this.state();
    const api = this.api();
    this.pickerTitle.textContent = this.options.title;
    this.pickerSubtitle.textContent = GAME_COPY[this.gameId].subtitle;
    this.pickerContent.replaceChildren();

    const quick = element('section', 'local-section');
    const quickHeading = element('div', 'local-section-heading');
    quickHeading.append(element('h2', '', 'QUICK SETUP'));
    quickHeading.append(element('p', '', 'Original is always safe. Presets change several options together.'));
    quick.append(quickHeading);
    const quickFields = element('div', 'local-fields');
    const presets = records(api.PRESETS);
    const selectedIds = [...state.mods];
    const matchingPreset = presets.find((record) => sameIds(presetIds(record.value), selectedIds));
    const presetValues = [
      { value: 'original', name: 'Original game' },
      ...presets.map((record) => ({ value: itemId(record), name: itemName(record) })),
      { value: 'custom', name: 'Custom setup' },
    ];
    const selectedPreset = selectedIds.length === 0 ? 'original' : (matchingPreset ? itemId(matchingPreset) : 'custom');
    quickFields.append(selectField('Play style', presetValues, selectedPreset, (id) => {
      if (id === 'custom') return;
      const preset = presets.find((record) => itemId(record) === id);
      state.mods = new Set(preset ? presetIds(preset.value) : []);
      state.preset = id;
      this.renderPicker();
    }));

    if (this.gameId === 'ddpdoj') {
      const formations = [
        { value: '', name: 'One ship, original controls' },
        { value: Formation.FORMATION_MODE?.id ?? 'fly-both-ships-side-by-side', name: 'Two ships side by side' },
        { value: Formation.FORMATION_THREE_MODE?.id ?? 'all-three-pilots-each-piloting-a-ship', name: 'All three ships together' },
      ];
      quickFields.append(selectField('Ships', formations, state.formation, (value) => {
        state.formation = value;
        this.renderPicker();
      }));
    }
    quick.append(quickFields);
    this.pickerContent.append(quick);

    const custom = element('details', 'local-customizer');
    const customSummary = element('summary', '', 'Customize mods and starting point');
    custom.append(customSummary);
    const customBody = element('div', 'local-customizer-body');
    this.renderStartFields(customBody);
    this.renderMods(customBody);
    custom.append(customBody);
    this.pickerContent.append(custom);
    this.renderSummary();
  }

  renderStartFields(root) {
    const state = this.state();
    if (this.gameId === 'batman') {
      const section = element('section', 'local-section');
      const heading = element('div', 'local-section-heading');
      heading.append(element('h2', '', 'START'));
      section.append(heading);
      const fields = element('div', 'local-fields');
      fields.append(selectField('Starting point', BATMAN_ENTRIES.map((entry) => ({
        value: entry.id, name: entry.name,
      })), state.entry, (value) => { state.entry = Number(value); this.renderSummary(); }));
      fields.append(selectField('Difficulty', BATMAN_DIFFICULTIES,
        state.difficulty, (value) => { state.difficulty = Number(value); this.renderSummary(); }));
      section.append(fields);
      root.append(section);
      return;
    }
    if (this.gameId === 'gradius') {
      const section = element('section', 'local-section');
      const heading = element('div', 'local-section-heading');
      heading.append(element('h2', '', 'START'));
      section.append(heading);
      const fields = element('div', 'local-fields');
      fields.append(selectField('Starting point', GRADIUS_ENTRIES.map((entry) => ({
        value: entry.id, name: entry.name,
      })), state.entry, (value) => { state.entry = Number(value); this.renderSummary(); }));
      for (const option of GRADIUS_START_OPTIONS) {
        fields.append(selectField(option.name, option.values, state[option.key], (value) => {
          state[option.key] = Number(value);
          this.renderSummary();
        }));
      }
      section.append(fields);
      root.append(section);
      return;
    }

    const section = element('section', 'local-section');
    const heading = element('div', 'local-section-heading');
    heading.append(element('h2', '', 'PICTURE'));
    section.append(heading);
    const fields = element('div', 'local-fields');
    fields.append(selectField('Screen', [
      { value: 'tate', name: 'TATE, vertical' },
      { value: 'yoko', name: 'WIDE, unrotated' },
    ], state.mode, (value) => { state.mode = value; this.renderSummary(); }));
    section.append(fields);
    root.append(section);
  }

  renderMods(root) {
    const state = this.state();
    const api = this.api();
    const mods = records(api.MODS);
    if (!mods.length) return;
    const categories = records(api.CATEGORIES);
    const categoryName = new Map(categories.map((record) => [itemId(record), itemName(record)]));
    const grouped = new Map();
    for (const record of mods) {
      const category = String(record.value?.category ?? record.value?.group ?? 'mods');
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(record);
    }
    for (const [category, entries] of grouped) {
      const section = element('section', 'local-section');
      const heading = element('div', 'local-section-heading');
      heading.append(element('h2', '', categoryName.get(category) ?? category.replaceAll('-', ' ').toUpperCase()));
      section.append(heading);
      const grid = element('div', 'local-option-grid');
      for (const record of entries) {
        const id = itemId(record);
        const selected = state.mods.has(id);
        const button = element('button', 'local-option-card');
        button.type = 'button';
        button.dataset.modId = id;
        button.setAttribute('aria-pressed', String(selected));
        const name = element('span', 'local-option-name');
        name.append(document.createTextNode(itemName(record)));
        name.append(element('span', 'local-option-mark', 'ON'));
        button.append(name);
        const described = api.describeMod?.(id);
        const description = typeof described === 'string'
          ? described
          : (described?.description ?? described?.summary ?? itemDescription(record));
        if (description) button.append(element('span', 'local-option-blurb', description));
        button.addEventListener('click', () => {
          if (state.mods.has(id)) state.mods.delete(id);
          else state.mods.add(id);
          state.preset = 'custom';
          this.renderPicker();
          this.pickerContent.querySelector('.local-customizer').open = true;
        });
        grid.append(button);
      }
      section.append(grid);
      root.append(section);
    }
  }

  renderSummary() {
    const state = this.state();
    const loadout = this.resolvedLoadout();
    const ids = resolvedIds(loadout, state.mods).filter(Boolean);
    const conflicts = conflictMessages(loadout);
    const parts = [];
    if (this.gameId === 'ddpdoj' && state.formation) {
      parts.push(state.formation === Formation.FORMATION_THREE_MODE?.id
        ? 'three-ship formation' : 'two-ship formation');
    }
    parts.push(ids.length ? `${ids.length} mod${ids.length === 1 ? '' : 's'}` : 'original rules');
    this.summary.replaceChildren();
    const strong = element('b', '', this.options.title);
    this.summary.append(strong, document.createTextNode(`: ${parts.join(', ')}`));
    if (conflicts.length) {
      this.summary.append(document.createTextNode(' '));
      this.summary.append(element('span', 'warning', conflicts.join(' ')));
    }
  }

  runtimeConfig() {
    const state = this.state();
    const loadout = this.resolvedLoadout();
    const ids = resolvedIds(loadout, state.mods).filter(Boolean);
    if (this.gameId === 'batman') {
      const entry = BATMAN_ENTRIES.find((value) => value.id === state.entry) ?? BATMAN_ENTRIES[0];
      return {
        mods: ids,
        level: entry.kind === 'ending' ? 14 : (entry.kind === 'title' ? 1 : entry.id),
        title: entry.kind === 'title',
        ending: entry.kind === 'ending',
        difficulty: state.difficulty,
      };
    }
    if (this.gameId === 'gradius') {
      const entry = Number(state.entry) || 0;
      return {
        mods: ids,
        stage: entry > 0 ? entry - 1 : 0,
        title: entry === 0,
        weapon: state.weapon,
        options: state.options,
        missile: state.missile,
        shield: state.shield,
        speed: state.speed,
        meter: state.meter,
        audio: this.gradiusAudio,
      };
    }
    return {
      loadout,
      formation: state.formation || null,
      mode: state.mode,
    };
  }

  async startGame() {
    if (this.runtime || this.booting) return;
    const generation = ++this.generation;
    this.booting = true;
    this.startButton.disabled = true;
    this.picker.hidden = true;
    this.gameScreen.hidden = false;
    this.gameTitle.textContent = this.options.title;
    this.gameStatus.textContent = 'Preparing validated local ROM data...';
    this.hint.textContent = GAME_COPY[this.gameId].hint;
    this.picture.hidden = this.gameId !== 'ddpdoj';
    this.sound.hidden = this.gameId !== 'gradius';
    if (this.gameId === 'gradius') {
      this.gradiusAudio ??= new GradiusAudio((error) => {
        if (this.gameId === 'gradius' && !this.gameScreen.hidden) {
          this.gameStatus.textContent = `Sound unavailable: ${error.message}`;
        }
      });
      this.gradiusAudio.setMuted(!this.state().sound);
      this.gradiusAudio.arm();
      this.sound.textContent = this.state().sound ? 'SOUND ON' : 'SOUND OFF';
    }
    this.picture.textContent = this.state().mode === 'yoko' ? 'WIDE' : 'TATE';
    this.renderPad();
    this.prepareCanvas();
    this.canvas.focus({ preventScroll: true });
    this.scheduleFit();

    try {
      const Runtime = this.gameId === 'batman'
        ? (await import('./batman-local.js')).LocalBatmanRuntime
        : (this.gameId === 'gradius'
          ? (await import('./gradius-local.js')).LocalGradiusRuntime
          : (await import('./ddpdoj-local.js')).LocalDdpdojRuntime);
      if (generation !== this.generation || this.gameScreen.hidden) return;
      const runtime = await Runtime.create(this.options.summary, this.canvas, {
        config: this.runtimeConfig(),
        target: globalThis,
        onStatus: (message) => {
          if (generation !== this.generation) return;
          this.gameStatus.textContent = message;
          this.options?.onStatus?.(message);
        },
        onOptions: () => this.showPicker(),
        onError: (error) => this.runtimeError(error, generation),
      });
      if (generation !== this.generation || this.gameScreen.hidden) {
        runtime.stop();
        return;
      }
      this.runtime = runtime;
      runtime.start();
      this.fit();
      this.canvas.focus();
      const message = this.gameId === 'ddpdoj'
        ? 'DaiOuJou is running entirely from validated local ROMs. Insert a coin with 5, then press Enter.'
        : (this.gameId === 'batman'
          ? 'Batman is running entirely from the validated local cartridge. Press Enter to start.'
          : 'Gradius is running entirely from the validated local cartridge. Press Enter to start.');
      this.gameStatus.textContent = message;
      this.options?.onStatus?.(message);
    } catch (error) {
      this.runtimeError(error, generation);
    } finally {
      this.booting = false;
      this.startButton.disabled = Boolean(this.runtime);
    }
  }

  runtimeError(error, generation) {
    if (generation !== this.generation) return;
    const message = error instanceof Error ? error.message : String(error);
    this.stopGame();
    this.showPicker(false);
    this.summary.replaceChildren(element('span', 'warning', `Game stopped: ${message}`));
    this.options?.onStatus?.(`${this.options.title} stopped: ${message}`);
  }

  stopGame() {
    this.generation++;
    const runtime = this.runtime;
    this.runtime = null;
    this.startButton.disabled = this.booting;
    try {
      runtime?.stop();
    } finally {
      BatmanInput.detachInput?.();
      GradiusInput.detachInput?.();
      this.clearInput();
    }
    cancelAnimationFrame(this.fitRequest);
    this.fitRequest = 0;
  }

  prepareCanvas() {
    this.canvas.style.removeProperty('width');
    this.canvas.style.removeProperty('height');
    if (this.gameId === 'batman') {
      setIntegerCanvasFit(this.canvas, this.viewport, 160, 144);
    } else if (this.gameId === 'gradius') {
      this.canvas.width = 256;
      this.canvas.height = 240;
    } else {
      const yoko = this.state().mode === 'yoko';
      this.canvas.width = yoko ? 448 : 224;
      this.canvas.height = yoko ? 224 : 448;
    }
  }

  scheduleFit() {
    cancelAnimationFrame(this.fitRequest);
    this.fitRequest = requestAnimationFrame(() => {
      this.fitRequest = 0;
      this.fit();
    });
  }

  fit() {
    if (this.gameScreen.hidden || !this.viewport.clientWidth || !this.viewport.clientHeight) return;
    if (this.runtime?.fit) {
      this.runtime.fit(this.viewport, { fullscreen: Boolean(document.fullscreenElement) });
      return;
    }
    const width = this.gameId === 'batman' ? 160 : this.canvas.width;
    const height = this.gameId === 'batman' ? 144 : this.canvas.height;
    setIntegerCanvasFit(this.canvas, this.viewport, width, height);
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.gameScreen.requestFullscreen();
    } catch (error) {
      this.gameStatus.textContent = `Fullscreen unavailable: ${error.message}`;
    }
  }

  togglePicture() {
    if (this.gameId !== 'ddpdoj') return;
    const state = this.state();
    state.mode = state.mode === 'tate' ? 'yoko' : 'tate';
    this.picture.textContent = state.mode === 'yoko' ? 'WIDE' : 'TATE';
    if (this.runtime?.setMode) this.runtime.setMode(state.mode);
    else this.prepareCanvas();
    this.fit();
  }

  async toggleSound() {
    if (!this.runtime?.toggleSound) return;
    const enabled = await this.runtime.toggleSound();
    if (this.gameId === 'gradius') this.state().sound = enabled;
    this.sound.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
  }

  dispatchCode(code, down) {
    const type = down ? 'keydown' : 'keyup';
    globalThis.dispatchEvent(new KeyboardEvent(type, {
      code,
      key: code.startsWith('Arrow') ? code : '',
      bubbles: true,
      cancelable: true,
    }));
    if (down) this.syntheticCodes.add(code);
    else this.syntheticCodes.delete(code);
  }

  clearSyntheticCodes() {
    for (const code of [...this.syntheticCodes]) this.dispatchCode(code, false);
  }

  clearInput() {
    this.clearSyntheticCodes();
    this.dpadPointer = null;
    this.dpadMask = 0;
    BatmanInput.resetInput?.();
    GradiusInput.resetInput?.();
    DdpInput.clearKeyboard?.();
    DdpInput.clearTouch?.();
    DdpInput.clearCoin?.();
    for (const cell of this.dpad.querySelectorAll('[data-cell]')) delete cell.dataset.on;
    for (const button of this.padButtons.querySelectorAll('button')) delete button.dataset.on;
  }

  attachDpad() {
    const release = (event) => {
      if (this.dpadPointer !== event.pointerId) return;
      this.applyDirections(0);
      this.dpadPointer = null;
    };
    this.dpad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.dpadPointer = event.pointerId;
      this.dpad.setPointerCapture?.(event.pointerId);
      this.moveDpad(event);
    });
    this.dpad.addEventListener('pointermove', (event) => {
      if (this.dpadPointer === event.pointerId) this.moveDpad(event);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.dpad.addEventListener(name, release);
    }
  }

  moveDpad(event) {
    const bounds = this.dpad.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const horizontal = x < bounds.width / 3 ? -1 : (x > bounds.width * 2 / 3 ? 1 : 0);
    const vertical = y < bounds.height / 3 ? -1 : (y > bounds.height * 2 / 3 ? 1 : 0);
    let mask = 0;
    if (vertical < 0) mask |= 1;
    if (vertical > 0) mask |= 2;
    if (horizontal < 0) mask |= 4;
    if (horizontal > 0) mask |= 8;
    this.applyDirections(mask);
    const active = [vertical < 0 ? 'UP' : (vertical > 0 ? 'DOWN' : ''),
      horizontal < 0 ? 'LEFT' : (horizontal > 0 ? 'RIGHT' : '')].filter(Boolean).join(' ');
    for (const cell of this.dpad.querySelectorAll('[data-cell]')) {
      cell.dataset.on = String(cell.dataset.cell === active && Boolean(active));
    }
  }

  applyDirections(mask) {
    if (mask === this.dpadMask) return;
    if (this.gameId === 'batman') {
      const bits = [
        [1, BatmanInput.BTN?.UP], [2, BatmanInput.BTN?.DOWN],
        [4, BatmanInput.BTN?.LEFT], [8, BatmanInput.BTN?.RIGHT],
      ];
      for (const [flag, bit] of bits) {
        if (bit != null && Boolean(mask & flag) !== Boolean(this.dpadMask & flag)) {
          BatmanInput.setTouchButton?.(bit, Boolean(mask & flag));
        }
      }
    } else if (this.gameId === 'gradius') {
      const b = GradiusInput.TOUCH_BUTTONS ?? {};
      const directions = (mask & 1 ? b.UP ?? 0 : 0) | (mask & 2 ? b.DOWN ?? 0 : 0)
        | (mask & 4 ? b.LEFT ?? 0 : 0) | (mask & 8 ? b.RIGHT ?? 0 : 0);
      GradiusInput.setTouchDirections?.(directions);
    } else if (this.gameId === 'ddpdoj') {
      for (const [flag, code] of [[1, 'ArrowUp'], [2, 'ArrowDown'], [4, 'ArrowLeft'], [8, 'ArrowRight']]) {
        if (Boolean(mask & flag) !== Boolean(this.dpadMask & flag)) {
          this.dispatchCode(code, Boolean(mask & flag));
        }
      }
    }
    this.dpadMask = mask;
  }

  renderPad() {
    this.clearInput();
    this.padButtons.replaceChildren();
    const rows = [];
    if (this.gameId === 'batman') {
      rows.push([
        { label: 'A', press: (down) => BatmanInput.setTouchButton?.(BatmanInput.BTN?.A, down) },
        { label: 'B', press: (down) => BatmanInput.setTouchButton?.(BatmanInput.BTN?.B, down) },
      ]);
      rows.push([
        { label: 'SELECT', small: true, press: (down) => BatmanInput.setTouchButton?.(BatmanInput.BTN?.SELECT, down) },
        { label: 'START', small: true, press: (down) => BatmanInput.setTouchButton?.(BatmanInput.BTN?.START, down) },
      ]);
    } else if (this.gameId === 'gradius') {
      const b = GradiusInput.TOUCH_BUTTONS ?? {};
      rows.push([
        { label: 'A', press: (down) => GradiusInput.setTouchButton?.(b.A, down) },
        { label: 'B', press: (down) => GradiusInput.setTouchButton?.(b.B, down) },
      ]);
      rows.push([
        { label: 'SELECT', small: true, press: (down) => GradiusInput.setTouchButton?.(b.SELECT, down) },
        { label: 'START', small: true, press: (down) => GradiusInput.setTouchButton?.(b.START, down) },
      ]);
    } else {
      rows.push([
        { label: 'SHOT', codes: ['KeyY', 'KeyZ'] },
        { label: 'BOMB', codes: ['KeyX'] },
        { label: 'AUTO', codes: ['KeyC'] },
      ]);
      rows.push([
        { label: 'COIN', small: true, codes: ['Digit5'] },
        { label: 'START', small: true, codes: ['Enter'] },
      ]);
    }
    for (const controls of rows) {
      const row = element('div', 'local-pad-row');
      for (const control of controls) {
        const button = element('button', `local-pad-button${control.small ? ' small' : ''}`, control.label);
        button.type = 'button';
        let pointer = null;
        const set = (down) => {
          button.dataset.on = String(down);
          if (control.press) control.press(down);
          for (const code of control.codes ?? []) this.dispatchCode(code, down);
        };
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          pointer = event.pointerId;
          button.setPointerCapture?.(pointer);
          set(true);
        });
        const release = (event) => {
          if (pointer !== event.pointerId) return;
          pointer = null;
          set(false);
        };
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
          button.addEventListener(name, release);
        }
        row.append(button);
      }
      this.padButtons.append(row);
    }
  }
}

let singleton = null;

export function openLocalShell(options) {
  singleton ??= new LocalShell();
  return singleton.open(options);
}
