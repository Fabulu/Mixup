// Immutable edition identity and measured machine data.
//
// Profiles are data only. They do not import handlers or runtime code, so the
// runtime can select one before constructing any mutable Game state without
// creating an import cycle. Black Label and embedded Version A have independent
// measured identities. Registering either profile does not grant executable
// capabilities, which remain separate in runtime-profile.js.
//
// EVERY NUMBER IN THE PROFILE BELOW IS MEASURED. Nothing is derived by
// arithmetic from the other embedded program's address. Build B is
// 2002.10.07 BLACK VER in the $23xxxx/$24xxxx/$25xxxx..$28xxxx region. Build A
// is 2002.04.05 MASTER in the $13xxxx region. They share main RAM, but no code
// address.
//
// One surprising exception is part of Black's own measured execution route:
// a Version B run uses Build A's interrupt handlers. At the sample point,
// $801478 contains $13BDBA while the main loop is unambiguously Build B.
// `docs/worklog/ddpdoj/02-review.md` proves this three ways: the sampled RAM
// vector, write taps on each build's P1 mirror store (A 2615 hits, B 0), and a
// read census of $803940 in which Build B's $23C44C/$23D10C/$23C46C never read
// once. The ISR6 landmarks therefore belong to A by evidence, not by a shifted
// B address.

export const PROFILE_IDS = Object.freeze({
  BLACK_LABEL: 'ddpdoj/black-label/b',
  WHITE_LABEL: 'ddpdoj/white-label/a',
});

export const DEFAULT_PROFILE_ID = PROFILE_IDS.BLACK_LABEL;

const REQUIRED_FIELDS = Object.freeze([
  'id',
  'revisionIdentity',
  'programIdentity',
  'codeLandmarks',
  'ramLayout',
  'bootProfile',
  'objectDispatchProfile',
  'selectorProfile',
  'progressionProfile',
  'tableManifest',
  'checkpointNamespace',
]);

function assertDataOnly(value, path, active = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite numbers`);
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains unsupported ${typeof value} data`);
  }
  if (active.has(value)) throw new TypeError(`${path} contains a cycle`);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if ((array && prototype !== Array.prototype)
      || (!array && prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError(`${path} contains a non-plain object`);
  }
  active.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new TypeError(`${path} contains a symbol key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${path}.${key} must not be an accessor`);
    }
    if (!descriptor.enumerable && (!array || key !== 'length')) {
      throw new TypeError(`${path}.${key} must be enumerable profile data`);
    }
    assertDataOnly(descriptor.value, `${path}.${key}`, active);
  }
  active.delete(value);
}

function deepFreeze(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function assertRecord(value, path) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).length === 0) {
    throw new TypeError(`${path} must be a non-empty record`);
  }
}

function assertExactFields(value, fields, path) {
  assertRecord(value, path);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
      || keys.some((field) => typeof field !== 'string' || !fields.includes(field))) {
    throw new TypeError(`${path} fields must be ${fields.join(', ')}`);
  }
}

