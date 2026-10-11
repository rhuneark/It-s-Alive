import { useMemo, useState } from 'react';
import { questionForSlot, type SlotId } from '../game/catalog';
import { BASE_OF } from '../game/layout';
import {
  randomSketch,
  setSketchPart,
  sketchFromPicks,
  sketchSize,
  type Parts,
} from '../game/sketch';
import type { ResolvedDay } from '../game/state';
import { Monster, iconUrl } from './Monster';

interface Props {
  /** The player's saved design, or null the first time. */
  sketch: Parts | null;
  /** The real monster so far (tonight's winners). */
  real: Parts;
  myPicks: Record<string, string>;
  history: Record<string, ResolvedDay>;
  /** The slot voted on each night, in order. */
  schedule: readonly SlotId[];
  onChange: (sketch: Parts) => void;
  onClose: () => void;
}

/**
 * A private sandbox: pick any option for any part and see the creature it makes.
 * Nothing here is a vote; the design is only kept for this player.
 */
export function Sketchbook({ sketch, real, myPicks, history, schedule, onChange, onClose }: Props) {
  const [design, setDesign] = useState<Parts>(() => sketch ?? real);
  const [slot, setSlot] = useState<SlotId>(schedule[0] ?? 'head');
  const question = questionForSlot(slot);
  const baseSlot = BASE_OF[slot];
  const needsBase = baseSlot && !design[baseSlot] ? questionForSlot(baseSlot).part : null;
  const havePicks = Object.keys(myPicks).length > 0;
  const nights = useMemo(() => schedule.map((s, day) => ({ slot: s, day })), [schedule]);

  const apply = (next: Parts) => {
    setDesign(next);
    onChange(next);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal sketchbook"
        role="dialog"
        aria-modal="true"
        aria-label="Sketchbook"
        onClick={(e) => e.stopPropagation()}
        data-testid="sketchbook"
      >
        <div className="modal-head">
          <h2 className="title-sm">Sketchbook</h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          Try any part and see the creature it makes. Nothing here is a vote.
        </p>

        <div className="sketch-stage">
          <Monster
            parts={design}
            spark={design.spark ?? null}
            nextSlot={design[slot] ? null : slot}
            className="sketch-monster"
          />
        </div>

        <div className="sketch-parts" role="tablist" aria-label="Parts">
          {nights.map(({ slot: s, day }) => (
            <button
              key={s}
              role="tab"
              aria-selected={s === slot}
              className={`sketch-part ${s === slot ? 'active' : ''} ${design[s] ? 'filled' : ''}`}
              onClick={() => setSlot(s)}
              data-sketch-part={s}
            >
              <span className="sketch-night">{day + 1}</span> {questionForSlot(s).part}
            </button>
          ))}
        </div>

        <p className="eyebrow">
          Night {schedule.indexOf(slot) + 1} · {question.part}
        </p>
        {needsBase ? (
          <p className="notice">Choose a {needsBase.toLowerCase()} first: this part grows on it.</p>
        ) : (
          <div className="sketch-options" role="radiogroup" aria-label={question.prompt}>
            {question.options.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={design[slot] === o.id}
                className={`sketch-option ${design[slot] === o.id ? 'selected' : ''}`}
                onClick={() => apply(setSketchPart(design, slot, o.id))}
                data-sketch-option={o.id}
              >
                <img src={iconUrl(slot, o.id, design)} alt="" draggable={false} />
                <span>{o.name}</span>
              </button>
            ))}
            <button
              role="radio"
              aria-checked={!design[slot]}
              className={`sketch-option ${!design[slot] ? 'selected' : ''}`}
              onClick={() => apply(setSketchPart(design, slot, null))}
              data-sketch-option="none"
            >
              <span className="sketch-none">∅</span>
              <span>{slot === 'spark' ? 'No spark' : 'Leave it bare'}</span>
            </button>
          </div>
        )}

        <div className="sketch-actions">
          <button
            className="btn btn-secondary btn-small"
            onClick={() => apply(real)}
            data-testid="sketch-tonight"
          >
            Tonight's monster
          </button>
          <button
            className="btn btn-secondary btn-small"
            disabled={!havePicks}
            onClick={() => apply(sketchFromPicks(myPicks, history, schedule))}
            data-testid="sketch-mine"
          >
            My votes
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => apply(randomSketch(Date.now() >>> 0, schedule))}
            data-testid="sketch-random"
          >
            Random
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => apply({})}
            data-testid="sketch-clear"
          >
            Bare husk
          </button>
        </div>
        <p className="muted small center-text">
          {sketchSize(design)} of {schedule.length} parts
          {havePicks ? '' : ' · vote tonight to unlock “My votes”'}
        </p>
      </div>
    </div>
  );
}
