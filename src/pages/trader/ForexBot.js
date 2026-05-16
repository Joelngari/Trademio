import React, { useState, useEffect } from 'react';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Cpu, AlertCircle, Loader2 } from 'lucide-react';

export default function ForexBot() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setPackages(response.data.packages.filter(p => p.type === 'forex'));
        setActiveSession(response.data.activeSession);
      } catch (err) {
        console.error(err);
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
      await paymentApi.initiateStkPush({ packageId: pkgId, phoneNumber: phone });
      setMessage({ type: 'success', text: 'STK push sent! Check your phone and enter your M-Pesa PIN.' });
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
          <h1 className="text-3xl font-bold text-white mb-2">Forex Trading Bots</h1>
          <p className="text-gray-400">High-performance algorithms for global currency pairs.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#87ceeb]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="w-12 h-12 bg-[#87ceeb]/10 rounded-2xl flex items-center justify-center text-[#87ceeb] mb-6">
              <Cpu size={24} />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">{pkg.name}</h3>
            <p className="text-gray-400 text-sm mb-6 flex-1">
              Advanced HFT algorithm targeting major pairs with 60-minute execution window.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Price</span>
                <span className="text-white font-bold">{formatCurrency(pkg.price, profile?.preferredCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Expected Return</span>
                <span className="text-green-500 font-bold">{formatCurrency(pkg.expectedReturn, profile?.preferredCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Duration</span>
                <span className="text-white">{pkg.duration} Minutes</span>
              </div>
            </div>

            <div className="space-y-4">
              <input 
                type="text" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2547XXXXXXXX"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
              />
              <button
                disabled={activeSession || purchasing === pkg.id}
                onClick={() => handlePurchase(pkg.id)}
                className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
              >
                {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : activeSession ? 'Active Session' : 'Activate Bot'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
