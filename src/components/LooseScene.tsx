import { useEffect, useRef, useState } from 'react';
import { buildCreatureSprite, loadImage, type CreatureSprite } from '../app/creatureSprite';
import { roar, thud } from '../app/sfx';
import type { SlotId } from '../game/catalog';
import { BASE_SIZE, type PropKind, type Stage } from '../game/rampage';
import * as run from '../sdk/run';
import { AURA } from './Rampage';

/**
 * The rampage menu's picture: the creature everyone built, loose and looming over the night
 * village (taller every day the community makes it grow), with lightning in its spark's colour.
 * The first time a player sees it, it breaks out: the laboratory tower shakes, bursts, and the
 * creature rises from the rubble.
 */

/** Back row (distant, small) and front row of the village, by stage. */
const ROWS: Record<string, [PropKind[], PropKind[]]> = {
  village: [
    ['pine', 'church', 'house', 'windmill', 'cottage', 'deadtree', 'townhall', 'pine'],
    ['cottage', 'lamp', 'house', 'pumpkin', 'tavern', 'lamp', 'cottage'],
  ],
  farms: [
    ['windmill', 'pine', 'cottage', 'windmill', 'deadtree', 'manor', 'windmill'],
    ['haystack', 'scarecrow', 'cottage', 'haystack', 'fence', 'well', 'haystack'],
  ],
  market: [
    ['townhall', 'house', 'church', 'tavern', 'house', 'watchtower', 'house'],
    ['stall', 'lamp', 'tavern', 'stall', 'house', 'lamp', 'stall'],
  ],
  graveyard: [
    ['deadtree', 'church', 'deadtree', 'church', 'pine', 'manor', 'deadtree'],
    ['grave', 'deadtree', 'grave', 'lamp', 'grave', 'grave', 'deadtree'],
  ],
  estate: [
    ['watchtower', 'manor', 'pine', 'manor', 'watchtower', 'pine', 'manor'],
    ['fence', 'lamp', 'wagon', 'well', 'fence', 'lamp', 'fence'],
  ],
  city: [
    ['townhall', 'house', 'watchtower', 'church', 'house', 'manor', 'townhall'],
    ['house', 'lamp', 'tavern', 'house', 'lamp', 'house', 'tavern'],
  ],
};

const SHAKE_S = 1.6;
const RISE_S = 0.9;

interface Props {
  parts: Partial<Record<SlotId, string>>;
  stage: Stage;
  /** Its real height today (world units): the bigger, the more it looms. */
  size: number;
  /** Play the breakout (the first time the player sees it loose). */
  breakout: boolean;
  volume: number;
  onBrokeOut: () => void;
}

