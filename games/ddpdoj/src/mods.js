// Optional DaiOuJou host mods.
//
// This module is deliberately self-contained. start.html imports it to render the
// catalogue without loading the game, while src/web/app.js calls the narrow hooks
// below. A vanilla launch never creates a mod state, so every hook returns before
// touching RAM, input, timing, or pixels.

import { BOMBRAM, fireBomb2498E2 } from './bomb.js';
import { spawnCore, WriteLog } from './bullets.js';
import { AimTables, aim64FromCaller } from './aim.js';
import { abcd, bcdAdd, LEDGER } from './score.js';
import { spawnConvertedShot } from './shots.js';
import { SPAWN } from './spawn.js';
import { DMG, bulletWindowSlots } from './damage.js';
import { i16 } from './ram.js';
import { RUNAHEAD_EXTERNAL_STATE } from './runahead-state.js';

export const CATEGORIES = Object.freeze(['survival', 'arsenal', 'challenge', 'presentation']);

const mod = (entry) => Object.freeze({ replaySafe: false, ...entry,
  effects: Object.freeze(entry.effects ?? []) });

export const MODS = Object.freeze({
  'invincibility': mod({
    name: 'Invincibility', category: 'survival',
    conflict: 'player-durability', priority: 10,
    blurb: 'Ignore ordinary enemy-bullet collisions for P1 while cartridge lifecycle events remain active.',
    effects: ['$2459D0 P1 enemy-bullet collision is filtered before either hit bit is written'],
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
  'auto-deathbomb': mod({
    name: 'Auto Deathbomb', category: 'survival',
    blurb: 'Spend a stocked bomb through the cartridge bomb arm when a pending hit would kill.',
    effects: ['$249542 pending lethal hit -> $2498E2 authentic bomb arm; clear the hit only if it fires'],
  }),
  'resurrection-in-place': mod({
    name: 'Resurrection in Place', category: 'survival',
    blurb: 'The next authentic respawn starts where that player died.',
    effects: ['$249F8A caches death Y/X per player only with a reserve life; $25FFA8 consumes it for the next respawn object'],
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
  'hyper-overdrive': mod({
    name: 'Hyper Overdrive', category: 'arsenal',
    blurb: 'Stop only the ordinary two-point gauge drain while an active hyper keeps running.',
    effects: ['$81B642/$81B644: undo an exact active-frame -2 change only'],
  }),
  'bee-magnet': mod({
    name: 'Bee Magnet', category: 'arsenal',
    blurb: 'Pull live bee medals toward the nearest active player at a bounded rate.',
    effects: ['$817DC6 reserved bee records: position approaches live P1/P2 by at most $80 per axis'],
  }),
  'graze-reactor': mod({
    name: 'Graze Reactor', category: 'arsenal',
    blurb: 'Earn 100 score for each live enemy bullet that passes within three pixels of the hitbox.',
    effects: ['$2459D0 near miss -> packed-BCD +100 once per player and bullet slot lifetime'],
  }),
  'friendly-converted-bullets': mod({
    name: 'Friendly Converted Bullets', category: 'arsenal',
    blurb: 'Turn canceled enemy fire into upward-moving player shots that can damage ordinary enemies.',
    effects: ['$281D22 cancel/free -> one P1 shot-pool projectile from the bullet final position'],
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
  'adaptive-slow-motion': mod({
    name: 'Adaptive Slow Motion', category: 'challenge', conflict: 'timing', priority: 30,
    blurb: 'Slow the cabinet cadence progressively as the live enemy-bullet pool fills.',
    effects: ['$81B40C after each logic frame -> bounded host period scale 1.0..2.25'],
  }),
  'boss-enrage': mod({
    name: 'Boss Enrage', category: 'challenge',
    blurb: 'Add six speed steps to newly spawned enemy bullets during authentic boss phases.',
    effects: ['$81309C != 0: spawned bullet speed + 6, clamped to $FF'],
  }),
  'glass-cannon': mod({
    name: 'Glass Cannon', category: 'challenge',
    conflict: 'player-durability', priority: 20,
    blurb: 'Remove both ships\' protection windows and double nonnegative player damage at resolution.',
    effects: ['$810424/$810486 := 0', 'shot, beam, and bomb HP subtraction damage x2, capped at $7FFF'],
  }),
  'revenge-bullets': mod({
    name: 'Revenge Bullets', category: 'challenge',
    blurb: 'Each ordinary enemy you destroy releases one aimed bullet from its final position.',
    effects: ['$28615E plus common-band fatal retirement -> one kind-5 bank-A spawn through $2814B6'],
  }),
  'bullet-polarity': mod({
    name: 'Bullet Polarity', category: 'challenge',
    blurb: 'Shot movement phases through bank A; holding the laser phases through bank B.',
    effects: ['$2459D0 collision: unfocused ignores bank A, focused ignores bank B, per player'],
  }),
  'score-multiplier-mayhem': mod({
    name: 'Score Multiplier Mayhem', category: 'challenge',
    blurb: 'Cycle score awards through a deterministic x1 to x8 multiplier every logic frame.',
    effects: ['$81B4C0/$81B4C4 final pending ledger addends x (($80390A & 7) + 1), packed BCD'],
  }),
  'loop-2-from-stage-1': mod({
    name: 'Loop 2 From Stage 1', category: 'challenge',
    blurb: 'Begin stage 1 with the cartridge loop counter set for loop 2.',
    effects: ['ordinary selected launch: $813098 := 1 once; stage and progression remain cartridge-owned'],
  }),
  'boss-rush': mod({
    name: 'Boss Rush', category: 'challenge',
    blurb: 'Begin every stage at the final authentic boss approach.',
    effects: ['stage script install: scan to $FFFF, retain records from final trigger - $10, and align $8130CE'],
  }),
  'stage-remix': mod({
    name: 'Stage Remix', category: 'challenge',
    blurb: 'Route each loop through Stage 1, Stage 3, Stage 2, Stage 4, and Stage 5.',
    effects: ['$242952 next-stage value: 1->2, 3->1, 2->3, 4->4, 5->5'],
  }),

  'runahead-1': mod({
    name: 'Runahead: 1 Frame', category: 'presentation', replaySafe: true,
    conflict: 'runahead-depth', priority: 10,
    blurb: 'Display one speculatively simulated future frame while canonical cabinet state stays unchanged.',
    effects: ['one canonical logic frame per cabinet period; one detached speculative render frame'],
  }),
  'runahead-2': mod({
    name: 'Runahead: 2 Frames', category: 'presentation', replaySafe: true,
    conflict: 'runahead-depth', priority: 20,
    blurb: 'Display two speculatively simulated future frames while canonical cabinet state stays unchanged.',
    effects: ['one canonical logic frame per cabinet period; two detached speculative render frames'],
  }),
  'runahead-3': mod({
    name: 'Runahead: 3 Frames', category: 'presentation', replaySafe: true,
    conflict: 'runahead-depth', priority: 30,
    blurb: 'Display three speculatively simulated future frames while canonical cabinet state stays unchanged.',
    effects: ['one canonical logic frame per cabinet period; three detached speculative render frames'],
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
  'drop-sprite-hold': mod({
    name: 'Drop the Sprite Hold', category: 'presentation', replaySafe: true,
    blurb: 'Display the sprite list just built instead of the cabinet\'s one-frame-old DMA list.',
    effects: ['presentation list snapshot moves from before Game.step() to after it'],
  }),
  'show-hitboxes': mod({
    name: 'Show Hitboxes', category: 'presentation', replaySafe: true,
    blurb: 'Overlay every live damaging and collectible collision region.',
    effects: ['post-RGB overlay: cartridge collision records projected at 1/64 pixel'],
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
    hyperOverdrive: has('hyper-overdrive'),
    beeMagnet: has('bee-magnet'),
    grazeReactor: has('graze-reactor'),
    friendlyConvertedBullets: has('friendly-converted-bullets'),
    autoDeathbomb: has('auto-deathbomb'),
    resurrectionInPlace: has('resurrection-in-place'),
    glassCannon: has('glass-cannon'),
    bossEnrage: has('boss-enrage'),
    revengeBullets: has('revenge-bullets'),
    bulletPolarity: has('bullet-polarity'),
    scoreMultiplierMayhem: has('score-multiplier-mayhem'),
    loop2FromStage1: has('loop-2-from-stage-1'),
    bossRush: has('boss-rush'),
    stageRemix: has('stage-remix'),
    rank: has('maximum-rank') ? 'maximum' : has('low-rank') ? 'low' : null,
    precisionShip: has('precision-ship'),
  });
  const timing = Object.freeze({
    scale: has('bullet-time') ? 2 : has('turbo') ? 0.5 : 1,
    adaptive: has('adaptive-slow-motion'),
  });
  const presentation = Object.freeze({
    invert: has('invert-colors'), monochrome: has('monochrome'), ghost: has('ghost-trail'),
    dropSpriteHold: has('drop-sprite-hold'), hitboxes: has('show-hitboxes'),
    runaheadFrames: has('runahead-3') ? 3 : has('runahead-2') ? 2 : has('runahead-1') ? 1 : 0,
  });
  const replayBlocking = Object.freeze(kept.filter((id) => !MODS[id].replaySafe));

  return Object.freeze({ ids: Object.freeze(kept), sim, timing, presentation,
    conflicts: Object.freeze(conflicts), replayBlocking });
}

/** Return runtime state only for a recognized, nonempty loadout. */
export function createModState(loadout) {
  if (!loadout || !loadout.ids?.length) return null;
  return { loadout, runtime: {
    ghost: null,
    hyperGauge: null,
    bulletDensity: 0,
    grazedBullets: [new Set(), new Set()],
    grazeCount: [0, 0],
    resurrectionPositions: [null, null],
    cabinetRamRestore: [],
  } };
}

const MOD_RUNAHEAD_TOKENS = new WeakMap();

function ownProperty(target, name) {
  return { present: Object.hasOwn(target, name), value: target[name] };
}

function restoreOwnProperty(target, name, saved) {
  if (saved.present) target[name] = saved.value;
  else delete target[name];
}

export function saveModRunaheadState(state) {
  if (!state?.runtime) return null;
  const runtime = state.runtime;
  const token = Object.freeze(Object.create(null));
  MOD_RUNAHEAD_TOKENS.set(token, {
    state,
    runtime,
    used: false,
    hyperGauge: runtime.hyperGauge,
    bulletDensity: runtime.bulletDensity,
    grazedBulletsOwner: runtime.grazedBullets,
    grazedBulletSets: [...runtime.grazedBullets],
    grazedBullets: runtime.grazedBullets.map((seen) => [...seen]),
    grazeCountOwner: runtime.grazeCount,
    grazeCount: [...runtime.grazeCount],
    resurrectionPositionsOwner: runtime.resurrectionPositions,
    resurrectionPositions: [...runtime.resurrectionPositions],
    cabinetRamRestoreOwner: runtime.cabinetRamRestore,
    cabinetRamRestore: [...runtime.cabinetRamRestore],
    cabinetBoot: ownProperty(runtime, 'cabinetBoot'),
    cabinetRunActive: ownProperty(runtime, 'cabinetRunActive'),
  });
  return token;
}

export function restoreModRunaheadState(state, token) {
  if (token == null && !state) return;
  const saved = MOD_RUNAHEAD_TOKENS.get(token);
  if (!saved) throw new TypeError('Unknown mod runahead checkpoint.');
  if (saved.state !== state || saved.runtime !== state?.runtime) {
    throw new Error('Mod runahead checkpoint belongs to another state.');
  }
  if (saved.used) throw new Error('Mod runahead checkpoint was already restored.');
  const runtime = saved.runtime;
  runtime.hyperGauge = saved.hyperGauge;
  runtime.bulletDensity = saved.bulletDensity;
  runtime.grazedBullets = saved.grazedBulletsOwner;
  for (let side = 0; side < runtime.grazedBullets.length; side++) {
    runtime.grazedBullets[side] = saved.grazedBulletSets[side];
    runtime.grazedBullets[side].clear();
    for (const rec of saved.grazedBullets[side]) runtime.grazedBullets[side].add(rec);
  }
  runtime.grazeCount = saved.grazeCountOwner;
  runtime.grazeCount.splice(0, runtime.grazeCount.length, ...saved.grazeCount);
  runtime.resurrectionPositions = saved.resurrectionPositionsOwner;
  runtime.resurrectionPositions.splice(
    0, runtime.resurrectionPositions.length, ...saved.resurrectionPositions,
  );
  runtime.cabinetRamRestore = saved.cabinetRamRestoreOwner;
  runtime.cabinetRamRestore.splice(
    0, runtime.cabinetRamRestore.length, ...saved.cabinetRamRestore,
  );
  restoreOwnProperty(runtime, 'cabinetBoot', saved.cabinetBoot);
  restoreOwnProperty(runtime, 'cabinetRunActive', saved.cabinetRunActive);
  saved.used = true;
}

function resetRunRuntime(state) {
  state.runtime.hyperGauge = null;
  state.runtime.bulletDensity = 0;
  for (const seen of state.runtime.grazedBullets) seen.clear();
  state.runtime.grazeCount.fill(0);
  state.runtime.resurrectionPositions.fill(null);
  state.runtime.cabinetRamRestore.length = 0;
}

/** Keep a selected loadout pending while an ordinary browser launch runs the cabinet front end. */
export function prepareModCabinetBoot(state) {
  if (!state) return null;
  state.runtime.cabinetBoot = true;
  state.runtime.cabinetRunActive = false;
  resetRunRuntime(state);
  return state;
}

function modRunActive(state) {
  return !!state && state.runtime.cabinetRunActive !== false;
}

function captureCabinetRamPolicy(state, ram) {
  const restore = state.runtime.cabinetRamRestore;
  const s = state.loadout.sim;
  const word = (addr) => restore.push({ addr, width: 2, value: ram.u16(addr) });
  const byte = (addr) => restore.push({ addr, width: 1, value: ram.u8(addr) });
  if (s.nativeAutoFire) byte(MOD_RAM.autoFireDip);
  if (s.rank === 'low') {
    word(MOD_RAM.rankPowerP1);
    word(MOD_RAM.rankPowerP2);
  }
}

function restoreCabinetRamPolicy(state, ram) {
  for (const entry of state.runtime.cabinetRamRestore) {
    if (entry.width === 1) ram.setU8(entry.addr, entry.value);
    else ram.setU16(entry.addr, entry.value);
  }
  const s = state.loadout.sim;
  if (s.unbreakableChain) ram.setU16(MOD_RAM.chainMeterP1, 0);
  if (s.bottomlessBombs || s.infiniteHyperStock) ram.setU16(MOD_RAM.hyperStockP1, 0);
  if (s.bulletCanceller) {
    ram.setU16(MOD_RAM.cancelArm, 0);
    ram.setU16(MOD_RAM.cancelMode, 0);
  }
  if (s.hyperOverdrive) {
    ram.setU16(MOD_RAM.hyperGaugeP1, 0);
    ram.setU16(MOD_RAM.hyperGaugeP2, 0);
  }
}

function cabinetRunStart(state, ram, event) {
  resetRunRuntime(state);
  const active = event?.demo !== true;
  state.runtime.cabinetRunActive = active;
  if (!active) return;
  captureCabinetRamPolicy(state, ram);
  if (state.loadout.sim.loop2FromStage1) {
    ram.setU16(MOD_RAM.loopCounter, 1);
  }
}

function cabinetRunEnd(state, ram) {
  if (!state.runtime.cabinetRunActive) return;
  restoreCabinetRamPolicy(state, ram);
  state.runtime.cabinetRunActive = false;
  resetRunRuntime(state);
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
  invulnP2: 0x810486,
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
  hyperActiveP1: 0x81b63e,
  hyperActiveP2: 0x81b640,
  hyperGaugeP1: 0x81b642,
  hyperGaugeP2: 0x81b644,
  bulletDensity: 0x81b40c,
  bossPhase: 0x81309c,
  player1: 0x8103e6,
  player1Y: 0x8103e8,
  player1X: 0x8103ea,
  player2: 0x810448,
  player2Y: 0x81044a,
  player2X: 0x81044c,
  logicFrame: 0x80390a,
  loopCounter: 0x813098,
});

const BEE_MAGNET_STEP = 0x80;
const BOSS_ENRAGE_ADD = 6;

function signedWordDelta(target, current) {
  return (((target - current) & 0xffff) << 16) >> 16;
}

function approachWord(current, target, limit) {
  const delta = signedWordDelta(target, current);
  const step = Math.max(-limit, Math.min(limit, delta));
  return (current + step) & 0xffff;
}

/** Optional Pool-A callback installed only for a Bee Magnet Game. */
function pullBeeTowardPlayer(ram, slot) {
  const players = [];
  if ((ram.u16(MOD_RAM.player1) & 0x8000) !== 0) {
    players.push([ram.u16(MOD_RAM.player1Y), ram.u16(MOD_RAM.player1X)]);
  }
  if ((ram.u16(MOD_RAM.player2) & 0x8000) !== 0) {
    players.push([ram.u16(MOD_RAM.player2Y), ram.u16(MOD_RAM.player2X)]);
  }
  if (!players.length) return;

  const y = ram.u16(slot + 0x02), x = ram.u16(slot + 0x04);
  let target = players[0], best = Infinity;
  for (const candidate of players) {
    const dy = signedWordDelta(candidate[0], y);
    const dx = signedWordDelta(candidate[1], x);
    const distance = dy * dy + dx * dx;
    if (distance < best) { best = distance; target = candidate; }
  }
  ram.setU16(slot + 0x02, approachWord(y, target[0], BEE_MAGNET_STEP));
  ram.setU16(slot + 0x04, approachWord(x, target[1], BEE_MAGNET_STEP));
}

/** Optional spawn callback installed only for a Boss Enrage Game. */
function enrageBossBulletSpeed(speed, ram) {
  if (ram.u16(MOD_RAM.bossPhase) === 0) return speed;
  return Math.min(0xff, speed + BOSS_ENRAGE_ADD);
}

const GRAZE_SCORE_BCD = 0x00000100;

function rewardGraze(state, ram, event) {
  const side = event.player === MOD_RAM.player1 ? 0
    : event.player === MOD_RAM.player2 ? 1 : -1;
  if (side < 0) return;
  const seen = state.runtime.grazedBullets[side];
  const live = new Set(event.live);
  for (const rec of seen) if (!live.has(rec)) seen.delete(rec);
  const ledger = side === 0 ? LEDGER.p1 : LEDGER.p2;
  for (const rec of event.near) {
    if (seen.has(rec)) continue;
    seen.add(rec);
    bcdAdd(ram, ledger.pendingEnd, GRAZE_SCORE_BCD);
    state.runtime.grazeCount[side]++;
  }
}

function resetGrazeBulletLifetime(state, _ram, event) {
  for (const seen of state.runtime.grazedBullets) seen.delete(event.addr);
}

function doublePlayerDamage(amount) {
  const word = amount & 0xffff;
  if ((word & 0x8000) !== 0) return word;
  return Math.min(0x7fff, word * 2);
}

function autoDeathbomb(ram, rec, playerIdx, ctx) {
  const result = fireBomb2498E2(ram, ctx, rec, playerIdx);
  ctx.bombEvent?.('press', result);
  return result.startsWith('fired');
}

function captureResurrectionPosition(state, _ram, side, y, x, canRespawn) {
  state.runtime.resurrectionPositions[side] = canRespawn
    ? { y: y & 0xffff, x: x & 0xffff }
    : null;
}

function consumeResurrectionPosition(state, _ram, side, y, x) {
  const saved = state.runtime.resurrectionPositions[side];
  if (!saved) return { y, x };
  state.runtime.resurrectionPositions[side] = null;
  return saved;
}

const REVENGE_AIM_TABLES = new WeakMap();

function revengeAimTables(rom) {
  let tables = REVENGE_AIM_TABLES.get(rom);
  if (!tables) {
    tables = new AimTables(rom);
    REVENGE_AIM_TABLES.set(rom, tables);
  }
  return tables;
}

function fireRevengeBullet(ram, event, ctx) {
  const aimed = aim64FromCaller(
    () => revengeAimTables(ctx.rom), ram, event.rec, event.y, event.x,
  );
  if (aimed.carry) return null;
  const regs = {
    d0: 5,
    d1: aimed.dir,
    d2: ((event.y << 16) | event.x) >>> 0,
    d3: 0, d4: 0, d5: 0, a5: event.rec,
  };
  return spawnCore({ ram, rom: ctx.rom, log: new WriteLog(ram) }, regs, 'A');
}

function convertCanceledBullet(ram, event, ctx) {
  return spawnConvertedShot(ram, ctx.rom, ctx, event.y, event.x);
}

function hostilePolarityBank(ram, event) {
  const focused = (ram.u8(event.player + 0x18) & 0x10) !== 0;
  return event.bank === (focused ? 'A' : 'B');
}

function multiplyPackedBcd(addend, multiplier) {
  const source = addend >>> 0;
  if (multiplier === 1) return source;
  let total = 0;
  for (let n = 0; n < multiplier; n++) {
    let next = 0, x = 0;
    for (let shift = 0; shift < 32; shift += 8) {
      const r = abcd((total >>> shift) & 0xff, (source >>> shift) & 0xff, x);
      next = (next | (r.v << shift)) >>> 0;
      x = r.x;
    }
    total = next;
  }
  return total;
}

function multiplyFinalScoreAddend(addend, ram) {
  const multiplier = (ram.u16(MOD_RAM.logicFrame) & 7) + 1;
  return multiplyPackedBcd(addend, multiplier);
}

function startAtFinalBossApproach(ram, rom, entry) {
  let cursor = entry.script;
  let finalTrigger = null;
  for (;;) {
    const trigger = rom.u16(cursor);
    if (trigger === 0xffff) break;
    finalTrigger = trigger;
    cursor += 8;
  }
  if (finalTrigger == null) return;

  const threshold = Math.max(0, finalTrigger - 0x10);
  cursor = entry.script;
  for (;;) {
    const trigger = rom.u16(cursor);
    if (trigger === 0xffff || trigger >= threshold) break;
    cursor += 8;
  }
  ram.setU32(SPAWN.LIVE_CURSOR, cursor);
  ram.setU16(SPAWN.DISTANCE_CLOCK, threshold);
}

function remixNextStageValue(value) {
  switch (value) {
    case 1: return 2;
    case 3: return 1;
    case 2: return 3;
    default: return value;
  }
}

/** Per-Game callback options, or null when this loadout needs no callback seam. */
export function modGameOptions(state) {
  if (!state) return null;
  const options = {};
  const sim = state.loadout.sim;
  if (state.runtime.cabinetBoot) {
    options.cabinetRunStartHook = (ram, event) => cabinetRunStart(state, ram, event);
    options.cabinetRunEndHook = (ram) => cabinetRunEnd(state, ram);
  }
  if (sim.beeMagnet) {
    options.beeRecordHook = (...args) => {
      if (modRunActive(state)) pullBeeTowardPlayer(...args);
    };
  }
  if (sim.bossEnrage) {
    options.bulletSpeedTransform = (speed, ram) => modRunActive(state)
      ? enrageBossBulletSpeed(speed, ram) : speed;
  }
  if (sim.grazeReactor) {
    options.bulletSpawnHook = (ram, event) => {
      if (modRunActive(state)) resetGrazeBulletLifetime(state, ram, event);
    };
    options.playerGrazeHook = (ram, event) => {
      if (modRunActive(state)) rewardGraze(state, ram, event);
    };
  }
  if (sim.glassCannon) {
    options.playerDamageTransform = (amount) => modRunActive(state)
      ? doublePlayerDamage(amount) : amount;
  }
  if (sim.autoDeathbomb) {
    options.lethalHitHook = (...args) => modRunActive(state) && autoDeathbomb(...args);
  }
  if (sim.resurrectionInPlace) {
    options.deathPositionCapture = (ram, side, y, x, canRespawn) => {
      if (modRunActive(state)) captureResurrectionPosition(state, ram, side, y, x, canRespawn);
    };
    options.respawnPositionTransform = (ram, side, y, x) => modRunActive(state)
      ? consumeResurrectionPosition(state, ram, side, y, x) : { y, x };
  }
  if (sim.revengeBullets) {
    options.enemyDeathHook = (...args) => {
      if (modRunActive(state)) return fireRevengeBullet(...args);
      return null;
    };
  }
  if (sim.friendlyConvertedBullets) {
    options.friendlyBulletConvertHook = (...args) => {
      if (modRunActive(state)) return convertCanceledBullet(...args);
      return null;
    };
  }
  if (sim.invincibility || sim.bulletPolarity) {
    options.enemyBulletCollisionFilter = (ram, event) => !modRunActive(state)
      || ((!sim.invincibility || event.player !== MOD_RAM.player1)
        && (!sim.bulletPolarity || hostilePolarityBank(ram, event)));
  }
  if (sim.scoreMultiplierMayhem) {
    options.scoreAddendTransform = (addend, ram) => modRunActive(state)
      ? multiplyFinalScoreAddend(addend, ram) : addend;
  }
  if (sim.bossRush) {
    options.stageScriptInstallHook = (...args) => {
      if (modRunActive(state)) startAtFinalBossApproach(...args);
    };
  }
  if (sim.stageRemix) {
    options.stageAdvanceTransform = (value) => modRunActive(state)
      ? remixNextStageValue(value) : value;
  }
  const callbacks = Object.freeze({ ...options });
  if (!state.loadout.presentation.runaheadFrames) {
    return Object.keys(callbacks).length ? Object.freeze(options) : null;
  }
  options[RUNAHEAD_EXTERNAL_STATE] = Object.freeze({
    callbacks,
    save: () => saveModRunaheadState(state),
    restore: (token) => restoreModRunaheadState(state, token),
  });
  return Object.freeze(options);
}

function applyRamMods(state, ram) {
  if (!state) return;
  const s = state.loadout.sim;
  if (s.glassCannon) {
    ram.setU8(MOD_RAM.invulnP1, 0);
    ram.setU8(MOD_RAM.invulnP2, 0);
  }
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

const HYPER_ACTIVE_GAUGE = Object.freeze([
  Object.freeze([MOD_RAM.hyperActiveP1, MOD_RAM.hyperGaugeP1]),
  Object.freeze([MOD_RAM.hyperActiveP2, MOD_RAM.hyperGaugeP2]),
]);

function cacheHyperGauge(state, ram) {
  if (!state?.loadout.sim.hyperOverdrive) return;
  state.runtime.hyperGauge = HYPER_ACTIVE_GAUGE.map(([, gauge]) => ram.u16(gauge));
}

function preserveOrdinaryHyperDrain(state, ram) {
  if (!state?.loadout.sim.hyperOverdrive) return;
  const cached = state.runtime.hyperGauge;
  state.runtime.hyperGauge = null;
  if (!cached) return;
  for (let i = 0; i < HYPER_ACTIVE_GAUGE.length; i++) {
    const [active, gauge] = HYPER_ACTIVE_GAUGE[i];
    const before = cached[i];
    if (ram.u16(active) !== 0
      && ram.u16(gauge) === ((before - 2) & 0xffff)) {
      ram.setU16(gauge, before);
    }
  }
}

/** Explicit host policy immediately before Game.step(). */
export function applyPreFrameMods(state, ram) {
  if (!modRunActive(state)) return;
  cacheHyperGauge(state, ram);
  applyRamMods(state, ram);
}

/** Explicit host policy immediately after Game.step(). */
export function applyPostFrameMods(state, ram) {
  if (!modRunActive(state)) return;
  preserveOrdinaryHyperDrain(state, ram);
  applyRamMods(state, ram);
  if (state.loadout.timing.adaptive) {
    state.runtime.bulletDensity = ram.u16(MOD_RAM.bulletDensity);
  }
}

/** Transform the active-low raw PGM input word before Game.step(). */
export function transformModInput(state, word, logicFrame) {
  if (!modRunActive(state)
      || !state.loadout.sim.precisionShip || (logicFrame & 1) === 0) return word & 0xffff;
  // Logical direction bits 0..3 map to raw port bits 1..4. Setting an active-low
  // bit releases it; all fire and start bits pass through unchanged.
  return (word | 0x001e) & 0xffff;
}

/** Pure density mapping: normal through 48 bullets, then smoothly to a 44% floor. */
export function adaptiveSlowMotionScale(bulletDensity) {
  const density = Number.isFinite(bulletDensity)
    ? Math.max(0, Math.min(210, Math.trunc(bulletDensity))) : 0;
  if (density <= 48) return 1;
  return 1 + (density - 48) * 1.25 / 162;
}

/** Transform only host cadence. Game still receives every logic frame. */
export function transformModTiming(state, basePeriodMs) {
  if (!modRunActive(state)) return basePeriodMs;
  const scale = state.loadout.timing.adaptive
    ? adaptiveSlowMotionScale(state.runtime.bulletDensity)
    : state.loadout.timing.scale;
  return basePeriodMs * scale;
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

const HITBOX_W = 448;
const HITBOX_H = 224;

export const HITBOX_COLORS = Object.freeze({
  enemy: Object.freeze([255, 224, 0]),
  shot: Object.freeze([64, 160, 255]),
  bullet: Object.freeze([255, 32, 32]),
  collectible: Object.freeze([255, 64, 255]),
  weapon: Object.freeze([255, 128, 32]),
  p1: Object.freeze([64, 255, 64]),
  p2: Object.freeze([32, 255, 255]),
});

function hitboxPixel(rgb, longAxis, shortAxis, color) {
  if (longAxis < 0 || longAxis >= HITBOX_W || shortAxis < 0 || shortAxis >= HITBOX_H) return;
  const at = (shortAxis * HITBOX_W + longAxis) * 3;
  rgb[at] = color[0]; rgb[at + 1] = color[1]; rgb[at + 2] = color[2];
}

function hitboxOutline(rgb, bounds, color) {
  let minLong = i16(bounds.minLong) >> 6;
  let maxLong = i16(bounds.maxLong) >> 6;
  let minShort = i16(bounds.minShort) >> 6;
  let maxShort = i16(bounds.maxShort) >> 6;
  if (minLong > maxLong || minShort > maxShort
      || maxLong < 0 || minLong >= HITBOX_W || maxShort < 0 || minShort >= HITBOX_H) return;
  minLong = Math.max(0, minLong); maxLong = Math.min(HITBOX_W - 1, maxLong);
  minShort = Math.max(0, minShort); maxShort = Math.min(HITBOX_H - 1, maxShort);
  for (let x = minLong; x <= maxLong; x++) {
    hitboxPixel(rgb, x, minShort, color);
    hitboxPixel(rgb, x, maxShort, color);
  }
  for (let y = minShort + 1; y < maxShort; y++) {
    hitboxPixel(rgb, minLong, y, color);
    hitboxPixel(rgb, maxLong, y, color);
  }
}

function ordinaryBounds(ram, rec) {
  const long = ram.u16(rec + 0x02), short = ram.u16(rec + 0x04);
  return {
    maxLong: (long + ram.u16(rec + 0x10)) & 0xffff,
    minLong: (long - ram.u16(rec + 0x12)) & 0xffff,
    maxShort: (short + ram.u16(rec + 0x14)) & 0xffff,
    minShort: (short - ram.u16(rec + 0x16)) & 0xffff,
  };
}

function shotBounds(ram, rec) {
  const maxLong = (ram.u16(rec + 0x02) + ram.u16(rec + 0x10)) & 0xffff;
  const maxShort = (ram.u16(rec + 0x04) + ram.u16(rec + 0x14)) & 0xffff;
  return {
    maxLong,
    minLong: (maxLong - ram.u16(rec + 0x12)) & 0xffff,
    maxShort,
    minShort: (maxShort - 2 * ram.u16(rec + 0x16)) & 0xffff,
  };
}

function itemBounds(ram, rec) {
  const long = ram.u16(rec + 0x02), short = ram.u16(rec + 0x04);
  const longExtent = ram.u16(rec + 0x10), shortExtent = ram.u16(rec + 0x12);
  return {
    maxLong: (long + longExtent) & 0xffff,
    minLong: (long - longExtent) & 0xffff,
    maxShort: (short + shortExtent) & 0xffff,
    minShort: (short - shortExtent) & 0xffff,
  };
}

function continuousBeamBounds(ram, rec) {
  const minLong = ram.u16(rec + 0x02);
  const rawMaxLong = (minLong + 0x0400 + ram.u16(rec + 0x06)) & 0xffff;
  const reach = ram.u16(rec + 0x10);
  return {
    minLong,
    maxLong: reach < rawMaxLong ? reach : rawMaxLong,
    minShort: (ram.u16(rec + 0x04) - ram.u16(rec + 0x0a)) & 0xffff,
    maxShort: (ram.u16(rec + 0x04) + ram.u16(rec + 0x08)) & 0xffff,
  };
}

function itemHitboxes(ram, rgb) {
  const count = ram.u16(DMG.itemCount);
  let slot = 0;
  for (let n = 0; n < count; n++) {
    let rec = null;
    while (slot < 25) {
      const candidate = DMG.itemPool + slot++ * DMG.itemStride;
      if (ram.u16(candidate + 0x02) !== 0) { rec = candidate; break; }
    }
    if (rec == null) break;
    if ((ram.u16(rec) & 0x00c0) === 0) {
      hitboxOutline(rgb, itemBounds(ram, rec), HITBOX_COLORS.collectible);
    }
  }
}

function impactHitboxes(ram, rgb) {
  const count = ram.u16(DMG.impactCount);
  let slot = 0;
  for (let n = 0; n < count; n++) {
    let rec = null;
    while (slot < 80) {
      const candidate = DMG.impactPool + slot++ * DMG.impactStride;
      if ((ram.u16(candidate) & 0x8000) !== 0) { rec = candidate; break; }
    }
    if (rec == null) break;
    if (ram.u16(rec + 0x02) !== 0 && (ram.u8(rec + 0x01) & 0x80) === 0) {
      hitboxOutline(rgb, ordinaryBounds(ram, rec), HITBOX_COLORS.collectible);
    }
  }
}

function beamTailActive(ram, player) {
  const status = ram.u16(player);
  return (status & 0x8000) !== 0 && (status & 0x0080) === 0
    && ram.u8(player + DMG.laserByte) !== 0;
}

function beamHitboxes(ram, rgb) {
  for (const [player, slot27, slot30, control] of [
    [DMG.p1rec, DMG.laserSlot27, DMG.laserSlot30, DMG.beamRecP1],
    [DMG.p2rec, DMG.laserSlot27P2, DMG.laserSlot30P2, DMG.beamRecP2],
  ]) {
    if (!beamTailActive(ram, player)) continue;
    if ((ram.u16(slot27) & 0x8000) !== 0 && ram.u16(slot27 + 0x02) < 0x7000) {
      hitboxOutline(rgb, ordinaryBounds(ram, slot27), HITBOX_COLORS.weapon);
    }
    if ((ram.u16(slot30) & 0x8000) !== 0) {
      hitboxOutline(rgb, ordinaryBounds(ram, slot30), HITBOX_COLORS.weapon);
    }
    if ((ram.u16(control) & 0x8200) === 0x8200) {
      hitboxOutline(rgb, continuousBeamBounds(ram, control), HITBOX_COLORS.weapon);
    }
  }
}

function laserBombHitboxes(ram, rgb) {
  const bomb = ram.u16(BOMBRAM.rec);
  if ((bomb & 0x8001) !== 0x8001) return;
  const player = (ram.u8(BOMBRAM.rec + 0x01) & 0x80) !== 0 ? DMG.p2rec : DMG.p1rec;
  if ((ram.u16(player) & 0x8000) === 0 || (ram.u8(player + 0x01) & 0x40) === 0) return;
  for (let i = 0; i < BOMBRAM.slots; i++) {
    const rec = BOMBRAM.rec + i * BOMBRAM.stride;
    const statusHigh = ram.u8(rec);
    if ((statusHigh & 0x80) !== 0 && (statusHigh & 0x02) === 0) {
      hitboxOutline(rgb, ordinaryBounds(ram, rec), HITBOX_COLORS.weapon);
    }
  }
}

/** Overlay the collision pass's board-coordinate geometry before TATE rotation. */
export function applyHitboxOverlay(state, ram, rgb) {
  if (!state?.loadout.presentation.hitboxes) return rgb;
  if (!ram || rgb.length !== HITBOX_W * HITBOX_H * 3) return rgb;

  for (let i = 0; i < 150; i++) {
    const rec = DMG.poolA + i * DMG.enemyStride;
    const type = ram.u16(rec);
    if ((type & 0x8000) !== 0 && (type & 0x2101) !== 0) {
      hitboxOutline(rgb, ordinaryBounds(ram, rec), HITBOX_COLORS.enemy);
    }
  }
  itemHitboxes(ram, rgb);
  impactHitboxes(ram, rgb);
  for (const table of [DMG.p1shots, DMG.p2shots]) {
    for (let i = 0; i < DMG.shotSlots; i++) {
      const rec = table + i * DMG.shotStride;
      if ((ram.u16(rec) & 0x8000) !== 0) {
        hitboxOutline(rgb, shotBounds(ram, rec), HITBOX_COLORS.shot);
      }
    }
  }
  beamHitboxes(ram, rgb);
  laserBombHitboxes(ram, rgb);
  const bulletSlots = bulletWindowSlots(ram);
  for (let i = 0; i < bulletSlots; i++) {
    const rec = DMG.bulletPool + i * DMG.bulletStride;
    // `$2459D0` does not test the live bit. A cleared slot with stale, mask-clear
    // coordinates can still hit, so the diagnostic must not hide that point.
    if ((ram.u8(rec) & 0x51) !== 0) continue;
    const longAxis = i16(ram.u16(rec + 0x02)) >> 6;
    const shortAxis = i16(ram.u16(rec + 0x04)) >> 6;
    hitboxPixel(rgb, longAxis, shortAxis, HITBOX_COLORS.bullet);
    hitboxPixel(rgb, longAxis - 1, shortAxis, HITBOX_COLORS.bullet);
    hitboxPixel(rgb, longAxis + 1, shortAxis, HITBOX_COLORS.bullet);
    hitboxPixel(rgb, longAxis, shortAxis - 1, HITBOX_COLORS.bullet);
    hitboxPixel(rgb, longAxis, shortAxis + 1, HITBOX_COLORS.bullet);
  }
  for (const [rec, color] of [[DMG.p1rec, HITBOX_COLORS.p1], [DMG.p2rec, HITBOX_COLORS.p2]]) {
    if ((ram.u16(rec) & 0x8000) !== 0) {
      hitboxOutline(rgb, ordinaryBounds(ram, rec), color);
    }
  }
  return rgb;
}
