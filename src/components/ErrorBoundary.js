import React from 'react';

// ErrorBoundary component to catch rendering errors in descendant components
// and show a friendly message instead of a raw error trace.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Optionally log to an external service here
    // console.error('ErrorBoundary caught an error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-xl text-center bg-[#0f0f0f] border border-white/5 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-4">We're sorry — an unexpected error occurred. Please refresh the page or contact support if the problem persists.</p>
            <details className="text-xs text-gray-500 text-left overflow-auto max-h-40">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="whitespace-pre-wrap">{String(this.state.error)}</pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
