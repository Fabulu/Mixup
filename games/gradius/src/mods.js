// Gradius mods.  The same shape as games/batman/src/mods.js -- CATEGORIES,
// MODS, PRESETS, resolveLoadout(), describeMod(), loadoutToHash() -- so the
// repo's launcher (index.html) can drive either game without knowing which.
//
// ============================ THE ONE RULE ==================================
//
// **A MOD MAY NOT EXIST UNLESS IT IS SWITCHED ON.** `state.mods` is UNDEFINED
// on every state createState() ever made, every one of the 47 oracle scenarios
// and every one of the 732 unit tests. Every hook this file exports is called
// from src/ behind `if (state.mods)`, so with no loadout attached the port is
// byte-for-byte the program the gate compares against the cartridge. That is
// not a nicety: the port's agreement with the ROM is the actual product, and a
// mod that could perturb it would be a defect in the product, not a feature.
//
// The call sites, all seven of them inside the simulation, so they can be
// counted (`grep -n 'state.mods' games/gradius/src/*.js`):
//
//   src/nmi.js       modHidePlayer / modShowPlayer around $80A7's display list
//   src/nmi.js       modFreezeEnemies          around $9A6D's JSR $ADAB
//   src/nmi.js       modFrameEnd               after $80B5's `STA $04`
//   src/flow.js      modAfterIntroReset        at the tail of $9B3E
//   src/flow.js      modAbandonRun             at the top of $97F1   (W43)
//   src/modes.js     modNewRun                 at the tail of $82D5  (W44)
//   src/collision.js modRefuseDeath            at the top of $C1D6
//
// ...plus src/main.js, which is the HOST and not the simulation: the input
// word, the frame pacing and the framebuffer.
//
// ============================ THE SECOND RULE (W44) =========================
//
// **A MOD MAY NOT OUTLIVE THE RUN IT BELONGS TO, AND MAY NOT BE SPENT BY A RUN
// THE PLAYER IS NOT FLYING.** W43 found one instance of the first half: the
// Heal Gradius Syndrome death position survived a game over and teleported the
// next game's camera. W44 audited the whole layer and found the class is real
// but small -- and found the second half, which nobody had looked for:
//
//   * `$09 != 0` IS THE ATTRACT DEMO, and until W44 it ran the full mod
//     simulation. The picker's STARTING KIT was granted to the demo ship and
//     `rt.firstIntro` went false, so a player who watched the title screen for
//     six seconds before pressing START flew a bare Viper. MEASURED: with
//     `{shield: 5, options: 2}`, the real run's first play frame had
//     `$45 = $46 = 0`. Every simulation hook now returns early on `$09 != 0`.
//   * `$8307`'s wipe clears `$26,X` and `$28,X`, so the two bytes attachMods()
//     seeds do not survive mode 0 -- let alone a continue. MEASURED: with
//     `loop-three` and no level pick (the default launch, mode 0), `$28,X` was
//     already 0 by frame 128 and `$1A` was 0 on the first play frame. The mod
//     did nothing at all. `modNewRun()` re-seeds them at `$82D5`, which is the
//     one routine that means "a new game is starting" and is what BOTH the
//     title's START and the game-over screen's CONTINUE go through.
//
// Every piece of mutable state a mod owns, and what clears it, is the table in
// docs/worklog/gradius/44-impl-mod-run-scope.md. `tools/oracle/modscope.mjs`
// drives all 19 mods and all 4 presets through a demo, a run, a game over and a
// continue and asserts it, because no oracle scenario can: `state.mods` is
// undefined on every one of them, by design and by the rule above.
//
// ===================== WHY A FRONT END AND NOT AN OVERLAY ====================
//
// W39 ported the cartridge's OWN title screen, attract demo and start jingle
// (modes 0-4). So the question was real: does the mod menu go BEFORE the
// cartridge boots, like Batman's, or on top of it as an overlay?
//
// BEFORE. Three reasons, in order of weight:
//
//  1. Half the mods have to be resolved before the first NMI. Level select
//     writes `$26,X` and loop select writes `$28,X`, and BOTH are read by
//     `$9B6E`/`$9B72` inside the very first `$9B3E`. An overlay opened during
//     play is already past them.
//  2. START and SELECT belong to the cartridge now. `$821A` consumes both on
//     every mode-0/1/2 frame; an overlay would have to fight the title screen
//     for the two buttons a player would reach for to open it.
//  3. It is what makes the ONE RULE checkable. With the menu outside the frame
//     loop, "mods off" is not a code path -- it is the absence of an object.
//
// The cartridge's own title is not replaced. It is one of the entries: pick
// "Title screen" and you get mode 0, the 127-frame scroll-in and the attract
// demo, exactly as W39 ported them.

/**
 * `$00 == 5` -- MODE 5, PLAY. The same number `src/state.js` exports as
 * `MODE_STAGE`, and it is spelled here as a literal ON PURPOSE.
 *
 * **THIS FILE HAS NO IMPORTS AND MUST KEEP NONE.** `start.html` says so in as
 * many words -- "It carries NO game code. The only module it imports is
 * src/mods.js" -- and that is the whole reason the launcher is a front end
 * instead of an overlay: the catalogue can be rendered without loading the
 * port. Importing one constant from `src/state.js` would drag the port's state
 * model onto the start screen to save a five.
 *
 * `tests/mods.test.js` asserts this equals `MODE_STAGE`, so the duplication
 * cannot drift.
 */
export const PLAY_MODE = 5;

// ---------------------------------------------------------------------------
//  The catalogue
// ---------------------------------------------------------------------------

