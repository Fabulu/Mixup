// The registry and the game manifest.
//
// THIS IS THE ONLY AUTOMATED CHECK index.html HAS EVER HAD. Nothing in the
// 26-stage gate loads the launcher, so a games/index.json that points at a moved
// file, a game.json whose `entry` no longer exists, or a joypad mask that has
// drifted away from BTN would all ship silently. This test cannot play the
// launcher -- it checks the DATA the launcher reads, which is the half that a
// path change breaks.
//
// It deliberately does NOT touch assets/. assets/ is gitignored and CI runs this
// suite on a checkout that has none (see .github/workflows/ci.yml), so a check
// that needed it would have to be conditional -- and a conditional check is how
// a gate learns to pass vacuously.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BTN } from '../src/input.js';

// games/batman/tests/ -> games/
const GAMES_DIR = new URL('../../', import.meta.url);
const REGISTRY = new URL('index.json', GAMES_DIR);

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'));
const onDisk = (url) => existsSync(fileURLToPath(url));

const registry = readJson(REGISTRY);

test('games/index.json is a flat array of {id, dir}', () => {
  assert.ok(Array.isArray(registry), 'the registry is an array');
  assert.ok(registry.length >= 1, 'at least one game is registered');
  const ids = new Set();
  for (const g of registry) {
    assert.equal(typeof g.id, 'string', 'id is a string');
    assert.equal(typeof g.dir, 'string', 'dir is a string');
    assert.ok(!ids.has(g.id), `id ${g.id} appears once`);
    ids.add(g.id);
    assert.deepEqual(Object.keys(g).sort(), ['dir', 'id'],
      'the registry carries id and dir and NOTHING else -- every other fact '
      + 'belongs in that game\'s manifest, so the launcher can render the '
      + 'picker without opening one');
  }
});

test('batman is registered', () => {
  assert.ok(registry.some((g) => g.id === 'batman' && g.dir === 'batman'),
    'games/index.json lists batman');
});

// The manifests, one subtest per registered game. Every path a manifest names
// has to exist -- that is the check that catches a registry left behind by a
// move, which is exactly what happened to this repo once already.
for (const g of registry) {
  const dir = new URL(`${g.dir}/`, GAMES_DIR);
  const manifestUrl = new URL('game.json', dir);

  test(`games/${g.dir}/game.json: schema and paths`, () => {
    assert.ok(onDisk(manifestUrl), `games/${g.dir}/game.json exists`);
    const m = readJson(manifestUrl);

    assert.equal(m.id, g.id, 'the manifest id matches the registry id');
    for (const k of ['title', 'platform', 'publisher', 'blurb']) {
      assert.equal(typeof m[k], 'string', `${k} is a string`);
      assert.ok(m[k].length, `${k} is not empty`);
    }
    assert.equal(typeof m.year, 'number', 'year is a number');

    // rom: TWO legal shapes, because an arcade board is not a cartridge.
    //
    //   CARTRIDGE  rom.file + rom.sha1 + rom.bytes   (Batman .gb, Gradius .nes)
    //   MAME SET   rom.set + rom.files[]             (DaiOuJou, IGS PGM)
    //
    // This test asserted the cartridge shape only, and DaiOuJou's arrival broke
    // it -- correctly. A PGM board has ten ROMs and no single file or sha1 to
    // name, so `rom.file` would have to be invented to satisfy the schema, and
    // an invented field is worse than an absent one. The fix is to teach the
    // schema the second shape, NOT to loosen the first: each branch below is as
    // strict as the original was.
    if (typeof m.rom.set === 'string') {
      assert.ok(m.rom.set.length, 'rom.set is not empty');
      assert.ok(!m.rom.set.includes('/'), 'rom.set is a set name, not a path');
      assert.ok(Array.isArray(m.rom.files) && m.rom.files.length,
        'a MAME set names the ROMs it is made of');
      for (const f of m.rom.files) {
        assert.equal(typeof f, 'string', 'rom.files entries are strings');
        assert.ok(!f.includes('/'), `rom.files entry ${f} is a filename, not a path`);
      }
      // No sha1 here ON PURPOSE. MAME decrypts the program in place and
      // simulates the undumped IGS027A, so "the binary" is a decrypted image
      // plus a simulated device -- see games/ddpdoj/README.md. A single hash
      // would have to say WHICH, and this manifest does not claim one.
    } else {
      // The ROM stays at the repo root this workflow; the manifest records
      // which cartridge this port was measured against so a second game knows
      // where to put its own.
      assert.equal(typeof m.rom.file, 'string', 'rom.file is a string');
      assert.ok(!m.rom.file.includes('/'), 'rom.file is a filename, not a path');
      assert.match(m.rom.sha1, /^[0-9a-f]{40}$/, 'rom.sha1 is a sha1');
      assert.equal(typeof m.rom.bytes, 'number', 'rom.bytes is a number');
    }

    // display: the host takes the screen size and the frame rate FROM THE
    // MANIFEST. Both used to be baked into index.html.
    assert.equal(typeof m.display.screen.w, 'number', 'display.screen.w');
    assert.equal(typeof m.display.screen.h, 'number', 'display.screen.h');
    assert.ok(m.display.frameHz > 0, 'display.frameHz is positive');

    // code: every module path is relative to the game dir and must exist.
    assert.ok(m.code && typeof m.code === 'object', 'code block present');
    for (const [key, rel] of Object.entries(m.code)) {
      if (rel === null) continue;          // declared, not written yet
      // `<thing>Note` is PROSE about the sibling key, not a path. The
      // convention already exists elsewhere in these manifests -- `romNote`,
      // `frameHzNote`, `entryNote` -- and this loop did not know about it, so
      // `code.pageNote` was checked for existence as a filename and failed.
      // Skipping by suffix keeps the loop strict about everything that IS a
      // path; a note is still required to be a string below.
      if (/Note$/.test(key)) {
        assert.equal(typeof rel, 'string', `code.${key} is prose, so a string`);
        continue;
      }
      assert.equal(typeof rel, 'string', `code.${key} is a string`);
      assert.ok(!rel.startsWith('/') && !rel.startsWith('.'),
        `code.${key} is relative to the game dir, with no leading . or /`);
      assert.ok(onDisk(new URL(rel, dir)),
        `code.${key} -> games/${g.dir}/${rel} exists on disk`);
    }
  });
}

