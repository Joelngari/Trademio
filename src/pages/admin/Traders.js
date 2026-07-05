import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Users, Shield, ShieldOff, Search, Eye, X, Edit2 } from 'lucide-react';
import { auth } from '../../lib/firebase.js';

export default function AdminTraders() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [traderDetails, setTraderDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'trader'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async (snapshot) => {
      const tradersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Enrich traders with marketer names
      const enrichedTraders = await Promise.all(
        tradersData.map(async (trader) => {
          if (trader.marketerId && trader.marketerId !== 'ADMIN') {
            try {
              const marketerDoc = await getDoc(doc(db, 'users', trader.marketerId));
              if (marketerDoc.exists()) {
                return { ...trader, marketerName: marketerDoc.data().name };
              }
            } catch (err) {
              console.error('Error fetching marketer:', err);
            }
          }
          return { ...trader, marketerName: trader.marketerId === 'ADMIN' ? 'Admin' : trader.marketerId };
        })
      );
      
      setTraders(enrichedTraders);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleToggleStatus = async (traderId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'users', traderId), { status: newStatus });
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleViewTraderDetails = async (trader) => {
    setSelectedTrader(trader);
    setDetailsLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/trader/${trader.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setTraderDetails(data);
      setEditFormData({
        tradingBalance: data.tradingBalance || 0,
        depositBalance: data.depositBalance || 0,
        email: data.email || ''
      });
    } catch (err) {
      alert('Error fetching trader details: ' + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!traderDetails) return;
    
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/trader/${traderDetails.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tradingBalance: parseFloat(editFormData.tradingBalance) || 0,
          depositBalance: parseFloat(editFormData.depositBalance) || 0,
          email: editFormData.email
        })
      });

      if (!res.ok) {
        throw new Error('Failed to update trader');
      }

      alert('Trader updated successfully');
      setIsEditing(false);
      // Refresh the details
      handleViewTraderDetails(selectedTrader);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handlePromoteToMarketer = async (trader) => {
    if (!trader) return;
    
    const confirmPromotion = window.confirm(`Promote ${trader.name} to marketer?\n\nReferral Code: ${trader.username.toUpperCase()}`);
    if (!confirmPromotion) return;

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/promote-to-marketer/${trader.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to promote trader');
      }

      const data = await res.json();
      alert(`${trader.name} promoted to marketer!\nReferral Code: ${data.referralCode}`);
      setSelectedTrader(null);
      setTraderDetails(null);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const filtered = traders.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">Traders Management</h1>
           <p className="text-gray-400">Manage {traders.length} active platform traders.</p>
        </div>
        <div className="relative group">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
           <input 
            type="text" 
            placeholder="Search traders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#121212] border border-white/5 rounded pl-12 pr-6 py-3 text-white placeholder:text-gray-600 focus:border-[#87ceeb] outline-none transition-all w-full md:w-80"
           />
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Trader</th>
                <th className="px-6 py-5">Email</th>
                <th className="px-6 py-5">Linked Marketer</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Date Joined</th>
                <th className="px-6 py-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-white font-bold">{t.name}</p>
                      <p className="text-xs text-gray-500">@{t.username}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-gray-400">{t.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-[#87ceeb] font-bold uppercase tracking-widest">
                      {t.marketerId === 'ADMIN' ? 'Admin' : (t.marketerName || t.marketerId)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${t.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {t.createdAt?.toDate().toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                       <button 
                        onClick={() => handleViewTraderDetails(t)}
                        className="p-2 bg-white/5 text-gray-400 hover:text-[#87ceeb] hover:bg-white/10 rounded transition-colors"
                        title="View details"
                       >
                         <Eye size={16} />
                       </button>
                       <button 
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className={`p-2 rounded transition-colors ${t.status === 'active' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'}`}
                        title={t.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                       >
                         {t.status === 'active' ? <ShieldOff size={16} /> : <Shield size={16} />}
                       </button>
                       {t.role === 'trader' && (
                         <button
                           onClick={() => handlePromoteToMarketer(t)}
                           className="p-2 bg-purple-600 text-white hover:bg-purple-700 rounded transition-colors"
                           title="Promote to marketer"
                         >
                           M
                         </button>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trader Details Modal */}
      {selectedTrader && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#121212] border border-white/10 rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedTrader.name}</h2>
                  <p className="text-sm text-gray-400 mt-1">@{selectedTrader.username}</p>
                </div>
                <div className="flex gap-2">
                  {isEditing && (
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="p-2 hover:bg-white/5 rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={20} className="text-gray-400" />
                    </button>
                  )}
                  {!isEditing && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="p-2 hover:bg-white/5 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={20} className="text-[#87ceeb]" />
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setSelectedTrader(null);
                      setTraderDetails(null);
                      setIsEditing(false);
                    }}
                    className="p-2 hover:bg-white/5 rounded transition-colors"
                  >
                    <X size={24} className="text-gray-400" />
                  </button>
                </div>
              </div>

              {detailsLoading ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">Loading details...</p>
                </div>
              ) : traderDetails ? (
                <>
                  {/* Account Info */}
                  <div className="bg-white/5 border border-white/10 rounded p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Email:</span>
                      {isEditing ? (
                        <input 
                          type="email"
                          value={editFormData.email}
                          onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                        />
                      ) : (
                        <span className="text-white font-medium">{traderDetails.email}</span>
                      )}
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                      <span className="text-gray-500">UID:</span>
                      <span className="text-white font-medium break-all">{traderDetails.uid || traderDetails.id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                      <span className="text-gray-500">Linked Marketer:</span>
                      <span className="text-[#87ceeb] font-bold">{traderDetails.marketerName}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                      <span className="text-gray-500">Status:</span>
                      <span className={`font-bold ${traderDetails.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                        {traderDetails.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                      <span className="text-gray-500">Date Joined:</span>
                      <span className="text-white font-medium">{traderDetails.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Balance Info */}
                  <div className="space-y-3">
                    <div className="bg-white/5 border border-white/10 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-gray-500 uppercase tracking-widest">Trading Balance</label>
                        {isEditing && <span className="text-xs text-yellow-400">Editing</span>}
                      </div>
                      {isEditing ? (
                        <input 
                          type="number"
                          value={editFormData.tradingBalance}
                          onChange={(e) => setEditFormData({...editFormData, tradingBalance: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white font-bold text-lg"
                        />
                      ) : (
                        <p className="text-2xl font-bold text-green-400">{formatKSh(traderDetails.tradingBalance || 0)}</p>
                      )}
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-gray-500 uppercase tracking-widest">Deposit Balance</label>
                        {isEditing && <span className="text-xs text-yellow-400">Editing</span>}
                      </div>
                      {isEditing ? (
                        <input 
                          type="number"
                          value={editFormData.depositBalance}
                          onChange={(e) => setEditFormData({...editFormData, depositBalance: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white font-bold text-lg"
                        />
                      ) : (
                        <p className="text-2xl font-bold text-blue-400">{formatKSh(traderDetails.depositBalance || 0)}</p>
                      )}
                    </div>
                  </div>

                  {/* Save Button */}
                  {isEditing && (
                    <button 
                      onClick={handleSaveChanges}
                      className="w-full bg-[#87ceeb] text-[#0a0a0a] py-3 rounded font-bold hover:bg-[#76b9d6] transition-all"
                    >
                      Save Changes
                    </button>
                  )}

                  {/* Promote Button */}
                  {!isEditing && traderDetails.role === 'trader' && (
                    <button 
                      onClick={handlePromoteToMarketer}
                      className="w-full bg-purple-600 text-white py-3 rounded font-bold hover:bg-purple-700 transition-all"
                    >
                      Promote to Marketer
                    </button>
                  )}
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
