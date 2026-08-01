#!/usr/bin/env python3
"""census.py -- STATIC enumeration of the Gradius enemy system out of the PRG.

Wave 20 recon. The rule (docs/knowledge/09-enumerate-then-validate.md): the ROM
is the source of the INVENTORY. Nothing here runs the emulator; every number is
counted out of `games/gradius/assets/prg.bin`.

  python games/gradius/tools/census.py dispatch   # the 42-entry $AE1C table
  python games/gradius/tools/census.py waves      # every wave record, 7 stages
  python games/gradius/tools/census.py types      # every enemy type referenced
  python games/gradius/tools/census.py tables     # every table the handlers index
  python games/gradius/tools/census.py all
"""
import sys, os, collections

ROM = os.path.join(os.path.dirname(__file__), '..', 'assets', 'prg.bin')
D = open(ROM, 'rb').read()
assert len(D) == 0x8000, len(D)


def b(a):
    return D[a - 0x8000]


def w(a):
    return b(a) | (b(a + 1) << 8)


def rng(a, n):
    return [b(a + i) for i in range(n)]


def hx(vs):
    return ' '.join('%02X' % v for v in vs)


# --------------------------------------------------------------- dispatch ---
DISPATCH = 0xAE1C
NENT = 42


def dispatch_table():
    return [w(DISPATCH + 2 * i) for i in range(NENT)]


# ---- what the port implements. Read out of games/gradius/src/enemies.js so
# ---- this cannot drift from the source; the switch lists `case 0xNNNN:`.
def ported_targets():
    p = os.path.join(os.path.dirname(__file__), '..', 'src', 'enemies.js')
    src = open(p, encoding='utf-8').read()
    i = src.index('function dispatch(state, rom, j, type)')
    body = src[i:src.index('\n}\n', i)]
    out = set()
    for line in body.splitlines():
        line = line.strip()
        if line.startswith('case 0x'):
            out.add(int(line[5:line.index(':')], 16))
    return out


# ------------------------------------------------------------------ waves ---
STAGE_PTRS = 0xA7D0
NSTAGES = 7


def chunk_tables():
    """stage -> list of wave-list pointers. The chunk table's length is not
    stored; it is bounded by the next chunk table (they are contiguous)."""
    heads = [w(STAGE_PTRS + 2 * s) for s in range(NSTAGES)]
    ends = heads[1:] + [w(heads[0])]     # first pointer of stage 0 = first list
    out = []
    for s in range(NSTAGES):
        n = (ends[s] - heads[s]) // 2
        out.append([w(heads[s] + 2 * i) for i in range(n)])
    return heads, out


def wave_list(ptr, limit=512):
    """2-byte records until $FF. cmd >= $F0 is a 5-byte INLINE record."""
    recs, a = [], ptr
    while len(recs) < limit:
        t = b(a)
        if t == 0xFF:
            recs.append((a, 0xFF, None, 1))
            break
        cmd = b(a + 1)
        if cmd >= 0xF0:
            recs.append((a, t, cmd, 5))
            a += 5
        else:
            recs.append((a, t, cmd, 2))
            a += 2
    return recs


# ------------------------------------------------------------- descriptors --
TABA = 0xA662        # cmd < $80, stride 3, four bytes read
TABB = 0xA602        # cmd $80..    , stride 4
GEOM = 0xA592        # $66 -> [countNibble|spawnX, firstY]   2 bytes
PATT = 0xA5BC        # $67 -> [delay, dY, style]             3 bytes


