import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { CreditCard, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, XCircle } from 'lucide-react';

export default function PaymentHistory() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const q = query(
          collection(db, 'transactions'),
          where('traderId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(q);
        setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('Failed to load payment history', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.uid) {
      loadTransactions();
    }
  }, [user?.uid]);

  if (loading) return <SkeletonLoader type="table" />;

  const currency = profile?.preferredCurrency || 'KES';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Payment History</h1>
        <p className="text-gray-400">A detailed record of all your M-Pesa transactions.</p>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Transaction</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                transactions
                  .filter(t => t.status === 'success') // Only show successful transactions
                  .map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded flex items-center justify-center ${t.status === 'success' ? 'bg-green-500/10 text-green-500' : t.status === 'pending' ? 'bg-orange-500/10 text-orange-500' : 'bg-red-500/10 text-red-500'}`}>
                          {t.type === 'deposit' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white uppercase tracking-tight">{t.mpesaReceiptNumber || '---'}</p>
                          <p className="text-[10px] text-gray-500">{t.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-300 font-medium capitalize">{t.type.replace('-', ' ')}</span>
                    </td>
                    <td className="px-6 py-4 font-bold text-white">
                      {formatCurrency(t.totalAmount, currency)}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 text-xs font-bold ${t.status === 'success' ? 'text-green-500' : t.status === 'pending' ? 'text-orange-500' : 'text-red-500'}`}>
                        {t.status === 'success' ? <CheckCircle2 size={12} /> : t.status === 'pending' ? <Clock size={12} /> : <XCircle size={12} />}
                        <span className="capitalize">{t.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {t.createdAt?.toDate().toLocaleDateString()}
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
