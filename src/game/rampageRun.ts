/**
 * The rampage, simulated. A `Field` is the place (its props, its fleeing crowd and the power-ups
 * lying about); a `Beast` is one creature on it: it moves where it is steered, claws and smashes
 * what is small enough, is stopped by what is not, grows by what it smashes, and wakes its parts'
 * powers as it grows. A story run (`RampageRun`) is one beast on its own field; a battle (arena.ts)
 * is many. Pure and frame-rate independent (step(dt)); the components draw whatever this says.
 */
import {
  POWERS,
  PROPS,
  RUN_SECONDS,
  SMASH_RATIO,
  WORLD_H,
  WORLD_W,
  canSmash,
  massOf,
  rubbleOf,
  sizeAfter,
  type Power,
  type PowerId,
  type Prop,
  type PropKind,
  type World,
} from './rampage';
import { bountyProgress, type Bounty } from './bounty';
import {
  BLOODMOON_GROWTH,
  HUNGER_RANGE,
  HUNGER_SMALL,
  POWERUPS,
  SERUM_SIZE,
  STOMP_RANGE,
  STORY_POWERUPS,
  SURGE_SPEED,
  type Pickup,
  type PowerupKind,
} from './powerup';
import { rngFor } from './rng';

export interface LiveProp extends Prop {
  alive: boolean;
  mover: boolean;
  vx: number;
  vy: number;
}

export type SmashBy = 'claw' | 'stomp' | 'maw' | 'tail' | 'leap' | 'bolt';

export type RunEvent =
  /** `points`: the rubble it earned, times the chain's multiplier. */
  | { type: 'smash'; prop: LiveProp; by: SmashBy; points: number }
  | { type: 'power'; power: Power }
  | { type: 'blocked'; prop: LiveProp }
  | { type: 'leap' }
  | { type: 'land'; radius: number }
  | { type: 'sweep'; radius: number }
  | { type: 'bolt'; prop: LiveProp }
  /** It clawed something within reach (1 its right arm, -1 its left). */
  | { type: 'attack'; prop: LiveProp; side: 1 | -1 }
  /** It took a power-up. */
  | { type: 'pickup'; pickup: Pickup }
  /** A brave villager threw something at it (it lands where the creature was), and a hit. */
  | { type: 'throw'; missile: Missile }
  | { type: 'hit'; missile: Missile; lost: number }
  /** One of the day's bounties is done: its bonus is added to the rubble. */
  | { type: 'bounty'; bounty: Bounty }
  | { type: 'end' };

export interface RunResult {
  rubble: number;
  /** The rubble before the player's upgrades multiplied it (what the village's tally counts). */
  baseRubble: number;
  smashed: number;
  frights: number;
  start: number;
  peak: number;
  powers: PowerId[];
  /** The longest chain of smashes, and the day's bounties this run completed (ids). */
  bestChain: number;
  bounties: string[];
}

/** Steering: a direction with a length of 0 (stand still) to 1 (full speed). */
export interface Steer {
  x: number;
  y: number;
}

/** A story run's upgrades (battles have none: only power-ups). Each is a multiplier, 1 = none. */
export interface Boost {
  speed: number;
  claw: number;
  value: number;
}

export const NO_BOOST: Boost = { speed: 1, claw: 1, value: 1 };

/**
 * How a creature carries its size. In a story run it gets faster as it grows (√size) and grows by
 * all it smashes; in a battle a giant is barely faster than a newborn and grows more slowly, so the
 * small can run and the place lasts the minute.
 */
export interface Tune {
  /** Speed grows with size to this power (times the start size to the rest). */
  speedExp: number;
  /** Share of a smash's mass it grows by. */
  growth: number;
}

export const STORY_TUNE: Tune = { speedExp: 0.5, growth: 1 };

