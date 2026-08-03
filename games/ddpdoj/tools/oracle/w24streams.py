#!/usr/bin/env python3
# W24 RECON final: complete inventory + decode loop-back/EXIT streams.
import struct, collections, json, os
IMG="games/ddpdoj/tools/oracle/out/maincpu.bin"; d=open(IMG,'rb').read()
ASSETS="games/ddpdoj/assets/w24-movement"; os.makedirs(ASSETS,exist_ok=True)
def u16(a): return struct.unpack(">H",d[a:a+2])[0]
def u32(a): return struct.unpack(">I",d[a:a+4])[0]
SCRIPT=0x230C6C; AUX=0x23170C; RES=0x231852
STAGE2_SCRIPT=0x2325D0
N=163
aux=[u16(AUX+i*2) for i in range(N)]
RES_END = STAGE2_SCRIPT  # resource ends where stage-2 spawn script begins
RES_SIZE = RES_END-RES    # $0D7E
# stream sizes: 0..161 from aux[i+1]-aux[i]; 162 = RES_END-(RES+aux[162])
sizes={}
for i in range(N-1): sizes[i]=aux[i+1]-aux[i]
sizes[N-1]=(RES_END)-(RES+aux[N-1])
print("resource #$1F stage-1: $%06X..$%06X = %d B ($%X)"%(RES,RES_END,RES_SIZE,RES_SIZE))
print("streams: N=%d, total bytes=%d (sum=%d)"%(N,RES_SIZE,sum(sizes.values())))
svals=list(sizes.values())
print(f"size: min=%d max=%d mean=%.1f  (smallest non-zero streams, largest streams)"%(min(svals),max(svals),sum(svals)/N))
# spawn records
recs=[]; a=SCRIPT
while u16(a)!=0xFFFF: recs.append((u16(a),u16(a+2),d[a+4],d[a+5],u16(a+6)&0xFFF)); a+=8
idx_used=collections.Counter(); idx_types=collections.defaultdict(set)
for t,p,ty,fl,idx in recs: idx_used[idx]+=1; idx_types[idx].add(ty)
used=[i for i in range(N) if idx_used.get(i,0)>0]
print(f"used by >=1 stage-1 spawn: %d/%d;  unused: %s"%(len(used),N,['$%03X'%i for i in range(N) if idx_used.get(i,0)==0]))
# type -> set of idx
type_idx=collections.defaultdict(set)
for i in range(N):
    for ty in idx_types.get(i,[]): type_idx[ty].add(i)
print("\ntype -> #streams used:")
for ty in sorted(type_idx): print("  \$%02X: %d streams, %d spawns"%(ty,len(type_idx[ty]),sum(idx_used[i] for i in type_idx[ty])))

ESC={0:"LOOPBACK",1:"SET_SUBANIM($1F)",2:"TOG_FLAG_bit5",3:"TOG_FLAG_bits0_13",4:"SET_A5+22",
 5:"SET_A5_word(packed)",6:"SET_REC_word(packed)",7:"SET_A5+24",8:"SET_ANIM($1E)",
 9:"Y-=\$813172+skip1B",10:"EXIT",11:"NOP"}
def decode(buf,rombase):
    o=[]; i=4; n=len(buf)  # skip 4-byte X,Y
    while i<n:
        b=buf[i]; ra=rombase+i
        if b<0x80:
            p=buf[i+1] if i+1<n else None; o.append((ra,"HEAD","h=%02X p=%02X"%(b&0x7f,(p or 0)))); i+=2
        elif b<0xC0:
            k=b&0xf; nm=ESC[k]
            if k==0: o.append((ra,"*LOOPBACK*","back %d bytes (A0-=%d)"%(buf[i+1],2*buf[i+1]))); i+=2
            elif k in(1,2,3,4,7,8,9): o.append((ra,nm,"arg=%02X"%buf[i+1])); i+=2
            elif k in(5,6): o.append((ra,nm,"off=%02X w1=%04X w2=%04X"%(buf[i+1],u16(rombase+i+2),u16(rombase+i+4)))); i+=6
            elif k==10: o.append((ra,"*EXIT*","jmp \$263762 -- terminate")); i+=1
            else: o.append((ra,nm,"")); i+=1
        else: o.append((ra,"SPEED","v=%02X -> A6+\$1A"%buf[i+1])); i+=2
    return o
