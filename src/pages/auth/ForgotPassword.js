import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../../lib/firebase.js';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import Footer from '../../components/Footer.js';

export default function ForgotPassword() {
  const [formData, setFormData] = useState({ email: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await sendPasswordResetEmail(auth, formData.email.trim());
      setMessage('Password reset instructions have been sent to your email.');
    } catch (err) {
      const code = err.code || '';
      if (code.includes('auth/user-not-found')) {
        setError('No account found for that email address.');
      } else if (code.includes('auth/invalid-email')) {
        setError('Please enter a valid email address.');
      } else {
        setError('Unable to send password reset email. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#121212] border border-white/5 rounded p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#87ceeb]/20" />

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] border-2 border-[#ffd700] rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-[#ffd700]">VM</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Reset Your Password</h1>
          <p className="text-gray-400 text-sm">Enter your email and we’ll send reset instructions.</p>
        </div>

        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded mb-6">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Email Address</label>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white focus:border-[#87ceeb] focus:ring-1 focus:ring-[#87ceeb] transition-all outline-none"
              placeholder="john@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#87ceeb] text-[#0a0a0a] font-bold py-4 rounded hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          Remembered your password?{' '}
          <Link to="/login" className="text-[#87ceeb] hover:underline">
            Login here
          </Link>
        </p>
      </div>
      </div>
      <Footer />
    </div>
  );
}