// Tuning, in multiples of the creature's current size.
const SPEED = 1.25;
const STRIDE_BOOST = 1.3;
const FOOT = 0.3;
const REACH_BOOST = 1.35;
const MAW_RANGE = 1.8;
const MAW_SMALL = 0.3;
const SWEEP_EVERY = 2.2;
const SWEEP_RANGE = 1.9;
const LEAP_EVERY = 4;
const LEAP_TIME = 0.55;
const LEAP_RANGE = 2.3;
const LEAP_RATIO = 1.15;
const BOLT_EVERY = 3;
const BOLT_RANGE = 4;
const BOLT_RATIO = 1.3;
/** It claws the nearest thing it can smash, this often (faster once its arms wake). */
const CLAW_EVERY = 0.9;
const CLAW_FAST = 0.6;
const CLAW_RANGE = 2;
const FRENZY = 1.3;
/** Smashes this close together (s) keep a chain going; every CHAIN_STEP of it adds to the rubble. */
export const CHAIN_GAP = 0.8;
export const CHAIN_STEP = 20;
const CHAIN_MAX = 2;
const FLEE_RANGE = 5;
/**
 * Villagers who fight back stand their ground against a creature up to BRAVE_RATIO times their
 * own height: they keep THROW_RANGE reaches away and throw every THROW_EVERY seconds. A missile
 * flies straight to where the creature was, so one that keeps moving can dodge. A hit knocks off
 * HIT_SHARE of its mass (at least HIT_MIN) and staggers it for STAGGER seconds.
 */
const BRAVE_RATIO = 4.5;
const THROW_RANGE = 3.8;
const THROW_EVERY = 1.8;
const THROW_SPEED = 340;
export const HIT_SHARE = 0.03;
const HIT_MIN = 300;
export const STAGGER = 0.35;
const FLEE_SPEED = 95;
const WANDER_SPEED = 22;
/** A power-up is taken within this much of the creature's reach, and comes back this much later. */
const PICKUP_REACH = 1.3;
const PICKUP_AGAIN = 6;

/** Something thrown at a creature by a brave villager. */
export interface Missile {
  id: number;
  kind: 'torch' | 'pitchfork';
  /** From, and where it lands (where the creature was when it was thrown). */
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Seconds in the air, and left. */
  flight: number;
  left: number;
  /** The creature it was meant for (its index among the field's creatures). */
  target: number;
}

/** What the crowd sees of a creature (and how a hit hurts it, where one can). */
export interface Target {
  x: number;
  y: number;
  reach: number;
  size: number;
  alive: boolean;
  hurt?: () => number;
}

/** How many fight back: one villager in `villager` (torches), one farmer in `farmer` (pitchforks); 0 = none. */
export interface Bravery {
  villager: number;
  farmer: number;
}

/** Every third villager and every other farmer (battles, and a story run unless its level says). */
export const BRAVERY: Bravery = { villager: 3, farmer: 2 };

/** What this one fights back with, if it does. */
export function braveWith(
  p: Pick<Prop, 'kind' | 'id'>,
  bravery: Bravery | null = BRAVERY,
): Missile['kind'] | null {
  if (!bravery) return null;
  if (p.kind === 'villager' && bravery.villager > 0 && p.id % bravery.villager === 0)
    return 'torch';
  if (p.kind === 'farmer' && bravery.farmer > 0 && p.id % bravery.farmer === 0) return 'pitchfork';
  return null;
}

const CELL = 200;
const cellKey = (gx: number, gy: number) => gx * 4096 + gy;

/** The place a rampage happens in: what stands in it, who runs about it, what lies around. */
export class Field {
  readonly props: LiveProp[];
  readonly pickups: Pickup[] = [];
  readonly start: { x: number; y: number };
  private readonly grid = new Map<number, LiveProp[]>();
  private readonly movers: LiveProp[] = [];
  private readonly rng: () => number;
  private readonly kinds: readonly PowerupKind[];
  private readonly respawns: Array<{ id: number; at: number }> = [];
  /** Smashed things come back after this long (0: never), and when they did (for the screen). */
  private readonly regrow: number;
  private readonly rubble: Array<{ prop: LiveProp; at: number }> = [];
  /** What the village has rebuilt since someone last looked (they empty it: `splice(0)`). */
  readonly rebuiltSince: LiveProp[] = [];
  /** Torches and pitchforks in the air. */
  readonly missiles: Missile[] = [];
  /** Who fights back (null: nobody). */
  readonly bravery: Bravery | null;
  private readonly throwIn = new Map<number, number>();
  private missileId = 0;
  private time = 0;

