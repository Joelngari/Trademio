import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext.js';
import App from './App.js';
import { ErrorProvider } from './contexts/ErrorContext.js';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorProvider>
          <App />
        </ErrorProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
