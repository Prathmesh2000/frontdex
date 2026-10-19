'use client';
import React from 'react';
import { Button } from '@/components/ui';

interface ErrorBoundaryProps { children: React.ReactNode; fallbackTitle?: string }
interface ErrorBoundaryState { error: Error | null }

/** Catches render errors in the admin area and reports them. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    fetch('/api/errors', { method: 'POST', body: JSON.stringify({ message: error.message, stack: info.componentStack }) });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="error-panel">
        <h2>{this.props.fallbackTitle ?? 'Something went wrong'}</h2>
        <pre>{this.state.error.message}</pre>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