/**
 * The launcher's three headings. Kept the same three words Batman uses so the
 * shared shell in the repo's index.html needs no change to render this game.
 */
export const CATEGORIES = ['physics', 'combat', 'chaos'];

/**
 * Every mod below is annotated with WHAT IT ACTUALLY WRITES.
 *
 *   `zp`      zero-page addresses and values. These are the cartridge's own
 *             bytes -- `$40` speed, `$46` shield -- so the block doubles as
 *             documentation, exactly as Batman's `params` block does.
 *   `sim`     a named behaviour that is not one constant.
 *   `render`  the framebuffer only. NOTHING in `render` can reach the
 *             simulation; it happens after nmi() has returned.
 *   `meta`    the host's frame pacing. Also outside the simulation.
 */
export const MODS = {
  // ======================= physics =======================================
  'turbo': {
    name: 'Turbo Mode',
    blurb: 'Two logic frames per displayed frame. Bydo at 120 Hz.',
    category: 'physics',
    meta: { ticksPerFrame: 2 },
  },
  'bullet-time': {
    name: 'Bullet Time',
    blurb: 'One frame in three. You have all the time in the world and it '
         + 'still will not be enough.',
    category: 'physics',
    meta: { frameSkip: 3 },
  },
  'mirror': {
    name: 'Mirror Gradius',
    blurb: 'The whole stage comes at you from the wrong side. Your thumbs are '
         + 'swapped to match, which somehow makes it worse.',
    category: 'physics',
    render: { mirror: true },
    sim: { swapLR: true },
  },
  'upside-down': {
    name: 'Gradius Down Under',
    blurb: 'Volcanoes erupt downwards now. Up is down; we swapped the stick '
         + 'too, you are welcome.',
    category: 'physics',
    render: { flipY: true },
    sim: { swapUD: true },
  },

  // ======================= combat ========================================
  'full-power': {
    name: 'Full Kit, One Speed',
    blurb: 'Everything on the bar except SPEED, which stays at 1 -- you have '
         + 'flown a speed-5 Viper and you know exactly how that ended. '
         + 'Re-granted on every single respawn.',
    category: 'combat',
    // $9B3E wipes $3D-$97, which is every one of these. The mod writes them
    // back at the TAIL of $9B3E, i.e. on the boot intro AND on every respawn.
    zp: { 0x40: 1, 0x41: 1, 0x42: 6, 0x44: 2, 0x45: 2, 0x46: 5 },
    sim: { grantEveryIntro: true },
  },
  'heal-gradius-syndrome': {
    name: 'Heal Gradius Syndrome',
    blurb: 'The section that killed you is the section you come back to, not '
         + 'the one you already beat. Blink for three seconds, touch nothing, '
         + 'get out of the way.',
    category: 'combat',
    // NOT a checkpoint value: `$97BB` stores min($3F AND $0E, 8), which can
    // only ever name five places in a stage. This restores the camera and the
    // ship, and then hands the player the invulnerability the cartridge has
    // never had (see modRefuseDeath).
    sim: { respawnInPlace: true, invulnFrames: 180 },
  },
  'muscle-memory': {
    name: 'Muscle Memory',
    blurb: 'Whatever you started the run with, you get back. Every time. The '
         + 'bar remembers even when you do not.',
    category: 'combat',
    sim: { stickyStart: true },
  },
  'immortal': {
    name: 'Cannot Be Killed, Only Embarrassed',
    blurb: '`$C1D6` never runs. Fly into the volcano; the volcano loses.',
    category: 'combat',
    sim: { immortal: true },
  },
  'rank-zero': {
    name: 'Career Rookie',
    blurb: 'Rank `$17` pinned at 0 forever. The game never notices how well '
         + 'you are doing, and never starts taking you seriously.',
    category: 'combat',
    sim: { rankLock: 0 },
  },
  'rank-max': {
    name: 'Overqualified',
    blurb: 'Rank `$17` pinned at 6 -- a number stage 1 cannot reach by playing. '
         + 'Every enemy aims like you owe it money.',
    category: 'combat',
    sim: { rankLock: 6 },
  },
  'loop-three': {
    name: 'Third Time Unlucky',
    blurb: 'Start on loop 3. W38 measured loops 2, 3 and 6 frame-identical, so '
         + 'this is the hardest the cartridge has ever been able to be.',
    category: 'combat',
    // $9B72 restores $1A from $28,X on every intro, and $97BF saves it back on
    // every death, so seeding $28,X is all it takes and it survives the run.
    sim: { loop: 2 },
  },
  'overtime': {
    name: 'Overtime Pay',
    blurb: 'One enemy per frame has its fire countdown zeroed. All ten bullet '
         + 'slots, permanently occupied. They are not paid enough for this.',
    category: 'combat',
    sim: { overtime: true },
  },
  'stay-calm': {
    name: 'Everyone Stay Calm',
    blurb: 'Enemies spawn, aim and shoot, and do not move a pixel. `$ADAB` '
         + 'simply does not run.',
    category: 'combat',
    sim: { freezeEnemies: true },
  },

  // ======================= chaos =========================================
  'always-on-enemies': {
    name: 'Always on enemies',
    blurb: 'The NES draws eight sprites a scanline and throws the rest away. '
         + 'It does not any more. Nothing vanishes; the deliberate blinks '
         + 'still blink.',
    category: 'chaos',
    render: { sprLimit: 64 },
  },
  'gameboy': {
    name: 'Gradius for Game Boy',
    blurb: 'The port it never got, on the console the other game in this repo '
         + 'came from. Four greens, and not one of them is a good green.',
    category: 'chaos',
    render: { dmg: true },
  },
  'negative': {
    name: 'Photo Negative',
    blurb: 'Somebody left the whole of Planet Gradius in the developer.',
    category: 'chaos',
    render: { invert: true },
  },
  'disco': {
    name: 'Disco Vipers',
    blurb: 'Palette RAM will not sit still. The game is unchanged; only your '
         + 'ability to look at it is affected.',
    category: 'chaos',
    render: { disco: true },
  },
  'afterimage': {
    name: 'Afterimage',
    blurb: 'Everything smears. The Options finally look like the ghosts they '
         + 'always were.',
    category: 'chaos',
    render: { ghost: true },
  },
  'hitboxes': {
    name: 'X Marks The Viper',
    blurb: 'The exact pixel `$C2BC` hands the terrain probe, and every live '
         + "enemy's `$036C`/`$032C`. No boxes invented -- just the coordinates "
         + 'the game compares.',
    category: 'chaos',
    render: { hitbox: true },
  },
};