  constructor(
    world: World,
    seed: string,
    pickups = 0,
    kinds: readonly PowerupKind[] = STORY_POWERUPS,
    regrow = 0,
    bravery: Bravery | null = BRAVERY,
  ) {
    this.start = world.start;
    this.regrow = regrow;
    this.bravery = bravery;
    this.rng = rngFor('rampage-run', seed);
    this.kinds = kinds;
    this.props = world.props.map((p) => ({
      ...p,
      // The laboratory is already rubble: the creature has just broken out of it.
      alive: p.kind !== 'lab',
      mover: PROPS[p.kind].mover === true,
      vx: 0,
      vy: 0,
    }));
    for (const p of this.props) {
      if (p.mover) this.movers.push(p);
      else if (p.alive) {
        const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
        const list = this.grid.get(k);
        if (list) list.push(p);
        else this.grid.set(k, [p]);
      }
    }
    // Power-ups get their own dice, so adding them never changes how the crowd runs.
    const place = rngFor('pickups', seed);
    for (let i = 0; i < pickups; i++) {
      const at = this.openSpot(place);
      this.pickups.push({ id: i, kind: kinds[i % kinds.length]!, x: at.x, y: at.y, alive: true });
    }
  }

  /** Somewhere open (nothing big standing there) for a power-up or a creature. */
  openSpot(rng: () => number = this.rng): { x: number; y: number } {
    for (let tries = 0; ; tries++) {
      const x = 150 + rng() * (WORLD_W - 300);
      const y = 150 + rng() * (WORLD_H - 300);
      let clear = true;
      this.near(x, y, 60, (p) => {
        if (!p.mover && p.h > 60) clear = false;
      });
      if (clear || tries > 20) return { x, y };
    }
  }

