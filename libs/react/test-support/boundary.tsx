import { Component, type ReactNode } from 'react';

/** A plain error boundary for tests: renders the caught error's message. */
export class Boundary extends Component<
  { children?: ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error !== null)
      return <p role="alert">{(this.state.error as Error).message}</p>;
    return this.props.children;
  }
}