/** Curated one-click combinations. */
export const PRESETS = {
  'the-owners-run': {
    name: "The Owner's Run",
    mods: ['full-power', 'heal-gradius-syndrome', 'always-on-enemies'],
  },
  'nightmare': {
    name: 'Nightmare Fuel',
    mods: ['loop-three', 'rank-max', 'overtime'],
  },
  'sightseeing': {
    name: 'Sightseeing Tour',
    mods: ['immortal', 'bullet-time', 'always-on-enemies', 'hitboxes'],
  },
  'wrong-console': {
    name: 'Wrong Console, Wrong Way Up',
    mods: ['gameboy', 'upside-down', 'afterimage'],
  },
};

// ---------------------------------------------------------------------------
//  Resolving a selection
// ---------------------------------------------------------------------------

/**
 * The STARTING KIT the picker chooses, as the six zero-page bytes it is.
 * `null` means "whatever the cartridge does", i.e. the mod layer writes
 * nothing at all for that byte.
 */
export const START_KEYS = {
  speed: 0x40, missile: 0x41, meter: 0x42, weapon: 0x44,
  options: 0x45, shield: 0x46,
};

/**
 * Fold a list of ids (and the launcher's option selects) into one object.
 *
 * Params stack in order and LAST WINS per key, and `conflicts` names every key
 * two selected mods both wrote -- the same contract Batman's resolveLoadout
 * has, because the shared launcher renders the same warning badge from it.
 *
 * @param {string[]} ids
 * @param {object} opts  { stage, speed, missile, weapon, options, shield }
 */
export function resolveLoadout(ids = [], opts = {}) {
  const zp = {};
  const sim = {
    swapLR: false, swapUD: false,
    grantEveryIntro: false, stickyStart: false,
    respawnInPlace: false, invulnFrames: 0,
    immortal: false, rankLock: null, loop: null,
    overtime: false, freezeEnemies: false,
  };
  const render = {
    mirror: false, flipY: false, invert: false, dmg: false,
    disco: false, ghost: false, hitbox: false, sprLimit: 8,
  };
  const meta = { ticksPerFrame: 1, frameSkip: 1 };
  const conflicts = new Map();
  const touched = new Map();
  const kept = [];

  for (const id of ids) {
    const mod = MODS[id];
    if (!mod) continue;                       // an unknown id is dropped, not fatal
    kept.push(id);
    for (const [k, v] of Object.entries(mod.zp || {})) {
      const key = `$${Number(k).toString(16).toUpperCase()}`;
      if (touched.has(key)) {
        if (!conflicts.has(key)) conflicts.set(key, [touched.get(key)]);
        conflicts.get(key).push(id);
      }
      touched.set(key, id);
      zp[Number(k)] = v;
    }
    for (const [k, v] of Object.entries(mod.sim || {})) {
      if (touched.has(k)) {
        if (!conflicts.has(k)) conflicts.set(k, [touched.get(k)]);
        conflicts.get(k).push(id);
      }
      touched.set(k, id);
      sim[k] = v;
    }
    Object.assign(render, mod.render || {});
    Object.assign(meta, mod.meta || {});
  }

  // The picker. It is deliberately applied AFTER the mods so that a hand-picked
  // loadout beats a preset card, EXCEPT for Full Kit, which is the one mod
  // whose entire point is that it wins.
  const start = {};
  for (const [name, addr] of Object.entries(START_KEYS)) {
    const v = opts[name];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 255) continue;
    // ZERO MEANS "LEAVE IT TO THE CARTRIDGE", not "write a zero". Every one of
    // the six is inside `$9B3E`'s `$3D-$97` wipe, so zero is what the intro
    // already leaves; writing it back would be a no-op that nonetheless made
    // `anyStart` true and attached a mods object to a vanilla launch. THE ONE
    // RULE is that nothing attaches unless something was actually chosen.
    if (n === 0) continue;
    start[addr] = n;
  }
  if (!sim.grantEveryIntro) Object.assign(zp, start);
  else for (const a of Object.keys(start)) if (!(a in zp)) zp[a] = start[a];

  // `$19` is not applied through the intro hook: it is the STARTING stage, and
  // re-applying it at every $9B3E would drag the player back to stage N after
  // every death and after every $96CF transition. It is seeded once, into
  // `$26,X`, before the first NMI -- see attachMods().
  const rawStage = Number(opts.stage ?? 0);
  const stage = Number.isInteger(rawStage) && rawStage >= 0 && rawStage <= 6
    ? rawStage : 0;

  return { ids: kept, zp, sim, render, meta, conflicts, stage,
           startKit: start, anyStart: Object.keys(zp).length > 0 };
}

