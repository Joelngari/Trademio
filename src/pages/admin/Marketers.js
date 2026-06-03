import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth } from '../../lib/firebase.js';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Users, Shield, ShieldOff, Search, Eye, Plus, X, TrendingUp } from 'lucide-react';

export default function AdminMarketers() {
  const [marketers, setMarketers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMarketer, setSelectedMarketer] = useState(null);
  const [marketerDetails, setMarketerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

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

  const handleViewMarketerDetails = async (marketer) => {
    setSelectedMarketer(marketer);
    setDetailsLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/marketer/${marketer.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setMarketerDetails(data);
    } catch (err) {
      alert('Error fetching marketer details: ' + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  async function handleAddMarketer() {
    try {
      const fullName = window.prompt('Full name for marketer');
      if (!fullName) return;
      const username = window.prompt('Username (no spaces)');
      if (!username) return;
      const email = window.prompt('Email');
      if (!email) return;
      const password = window.prompt('Temporary password (min 6 chars)');
      if (!password) return;
      const phoneNumber = window.prompt('Phone number (optional)');

      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/marketer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, username, email, password, phoneNumber })
      });

      // Handle possible empty or non-JSON responses gracefully
      const text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Not JSON - keep raw text
          data = { message: text };
        }
      }

      if (!res.ok) {
        throw new Error(data.message || `Request failed with status ${res.status}`);
      }

      alert(data.message || 'Marketer created successfully');
    } catch (err) {
      alert('Error: ' + (err.message || err));
    }
  }

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
           <button onClick={() => handleAddMarketer()} className="bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded-xl font-bold hover:bg-[#76b9d6] transition-all flex items-center gap-2">
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
                    <button 
                      onClick={() => handleViewMarketerDetails(t)}
                      className="p-2 bg-white/5 text-gray-400 hover:text-[#87ceeb] hover:bg-white/10 rounded-lg transition-colors"
                      title="View details"
                    >
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

      {/* Marketer Details Modal */}
      {selectedMarketer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#121212] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedMarketer.name}</h2>
                  <p className="text-sm text-gray-400 mt-1">@{selectedMarketer.username}</p>
                </div>
                <button 
                  onClick={() => {
                    setSelectedMarketer(null);
                    setMarketerDetails(null);
                  }}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X size={24} className="text-gray-400" />
                </button>
              </div>

              {detailsLoading ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">Loading details...</p>
                </div>
              ) : marketerDetails ? (
                <>
                  {/* Commission Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Total Commission</p>
                      <p className="text-2xl font-bold text-[#87ceeb]">{formatKSh(marketerDetails.totalCommission)}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Commission Balance</p>
                      <p className="text-2xl font-bold text-green-400">{formatKSh(marketerDetails.commissionBalance)}</p>
                    </div>
                  </div>

                  {/* Recruited Traders */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={20} className="text-[#87ceeb]" />
                      <h3 className="text-lg font-bold text-white">Recruited Traders ({marketerDetails.tradersCount})</h3>
                    </div>

                    {marketerDetails.tradersCount > 0 ? (
                      <div className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-4 max-h-64 overflow-y-auto">
                        {marketerDetails.traders.map((trader) => (
                          <div key={trader.id} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                            <div>
                              <p className="text-sm font-bold text-white">{trader.name}</p>
                              <p className="text-xs text-gray-500">@{trader.username}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Trading Balance</p>
                              <p className="text-sm font-bold text-green-400">{formatKSh(trader.tradingBalance || 0)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-white/5 border border-white/10 rounded-xl">
                        <p className="text-gray-500">No recruited traders yet</p>
                      </div>
                    )}
                  </div>

                  {/* Marketer Info */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Email:</span>
                      <span className="text-white font-medium">{selectedMarketer.email}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                      <span className="text-gray-500">Status:</span>
                      <span className={`font-bold ${selectedMarketer.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                        {selectedMarketer.status}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-red-400">Failed to load details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
