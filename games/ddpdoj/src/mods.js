// Optional DaiOuJou host mods.
//
// This module is deliberately self-contained. start.html imports it to render the
// catalogue without loading the game, while src/web/app.js calls the narrow hooks
// below. A vanilla launch never creates a mod state, so every hook returns before
// touching RAM, input, timing, or pixels.

export const CATEGORIES = Object.freeze(['survival', 'arsenal', 'challenge', 'presentation']);

const mod = (entry) => Object.freeze({ replaySafe: false, ...entry,
  effects: Object.freeze(entry.effects ?? []) });

export const MODS = Object.freeze({
  'invincibility': mod({
    name: 'Invincibility', category: 'survival',
    blurb: 'Hold the player record invulnerability byte at $FF.',
    effects: ['$810424 := $FF before and after every logic frame'],
  }),
  'infinite-lives': mod({
    name: 'Infinite Lives', category: 'survival',
    blurb: 'Keep three reserve ships available after every death.',
    effects: ['$8130BE := 3 before and after every logic frame'],
  }),
  'unbreakable-chain': mod({
    name: 'Unbreakable Chain', category: 'survival',
    blurb: 'Once a chain exists, keep its cartridge meter from expiring.',
    effects: ['$81B5C0 := $7FFF while $81B5DA chain hits are nonzero'],
  }),

  'bottomless-bombs': mod({
    name: 'Bottomless Bombs', category: 'arsenal', conflict: 'button2-stock', priority: 10,
    blurb: 'Keep three bombs ready and clear hyper stock so Button 2 reaches the bomb arm.',
    effects: ['$81040A := 3', '$81B65C := 0'],
  }),
  'infinite-hyper-stock': mod({
    name: 'Infinite Hyper Stock', category: 'arsenal', conflict: 'button2-stock', priority: 20,
    blurb: 'Keep the cartridge maximum of five hypers in stock.',
    effects: ['$81B65C := 5 before and after every logic frame'],
  }),
  'native-auto-fire': mod({
    name: 'Native Auto-Fire', category: 'arsenal',
    blurb: 'Enable the operator auto-shot DIP. Hold AUTO to use the cartridge two-frame cadence.',
    effects: ['$80380F := 1, enabling $2497AA'],
  }),
  'bullet-canceller': mod({
    name: 'Bullet Canceller', category: 'arsenal',
    blurb: 'Continuously arm the laser-bomb bullet conversion path.',
    effects: ['$243DA0 policy: $81B410 := 1 and $81B412 := $FFFF'],
  }),

  'low-rank': mod({
    name: 'Low Rank', category: 'challenge', conflict: 'rank', priority: 10,
    blurb: 'Reset the rank clock and hyper rank power so each stage stays at its cartridge base.',
    effects: ['$8130C6 := 0', '$81B646/$81B648 := 0'],
  }),
  'maximum-rank': mod({
    name: 'Maximum Rank', category: 'challenge', conflict: 'rank', priority: 20,
    blurb: 'Feed the rank object a saturated clock. It still performs its own clamp and 15-byte fan-out.',
    effects: ['$8130C6 := $0000EFFF before $2608D2 increments and recomputes'],
  }),
  'precision-ship': mod({
    name: 'Precision Ship', category: 'challenge',
    blurb: 'Accept direction input on alternate logic frames for half-speed positioning. Fire is unchanged.',
    effects: ['input transform: direction bits only, keyed to logic-frame parity'],
  }),
  'turbo': mod({
    name: 'Turbo', category: 'challenge', conflict: 'timing', priority: 10,
    blurb: 'Run logic at twice the cabinet rate without changing a logic frame.',
    effects: ['host frame period x 0.5'],
  }),
  'bullet-time': mod({
    name: 'Bullet Time', category: 'challenge', conflict: 'timing', priority: 20,
    blurb: 'Run logic at half the cabinet rate without skipping a logic frame.',
    effects: ['host frame period x 2'],
  }),

  'invert-colors': mod({
    name: 'Invert Colors', category: 'presentation', replaySafe: true,
    blurb: 'Invert the resolved RGB framebuffer.',
    effects: ['post-RGB transform: channel := 255 - channel'],
  }),
  'monochrome': mod({
    name: 'Monochrome', category: 'presentation', replaySafe: true,
    blurb: 'Render the resolved framebuffer using deterministic Rec. 601 luma.',
    effects: ['post-RGB transform: integer Rec. 601 luma'],
  }),
  'ghost-trail': mod({
    name: 'Ghost Trail', category: 'presentation', replaySafe: true,
    blurb: 'Blend every frame with the prior displayed result.',
    effects: ['post-RGB transform: per-channel mean with one-frame history'],
  }),
});

