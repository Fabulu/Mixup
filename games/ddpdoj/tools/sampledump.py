#!/usr/bin/env python3
"""Extract ICS2115 wavetable samples out of the `ics` region into WAV files.

Input is a keyon log produced by soundprobe.lua -- the ICS2115 has no sample
directory in ROM, so the only way to know where a sample starts and ends is to
watch the Z80 program them into the chip.

    python sampledump.py --rom <romdir> --log <snd.log> --out <ripdir/wav>

Sample format (ics2115.cpp:395-411, mame0289):
    ulaw     : 1 byte/sample through the chip's u-law table
    eightbit : 1 byte/sample, signed
    otherwise: 2 bytes/sample, LITTLE-ENDIAN signed 16-bit
Addressing is banked: byte = (saddr << 20) | (addr & 0xfffff), so a sample cannot
cross a 1 MiB boundary -- it wraps inside the bank. Entries whose end < start are
exactly that case and are reported, not silently fixed.
"""
from __future__ import annotations
import argparse, os, re, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pgmgfx import _assemble, ICS_LAYOUT, ICS_SIZE

LINE = re.compile(
    r"keyon vf=(\d+) n=\d+ voice=(\d+) conf=([0-9a-f]+) fmt=(\w+) loop=(\d) "
    r"fc=([0-9a-f]+) start=([0-9a-f]+) end=([0-9a-f]+) len=(-?\d+) "
    r"vol=([0-9a-f]+) pan=([0-9a-f]+) saddr=([0-9a-f]+)")

# ICS2115 stream rate with all 32 oscillators active (ics2115.cpp:857):
#   clock / ((active_osc + 1) * 32) = 33868800 / 1024 = 33075 Hz
STREAM_HZ = 33868800 / 1024.0


def parse(log):
    out = []
    for ln in open(log, encoding="utf-8", errors="replace"):
        m = LINE.search(ln)
        if m:
            out.append(dict(vf=int(m[1]), voice=int(m[2]), conf=int(m[3], 16),
                            fmt=m[4], loop=int(m[5]), fc=int(m[6], 16),
                            start=int(m[7], 16), end=int(m[8], 16),
                            length=int(m[9]), vol=int(m[10], 16),
                            pan=int(m[11], 16), saddr=int(m[12], 16)))
    return out


def wav(path, pcm16, rate):
    data = pcm16.astype("<i2").tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, int(rate), int(rate) * 2, 2, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max", type=int, default=64, help="write at most N distinct samples")
    ap.add_argument("--png", action="store_true", help="also write a waveform PNG per sample")
    a = ap.parse_args()

    ics = np.frombuffer(_assemble(a.rom, ICS_LAYOUT, ICS_SIZE), dtype=np.uint8)
    events = parse(a.log)
    print(f"{len(events)} keyon events in {a.log}")

    seen, order = {}, []
    for e in events:
        k = (e["start"], e["end"], e["fmt"], e["saddr"])
        if k not in seen:
            seen[k] = 0
            order.append(e)
        seen[k] += 1
    print(f"{len(order)} distinct (start,end,fmt,bank) tuples")

    wrapped = [e for e in order if e["end"] <= e["start"]]
    print(f"{len(wrapped)} of them have end <= start (1 MiB bank wrap) - SKIPPED, not guessed")

    os.makedirs(a.out, exist_ok=True)
    written = 0
    order.sort(key=lambda e: -(e["end"] - e["start"]))
    for e in order:
        if written >= a.max:
            break
        if e["end"] <= e["start"]:
            continue
        raw = ics[e["start"]:e["end"]]
        if raw.size == 0 or not raw.any():
            print(f"  EMPTY at {e['start']:06x}-{e['end']:06x} (region hole?) - skipped")
            continue
        if e["fmt"] == "16bit":
            n = raw.size // 2
            pcm = raw[:n * 2].view("<i2").astype(np.int32)
        elif e["fmt"] == "8bit":
            pcm = raw.view(np.int8).astype(np.int32) << 8
        else:
            print(f"  ulaw at {e['start']:06x} - decoder not written, skipped")
            continue
        rate = max(1000, STREAM_HZ * e["fc"] / 1024.0)
        name = f"s_{e['start']:06x}_{e['end']:06x}_{e['fmt']}_fc{e['fc']:04x}"
        wav(os.path.join(a.out, name + ".wav"), np.clip(pcm, -32768, 32767), rate)
        rms = float(np.sqrt((pcm.astype(float) ** 2).mean()))
        zc = int((np.diff(np.sign(pcm)) != 0).sum())
        print(f"  {name}.wav  samples={len(pcm):7d}  rate={rate:8.1f}Hz  "
              f"rms={rms:8.1f}  zerocross={zc:7d}  plays={seen[(e['start'],e['end'],e['fmt'],e['saddr'])]}")
        if a.png:
            from PIL import Image
            W, H = 900, 160
            img = np.zeros((H, W, 3), np.uint8)
            step = max(1, len(pcm) // W)
            for x in range(min(W, len(pcm) // step)):
                seg = pcm[x * step:(x + 1) * step]
                lo = int(H / 2 - seg.max() * H / 65536.0)
                hi = int(H / 2 - seg.min() * H / 65536.0)
                img[max(0, lo):min(H, hi + 1), x] = (60, 220, 120)
            img[H // 2, :] = (80, 80, 80)
            Image.fromarray(img, "RGB").save(os.path.join(a.out, name + ".png"))
        written += 1
    print(f"wrote {written} WAV file(s) to {a.out}")


if __name__ == "__main__":
    main()
