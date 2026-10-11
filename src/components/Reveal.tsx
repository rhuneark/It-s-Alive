import { findOption } from '../game/catalog';
import { ordinal, type Reveal as RevealData } from '../game/reveal';
import type { Phase } from '../game/schedule';
import type { SlotId } from '../game/catalog';
import { Monster } from './Monster';

interface Props {
  reveal: RevealData;
  parts: Partial<Record<SlotId, string>>;
  phase: Phase;
  onChronicle: () => void;
  onClose: () => void;
}

const nameOf = (id: string | null) => (id ? (findOption(id)?.option.name ?? id) : '');

/**
 * What a returning player sees first: the part stitched on while they were away,
 * glowing on the creature, how the village voted and how their own pick fared.
 */
export function Reveal({ reveal, parts, phase, onChronicle, onClose }: Props) {
  const { night, question, winner, share, total, reason, myPick, myPlace, missed } = reveal;
  const won = myPick === winner;
  const how =
    reason === 'empty'
      ? 'No votes were cast, so fate chose.'
      : reason === 'tie'
        ? `A tie at ${share}% each, settled by a coin of bone.`
        : `${share}% of ${total} vote${total === 1 ? '' : 's'}.`;
  return (
    <div className="modal-backdrop reveal-backdrop" onClick={onClose}>
      <div
        className="modal reveal"
        role="dialog"
        aria-modal="true"
        aria-label="Last night's stitching"
        onClick={(e) => e.stopPropagation()}
        data-testid="reveal"
      >
        <p className="eyebrow center-text">
          Night {night + 1} · {question.part}
        </p>
        <h2 className="title-sm center-text">The stitching is done</h2>
        <Monster
          parts={parts}
          spark={parts.spark ?? null}
          fresh={question.slot}
          className="reveal-monster"
        />
        <p className="reveal-winner center-text">
          The village chose <b>{nameOf(winner)}</b>
        </p>
        <p className="muted center-text">{how}</p>
        {myPick ? (
          <p className={`reveal-mine ${won ? 'won' : ''}`} data-testid="reveal-mine">
            {won
              ? 'Your pick won. It is part of the creature now.'
              : `You voted ${nameOf(myPick)}${myPlace ? `: it came ${ordinal(myPlace)}` : ''}.`}
          </p>
        ) : (
          <p className="reveal-mine">You did not vote that night.</p>
        )}
        {missed > 0 && (
          <button className="btn btn-secondary btn-small" onClick={onChronicle}>
            +{missed} more night{missed === 1 ? '' : 's'} while you were away
          </button>
        )}
        <button className="btn btn-primary btn-wide" onClick={onClose} data-testid="reveal-close">
          {phase.kind === 'voting'
            ? `Tonight: the ${phase.question.part.toLowerCase()}`
            : 'Back to the slab'}
        </button>
      </div>
    </div>
  );
}
