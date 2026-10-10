import type { PartOption, Question, SlotId } from '../game/catalog';
import { leaderIndex, percentages } from '../game/tally';
import type { CastVote } from '../game/state';
import { Monster, iconUrl } from './Monster';

interface OptionGridProps {
  question: Question;
  /** Parts stitched so far, for the per-option preview. */
  parts: Partial<Record<SlotId, string>>;
  selected: string | null;
  myVotes: CastVote[];
  disabled?: boolean;
  onSelect: (id: string) => void;
}

/** The five candidate parts. Tapping one previews it on the monster. */
export function OptionGrid({
  question,
  parts,
  selected,
  myVotes,
  disabled,
  onSelect,
}: OptionGridProps) {
  return (
    <div className="options" role="radiogroup" aria-label={question.prompt}>
      {question.options.map((o) => {
        const mine = myVotes.filter((v) => v.optionId === o.id).length;
        const isSel = selected === o.id;
        return (
          <button
            key={o.id}
            className={`option ${isSel ? 'selected' : ''}`}
            role="radio"
            aria-checked={isSel}
            disabled={disabled}
            onClick={() => onSelect(o.id)}
            data-option={o.id}
          >
            <span className="option-art">
              <img src={iconUrl(o.id)} alt="" draggable={false} />
            </span>
            <span className="option-text">
              <span className="option-name">{o.name}</span>
              <span className="option-blurb">{o.blurb}</span>
              {mine > 0 && <span className="chip">Your vote{mine > 1 ? ` ×${mine}` : ''}</span>}
            </span>
            <Monster parts={parts} preview={{ slot: question.slot, id: o.id }} mini />
          </button>
        );
      })}
    </div>
  );
}

interface ResultsProps {
  question: Question;
  counts: number[] | null;
  loading: boolean;
  myVotes: CastVote[];
  onRefresh: () => void;
}

/** Revealed only after voting: each option's share of tonight's votes. */
export function Results({ question, counts, loading, myVotes, onRefresh }: ResultsProps) {
  if (!counts) {
    return (
      <div className="results">
        <p className="muted center-text">
          {loading ? 'Counting the votes by candlelight…' : 'The tally is hidden in fog.'}
        </p>
        {!loading && (
          <button className="btn btn-secondary btn-small" onClick={onRefresh}>
            Try again
          </button>
        )}
      </div>
    );
  }
  const pcts = percentages(counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const lead = leaderIndex(counts);
  return (
    <div className="results" aria-live="polite">
      {question.options.map((o: PartOption, i) => {
        const mine = myVotes.filter((v) => v.optionId === o.id).length;
        return (
          <div
            key={o.id}
            className={`result ${i === lead ? 'leading' : ''} ${mine ? 'mine' : ''}`}
            data-result={o.id}
          >
            <img className="result-art" src={iconUrl(o.id)} alt="" draggable={false} />
            <div className="result-main">
              <div className="result-label">
                <span className="result-name">{o.name}</span>
                <span className="result-pct">{pcts[i]}%</span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${pcts[i]}%` }} />
              </div>
              <div className="result-tags">
                {i === lead && <span className="chip chip-gold">Leading</span>}
                {mine > 0 && <span className="chip">Your vote{mine > 1 ? ` ×${mine}` : ''}</span>}
                <span className="result-count">
                  {counts[i]} vote{counts[i] === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="results-foot">
        <span className="muted">
          {total} vote{total === 1 ? '' : 's'} cast tonight
        </span>
        <button className="btn btn-secondary btn-small" onClick={onRefresh} disabled={loading}>
          {loading ? 'Counting…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