  /** Visit every standing thing within `range` of (x, y) (plus its own footprint). */
  near(x: number, y: number, range: number, visit: (p: LiveProp, d: number) => void): void {
    const span = range + 200;
    const gx0 = Math.floor((x - span) / CELL);
    const gx1 = Math.floor((x + span) / CELL);
    const gy0 = Math.floor((y - span) / CELL);
    const gy1 = Math.floor((y + span) / CELL);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++)
        for (const p of this.grid.get(cellKey(gx, gy)) ?? []) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < range + p.r) visit(p, d);
        }
    for (const p of this.movers) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < range + p.r) visit(p, d);
    }
  }

  /**
   * Time passes: the crowd runs from the nearest creature (the brave stand and throw at one small
   * enough), missiles land, and taken power-ups come back. Returns what was thrown and what hit,
   * with the index of the creature it was meant for.
   */
  step(dt: number, beasts: readonly Target[]): Array<{ target: number; event: RunEvent }> {
    this.time += dt;
    const out: Array<{ target: number; event: RunEvent }> = [];
    for (const p of this.movers) {
      if (!p.alive) continue;
      let from: Target | null = null;
      let fromIndex = -1;
      let best = Infinity;
      const weapon = braveWith(p, this.bravery);
      beasts.forEach((b, i) => {
        if (!b.alive) return;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        const range = b.reach * FLEE_RANGE * (weapon ? 1.4 : 1);
        if (d < range && d < best) {
          best = d;
          from = b;
          fromIndex = i;
        }
      });
      const near = from as Target | null;
      if (near && weapon && near.size <= PROPS[p.kind].h * BRAVE_RATIO) {
        // Brave: close in to throwing range, keep a little back, and throw.
        const keep = near.reach * THROW_RANGE;
        const dx = near.x - p.x;
        const dy = near.y - p.y;
        const toward = best > keep ? 0.8 : best < keep * 0.7 ? -0.9 : 0;
        p.vx = (dx / (best || 1)) * FLEE_SPEED * toward;
        p.vy = (dy / (best || 1)) * FLEE_SPEED * toward;
        // (facing it even while standing still)
        if (toward === 0) p.vx = Math.sign(dx) * 0.01;
        const left = (this.throwIn.get(p.id) ?? THROW_EVERY * (0.4 + this.rng() * 0.6)) - dt;
        if (left <= 0 && best <= keep * 1.3) {
          const fy = p.y - PROPS[p.kind].h * 0.6;
          const ty = near.y - near.size * 0.4;
          const flight = Math.hypot(near.x - p.x, ty - fy) / THROW_SPEED;
          const missile: Missile = {
            id: this.missileId++,
            kind: weapon,
            x: p.x,
            y: fy,
            tx: near.x,
            ty,
            flight,
            left: flight,
            target: fromIndex,
          };
          this.missiles.push(missile);
          out.push({ target: fromIndex, event: { type: 'throw', missile } });
          this.throwIn.set(p.id, THROW_EVERY * (0.8 + this.rng() * 0.4));
        } else this.throwIn.set(p.id, left);
      } else if (near) {
        const dx = p.x - near.x;
        const dy = p.y - near.y;
        const s = (PROPS[p.kind].h < 30 ? 1.2 : 1) * FLEE_SPEED;
        p.vx = (dx / (best || 1)) * s;
        p.vy = (dy / (best || 1)) * s;
      } else if (this.rng() < dt * 0.6) {
        const a = this.rng() * Math.PI * 2;
        p.vx = Math.cos(a) * WANDER_SPEED;
        p.vy = Math.sin(a) * WANDER_SPEED;
      }
      p.x = Math.max(50, Math.min(WORLD_W - 50, p.x + p.vx * dt));
      p.y = Math.max(50, Math.min(WORLD_H - 50, p.y + p.vy * dt));
    }
    // Missiles land where the creature was: a hit if it is still there.
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      m.left -= dt;
      if (m.left > 0) continue;
      this.missiles.splice(i, 1);
      const b = beasts[m.target];
      if (!b?.alive || !b.hurt) continue;
      const footY = m.ty + b.size * 0.4;
      if (Math.hypot(b.x - m.tx, b.y - footY) > Math.max(b.reach, b.size * 0.35)) continue;
      const lost = b.hurt();
      if (lost > 0) out.push({ target: m.target, event: { type: 'hit', missile: m, lost } });
    }
    // The village rebuilds what was smashed (out of any creature's way); the frightened come back.
    while (this.rubble.length && this.rubble[0]!.at <= this.time) {
      const { prop: p } = this.rubble.shift()!;
      if (beasts.some((b) => b.alive && Math.hypot(p.x - b.x, p.y - b.y) < b.reach * 3 + p.r)) {
        this.rubble.push({ prop: p, at: this.time + 3 });
        continue;
      }
      if (p.mover) {
        const at = this.openSpot();
        p.x = at.x;
        p.y = at.y;
        p.vx = 0;
        p.vy = 0;
      }
      p.alive = true;
      this.rebuiltSince.push(p);
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i]!;
      if (this.time < r.at) continue;
      const p = this.pickups[r.id]!;
      const at = this.openSpot();
      p.x = at.x;
      p.y = at.y;
      p.kind = this.kinds[Math.floor(this.rng() * this.kinds.length)]!;
      p.alive = true;
      this.respawns.splice(i, 1);
    }
    return out;
  }

  /** Something was smashed (it comes back later, where the village rebuilds). */
  smashed(p: LiveProp): void {
    if (this.regrow > 0 && p.kind !== 'lab')
      this.rubble.push({ prop: p, at: this.time + this.regrow });
  }

  /** A power-up was taken: another turns up somewhere else a little later. */
  take(p: Pickup): void {
    p.alive = false;
    this.respawns.push({ id: p.id, at: this.time + PICKUP_AGAIN });
  }
}

