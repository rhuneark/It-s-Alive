import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render errors and offers a reload instead of a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen center">
        <h2 className="title-sm">The experiment failed</h2>
        <p className="muted">{this.state.error.message || 'Something went wrong.'}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }
}
