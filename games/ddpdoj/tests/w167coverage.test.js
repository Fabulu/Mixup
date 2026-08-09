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
const ckpt = new URL('../tools/oracle/out/w69/stage1-sweep/ckpt', import.meta.url);

const evidence = [rom, w22, w25, w75, w168, w169, w170, ckpt].every((p) => existsSync(p));

function run(...args) {
  return spawnSync('python', [fileURLToPath(tool), ...args], {
    cwd: fileURLToPath(root), encoding: 'utf8', windowsHide: true,
  });
}

test('W167 config is a machine-readable family map with an exact backlog', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.schema, 1);
  assert.deepEqual(config.families.map((x) => x.name), [
    'top_objects', 'type5_calls', 'enemy_types',
    'stage1_spawn_script', 'stage2_spawn_script',
    'stage1_bgelem', 'stage2_bgelem',
  ]);
  assert.equal(config.delegated[0].tool, 'bosscoverage.py');
  assert.deepEqual(config.backlog.map((x) => x.name), [
    'stage2_enemy_frontier_type8d',
    'stage3_to_stage5_spawn_scripts', 'stage3_to_stage5_bgelem',
    'pool_a_non_bee_kinds', 'closure_only_hud_result_hyper',
    'indirect_call_targets',
  ]);
  assert.ok(config.backlog.every((x) => x.status && x.reason));
});

test('W167 reusable coverage derives the current closed-family totals', { skip: !evidence }, () => {
  const got = run();
  assert.equal(got.status, 0, got.stdout + got.stderr);
  assert.match(got.stdout, /top_objects: 7\/20 ported/);
  assert.match(got.stdout, /type5_calls: 17\/23 ported/);
  assert.match(got.stdout, /enemy_types: 30\/256 ported, 96 unknown, 130 null/);
  assert.match(got.stdout, /stage1_spawn_script: 339\/339 ported/);
  assert.match(got.stdout, /stage2_spawn_script: 262\/332 ported/);
  assert.match(got.stdout, /stage2_spawn_script: 262\/332 ported, 70 unknown, 0 null, dynamic 22/);
  assert.match(got.stdout, /stage2_spawn_script:[\s\S]*static-minus-dynamic: 310/);
  assert.match(got.stdout, /stage1_bgelem: 13\/13 ported/);
  assert.match(got.stdout, /stage2_bgelem: 8\/8 ported/);
  assert.match(got.stdout, /stage2_bgelem: 8\/8 ported, 0 unknown, 0 null, dynamic 8/);
  assert.match(got.stdout, /stage2_bgelem:[\s\S]*static-minus-dynamic: 0/);
  assert.match(got.stdout, /LOWER BOUND, address-register indirect calls remain UNKNOWN/);
  assert.match(got.stdout, /OK inventory/);
});

test('W167 both regression conditions demonstrably go red', { skip: !evidence }, () => {
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