// ---------------------------------------------------------------------------
// Batman's manifest, against the port it describes.
//
// These are the assertions that stop the manifest becoming a second, drifting
// spelling of facts that already live in src/. Every one of them compares the
// manifest to something the game itself owns.
// ---------------------------------------------------------------------------
const BAT = readJson(new URL('batman/game.json', GAMES_DIR));

test('the joypad masks are the $FFE1 bit layout, not a second opinion', () => {
  const fromManifest = Object.fromEntries(
    BAT.input.buttons.map((b) => [b.id, b.mask]));
  assert.deepEqual(fromManifest, { ...BTN },
    'game.json input.buttons must equal BTN in src/input.js -- the launcher '
    + 'reads its touch masks from the manifest and the game reads $FFE1 from '
    + 'BTN, so a drift between them is a pad that presses the wrong button');
});

test('the default keymap only names buttons that exist', () => {
  const ids = new Set(BAT.input.buttons.map((b) => b.id));
  for (const [code, name] of Object.entries(BAT.input.defaultKeymap)) {
    assert.ok(ids.has(name), `${code} -> ${name} is a real button`);
  }
  // And the codes are the ones src/input.js actually binds. The live KEYMAP is
  // not exported, so this reads the source -- the same idiom conveyor.test.js
  // uses to pin the frame loop's call order.
  const src = readFileSync(new URL('batman/src/input.js', GAMES_DIR), 'utf8');
  for (const code of Object.keys(BAT.input.defaultKeymap)) {
    assert.ok(src.includes(`${code}:`),
      `src/input.js binds ${code}, which game.json claims it does`);
  }
});

test('touchLayout only names buttons that exist', () => {
  const ids = new Set(BAT.input.buttons.map((b) => b.id));
  for (const cell of BAT.input.touchLayout.dpad) {
    if (cell !== null) assert.ok(ids.has(cell), `dpad cell ${cell} is a button`);
  }
  for (const c of BAT.input.touchLayout.clusters) {
    for (const b of c.buttons) assert.ok(ids.has(b), `cluster button ${b} is a button`);
  }
});

test('the screen size is the renderer\'s, spelled once', async () => {
  const { SCREEN_W, SCREEN_H } = await import('../src/render/renderer.js');
  assert.equal(BAT.display.screen.w, SCREEN_W, 'manifest w == renderer SCREEN_W');
  assert.equal(BAT.display.screen.h, SCREEN_H, 'manifest h == renderer SCREEN_H');
});

test('frameHz is DERIVED from the DMG clock, not rounded', () => {
  // 4194304 Hz / 70224 cycles per frame. See docs/knowledge/07.
  const exact = 4194304 / 70224;
  assert.ok(Math.abs(BAT.display.frameHz - exact) < 1e-5,
    `manifest frameHz ${BAT.display.frameHz} must be the derived ${exact}`);

  // AND the deviation must stay written down. src/main.js ships FRAME_MS at a
  // ROUNDED 59.73 and every number in the corpus was measured against it; the
  // manifest records the exact rate WITHOUT changing that constant, and the
  // note is the only thing that stops the next reader "fixing" one of them.
  const main = readFileSync(new URL('batman/src/main.js', GAMES_DIR), 'utf8');
  assert.ok(main.includes('1000 / 59.73'),
    'src/main.js still ships the rounded FRAME_MS this manifest documents');
  assert.ok(/59\.73/.test(BAT.display.frameHzNote),
    'display.frameHzNote names the rounded rate the port actually runs at');
});