export const MOD_IDS = Object.freeze(Object.keys(MODS));

export const PRESETS = Object.freeze({
  'practice': Object.freeze({
    name: 'Practice Run', mods: Object.freeze(['invincibility', 'unbreakable-chain', 'low-rank']),
  }),
  'full-magazine': Object.freeze({
    name: 'Full Magazine', mods: Object.freeze(['infinite-hyper-stock', 'native-auto-fire']),
  }),
  'nightmare': Object.freeze({
    name: 'Nightmare', mods: Object.freeze(['maximum-rank', 'turbo', 'monochrome']),
  }),
  'dream-state': Object.freeze({
    name: 'Dream State', mods: Object.freeze(['bullet-time', 'invert-colors', 'ghost-trail']),
  }),
});

/**
 * Resolve known ids in catalogue order. Conflict winners are selected by the
 * fixed numeric priority in metadata, never by URL or click order.
 */
export function resolveLoadout(ids = []) {
  const requested = new Set();
  for (const id of ids) if (MODS[id]) requested.add(id);

  const winners = new Map();
  for (const id of requested) {
    const m = MODS[id];
    if (!m.conflict) continue;
    const prior = winners.get(m.conflict);
    if (!prior || (m.priority ?? 0) > (MODS[prior].priority ?? 0)) {
      winners.set(m.conflict, id);
    }
  }

  const kept = MOD_IDS.filter((id) => requested.has(id)
    && (!MODS[id].conflict || winners.get(MODS[id].conflict) === id));
  const conflicts = [];
  const conflictGroups = new Set(MOD_IDS.map((id) => MODS[id].conflict).filter(Boolean));
  for (const group of conflictGroups) {
    const winner = winners.get(group);
    if (!winner) continue;
    const dropped = MOD_IDS.filter((id) => requested.has(id)
      && MODS[id].conflict === group && id !== winner);
    if (dropped.length) conflicts.push(Object.freeze({ group, winner,
      dropped: Object.freeze(dropped) }));
  }

  const has = (id) => kept.includes(id);
  const sim = Object.freeze({
    invincibility: has('invincibility'),
    infiniteLives: has('infinite-lives'),
    unbreakableChain: has('unbreakable-chain'),
    bottomlessBombs: has('bottomless-bombs'),
    infiniteHyperStock: has('infinite-hyper-stock'),
    nativeAutoFire: has('native-auto-fire'),
    bulletCanceller: has('bullet-canceller'),
    rank: has('maximum-rank') ? 'maximum' : has('low-rank') ? 'low' : null,
    precisionShip: has('precision-ship'),
  });
  const timing = Object.freeze({
    scale: has('bullet-time') ? 2 : has('turbo') ? 0.5 : 1,
  });
  const presentation = Object.freeze({
    invert: has('invert-colors'), monochrome: has('monochrome'), ghost: has('ghost-trail'),
  });
  const replayBlocking = Object.freeze(kept.filter((id) => !MODS[id].replaySafe));

  return Object.freeze({ ids: Object.freeze(kept), sim, timing, presentation,
    conflicts: Object.freeze(conflicts), replayBlocking });
}

/** Return runtime state only for a recognized, nonempty loadout. */
export function createModState(loadout) {
  if (!loadout || !loadout.ids?.length) return null;
  return { loadout, runtime: { ghost: null } };
}

export function describeMod(id) {
  return MODS[id]?.effects ?? [];
}

/** Exact shareable form: #mods=id+id. */
export function loadoutToHash(ids = []) {
  const kept = resolveLoadout(ids).ids;
  return kept.length ? `mods=${kept.map(encodeURIComponent).join('+')}` : '';
}

export function hashToLoadout(hash = '') {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''));
  // URLSearchParams decodes literal plus signs as spaces. Accept both forms so
  // hand-written and encoded links round-trip.
  const ids = (p.get('mods') || '').split(/[+\s]+/).filter(Boolean);
  return resolveLoadout(ids);
}

export function replayPolicy(stateOrLoadout) {
  const lo = stateOrLoadout?.loadout ?? stateOrLoadout;
  const blocking = lo?.replayBlocking ?? [];
  return Object.freeze({ compatible: blocking.length === 0,
    blocking: Object.freeze([...blocking]) });
}

export function assertReplayCompatible(state, action = 'replay') {
  const policy = replayPolicy(state);
  if (!policy.compatible) {
    const names = policy.blocking.map((id) => MODS[id].name).join(', ');
    throw new Error(`${action} is unavailable while simulation-changing mods are active: ${names}.`);
  }
  return policy;
}

