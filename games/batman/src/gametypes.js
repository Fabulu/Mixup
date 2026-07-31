// The shape of the game's RAM, written down.
//
// THIS FILE HAS NO IMPORTS AND NO RUNTIME CONTENT ON PURPOSE.  Two reasons, and
// the first one is a measurement, not a preference:
//
// 1. `ReturnType<typeof createState>` DOES NOT WORK HERE.  src/state.js sits in
//    an eight-way import cycle -- it imports ten modules and eight of them
//    import back from it -- and TypeScript silently degrades the inferred return
//    type of a function in a cycle to `any`.  MEASURED: a probe file doing
//    `createState().TOTALLY_BOGUS_FIELD` produces no error at all.  So the state
//    tree has to be described by hand or it is not described.
// 2. A leaf can be imported by anything without joining that cycle, including by
//    the modules Phases 7-10 cut out of enemies.js, player.js and main.js.
//
// AND THE REAL DELIVERABLE IS THE INVENTORY BELOW, not the checking.  FIFTY-ONE
// fields in this tree are LAZY: nothing in createState() declares them,
// they appear when some later code first assigns them, and every reader defends
// with `??` or a truthiness test.  That is invisible in state.js -- you have to
// run the tree to find out -- and it is the document a second game forks.  It is
// also why state.js:173-176 had to write a paragraph of prose begging for
// `bossId` to be a required 0 rather than an absent undefined: camera.js tests
// it with `!== 0`, so an undefined silently takes the boss branch and pins the
// camera for any state not built by initLevel().
//
// MEASURED FOR THIS FILE, at the commit that added it, by scanning every
// `state.<key>` and `state.<parent>.<key>` in games/batman/src/ and diffing
// against what createState()'s object literal actually builds:
//
//   12 lazy TOP-LEVEL keys   copyright, deathTimer, ending, hitboxScale,
//                            loadout, options, roundSelect, stageIntro, subsys,
//                            tileAnim, title, titleManifest
//   39 lazy NESTED keys      flow: 4, level: 6, video: 11, tables: 17, player: 1
//
// THE FIRST VERSION OF THAT COUNT WAS WRONG, AND THE CHECKER IS WHAT CAUGHT IT.
// The scan matched `state.tables.X` and missed `state.tables?.X`, so it reported
// three lazy `tables` fields where there are seventeen.  Nothing noticed until
// GameState was bound to player/anim.js and tsc objected to `attackAnim` and
// `attackMsIndex` -- two fields selectAnim reads through `?.` and then THROWS on
// if absent, which is to say two fields whose absence is a real, handled,
// documented state that the inventory had silently dropped.  Re-run with `?.`
// on both links the number is 39.  If you re-measure this, match both spellings.
//
// The method's remaining blind spot: it is a TEXTUAL scan, so a field only ever
// reached through an alias (`const p = state.player; p.msIndex = ...`) is
// invisible to it.  Fields built by a sub-constructor -- createRope(),
// createEnemies(), createWater() and the six others state.js calls -- are NOT
// lazy and are not listed; the scan flags them and they were checked off by hand
// against each constructor.
//
// SEPARATELY, AND IT CAME BACK CLEAN: the same scan over tools/ found NO field
// that the oracle tooling sets and the application never does.  That was worth
// checking because it is docs/03 lesson 38's exact shape -- a harness that
// quietly maintains its own parallel state would make a typedef describing only
// src/ actively misleading.  There is no such field today.

/**
 * @typedef {Object} PlayerState
 * @property {number} x            $FF81/$FF82  12.4 fixed point
 * @property {number} y            $FF83/$FF84  12.4
 * @property {number} vx           $FF86  signed byte, subpx/frame
 * @property {number} vy           $FF87  signed byte, POSITIVE = UP (y -= vy)
 * @property {number} air          $FF80  0 grounded, 1 rising, 2 falling
 * @property {number} facing       $FF88  0 right, 1 left
 * @property {number} hp           $FF8A
 * @property {number} hpMax        $FF8E  a RUN-long value, not a level one
 * @property {number} iframes      $C714  bit7 = knockback direction
 * @property {number} action       $C71E  0 free, 1-3 bat-rope
 * @property {number} attackTimer  $FF97  1..15 ring; hit test fires on frame 8
 * @property {number} attackPose   $C71D  0 = punch, 1 = batarang/rope
 * @property {number} ropeLength   $C71F
 * @property {number} ropeSegments $FFB4
 * @property {number} anim         $FFC3
 * @property {number} animFrame    $FFC4  owned by the TILE STREAMER, read-only
 *                                 to the pose selector
 * @property {number} animPrev     $FFC5
 * @property {number} animTimer    $FF89
 * @property {number} prevVx       $FF91  loc_00_1B4A's private scratch
 * @property {number} crouching    $FF92  ditto; NOT cleared at level init
 * @property {number} turnTimer    $FF8F
 * @property {number} squatTimer   $FF90
 * @property {number} airThrottle  $FF98
 * @property {number} jumpReleased $FFC2  enables wall-jump
 * @property {number} clingLock    $FFB2  b0-4 countdown, b5-7 locked direction
 * @property {number} slowMode     $FF95  $80 in water
 * @property {number} attrMask     $FF96  $80 = draw behind BG
 * @property {number} springArmed  $C751
 * @property {number} dead         $C715
 * @property {number} halfW        $FF8C  re-read per animation from 0:$27A8
 * @property {number} halfH        $FF8D
 * @property {number} [msIndex]    $FF8B. LAZY -- createState does not declare
 *                                 it; the pose ladder assigns it on the first
 *                                 frame that draws. Reached through an alias
 *                                 everywhere, which is why a textual scan for
 *                                 `state.player.msIndex` finds nothing.
 */