/** Human-readable diff of what a mod changes, for the launcher's cards. */
export function describeMod(id) {
  const mod = MODS[id];
  if (!mod) return [];
  const out = [];
  for (const [k, v] of Object.entries(mod.zp || {})) {
    out.push({ key: `$${Number(k).toString(16).toUpperCase()}`, from: 0, to: v });
  }
  for (const [k, v] of Object.entries(mod.sim || {})) {
    out.push({ key: k, from: null, to: String(v) });
  }
  if (mod.render) out.push({ key: 'render', from: null, to: JSON.stringify(mod.render) });
  if (mod.meta) out.push({ key: 'host', from: null, to: JSON.stringify(mod.meta) });
  return out;
}

// ---------------------------------------------------------------------------
//  Attaching a loadout to a state
// ---------------------------------------------------------------------------

/**
 * THE ONLY WAY `state.mods` EVER BECOMES DEFINED.
 *
 * Seeds the two per-player saved bytes that have to be right BEFORE the first
 * `$9B3E` ever runs, because `$9B6E`/`$9B72` read them inside it:
 *
 *   $26,X  the STAGE.  `$9B6E LDA $26,X / STA $19`
 *   $28,X  the LOOP.   `$9B72 LDA $28,X / STA $1A`
 *
 * Both are the cartridge's own per-player save slots, written by `$979D` on
 * every death and read by `$9B3E` on every intro -- so seeding them is not a
 * parallel system, it is the same two bytes a normal run carries.
 *
 * @returns the loadout, for chaining.
 */
export function attachMods(state, loadout) {
  if (!loadout || (!loadout.ids.length && !loadout.stage && !loadout.anyStart)) {
    return null;                              // nothing selected: stay undefined
  }
  state.mods = {
    lo: loadout,
    // EVERY MUTABLE BYTE THE MOD LAYER OWNS IS IN HERE, and each one carries
    // its LIFETIME, because W43's defect was a field whose lifetime nobody had
    // written down. RUN-scoped fields are dropped by modAbandonRun() ($97F1)
    // and re-armed by modNewRun() ($82D5); SESSION-scoped ones are pure render
    // scratch that cannot reach the simulation.
    rt: {
      invuln: 0,          // RUN     frames of the Heal Gradius Syndrome window
      firstIntro: true,   // RUN     has THIS run's $9B3E run once yet?
      death: null,        // DEATH   {x, y, camHi} captured at $C1D6, consumed
                          //         by the next $9B3E, dropped at $97F1 (W43)
      ghost: null,        // SESSION previous framebuffer, for Afterimage
      discoPal: null,     // SESSION scratch palette; state.vram.pal is never
                          //         touched
    },
  };
  seedSaveSlots(state, loadout);
  return loadout;
}

/**
 * `$26,X` (the stage) and `$28,X` (the loop) -- the two per-player save slots a
 * loadout seeds, spelled ONCE so attachMods() and modNewRun() cannot drift.
 *
 * They are the cartridge's own bytes, written by `$979D` on every death and read
 * by `$9B3E` on every intro, which is why seeding them is not a parallel system.
 * It is also why they do not survive on their own: `$8307`'s wipe clears
 * `$0012-$00EF`, and `$8424`'s clears `$0020-$0097`, so mode 0 alone erases them
 * (measured, W44).
 */
function seedSaveSlots(state, loadout) {
  const p = state.zp.player === 1 ? 1 : 0;
  if (loadout.stage) state.save26[p] = loadout.stage;
  if (loadout.sim.loop !== null) state.save28[p] = loadout.sim.loop;
}

/**
 * `$82D5`, at the tail -- A NEW GAME IS STARTING.
 *
 * `$82D5` has exactly two callers and both of them mean "a new run begins":
 * `$815F` (mode 3's tail, i.e. START on the title menu) and `$970D` (CONTINUE
 * on the game-over screen). It runs `$8307`, whose wipe covers `$0012-$00EF`
 * and therefore `$26,X` and `$28,X` -- the two bytes the launcher's level and
 * loop selections live in. So without this hook a loadout is erased by the
 * cartridge's own new-game setup, which is exactly what was measured:
 *
 *   `#mods=loop-three`, default launch -> `$28,X` = 0 by frame 128 (mode 0's
 *   `$8424`), `$1A` = 0 on the first play frame. The mod NEVER APPLIED.
 *
 * It is also the right place to re-arm the RUN-scoped runtime state, because a
 * CONTINUE **is a new game** -- `$8307` wipes `$19`, `$24,X` and `$26,X`, three
 * lives are re-granted and the score is zeroed -- so "what you start with" is
 * owed again. W43 named `rt.firstIntro` as carrying the same class of leak and
 * left it; this is the fix, and the measurement that says it is a defect is the
 * attract demo, not the continue (see the SECOND RULE at the top of this file).
 *
 * `$9721`, THE CONTINUE CHEAT, IS DELIBERATELY NOT A CALLER, and that is not an
 * omission. It jumps to `$97DD` without going near `$8307`, so `$19`, `$26,X`
 * and `$28,X` all still hold the run's own values: nothing session-scoped was
 * lost, so there is nothing to restore, and re-seeding `$26,X` there would drag
 * a player who died on stage 5 back to whatever stage the picker named. It is a
 * mid-run restart, not a start.
 */
