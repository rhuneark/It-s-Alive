/**
 * What a live battle sends over the wire, both ways, and how a snapshot of the arena is packed
 * small (ten times a second to every player). Pure: shared by the server room (src/rooms) and the
 * phone (components/Battle.tsx). Field names never use `type` inside a message: RUN's realtime
 * layer reserves it.
 */
import type { Arena, ArenaEvent, Standing } from './arena';
import { POWERS, type PowerId } from './rampage';
import { POWERUP_KINDS, type PowerupKind } from './powerup';
import type { Parts } from './sketch';

export const ROOM_TYPE = 'battle';
/** The server steps the arena this often, and sends a snapshot every SNAP_EVERY steps. */
export const TICK_MS = 50;
export const SNAP_EVERY = 2;
/** Seconds of lobby after the first creature arrives, for others to join. */
export const LOBBY_SECONDS = 5;
/** Late joiners take a bot's seat until this many seconds are left. */
export const JOIN_UNTIL = 60;

export interface SeatInfo {
  id: string;
  name: string;
  bot: boolean;
  parts: Parts;
}

export type Phase = 'lobby' | 'battle' | 'over';

/** The phone says who it is and what it built. */
export interface HelloMsg {
  type: 'hello';
  name: string;
  parts: Parts;
}

/** Where the player is steering (−1..1 each way). */
export interface SteerMsg {
  type: 'steer';
  x: number;
  y: number;
}

/** The match: the same place for everyone (seed and stage), who sits where, what is already smashed. */
export interface MatchMsg {
  type: 'match';
  seed: string;
  stage: string;
  seconds: number;
  phase: Phase;
  /** Seconds until the battle starts (lobby) or ends (battle). */
  left: number;
  you: string;
  seats: SeatInfo[];
  dead: number[];
}

export interface RosterMsg {
  type: 'roster';
  seats: SeatInfo[];
}

export interface PhaseMsg {
  type: 'phase';
  phase: Phase;
  left: number;
}

/**
 * A snapshot: see packFighters / packPickups; `ev` are packed events (packEvent; what was smashed
 * comes as `smash` events), `back` what the village rebuilt.
 */
export interface SnapMsg {
  type: 'snap';
  left: number;
  f: number[];
  back: number[];
  pu: number[];
  ev: Array<Array<number | string>>;
}

export interface OverMsg {
  type: 'over';
  table: Standing[];
}

export type BattleProtocol =
  | HelloMsg
  | SteerMsg
  | MatchMsg
  | RosterMsg
  | PhaseMsg
  | SnapMsg
  | OverMsg;

/** One creature as the phone sees it. */
export interface FighterView {
  /** Its seat's place in the roster. */
  i: number;
  x: number;
  y: number;
  size: number;
  mass: number;
  facing: 1 | -1;
  moving: boolean;
  alive: boolean;
  air: boolean;
  buffs: PowerupKind[];
  /** How many of its parts have woken. */
  woke: number;
}

const FIELDS = 6;

export function packFighters(arena: Arena, roster: readonly string[]): number[] {
  const out: number[] = [];
  roster.forEach((id, i) => {
    const f = arena.fighters.get(id);
    if (!f) return;
    const b = f.beast;
    let flags =
      (b.facing < 0 ? 1 : 0) | (b.moving ? 2 : 0) | (b.alive ? 4 : 0) | (b.air > 0 ? 8 : 0);
    POWERUP_KINDS.forEach((k, j) => {
      if (b.buffed(k)) flags |= 1 << (4 + j);
    });
    flags |= Math.min(7, b.powers.length) << 12;
    out.push(
      i,
      Math.round(b.x),
      Math.round(b.y),
      Math.round(b.size * 10),
      Math.round(b.mass),
      flags,
    );
  });
  return out;
}

