import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ShieldCheck, ArrowRight, Loader2, Star, Clock } from 'lucide-react';

export default function WithdrawalBot() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [trader, setTrader] = useState(null);
  const [botPurchases, setBotPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phoneInputs, setPhoneInputs] = useState({});
  const [amountInputs, setAmountInputs] = useState({});
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
        setPackages(response.data.packages.filter(p => p.type === 'withdrawal-bot').sort((a, b) => a.price - b.price));
        setTrader(response.data.trader);
        
        // Initialize amount inputs to package price (full payment)
        const initialAmounts = {};
        response.data.packages
          .filter(p => p.type === 'withdrawal-bot')
          .forEach(p => {
            initialAmounts[p.id] = p.price;
          });
        setAmountInputs(initialAmounts);
        
        await fetchPendingPurchases();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handlePurchase = async (pkgId, isResume = false, botPurchaseId = null) => {
    setPurchasing(pkgId);
    setMessage(null);
    try {
      const amount = amountInputs[pkgId];
      
      if (!amount || amount <= 0) {
        setMessage({ type: 'error', text: 'Please enter a valid amount' });
        setPurchasing(null);
        return;
      }

      const pkg = packages.find(p => p.id === pkgId);
      if (amount > pkg.price) {
        setMessage({ type: 'error', text: `Amount cannot exceed ${formatCurrency(pkg.price, profile?.preferredCurrency)}` });
        setPurchasing(null);
        return;
      }

      const response = await paymentApi.initiateStkPush({ 
        packageId: pkgId, 
        amount: amount,
        phoneNumber: phoneInputs[pkgId] || profile?.phoneNumber || '',
        botPurchaseId: isResume ? botPurchaseId : undefined
      });

      const isPartial = amount < pkg.price;
      const msgText = isPartial 
        ? `STK push sent for ${formatCurrency(amount, profile?.preferredCurrency)}. Complete payment for ${formatCurrency(pkg.price, profile?.preferredCurrency)} ${pkg.name}.`
        : 'STK push sent! Complete the payment to activate this withdrawal tier.';
      
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
            : 'Payment completed successfully. Your withdrawal tier is now active.';
          setMessage({ type: 'success', text: successMsg });
          if (isPartial) {
            await fetchPendingPurchases();
          } else {
            setTimeout(() => window.location.reload(), 2000);
          }
        }
        if (status === 'failed') {
          setMessage({ type: 'error', text: 'Payment failed or was cancelled. Please try again.' });
        }
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.userMessage || err.response?.data?.message || 'Failed to initiate payment' });
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-2">Withdrawal Bots</h1>
        <p className="text-gray-400">Upgrade your account verification level to unlock higher withdrawal limits. Pay any amount to get started.</p>
      </div>

      {message && (
        <div className={`p-4 rounded border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          {message.text}
        </div>
      )}

      {trader?.withdrawalBotTier && (
        <div className="bg-[#87ceeb]/10 border border-[#87ceeb]/20 p-6 rounded flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#87ceeb]/20 rounded flex items-center justify-center text-[#87ceeb]">
                 <ShieldCheck size={28} />
              </div>
              <div>
                 <p className="text-xs text-[#87ceeb] font-bold uppercase tracking-wider">Current Verification</p>
                 <h3 className="text-xl font-bold text-white capitalize">{trader.withdrawalBotTier} Bot Enabled</h3>
              </div>
           </div>
           <div className="text-right">
              <p className="text-xs text-gray-500 uppercase">Limit</p>
              <p className="text-lg font-bold text-white">
                {trader.withdrawalBotMaxAmount ? formatCurrency(trader.withdrawalBotMaxAmount, profile?.preferredCurrency) : 'Unlimited'}
              </p>
           </div>
        </div>
      )}

      {/* Pending Purchases */}
      {botPurchases.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-6">
          <div className="flex items-start gap-3 mb-4">
            <Clock className="text-yellow-500 mt-1" size={24} />
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
                      className="bg-[#87ceeb] h-2 rounded-full transition-all" 
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
                  className="ml-4 px-4 py-2 bg-[#87ceeb] text-[#0a0a0a] rounded font-semibold hover:bg-[#76b9d6] transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {purchasing === purchase.packageInfo?.id ? 'Processing...' : 'Complete Payment'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packages.map((pkg) => {
          const isCurrent = trader?.withdrawalBotTier === pkg.tier;
          const amount = amountInputs[pkg.id] || pkg.price;

          return (
            <div key={pkg.id} className={`bg-[#121212] border rounded p-8 flex flex-col relative overflow-hidden transition-all duration-300 ${isCurrent ? 'border-[#87ceeb] shadow-[0_0_20px_rgba(135,206,235,0.1)]' : 'border-white/5 hover:border-white/20'}`}>
               {pkg.tier === 'premium' && (
                 <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                    <Star size={80} />
                 </div>
               )}
               
               <h3 className="text-xl font-bold text-white mb-1 capitalize">{pkg.name}</h3>
               <p className="text-[#87ceeb] font-bold mb-6">{formatCurrency(pkg.price, profile?.preferredCurrency)}</p>

               <ul className="space-y-4 mb-8 flex-1">
                 <li className="flex gap-3 text-sm text-gray-400 items-start">
                    <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                    Withdrawals up to {pkg.maxAmount ? formatCurrency(pkg.maxAmount, profile?.preferredCurrency) : 'Unlimited Amount'}
                 </li>
                 <li className="flex gap-3 text-sm text-gray-400 items-start">
                    <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                    Standard processing time
                 </li>
                 <li className="flex gap-3 text-sm text-gray-400 items-start">
                    <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                    Account verification certificate
                 </li>
               </ul>

              <div className="space-y-4 mt-auto">
                     {!isCurrent && (
                       <>
                         <input 
                          type="text" 
                          value={phoneInputs[pkg.id] ?? ''}
                          onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                          placeholder="M-Pesa Number"
                          className="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                         />
                         {/* Resume banner: if there's an existing pending purchase for this package, show prompt */}
                         {botPurchases.some(bp => bp.packageInfo?.id === pkg.id) && (
                           <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-sm text-yellow-200">
                             You have a pending purchase for this plan. Resume it from the Pending Purchases panel above to avoid creating duplicates.
                           </div>
                         )}
                     <div>
                       <label className="text-xs text-gray-400 block mb-2">Payment Amount</label>
                       <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmountInputs((prev) => ({ ...prev, [pkg.id]: parseFloat(e.target.value) || 0 }))}
                        min="1"
                        max={pkg.price}
                        className="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                       />
                       <p className="text-xs text-gray-500 mt-1">1 - {formatCurrency(pkg.price, profile?.preferredCurrency)}</p>
                     </div>
                   </>
                 )}
                 <button
                   disabled={isCurrent || purchasing === pkg.id}
                   onClick={() => handlePurchase(pkg.id)}
                   className={`w-full py-4 rounded font-bold transition-all flex items-center justify-center gap-2 ${isCurrent ? 'bg-green-500/10 text-green-500 cursor-not-allowed' : 'bg-[#121212] text-[#87ceeb] border border-[#87ceeb] hover:bg-[#87ceeb] hover:text-[#0a0a0a]'}`}
                 >
                   {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : isCurrent ? 'Active Tier' : 'Pay Now'}
                 </button>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
