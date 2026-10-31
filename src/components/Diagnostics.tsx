import { useEffect, useRef, useState } from 'react';
import { theme } from '../app/useMusic';
import * as run from '../sdk/run';

interface Props {
  /** Owner test mode: the day it pretends to be (null when off). */
  preview: number | null;
  onPreview: (day: number | null) => void;
  onClose: () => void;
}

/** Test mode's jumps: the vigil, the waking, and a few days of the rampage. */
const JUMPS: Array<[day: number, label: string]> = [
  [19, 'The vigil (the storm)'],
  [20, 'Halloween: it wakes'],
  [21, 'Rampage day 2: the Farmlands'],
  [22, 'Rampage day 3: the Market Town'],
  [25, 'Rampage day 6: the City'],
];

/**
 * Hidden panel (tap the build stamp 5 times) showing what the device actually
 * sees: build, sign-in and the music pipeline. Built for testing on a
 * phone, where there are no developer tools.
 */
export function Diagnostics({ preview, onPreview, onClose }: Props) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  // Test mode is for the game's owner (see run.canPreview); the check's answer is shown below.
  const [access, setAccess] = useState<run.PreviewAccess>({ allowed: false, detail: 'checking…' });
  const check = () => void run.canPreview().then(setAccess);
  useEffect(check, []);
  // Last resort when RUN can't confirm the owner: tap the title 5 times.
  const titleTaps = useRef<number[]>([]);
  const tapTitle = () => {
    const now = Date.now();
    titleTaps.current = [...titleTaps.current.filter((t) => now - t < 3000), now];
    if (titleTaps.current.length >= 5) {
      titleTaps.current = [];
      run.unlockPreview();
      check();
    }
  };
  const owner = access.allowed;
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const d = run.diagnostics();
  const m = theme.diagnostics();
  const rows: Array<[string, string]> = [
    ['Build', __BUILD__],
    ['Local dev mode', d.mock ? 'yes' : 'no'],
    ['Signed in', d.signedIn],
    ['Account', d.user],
    ['Owner check', access.detail],
    ['Music file', m.source],
    ['Music player', m.element],
    ['Audio output', `${m.context}${m.routed ? ', volume control on' : ''}`],
    ['Last music error', m.lastError],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Diagnostics"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="title-sm" onClick={tapTitle} data-testid="diag-title">
            Diagnostics
          </h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="diag" data-testid="diagnostics">
          {rows.map(([k, v]) => (
            <div key={k} className="diag-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="diag-actions">
          {d.signedIn.startsWith('no') && (
            <button
              className="btn btn-primary btn-small"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void run.signIn().finally(() => setBusy(false));
              }}
            >
              Sign in
            </button>
          )}
          <button
            className="btn btn-secondary btn-small"
            onClick={() => {
              theme.prefetch();
              theme.unlock();
            }}
          >
            Try music again
          </button>
        </div>
        {owner && (
          <section className="diag-test" data-testid="test-mode">
            <p className="eyebrow">Test mode (owner only)</p>
            <p className="muted small">
              Jump to another day on this device, from a fresh throwaway save. It is the real
              creature, but nothing you do counts: no votes, no rubble, no reminders.
            </p>
            <div className="diag-actions">
              {JUMPS.map(([day, label]) => (
                <button
                  key={day}
                  className="btn btn-secondary btn-small"
                  onClick={() => onPreview(day)}
                  data-testid={`preview-${day}`}
                >
                  {label}
                </button>
              ))}
              {preview !== null && (
                <button className="btn btn-primary btn-small" onClick={() => onPreview(null)}>
                  Exit test mode
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
