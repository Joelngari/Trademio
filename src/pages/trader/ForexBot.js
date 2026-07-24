import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Cpu, AlertCircle, Loader2, StopCircle, Play, ArrowUpCircle } from 'lucide-react';
import { db } from '../../lib/firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';

export default function ForexBot() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [botPurchases, setBotPurchases] = useState([]);
  const [depositBalance, setDepositBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [message, setMessage] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');
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
        setPackages(response.data.packages.filter(p => p.type === 'forex'));
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

  useEffect(() => {
    if (!activeSession?.id) return;
    const sessionRef = doc(db, 'sessions', activeSession.id);
    const unsubscribe = onSnapshot(sessionRef, (docSnap) => {
      if (docSnap.exists()) setActiveSession(docSnap.data());
      else setActiveSession(null);
    });
    return () => unsubscribe();
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;
    const timer = setInterval(() => {
      const diff = activeSession.endsAt - Date.now();
      if (diff <= 0) { setTimeLeft('Session complete'); clearInterval(timer); return; }
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${mins}m ${secs}s remaining`);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  const handleStopSession = async () => {
    if (!activeSession?.id) return;
    try { await traderApi.stopSession(activeSession.id); setMessage({ type: 'success', text: 'Session paused. You can resume it anytime before your remaining time ends.' }); setActiveSession((prev) => prev ? { ...prev, status: 'stopped' } : prev); }
    catch (err) { setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to stop session' }); }
  };

  const handleResumeSession = async () => {
    if (!activeSession?.id) return;
    try { await traderApi.resumeSession(activeSession.id); setMessage({ type: 'success', text: 'Session resumed successfully.' }); setActiveSession((prev) => prev ? { ...prev, status: 'active' } : prev); }
    catch (err) { setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to resume session' }); }
  };

  const handlePurchase = async (pkgId) => {
    if (activeSession && activeSession.status !== 'stopped') return;
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
      setMessage({ type: 'success', text: 'Payment processed! Your bot session is now active.' });
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
          <h1 className="text-3xl font-bold text-white mb-2">Forex Trading Bots</h1>
          <p className="text-gray-400">High-performance algorithms for global currency pairs.</p>
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

      {botPurchases.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="text-yellow-500 mt-1" size={24} />
            <div>
              <h3 className="text-lg font-bold text-white">Pending Purchases</h3>
              <p className="text-sm text-gray-400">Complete these purchases or wait for your mentor to reconcile the remainder.</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {botPurchases.map((purchase) => (
              <div key={purchase.id} className="bg-black/30 border border-white/10 rounded p-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-white font-semibold">{purchase.packageInfo?.name || 'Bot'}</p>
                  <p className="text-sm text-gray-400">
                    {formatCurrency(purchase.amountPaid, profile?.preferredCurrency)} of {formatCurrency(purchase.requiredAmount, profile?.preferredCurrency)} paid
                  </p>
                  <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                    <div 
                      className="bg-cyan-500 h-2 rounded-full transition-all" 
                      style={{ width: `${(purchase.amountPaid / purchase.requiredAmount) * 100}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAmountInputs(prev => ({ ...prev, [purchase.packageInfo?.id]: purchase.outstandingAmount }));
                    setPhoneInputs(prev => ({ ...prev, [purchase.packageInfo?.id]: phoneInputs[purchase.packageInfo?.id] || profile?.phoneNumber || '' }));
                    handlePurchase(purchase.packageInfo?.id, true, purchase.id);
                  }}
                  disabled={purchasing === purchase.packageInfo?.id}
                  className="ml-4 px-4 py-2 bg-cyan-500 text-white rounded font-semibold hover:bg-cyan-600 transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {purchasing === purchase.packageInfo?.id ? 'Processing...' : 'Complete Payment'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSession && (
        <div className="rounded border border-[#87ceeb]/20 bg-[#87ceeb]/10 p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#87ceeb]">Active Session</p>
              <h2 className="text-xl font-bold text-white">{activeSession.planName || 'Bot session is running'}</h2>
              <p className="text-sm text-gray-300">Expected return: {formatCurrency(activeSession.expectedReturn || 0, profile?.preferredCurrency)} · {timeLeft || 'Live session active'}</p>
            </div>
            {activeSession.status === 'stopped' ? (
              <button onClick={handleResumeSession} className="inline-flex items-center gap-2 rounded border border-green-400/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20"><Play size={16}/> Resume Session</button>
            ) : (
              <button onClick={handleStopSession} className="inline-flex items-center gap-2 rounded border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20"><StopCircle size={16}/> Stop Bot</button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded p-8 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#87ceeb]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="w-12 h-12 bg-[#87ceeb]/10 rounded flex items-center justify-center text-[#87ceeb] mb-6">
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

              {depositBalance < pkg.price ? (
                <div className="space-y-3">
                  <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm">
                    <p className="text-yellow-500 font-semibold">Insufficient Balance</p>
                    <p className="text-yellow-400 text-xs mt-1">Need {formatCurrency(pkg.price - depositBalance, profile?.preferredCurrency)} more</p>
                  </div>
                  <button
                    onClick={() => navigate('/trader/deposit')}
                    className="w-full py-4 rounded bg-[#87ceeb] text-[#0a0a0a] font-bold hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowUpCircle size={18} /> Deposit Funds
                  </button>
                </div>
              ) : (
                <button
                  disabled={(activeSession && activeSession.status !== 'stopped') || purchasing === pkg.id}
                  onClick={() => handlePurchase(pkg.id)}
                  className={`w-full py-4 rounded font-bold transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
                >
                  {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : activeSession ? 'Session Running' : 'Activate Bot'}
                </button>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
