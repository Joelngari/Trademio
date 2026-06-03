// API helper: axios instance with auth token injection and
// response normalization so UI shows friendly error messages.
import axios from 'axios';
import { auth } from '../lib/firebase.js';

const api = axios.create({
  baseURL: '/api'
});

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalize error responses so frontend components receive friendly error messages.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error.response?.data?.message;
    const status = error.response?.status;
    let message = serverMessage || error.message || 'An unexpected error occurred';

    // Provide more user-friendly text for common status codes
    if (status === 401) message = 'Your session has expired. Please log in again.';
    if (status === 403) message = 'You do not have permission to perform this action.';
    if (status === 429) message = 'Too many requests. Please try again later.';

      // If a global error UI is available, show the message
      try {
        if (typeof window !== 'undefined' && window.showAppError) window.showAppError(message);
      } catch (e) {
        // ignore
      }

      return Promise.reject(new Error(message));
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
};

export const paymentApi = {
  initiateStkPush: (data) => api.post('/payments/stk-push', data),
};

export const traderApi = {
  getDashboard: () => api.get('/trader/dashboard'),
  getMarketData: () => api.get('/trader/market-data'),
  placeOrder: (data) => api.post('/trader/order', data)
};

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
};

export default api;
