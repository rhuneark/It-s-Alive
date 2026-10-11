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

/** Music on/off and volume in one row, for the title screen. */
export function MusicBar({ on, volume, onToggle, onVolume }: Omit<Props, 'onClose'>) {
  const pct = Math.round(volume * 100);
  return (
    <div className="music-bar" role="group" aria-label="Music">
      <button
        className={`btn btn-icon ${on ? 'btn-ad' : 'btn-secondary muted-icon'}`}
        aria-pressed={on}
        aria-label={on ? 'Music on (tap to turn off)' : 'Music off (tap to turn on)'}
        onClick={onToggle}
        data-testid="title-music-toggle"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
          <path d="M9 4.5 20 2v13.2a3 3 0 1 1-2-2.83V6.6l-7 1.6v9a3 3 0 1 1-2-2.83Z" />
        </svg>
      </button>
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
        data-testid="title-music-volume"
      />
      <span className="sound-pct">{on ? `${pct}%` : 'Off'}</span>
    </div>
  );
}