export function modNewRun(state) {
  const m = state.mods;
  if (!m) return;
  m.rt.death = null;
  m.rt.invuln = 0;
  m.rt.firstIntro = true;
  seedSaveSlots(state, m.lo);
}

// ---------------------------------------------------------------------------
//  The simulation hooks.  Each one is a no-op unless state.mods is defined.
// ---------------------------------------------------------------------------

/**
 * THE MOD SIMULATION RUNS IN ONE PLACE ONLY: `$00 == 5` AND `$09 == 0`.
 *
 * Mode 5 is play; `$82D2 INC $09` is the cartridge's own flag for "this is the
 * attract demo, not a game" (the ROM already branches on it in three places --
 * `$835E` skips the BGM change, `$846F` skips the score adder, `$9ADA` refuses
 * to pause). Both halves were MEASURED to be necessary:
 *
 *  * THE DEMO WAS SPENDING THE PLAYER'S RUN. With `{shield: 5, options: 2}` and
 *    the default launch (mode 0, the cartridge's own title), the demo's `$9B3E`
 *    granted the kit to the DEMO ship and set `rt.firstIntro = false`. The demo
 *    ended at frame 3624, the player pressed START, and the real run's first
 *    play frame at 3863 had `$45 = 0` and `$46 = 0`. The starting kit had been
 *    spent on a ship the player was not flying, on the default path, by waiting
 *    six seconds.
 *  * THE TITLE SCREEN WAS LEAKING INTO THE DEMO. `modFrameEnd` used to run on
 *    every mode-0 and mode-1 frame too, so `rank-max` left `$17 = 6` behind and
 *    the demo's FIRST frame (`$09` is still 0 there: `$82C7` runs inside mode
 *    2's own first phase) differed from vanilla by that byte. Found by
 *    `tools/oracle/modscope.mjs`, which is the only thing in this repo that has
 *    ever compared a modded simulation against an unmodded one.
 *
 * So with any loadout at all, every frame outside a real run is byte-identical
 * to vanilla, and modscope.mjs asserts exactly that over the whole attract demo
 * for all 19 mods and all 4 presets.
 *
 * The RENDER layer is deliberately NOT gated: it cannot reach the simulation
 * (it runs after nmi() has returned), and a Game Boy title screen is the point.
 */
function notPlaying(state) {
  return state.mode !== PLAY_MODE || state.zp09 !== 0;
}

/**
 * `$9B3E`, at the tail -- after `$9BC9`'s `JMP $83AB`, i.e. after the cartridge
 * has finished seeding the ship, both rings and the screen.
 *
 * Three things, in this order:
 *   1. the ship goes back where it died (Heal Gradius Syndrome)
 *   2. the starting kit is written into the six power-up bytes the wipe just
 *      cleared (Full Kit / Muscle Memory / the picker)
 *   3. the invulnerability window is armed
 *
 * Order 1-before-2 matters not at all (the two touch disjoint state) and is
 * fixed anyway so that the composition is deterministic rather than incidental.
 */
export function modAfterIntroReset(state) {
  const m = state.mods;
  if (!m || notPlaying(state)) return;
  const { sim, zp } = m.lo;
  const rt = m.rt;
  const d = rt.death;

  // ---- 1. respawn in place ------------------------------------------------
  //
  // `$24,X` IS DELIBERATELY LEFT ALONE. `$97BB` stores min($3F AND $0E, 8) --
  // five places in a whole stage -- and it is tempting to write the real camera
  // there instead and let `$9B68` do the work. It is also wrong: `$9B88` uses
  // `$3F >> 1` to index the start-position table at `$9BD4`, whose domain is
  // exactly the five checkpoint values, so a larger `$24,X` reads off the end
  // of a ROM table for a position this hook is about to overwrite anyway.
  // Cheaper and safer to let the cartridge finish its own intro and then move
  // the camera and the ship, which is all this does.
  if (sim.respawnInPlace && d) {
    // `$9B68` has put the checkpoint into BOTH `$3F` and `$55`, so the
    // streamer's lead is 0; these two only have to keep agreeing with each
    // other at the 256 px boundary the intro always starts from.
    state.cam.hi = d.camHi;
    state.build.hi = d.camHi;
    state.cam.lo = 0; state.build.lo = 0; state.cam.sub = 0;
    // The ship, and the 24-entry Option rings `$A08C` walks. `$9B97`/`$9BAF`
    // wrote the table position into slots 0-2 and `$9BA0`/`$9BB8` filled both
    // rings from it; this is the same six stores with the death position.
    for (let i = 0; i < 3; i++) { state.obj.x[i] = d.x; state.obj.y[i] = d.y; }
    state.ring.x.fill(d.x);
    state.ring.y.fill(d.y);
  }

  // ---- 2. the kit ---------------------------------------------------------
  // `grantEveryIntro` is Full Kit's and `stickyStart` is Muscle Memory's; with
  // neither, the picker is a STARTING kit and lands on the first intro only,
  // because that is what "what you start with" means.
  if (sim.grantEveryIntro || sim.stickyStart || rt.firstIntro) applyKit(state, zp);

  // ---- 3. the blink -------------------------------------------------------
  if (sim.invulnFrames > 0) rt.invuln = sim.invulnFrames;

  rt.firstIntro = false;
  rt.death = null;
}

