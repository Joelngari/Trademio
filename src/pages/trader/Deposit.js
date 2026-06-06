import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { ArrowUpCircle, Info, Loader2 } from 'lucide-react';

export default function Deposit() {
  const { profile } = useAuth();
  const [amount, setAmount] = useState(1000);
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (amount <= 0) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await paymentApi.initiateStkPush({ amount, phoneNumber: phone });
      setMessage({ type: 'success', text: 'STK push sent! Complete the payment to fund your Deposit Balance.' });
      paymentWatchRef.current?.();
      paymentWatchRef.current = watchPaymentStatus(response.data.checkoutRequestId, (status) => {
        if (status === 'success') {
          setMessage({ type: 'success', text: 'Deposit completed successfully. Your balance has been updated.' });
          setTimeout(() => window.location.reload(), 1000);
        }
        if (status === 'failed') {
          setMessage({ type: 'error', text: 'Payment failed or was cancelled. Please try again.' });
        }
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to initiate deposit' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Deposit Funds</h1>
        <p className="text-gray-400">Load your Deposit Balance to activate bots and mining rigs instantly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form onSubmit={handleDeposit} className="bg-[#121212] border border-white/5 rounded-3xl p-8 space-y-6">
          <div className="w-16 h-16 bg-[#87ceeb]/10 rounded-2xl flex items-center justify-center text-[#87ceeb]">
            <ArrowUpCircle size={32} />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Deposit Amount (KSh)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">KSh</span>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-14 pr-4 py-4 text-xl text-white focus:border-[#87ceeb] outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Safaricom phone number</label>
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
            {submitting ? <Loader2 className="animate-spin" /> : 'Initiate Deposit'}
          </button>
        </form>

        <div className="space-y-6">
          <div className="bg-[#121212] border border-white/5 rounded-3xl p-8">
            <h3 className="font-bold text-white mb-6">Deposit Benefits</h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-[#87ceeb]/10 rounded-full flex items-center justify-center text-[#87ceeb] shrink-0">
                   <div className="font-bold text-xs">01</div>
                </div>
                <div>
                   <p className="text-white font-bold text-sm mb-1">Instant Activation</p>
                   <p className="text-xs text-gray-400">Funds in your deposit balance can be used to activate any bot instantly without re-entering PIN.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-[#87ceeb]/10 rounded-full flex items-center justify-center text-[#87ceeb] shrink-0">
                   <div className="font-bold text-xs">02</div>
                </div>
                <div>
                   <p className="text-white font-bold text-sm mb-1">Fee Free Internal Transfers</p>
                   <p className="text-xs text-gray-400">There are zero internal processing fees when using your balance for activations.</p>
                </div>
              </div>

              <div className="h-px bg-white/5" />

              <div className="bg-[#87ceeb]/5 border border-[#87ceeb]/10 p-6 rounded-2xl flex gap-3 text-[#87ceeb]">
                <Info size={20} className="shrink-0 mt-0.5" />
                <p className="text-xs">
                  Your deposit will appear in your balance immediately after you enter your M-Pesa PIN and the transaction is confirmed by Safaricom.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
