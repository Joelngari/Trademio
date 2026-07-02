import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi } from '../../services/api.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ArrowDownCircle, ShieldCheck, AlertCircle, Loader2, Clock3 } from 'lucide-react';
import api from '../../services/api.js';

export default function Withdraw() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(5000);
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardResponse, withdrawalsResponse] = await Promise.all([
          traderApi.getDashboard(),
          traderApi.getWithdrawals()
        ]);
        setData(dashboardResponse.data);
        setWithdrawals(withdrawalsResponse.data.withdrawals || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const navigate = useNavigate();

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (amount < 10) return;

    const traderRecord = data?.trader;
    const hasWithdrawalBot = Boolean(traderRecord?.withdrawalBotPackageName || traderRecord?.withdrawalBotFamily || traderRecord?.withdrawalBotPackageId || traderRecord?.withdrawalBotTier);
    const hasVerificationBot = Boolean(traderRecord?.verificationBotPackageName || traderRecord?.verificationBotFamily || traderRecord?.verificationBotPackageId || traderRecord?.verificationBotTier);
    const max = traderRecord?.withdrawalBotMaxAmount;

    if (amount > traderRecord?.tradingBalance) {
      setMessage({ type: 'error', text: 'Insufficient Trading Balance.' });
      return;
    }

    if (!hasWithdrawalBot) {
      setMessage({ type: 'error', text: 'You must purchase a withdrawal bot before requesting a withdrawal.' });
      navigate('/trader/withdrawal-bot', { state: { requestedWithdrawal: amount, phoneNumber: phone } });
      return;
    }

    if (!hasVerificationBot) {
      setMessage({ type: 'error', text: 'Please complete the verification bot step after purchasing a withdrawal bot before requesting a withdrawal.' });
      navigate('/trader/withdrawal-bot', { state: { requestedWithdrawal: amount, phoneNumber: phone } });
      return;
    }

    if (max && amount > max) {
      setMessage({ type: 'error', text: `Your current withdrawal bot allows withdrawals up to ${formatCurrency(max, profile.preferredCurrency)}.` });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await api.post('/trader/withdraw', { amount, phoneNumber: phone });
      const withdrawalsResponse = await traderApi.getWithdrawals();
      setWithdrawals(withdrawalsResponse.data.withdrawals || []);
      setMessage({ type: 'success', text: 'Withdrawal request submitted! Your request is now under review.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit request' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <SkeletonLoader type="card" />;

  const trader = data.trader;
  const currency = profile?.preferredCurrency || 'KES';

  const getCountdown = (nextActionAt) => {
    if (!nextActionAt) return null;
    const target = new Date(nextActionAt);
    const diff = target.getTime() - Date.now();

    if (diff <= 0) {
      return 'The current review window has closed.';
    }

    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
    return `${hours}h ${minutes}m remaining`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Withdraw Funds</h1>
        <p className="text-gray-400">Transfer your earnings to your M-Pesa mobile wallet.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form onSubmit={handleWithdraw} className="bg-[#121212] border border-white/5 rounded p-8 space-y-6">
          <div className="w-16 h-16 bg-[#87ceeb]/10 rounded flex items-center justify-center text-[#87ceeb]">
            <ArrowDownCircle size={32} />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Withdrawable Amount (Min KSh 10)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">KSh</span>
                <input
                  type="number"
                  min="10"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded pl-14 pr-4 py-4 text-xl text-white focus:border-[#87ceeb] outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">M-Pesa Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded px-4 py-4 text-white focus:border-[#87ceeb] outline-none"
                placeholder="2547XXXXXXXX"
              />
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#87ceeb] text-[#0a0a0a] font-bold py-5 rounded text-xl hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin" /> : 'Request Withdrawal'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/trader/withdrawal-bot', { state: { requestedWithdrawal: amount, phoneNumber: phone } })}
            className="w-full mt-3 bg-white/5 border border-white/10 text-white font-bold py-4 rounded hover:bg-white/10 transition-all"
          >
            Purchase Withdrawal Bot
          </button>
        </form>

        <div className="space-y-6">
          <div className="bg-[#121212] border border-white/5 rounded p-8">
             <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-white">Wallet Overview</h3>
                <span className="bg-[#87ceeb]/10 text-[#87ceeb] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                  Verified Account
                </span>
             </div>

             <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Available Trading Balance</p>
                  <p className="text-3xl font-bold text-white">{formatCurrency(trader.tradingBalance || 0, currency)}</p>
                </div>

                <div className="h-px bg-white/5" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded border border-white/10">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#87ceeb]/10 rounded flex items-center justify-center text-[#87ceeb]">
                           <ShieldCheck size={20} />
                        </div>
                        <div>
                           <p className="text-[10px] text-gray-500 uppercase font-bold">Bot Tier</p>
                           <p className="text-sm font-bold text-white">{trader.withdrawalBotPackageName || trader.withdrawalBotFamily || 'None'}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] text-gray-500 uppercase font-bold">Max Limit</p>
                        <p className="text-sm font-bold text-[#87ceeb]">
                          {trader.withdrawalBotMaxAmount ? formatCurrency(trader.withdrawalBotMaxAmount, currency) : 'Unlimited'}
                        </p>
                     </div>
                  </div>

                  <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded flex gap-3 text-orange-500">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium">
                      All trader withdrawals are processed within 2-24 hours after admin verification.
                    </p>
                  </div>
                </div>
             </div>
          </div>

          <div className="bg-[#121212] border border-white/5 rounded p-8">
            <h3 className="font-bold text-white mb-4">Recent Withdrawal Requests</h3>
            {withdrawals.length === 0 ? (
              <p className="text-sm text-gray-500">No withdrawals yet.</p>
            ) : (
              <div className="space-y-3">
                {withdrawals.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">KSh {Number(item.amount || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{item.statusLabel || 'Pending review'}</p>
                      </div>
                      <div className="text-right text-xs text-gray-400">
                        <div className="flex items-center gap-1 justify-end">
                          <Clock3 size={12} />
                          {getCountdown(item.nextActionAt) || 'Awaiting update'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#121212] border border-white/5 rounded p-8">
            <h3 className="font-bold text-white mb-4">Security Rules</h3>
            <ul className="space-y-3">
              {[
                'Minimum withdrawal amount is KSh 10.',
                'You must have an active withdrawal bot.',
                'Large withdrawals may require extra verification.',
                'Ensure your M-Pesa number is correct. Transfers are final.'
              ].map((rule, i) => (
                <li key={i} className="flex gap-3 text-xs text-gray-500">
                  <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1 shrink-0" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