test('entries[] keeps both sentinels and all fourteen levels', () => {
  const byId = new Map(BAT.entries.map((e) => [e.id, e]));
  assert.equal(byId.get(0)?.kind, 'title', '0 = the title screen');
  assert.equal(byId.get(99)?.kind, 'ending', '99 = the ending');
  for (let i = 1; i <= 14; i++) {
    assert.equal(byId.get(i)?.kind, 'level', `${i} is a level entry`);
    assert.ok(byId.get(i).note, `level ${i} carries its status note`);
  }
  assert.equal(BAT.entries.length, 16, '14 levels plus two sentinels');
  for (const e of BAT.entries) {
    assert.ok(['title', 'level', 'ending'].includes(e.kind), `${e.id}: known kind`);
    assert.equal(typeof e.label, 'string', `${e.id}: has a label`);
  }
});

test('options[] describes $C756 and defaults to the cartridge value', () => {
  const diff = BAT.options.find((o) => o.key === 'difficulty');
  assert.ok(diff, 'a difficulty option exists');
  assert.equal(diff.default, 1,
    'the cartridge boots at 1 -- read off the real machine at gameplay start');
  assert.deepEqual(diff.values.map((v) => v.value), [0, 1, 2], '$C756 is 0..2');
});

test('characters[] and enemies[] are declared, and honest about it', () => {
  assert.equal(BAT.characters.length, 1, 'one playable character today');
  const bat = BAT.characters[0];
  assert.equal(bat.module, 'src/player.js');
  assert.ok(onDisk(new URL(`batman/${bat.module}`, GAMES_DIR)),
    'the character module exists');
  assert.equal(bat.tileBudget, 12,
    'OBJ tiles $00-$0B -- the real constraint on two protagonists on screen');

  // One entry per driver state (loc_01_50C3, table 1:$50D3, indexed on state-1).
  assert.equal(BAT.enemies.length, 13, 'thirteen driver states');
  assert.deepEqual(BAT.enemies.map((e) => e.state),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 'states 1..13, in order');
  for (const e of BAT.enemies) {
    assert.match(e.rom, /^\d:\$[0-9A-F]{4}$/, `state ${e.state} cites a ROM address`);
    assert.ok(e.module.startsWith('src/enemies/'),
      `state ${e.state} names the module the split will create`);
  }
});

// The enemies[] modules are the one set of paths in the manifest that may not
// exist yet -- they name the files Phase 9 of the restructure creates, ONE PER
// COMMIT, easiest first and the driver last. So for the length of that phase
// the set is genuinely split, and the manifest has to say which half is which.
//
// THIS REPLACED AN ALL-OR-NOTHING CHECK, and the replacement is strictly
// stronger. The old assertion was `missing.length === 0 || missing.length ===
// modules.length`: it passed when every module was missing, passed when every
// module was present, and could not be satisfied by ANY commit in between --
// which made the one-module-per-commit protocol impossible to keep green. It
// also never asserted that a landed module still exists, because the
// all-missing arm stayed available forever. What is asserted now is exact:
// game.json's `enemiesPending` must equal, element for element, the set of
// paths enemies[] names that are not on disk. A module that lands without
// being struck from the ledger fails. A ledger entry for a file that is
// already there fails. And when the ledger is empty -- the end state of Phase
// 9 -- this test is asserting that every module the manifest names exists,
// which the check it replaced never did.
test('enemiesPending is exactly the set of enemy modules not on disk', () => {
  assert.match(BAT.enemiesNote, /WIRED TO NOTHING/,
    'enemiesNote states that these entries drive nothing yet');

  // `shared` (walkershared.js) is a real path in the manifest too, and it is
  // tracked here for the same reason the `module` paths are.
  const modules = [...new Set(BAT.enemies.flatMap((e) => [e.module, e.shared])
    .filter((p) => p !== undefined))];
  assert.ok(Array.isArray(BAT.enemiesPending), 'enemiesPending is an array');
  for (const p of BAT.enemiesPending) {
    assert.ok(modules.includes(p),
      `enemiesPending names ${p}, which no enemies[] entry lists`);
  }

  const missing = modules.filter((p) => !onDisk(new URL(`batman/${p}`, GAMES_DIR)));
  assert.deepEqual([...BAT.enemiesPending].sort(), [...missing].sort(),
    'game.json enemiesPending must be EXACTLY the enemies[] modules that do not '
    + 'exist on disk. If a module just landed, strike it from the ledger in the '
    + 'same commit; if the ledger names a file that is already there, the split '
    + 'moved without the manifest.');
});
