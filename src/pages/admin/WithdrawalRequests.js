import React, { useState, useEffect } from 'react';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Check, X, Clock3 } from 'lucide-react';
import { adminApi } from '../../services/api.js';

export default function WithdrawalRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    const fetchWithdrawals = async () => {
      try {
        const response = await adminApi.getWithdrawals({ status: tab === 'all' ? undefined : tab });
        setRequests(response.data.withdrawals || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchWithdrawals();
  }, [tab]);

  const handleMarkPaid = async (req) => {
    const note = window.prompt('Add a note for the payment confirmation:');
    if (note === null) return;
    try {
      await adminApi.markWithdrawalPaid(req.id, { note });
      alert('Withdrawal marked as paid');
      setLoading(true);
      const response = await adminApi.getWithdrawals({ status: tab === 'all' ? undefined : tab });
      setRequests(response.data.withdrawals || []);
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleReject = async (req) => {
    const note = window.prompt('Reason for rejection:');
    if (note === null) return;
    try {
      await adminApi.rejectWithdrawal(req.id, { note });
      alert('Withdrawal rejected');
      setLoading(true);
      const response = await adminApi.getWithdrawals({ status: tab === 'all' ? undefined : tab });
      setRequests(response.data.withdrawals || []);
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Withdrawal Requests</h1>
        <p className="text-gray-400">Review and process trader fund withdrawals.</p>
      </div>

      <div className="flex gap-2 p-1 bg-white/5 rounded w-max flex-wrap">
        {['pending', 'verified', 'paid', 'rejected', 'all'].map((t) => (
          <button
            key={t}
            onClick={() => {setTab(t); setLoading(true);}}
            className={`px-6 py-2 rounded text-xs font-bold uppercase transition-all ${tab === t ? 'bg-[#87ceeb] text-[#0a0a0a]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Trader ID</th>
                <th className="px-6 py-5">Phone</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Requested At</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-gray-500">
                    No {tab} requests found.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 font-bold text-white uppercase">{r.traderId.slice(-8)}</td>
                    <td className="px-6 py-4 text-gray-400 font-mono">{r.phoneNumber}</td>
                    <td className="px-6 py-4">
                       <span className="text-xl font-bold text-white">{formatKSh(r.amount)}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                       {r.requestedAt ? new Date(r.requestedAt).toLocaleString() : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      <div className="space-y-1">
                        <div className="font-semibold text-white">{r.statusLabel || r.status}</div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Clock3 size={12} />
                          {r.nextActionAt ? new Date(r.nextActionAt).toLocaleString() : 'No deadline'}
                        </div>
                        <div className="text-gray-500">{r.adminNote || r.mpesaReceiptNumber || '—'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {r.status !== 'paid' && r.status !== 'rejected' && (
                          <>
                            <button 
                              onClick={() => handleMarkPaid(r)}
                              className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded border border-green-500/20"
                              title="Mark as paid"
                            >
                              <Check size={16} />
                            </button>
                            <button 
                              onClick={() => handleReject(r)}
                              className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded border border-red-500/20"
                              title="Reject request"
                            >
                              <X size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
