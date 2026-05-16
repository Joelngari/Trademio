import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Users, Shield, ShieldOff, Search, Eye, Plus } from 'lucide-react';

export default function AdminMarketers() {
  const [marketers, setMarketers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'marketer'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMarketers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = marketers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">Marketer Management</h1>
           <p className="text-gray-400">Total of {marketers.length} active platform marketers.</p>
        </div>
        <div className="flex gap-4">
           <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="text" 
                placeholder="Search marketers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#121212] border border-white/5 rounded-xl pl-12 pr-6 py-3 text-white focus:border-[#87ceeb] outline-none transition-all w-full md:w-64"
              />
           </div>
           <button className="bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded-xl font-bold hover:bg-[#76b9d6] transition-all flex items-center gap-2">
              <Plus size={18} />
              Add Marketer
           </button>
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Marketer</th>
                <th className="px-6 py-5">Referral Code</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Date Joined</th>
                <th className="px-6 py-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-6 py-4 font-bold text-white">{t.name}</td>
                  <td className="px-6 py-4 font-bold text-[#87ceeb] tracking-widest">{t.referralCode || 'ADMIN'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${t.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {t.createdAt?.toDate().toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button className="p-2 bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors">
                      <Eye size={16} />
                    </button>
                    <button className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors">
                      <ShieldOff size={16} />
                    </button>
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
