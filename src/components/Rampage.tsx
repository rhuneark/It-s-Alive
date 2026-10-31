import { useEffect, useRef, useState } from 'react';
import { drawRig, type Pose } from '../app/creatureRig';
import { buildCreatureSprite, loadImage, type CreatureSprite } from '../app/creatureSprite';
import { chime, distantThunder, heartbeat, roar, swipe, thud, thunderclap } from '../app/sfx';
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
  type Power,
  type PowerId,
  type PropKind,
  type Stage,
} from '../game/rampage';
import { RampageRun, type LiveProp, type RunEvent, type RunResult } from '../game/rampageRun';
import * as run from '../sdk/run';

/**
 * The rampage: the creature everyone built, loose in the day's place at night. Drag anywhere (or
 * use the arrow keys) to steer; it claws at whatever is in reach on its own, smashes what is
 * smaller than it, grows, and wakes its parts' powers. It starts small on screen and looms larger
 * with every part that wakes, each one a short scene: the night closes in, lightning strikes it,
 * it swells and roars. The village is dark but for lamps, windows, jack-o'-lanterns, villagers'
 * torches and the fires it leaves; the storm lights it all now and then. The rules live in
 * game/rampageRun.ts; this draws them on a canvas and plays the effects.
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
/** The creature's share of the screen's height: small at first, looming larger as parts wake. */
const FILL_START = 0.14;
const FILL_PER_POWER = 0.028;
/** Close-ups: the intro, each part waking, the end. */
const FILL_CLOSE = 0.5;
/** Drag this far (css px) for full speed. */
const STICK = 56;
const INTRO_SECONDS = 2.8;
const CINE_SECONDS = 2.1;
const OUTRO_SECONDS = 1.6;
const ATTACK_SECONDS = 0.3;
/** How dark the night is away from any light (0..1), and the darkness layer's resolution. */
const NIGHT = 0.7;
const DARK_SCALE = 4;
/** Room around the rig for arms and wings flung wide (sprite px). */
const RIG_PAD = 48;

/** What the creature becomes as each power wakes, in the scene's big title. */
const WAKES: Record<PowerId, string> = {
  stride: 'It strides',
  reach: 'It reaches',
  maw: 'It hungers',
  tail: 'It lashes',
  wings: 'It leaps',
  spark: 'It rages',
};

const SCREAMS = ['AAAH!', 'RUN!', 'MONSTER!', 'HELP!', "IT'S LOOSE!", 'FLEE!', 'NOOO!'];
const FLUNG_SCREAMS = ['AAAAAH!', 'WAAAH!', 'EEEK!'];
/** What is left burning when it is smashed. */
const BURNS: ReadonlySet<PropKind> = new Set([
  'haystack',
  'cart',
  'scarecrow',
  'stall',
  'wagon',
  'cottage',
  'forge',
  'house',
  'tavern',
  'windmill',
  'watchtower',
  'church',
  'manor',
  'townhall',
]);
/** Buildings with lamplit windows. */
const WINDOWS: ReadonlySet<PropKind> = new Set([
  'cottage',
  'forge',
  'house',
  'tavern',
  'windmill',
  'watchtower',
  'church',
  'manor',
  'townhall',
]);

type Phase = 'loading' | 'intro' | 'play' | 'over';
type Mode = Phase | 'cine' | 'outro';

interface Hud {
  left: number;
  rubble: number;
  feet: number;
  next: string | null;
  progress: number;
}

interface Cine {
  id: number;
  word: string;
  parts: string;
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
  /** Pulls it back down (world units/s²); dust and smoke just drift. */
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
  kind: 'ring' | 'bolt' | 'slash';
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
  /** Slashes: which way the claw swept (1 to the right). */
  dir?: number;
}

interface Scream {
  text: string;
  x: number;
  y: number;
  born: number;
}

interface Fire {
  x: number;
  y: number;
  r: number;
  h: number;
  born: number;
  seed: number;
}

interface Scar {
  x: number;
  y: number;
  r: number;
  bits: Array<[number, number, number, string]>;
}

interface Drop {
  x: number;
  y: number;
  v: number;
}

interface Props {
  parts: Partial<Record<SlotId, string>>;
  stage: Stage;
  /** The day's place is the same for everyone (same seed). */
  seed: string;
  /** The creature's real height is its run size times this (it grew with the community). */
  scale: number;
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
  const [cine, setCine] = useState<Cine | null>(null);
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
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sparkKind = parts.spark?.replace('spark_', '') ?? 'lightning';
    const aura = AURA[sparkKind] ?? AURA['lightning']!;
    const world = buildWorld(seed, stage);
    const seconds = testSeconds();
    const sim = new RampageRun(world, BASE_SIZE, `${seed}:${Math.random()}`, seconds);

