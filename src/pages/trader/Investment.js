import React, { useState, useEffect, useRef } from 'react';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { PieChart, AlertCircle, Loader2, Info } from 'lucide-react';

export default function Investment() {
  const { profile } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(1000);
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState(null);
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setActiveSession(response.data.activeSession);
      } catch (err) {
        console.error(err);
        if (typeof window !== 'undefined' && window.showAppError) window.showAppError(err.message || err.response?.data?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleInvestment = async () => {
    if (activeSession || amount < 1000) return;
    setPurchasing(true);
    setMessage(null);
    try {
      const response = await paymentApi.initiateStkPush({ amount, phoneNumber: phone, type: 'investment' });
      setMessage({ type: 'success', text: 'STK push sent! Complete the payment to activate this investment.' });
      paymentWatchRef.current?.();
      paymentWatchRef.current = watchPaymentStatus(response.data.checkoutRequestId, (status) => {
        if (status === 'success') {
          setMessage({ type: 'success', text: 'Payment completed successfully. Your investment session is now active.' });
          setTimeout(() => window.location.reload(), 1000);
        }
        if (status === 'failed') {
          setMessage({ type: 'error', text: 'Payment failed or was cancelled. Please try again.' });
        }
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to initiate investment' });
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) return <SkeletonLoader type="card" />;

  const profit = amount * 0.5;
  const totalReturn = amount + profit;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Fixed Investment Plans</h1>
        <p className="text-gray-400">Stable returns over a 3-day holding period.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-8 space-y-6">
          <div className="w-16 h-16 bg-[#87ceeb]/10 rounded-2xl flex items-center justify-center text-[#87ceeb]">
            <PieChart size={32} />
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Custom Investment</h3>
            <p className="text-sm text-gray-500">Enter the amount you wish to invest. All investments yield 50% profit after 3 days.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Investment Amount (Min KSh 1,000)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">KSh</span>
                <input
                  type="number"
                  min="1000"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-14 pr-4 py-4 text-xl text-white focus:border-[#87ceeb] outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">M-Pesa Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white focus:border-[#87ceeb] outline-none"
                placeholder="2547XXXXXXXX"
              />
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleInvestment}
            disabled={activeSession || amount < 1000 || purchasing}
            className={`w-full py-5 rounded-2xl font-bold text-xl transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
          >
            {purchasing ? <Loader2 className="animate-spin" /> : activeSession ? 'Investment in Progress' : 'Confirm Investment'}
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-[#121212] border border-white/5 rounded-3xl p-8">
            <h3 className="font-bold text-white mb-6">Return Forecast</h3>
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase">Capital</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(amount, profile?.preferredCurrency)}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs text-gray-500 uppercase">Profit (50%)</p>
                  <p className="text-2xl font-bold text-green-500">+ {formatCurrency(profit, profile?.preferredCurrency)}</p>
                </div>
              </div>

              <div className="h-px bg-white/5" />

              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase">Total Return after 3 days</p>
                <p className="text-4xl font-bold text-[#87ceeb]">{formatCurrency(totalReturn, profile?.preferredCurrency)}</p>
              </div>

              <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl flex gap-3">
                <Info size={18} className="text-[#87ceeb] shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">
                  Your funds are locked in a secure algorithmic pool for 72 hours. Returns are automatically credited to your Trading Balance upon completion.
                </p>
              </div>
            </div>
          </div>

          {activeSession && (
             <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-3xl flex items-center gap-4">
                <AlertCircle className="text-orange-500" />
                <div>
                   <p className="text-orange-500 font-bold">Active Session Found</p>
                   <p className="text-xs text-orange-500/80">You can only run one activation at a time.</p>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
