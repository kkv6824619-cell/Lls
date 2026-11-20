import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected studio error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('KathaVani ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09080A] text-[#F5F0E6] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#17141B] border border-[#2A2431] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#F29F05]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="font-display text-lg font-semibold">Studio Recovery Needed</h2>
            </div>
            <p className="text-sm text-[#B5AC9E] leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
