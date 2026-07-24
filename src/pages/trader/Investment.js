import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { PiggyBank, AlertCircle, Loader2, TrendingUp, ArrowUpCircle, PieChart, Info } from 'lucide-react';

export default function Investment() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [botPurchases, setBotPurchases] = useState([]);
  const [depositBalance, setDepositBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(1000);
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState(null);
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);

  const fetchPendingPurchases = async () => {
    try {
      const purchasesRes = await traderApi.getBotPurchases();
      setBotPurchases(purchasesRes.data.botPurchases || []);
    } catch (err) {
      console.warn('Failed to fetch bot purchases:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setActiveSession(response.data.activeSession);
        setDepositBalance(response.data.trader?.depositBalance || 0);
        await fetchPendingPurchases();
      } catch (err) {
        console.error(err);
        // Silently log fetch errors
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleInvestment = async () => {
    if (activeSession || amount < 1000) return;
    
    // Check if user has sufficient balance
    if (depositBalance < amount) {
      const shortfall = amount - depositBalance;
      setMessage({ type: 'error', text: `Insufficient balance. Need ${formatCurrency(shortfall, profile?.preferredCurrency)} more to invest this amount.` });
      return;
    }
    
    setPurchasing(true);
    setMessage(null);
    try {
      await paymentApi.purchaseBotWithDeposit({ type: 'investment', amount });
      setMessage({ type: 'success', text: 'Payment processed! Your investment session is now active.' });
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err.userMessage || err.response?.data?.message || 'Failed to complete investment purchase' });
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
        <div className="bg-[#121212] border border-white/5 rounded p-8 space-y-6">
          <div className="w-16 h-16 bg-[#87ceeb]/10 rounded flex items-center justify-center text-[#87ceeb]">
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
                  className="w-full bg-black/40 border border-white/10 rounded pl-14 pr-4 py-4 text-xl text-white focus:border-[#87ceeb] outline-none transition-all"
                />
              </div>
            </div>

            {depositBalance < amount ? (
              <div className="space-y-3">
                <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm">
                  <p className="text-yellow-500 font-semibold">Insufficient Balance</p>
                  <p className="text-yellow-400 text-xs mt-1">Need {formatCurrency(amount - depositBalance, profile?.preferredCurrency)} more</p>
                </div>
                <button
                  onClick={() => navigate('/trader/deposit')}
                  className="w-full py-4 rounded bg-[#87ceeb] text-[#0a0a0a] font-bold hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
                >
                  <ArrowUpCircle size={18} /> Deposit Funds
                </button>
              </div>
            ) : null}
          </div>

          {message && (
            <div className={`p-4 rounded border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
              {message.text}
            </div>
          )}

          {botPurchases.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="text-yellow-500 mt-1" size={24} />
                <div>
                  <h3 className="text-lg font-bold text-white">Pending Investments</h3>
                  <p className="text-sm text-gray-400">Complete these or wait for your mentor to reconcile the remainder.</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {botPurchases.map((purchase) => (
                  <div key={purchase.id} className="bg-black/30 border border-white/10 rounded p-4">
                    <p className="text-white font-semibold mb-2">{purchase.packageInfo?.name || 'Investment'}</p>
                    <p className="text-sm text-gray-400 mb-2">
                      {formatCurrency(purchase.amountPaid, profile?.preferredCurrency)} of {formatCurrency(purchase.requiredAmount, profile?.preferredCurrency)} invested
                    </p>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div 
                        className="bg-cyan-500 h-2 rounded-full transition-all" 
                        style={{ width: `${(purchase.amountPaid / purchase.requiredAmount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleInvestment}
            disabled={activeSession || amount < 1000 || purchasing}
            className={`w-full py-5 rounded font-bold text-xl transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
          >
            {purchasing ? <Loader2 className="animate-spin" /> : activeSession ? 'Investment in Progress' : 'Confirm Investment'}
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-[#121212] border border-white/5 rounded p-8">
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

              <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded flex gap-3">
                <Info size={18} className="text-[#87ceeb] shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">
                  Your funds are locked in a secure algorithmic pool for 72 hours. Returns are automatically credited to your Trading Balance upon completion.
                </p>
              </div>
            </div>
          </div>

          {activeSession && (
             <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded flex items-center gap-4">
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
