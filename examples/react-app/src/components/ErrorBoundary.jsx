import React from 'react';

/** Keeps a crashing page from taking down the shell. */
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    navigator.sendBeacon('/api/v2/client-errors', JSON.stringify({ message: error.message, stack: info.componentStack }));
  }

  render() {
    if (this.state.error) return <div className="error-screen">Something broke: {this.state.error.message}</div>;
    return this.props.children;
  }
}