/**
 * @typedef {Object} FlowState
 * @property {number} lives            $C767, seeded from the BOOT VECTOR
 * @property {number} difficulty       $C756
 * @property {number} ammo             $C759
 * @property {number} routeMask        $C753
 * @property {number} maxHpTaken       $C754, a run-long latch
 * @property {number} continueAvailable $FFB5
 * @property {boolean} paused          $C716
 * @property {number} bossMode         $C750
 * @property {number} bossRage         $C73D
 * @property {number} bossCrit         $C73F  (also the l14 entrance's cursor)
 * @property {number} bossHop          $C741  (also the l14 entrance's counter)
 * @property {number} parallaxTrack    $FFCA/$FFCB
 * @property {number} conveyorDir      $FFC9  1 right, 2 left
 * @property {number} parallaxScx      $FFCC
 * @property {number} balloonX         $FFBA-$FFBB, level $0E only
 * @property {number} balloonY         $FFBC-$FFBD
 * @property {number} rescueCheat      $C75C
 * @property {number}  [levelCleared]   LAZY. conveyor.js:137-139 explicitly
 *                                      demands it read FALSY when absent.
 * @property {number}  [nextLevel]      LAZY
 * @property {boolean} [respawnPending] LAZY; main.js polls it after the frame
 * @property {number}  [gameOver]       LAZY; counted, not a boolean
 */

/**
 * @typedef {Object} LevelState
 * @property {number} number        $FFB0, 1-based
 * @property {number} width         metatiles
 * @property {number} height        always 16
 * @property {Uint8Array|null} cells   the $D000 image, 2 B/cell, column-major
 * @property {Int16Array|null} metatiles  4 tile ids per metatile (TL,BL,TR,BR)
 * @property {number} bossId        $C73E. MUST default to 0 and not undefined --
 *                                  camera.js tests `!== 0`, so an absent value
 *                                  takes the boss branch and pins the camera.
 * @property {Uint8Array} [vram]    LAZY -- initLevel only
 * @property {any}  [tiles]         LAZY -- the decoded tile cache
 * @property {any}  [bgArt]         LAZY
 * @property {number} [exitRight]   LAZY
 * @property {number} [exitTop]     LAZY
 * @property {number} [subtype]     LAZY
 */

/**
 * @typedef {Object} VideoState
 * @property {number} scx           $FFA9
 * @property {number} scy           $FFAA
 * @property {number} bgp           $FF47 via $FFAB
 * @property {number} obp0          $FF48
 * @property {number} obp1          $FF49
 * @property {any[]}  sprites       replaces shadow OAM; drawn in PUSH ORDER,
 *                                  which is DMG sprite priority and the
 *                                  ten-per-line cut. See src/game/frame.js.
 * @property {number} windowY       $FFAC -> rWY
 * @property {number} windowLatchY  $C755
 * @property {number} windowX       $FFAB -> rWX; 7 means screen x 0
 * @property {number} windowTile
 * @property {number} frameParity   $FFA7 from the DRAW side. An ALIAS of
 *                                  state.parity via defineProperty, not a copy.
 * @property {any}    [bgMap]           LAZY
 * @property {any}    [windowMap]       LAZY
 * @property {number} [windowEndY]      LAZY
 * @property {boolean}[windowOn]        LAZY
 * @property {any}    [windowDither]    LAZY
 * @property {number} [playerScreenX]   LAZY -- $FF93, cached at $1B58
 * @property {number} [playerScreenY]   LAZY -- $FF94
 * @property {boolean}[invert]          LAZY, mods only
 * @property {number} [spriteScale]     LAZY, mods only
 * @property {any}    [batarangAnim]    LAZY, mods only
 * @property {any}    [paletteRotate]   LAZY, mods only
 *
 * The last four are the reason the OPTIONAL TAIL in the plan says to seed them
 * LAST and each with its own test: tools/oracle/regress.mjs contains no mods or
 * loadout reference at all, so the entire mod-render path is outside the
 * 14,519-frame corpus by construction.
 */

