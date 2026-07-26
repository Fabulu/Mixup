#!/usr/bin/env python3
"""Dump every per-level table of Batman - Return of the Joker (GB).

    python tools/leveltables.py "<rom.gb>" [--enemies] [--objects] [--all]

Tables decoded (see docs/recon-5-gameflow.md for the full write-up):

    0:$1015   14 B  level sub-type / boss id  (bit7 = reset player state)
    0:$1023   14 B  music id, entering level fresh
    0:$1031   14 B  music id, entering level from the previous one ($FF = keep)
    0:$103F   14 B  level width in metatile columns -> $C732
    0:$286D   28 B  exit table, 2 B/level {right-edge exit, top exit}
    3:$4000   28 B  level map pointers (bank 3)
    5:$4000   56 B  4 B/level {len, src} metatile-block defs -> $C368
    5:$46EC   42 B  3 B/level {src, count} enemy records -> $C268 (32 B each)
    5:$4716   42 B  3 B/level {src, count} map objects -> $C1E8 (16 B each)
    1:$7C7D  112 B  8 B/level VRAM resource ids for sub_00_0B15, $FF-terminated
    1:$7CED   28 B  2 B/level player start {X hi, Y hi}   ($FF82 = $80)
    1:$6BC1   13 B  enemy contact damage by state; bit7 = add per-level bonus
    1:$6BCE   14 B  per-level contact-damage bonus
    1:$4BA5   11 B  $C1E8 activation half-width by object type
"""
import sys

NLEV = 14


def rd(rom, bank, addr, n):
    off = bank * 0x4000 + (addr - 0x4000 if bank else addr)
    return rom[off:off + n]


def w16(b, i):
    return b[i] | (b[i + 1] << 8)


def foff(bank, addr):
    return bank * 0x4000 + (addr - 0x4000 if bank else addr)


def main():
    rom = open(sys.argv[1], 'rb').read()
    args = set(sys.argv[2:])
    everything = '--all' in args

    sub = rd(rom, 0, 0x1015, NLEV)
    mus0 = rd(rom, 0, 0x1023, NLEV)
    mus1 = rd(rom, 0, 0x1031, NLEV)
    wid = rd(rom, 0, 0x103F, NLEV)
    exits = rd(rom, 0, 0x286D, NLEV * 2)
    maps = rd(rom, 3, 0x4000, NLEV * 2)
    blk = rd(rom, 5, 0x4000, NLEV * 4)
    ene = rd(rom, 5, 0x46EC, NLEV * 3)
    obj = rd(rom, 5, 0x4716, NLEV * 3)
    res = rd(rom, 1, 0x7C7D, NLEV * 8)
    start = rd(rom, 1, 0x7CED, NLEV * 2)

    print('lvl sub mus0 mus1 width  map(3:)  exitR exitT  start(X,Y)  '
          'enemies      objects')
    for i in range(NLEV):
        e_src, e_n = w16(ene, i * 3), ene[i * 3 + 2]
        o_src, o_n = w16(obj, i * 3), obj[i * 3 + 2]
        print(' %02X  %02X   %02X   %02X   %3d   %04X     %02X    %02X   '
              '  %02X,%02X    %04X x%d  %04X x%d' % (
                  i + 1, sub[i], mus0[i], mus1[i], wid[i], w16(maps, i * 2),
                  exits[i * 2], exits[i * 2 + 1], start[i * 2],
                  start[i * 2 + 1], e_src, e_n, o_src, o_n))

    print('\nVRAM resource ids (sub_00_0B15) 1:$7C7D')
    for i in range(NLEV):
        row = [b for b in res[i * 8:i * 8 + 8] if b != 0xFF]
        print('  L%02X: %s' % (i + 1, ' '.join('%02X' % b for b in row)))

    print('\nmetatile block defs 5:$4000')
    for i in range(NLEV):
        print('  L%02X: len=%04X src=5:%04X' %
              (i + 1, w16(blk, i * 4), w16(blk, i * 4 + 2)))

    print('\ncontact damage by enemy state, 1:$6BC1 (file $%05X)' %
          foff(1, 0x6BC1))
    dmg = rd(rom, 1, 0x6BC1, 13)
    for s, v in enumerate(dmg):
        note = ' (+ per-level bonus)' if v & 0x80 else ''
        print('  state %2d -> %d%s' % (s, v & 0x7F, note))
    print('per-level bonus 1:$6BCE (file $%05X): %s' % (
        foff(1, 0x6BCE),
        ' '.join('%d' % b for b in rd(rom, 1, 0x6BCE, NLEV))))
    print('$C1E8 activation half-width 1:$4BA5 (file $%05X): %s' % (
        foff(1, 0x4BA5),
        ' '.join('%02X' % b for b in rd(rom, 1, 0x4BA5, 11))))

    if '--enemies' in args or everything:
        print('\n=== enemy records ($C268 images, 32 B) ===')
        print('  fields: +00 flags +01 ? +02 STATE +05 facing +07/08 scrX/Y'
              ' +0A..0D hitbox +0E/0F X +10/11 Y +14 timer +16 HP +17 flash')
        for i in range(NLEV):
            src, n = w16(ene, i * 3), ene[i * 3 + 2]
            if src == 0xFFFF:
                continue
            print(' L%02X  src=5:%04X (file $%05X) n=%d' %
                  (i + 1, src, foff(5, src), n))
            for k in range(n):
                r = rd(rom, 5, src + 32 * k, 32)
                print('   [%d] state=%2d HP=%3d X=%02X.%02X Y=%02X.%02X  %s' % (
                    k, r[2], r[0x16], r[0x0E], r[0x0F], r[0x10], r[0x11],
                    ' '.join('%02X' % b for b in r)))

    if '--objects' in args or everything:
        print('\n=== map-object records ($C1E8 images, 16 B) ===')
        print('  fields: +00 type(1..11) +01/02 X +03/04 Y +05 velX +06 velY'
              ' +07 flags(b0=hurts) +0B timer +0D rider')
        for i in range(NLEV):
            src, n = w16(obj, i * 3), obj[i * 3 + 2]
            if src == 0xFFFF:
                continue
            print(' L%02X  src=5:%04X (file $%05X) n=%d' %
                  (i + 1, src, foff(5, src), n))
            for k in range(n):
                r = rd(rom, 5, src + 16 * k, 16)
                print('   [%d] type=%2d X=%02X.%02X Y=%02X.%02X  %s' % (
                    k, r[0], r[1], r[2], r[3], r[4],
                    ' '.join('%02X' % b for b in r)))


if __name__ == '__main__':
    main()
