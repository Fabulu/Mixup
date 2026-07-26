// Mod system.  See docs/02-MOD-SYSTEM.md.
//
// Because we own the source, a mod is NOT a ROM byte patch. It is:
//   1. params  -- overrides into the tunables registry (declarative, stackable)
//   2. hooks   -- functions on named engine events, for what isn't a constant
//   3. render  -- palette / theme overrides applied at compose time
//
// Param keys are the real flat names from src/tunables.js (generated from the
// ROM), not a parallel naming scheme -- so a mod's `params` block doubles as
// honest documentation of exactly what it changes.

import { DEFAULT_TUNABLES } from './tunables.js';

export const CATEGORIES = ['physics', 'combat', 'chaos'];

/**
 * Every mod here works against systems that are actually ported. Mods that
 * would need the enemy AI, level graph or audio are deliberately absent
 * rather than shipped as cards that do nothing.
 */
export const MODS = {
  // ---- physics ----------------------------------------------------------
  'moon-gravity': {
    name: 'Moon Gravity',
    blurb: 'One small step for Bat.',
    category: 'physics',
    params: {
      gravityRisingHeld: 0,
      gravityRisingReleased: 1,
      gravityFalling: 1,
      terminalVelocity: -32,
    },
  },
  'super-jump': {
    name: 'Super Jump',
    blurb: 'Clear the building in a single bound.',
    category: 'physics',
    params: { jumpVelocity: 0x3A, springJumpVelocity: 0x4A, wallJumpVelocityY: 0x3A },
  },
  'heavy-boots': {
    name: 'Heavy Boots',
    blurb: 'Gravity took it personally.',
    category: 'physics',
    params: { gravityFalling: 8, terminalVelocity: -110, jumpVelocity: 0x1A },
  },
  'sonic-bat': {
    name: 'Sonic Bat',
    blurb: 'Gotta go fast. Batman does not gotta stop.',
    category: 'physics',
    params: { walkSpeedMaxRight: 0x38, walkSpeedMaxLeft: -0x38, overspeedDecelStep: 1 },
  },
  'grounded': {
    name: 'Grounded',
    blurb: 'The jump button is a lie. Wall-jumps still count.',
    category: 'physics',
    hooks: {
      // The JS twin of patching the jump branch at 0:$1A2D. Wall-cling is a
      // separate path, so bouncing off walls still works.
      onInput(state) { state.input.pressed &= ~0x01; },
    },
  },
  'turbo': {
    name: 'Turbo Mode',
    blurb: 'Everything at double speed. Everything.',
    category: 'physics',
    meta: { ticksPerFrame: 2 },
  },

  // ---- combat -----------------------------------------------------------
  'glass-cannon': {
    name: 'Glass Cannon',
    blurb: 'One hit point. Make it count.',
    category: 'combat',
    params: { startingMaxHP: 1, meleeDamage: 99, critWindow: 256 },
  },
  'tank-batman': {
    name: 'Tank Batman',
    blurb: 'Start with the full sixteen-heart bar.',
    category: 'combat',
    params: { startingMaxHP: 16 },
  },
  'brutal-gotham': {
    name: 'Brutal Gotham',
    blurb: 'Everything hurts more, and there are no mercy frames.',
    category: 'combat',
    params: { spikeDamage: 8, objectContactDamage: 6, invulnFrames: 8 },
  },
  'batarang-storm': {
    name: 'Batarang Storm',
    blurb: 'Infinite batarangs, thrown hard.',
    category: 'combat',
    params: { batarangSpeed: 0x70 },
    hooks: {
      // Top the ammo back up every frame rather than skipping the decrement,
      // so the "spend ammo then punch when the pool is full" quirk still works.
      onFrame(state) { state.flow.ammo = 99; },
    },
  },
  'featherweight': {
    name: 'Featherweight',
    blurb: 'Every hit sends you flying.',
    category: 'combat',
    params: { knockbackX: 0x30, knockbackY: 0x38 },
  },
  'one-life': {
    name: 'One Life',
    blurb: 'No continues. No second chances.',
    category: 'combat',
    params: { startingLives: 1 },
  },

  // ---- chaos ------------------------------------------------------------
  'noir-gotham': {
    name: 'Noir Gotham',
    blurb: 'The whole city in photo-negative.',
    category: 'chaos',
    render: { invert: true },
  },
  'disco-gotham': {
    name: 'Disco Gotham',
    blurb: 'The palette will not sit still.',
    category: 'chaos',
    hooks: {
      onRenderFrame(state) {
        // Rotate the shade LUT on the frame counter. The game's own raster
        // machine already proves mid-frame palette changes look good.
        state.video.paletteRotate = (state.frame >> 3) & 3;
      },
    },
  },
  'big-head': {
    name: 'Wide Load',
    blurb: 'A considerably larger Batman. Hitbox included.',
    category: 'chaos',
    params: { hitboxHalfWidth: 0x18, hitboxHalfHeight: 0x18 },
  },
};