/** One creature on a field. */
export class Beast {
  start: number;
  x: number;
  y: number;
  facing = 1;
  size: number;
  peak: number;
  mass = 0;
  rubble = 0;
  baseRubble = 0;
  smashed = 0;
  frights = 0;
  moving = false;
  alive = true;
  /** Seconds left in the air (wings). */
  air = 0;
  powers: PowerId[] = [];
  /** The chain of smashes going now, and the longest one. */
  chain = 0;
  bestChain = 0;
  /** Power-ups working now, and for how long yet (s). */
  readonly buffs: Partial<Record<PowerupKind, number>> = {};
  readonly kinds = new Map<PropKind, number>();
  boost: Boost;
  tune: Tune;
  /** Told of everything it smashes (the field rebuilds them in a battle). */
  onSmash: ((p: LiveProp) => void) | null = null;
  private time = 0;
  private lastSmash = -10;
  private leapIn = LEAP_EVERY;
  private sweepIn = SWEEP_EVERY;
  private clawIn = 0.5;
  private side: 1 | -1 = 1;
  private boltIn = BOLT_EVERY;
  private lastBlocked = -1;

  constructor(
    start: number,
    x: number,
    y: number,
    boost: Boost = NO_BOOST,
    tune: Tune = STORY_TUNE,
  ) {
    this.start = start;
    this.size = start;
    this.peak = start;
    this.x = x;
    this.y = y;
    this.boost = boost;
    this.tune = tune;
  }

  has(power: PowerId): boolean {
    return this.powers.includes(power);
  }

  buffed(kind: PowerupKind): boolean {
    return (this.buffs[kind] ?? 0) > 0;
  }

  /** How big it counts as for smashing and devouring (the serum makes it bigger for a while). */
  get might(): number {
    return this.size * (this.buffed('serum') ? SERUM_SIZE : 1);
  }

  /** How far it reaches around its feet right now. */
  get reach(): number {
    return this.might * FOOT * (this.has('reach') ? REACH_BOOST : 1);
  }

  /** The chain still going (0 once it has lapsed: nothing smashed for CHAIN_GAP seconds). */
  get liveChain(): number {
    return this.time - this.lastSmash <= CHAIN_GAP ? this.chain : 0;
  }

  /** The rubble multiplier the chain going now earns (×1, ×1.25, … up to ×2). */
  get multiplier(): number {
    return chainMultiplier(this.chain);
  }

  /** The power that wakes next, and how close it is (0..1). */
  nextPower(): { power: Power; progress: number } | null {
    const next = POWERS.find((p) => !this.has(p.id));
    if (!next) return null;
    const done = POWERS.filter((p) => this.has(p.id)).at(-1);
    const from = done ? done.at : 1;
    const ratio = this.size / this.start;
    return { power: next, progress: Math.max(0, Math.min(1, (ratio - from) / (next.at - from))) };
  }

