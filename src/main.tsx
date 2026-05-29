import React, { Component, ErrorInfo, ReactNode } from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  declare props: { children: ReactNode };
  declare state: { error: Error | null };
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React crash:', error, info);
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ background: '#0a0a0a', color: '#f87171', minHeight: '100vh', padding: '2rem', fontFamily: 'monospace' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 16 }}>
              NovaCircuit — Runtime Error
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{err.message}</h1>
            <pre style={{ fontSize: 11, color: '#f59e0b', background: '#111', padding: '1rem', borderRadius: 8, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {err.stack}
            </pre>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              style={{ marginTop: 16, padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
            >
              Clear Cache &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
