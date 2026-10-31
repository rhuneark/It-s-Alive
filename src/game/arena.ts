/**
 * The battle: up to SEATS creatures loose in one place for BATTLE_SECONDS. Each grows by smashing
 * the village and by devouring any creature small enough (EAT_RATIO of its own might); a devoured
 * creature comes back small somewhere else a few seconds later, shielded for a moment. Whoever has
 * the most mass when the clock runs out wins. No upgrades here: only the power-ups lying about, the
 * same for everyone. Empty seats are taken by bots (`botSteer`). Pure: the same code runs in the
 * live room on RUN's server and in an offline battle on the phone.
 */
import { QUESTIONS, type SlotId } from './catalog';
import { POWERUP_KINDS } from './powerup';
import { BASE_SIZE, type World } from './rampage';
import { Beast, Field, type RunEvent, type Steer, type Tune } from './rampageRun';
import { rngFor } from './rng';
import { randomSketch, type Parts } from './sketch';

export const BATTLE_SECONDS = 180;
export const SEATS = 8;
export const BATTLE_PICKUPS = 18;
/** A creature can devour another up to this share of its own might. */
export const EAT_RATIO = 0.8;
/** The share of the devoured creature's mass the devourer gains. */
const EAT_KEEP = 0.6;
const RESPAWN_SECONDS = 3;
/** Shielded (Iron Hide) this long after coming back. */
export const SPAWN_SHIELD = 3;
/** Battle creatures: a giant is barely faster than a newborn, and grows more slowly. */
export const BATTLE_TUNE: Tune = { speedExp: 0.12, growth: 0.45 };
/** Smashed things are rebuilt this long after (so the place lasts the whole battle). */
const REGROW_SECONDS = 30;
/** Past this many times its start size a creature sheds mass, this share of it a second. */
const SHED_ABOVE = 3;
const SHED_RATE = 0.006;

export interface Seat {
  id: string;
  name: string;
  bot: boolean;
  parts: Parts;
}

export interface Fighter {
  seat: Seat;
  beast: Beast;
  steer: Steer;
  /** Seconds until it comes back (devoured), else 0. */
  respawnIn: number;
  devoured: number;
  deaths: number;
  /** The most mass it has had in this battle. */
  best: number;
  /** A bot's plan: where it is heading, and when it thinks again. */
  plan: Steer;
  thinkIn: number;
}

export type ArenaEvent =
  | { type: 'run'; who: string; event: RunEvent }
  | { type: 'devour'; who: string; victim: string; mass: number }
  | { type: 'respawn'; who: string }
  | { type: 'end' };

export interface Standing {
  id: string;
  name: string;
  bot: boolean;
  mass: number;
  size: number;
  devoured: number;
  rank: number;
}

const BOT_NAMES = [
  'Grimjaw',
  'Old Stitches',
  'The Bog Thing',
  'Mother Moth',
  'Count Gristle',
  'Hollow Hank',
  'Lady Ghoul',
  'Wailing Wendell',
  'Sir Sutures',
  'The Lurch',
  'Bonepicker',
  'Mildred the Vast',
];

const ALL_SLOTS: SlotId[] = QUESTIONS.map((q) => q.slot);

/** A bot's seat: a creature of random parts and a name, the same for the same seed. */
export function botSeat(seed: string, n: number): Seat {
  const rng = rngFor('bot', seed, String(n));
  return {
    id: `bot:${n}`,
    name: BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)]!,
    bot: true,
    parts: randomSketch(Math.floor(rng() * 1e9), ALL_SLOTS),
  };
}

export class Arena {
  readonly field: Field;
  readonly fighters = new Map<string, Fighter>();
  readonly seconds: number;
  time = 0;
  private readonly rng: () => number;
  private ended = false;

  constructor(world: World, seed: string, seconds = BATTLE_SECONDS, pickups = BATTLE_PICKUPS) {
    this.field = new Field(world, seed, pickups, POWERUP_KINDS, REGROW_SECONDS);
    this.seconds = seconds;
    this.rng = rngFor('arena', seed);
  }

  get over(): boolean {
    return this.time >= this.seconds;
  }

  get timeLeft(): number {
    return Math.max(0, this.seconds - this.time);
  }

  /** A creature takes a seat (somewhere open, shielded for a moment). */
  add(seat: Seat): Fighter {
    const at = this.safeSpot(BASE_SIZE);
    const beast = new Beast(BASE_SIZE, at.x, at.y, undefined, BATTLE_TUNE);
    beast.buffs.ironhide = SPAWN_SHIELD;
    beast.onSmash = (p) => this.field.smashed(p);
    const f: Fighter = {
      seat,
      beast,
      steer: { x: 0, y: 0 },
      respawnIn: 0,
      devoured: 0,
      deaths: 0,
      best: 0,
      plan: { x: 0, y: 0 },
      thinkIn: 0,
    };
    this.fighters.set(seat.id, f);
    return f;
  }

  remove(id: string): void {
    this.fighters.delete(id);
  }

  /** A player who left keeps their creature in the fight, now played by a bot. */
  toBot(id: string): void {
    const f = this.fighters.get(id);
    if (f) f.seat = { ...f.seat, bot: true };
  }

  /** Fill empty seats with bots, up to `seats`. */
  fillWithBots(seed: string, seats = SEATS): void {
    let n = 0;
    while (this.fighters.size < seats) {
      while (this.fighters.has(`bot:${n}`)) n++;
      this.add(botSeat(seed, n));
    }
  }

  steer(id: string, s: Steer): void {
    const f = this.fighters.get(id);
    if (!f || f.seat.bot) return;
    const len = Math.hypot(s.x, s.y);
    f.steer = len > 1 ? { x: s.x / len, y: s.y / len } : { x: s.x || 0, y: s.y || 0 };
  }