/**
 * `$97F1`, at the top -- THE RUN IS OVER.
 *
 * `rt.death` is captured at `$C1D6` and consumed at the tail of the NEXT
 * `$9B3E`, and until W43 that was written as if the next `$9B3E` were always
 * *this death's respawn*. It is, for an ordinary death: `$96EF`'s countdown
 * ends `JMP $979D` and `$979D` ends `JMP $9B3E`, 120 frames later, same run,
 * same stage. IT IS NOT, WHEN THE DEATH IS THE LAST LIFE. `$97F1` sets
 * `$1B := $C0` and never goes near `$9B3E`; the next one belongs to whatever
 * leaves the game-over screen, and two of the three exits are A DIFFERENT GAME:
 *
 *   `$970D`  CONTINUE   -> `$82D5` (a new game: `$19`, `$24,X` and `$26,X` all
 *                         wiped) -> mode 4 -> mode 5 with `$1B = 0` -> `$9B3E`
 *   `$9751`  timeout    -> `$9B3E` and then mode 0
 *   `$9721`  the cheat  -> `$97DD` -> `$9B3E`, and `$9730` has just written
 *                         `$24,X := 0` precisely so the player restarts at the
 *                         START of the stage
 *
 * OWNER-REPORTED, AND REPRODUCED FRAME FOR FRAME (docs/worklog/gradius/43): die
 * at the STAGE 2 boss (`$3F` = `$0D`) on the last life, press START on the
 * game-over screen, and the brand-new stage-1 game that comes back has its
 * camera AND its terrain build cursor teleported to page `$0D`. `$9A4D`
 * compares `$3F` against stage 1's boss page `$0C` on the very first play
 * frame, so the run enters `$81`/`$82` immediately: the streamer is frozen by
 * `$99E9`'s `INC $5B`, stage 1's `pageOrder[13]` is the shared empty starfield,
 * and `$A2F7`'s `CMP #$82` hands the spawn engine to `jt_$C439[0]` -- the
 * VOLCANO. Erupting rocks over black space, then the stage-1 boss, then
 * `$96CF INC $19` and stage 2 begins.
 *
 * So: when the run ends there is nothing to come back to, and the death
 * position dies with it. One line, at the one instruction that means "this game
 * is over".
 */
export function modAbandonRun(state) {
  const m = state.mods;
  if (!m) return;
  m.rt.death = null;
  // W44: `rt.invuln` is the OTHER run-scoped field, and it is dropped here for
  // the same reason -- not because a leak was measured (it counts itself down
  // in modFrameEnd and the game-over screen is ~400 frames, so it always
  // reached 0 on its own) but so that "the run is over" clears EVERY run-scoped
  // byte in one place. A field whose lifetime depends on a countdown outlasting
  // a screen is exactly the shape W43 spent a wave on.
  m.rt.invuln = 0;
}

/**
 * The six power-up bytes, written through the port's own fields so that every
 * downstream reader -- `$9C45`'s rank, `$8A22`'s meter cell, `$A108`'s firing
 * loop, `$8B6B`'s force field -- sees exactly what a collected capsule would
 * have left. Nothing here bypasses the game's logic; it sets the game's own
 * variables and lets the game read them.
 *
 * `$45` IS CLAMPED TO 2 AND THAT IS NOT TIMIDITY. `$89D5 CMP #$02 / BCS` is the
 * only bound in the cartridge, but `$A108 LDX $45 ... DEX / BPL` walks OBJECT
 * SLOTS 0..$45 and slots 3-5 are the SHOT slots (src/state.js SLOTS map), so
 * `$45 = 3` fires the player's weapon out of a shot slot and `$A0C8` animates
 * over it. src/weapons.js already asserts the range. "Infinite Options" is not
 * a mod this cartridge can have without inventing object slots, which would be
 * a parallel system and a lie -- see the worklog.
 */
function applyKit(state, zp) {
  const z = state.zp;
  if (0x40 in zp) z.speed = zp[0x40] & 0xFF;
  if (0x41 in zp) z.missile = zp[0x41] & 0xFF;
  if (0x42 in zp) z.meter = Math.min(zp[0x42] & 0xFF, 6);     // jt_8989 has 7 entries
  if (0x44 in zp) z.weapon = Math.min(zp[0x44] & 0xFF, 2);    // $A0E0 has 3 entries
  if (0x45 in zp) z.options = Math.min(zp[0x45] & 0xFF, 2);   // see above
  if (0x46 in zp) z.shield = zp[0x46] & 0xFF;
}

/**
 * `$C1D6`, at the top. Returns true to REFUSE the death.
 *
 * THE CARTRIDGE HAS NO PLAYER INVULNERABILITY. Grepped and read: the two
 * `BPL`s at `$C011` and `$C055` that look like one are bit 7 of `$030C,X` --
 * the ENEMY's spawn-frame guard -- and the player's only defence anywhere in
 * the PRG is `$46`, the shield, which `$C2A5`'s terrain probe does not consult
 * at all. So this window is BUILT, not ported, and it is built at the single
 * place all four death routes converge on ($C101's contact, $C247's bullet,
 * $C290's arm segment and $C2C1's terrain) rather than at the four sweeps, so
 * there is exactly one thing to reason about and it cannot be half-applied.
 *
 * It is also where the death POSITION is captured, because `$979D` does not run
 * for another 120 frames and `$9B3E` clears `$0360`/`$0320` before it is asked.
 */
export function modRefuseDeath(state) {
  const m = state.mods;
  if (!m || notPlaying(state)) return false;
  if (m.lo.sim.immortal) return true;
  if (m.rt.invuln > 0) return true;
  if (m.lo.sim.respawnInPlace) {
    m.rt.death = { x: state.obj.x[0], y: state.obj.y[0], camHi: state.cam.hi };
  }
  return false;
}

