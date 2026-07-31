import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, orderBy, getDocs, getDoc, doc } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const transactionList = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

        const traderNameMap = new Map();
        await Promise.all(
          transactionList.map(async (transaction) => {
            if (!transaction.traderId || traderNameMap.has(transaction.traderId)) return;

            const traderSnap = await getDoc(doc(db, 'users', transaction.traderId));
            const traderData = traderSnap.data() || {};
            traderNameMap.set(
              transaction.traderId,
              traderData.name || traderData.fullName || traderData.username || 'Unknown trader'
            );
          })
        );

        setTransactions(transactionList.map((transaction) => ({
          ...transaction,
          traderName: traderNameMap.get(transaction.traderId) || 'Unknown trader'
        })));
      } catch (err) {
        console.error('Failed to load transactions', err);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, []);

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Platform Transactions</h1>
        <p className="text-gray-400">Master record of all incoming STK pushes and status updates.</p>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Ref ID</th>
                <th className="px-6 py-5">Trader</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Type</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-6 py-4 font-mono text-[10px] text-gray-400">{t.id}</td>
                  <td className="px-6 py-4 font-bold text-white">{t.traderName}</td>
                  <td className="px-6 py-4 font-bold text-white">{formatKSh(t.totalAmount)}</td>
                  <td className="px-6 py-4 capitalize text-gray-400">{t.type}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {t.createdAt?.toDate().toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