/**
 * @typedef {Object} TablesState
 * @property {number[]} slopeY      0:$221C
 * @property {number[]} slopeX
 * @property {number[]} sine        0:$09A2
 * @property {number[]} hudBar2
 * @property {number[]} scriptPtrs  0:$27E6
 * @property {number[]} scriptData
 * @property {number[]} scriptSteps
 * @property {number[]} enemyContactDamage
 * @property {number[]} levelDamageBonus
 * All seventeen of the following are LAZY: they arrive from the asset manifest
 * via initLevel, and a state built without it has none of them.  Every reader
 * reaches them through `?.` -- which is why a scan for `state.tables.X` found
 * only three of them and the checker found the rest.
 *
 * @property {any} [objectScripts]
 * @property {any} [enemyAnimBase]
 * @property {any} [batarangAnim]
 * @property {any} [attackAnim]      0:$1C1F, indexed (attackTimer & $0C) >> 2
 * @property {any} [attackMsIndex]   0:$2786 / 0:$2796
 * @property {any} [enemyAnim]
 * @property {any} [collapseCells]
 * @property {any} [continueScript]
 * @property {any} [gapLeaps]
 * @property {any} [gapTable]
 * @property {any} [objectMetasprites]
 * @property {any} [optionsCursorY]
 * @property {any} [optionsDifficulty]
 * @property {any} [projectileTemplates]
 * @property {any} [rescueEntryY]
 * @property {any} [respawnEnemies]
 * @property {any} [subsysObjects]
 *
 * These default to empty ARRAYS and never to null: a null here crashes any
 * harness that exercises collision without loading assets.
 */

/**
 * The whole RAM tree.
 *
 * @typedef {Object} GameState
 * @property {any} tunables
 * @property {number} frame        $FFB1
 * @property {number} parity       $FFA7 -- XOR 1 every VBlank. Flips the enemy
 *                                 loop's slot direction AND picks which of the
 *                                 two identical HUD arms runs.
 * @property {{held:number, pressed:number, prev:number}} input  $FFE1/$FFE2
 * @property {PlayerState} player
 * @property {{x:number, y:number, clampRight:number}} camera
 * @property {{x:number, y:number}} carry   $C72F/$C730, applied next frame
 * @property {any} rope           createRope()
 * @property {any} batarangs      createPool()
 * @property {any} doors          createDoorState()
 * @property {any[]} breakables   $C67B, 8 x {timer, col, row}
 * @property {{mode:number, steps:number, accX:number, accY:number}} script
 * @property {any} actors         createActors()
 * @property {any} raster         createRaster()
 * @property {any} enemies        createEnemies()
 * @property {any} drops          createDrops()
 * @property {any} effects        createEffects()
 * @property {number} currentActorSlot  $C75A
 * @property {number} standingOnActor   $FFC6 -- carries across slots AND frames
 * @property {number} enemyCursor       $FFB3
 * @property {number} enemyBesideIdx    $FFBE/$FFBF -- a TRUE GLOBAL: it persists
 *                                      across probes, slots and frames, and
 *                                      which slot last wrote it depends on the
 *                                      driver's direction. Never hoist it into
 *                                      a module local.
 * @property {any[]} enemyDraws         queued by loc_01_5CA8, flushed by
 *                                      drawEnemies. INSERTION ORDER IS OAM ORDER.
 * @property {number} lagFrame          $C757 -- read at $424D and $4E39, NEVER
 *                                      written. Do not mistake the field's
 *                                      existence for the behaviour being
 *                                      modelled (docs/03 §28).
 * @property {any} water          createWater()
 * @property {{queue: {id:number, mask:number}[]}} sound  $C6FB, a 4-slot ring
 * @property {LevelState} level
 * @property {FlowState} flow
 * @property {TablesState} tables
 * @property {VideoState} video
 *
 * --- the twelve LAZY top-level keys -----------------------------------------
 * Every one of these is absent from a freshly-created state and every reader
 * defends against that with `??` or a truthiness test. They are optional here
 * BECAUSE THAT IS WHAT THEY ARE, not as a concession to the checker.
 *
 * @property {any} [subsys]        rebuilt unconditionally by level.js:196 but
 *                                 created only if falsy by conveyor.js:71 --
 *                                 nobody has confirmed those are equivalent on
 *                                 levels 6 and 11, so do NOT seed it.
 * @property {any} [titleManifest]
 * @property {any} [loadout]
 * @property {number} [hitboxScale]
 * @property {number} [deathTimer] a MIRROR of $C712; the burst owns the byte
 * @property {any} [title]
 * @property {any} [options]
 * @property {any} [roundSelect]
 * @property {any} [stageIntro]
 * @property {any} [ending]
 * @property {any} [copyright]
 * @property {any} [tileAnim]
 */

export {};
