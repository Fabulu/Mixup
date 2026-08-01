import sys, os, collections
sys.path.insert(0, os.getcwd())
import wavecensus as g
rd,wd,u8=g.rd,g.wd,g.u8
HANDLERS=g.HANDLERS; PORTED=g.PORTED_TARGETS; hf=g.handler_for
T=[wd(0xA7D0+2*i) for i in range(8)]
EDGES={0x0F:[0x09], 0x10:[0x0C]}
ALWAYS=[0x01,0x02]
allneed=set()
print("%-6s %-6s %-7s %s"%("stage","need","ported","MISSING dispatch entries"))
for st in range(7):
    n=(T[st+1]-T[st])//2
    types=set()
    for ci in range(n):
        p=rd(T[st]+2*ci)|(rd(T[st]+2*ci+1)<<8)
        for kind,a,trig,cmd in g.stream(p,st):
            if kind=='END': continue
            r = g.decode_inline5(a,st) if cmd>=0xF0 else (g.decode_single(cmd) if cmd<0x80 else g.decode_formation(cmd))
            types.add(r['type'])
    work=list(types)
    while work:
        t=work.pop()
        for u in EDGES.get(t&0x7F,[]):
            if u not in types: types.add(u); work.append(u)
    types.update(ALWAYS)
    need=sorted({hf(t)[1] for t in types if hf(t)[1]<42})
    ok=[e for e in need if HANDLERS[e] in PORTED]
    miss=[e for e in need if HANDLERS[e] not in PORTED]
    allneed.update(need)
    print("%-6d %-6d %-7d %s"%(st,len(need),len(ok)," ".join("%d:$%04X"%(e,HANDLERS[e]) for e in miss)))
need=sorted(allneed); ok=[e for e in need if HANDLERS[e] in PORTED]
print("\nUNION over the 7 stage scripts: %d of 42 entries needed, %d ported, %d missing"%(len(need),len(ok),len(need)-len(ok)))
print("entries no stage script needs:", " ".join(str(e) for e in range(42) if e not in allneed))
