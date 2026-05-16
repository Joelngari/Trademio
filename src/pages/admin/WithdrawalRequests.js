import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, where, onSnapshot, doc, updateDoc, increment } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ArrowDownCircle, Check, X, Clock, AlertCircle } from 'lucide-react';
import api from '../../services/api.js';

export default function WithdrawalRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    const q = query(collection(db, 'withdrawals'), where('status', '==', tab));
    const unsub = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [tab]);

  const handleApprove = async (req) => {
    if (!window.confirm('Approve this withdrawal? This will trigger B2C payment and deduct trader balance.')) return;
    try {
      // Backend handles B2C and balance deduction on success
      await api.post(`/admin/payouts/approve/${req.id}`);
      alert('Withdrawal approved and initiated');
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleReject = async (reqId) => {
    const note = window.prompt('Reason for rejection:');
    if (note === null) return;
    try {
      await updateDoc(doc(db, 'withdrawals', reqId), { status: 'review', adminNote: note });
    } catch (err) {
      alert('Failed to reject');
    }
  };

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Withdrawal Requests</h1>
        <p className="text-gray-400">Review and process trader fund withdrawals.</p>
      </div>

      <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-max">
        {['pending', 'approved', 'review'].map((t) => (
          <button
            key={t}
            onClick={() => {setTab(t); setLoading(true);}}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${tab === t ? 'bg-[#87ceeb] text-[#0a0a0a]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Trader ID</th>
                <th className="px-6 py-5">Phone</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Requested At</th>
                {tab === 'pending' && <th className="px-6 py-5 text-right">Actions</th>}
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
                       {r.requestedAt?.toDate().toLocaleString()}
                    </td>
                    {tab === 'pending' && (
                      <td className="px-6 py-4 text-right">
                         <div className="flex justify-end gap-2">
                           <button 
                            onClick={() => handleApprove(r)}
                            className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg border border-green-500/20"
                           >
                             <Check size={16} />
                           </button>
                           <button 
                            onClick={() => handleReject(r.id)}
                            className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg border border-red-500/20"
                           >
                             <X size={16} />
                           </button>
                         </div>
                      </td>
                    )}
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