  /** Back to the start, small, somewhere else (devoured in a battle). */
  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.size = this.start;
    this.mass = 0;
    this.powers = [];
    this.chain = 0;
    this.air = 0;
    this.alive = true;
    for (const k of Object.keys(this.buffs) as PowerupKind[]) delete this.buffs[k];
  }

  /** Seconds left reeling from a hit (it moves slowly). */
  stagger = 0;

  /** A torch or pitchfork hit it: it loses some mass and reels (not in Iron Hide). */
  hurt(): number {
    if (!this.alive || this.buffed('ironhide')) return 0;
    const lost = Math.min(this.mass, Math.max(HIT_MIN, this.mass * HIT_SHARE));
    this.mass -= lost;
    this.size = sizeAfter(this.start, this.mass);
    this.stagger = STAGGER;
    return lost;
  }

  /** Grow by this much mass (from smashing, or from devouring another creature). */
  feed(mass: number): void {
    this.mass += mass;
    this.size = sizeAfter(this.start, this.mass);
    this.peak = Math.max(this.peak, this.size);
  }

  step(dt: number, steer: Steer, field: Field, events: RunEvent[]): void {
    this.time += dt;
    for (const k of Object.keys(this.buffs) as PowerupKind[]) {
      const left = (this.buffs[k] ?? 0) - dt;
      if (left > 0) this.buffs[k] = left;
      else delete this.buffs[k];
    }
    if (!this.alive) return;

    // Move.
    let sx = steer.x;
    let sy = steer.y;
    const len = Math.hypot(sx, sy);
    if (len > 1) {
      sx /= len;
      sy /= len;
    }
    this.moving = len > 0.05;
    // Bigger strides, but not proportionally faster: a huge creature still has to cross the map.
    const speed =
      this.start *
      Math.pow(this.size / this.start, this.tune.speedExp) *
      SPEED *
      this.boost.speed *
      (this.has('stride') ? STRIDE_BOOST : 1) *
      (this.buffed('surge') ? SURGE_SPEED : 1) *
      (this.stagger > 0 ? 0.4 : 1);
    this.stagger = Math.max(0, this.stagger - dt);
    this.x = Math.max(60, Math.min(WORLD_W - 60, this.x + sx * speed * dt));
    this.y = Math.max(60, Math.min(WORLD_H - 60, this.y + sy * speed * dt));
    if (sx > 0.1) this.facing = 1;
    else if (sx < -0.1) this.facing = -1;

    // Wings: a leap every few seconds while it moves; it crushes a wide ring where it lands.
    if (this.air > 0) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        const radius = this.reach * LEAP_RANGE;
        events.push({ type: 'land', radius });
        field.near(this.x, this.y, radius, (p) => {
          if (canSmash(this.might, p.kind, SMASH_RATIO * LEAP_RATIO)) this.smash(p, 'leap', events);
        });
      }
    } else if (this.has('wings') && this.moving && (this.leapIn -= dt) <= 0) {
      this.leapIn = LEAP_EVERY;
      this.air = LEAP_TIME;
      events.push({ type: 'leap' });
    }

    // Stomp: smash what is small enough underfoot, bump into what is not.
    if (this.air <= 0) {
      const r = this.reach;
      let blocked: LiveProp | null = null;
      field.near(this.x, this.y, r, (p, d) => {
        if (canSmash(this.might, p.kind)) {
          this.smash(p, 'stomp', events);
          return;
        }
        if (p.mover) return;
        const overlap = r * 0.6 + p.r - d;
        if (overlap > 0) {
          const nx = d > 0.001 ? (this.x - p.x) / d : 0;
          const ny = d > 0.001 ? (this.y - p.y) / d : 1;
          this.x += nx * overlap;
          this.y += ny * overlap;
          blocked = p;
        }
      });
      const hit = blocked as LiveProp | null;
      if (hit && hit.id !== this.lastBlocked) events.push({ type: 'blocked', prop: hit });
      this.lastBlocked = hit ? hit.id : -1;

      // Maw: small things nearby are swallowed (and far more of them in a Hunger).
      if (this.has('maw') || this.buffed('hunger')) {
        const hunger = this.buffed('hunger');
        const range = r * (hunger ? HUNGER_RANGE : MAW_RANGE);
        const small = this.might * (hunger ? HUNGER_SMALL : MAW_SMALL);
        field.near(this.x, this.y, range, (p) => {
          if (p.h <= small) this.smash(p, 'maw', events);
        });
      }

      // Power-ups underfoot.
      for (const pu of field.pickups) {
        if (!pu.alive || Math.hypot(pu.x - this.x, pu.y - this.y) > r * PICKUP_REACH + 30) continue;
        field.take(pu);
        events.push({ type: 'pickup', pickup: pu });
        const spec = POWERUPS[pu.kind];
        if (spec.seconds > 0) this.buffs[pu.kind] = spec.seconds;
        else {
          // The Thunder Stomp: everything it could smash, all around, at once.
          const radius = r * STOMP_RANGE;
          events.push({ type: 'land', radius });
          field.near(this.x, this.y, radius, (p) => {
            if (canSmash(this.might, p.kind)) this.smash(p, 'leap', events);
          });
        }
      }
    }

    // Tail: a sweep all around every so often.
    if (this.has('tail') && (this.sweepIn -= dt) <= 0) {
      this.sweepIn = SWEEP_EVERY;
      const radius = this.reach * SWEEP_RANGE;
      events.push({ type: 'sweep', radius });
      field.near(this.x, this.y, radius, (p) => {
        if (canSmash(this.might, p.kind)) this.smash(p, 'tail', events);
      });
    }

    // Spark: lightning strikes the biggest thing nearby that it could almost topple.
    if (this.has('spark') && (this.boltIn -= dt) <= 0) {
      this.boltIn = BOLT_EVERY;
      let target: LiveProp | null = null;
      field.near(this.x, this.y, this.reach * BOLT_RANGE, (p) => {
        if (p.mover || p.h > this.might * BOLT_RATIO) return;
        if (!target || p.h > target.h) target = p;
      });
      const struck = target as LiveProp | null;
      if (struck) {
        events.push({ type: 'bolt', prop: struck });
        this.smash(struck, 'bolt', events);
      }
    }

    // Claws: it lashes out at the nearest thing it can smash, on its own.
    if ((this.clawIn -= dt) <= 0) {
      let target: LiveProp | null = null;
      let best = Infinity;
      field.near(this.x, this.y, this.reach * CLAW_RANGE, (p, d) => {
        if (d < best && canSmash(this.might, p.kind)) {
          best = d;
          target = p;
        }
      });
      const prey = target as LiveProp | null;
      if (prey && this.air <= 0) {
        events.push({ type: 'attack', prop: prey, side: this.side });
        this.smash(prey, 'claw', events);
        this.side = this.side === 1 ? -1 : 1;
        this.clawIn = (this.has('reach') ? CLAW_FAST : CLAW_EVERY) / this.boost.claw;
      } else this.clawIn = 0.12;
    }

    this.wake(events);
  }

  /** Its parts wake as it grows. */
  wake(events: RunEvent[]): void {
    for (const power of POWERS) {
      if (!this.has(power.id) && this.size >= this.start * power.at) {
        this.powers.push(power.id);
        events.push({ type: 'power', power });
      }
    }
  }

  private smash(p: LiveProp, by: SmashBy, events: RunEvent[]): void {
    if (!p.alive) return;
    p.alive = false;
    this.onSmash?.(p);
    const moon = this.buffed('bloodmoon') ? BLOODMOON_GROWTH : 1;
    this.chain = this.time - this.lastSmash <= CHAIN_GAP ? this.chain + 1 : 1;
    this.lastSmash = this.time;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const base = rubbleOf(p.kind) * this.multiplier * moon;
    const points = Math.round(base * this.boost.value);
    this.baseRubble += Math.round(base);
    this.rubble += points;
    this.smashed++;
    this.kinds.set(p.kind, (this.kinds.get(p.kind) ?? 0) + 1);
    if (p.mover) this.frights++;
    this.feed(massOf(p.kind) * (this.has('spark') ? FRENZY : 1) * moon * this.tune.growth);
    events.push({ type: 'smash', prop: p, by, points });
  }
}

