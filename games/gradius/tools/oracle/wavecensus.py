#!/usr/bin/env python3
"""Static census of the Gradius spawn scripts, straight out of assets/prg.bin.

The ROM is the source of the INVENTORY (docs/knowledge/09-enumerate-then-validate.md).
This decodes EVERY wave record of EVERY stage the way $A2C0/$A335 does, resolves
each record to the enemy type(s) it spawns, and prints the denominators.

No emulator. Reads assets/prg.bin only.
"""
import sys, os, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
PRG = os.path.join(HERE, '..', '..', 'assets', 'prg.bin')
d = open(PRG, 'rb').read()
assert len(d) == 32768

def rd(a):  return d[a - 0x8000]
def wd(a):  return d[a - 0x8000] | (d[a - 0x8000 + 1] << 8)
def u8(v):  return v & 0xFF

# --- the 42-entry enemy handler dispatch table, $AE1C (via $AE19 JSR $83E4) ---
HANDLERS = [wd(0xAE1C + 2 * i) for i in range(42)]

# what games/gradius/src/enemies.js dispatch() implements, read from the source
PORTED_TARGETS = {0xAE70, 0xAEDD, 0xAE99, 0xAEE1, 0xB026, 0xB098,
                  0xB0AF, 0xB198, 0xB205, 0xB26C}

TBL_A = wd(0xA5FE + 0)   # single-spawn descriptors, 3 bytes stride, 4 read
TBL_B = wd(0xA5FE + 2)   # formation descriptors,   4 bytes stride

def handler_for(t):
    """$83E4 ASL A is EIGHT BIT -> index = type AND $7F."""
    a = u8(t << 1)
    if a >= 84:
        return None, a >> 1
    return HANDLERS[a >> 1], a >> 1

def decode_single(cmd):
    off = cmd * 3
    b = [rd(TBL_A + off + k) for k in range(4)]
    t = u8(b[0] - 0xA0)
    x = 0xF0
    if t >= 0x30:
        x = 0x10
        t = u8(t - 0x30)
    return dict(kind='single', cmd=cmd, desc=b, type=t, x=x,
                style=b[1], y=b[2], count=1)

def decode_formation(cmd):
    off = u8(cmd << 2)
    b = [rd(TBL_B + off + k) for k in range(4)]
    status, typ, fidx, pidx = b
    fx = u8(fidx << 1)
    f0 = rd(0xA592 + fx)
    f1 = rd(0xA593 + fx)
    py = u8(u8(pidx << 2) - pidx)
    pat = [rd(0xA5BC + py + k) for k in range(3)]
    return dict(kind='formation', cmd=cmd, desc=b, type=typ, status=status,
                count=f0 & 0x0F, x=f0 & 0xF0, y0=f1,
                formIdx=fidx, patIdx=pidx, pattern=pat)

def decode_inline5(p, stage):
    """$A37A: [trigger][cmd $F0-$FF][b2][b3][b4], cursor += 5 ($A386 LDA #$05).

    $63..$67 <- those five bytes, then $64 -= $70 and JMP $A466.
    $A466: on stage index 2 ($19 = 2) it is $A46F, which forces TYPE $96;
    otherwise $A4A6, whose $A4DC LDA $66 / STA $030C,X makes the type $66,
    i.e. the FOURTH byte of the record.
    """
    b = [rd(p + k) for k in range(5)]
    typ = 0x96 if stage == 2 else b[3]
    return dict(kind='inline5', cmd=b[1], bytes=b, type=typ,
                z64=u8(b[1] - 0x70), count=1, arm='$A46F' if stage == 2 else '$A4A6')


def stream(ptr, stage, limit=512):
    """Walk records until trigger == $FF.  A record is TWO bytes unless its cmd
    is >= $F0, in which case it is FIVE ($A386)."""
    recs = []
    p = ptr
    for _ in range(limit):
        trig = rd(p)
        if trig == 0xFF:
            recs.append(('END', p, 0xFF, None))
            break
        cmd = rd(p + 1)
        recs.append(('REC', p, trig, cmd))
        p += 5 if cmd >= 0xF0 else 2
    return recs

