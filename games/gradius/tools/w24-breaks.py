#!/usr/bin/env python3
# W24 mutation table: break each fix, run the tests, watch RED, restore,
# SHA-256-verify both ways. RULE 4: every check must be seen to fail.
#
# Run:  python games/gradius/tools/w24-breaks.py
# Reads the files fresh each time; restores from an in-memory backup so the
# poisoned git index never enters the picture.
import hashlib, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]   # .../batman (tools/gradius/games/batman)
SRC = {
    'nmi':   ROOT/'games/gradius/src/nmi.js',
    'flow':  ROOT/'games/gradius/src/flow.js',
    'sound': ROOT/'games/gradius/src/sound.js',
}
TEST = ['node', '--test', 'games/gradius/tests/w24-substate.test.js',
        'games/gradius/tests/collision.test.js', 'games/gradius/tests/flow.test.js']

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]

def run_tests():
    r = subprocess.run(TEST, cwd=ROOT, capture_output=True, text=True, timeout=120)
    # extract the summary line
    for line in (r.stdout + r.stderr).splitlines():
        if line.startswith('# pass') or line.startswith('# fail'):
            sys.stdout.write('    ' + line + '\n')
    return r.returncode

# (file_key, unique_find, replace_with, label)
MUTATIONS = [
    ('nmi',   'state.substate = 0x81;                           // $9A59 STA $1B',
              'state.substate = 0x82;                           // $9A59 STA $1B',
              '$80 exit: $81 -> $82'),
    ('nmi',   'state.zp4D = res.stage.rankCountdown[rank];        // $9A1E',
              'state.zp4D = res.stage.rankCountdown[0];           // $9A1E (mut: rank->0)',
              '$81 $4D reads rank 0 not rank'),
    ('nmi',   'state.zp4C = 0;                                    // $9A23/$9A25 STA $4C',
              'state.zp4C = 1;                                    // $9A23/$9A25 STA $4C (mut)',
              '$81 $4C not cleared'),
    ('nmi',   'else { state.zp4C = 0xFF; state.zp4D = u8(state.zp4D - 1); } // $8415',
              'else { state.zp4C = 0xFF; /* mut: borrow dropped */ }',
              '$82 16-bit borrow dropped'),
    ('nmi',   'state.spawn.z60 = 0;                               // $99F8 STA $60',
              'state.spawn.z60 = 1;                               // $99F8 STA $60 (mut)',
              '$82 $60 not reset'),
    ('nmi',   'if (state.zp19 === 0 || state.zp19 === 3) {        // $99FC/$9A00',
              'if (state.zp19 === 1 || state.zp19 === 3) {        // $99FC (mut: stage 1)',
              '$82 sfx gate fires on stage 1'),
    ('nmi',   'state.spawn.z62 = 2;                               // $99D7 STA $62',
              'state.spawn.z62 = 1;                               // $99D7 STA $62 (mut)',
              '$83 $62 := 1 not 2'),
    ('nmi',   'if (state.cam.hi === res.stage.bossPage) {         // $9986 CMP',
              'if (state.cam.hi !== res.stage.bossPage) {         // $9986 CMP (mut: inverted)',
              '$84 BEQ polarity inverted'),
    ('nmi',   'state.obj.type[bi] = 0x98;                         // $99A2 STA $0315 (boss type)',
              'state.obj.type[bi] = 0x99;                         // $99A2 (mut: type $99)',
              '$84 boss type $98 -> $99'),
    ('nmi',   'state.spawn.z5E = 0x3F;                            // $99B3 LDA #$3F / STA $5E (cursor)',
              'state.spawn.z5E = 0x3E;                            // $99B3 (mut: $3E)',
              '$84 $5E seed $3F -> $3E'),
    ('nmi',   'if (state.cam.lo < 0xD0) return;                   // $994C CPX #$D0',
              'if (state.cam.lo < 0xD1) return;                   // $994C CPX #$D1 (mut)',
              '$994A guard $D0 -> $D1'),
    ('nmi',   'if (x >= 0x14) return;                             // $9970 CPX #$14',
              'if (x >= 0x15) return;                             // $9970 CPX #$15 (mut)',
              '$994A object-clear bound $14 -> $15'),
    ('nmi',   'state.zp5B = u8(state.zp5B + 1);                   // $997E INC $5B',
              '/* mut: $997E INC $5B dropped */',
              '$85 INC $5B dropped'),
    ('nmi',   'if (pulse1Dur(state) !== 0) {                      // $96FD LDA $B0',
              'if (pulse1Dur(state) === 0) {                      // $96FD (mut: inverted)',
              '$96FB $B0 gate inverted'),
    ('nmi',   'state.zp4C = u8(state.zp4C - 1);                 // $975B DEC $4C',
              '/* mut: $975B DEC $4C dropped */ state.zp4C = state.zp4C;',
              '$96FB $4C not decremented'),
    ('sound', 'export const pulse1Dur = (state) => state.snd[OFF.DUR];',
              'export const pulse1Dur = (state) => state.snd[OFF.OWNER];',
              'pulse1Dur reads OWNER not DUR'),
    ('flow',  'state.substate = 0xC0;                             // $97FD/$97FF LDA #$C0',
              'state.substate = 0xC1;                             // $97FF (mut: $C1)',
              '$97F1 $1B := $C1 not $C0'),
    ('flow',  'state.zp4C = 0x78;                                 // $9823/$9825 STA $4C (120)',
              'state.zp4C = 0x77;                                 // $9825 (mut: $77)',
              '$97F1 $4C := $77 not $78'),
]

def main():
    # baseline: GREEN
    print('=== BASELINE (expect GREEN) ===')
    rc = run_tests()
    if rc != 0:
        print('BASELINE NOT GREEN -- aborting'); sys.exit(1)
    print('baseline GREEN\n')

    backups = {k: p.read_bytes() for k, p in SRC.items()}
    base_shas = {k: sha(p) for k, p in SRC.items()}

    results = []
    for fkey, find, repl, label in MUTATIONS:
        p = SRC[fkey]
        data = backups[fkey]
        fbytes = find.encode('utf-8'); rbytes = repl.encode('utf-8')
        if fbytes not in data:
            print(f'!! MUTANT NOT APPLIED (find string not found): {label}')
            results.append((label, 'NOT-APPLIED')); continue
        p.write_bytes(data.replace(fbytes, rbytes, 1))
        rc = run_tests()
        red = rc != 0
        # restore
        p.write_bytes(data)
        restored_sha = sha(p)
        ok = restored_sha == base_shas[fkey]
        results.append((label, 'RED' if red else 'GREEN', 'restored' if ok else 'SHA-MISMATCH'))
        flag = 'OK red' if red else '** GREEN **'
        print(f'[{flag}] {label}  (restore {"ok" if ok else "FAIL"})')

    print('\n=== RESTORE VERIFICATION ===')
    all_ok = all(sha(p) == base_shas[k] for k, p in SRC.items())
    print('all files SHA-256 == baseline:', all_ok)
    # final re-run
    print('\n=== FINAL RE-RUN (expect GREEN) ===')
    rc = run_tests()
    print('final GREEN' if rc == 0 else 'final NOT GREEN -- a restore failed!')

    n_red = sum(1 for r in results if r[1] == 'RED')
    print(f'\n{n_red} of {len(results)} mutations went RED')
    greens = [r[0] for r in results if r[1] == 'GREEN']
    if greens:
        print('GREEN survivors (named in worklog):')
        for g in greens: print('  -', g)

if __name__ == '__main__':
    main()