export const MOD_RAM = Object.freeze({
  invulnP1: 0x810424,
  livesP1: 0x8130be,
  bombStockP1: 0x81040a,
  hyperStockP1: 0x81b65c,
  chainMeterP1: 0x81b5c0,
  chainHitsP1: 0x81b5da,
  rankClock: 0x8130c6,
  rankPowerP1: 0x81b646,
  rankPowerP2: 0x81b648,
  autoFireDip: 0x80380f,
  cancelArm: 0x81b410,
  cancelMode: 0x81b412,
});

function applyRamMods(state, ram) {
  if (!state) return;
  const s = state.loadout.sim;
  if (s.invincibility) ram.setU8(MOD_RAM.invulnP1, 0xff);
  if (s.infiniteLives) ram.setU16(MOD_RAM.livesP1, 3);
  if (s.unbreakableChain && ram.u16(MOD_RAM.chainHitsP1) !== 0) {
    ram.setU16(MOD_RAM.chainMeterP1, 0x7fff);
  }
  if (s.bottomlessBombs) {
    ram.setU8(MOD_RAM.bombStockP1, 3);
    // Button 2 selects hyper whenever this word is nonzero. Clearing it is what
    // makes a bottomless-bomb loadout remain a bomb loadout after earning one.
    ram.setU16(MOD_RAM.hyperStockP1, 0);
  }
  if (s.infiniteHyperStock) ram.setU16(MOD_RAM.hyperStockP1, 5);
  if (s.nativeAutoFire) ram.setU8(MOD_RAM.autoFireDip, 1);
  if (s.rank === 'low') {
    ram.setU32(MOD_RAM.rankClock, 0);
    ram.setU16(MOD_RAM.rankPowerP1, 0);
    ram.setU16(MOD_RAM.rankPowerP2, 0);
  } else if (s.rank === 'maximum') {
    // $2607E4 increments once before $2608D2 reads clock >> 8. $EFFF therefore
    // reaches $F0 on that same frame, after which the cartridge applies its own
    // no-hyper/hyper clamp and fans the result into all 15 bullet bytes.
    ram.setU32(MOD_RAM.rankClock, 0x0000efff);
  }
  if (s.bulletCanceller) {
    const arm = ram.u16(MOD_RAM.cancelArm);
    const mode = ram.u16(MOD_RAM.cancelMode);
    if (!(arm !== 0 && mode >= 0x20 && mode <= 0x3c)) {
      ram.setU16(MOD_RAM.cancelArm, 1);
      ram.setU16(MOD_RAM.cancelMode, 0xffff);
    }
  }
}

/** Explicit host policy immediately before Game.step(). */
export function applyPreFrameMods(state, ram) {
  applyRamMods(state, ram);
}

/** Explicit host policy immediately after Game.step(). */
export function applyPostFrameMods(state, ram) {
  applyRamMods(state, ram);
}

/** Transform the active-low raw PGM input word before Game.step(). */
export function transformModInput(state, word, logicFrame) {
  if (!state?.loadout.sim.precisionShip || (logicFrame & 1) === 0) return word & 0xffff;
  // Logical direction bits 0..3 map to raw port bits 1..4. Setting an active-low
  // bit releases it; all fire and start bits pass through unchanged.
  return (word | 0x001e) & 0xffff;
}

/** Transform only host cadence. Game still receives every logic frame. */
export function transformModTiming(state, basePeriodMs) {
  return basePeriodMs * (state?.loadout.timing.scale ?? 1);
}

/** Mutate the finished RGB888 board buffer, before rotation and RGBA packing. */
export function applyPresentationMods(state, rgb) {
  if (!state) return rgb;
  const p = state.loadout.presentation;
  if (p.invert) {
    for (let i = 0; i < rgb.length; i++) rgb[i] = 255 - rgb[i];
  }
  if (p.monochrome) {
    for (let i = 0; i + 2 < rgb.length; i += 3) {
      const y = (rgb[i] * 77 + rgb[i + 1] * 150 + rgb[i + 2] * 29) >> 8;
      rgb[i] = y; rgb[i + 1] = y; rgb[i + 2] = y;
    }
  }
  if (p.ghost) {
    let prior = state.runtime.ghost;
    if (!prior || prior.length !== rgb.length) prior = state.runtime.ghost = new Uint8Array(rgb);
    for (let i = 0; i < rgb.length; i++) {
      rgb[i] = (rgb[i] + prior[i]) >> 1;
      prior[i] = rgb[i];
    }
  }
  return rgb;
}
