#!/bin/sh
# Diff one breakcells.py recording against its breakport.mjs twin, normalising
# only the VelX column (the cartridge dump prints the raw unsigned byte, the
# port the signed value). Everything else -- position, air, hp, the watched
# cells and the whole $C67B slot table -- must match line for line.
#
#   sh tools/oracle/breakdiff.sh 5 36,27 right R 40 37,29 37,30 37,31
set -e
LVL=$1; WARP=$2; HOLD=$3; HOLDP=$4; FRAMES=$5; shift 5
CELLS=""
for c in "$@"; do CELLS="$CELLS --cell $c"; done

norm() {
  awk '$1 ~ /^[0-9]+$/ {
    vx = $4 + 0; if (vx > 127) vx -= 256;
    line = $1" "$2" "$3" "vx;
    for (i = 5; i <= NF; i++) { if ($i == "|") break; line = line" "$i }
    print line
  }'
}

python tools/oracle/breakcells.py --level "$LVL" --warp "$WARP" --hold "$HOLD" \
  $CELLS --frames "$FRAMES" 2>/dev/null | norm > /tmp/breakdiff-rom.txt
node tools/oracle/breakport.mjs --level "$LVL" --warp "$WARP" --hold "$HOLDP" --vy -3 \
  $CELLS --frames "$FRAMES" | norm > /tmp/breakdiff-port.txt

# the slot table, compared separately so a coordinate error cannot hide
slots() { sed -n 's/.*| \(.*\) |.*/\1/p'; }
python tools/oracle/breakcells.py --level "$LVL" --warp "$WARP" --hold "$HOLD" \
  $CELLS --frames "$FRAMES" 2>/dev/null | slots > /tmp/breakdiff-roms.txt
node tools/oracle/breakport.mjs --level "$LVL" --warp "$WARP" --hold "$HOLDP" --vy -3 \
  $CELLS --frames "$FRAMES" | slots > /tmp/breakdiff-ports.txt

if diff -q /tmp/breakdiff-rom.txt /tmp/breakdiff-port.txt >/dev/null \
   && diff -q /tmp/breakdiff-roms.txt /tmp/breakdiff-ports.txt >/dev/null; then
  echo "PASS  L$LVL warp $WARP hold $HOLD  ($FRAMES frames, state + $C67B slots identical)"
else
  echo "FAIL  L$LVL warp $WARP hold $HOLD"
  diff /tmp/breakdiff-rom.txt /tmp/breakdiff-port.txt | head -20
  diff /tmp/breakdiff-roms.txt /tmp/breakdiff-ports.txt | head -20
  exit 1
fi
