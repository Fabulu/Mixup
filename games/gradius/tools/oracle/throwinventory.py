import os,re
rows=[]
for root,_,fs in os.walk('src'):
    for fn in sorted(fs):
        if not fn.endswith('.js'): continue
        p=os.path.join(root,fn); t=open(p,encoding='utf-8',errors='replace').read()
        for m in re.finditer(r'throw new Error\((.*?)\);', t, re.S):
            line=t[:m.start()].count('\n')+1
            body=m.group(1)
            addrs=sorted(set(int(a,16) for a in re.findall(r'\$([0-9A-F]{4})\b',body)))
            rows.append((p,line,addrs,' '.join(body.split())[:90]))
print('throw new Error() sites:',len(rows))
gate=[r for r in rows if r[2]]; inv=[r for r in rows if not r[2]]
print('  carrying >=1 ROM address        :',len(gate))
print('  no ROM address (invariant/assert):',len(inv))
a=set()
for r in gate: a.update(r[2])
print('  distinct ROM addresses named    :',len(a))
print('  '+' '.join('$%04X'%x for x in sorted(a)))
print()
for r in inv: print('  ASSERT %s:%d  %s'%(r[0],r[1],r[3][:78]))
