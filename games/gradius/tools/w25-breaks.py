#!/usr/bin/env python3
# W25 mutation table: break each W25 fix, run the tests, watch RED, restore,
# SHA-256-verify both ways. RULE 4: every check must be seen to fail.
#
# Run:  python games/gradius/tools/w25-breaks.py
# Reads enemies.js fresh each time; restores from an in-memory backup so the
# poisoned git index never enters the picture. Modeled on w24-breaks.py.
import hashlib, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]   # .../batman
SRC = ROOT / 'games/gradius/src/enemies.js'
TEST = ['node', '--test', 'games/gradius/tests/w25-volcano.test.js',
        'games/gradius/tests/enemies-unwitnessed.test.js']

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]

def run_tests():
    r = subprocess.run(TEST, cwd=ROOT, capture_output=True, text=True, timeout=120)
    for line in (r.stdout + r.stderr).splitlines():
        if line.startswith('# pass') or line.startswith('# fail'):
            sys.stdout.write('    ' + line + '\n')
    return r.returncode

# (unique_find, replace_with, label). Each find must be unique in enemies.js.
# Verified unique by grep before this table was frozen.
MUTATIONS = [
    # ---- the $02 & 3 gate (the eruption cadence) ---------------------------
    ('if ((state.frame & 0x03) !== 0) return;   // $C417 F0 01 / $C419 60 RTS',
     'if ((state.frame & 0x00) !== 0) return;   // $C417 (mut: gate dropped -> every frame spawns)',
     '$C413 $02 & 3 gate dropped'),
    # ---- the pattern stepper nibble polarity --------------------------------
    ('  if (aa !== 0) {                            // $C473 D0 09 BNE $C47E\n'
     '    nibble = patternByte & 0x0F;             // $C47E LDA $A9 (the low nibble)\n'
     '  } else {\n'
     '    nibble = (patternByte >>> 4) & 0x0F;     // $C475 4x LSR A (high -> low)\n'
     '  }',
     '  if (aa !== 0) {                            // $C473 (mut: nibble polarity swapped)\n'
     '    nibble = (patternByte >>> 4) & 0x0F;     // high nibble instead of low\n'
     '  } else {\n'
     '    nibble = patternByte & 0x0F;             // low instead of high\n'
     '  }',
     'sub_C44F nibble polarity swapped'),
    # ---- the $69 $FF -> $7F wrap --------------------------------------------
    ('  if (cursor === 0xFF) {                     // $C45B C9 FF / $C45D D0 BNE',
     '  if (cursor === 0xFE) {                     // $C45B (mut: $FE boundary)',
     'sub_C44F $69 $FF wrap -> $FE'),
    # ---- the volcano type byte ----------------------------------------------
    ('  o.type[i] = 0x0A;                         // $C4DA LDA #$0A / STA $030C,X',
     '  o.type[i] = 0x0B;                         // $C4DA (mut: type $0B)',
     'st_C486 type $0A -> $0B'),
    # ---- the volcano Y position ---------------------------------------------
    ('  o.y[i] = 0x90;                            // $C4DF LDA #$90 / STA $032C,X',
     '  o.y[i] = 0x80;                            // $C4DF (mut: y $80)',
     'st_C486 y $90 -> $80'),
    # ---- the eruption sfx gate ----------------------------------------------
    ('  if (sp.z69 === 0) {                        // $C488 D0 05',
     '  if (sp.z69 !== 0) {                        // $C488 (mut: inverted)',
     'st_C486 sfx $69==0 gate inverted'),
    # ---- the crater X position table base -----------------------------------
    ('  o.x[i] = rom.read(0xC4F4 + aa);           // $C4D2 LDY $AA / LDA $C4F4,Y / STA $036C,X',
     '  o.x[i] = rom.read(0xC4F5 + aa);           // $C4D2 (mut: $C4F5 wrong table)',
     'st_C486 crater table $C4F4 -> $C4F5'),
    # ---- the 7-arm dispatch: stage 0 target ---------------------------------
    ('    case 0xC486: return st_C486(state, rom);   // stage 1 -- the volcano',
     '    case 0xC487: return st_C486(state, rom);   // stage 1 (mut: $C487)',
     'jt_C439 stage 0 target $C486 -> $C487'),
    # ---- the handler's gravity (velSubAccel in h_B36F) ----------------------
    ('  subY16(state, j);                       // $B1E8 JSR $B140\n'
     '  velSubAccel(state, j);                  // $B1EB JSR $B120\n'
     '  offScreenCheck(state);                  // $B1EE JMP  $B251',
     '  subY16(state, j);                       // $B1E8 JSR $B140\n'
     '  /* mut: velSubAccel dropped -- no gravity */\n'
     '  offScreenCheck(state);                  // $B1EE JMP  $B251',
     'h_B36F velSubAccel (gravity) dropped'),
    # ---- the handler init frame (setInitialised in h_B36F) ------------------
    ('  if (!(o.type[i] & 0x80)) {             // $B36F LDA $030C,X / $B372 BPL $B3A7\n'
     '    return setInitialised(state, j);      // $B3A7 JMP $B0B4 (first frame only)\n'
     '  }',
     '  if (!(o.type[i] & 0x80)) {             // $B36F (mut: init skipped)\n'
     '    /* mut: setInitialised dropped -- no init frame */\n'
     '  }',
     'h_B36F init (setInitialised) dropped'),
    # ---- the yvel ramp-down bound -------------------------------------------
    ('    if (cursor < 0x0A) {                     // $C4B5 C9 0A / $C4B7 B0 06 BCS skip',
     '    if (cursor < 0x09) {                     // $C4B5 (mut: $09 boundary)',
     'st_C486 yvel ramp $0A -> $09'),
]

def main():
    baseline = SRC.read_bytes()
    base_sha = sha(SRC)
    print(f'baseline enemies.js SHA {base_sha}\n')
    results = []
    for find, repl, label in MUTATIONS:
        text = baseline.decode('utf-8')
        count = text.count(find)
        if count != 1:
            print(f'!! SKIP "{label}": find count {count} (need 1)')
            results.append((label, 'SKIP', count))
            continue
        SRC.write_bytes(text.replace(find, repl, 1).encode('utf-8'))
        rc = run_tests()
        went_red = (rc != 0)
        # restore
        SRC.write_bytes(baseline)
        restored = sha(SRC)
        ok = (restored == base_sha)
        status = 'RED' if went_red else 'GREEN'
        tag = '' if ok else '  !! SHA MISMATCH'
        print(f'  [{status}]{tag}  {label}')
        results.append((label, status, restored))
    # final restore + verify
    SRC.write_bytes(baseline)
    print(f'\nrestored SHA {sha(SRC)} ({"== baseline" if sha(SRC)==base_sha else "MISMATCH"})')
    red = sum(1 for _, s, _ in results if s == 'RED')
    green = sum(1 for _, s, _ in results if s == 'GREEN')
    skip = sum(1 for _, s, _ in results if s == 'SKIP')
    print(f'{red} RED, {green} GREEN, {skip} SKIP of {len(results)} mutations')
    return 0 if (green == 0 and skip == 0) else 1

if __name__ == '__main__':
    sys.exit(main())
