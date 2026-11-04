"""Cut the trailer: 30 s, 1080x1920, H.264 + AAC (RUN's ad video: MP4, 15-30 s, under 100 MB).

    python3 tools/trailer/edit.py <work dir> <out.mp4>

<work dir> holds the clips made by assemble.py (awaken, home, rampage, battle .mp4) and the
captions made by cards.mjs (cards/*.png). The music is the owner's theme, "The Assembly",
from MUSIC_AT: a quiet stretch under the title and the storm, the hit on IT'S ALIVE!.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MUSIC = ROOT / 'public/cdn-assets/audio/theme.mp3'
MUSIC_AT = 120.6

# (clip, in, out) in each clip's own seconds; the cut runs them back to back.
SHOTS = [
    ('card:open', 0, 1.8),
    ('awaken', 3.8, 8.2),  # the storm, the strike, IT'S ALIVE!
    ('home', 9.6, 13.2),  # it breaks out: IT'S LOOSE!
    ('rampage', 1.5, 2.9),  # RAMPAGE!
    ('rampage', 4.6, 7.0),  # smashing, villagers fight back
    ('rampage', 10.9, 12.7),  # It strides
    ('rampage', 52.6, 54.8),  # It rages: lightning
    ('rampage', 64.6, 67.4),  # the town hall falls, in slow motion
    ('battle', 7.0, 9.6),  # Battle!
    ('battle', 29.4, 32.0),  # Devoured!
    ('home', 18.0, 22.4),  # the creature at home, Awaken oozing
]
# (caption, from, to) in trailer seconds
CAPTIONS = [
    ('stamp', 6.2, 9.8),  # hides the build stamp under the home
    ('smash', 11.2, 13.6),
    ('wake', 15.4, 17.6),
    ('topple', 17.8, 20.4),
    ('battle', 20.4, 23.0),
    ('devour', 23.2, 25.6),
    ('end', 25.6, 30.0),
]
# Per-clip touch-ups: the waking scene's Skip button is painted out (delogo).
CROP = {'awaken': 'delogo=x=882:y=26:w=166:h=122'}


def main(work, out):
    work = Path(work)
    total = sum(b - a for _, a, b in SHOTS)
    inputs, filters, labels = [], [], []
    clips = {}

    def add_input(*args):
        inputs.extend(args)
        return len([a for a in inputs if a == '-i']) - 1

    for i, (src, a, b) in enumerate(SHOTS):
        if src.startswith('card:'):
            k = add_input('-loop', '1', '-framerate', '30', '-t', f'{b - a}', '-i',
                          str(work / 'cards' / f'{src[5:]}.png'))
            filters.append(f'[{k}:v]format=yuv420p,scale=1080:1920,setsar=1,fps=30[s{i}]')
        else:
            if src not in clips:
                clips[src] = add_input('-i', str(work / f'{src}.mp4'))
            k = clips[src]
            crop = f'{CROP[src]},' if src in CROP else ''
            filters.append(f'[{k}:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,{crop}'
                           f'format=yuv420p,setsar=1,fps=30[s{i}]')
        labels.append(f'[s{i}]')
    filters.append(f"{''.join(labels)}concat=n={len(SHOTS)}:v=1:a=0[cut]")
    last = 'cut'
    for j, (name, a, b) in enumerate(CAPTIONS):
        k = add_input('-loop', '1', '-framerate', '30', '-t', f'{total}', '-i',
                      str(work / 'cards' / f'{name}.png'))
        fades = '' if name == 'stamp' else (f',fade=in:st={a}:d=0.25:alpha=1'
                                            f',fade=out:st={b - 0.25}:d=0.25:alpha=1')
        filters.append(f'[{k}:v]format=rgba{fades}[c{j}]')
        filters.append(f"[{last}][c{j}]overlay=0:0:enable='between(t,{a},{b})'[v{j}]")
        last = f'v{j}'
    filters.append(f'[{last}]fade=in:st=0:d=0.4,fade=out:st={total - 0.6}:d=0.6[video]')
    m = add_input('-ss', f'{MUSIC_AT}', '-t', f'{total}', '-i', str(MUSIC))
    filters.append(f'[{m}:a]afade=in:st=0:d=0.3,afade=out:st={total - 1.8}:d=1.8[audio]')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(filters),
           '-map', '[video]', '-map', '[audio]', '-t', f'{total}',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
           '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out)]
    subprocess.run(cmd, check=True)
    print(out, f'{total:.1f}s')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
