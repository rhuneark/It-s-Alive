import { useEffect, useRef, useState } from 'react';
import { RigCanvas, type Pose } from '../app/creatureRig';
import { buildCreatureSprite, loadImage } from '../app/creatureSprite';
import { AURA } from '../app/drawing';
import { roar, thud } from '../app/sfx';
import type { SlotId } from '../game/catalog';
import { BASE_SIZE, type PropKind, type Stage } from '../game/rampage';
import * as run from '../sdk/run';

/**
 * Home, from Halloween on: the creature everyone built, alive, standing in the street of a
 * burning village at night (`art/home.png`, a PixelLab painting), silhouetted against the blood
 * moon. It breathes, its tail lashes, and now and then it rears up as lightning in its spark's
 * colour splits the sky. Rain falls, embers rise, and villagers run for their lives across the
 * road. The first time a player sees it, it breaks out: the ground shakes, the night flashes white,
 * and it rises out of the rubble.
 */

/** The painting, and where in it the creature stands (its feet, as shares of the painting). */
const BACKDROP = 'art/home.png';
const FEET_X = 0.5;
const FEET_Y = 0.8;
/** Where the road runs across the foreground (villagers flee along it). */
const ROAD_Y = 0.93;

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
  g: number;
}

export function LooseScene({ parts, size, breakout, volume, onBrokeOut }: Props) {
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
    const imgs = new Map<PropKind, HTMLImageElement>();
    let backdrop: HTMLImageElement | null = null;
    let rig: RigCanvas | null = null;
    let t0 = 0;
    let burst = !breakout;
    let flash = 0;
    let nextBolt = 2.5;
    let bolt: { x: number; life: number } | null = null;
    let rearUntil = 0;
    let rear = 0;
    let nextRunner = 0.6;
    const runners: Runner[] = [];
    const motes: Mote[] = [];
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const rain = calm
      ? []
      : Array.from({ length: 60 }, () => ({
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
      const [built, bg] = await Promise.all([
        buildCreatureSprite(parts, aura).catch(() => null),
        loadImage(BACKDROP).catch(() => null),
        ...(['villager', 'farmer'] as PropKind[]).map((k) =>
          loadImage(`art/props/${k}.png`).then(
            (img) => void imgs.set(k, img),
            () => undefined,
          ),
        ),
      ]);
      if (!alive) return;
      if (built) rig = new RigCanvas(built, aura);
      backdrop = bg;
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
      ctx.fillStyle = '#0a0612';
      ctx.fillRect(0, 0, W, H);

      // The painting covers the screen, centred (a narrow phone loses a little of each side).
      const bw = backdrop?.width ?? 240;
      const bh = backdrop?.height ?? 400;
      const k = Math.max(W / bw, H / bh);
      const bx = (W - bw * k) / 2;
      const by = (H - bh * k) / 2;
      const at = (fx: number, fy: number) => ({ x: bx + fx * bw * k, y: by + fy * bh * k });

      // the breakout's beats: the ground shakes, the night flashes, and it rises
      let shake = 0;
      let rise = 1;
      if (breakout && !calm) {
        if (t < SHAKE_S) shake = (t / SHAKE_S) * W * 0.014;
        else if (!burst) {
          flash = 1;
          thud(volume, 1);
          roar(volume);
          run.haptic('heavy');
          rearUntil = now + 1.4;
          const feet = at(FEET_X, FEET_Y);
          for (let i = 0; i < 80; i++) {
            const a = -Math.PI * Math.random();
            const sp = (0.3 + Math.random()) * H * 0.8;
            motes.push({
              x: feet.x + (Math.random() - 0.5) * W * 0.3,
              y: feet.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              s: H * (0.006 + Math.random() * 0.012),
              c: ['#3a2a30', '#5a4448', '#2a1c22', '#ff8a3a', '#6a5a5a'][i % 5]!,
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
      if (backdrop) ctx.drawImage(backdrop, bx, by, bw * k, bh * k);

      // lightning in the spark's colour, now and then; it rears up with it
      nextBolt -= dt;
      if (nextBolt <= 0 && !calm) {
        nextBolt = 5 + Math.random() * 5;
        bolt = { x: 0.12 + Math.random() * 0.76, life: 0.35 };
        flash = Math.max(flash, 0.3);
        if (burst && Math.random() < 0.6) rearUntil = now + 1.1;
      }
      if (bolt) {
        bolt.life -= dt;
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = aura;
        ctx.shadowBlur = H * 0.03;
        ctx.lineWidth = Math.max(2, H * 0.005);
        ctx.globalAlpha = Math.max(0, bolt.life / 0.35);
        ctx.beginPath();
        let x = bolt.x * W;
        ctx.moveTo(x, 0);
        for (let y = H * 0.06; y < H * 0.42; y += H * 0.06) {
          x += (Math.random() - 0.5) * W * 0.08;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (bolt.life <= 0) bolt = null;
      }

      // The creature, standing in the street: the bigger the village made it, the more it looms.
      rear += ((now < rearUntil ? 1 : 0) - rear) * Math.min(1, dt * 6);
      if (rig && burst) {
        const grow = Math.min(1.25, Math.sqrt(size / BASE_SIZE));
        const tall = Math.min(H * 0.52, W * 0.92) * grow;
        const hh = tall * (0.55 + 0.45 * easeOutBack(rise));
        const s = hh / rig.sprite.height;
        const feet = at(FEET_X, FEET_Y);
        // a pool of shadow and its own glow on the cobbles
        const glow = ctx.createRadialGradient(feet.x, feet.y, 0, feet.x, feet.y, hh * 0.45);
        glow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(feet.x, feet.y, hh * 0.45, hh * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
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
        ctx.translate(feet.x, feet.y);
        ctx.scale(s, s);
        ctx.drawImage(lit, -rig.footX, -rig.footY);
        ctx.restore();
      }

      // villagers fleeing across the road, some with torches
      const road = at(0, ROAD_Y).y;
      const unit = Math.min(H, W * 1.6);
      if (burst && !calm && (nextRunner -= dt) <= 0) {
        nextRunner = 1.1 + Math.random() * 1.8;
        const dir = Math.random() < 0.5 ? 1 : -1;
        runners.push({
          kind: Math.random() < 0.6 ? 'villager' : 'farmer',
          x: dir === 1 ? -0.08 : 1.08,
          dir,
          speed: 0.16 + Math.random() * 0.1,
          phase: Math.random() * 6,
          torch: Math.random() < 0.5,
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
        const hh = unit * 0.07;
        const ww = (hh * img.width) / img.height;
        const ph = now * 16 + r.phase;
        const hop = Math.abs(Math.sin(ph)) * hh * 0.14;
        const x = r.x * W;
        ctx.save();
        ctx.translate(x, road - hop);
        ctx.rotate(r.dir * 0.18 + Math.sin(ph * 2) * 0.06);
        ctx.scale(r.dir, 1);
        ctx.drawImage(img, -ww / 2, -hh, ww, hh);
        ctx.restore();
        if (r.torch) {
          const tx = x + r.dir * hh * 0.24;
          const ty = road - hh * 0.8 - hop;
          const f = 0.8 + 0.2 * Math.sin(now * 20 + r.phase);
          const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, hh * 0.7);
          tg.addColorStop(0, 'rgba(255, 170, 70, 0.45)');
          tg.addColorStop(1, 'rgba(255, 120, 40, 0)');
          ctx.fillStyle = tg;
          ctx.fillRect(tx - hh * 0.7, ty - hh * 0.7, hh * 1.4, hh * 1.4);
          ctx.fillStyle = '#ff7a1a';
          ctx.fillRect(tx - hh * 0.06, ty - hh * 0.14 * f, hh * 0.12, hh * 0.16 * f);
          ctx.fillStyle = '#ffd36a';
          ctx.fillRect(tx - hh * 0.03, ty - hh * 0.08 * f, hh * 0.06, hh * 0.09 * f);
        }
      }

      // embers drifting up from the burning houses, and the breakout's rubble
      if (!calm && Math.random() < dt * 6)
        motes.push({
          x: W * (Math.random() < 0.5 ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3),
          y: H * (0.55 + Math.random() * 0.35),
          vx: (Math.random() - 0.5) * W * 0.03,
          vy: -H * (0.06 + Math.random() * 0.08),
          s: Math.max(2, H * 0.004),
          c: Math.random() < 0.5 ? '#ffb347' : '#ff6a1a',
          life: 2,
          max: 2,
          g: 0,
        });
      for (let i = motes.length - 1; i >= 0; i--) {
        const d = motes[i]!;
        d.life -= dt;
        d.vy += d.g * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, d.life / d.max + 0.2));
        ctx.fillStyle = d.c;
        ctx.fillRect(d.x, d.y, d.s, d.s);
        if (d.life <= 0) motes.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      if (motes.length > 200) motes.splice(0, motes.length - 200);

      // rain, a flash, and the night closing in at the edges and below (where the button sits)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rain.length) {
        ctx.strokeStyle = 'rgba(180, 190, 230, 0.2)';
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
        ctx.fillStyle = `rgba(230, 240, 255, ${flash * 0.45})`;
        ctx.fillRect(0, 0, W, H);
        flash = Math.max(0, flash - dt * 2.5);
      }
      const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.32, W / 2, H * 0.45, H * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      const floor = ctx.createLinearGradient(0, H * 0.78, 0, H);
      floor.addColorStop(0, 'rgba(8, 4, 12, 0)');
      floor.addColorStop(1, 'rgba(8, 4, 12, 0.85)');
      ctx.fillStyle = floor;
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
    };

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // The scene is drawn once per mount; the home remounts it when the day's place changes.
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
