#!/usr/bin/env python3
"""Record the cue stream for a fixed corpus of scenarios.

The scripts/warps are lifted verbatim from tools/oracle/regress.mjs, so each
one is already known to REACH the content it names -- which matters more here
than anywhere, because a cue that is never requested by either side proves
nothing.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

SCEN = [
    # name, args
    ('l1-walk-jump-punch', ['--level', '1', '--frames', '480', '--ammo', '9',
                            '--script', '20:,' + ','.join(['3:RA,5:RB,4:R'] * 40)]),
    ('l1-water-spouts', ['--level', '1', '--frames', '400', '--warp', '95,27',
                         '--script', '400:']),
    ('l1-water-rising-hits', ['--level', '1', '--frames', '620', '--warp', '74,28',
                              '--script', '300:,40:R,40:L,240:']),
    ('l1-sewer-respawner', ['--level', '1', '--frames', '72', '--warp', '43,27',
                            '--script', '72:']),
    ('l1-rope', ['--level', '1', '--frames', '320',
                 '--script', '20:,60:R,4:U,60:,4:U,172:']),
    ('l3-object-floor', ['--level', '3', '--frames', '317',
                         '--script', '20:,120:R,20:RA,120:R,20:RA,180:R']),
    ('l3-platform-ride', ['--level', '3', '--frames', '317', '--warp', '50,21',
                          '--script', '317:']),
    ('l3-punch-connect', ['--level', '3', '--frames', '172', '--warp', '46,23',
                          '--ammo', '0',
                          '--script', '20:,32:R,6:RB,2:R,20:,6:B,20:,6:B,60:']),
    ('l3-batarang-kill', ['--level', '3', '--frames', '170', '--warp', '46,23',
                          '--ammo', '5',
                          '--script', '20:,40:R,6:B,20:,6:B,20:,6:B,40:']),
    ('l3-pit-death', ['--level', '3', '--frames', '130', '--warp', '46,23',
                      '--ammo', '0', '--script', '20:,110:L']),
    ('l4-boss1-hop-chase', ['--level', '4', '--frames', '400', '--script', '400:']),
    ('l5-walkerjump', ['--level', '5', '--frames', '620', '--script', '20:,600:R']),
    ('l5-spike-gauntlet', ['--level', '5', '--frames', '578',
                           '--script', '20:,140:R,20:RA,120:R,20:RA,120:R,'
                                       '20:RA,120:R,20:RA,320:R']),
    ('l6-conveyor', ['--level', '6', '--frames', '480', '--script', '20:,460:R']),
    ('l8-boss2-engage', ['--level', '8', '--frames', '558',
                         '--script', '20:,110:R,438:']),
    ('l9-flyer-dive', ['--level', '9', '--frames', '620', '--script', '20:,600:R']),
    ('l11-boss3-patience', ['--level', '11', '--frames', '700', '--script', '700:']),
    ('l11-boss3-punch', ['--level', '11', '--frames', '500', '--ammo', '0',
                         '--script', '20:,100:R,6:B,20:,6:B,20:,6:B,328:']),
    ('l12-shooter-approach', ['--level', '12', '--frames', '400', '--warp', '71,26',
                              '--script', '400:']),
    ('l12-shooter-fire', ['--level', '12', '--frames', '60', '--warp', '90,27',
                          '--script', '60:']),
    ('l13-walk', ['--level', '13', '--frames', '480', '--script', '20:,460:R']),
    ('l14-entrance', ['--level', '14', '--frames', '900', '--script', '900:']),
    ('l7-walk', ['--level', '7', '--frames', '480', '--script', '20:,460:R']),
    ('l2-walk', ['--level', '2', '--frames', '480', '--script', '20:,460:R']),
    ('l10-walk', ['--level', '10', '--frames', '480', '--script', '20:,460:R']),
]

only = sys.argv[1:] or None
for name, args in SCEN:
    if only and name not in only:
        continue
    print('=== ' + name, flush=True)
    subprocess.run([sys.executable, os.path.join(HERE, 'cuetrace.py'),
                    '--name', name] + args, check=True)
