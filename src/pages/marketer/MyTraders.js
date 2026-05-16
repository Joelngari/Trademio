import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Users, Mail, Phone, Calendar, Search } from 'lucide-react';

export default function MyTraders() {
  const { user } = useAuth();
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('marketerId', '==', user.uid),
      where('role', '==', 'trader'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setTraders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [user.uid]);

  const filteredTraders = traders.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">My Recruited Traders</h1>
           <p className="text-gray-400">Total of {traders.length} traders registered using your referral code.</p>
        </div>
        <div className="relative group">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#87ceeb] transition-colors" size={18} />
           <input 
            type="text" 
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#121212] border border-white/5 rounded-xl pl-12 pr-6 py-3 text-white placeholder:text-gray-600 focus:border-[#87ceeb] outline-none transition-all w-full md:w-80"
           />
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Trader Name</th>
                <th className="px-6 py-5">Contact Details</th>
                <th className="px-6 py-5">Joined Date</th>
                <th className="px-6 py-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filteredTraders.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-16 text-center text-gray-500">
                    <Users className="mx-auto mb-4 opacity-10" size={48} />
                    {searchTerm ? 'No traders matching your search.' : 'No traders recruited yet. Share your link to start earning!'}
                  </td>
                </tr>
              ) : (
                filteredTraders.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white font-bold">{t.name}</p>
                        <p className="text-xs text-gray-500">@{t.username}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Mail size={12} />
                        <span className="text-xs">{t.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Phone size={12} />
                        <span className="text-xs">{t.phoneNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar size={12} />
                        {t.createdAt?.toDate().toLocaleDateString() || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${t.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        {t.status}
                      </span>
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
