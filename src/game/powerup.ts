/**
 * Power-ups lying about the place: walk over one to take it. Most last a few seconds; the Thunder
 * Stomp goes off at once. In a battle they are the only edge anyone gets (no upgrades there), so
 * everyone has the same chance at them. Pure definitions; the run applies them (rampageRun.ts).
 */
export type PowerupKind = 'surge' | 'hunger' | 'serum' | 'bloodmoon' | 'ironhide' | 'stomp';

export interface PowerupSpec {
  name: string;
  /** What it does, in a few words. */
  text: string;
  /** How long it lasts (0: at once). */
  seconds: number;
  /** Its glow, and a one-character mark for the map. */
  color: string;
  mark: string;
}

export const POWERUPS: Record<PowerupKind, PowerupSpec> = {
  surge: { name: 'Surge', text: 'Much faster', seconds: 6, color: '#7fd8ff', mark: '»' },
  hunger: {
    name: 'Hunger',
    text: 'Sucks in small things',
    seconds: 7,
    color: '#b98cff',
    mark: '◎',
  },
  serum: {
    name: 'Monster Serum',
    text: 'Huge for a moment',
    seconds: 6,
    color: '#9be06a',
    mark: '▲',
  },
  bloodmoon: { name: 'Blood Moon', text: 'Double growth', seconds: 8, color: '#ff4a4a', mark: '●' },
  ironhide: {
    name: 'Iron Hide',
    text: 'Cannot be devoured',
    seconds: 8,
    color: '#d9d2c0',
    mark: '■',
  },
  stomp: {
    name: 'Thunder Stomp',
    text: 'Smashes all around',
    seconds: 0,
    color: '#ffd24a',
    mark: '✶',
  },
};

export const POWERUP_KINDS = Object.keys(POWERUPS) as PowerupKind[];

/** Iron Hide only matters where something can devour you. */
export const STORY_POWERUPS: readonly PowerupKind[] = POWERUP_KINDS.filter((k) => k !== 'ironhide');

// Their effects.
export const SURGE_SPEED = 1.6;
export const SERUM_SIZE = 1.35;
export const HUNGER_RANGE = 3;
export const HUNGER_SMALL = 0.4;
export const BLOODMOON_GROWTH = 2;
export const STOMP_RANGE = 3.5;

export interface Pickup {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
  alive: boolean;
}