export function LooseScene({ parts, stage, size, breakout, volume, onBrokeOut }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Whether this showing is the breakout is decided once: marking it seen must not cut it short.
  const [played] = useState(breakout);
  const [loose, setLoose] = useState(!breakout);
  const [titleGone, setTitleGone] = useState(false);
  const done = useRef(onBrokeOut);
  done.current = onBrokeOut;

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let alive = true;
    let raf = 0;
    const kind = parts.spark?.replace('spark_', '') ?? 'lightning';
    const aura = AURA[kind] ?? AURA['lightning']!;
    const [back, front] = ROWS[stage.id] ?? ROWS['village']!;
    const imgs = new Map<PropKind, HTMLImageElement>();
    let sprite: CreatureSprite | null = null;
    let t0 = 0;
    let burst = !breakout;
    let flash = 0;
    let nextBolt = 1.5;
    let bolt: { x: number; life: number } | null = null;
    const debris: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      s: number;
      c: string;
      life: number;
    }> = [];
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(box.current!.clientWidth * dpr);
      cv.height = Math.round(box.current!.clientHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    void (async () => {
      const kinds = [...new Set<PropKind>([...back, ...front, 'lab'])];
      const [built] = await Promise.all([
        buildCreatureSprite(parts, aura).catch(() => null),
        ...kinds.map((k) =>
          loadImage(`art/props/${k}.png`).then(
            (img) => void imgs.set(k, img),
            () => undefined,
          ),
        ),
      ]);
      if (!alive) return;
      sprite = built;
      t0 = performance.now() / 1000;
      if (calm && breakout) finishBreakout();
      let last = performance.now();
      const frame = (ms: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (ms - last) / 1000);
        last = ms;
        draw(ms / 1000, dt);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();

    function finishBreakout() {
      burst = true;
      setLoose(true);
      done.current();
      setTimeout(() => alive && setTitleGone(true), 4200);
    }

    const draw = (now: number, dt: number) => {
      const W = cv.width;
      const H = cv.height;
      const t = now - t0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;

      // the breakout's beats
      let shake = 0;
      let rise = 1;
      if (breakout && !calm) {
        if (t < SHAKE_S) shake = (t / SHAKE_S) * W * 0.012;
        else if (!burst) {
          flash = 1;
          thud(volume, 1);
          roar(volume);
          run.haptic('heavy');
          for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (0.2 + Math.random()) * H * 0.9;
            debris.push({
              x: W / 2 + (Math.random() - 0.5) * W * 0.12,
              y: H * 0.6 + (Math.random() - 0.5) * H * 0.3,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - H * 0.6,
              s: H * (0.006 + Math.random() * 0.014),
              c: ['#3d4a5c', '#2a3340', '#5c6b7d', '#8fe36a', '#1d242e'][i % 5]!,
              life: 1 + Math.random() * 0.8,
            });
          }
          finishBreakout();
        }
        if (burst) rise = Math.min(1, Math.max(0, (t - SHAKE_S) / RISE_S));
      }
      const sx = (Math.random() - 0.5) * shake * 2;
      const sy = (Math.random() - 0.5) * shake * 2;
      ctx.translate(sx, sy);

      // night sky, moon and hills
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#070912');
      sky.addColorStop(0.6, '#1a1630');
      sky.addColorStop(1, '#2a1f33');
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.fillStyle = 'rgba(240, 232, 200, 0.95)';
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.16, H * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(240, 232, 200, 0.12)';
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.16, H * 0.11, 0, Math.PI * 2);
      ctx.fill();

      // lightning in the spark's colour, now and then
      nextBolt -= dt;
      if (nextBolt <= 0 && !calm) {
        nextBolt = 3 + Math.random() * 4;
        bolt = { x: 0.1 + Math.random() * 0.8, life: 0.35 };
        flash = Math.max(flash, 0.35);
      }
      if (bolt) {
        bolt.life -= dt;
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = aura;
        ctx.shadowBlur = H * 0.03;
        ctx.lineWidth = Math.max(2, H * 0.006);
        ctx.globalAlpha = Math.max(0, bolt.life / 0.35);
        ctx.beginPath();
        let x = bolt.x * W;
        ctx.moveTo(x, 0);
        for (let y = H * 0.08; y < H * 0.62; y += H * 0.08) {
          x += (Math.random() - 0.5) * W * 0.08;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (bolt.life <= 0) bolt = null;
      }

      ctx.fillStyle = '#120f1d';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.62);
      ctx.quadraticCurveTo(W * 0.25, H * 0.5, W * 0.5, H * 0.6);
      ctx.quadraticCurveTo(W * 0.75, H * 0.52, W, H * 0.6);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();

      // the village: a distant row and a near row
      const row = (list: PropKind[], baseY: number, h: number, shade: number) => {
        const step = W / (list.length - 1);
        list.forEach((k, i) => {
          const img = imgs.get(k);
          if (!img) return;
          const hh = h * (k === 'lamp' || k === 'pumpkin' || k === 'grave' ? 0.45 : 1);
          const ww = (hh * img.width) / img.height;
          ctx.globalAlpha = 1;
          ctx.drawImage(img, i * step - ww / 2, baseY - hh, ww, hh);
          ctx.fillStyle = `rgba(10, 8, 20, ${shade})`;
          ctx.fillRect(i * step - ww / 2, baseY - hh, ww, hh);
        });
      };
      ctx.fillStyle = '#16201a';
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
      row(back, H * 0.72, H * 0.2, 0);

      // the laboratory (until it bursts), then the creature looming over the near row
      if (breakout && !burst) {
        const lab = imgs.get('lab');
        if (lab) {
          const hh = H * 0.62;
          const ww = (hh * lab.width) / lab.height;
          ctx.drawImage(lab, W / 2 - ww / 2 + sx, H * 0.95 - hh, ww, hh);
        }
      }
      if (sprite && burst) {
        // It looms bigger the taller the community has made it.
        const grow = Math.min(1.25, Math.sqrt(size / BASE_SIZE));
        const hh = H * 0.62 * grow * (0.55 + 0.45 * easeOutBack(rise));
        const k = hh / sprite.height;
        const breathe = 1 + Math.sin(now * 2.2) * 0.01;
        ctx.save();
        ctx.translate(W / 2, H * 0.97);
        ctx.scale(1, breathe);
        ctx.drawImage(
          sprite.glow,
          -sprite.footX * k,
          -sprite.footY * k,
          sprite.glow.width * k,
          sprite.glow.height * k,
        );
        ctx.restore();
      }
      row(front, H * 0.99, H * 0.17, 0);

      // debris, flash and a vignette
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]!;
        d.life -= dt;
        d.vy += H * 2.2 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        ctx.fillStyle = d.c;
        ctx.fillRect(d.x, d.y, d.s, d.s);
        if (d.life <= 0) debris.splice(i, 1);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (flash > 0) {
        ctx.fillStyle = `rgba(230, 240, 255, ${flash * 0.55})`;
        ctx.fillRect(0, 0, W, H);
        flash = Math.max(0, flash - dt * 2.5);
      }
      const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    };

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // The scene is drawn once per mount; the menu remounts it when the day's place changes.
  }, []);

  return (
    <div className="loose-scene" ref={box} data-testid="loose-scene" data-loose={loose}>
      <canvas ref={canvas} aria-label="The creature, loose in the village" role="img" />
      {played && loose && !titleGone && (
        <p className="loose-title" data-testid="loose-title">
          IT'S LOOSE!
        </p>
      )}
    </div>
  );
}

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
