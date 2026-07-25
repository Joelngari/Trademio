import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Infinity, AlertCircle, Loader2, TrendingUp, ArrowUpCircle, Activity, Calendar } from 'lucide-react';

export default function Lifespan() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  // bot purchases removed
  const [depositBalance, setDepositBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [message, setMessage] = useState(null);
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);


  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setPackages(response.data.packages.filter(p => p.type === 'lifespan'));
        setActiveSession(response.data.activeSession);
        setDepositBalance(response.data.trader?.depositBalance || 0);
      } catch (err) {
        console.error(err);
        // Silently log fetch errors
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handlePurchase = async (pkgId) => {
    if (activeSession) return;
    const pkg = packages.find((item) => item.id === pkgId);
    if (!pkg) return;
    
    // Check if user has sufficient balance
    if (depositBalance < pkg.price) {
      const shortfall = pkg.price - depositBalance;
      setMessage({ type: 'error', text: `Insufficient balance. Need ${formatCurrency(shortfall, profile?.preferredCurrency)} more to purchase this bot.` });
      return;
    }
    
    setPurchasing(pkgId);
    setMessage(null);
    try {
      await paymentApi.purchaseBotWithDeposit({ packageId: pkgId });
      setMessage({ type: 'success', text: 'Payment processed! Your plan is now active.' });
      await fetchPendingPurchases();
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setMessage({ type: 'error', text: err.userMessage || err.response?.data?.message || 'Failed to complete bot purchase' });
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
          <div className="bg-orange-500/10 border border-orange-500/20 text-orange-500 px-4 py-2 rounded flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            You have an active session running.
          </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          {message.text}
        </div>
      )}

      {/* bot purchases removed */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {packages.map((pkg) => (
          <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded p-10 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#87ceeb]/5 to-transparent opacity-50" />
            
            <div className="flex items-start justify-between relative z-10 mb-8">
              <div className="w-16 h-16 bg-[#87ceeb]/10 rounded flex items-center justify-center text-[#87ceeb]">
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
              <div className="bg-white/5 p-4 rounded border border-white/10">
                <p className="text-gray-500 text-xs mb-1">Activation Fee</p>
                <p className="text-xl font-bold text-white">{formatCurrency(pkg.price, profile?.preferredCurrency)}</p>
              </div>
              <div className="bg-green-500/5 p-4 rounded border border-green-500/10">
                <p className="text-gray-500 text-xs mb-1">Target Yield</p>
                <p className="text-xl font-bold text-green-500">{formatCurrency(pkg.expectedReturn, profile?.preferredCurrency)}</p>
              </div>
            </div>

            <div className="space-y-4 relative z-10">
              {depositBalance < pkg.price ? (
                <div className="space-y-3">
                  <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm">
                    <p className="text-yellow-500 font-semibold">Insufficient Balance</p>
                    <p className="text-yellow-400 text-xs mt-1">Need {formatCurrency(pkg.price - depositBalance, profile?.preferredCurrency)} more</p>
                  </div>
                  <button
                    onClick={() => navigate('/trader/deposit')}
                    className="w-full py-4 rounded bg-[#87ceeb] text-[#0a0a0a] font-bold text-lg hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowUpCircle size={18} /> Deposit Funds
                  </button>
                </div>
              ) : (
                <button
                  disabled={activeSession || purchasing === pkg.id}
                  onClick={() => handlePurchase(pkg.id)}
                  className={`w-full py-4 rounded font-bold text-lg transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
                >
                  {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : activeSession ? 'Term in Progress' : 'Initiate Session'}
                </button>
              )}
              {/* bot purchases removed */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