/**
 * `$80A7`, immediately before `JSR $8B10`. Returns the saved `$0120` when the
 * ship must not be drawn this frame, or -1.
 *
 * THE BLINK IS THE GAME'S OWN "not drawn" ENCODING, not a renderer trick:
 * `$8B10`'s walk draws object 0 only when `$0120` is non-zero (src/oam.js, and
 * `$82A1` relies on the same thing to park the menu cursor). Two frames on, two
 * off. It is restored the instant the list is built, so nothing downstream --
 * `$A0BE`'s tilt latch above all -- ever sees the zero.
 */
export function modHidePlayer(state) {
  const m = state.mods;
  if (!m || notPlaying(state) || m.rt.invuln <= 0) return -1;
  if ((m.rt.invuln & 0x02) === 0) return -1;
  const saved = state.obj.anim[0];
  state.obj.anim[0] = 0;
  return saved;
}

/** Undo modHidePlayer(). */
export function modShowPlayer(state, saved) {
  if (saved >= 0) state.obj.anim[0] = saved;
}

/** `$9A6D JSR $ADAB` -- true means skip the enemy update loop entirely. */
export function modFreezeEnemies(state) {
  return !!(state.mods && !notPlaying(state) && state.mods.lo.sim.freezeEnemies);
}

/**
 * `$80B5`, after the frame lock drops. Everything here writes bytes the NEXT
 * frame reads, which is why it is at the end and not the beginning.
 *
 *   RANK      `$9C45` recomputes `$17` from scratch at `$9AC4` every mode-5
 *             tail, so a lock has to be re-applied per frame. There is nowhere
 *             else to put it: the byte has no accumulator to poison.
 *   OVERTIME  `$040C,X` is the per-enemy fire countdown `$BBFD` subtracts from.
 *             `$BC0F` LEAVES the loop as soon as one enemy borrows, so at most
 *             one enemy can fire per frame however low the counters are -- this
 *             zeroes ONE slot per frame, rotating, which is the maximum rate
 *             the cartridge's own loop shape allows.
 *             (`$98`, which the plan named, is the per-frame SUBTRACT, not the
 *             countdown, and three other routines reuse it as scratch inside
 *             the same frame -- poking it does nothing. See the worklog.)
 */
export function modFrameEnd(state) {
  const m = state.mods;
  if (!m || notPlaying(state)) return;
  const sim = m.lo.sim;
  if (sim.rankLock !== null) state.zp17 = sim.rankLock & 0xFF;
  if (m.rt.invuln > 0) m.rt.invuln--;
  if (sim.overtime) {
    const slot = state.frame % 10;                 // $BBEE walks X = 9..0
    const i = slot + 0x0C;                         // ENEMY_BASE
    if ((state.obj.type[i] & 0x7F) >= 3) state.obj.style[i] = 0;
  }
}

/**
 * The host's input word, before nmi() is handed it. Mirror and Down Under swap
 * the two bits that make them playable; `$0007`'s layout is RIGHT $01 LEFT $02
 * DOWN $04 UP $08 (src/state.js BTN, measured by A/B RAM diff).
 */
export function modInput(state, word) {
  const m = state.mods;
  if (!m) return word;
  let w = word;
  if (m.lo.sim.swapLR) {
    const lr = w & 0x03;
    w = (w & ~0x03) | (lr === 1 ? 2 : lr === 2 ? 1 : 0);
  }
  if (m.lo.sim.swapUD) {
    const ud = w & 0x0C;
    w = (w & ~0x0C) | (ud === 4 ? 8 : ud === 8 ? 4 : 0);
  }
  return w;
}

// ---------------------------------------------------------------------------
//  The render layer.  Nothing below this line can reach the simulation.
// ---------------------------------------------------------------------------

/**
 * The `breaks` set src/render/ppu.js already takes.
 *
 * **`sprlimit` IS NOT NEW CODE.** `renderFrame`'s `const sprLimit =
 * breaks.has('sprlimit') ? 64 : 8` has been in the renderer since the hardware
 * rules were written, as one of the deliberate corruptions the gate uses to
 * prove the comparison can go red. "Always on enemies" is that switch, held
 * down. With the mod off the set is empty and `renderFrame` is called with its
 * default argument, so `rendergate` -- which proves the renderer rebuilds the
 * cartridge pixel-exactly -- runs the identical code it always has.
 *
 * The 8-per-scanline cap is a PPU rule, so lifting it changes pixels BY DESIGN,
 * and that is the whole point: what vanishes on real hardware is what the mod
 * brings back. What it does NOT touch is the game's own rotation of the display
 * list -- `$8B39`'s `ADC #$44`, which moves everybody 17 OAM slots a frame so a
 * different eight survive (src/oam.js rotateBase). That rotation is the
 * cartridge deliberately sharing the hardware's drops around, and with the cap
 * lifted it is simply harmless: everything draws whatever order it is in.
 * Deliberate blinks -- this file's own respawn flicker, and anything the game
 * chooses to stop drawing by zeroing `$0120` -- are simulation-side and keep
 * blinking exactly as before.
 */
export function modRenderBreaks(state) {
  const m = state.mods;
  if (!m || m.lo.render.sprLimit <= 8) return undefined;
  return new Set(['sprlimit']);
}

/**
 * Disco Vipers, and the ONLY palette effect that has to happen before the
 * renderer runs (the rest are pixel transforms). `state.vram.pal` is never
 * written -- the rotation is done into a scratch copy that lives in `rt`.
 */
