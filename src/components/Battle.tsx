import { useEffect, useRef, useState } from 'react';
import { RigCanvas, type Pose } from '../app/creatureRig';
import { buildCreatureSprite, loadImage } from '../app/creatureSprite';
import { AURA, lightSprite, makeGround, palette, withAlpha } from '../app/drawing';
import { localBattle } from '../app/localBattle';
import { chime, distantThunder, heartbeat, roar, swipe, thud } from '../app/sfx';
import type { Standing } from '../game/arena';
import { BATTLE_TUNE } from '../game/arena';
import {
  unpackEvent,
  unpackFighters,
  unpackPickups,
  type BattleEvent,
  type BattleProtocol,
  type FighterView,
  type PickupView,
  type SeatInfo,
} from '../game/battleWire';
import { big } from '../game/numbers';
import { POWERUPS, type PowerupKind } from '../game/powerup';
import {
  BASE_SIZE,
  POWERS,
  PROPS,
  STAGES,
  WORLD_H,
  WORLD_W,
  buildWorld,
  type PropKind,
  type World,
} from '../game/rampage';
import { Field, type LiveProp } from '../game/rampageRun';
import type { Parts } from '../game/sketch';
import * as run from '../sdk/run';

/**
 * A battle: up to eight creatures loose in one place for three minutes, live with other players
 * (RUN's realtime rooms) or offline against bots. Grow by smashing the village and devouring
 * smaller creatures; the most mass when the clock runs out wins. Everything shown comes from the
 * room's snapshots (battleWire.ts): other creatures are drawn a tenth of a second in the past,
 * smoothly between snapshots; your own runs ahead with your steering so it answers at once.
 */

const KINDS = Object.keys(PROPS) as PropKind[];
const STICK = 56;
/** Your creature's share of the screen's height (a little more for every part woken). */
const FILL = 0.15;
const FILL_PER_PART = 0.018;
/** Others are drawn this far in the past (ms), between two snapshots. */
const DELAY_LIVE = 110;
const DELAY_LOCAL = 60;
const NIGHT = 0.5;
const DARK_SCALE = 4;

const WAKES: Record<string, string> = {
  stride: 'It strides',
  reach: 'It reaches',
  maw: 'It hungers',
  tail: 'It lashes',
  wings: 'It leaps',
  spark: 'It rages',
};

type Status = 'joining' | 'lobby' | 'battle' | 'over';

interface Hud {
  left: number;
  mass: number;
  rank: number;
  of: number;
  top: Array<{ rank: number; name: string; mass: number; me: boolean }>;
  buffs: PowerupKind[];
  players: number;
}

interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: 'gold' | 'red' | 'power';
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
  g: number;
}

interface Effect {
  kind: 'ring' | 'bolt' | 'slash';
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
  color: string;
}

interface Body {
  seat: SeatInfo;
  rig: RigCanvas | null;
  aura: string;
  /** Snapshots of it: [received at (ms), state]. */
  prev: FighterView | null;
  next: FighterView | null;
  prevAt: number;
  nextAt: number;
  walk: number;
  attack: number;
  side: 1 | -1;
  roarUntil: number;
  rear: number;
  glow: number;
  shown: { x: number; y: number; size: number };
}

interface Props {
  parts: Parts;
  name: string;
  volume: number;
  onQuit: () => void;
  onAgain: () => void;
}