  step(dt: number): ArenaEvent[] {
    const out: ArenaEvent[] = [];
    if (this.ended) return out;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.over) {
      this.ended = true;
      out.push({ type: 'end' });
      return out;
    }
    const all = [...this.fighters.values()];
    for (const f of all) {
      const b = f.beast;
      if (!b.alive) {
        f.respawnIn -= dt;
        if (f.respawnIn <= 0) {
          const at = this.safeSpot(b.start);
          b.respawn(at.x, at.y);
          b.buffs.ironhide = SPAWN_SHIELD;
          out.push({ type: 'respawn', who: f.seat.id });
        }
        continue;
      }
      // A giant sheds mass (so nobody runs away with the battle for good).
      if (b.size > b.start * SHED_ABOVE) b.feed(-b.mass * SHED_RATE * dt);
      const steer = f.seat.bot ? this.think(f, dt) : f.steer;
      const events: RunEvent[] = [];
      b.step(dt, steer, this.field, events);
      for (const event of events) out.push({ type: 'run', who: f.seat.id, event });
      f.best = Math.max(f.best, b.mass);
    }

    // Devouring: the bigger swallows the smaller when it reaches it.
    for (const a of all) {
      const A = a.beast;
      if (!A.alive) continue;
      for (const v of all) {
        const V = v.beast;
        if (v === a || !V.alive || V.buffed('ironhide')) continue;
        if (V.size > A.might * EAT_RATIO) continue;
        if (Math.hypot(V.x - A.x, V.y - A.y) > A.reach + V.size * 0.15) continue;
        const mass = EAT_KEEP * (V.mass + 0.6 * V.size * V.size);
        A.feed(mass);
        const events: RunEvent[] = [];
        A.wake(events);
        for (const event of events) out.push({ type: 'run', who: a.seat.id, event });
        a.best = Math.max(a.best, A.mass);
        a.devoured++;
        V.alive = false;
        v.deaths++;
        v.respawnIn = RESPAWN_SECONDS;
        out.push({ type: 'devour', who: a.seat.id, victim: v.seat.id, mass });
      }
    }

    this.field.step(
      dt,
      all.map((f) => f.beast),
    );
    return out;
  }

  /** Somewhere open, as far as can be from anything that could devour a creature this size. */
  private safeSpot(size: number): { x: number; y: number } {
    let best = this.field.openSpot(this.rng);
    let room = -1;
    for (let i = 0; i < 8; i++) {
      const at = i === 0 ? best : this.field.openSpot(this.rng);
      let nearest = Infinity;
      for (const f of this.fighters.values())
        if (f.beast.alive && size <= f.beast.might * EAT_RATIO)
          nearest = Math.min(nearest, Math.hypot(f.beast.x - at.x, f.beast.y - at.y));
      if (nearest > room) {
        room = nearest;
        best = at;
      }
    }
    return best;
  }

  /** Everyone, biggest first. */
  standings(): Standing[] {
    return [...this.fighters.values()]
      .map((f) => ({
        id: f.seat.id,
        name: f.seat.name,
        bot: f.seat.bot,
        mass: f.beast.alive ? f.beast.mass : 0,
        size: f.beast.alive ? f.beast.size : f.beast.start,
        devoured: f.devoured,
        rank: 0,
      }))
      .sort((a, b) => b.mass - a.mass || a.id.localeCompare(b.id))
      .map((s, i) => ({ ...s, rank: i + 1 }));
  }

  /**
   * A bot's mind, a few times a second: run from anything that could devour it, chase anything it
   * could devour, grab a power-up nearby, else head for the nearest thing it can smash.
   */
  private think(f: Fighter, dt: number): Steer {
    if ((f.thinkIn -= dt) > 0) return f.plan;
    f.thinkIn = 0.25 + this.rng() * 0.2;
    const me = f.beast;
    const toward = (x: number, y: number, away = false): Steer => {
      const dx = x - me.x;
      const dy = y - me.y;
      const d = Math.hypot(dx, dy) || 1;
      return away ? { x: -dx / d, y: -dy / d } : { x: dx / d, y: dy / d };
    };
    let threat: Beast | null = null;
    let prey: Beast | null = null;
    let threatD = me.reach * 7;
    let preyD = me.reach * 9;
    for (const o of this.fighters.values()) {
      const B = o.beast;
      if (o === f || !B.alive) continue;
      const d = Math.hypot(B.x - me.x, B.y - me.y);
      if (!me.buffed('ironhide') && me.size <= B.might * EAT_RATIO && d < threatD) {
        threat = B;
        threatD = d;
      } else if (!B.buffed('ironhide') && B.size <= me.might * EAT_RATIO && d < preyD) {
        prey = B;
        preyD = d;
      }
    }
    if (threat) f.plan = toward(threat.x, threat.y, true);
    else if (prey) f.plan = toward(prey.x, prey.y);
    else {
      let pick: { x: number; y: number } | null = null;
      let best = me.reach * 10;
      for (const p of this.field.pickups) {
        const d = Math.hypot(p.x - me.x, p.y - me.y);
        if (p.alive && d < best) {
          best = d;
          pick = p;
        }
      }
      if (!pick) {
        best = Infinity;
        for (const range of [me.reach * 5, me.reach * 14, 900]) {
          this.field.near(me.x, me.y, range, (p, d) => {
            if (d < best && p.h <= me.might * 0.75) {
              best = d;
              pick = p;
            }
          });
          if (pick) break;
        }
      }
      const target = pick as { x: number; y: number } | null;
      f.plan = target
        ? toward(target.x, target.y)
        : toward(me.x + (this.rng() - 0.5) * 400, me.y + (this.rng() - 0.5) * 400);
    }
    return f.plan;
  }
}
