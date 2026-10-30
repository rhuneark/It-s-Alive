import { useEffect, useRef, useState } from 'react';
import { buildCreatureSprite, loadImage, type CreatureSprite } from '../app/creatureSprite';
import { chime, roar, thud, thunderclap } from '../app/sfx';
import type { SlotId } from '../game/catalog';
import {
  BASE_SIZE,
  POWERS,
  PROPS,
  RUN_SECONDS,
  WORLD_H,
  WORLD_W,
  buildWorld,
  feet,
  powerParts,
  type PropKind,
  type Stage,
} from '../game/rampage';
import { RampageRun, type LiveProp, type RunEvent, type RunResult } from '../game/rampageRun';
import * as run from '../sdk/run';

/**
 * The rampage: the creature everyone built, loose in the day's place. Drag anywhere (or use the
 * arrow keys) to steer; it smashes what is smaller than it, grows, and wakes its parts' powers.
 * The rules live in game/rampageRun.ts; this draws them on a canvas and plays the effects.
 */

/** The spark of life chosen on the last night tints the creature's glow. */
export const AURA: Record<string, string> = {
  lightning: 'rgba(198, 242, 255, 0.9)',
  curse: 'rgba(120, 230, 80, 0.9)',
  moon: 'rgba(230, 60, 60, 0.9)',
  ghostfire: 'rgba(90, 160, 255, 0.95)',
  elixir: 'rgba(190, 90, 255, 0.95)',
};

const KINDS = Object.keys(PROPS) as PropKind[];
/** The creature fills this share of the screen's height, however big it gets. */
const SCREEN_FILL = 0.27;
/** Drag this far (css px) for full speed. */
const STICK = 56;
const BREAKOUT_SECONDS = 3.4;
const READY_SECONDS = 1.1;

type Phase = 'loading' | 'intro' | 'play' | 'over';

interface Hud {
  left: number;
  rubble: number;
  feet: number;
  next: string | null;
  progress: number;
}

interface Banner {
  id: number;
  title: string;
  text: string;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
  life: number;
  /** Pulls it back down (world units/s²); dust just drifts. */
  g: number;
}

interface Flung {
  img: HTMLImageElement | null;
  h: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rot: number;
  life: number;
}

interface Effect {
  kind: 'ring' | 'bolt';
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
}

interface Props {
  parts: Partial<Record<SlotId, string>>;
  stage: Stage;
  /** The day's place is the same for everyone (same seed). */
  seed: string;
  /** The creature's real height is its run size times this (it grew with the community). */
  scale: number;
  /** The first run: it breaks out of the laboratory. */
  breakout: boolean;
  volume: number;
  best: number;
  /** Whether the finished run reached the community's tally ('pending' while it is sent). */
  contribution: 'pending' | 'counted' | 'guest' | 'failed' | null;
  onSignIn: (rubble: number) => void;
  onEnd: (result: RunResult) => void;
  onAgain: () => void;
  onQuit: () => void;
}

