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

export const authApi = {
  register: (data) => api.post('/auth/register', data),
};

export const paymentApi = {
  initiateStkPush: (data) => api.post('/payments/stk-push', data),
};

export const traderApi = {
  getDashboard: () => api.get('/trader/dashboard'),
};

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
};

export default api;
