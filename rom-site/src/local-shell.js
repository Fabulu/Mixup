import * as BatmanInput from '/games/batman/src/input.js';
import * as BatmanMods from '/games/batman/src/mods.js';
import * as GradiusInput from '/games/gradius/src/input.js';
import * as GradiusMods from '/games/gradius/src/mods.js';
import { GradiusAudio } from '/games/gradius/src/audio/output.js';
import { AudioController } from '/shared/audio.js';
import * as DdpInput from '/games/ddpdoj/src/web/input.js';
import * as DdpMods from '/games/ddpdoj/src/mods.js';
import * as Formation from '/games/ddpdoj/src/formation.js';
import { p2CanJoin } from './ddpdoj-local-state.js';
import { attachGamepadMenu } from '/games/ddpdoj/src/web/menu-gamepad.js';

const GAME_IDS = new Set(['batman', 'gradius', 'ddpdoj']);
const DDP_CONTROL_SCHEMES = Object.freeze(['auto', 'fixed', 'float']);
const DDP_CONTROL_STORE = 'ddpdoj.controls';
const DDP_MODE_STORE = 'ddpdoj.mode';
const DDP_LOCK_STORE = 'ddpdoj.orientationLock';
const MAX_REPLAY_BYTES = 32 * 1024 * 1024;
const REPLAY_PORTABILITY = 'Playback requires the exact Black Label ROM identity to be selected locally in Mixup. Mixup-local replay files contain no cartridge ROM windows and are not automatically standalone headless verifier artifacts.';