def descB(cmd):
    return rng(TABB + 4 * ((4 * cmd) & 0xFF) // 4, 4) if False else rng(TABB + ((4 * cmd) & 0xFF), 4)


def descA(cmd):
    return rng(TABA + 3 * cmd, 4)


def typeA(d64):
    """$A3B1: type = $64-$A0 from the right (X=$F0); if >= $30, $64-$D0 from
    the left (X=$10)."""
    t = (d64 - 0xA0) & 0xFF
    if t >= 0x30:
        return (d64 - 0xD0) & 0xFF, 0x10
    return t, 0xF0


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    tab = dispatch_table()
    port = ported_targets()

    if cmd in ('dispatch', 'all'):
        print('=== $AE1C dispatch table: %d entries ===' % NENT)
        print('raw', hx(rng(DISPATCH, 2 * NENT)))
        for i, t in enumerate(tab):
            print('%2d  $%04X  types $%02X/$%02X  %s'
                  % (i, t, i, i | 0x80, 'PORTED' if t in port else 'THROWS'))
        n = sum(1 for t in tab if t in port)
        print('entries ported %d / %d ; throwing %d' % (n, NENT, NENT - n))
        d = collections.Counter(tab)
        print('distinct targets %d ; distinct ported %d ; distinct throwing %d'
              % (len(d), len({t for t in tab if t in port}),
                 len({t for t in tab if t not in port})))
        for t, c in sorted(d.items()):
            if c > 1:
                print('  $%04X shared by %d entries: %s'
                      % (t, c, [i for i, x in enumerate(tab) if x == t]))

    heads, chunks = chunk_tables()
    if cmd in ('waves', 'all'):
        print('\n=== wave lists ===')
        print('stage pointer table $A7D0:', ' '.join('$%04X' % h for h in heads))
        tot = 0
        for s in range(NSTAGES):
            print(' stage %d chunk table $%04X, %d chunks: %s'
                  % (s, heads[s], len(chunks[s]),
                     ' '.join('$%04X' % p for p in chunks[s])))
            for ci, p in enumerate(chunks[s]):
                r = wave_list(p)
                tot += len(r)
                body = ' '.join(('%02X:--' % t) if c is None else '%02X:%02X' % (t, c)
                                for _, t, c, _ in r)
                print('   chunk %d $%04X  %2d recs  %s' % (ci, p, len(r), body))
        print(' TOTAL wave records (incl. $FF terminators): %d' % tot)

    # every cmd, every type, everywhere
    cmds = collections.Counter()
    per_stage = collections.defaultdict(collections.Counter)
    inline = []
    for s in range(NSTAGES):
        for p in chunks[s]:
            for a, t, c, ln in wave_list(p):
                if c is None:
                    continue
                cmds[c] += 1
                per_stage[s][c] += 1
                if ln == 5:
                    inline.append((s, a, rng(a, 5)))

    if cmd in ('types', 'all'):
        print('\n=== every wave cmd used, and the enemy type it spawns ===')
        typeuse = collections.Counter()
        formuse, pattuse = collections.Counter(), collections.Counter()
        for c in sorted(cmds):
            if c >= 0xF0:
                print(' cmd $%02X  x%-4d INLINE 5-byte record' % (c, cmds[c]))
                continue
            if c >= 0x80:
                d = descB(c)
                typeuse[d[1]] += cmds[c]
                formuse[d[2]] += cmds[c]
                pattuse[d[3]] += cmds[c]
                g = rng(GEOM + 2 * d[2], 2)
                pt = rng(PATT + 3 * d[3], 3)
                print(' cmd $%02X  x%-4d FORMATION $A602+%02X = %s -> type $%02X '
                      'entry %2d  form %02X(%s: n=%d x=$%02X y=$%02X) '
                      'patt %02X(%s: delay=%d dY=$%02X style=$%02X)'
                      % (c, cmds[c], (4 * c) & 0xFF, hx(d), d[1], d[1] & 0x7F,
                         d[2], hx(g), g[0] & 0x0F, g[0] & 0xF0, g[1],
                         d[3], hx(pt), pt[0], pt[1], pt[2]))
            else:
                d = descA(c)
                t, x = typeA(d[0])
                typeuse[t] += cmds[c]
                print(' cmd $%02X  x%-4d SINGLE    $A662+%02X = %s -> type $%02X '
                      'entry %2d  spawnX $%02X  Y $%02X  style $%02X'
                      % (c, cmds[c], 3 * c, hx(d), t, t & 0x7F, x, d[2], d[1]))
        print('\n --- enemy types actually referenced by the wave data ---')
        for t in sorted(typeuse):
            e = t & 0x7F
            tgt = tab[e] if e < NENT else None
            print('  type $%02X -> entry %2d -> %s  x%d spawns  %s'
                  % (t, e, ('$%04X' % tgt) if tgt else 'OUT OF TABLE',
                     typeuse[t], 'PORTED' if tgt in port else 'THROWS'))
        print('  %d distinct types, %d distinct dispatch entries'
              % (len(typeuse), len({t & 0x7F for t in typeuse})))
        print('\n  formation-geometry indices used: %s (max %d)'
              % (sorted(formuse), max(formuse)))
        print('  pattern indices used            : %s (max %d)'
              % (sorted(pattuse), max(pattuse)))
        print('  inline (cmd>=$F0) records: %d %s'
              % (len(inline), [(s, '$%04X' % a, hx(v)) for s, a, v in inline]))

    if cmd in ('tables', 'all'):
        print('\n=== tables the handlers index ===')
        T = [
            ('$ADC1 status animation groups, 4 bytes x 8+1', 0xADC1, 36),
            ('$AE71 explosion script pointers (6 x 2)', 0xAE71, 12),
            ('$AE7D explosion scripts', 0xAE7D, 0x1C),
            ('$AF0A metasprites for entries 32-37', 0xAF0A, 6),
            ('$B01D speed by rank ($17+stage flags), 9', 0xB01D, 9),
            ('$B086 turret metasprite by octant, 6', 0xB086, 6),
            ('$B08C turret bullet pattern (plain), 6', 0xB08C, 6),
            ('$B092 turret bullet pattern (armoured), 6', 0xB092, 6),
            ('$B200 arc phase table, 5', 0xB200, 5),
            ('$B33B anim frames for $B31E, 8', 0xB33B, 8),
            ('$B3C2 anim frames for $B37F, 9', 0xB3C2, 9),
            ('$B42F phase table for $B402, 5', 0xB42F, 5),
            ('$B45C phase table for $B434, 5', 0xB45C, 5),
            ('$B4E4 fire delay by rank, 7', 0xB4E4, 7),
            ('$B4EB fire delay by rank #2, 7', 0xB4EB, 7),
            ('$B650 $B628 animator records (4 x 3)', 0xB650, 12),
            ('$B6D2 speed by rank, 7', 0xB6D2, 7),
            ('$B6D9 metasprite by facing, 4', 0xB6D9, 4),
            ('$B6DD bullet pattern by facing, 4', 0xB6DD, 4),
            ('$B787 fire period by rank, 8', 0xB787, 8),
            ('$B78F X speed frac by rank, 8', 0xB78F, 8),
            ('$B797 metasprite by $048C, 2', 0xB797, 2),
            ('$B799 Y speed frac by rank, 8', 0xB799, 8),
            ('$B852 hits to kill by rank, 8', 0xB852, 8),
            ('$B8E6 boss bullet Y offset, 3', 0xB8E6, 3),
            ('$B8E9 boss bullet ?, 3', 0xB8E9, 3),
            ('$B8EC boss bullet ?, 3', 0xB8EC, 3),
            ('$B8EF core damage metasprites, 7', 0xB8EF, 7),
            ('$B8F8 core Y speed frac by rank, 9', 0xB8F8, 9),
            ('$B901 core Y speed int by rank, 9', 0xB901, 9),
            ('$B90A core fire period by rank, 9', 0xB90A, 9),
            ('$BAF7 core spread dX, 4', 0xBAF7, 4),
            ('$BAFB core spread dY, 4', 0xBAFB, 4),
            ('$BAFF core spread xvel int by rank, 8', 0xBAFF, 8),
            ('$BB07 core spread xvel frac by rank, 8', 0xBB07, 8),
            # 26 two-byte records then $FF at $BBB6. prgmap.txt calls $BB9B a
            # 14-word pointer table; it is not, it is the tail of this script.
            ('$BB82 $BB0F path script, 26 x [dX,Yhi|msLo], $FF-term', 0xBB82, 0x35),
            ('$BE6E death sound by type, $22', 0xBE6E, 0x22),
            ('$BFC5 type $9A hits by rank, 9', 0xBFC5, 9),
            ('$BFCE shot box dX, 4', 0xBFCE, 4),
            ('$BFD2 shot box W, 4', 0xBFD2, 4),
            ('$BFD6 shot box dY, 4', 0xBFD6, 4),
            ('$BFDE enemy box H by class, 4', 0xBFDE, 4),
            ('$C936 $C906 period by rank, 7', 0xC936, 7),
            ('$CA49 $CA5E damage thresh A by rank, 7', 0xCA49, 7),
            ('$CA50 $CA5E damage thresh B by rank, 7', 0xCA50, 7),
            ('$CA57 $CA5E Y speed by rank, 7', 0xCA57, 7),
            ('$BC32 bullet ?', 0xBC32, 0x20),
            ('$BC64 bullet ?', 0xBC64, 0x20),
            ('$BDD1 bullet ?', 0xBDD1, 4),
        ]
        for name, a, n in T:
            print('  %-52s $%04X  %s' % (name, a, hx(rng(a, n))))


if __name__ == '__main__':
    main()
