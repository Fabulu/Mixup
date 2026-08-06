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
// The call sites, all ten of them inside the simulation, so they can be
// counted (`grep -n 'state.mods' games/gradius/src/*.js`):
//
//   src/nmi.js       modFlyIn                  after $80A4's JSR $81BF  (W45)
//   src/nmi.js       modHidePlayer / modShowPlayer around $80A7's display list
//   src/nmi.js       modFreezeEnemies          around $9A6D's JSR $ADAB
//   src/nmi.js       modFrameEnd               after $80B5's `STA $04`
//   src/flow.js      modAfterIntroReset        at the tail of $9B3E
//   src/flow.js      modSaveLoadout            after $97BF, the last store of
//                                              $979D's own save block   (W45)
//   src/flow.js      modRespawnInPlace         at $97DB, INSTEAD of $97DD (W45)
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
// docs/worklog/gradius/45-impl-respawn-mods.md (44 has the first version).
// `tools/oracle/modscope.mjs` drives every mod, every preset and six
// compositions through a demo, a run, a RESPAWN, a game over and a continue and
// asserts it, because no oracle scenario can: `state.mods` is undefined on
// every one of them, by design and by the rule above.
//
// ======= THE THIRD RULE (W45): PORTED, OR DECLARED AN INVENTION =============
//
// **"GRADIUS SYNDROME" IS TWO STACKED MECHANICS AND THE ROM KEEPS THEM IN TWO
// DIFFERENT ROUTINES.** Checked before anything was written, because the wave
// brief said to doubt that they were separable at all:
//
//   THE CHECKPOINT ROLLBACK is `$97B1-$97BB` -- `LDA $3F / AND #$0E / CMP #$08 /
//   BCC / LDA #$08 / STA $24,X` -- read back by `$9B68 LDA $24,X / STA $3F /
//   STA $55`. Two instructions in `$979D` and one load in `$9B3E`.
//
//   THE LOADOUT WIPE is `$9B3E LDX #$5A / LDA #$00 / STA $3D,X`, 91 bytes, of
//   which `$40 $41 $44 $45 $46` are the capsule bytes; `$42` is separately
//   knocked down to 0-or-1 by `$97A5-$97AB` (`$22,X`) and restored by `$9B66`.
//
// They share no byte and no branch, so the two mods below can each take one
// without touching the other -- which is the whole point of the split:
//
//   heal-gradius-syndrome   NO ROLLBACK.   The wipe still happens.
//   hard-won                NO WIPE.       The rollback still happens.
//
// Both on is the full cure; either alone is playable. `respawnKit()` is the one
// function that decides what a respawn is owed, so neither can quietly do the
// other's job.
//
// WHAT THE CARTRIDGE PROVIDED, AND WHAT IS INVENTED. This file's rule is the
// port's: a deviation is named where it lives, never presented as ported.
//
//   PORTED, driven rather than re-implemented:
//     * the death itself, the life, the 120-frame countdown and the game-over
//       branch -- `$C1D6`, `$96EF`, `$979F`, `$97C1`. Untouched by both mods.
//     * the power-up wipe an in-place respawn performs: the same five stores
//       `$9B3E` makes, plus `$9B64/$9B66`'s `$42 := $22,X`.
//     * the ship's respawn Y and its target X: `$9B88-$9BB5`'s own formula
//       (`$9BD4[$9BCC[$19] + ($24,X >> 1)]`), read out of the ROM's own table.
//     * the SAVE-AND-RESTORE SHAPE hard-won uses: `$979D` already saves four
//       bytes across a death (`$22,X $24,X $26,X $28,X`) and `$9B62-$9B74`
//       already restores them. hard-won adds five more passengers to a coach
//       the cartridge drives; it does not build a coach.
//     * the AUTOPILOT CHANNEL the fly-in uses: `$9C88 STA $05 / STA $07`, the
//       attract demo's own scripted-button routine. The fly-in is `$0007` held
//       at RIGHT, so the ship moves through `$9FFC`'s own X code at the game's
//       own `$A006` speed. There is no parallel animation anywhere.
//
//   INVENTED, and there was no cartridge behaviour to port:
//     * THE FLY-IN ITSELF. Stock Gradius TELEPORTS the ship to `$9BD4`'s table
//       position and hands control over on the same frame; the PRG contains no
//       entry animation for the player at all. GREPPED AND READ before
//       concluding: the only writers of `$0360` are `$9BAF` (the intro's
//       teleport), `$A02E`/`$A040` (the player's own stick) and `$82A1` (the
//       menu cursor). `$9B3E`'s intro path has none. So the mod starts the ship
//       at X = 0 and holds RIGHT until it reaches the ROM's own start X.
//     * THE INVULNERABILITY WINDOW, which W41 already declared: the cartridge
//       has no player i-frames anywhere (see modRefuseDeath).
//     * hard-won's five extra save slots (`rt.savedKit`). The bytes are the
//       cartridge's; the storage is this file's.
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
    blurb: 'You explode, you lose a life, and a new Viper flies in from the '
         + 'left of the screen right where you fell. No checkpoint, no rewind, '
         + 'no third lap of terrain you already beat. It blinks for three '
         + 'seconds and nothing can touch it. The bar is still empty, because '
         + 'the wipe is the other mod.',
    category: 'combat',
    // NO ROLLBACK: `$97BB`'s min($3F AND $0E, 8) still lands in `$24,X` (the
    // cartridge writes it and this mod does not stop it) but `$9B68` never runs
    // to read it, because this respawn does not go through `$9B3E` AT ALL. See
    // modRespawnInPlace, and the THIRD RULE at the top of this file for which
    // half of it is ported and which half is invented.
    sim: { respawnInPlace: true, invulnFrames: 180 },
  },
  'hard-won': {
    name: 'Hard Won',
    blurb: 'Speed, missile, the laser or double, both Options and the shield '
         + 'all survive your death. The checkpoint still drags you back down '
         + 'the stage; you just do not arrive there naked.',
    category: 'combat',
    // The other half of Gradius syndrome, and the other routine. `$9B3E`'s
    // 91-byte wipe still runs; the six bytes are captured at `$979D` (beside
    // the four the cartridge already saves there) and written back at the tail
    // of `$9B3E`, where `$9B66` puts `$42` back. See modSaveLoadout.
    sim: { keepLoadout: true },
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
  // BOTH HALVES OF THE CURE, and nothing else. The two mods are separable on
  // purpose (see the THIRD RULE); this is the card for the player who wanted
  // the disease gone rather than half of it.
  'the-full-cure': {
    name: 'The Full Cure',
    mods: ['heal-gradius-syndrome', 'hard-won'],
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
    grantEveryIntro: false, stickyStart: false, keepLoadout: false,
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
      flyIn: 0,           // RUN     frames of forced RIGHT left in the fly-in.
                          //         A CAP, not the length: modFlyIn stops the
                          //         moment $0360 reaches flyInTo (W45)
      flyInTo: 0,         // RUN     the X the fly-in is aiming at -- $9BD4's
                          //         own byte for this stage and checkpoint
      savedKit: null,     // DEATH   Hard Won's six power-up bytes, captured at
                          //         $979D, consumed by the next $9B3E, dropped
                          //         at $97F1 (W43's lifetime) and $82D5 (W44's)
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
  m.rt.savedKit = null;
  m.rt.invuln = 0;
  m.rt.flyIn = 0;
  m.rt.flyInTo = 0;
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
 * for all 32 loadouts it drives.
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
 * Two things: the kit the loadout is owed, and the blink.
 *
 * **HEAL GRADIUS SYNDROME NO LONGER APPEARS HERE AND THAT IS THE WHOLE OF W45.**
 * Until W45 this hook restored a captured camera page and ship position into the
 * TAIL OF A STAGE INTRO -- a position replay bolted onto `$9B3E`, which meant
 * the player still watched the 27-frame blanked intro, still had the screen
 * reloaded by `$882C` and still had the terrain restreamed from a page boundary.
 * That is the "put you back at some scene" the owner reported, and it is also
 * the shape that leaked across a game over in W43. The mechanism is gone, not
 * tuned: a death respawn under this mod never reaches `$9B3E` at all. See
 * modRespawnInPlace.
 *
 * `$9B3E` still runs for the things it is actually for -- the run's first
 * intro, `$96CF`'s next stage, `$9721`'s continue cheat (which writes
 * `$24,X := 0` at `$9730` precisely so the player restarts at the START of the
 * stage) and `$9751`'s timeout. The blink is armed on all of them, because
 * every one of them is a moment the player is put somewhere and shot at.
 */
export function modAfterIntroReset(state) {
  const m = state.mods;
  if (!m || notPlaying(state)) return;
  const rt = m.rt;

  const kit = respawnKit(state);
  if (kit) applyKit(state, kit);

  if (m.lo.sim.invulnFrames > 0) rt.invuln = m.lo.sim.invulnFrames;

  rt.firstIntro = false;
  rt.savedKit = null;
  // The fly-in belongs to modRespawnInPlace and to nothing else. An intro
  // teleports the ship to `$9BD4`'s position with the stick in the player's
  // hands, exactly as the cartridge does; dropping the counter here means a
  // stage change during a fly-in cannot leave the autopilot holding RIGHT.
  rt.flyIn = 0;
}

/**
 * WHICH KIT A RESPAWN IS OWED. **ONE FUNCTION, BECAUSE FOUR MODS ANSWER IT AND
 * TWO CALL SITES ASK IT** -- the tail of `$9B3E` and the in-place respawn. If
 * the two disagreed, `heal-gradius-syndrome` would silently do (or fail to do)
 * `hard-won`'s job, which is exactly what the split exists to prevent.
 *
 * Precedence, highest first, and it is a LADDER rather than a merge so that
 * every combination has one answer:
 *
 *   full-power    `grantEveryIntro`  the whole bar, every single time. Its own
 *                 blurb promises "Re-granted on every single respawn", and it
 *                 is the one mod whose entire point is that it wins.
 *   hard-won      `keepLoadout`      what you were holding when you died. Only
 *                 when there IS a capture: the run's first intro has none, so
 *                 hard-won falls through to the picker there, which is right.
 *   muscle-memory `stickyStart`      what you STARTED the run with.
 *   (none)        `rt.firstIntro`    the picker, once, on this run's first
 *                 intro -- because that is what "what you start with" means.
 *
 * `full-power` + `hard-won` therefore gives the full bar (full-power wins), and
 * `hard-won` + `muscle-memory` gives what you died holding, never less than
 * nothing and never a merge of two different bars. `resolveLoadout` reports no
 * `conflicts` entry for these because they are three DIFFERENT sim keys; the
 * ordering is the contract and tests/mods.test.js walks the whole matrix.
 *
 * @returns an object keyed by zero-page address, or null for "write nothing".
 */
function respawnKit(state) {
  const m = state.mods;
  const { sim, zp } = m.lo;
  const rt = m.rt;
  if (sim.grantEveryIntro) return zp;                 // full-power
  if (sim.keepLoadout && rt.savedKit) return rt.savedKit;  // hard-won
  if (sim.stickyStart || rt.firstIntro) return zp;    // muscle-memory / the picker
  return null;
}

/**
 * `$979D`, immediately after `$97BF STA $28,X` -- the last store of the
 * cartridge's own per-death save block, and BEFORE `$97C1 BMI $97F1`.
 *
 * **THIS IS THE ROM'S OWN CHANNEL WITH FIVE MORE PASSENGERS.** `$979D` already
 * carries four bytes across a death and `$9B62-$9B74` already hands them back:
 *
 *   $97A5-$97AB  $22,X := ($42 ? 1 : 0)   ->  $9B64/$9B66  $42 := $22,X
 *   $97B1-$97BB  $24,X := min($3F&$0E,8)  ->  $9B68        $3F := $55 := $24,X
 *   $97AD        $26,X := $19             ->  $9B6E        $19 := $26,X
 *   $97BD        $28,X := $1A             ->  $9B72        $1A := $28,X
 *
 * So the cartridge's own answer to "what survives a death" is a list, and Hard
 * Won lengthens it. `$42` is on the ROM's list already but DEGRADED -- `$97A5`
 * stores 0 or 1, never the cursor's real value -- so it is captured here in
 * full and restored in full, which is why a Hard Won run comes back with the
 * bar still parked where the player left it.
 *
 * IT IS DELIBERATELY BEFORE THE GAME-OVER BRANCH. The last life captures too,
 * and `$97F1` then drops it (modAbandonRun). That is W43's lifetime, kept on
 * purpose: a capture that only happened on survivable deaths would be a second
 * shape to reason about, and the whole lesson of W43 is that the shape with
 * fewer cases is the one that does not leak.
 */
export function modSaveLoadout(state) {
  const m = state.mods;
  if (!m || notPlaying(state) || !m.lo.sim.keepLoadout) return;
  const z = state.zp;
  m.rt.savedKit = {
    0x40: z.speed, 0x41: z.missile, 0x42: z.meter,
    0x44: z.weapon, 0x45: z.options, 0x46: z.shield,
  };
}

/**
 * `$10` -- WHERE THE NEW SHIP COMES IN FROM. **THE FLY-IN IS INVENTED. THIS
 * NUMBER IS NOT, AND IT IS NOT 0, BECAUSE THE PORT PROVED 0 ILLEGAL.**
 *
 * Established before it was written rather than assumed: the only writers of
 * `$0360` in the whole PRG are `$9BAF` (the intro's teleport), `$A02E`/`$A040`
 * (the player's own stick, through `$A285`/`$A297`) and `$82A1` (the menu
 * cursor). `$9B3E`'s intro path teleports and hands control over on the same
 * frame; there is no entry animation for the player in Gradius. The owner asked
 * for one ("go ham"), so it is built, and it is named as built.
 *
 * IT WAS 0 FOR ONE DRAFT AND `tools/oracle/modscope.mjs` THREW ON IT, on seven
 * of the thirty-two loadouts, on the first frame after the first respawn:
 *
 *   $C3AD: $0360 = 0, so `LDA $0360 / BNE $C3D3` falls through into $C3AF
 *   (the SHOT probe) with X whatever the caller left. The player X clamp is
 *   [16, 240] ($A03A), so this is unreachable on the cartridge too.
 *
 * That throw is src/collision.js refusing to guess, and it is right: `$C3A5`'s
 * terrain probe uses a non-zero `$0360` as its own "this is the PLAYER" test,
 * so X = 0 is not a position this game has. `$10` is `$A03A`'s own LEFT clamp
 * -- the leftmost pixel the Vic Viper is ever allowed to occupy -- so the new
 * ship enters AT the wall and flies in from there. Nothing clamps X on the way
 * RIGHT (`$A028` only caps at `$F0`), so the rest is the cartridge's own X code
 * with the stick held.
 *
 * Exported because modscope.mjs asserts the entry position, and the same
 * literal in two files is how a check stops checking.
 */
export const FLY_IN_X = 0x10;

/**
 * A HARD BOUND ON THE AUTOPILOT, in frames. The fly-in normally ends because
 * `$0360` reached its target; this is what stops `rt.flyIn` from being a flag
 * with no lifetime if it ever does not. At `$40 = 0` the ship moves exactly
 * 1.00 px a frame (`$A006`'s `min($40+2, $10) * 128`), so 80 px of fly-in is 80
 * frames and 240 is three times the slowest case there is.
 */
const FLY_IN_CAP = 240;

/**
 * `$9B88-$9BB5`'s OWN START POSITION, read out of the ROM's own tables.
 *
 *   9B88  A4 19 / A5 3F / 4A / 18 / 79 CC 9B / A8    Y := $9BCC[$19] + $3F/2
 *   9B92  B9 D4 9B / 29 F0                           py := $9BD4[Y] AND $F0
 *   9BA8  B9 D4 9B / ASL x4                          px := $9BD4[Y] << 4
 *
 * ONE table byte carries both coordinates. The port's `introReset()` passes
 * `$3F` because `$9B68` has just loaded it from `$24,X`; here `$3F` is the LIVE
 * camera (the whole point of the mod) so the CHECKPOINT is passed instead --
 * the byte `$97BB` wrote one instruction ago. That keeps the index inside
 * `$9BD4`'s five-entry-per-stage domain, which a live camera page would walk
 * straight out of.
 */
function romStartPos(res, stage, checkpoint) {
  const flow = res.flowTables;
  const y = (flow.read(0x9BCC + stage) + (checkpoint >> 1)) & 0xFF;   // $9B88-$9B90
  const packed = flow.read(0x9BD4 + y);                               // $9B92
  return { y: packed & 0xF0, x: (packed << 4) & 0xFF };               // $9B95 / $9BAB
}

/**
 * `$97DB`, in place of `$97DD` -- THE IN-PLACE RESPAWN. Returns true when it
 * handled the respawn, in which case `$97DD` and `$9B3E` DO NOT RUN.
 *
 * The owner's words: *"ship explodes, lose a life, new ship comes flying in
 * from the left screen. It is blinking and invulnerable."*
 *
 * WHAT STILL RUNS, UNCHANGED, BECAUSE THE CARTRIDGE ALREADY DOES IT:
 *   $C1D6   the explosion, the `$F7` sound, `$0100 := 2`, `$4C := 120`
 *   $96EF   the 120-frame countdown, with the mode-5 body running under it, so
 *           the camera keeps scrolling and the wave keeps flying past the wreck
 *   $979F   `DEC $20,X` -- a life, at full price
 *   $97A5.. the whole save block, including `$97BB`'s checkpoint. It is written
 *           and simply never read: `$9B68` is the only reader and `$9B68` does
 *           not run. Suppressing the STORE instead would be a second deviation
 *           for no gain, and it would break `$9721`'s cheat, which restarts a
 *           stage through `$97DD` and needs `$24,X` to mean something.
 *   $97C1   the game-over branch. The last life is still the last life.
 *
 * WHAT THIS DOES INSTEAD OF `$97DD` -> `$9B3E`, in the ROM's own stores:
 *   1. the POWER-UP WIPE ONLY. `$9B3E`'s 91-byte clear covers the camera, the
 *      terrain cursor, the whole spawn-engine zero page and the six power-up
 *      bytes; this takes the six and leaves the other 85 alone, which is what
 *      "you come back where you fell" IS. `$42` comes back from `$22,X` exactly
 *      as `$9B64/$9B66` does.
 *      `$35 := $14` ($9B5E, the autofire reload) goes with them.
 *   2. the kit the loadout is owed (respawnKit -- so `hard-won` composes)
 *   3. `$9B47`'s OBJECT CLEAR OVER SLOTS 0-11 ONLY, i.e. the ship, both
 *      Options, both shot chains and the three missiles, and NOT the ten enemy
 *      slots the cartridge's version also takes. Measured, not assumed: without
 *      it a respawn with `$45 = 0` still had `$0121`/`$0122` set and drew two
 *      ghost Options for the rest of the run.
 *   4. the ship: `$0100 := 1` ($9BC0), `$0120 := 1` ($9B83), slots 0-2 and both
 *      24-entry rings ($9B97-$9BBE) -- the same six stores the intro makes, at
 *      the fly-in's entry position
 *   5. `$1B := $80` and `$60 := 1`, which is `$9C3C` verbatim: it is the one
 *      routine in the PRG whose meaning is "the intro is over, play". `$60`
 *      matters because `$C1DC` zeroes it on a death taken at `$1B >= $81`.
 *   6. the blink, and the fly-in
 *
 * WHAT IT DELIBERATELY DOES NOT DO, each for a reason:
 *   `$97DF STA $39` / `$97E1 STA $3A`  the warp flag and the build gate. A
 *       player who earned `$AF7E`'s warp keeps it; clearing them would cancel a
 *       warp mid-route, which is the opposite of carrying on where you were.
 *   `$97EB JSR $9C09`  `$57` is the streamer's "far enough ahead" flag and `$5E`
 *       the despawn cursor. Both belong to a terrain stream that is still
 *       running; re-seeding them would stall or double-emit it.
 *   `$9B78 JSR $882C`  the full-screen load, and `$9BC9`'s stop-all-sound. This
 *       respawn shows no intro, so it blanks nothing and silences nothing. The
 *       music is whatever `$C1F5`'s explosion left, exactly as during the 120
 *       dying frames, and `$9A4D`'s own per-frame `JSR $8357` is untouched.
 *   `$0500-$06FF`  the collision map and the arm pool. They belong to enemies
 *       that are still on screen.
 */
export function modRespawnInPlace(state, res) {
  const m = state.mods;
  if (!m || notPlaying(state) || !m.lo.sim.respawnInPlace) return false;
  const p = state.zp.player === 1 ? 1 : 0;
  const z = state.zp;

  // ---- 1. the power-up wipe, and ONLY the power-up wipe --------------------
  z.speed = 0;                                      // $40 \
  z.missile = 0;                                    // $41  |  inside $9B3E's
  z.weapon = 0;                                     // $44  |  LDX #$5A wipe
  z.options = 0;                                    // $45  |
  z.shield = 0;                                     // $46 /
  z.meter = state.save22[p];                        // $9B64/$9B66  $42 := $22,X
  z.autofire = 0x14;                                // $9B5E LDA #$14 / STA $35

  // ---- 2. the kit the loadout is owed -------------------------------------
  const kit = respawnKit(state);
  if (kit) applyKit(state, kit);
  m.rt.firstIntro = false;
  m.rt.savedKit = null;

  // ---- 3. `$9B47`'s OBJECT CLEAR, RESTRICTED TO THE PLAYER'S OWN SLOTS ----
  //
  // `$9B47` walks X = $7F..0 over `$0100` and `$0300`, i.e. ALL 32 slots -- the
  // enemies too, which is exactly what an in-place respawn must not do. Slots
  // 0-11 are the player's and nobody else's (src/state.js, src/weapons.js:
  // 0 ship, 1-2 Options, 3-5 shot A, 6-8 shot B, 9-11 missiles; ENEMY_BASE is
  // $0C), so this is the same six stores over the first twelve indices.
  //
  // **IT IS NOT COSMETIC AND IT WAS MEASURED.** The first draft seeded the ship
  // and left the rest, and with two Options collected the respawn came back
  // with `$45 = 0` but `$0121 = 4` and `$0122 = 5` still set -- and `$8B10`
  // draws object i whenever `$0120+i` is non-zero, while `$A0C8`'s animation
  // loop (`LDX $45 / DEX / BPL`) writes nothing at all at `$45 = 0`. Two ghost
  // Options, stuck on the new ship, for the rest of the run. Shots and missiles
  // in flight go the same way, because the ROM's own wipe takes them and they
  // belong to the ship that fired them.
  const PLAYER_SLOTS = 12;                          // ENEMY_BASE
  for (let i = 0; i < PLAYER_SLOTS; i++) {
    state.obj.status[i] = 0; state.obj.anim[i] = 0;         // $0100 / $0120
    state.obj.timer[i] = 0; state.obj.animFrame[i] = 0;     // $0140 / $0160
    state.obj.type[i] = 0;                                  // $0300
    state.obj.y[i] = 0; state.obj.yf[i] = 0;                // $0320 / $0340
    state.obj.x[i] = 0;                                     // $0360
  }
  // `$0180` (attrMask) and `$0380` (xf) SURVIVE on the cartridge too -- `$9B47`
  // is `LDX #$7F`, 128 bytes, so it stops one byte short of both. The port says
  // so at introReset(); the same two are left alone here. `$03A0` (carrier, the
  // autofire reload) is past `$037F` and survives for the same reason.
  state.ring.cursor = 0;                            // $0160, aliased

  // ---- 4. the ship, at the fly-in's entry position ------------------------
  const home = romStartPos(res, state.zp19, state.save24[p]);
  const px = FLY_IN_X, py = home.y;
  state.obj.status[0] = 1;                          // $9BC0/$9BC2 STA $0100
  state.obj.anim[0] = 1;                            // $9B83/$9B85 STA $0120
  for (let i = 0; i < 3; i++) { state.obj.x[i] = px; state.obj.y[i] = py; }
  state.ring.x.fill(px);                            // $9BB8-$9BBE
  state.ring.y.fill(py);                            // $9BA0-$9BA6

  // ---- 5. play, this frame ------------------------------------------------
  state.spawn.z60 = 1;                              // $9C3C/$9C3E STA $60
  state.substate = 0x80;                            // $9C40/$9C42 STA $1B

  // ---- 6. the blink, and the fly-in ---------------------------------------
  if (m.lo.sim.invulnFrames > 0) m.rt.invuln = m.lo.sim.invulnFrames;
  m.rt.flyIn = FLY_IN_CAP;
  m.rt.flyInTo = home.x;
  return true;
}

/**
 * `$80A4`, immediately after `JSR $81BF` -- THE FLY-IN, and it is `$9C88`.
 *
 *   9C88  B9 B5 9C  LDA $9CB5,Y
 *   9C8B  85 05     STA $05          <- the EDGE byte
 *   9C8D  85 07     STA $07          <- the HELD byte
 *
 * That is the attract demo's scripted-button routine, and it is the cartridge's
 * own answer to "drive the ship without a player". The fly-in writes the same
 * two bytes with `$01` (RIGHT -- src/state.js BTN), so the new Viper crosses the
 * screen through `$A021`'s own `AND #$01` arm, at `$A006`'s own speed, with
 * `$A082`'s ring advancing and the Options trailing it. NOTHING ANIMATES THE
 * SHIP; the ship flies.
 *
 * Writing `$05` as well as `$07` is `$9C88`'s own pairing and it is what makes
 * the autopilot a clean hand-over: `$05` is normally `now & ~prev`, so the
 * frame the fly-in ENDS produces the player's real edge again.
 *
 * The A and B bits are 0 for the duration, so the ship does not fire and
 * `$897F`'s power-meter arm cannot be spent by the autopilot.
 */
export function modFlyIn(state) {
  const m = state.mods;
  if (!m || notPlaying(state) || m.rt.flyIn <= 0) return;
  // Arrived, or died again inside the window: the autopilot lets go. The X test
  // is what normally ends it; `rt.flyIn` is only the bound (see FLY_IN_CAP).
  if (state.obj.status[0] !== 1 || state.obj.x[0] >= m.rt.flyInTo) {
    m.rt.flyIn = 0;
    return;
  }
  state.input.pressed = 0x01;                       // $9C8B STA $05
  state.input.held = 0x01;                          // $9C8D STA $07
}

/**
 * `$97F1`, at the top -- THE RUN IS OVER.
 *
 * `rt.savedKit` is captured at `$979D` and consumed at the tail of the NEXT
 * `$9B3E`, and until W43 the equivalent field was written as if the next
 * `$9B3E` were always *this death's respawn*. It is, for an ordinary death:
 * `$96EF`'s countdown
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
 * W45 REPLACED THE MECHANISM AND KEPT THE LESSON. `rt.death` is gone -- the
 * respawn no longer goes through `$9B3E` at all, so there is no position to
 * replay -- but `hard-won` puts a NEW capture on exactly the same wire, and it
 * is the same wire because a second lifetime would be a second thing to get
 * wrong. Without this line a player who game-overs with `hard-won` on and
 * presses CONTINUE starts a brand-new stage-1 game holding the dead run's bar.
 *
 * So: when the run ends there is nothing to come back to, and what the dead run
 * was carrying dies with it. Three lines, at the one instruction that means
 * "this game is over".
 */
export function modAbandonRun(state) {
  const m = state.mods;
  if (!m) return;
  m.rt.savedKit = null;
  // W44: `rt.invuln` is the OTHER run-scoped field, and it is dropped here for
  // the same reason -- not because a leak was measured (it counts itself down
  // in modFrameEnd and the game-over screen is ~400 frames, so it always
  // reached 0 on its own) but so that "the run is over" clears EVERY run-scoped
  // byte in one place. A field whose lifetime depends on a countdown outlasting
  // a screen is exactly the shape W43 spent a wave on.
  m.rt.invuln = 0;
  // W45, and the same argument: the autopilot is run-scoped. It cannot survive
  // on its own (`$97F1` is only reached with the ship dead, and modFlyIn drops
  // the counter the first frame it sees `$0100 != 1`) and it is dropped here so
  // that the inventory has no field whose lifetime is an argument.
  m.rt.flyIn = 0;
  m.rt.flyInTo = 0;
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
 * **IT USED TO CAPTURE THE DEATH POSITION HERE AND IT DOES NOT ANY MORE (W45).**
 * That capture existed only because the old Heal Gradius Syndrome replayed a
 * position into the tail of `$9B3E`, and `$9B3E` clears `$0360`/`$0320` before
 * anyone can ask. The mod's respawn no longer goes through `$9B3E`, so the ship
 * is simply never moved and there is nothing to remember. Two mods and one
 * window are all that is left here, which is the whole routine.
 */
export function modRefuseDeath(state) {
  const m = state.mods;
  if (!m || notPlaying(state)) return false;
  if (m.lo.sim.immortal) return true;
  if (m.rt.invuln > 0) return true;
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
 *   FLY-IN    the autopilot's HARD BOUND, not its length: modFlyIn normally
 *             ends it by arrival. Decremented here beside `rt.invuln` so that
 *             both run-scoped counters are spent in one place (W45).
 */
export function modFrameEnd(state) {
  const m = state.mods;
  if (!m || notPlaying(state)) return;
  const sim = m.lo.sim;
  if (sim.rankLock !== null) state.zp17 = sim.rankLock & 0xFF;
  if (m.rt.invuln > 0) m.rt.invuln--;
  if (m.rt.flyIn > 0) m.rt.flyIn--;
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
