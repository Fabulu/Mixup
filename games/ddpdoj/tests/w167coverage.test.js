import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const tool = new URL('../tools/dojcoverage.py', import.meta.url);
const configPath = new URL('../tools/dojcoverage-config.json', import.meta.url);
const rom = new URL('../tools/oracle/out/maincpu.bin', import.meta.url);
const w22 = new URL('../tools/oracle/out/w22-spawn-stage1.tsv', import.meta.url);
const w25 = new URL('../tools/oracle/out/w25-handler-stage1.tsv', import.meta.url);
const w75 = new URL('../tools/oracle/out/w75/seedcmp.json', import.meta.url);
const w168 = new URL('../tools/w168-stage2-bgelem-evidence.json', import.meta.url);
const w169 = new URL('../tools/w169-stage2-spawn-evidence.json', import.meta.url);
const w170 = new URL('../tools/w170-stage2-type95-evidence.json', import.meta.url);
const w171 = new URL('../tools/w171-stage2-type8d-evidence.json', import.meta.url);
const w172 = new URL('../tools/w172-stage2-type8f-evidence.json', import.meta.url);
const ckpt = new URL('../tools/oracle/out/w69/stage1-sweep/ckpt', import.meta.url);

const evidence = [rom, w22, w25, w75, w168, w169, w170, w171, w172, ckpt]
  .every((p) => existsSync(p));

function run(...args) {
  return spawnSync('python', [fileURLToPath(tool), ...args], {
    cwd: fileURLToPath(root), encoding: 'utf8', windowsHide: true,
  });
}

test('W210 config is a machine-readable family map with an exact backlog', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.schema, 1);
  assert.deepEqual(config.families.map((x) => x.name), [
    'top_objects', 'type5_calls', 'enemy_types',
    'stage1_spawn_script', 'stage2_spawn_script', 'stage3_spawn_script',
    'stage1_bgelem', 'stage2_bgelem',
  ]);
  assert.equal(config.delegated[0].tool, 'bosscoverage.py');
  assert.deepEqual(config.backlog.map((x) => x.name), [
    'stage2_enemy_frontier_type30',
    'stage3_enemy_frontier',
    'stage3_to_stage5_spawn_scripts', 'stage3_to_stage5_bgelem',
    'pool_a_non_bee_kinds', 'closure_only_hud_result_hyper',
    'indirect_call_targets',
  ]);
  const stage3 = config.families.find((x) => x.name === 'stage3_spawn_script');
  assert.equal(stage3.stage, 2);
  assert.equal(stage3.stage_table, 0x263336);
  assert.equal(stage3.derived_type_count, 28);
  assert.equal(stage3.derived_ported_type_count, 28);
  assert.equal(config.backlog[1].status, 'COMPLETE');
  assert.match(config.backlog[1].reason,
    /W210 closes the final live Stage-3 boss scheduler entry.*Stage-4 install triple at \$263366/);
  assert.equal(config.backlog[1].derive_from,
    'stage3_spawn_script.live_rom_aux_resource');
  assert.ok(config.backlog.every((x) => x.status && x.reason));
  const frontier = config.backlog[0];
  assert.deepEqual(frontier.field_order, [
    'record', 'trigger', 'type', 'init_body', 'handler', 'movement_index',
    'movement_start', 'movement_end_exclusive',
  ]);
  assert.deepEqual(frontier.remaining_records, []);
});

