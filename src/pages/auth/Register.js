import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { auth, db } from '../../lib/firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { authApi } from '../../services/api.js';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    phoneNumber: '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const rawReferral = searchParams.get('ref');
    const referralCode = rawReferral && rawReferral !== 'undefined' ? rawReferral : 'VELNIX-ADMIN';

    try {
      // Use backend for registration to handle unique username and referral link
      await authApi.register({ ...formData, referralCode });
      
      // Auto login after registration
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      navigate('/trader/home');
    } catch (err) {
      // Prefer normalized user-facing message set by `api` interceptor
      const serverMessage = err.userMessage || err.response?.data?.message || err.response?.data?.error || err.response?.data?.errors || err.message;

      // Helper: try to extract JSON blob embedded in a string
      const extractJson = (text) => {
        if (!text || typeof text !== 'string') return null;
        // attempt to find a {...} block
        const match = text.match(/(\{[\s\S]*\})/);
        if (!match) return null;
        try {
          // replace single-quoted keys/values and escaped quotes if needed
          const candidate = match[1].replace(/\"/g, '"');
          return JSON.parse(candidate);
        } catch (_) {
          return null;
        }
      };

      const sanitize = (raw) => {
        if (!raw) return '';
        if (Array.isArray(raw)) return raw.map((r) => (typeof r === 'string' ? r : r.message || JSON.stringify(r))).join('; ');
        if (typeof raw === 'object') {
          if (raw.message) return raw.message;
          if (raw.errors) {
            const errs = Array.isArray(raw.errors) ? raw.errors : Object.values(raw.errors || {});
            return errs.map((e) => (e.message ? e.message : e)).join('; ');
          }
          return JSON.stringify(raw);
        }

        // It's a string. Remove any trailing raw JSON the backend may have appended.
        let text = String(raw);
        // If backend includes a 'Raw server response' marker, take the part before it
        const marker = 'Raw server response';
        const idx = text.indexOf(marker);
        if (idx !== -1) text = text.slice(0, idx).trim();

        // If there's embedded JSON, try to parse and extract message/errors
        const parsed = extractJson(String(raw));
        if (parsed) {
          if (parsed.message) return parsed.message;
          if (parsed.errors) {
            const errs = Array.isArray(parsed.errors) ? parsed.errors : Object.values(parsed.errors || {});
            return errs.map((e) => (e.message ? e.message : e)).join('; ');
          }
        }

        // fallback to trimmed text
        return text;
      };

      const friendly = sanitize(serverMessage) || 'Registration failed';
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121212] border border-white/5 rounded p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#87ceeb]/20" />
        
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] border-2 border-[#ffd700] rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-[#ffd700]">VM</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Join Velnix Markets</h1>
          <p className="text-gray-400 text-sm">Kenyan trading & investment platform</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Full Name</label>
            <input
              type="text"
              name="fullName"
              required
              value={formData.fullName}
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="John Doe"
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Username</label>
            <input
              type="text"
              name="username"
              required
              minLength={5}
              value={formData.username}
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="johndoe_trader"
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Email Address</label>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="john@example.com"
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Phone Number (Safaricom)</label>
            <input
              type="text"
              name="phoneNumber"
              required
              value={formData.phoneNumber}
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="2547XXXXXXXX"
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                minLength={6}
                value={formData.password}
                className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 pr-10 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
                placeholder="••••••••"
                onChange={handleChange}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#87ceeb] text-[#0a0a0a] font-bold py-4 rounded hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-[#87ceeb] hover:underline">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}
