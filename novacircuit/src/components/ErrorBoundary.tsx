import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[NovaCircuit] Unhandled error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-[#0b0b10] text-gray-200">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-900/30 border border-red-700/50
              flex items-center justify-center">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">Something went wrong</h1>
            <p className="text-sm text-slate-400">
              NovaCircuit encountered an unexpected error. Your work may have been auto-saved.
            </p>
            {this.state.errorMessage && (
              <pre className="text-xs text-red-400 bg-red-900/10 border border-red-800/30
                rounded px-4 py-3 text-left w-full overflow-auto max-h-32 font-mono">
                {this.state.errorMessage}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="
                flex items-center gap-2 px-4 py-2 rounded-lg
                bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold
                transition-colors
              "
            >
              <RefreshCw size={14} />
              Reload NovaCircuit
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
