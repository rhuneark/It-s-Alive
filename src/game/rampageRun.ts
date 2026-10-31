/**
 * One rampage run, simulated: the creature moves where the player steers, smashes what is small
 * enough, is stopped by what is not, grows by what it smashes, and wakes its parts' powers as it
 * grows. Pure and frame-rate independent (step(dt)); the component draws whatever this says.
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
  /** One of the day's bounties is done: its bonus is added to the rubble. */
  | { type: 'bounty'; bounty: Bounty }
  | { type: 'end' };

export interface RunResult {
  rubble: number;
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
const FLEE_SPEED = 95;
const WANDER_SPEED = 22;

const CELL = 200;
const cellKey = (gx: number, gy: number) => gx * 4096 + gy;

export class RampageRun {
  readonly start: number;
  readonly props: LiveProp[];
  x: number;
  y: number;
  facing = 1;
  size: number;
  peak: number;
  mass = 0;
  rubble = 0;
  smashed = 0;
  frights = 0;
  time = 0;
  moving = false;
  /** Seconds left in the air (wings). */
  air = 0;
  readonly powers: PowerId[] = [];
  /** The chain of smashes going now, and the longest one. */
  chain = 0;
  bestChain = 0;
  /** The day's bounties, and the ones this run has completed. */
  readonly bounties: readonly Bounty[];
  readonly done: string[] = [];
  private readonly kinds = new Map<PropKind, number>();
  private lastSmash = -10;
  private leapIn = LEAP_EVERY;
  private sweepIn = SWEEP_EVERY;
  private clawIn = 0.5;
  private side: 1 | -1 = 1;
  private boltIn = BOLT_EVERY;
  private ended = false;
  private lastBlocked = -1;
  private readonly grid = new Map<number, LiveProp[]>();
  private readonly movers: LiveProp[] = [];
  private readonly rng: () => number;

  /** Seconds in this run (RUN_SECONDS; shorter in tests). */
  readonly seconds: number;

  constructor(
    world: World,
    start: number,
    seed = 'run',
    seconds = RUN_SECONDS,
    bounties: readonly Bounty[] = [],
  ) {
    this.start = start;
    this.bounties = bounties;
    this.seconds = seconds;
    this.size = start;
    this.peak = start;
    this.x = world.start.x;
    this.y = world.start.y + 40;
    this.rng = rngFor('rampage-run', seed);
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
  }

  get over(): boolean {
    return this.time >= this.seconds;
  }

  get timeLeft(): number {
    return Math.max(0, this.seconds - this.time);
  }

  has(power: PowerId): boolean {
    return this.powers.includes(power);
  }

