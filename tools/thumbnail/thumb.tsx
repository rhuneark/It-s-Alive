// Renders the store thumbnail (512x512). Screenshot it with tools/thumbnail/render.mjs.
import { createRoot } from 'react-dom/client';
import { Monster } from '../../src/components/Monster';
import '../../src/style.css';

const PARTS = {
  head: 'head_werewolf',
  torso: 'torso_gravedigger',
  armR: 'arm_crab',
  armL: 'arm_mantis',
  legL: 'leg_rooster',
  legR: 'leg_bear',
  browEye: 'eye_snake',
  heart: 'heart_vampire',
  tail: 'tail_devil',
  horns: 'horns_demon',
  wings: 'wings_bat',
} as const;

createRoot(document.getElementById('root')!).render(
  <div className="thumb">
    <Monster parts={PARTS} spark="spark_lightning" className="thumb-monster" />
    <div className="thumb-title">It's Alive!</div>
    <div className="thumb-sub">Vote. Stitch. Awaken.</div>
  </div>,
);

const css = document.createElement('style');
css.textContent = `
  html, body { margin: 0; width: 512px; height: 512px; overflow: hidden; background: #0d0a10; }
  .thumb { position: relative; width: 512px; height: 512px; display: flex; justify-content: center; }
  .thumb .thumb-monster { position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 512px; height: auto; aspect-ratio: 160 / 224; border: none; border-radius: 0; box-shadow: none; }
  .thumb .thumb-monster .monster-bg { filter: brightness(0.75) saturate(0.95); object-position: 50% 30%; }
  .thumb .monster-flash { animation: none; }
  .thumb-title { position: absolute; bottom: 52px; width: 100%; text-align: center;
    font-family: 'UnifrakturMaguntia', serif; font-size: 92px; color: #efe3c6; line-height: 1;
    text-shadow: 0 0 24px rgba(155,224,106,.7), 0 4px 0 #000, 0 0 4px #000; }
  .thumb-sub { position: absolute; bottom: 18px; width: 100%; text-align: center;
    font-family: 'Cinzel', serif; font-weight: 800; font-size: 26px; letter-spacing: .12em; color: #c9a24a;
    text-shadow: 0 3px 0 #000; }
  .thumb::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(180deg, transparent 55%, rgba(13,10,16,.92) 82%); }
  .thumb-title, .thumb-sub { z-index: 2; }
`;
document.head.appendChild(css);