export function Battle({ parts, name, volume, onQuit, onAgain }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('joining');
  const [live, setLive] = useState<boolean | null>(null);
  const [left, setLeft] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [feed, setFeed] = useState<Array<{ id: number; text: string }>>([]);
  const [devoured, setDevoured] = useState<{ by: string; until: number } | null>(null);
  const [table, setTable] = useState<{ rows: Standing[]; me: string } | null>(null);

  useEffect(() => {
    const cv = canvasRef.current!;
    const box = host.current!;
    const ctx = cv.getContext('2d')!;
    let alive = true;
    let raf = 0;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const mock = run.isMock();
    const query = new URLSearchParams(window.location.search);

    // ------------------------------------------------------------- the link
    let link: run.BattleLink | null = null;
    let liveRoom = false;
    let me = '';
    let world: World | null = null;
    let field: Field | null = null;
    let ground: CanvasPattern | null = null;
    const imgs = new Map<PropKind, HTMLImageElement>();
    const colors = new Map<PropKind, string[]>();
    const bodies: Body[] = [];
    const byIndex = new Map<number, Body>();
    let pickups: PickupView[] = [];
    let timeLeft = 0;
    let lastSnapAt = 0;
    const particles: Particle[] = [];
    const effects: Effect[] = [];
    const flung: Array<{
      img: HTMLImageElement | null;
      h: number;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      rot: number;
      spin: number;
      life: number;
    }> = [];
    const pops: Array<{ text: string; x: number; y: number; born: number }> = [];
    let shake = 0;
    let flash = 0;
    let bannerId = 0;
    let feedId = 0;
    let nextBeat = 0;
    let lastThud = 0;
    let lastSwipe = 0;
    let mine: FighterView | null = null;
    const cam = { x: WORLD_W / 2, y: WORLD_H / 2, z: 0.5 };

    const say = (text: string, sub: string | undefined, tone: Banner['tone']) =>
      setBanner({ id: ++bannerId, text, sub, tone });
    const tell = (text: string) => setFeed((f) => [...f.slice(-3), { id: ++feedId, text }]);

    const join = async () => {
      // Mock only: ?offline=1 skips the local room server (tests); ?battleSeconds=N shortens it.
      const seconds = mock ? Number(query.get('battleSeconds')) || undefined : undefined;
      const tryLive = !(mock && query.get('offline') === '1') && seconds === undefined;
      const joined = tryLive ? await run.joinBattle() : null;
      if (!alive) {
        if (joined?.ok) joined.link.leave();
        return;
      }
      if (joined?.ok) {
        link = joined.link;
        liveRoom = true;
      } else link = localBattle(seconds);
      setLive(liveRoom);
      run.track('battle_join', { live: liveRoom });
      link.on({
        onMessage: (m) => alive && receive(m),
        onDisconnect: () =>
          alive && say('Connection lost', 'The battle goes on without you', 'red'),
      });
      link.send({ type: 'hello', name, parts });
    };
    const receive = (m: BattleProtocol) => {
      if (m.type === 'match') {
        me = m.you;
        const stage = STAGES.find((s) => s.id === m.stage) ?? STAGES[0]!;
        world = buildWorld(m.seed, stage);
        field = new Field(world, m.seed);
        const dead = new Set(m.dead);
        for (const p of field.props) if (dead.has(p.id)) p.alive = false;
        ground = makeGround(ctx, stage.id);
        seat(m.seats);
        timeLeft = m.left;
        setLeft(m.left);
        setStatus(m.phase === 'over' ? 'over' : m.phase);
      } else if (m.type === 'roster') seat(m.seats);
      else if (m.type === 'phase') {
        timeLeft = m.left;
        setStatus(m.phase === 'over' ? 'over' : m.phase);
        if (m.phase === 'battle') {
          roar(volume * 0.7);
          say('Battle!', 'Smash, devour, grow. Biggest wins.', 'red');
        }
      } else if (m.type === 'snap') {
        const t = performance.now();
        lastSnapAt = t;
        timeLeft = m.left;
        for (const f of unpackFighters(m.f)) {
          const b = byIndex.get(f.i);
          if (!b) continue;
          b.prev = b.next ?? f;
          b.prevAt = b.next ? b.nextAt : t;
          b.next = f;
          b.nextAt = t;
          if (b.seat.id === me) mine = f;
        }
        pickups = unpackPickups(m.pu);
        if (field)
          for (const id of m.back) {
            const p = field.props[id];
            if (!p) continue;
            if (p.mover) {
              const at = field.openSpot();
              p.x = at.x;
              p.y = at.y;
            }
            p.alive = true;
          }
        for (const raw of m.ev) {
          const e = unpackEvent(raw);
          if (e) happen(e, t / 1000);
        }
      } else if (m.type === 'over') {
        setStatus('over');
        setTable({ rows: m.table, me });
        const mineRow = m.table.find((r) => r.id === me);
        run.track('battle_over', { live: liveRoom, rank: mineRow?.rank ?? 0 });
        run.haptic('success');
      }
    };

    const seat = (seats: SeatInfo[]) => {
      seats.forEach((s, i) => {
        let b = byIndex.get(i);
        if (b && b.seat.id === s.id && JSON.stringify(b.seat.parts) === JSON.stringify(s.parts)) {
          b.seat = s;
          return;
        }
        const kind = s.parts.spark?.replace('spark_', '') ?? 'lightning';
        const aura = AURA[kind] ?? AURA['lightning']!;
        b = {
          seat: s,
          rig: null,
          aura,
          prev: b?.prev ?? null,
          next: b?.next ?? null,
          prevAt: 0,
          nextAt: 0,
          walk: Math.random() * 6,
          attack: 0,
          side: 1,
          roarUntil: 0,
          rear: 0,
          glow: 0,
          shown: { x: 0, y: 0, size: BASE_SIZE },
        };
        const body = b;
        byIndex.set(i, body);
        bodies[i] = body;
        void buildCreatureSprite(s.parts, aura)
          .then((sprite) => {
            if (alive && byIndex.get(i) === body) body.rig = new RigCanvas(sprite, aura);
          })
          .catch(() => undefined);
      });
    };

    const nameOf = (i: number) => {
      const b = byIndex.get(i);
      if (!b) return 'A creature';
      return b.seat.id === me ? 'You' : b.seat.name;
    };

    const happen = (e: BattleEvent, now: number) => {
      const b = byIndex.get(e.who);
      const isMe = b?.seat.id === me;
      if (e.kind === 'smash') {
        const p = field?.props[e.prop];
        if (!p || !p.alive) return;
        p.alive = false;
        const near = mine ? Math.hypot(p.x - mine.x, p.y - mine.y) < 1500 : true;
        if (p.mover) fling(p, b);
        else if (near) debris(p.x, p.y, p.h, p.kind, Math.round(4 + Math.min(1, p.h / 200) * 14));
        if (isMe) {
          if (e.points >= 20)
            pops.push({ text: `+${big(e.points)}`, x: p.x, y: p.y - p.h * 0.6, born: now });
          if (pops.length > 20) pops.shift();
          if (now - lastThud > 0.08) {
            lastThud = now;
            thud(volume * 0.7, Math.min(1, p.h / (mine?.size ?? 100)));
          }
          if (!calm) shake = Math.max(shake, Math.min(8, p.h / 30));
        }
      } else if (e.kind === 'attack' && b) {
        b.attack = 0.3;
        b.side = e.side;
        const p = field?.props[e.prop];
        if (p)
          effects.push({
            kind: 'slash',
            x: p.x,
            y: p.y - p.h * 0.5,
            radius: Math.max(p.h * 0.9, (b.next?.size ?? 100) * 0.3),
            life: 0.3,
            max: 0.3,
            color: b.aura,
          });
        if (isMe && now - lastSwipe > 0.12) {
          lastSwipe = now;
          swipe(volume * 0.6);
        }
      } else if (e.kind === 'woke' && b) {
        b.roarUntil = performance.now() / 1000 + 1;
        b.glow = 1.4;
        if (isMe) {
          const power = POWERS.find((p) => p.id === e.power);
          say(WAKES[e.power] ?? 'It wakes', power?.effect, 'power');
          chime(volume);
          run.haptic('success');
        }
      } else if (e.kind === 'devour') {
        const v = byIndex.get(e.victim);
        if (b) {
          b.roarUntil = performance.now() / 1000 + 1.1;
          const at = b.next;
          if (at)
            effects.push({
              kind: 'ring',
              x: at.x,
              y: at.y,
              radius: at.size * 1.4,
              life: 0.6,
              max: 0.6,
              color: b.aura,
            });
        }
        if (isMe) {
          say(`You devoured ${nameOf(e.victim)}!`, undefined, 'gold');
          roar(volume * 0.8);
          run.haptic('heavy');
          if (!calm) shake = Math.max(shake, 14);
        } else if (v?.seat.id === me) {
          setDevoured({ by: nameOf(e.who), until: Date.now() + 3000 });
          thud(volume, 1);
          run.haptic('heavy');
          if (!calm) flash = Math.max(flash, 0.5);
        } else tell(`${nameOf(e.who)} devoured ${nameOf(e.victim)}`);
      } else if (e.kind === 'respawn') {
        if (isMe) setDevoured(null);
      } else if (e.kind === 'pickup') {
        if (isMe) {
          const spec = POWERUPS[e.power];
          say(spec.name, spec.text, 'gold');
          chime(volume * 0.8);
          run.haptic('medium');
        }
      } else if ((e.kind === 'land' || e.kind === 'sweep') && b?.next) {
        effects.push({
          kind: 'ring',
          x: b.next.x,
          y: b.next.y,
          radius: e.radius,
          life: 0.4,
          max: 0.4,
          color: b.aura,
        });
        if (isMe && e.kind === 'land') {
          thud(volume, 0.9);
          if (!calm) shake = Math.max(shake, 12);
        }
      } else if (e.kind === 'bolt') {
        const p = field?.props[e.prop];
        if (p && b)
          effects.push({
            kind: 'bolt',
            x: p.x,
            y: p.y,
            radius: p.h,
            life: 0.35,
            max: 0.35,
            color: b.aura,
          });
        if (isMe && !calm) flash = Math.max(flash, 0.3);
      }
    };

    // ------------------------------------------------------------- input
    const keys = new Set<string>();
    let anchor: { x: number; y: number } | null = null;
    let finger: { x: number; y: number } | null = null;
    let sent = { x: 0, y: 0 };
    let sentAt = 0;
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
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      anchor = { x: e.clientX, y: e.clientY };
      finger = { ...anchor };
      box.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!anchor) return;
      finger = { x: e.clientX, y: e.clientY };
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
    if (mock)
      (window as unknown as { __battle?: unknown }).__battle = {
        get me() {
          return mine;
        },
        get pickups() {
          return pickups;
        },
        get props() {
          return field?.props ?? [];
        },
      };

    // ------------------------------------------------------------- setup
    const night = document.createElement('canvas');
    const nctx = night.getContext('2d')!;
    let shade: CanvasGradient | null = null;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(box.clientWidth * dpr);
      cv.height = Math.round(box.clientHeight * dpr);
      night.width = Math.max(1, Math.ceil(cv.width / DARK_SCALE));
      night.height = Math.max(1, Math.ceil(cv.height / DARK_SCALE));
      const nw = night.width;
      const nh = night.height;
      shade = nctx.createRadialGradient(nw / 2, nh * 0.5, nh * 0.25, nw / 2, nh * 0.5, nh * 0.8);
      shade.addColorStop(0, 'rgba(4, 6, 16, 0)');
      shade.addColorStop(1, 'rgba(2, 3, 10, 0.7)');
    };
    resize();
    window.addEventListener('resize', resize);
    const hole = lightSprite('rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0.75)');
    const warm = lightSprite('rgba(255, 186, 96, 0.95)', 'rgba(255, 120, 40, 0.3)');
    const glows = new Map<string, HTMLCanvasElement>();
    const glowOf = (aura: string) => {
      let g = glows.get(aura);
      if (!g) {
        g = lightSprite(aura, withAlpha(aura, 0.22));
        glows.set(aura, g);
      }
      return g;
    };
    void Promise.all(
      KINDS.map(async (k) => {
        try {
          const img = await loadImage(`art/props/${k}.png`);
          imgs.set(k, img);
          colors.set(k, palette(img));
        } catch {
          // drawn as a block if its art is missing
        }
      }),
    );

    let last = performance.now();
    let lastHud = 0;
    const frame = (ms: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (ms - last) / 1000);
      last = ms;
      update(dt, ms);
      draw(ms);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ------------------------------------------------------------- update
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const update = (dt: number, ms: number) => {
      const now = ms / 1000;
      shake = Math.max(0, shake - dt * 30);
      flash = Math.max(0, flash - dt * 3);
      const s = steer();
      // Tell the room where we steer: on a change, and now and then anyway.
      if (
        link &&
        (Math.hypot(s.x - sent.x, s.y - sent.y) > 0.08 || ms - sentAt > 400) &&
        ms - sentAt > 60
      ) {
        sent = { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 };
        sentAt = ms;
        link.send({ type: 'steer', x: sent.x, y: sent.y });
      }
      const delay = liveRoom ? DELAY_LIVE : DELAY_LOCAL;
      const at = ms - delay;
      for (const b of bodies) {
        if (!b?.next) continue;
        const p = b.prev ?? b.next;
        const n = b.next;
        let k = b.nextAt > b.prevAt ? (at - b.prevAt) / (b.nextAt - b.prevAt) : 1;
        k = Math.max(0, Math.min(1.2, k));
        let x = lerp(p.x, n.x, k);
        let y = lerp(p.y, n.y, k);
        if (b.seat.id === me && n.alive) {
          // Your own creature runs ahead with your steering, so it answers at once.
          const ahead = Math.min(0.3, (ms - b.nextAt) / 1000 + (liveRoom ? 0.08 : 0.03));
          const speed =
            BASE_SIZE *
            Math.pow(n.size / BASE_SIZE, BATTLE_TUNE.speedExp) *
            1.25 *
            (n.woke >= 1 ? 1.3 : 1) *
            (n.buffs.includes('surge') ? 1.6 : 1);
          x = n.x + s.x * speed * ahead;
          y = n.y + s.y * speed * ahead;
          b.shown.x = b.shown.x ? lerp(b.shown.x, x, Math.min(1, dt * 14)) : x;
          b.shown.y = b.shown.y ? lerp(b.shown.y, y, Math.min(1, dt * 14)) : y;
        } else {
          b.shown.x = x;
          b.shown.y = y;
        }
        b.shown.size = lerp(b.shown.size, n.size, Math.min(1, dt * 6));
        if (n.moving) b.walk += dt * (8 / Math.pow(n.size / BASE_SIZE, 0.35));
        b.attack = Math.max(0, b.attack - dt);
        b.rear += ((now < b.roarUntil ? 1 : 0) - b.rear) * Math.min(1, dt * 7);
        b.glow = Math.max(n.buffs.length ? 0.6 : 0, b.glow - dt * 0.9);
      }
      // The crowd runs from the creatures (drawn here; the room decides who gets smashed).
      if (field)
        field.step(
          dt,
          bodies
            .filter((b) => b?.next?.alive)
            .map((b) => ({ x: b.shown.x, y: b.shown.y, alive: true, reach: b.shown.size * 0.3 })),
        );
      // Camera: on you, zoomed to your size.
      const meBody = bodies.find((b) => b?.seat.id === me);
      if (meBody?.next) {
        const fill = FILL + FILL_PER_PART * meBody.next.woke;
        const target = (cv.height * fill) / Math.max(BASE_SIZE, meBody.shown.size);
        cam.z += (target - cam.z) * Math.min(1, dt * 2.5);
        cam.x += (meBody.shown.x - cam.x) * Math.min(1, dt * 8);
        cam.y += (meBody.shown.y - meBody.shown.size * 0.45 - cam.y) * Math.min(1, dt * 8);
      }
      const halfW = cv.width / cam.z / 2;
      const halfH = cv.height / cam.z / 2;
      cam.x = halfW * 2 < WORLD_W ? Math.max(halfW, Math.min(WORLD_W - halfW, cam.x)) : WORLD_W / 2;
      cam.y = halfH * 2 < WORLD_H ? Math.max(halfH, Math.min(WORLD_H - halfH, cam.y)) : WORLD_H / 2;
      tick(dt, now);
      // The clock counts down between snapshots too.
      const shownLeft = Math.max(0, timeLeft - (lastSnapAt ? (ms - lastSnapAt) / 1000 : 0));
      if (shownLeft < 10 && shownLeft > 0 && now >= nextBeat) {
        nextBeat = now + 0.7;
        heartbeat(volume * 0.5);
      }
      if (ms - lastHud > 150) {
        lastHud = ms;
        setLeft(shownLeft);
        const rows = bodies
          .filter(Boolean)
          .map((b, i) => ({
            i,
            name: b.seat.id === me ? 'You' : b.seat.name,
            mass: b.next?.alive ? b.next.mass : 0,
            me: b.seat.id === me,
          }))
          .sort((a, b) => b.mass - a.mass)
          .map((r, k) => ({ ...r, rank: k + 1 }));
        const mineRow = rows.find((r) => r.me);
        if (mineRow)
          setHud({
            left: shownLeft,
            mass: mineRow.mass,
            rank: mineRow.rank,
            of: rows.length,
            top: rows.slice(0, 5).concat(mineRow.rank > 5 ? [mineRow] : []),
            buffs: mine?.buffs ?? [],
            players: bodies.filter((b) => b && !b.seat.bot).length,
          });
      }
    };

    const tick = (dt: number, now: number) => {
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
      if (particles.length > 500) particles.splice(0, particles.length - 500);
      for (let i = flung.length - 1; i >= 0; i--) {
        const f = flung[i]!;
        f.life -= dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.z += f.vz * dt;
        f.vz -= f.h * 30 * dt;
        f.rot += f.spin * dt;
        if (f.life <= 0) flung.splice(i, 1);
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        effects[i]!.life -= dt;
        if (effects[i]!.life <= 0) effects.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) if (now - pops[i]!.born > 1) pops.splice(i, 1);
    };

    const debris = (x: number, y: number, h: number, kind: PropKind, n: number) => {
      const pal = colors.get(kind) ?? ['#6b5a48', '#8a7a62', '#3c332b'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.4 + Math.random()) * h * 1.6;
        particles.push({
          x: x + (Math.random() - 0.5) * h * 0.4,
          y,
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
    };
    const fling = (p: LiveProp, by: Body | undefined) => {
      const from = by?.shown ?? { x: p.x, y: p.y + 1 };
      const a = Math.atan2(p.y - from.y, p.x - from.x);
      const sp = (by?.shown.size ?? 100) * (2 + Math.random() * 1.5);
      flung.push({
        img: imgs.get(p.kind) ?? null,
        h: p.h,
        x: p.x,
        y: p.y,
        z: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6,
        vz: p.h * 12,
        rot: 0,
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8),
        life: 1.3,
      });
    };

    // ------------------------------------------------------------- draw
    const draw = (ms: number) => {
      const now = ms / 1000;
      const W = cv.width;
      const H = cv.height;
      const dpr = W / Math.max(1, box.clientWidth);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, W, H);
      if (!world || !field) return;
      const z = cam.z;
      const ox = W / 2 - cam.x * z + (Math.random() - 0.5) * shake * 2;
      const oy = H / 2 - cam.y * z + (Math.random() - 0.5) * shake * 2;
      ctx.setTransform(z, 0, 0, z, ox, oy);
      const vx0 = -ox / z;
      const vy0 = -oy / z;
      const vx1 = (W - ox) / z;
      const vy1 = (H - oy) / z;

      ctx.fillStyle = ground ?? '#1d2a1c';
      ctx.fillRect(
        Math.max(0, vx0),
        Math.max(0, vy0),
        Math.min(WORLD_W, vx1) - Math.max(0, vx0),
        Math.min(WORLD_H, vy1) - Math.max(0, vy0),
      );
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const road of world.roads)
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

      // Power-ups: glowing, bobbing, each with its mark.
      const unit = Math.max(26, 18 / z);
      for (const pu of pickups) {
        if (
          !pu.alive ||
          pu.x < vx0 - 100 ||
          pu.x > vx1 + 100 ||
          pu.y < vy0 - 100 ||
          pu.y > vy1 + 100
        )
          continue;
        const spec = POWERUPS[pu.kind];
        const bob = Math.sin(now * 3 + pu.id) * unit * 0.2;
        const r = unit * (1 + 0.08 * Math.sin(now * 6 + pu.id));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        const g = glowOf(withAlpha(hexToRgba(spec.color), 0.9));
        ctx.drawImage(g, pu.x - r * 2.2, pu.y - r * 2.2 - unit + bob, r * 4.4, r * 4.4);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#120b16';
        ctx.strokeStyle = spec.color;
        ctx.lineWidth = r * 0.18;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y - unit + bob, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = spec.color;
        ctx.font = `900 ${r * 1.2}px Rubik, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(spec.mark, pu.x, pu.y - unit + bob + r * 0.05);
      }

      // what is in view, back to front
      const margin = 500;
      const items: Array<{ y: number; draw: () => void }> = [];
      const holes: Array<[number, number, number, number]> = [];
      const lamps: Array<[number, number, number, number]> = [];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      for (const p of field.props) {
        if (
          !p.alive ||
          p.x < vx0 - margin ||
          p.x > vx1 + margin ||
          p.y < vy0 - 40 ||
          p.y > vy1 + margin
        )
          continue;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * 1.1, p.r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        items.push({ y: p.y, draw: () => drawProp(p, now) });
        if (p.kind === 'lamp') {
          holes.push([p.x, p.y - p.h * 0.5, p.h * 1.9, 0.9]);
          lamps.push([p.x, p.y - p.h * 0.9, p.h * 0.55, 0.7]);
        } else if (p.kind === 'pumpkin') {
          holes.push([p.x, p.y - p.h * 0.3, p.h * 2.2, 0.55]);
          lamps.push([p.x, p.y - p.h * 0.35, p.h * 1.1, 0.4]);
        }
      }
      for (const b of bodies) {
        if (!b?.next?.alive || !b.rig) continue;
        const sz = b.shown.size;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.beginPath();
        ctx.ellipse(b.shown.x, b.shown.y, sz * 0.28, sz * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        items.push({ y: b.shown.y, draw: () => drawBody(b, now) });
        holes.push([b.shown.x, b.shown.y - sz * 0.5, sz * 1.3, b.seat.id === me ? 1 : 0.7]);
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

      // The night, lifted by every creature's glow and the village's lamps.
      const nw = night.width;
      const nh = night.height;
      nctx.globalCompositeOperation = 'source-over';
      nctx.globalAlpha = 1;
      nctx.clearRect(0, 0, nw, nh);
      nctx.fillStyle = `rgba(3, 4, 12, ${NIGHT})`;
      nctx.fillRect(0, 0, nw, nh);
      nctx.globalCompositeOperation = 'destination-out';
      const meB = bodies.find((b) => b?.seat.id === me);
      if (meB) {
        const r = Math.max(H * 0.38, meB.shown.size * z * 1.6);
        nctx.drawImage(
          hole,
          (meB.shown.x * z + ox - r) / DARK_SCALE,
          ((meB.shown.y - meB.shown.size * 0.5) * z + oy - r) / DARK_SCALE,
          (r * 2) / DARK_SCALE,
          (r * 2) / DARK_SCALE,
        );
      }
      for (const [x, y, r, a] of holes) {
        nctx.globalAlpha = a;
        nctx.drawImage(
          hole,
          (x * z + ox - r * z) / DARK_SCALE,
          (y * z + oy - r * z) / DARK_SCALE,
          (r * 2 * z) / DARK_SCALE,
          (r * 2 * z) / DARK_SCALE,
        );
      }
      nctx.globalAlpha = 1;
      nctx.globalCompositeOperation = 'source-over';
      if (shade) {
        nctx.fillStyle = shade;
        nctx.fillRect(0, 0, nw, nh);
      }
      if (flash > 0) {
        nctx.fillStyle = `rgba(230, 240, 255, ${flash * 0.6})`;
        nctx.fillRect(0, 0, nw, nh);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(night, 0, 0, W, H);
      ctx.imageSmoothingEnabled = false;

      // Over the dark: effects, halos, name tags, rubble earned, and the steering stick.
      ctx.setTransform(z, 0, 0, z, ox, oy);
      for (const e of effects) drawEffect(e, vy0);
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, r, a] of lamps) {
        ctx.globalAlpha = a;
        ctx.drawImage(warm, x - r, y - r, r * 2, r * 2);
      }
      for (const b of bodies) {
        if (!b?.next?.alive) continue;
        const halo = b.shown.size * (0.7 + b.glow * 0.4);
        ctx.globalAlpha = Math.min(1, 0.2 + b.glow * 0.3);
        ctx.drawImage(
          glowOf(b.aura),
          b.shown.x - halo,
          b.shown.y - b.shown.size * 0.5 - halo,
          halo * 2,
          halo * 2,
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      for (const b of bodies) {
        if (!b?.next?.alive) continue;
        const px = b.shown.x * z + ox;
        const py = (b.shown.y - b.shown.size * 1.02) * z + oy;
        if (px < -80 || px > W + 80 || py < -40 || py > H + 80) continue;
        const isMe = b.seat.id === me;
        ctx.font = `800 ${Math.round(14 * dpr)}px Rubik, sans-serif`;
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = '#0a0608';
        const label = isMe ? 'YOU' : b.seat.name;
        ctx.strokeText(label, px, py);
        ctx.fillStyle = isMe ? '#ffe08a' : b.seat.bot ? '#d8cfc0' : '#9be8ff';
        ctx.fillText(label, px, py);
        ctx.font = `700 ${Math.round(12 * dpr)}px Rubik, sans-serif`;
        const m = big(b.next.mass);
        ctx.strokeText(m, px, py + 14 * dpr);
        ctx.fillStyle = '#efe3c6';
        ctx.fillText(m, px, py + 14 * dpr);
      }
      for (const q of pops) {
        const age = now - q.born;
        const px = q.x * z + ox;
        const py = q.y * z + oy - age * 46 * dpr;
        ctx.globalAlpha = Math.max(0, Math.min(1, (1 - age) / 0.3));
        ctx.font = `800 ${Math.round(15 * dpr)}px Rubik, sans-serif`;
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = '#1a0d04';
        ctx.strokeText(q.text, px, py);
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(q.text, px, py);
      }
      ctx.globalAlpha = 1;
      if (anchor && finger) {
        const rect = box.getBoundingClientRect();
        ctx.strokeStyle = 'rgba(239, 227, 198, 0.35)';
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(
          (anchor.x - rect.left) * dpr,
          (anchor.y - rect.top) * dpr,
          STICK * dpr,
          0,
          Math.PI * 2,
        );
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
      const fleeing = Math.hypot(p.vx, p.vy) > 40;
      const ph = now * (fleeing ? 18 : 8) + p.id;
      const hop = Math.abs(Math.sin(ph)) * h * (fleeing ? 0.16 : 0.04);
      const dir = p.vx < 0 ? -1 : 1;
      ctx.save();
      ctx.translate(p.x, p.y + p.r * 0.3 - hop);
      ctx.rotate(fleeing ? 0.2 * dir + Math.sin(ph * 2) * 0.08 : 0);
      ctx.scale(dir, 1);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
    };

    const drawBody = (b: Body, now: number) => {
      const n = b.next!;
      const rig = b.rig!;
      const pose: Pose = {
        t: now,
        walk: b.walk,
        stride: n.moving ? 1 : 0,
        attack: b.attack > 0 ? 1 - b.attack / 0.3 : 0,
        side: b.side,
        roar: b.rear,
        swell: 0,
        beat: n.air ? 1 : 0,
        glowSlots: rig.sprite.order,
        glow: Math.min(1, b.glow * 0.5),
      };
      const lit = rig.draw(pose, 3 + b.glow * 3);
      const giant = n.buffs.includes('serum') ? 1.35 : 1;
      const k = (b.shown.size * giant) / rig.sprite.height;
      const air = n.air ? b.shown.size * 0.3 : 0;
      ctx.save();
      ctx.translate(b.shown.x, b.shown.y - air);
      ctx.scale(n.facing * k, k);
      // Iron Hide: a pale, flickering shell (also just after coming back).
      if (n.buffs.includes('ironhide')) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now * 14);
      ctx.drawImage(lit, -rig.footX, -rig.footY);
      ctx.restore();
    };

    const drawFlung = (f: (typeof flung)[number]) => {
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
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = Math.max(4, e.radius * 0.04);
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
        const R = e.radius;
        const grow = Math.min(1, t / 0.25);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = 1 - Math.max(0, (t - 0.25) / 0.75);
        ctx.strokeStyle = '#fff6ea';
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          const off = i * R * 0.22;
          ctx.lineWidth = R * 0.07 * (1 - t * 0.6);
          ctx.beginPath();
          ctx.moveTo(-R * 0.55 + off, -R * 0.5 - off * 0.4);
          ctx.lineTo(-R * 0.55 + off + R * 1.05 * grow, -R * 0.5 - off * 0.4 + R * 0.95 * grow);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.strokeStyle = '#fff';
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = Math.max(6, e.radius * 0.06);
        ctx.beginPath();
        let x = e.x;
        ctx.moveTo(x, top);
        for (let i = 1; i <= 7; i++) {
          const y = top + ((e.y - e.radius * 0.5 - top) * i) / 7;
          x = e.x + (i === 7 ? 0 : (Math.random() - 0.5) * e.radius * 0.6);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };

    if (!calm) distantThunder(volume * 0.6);
    // Join on the next tick: a screen unmounted at once (React's dev double mount) never joins,
    // so it never leaves a room another mount of it is using.
    const joining = setTimeout(() => void join(), 0);

    return () => {
      alive = false;
      clearTimeout(joining);
      cancelAnimationFrame(raf);
      link?.leave();
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('resize', resize);
    };
    // One battle per mount: the parent remounts this (new key) for "Battle again".
  }, []);

  useEffect(() => {
    if (!devoured) return;
    const t = setInterval(
      () => setDevoured((d) => (d && Date.now() > d.until + 500 ? null : d)),
      500,
    );
    return () => clearInterval(t);
  }, [devoured]);

  const mm = Math.floor(left / 60);
  const ss = Math.floor(left % 60);
  const mineRow = table?.rows.find((r) => r.id === table.me);

  return (
    <div className="rampage battle" ref={host} data-testid="battle" data-status={status}>
      <canvas ref={canvasRef} className="rampage-canvas" />
      {status === 'joining' && <p className="rampage-loading">Finding a battle…</p>}
      {status === 'lobby' && (
        <div className="battle-lobby" data-testid="battle-lobby">
          <p className="battle-mode">{live ? 'Live battle' : 'Offline battle · vs bots'}</p>
          <b>{Math.ceil(left)}</b>
          <span>Creatures are gathering…</span>
        </div>
      )}
      {status === 'battle' && hud && (
        <>
          <div className="battle-hud">
            <div className="battle-mass">
              <span>Mass</span>
              <b data-testid="battle-mass">{big(hud.mass)}</b>
              <em>
                #{hud.rank} of {hud.of}
              </em>
            </div>
            <div className={`rampage-clock ${left < 10 ? 'hurry' : ''}`} data-testid="battle-clock">
              {mm}:{String(ss).padStart(2, '0')}
            </div>
            <ol className="battle-board" data-testid="battle-board">
              {hud.top.map((r) => (
                <li key={`${r.rank}-${r.name}`} className={r.me ? 'me' : ''}>
                  <i>{r.rank}</i>
                  <span>{r.name}</span>
                  <b>{big(r.mass)}</b>
                </li>
              ))}
            </ol>
          </div>
          {live !== null && (
            <p className="battle-tag">
              {live
                ? `Live · ${hud.players} ${hud.players === 1 ? 'player' : 'players'}`
                : 'Offline · vs bots'}
            </p>
          )}
          {hud.buffs.length > 0 && (
            <ul className="battle-buffs" data-testid="battle-buffs">
              {hud.buffs.map((k) => (
                <li key={k} style={{ borderColor: POWERUPS[k].color, color: POWERUPS[k].color }}>
                  {POWERUPS[k].mark} {POWERUPS[k].name}
                </li>
              ))}
            </ul>
          )}
          <ul className="battle-feed">
            {feed.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </>
      )}
      {banner && status === 'battle' && (
        <div
          key={banner.id}
          className={`battle-banner ${banner.tone}`}
          data-testid="battle-banner"
          onAnimationEnd={() => setBanner((b) => (b?.id === banner.id ? null : b))}
        >
          <b>{banner.text}</b>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}
      {devoured && status === 'battle' && (
        <div className="battle-dead" data-testid="battle-dead">
          <b>Devoured!</b>
          <span>by {devoured.by} · back in a moment, small again</span>
        </div>
      )}
      {status === 'over' && table && (
        <div className="rampage-over battle-over" data-testid="battle-over">
          <p className="eyebrow">{live ? 'Live battle' : 'Offline battle'}</p>
          <h2 className="rampage-over-title">
            {mineRow?.rank === 1 ? 'You win!' : `You came #${mineRow?.rank ?? '?'}`}
          </h2>
          <p className="rampage-rank">
            {mineRow?.rank === 1 ? 'The biggest thing alive' : 'Biggest at the bell wins'}
          </p>
          <ol className="battle-table" data-testid="battle-table">
            {table.rows.map((r) => (
              <li key={r.id} className={r.id === table.me ? 'me' : ''}>
                <i>{r.rank}</i>
                <span>{r.id === table.me ? 'You' : r.name}</span>
                <em>{r.devoured ? `ate ${r.devoured}` : ''}</em>
                <b>{big(r.mass)}</b>
              </li>
            ))}
          </ol>
          <button className="btn btn-primary btn-wide" onClick={onAgain} data-testid="battle-again">
            Battle again
          </button>
          <button className="btn btn-secondary btn-wide" onClick={onQuit} data-testid="battle-quit">
            Home
          </button>
        </div>
      )}
      {status !== 'over' && (
        <button
          className="btn btn-secondary btn-small battle-leave"
          onClick={onQuit}
          data-testid="battle-leave"
        >
          Leave
        </button>
      )}
    </div>
  );
}

/** '#rrggbb' as 'rgba(r, g, b, 1)' (for the glow sprites). */
function hexToRgba(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1)`;
}
