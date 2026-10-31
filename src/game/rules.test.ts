import { describe, expect, it } from 'vitest';
import { allStitched, awakeningDue, markAwakened, seasonTotals, stormGap } from './awakening';
import { QUESTIONS, findOption } from './catalog';
import { simulatedCrowd } from './crowd';
import {
  DAY_MS,
  DAY_TIME_ZONE,
  SEASON as LIVE_SEASON,
  buildSchedule,
  closedDays,
  dayIndexAt,
  phaseAt,
  seasonSchedule,
  votingDays,
  type Season,
} from './schedule';
import LAYERS from './layers.json';
import { reminderPlan } from './reminders';
import { ordinal, pendingReveal } from './reveal';
import { cleanSketch, randomSketch, setSketchPart, sketchFromPicks, sketchSize } from './sketch';
import {
  MAX_AD_VOTES_PER_DAY,
  bonusVoteWaiting,
  canEarnAdVote,
  grantAdVote,
  markSeen,
  newSave,
  parseSave,
  recordVote,
  rememberResolved,
  rollToDay,
  serializeSave,
  setMusic,
  setMusicVolume,
  setSketch,
  votesAllowed,
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
  it('turns every day over at midnight Central time, Halloween included', () => {
    const central = new Intl.DateTimeFormat('en-US', {
      timeZone: DAY_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    for (let d = 0; d <= votingDays(LIVE_SEASON); d++)
      expect(central.format(LIVE_SEASON.startMs + d * DAY_MS), `day ${d}`).toBe('00:00');
    expect(LIVE_SEASON.startMs + votingDays(LIVE_SEASON) * DAY_MS).toBe(LIVE_SEASON.awakenMs);
  });

  it('asks 19 parts from Oct 11 to Oct 29, head first, spark last, then keeps a vigil on Oct 30', () => {
    expect(votingDays(LIVE_SEASON)).toBe(20);
    const s = seasonSchedule(LIVE_SEASON);
    expect(s).toHaveLength(19);
    expect(s[0]!.slot).toBe('head');
    expect(s[17]!.slot).toBe('brain');
    expect(s[18]!.slot).toBe('spark');
    expect(s.map((q) => q.slot)).not.toContain('jaw'); // the part dropped for the later start
    const vigil = phaseAt(LIVE_SEASON.startMs + 19 * DAY_MS + 5, LIVE_SEASON);
    expect(vigil.kind).toBe('vigil');
  });

  it('keeps the opening nights in their announced order', () => {
    const opening = ['head', 'torso', 'armR', 'legL', 'browEye', 'armL', 'legR', 'heart', 'tail'];
    expect(
      seasonSchedule(LIVE_SEASON)
        .map((q) => q.slot)
        .slice(0, opening.length),
    ).toEqual(opening);
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
    expect(votesRemaining(s)).toBe(2); // the free vote + the streak vote
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
    // A new season starts the votes afresh, but the player's own settings and Sketchbook stay.
    const mine = setSketch(setMusicVolume(setMusic({ ...s, started: true }, false), 0.3), {
      head: 'head_croc',
    });
    expect(parseSave(serializeSave(mine), 'other-season', 4)).toEqual({
      ...newSave('other-season', 4),
      started: true,
      musicOn: false,
      musicVolume: 0.3,
      sketch: { head: 'head_croc' },
    });
    expect(parseSave(serializeSave(s), 'test', 5).votes).toEqual([]);
  });

  it('survives the clock moving back a day (the switch to Central midnight)', () => {
    // Voted on night 0 and night 1 under the old clock; night 0 was already resolved.
    let s = recordVote(newSave('test', 0), 'head_raven');
    s = {
      ...s,
      history: { '0': { winner: 'head_croc', counts: [1, 0, 0, 0, 0], reason: 'votes' } },
    };
    s = recordVote(rollToDay(s, 1), 'torso_bear');
    // The new clock says it is still night 0.
    const back = parseSave(serializeSave(s), 'test', 0);
    expect(back.history).toEqual({}); // night 0 is open again: tallied afresh when it ends
    expect(back.votes).toEqual([{ optionId: 'head_raven', kind: 'free' }]); // no second free vote
    expect(votesRemaining(back)).toBe(0);
    // Night 1 comes round again: the torso vote already cast still counts as tonight's vote.
    expect(rollToDay(back, 1).votes).toEqual([{ optionId: 'torso_bear', kind: 'free' }]);
    expect(rollToDay(back, 2).votes).toEqual([]);
  });
});

describe('streak bonus', () => {
  it('gives a player who voted last night an extra vote tonight', () => {
    let s = { ...newSave('test', 2), started: true };
    expect(votesAllowed(s)).toBe(1);
    s = recordVote(s, 'eye_owl'); // night 3
    s = rollToDay(s, 3);
    expect(s.bonusVotes).toBe(1);
    expect(votesAllowed(s)).toBe(2);
    expect(bonusVoteWaiting(s)).toBe(true);
    s = recordVote(s, 'eye_owl');
    expect(bonusVoteWaiting(s)).toBe(true);
    s = recordVote(s, 'eye_owl');
    expect(s.votes.map((v) => v.kind)).toEqual(['free', 'bonus']);
    expect(s.stats.streak).toBe(2);
    expect(bonusVoteWaiting(s)).toBe(false);
    expect(votesRemaining(s)).toBe(0);
    expect(canEarnAdVote(s)).toBe(true); // ads still add up to MAX_AD_VOTES_PER_DAY more
    expect(parseSave(serializeSave(s), 'test', 3).bonusVotes).toBe(1); // same day: kept
    expect(rollToDay(s, 4).bonusVotes).toBe(1); // the streak goes on
  });

  it('gives no bonus to a player who skipped last night or never voted', () => {
    const voted2 = recordVote({ ...newSave('test', 2), started: true }, 'eye_owl');
    expect(rollToDay(voted2, 4).bonusVotes).toBe(0); // missed night 4
    expect(rollToDay({ ...newSave('test', 2), started: true }, 3).bonusVotes).toBe(0);
    expect(rollToDay(newSave('test', 0), 1).bonusVotes).toBe(0);
    // looked in on a night without voting: tomorrow brings no bonus either
    const idle = rollToDay(voted2, 3);
    expect(rollToDay({ ...idle, votes: [] }, 4).bonusVotes).toBe(0);
  });
});

describe('daily reminders', () => {
  const schedule = seasonSchedule(LIVE_SEASON);
  const at = (day: number, hour: number) => LIVE_SEASON.startMs + day * DAY_MS + hour * 3_600_000;

  it("names each night's part at 6 pm Central for the next week", () => {
    const plan = reminderPlan(at(2, 9), LIVE_SEASON, schedule, false);
    expect(plan).toHaveLength(7);
    expect(plan[0]!.atMs).toBe(at(2, 18));
    expect(plan[0]!.title).toBe(`Night 3: the ${schedule[2]!.part.toLowerCase()}`);
    expect(plan[0]!.body).toContain(schedule[2]!.prompt);
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
    expect(plan.every((r) => r.atMs - at(2, 9) <= 7 * DAY_MS)).toBe(true);
  });

  it('skips tonight once voted or past 6 pm, and ends with the vigil and the waking', () => {
    expect(reminderPlan(at(2, 9), LIVE_SEASON, schedule, true)[0]!.atMs).toBe(at(3, 18));
    expect(reminderPlan(at(2, 19), LIVE_SEASON, schedule, false)[0]!.atMs).toBe(at(3, 18));
    const end = reminderPlan(at(17, 9), LIVE_SEASON, schedule, false);
    expect(end.map((r) => r.title)).toEqual([
      `Night 18: the ${schedule[17]!.part.toLowerCase()}`,
      `Night 19: the ${schedule[18]!.part.toLowerCase()}`,
      'The vigil',
      "It's alive!",
      'Rampage day 2: The Farmlands',
      'Rampage day 3: The Market Town',
      'Rampage day 4: Graveyard Hill',
    ]);
    expect(end[3]!.atMs).toBe(LIVE_SEASON.awakenMs + 10 * 3_600_000);
    // the rampage goes on: a reminder every evening, a week ahead, wherever it is loose (the places
    // come round again: day 16 is Graveyard Hill once more)
    const later = reminderPlan(LIVE_SEASON.awakenMs + 9 * DAY_MS, LIVE_SEASON, schedule, false);
    expect(later).toHaveLength(7);
    expect(later.every((r) => r.title.startsWith('Rampage day'))).toBe(true);
    expect(later.at(-1)!.title).toBe('Rampage day 16: Graveyard Hill');
    expect(later.at(-1)!.body).toContain('daily reward');
  });

  it('mentions the streak vote only on nights it is certain', () => {
    const streak = (r: { body: string }) => r.body.includes('streak');
    // a bonus waiting tonight: tonight says so, later nights do not (the player may skip)
    expect(reminderPlan(at(2, 9), LIVE_SEASON, schedule, false, true).map(streak)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    // voted tonight: tomorrow's bonus is earned
    expect(reminderPlan(at(2, 9), LIVE_SEASON, schedule, true).map(streak).slice(0, 2)).toEqual([
      true,
      false,
    ]);
    expect(reminderPlan(at(2, 9), LIVE_SEASON, schedule, false).some(streak)).toBe(false);
  });
});

describe('awakening', () => {
  const schedule = seasonSchedule(LIVE_SEASON);
  const halloween = phaseAt(LIVE_SEASON.awakenMs + 60_000, LIVE_SEASON);
  const vigil = phaseAt(LIVE_SEASON.awakenMs - 60_000, LIVE_SEASON);
  const full = () => {
    let s = newSave(LIVE_SEASON.id, schedule.length);
    schedule.forEach((q, n) => {
      s = rememberResolved(s, n, {
        winner: q.options[0]!.id,
        counts: [3, 2, 1, 0, n === 0 ? 4 : 0],
        reason: 'votes',
      });
    });
    return s;
  };

  it('plays once, from midnight Central that begins Halloween, for every player', () => {
    const s = full();
    expect(awakeningDue(s, vigil)).toBe(false);
    expect(awakeningDue(s, halloween)).toBe(true);
    expect(awakeningDue({ ...s, started: true }, halloween)).toBe(true); // returning players too
    const seen = markAwakened(s, schedule);
    expect(awakeningDue(seen, halloween)).toBe(false);
    // kept across reloads; a new season starts it afresh
    const day = schedule.length;
    expect(parseSave(serializeSave(seen), LIVE_SEASON.id, day).sawAwakening).toBe(true);
    expect(parseSave(serializeSave(seen), 'next-season', day).sawAwakening).toBe(false);
  });

  it('leaves no stitching to reveal afterwards, and counts what went into the creature', () => {
    const s = full();
    expect(pendingReveal(s, schedule)).not.toBeNull();
    expect(pendingReveal(markAwakened(s, schedule), schedule)).toBeNull();
    expect(allStitched(s, schedule)).toBe(true);
    expect(seasonTotals(s, schedule)).toEqual({ nights: 19, votes: 19 * 6 + 4 });
    const partial = newSave(LIVE_SEASON.id, schedule.length);
    expect(allStitched(partial, schedule)).toBe(false);
    expect(seasonTotals(partial, schedule)).toEqual({ nights: 0, votes: 0 });
  });
});

describe('the vigil storm', () => {
  it('strikes more often as midnight nears, never fast enough to strobe', () => {
    const hours = [20, 5, 1, 0.2, 0.001];
    const slow = hours.map((h) => stormGap(h * 3_600_000, 1));
    for (let i = 1; i < slow.length; i++) expect(slow[i]!).toBeLessThan(slow[i - 1]!);
    for (const h of hours) {
      expect(stormGap(h * 3_600_000, 0)).toBeGreaterThanOrEqual(1200);
      expect(stormGap(h * 3_600_000, 0)).toBeLessThanOrEqual(stormGap(h * 3_600_000, 0.99));
    }
  });
});

describe('reveal', () => {
  const schedule = QUESTIONS;
  const night = (winner: string, counts: number[]) => ({
    winner,
    counts,
    reason: 'votes' as const,
  });

  it("shows the latest stitching the player hasn't seen, with how their pick placed", () => {
    let s = newSave('test', 3);
    s = {
      ...s,
      history: {
        '0': night('head_croc', [1, 0, 9, 0, 0]),
        '1': night('torso_bear', [0, 0, 0, 0, 5]),
        '2': night('arm_crab', [3, 2, 10, 0, 5]),
      },
      myPicks: { '2': 'arm_skeleton' },
      seenNight: 0,
    };
    const r = pendingReveal(s, schedule)!;
    expect(r.night).toBe(2);
    expect(r.winner).toBe('arm_crab');
    expect(r.total).toBe(20);
    expect(r.share).toBe(50);
    expect(r.myPick).toBe('arm_skeleton');
    expect(r.myPlace).toBe(5);
    expect(r.missed).toBe(1); // night 1 went by unseen too
    expect(ordinal(r.myPlace!)).toBe('5th');
    expect(pendingReveal(markSeen(s, 2), schedule)).toBeNull();
    expect(markSeen(markSeen(s, 2), 1).seenNight).toBe(2); // never goes backwards
  });

  it('places a winning pick first and a tie lost on the tie-break second', () => {
    const base = { ...newSave('test', 1), seenNight: -1 };
    const won = { ...base, history: { '0': night('head_raven', [0, 0, 4, 4, 0]) } };
    expect(pendingReveal({ ...won, myPicks: { '0': 'head_raven' } }, schedule)!.myPlace).toBe(1);
    const tied = { ...won, myPicks: { '0': schedule[0]!.options[3]!.id } };
    expect(pendingReveal(tied, schedule)!.myPlace).toBe(2);
    expect(pendingReveal({ ...won, myPicks: {} }, schedule)!.myPick).toBeNull();
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
    const slots = seasonSchedule(LIVE_SEASON).map((q) => q.slot);
    const a = randomSketch(42, slots);
    expect(sketchSize(a)).toBe(slots.length);
    expect(a.jaw).toBeUndefined(); // only this season's parts
    expect(randomSketch(42, slots)).toEqual(a);
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
