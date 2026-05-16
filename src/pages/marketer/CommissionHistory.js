import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { DollarSign, ArrowDownLeft, FileText, Calendar } from 'lucide-react';

export default function CommissionHistory() {
  const { user } = useAuth();
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'commissions'),
      where('marketerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setCommissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [user.uid]);

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Commission History</h1>
        <p className="text-gray-400">Chronological record of all earns from your recruiter pool.</p>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Source Transaction</th>
                <th className="px-6 py-5">Source Type</th>
                <th className="px-6 py-5">Payout Amount (85%)</th>
                <th className="px-6 py-5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {commissions.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-16 text-center text-gray-500">
                    <FileText className="mx-auto mb-4 opacity-10" size={48} />
                    No commissions recorded yet. Commissions appear once your traders activate bots or deposit.
                  </td>
                </tr>
              ) : (
                commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                           <DollarSign size={14} />
                        </div>
                        <div>
                          <p className="text-white font-bold uppercase text-[10px] tracking-widest">TRADER #{c.traderId.slice(-6)}</p>
                          <p className="text-[10px] text-gray-500">REF: {c.id.slice(-8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-400 font-bold uppercase tracking-tighter">{c.type || 'Deposit'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-green-500 font-bold">{formatKSh(c.commissionAmount)}</span>
                        <span className="text-[10px] text-gray-600">From {formatKSh(c.depositAmount)} deposit</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-normal text-gray-500">
                      <div className="flex items-center gap-2">
                        <Calendar size={12} />
                        {c.createdAt?.toDate().toLocaleString() || 'Recently'}
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
