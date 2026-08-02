#!/usr/bin/env python3
# INDEPENDENT REVIEW mutation harness for W24 (scratch, not committed).
# For each (file, old, new) mutation: apply, run the targeted test files,
# record pass/fail, restore byte-identical, assert the SHA matches baseline.
import hashlib, subprocess, sys, os

ROOT = r"C:\programmieren\batman"
FILES = {
    "nmi.js":   os.path.join(ROOT, "games\\gradius\\src\\nmi.js"),
    "flow.js":  os.path.join(ROOT, "games\\gradius\\src\\flow.js"),
    "sound.js": os.path.join(ROOT, "games\\gradius\\src\\sound.js"),
}
TESTS = ["--test",
         "games/gradius/tests/w24-substate.test.js",
         "games/gradius/tests/flow.test.js",
         "games/gradius/tests/collision.test.js"]

def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

baselines = {k: sha(v) for k, v in FILES.items()}

# (label, file, old, new)
MUT = [
    ("F1 st9A4D BCC polarity >= -> >",        "nmi.js",
     "if (state.cam.hi >= res.stage.bossPage) {         // $9A4F-$9A54 CMP $9A3D,X / BCC $9A5B",
     "if (state.cam.hi >  res.stage.bossPage) {         // MUT"),
    ("F2 st9A0E rank->0 (rankCountdown[0])",  "nmi.js",
     "state.zp4D = res.stage.rankCountdown[rank];        // $9A1E LDA $9A35,X / STA $4D",
     "state.zp4D = res.stage.rankCountdown[0];           // MUT rank->0"),
    ("F3 st99E9 16-bit borrow dropped",       "nmi.js",
     "  else { state.zp4C = 0xFF; state.zp4D = u8(state.zp4D - 1); } // $8415 DEC $01,X",
     "  else { state.zp4C = 0xFF; /* MUT borrow dropped */ }"),
    ("F4 st99E9 zero-test reads only $4C",    "nmi.js",
     "  if ((state.zp4C | state.zp4D) !== 0) {             // $99F2/$99F4 ORA / D0 $9A5E",
     "  if ((state.zp4C            ) !== 0) {             // MUT only $4C"),
    ("F5 st99C0 stage-boundary >=5 -> >=4",   "nmi.js",
     "  if (state.zp19 >= 5) {                             // $99C4 CMP #$05 / BCC $99D3",
     "  if (state.zp19 >= 4) {                             // MUT"),
    ("F6 st9982 BEQ polarity === -> !==",     "nmi.js",
     "  if (state.cam.hi === res.stage.bossPage) {         // $9986 CMP $9A3D,X / BEQ $99BA",
     "  if (state.cam.hi !== res.stage.bossPage) {         // MUT"),
    ("F7 st9982 boss type $98 -> $99",        "nmi.js",
     "  state.obj.type[bi] = 0x98;                         // $99A2 STA $0315 (boss type)",
     "  state.obj.type[bi] = 0x99;                         // MUT"),
    ("F8 sub994A guard $D0 -> $D1",           "nmi.js",
     "  if (state.cam.lo < 0xD0) return;                   // $994C CPX #$D0 / BCC $997D",
     "  if (state.cam.lo < 0xD1) return;                   // MUT"),
    ("F9 sub994A guard < -> <= ",             "nmi.js",
     "  if (state.cam.lo < 0xD0) return;                   // $994C CPX #$D0 / BCC $997D",
     "  if (state.cam.lo <= 0xD0) return;                  // MUT <= refuses $D0"),
    ("F10 sub994A object-clear $14 -> $15",   "nmi.js",
     "  if (x >= 0x14) return;                             // $9970 CPX #$14 / BCS $997D",
     "  if (x >= 0x15) return;                             // MUT (expected GREEN survivor)"),
    ("F11 st997E dead fall-through advanced", "nmi.js",
     "  // $9980 BNE $99B7 -- always taken ($5B was 0, now 1). Fall-through is DEAD.\n  mode5Body(state, res);                             // $99B7 JMP $9A5E",
     "  // MUT fall-through implemented\n  state.substate = u8(state.substate + 1);\n  mode5Body(state, res);"),
    ("F12 gameOverArm $B0 gate inverted",     "nmi.js",
     "  if (pulse1Dur(state) !== 0) {                      // $96FD LDA $B0 / BNE $975D",
     "  if (pulse1Dur(state) === 0) {                      // MUT inverted"),
    ("F13 continueTimeout $4C!=0 -> ==0",     "nmi.js",
     "  if (state.zp4C !== 0) {                            // $9715/$9717 BNE $975B",
     "  if (state.zp4C === 0) {                            // MUT"),
    ("F14 enterGameOver $1B $C0 -> $C1",      "flow.js",
     "  state.substate = 0xC0;                             // $97FD/$97FF LDA #$C0 / STA $1B",
     "  state.substate = 0xC1;                             // MUT"),
    ("F15 enterGameOver $4C $78 -> $77",      "flow.js",
     "  state.zp4C = 0x78;                                 // $9823/$9825 STA $4C (120)",
     "  state.zp4C = 0x77;                                 // MUT"),
    ("F16 pulse1Dur OFF.DUR -> OWNER",        "sound.js",
     "export const pulse1Dur = (state) => state.snd[OFF.DUR];",
     "export const pulse1Dur = (state) => state.snd[OFF.OWNER];"),
]

def run_tests():
    p = subprocess.run(["node"] + TESTS, cwd=ROOT, capture_output=True, text=True, timeout=120)
    tail = p.stdout.strip().splitlines()[-8:]
    passed = any("# pass" in l for l in tail)
    m_pass = None
    for l in tail:
        if "# pass" in l:
            m_pass = l
    fail_line = next((l for l in tail if "# fail" in l), "?")
    return p.returncode, m_pass, fail_line, tail

print("baseline tests:")
rc, mp, fl, tail = run_tests()
print(" ", mp, fl, "rc=", rc)
print()

results = []
for label, fk, old, new in MUT:
    path = FILES[fk]
    src = open(path, "r", encoding="utf-8").read()
    if old not in src:
        print(f"SKIP (anchor not found): {label}")
        results.append((label, "ANCHOR-MISSING", ""))
        continue
    if src.count(old) > 1:
        print(f"WARN (anchor not unique, {src.count(old)}): {label}")
    mut = src.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(mut)
    rc, mp, fl, tail = run_tests()
    # restore
    open(path, "w", encoding="utf-8").write(src)
    after = sha(path)
    ok = (after == baselines[fk])
    red = (rc != 0)
    tag = "RED" if red else "GREEN"
    print(f"[{tag:5}] sha_ok={ok}  {label}")
    if not red:
        print("     tail:", " | ".join(l.strip() for l in tail[-3:]))
    results.append((label, tag, "sha_ok" if ok else "SHA-MISMATCH"))

print()
print("restore check (all must equal baseline):")
for k, v in FILES.items():
    print(f"  {k}: {sha(v) == baselines[k]}")

print()
print("summary:")
for label, tag, extra in results:
    print(f"  {tag:14} {extra:12} {label}")