    let sprite: CreatureSprite | null = null;
    const rig = document.createElement('canvas');
    const rctx = rig.getContext('2d')!;
    const lit = document.createElement('canvas');
    const lctx = lit.getContext('2d')!;
    const imgs = new Map<PropKind, HTMLImageElement>();
    const colors = new Map<PropKind, string[]>();
    let ground: CanvasPattern | null = null;
    const particles: Particle[] = [];
    const flung: Flung[] = [];
    const effects: Effect[] = [];
    const screams: Scream[] = [];
    const fires: Fire[] = [];
    const scars: Scar[] = [];
    const rain: Drop[] = [];
    const scared = new Map<number, number>();
    let mode: Mode = 'loading';
    let sceneAt = 0; // when the current scene (intro, waking, end) began (s)
    let sceneT = 0; // how far into it the last frame was (s)
    let shake = 0;
    let flash = 0;
    let reveal = 0;
    let punch = 0;
    let dark = 0.97;
    let walk = 0;
    let stride = 0;
    let lastStep = 0;
    let attack = 0;
    let attackSide: 1 | -1 = 1;
    let face: 1 | -1 = 1;
    const lunge = { x: 0, y: 0 };
    let roarUntil = 0;
    let rear = 0;
    let swell = 0;
    let beat = 0;
    let glow = 0;
    let glowSlots: readonly string[] = [];
    let slowUntil = 0;
    let lastSlow = -10;
    let nextStrike = 0;
    const flickers: number[] = [];
    let nextBeat = 0;
    let lastHud = 0;
    let lastHaptic = 0;
    let lastThud = 0;
    let lastSwipe = 0;
    let lastScream = -10;
    let lastBlockHint = -10;
    let hintShown = false;
    let cineId = 0;
    let progress = 0;
    let outcome: RunResult | null = null;
    const cam = { x: world.start.x, y: world.start.y - 60, z: 1 };

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
      if (mode !== 'play' && mode !== 'intro' && mode !== 'cine') return;
      // A tap cuts a part's waking scene short once it has struck.
      if (mode === 'cine' && performance.now() / 1000 - sceneAt > 0.8) endCine();
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
    // The night is drawn on a small canvas and stretched: soft pools of light cut out of it.
    const night = document.createElement('canvas');
    const nctx = night.getContext('2d')!;
    let shade: CanvasGradient | null = null;
    let blood: CanvasGradient | null = null;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(box.clientWidth * dpr);
      cv.height = Math.round(box.clientHeight * dpr);
      night.width = Math.max(1, Math.ceil(cv.width / DARK_SCALE));
      night.height = Math.max(1, Math.ceil(cv.height / DARK_SCALE));
      const W = cv.width;
      const H = cv.height;
      const nw = night.width;
      const nh = night.height;
      shade = nctx.createRadialGradient(nw / 2, nh * 0.45, nh * 0.22, nw / 2, nh * 0.45, nh * 0.8);
      shade.addColorStop(0, 'rgba(4, 6, 16, 0)');
      shade.addColorStop(1, 'rgba(2, 3, 10, 0.75)');
      blood = nctx.createRadialGradient(nw / 2, nh / 2, nh * 0.3, nw / 2, nh / 2, nh * 0.75);
      blood.addColorStop(0, 'rgba(120, 0, 0, 0)');
      blood.addColorStop(1, 'rgba(150, 0, 10, 0.85)');
      rain.length = 0;
      if (!calm)
        for (let i = 0; i < 70; i++)
          rain.push({ x: Math.random() * W, y: Math.random() * H, v: (0.9 + Math.random()) * H });
    };
    resize();
    window.addEventListener('resize', resize);

    const hole = lightSprite('rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0.75)');
    const warm = lightSprite('rgba(255, 186, 96, 0.95)', 'rgba(255, 120, 40, 0.3)');
    const cold = lightSprite(aura, withAlpha(aura, 0.22));

    const enter = (m: Mode, now: number) => {
      mode = m;
      sceneAt = now;
      sceneT = 0;
    };
    /** True on the frame the current scene passes `at` seconds. */
    const at = (t: number, s: number) => sceneT < s && t >= s;

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
      if (sprite) {
        rig.width = lit.width = sprite.glow.width + RIG_PAD * 2;
        rig.height = lit.height = sprite.glow.height + RIG_PAD * 2;
      }
      ground = makeGround(ctx, stage.id);
      const now = performance.now() / 1000;
      enter('intro', now);
      setPhase('intro');
      cam.z = (cv.height * FILL_CLOSE) / sim.size;
      cam.y = sim.y - sim.size * 0.55;
      nextStrike = now + 7;
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
    const update = (realDt: number, now: number) => {
      const dt = now < slowUntil ? realDt * 0.3 : realDt;
      shake = Math.max(0, shake - realDt * 30);
      flash = Math.max(0, flash - realDt * 3);
      reveal = Math.max(0, reveal - realDt * 1.6);
      punch = Math.max(0, punch - realDt * 0.4);
      const t = now - sceneAt;

      // The storm: now and then lightning lights the whole place (two flickers, strikes far apart).
      if (!calm && mode !== 'loading' && now >= nextStrike) {
        nextStrike = now + 6 + Math.random() * 8;
        flickers.push(now, now + 0.36);
        if (Math.random() < 0.4) thunderclap(volume * 0.35);
        else distantThunder(volume * 0.7);
      }
      while (flickers.length && now >= flickers[0]!) {
        flickers.shift();
        lightUp(0.35, now);
        reveal = 1;
      }

      if (mode === 'intro') {
        // Black. A heartbeat. Lightning shows it standing in the ruins of its laboratory; it
        // rears up and roars, and the camera pulls back over the village.
        if (at(t, 0.05)) heartbeat(volume);
        if (at(t, 0.5)) strikeIt(now);
        if (at(t, 0.95)) {
          roarUntil = now + 1.3;
          roar(volume * 0.8);
          setTitle('RAMPAGE!');
          if (!calm) shake = Math.max(shake, 12);
          run.haptic('heavy');
        }
        if (t >= INTRO_SECONDS) {
          enter('play', now);
          setPhase('play');
          setTitle(null);
          if (!hintShown) {
            hintShown = true;
            setHint('Drag anywhere to steer. It claws whatever is in reach!');
          }
        }
      } else if (mode === 'play') {
        const events = sim.step(dt, steer());
        for (const e of events) handle(e, now);
        if (sim.moving) {
          // Heavier, slower strides as it grows.
          walk += dt * (8 / Math.pow(sim.size / sim.start, 0.35));
          if (walk - lastStep > Math.PI) {
            lastStep = walk;
            const ratio = sim.size / sim.start;
            dust(sim.x, sim.y, sim.size * 0.25, 4);
            if (ratio > 1.5 && now - lastThud > 0.2) {
              lastThud = now;
              thud(volume * 0.3, 0.45);
              if (!calm) shake = Math.max(shake, 1 + ratio);
            }
          }
        }
        // The last ten seconds: its heart pounds.
        if (sim.timeLeft < 10 && now >= nextBeat) {
          nextBeat = now + 0.7;
          heartbeat(volume * 0.5);
        }
      } else if (mode === 'cine') {
        if (at(t, 0.3)) {
          strikeIt(now);
          glow = 1.6;
        }
        if (at(t, 0.55)) {
          roarUntil = now + 1.2;
          roar(volume * 0.75);
          chime(volume * 0.8);
          effects.push({
            kind: 'ring',
            x: sim.x,
            y: sim.y,
            radius: sim.size * 1.6,
            life: 0.7,
            max: 0.7,
          });
        }
        if (at(t, 0.85)) heartbeat(volume * 0.8);
        if (t >= (calm ? 1.4 : CINE_SECONDS)) endCine();
      } else if (mode === 'outro') {
        if (at(t, 0.15)) {
          roarUntil = now + 1.3;
          roar(volume * 0.7);
        }
        if (t >= OUTRO_SECONDS) {
          enter('over', now);
          setPhase('over');
          if (outcome) setResult(outcome);
        }
      }
      sceneT = now - sceneAt;

      // Its pose.
      attack = Math.max(0, attack - dt);
      rear += ((now < roarUntil ? 1 : 0) - rear) * Math.min(1, realDt * 7);
      if (mode === 'cine') {
        // It swells as the strike hits, and settles a little bigger.
        const grow = Math.min(1, Math.max(0, (t - 0.3) / 0.5));
        const settle = Math.min(1, Math.max(0, (t - 1.5) / 0.6));
        swell = Math.sin((grow * Math.PI) / 2) * (1 - settle * 0.7);
      } else swell = Math.max(0, swell - realDt * 1.5);
      beat += ((sim.air > 0 ? 1 : 0) - beat) * Math.min(1, realDt * 8);
      if (mode !== 'cine') glow = Math.max(0, glow - realDt * 0.9);
      stride += ((mode === 'play' && sim.moving ? 1 : 0) - stride) * Math.min(1, realDt * 6);

      // Camera: small at first, looming larger with each part woken; close in for every scene.
      const next = sim.nextPower();
      progress = next ? next.progress : 1;
      const play = FILL_START + FILL_PER_POWER * sim.powers.length + 0.02 * progress;
      let fill = play;
      let ease = 2.2;
      if (mode === 'intro') {
        fill = t < 1.5 ? FILL_CLOSE : play;
        ease = t < 1.5 ? 6 : 1.6;
      } else if (mode === 'cine') {
        fill = FILL_CLOSE;
        ease = 4;
      } else if (mode === 'outro' || mode === 'over') {
        fill = 0.42;
        ease = 2.5;
      }
      const close = mode !== 'play';
      const framing = sim.size;
      const target = ((cv.height * fill) / framing) * (1 + punch);
      cam.z += (target - cam.z) * Math.min(1, realDt * ease);
      const fx = sim.x;
      // Close-ups sit it low on the screen, under the scene's title.
      const fy = sim.y - framing * (close ? 0.66 : 0.45);
      cam.x += (fx - cam.x) * Math.min(1, realDt * 6);
      cam.y += (fy - cam.y) * Math.min(1, realDt * 6);
      // Never show past the edge of the map.
      const halfW = cv.width / cam.z / 2;
      const halfH = cv.height / cam.z / 2;
      cam.x = halfW * 2 < WORLD_W ? Math.max(halfW, Math.min(WORLD_W - halfW, cam.x)) : WORLD_W / 2;
      cam.y = halfH * 2 < WORLD_H ? Math.max(halfH, Math.min(WORLD_H - halfH, cam.y)) : WORLD_H / 2;

      // The night: pitch black at first, closing in for every scene, lifted by lightning.
      const darkTarget = mode === 'intro' ? (t < 1.4 ? 0.96 : NIGHT) : close ? 0.9 : NIGHT;
      dark += (darkTarget - dark) * Math.min(1, realDt * (mode === 'intro' ? 1.5 : 3));

      tickParticles(dt, now);
      tickRain(realDt);
      if (now - lastHud > 0.12 && mode === 'play') {
        lastHud = now;
        setHud({
          left: sim.timeLeft,
          rubble: sim.rubble,
          feet: feet(sim.size * scale),
          next: next ? (powerParts(next.power, parts)[0] ?? next.power.id) : null,
          progress,
        });
      }
    };

    /** A lightning flash, never more than 3 a second whatever strikes at once. */
    let lastFlash = -10;
    const lightUp = (amount: number, now: number) => {
      if (now - lastFlash < 0.34) return;
      lastFlash = now;
      flash = Math.max(flash, amount);
    };

    /** Lightning onto the creature itself (the intro, and every part that wakes). */
    const strikeIt = (now: number) => {
      effects.push({
        kind: 'bolt',
        x: sim.x,
        y: sim.y - sim.size * 0.55,
        radius: sim.size * 0.6,
        life: 0.45,
        max: 0.45,
      });
      thunderclap(volume * 0.8);
      run.haptic('heavy');
      nextStrike = Math.max(nextStrike, now + 4);
      if (calm) return;
      lightUp(0.75, now);
      reveal = 1;
      shake = Math.max(shake, 16);
    };

    const startCine = (power: Power, now: number) => {
      enter('cine', now);
      glowSlots = power.slots;
      const names = powerParts(power, parts);
      setCine({
        id: ++cineId,
        word: WAKES[power.id],
        parts: names.length
          ? `${names.join(' & ')} ${names.length > 1 ? 'awaken' : 'awakens'}`
          : 'Its body awakens',
        text: power.effect,
      });
      setHint(null);
      heartbeat(volume);
      run.haptic('heavy');
    };

    const endCine = () => {
      if (mode !== 'cine') return;
      enter('play', performance.now() / 1000);
      setCine(null);
    };

    const handle = (e: RunEvent, now: number) => {
      if (e.type === 'smash') {
        const p = e.prop;
        const weight = Math.min(1, p.h / sim.size);
        if (p.mover) {
          fling(p);
          if (now - lastScream > 0.35) {
            lastScream = now;
            screams.push({ text: pick(FLUNG_SCREAMS), x: p.x, y: p.y - p.h, born: now });
          }
        } else {
          const away = Math.atan2(p.y - sim.y, p.x - sim.x);
          debris(p.x, p.y, p.h, p.kind, Math.round(4 + weight * 18), e.by === 'claw' ? away : null);
          scar(p);
          if (BURNS.has(p.kind) && fires.length < 30)
            fires.push({ x: p.x, y: p.y, r: p.r, h: p.h, born: now, seed: Math.random() * 10 });
          // Something big comes down in slow motion.
          if (!calm && p.h >= 120 && weight > 0.5 && now - lastSlow > 2.5) {
            lastSlow = now;
            slowUntil = now + 0.45;
            punch = 0.1;
          }
        }
        if (!calm) shake = Math.max(shake, weight * 10);
        swell = Math.max(swell, weight * 0.35);
        if (now - lastThud > 0.07) {
          lastThud = now;
          thud(volume * 0.8, weight);
        }
        if (now - lastHaptic > 0.09) {
          lastHaptic = now;
          run.haptic(weight > 0.5 ? 'medium' : 'light');
        }
        if (hintShown) setHint(null);
      } else if (e.type === 'attack') {
        const p = e.prop;
        const dx = p.x - sim.x;
        const dy = p.y - sim.y;
        const d = Math.hypot(dx, dy) || 1;
        const onRight = dx > 0;
        // It turns to its prey and rakes it with one arm, then the other.
        face = Math.abs(dx) > sim.size * 0.05 ? (onRight ? 1 : -1) : sim.facing > 0 ? 1 : -1;
        attackSide = e.side;
        attack = ATTACK_SECONDS;
        lunge.x = dx / d;
        lunge.y = dy / d;
        effects.push({
          kind: 'slash',
          x: p.x,
          y: p.y - p.h * 0.5,
          radius: Math.max(p.h * 0.9, sim.size * 0.3),
          life: 0.32,
          max: 0.32,
          dir: onRight ? 1 : -1,
        });
        if (now - lastSwipe > 0.12) {
          lastSwipe = now;
          swipe(volume * 0.7);
        }
      } else if (e.type === 'blocked') {
        if (!calm) shake = Math.max(shake, 3);
        if (now - lastBlockHint > 3) {
          lastBlockHint = now;
          setHint(`Too big to smash yet: grow first!`);
          setTimeout(() => setHint((h) => (h?.startsWith('Too big') ? null : h)), 1800);
        }
      } else if (e.type === 'power') {
        startCine(e.power, now);
      } else if (e.type === 'land') {
        effects.push({ kind: 'ring', x: sim.x, y: sim.y, radius: e.radius, life: 0.45, max: 0.45 });
        dust(sim.x, sim.y, e.radius * 0.6, 14);
        if (!calm) shake = Math.max(shake, 14);
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
        if (!calm) lightUp(0.4, now);
        thunderclap(volume * 0.5);
      } else if (e.type === 'end') {
        enter('outro', now);
        setCine(null);
        setHint(null);
        outcome = sim.result();
        run.haptic('success');
        endRef.current(outcome);
      }
    };

    // ------------------------------------------------------------- effects
    const debris = (
      x: number,
      y: number,
      h: number,
      kind: PropKind,
      n: number,
      toward: number | null,
    ) => {
      const pal = colors.get(kind) ?? ['#6b5a48', '#8a7a62', '#3c332b'];
      for (let i = 0; i < n; i++) {
        const a =
          toward === null ? Math.random() * Math.PI * 2 : toward + (Math.random() - 0.5) * 1.6;
        const sp = (0.4 + Math.random()) * h * (toward === null ? 1.6 : 2.6);
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
    /** What it smashed leaves rubble on the ground. */
    const scar = (p: LiveProp) => {
      if (p.h < 26) return;
      const pal = colors.get(p.kind) ?? ['#3c332b'];
      const bits: Scar['bits'] = [];
      for (let i = 0; i < 5; i++)
        bits.push([
          (Math.random() - 0.5) * p.r * 1.6,
          (Math.random() - 0.5) * p.r * 0.6,
          p.h * (0.06 + Math.random() * 0.08),
          pal[i % pal.length]!,
        ]);
      scars.push({ x: p.x, y: p.y, r: p.r, bits });
      if (scars.length > 600) scars.shift();
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
    const tickParticles = (dt: number, now: number) => {
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
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i]!;
        const age = now - f.born;
        if (age > 9) {
          fires.splice(i, 1);
          continue;
        }
        // Embers and smoke rise from what burns.
        if (Math.random() < dt * 5)
          particles.push({
            x: f.x + (Math.random() - 0.5) * f.r,
            y: f.y,
            z: f.h * 0.2,
            vx: (Math.random() - 0.5) * f.h * 0.3,
            vy: 0,
            vz: f.h * (0.5 + Math.random() * 0.6),
            size: f.h * 0.03,
            color: Math.random() < 0.5 ? '#ffb347' : '#ff6a1a',
            life: 0.8 + Math.random() * 0.6,
            g: 0,
          });
        if (Math.random() < dt * 2.5)
          particles.push({
            x: f.x + (Math.random() - 0.5) * f.r * 0.6,
            y: f.y,
            z: f.h * 0.35,
            vx: f.h * 0.15,
            vy: 0,
            vz: f.h * 0.35,
            size: f.h * (0.18 + Math.random() * 0.15),
            color: 'rgba(28, 24, 26, 0.45)',
            life: 1.6,
            g: 0,
          });
      }
      for (let i = screams.length - 1; i >= 0; i--)
        if (now - screams[i]!.born > 1.2) screams.splice(i, 1);
      if (particles.length > 600) particles.splice(0, particles.length - 600);
    };
    const tickRain = (dt: number) => {
      const W = cv.width;
      const H = cv.height;
      for (const d of rain) {
        d.y += d.v * dt;
        d.x -= d.v * 0.22 * dt;
        if (d.y > H) {
          d.y -= H + 20;
          d.x = Math.random() * W * 1.2;
        }
      }
    };

    // ------------------------------------------------------------- draw
    const draw = (now: number) => {
      const W = cv.width;
      const H = cv.height;
      const dpr = W / Math.max(1, box.clientWidth);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05070a';
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

      // ground, roads and the rubble it has left
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
      for (const s of scars) {
        if (s.x < vx0 - s.r || s.x > vx1 + s.r || s.y < vy0 - s.r || s.y > vy1 + s.r) continue;
        ctx.fillStyle = 'rgba(14, 11, 9, 0.6)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.r * 1.2, s.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [bx, by, bs, c] of s.bits) {
          ctx.fillStyle = c;
          ctx.fillRect(s.x + bx - bs / 2, s.y + by - bs / 2, bs, bs * 0.7);
        }
      }

      // what is in view, back to front, and the lights among it
      const margin = 500;
      const items: Array<{ y: number; draw: () => void }> = [];
      const holes: Array<[number, number, number, number]> = [];
      const glows: Array<[number, number, number, number]> = [];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      for (const p of sim.props) {
        if (!p.alive) continue;
        if (p.x < vx0 - margin || p.x > vx1 + margin || p.y < vy0 - 40 || p.y > vy1 + margin)
          continue;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * 1.1, p.r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        items.push({ y: p.y, draw: () => drawProp(p, now) });
        const flicker = 0.9 + 0.1 * Math.sin(now * 13 + p.id * 1.7);
        if (p.kind === 'lamp') {
          holes.push([p.x, p.y - p.h * 0.5, p.h * 1.9, 0.9]);
          glows.push([p.x, p.y - p.h * 0.9, p.h * 0.55, 0.7 * flicker]);
        } else if (p.kind === 'pumpkin') {
          holes.push([p.x, p.y - p.h * 0.3, p.h * 2.2, 0.55 * flicker]);
          glows.push([p.x, p.y - p.h * 0.35, p.h * 1.1, 0.45 * flicker]);
        } else if (torch(p)) {
          const hx = p.x + (p.vx < 0 ? -1 : 1) * p.h * 0.22;
          holes.push([hx, p.y - p.h * 0.6, p.h * 2.6, 0.8 * flicker]);
          glows.push([hx, p.y - p.h * 0.85, p.h * 0.8, 0.6 * flicker]);
        } else if (WINDOWS.has(p.kind) && p.id % 2 === 0) {
          holes.push([p.x, p.y - p.h * 0.35, p.h * 0.8, 0.45]);
          glows.push([p.x, p.y - p.h * 0.4, p.h * 0.4, 0.22 * flicker]);
        }
      }
      for (const f of fires) {
        if (f.x < vx0 - margin || f.x > vx1 + margin || f.y < vy0 - 40 || f.y > vy1 + margin)
          continue;
        const k = fireStrength(f, now);
        items.push({ y: f.y, draw: () => drawFire(f, now, k) });
        const flicker = 0.85 + 0.15 * Math.sin(now * 17 + f.seed);
        holes.push([f.x, f.y - f.h * 0.25, f.h * 1.5, 0.9 * k * flicker]);
        glows.push([f.x, f.y - f.h * 0.3, f.h * 0.9, 0.55 * k * flicker]);
      }
      const air = airHeight();
      if (sprite) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
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

      // The night, on a small canvas stretched over the screen: pools of light cut out of it (the
      // creature's own glow, then the village's), a cold vignette, the heart pounding red at the
      // edges, and lightning.
      const close = mode !== 'play';
      const cx = sim.x * z + ox;
      const cy = (sim.y - sim.size * 0.5 - air) * z + oy;
      const body = sim.size * z;
      const shadeAlpha = Math.max(0, dark * (1 - reveal * 0.85));
      const nw = night.width;
      const nh = night.height;
      nctx.globalCompositeOperation = 'source-over';
      nctx.globalAlpha = 1;
      nctx.clearRect(0, 0, nw, nh);
      if (shadeAlpha > 0.01) {
        nctx.fillStyle = `rgba(3, 4, 12, ${shadeAlpha})`;
        nctx.fillRect(0, 0, nw, nh);
        nctx.globalCompositeOperation = 'destination-out';
        const stamp = (x: number, y: number, r: number, a: number) => {
          if (r <= 0 || a <= 0) return;
          nctx.globalAlpha = Math.min(1, a);
          nctx.drawImage(
            hole,
            (x - r) / DARK_SCALE,
            (y - r) / DARK_SCALE,
            (r * 2) / DARK_SCALE,
            (r * 2) / DARK_SCALE,
          );
        };
        if (close) stamp(cx, cy, body * 0.95, 1);
        else {
          stamp(cx, cy, Math.max(H * 0.34, body * 1.5), 1);
          stamp(cx, cy, Math.max(H * 0.6, body * 2.6), 0.35);
        }
        for (const [x, y, r, a] of holes) stamp(x * z + ox, y * z + oy, r * z, close ? a * 0.5 : a);
        nctx.globalCompositeOperation = 'source-over';
      }
      if (shade) {
        nctx.globalAlpha = 1;
        nctx.fillStyle = shade;
        nctx.fillRect(0, 0, nw, nh);
      }
      if (blood) {
        const hurry = mode === 'play' && sim.timeLeft < 10;
        const strength = close ? 0.55 : hurry ? 0.5 : 0.16;
        const period = hurry || close ? 0.7 : 1;
        const p = (now % period) / period;
        const pulse =
          Math.exp(-(((p - 0.05) / 0.06) ** 2)) + 0.6 * Math.exp(-(((p - 0.3) / 0.06) ** 2));
        nctx.globalAlpha = Math.min(1, strength * (0.35 + 0.65 * pulse));
        nctx.fillStyle = blood;
        nctx.fillRect(0, 0, nw, nh);
      }
      if (flash > 0) {
        nctx.globalAlpha = 1;
        nctx.fillStyle = `rgba(230, 240, 255, ${flash * 0.6})`;
        nctx.fillRect(0, 0, nw, nh);
      }
      nctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(night, 0, 0, W, H);
      ctx.imageSmoothingEnabled = false;

      // Lightning, claw marks and shockwaves blaze over the dark; warm halos, and the creature's
      // cold one.
      ctx.setTransform(z, 0, 0, z, ox, oy);
      for (const e of effects) drawEffect(e, vy0);
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, r, a] of glows) {
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(warm, x - r, y - r, r * 2, r * 2);
      }
      const halo = sim.size * (0.7 + glow * 0.5);
      ctx.globalAlpha = Math.min(1, 0.22 + glow * 0.35);
      ctx.drawImage(cold, sim.x - halo, sim.y - sim.size * 0.5 - air - halo, halo * 2, halo * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Rain, screams, and the steering stick.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rain.length) {
        ctx.strokeStyle = 'rgba(170, 190, 230, 0.22)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        const len = H * 0.03;
        for (const d of rain) {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + len * 0.22, d.y - len);
        }
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      for (const s of screams) {
        const age = now - s.born;
        const px = s.x * z + ox;
        const py = s.y * z + oy - age * 34 * dpr;
        if (px < -60 * dpr || px > W + 60 * dpr || py < -20 || py > H + 40 * dpr) continue;
        const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.5 : 1.1 - Math.min(0.1, age - 0.12);
        ctx.globalAlpha = Math.max(0, Math.min(1, (1.2 - age) / 0.35));
        ctx.font = `800 ${Math.round(15 * dpr * pop)}px Cinzel, serif`;
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = '#14080a';
        ctx.strokeText(s.text, px, py);
        ctx.fillStyle = '#ffe2c4';
        ctx.fillText(s.text, px, py);
      }
      ctx.globalAlpha = 1;
      if (anchor && finger && mode === 'play') {
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

    /** Some villagers carry torches. */
    const torch = (p: LiveProp) =>
      p.mover && (p.kind === 'villager' || p.kind === 'farmer') && p.id % 3 === 0;

    const drawProp = (p: LiveProp, now: number) => {
      const img = imgs.get(p.kind);
      if (!img) {
        ctx.fillStyle = '#4a4038';
        ctx.fillRect(p.x - p.r, p.y - p.h, p.r * 2, p.h);
        return;
      }
      const h = p.h;
      const w = (h * img.width) / img.height;
      if (!p.mover) {
        ctx.drawImage(img, p.x - w / 2, p.y + p.r * 0.3 - h, w, h);
        return;
      }
      // Townsfolk: idle sway, a stroll, or a panicked sprint (leaning in, bouncing, arms flailing).
      const speed = Math.hypot(p.vx, p.vy);
      const fleeing = speed > 40;
      if (fleeing && !scared.has(p.id)) {
        scared.set(p.id, now);
        if (now - lastScream > 0.45 && Math.random() < 0.45) {
          lastScream = now;
          screams.push({ text: pick(SCREAMS), x: p.x, y: p.y - h * 1.1, born: now });
        }
      } else if (!fleeing && speed < 30) scared.delete(p.id);
      const ph = now * (fleeing ? 18 : 8) + p.id;
      const hop = fleeing
        ? Math.abs(Math.sin(ph)) * h * 0.16
        : speed > 1
          ? Math.abs(Math.sin(ph)) * h * 0.05
          : 0;
      const dir = p.vx < 0 ? -1 : 1;
      const lean = fleeing ? 0.2 * dir + Math.sin(ph * 2) * 0.08 : Math.sin(ph) * 0.03;
      const sq = fleeing ? 1 + Math.sin(ph * 2) * 0.07 : 1 + Math.sin(now * 2 + p.id) * 0.02;
      ctx.save();
      ctx.translate(p.x, p.y + p.r * 0.3 - hop);
      ctx.rotate(lean);
      ctx.scale(dir * (2 - sq), sq);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
      if (torch(p)) {
        const fx = p.x + dir * h * 0.22;
        const fy = p.y - h * 0.78 - hop;
        const f = 0.8 + 0.2 * Math.sin(now * 20 + p.id);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(fx - h * 0.02, fy, h * 0.04, h * 0.28);
        ctx.fillStyle = '#ff7a1a';
        ctx.fillRect(fx - h * 0.06, fy - h * 0.12 * f, h * 0.12, h * 0.14 * f);
        ctx.fillStyle = '#ffd36a';
        ctx.fillRect(fx - h * 0.03, fy - h * 0.07 * f, h * 0.06, h * 0.08 * f);
      }
      const since = scared.get(p.id);
      if (since !== undefined && now - since < 0.8) {
        const k = Math.min(1, (now - since) / 0.1);
        ctx.font = `800 ${h * 0.55 * k}px Cinzel, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = h * 0.08;
        ctx.strokeStyle = '#1a0a0a';
        ctx.strokeText('!', p.x, p.y - h * 1.05 - hop);
        ctx.fillStyle = '#ff4a3a';
        ctx.fillText('!', p.x, p.y - h * 1.05 - hop);
      }
    };

    const fireStrength = (f: Fire, now: number) => {
      const age = now - f.born;
      return Math.min(1, age / 0.3) * Math.min(1, (9 - age) / 3);
    };
    const drawFire = (f: Fire, now: number, k: number) => {
      if (k <= 0) return;
      // Tongues of flame licking up from the ruin, each tapering to a flickering tip.
      const tongues = 5;
      const layers = [
        ['#b8280a', 1, 1],
        ['#ff7f1e', 0.66, 0.78],
        ['#ffd65e', 0.34, 0.5],
      ] as const;
      for (const [color, wide, tall] of layers) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < tongues; i++) {
          const x = f.x + (i - (tongues - 1) / 2) * f.r * 0.3;
          const lick = 0.55 + 0.45 * Math.sin(now * 9 + i * 1.9 + f.seed);
          const fh = f.h * 0.34 * lick * k * tall * (i === 2 ? 1.3 : i % 2 ? 1 : 0.8);
          const fw = f.r * 0.42 * wide;
          const sway = Math.sin(now * 6 + i * 2.3 + f.seed) * fw * 0.5;
          ctx.moveTo(x - fw / 2, f.y);
          ctx.quadraticCurveTo(x - fw * 0.45, f.y - fh * 0.5, x + sway, f.y - fh);
          ctx.quadraticCurveTo(x + fw * 0.45, f.y - fh * 0.5, x + fw / 2, f.y);
          ctx.closePath();
        }
        ctx.fill();
      }
    };

    const drawCreature = (now: number, air: number) => {
      if (!sprite) return;
      const pose: Pose = {
        t: now,
        walk,
        stride,
        attack: attack > 0 ? 1 - attack / ATTACK_SECONDS : 0,
        side: attackSide,
        roar: rear,
        swell,
        beat,
        glowSlots,
        glow,
      };
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(0, 0, rig.width, rig.height);
      rctx.imageSmoothingEnabled = false;
      rctx.translate(RIG_PAD, RIG_PAD);
      drawRig(rctx, sprite, pose);
      // Its glow, blurred at the sprite's own size (cheap), then scaled up with it.
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, lit.width, lit.height);
      lctx.shadowColor = aura;
      lctx.shadowBlur = 3 + glow * 4 + (mode === 'play' ? 0 : 2);
      lctx.drawImage(rig, 0, 0);
      const k = sim.size / sprite.height;
      const f = attack > 0 ? face : sim.facing > 0 ? 1 : -1;
      const reachOut =
        attack > 0 ? Math.sin(Math.PI * (1 - attack / ATTACK_SECONDS)) * sim.size * 0.08 : 0;
      const squash = 1 + Math.sin(walk * 2) * 0.025 * stride;
      // Swelling as a part wakes (and a little gulp with every big smash).
      const big = 1 + swell * 0.15;
      ctx.save();
      ctx.translate(sim.x + lunge.x * reachOut, sim.y - air + lunge.y * reachOut * 0.5);
      ctx.scale(f * k * big * (2 - squash), k * big * squash);
      ctx.drawImage(lit, -(sprite.footX + RIG_PAD), -(sprite.footY + RIG_PAD));
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
      } else if (e.kind === 'slash') {
        // Three claw marks raked across it, drawn in fast and fading.
        const R = e.radius;
        const dir = e.dir ?? 1;
        const grow = Math.min(1, t / 0.25);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(dir, 1);
        ctx.globalAlpha = 1 - Math.max(0, (t - 0.25) / 0.75);
        ctx.shadowColor = aura;
        ctx.shadowBlur = 10;
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          const off = i * R * 0.22;
          const x0 = -R * 0.55 + off;
          const y0 = -R * 0.5 - off * 0.4;
          const x1 = R * 0.5 + off;
          const y1 = R * 0.45 - off * 0.4;
          ctx.strokeStyle = '#fff6ea';
          ctx.lineWidth = R * 0.07 * (1 - t * 0.6);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(
            (x0 + x1) / 2 + R * 0.25,
            (y0 + y1) / 2 - R * 0.2,
            x0 + (x1 - x0) * grow,
            y0 + (y1 - y0) * grow,
          );
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = aura;
        ctx.shadowBlur = 16;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = Math.max(sim.size * 0.05, e.radius * 0.08);
        ctx.beginPath();
        let x = e.x + (Math.random() - 0.5) * 80;
        let y = top;
        ctx.moveTo(x, y);
        const steps = 8;
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
      {phase === 'play' && !cine && (
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
      {cine && (
        <div key={cine.id} className="rampage-cine" data-testid="rampage-cine" aria-live="polite">
          <span className="rampage-cine-parts">{cine.parts}</span>
          <b className="rampage-cine-word">{cine.word}</b>
          <span className="rampage-cine-text">{cine.text}</span>
        </div>
      )}
      {hint && phase === 'play' && !cine && <p className="rampage-hint">{hint}</p>}
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

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** The same rgba colour with another alpha. */
function withAlpha(rgba: string, a: number): string {
  return rgba.replace(/[\d.]+\)\s*$/, `${a})`);
}

/** A soft round pool of light, to stamp out of the night or add onto it. */
function lightSprite(inner: string, mid: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
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
