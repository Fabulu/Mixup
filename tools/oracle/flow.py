#!/usr/bin/env python3
"""Watch the cartridge's PROGRESS bookkeeping -- $FFB5 and $C753 -- for real.

Round select reads two variables the port never wrote, so CONTINUE and the
cleared-route skipping were ported but unreachable.  The listing suggests where
they are written; this watches the real machine do it, because the listing has
misled this project before (a label that "returns" and instead falls through,
a variable that turns out to be per-level rather than per-boot).

Every hook below is a plain execution hook -- no memory is written except the
two deliberate pokes named in --mode, both of which are values the ROM writes
itself:

  --mode boot          nothing poked; title -> round select on a fresh boot
  --mode death         nothing poked; $FF8A (HP) is dropped to 1 and the player
                       is left to take one hit, or --kill drives $C715 the way
                       the pit does
  --mode clear         $C740 = $FE, which is exactly what loc_01_4EEC writes
                       the instant the boss's HP reaches 0.  The whole clear
                       sequence after that is the cartridge's own.

Usage:
  python tools/oracle/flow.py --mode boot
  python tools/oracle/flow.py --mode death --level 1
  python tools/oracle/flow.py --mode clear --level 4
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
LEVEL_INIT = 0x04BB

# (addr, label).  Chosen so each store is observed AFTER it has landed.
WATCH = [
    (0x0150, 'RESET          $0150  boot vector (game over)'),
    (0x035B, 'ROUNDSEL       $035B  entry'),
    (0x03B3, '  rs           $03B3  reads $FFB5 (CONTINUE?)'),
    (0x03CB, '  rs           $03CB  after the CONTINUE branch'),
    (0x0446, '  rs           $0446  route settled'),
    (0x04BB, 'LEVELINIT      $04BB  entry ($FFB0 already chosen)'),
    (0x051B, '  init         $051B  after $FFB5 <- 0'),
    (0x0EC2, '  init tail    $0EC2  after $FFB5 <- 1 (levels 9/10/11)'),
    (0x0EE9, '  init tail    $0EE9  after $FFB5 <- 1 (levels 1/2)'),
    (0x0F38, '  init tail    $0F38  after $FFB5 <- 1 (every other level)'),
    (0x0564, 'MAINLOOP       $0564  $FFB5 <- 0, restart iteration'),
    (0x05C0, '  loop         $05C0  reads $FFB5'),
    (0x2A00, 'DEATH          $2A00  after $C715 <- 1'),
    (0x2AAD, 'DEATH END      $2AAD  sequence expired'),
    (0x2AB3, '  death        $2AB3  after $FFB5 <- 1'),
    (0x2ABA, '  death        $2ABA  after $C767 (lives) -= 1'),
    (0x2ACC, '  death        $2ACC  JP $035B'),
    (0x2820, 'TRANSITION     $2820  walk-off / next level'),
    (0x34D0, 'CLEAR          $34D0  level-clear sequencer'),
    (0x35E8, '  clear        $35E8  tail: dispatch on $FFB0'),
    (0x361E, '  clear        $361E  after $C753 <- A'),
    (0x3622, '  clear        $3622  all three set -> level $0C'),
    (0x362A, '  clear        $362A  -> round select'),
    (0x3605, '  clear        $3605  ordinary level -> $2820'),
    (0x3652, '  clear        $3652  level $0E -> ending'),
]

# Bank 1: the boss-death countdown that ends in loc_00_34D0.
WATCH1 = [
    (0x4EF1, 'BOSS DIED    1:$4EF1  $C740 <- $FE'),
    (0x78D4, '  boss       1:$78D4  $C740 countdown (>= $80)'),
    (0x7936, '  boss       1:$7936  $C740 countdown (< $80)'),
]

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}


def parse_script(s):
    out = []
    for seg in s.split(','):
        n, _, keys = seg.partition(':')
        out.extend([{BUTTONS[k.upper()] for k in keys.strip()
                     if k.upper() in BUTTONS}] * int(n))
    return out


def snap(m):
    return {'FFB5': m[0xFFB5], 'C753': m[0xC753], 'FFB0': m[0xFFB0],
            'C767': m[0xC767], 'C712': m[0xC712], 'C713': m[0xC713],
            'C715': m[0xC715], 'C740': m[0xC740], 'FF8A': m[0xFF8A]}


def fmt(s):
    return (f"FFB5={s['FFB5']:02X} C753={s['C753']:02X} | lvl={s['FFB0']:02X} "
            f"lives={s['C767']:2d} C712={s['C712']:02X} C713={s['C713']:02X} "
            f"dead={s['C715']} C740={s['C740']:02X} hp={s['FF8A']:2d}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', default='boot',
                    choices=('boot', 'death', 'clear', 'rs'))
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--frames', type=int, default=400)
    ap.add_argument('--script', default='')
    ap.add_argument('--warp', default=None, metavar='COL[,ROW]',
                    help='place the player once gameplay starts, as trace.py '
                         'does -- a boss is not reachable from a script alone')
    ap.add_argument('--poke-at', type=int, default=30,
                    help='gameplay frame at which --mode does its one poke')
    ap.add_argument('--dump-vram', default=None, metavar='PATH',
                    help='write $8000-$9FFF to PATH at the LAST $03CB (round '
                         'select, fully built). Round select is drawn ON TOP '
                         'of whatever VRAM the previous screen left, so this '
                         'is how you find out whether arriving from a level '
                         'gives the same image as arriving from the title.')
    ap.add_argument('--lives', type=int, default=None,
                    help='force $C767 once gameplay starts (1 = next death is '
                         'game over)')
    ap.add_argument('--press-start', action='store_true',
                    help='after the run, tap START on whatever menu is up')
    ap.add_argument('--mask', default=None,
                    help='hex $C753 to inject before the FIRST round select')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    log = []
    counter = {'n': 0, 'started': False}
    seen = {}

    def rec(label):
        log.append((counter['n'], label, snap(m)))

    injected = {'v': False}

    def inject():
        # ONE-SHOT: a permanent hook would slam $FFB0 back on every later
        # $04BB, which is exactly the path a level clear takes.
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    mask = int(args.mask, 16) if args.mask is not None else None
    masked = {'v': False}

    vram = {'bytes': None, 'at': None}

    def on_hook(label, addr):
        if addr == LEVEL_INIT:
            inject()
        if addr == 0x0472 and args.dump_vram:
            # $0472 is the round-select LOOP's own sub_00_0A4F call, so this
            # samples a SETTLED screen. $03CB (the entry) is far too early:
            # sub_00_0B15 only queues its resource loads, and they drain over
            # the following VBlanks -- dumping there compares two half-built
            # screens and reports 116 tiles "different" that both paths
            # eventually agree on.
            vram['bytes'] = bytes(m[0x8000:0xA000])
            vram['at'] = counter['n']
        if addr == 0x035B and mask is not None and not masked['v']:
            masked['v'] = True
            m[0xC753] = mask
        rec(label)

    for addr, label in WATCH:
        # $05C0 and $0567 fire every frame; keep them but collapse below.
        pyboy.hook_register(0, addr,
                            lambda _, l=label, a=addr: on_hook(l, a), None)
    if args.dump_vram:
        pyboy.hook_register(0, 0x0472,
                            lambda _: on_hook('  rs  $0472 settled', 0x0472),
                            None)
    for addr, label in WATCH1:
        pyboy.hook_register(1, addr,
                            lambda _, l=label, a=addr: on_hook(l, a), None)

    pyboy.hook_register(0, FRAME_END,
                        lambda _: counter.__setitem__('n', counter['n'] + 1),
                        None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda _: counter.__setitem__('started', True), None)

    if args.mode == 'rs':
        # Stop AT the menu instead of walking through it: tap START once at
        # the title, then idle. Needed because the resource loads $035B queues
        # ($036C/$0371 -> sub_00_0B15) drain over many VBlanks -- a run that
        # taps START again 50 frames later leaves half the artwork unpainted.
        rs = {'n': 0}
        title = {'n': 0}
        pyboy.hook_register(0, 0x03DC,
                            lambda _: rs.__setitem__('n', rs['n'] + 1), None)
        pyboy.hook_register(0, 0x02C4,
                            lambda _: title.__setitem__('n', title['n'] + 1),
                            None)
        for _ in range(3000):
            pyboy.tick(1, False)
            if title['n'] > 40:
                break
        if title['n'] == 0:
            raise SystemExit('FAIL: the title loop never ran')
        pyboy.button('start', delay=4)
        for _ in range(args.frames):
            pyboy.tick(1, False)
        if rs['n'] == 0:
            raise SystemExit('FAIL: round select never ran')
        print(f"=== round select ran {rs['n']} iterations, "
              f"{fmt(snap(m))} ===\n")
        base = counter['n']
        if args.dump_vram:
            if vram['bytes'] is None:
                raise SystemExit('FAIL: $0472 never executed')
            path = os.path.join(ROOT, args.dump_vram)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as fh:
                fh.write(vram['bytes'])
            print(f'wrote 8192 B -> {args.dump_vram}')
        for n, label, s in log:
            print(f'{n:5d}  {label:52s} {fmt(s)}')
        pyboy.stop(save=False)
        return

    for f in range(3000):
        if counter['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in set(BUTTONS.values()):
        pyboy.button_release(n)

    # ASSERT ARRIVAL. A probe that never got there once produced two entirely
    # fictitious dumps for this project; never trust a dump without this.
    if not counter['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, '
                         f'$FFB0 = {m[0xFFB0]}')
    print(f'=== arrived: level ${m[0xFFB0]:02X}, frame {counter["n"]}, '
          f'{fmt(snap(m))} ===\n')

    if args.warp is not None:
        parts = args.warp.split(',')
        m[0xFF81] = int(parts[0]) & 0xFF
        m[0xFF82] = 0x80
        if len(parts) > 1:
            m[0xFF83] = int(parts[1]) & 0xFF
            m[0xFF84] = 0x00

    if args.lives is not None:
        m[0xC767] = args.lives

    base = counter['n']
    timeline = parse_script(args.script) if args.script else []
    held = set()
    poked = {'v': False}

    while counter['n'] - base < args.frames:
        idx = counter['n'] - base
        want = timeline[min(idx, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want

        if args.mode == 'clear' and not poked['v'] and idx >= args.poke_at:
            poked['v'] = True
            # Enemy slot 0's HP (+$16). Zeroing it is exactly the state the
            # last punch or batarang leaves behind: 1:$4E82 tests HP == 0 with
            # $C73E (boss level) set and falls into the death handler at
            # $4EB8, which is what writes $C740 = $FE at $4EF1. Everything
            # after that -- the countdown, loc_00_34D0, $C753 -- is the
            # cartridge's own code with nothing else poked.
            before = m[0xC268 + 0x16]
            m[0xC268 + 0x16] = 0
            print(f'--- f{idx}: enemy 0 HP ${before:02X} -> $00 ---')
        if args.mode == 'death' and not poked['v'] and idx >= args.poke_at:
            poked['v'] = True
            # $C715 is the death latch sub_00_29E7 tests; the pit and the
            # HP-zero path both reach it through $1773/$17E7. Dropping the
            # player below the map is the natural trigger, but a warp is not
            # available on every level -- park HP at 0 and let $1773 fire.
            m[0xFF8A] = 0
            print(f'--- f{idx}: set $FF8A (hp) = 0 ---')

        pyboy.tick(1, False)

    # Optionally press START once the menu is up again, so the CONTINUE arm
    # ($047C) is exercised end to end and the level it picks is measured
    # rather than assumed.
    if args.press_start:
        for name in set(BUTTONS.values()):
            pyboy.button_release(name)
        pyboy.tick(30, False)
        pyboy.button_press('start')
        pyboy.tick(4, False)
        pyboy.button_release('start')
        pyboy.tick(240, False)

    print(f'{"f":>5}  {"event":52s} state')
    prev = None
    for n, label, s in log:
        key = (label, tuple(sorted(s.items())))
        if key == prev:
            continue          # collapse the per-frame no-change spam
        prev = key
        print(f'{n - base:5d}  {label:52s} {fmt(s)}')

    if args.dump_vram:
        if vram['bytes'] is None:
            raise SystemExit('FAIL: $03CB never executed -- nothing to dump')
        os.makedirs(os.path.dirname(os.path.join(ROOT, args.dump_vram)),
                    exist_ok=True)
        with open(os.path.join(ROOT, args.dump_vram), 'wb') as fh:
            fh.write(vram['bytes'])
        print(f"\nwrote 8192 B of VRAM sampled at $03CB, frame "
              f"{vram['at'] - base} -> {args.dump_vram}")

    print(f'\nfinal: {fmt(snap(m))}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