export function modPalette(state) {
  const m = state.mods;
  if (!m || !m.lo.render.disco) return null;
  const src = state.vram.pal;
  let dst = m.rt.discoPal;
  if (!dst || dst.length !== src.length) dst = m.rt.discoPal = new Uint8Array(src.length);
  // Rotate the HUE nibble only. The NES master palette is 4 rows of 16 hues, so
  // adding to the low nibble keeps every colour at its own brightness -- which
  // is what stops the picture dissolving into black and white confetti.
  const k = (state.frame >> 2) & 0x0F;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    dst[i] = (c & 0x30) | ((c + k) & 0x0F);
  }
  return dst;
}

const DMG = [0xFF0FBC9B, 0xFF0FAC8B, 0xFF306230, 0xFF0F380F];  // ABGR, darkest last

/**
 * Everything that is a pure function of the finished framebuffer.
 *
 * @param {Uint32Array} px  W*H, ABGR, mutated in place
 */
export function modPostRender(state, px, w, h) {
  const m = state.mods;
  if (!m) return;
  const r = m.lo.render;

  if (r.hitbox) drawHitboxes(state, px, w, h);

  if (r.invert) {
    for (let i = 0; i < px.length; i++) px[i] = (px[i] & 0xFF000000) | (~px[i] & 0x00FFFFFF);
  }

  if (r.dmg) {
    for (let i = 0; i < px.length; i++) {
      const c = px[i];
      // Rec.601 luma on the ABGR word, then four buckets. The DMG had four
      // shades and no more, and rounding to the nearest of four is the whole
      // reason a Game Boy screen looks like a Game Boy screen.
      const y = (((c & 0xFF) * 77) + (((c >> 8) & 0xFF) * 150) + (((c >> 16) & 0xFF) * 29)) >> 8;
      px[i] = DMG[3 - (y >> 6)];
    }
  }

  if (r.ghost) {
    let g = m.rt.ghost;
    if (!g || g.length !== px.length) g = m.rt.ghost = new Uint32Array(px);
    for (let i = 0; i < px.length; i++) {
      const a = px[i], b = g[i];
      // Per-channel mean of this frame and the smeared history. Masking before
      // the shift keeps the channels from bleeding into each other.
      px[i] = 0xFF000000
        | ((((a & 0x00FF0000) + (b & 0x00FF0000)) >> 1) & 0x00FF0000)
        | ((((a & 0x0000FF00) + (b & 0x0000FF00)) >> 1) & 0x0000FF00)
        | ((((a & 0x000000FF) + (b & 0x000000FF)) >> 1) & 0x000000FF);
      g[i] = px[i];
    }
  }

  if (r.mirror) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0, e = w - 1; x < e; x++, e--) {
        const t = px[o + x]; px[o + x] = px[o + e]; px[o + e] = t;
      }
    }
  }

  if (r.flipY) {
    for (let y = 0, e = h - 1; y < e; y++, e--) {
      for (let x = 0; x < w; x++) {
        const t = px[y * w + x]; px[y * w + x] = px[e * w + x]; px[e * w + x] = t;
      }
    }
  }
}

const HB_PLAYER = 0xFF00FF00, HB_ENEMY = 0xFF0000FF, HB_BULLET = 0xFF00FFFF;

/**
 * The COORDINATES, not invented boxes.
 *
 *  * the player: `$0360`/`$0320`, which is the pair `$C2BC` hands the terrain
 *    probe verbatim -- the single pixel that decides whether you hit a wall.
 *  * enemies 12-21 and enemy bullets 22-31: `$036C,X`/`$032C,X` and
 *    `$0376,X`/`$0336,X`, the same bytes `$C101` and `$C20A` compare.
 *
 * A rectangle would need widths, and the widths in this game are per-type
 * tables with an unsigned-wrap idiom (`$C12C`) that makes them one-sided. So
 * this draws crosses at the compared points and leaves the boxes to whoever
 * measures them.
 */
function drawHitboxes(state, px, w, h) {
  const o = state.obj;
  const put = (x, y, c) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    px[y * w + x] = c;
  };
  const cross = (x, y, c) => {
    for (let d = -3; d <= 3; d++) { put(x + d, y, c); put(x, y + d, c); }
  };
  if (o.status[0] !== 0) cross(o.x[0], o.y[0], HB_PLAYER);
  for (let i = 12; i < 22; i++) if (o.type[i] !== 0) cross(o.x[i], o.y[i], HB_ENEMY);
  for (let i = 22; i < 32; i++) if (o.anim[i] !== 0) cross(o.x[i], o.y[i], HB_BULLET);
}

// ---------------------------------------------------------------------------
//  loadout <-> URL hash.  Same field names Batman uses, so the shared launcher
//  round-trips either game with one code path.
// ---------------------------------------------------------------------------

export function loadoutToHash(ids, level = 0) {
  const p = new URLSearchParams();
  if (ids.length) p.set('mods', ids.join('+'));
  if (level !== 0) p.set('level', String(level));
  return p.toString();
}

export function hashToLoadout(hash = '') {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  // '+' AND SPACE. `loadoutToHash` joins with '+', and a '+' in a query string
  // is an encoded space, so URLSearchParams hands this back already split by
  // spaces. Accepting both is what makes the hash actually round-trip.
  const ids = (p.get('mods') || '').split(/[+\s]+/).filter((s) => s && MODS[s]);
  // 0 is a real value: "start at the cartridge's own title screen".
  const raw = parseInt(p.get('level') ?? '0', 10);
  const level = Number.isNaN(raw) ? 0 : Math.min(7, Math.max(0, raw));
  return { ids, level };
}
