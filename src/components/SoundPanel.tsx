interface Props {
  on: boolean;
  volume: number;
  onToggle: () => void;
  onVolume: (v: number) => void;
  onClose: () => void;
}

/** Drop-down under the top bar: music on/off and a volume slider. */
export function SoundPanel({ on, volume, onToggle, onVolume, onClose }: Props) {
  const pct = Math.round(volume * 100);
  return (
    <>
      <div className="sound-scrim" onClick={onClose} />
      <div className="sound-panel panel" role="dialog" aria-label="Sound settings">
        <div className="sound-row">
          <span className="sound-label">Music</span>
          <button
            className={`btn btn-small ${on ? 'btn-ad' : 'btn-secondary'}`}
            aria-pressed={on}
            onClick={onToggle}
            data-testid="music-toggle"
          >
            {on ? 'On' : 'Off'}
          </button>
        </div>
        <label className="sound-row">
          <span className="sound-label">Volume</span>
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            disabled={!on}
            onChange={(e) => onVolume(Number(e.target.value) / 100)}
            aria-label="Music volume"
            aria-valuetext={`${pct}%`}
            data-testid="music-volume"
          />
          <span className="sound-pct">{pct}%</span>
        </label>
        <p className="muted small">Theme: "The Assembly"</p>
      </div>
    </>
  );
}
