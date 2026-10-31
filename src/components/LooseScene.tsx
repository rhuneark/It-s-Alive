import { useEffect, useRef, useState } from 'react';
import { RigCanvas, type Pose } from '../app/creatureRig';
import { buildCreatureSprite, loadImage } from '../app/creatureSprite';
import { roar, thud } from '../app/sfx';
import type { SlotId } from '../game/catalog';
import { BASE_SIZE, type PropKind, type Stage } from '../game/rampage';
import * as run from '../sdk/run';
import { AURA } from './Rampage';

/**
 * The rampage menu's picture, edge to edge: the creature everyone built, alive and looming over
 * the night village of the day's place (taller every day the community makes it grow). It breathes,
 * its tail lashes, and now and then it rears up as lightning in its spark's colour splits the sky.
 * Houses burn, smoke rises, rain falls, and villagers run for their lives across the foreground.
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
/** Where fires burn along the front row, and smoke rises from the back (shares of the width). */
const FIRES = [0.16, 0.58, 0.9];
const SMOKE = [0.3, 0.74];

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

interface Runner {
  kind: PropKind;
  x: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  torch: boolean;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  c: string;
  life: number;
  max: number;
  /** Falls (debris) or drifts up (embers, smoke). */
  g: number;
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
    let rig: RigCanvas | null = null;
    let t0 = 0;
    let burst = !breakout;
    let flash = 0;
    let nextBolt = 1.5;
    let bolt: { x: number; life: number } | null = null;
    let rearUntil = 0;
    let rear = 0;
    let nextRunner = 0.4;
    const runners: Runner[] = [];
    const motes: Mote[] = [];
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const rain = calm
      ? []
      : Array.from({ length: 50 }, () => ({
          x: Math.random(),
          y: Math.random(),
          v: 0.9 + Math.random(),
        }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(box.current!.clientWidth * dpr);
      cv.height = Math.round(box.current!.clientHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    void (async () => {
      const kinds = [...new Set<PropKind>([...back, ...front, 'lab', 'villager', 'farmer'])];
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
      if (built) rig = new RigCanvas(built, aura);
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
      // Where its feet stand, and the near row (fires and fleeing villagers) in front of it.
      const feetY = H * 0.86;
      const ground = H * 0.93;
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
          rearUntil = now + 1.4;
          for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (0.2 + Math.random()) * H * 0.9;
            motes.push({
              x: W / 2 + (Math.random() - 0.5) * W * 0.12,
              y: H * 0.6 + (Math.random() - 0.5) * H * 0.3,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - H * 0.6,
              s: H * (0.006 + Math.random() * 0.014),
              c: ['#3d4a5c', '#2a3340', '#5c6b7d', '#8fe36a', '#1d242e'][i % 5]!,
              life: 1 + Math.random() * 0.8,
              max: 1.8,
              g: H * 2.2,
            });
          }
          finishBreakout();
        }
        if (burst) rise = Math.min(1, Math.max(0, (t - SHAKE_S) / RISE_S));
      }
      const sx = (Math.random() - 0.5) * shake * 2;
      const sy = (Math.random() - 0.5) * shake * 2;
      ctx.translate(sx, sy);

      // a sky lit red from below by the burning village, and the moon
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#05060d');
      sky.addColorStop(0.45, '#151226');
      sky.addColorStop(0.75, '#3a1420');
      sky.addColorStop(1, '#4a1a18');
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.fillStyle = kind === 'moon' ? 'rgba(220, 70, 60, 0.95)' : 'rgba(240, 232, 200, 0.95)';
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.2, H * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(240, 232, 200, 0.1)';
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.2, H * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // clouds drifting past it
      ctx.fillStyle = 'rgba(8, 8, 16, 0.55)';
      for (let i = 0; i < 4; i++) {
        const cx = ((now * 0.012 * (i + 1) + i * 0.31) % 1.4) * W * 1.1 - W * 0.2;
        const cy = H * (0.12 + i * 0.07);
        ctx.beginPath();
        ctx.ellipse(cx, cy, W * 0.22, H * 0.025, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + W * 0.1, cy - H * 0.015, W * 0.14, H * 0.022, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // lightning in the spark's colour, now and then; it rears up with it
      nextBolt -= dt;
      if (nextBolt <= 0 && !calm) {
        nextBolt = 5 + Math.random() * 5;
        bolt = { x: 0.08 + Math.random() * 0.84, life: 0.35 };
        flash = Math.max(flash, 0.35);
        if (burst && Math.random() < 0.6) rearUntil = now + 1.1;
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
        for (let y = H * 0.08; y < H * 0.6; y += H * 0.08) {
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
      ctx.moveTo(0, H * 0.66);
      ctx.quadraticCurveTo(W * 0.25, H * 0.56, W * 0.5, H * 0.64);
      ctx.quadraticCurveTo(W * 0.75, H * 0.57, W, H * 0.64);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();

      // the village: a distant row (smoking) and a near row (burning)
      const row = (list: PropKind[], baseY: number, h: number, shade: number) => {
        const step = W / (list.length - 1);
        list.forEach((k, i) => {
          const img = imgs.get(k);
          if (!img) return;
          const hh = h * (k === 'lamp' || k === 'pumpkin' || k === 'grave' ? 0.45 : 1);
          const ww = (hh * img.width) / img.height;
          ctx.drawImage(img, i * step - ww / 2, baseY - hh, ww, hh);
          if (shade > 0) {
            ctx.fillStyle = `rgba(10, 8, 20, ${shade})`;
            ctx.fillRect(i * step - ww / 2, baseY - hh, ww, hh);
          }
        });
      };
      ctx.fillStyle = '#16141a';
      ctx.fillRect(0, H * 0.72, W, H * 0.28);
      row(back, H * 0.74, H * 0.17, 0.25);
      for (const fx of SMOKE)
        if (Math.random() < dt * 3)
          motes.push({
            x: fx * W + (Math.random() - 0.5) * W * 0.03,
            y: H * 0.7,
            vx: W * 0.01,
            vy: -H * (0.05 + Math.random() * 0.04),
            s: H * (0.03 + Math.random() * 0.03),
            c: 'rgba(30, 26, 30, 0.5)',
            life: 3,
            max: 3,
            g: 0,
          });

      // the laboratory (until it bursts), then the creature looming over the near row
      if (breakout && !burst) {
        const lab = imgs.get('lab');
        if (lab) {
          const hh = H * 0.6;
          const ww = (hh * lab.width) / lab.height;
          ctx.drawImage(lab, W / 2 - ww / 2 + sx, feetY - hh, ww, hh);
        }
      }
      rear += ((now < rearUntil ? 1 : 0) - rear) * Math.min(1, dt * 6);
      if (rig && burst) {
        // It looms bigger the taller the community has made it.
        const grow = Math.min(1.25, Math.sqrt(size / BASE_SIZE));
        const hh = H * 0.55 * grow * (0.55 + 0.45 * easeOutBack(rise));
        const k = hh / rig.sprite.height;
        const pose: Pose = {
          t: now,
          walk: 0,
          stride: 0,
          attack: 0,
          side: 1,
          roar: rear,
          swell: 0,
          beat: rear * 0.6,
          glowSlots: rig.sprite.order,
          glow: rear * 0.5,
        };
        const lit = rig.draw(pose, 4 + rear * 4);
        ctx.save();
        ctx.translate(W / 2, feetY);
        ctx.scale(k, k);
        ctx.drawImage(lit, -rig.footX, -rig.footY);
        ctx.restore();
      }
      row(front, H * 0.95, H * 0.14, 0);

      // fires along the front row, throwing embers
      for (const [i, fx] of FIRES.entries()) {
        const x = fx * W;
        const fh = H * 0.07;
        const glow = ctx.createRadialGradient(x, ground, 0, x, ground, fh * 2.2);
        glow.addColorStop(0, 'rgba(255, 140, 50, 0.35)');
        glow.addColorStop(1, 'rgba(255, 90, 30, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - fh * 2.2, ground - fh * 2.2, fh * 4.4, fh * 4.4);
        for (const [color, wide, tall] of [
          ['#b8280a', 1, 1],
          ['#ff7f1e', 0.66, 0.78],
          ['#ffd65e', 0.34, 0.5],
        ] as const) {
          ctx.fillStyle = color;
          ctx.beginPath();
          for (let j = 0; j < 4; j++) {
            const tx = x + (j - 1.5) * fh * 0.3;
            const lick = 0.55 + 0.45 * Math.sin(now * 9 + j * 1.9 + i * 3);
            const th = fh * lick * tall * (j === 1 || j === 2 ? 1.2 : 0.8);
            const tw = fh * 0.38 * wide;
            ctx.moveTo(tx - tw / 2, ground);
            ctx.quadraticCurveTo(
              tx - tw * 0.45,
              ground - th * 0.5,
              tx + Math.sin(now * 6 + j) * tw * 0.4,
              ground - th,
            );
            ctx.quadraticCurveTo(tx + tw * 0.45, ground - th * 0.5, tx + tw / 2, ground);
            ctx.closePath();
          }
          ctx.fill();
        }
        if (Math.random() < dt * 4)
          motes.push({
            x: x + (Math.random() - 0.5) * fh,
            y: ground - fh * 0.5,
            vx: (Math.random() - 0.5) * W * 0.03,
            vy: -H * (0.12 + Math.random() * 0.1),
            s: Math.max(2, H * 0.006),
            c: Math.random() < 0.5 ? '#ffb347' : '#ff6a1a',
            life: 1.2,
            max: 1.2,
            g: 0,
          });
      }

      // villagers fleeing across the foreground, some with torches
      if (burst && !calm && (nextRunner -= dt) <= 0) {
        nextRunner = 0.9 + Math.random() * 1.6;
        const dir = Math.random() < 0.5 ? 1 : -1;
        runners.push({
          kind: Math.random() < 0.6 ? 'villager' : 'farmer',
          x: dir === 1 ? -0.08 : 1.08,
          dir,
          speed: 0.16 + Math.random() * 0.1,
          phase: Math.random() * 6,
          torch: Math.random() < 0.4,
        });
      }
      for (let i = runners.length - 1; i >= 0; i--) {
        const r = runners[i]!;
        r.x += r.dir * r.speed * dt;
        if (r.x < -0.15 || r.x > 1.15) {
          runners.splice(i, 1);
          continue;
        }
        const img = imgs.get(r.kind);
        if (!img) continue;
        const hh = H * 0.075;
        const ww = (hh * img.width) / img.height;
        const ph = now * 16 + r.phase;
        const hop = Math.abs(Math.sin(ph)) * hh * 0.14;
        const x = r.x * W;
        ctx.save();
        ctx.translate(x, ground + H * 0.01 - hop);
        ctx.rotate(r.dir * 0.18 + Math.sin(ph * 2) * 0.06);
        ctx.scale(r.dir, 1);
        ctx.drawImage(img, -ww / 2, -hh, ww, hh);
        ctx.restore();
        if (r.torch) {
          const tx = x + r.dir * hh * 0.24;
          const ty = ground - hh * 0.8 - hop;
          const f = 0.8 + 0.2 * Math.sin(now * 20 + r.phase);
          const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, hh * 0.6);
          tg.addColorStop(0, 'rgba(255, 170, 70, 0.45)');
          tg.addColorStop(1, 'rgba(255, 120, 40, 0)');
          ctx.fillStyle = tg;
          ctx.fillRect(tx - hh * 0.6, ty - hh * 0.6, hh * 1.2, hh * 1.2);
          ctx.fillStyle = '#ff7a1a';
          ctx.fillRect(tx - hh * 0.06, ty - hh * 0.14 * f, hh * 0.12, hh * 0.16 * f);
          ctx.fillStyle = '#ffd36a';
          ctx.fillRect(tx - hh * 0.03, ty - hh * 0.08 * f, hh * 0.06, hh * 0.09 * f);
        }
      }

      // debris, embers and smoke
      for (let i = motes.length - 1; i >= 0; i--) {
        const d = motes[i]!;
        d.life -= dt;
        d.vy += d.g * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.g === 0 && d.s > H * 0.02) d.s += H * 0.01 * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, d.life / d.max + 0.2));
        ctx.fillStyle = d.c;
        if (d.s > H * 0.02) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.s, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(d.x, d.y, d.s, d.s);
        if (d.life <= 0) motes.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      if (motes.length > 260) motes.splice(0, motes.length - 260);

      // rain, a flash, and the night closing in at the edges and below
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rain.length) {
        ctx.strokeStyle = 'rgba(170, 190, 230, 0.22)';
        ctx.lineWidth = Math.max(1, W / 400);
        ctx.beginPath();
        for (const d of rain) {
          d.y += d.v * dt * 0.9;
          d.x -= d.v * dt * 0.2;
          if (d.y > 1) {
            d.y -= 1.05;
            d.x = Math.random() * 1.2;
          }
          ctx.moveTo(d.x * W, d.y * H);
          ctx.lineTo(d.x * W + H * 0.006, d.y * H - H * 0.03);
        }
        ctx.stroke();
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(230, 240, 255, ${flash * 0.5})`;
        ctx.fillRect(0, 0, W, H);
        flash = Math.max(0, flash - dt * 2.5);
      }
      const v = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, H * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
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
