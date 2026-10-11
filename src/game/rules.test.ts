import { describe, expect, it } from 'vitest';
import { QUESTIONS, findOption } from './catalog';
import { simulatedCrowd } from './crowd';
import {
  DAY_MS,
  buildSchedule,
  closedDays,
  dayIndexAt,
  phaseAt,
  votingDays,
  type Season,
} from './schedule';
import LAYERS from './layers.json';
import { cleanSketch, randomSketch, setSketchPart, sketchFromPicks, sketchSize } from './sketch';
import {
  MAX_AD_VOTES_PER_DAY,
  canEarnAdVote,
  grantAdVote,
  newSave,
  parseSave,
  recordVote,
  rollToDay,
  serializeSave,
  setMusic,
  setMusicVolume,
  setSketch,
  votesRemaining,
} from './state';
import { percentages, resolveDay } from './tally';

const SEASON: Season = {
  id: 'test',
  startMs: Date.UTC(2026, 9, 10),
  awakenMs: Date.UTC(2026, 9, 31),
};

describe('catalog', () => {
  it('has unique option ids and five options per question', () => {
    const ids = QUESTIONS.flatMap((q) => q.options.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTIONS) expect(q.options).toHaveLength(5);
    expect(findOption('leg_rooster')?.question.slot).toBe('legL');
  });

  it('has art for every option', () => {
    for (const q of QUESTIONS) {
      for (const o of q.options)
        if (q.slot !== 'spark')
          expect(
            Object.keys(LAYERS.parts).some((k) => k === o.id || k.startsWith(`${o.id}@`)),
            o.id,
          ).toBe(true);
    }
  });
});

describe('schedule', () => {
  it('asks 20 parts from Oct 10 to Oct 29, head first, spark last, then keeps a vigil on Oct 30', () => {
    expect(votingDays(SEASON)).toBe(21);
    const s = buildSchedule(21);
    expect(s).toHaveLength(20);
    expect(s[0]!.slot).toBe('head');
    expect(s[18]!.slot).toBe('brain');
    expect(s[19]!.slot).toBe('spark');
  });

  it('keeps the nights already played (the season is live) on the same parts', () => {
    const launched = ['head', 'torso', 'armR', 'legL', 'browEye', 'armL', 'legR', 'heart', 'tail'];
    expect(
      buildSchedule(21)
        .map((q) => q.slot)
        .slice(0, launched.length),
    ).toEqual(launched);
  });

  it('drops middle questions for shorter seasons but keeps head, brain and spark', () => {
    for (let days = 1; days <= 25; days++) {
      const s = buildSchedule(days);
      expect(s.length).toBe(Math.min(days, QUESTIONS.length));
      expect(s[0]!.slot).toBe('head');
      if (days >= 2) expect(s.at(-1)!.slot).toBe('spark');
      if (days >= 3) expect(s.at(-2)!.slot).toBe('brain');
      expect(new Set(s.map((q) => q.slot)).size).toBe(s.length);
    }
  });

  it('moves through preseason, voting, the vigil and awakening', () => {
    expect(phaseAt(SEASON.startMs - 1, SEASON).kind).toBe('preseason');
    const first = phaseAt(SEASON.startMs + 5, SEASON);
    expect(first.kind === 'voting' && first.day === 0 && first.question.slot === 'head').toBe(true);
    const last = phaseAt(SEASON.startMs + 19 * DAY_MS + 5, SEASON);
    expect(last.kind === 'voting' && last.day === 19 && last.question.slot === 'spark').toBe(true);
    const vigil = phaseAt(SEASON.awakenMs - 1, SEASON);
    expect(vigil).toEqual({ kind: 'vigil', wakesInMs: 1, dayCount: 20 });
    expect(phaseAt(SEASON.startMs + 20 * DAY_MS, SEASON).kind).toBe('vigil');
    expect(phaseAt(SEASON.awakenMs, SEASON).kind).toBe('awakened');
    expect(dayIndexAt(SEASON.startMs + 3 * DAY_MS + 10, SEASON)).toBe(3);
    expect(closedDays(SEASON.startMs + 3 * DAY_MS + 10, SEASON)).toEqual([0, 1, 2]);
    // on the vigil every night is closed, so the spark is resolved and shown
    expect(closedDays(SEASON.awakenMs - 1, SEASON)).toHaveLength(20);
    expect(closedDays(SEASON.awakenMs + 9 * DAY_MS, SEASON)).toHaveLength(20);
  });
});

