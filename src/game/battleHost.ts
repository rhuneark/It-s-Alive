/**
 * Running a battle: seats, the lobby, bots in the empty seats, the arena stepped in fixed ticks,
 * and the messages every player is sent (battleWire.ts). Pure, so the same host runs inside RUN's
 * server room (src/rooms/BattleRoom.ts) and on the phone for an offline battle against bots
 * (app/localBattle.ts), and the tests can play a whole match through its messages.
 */
import { Arena, SEATS, botSeat, type ArenaEvent, type Seat } from './arena';
import {
  JOIN_UNTIL,
  LOBBY_SECONDS,
  SNAP_EVERY,
  TICK_MS,
  packEvent,
  packFighters,
  packPickups,
  type MatchMsg,
  type OverMsg,
  type Phase,
  type PhaseMsg,
  type RosterMsg,
  type SeatInfo,
  type SnapMsg,
} from './battleWire';
import { STAGES, buildWorld, type Stage } from './rampage';
import { rngFor } from './rng';
import { cleanSketch } from './sketch';

export type HostMsg = RosterMsg | PhaseMsg | SnapMsg | OverMsg;

export class BattleHost {
  readonly seed: string;
  readonly stage: Stage;
  readonly arena: Arena;
  phase: Phase = 'lobby';
  private lobbyLeft: number;
  private readonly roster: string[] = [];
  private readonly index = new Map<string, number>();
  private events: ArenaEvent[] = [];
  private ticks = 0;

  constructor(seed: string, seconds?: number, lobby = LOBBY_SECONDS) {
    this.seed = seed;
    this.stage = STAGES[Math.floor(rngFor(seed)() * STAGES.length)]!;
    this.arena = new Arena(buildWorld(seed, this.stage), seed, seconds);
    this.lobbyLeft = lobby;
  }

  /** Whether a newcomer can still join (not once the battle is nearly over). */
  get open(): boolean {
    return this.phase === 'lobby' || (this.phase === 'battle' && this.arena.timeLeft >= JOIN_UNTIL);
  }

  /**
   * A player sits down with their creature (a free seat, or a bot's); returns what to send them
   * and what to tell everyone. Their parts are checked: only real options survive.
   */
  join(id: string, name: string, parts: unknown): { match: MatchMsg; all: HostMsg[] } | null {
    const seat: Seat = {
      id,
      name: String(name || 'A creature').slice(0, 24),
      bot: false,
      parts: cleanSketch(parts),
    };
    if (!this.index.has(id)) {
      if (this.roster.length < SEATS) {
        this.index.set(id, this.roster.length);
        this.roster.push(id);
      } else {
        const bot = this.roster.find((r) => r.startsWith('bot:'));
        if (!bot) return null;
        const i = this.index.get(bot)!;
        this.arena.remove(bot);
        this.index.delete(bot);
        this.roster[i] = id;
        this.index.set(id, i);
      }
      this.arena.add(seat);
    } else {
      const f = this.arena.fighters.get(id);
      if (f) f.seat = seat;
    }
    return {
      match: {
        type: 'match',
        seed: this.seed,
        stage: this.stage.id,
        seconds: this.arena.seconds,
        phase: this.phase,
        left: this.phase === 'lobby' ? this.lobbyLeft : this.arena.timeLeft,
        you: id,
        seats: this.seats(),
        dead: this.arena.field.props.filter((p) => !p.alive).map((p) => p.id),
      },
      all: [{ type: 'roster', seats: this.seats() }],
    };
  }

  steer(id: string, x: unknown, y: unknown): void {
    const sx = Number(x);
    const sy = Number(y);
    if (Number.isFinite(sx) && Number.isFinite(sy)) this.arena.steer(id, { x: sx, y: sy });
  }

  /** A player left: their creature fights on, played by a bot. */
  leave(id: string): HostMsg[] {
    this.arena.toBot(id);
    return [{ type: 'roster', seats: this.seats() }];
  }

  seats(): SeatInfo[] {
    return this.roster.map((id) => {
      const f = this.arena.fighters.get(id);
      return f ? { ...f.seat } : { id, name: '…', bot: true, parts: {} };
    });
  }

  /** One fixed tick (TICK_MS): returns what to send everyone. */
  tick(): HostMsg[] {
    const dt = TICK_MS / 1000;
    if (this.phase === 'lobby') {
      if (this.roster.length === 0) return [];
      this.lobbyLeft -= dt;
      if (this.lobbyLeft > 0) return [];
      // Bots take the empty seats, and the battle begins.
      let n = 0;
      while (this.roster.length < SEATS) {
        while (this.arena.fighters.has(`bot:${n}`)) n++;
        const bot = botSeat(this.seed, n);
        this.arena.add(bot);
        this.index.set(bot.id, this.roster.length);
        this.roster.push(bot.id);
      }
      this.phase = 'battle';
      return [
        { type: 'roster', seats: this.seats() },
        { type: 'phase', phase: 'battle', left: this.arena.timeLeft },
      ];
    }
    if (this.phase !== 'battle') return [];
    const out: HostMsg[] = [];
    this.events.push(...this.arena.step(dt));
    if (++this.ticks % SNAP_EVERY === 0 || this.arena.over) out.push(this.snap());
    if (this.arena.over) {
      this.phase = 'over';
      out.push({ type: 'over', table: this.arena.standings() });
    }
    return out;
  }

  private snap(): SnapMsg {
    const ev: Array<Array<number | string>> = [];
    for (const e of this.events) {
      const packed = packEvent(e, this.index);
      if (packed) ev.push(packed);
    }
    this.events = [];
    return {
      type: 'snap',
      left: this.arena.timeLeft,
      f: packFighters(this.arena, this.roster),
      back: this.arena.field.rebuiltSince.splice(0).map((p) => p.id),
      pu: packPickups(this.arena),
      ev,
    };
  }
}
