#!/usr/bin/env python3
"""Export bank 7's sound data for the JS driver.

The driver itself (7:$412B) gets hand-translated like every other routine; this
only lifts the DATA it reads, the same way export_assets.py lifts level and
metasprite data. Master-ref §8 documents the formats; tools/dumpsong.py proves
they decode by round-tripping all 47 songs.

What comes out:
  pitch[]    84 x LE16, biased -$80  (7:$46D5)
  songs[]    47 entries, each a list of {slot, chan, ptr}  (7:$477D)
  wave[]     the ONE waveform the whole game uses  (7:$47FA)
  seq        the raw $4000-$7FFF bank image, because sequences, envelopes and
             sub-patterns are all pointers into it and chasing every one to
             slice it up would be more fragile than shipping the bank.

  python tools/export_sound.py        # -> assets/sound.json
"""
import argparse
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Same seam as gbrom.GAME_ROOT and tools/oracle/_env.mjs's GAME_ROOT: the ROM
# is repo level, the exported assets are game level.
GAME_ROOT = os.path.join(ROOT, 'games', 'batman')
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

BANK = 7
PITCH_TAB, PITCH_N = 0x46D5, 84
SONG_TAB, SONG_N = 0x477D, 47
WAVE = 0x47FA


class Bank:
    """Bank 7 as the CPU sees it: addresses $4000-$7FFF."""

    def __init__(self, path):
        with open(path, 'rb') as f:
            self.d = f.read()
        self.base = BANK * 0x4000

    def b(self, a):
        return self.d[self.base + (a - 0x4000)]

    def w(self, a):
        return self.b(a) | (self.b(a + 1) << 8)

    def image(self):
        return list(self.d[self.base:self.base + 0x4000])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rom', default=ROM)
    ap.add_argument('--out', default=os.path.join(GAME_ROOT, 'assets/sound.json'))
    args = ap.parse_args()

    rom = Bank(args.rom)

    # 84 pitches, C2-B8, stored biased by -$80 so the driver can add detune
    # without a second table.
    pitch = [rom.w(PITCH_TAB + i * 2) for i in range(PITCH_N)]

    # Each song header is a $FF-terminated list of {track slot, hardware
    # channel, sequence pointer}.
    songs = []
    for i in range(SONG_N):
        p = rom.w(SONG_TAB + i * 2)
        tracks = []
        a = p
        # Guard: a malformed pointer must not run off the end of the bank.
        while 0x4000 <= a < 0x7FFC and rom.b(a) != 0xFF and len(tracks) < 8:
            tracks.append({'slot': rom.b(a), 'chan': rom.b(a + 1),
                           'ptr': rom.w(a + 2)})
            a += 4
        songs.append({'id': i, 'ptr': p, 'tracks': tracks})

    out = {
        'note': 'bank-7 sound DATA only; the driver is hand-ported',
        'tickHz': 4096 / 69,          # TMA $BB, TAC clock 00 -- see $024A
        'pitchTable': PITCH_TAB,
        'pitch': pitch,
        'songTable': SONG_TAB,
        'songs': songs,
        'waveAddr': WAVE,
        'wave': [rom.b(WAVE + i) for i in range(16)],
        'bankBase': 0x4000,
        'bank': rom.image(),
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(out, f)

    live = sum(1 for s in songs if s['tracks'])
    print('%d songs (%d with tracks), %d pitches, %d KB bank image -> %s'
          % (len(songs), live, len(pitch), len(out['bank']) // 1024, args.out))
    for s in songs[:12]:
        chans = ' '.join('s%d/c%d@$%04X' % (t['slot'], t['chan'], t['ptr'])
                         for t in s['tracks'])
        print('  $%02X: %s' % (s['id'], chans or '(empty)'))


if __name__ == '__main__':
    main()