export function Rampage({
  parts,
  stage,
  seed,
  scale,
  breakout,
  volume,
  best,
  contribution,
  onSignIn,
  onEnd,
  onAgain,
  onQuit,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [hud, setHud] = useState<Hud>({
    left: RUN_SECONDS,
    rubble: 0,
    feet: feet(BASE_SIZE * scale),
    next: null,
    progress: 0,
  });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    const cv = canvasRef.current!;
    const box = host.current!;
    const ctx = cv.getContext('2d')!;
    let alive = true;
    let raf = 0;
    const sparkKind = parts.spark?.replace('spark_', '') ?? 'lightning';
    const aura = AURA[sparkKind] ?? AURA['lightning']!;
    const world = buildWorld(seed, stage);
    const seconds = testSeconds();
    const sim = new RampageRun(world, BASE_SIZE, `${seed}:${Math.random()}`, seconds);
    const lab = world.props.find((p) => p.kind === 'lab');

    let sprite: CreatureSprite | null = null;
    const imgs = new Map<PropKind, HTMLImageElement>();
    const colors = new Map<PropKind, string[]>();
    let ground: CanvasPattern | null = null;
    const particles: Particle[] = [];
    const flung: Flung[] = [];
    const effects: Effect[] = [];
    let shake = 0;
    let flash = 0;
    let walk = 0;
    let lastStep = 0;
    let highlight: { slots: readonly SlotId[]; until: number } | null = null;
    let stage0 = 0; // when the intro began (s)
    let mode: Phase = 'loading';
    let lastHud = 0;
    let lastHaptic = 0;
    let lastThud = 0;
    let lastBlockHint = -10;
    let hintShown = false;
    let bannerId = 0;
    const cam = { x: world.start.x, y: world.start.y - 160, z: 1 };

    // ------------------------------------------------------------- input
    const keys = new Set<string>();
    let anchor: { x: number; y: number } | null = null;
    let finger: { x: number; y: number } | null = null;
    // Mock only: tests steer through window.__steer and read the run from window.__rampage.
    const mock = run.isMock();
    if (mock) (window as unknown as { __rampage?: RampageRun }).__rampage = sim;
    const steer = () => {
      const scripted = mock
        ? (window as unknown as { __steer?: { x: number; y: number } }).__steer
        : null;
      if (scripted) return scripted;
      let x = 0;
      let y = 0;
      if (anchor && finger) {
        x = (finger.x - anchor.x) / STICK;
        y = (finger.y - anchor.y) / STICK;
      }
      if (keys.has('ArrowLeft') || keys.has('a')) x -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) x += 1;
      if (keys.has('ArrowUp') || keys.has('w')) y -= 1;
      if (keys.has('ArrowDown') || keys.has('s')) y += 1;
      return { x, y };
    };
    const down = (e: PointerEvent) => {
      if (mode !== 'play' && mode !== 'intro') return;
      anchor = { x: e.clientX, y: e.clientY };
      finger = { ...anchor };
      box.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!anchor) return;
      finger = { x: e.clientX, y: e.clientY };
      // The stick follows a finger that wanders far, so turning around is instant.
      const dx = finger.x - anchor.x;
      const dy = finger.y - anchor.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK * 1.5) {
        anchor.x = finger.x - (dx / d) * STICK * 1.5;
        anchor.y = finger.y - (dy / d) * STICK * 1.5;
      }
    };
    const up = () => {
      anchor = null;
      finger = null;
    };
    const keydown = (e: KeyboardEvent) => {
      keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const keyup = (e: KeyboardEvent) =>
      keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);

    // ------------------------------------------------------------- setup
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(box.clientWidth * dpr);
      cv.height = Math.round(box.clientHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    void (async () => {
      const [built] = await Promise.all([
        buildCreatureSprite(parts, aura).catch(() => null),
        ...KINDS.map(async (k) => {
          try {
            const img = await loadImage(`art/props/${k}.png`);
            imgs.set(k, img);
            colors.set(k, palette(img));
          } catch {
            // drawn as a block if its art is missing
          }
        }),
      ]);
      if (!alive) return;
      sprite = built;
      ground = makeGround(ctx, stage.id);
      mode = 'intro';
      setPhase('intro');
      stage0 = performance.now() / 1000;
      if (breakout) {
        setTitle(null);
      } else {
        setTitle('RAMPAGE!');
        roar(volume * 0.7);
      }
      let last = performance.now();
      const frame = (nowMs: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (nowMs - last) / 1000);
        last = nowMs;
        update(dt, nowMs / 1000);
        draw(nowMs / 1000);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();

    // ------------------------------------------------------------- update
    const update = (dt: number, now: number) => {
      shake = Math.max(0, shake - dt * 30);
      flash = Math.max(0, flash - dt * 2.5);
      if (mode === 'intro') {
        const t = now - stage0;
        const total = breakout ? BREAKOUT_SECONDS : READY_SECONDS;
        if (breakout) introBeats(t, now);
        if (t >= total) {
          mode = 'play';
          setPhase('play');
          setTitle(null);
          if (!hintShown) {
            hintShown = true;
            setHint('Drag anywhere to steer. Smash anything smaller than you!');
          }
        }
      } else if (mode === 'play') {
        const events = sim.step(dt, steer());
        for (const e of events) handle(e, now);
        if (sim.moving) {
          walk += dt * 9;
          if (walk - lastStep > Math.PI) {
            lastStep = walk;
            dust(sim.x, sim.y, sim.size * 0.25, 4);
          }
        }
      }
      // Camera: keep the creature at the same height on screen, however big it gets.
      // (During the breakout it first frames the laboratory, then the creature rising from it.)
      const framing = mode === 'intro' && breakout && !burst ? 300 : sim.size;
      const target = (cv.height * SCREEN_FILL) / framing;
      cam.z += (target - cam.z) * Math.min(1, dt * 2.5);
      const fx = sim.x;
      const fy = sim.y - framing * 0.45;
      cam.x += (fx - cam.x) * Math.min(1, dt * 6);
      cam.y += (fy - cam.y) * Math.min(1, dt * 6);
      // Never show past the edge of the map.
      const halfW = cv.width / cam.z / 2;
      const halfH = cv.height / cam.z / 2;
      cam.x = halfW * 2 < WORLD_W ? Math.max(halfW, Math.min(WORLD_W - halfW, cam.x)) : WORLD_W / 2;
      cam.y = halfH * 2 < WORLD_H ? Math.max(halfH, Math.min(WORLD_H - halfH, cam.y)) : WORLD_H / 2;
      tickParticles(dt);
      if (now - lastHud > 0.12 && mode === 'play') {
        lastHud = now;
        const next = sim.nextPower();
        setHud({
          left: sim.timeLeft,
          rubble: sim.rubble,
          feet: feet(sim.size * scale),
          next: next ? (powerParts(next.power, parts)[0] ?? next.power.id) : null,
          progress: next ? next.progress : 1,
        });
      }
    };

    // The breakout: the laboratory shakes, bursts, and the creature rises from its rubble.
    let burst = false;
    const introBeats = (t: number, now: number) => {
      if (t < 1.5) {
        shake = Math.max(shake, 1 + t * 3);
        if (Math.random() < 0.25 && lab) dust(lab.x + (Math.random() - 0.5) * 60, lab.y, 30, 1);
        if (now - lastThud > 0.35) {
          lastThud = now;
          thud(volume * 0.5, 0.4);
        }
      } else if (!burst) {
        burst = true;
        flash = 1;
        shake = 18;
        if (lab) debris(lab.x, lab.y, 300, 'lab', 60);
        thud(volume, 1);
        roar(volume);
        run.haptic('heavy');
        setTitle("IT'S LOOSE!");
      }
    };

    const handle = (e: RunEvent, now: number) => {
      if (e.type === 'smash') {
        const p = e.prop;
        const weight = Math.min(1, p.h / sim.size);
        if (p.mover) fling(p);
        else debris(p.x, p.y, p.h, p.kind, Math.round(4 + weight * 18));
        shake = Math.max(shake, weight * 9);
        if (now - lastThud > 0.07) {
          lastThud = now;
          thud(volume * 0.8, weight);
        }
        if (now - lastHaptic > 0.09) {
          lastHaptic = now;
          run.haptic(weight > 0.5 ? 'medium' : 'light');
        }
        if (hintShown) setHint(null);
      } else if (e.type === 'blocked') {
        shake = Math.max(shake, 3);
        if (now - lastBlockHint > 3) {
          lastBlockHint = now;
          setHint(`Too big to smash yet: grow first!`);
          setTimeout(() => setHint((h) => (h?.startsWith('Too big') ? null : h)), 1800);
        }
      } else if (e.type === 'power') {
        const names = powerParts(e.power, parts);
        setBanner({
          id: ++bannerId,
          title: `${names.length ? names.join(' & ') : 'Its body'} ${names.length > 1 ? 'awaken' : 'awakens'}!`,
          text: e.power.effect,
        });
        highlight = { slots: e.power.slots, until: now + 1.8 };
        chime(volume);
        run.haptic('success');
      } else if (e.type === 'land') {
        effects.push({ kind: 'ring', x: sim.x, y: sim.y, radius: e.radius, life: 0.45, max: 0.45 });
        dust(sim.x, sim.y, e.radius * 0.6, 14);
        shake = Math.max(shake, 14);
        thud(volume, 0.9);
        run.haptic('heavy');
      } else if (e.type === 'sweep') {
        effects.push({ kind: 'ring', x: sim.x, y: sim.y, radius: e.radius, life: 0.3, max: 0.3 });
      } else if (e.type === 'bolt') {
        effects.push({
          kind: 'bolt',
          x: e.prop.x,
          y: e.prop.y,
          radius: e.prop.h,
          life: 0.35,
          max: 0.35,
        });
        flash = Math.max(flash, 0.5);
        thunderclap(volume * 0.5);
      } else if (e.type === 'end') {
        mode = 'over';
        setPhase('over');
        setHint(null);
        const r = sim.result();
        setResult(r);
        run.haptic('success');
        endRef.current(r);
      }
    };

    // ------------------------------------------------------------- effects
    const debris = (x: number, y: number, h: number, kind: PropKind, n: number) => {
      const pal = colors.get(kind) ?? ['#6b5a48', '#8a7a62', '#3c332b'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.4 + Math.random()) * h * 1.6;
        particles.push({
          x: x + (Math.random() - 0.5) * h * 0.4,
          y: y + (Math.random() - 0.5) * h * 0.15,
          z: Math.random() * h * 0.6,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.5,
          vz: h * (1.2 + Math.random() * 2),
          size: h * (0.05 + Math.random() * 0.08),
          color: pal[i % pal.length]!,
          life: 0.7 + Math.random() * 0.5,
          g: h * 9,
        });
      }
      dust(x, y, h * 0.5, 5);
    };
    const dust = (x: number, y: number, spread: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x,
          y,
          z: 2,
          vx: Math.cos(a) * spread * 1.5,
          vy: Math.sin(a) * spread * 0.7,
          vz: spread * 0.4,
          size: spread * (0.18 + Math.random() * 0.2),
          color: 'rgba(160, 150, 130, 0.35)',
          life: 0.5 + Math.random() * 0.3,
          g: 0,
        });
      }
    };
    const fling = (p: LiveProp) => {
      const a = Math.atan2(p.y - sim.y, p.x - sim.x);
      const sp = sim.size * (2 + Math.random() * 1.5);
      flung.push({
        img: imgs.get(p.kind) ?? null,
        h: p.h,
        x: p.x,
        y: p.y,
        z: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6,
        vz: sim.size * (3 + Math.random() * 2),
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8),
        rot: 0,
        life: 1.4,
      });
    };
    const tickParticles = (dt: number) => {
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i]!;
        q.life -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z = Math.max(0, q.z + q.vz * dt);
        q.vz -= q.g * dt;
        q.vx *= 1 - dt * 2;
        q.vy *= 1 - dt * 2;
        if (q.life <= 0) particles.splice(i, 1);
      }
      for (let i = flung.length - 1; i >= 0; i--) {
        const f = flung[i]!;
        f.life -= dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.z += f.vz * dt;
        f.vz -= sim.size * 9 * dt;
        f.rot += f.spin * dt;
        if (f.life <= 0) flung.splice(i, 1);
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        effects[i]!.life -= dt;
        if (effects[i]!.life <= 0) effects.splice(i, 1);
      }
      if (particles.length > 500) particles.splice(0, particles.length - 500);
    };

    // ------------------------------------------------------------- draw
    const draw = (now: number) => {
      const W = cv.width;
      const H = cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0b0f0c';
      ctx.fillRect(0, 0, W, H);
      const z = cam.z;
      const sx = (Math.random() - 0.5) * shake * 2;
      const sy = (Math.random() - 0.5) * shake * 2;
      const ox = W / 2 - cam.x * z + sx;
      const oy = H / 2 - cam.y * z + sy;
      ctx.setTransform(z, 0, 0, z, ox, oy);
      const vx0 = -ox / z;
      const vy0 = -oy / z;
      const vx1 = (W - ox) / z;
      const vy1 = (H - oy) / z;

      // ground and roads
      ctx.fillStyle = ground ?? '#1d2a1c';
      ctx.fillRect(
        Math.max(0, vx0),
        Math.max(0, vy0),
        Math.min(WORLD_W, vx1) - Math.max(0, vx0),
        Math.min(WORLD_H, vy1) - Math.max(0, vy0),
      );
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const road of world.roads) {
        for (const [color, k] of [
          ['#2a2219', 1.15],
          ['#3d3224', 1],
          ['#4a3e2c', 0.55],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = road.width * k;
          ctx.beginPath();
          road.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
      }

      // what is in view, back to front
      const margin = 500;
      const items: Array<{ y: number; draw: () => void }> = [];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      for (const p of sim.props) {
        if (!p.alive && !(p.kind === 'lab' && mode === 'intro' && breakout && !burst)) continue;
        if (p.x < vx0 - margin || p.x > vx1 + margin || p.y < vy0 - 40 || p.y > vy1 + margin)
          continue;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * 1.1, p.r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        items.push({ y: p.y, draw: () => drawProp(p, now) });
      }
      if (sprite && !(mode === 'intro' && breakout && !burst)) {
        const air = airHeight();
        ctx.beginPath();
        ctx.ellipse(
          sim.x,
          sim.y,
          sim.size * 0.28 * (1 - air / sim.size / 2),
          sim.size * 0.1,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        items.push({ y: sim.y, draw: () => drawCreature(now, air) });
      }
      for (const f of flung) items.push({ y: f.y, draw: () => drawFlung(f) });
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();

      for (const q of particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, q.life / 0.4));
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.z - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;
      for (const e of effects) drawEffect(e, vy0);

      // night: a cold vignette, a lightning flash, and the steering stick
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.8);
      g.addColorStop(0, 'rgba(10, 14, 30, 0)');
      g.addColorStop(1, 'rgba(6, 8, 20, 0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (flash > 0) {
        ctx.fillStyle = `rgba(230, 240, 255, ${flash * 0.6})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (anchor && finger) {
        const dpr = W / box.clientWidth;
        const rect = box.getBoundingClientRect();
        const ax = (anchor.x - rect.left) * dpr;
        const ay = (anchor.y - rect.top) * dpr;
        ctx.strokeStyle = 'rgba(239, 227, 198, 0.35)';
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(ax, ay, STICK * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 227, 198, 0.45)';
        ctx.beginPath();
        ctx.arc(
          (finger.x - rect.left) * dpr,
          (finger.y - rect.top) * dpr,
          18 * dpr,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };

    const airHeight = () =>
      sim.air > 0 ? Math.sin(Math.PI * (1 - sim.air / 0.55)) * sim.size * 0.55 : 0;

    const drawProp = (p: LiveProp, now: number) => {
      const img = imgs.get(p.kind);
      let wobble = 0;
      if (p.kind === 'lab' && mode === 'intro')
        wobble = Math.sin(now * 40) * Math.min(1, now - stage0) * 4;
      const hop = p.mover && (p.vx || p.vy) ? Math.abs(Math.sin(now * 14 + p.id)) * p.h * 0.08 : 0;
      if (!img) {
        ctx.fillStyle = '#4a4038';
        ctx.fillRect(p.x - p.r, p.y - p.h, p.r * 2, p.h);
        return;
      }
      const h = p.h;
      const w = (h * img.width) / img.height;
      ctx.save();
      ctx.translate(p.x + wobble, p.y + p.r * 0.3 - hop);
      if (p.mover && p.vx < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
    };

    const drawCreature = (now: number, air: number) => {
      if (!sprite) return;
      const t = mode === 'intro' && breakout ? Math.min(1, (now - stage0 - 1.5) / 0.7) : 1;
      const rise = t < 1 ? 0.55 + 0.45 * easeOutBack(t) : 1;
      const k = (sim.size / sprite.height) * rise;
      const bob = sim.moving ? Math.abs(Math.sin(walk)) * sim.size * 0.035 : 0;
      const squash = sim.moving ? 1 + Math.sin(walk * 2) * 0.02 : 1 + Math.sin(now * 2.2) * 0.012;
      ctx.save();
      ctx.translate(sim.x, sim.y - bob - air);
      ctx.scale(sim.facing * (2 - squash), squash);
      ctx.drawImage(
        sprite.glow,
        -sprite.footX * k,
        -sprite.footY * k,
        sprite.glow.width * k,
        sprite.glow.height * k,
      );
      if (highlight && now < highlight.until) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 12);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse * Math.min(1, (highlight.until - now) / 0.6);
        for (const slot of highlight.slots) {
          const c = sprite.parts.get(slot);
          if (c) ctx.drawImage(c, -sprite.footX * k, -sprite.footY * k, c.width * k, c.height * k);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    };

    const drawFlung = (f: Flung) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.translate(f.x, f.y - f.z);
      ctx.rotate(f.rot);
      if (f.img) {
        const w = (f.h * f.img.width) / f.img.height;
        ctx.drawImage(f.img, -w / 2, -f.h / 2, w, f.h);
      }
      ctx.restore();
    };

    const drawEffect = (e: Effect, top: number) => {
      const t = 1 - e.life / e.max;
      if (e.kind === 'ring') {
        ctx.strokeStyle = aura;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = sim.size * 0.06;
        ctx.beginPath();
        ctx.ellipse(
          e.x,
          e.y,
          e.radius * (0.4 + t * 0.6),
          e.radius * 0.45 * (0.4 + t * 0.6),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = aura;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = sim.size * 0.05;
        ctx.beginPath();
        let x = e.x + (Math.random() - 0.5) * 80;
        let y = top;
        ctx.moveTo(x, y);
        const steps = 7;
        for (let i = 1; i <= steps; i++) {
          y = top + ((e.y - e.radius * 0.5 - top) * i) / steps;
          x = e.x + (i === steps ? 0 : (Math.random() - 0.5) * e.radius * 0.6);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    };

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('resize', resize);
    };
    // One run per mount: the parent remounts this (new key) for "Rampage again".
  }, []);

  const newBest = result !== null && result.rubble > best;
  const mm = Math.floor(hud.left / 60);
  const ss = Math.floor(hud.left % 60);

  return (
    <div className="rampage" ref={host} data-testid="rampage" data-phase={phase}>
      <canvas ref={canvasRef} className="rampage-canvas" />
      {phase === 'loading' && <p className="rampage-loading">The creature stirs…</p>}
      {(phase === 'play' || phase === 'intro') && (
        <div className="rampage-hud">
          <div className="rampage-stat">
            <span className="rampage-label">Rubble</span>
            <b data-testid="rampage-rubble">{hud.rubble.toLocaleString('en-US')}</b>
          </div>
          <div
            className={`rampage-clock ${hud.left < 10 ? 'hurry' : ''}`}
            data-testid="rampage-clock"
          >
            {mm}:{String(ss).padStart(2, '0')}
          </div>
          <div className="rampage-stat right">
            <span className="rampage-label">Height</span>
            <b data-testid="rampage-height">{hud.feet} ft</b>
          </div>
          {hud.next && (
            <div className="rampage-next">
              <span>Next to wake: {hud.next}</span>
              <i style={{ width: `${Math.round(hud.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {title && (
        <p key={title} className="rampage-title" data-testid="rampage-title">
          {title}
        </p>
      )}
      {banner && phase === 'play' && (
        <div
          key={banner.id}
          className="rampage-banner"
          data-testid="rampage-banner"
          onAnimationEnd={() => setBanner((b) => (b?.id === banner.id ? null : b))}
        >
          <b>{banner.title}</b>
          <span>{banner.text}</span>
        </div>
      )}
      {hint && phase === 'play' && <p className="rampage-hint">{hint}</p>}
      {phase === 'over' && result && (
        <div className="rampage-over" data-testid="rampage-over">
          <p className="eyebrow">{stage.name}</p>
          <h2 className="rampage-over-title">The rampage rests</h2>
          <div className="rampage-score">
            <b data-testid="rampage-score">{result.rubble.toLocaleString('en-US')}</b>
            <span>rubble{newBest ? ' · a new best!' : ''}</span>
          </div>
          <ul className="rampage-facts">
            <li>
              Grew to <b>{feet(result.peak * scale)} ft</b>
            </li>
            <li>
              Smashed <b>{result.smashed}</b> things, frightened <b>{result.frights}</b> villagers
            </li>
            <li>
              Woke <b>{result.powers.length}</b> of {POWERS.length} parts
              {result.powers.length > 0 &&
                `: ${result.powers
                  .map((id) => powerParts(POWERS.find((p) => p.id === id)!, parts)[0])
                  .filter(Boolean)
                  .join(', ')}`}
            </li>
          </ul>
          <p className="muted center-text rampage-count" data-testid="rampage-count">
            {contribution === 'counted'
              ? 'Added to the creature! At midnight it grows by everything the village smashed.'
              : contribution === 'guest'
                ? 'Sign in so your rubble makes the creature grow at midnight.'
                : contribution === 'failed'
                  ? 'The village tally could not be reached: this run did not count.'
                  : 'Adding your rubble to the creature…'}
          </p>
          {contribution === 'guest' && (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => onSignIn(result.rubble)}
              data-testid="rampage-signin"
            >
              Sign in to count it
            </button>
          )}
          <button
            className="btn btn-primary btn-wide"
            onClick={onAgain}
            data-testid="rampage-again"
          >
            Rampage again ⚡
          </button>
          <button
            className="btn btn-secondary btn-wide"
            onClick={onQuit}
            data-testid="rampage-quit"
          >
            Back to the lab
          </button>
        </div>
      )}
    </div>
  );
}

/** Mock only: `?runSeconds=N` shortens runs for tests. */
function testSeconds(): number {
  if (!run.isMock()) return RUN_SECONDS;
  const n = Number(new URLSearchParams(window.location.search).get('runSeconds'));
  return Number.isFinite(n) && n > 0 ? n : RUN_SECONDS;
}

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/** A few colours from a sprite, for its debris. */
function palette(img: HTMLImageElement): string[] {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, 8, 8);
  const { data } = x.getImageData(0, 0, 8, 8);
  const out: string[] = [];
  for (let i = 0; i < data.length; i += 4 * 5) {
    if (data[i + 3]! > 128) out.push(`rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`);
  }
  return out.length ? out : ['#6b5a48'];
}

/** Night grass (or the stage's ground) as a small repeating pixel tile. */
function makeGround(ctx: CanvasRenderingContext2D, stageId: string): CanvasPattern | null {
  const tones: Record<string, string[]> = {
    village: ['#1c2a1d', '#213222', '#192619', '#253825'],
    farms: ['#26301b', '#2c381f', '#212a17', '#33401f'],
    market: ['#262526', '#2c2b2c', '#212021', '#323032'],
    graveyard: ['#1b2420', '#1f2a25', '#17201c', '#243029'],
    estate: ['#1a2b22', '#1f3227', '#16251d', '#24392c'],
    city: ['#272628', '#2d2c2e', '#222123', '#333234'],
  };
  const pal = tones[stageId] ?? tones['village']!;
  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const t = tile.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      t.fillStyle = pal[Math.floor((r - Math.floor(r)) * pal.length)]!;
      t.fillRect(x, y, 1, 1);
    }
  const pattern = ctx.createPattern(tile, 'repeat');
  pattern?.setTransform(new DOMMatrix().scale(4));
  return pattern;
}