describe('tally', () => {
  it('picks the most voted option', () => {
    expect(resolveDay([3, 9, 1, 0, 2], 'x')).toEqual({
      winnerIndex: 1,
      counts: [3, 9, 1, 0, 2],
      reason: 'votes',
    });
  });

  it('breaks ties deterministically among the leaders only', () => {
    const r = resolveDay([5, 1, 5, 0, 5], 'seed-a');
    expect(r.reason).toBe('tie');
    expect([0, 2, 4]).toContain(r.winnerIndex);
    expect(resolveDay([5, 1, 5, 0, 5], 'seed-a').winnerIndex).toBe(r.winnerIndex);
  });

  it('still picks something on a day nobody voted', () => {
    const r = resolveDay([0, 0, 0, 0, 0], 'empty');
    expect(r.reason).toBe('empty');
    expect(r.winnerIndex).toBeGreaterThanOrEqual(0);
    expect(r.winnerIndex).toBeLessThan(5);
  });

  it('percentages always sum to 100', () => {
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentages([0, 0, 0])).toEqual([0, 0, 0]);
    for (let i = 0; i < 500; i++) {
      const counts = simulatedCrowd(`p${i}`, 5);
      expect(percentages(counts).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe('votes and saves', () => {
  it('allows one free vote, then only ad-earned votes up to the cap', () => {
    let s = newSave('test', 0);
    expect(votesRemaining(s)).toBe(1);
    expect(canEarnAdVote(s)).toBe(false);
    s = recordVote(s, 'head_raven');
    expect(s.votes[0]!.kind).toBe('free');
    expect(votesRemaining(s)).toBe(0);
    expect(() => recordVote(s, 'head_raven')).toThrow();
    for (let i = 0; i < MAX_AD_VOTES_PER_DAY; i++) {
      expect(canEarnAdVote(s)).toBe(true);
      s = grantAdVote(s);
      s = recordVote(s, 'head_croc');
      expect(s.votes.at(-1)!.kind).toBe('ad');
    }
    expect(canEarnAdVote(s)).toBe(false);
    expect(grantAdVote(s)).toBe(s);
  });

  it('resets daily votes on a new day but keeps history and streak', () => {
    let s = recordVote(newSave('test', 0), 'head_raven');
    s = {
      ...s,
      history: { '0': { winner: 'head_raven', counts: [1, 0, 0, 0, 0], reason: 'votes' } },
    };
    s = rollToDay(s, 1);
    expect(s.votes).toEqual([]);
    expect(votesRemaining(s)).toBe(1);
    expect(s.history['0']!.winner).toBe('head_raven');
    s = recordVote(s, 'torso_bear');
    expect(s.stats.streak).toBe(2);
    s = recordVote(grantAdVote(rollToDay(s, 3)), 'arm_crab');
    expect(s.stats.streak).toBe(1);
  });

  it('remembers the music setting, defaulting to on', () => {
    expect(newSave('test', 0).musicOn).toBe(true);
    const off = setMusic(newSave('test', 0), false);
    expect(parseSave(serializeSave(off), 'test', 0).musicOn).toBe(false);
    expect(parseSave(serializeSave(off), 'test', 3).musicOn).toBe(false);
    const legacy = JSON.parse(serializeSave(newSave('test', 0))) as Record<string, unknown>;
    delete legacy['musicOn'];
    expect(parseSave(JSON.stringify(legacy), 'test', 0).musicOn).toBe(true);
  });

  it('remembers the music volume, clamped to 0..1', () => {
    expect(newSave('test', 0).musicVolume).toBe(0.5);
    const quiet = setMusicVolume(newSave('test', 0), 0.234);
    expect(quiet.musicVolume).toBe(0.23);
    expect(parseSave(serializeSave(quiet), 'test', 2).musicVolume).toBe(0.23);
    expect(setMusicVolume(quiet, 7).musicVolume).toBe(1);
    expect(setMusicVolume(quiet, -1).musicVolume).toBe(0);
    const legacy = JSON.parse(serializeSave(newSave('test', 0))) as Record<string, unknown>;
    delete legacy['musicVolume'];
    expect(parseSave(JSON.stringify(legacy), 'test', 0).musicVolume).toBe(0.5);
  });

  it('round-trips through storage and survives garbage', () => {
    const s = recordVote(newSave('test', 4), 'eye_owl');
    expect(parseSave(serializeSave(s), 'test', 4)).toEqual(s);
    expect(parseSave('{nope', 'test', 4)).toEqual(newSave('test', 4));
    expect(parseSave(serializeSave(s), 'other-season', 4)).toEqual(newSave('other-season', 4));
    expect(parseSave(serializeSave(s), 'test', 5).votes).toEqual([]);
  });
});

describe('sketchbook', () => {
  const schedule = QUESTIONS.map((q) => q.slot);

  it('keeps only real slot/option pairs', () => {
    expect(
      cleanSketch({ head: 'head_raven', torso: 'head_croc', armR: 'nope', legL: 3, x: 'eye_owl' }),
    ).toEqual({ head: 'head_raven' });
    expect(cleanSketch(null)).toEqual({});
    expect(cleanSketch(['head_raven'])).toEqual({});
  });

  it('sets and clears a part', () => {
    const s = setSketchPart({}, 'head', 'head_croc');
    expect(s).toEqual({ head: 'head_croc' });
    expect(setSketchPart(s, 'head', null)).toEqual({});
    expect(setSketchPart(s, 'torso', 'head_croc')).toEqual(s); // wrong slot is ignored
  });

  it('builds the monster from my votes, the real winners filling the gaps', () => {
    const history = {
      '0': { winner: 'head_croc', counts: [], reason: 'votes' as const },
      '1': { winner: 'torso_bear', counts: [], reason: 'votes' as const },
    };
    const s = sketchFromPicks({ '0': 'head_raven', '2': 'arm_crab' }, history, schedule);
    expect(s).toEqual({ head: 'head_raven', torso: 'torso_bear', armR: 'arm_crab' });
  });

  it('randomises every part, the same way for the same seed', () => {
    const a = randomSketch(42);
    expect(sketchSize(a)).toBe(QUESTIONS.length);
    expect(randomSketch(42)).toEqual(a);
    expect(cleanSketch(a)).toEqual(a);
  });

  it('remembers my pick per night and the sketch across saves', () => {
    let s = newSave('test', 3);
    s = recordVote(s, 'eye_owl');
    expect(s.myPicks).toEqual({ '3': 'eye_owl' });
    s = setSketch(s, { head: 'head_mummy' });
    const back = parseSave(serializeSave(s), 'test', 4);
    expect(back.myPicks).toEqual({ '3': 'eye_owl' });
    expect(back.sketch).toEqual({ head: 'head_mummy' });
  });
});
