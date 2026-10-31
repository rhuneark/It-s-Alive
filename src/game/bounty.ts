/**
 * The day's bounties: three things to do in a rampage run, the same for everyone in a place on a
 * day (seeded like the place itself). An easy one (smash a lot of something small), a middling one
 * (send villagers flying, or keep a chain of smashes going) and a hard one (topple a big building,
 * wake all its parts, or grow four times taller). Every run that completes one earns its bonus
 * rubble; the menu ticks off the ones done today. Pure.
 */
import { PROPS, type PropKind, type World } from './rampage';
import { rngFor } from './rng';

export type BountyKind = 'smash' | 'fling' | 'chain' | 'topple' | 'wake' | 'grow';

export interface Bounty {
  /** Stable for the day (kind, thing and target), so the save can tick it off. */
  id: string;
  kind: BountyKind;
  target: number;
  prop?: PropKind;
  /** Rubble added to a run that completes it. */
  bonus: number;
  text: string;
}

/** What a run has done so far, as far as bounties care. */
export interface BountyStats {
  kinds: ReadonlyMap<PropKind, number>;
  frights: number;
  bestChain: number;
  powers: number;
  /** Peak size over start size. */
  ratio: number;
}

const PLURAL: Partial<Record<PropKind, string>> = {
  pumpkin: 'pumpkins',
  crate: 'crates',
  barrel: 'barrels',
  haystack: 'haystacks',
  fence: 'fences',
  grave: 'gravestones',
  cart: 'carts',
  lamp: 'lamp posts',
  scarecrow: 'scarecrows',
  well: 'wells',
};

const ONE: Partial<Record<PropKind, string>> = {
  house: 'a house',
  tavern: 'a tavern',
};

/** Small things to smash a lot of (all smashable from the very start of a run). */
const SMALL: readonly PropKind[] = Object.keys(PLURAL) as PropKind[];
/** Big buildings to topple (it must grow well over twice its size first). */
const BIG: readonly PropKind[] = ['house', 'tavern'];

export const BOUNTY_BONUS = { easy: 150, middling: 250, hard: 400 } as const;

export function bountiesFor(seed: string, world: World): Bounty[] {
  const rng = rngFor('bounty', seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
  const count = new Map<PropKind, number>();
  for (const p of world.props) count.set(p.kind, (count.get(p.kind) ?? 0) + 1);

  const out: Bounty[] = [];
  // Easy: smash a lot of something small the place is full of.
  const small = SMALL.filter((k) => (count.get(k) ?? 0) >= 25);
  const kind = small.length ? pick(small) : 'crate';
  const many = Math.max(8, Math.min(25, Math.round((count.get(kind) ?? 0) * 0.1)));
  out.push({
    id: `smash:${kind}:${many}`,
    kind: 'smash',
    target: many,
    prop: kind,
    bonus: BOUNTY_BONUS.easy,
    text: `Smash ${many} ${PLURAL[kind]}`,
  });

  // Middling: frighten the crowd, or keep the smashing going.
  const crowd = world.props.filter((p) => PROPS[p.kind].mover).length;
  if (rng() < 0.5 && crowd >= 60) {
    const n = Math.max(12, Math.min(24, Math.round(crowd * 0.15)));
    out.push({
      id: `fling:${n}`,
      kind: 'fling',
      target: n,
      bonus: BOUNTY_BONUS.middling,
      text: `Send ${n} villagers flying`,
    });
  } else {
    out.push({
      id: 'chain:100',
      kind: 'chain',
      target: 100,
      bonus: BOUNTY_BONUS.middling,
      text: 'Chain 100 smashes without stopping',
    });
  }

  // Hard: something only a run that grows a lot can do.
  const big = BIG.filter((k) => (count.get(k) ?? 0) > 0);
  const hard = pick(['topple', 'wake', 'grow'] as const);
  if (hard === 'topple' && big.length) {
    const b = pick(big);
    out.push({
      id: `topple:${b}`,
      kind: 'topple',
      target: 1,
      prop: b,
      bonus: BOUNTY_BONUS.hard,
      text: `Topple ${ONE[b]}`,
    });
  } else if (hard === 'grow') {
    out.push({
      id: 'grow:4',
      kind: 'grow',
      target: 4,
      bonus: BOUNTY_BONUS.hard,
      text: 'Grow four times taller',
    });
  } else {
    out.push({
      id: 'wake:6',
      kind: 'wake',
      target: 6,
      bonus: BOUNTY_BONUS.hard,
      text: 'Wake all six of its parts',
    });
  }
  return out;
}

/** How far a run has got with a bounty (0..target). */
export function bountyProgress(b: Bounty, s: BountyStats): number {
  const value =
    b.kind === 'smash' || b.kind === 'topple'
      ? (s.kinds.get(b.prop!) ?? 0)
      : b.kind === 'fling'
        ? s.frights
        : b.kind === 'chain'
          ? s.bestChain
          : b.kind === 'wake'
            ? s.powers
            : s.ratio;
  return Math.min(b.target, b.kind === 'grow' ? value : Math.floor(value));
}
