import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PCB Canvas Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-[#1e1e24] text-white p-6 rounded-lg border border-rose-500/30">
          <div className="bg-rose-500/10 p-4 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Rendering Error</h2>
          <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
            The workspace encountered an unexpected graphics error. Your board state is safely preserved.
          </p>
          <div className="bg-black/40 p-4 rounded-md w-full max-w-lg mb-6 overflow-auto text-xs font-mono text-rose-300 border border-black max-h-32">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md font-medium transition-colors"
          >
            Reload Canvas
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
