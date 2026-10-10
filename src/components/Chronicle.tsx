import { findOption } from '../game/catalog';
import { SEASON, buildSchedule, votingDays } from '../game/schedule';
import type { SaveState } from '../game/state';
import { percentages } from '../game/tally';
import { iconUrl } from './Monster';

const SCHEDULE = buildSchedule(votingDays(SEASON));

interface Props {
  save: SaveState;
  today: number;
  onClose: () => void;
}

function nightDate(day: number): string {
  const d = new Date(SEASON.startMs + day * 86_400_000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Night-by-night record of which part won and by how much. */
export function Chronicle({ save, today, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="The Chronicle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="title-sm">The Chronicle</h2>
          <button
            className="btn btn-secondary btn-small"
            onClick={onClose}
            aria-label="Close chronicle"
          >
            Close
          </button>
        </div>
        <ol className="chronicle">
          {SCHEDULE.map((q, day) => {
            const r = save.history[String(day)];
            const winner = r ? findOption(r.winner)?.option : undefined;
            const idx = r ? q.options.findIndex((o) => o.id === r.winner) : -1;
            const pct = r && idx >= 0 ? percentages(r.counts)[idx] : 0;
            const state = r ? 'done' : day === today ? 'now' : day < today ? 'pending' : 'future';
            return (
              <li key={q.slot} className={`chron chron-${state}`}>
                <span className="chron-art">
                  {winner && <img src={iconUrl(winner.id)} alt="" />}
                </span>
                <span className="chron-text">
                  <span className="chron-day">
                    Night {day + 1} · {nightDate(day)} · {q.part}
                  </span>
                  <span className="chron-name">
                    {winner
                      ? winner.name
                      : state === 'now'
                        ? 'Voting tonight…'
                        : state === 'pending'
                          ? 'Counting…'
                          : '???'}
                  </span>
                  {r && (
                    <span className="chron-note">
                      {r.reason === 'empty'
                        ? 'No one voted. The monster chose for itself.'
                        : `${pct}% of ${r.counts.reduce((a, b) => a + b, 0)} votes${r.reason === 'tie' ? ' (tie broken by fate)' : ''}`}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted center-text small">Halloween: it wakes.</p>
      </div>
    </div>
  );
}