function assertId(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function assertIntegerRecord(value, path, minimum = 0) {
  assertRecord(value, path);
  for (const [key, entry] of Object.entries(value)) {
    if (!Number.isSafeInteger(entry) || entry < minimum) {
      throw new TypeError(`${path}.${key} must be a safe integer at least ${minimum}`);
    }
  }
}

function assertCodeLandmarks(value) {
  assertRecord(value, 'profile.codeLandmarks');
  for (const [key, entry] of Object.entries(value)) {
    const addresses = Array.isArray(entry) ? entry : [entry];
    if (addresses.length === 0
        || (Array.isArray(entry) && Object.keys(entry).length !== entry.length)
        || Array.prototype.some.call(addresses,
          (address) => !Number.isSafeInteger(address) || address < 0)) {
      throw new TypeError(`profile.codeLandmarks.${key} must contain measured addresses`);
    }
  }
}

function assertAddressRange(name, addresses, base, size) {
  assertIntegerRecord(addresses, name, base);
  for (const [key, value] of Object.entries(addresses)) {
    if (value >= base + size) {
      throw new RangeError(`${name}.${key} is outside its declared RAM extent`);
    }
  }
}

/** Validate profile data without trusting or registering the candidate. */
export function validateGameProfile(candidate) {
  assertDataOnly(candidate, 'profile');
  assertExactFields(candidate, REQUIRED_FIELDS, 'profile');
  assertId(candidate.id, 'profile.id');

  const revision = candidate.revisionIdentity;
  assertExactFields(revision, ['edition', 'set', 'build', 'programRevision'],
    'profile.revisionIdentity');
  assertId(revision.edition, 'profile.revisionIdentity.edition');
  assertId(revision.programRevision, 'profile.revisionIdentity.programRevision');
  if (revision.set !== 'ddpdojblk' || !/^[AB]$/.test(revision.build)) {
    throw new TypeError('profile revision identity is invalid');
  }

  const program = candidate.programIdentity;
  assertExactFields(program,
    ['imageBytes', 'imageSha256', 'buildARegion', 'buildBRegion'],
    'profile.programIdentity');
  if (program.imageBytes !== 0x600000
      || !/^[0-9a-f]{64}$/.test(program.imageSha256)) {
    throw new TypeError('profile program identity is invalid');
  }
  for (const key of ['buildARegion', 'buildBRegion']) {
    const region = program[key];
    if (!Array.isArray(region) || region.length !== 2
        || Object.keys(region).length !== 2
        || !Object.hasOwn(region, 0) || !Object.hasOwn(region, 1)
        || Array.prototype.some.call(region, (address) => !Number.isSafeInteger(address))
        || region[0] < 0 || region[0] >= region[1] || region[1] > program.imageBytes) {
      throw new TypeError(`profile.programIdentity.${key} is invalid`);
    }
  }

  assertCodeLandmarks(candidate.codeLandmarks);
  const layout = candidate.ramLayout;
  assertExactFields(layout, ['id', 'machine', 'addresses', 'playerFields', 'optionFields'],
    'profile.ramLayout');
  assertId(layout.id, 'profile.ramLayout.id');
  const machine = layout.machine;
  assertExactFields(machine,
    ['refreshHz', 'frameNs', 'cyclesPerFrame', 'ramBase', 'ramSize'],
    'profile.ramLayout.machine');
  if (!(machine.refreshHz > 0)
      || !Number.isSafeInteger(machine.frameNs) || machine.frameNs <= 0
      || !Number.isSafeInteger(machine.cyclesPerFrame) || machine.cyclesPerFrame <= 0
      || !Number.isSafeInteger(machine.ramBase)
      || !Number.isSafeInteger(machine.ramSize) || machine.ramSize <= 0) {
    throw new TypeError('profile RAM layout is invalid');
  }
  assertAddressRange('profile.ramLayout.addresses', layout.addresses,
    machine.ramBase, machine.ramSize);
  assertIntegerRecord(layout.playerFields, 'profile.ramLayout.playerFields');
  assertIntegerRecord(layout.optionFields, 'profile.ramLayout.optionFields');

  const boot = candidate.bootProfile;
  assertExactFields(boot, ['id', 'resetEntry', 'inputBits'], 'profile.bootProfile');
  assertId(boot.id, 'profile.bootProfile.id');
  if (!Number.isSafeInteger(boot.resetEntry)) {
    throw new TypeError('profile.bootProfile.resetEntry must be a measured address');
  }
  assertExactFields(boot.inputBits,
    ['up', 'down', 'left', 'right', 'b1', 'b2', 'b3', 'start'],
    'profile.bootProfile.inputBits');
  assertIntegerRecord(boot.inputBits, 'profile.bootProfile.inputBits');

  const dispatch = candidate.objectDispatchProfile;
  assertExactFields(dispatch,
    ['id', 'tableAddress', 'entries', 'objectTableAddress', 'objectTableEnd', 'slots', 'stride'],
    'profile.objectDispatchProfile');
  assertId(dispatch.id, 'profile.objectDispatchProfile.id');
  for (const key of [
    'tableAddress', 'entries', 'objectTableAddress', 'objectTableEnd', 'slots', 'stride',
  ]) {
    if (!Number.isSafeInteger(dispatch[key]) || dispatch[key] <= 0) {
      throw new TypeError(`profile.objectDispatchProfile.${key} must be positive`);
    }
  }

  const selector = candidate.selectorProfile;
  assertExactFields(selector, ['id', 'horizontalHitbox', 'clamp'],
    'profile.selectorProfile');
  assertId(selector.id, 'profile.selectorProfile.id');
  if (!Number.isSafeInteger(selector.horizontalHitbox) || selector.horizontalHitbox <= 0) {
    throw new TypeError('profile.selectorProfile.horizontalHitbox must be positive');
  }
  assertExactFields(selector.clamp, ['yMax', 'yMin', 'xMin', 'xMax'],
    'profile.selectorProfile.clamp');
  assertIntegerRecord(selector.clamp, 'profile.selectorProfile.clamp');

  const progression = candidate.progressionProfile;
  assertExactFields(progression, ['id', 'build', 'loopOffer'],
    'profile.progressionProfile');
  assertId(progression.id, 'profile.progressionProfile.id');
  if (progression.build !== revision.build || typeof progression.loopOffer !== 'boolean') {
    throw new TypeError('profile progression identity is invalid');
  }

  const manifest = candidate.tableManifest;
  assertExactFields(manifest, ['id', 'set', 'build', 'imageSha256'],
    'profile.tableManifest');
  assertId(manifest.id, 'profile.tableManifest.id');
  if (manifest.set !== revision.set
      || manifest.build !== revision.build
      || manifest.imageSha256 !== program.imageSha256) {
    throw new TypeError('profile table manifest identity does not match the revision');
  }
  assertId(candidate.checkpointNamespace, 'profile.checkpointNamespace');
  return candidate;
}

/** Reject tables whose cartridge and embedded-program identity differ from a profile. */
export function assertProfileTables(profile, tables) {
  const manifest = profile.tableManifest;
  if (!tables || (Object.hasOwn(tables, 'profileId') && tables.profileId !== profile.id)
      || tables.set !== manifest.set || tables.build !== manifest.build
      || tables.image_sha256 !== manifest.imageSha256) {
    throw new TypeError(`DaiOuJou tables do not match edition profile ${profile.id}`);
  }
  return tables;
}

/**
 * Keep embedded windows for other edition profiles out of the selected runtime.
 * The exported table can carry several programs from one cartridge image, but
 * making a previously absent address readable changes an exact native route.
 */
export function profileRomSpec(profile, tables) {
  const windows = tables?.rom?.windows;
  if (!Array.isArray(windows)) {
    throw new TypeError(`DaiOuJou tables for ${profile.id} have no ROM window list`);
  }
  const excluded = new Map();
  for (const edition of Object.values(tables.editions ?? {})) {
    if (!edition || edition.profileId === profile.id) continue;
    for (const [field, descriptors] of Object.entries(edition)) {
      if (!field.endsWith('Windows')) continue;
      if (!Array.isArray(descriptors)) {
        throw new TypeError(`${field} for an embedded DaiOuJou edition must be an array`);
      }
      for (const descriptor of descriptors) {
        if (!descriptor || typeof descriptor.base !== 'string'
            || !Number.isInteger(descriptor.len) || descriptor.len <= 0) {
          throw new TypeError(`${field} has an invalid embedded ROM window descriptor`);
        }
        const key = `${descriptor.base}:${descriptor.len}`;
        // Capability manifests may project the same physical edition window.
        if (!excluded.has(key)) excluded.set(key, 0);
      }
    }
  }
  if (excluded.size === 0) return tables.rom;

  const retained = [];
  for (const window of windows) {
    const key = `${window.base}:${window.len}`;
    if (!excluded.has(key)) {
      retained.push(window);
      continue;
    }
    excluded.set(key, excluded.get(key) + 1);
  }
  for (const [key, matches] of excluded) {
    if (matches !== 1) {
      throw new TypeError(`${key} resolves to ${matches} embedded ROM windows instead of one`);
    }
  }
  return { ...tables.rom, windows: retained };
}

/** Preserve an immutable non-enumerable profile across a context adapter. */
export function deriveProfileContext(source, overrides = {}) {
  const derived = { ...source, ...overrides };
  if (Object.hasOwn(source, 'profile')) {
    Object.defineProperty(derived, 'profile', { value: source.profile });
  }
  if (Object.hasOwn(source, 'runtime')) {
    Object.defineProperty(derived, 'runtime', { value: source.runtime });
  }
  return derived;
}

const PROFILE_INPUT = {
  id: PROFILE_IDS.BLACK_LABEL,
  revisionIdentity: {
    edition: 'black-label',
    set: 'ddpdojblk',
    build: 'B',
    programRevision: '2002.10.07 BLACK VER',
  },
  programIdentity: {
    imageBytes: 0x600000,
    imageSha256: '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c',
    buildARegion: [0x100000, 0x200000],
    buildBRegion: [0x200000, 0x300000],
  },
  // Program landmarks are re-derived by `tools/oracle/derive.py` and can be
  // checked individually with `xref.py dasm <addr>`. They are grouped by the
  // actual executing build, never aligned by a constant A/B offset.
  codeLandmarks: {
    // Build B main loop.
    loopHead: 0x23bfdc, loopTail: 0x23c006,
    counters: 0x23be8c,
    call1: 0x256d5a, objDriver: 0x2410bc, call3: 0x24683e, spriteBuild: 0x23d2ae,
    frameSync: 0x23c212, postVblank: 0x23d12a,
    syncSpin: 0x23c390, syncDiv2: 0x23c248, syncDiv3: 0x23c25c, syncTail: 0x23c272,
    // Build A interrupt handlers that actually execute during a Version B run.
    isr6Vector: 0x13bdba,
    isr6Body: 0x13c7d4,
    isr6Coin: 0x13cfba,
    isr6InputRead: 0x13d464,
    isr6InputGate: 0x13d478,
    isr6InputGated: 0x15b980,
    isr6Third: 0x18acc0,
    isr6Gate: 0x13c7e6,
    isr6Gated: [0x141676, 0x140ffe, 0x141258, 0x185dc4],
    isr6ScoreFlush: 0x185dc4,
    isr6TextFlush: 0x141258,
    isr6RegUpload: 0x140ffe,
    isr6RegUploadBuildB: 0x240cc0,
    isr6Release: 0x13c806,
    isr6Tail: 0x13c4fc,
    // Build B object driver.
    objTableInit: 0x24107c, objAlloc: 0x241182, objAllocFail: 0x2411d4,
    objCommit: 0x24111e, objKill: 0x2411e2, objDispatch: 0x240f62,
    // Build B player.
    playerHandlerP1: 0x2491c0, playerHandlerP2: 0x249246,
    playerUpdate: 0x2494fa,
    playerDead: 0x24a130, playerFrozen: 0x24a3a2, playerBit4: 0x249f8a,
    playerMove: 0x2417de, moveVector: 0x241812,
    tiltDecay: 0x24a42a, wallHit: 0x261126,
    playerStore: 0x2496e8, playerTail: 0x249e4e,
    playerBomb: 0x2497aa, playerShot: 0x249b2c,
    laserRampDown: 0x24c8be, laserRampUp: 0x24c8e4,
    shipDrawP1: 0x24a440, shipDrawP2: 0x24a44c,
    shipDrawAltP1: 0x24a458, shipDrawAltP2: 0x24a46c,
    shipDraw: 0x24a482,
    shipKnocked: 0x24a4e2,
    shipBit8: 0x24a6b4,
    shipClear60: 0x25370a,
    shipShadow: 0x249ea0,
    optionObject: 0x24c096,
    optionTemplates: 0x24bbaa,
    optionLaser: 0x24c180,
    optionNoLaser: 0x24c29e,
    optionFormation2: 0x24c390,
    optionFireHandshake: 0x24c476,
    optionSpawn: 0x24d480,
    optionPodMove: 0x24d12e,
    optionPodShadow: 0x24c406,
    protSet: 0x246d04, protSum: 0x246ea4, protRead: 0x246cac,
    enqB5: 0x23efc0, enqB5Saved: 0x23efee,
    enqB19rec: 0x23f104, enqB19reg: 0x23f1fa,
    enqB15rec: 0x23f2ca,
  },
  // Main RAM is shared by both embedded builds. `derive.py` independently
  // confirms every absolute address below once in each program region. Main RAM
  // is also the board's NVRAM, so a seed is an exact memcpy of this layout.
  ramLayout: {
    id: 'ddpdoj.ram/shared-v1',
    machine: {
      // 15625/264 Hz exactly, derived from the 10 MHz pixel clock divided by
      // 640 x 264, then confirmed by -listxml and the running machine to the
      // attosecond. The 20 MHz 68000 therefore has exactly 337920 cycles/frame.
      refreshHz: 15625 / 264,
      frameNs: 16896000,
      cyclesPerFrame: 337920,
      ramBase: 0x800000,
      ramSize: 0x20000,
    },
    addresses: {
      spriteList: 0x800000, // $800000..$8009FF, 10 bytes/entry, DMA at vblank
      frameCounter: 0x80390a, // increments per main-loop iteration, not per vblank
      // $23BEB2..$23BEE0 copies $80390A into these three words and masks
      // them modulo 4, 8, and 16. Absolute xrefs find at least 13, 20, and 4
      // readers respectively, including stage and enemy script sites.
      frameCounterMod4: 0x803910,
      frameCounterMod8: 0x803912,
      frameCounterMod16: 0x803914,
      altPhase: 0x80390d,
      mod3Phase: 0x80390e,
      divCount1: 0x80392e,
      divCount2: 0x803930,
      divGate3: 0x803936,
      semaphore: 0x803940, // vblank semaphore; its arm write is the sample point
      sem2: 0x803942,
      // Player mirrors are `not(ror.w #1, $C08000)`: raw, edge, then previous.
      p1raw: 0x803970, p1edge: 0x803972, p1prev: 0x803974,
      p2raw: 0x803976, p2edge: 0x803978, p2prev: 0x80397a,
      rank: 0x80380c, // operator rank 0..3
      objTable: 0x80e240, // 20 slots x $50, ending immediately before $80E880
      objTableEnd: 0x80e880,
      // The $8130xx game-state bookkeeping is distinct from the player object
      // records. Only +$18 of each in-play record is read, and only as zero/nonzero.
      inPlay1: 0x8130fa, inPlay2: 0x81311e,
      playerCountM1: 0x81308e, // $FFFF none, 0 one player, 1 two players
      onePlayerFlag: 0x81308c, // 1 in one-player play, 0 otherwise, not a count
      freeze: 0x8130d2, // $25FD82 sets it and $25FD8C clears it
      player1: 0x8103e6, // player object record base, stride $62
      player2: 0x810448,
      p1Options: 0x8104aa,
      p2Options: 0x81050e,
    },
    // Player offsets come from disassembling $2491C0/$2494FA and the write map
    // in `02-impl-object-driver...` section 5. Positions use 1/64 pixels. The
    // +$14 long is a tilt-indexed X hitbox, not animation: `$2459D0` consumes
    // +$10/+12 on Y and +$14/+16 on X. Build A's corresponding horizontal
    // half-extent is $00C0 while Black's is $0080, the measured 6 px vs 4 px
    // selector difference.
    playerFields: {
      state: 0x00,
      flags1: 0x01,
      posY: 0x02,
      posX: 0x04,
      knock: 0x06,
      animA: 0x0a, // long pointer supplies hardware sprite words 2 and 3
      size: 0x0e, // measured $0620, a 3 x 32 sprite
      flipColour: 0x1c,
      offLong: 0x06, // measured $FA00 on the P1 ship
      offShort: 0x08, // measured $FC00 on the P1 ship
      hitYPlus: 0x10, // measured $0080
      hitYMinus: 0x12, // measured $0100
      hitXPlus: 0x14,
      hitXMinus: 0x16,
      dirByte: 0x18,
      btnByte: 0x19,
      speedIdx: 0x1a,
      angle: 0x1b,
      dirLatch: 0x1d,
      laserFloor: 0x38,
      baseSpeed: 0x39,
      auraPhase: 0x28,
      glowPhase: 0x48,
      shadowBias: 0x5e,
      optFormation: 0x5a,
      hitTimer: 0x3a,
      invuln: 0x3e,
      dead: 0x3f,
      velY: 0x30,
      velX: 0x32,
      tiltDelay: 0x4c,
      tilt: 0x4e,
      knockTimer: 0x46,
      lastVelX: 0x5c,
      shipSel: 0x58,
      playerIdx: 0x57,
      stride: 0x62,
    },
    // `$24C0B0 lea $81050E,A6` minus `$24C096 lea $8104AA,A6` proves the option
    // record is $64 bytes, not $20. The copy at $24C0E8..$24C116 independently
    // fills exactly that extent. Its first two $20-byte blocks are pod sprite
    // records; control state starts at +$40. `$24C3CC/$24C3D0/$24C3D4` proves
    // the two pod records, and measured offsets/images are cited below.
    optionFields: {
      stride: 0x64,
      pod: 0x20,
      state: 0x00,
      flags1: 0x01,
      posY: 0x02, posX: 0x04,
      offLong: 0x06, offShort: 0x08, // measured $FC00 / $FE00 on both pods
      anim: 0x0a, // measured $00003B08
      size: 0x0e, // measured $0410, 2 x 16
      speedIdx: 0x1a, // measured $E0
      angle: 0x1b, // measured $10 for pod 0, $30 for pod 1
      flipColour: 0x1c, // measured $0000 for pod 0, $4000 for pod 1
      posY2: 0x22,
      raw: 0x40,
      edge: 0x41,
      animDelay: 0x42,
      animReload: 0x43,
      animIdx: 0x44,
      animTable: 0x46,
      animIdxReload: 0x4c,
      reloadCount: 0x4b,
      shadowTable: 0x58,
      shadow0: 0x5c,
      shadow1: 0x60,
    },
  },
  bootProfile: {
    id: 'ddpdoj.boot.black-label-b.v1',
    resetEntry: 0x23bf74,
    // These are bits in the mirrored P1 word, not MAME port order. Driving
    // each direction and observing its clamp proves bit 0 +Y, bit 1 -Y,
    // bit 2 -X, and bit 3 +X. Buttons are 4/5/6. Start alone yields portin
    // $FFFE and p1raw $8000, proving mirrored bit 15.
    inputBits: {
      up: 0, down: 1, left: 2, right: 3, b1: 4, b2: 5, b3: 6, start: 15,
    },
  },
  objectDispatchProfile: {
    id: 'ddpdoj.dispatch.black-label-b.v1',
    tableAddress: 0x240f62,
    entries: 20,
    objectTableAddress: 0x80e240,
    objectTableEnd: 0x80e880,
    slots: 20,
    stride: 0x50,
  },
  selectorProfile: {
    id: 'ddpdoj.selector.black-label-b.v1',
    horizontalHitbox: 0x80,
    // Read directly from $2495E2..$249698 in 1/64-pixel units. The pixel
    // dimensions are consequences: Y 32..404, X 12..212.
    clamp: {
      yMax: 0x6500,
      yMin: 0x0800,
      xMin: 0x0300,
      xMax: 0x3500,
    },
  },
  progressionProfile: {
    id: 'ddpdoj.progression.black-label-b.v1',
    build: 'B',
    loopOffer: true,
  },
  tableManifest: {
    id: 'ddpdoj.tables.black-label-b.v1',
    set: 'ddpdojblk',
    build: 'B',
    imageSha256: '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c',
  },
  checkpointNamespace: 'ddpdoj.progression.black-label-b.v2',
};

validateGameProfile(PROFILE_INPUT);
export const BLACK_LABEL_PROFILE = deepFreeze(PROFILE_INPUT);
export const SHARED_RAM_LAYOUT = BLACK_LABEL_PROFILE.ramLayout;

const WHITE_PROFILE_INPUT = {
  id: PROFILE_IDS.WHITE_LABEL,
  revisionIdentity: {
    edition: 'white-label',
    set: 'ddpdojblk',
    build: 'A',
    programRevision: '2002.04.05 MASTER VER',
  },
  // The decrypted cartridge is one exact 6 MiB image containing both builds.
  // Build A identity is not a standalone V101 ROM identity.
  programIdentity: BLACK_LABEL_PROFILE.programIdentity,
  codeLandmarks: {
    loopHead: 0x13c356,
    loopTail: 0x13c380,
    counters: 0x13be8c,
    call1: 0x1562f0,
    objDriver: 0x1413f6,
    call3: 0x145f1c,
    spriteBuild: 0x13d61a,
    frameSync: 0x13c5b6,
    postVblank: 0x13d496,
    isr6Vector: 0x13bdba,
    isr6Body: 0x13c7d4,
    isr6Coin: 0x13cfba,
    isr6InputRead: 0x13d464,
    objTableInit: 0x1413b6,
    objAlloc: 0x1414bc,
    objDispatch: 0x141294,
    versionChooser: 0x13beea,
    versionChooserExit: 0x13c0e6,
    frontEndStage: 0x13c0f2,
    stageStart: 0x142d14,
    playerHandlerP1: 0x14889e,
    playerHandlerP2: 0x14891e,
    playerUpdate: 0x148bae,
    playerMove: 0x141b18,
    playerTail: 0x1494f2,
    playerHit: 0x14962e,
    playerDead: 0x1497d4,
    optionObject: 0x14b74a,
    optionHandler: 0x18a11c,
  },
  ramLayout: SHARED_RAM_LAYOUT,
  bootProfile: {
    id: 'ddpdoj.boot.white-label-a.v1',
    resetEntry: 0x13c24e,
    inputBits: {
      up: 0, down: 1, left: 2, right: 3, b1: 4, b2: 5, b3: 6, start: 15,
    },
  },
  objectDispatchProfile: {
    id: 'ddpdoj.dispatch.white-label-a.v1',
    tableAddress: 0x141294,
    entries: 21,
    objectTableAddress: 0x80e240,
    objectTableEnd: 0x80e880,
    slots: 20,
    stride: 0x50,
  },
  selectorProfile: {
    id: 'ddpdoj.selector.white-label-a.v1',
    horizontalHitbox: 0xc0,
    // Independently decoded at $148CBC..$148D4C. These are not copied from B.
    clamp: {
      yMax: 0x6500,
      yMin: 0x0800,
      xMin: 0x0300,
      xMax: 0x3500,
    },
  },
  progressionProfile: {
    id: 'ddpdoj.progression.white-label-a.v1',
    build: 'A',
    loopOffer: false,
  },
  tableManifest: {
    id: 'ddpdoj.tables.white-label-a.v1',
    set: 'ddpdojblk',
    build: 'A',
    imageSha256: BLACK_LABEL_PROFILE.programIdentity.imageSha256,
  },
  // This identity is reserved now so White checkpoints cannot enter Black's
  // namespace. No checkpoint capability is registered yet.
  checkpointNamespace: 'ddpdoj.progression.white-label-a.v1',
};

validateGameProfile(WHITE_PROFILE_INPUT);
export const WHITE_LABEL_PROFILE = deepFreeze(WHITE_PROFILE_INPUT);

const TRUSTED_PROFILES = new Map([
  [BLACK_LABEL_PROFILE.id, BLACK_LABEL_PROFILE],
  [WHITE_LABEL_PROFILE.id, WHITE_LABEL_PROFILE],
]);

/** Resolve only a trusted registered profile, before a Game touches mutable state. */
export function resolveGameProfile(request = DEFAULT_PROFILE_ID) {
  if (typeof request === 'string') {
    const profile = TRUSTED_PROFILES.get(request);
    if (!profile) throw new RangeError(`unsupported DaiOuJou edition profile ${request}`);
    return profile;
  }
  if (request === BLACK_LABEL_PROFILE || request === WHITE_LABEL_PROFILE) return request;
  if (request && typeof request === 'object') {
    validateGameProfile(request);
    throw new TypeError(`unregistered DaiOuJou edition profile ${request.id}`);
  }
  throw new TypeError('DaiOuJou edition profile must be a registered id or profile');
}