/** One story run: the creature alone in the day's place, against the clock. */
export class RampageRun {
  readonly field: Field;
  readonly beast: Beast;
  time = 0;
  /** The day's bounties, and the ones this run has completed. */
  readonly bounties: readonly Bounty[];
  readonly done: string[] = [];
  /** Seconds in this run (RUN_SECONDS; shorter in tests, longer with upgrades). */
  readonly seconds: number;
  private ended = false;

  constructor(
    world: World,
    start: number,
    seed = 'run',
    seconds = RUN_SECONDS,
    bounties: readonly Bounty[] = [],
    options: { pickups?: number; boost?: Boost; bravery?: Bravery | null } = {},
  ) {
    this.bounties = bounties;
    this.seconds = seconds;
    this.field = new Field(world, seed, options.pickups ?? 0, undefined, 0, options.bravery);
    this.beast = new Beast(start, world.start.x, world.start.y + 40, options.boost);
  }

  get props(): LiveProp[] {
    return this.field.props;
  }
  get pickups(): Pickup[] {
    return this.field.pickups;
  }
  get start(): number {
    return this.beast.start;
  }
  get x(): number {
    return this.beast.x;
  }
  set x(v: number) {
    this.beast.x = v;
  }
  get y(): number {
    return this.beast.y;
  }
  set y(v: number) {
    this.beast.y = v;
  }
  get facing(): number {
    return this.beast.facing;
  }
  get size(): number {
    return this.beast.size;
  }
  get peak(): number {
    return this.beast.peak;
  }
  get rubble(): number {
    return this.beast.rubble;
  }
  get smashed(): number {
    return this.beast.smashed;
  }
  get frights(): number {
    return this.beast.frights;
  }
  get moving(): boolean {
    return this.beast.moving;
  }
  get air(): number {
    return this.beast.air;
  }
  get powers(): PowerId[] {
    return this.beast.powers;
  }
  get chain(): number {
    return this.beast.chain;
  }
  get bestChain(): number {
    return this.beast.bestChain;
  }
  get liveChain(): number {
    return this.beast.liveChain;
  }
  get multiplier(): number {
    return this.beast.multiplier;
  }
  get reach(): number {
    return this.beast.reach;
  }
  get buffs(): Partial<Record<PowerupKind, number>> {
    return this.beast.buffs;
  }