test('W217 reusable coverage derives the current closed-family totals', { skip: !evidence }, () => {
  const got = run();
  assert.equal(got.status, 0, got.stdout + got.stderr);
  // W276: 8 -> 9. `$240F62[11] = $25DBB4`, the stage-clear screen, is registered in
  // `main.js` -- states 0 and 2 transcribed, state 1's gates and its menu cursor one
  // counted note. This is the number that moves when an OBJECT lands, so it is the
  // one worth pinning.
  // W374: 9 -> 14 ported and 11 -> 6 unknown. W374 registered the five FRONT-END slots
  // [7], [9], [13], [15] and [17] in `main.js`'s `defaultHandlers`. Their dispatchers
  // were ported across W372-W374 and driven by tests, but never registered, so the
  // driver could not reach them; registering them is the whole of this delta -- five
  // entries move from `unknown` to `ported` and the 20-entry table and its 0 nulls do
  // not move. 14 of the 20 top-level dispatch entries now run.
  // W375: 14 -> 15 ported and 6 -> 5 unknown. ONE slot, [14] = `$288C6C` (`src/objslot14.js`,
  // ported in W372), which W374's registration pass missed. W375 audited the whole 20-entry
  // table rather than the eye: the five still unknown -- [8] $25A770, [12] $28F3AC, [16] $256E7A,
  // [18] $24902A, [19] $28EE88 -- have NO ported dispatcher in `src/` at all. Every repo hit on
  // those five addresses is a ROM-scan assertion in `w372objdispatch.test.js`, which reads the
  // cartridge image and asserts nothing about the port. `dojcoverage.py`'s `source_registries()`
  // parses this number straight out of `main.js`'s `defaultHandlers` block, so this line and the
  // registry cannot drift apart.
  //
  // W375 again: 15 -> 16 ported and 5 -> 4 unknown, slot [8] = `$25A770`, the attract sequencer
  // (`src/objslot8.js`), ported AND registered in the same wave. The four still unknown are
  // [12] $28F3AC, [16] $256E7A, [18] $24902A, [19] $28EE88.
  //
  // W387: 16 -> 17 ported and 4 -> 3 unknown, slot [12] = `$28F3AC`, the NAME-ENTRY screen
  // (`src/objslot12.js`), ported AND registered in the same wave. It is the entry that CLOSES
  // the front-end loop: slot [14] stages dispatch type $C at +4,414 of a real cold boot and
  // this handler's teardown (`$28F368`) stages dispatch type 8 straight back. The three still
  // unknown are [16] $256E7A, [18] $24902A, [19] $28EE88, and none of them is on the cold-boot
  // path -- see `w387slot12.test.js` SECTION 3.
  assert.match(got.stdout, /top_objects: 17\/20 ported, 3 unknown, 0 null/);
  assert.match(got.stdout, /type5_calls: 23\/23 ported/);
  // W229: 72 -> 76 ported and 54 -> 50 unknown, the four the Stage-4 waves added
  // after W217 (W218's $27C81A and $27DB30, W219's Type-$40 boss, W223's $41).
  // W323: 80 -> 81 ported and 46 -> 45 unknown, type $1B ($269350). The 130 nulls do not
  // move -- a null handler was never a porting target (W315).
  // W335: 83 -> 84 ported and 43 -> 42 unknown, stage-5 type $49 ($271640).
  // W337: 84 -> 85 ported and 42 -> 41 unknown, stage-5 type $4A ($271A64).
  // W338: 85 -> 86 ported and 41 -> 40 unknown, stage-5 type $4B ($271D48).
  // W339: 86 -> 87 ported and 40 -> 39 unknown, stage-5 type $48 ($27133A). Band closed.
  // W340: 87 -> 88 ported and 39 -> 38 unknown, stage-5 type $47 ($26D7D0), $E2 records.
  // W341: 88 -> 89 ported and 38 -> 37 unknown, stage-5 type $43 ($26DE32).
  // W400: 94 -> 95 ported and 32 -> 31 unknown, type $44 ($26E02A). It is the first entry this
  // count has taken that NO stage script names: type $43 spawns it at ramp step $3C, so it was
  // never in `w314stage5scope`'s work list and the number moved anyway.
  // W481: 95 -> 96 ported and 31 -> 30 unknown, type $52 ($270694), the first child selected by
  // a corrected live type-$4C deferred lifecycle bench.
  // W482: 96 -> 97 ported and 30 -> 29 unknown, type $4E ($270222), the paired child whose expiry
  // enqueues two type-$4F records with independently biased coordinates.
  // W483: 97 -> 98 ported and 29 -> 28 unknown, type $4F ($2702E6), the nested runtime child emitted
  // twice by type $4E. The 130 null table entries remain unchanged.
  // W484: 98 -> 99 ported and 28 -> 27 unknown, type $50 ($270446), the part-4 child emitted by
  // type $4C. The 130 null table entries remain unchanged.
  // W485: 99 -> 100 ported and 27 -> 26 unknown, type $51 ($270516), the terminal child emitted when
  // type $50 expires. The 130 null table entries remain unchanged.
  assert.match(got.stdout, /enemy_types: 100\/256 ported, 26 unknown, 130 null/);
  assert.match(got.stdout, /stage1_spawn_script: 339\/339 ported/);
  assert.match(got.stdout, /stage2_spawn_script: 332\/332 ported/);
  assert.match(got.stdout, /stage3_spawn_script: 414\/414 ported, 0 unknown, 0 null/);
  assert.match(got.stdout, /stage3_enemy_frontier: 0 ordered records/);
  assert.match(got.stdout, /stage3_enemy_types: 28\/28 covered types/);
  const romBytes = readFileSync(rom);
  assert.equal(romBytes[0x234FA2 + 4], 0xA0,
    'completed Stage-3 record is type $A0 at $234FA2');
  assert.match(got.stdout, /stage2_spawn_script: 332\/332 ported, 0 unknown, 0 null/);
  assert.match(got.stdout, /stage2_spawn_script:[\s\S]*static-minus-dynamic: 304/);
  assert.match(got.stdout, /stage1_bgelem: 13\/13 ported/);
  assert.match(got.stdout, /stage2_bgelem: 8\/8 ported/);
  assert.match(got.stdout, /stage2_bgelem: 8\/8 ported, 0 unknown, 0 null, dynamic 8/);
  assert.match(got.stdout, /stage2_bgelem:[\s\S]*static-minus-dynamic: 0/);
  assert.match(got.stdout, /LOWER BOUND, address-register indirect calls remain UNKNOWN/);
  assert.match(got.stdout, /OK inventory/);
});

test('W204 both regression conditions demonstrably go red', { skip: !evidence }, () => {
  const coverage = run('--break-coverage');
  assert.equal(coverage.status, 1, coverage.stdout + coverage.stderr);
  assert.match(coverage.stdout, /FAIL coverage: lost 1 registry entries/);

  const inventory = run('--break-inventory');
  assert.equal(inventory.status, 1, inventory.stdout + inventory.stderr);
  assert.match(inventory.stdout, /DELIBERATE RED: observed object type \$FF/);

  const stage2Inventory = run('--break-stage2-spawn-inventory');
  assert.equal(stage2Inventory.status, 1, stage2Inventory.stdout + stage2Inventory.stderr);
  assert.match(stage2Inventory.stdout, /stage 2 spawn record \$2325C8 outside static inventory/);
});
