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
    const serverMessage = error.response?.data?.message || error.response?.data?.errorMessage;
    const status = error.response?.status;
    let message = serverMessage || error.message || 'An unexpected error occurred';

    // Provide more user-friendly text for common status codes
    if (status === 401) message = 'Your session has expired. Please log in again.';
    if (status === 403) message = 'You do not have permission to perform this action.';
    if (status === 429) message = 'Too many requests. Please try again later.';

    error.userMessage = message;

    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
};

export const paymentApi = {
  initiateStkPush: (data) => api.post('/payments/stk-push', data),
  getPaymentStatus: (checkoutRequestId) => api.get(`/payments/status/${checkoutRequestId}`),
};

export const traderApi = {
  getDashboard: () => api.get('/trader/dashboard'),
  getMarketData: () => api.get('/trader/market-data'),
  placeOrder: (data) => api.post('/trader/order', data),
  stopSession: (sessionId) => api.post(`/trader/session/${sessionId}/stop`),
  resumeSession: (sessionId) => api.post(`/trader/session/${sessionId}/restart`),
  getBotPurchases: () => api.get('/trader/bot-purchases'),
  getWithdrawals: () => api.get('/trader/withdrawals'),
};

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
  getBotPurchases: (query) => api.get('/admin/bot-purchases', { params: query }),
  topUpBotPurchase: (id, amount, note) => api.post(`/admin/bot-purchase/${id}/top-up`, { amount, note }),
  markBotPurchasePaid: (id, note) => api.post(`/admin/bot-purchase/${id}/mark-paid`, { note }),
  getWithdrawals: (query) => api.get('/admin/withdrawals', { params: query }),
  advanceWithdrawal: (id, data) => api.post(`/admin/withdrawals/${id}/advance`, data),
  extendWithdrawal: (id, data) => api.post(`/admin/withdrawals/${id}/extend`, data),
  rejectWithdrawal: (id, data) => api.post(`/admin/withdrawals/${id}/reject`, data),
};

export default api;
