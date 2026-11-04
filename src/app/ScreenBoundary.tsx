import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface State {
  failed: boolean;
}

/**
 * Catches a screen that crashed while drawing the document (a value it did not expect) so the
 * rest of the shell, including the store banner above it, stays on screen. It resets when `key`
 * changes, so going to another screen tries again.
 */
export class ScreenBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A screen failed to draw.', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="screen" role="alert">
        <h1>This screen could not be shown</h1>
        <p>
          Something in the household data is not what this version expects. The rest of the app
          still works.
        </p>
        <p>
          <Link to="/app/more/settings" className="button">
            Go to settings
          </Link>
        </p>
      </section>
    );
  }
}