  /** How far it reaches around its feet right now. */
  get reach(): number {
    return this.size * FOOT * (this.has('reach') ? REACH_BOOST : 1);
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

  result(): RunResult {
    return {
      rubble: this.rubble,
      smashed: this.smashed,
      frights: this.frights,
      start: this.start,
      peak: Math.round(this.peak),
      powers: [...this.powers],
      bestChain: this.bestChain,
      bounties: [...this.done],
    };
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
      Math.sqrt(this.size * this.start) * SPEED * (this.has('stride') ? STRIDE_BOOST : 1);
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
        this.near(this.x, this.y, radius, (p) => {
          if (canSmash(this.size, p.kind, SMASH_RATIO * LEAP_RATIO)) this.smash(p, 'leap', events);
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
      this.near(this.x, this.y, r, (p, d) => {
        if (canSmash(this.size, p.kind)) {
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

      // Maw: small things nearby are swallowed.
      if (this.has('maw')) {
        this.near(this.x, this.y, r * MAW_RANGE, (p) => {
          if (p.h <= this.size * MAW_SMALL) this.smash(p, 'maw', events);
        });
      }
    }

    // Tail: a sweep all around every so often.
    if (this.has('tail') && (this.sweepIn -= dt) <= 0) {
      this.sweepIn = SWEEP_EVERY;
      const radius = this.reach * SWEEP_RANGE;
      events.push({ type: 'sweep', radius });
      this.near(this.x, this.y, radius, (p) => {
        if (canSmash(this.size, p.kind)) this.smash(p, 'tail', events);
      });
    }

    // Spark: lightning strikes the biggest thing nearby that it could almost topple.
    if (this.has('spark') && (this.boltIn -= dt) <= 0) {
      this.boltIn = BOLT_EVERY;
      let target: LiveProp | null = null;
      this.near(this.x, this.y, this.reach * BOLT_RANGE, (p) => {
        if (p.mover || p.h > this.size * BOLT_RATIO) return;
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
      this.near(this.x, this.y, this.reach * CLAW_RANGE, (p, d) => {
        if (d < best && canSmash(this.size, p.kind)) {
          best = d;
          target = p;
        }
      });
      const prey = target as LiveProp | null;
      if (prey && this.air <= 0) {
        events.push({ type: 'attack', prop: prey, side: this.side });
        this.smash(prey, 'claw', events);
        this.side = this.side === 1 ? -1 : 1;
        this.clawIn = this.has('reach') ? CLAW_FAST : CLAW_EVERY;
      } else this.clawIn = 0.12;
    }

    this.moveCrowd(dt);

    // Its parts wake as it grows.
    for (const power of POWERS) {
      if (!this.has(power.id) && this.size >= this.start * power.at) {
        this.powers.push(power.id);
        events.push({ type: 'power', power });
      }
    }
    this.checkBounties(events);
    return events;
  }

  /** The chain still going (0 once it has lapsed: nothing smashed for CHAIN_GAP seconds). */
  get liveChain(): number {
    return this.time - this.lastSmash <= CHAIN_GAP ? this.chain : 0;
  }

  /** The rubble multiplier the chain going now earns (×1, ×1.25, … up to ×2). */
  get multiplier(): number {
    return chainMultiplier(this.chain);
  }

  /** How far this run has got with a bounty (0..its target). */
  progress(b: Bounty): number {
    return bountyProgress(b, {
      kinds: this.kinds,
      frights: this.frights,
      bestChain: this.bestChain,
      powers: this.powers.length,
      ratio: this.peak / this.start,
    });
  }

  private checkBounties(events: RunEvent[]): void {
    for (const b of this.bounties) {
      if (this.done.includes(b.id) || this.progress(b) < b.target) continue;
      this.done.push(b.id);
      this.rubble += b.bonus;
      events.push({ type: 'bounty', bounty: b });
    }
  }

  private smash(p: LiveProp, by: SmashBy, events: RunEvent[]): void {
    if (!p.alive) return;
    p.alive = false;
    this.mass += massOf(p.kind) * (this.has('spark') ? FRENZY : 1);
    this.chain = this.time - this.lastSmash <= CHAIN_GAP ? this.chain + 1 : 1;
    this.lastSmash = this.time;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const points = Math.round(rubbleOf(p.kind) * this.multiplier);
    this.rubble += points;
    this.smashed++;
    this.kinds.set(p.kind, (this.kinds.get(p.kind) ?? 0) + 1);
    if (p.mover) this.frights++;
    this.size = sizeAfter(this.start, this.mass);
    this.peak = Math.max(this.peak, this.size);
    events.push({ type: 'smash', prop: p, by, points });
  }

  /** Villagers and chickens run from the creature, and wander when it is far away. */
  private moveCrowd(dt: number): void {
    const flee = this.reach * FLEE_RANGE;
    for (const p of this.movers) {
      if (!p.alive) continue;
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < flee) {
        const s = (PROPS[p.kind].h < 30 ? 1.2 : 1) * FLEE_SPEED;
        p.vx = (dx / (d || 1)) * s;
        p.vy = (dy / (d || 1)) * s;
      } else if (this.rng() < dt * 0.6) {
        const a = this.rng() * Math.PI * 2;
        p.vx = Math.cos(a) * WANDER_SPEED;
        p.vy = Math.sin(a) * WANDER_SPEED;
      }
      p.x = Math.max(50, Math.min(WORLD_W - 50, p.x + p.vx * dt));
      p.y = Math.max(50, Math.min(WORLD_H - 50, p.y + p.vy * dt));
    }
  }
}

/** The rubble multiplier for a chain of smashes: ×1, then +0.25 every CHAIN_STEP, up to ×2. */
export function chainMultiplier(chain: number): number {
  return Math.min(CHAIN_MAX, 1 + Math.floor(Math.max(0, chain) / CHAIN_STEP) * 0.25);
}