function storedChoice(key, choices, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return choices.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function storedFlag(key) {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function storePreference(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode */ }
}

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

const DDP_FORMATION_SHIPS = Object.freeze([
  Object.freeze({ value: 0, name: 'Type A' }),
  Object.freeze({ value: 2, name: 'Type B' }),
]);
const DDP_FORMATION_STYLES = Object.freeze([
  Object.freeze({ value: 2, name: 'Style 2, shot' }),
  Object.freeze({ value: 4, name: 'Style 4, laser' }),
  Object.freeze({ value: 6, name: 'Style 6, expert' }),
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

function setFullscreenCanvasFit(canvas, viewport, logicalWidth, logicalHeight) {
  const width = Math.max(1, Number(logicalWidth) || 1);
  const height = Math.max(1, Number(logicalHeight) || 1);
  const scale = Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
  canvas.dataset.scale = String(scale);
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;
}

function selectField(labelText, values, selected, onChange, options = {}) {
  const label = element('label');
  if (options.className) label.className = options.className;
  label.append(document.createTextNode(labelText));
  const select = document.createElement('select');
  if (options.id) select.id = options.id;
  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    select.dataset[name] = String(value);
  }
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
    this.controls = document.querySelector('#local-controls');
    this.orientationLock = document.querySelector('#local-lock');
    this.record = document.querySelector('#local-record');
    this.play = document.querySelector('#local-play');
    this.replayFile = document.querySelector('#local-replay-file');
    this.replayStatus = document.querySelector('#local-replay-status');
    this.fullscreen = document.querySelector('#local-fullscreen');
    this.stage = document.querySelector('#local-stage');
    this.viewport = document.querySelector('#local-viewport');
    this.canvas = document.querySelector('#game-canvas');
    this.hint = document.querySelector('#local-control-hint');
    this.dpad = document.querySelector('#local-dpad');
    this.padButtons = document.querySelector('#local-pad-buttons');
    this.padRows = document.querySelector('#local-pad-rows');
    this.padOwner = document.querySelector('#local-pad-owner');
    this.formationPadNote = document.querySelector('#local-formation-pad-note');
    this.stickZone = document.querySelector('#local-stick-zone');
    this.stickOrigin = document.querySelector('#local-stick-origin');
    this.stickKnob = document.querySelector('#local-stick-knob');
    this.states = new Map();
    this.runtime = null;
    this.options = null;
    this.gameId = null;
    this.generation = 0;
    this.booting = false;
    this.fitRequest = 0;
    this.dpadPointer = null;
    this.dpadMask = 0;
    this.stickBackstop = null;
    this.p2Joined = false;
    this.replayRecording = false;
    this.replayBusy = false;
    this.gradiusAudio = null;
    this.ddpdojAudio = null;
    this.opener = null;
    this.backgroundStates = new Map();

    if (!this.shell || !this.stage || !this.canvas || !this.pickerContent
        || !this.controls || !this.orientationLock || !this.record || !this.play
        || !this.replayFile || !this.replayStatus || !this.padRows || !this.padOwner
        || !this.formationPadNote || !this.stickZone || !this.stickOrigin || !this.stickKnob) {
      throw new Error('The local game shell markup is incomplete.');
    }

    this.pickerGames = document.querySelector('#local-picker-games');
    this.gameGames = document.querySelector('#local-game-games');
    this.gameMods = document.querySelector('#local-game-mods');
    this.pickerGames.addEventListener('click', () => this.close());
    this.gameGames.addEventListener('click', () => this.close());
    this.gameMods.addEventListener('click', () => this.showPicker());
    this.original.addEventListener('click', () => this.resetCurrent());
    this.startButton.addEventListener('pointerdown', () => this.armCurrentAudio(), true);
    this.startButton.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' || event.code === 'Space') this.armCurrentAudio();
    }, true);
    this.startButton.addEventListener('click', () => this.startGame());
    this.detachMenuGamepad = attachGamepadMenu(this.picker, {
      active: () => !this.shell.hidden && !this.picker.hidden,
      primary: () => this.startButton,
    });
    this.fullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.picture.addEventListener('click', () => this.togglePicture());
    this.controls.addEventListener('click', () => this.cycleTouchScheme());
    this.orientationLock.addEventListener('click', () => this.toggleOrientationLock());
    this.record.addEventListener('click', () => this.toggleRecording());
    this.play.addEventListener('click', () => {
      if (!this.play.disabled) this.replayFile.click();
    });
    this.replayFile.addEventListener('change', () => this.loadReplayFile());
    this.padOwner.addEventListener('click', () => {
      const owner = DdpInput.currentTouchOwner() === 'P1' ? 'P2' : 'P1';
      this.applyPadOwner(owner);
    });
    this.sound.addEventListener('pointerdown', () => this.armCurrentAudio(), true);
    this.sound.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' || event.code === 'Space') this.armCurrentAudio();
    }, true);
    this.sound.addEventListener('click', () => this.toggleSound());

    for (const name of ['resize', 'orientationchange']) {
      globalThis.addEventListener(name, () => this.scheduleFit());
    }
    globalThis.visualViewport?.addEventListener('resize', () => this.scheduleFit());
    document.addEventListener('fullscreenchange', () => {
      this.fullscreen.textContent = document.fullscreenElement ? 'EXIT FULL' : 'FULLSCREEN';
      this.scheduleFit();
      this.applyOrientationLock();
    });
    globalThis.addEventListener('pagehide', () => this.stopGame());
    globalThis.addEventListener('blur', () => {
      this.clearInput();
      this.resyncAudio();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearInput();
      this.resyncAudio();
    });
    document.addEventListener('keydown', (event) => {
      if (!this.shell.hidden && event.code === 'Escape') {
        if (document.fullscreenElement) return;
        event.preventDefault();
        this.close();
      }
    });
    this.attachDpad();
    this.stickBackstop = DdpInput.attachStick(this.stickZone, {
      onVisual: (origin, current) => this.paintStick(origin, current),
    });
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
      mods: new Set(),
      preset: 'original',
      formation: '',
      formationRoster: null,
      mode: storedChoice(DDP_MODE_STORE, ['tate', 'yoko'], 'tate'),
      sound: true,
      controls: storedChoice(DDP_CONTROL_STORE, DDP_CONTROL_SCHEMES, 'auto'),
      orientationLock: storedFlag(DDP_LOCK_STORE),
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
    if (!GAME_IDS.has(options?.gameId) || !options.summary?.complete
        || options.prepared?.gameId !== options.gameId) {
      throw new Error('A complete prepared local game is required.');
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
        state.formationRoster = value ? Formation.defaultFormationRoster(value) : null;
        this.renderPicker();
      }, { id: 'local-formation-mode' }));
      if (state.formation) {
        state.formationRoster = Formation.resolveFormationRoster(
          state.formation, state.formationRoster)
          ?? Formation.defaultFormationRoster(state.formation);
        const positions = state.formationRoster.length === 2
          ? ['Left ship, lead', 'Right ship, companion']
          : ['Left ship, lead', 'Center ship, companion', 'Right ship, companion'];
        state.formationRoster.forEach((selection, member) => {
          const update = (field, raw) => {
            const roster = state.formationRoster.map((entry) => ({ ...entry }));
            roster[member][field] = Number(raw);
            state.formationRoster = Formation.resolveFormationRoster(state.formation, roster);
            this.renderSummary();
          };
          quickFields.append(selectField(`${positions[member]} type`, DDP_FORMATION_SHIPS,
            selection.ship, (value) => update('ship', value), {
              className: 'local-formation-field',
              id: `local-formation-member-${member + 1}-ship`,
              dataset: { formationMember: member + 1, formationField: 'ship' },
            }));
          quickFields.append(selectField(`${positions[member]} style`, DDP_FORMATION_STYLES,
            selection.style, (value) => update('style', value), {
              className: 'local-formation-field',
              id: `local-formation-member-${member + 1}-style`,
              dataset: { formationMember: member + 1, formationField: 'style' },
            }));
        });
      }
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
    ], state.mode, (value) => {
      state.mode = value;
      storePreference(DDP_MODE_STORE, state.mode);
      this.renderSummary();
    }));
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

  hasDdpFormationRunaheadConflict(loadout = this.resolvedLoadout()) {
    const state = this.state();
    return this.gameId === 'ddpdoj' && !!state.formation
      && (loadout?.presentation?.runaheadFrames ?? 0) > 0;
  }

  hasDdpFormationPlayableConflict(loadout = this.resolvedLoadout()) {
    const state = this.state();
    return this.gameId === 'ddpdoj' && !!state.formation
      && loadout?.sim?.playableHibachi === true;
  }

  syncStartButton() {
    const conflict = this.gameId && this.state()
      ? (this.hasDdpFormationRunaheadConflict()
        || this.hasDdpFormationPlayableConflict())
      : false;
    this.startButton.disabled = Boolean(this.runtime || this.booting || conflict);
  }

  renderSummary() {
    const state = this.state();
    const loadout = this.resolvedLoadout();
    const ids = resolvedIds(loadout, state.mods).filter(Boolean);
    const conflicts = conflictMessages(loadout);
    const formationRunaheadConflict = this.hasDdpFormationRunaheadConflict(loadout);
    const formationPlayableConflict = this.hasDdpFormationPlayableConflict(loadout);
    const parts = [];
    if (this.gameId === 'ddpdoj' && state.formation) {
      const label = state.formation === Formation.FORMATION_THREE_MODE?.id
        ? 'three-ship formation' : 'two-ship formation';
      const roster = Formation.resolveFormationRoster(state.formation, state.formationRoster);
      const choices = roster?.map((selection) =>
        `Type ${selection.ship === 0 ? 'A' : 'B'}/style ${selection.style}`).join(', ');
      parts.push(choices ? `${label} (${choices})` : label);
    }
    parts.push(ids.length ? `${ids.length} mod${ids.length === 1 ? '' : 's'}` : 'original rules');
    this.summary.replaceChildren();
    const strong = element('b', '', this.options.title);
    this.summary.append(strong, document.createTextNode(`: ${parts.join(', ')}`));
    if (conflicts.length || formationRunaheadConflict || formationPlayableConflict) {
      this.summary.append(document.createTextNode(' '));
      const warnings = [...conflicts];
      if (formationRunaheadConflict) {
        warnings.push('Formation cannot be combined with runahead.');
      }
      if (formationPlayableConflict) {
        warnings.push('Formation cannot be combined with Playable Hibachi.');
      }
      this.summary.append(element('span', 'warning', warnings.join(' ')));
    }
    this.syncStartButton();
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
      formationRoster: state.formation ? state.formationRoster : null,
      mode: state.mode,
      audio: this.ddpdojAudio,
    };
  }

  ensureGradiusAudio() {
    this.gradiusAudio ??= new GradiusAudio((error) => {
      if (this.gameId === 'gradius' && !this.gameScreen.hidden) {
        this.gameStatus.textContent = `Sound unavailable: ${error.message}`;
      }
    });
    return this.gradiusAudio;
  }

  ensureDdpdojAudio() {
    this.ddpdojAudio ??= new AudioController(null, (error) => {
      if (this.gameId === 'ddpdoj' && !this.gameScreen.hidden) {
        this.gameStatus.textContent = `Sound unavailable: ${error.message}`;
      }
    });
    return this.ddpdojAudio;
  }

  armCurrentAudio() {
    if (!this.options) return;
    const audio = this.gameId === 'gradius'
      ? this.ensureGradiusAudio()
      : (this.gameId === 'ddpdoj' ? this.ensureDdpdojAudio() : null);
    if (!audio) return;
    audio.setMuted(!this.state().sound);
    audio.arm();
  }

  async startGame() {
    if (this.runtime || this.booting) return;
    if (this.hasDdpFormationRunaheadConflict()) {
      this.renderSummary();
      return;
    }
    const generation = ++this.generation;
    this.booting = true;
    this.startButton.disabled = true;
    this.picker.hidden = true;
    this.gameScreen.hidden = false;
    this.gameTitle.textContent = this.options.title;
    this.gameStatus.textContent = 'Starting from prepared local game data...';
    this.hint.textContent = GAME_COPY[this.gameId].hint;
    this.picture.hidden = this.gameId !== 'ddpdoj';
    this.sound.hidden = this.gameId === 'batman';
    this.controls.hidden = this.gameId !== 'ddpdoj';
    this.orientationLock.hidden = this.gameId !== 'ddpdoj' || !this.canOrientationLock();
    this.record.hidden = this.gameId !== 'ddpdoj';
    this.play.hidden = this.gameId !== 'ddpdoj';
    this.replayRecording = false;
    this.replayBusy = false;
    this.replayFile.value = '';
    this.replayStatus.hidden = true;
    this.replayStatus.textContent = '';
    delete this.replayStatus.dataset.kind;
    this.paintReplayControls();
    this.p2Joined = false;
    if (this.gameId !== 'batman') {
      this.armCurrentAudio();
      this.sound.textContent = this.state().sound ? 'SOUND ON' : 'SOUND OFF';
    }
    this.picture.textContent = this.state().mode === 'yoko' ? 'WIDE' : 'TATE';
    this.paintOrientationLock();
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
      const runtime = await Runtime.createFromPrepared(this.options.prepared, this.canvas, {
        config: this.runtimeConfig(),
        target: globalThis,
        onStatus: (message) => {
          if (generation !== this.generation) return;
          this.gameStatus.textContent = message;
          this.options?.onStatus?.(message);
        },
        onOptions: () => this.showPicker(),
        onP2Joined: (joined) => {
          if (generation === this.generation) this.updateP2Joined(joined);
        },
        onReplayUpdate: (state) => {
          if (generation === this.generation) this.updateReplayStatus(state);
        },
        onError: (error) => this.runtimeError(error, generation),
      });
      if (generation !== this.generation || this.gameScreen.hidden) {
        runtime.stop();
        return;
      }
      this.runtime = runtime;
      this.paintReplayControls();
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
      this.syncStartButton();
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
    const ddpdojAudio = this.ddpdojAudio;
    this.runtime = null;
    this.ddpdojAudio = null;
    this.syncStartButton();
    try {
      runtime?.stop();
    } finally {
      ddpdojAudio?.setMuted(true);
      ddpdojAudio?.resync();
      ddpdojAudio?.close();
      BatmanInput.detachInput?.();
      GradiusInput.detachInput?.();
      this.clearInput();
      DdpInput.selectTouchOwner('P1');
      this.p2Joined = false;
      this.replayRecording = false;
      this.replayBusy = false;
      this.replayFile.value = '';
      this.replayStatus.hidden = true;
      this.replayStatus.textContent = '';
      delete this.replayStatus.dataset.kind;
      this.paintReplayControls();
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
    const width = this.gameId === 'batman' ? 160 : this.canvas.width;
    const height = this.gameId === 'batman' ? 144 : this.canvas.height;
    if (document.fullscreenElement === this.stage) {
      setFullscreenCanvasFit(this.canvas, this.viewport, width, height);
      return;
    }
    if (this.runtime?.fit) {
      this.runtime.fit(this.viewport);
      return;
    }
    setIntegerCanvasFit(this.canvas, this.viewport, width, height);
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.stage.requestFullscreen({ navigationUI: 'hide' });
      await this.applyOrientationLock();
    } catch (error) {
      this.gameStatus.textContent = `Fullscreen unavailable: ${error.message}`;
    }
  }

  togglePicture() {
    if (this.gameId !== 'ddpdoj') return;
    const state = this.state();
    state.mode = state.mode === 'tate' ? 'yoko' : 'tate';
    storePreference(DDP_MODE_STORE, state.mode);
    this.picture.textContent = state.mode === 'yoko' ? 'WIDE' : 'TATE';
    if (this.runtime?.setMode) this.runtime.setMode(state.mode);
    else this.prepareCanvas();
    this.fit();
    this.applyOrientationLock();
  }

  cycleTouchScheme() {
    if (this.gameId !== 'ddpdoj') return;
    const state = this.state();
    const index = DDP_CONTROL_SCHEMES.indexOf(state.controls);
    state.controls = DDP_CONTROL_SCHEMES[(index + 1) % DDP_CONTROL_SCHEMES.length];
    storePreference(DDP_CONTROL_STORE, state.controls);
    this.clearInput();
    this.applyTouchScheme();
  }

  applyTouchScheme() {
    if (this.gameId !== 'ddpdoj') {
      this.dpad.hidden = false;
      this.stickZone.hidden = true;
      return;
    }
    const scheme = this.state().controls;
    const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches === true;
    const useFloat = scheme === 'auto' || scheme === 'float';
    this.controls.textContent = scheme.toUpperCase();
    this.controls.setAttribute('aria-pressed', String(scheme !== 'auto'));
    this.dpad.hidden = coarse && useFloat;
    this.stickZone.hidden = !coarse || !useFloat;
  }

  canOrientationLock() {
    return typeof globalThis.screen?.orientation?.lock === 'function';
  }

  paintOrientationLock() {
    if (this.gameId !== 'ddpdoj') return;
    const wanted = Boolean(this.state().orientationLock);
    this.orientationLock.textContent = wanted ? 'LOCKED' : 'LOCK';
    this.orientationLock.setAttribute('aria-pressed', String(wanted));
  }

  async toggleOrientationLock() {
    if (this.gameId !== 'ddpdoj' || !this.canOrientationLock()) return;
    const state = this.state();
    state.orientationLock = !state.orientationLock;
    storePreference(DDP_LOCK_STORE, state.orientationLock ? '1' : '0');
    this.paintOrientationLock();
    if (state.orientationLock && document.fullscreenElement !== this.stage) {
      try { await this.stage.requestFullscreen({ navigationUI: 'hide' }); } catch { /* preference stays */ }
    }
    await this.applyOrientationLock();
  }

  async applyOrientationLock() {
    if (this.gameId !== 'ddpdoj' || !this.canOrientationLock()) return false;
    const orientation = globalThis.screen.orientation;
    const state = this.state();
    try {
      if (!state.orientationLock) {
        orientation.unlock?.();
        return true;
      }
      if (document.fullscreenElement !== this.stage) return false;
      await orientation.lock(state.mode === 'tate' ? 'portrait' : 'landscape');
      return true;
    } catch {
      return false;
    }
  }

  paintStick(origin, current) {
    if (!origin || !current) {
      this.stickOrigin.setAttribute('aria-hidden', 'true');
      this.stickKnob.setAttribute('aria-hidden', 'true');
      return;
    }
    const dx = current.x - origin.x;
    const dy = current.y - origin.y;
    const distance = Math.hypot(dx, dy);
    const ratio = distance ? Math.min(1, 44 / distance) : 0;
    this.stickOrigin.style.left = `${origin.x}px`;
    this.stickOrigin.style.top = `${origin.y}px`;
    this.stickKnob.style.left = `${origin.x + dx * ratio}px`;
    this.stickKnob.style.top = `${origin.y + dy * ratio}px`;
    this.stickOrigin.setAttribute('aria-hidden', 'false');
    this.stickKnob.setAttribute('aria-hidden', 'false');
  }

  updateP2Joined(joined) {
    if (this.gameId !== 'ddpdoj') return;
    const formation = Boolean(this.state().formation);
    this.p2Joined = p2CanJoin(joined, formation);
    if (!this.p2Joined && DdpInput.currentTouchOwner() === 'P2') {
      this.applyPadOwner('P1');
      return;
    }
    this.paintPadOwner();
  }

  paintPadOwner() {
    if (this.gameId !== 'ddpdoj') {
      this.padOwner.hidden = true;
      this.formationPadNote.hidden = true;
      return;
    }
    const formation = Boolean(this.state().formation);
    const p2 = DdpInput.currentTouchOwner() === 'P2';
    this.padOwner.hidden = !this.p2Joined || formation;
    this.padOwner.disabled = !this.p2Joined || formation;
    this.padOwner.textContent = p2 ? 'P2 PAD' : 'P1 PAD';
    this.padOwner.setAttribute('aria-pressed', String(p2));
    this.formationPadNote.hidden = !formation;
    const coin = this.padRows.querySelector('[data-pad-coin]');
    if (coin) coin.textContent = p2 ? 'P2 COIN' : 'P1 COIN';
  }

  applyPadOwner(owner) {
    if (this.gameId !== 'ddpdoj') return false;
    const formation = Boolean(this.state().formation);
    const p2Joined = p2CanJoin(this.p2Joined, formation);
    if (owner === 'P2' && !p2Joined) return false;
    this.clearInput();
    if (!DdpInput.selectTouchOwner(owner, { p2Joined })) return false;
    this.paintPadOwner();
    return true;
  }

  replayContextCurrent(generation, runtime) {
    return generation === this.generation && runtime === this.runtime;
  }

  paintReplayControls() {
    const runtimeReady = this.gameId === 'ddpdoj' && Boolean(this.runtime);
    const playing = Boolean(this.runtime?.inPlayback?.());
    this.record.textContent = this.replayRecording ? 'STOP & SAVE' : 'REC';
    this.record.setAttribute('aria-pressed', String(this.replayRecording));
    this.record.disabled = !runtimeReady || this.replayBusy || playing;
    this.play.disabled = !runtimeReady || this.replayBusy
      || this.replayRecording || playing;
  }

  showReplayStatus(kind, message) {
    this.replayStatus.hidden = false;
    this.replayStatus.dataset.kind = kind;
    this.replayStatus.textContent = message;
  }

  updateReplayStatus(state) {
    if (!state || this.gameId !== 'ddpdoj') return;
    if (state.kind === 'playing') {
      this.showReplayStatus('playing',
        `PLAY: verifying ${state.count} recorded frames. Live controls and coin input are ignored.`);
    } else if (state.kind === 'divergent') {
      const period = state.divergent;
      this.showReplayStatus('red',
        `Replay mismatch: first divergent digest period ${period.index + 1}, frames ${period.from}-${period.to}. Playback is continuing to the final check.`);
    } else if (state.kind === 'green') {
      this.showReplayStatus('green',
        `GREEN: all ${state.result.compared} recorded frames and the final digest matched. ${REPLAY_PORTABILITY}`);
    } else if (state.kind === 'red') {
      const period = state.result.divergentPeriod;
      const detail = period
        ? `first divergent digest period ${period.index + 1}, frames ${period.from}-${period.to}`
        : 'the final cumulative digest did not match';
      this.showReplayStatus('red',
        `RED: replay verification failed, ${detail}. ${REPLAY_PORTABILITY}`);
    } else if (state.kind === 'error') {
      this.showReplayStatus('error', `Replay error: ${state.error}`);
    }
    this.paintReplayControls();
  }

  async toggleRecording() {
    const runtime = this.runtime;
    if (this.gameId !== 'ddpdoj' || !runtime || this.replayBusy
        || runtime.inPlayback?.()) return;
    const generation = this.generation;
    this.replayBusy = true;
    this.paintReplayControls();
    try {
      if (!runtime.isRecording?.()) {
        await runtime.armRecording();
        if (!this.replayContextCurrent(generation, runtime)) return;
        this.replayRecording = true;
        this.showReplayStatus('recording',
          'REC armed. Replay v2 records gameplay, coin, and start input. Press STOP & SAVE when finished.');
      } else {
        const replay = await runtime.stopRecording();
        if (!this.replayContextCurrent(generation, runtime)) return;
        this.replayRecording = false;
        if (replay) {
          this.downloadReplay(replay);
          this.showReplayStatus('saved',
            `Replay saved locally with ${replay.portin.count} recorded frames. ${REPLAY_PORTABILITY}`);
        }
      }
    } catch (error) {
      if (!this.replayContextCurrent(generation, runtime)) return;
      const message = error instanceof Error ? error.message : String(error);
      this.showReplayStatus('error', `Replay error: ${message}`);
    } finally {
      if (this.replayContextCurrent(generation, runtime)) {
        this.replayRecording = Boolean(runtime.isRecording?.());
        this.replayBusy = false;
        this.paintReplayControls();
      }
    }
  }

  downloadReplay(replay) {
    const blob = new Blob([JSON.stringify(replay, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ddpdoj-mixup-local.replay';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async loadReplayFile() {
    const file = this.replayFile.files?.[0] ?? null;
    this.replayFile.value = '';
    const runtime = this.runtime;
    if (!file || this.gameId !== 'ddpdoj' || !runtime || this.replayBusy
        || this.replayRecording || runtime.inPlayback?.()) return;
    if (file.size < 1 || file.size > MAX_REPLAY_BYTES) {
      this.showReplayStatus('error',
        `Replay error: choose a non-empty .replay file no larger than ${MAX_REPLAY_BYTES / 1024 / 1024} MiB.`);
      return;
    }

    const generation = this.generation;
    this.replayBusy = true;
    this.paintReplayControls();
    try {
      const text = await file.text();
      if (!this.replayContextCurrent(generation, runtime)) return;
      const replay = JSON.parse(text);
      runtime.playFrom(replay);
    } catch (error) {
      if (!this.replayContextCurrent(generation, runtime)) return;
      const message = error instanceof Error ? error.message : String(error);
      this.showReplayStatus('error', `Replay error: ${message}`);
    } finally {
      if (this.replayContextCurrent(generation, runtime)) {
        this.replayBusy = false;
        this.paintReplayControls();
      }
    }
  }

  async toggleSound() {
    const audio = this.gameId === 'gradius' ? this.gradiusAudio : this.ddpdojAudio;
    if (!audio) return;
    let enabled;
    if (this.runtime?.toggleSound) enabled = await this.runtime.toggleSound();
    else {
      audio.setMuted(!audio.muted);
      enabled = !audio.muted;
    }
    this.state().sound = enabled;
    this.sound.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
  }

  resyncAudio() {
    this.gradiusAudio?.resync();
    this.ddpdojAudio?.resync();
    if (this.gameId === 'ddpdoj') this.runtime?.resyncTiming?.();
  }

  clearInput() {
    this.dpadPointer = null;
    this.dpadMask = 0;
    BatmanInput.resetInput?.();
    GradiusInput.resetInput?.();
    DdpInput.clearKeyboard?.();
    DdpInput.clearTouch?.();
    DdpInput.clearCoin?.();
    this.stickBackstop?.();
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
      const controls = DdpInput.CONTROLS;
      const directions = (mask & 1 ? 1 << controls.UP : 0)
        | (mask & 2 ? 1 << controls.DOWN : 0)
        | (mask & 4 ? 1 << controls.LEFT : 0)
        | (mask & 8 ? 1 << controls.RIGHT : 0);
      DdpInput.setTouchDirections(directions);
    }
    this.dpadMask = mask;
  }

  renderPad() {
    this.clearInput();
    this.padRows.replaceChildren();
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
      this.applyPadOwner('P1');
      let heldCoin = null;
      rows.push([
        { label: 'SHOT', press: (down) => DdpInput.setTouchButton('SHOT', down) },
        { label: 'BOMB', press: (down) => DdpInput.setTouchButton('BOMB', down) },
        { label: 'AUTO', press: (down) => DdpInput.setTouchButton('AUTO', down) },
      ]);
      rows.push([
        {
          label: 'P1 COIN',
          small: true,
          coin: true,
          press: (down) => {
            if (down) {
              heldCoin = DdpInput.currentTouchOwner() === 'P2' ? 'COIN2' : 'COIN1';
              DdpInput.setCoinKey(heldCoin, true);
            } else if (heldCoin) {
              DdpInput.setCoinKey(heldCoin, false);
              heldCoin = null;
            }
          },
        },
        { label: 'START', small: true, press: (down) => DdpInput.setTouchButton('START', down) },
      ]);
    }
    for (const controls of rows) {
      const row = element('div', 'local-pad-row');
      for (const control of controls) {
        const button = element('button', `local-pad-button${control.small ? ' small' : ''}`, control.label);
        button.type = 'button';
        if (control.coin) button.dataset.padCoin = 'true';
        let pointer = null;
        const set = (down) => {
          button.dataset.on = String(down);
          if (control.press) control.press(down);
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
      this.padRows.append(row);
    }
    this.applyTouchScheme();
    this.paintPadOwner();
  }
}

let singleton = null;

export function openLocalShell(options) {
  singleton ??= new LocalShell();
  return singleton.open(options);
}
