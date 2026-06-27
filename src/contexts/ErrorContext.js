import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ErrorContext = createContext(null);

export function useError() {
  return useContext(ErrorContext);
}

export function ErrorProvider({ children }) {
  const [error, setError] = useState(null);

  const showError = useCallback((message) => {
    setError(typeof message === 'string' ? message : String(message));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    // Expose a global helper so non-React modules (api) can trigger the banner
    window.showAppError = (msg) => showError(msg);

    const onUnhandledRejection = (ev) => {
      // Silenced to prevent non-critical background promise rejections from showing red banners
    };

    const onError = (ev) => {
      // Silenced to prevent silent browser rendering/extension errors from showing red banners
    };

    return () => {
      window.showAppError = undefined;
    };
  }, [showError]);

  return (
    <ErrorContext.Provider value={{ error, showError, clearError }}>
      {children}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 max-w-lg">
          <div className="bg-red-600 text-white rounded shadow-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-bold">Error</div>
                <div className="text-sm mt-1">{error}</div>
              </div>
              <button onClick={clearError} className="text-white/80 hover:text-white">Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </ErrorContext.Provider>
  );
}

export default ErrorContext;
