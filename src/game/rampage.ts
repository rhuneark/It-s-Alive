/**
 * The rampage (from Halloween on): the creature everyone built breaks out of the laboratory and
 * stomps through the village, one short run at a time, hole.io-style. It smashes anything smaller
 * than itself and grows as it goes; as it grows its parts wake one by one, each with a power; and
 * every midnight it grows for good by everything the whole community smashed that day.
 *
 * Pure: the village layout, sizes, growth, powers and the community's growth. The run itself is
 * simulated in rampageRun.ts; drawing is in components/Rampage.tsx.
 */
import { findOption, type SlotId } from './catalog';
import { rngFor } from './rng';

/** Seconds in one run. */
export const RUN_SECONDS = 60;
/** The village, in world units (the creature's size is its height in the same units). */
export const WORLD_W = 3600;
export const WORLD_H = 3600;
/** The creature's height on the first day, before the community has smashed anything. */
export const BASE_SIZE = 100;
/** It can smash anything up to this share of its own height. */
export const SMASH_RATIO = 0.75;
/** Growth is by area: size = sqrt(start² + GROWTH × mass smashed). */
export const GROWTH = 0.2;
/** World units per foot, for telling players how tall it stands. */
export const UNITS_PER_FOOT = 3.2;

export type PropKind =
  | 'pumpkin'
  | 'crate'
  | 'barrel'
  | 'haystack'
  | 'fence'
  | 'grave'
  | 'scarecrow'
  | 'villager'
  | 'farmer'
  | 'chicken'
  | 'cart'
  | 'lamp'
  | 'well'
  | 'cottage'
  | 'house'
  | 'tavern'
  | 'stall'
  | 'deadtree'
  | 'pine'
  | 'wagon'
  | 'forge'
  | 'church'
  | 'windmill'
  | 'watchtower'
  | 'manor'
  | 'townhall'
  | 'lab';

export interface PropSpec {
  /** Height in world units (what decides whether it can be smashed). */
  h: number;
  /** Footprint radius as a share of the height. */
  foot: number;
  /** People and animals run from the creature instead of standing still. */
  mover?: boolean;
}

export const PROPS: Record<PropKind, PropSpec> = {
  pumpkin: { h: 26, foot: 0.45 },
  crate: { h: 28, foot: 0.45 },
  barrel: { h: 30, foot: 0.4 },
  chicken: { h: 20, foot: 0.4, mover: true },
  villager: { h: 42, foot: 0.25, mover: true },
  farmer: { h: 44, foot: 0.25, mover: true },
  haystack: { h: 40, foot: 0.5 },
  fence: { h: 32, foot: 0.6 },
  grave: { h: 34, foot: 0.4 },
  cart: { h: 50, foot: 0.5 },
  scarecrow: { h: 58, foot: 0.25 },
  lamp: { h: 66, foot: 0.18 },
  well: { h: 64, foot: 0.45 },
  stall: { h: 88, foot: 0.5 },
  wagon: { h: 96, foot: 0.55 },
  deadtree: { h: 128, foot: 0.22 },
  pine: { h: 136, foot: 0.22 },
  cottage: { h: 132, foot: 0.42 },
  forge: { h: 150, foot: 0.42 },
  house: { h: 168, foot: 0.4 },
  tavern: { h: 196, foot: 0.42 },
  windmill: { h: 320, foot: 0.25 },
  watchtower: { h: 350, foot: 0.18 },
  church: { h: 370, foot: 0.38 },
  manor: { h: 400, foot: 0.42 },
  townhall: { h: 430, foot: 0.36 },
  lab: { h: 300, foot: 0.25 },
};

/** What smashing it adds to the creature (and to the rubble count). */
export function massOf(kind: PropKind): number {
  const h = PROPS[kind].h;
  return h * h * 0.6;
}

/** Rubble points for smashing it (what the run's score and the community's total add up). */
export function rubbleOf(kind: PropKind): number {
  return Math.max(1, Math.round(massOf(kind) / 60));
}

export function canSmash(size: number, kind: PropKind, ratio = SMASH_RATIO): boolean {
  return PROPS[kind].h <= size * ratio;
}

/** The creature's height after smashing `mass` worth of village, from a start of `start`. */
export function sizeAfter(start: number, mass: number): number {
  return Math.sqrt(start * start + GROWTH * mass);
}

export function feet(size: number): number {
  return Math.round(size / UNITS_PER_FOOT);
}

// ---------------------------------------------------------------- powers

export type PowerId = 'stride' | 'reach' | 'maw' | 'tail' | 'wings' | 'spark';

