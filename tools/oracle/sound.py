#!/usr/bin/env python3
"""Record the real ROM's APU register writes for a given sound id.

The sound driver lives in bank 7 and is called from the TIMER interrupt, once
per 4096/69 Hz tick. This drives it the way the game does -- by queueing a
request through sub_00_0AE1 -- and captures every NR write it produces, tick by
tick, so the ported driver can be diffed against it.

Usage:
  python tools/oracle/sound.py --id 0x10 --ticks 300
  python tools/oracle/sound.py --id 2 --ticks 900 --out rip/oracle/sfx02.json
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
DRIVER = 0x412B      # bank 7 -- one tick of the sound engine
QUEUE = 0xC6FB       # 4 request slots, 2 bytes each
NR_LO, NR_HI = 0xFF10, 0xFF3F


def boot(pyboy, max_frames=2000):
    started = {'v': False}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for f in range(max_frames):
        if started['v']:
            return
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', default='0x10',
                    help='sound id, the B value passed to sub_00_0AE1')
    ap.add_argument('--mask', default='0x01', help='the C value (request kind)')
    ap.add_argument('--ticks', type=int, default=300,
                    help='driver ticks to record after the request')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    sound_id = int(args.id, 0)
    mask = int(args.mask, 0)

    # Sound emulation ON: without it PyBoy does not keep the NR registers in
    # its memory map at all, and every read comes back unchanged.
    pyboy = PyBoy(ROM, window='null', sound_emulated=True)
    pyboy.set_emulation_speed(0)
    boot(pyboy)

    # One entry per driver tick; each is the list of writes that tick made.
    ticks = []
    pending = []
    counting = {'n': 0}

    def on_driver(_):
        # The hook fires on ENTRY, so close off the previous tick first.
        if counting['n'] > 0:
            ticks.append(pending.copy())
        pending.clear()
        counting['n'] += 1

    pyboy.hook_register(7, DRIVER, on_driver, None)

    # PyBoy has no memory-write hook, and polling the register block is not
    # good enough: NR13/NR14 (and their per-channel equivalents) are write-only
    # and read back masked, so every frequency write is invisible to a poll.
    #
    # Instead hook the driver's actual store instructions and take the
    # destination out of the register file. The output stage stages values in
    # $FFD8-$FFDB and copies them to $FF11 + ch*5, so most writes come through
    # a handful of `LD [HL+], A` sites; the rest are `LDH [C], A` or direct.
    # Hooking liberally and filtering on the address range is safer than
    # trying to prove which sites can reach the APU.
    HL_SITES = [0x4307, 0x4311, 0x4319, 0x431D, 0x431F, 0x4324,
                0x42EB, 0x42EE, 0x42F6]
    C_SITES = [0x42D1, 0x42D4, 0x42A4, 0x4003, 0x4006, 0x400D, 0x4012,
               0x405A, 0x421B, 0x4228, 0x4233, 0x425E]
    DIRECT = {0x42CA: 0xFF1A, 0x42DF: 0xFF1A, 0x4015: 0xFF1C,
              0x4019: 0xFF1A, 0x401B: 0xFF1E, 0x401F: 0xFF10}

    def record(addr, value):
        # $FF26's low bits are read-only channel status, and wave RAM is only
        # meaningful as a block; both are kept, the driver never writes junk.
        if NR_LO <= addr <= NR_HI:
            pending.append([addr, value])

    def hl_hook(_):
        rf = pyboy.register_file
        record(rf.HL, rf.A)

    def c_hook(_):
        rf = pyboy.register_file
        record(0xFF00 + rf.C, rf.A)

    for pc in HL_SITES:
        pyboy.hook_register(7, pc, hl_hook, None)
    for pc in C_SITES:
        pyboy.hook_register(7, pc, c_hook, None)
    for pc, addr in DIRECT.items():
        pyboy.hook_register(7, pc, (lambda a: lambda _: record(a, pyboy.register_file.A))(addr), None)

    # Queue the request exactly as sub_00_0AE1 would.
    m = pyboy.memory
    for slot in range(4):
        if m[QUEUE + slot * 2] == 0 and m[QUEUE + slot * 2 + 1] == 0:
            m[QUEUE + slot * 2] = sound_id
            m[QUEUE + slot * 2 + 1] = mask
            break

    guard = 0
    while len(ticks) < args.ticks and guard < args.ticks * 40 + 2000:
        guard += 1
        pyboy.tick(1, False)

    out = args.out or os.path.join(ROOT, 'rip/oracle',
                                   f'sound_{sound_id:02X}.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump({'id': sound_id, 'mask': mask, 'ticks': ticks}, f)

    nonempty = sum(1 for t in ticks if t)
    total = sum(len(t) for t in ticks)
    print(f'id ${sound_id:02X}: {len(ticks)} ticks, {nonempty} with writes, '
          f'{total} writes total -> {out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
