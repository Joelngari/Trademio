import React, { useState, useEffect, useRef } from 'react';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Activity, AlertCircle, Loader2, Calendar } from 'lucide-react';

export default function Lifespan() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phoneInputs, setPhoneInputs] = useState({});
  const [message, setMessage] = useState(null);
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setPackages(response.data.packages.filter(p => p.type === 'lifespan'));
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

  const handlePurchase = async (pkgId) => {
    if (activeSession) return;
    setPurchasing(pkgId);
    setMessage(null);
    try {
      const response = await paymentApi.initiateStkPush({ packageId: pkgId, phoneNumber: phoneInputs[pkgId] || profile?.phoneNumber || '' });
      setMessage({ type: 'success', text: 'STK push sent! Complete the payment to activate this plan.' });
      paymentWatchRef.current?.();
      paymentWatchRef.current = watchPaymentStatus(response.data.checkoutRequestId, (status) => {
        if (status === 'success') {
          setMessage({ type: 'success', text: 'Payment completed successfully. Your plan is now active.' });
          setTimeout(() => window.location.reload(), 1000);
        }
        if (status === 'failed') {
          setMessage({ type: 'error', text: 'Payment failed or was cancelled. Please try again.' });
        }
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to initiate payment' });
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Lifespan Premium Bots</h1>
          <p className="text-gray-400">Long-term sophisticated trading strategies for patient investors.</p>
        </div>
        {activeSession && (
          <div className="bg-orange-500/10 border border-orange-500/20 text-orange-500 px-4 py-2 rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            You have an active session running.
          </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {packages.map((pkg) => (
          <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded-3xl p-10 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#87ceeb]/5 to-transparent opacity-50" />
            
            <div className="flex items-start justify-between relative z-10 mb-8">
              <div className="w-16 h-16 bg-[#87ceeb]/10 rounded-2xl flex items-center justify-center text-[#87ceeb]">
                <Activity size={32} />
              </div>
              <div className="bg-white/5 px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 text-xs text-gray-400">
                <Calendar size={14} />
                {pkg.duration} Days Cycle
              </div>
            </div>

            <h3 className="text-2xl font-bold text-white mb-3 relative z-10">{pkg.name}</h3>
            <p className="text-gray-400 text-base mb-8 flex-1 relative z-10">
              Our most advanced premium bots using institutional liquidity mapping and swing trading logic. 
              Designed for consistent performance over a multi-day lifespan.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8 relative z-10">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <p className="text-gray-500 text-xs mb-1">Activation Fee</p>
                <p className="text-xl font-bold text-white">{formatCurrency(pkg.price, profile?.preferredCurrency)}</p>
              </div>
              <div className="bg-green-500/5 p-4 rounded-2xl border border-green-500/10">
                <p className="text-gray-500 text-xs mb-1">Target Yield</p>
                <p className="text-xl font-bold text-green-500">{formatCurrency(pkg.expectedReturn, profile?.preferredCurrency)}</p>
              </div>
            </div>

            <div className="space-y-4 relative z-10">
              <input 
                type="text" 
                value={phoneInputs[pkg.id] ?? ''}
                onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                placeholder="2547XXXXXXXX"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#87ceeb] outline-none"
              />
              <button
                disabled={activeSession || purchasing === pkg.id}
                onClick={() => handlePurchase(pkg.id)}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
              >
                {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : activeSession ? 'Term in Progress' : 'Initiate Session'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
