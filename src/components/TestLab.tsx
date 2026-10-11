import { SEASON, buildSchedule, votingDays } from '../game/schedule';
import type { LabState } from '../sdk/run';

const SCHEDULE = buildSchedule(votingDays(SEASON));
const HALLOWEEN = votingDays(SEASON);
/** The day after the last vote, when there are fewer parts than days (null when there is none). */
const VIGIL = SCHEDULE.length < HALLOWEEN ? SCHEDULE.length : null;
const BEFORE_LAUNCH = -1;

interface Props {
  lab: LabState;
  onApply: (next: LabState) => void;
  onRefill: () => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * Owner-only test controls. Test mode runs on a private save with fake crowd
 * votes, so nothing here reaches real players or the real tallies.
 */
export function TestLab({ lab, onApply, onRefill, onReset, onClose }: Props) {
  const jump = (day: number | null) => onApply({ on: true, day });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal lab"
        role="dialog"
        aria-modal="true"
        aria-label="Test Lab"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="title-sm">Test Lab</h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="small">
          Only you can see this. In test mode the votes and results are <b>fake and private</b>:
          real players' tallies and your real save are never touched.
        </p>

        {!lab.on ? (
          <button
            className="btn btn-primary btn-wide"
            onClick={() => jump(null)}
            data-testid="lab-start"
          >
            Start test mode
          </button>
        ) : (
          <div className="lab-body">
            <p className="eyebrow">Pretend it is…</p>
            <div className="lab-grid" role="group" aria-label="Jump to a night">
              {SCHEDULE.map((q, day) => (
                <button
                  key={q.slot}
                  className={`btn btn-secondary lab-night ${lab.day === day ? 'current' : ''}`}
                  onClick={() => jump(day)}
                  aria-label={`Night ${day + 1}: ${q.part}`}
                  aria-pressed={lab.day === day}
                  data-testid={`lab-night-${day + 1}`}
                >
                  {day + 1}
                </button>
              ))}
            </div>
            <div className="lab-row">
              <button
                className={`btn btn-secondary btn-small ${lab.day === BEFORE_LAUNCH ? 'current' : ''}`}
                onClick={() => jump(BEFORE_LAUNCH)}
              >
                Before launch
              </button>
              {VIGIL !== null && (
                <button
                  className={`btn btn-secondary btn-small ${lab.day === VIGIL ? 'current' : ''}`}
                  onClick={() => jump(VIGIL)}
                  data-testid="lab-vigil"
                >
                  Vigil
                </button>
              )}
              <button
                className={`btn btn-secondary btn-small ${lab.day === HALLOWEEN ? 'current' : ''}`}
                onClick={() => jump(HALLOWEEN)}
                data-testid="lab-halloween"
              >
                Halloween
              </button>
              <button
                className={`btn btn-secondary btn-small ${lab.day === null ? 'current' : ''}`}
                onClick={() => jump(null)}
              >
                Today
              </button>
            </div>
            {lab.day !== null && lab.day >= 0 && lab.day < SCHEDULE.length - 1 && (
              <button
                className="btn btn-primary btn-wide"
                onClick={() => jump((lab.day ?? 0) + 1)}
                data-testid="lab-next"
              >
                Next night ▸
              </button>
            )}
            <button className="btn btn-ad btn-wide" onClick={onRefill} data-testid="lab-refill">
              Refill tonight's votes
            </button>
            <div className="lab-row">
              <button className="btn btn-secondary btn-small" onClick={onReset}>
                Wipe test progress
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => onApply({ on: false, day: null })}
                data-testid="lab-exit"
              >
                Leave test mode
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