export function unpackFighters(f: readonly number[]): FighterView[] {
  const out: FighterView[] = [];
  for (let k = 0; k + FIELDS <= f.length; k += FIELDS) {
    const flags = f[k + 5]!;
    out.push({
      i: f[k]!,
      x: f[k + 1]!,
      y: f[k + 2]!,
      size: f[k + 3]! / 10,
      mass: f[k + 4]!,
      facing: flags & 1 ? -1 : 1,
      moving: (flags & 2) !== 0,
      alive: (flags & 4) !== 0,
      air: (flags & 8) !== 0,
      buffs: POWERUP_KINDS.filter((_, j) => (flags & (1 << (4 + j))) !== 0),
      woke: (flags >> 12) & 7,
    });
  }
  return out;
}

export interface PickupView {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
  alive: boolean;
}

export function packPickups(arena: Arena): number[] {
  const out: number[] = [];
  for (const p of arena.field.pickups)
    out.push(
      p.id,
      POWERUP_KINDS.indexOf(p.kind),
      Math.round(p.x),
      Math.round(p.y),
      p.alive ? 1 : 0,
    );
  return out;
}

export function unpackPickups(pu: readonly number[]): PickupView[] {
  const out: PickupView[] = [];
  for (let k = 0; k + 5 <= pu.length; k += 5)
    out.push({
      id: pu[k]!,
      kind: POWERUP_KINDS[pu[k + 1]!] ?? 'surge',
      x: pu[k + 2]!,
      y: pu[k + 3]!,
      alive: pu[k + 4] === 1,
    });
  return out;
}

/** What happened, as the phone needs it to play the effects. */
export type BattleEvent =
  | { kind: 'woke'; who: number; power: PowerId }
  | { kind: 'devour'; who: number; victim: number }
  | { kind: 'respawn'; who: number }
  | { kind: 'pickup'; who: number; pickup: number; power: PowerupKind }
  | { kind: 'land'; who: number; radius: number }
  | { kind: 'sweep'; who: number; radius: number }
  | { kind: 'bolt'; who: number; prop: number }
  | { kind: 'attack'; who: number; prop: number; side: 1 | -1 }
  | { kind: 'smash'; who: number; prop: number; points: number };

/** Pack an arena event for the wire (null: the phone does not need it). */
export function packEvent(
  e: ArenaEvent,
  index: ReadonlyMap<string, number>,
): Array<number | string> | null {
  if (e.type === 'devour') return ['d', index.get(e.who) ?? -1, index.get(e.victim) ?? -1];
  if (e.type === 'respawn') return ['r', index.get(e.who) ?? -1];
  if (e.type !== 'run') return null;
  const who = index.get(e.who) ?? -1;
  const r = e.event;
  if (r.type === 'power') return ['p', who, r.power.id];
  if (r.type === 'pickup') return ['k', who, r.pickup.id, POWERUP_KINDS.indexOf(r.pickup.kind)];
  if (r.type === 'land') return ['l', who, Math.round(r.radius)];
  if (r.type === 'sweep') return ['w', who, Math.round(r.radius)];
  if (r.type === 'bolt') return ['b', who, r.prop.id];
  if (r.type === 'attack') return ['a', who, r.prop.id, r.side];
  if (r.type === 'smash') return ['s', who, r.prop.id, r.points];
  return null;
}

export function unpackEvent(t: ReadonlyArray<number | string>): BattleEvent | null {
  const [k, a, b, c] = t;
  const who = Number(a);
  switch (k) {
    case 'p':
      return POWERS.some((p) => p.id === b) ? { kind: 'woke', who, power: b as PowerId } : null;
    case 'd':
      return { kind: 'devour', who, victim: Number(b) };
    case 'r':
      return { kind: 'respawn', who };
    case 'k':
      return { kind: 'pickup', who, pickup: Number(b), power: POWERUP_KINDS[Number(c)] ?? 'surge' };
    case 'l':
      return { kind: 'land', who, radius: Number(b) };
    case 'w':
      return { kind: 'sweep', who, radius: Number(b) };
    case 'b':
      return { kind: 'bolt', who, prop: Number(b) };
    case 'a':
      return { kind: 'attack', who, prop: Number(b), side: Number(c) < 0 ? -1 : 1 };
    case 's':
      return { kind: 'smash', who, prop: Number(b), points: Number(c) };
    default:
      return null;
  }
}
