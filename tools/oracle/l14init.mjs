// LEVEL-14 INIT, $0DD9-$0E0B -- the five bytes the entrance depends on, and
// the ORDER the difficulty arm has to run in.
//
// This is a PORT-ONLY check with an assertion for every value, because the
// cartridge side of it is already covered elsewhere (diffhunt l14-entrance @
// $C756 = 0 and = 2, ragediff.mjs, hudgateprobe.py) and none of those can run
// without PyBoy. It needs only assets/manifest.json.
//
//   node tools/oracle/l14init.mjs            # all three difficulties
//   node tools/oracle/l14init.mjs --diff 2   # just hard
//
// Exits non-zero on any mismatch.
//
// THE LISTING, verbatim, because two of these are ordering facts rather than
// values (disasm bank 0):
//
//     0DD9: FE 0E      CP $0E
//     0DDB: C2 74 0E   JP NZ, loc_00_0E74
//     0DDE: 3E 01      LD A, $01
//     0DE0: EA 50 C7   LD [$C750], A        boss/entrance gate
//     0DE3: EA 40 C7   LD [$C740], A        HUD + damage gate  <- entranceHold
//     0DE6: 3E 78      LD A, $78
//     0DE8: EA 41 C7   LD [$C741], A        phase-1 countdown
//     0DEB..0DF8       $FFBA-$FFBD = $08 $80 $1E $00   the balloon
//     0DF7: AF         XOR A
//     0DFA: EA 3D C7   LD [$C73D], A        <- CLEARS the hard arm's enrage
//     0DFD: 3E FF      LD A, $FF
//     0DFF: E0 AD      LDH [$FFAD], A       <- BGP = $FF, the blackout
//     0E01: FA 56 C7   LD A, [$C756]        and only NOW the easy arm
//
// Two consequences that a plausible reading gets backwards:
//
//   1. $0D73-$0DB8's HARD arm ($C27E += 5, $C73D = 1) runs BEFORE this block,
//      so $0DFA leaves level 14's enrage latch CLEARED on hard exactly as it
//      is on normal -- while the +5 boss HP survives. MEASURED (diffhunt
//      l14-entrance @ $C756 = 2): with the port's block above the difficulty
//      call, bossRage read 1 against the cartridge's 0 for all 900 frames, the
//      fight visibly diverging at f732 and the player 10 HP against 8 by f881.
//
//   2. $0DFD BLACKS THE BACKGROUND OUT for the whole entrance, and 1:$77D5 is
//      the RESTORE ($FFAD = $E4 when phase 2 begins). Without the seed there
//      is nothing to restore from. MEASURED cost (pixeldiff l14-walk): f40 and
//      f80 are 20299 wrong pixels each, 11.90% match, rows 32-37 solid.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { effects, c740Idle } = await imp('src/effects.js');
const { resolveLoadout } = await imp('src/mods.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const one = arg('diff', null);
const diffs = one === null ? [0, 1, 2] : [parseInt(one, 10)];

let bad = 0;
const check = (label, got, want, note) => {
  const ok = got === want;
  if (!ok) bad++;
  const g = typeof got === 'number' ? `$${got.toString(16).toUpperCase()}` : String(got);
  const w = typeof want === 'number' ? `$${want.toString(16).toUpperCase()}` : String(want);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(34)} got ${g.padEnd(6)} want ${w}` +
              (note ? `   ${note}` : ''));
};

for (const diff of diffs) {
  console.log(`\n$C756 = ${diff}`);
  const state = createState(makeTunables());
  state.loadout = resolveLoadout([]);
  state.flow.difficulty = diff;
  await initLevel(state, 0x0E);

  // The straightforward ones.
  check('$0DE0  $C750 bossMode', state.flow.bossMode, 1);
  check('$0DE3  $C740 entranceHold', effects(state).entranceHold, 1);
  check('$0DE3  ... so c740Idle is FALSE', c740Idle(state), false,
        'the HUD and both damage gates read it');
  check('$0DE8  $C741 bossHop', state.flow.bossHop, 0x78);
  check('$0DEB  $FFBA/$FFBB balloonX', state.flow.balloonX, 0x0880);
  check('$0DF3  $FFBC/$FFBD balloonY', state.flow.balloonY, 0x1E00);

  // The ordering one. $0DFA runs AFTER $0D8A, so hard must look like normal.
  check('$0DFA  $C73D bossRage', state.flow.bossRage, 0,
        diff === 2 ? '(the hard arm set it, $0DFA clears it)' : '');
  // ...but the hard arm's OTHER write must survive, or "the order is right"
  // would also be satisfied by never running the hard arm at all.
  if (diff === 2) {
    const hp = state.enemies[0][0x16];
    check('$0D83  $C27E boss HP bonus', hp > 0, true, `+5 applied, HP = ${hp}`);
  }
  // $0E07's easy arm, which the ROM reaches AFTER this block.
  if (diff === 0) check('$0E07  $C288 chaser off', state.enemies[1][0], 0x40);

  // The blackout.
  check('$0DFD  $FFAD BGP', state.video.bgp, 0xFF,
        '1:$77D5 restores $E4 when phase 2 starts');
}

console.log(bad === 0 ? '\nPASS' : `\nFAIL -- ${bad} mismatch(es)`);
process.exit(bad === 0 ? 0 : 1);
