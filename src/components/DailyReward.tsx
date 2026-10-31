import { REWARD_BASE, rewardFor } from '../game/daily';
import { big } from '../game/numbers';

/**
 * Coming back pays: once a day a reward of rubble for the upgrades waits on the home screen,
 * bigger each day of a streak along a 7-day track; miss a day and it starts over (daily.ts).
 */
export function DailyReward({
  streak,
  best,
  onClaim,
}: {
  /** The streak claiming today's reward makes (1 = day one). */
  streak: number;
  best: number;
  onClaim: () => void;
}) {
  const week = REWARD_BASE.length;
  // where today falls on the 7-day track, and the track's first day's streak number
  const at = (streak - 1) % week;
  const first = streak - at;
  return (
    <div className="sheet-backdrop daily-backdrop">
      <section
        className="sheet daily"
        role="dialog"
        aria-modal="true"
        aria-label="Daily reward"
        data-testid="daily-reward"
      >
        <p className="story-day">{streak > 1 ? `${streak} days in a row` : 'Welcome back'}</p>
        <h3>Your daily reward</h3>
        <ol className="daily-track" aria-label={`Day ${at + 1} of ${week}`}>
          {Array.from({ length: week }, (_, i) => (
            <li key={i} className={i < at ? 'got' : i === at ? 'today' : ''}>
              {i < at ? '✓' : i + 1}
            </li>
          ))}
        </ol>
        <p className="daily-line">
          Today <b>+{big(rewardFor(streak, best))}</b> · tomorrow{' '}
          <b>+{big(rewardFor(streak + 1, best))}</b> · day {week}{' '}
          <b>+{big(rewardFor(first + week - 1, best))}</b>
        </p>
        <button className="btn btn-primary btn-wide" onClick={onClaim} data-testid="daily-claim">
          Claim {big(rewardFor(streak, best))} rubble
        </button>
        <p className="daily-note">
          Rubble buys story upgrades. Come back every day: miss one and the streak starts over.
        </p>
      </section>
    </div>
  );
}
