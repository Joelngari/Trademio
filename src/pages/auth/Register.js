import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { auth, db } from '../../lib/firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { authApi } from '../../services/api.js';
import { Loader2 } from 'lucide-react';

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

    const referralCode = searchParams.get('ref') || 'VELNIX-ADMIN';

    try {
      // Use backend for registration to handle unique username and referral link
      await authApi.register({ ...formData, referralCode });
      
      // Auto login after registration
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      navigate('/trader/home');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121212] border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#87ceeb]/20" />
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#87ceeb] mb-2">Join Velnix Markets</h1>
          <p className="text-gray-400 text-sm">Kenyan trading & investment platform</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded-xl mb-6">
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="2547XXXXXXXX"
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="••••••••"
              onChange={handleChange}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#87ceeb] text-[#0a0a0a] font-bold py-4 rounded-xl hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2 mt-4"
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
