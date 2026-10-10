import { useEffect, useState } from 'react';
import { theme } from '../app/useMusic';
import * as run from '../sdk/run';

interface Props {
  onOpenLab: () => void;
  onClose: () => void;
}

/**
 * Hidden panel (tap the build stamp 5 times) showing what the device actually
 * sees: build, sign-in, owner check and the music pipeline. Built for testing on a
 * phone, where there are no developer tools.
 */
export function Diagnostics({ onOpenLab, onClose }: Props) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
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
    ['Owner check', d.role],
    ['Test Lab', d.lab],
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
          <h2 className="title-sm">Diagnostics</h2>
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
        <div className="lab-row">
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
          <button
            className="btn btn-ad btn-small"
            onClick={() => {
              void run.unlockLab().then(onOpenLab);
            }}
            data-testid="diag-open-lab"
          >
            Open Test Lab
          </button>
        </div>
      </div>
    </div>
  );
}
