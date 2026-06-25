import React, { useState, useEffect, useRef } from 'react';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Cpu, AlertCircle, Loader2, StopCircle, Play } from 'lucide-react';
import { db } from '../../lib/firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';

export default function ForexBot() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [botPurchases, setBotPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phoneInputs, setPhoneInputs] = useState({});
  const [amountInputs, setAmountInputs] = useState({});
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

  const handlePurchase = async (pkgId, isResume = false, botPurchaseId = null) => {
    if (activeSession && activeSession.status !== 'stopped') return;
    const pkg = packages.find((item) => item.id === pkgId);
    const amount = amountInputs[pkgId] || pkg?.price || 0;
    if (!pkg) return;
    if (amount <= 0 || amount > pkg.price) {
      setMessage({ type: 'error', text: `Amount must be between 1 and ${formatCurrency(pkg.price, profile?.preferredCurrency)}` });
      return;
    }
    setPurchasing(pkgId);
    setMessage(null);
    try {
      const response = await paymentApi.initiateStkPush({ 
        packageId: pkgId, 
        amount, 
        phoneNumber: phoneInputs[pkgId] || profile?.phoneNumber || '',
        botPurchaseId: isResume ? botPurchaseId : undefined
      });
      const isPartial = amount < pkg.price;
      const msgText = isPartial 
        ? `STK push sent for ${formatCurrency(amount, profile?.preferredCurrency)}. Complete payment for ${formatCurrency(pkg.price, profile?.preferredCurrency)} ${pkg.name}.`
        : 'STK push sent! Complete the payment to activate this bot.';
      
      if (isPartial && response.data.botPurchaseId && !isResume) {
        setBotPurchases((prev) => [
          {
            id: response.data.botPurchaseId,
            packageInfo: { id: pkg.id, name: pkg.name, price: pkg.price, type: pkg.type },
            requiredAmount: pkg.price,
            amountPaid: 0,
            outstandingAmount: pkg.price,
            status: 'pending'
          },
          ...prev.filter((purchase) => purchase.id !== response.data.botPurchaseId)
        ]);
      }

      setMessage({ type: 'success', text: msgText });
      paymentWatchRef.current?.();
      paymentWatchRef.current = watchPaymentStatus(response.data.checkoutRequestId, async (status) => {
        if (status === 'success') {
          const successMsg = isPartial 
            ? 'Payment recorded! Your mentor will reconcile the remaining amount.'
            : 'Payment completed successfully. Your bot session is now active.';
          setMessage({ type: 'success', text: successMsg });
          if (isPartial) {
            await fetchPendingPurchases();
          } else {
            setTimeout(() => window.location.reload(), 1000);
          }
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

      {botPurchases.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-3xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="text-yellow-500 mt-1" size={24} />
            <div>
              <h3 className="text-lg font-bold text-white">Pending Purchases</h3>
              <p className="text-sm text-gray-400">Complete these purchases or wait for your mentor to reconcile the remainder.</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {botPurchases.map((purchase) => (
              <div key={purchase.id} className="bg-black/30 border border-white/10 rounded-xl p-4 flex items-center justify-between">
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
                  className="ml-4 px-4 py-2 bg-cyan-500 text-white rounded-lg font-semibold hover:bg-cyan-600 transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {purchasing === purchase.packageInfo?.id ? 'Processing...' : 'Complete Payment'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSession && (
        <div className="rounded-3xl border border-[#87ceeb]/20 bg-[#87ceeb]/10 p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#87ceeb]">Active Session</p>
              <h2 className="text-xl font-bold text-white">{activeSession.planName || 'Bot session is running'}</h2>
              <p className="text-sm text-gray-300">Expected return: {formatCurrency(activeSession.expectedReturn || 0, profile?.preferredCurrency)} · {timeLeft || 'Live session active'}</p>
            </div>
            {activeSession.status === 'stopped' ? (
              <button onClick={handleResumeSession} className="inline-flex items-center gap-2 rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20"><Play size={16}/> Resume Session</button>
            ) : (
              <button onClick={handleStopSession} className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20"><StopCircle size={16}/> Stop Bot</button>
            )}
          </div>
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
                type="number"
                min="1"
                max={pkg.price}
                value={amountInputs[pkg.id] ?? pkg.price}
                onChange={(e) => setAmountInputs((prev) => ({ ...prev, [pkg.id]: Number(e.target.value) }))}
                placeholder={`Amount (max ${formatCurrency(pkg.price, profile?.preferredCurrency)})`}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-[#87ceeb] outline-none"
              />
              <input 
                type="text" 
                value={phoneInputs[pkg.id] ?? ''}
                onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                placeholder="2547XXXXXXXX"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
              />
              <button
                disabled={(activeSession && activeSession.status !== 'stopped') || purchasing === pkg.id || botPurchases.some(bp => bp.packageInfo?.id === pkg.id)}
                onClick={() => handlePurchase(pkg.id)}
                className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
              >
                {botPurchases.some(bp => bp.packageInfo?.id === pkg.id) ? 'Pending Purchase Exists' : (purchasing === pkg.id ? <Loader2 className="animate-spin" /> : activeSession ? 'Session Running' : 'Activate Bot')}
              </button>
              {botPurchases.some(bp => bp.packageInfo?.id === pkg.id) && (
                <div className="mt-3 text-sm text-yellow-300">You have a pending purchase for this plan — resume from the Pending Purchases panel.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
