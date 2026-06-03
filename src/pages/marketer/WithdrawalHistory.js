import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { History, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';

export default function WithdrawalHistory() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'marketerPayouts'),
      where('marketerId', '==', user.uid),
      orderBy('requestedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setPayouts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [user.uid]);

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Withdrawal History</h1>
        <p className="text-gray-400">Status of all your previous commission payout requests.</p>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Payout Reference</th>
                <th className="px-6 py-5">M-Pesa Receipt</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-gray-500">
                    <History className="mx-auto mb-4 opacity-10" size={48} />
                    No previous withdrawals found.
                  </td>
                </tr>
              ) : (
                payouts
                  .filter(p => p.status === 'paid') // Only show completed payouts
                  .map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                       <div>
                          <p className="text-white font-bold text-xs uppercase">Payout #{p.id.slice(-6)}</p>
                          <p className="text-[10px] text-gray-500">ID: {p.id}</p>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-xs text-gray-400 uppercase font-bold tracking-widest">{p.mpesaReceiptNumber || '---'}</span>
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-white font-bold">{formatKSh(p.amount)}</span>
                    </td>
                    <td className="px-6 py-4">
                       <div className={`flex items-center gap-2 text-xs font-bold ${p.status === 'paid' ? 'text-green-500' : p.status === 'processing' ? 'text-orange-500' : 'text-red-500'}`}>
                          {p.status === 'paid' ? <CheckCircle2 size={12} /> : p.status === 'processing' ? <Clock size={12} /> : <XCircle size={12} />}
                          <span className="capitalize">{p.status}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                       {p.requestedAt?.toDate().toLocaleString() || 'Recently'}
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
