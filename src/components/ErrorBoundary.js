import React from 'react';

// ErrorBoundary component to catch rendering errors in descendant components
// and show a friendly message instead of a raw error trace.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retries: 0, recoveryKey: 0 };
    this._autoRetryTimer = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Optionally log to an external service here
    // console.error('ErrorBoundary caught an error', error, info);
  }

  handleRetry = () => {
    // bump recoveryKey to force remount of children and reset error state
    this.setState((s) => ({ hasError: false, error: null, retries: 0, recoveryKey: s.recoveryKey + 1 }));
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  componentDidUpdate(prevProps, prevState) {
    // When an error appears, attempt automatic retries for transient failures
    const { hasError, retries } = this.state;
    const MAX_RETRIES = 3;

    if (hasError && retries < MAX_RETRIES && !this._autoRetryTimer) {
      // schedule an automatic retry with backoff
      const delay = 1000 * (retries + 1);
      this._autoRetryTimer = setTimeout(() => {
        this._autoRetryTimer = null;
        this.setState((s) => ({ retries: s.retries + 1, hasError: false, error: null, recoveryKey: s.recoveryKey + 1 }));
      }, delay);
    }
  }

  componentWillUnmount() {
    if (this._autoRetryTimer) clearTimeout(this._autoRetryTimer);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-xl text-center bg-[#0f0f0f] border border-white/5 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-6">We're sorry — an unexpected error occurred. You can try to recover below. The app will also attempt to recover automatically.</p>
            <details className="text-xs text-gray-500 text-left overflow-auto max-h-40 mb-6">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="whitespace-pre-wrap">{String(this.state.error)}</pre>
            </details>
            <div className="flex gap-3 justify-center items-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Retry
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
              >
                Go Home
              </button>
              <span className="text-sm text-gray-400 ml-3">Attempt: {this.state.retries}</span>
            </div>
          </div>
        </div>
      );
    }

    // Use a key which increments on retry to force remounting descendants
    return (
      <React.Fragment key={this.state.recoveryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