export interface Power {
  id: PowerId;
  /** Wakes when the creature reaches this multiple of its starting size. */
  at: number;
  /** The parts the village chose that give it this power. */
  slots: readonly SlotId[];
  effect: string;
}

/** The creature's parts wake one by one as it grows during a run, each with its own power. */
export const POWERS: readonly Power[] = [
  { id: 'stride', at: 1.12, slots: ['legR', 'legL'], effect: 'It stomps faster' },
  { id: 'reach', at: 1.3, slots: ['armR', 'armL', 'arm3'], effect: 'It reaches further' },
  {
    id: 'maw',
    at: 1.5,
    slots: ['maw', 'head', 'head2'],
    effect: 'It swallows small things nearby',
  },
  { id: 'tail', at: 1.75, slots: ['tail', 'spine'], effect: 'Its tail sweeps all around' },
  { id: 'wings', at: 2.05, slots: ['wings'], effect: 'It leaps and crushes where it lands' },
  {
    id: 'spark',
    at: 2.4,
    slots: ['spark', 'heart', 'brain'],
    effect: 'Frenzy! Lightning strikes the biggest things',
  },
];

/** The names of the parts the village chose for a power ("Bear Leg", "Chicken Leg"). */
export function powerParts(power: Power, parts: Partial<Record<SlotId, string>>): string[] {
  const names: string[] = [];
  for (const slot of power.slots) {
    const id = parts[slot];
    const name = id ? findOption(id)?.option.name : undefined;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// ---------------------------------------------------------------- the community

/**
 * The creature's starting height on a given day: it grows for good by everything the whole
 * community smashed on the days before. Logarithmic, so a handful of players still see it grow
 * and a big crowd cannot make it absurd.
 */
export function communitySize(totalRubbleBefore: number): number {
  const t = Math.max(0, totalRubbleBefore);
  return Math.round(BASE_SIZE * (1 + 0.12 * Math.log2(1 + t / 1000)));
}

/**
 * Each run adds one entry to the shared tally, filed under its rubble band, because the tally
 * can only count entries. Band 0 is under 250; band k covers [250·2^(k-1), 250·2^k).
 */
export const RUBBLE_BANDS = 12;

export function rubbleBand(rubble: number): number {
  if (rubble < 250) return 0;
  return Math.min(RUBBLE_BANDS - 1, Math.floor(Math.log2(rubble / 250)) + 1);
}

/** What one entry in a band stands for when the community total is added up. */
export function bandValue(band: number): number {
  return band === 0 ? 125 : Math.round(250 * 2 ** (band - 1) * 1.5);
}

/** The community's rubble from the per-band entry counts. */
export function totalFromBands(counts: readonly number[]): number {
  return counts.reduce((sum, n, b) => sum + n * bandValue(b), 0);
}

// ---------------------------------------------------------------- the places it wrecks

/** Each day of the rampage it reaches a new place (the last one, the city, goes on and on). */
export interface Stage {
  id: string;
  name: string;
  blurb: string;
  /** Landmarks it can only topple once it is huge, in the order they claim the big plots. */
  landmarks: PropKind[];
  /** Gap between houses along the roads (smaller = denser), and the cottage/house/tavern mix. */
  houseGap: number;
  houseMix: [cottage: number, house: number];
  farms: number;
  graveyards: number;
  patches: number;
  woods: number;
  crowd: number;
}

export const STAGES: readonly Stage[] = [
  {
    id: 'village',
    name: 'The Village',
    blurb: 'Where it all began: cottages, pumpkins and a lot of frightened villagers.',
    landmarks: ['townhall', 'church', 'manor', 'windmill', 'watchtower', 'windmill', 'church'],
    houseGap: 150,
    houseMix: [0.45, 0.85],
    farms: 3,
    graveyards: 2,
    patches: 14,
    woods: 120,
    crowd: 90,
  },
  {
    id: 'farms',
    name: 'The Farmlands',
    blurb: 'Haystacks, scarecrows, windmills, and chickens running for their lives.',
    landmarks: ['windmill', 'windmill', 'manor', 'windmill', 'watchtower', 'windmill', 'church'],
    houseGap: 260,
    houseMix: [0.7, 0.95],
    farms: 7,
    graveyards: 1,
    patches: 24,
    woods: 90,
    crowd: 70,
  },
  {
    id: 'market',
    name: 'The Market Town',
    blurb: 'Packed streets, taverns and market stalls. Busy, until it arrives.',
    landmarks: ['townhall', 'church', 'tavern', 'manor', 'watchtower', 'townhall', 'church'],
    houseGap: 110,
    houseMix: [0.25, 0.7],
    farms: 1,
    graveyards: 1,
    patches: 10,
    woods: 70,
    crowd: 130,
  },
  {
    id: 'graveyard',
    name: 'Graveyard Hill',
    blurb: 'Churches, crypts and dead trees. The dead do not run, the mourners do.',
    landmarks: ['church', 'church', 'manor', 'church', 'watchtower', 'church', 'townhall'],
    houseGap: 220,
    houseMix: [0.6, 0.9],
    farms: 1,
    graveyards: 6,
    patches: 12,
    woods: 160,
    crowd: 70,
  },
  {
    id: 'estate',
    name: "The Baron's Estate",
    blurb: "Manors, watchtowers and the Baron's guards. Topple them all.",
    landmarks: ['manor', 'manor', 'watchtower', 'manor', 'watchtower', 'church', 'watchtower'],
    houseGap: 180,
    houseMix: [0.35, 0.8],
    farms: 2,
    graveyards: 1,
    patches: 12,
    woods: 110,
    crowd: 90,
  },
  {
    id: 'city',
    name: 'The City',
    blurb: 'Endless streets and towers. It will never run out of things to smash.',
    landmarks: ['townhall', 'church', 'manor', 'townhall', 'watchtower', 'manor', 'church'],
    houseGap: 100,
    houseMix: [0.15, 0.6],
    farms: 0,
    graveyards: 1,
    patches: 8,
    woods: 50,
    crowd: 150,
  },
];

/** The place for a day of the rampage (0 = Halloween); the city goes on after the last. */
export function stageFor(rampageDay: number): Stage {
  return STAGES[Math.max(0, Math.min(rampageDay, STAGES.length - 1))]!;
}

// ---------------------------------------------------------------- the village

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  h: number;
  r: number;
}

export interface Road {
  /** Polyline in world units. */
  points: Array<[number, number]>;
  width: number;
}

export interface World {
  props: Prop[];
  roads: Road[];
  /** Where the creature starts: the laboratory it broke out of. */
  start: { x: number; y: number };
}

/** The day's place, laid out the same for everyone on that day. */
export function buildWorld(seed: string, stage: Stage = STAGES[0]!): World {
  const rng = rngFor('village', stage.id, seed);
  const props: Prop[] = [];
  const cell = 160;
  const grid = new Map<string, Prop[]>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const W = WORLD_W;
  const H = WORLD_H;

  const fits = (x: number, y: number, r: number) => {
    if (x - r < 40 || y - r < 40 || x + r > W - 40 || y + r > H - 40) return false;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const span = Math.ceil((r + 180) / cell);
    for (let i = gx - span; i <= gx + span; i++)
      for (let j = gy - span; j <= gy + span; j++)
        for (const p of grid.get(key(i, j)) ?? []) {
          const min = p.r + r + 6;
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < min * min) return false;
        }
    return true;
  };
  const place = (kind: PropKind, x: number, y: number): boolean => {
    const spec = PROPS[kind];
    const r = spec.h * spec.foot;
    if (!fits(x, y, r)) return false;
    const p: Prop = { id: props.length, kind, x: Math.round(x), y: Math.round(y), h: spec.h, r };
    props.push(p);
    const k = key(Math.floor(x / cell), Math.floor(y / cell));
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
    return true;
  };
  const near = (x: number, y: number, spread: number) =>
    [x + (rng() - 0.5) * 2 * spread, y + (rng() - 0.5) * 2 * spread] as const;
  const scatter = (kinds: PropKind[], x: number, y: number, spread: number, n: number) => {
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 12; tries++) {
      const [px, py] = near(x, y, spread);
      if (place(kinds[Math.floor(rng() * kinds.length)]!, px, py)) placed++;
    }
  };

  const cx = W / 2;
  const cy = H / 2;
  const start = { x: cx, y: H - 420 };
  const roads: Road[] = [
    {
      points: [
        [start.x, start.y],
        [cx, cy + 260],
        [cx, cy],
      ],
      width: 70,
    },
    {
      points: [
        [160, cy + 40],
        [cx - 260, cy],
        [cx + 260, cy],
        [W - 160, cy - 60],
      ],
      width: 80,
    },
    {
      points: [
        [cx, cy],
        [cx + 40, cy - 700],
        [cx - 60, 220],
      ],
      width: 60,
    },
    {
      points: [
        [cx - 900, cy],
        [cx - 1000, cy + 800],
        [cx - 1300, H - 200],
      ],
      width: 50,
    },
    {
      points: [
        [cx + 900, cy - 20],
        [cx + 1000, cy - 900],
        [cx + 1250, 300],
      ],
      width: 50,
    },
  ];

  // The ruined laboratory it broke out of, then the landmarks it can only topple once it is huge.
  place('lab', start.x, start.y - 10);
  const plots: Array<[number, number]> = [
    [cx, cy - 380],
    [cx + 520, cy - 330],
    [cx - 1180, cy - 560],
    [W - 520, cy + 620],
    [cx - 140, 380],
    [520, cy + 820],
    [cx - 700, H - 640],
  ];
  stage.landmarks.forEach((kind, i) => {
    const [x, y] = plots[i % plots.length]!;
    place(kind, x, y);
  });

  // The square: a well, market stalls, lamps, and people.
  place('well', cx + 30, cy + 60);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    place(a % 2 ? 'lamp' : 'stall', cx + Math.cos(ang) * 230, cy + 60 + Math.sin(ang) * 170);
  }
  place('tavern', cx - 420, cy - 260);
  place('forge', cx + 330, cy + 300);

  // Houses along every road, with fences, crates and barrels at their doors.
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, ay] = road.points[i]!;
      const [bx, by] = road.points[i + 1]!;
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (let t = 120; t < len - 60; t += stage.houseGap + rng() * 90) {
        for (const side of [-1, 1]) {
          const off = road.width / 2 + 110 + rng() * 60;
          const x = ax + ((bx - ax) * t) / len + nx * off * side;
          const y = ay + ((by - ay) * t) / len + ny * off * side;
          const roll = rng();
          const [cottage, house] = stage.houseMix;
          const kind: PropKind = roll < cottage ? 'cottage' : roll < house ? 'house' : 'tavern';
          if (place(kind, x, y)) {
            scatter(['fence', 'crate', 'barrel', 'pumpkin'], x, y + 70, 90, 3);
          }
        }
        // the road itself: carts, lamps, wagons
        const x = ax + ((bx - ax) * t) / len;
        const y = ay + ((by - ay) * t) / len;
        if (rng() < 0.35) place(rng() < 0.6 ? 'lamp' : 'cart', x + nx * 45, y + ny * 45);
        if (rng() < 0.12) place('wagon', x - nx * 50, y - ny * 50);
      }
    }
  }

  // Farmland: haystacks, scarecrows, fences and chickens.
  const fields: Array<[number, number]> = [
    [W - 760, H - 820],
    [700, 900],
    [W - 700, 760],
    [760, H - 900],
    [cx + 900, 520],
    [cx - 1000, cy + 300],
    [cx + 1100, cy + 1000],
  ];
  for (const [fx, fy] of fields.slice(0, stage.farms)) {
    scatter(['haystack', 'haystack', 'scarecrow', 'fence', 'pumpkin'], fx, fy, 360, 26);
    scatter(['chicken'], fx, fy, 300, 8);
  }
  // Graveyards, and pumpkin patches everywhere.
  const yards: Array<[number, number]> = [
    [cx + 620, cy - 120],
    [cx - 700, H - 420],
    [cx - 1200, cy - 200],
    [cx + 1150, cy + 350],
    [cx + 300, 600],
    [cx - 500, 700],
  ];
  for (const [gx, gy] of yards.slice(0, stage.graveyards))
    scatter(['grave', 'grave', 'deadtree'], gx, gy, 220, 18);
  for (let i = 0; i < stage.patches; i++)
    scatter(['pumpkin'], 300 + rng() * (W - 600), 300 + rng() * (H - 600), 120, 7);

  // Woods at the edges.
  for (let i = 0; i < stage.woods; i++) {
    const edge = Math.floor(rng() * 4);
    const along = 120 + rng() * (W - 240);
    const depth = 80 + rng() * 380;
    const [x, y] =
      edge === 0
        ? [along, depth]
        : edge === 1
          ? [along, H - depth]
          : edge === 2
            ? [depth, along]
            : [W - depth, along];
    place(rng() < 0.6 ? 'pine' : 'deadtree', x, y);
  }

  // Fill: small things all over, and the villagers out with their torches.
  // Dense towns have fewer gaps between houses, so they get more small clutter in the streets.
  const clutter = 220 + Math.max(0, 160 - stage.houseGap) * 3;
  scatter(['crate', 'barrel', 'pumpkin', 'cart', 'lamp', 'haystack'], cx, cy, W / 2 - 200, clutter);
  scatter(['villager', 'farmer'], cx, cy + 100, 600, Math.round(stage.crowd * 0.45));
  scatter(['villager', 'farmer'], cx, cy, W / 2 - 300, Math.round(stage.crowd * 0.55));
  // A crowd waiting by the laboratory: the first things to flee.
  scatter(['villager', 'pumpkin', 'crate', 'fence'], start.x, start.y - 260, 260, 18);

  return { props, roads, start };
}
