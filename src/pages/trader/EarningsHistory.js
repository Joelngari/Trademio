import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Wallet, TrendingUp, Calendar } from 'lucide-react';

export default function EarningsHistory() {
  const { user, profile } = useAuth();
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEarnings = async () => {
      try {
        const q = query(
          collection(db, 'earnings'),
          where('traderId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(q);
        setEarnings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('Failed to load earnings history', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.uid) {
      loadEarnings();
    }
  }, [user?.uid]);

  if (loading) return <SkeletonLoader type="table" />;

  const currency = profile?.preferredCurrency || 'KES';
  const totalEarned = earnings.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Earnings History</h1>
          <p className="text-gray-400">Total returns credited from your successful trading sessions.</p>
        </div>
        <div className="bg-[#87ceeb]/10 border border-[#87ceeb]/20 p-6 rounded min-w-[240px]">
           <p className="text-[10px] text-[#87ceeb] uppercase font-bold tracking-widest mb-1">Lifetime Earnings</p>
           <h2 className="text-3xl font-bold text-white">{formatCurrency(totalEarned, currency)}</h2>
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Source Plan</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Amount Earned</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Credited Date</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {earnings.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                    No earnings found yet. Complete a session to see your rewards here.
                  </td>
                </tr>
              ) : (
                earnings.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[#87ceeb]/10 flex items-center justify-center text-[#87ceeb]">
                           <TrendingUp size={14} />
                        </div>
                        <span className="text-sm font-bold text-white uppercase tracking-tight">{e.planName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-green-500 font-bold">
                      + {formatCurrency(e.amount, currency)}
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Calendar size={12} />
                          {e.createdAt?.toDate().toLocaleDateString() || 'Recently'}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="bg-green-500/10 text-green-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Credited</span>
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