/** Curated one-click combinations. */
export const PRESETS = {
  'nightmare-run': { name: 'Nightmare Run', mods: ['brutal-gotham', 'one-life', 'glass-cannon'] },
  'power-fantasy': { name: 'Power Fantasy', mods: ['super-jump', 'batarang-storm', 'tank-batman'] },
  'low-gravity-chaos': { name: 'Space Gotham', mods: ['moon-gravity', 'sonic-bat', 'disco-gotham'] },
};

/**
 * Resolve a list of mod ids into everything the engine needs.
 *
 * Params stack in order and LAST WINS per key, which is why the launcher shows
 * a conflict badge when two selected mods touch the same one.
 */
export function resolveLoadout(ids = []) {
  const tunables = { ...DEFAULT_TUNABLES };
  const hooks = {};
  const render = { invert: false };
  const meta = { ticksPerFrame: 1 };
  const conflicts = new Map();
  const touched = new Map();

  for (const id of ids) {
    const mod = MODS[id];
    if (!mod) continue;

    for (const [k, v] of Object.entries(mod.params || {})) {
      if (touched.has(k)) {
        if (!conflicts.has(k)) conflicts.set(k, [touched.get(k)]);
        conflicts.get(k).push(id);
      }
      touched.set(k, id);
      tunables[k] = v;
    }
    for (const [name, fn] of Object.entries(mod.hooks || {})) {
      (hooks[name] ||= []).push(fn);
    }
    Object.assign(render, mod.render || {});
    Object.assign(meta, mod.meta || {});
  }

  return { tunables, hooks, render, meta, conflicts, ids: [...ids] };
}

/** Fire a hook chain. Never throws into the game loop. */
export function runHook(loadout, name, ...args) {
  const fns = loadout && loadout.hooks && loadout.hooks[name];
  if (!fns) return;
  for (const fn of fns) {
    try { fn(...args); } catch (e) { console.error(`mod hook ${name}:`, e); }
  }
}

/** Human-readable diff of what a mod actually changes, for the launcher. */
export function describeMod(id) {
  const mod = MODS[id];
  if (!mod) return [];
  const out = [];
  for (const [k, v] of Object.entries(mod.params || {})) {
    out.push({ key: k, from: DEFAULT_TUNABLES[k], to: v });
  }
  if (mod.hooks) out.push({ key: 'behaviour', from: null, to: Object.keys(mod.hooks).join(', ') });
  if (mod.render) out.push({ key: 'render', from: null, to: JSON.stringify(mod.render) });
  if (mod.meta) out.push({ key: 'engine', from: null, to: JSON.stringify(mod.meta) });
  return out;
}

// ---- loadout <-> URL hash --------------------------------------------------

export function loadoutToHash(ids, level = 1) {
  const p = new URLSearchParams();
  if (ids.length) p.set('mods', ids.join('+'));
  if (level !== 1) p.set('level', String(level));
  return p.toString();
}

export function hashToLoadout(hash = '') {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const ids = (p.get('mods') || '').split('+').filter((s) => s && MODS[s]);
  const level = Math.min(14, Math.max(1, parseInt(p.get('level') || '1', 10) || 1));
  return { ids, level };
}