def main():
    out = {}
    grand_recs = 0
    grand_types = collections.Counter()
    per_stage = []
    # $A7D0 has 8 words but only SEVEN stages exist ($19 = 0..6; stage.endPage
    # is n=7).  The 8th word is $A844, which is stage 1's chunk-0 STREAM, not a
    # chunk table -- the tables are packed back to back and the 8th entry is
    # just the byte after the last one.  So each stage's chunk count is
    # (next table - this table) / 2: 8 for stages 0-1, 7 for stages 2-6.
    STAGE_TBL = [wd(0xA7D0 + 2 * i) for i in range(8)]
    for st in range(7):
        tbl = STAGE_TBL[st]
        nchunk = (STAGE_TBL[st + 1] - tbl) // 2
        chunks = []
        stage_types = collections.Counter()
        nrec = 0
        seen_ptr = {}
        for ci in range(nchunk):
            z61 = ci * 2
            ptr = rd(tbl + z61) | (rd(tbl + z61 + 1) << 8)
            recs = stream(ptr, st)
            cl = []
            for kind, p, trig, cmd in recs:
                if kind == 'END':
                    cl.append(dict(at=p, end=True))
                    continue
                nrec += 1
                grand_recs += 1
                scroll = (z61 + ((trig >> 7) & 1)) * 256 + u8(trig << 1)
                if cmd >= 0xF0:
                    r = decode_inline5(p, st)
                elif cmd < 0x80:
                    r = decode_single(cmd)
                else:
                    r = decode_formation(cmd)
                r['at'] = p
                r['trigger'] = trig
                r['scroll'] = scroll
                if r.get('type') is not None:
                    stage_types[r['type']] += 1
                    grand_types[r['type']] += 1
                cl.append(r)
            chunks.append(dict(chunk=ci, ptr=ptr, records=cl,
                               dup=seen_ptr.get(ptr)))
            seen_ptr.setdefault(ptr, ci)
        per_stage.append(dict(stage=st, table=tbl, chunks=chunks,
                              records=nrec, types=dict(stage_types)))
        out[st] = stage_types

    print("=" * 74)
    print("SPAWN SCRIPT CENSUS  (tableA=$%04X tableB=$%04X)" % (TBL_A, TBL_B))
    print("=" * 74)
    print("%-6s %-7s %-9s %s" % ("stage", "table", "records", "distinct enemy types spawned"))
    for s in per_stage:
        ts = sorted(s['types'])
        print("%-6d $%04X   %-9d %s" % (
            s['stage'], s['table'], s['records'],
            " ".join("$%02X" % t for t in ts)))
    print("\nTOTAL record READS across all 7 stage tables: %d" % grand_recs)

    # Chunk streams SHARE TAILS (stage 0 chunks 5/6/7 are the same pointer;
    # stage 2 chunk 1's stream runs through chunks 2 and 3's start addresses).
    # The honest denominator is DISTINCT record addresses.
    distinct = {}
    per_stage_distinct = collections.defaultdict(dict)
    for s in per_stage:
        for c in s['chunks']:
            for r in c['records']:
                if r.get('end'):
                    continue
                distinct[r['at']] = r
                per_stage_distinct[s['stage']][r['at']] = r
    print("DISTINCT wave records (by ROM address, $A844-$ADAA): %d" % len(distinct))

    def cov(recs):
        ok = miss = inl = 0
        for r in recs.values():
            if r['kind'] == 'inline5':
                inl += 1
                continue
            h, i = handler_for(r['type'])
            if h in PORTED_TARGETS:
                ok += 1
            else:
                miss += 1
        return ok, miss, inl

    print("\n%-6s %-9s %-8s %-8s %-8s %s"
          % ("stage", "distinct", "ported", "unported", "inline5", "ported %"))
    for st in sorted(per_stage_distinct):
        recs = per_stage_distinct[st]
        ok, miss, inl = cov(recs)
        print("%-6d %-9d %-8d %-8d %-8d %.1f%%"
              % (st, len(recs), ok, miss, inl, 100.0 * ok / max(1, len(recs))))
    ok, miss, inl = cov(distinct)
    print("%-6s %-9d %-8d %-8d %-8d %.1f%%"
          % ("ALL", len(distinct), ok, miss, inl, 100.0 * ok / max(1, len(distinct))))

    print("\n--- distinct types referenced by ANY spawn script ---")
    allt = sorted(grand_types)
    ported = []
    unported = []
    for t in allt:
        h, idx = handler_for(t)
        ok = h in PORTED_TARGETS
        (ported if ok else unported).append((t, h, idx, grand_types[t]))
    print("%d distinct types; %d have a ported handler, %d do not"
          % (len(allt), len(ported), len(unported)))
    print("\n  PORTED:")
    for t, h, i, n in ported:
        print("    type $%02X -> entry %-2d $%04X   (%d spawn records)" % (t, i, h, n))
    print("\n  NOT PORTED:")
    for t, h, i, n in unported:
        print("    type $%02X -> entry %-2d $%04X   (%d spawn records)"
              % (t, i, h if h else 0, n))

    # stage 1 detail
    print("\n" + "=" * 74)
    print("STAGE 1 ($19 = 0) RECORD BY RECORD")
    print("=" * 74)
    s = per_stage[0]
    for c in s['chunks']:
        print("\nchunk %d  ($3F & $0E = %d, scroll $%04X-)  stream $%04X%s"
              % (c['chunk'], c['chunk'] * 2, c['chunk'] * 512, c['ptr'],
                 "   [same stream as chunk %d]" % c['dup'] if c['dup'] is not None else ""))
        for r in c['records']:
            if r.get('end'):
                print("    $%04X  FF  <end>" % r['at'])
                continue
            h, i = handler_for(r['type']) if r.get('type') is not None else (None, None)
            mark = "OK " if h in PORTED_TARGETS else "MISS"
            if r['kind'] == 'inline5':
                print("    $%04X  trig $%02X scroll $%04X  cmd $%02X  INLINE-5 (unported form)"
                      % (r['at'], r['trigger'], r['scroll'], r['cmd']))
            elif r['kind'] == 'single':
                print("    $%04X  trig $%02X scroll $%04X  cmd $%02X  SINGLE  type $%02X"
                      "  x=$%02X y=$%02X style=$%02X  -> entry %d $%04X %s"
                      % (r['at'], r['trigger'], r['scroll'], r['cmd'], r['type'],
                         r['x'], r['y'], r['style'], i, h, mark))
            else:
                print("    $%04X  trig $%02X scroll $%04X  cmd $%02X  FORM n=%d type $%02X"
                      "  status $%02X x=$%02X y0=$%02X pat=%s  -> entry %d $%04X %s"
                      % (r['at'], r['trigger'], r['scroll'], r['cmd'], r['count'],
                         r['type'], r['status'], r['x'], r['y0'],
                         "".join("%02X" % v for v in r['pattern']), i, h, mark))

    if '--json' in sys.argv:
        with open(os.path.join(HERE, 'out', 'wavecensus.json'), 'w') as f:
            json.dump(per_stage, f, indent=1)

if __name__ == '__main__':
    main()
