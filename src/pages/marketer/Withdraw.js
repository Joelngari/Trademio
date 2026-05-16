import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { db } from '../../lib/firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ArrowDownCircle, Info, Loader2, AlertCircle } from 'lucide-react';
import api from '../../services/api.js';

export default function MarketerWithdraw() {
  const { user, profile } = useAuth();
  const [marketerData, setMarketerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(150);
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'marketers', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setMarketerData(docSnap.data());
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user.uid]);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const min = marketerData?.minimumWithdrawal || 150;
    
    if (amount < min) {
      setMessage({ type: 'error', text: `Minimum withdrawal amount is KSh ${min}.` });
      return;
    }

    if (amount > (marketerData?.commissionBalance || 0)) {
      setMessage({ type: 'error', text: 'Insufficient Commission Balance.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await api.post('/payouts/marketer', { amount, phoneNumber: phone });
      setMessage({ type: 'success', text: 'Withdrawal successful! Funds have been sent to your M-Pesa wallet.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to process payout' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <SkeletonLoader type="card" />;

  const minWithdrawal = marketerData?.minimumWithdrawal || 150;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Withdraw Commissions</h1>
        <p className="text-gray-400">Transfer your earned recruitment commissions to M-Pesa instantly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form onSubmit={handleWithdraw} className="bg-[#121212] border border-white/5 rounded-3xl p-8 space-y-6">
          <div className="w-16 h-16 bg-[#87ceeb]/10 rounded-2xl flex items-center justify-center text-[#87ceeb]">
            <ArrowDownCircle size={32} />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Withdraw Amount (Min KSh {minWithdrawal})</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">KSh</span>
                <input
                  type="number"
                  min={minWithdrawal}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-14 pr-4 py-4 text-xl text-white focus:border-[#87ceeb] outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Destination Phone (M-Pesa)</label>
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
            type="submit"
            disabled={submitting}
            className="w-full bg-[#87ceeb] text-[#0a0a0a] font-bold py-5 rounded-2xl text-xl hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin" /> : 'Instant M-Pesa Payout'}
          </button>
        </form>

        <div className="space-y-6">
          <div className="bg-[#121212] border border-white/5 rounded-3xl p-8">
             <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-white">Earnings Overview</h3>
                <div className="flex items-center gap-2 text-xs text-green-500">
                   <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                   Instant B2C Active
                </div>
             </div>

             <div className="space-y-6">
                <div>
                   <p className="text-xs text-gray-500 uppercase mb-1 font-bold">Commission Balance</p>
                   <p className="text-4xl font-bold text-white">{formatKSh(marketerData?.commissionBalance || 0)}</p>
                </div>

                <div className="h-px bg-white/5" />

                <div className="space-y-4">
                  <div className="bg-[#87ceeb]/5 border border-[#87ceeb]/10 p-6 rounded-2xl flex gap-4">
                     <Info size={20} className="text-[#87ceeb] shrink-0 mt-0.5" />
                     <p className="text-xs text-gray-400 leading-relaxed">
                        Marketer payouts are processed automatically via B2C API. Funds should arrive in your mobile wallet within minutes after submission.
                     </p>
                  </div>

                  <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-2xl flex gap-3 text-orange-500">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium leading-[1.4]">
                      Ensure you are withdrawing to an M-Pesa registered number. 
                      Incorrect numbers may lead to irreversible fund loss.
                    </p>
                  </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