opcc=collections.Counter(); esc_kind=collections.Counter()
lb=[]; ex=[]; anim_s=[]
for i in range(N):
    start=RES+aux[i]; buf=d[start:start+sizes[i]]
    ops=decode(buf,start)
    for ra,k,pl in ops:
        if k=="HEAD": opcc["HEAD"]+=1
        elif k=="SPEED": opcc["SPEED"]+=1
        else:
            opcc["ESC"]+=1
            for kk in range(12):
                if ESC[kk] in k or k.replace("*","").startswith(ESC[kk][:6]): esc_kind[kk]+=1; break
            if "LOOPBACK" in k: lb.append(i)
            if "EXIT" in k: ex.append(i)
            if "ANIM" in k: anim_s.append(i)
print("\nopcode totals: HEAD=%d  SPEED=%d  ESC=%d  (total opcodes=%d)"%(opcc["HEAD"],opcc["SPEED"],opcc["ESC"],sum(opcc.values())))
print("escape kind usage across all 163 streams:")
for k in range(12): print("  [%2d] %-26s %s"%(k,ESC[k],"USED" if esc_kind[k] else "-- NEVER USED in stage 1 --"))
print(f"\nLOOPBACK streams ({len(lb)}): {['$%03X'%i for i in lb]}")
print(f"EXIT streams    ({len(ex)}): {['$%03X'%i for i in ex]}")
print(f"SET_ANIM streams({len(anim_s)}): {['$%03X'%i for i in anim_s]}")

# Show full decode of a loopback stream and an exit stream
for pick in ['$002','$093','$094','$00A']:
    pass
print("\n=== idx \$002 (loopback) full decode ===")
i=2; start=RES+aux[i]; buf=d[start:start+sizes[i]]
print("pos X=\$%04X Y=\$%04X"%(u16(start),u16(start+2)))
for ra,k,pl in decode(buf,start): print("  \$%06X %-14s %s"%(ra,k,pl))
print("\n=== idx \$093 (loopback+exit) full decode ===")
i=0x93; start=RES+aux[i]; buf=d[start:start+sizes[i]]
print("size=%d pos X=\$%04X Y=\$%04X"%(sizes[i],u16(start),u16(start+2)))
for ra,k,pl in decode(buf,start): print("  \$%06X %-14s %s"%(ra,k,pl))

# write manifest
mani={"resource_base":"$%06X"%RES,"resource_end":"$%06X"%RES_END,"resource_size":RES_SIZE,
 "aux_table":"$%06X"%AUX,"N_streams":N,
 "opcode_totals":{k:v for k,v in opcc.items()},
 "escape_kinds":[{"idx":k,"name":ESC[k],"used":esc_kind[k]>0,"count":esc_kind[k]} for k in range(12)],
 "loopback_streams":["$%03X"%i for i in lb],"exit_streams":["$%03X"%i for i in ex],
 "set_anim_streams":["$%03X"%i for i in anim_s],
 "streams":[{"idx":i,"rom":"$%06X"%(RES+aux[i]),"off":"$%04X"%aux[i],"size":sizes[i],
   "pos_x":u16(RES+aux[i]),"pos_y":u16(RES+aux[i]+2),
   "uses":idx_used.get(i,0),"types":sorted("\$%02X"%t for t in idx_types.get(i,[])),
   "hex":d[RES+aux[i]:RES+aux[i]+sizes[i]].hex()} for i in range(N)]}
open("%s/stage1-streams.json"%ASSETS,"w").write(json.dumps(mani,indent=1))
open("%s/stage1-resource-1F.bin"%ASSETS,"wb").write(d[RES:RES_END])
print("\nwrote %s/stage1-streams.json + stage1-resource-1F.bin (%d B)"%(ASSETS,RES_SIZE))
