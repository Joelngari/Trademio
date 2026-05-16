import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi, paymentApi } from '../../services/api.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ShieldCheck, ArrowRight, Loader2, Star } from 'lucide-react';

export default function WithdrawalBot() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [trader, setTrader] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setPackages(response.data.packages.filter(p => p.type === 'withdrawal-bot').sort((a, b) => a.price - b.price));
        setTrader(response.data.trader);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handlePurchase = async (pkgId) => {
    setPurchasing(pkgId);
    setMessage(null);
    try {
      await paymentApi.initiateStkPush({ packageId: pkgId, phoneNumber: phone });
      setMessage({ type: 'success', text: 'STK push sent! Complete the payment to upgrade your withdrawal tier.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to initiate payment' });
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-2">Withdrawal Bots</h1>
        <p className="text-gray-400">Upgrade your account verification level to unlock higher withdrawal limits.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          {message.text}
        </div>
      )}

      {trader?.withdrawalBotTier && (
        <div className="bg-[#87ceeb]/10 border border-[#87ceeb]/20 p-6 rounded-3xl flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#87ceeb]/20 rounded-2xl flex items-center justify-center text-[#87ceeb]">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packages.map((pkg) => {
          const isCurrent = trader?.withdrawalBotTier === pkg.tier;

          return (
            <div key={pkg.id} className={`bg-[#121212] border rounded-3xl p-8 flex flex-col relative overflow-hidden transition-all duration-300 ${isCurrent ? 'border-[#87ceeb] shadow-[0_0_20px_rgba(135,206,235,0.1)]' : 'border-white/5 hover:border-white/20'}`}>
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
                   <input 
                    type="text" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="M-Pesa Number"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                   />
                 )}
                 <button
                   disabled={isCurrent || purchasing === pkg.id}
                   onClick={() => handlePurchase(pkg.id)}
                   className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isCurrent ? 'bg-green-500/10 text-green-500 cursor-not-allowed' : 'bg-[#121212] text-[#87ceeb] border border-[#87ceeb] hover:bg-[#87ceeb] hover:text-[#0a0a0a]'}`}
                 >
                   {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : isCurrent ? 'Active Tier' : 'Upgrade Now'}
                 </button>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