  get over(): boolean {
    return this.time >= this.seconds;
  }

  get timeLeft(): number {
    return Math.max(0, this.seconds - this.time);
  }

  has(power: PowerId): boolean {
    return this.beast.has(power);
  }

  nextPower(): { power: Power; progress: number } | null {
    return this.beast.nextPower();
  }

  near(x: number, y: number, range: number, visit: (p: LiveProp, d: number) => void): void {
    this.field.near(x, y, range, visit);
  }

  result(): RunResult {
    const b = this.beast;
    return {
      rubble: b.rubble,
      baseRubble: b.baseRubble,
      smashed: b.smashed,
      frights: b.frights,
      start: b.start,
      peak: Math.round(b.peak),
      powers: [...b.powers],
      bestChain: b.bestChain,
      bounties: [...this.done],
    };
  }

  step(dt: number, steer: Steer): RunEvent[] {
    const events: RunEvent[] = [];
    if (this.ended) return events;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.over) {
      this.ended = true;
      events.push({ type: 'end' });
      return events;
    }
    this.beast.step(dt, steer, this.field, events);
    for (const e of this.field.step(dt, [this.beast])) events.push(e.event);
    this.checkBounties(events);
    return events;
  }

  /** How far this run has got with a bounty (0..its target). */
  progress(b: Bounty): number {
    return bountyProgress(b, {
      kinds: this.beast.kinds,
      frights: this.beast.frights,
      bestChain: this.beast.bestChain,
      powers: this.beast.powers.length,
      ratio: this.beast.peak / this.beast.start,
    });
  }

  private checkBounties(events: RunEvent[]): void {
    for (const b of this.bounties) {
      if (this.done.includes(b.id) || this.progress(b) < b.target) continue;
      this.done.push(b.id);
      this.beast.rubble += Math.round(b.bonus * this.beast.boost.value);
      this.beast.baseRubble += b.bonus;
      events.push({ type: 'bounty', bounty: b });
    }
  }
}

/** The rubble multiplier for a chain of smashes: ×1, then +0.25 every CHAIN_STEP, up to ×2. */
export function chainMultiplier(chain: number): number {
  return Math.min(CHAIN_MAX, 1 + Math.floor(Math.max(0, chain) / CHAIN_STEP) * 0.25);
}
