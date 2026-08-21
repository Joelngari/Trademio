import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { auth } from '../../lib/firebase.js';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Users, ShieldOff, Search, Eye, Plus, X, TrendingUp, Pencil, Check } from 'lucide-react';

export default function AdminMarketers() {
  const [marketers, setMarketers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMarketer, setSelectedMarketer] = useState(null);
  const [marketerDetails, setMarketerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [editingCommissionId, setEditingCommissionId] = useState(null);
  const [editingCommissionAmount, setEditingCommissionAmount] = useState('');
  const [editingCommissionReason, setEditingCommissionReason] = useState('');
  const [commissionSaving, setCommissionSaving] = useState(false);

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

  const handleFixReferralCodes = async () => {
    if (!window.confirm('Run the referral code fix for all marketers? This will populate missing referralCode values and create missing marketer docs.')) {
      return;
    }

    setCleanupLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/fix-referral-codes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to run referral code fix');
      }

      alert(data.message || 'Referral codes fixed successfully');
    } catch (err) {
      alert('Error: ' + (err.message || err));
    } finally {
      setCleanupLoading(false);
    }
  };

  const startCommissionEdit = (commission) => {
    setEditingCommissionId(commission.id);
    setEditingCommissionAmount(String(commission.commissionAmount ?? ''));
    setEditingCommissionReason('');
  };

  const cancelCommissionEdit = () => {
    setEditingCommissionId(null);
    setEditingCommissionAmount('');
    setEditingCommissionReason('');
  };

  const saveCommissionEdit = async (commissionId) => {
    const amount = Number(editingCommissionAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      alert('Enter a valid non-negative amount');
      return;
    }
    if (editingCommissionReason.trim().length < 3) {
      alert('Enter a reason for this correction');
      return;
    }

    setCommissionSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/commission/${commissionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount, reason: editingCommissionReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update commission');
      cancelCommissionEdit();
      await handleViewMarketerDetails(selectedMarketer);
      alert('Commission updated successfully');
    } catch (err) {
      alert('Error: ' + (err.message || err));
    } finally {
      setCommissionSaving(false);
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
      <div className="flex flex-col gap-6">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">Marketer Management</h1>
           <p className="text-gray-400">Total of {marketers.length} active platform marketers.</p>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
           <button onClick={handleFixReferralCodes} disabled={cleanupLoading} className="self-start bg-purple-600 text-white px-6 py-3 rounded font-bold hover:bg-purple-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
             <TrendingUp size={18} />
             {cleanupLoading ? 'Fixing referrals...' : 'Fix Referrals'}
           </button>
           <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full md:w-auto">
             <div className="relative group flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input 
                  type="text" 
                  placeholder="Search marketers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#121212] border border-white/5 rounded pl-12 pr-6 py-3 text-white focus:border-[#87ceeb] outline-none transition-all w-full md:w-64"
                />
             </div>
             <button onClick={() => handleAddMarketer()} className="bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded font-bold hover:bg-[#76b9d6] transition-all flex items-center gap-2">
               <Plus size={18} />
               Add Marketer
             </button>
           </div>
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
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
                  <td className="px-6 py-4 font-bold text-[#87ceeb] tracking-widest">{(t.referralCode && t.referralCode !== 'undefined') ? t.referralCode : 'ADMIN'}</td>
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
                      className="p-2 bg-white/5 text-gray-400 hover:text-[#87ceeb] hover:bg-white/10 rounded transition-colors"
                      title="View details"
                    >
                      <Eye size={16} />
                    </button>
                    <button className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded transition-colors">
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
          <div className="bg-[#121212] border border-white/10 rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
                  className="p-2 hover:bg-white/5 rounded transition-colors"
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
                    <div className="bg-white/5 border border-white/10 rounded p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Total Commission</p>
                      <p className="text-2xl font-bold text-[#87ceeb]">{formatKSh(marketerDetails.totalCommission)}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Commission Balance</p>
                      <p className="text-2xl font-bold text-green-400">{formatKSh(marketerDetails.commissionBalance)}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white mb-4">Commission History</h3>
                    {marketerDetails.commissions?.length ? (
                      <div className="bg-white/5 border border-white/10 rounded overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/10 text-xs uppercase tracking-widest text-gray-500">
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Amount</th>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {marketerDetails.commissions.map((commission, index) => (
                              <tr key={commission.id}>
                                <td className="px-4 py-3 text-gray-400">{commission.type || 'Deposit'}</td>
                                <td className="px-4 py-3">
                                  {index < 3 && editingCommissionId === commission.id ? (
                                    <div className="flex min-w-56 flex-col gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editingCommissionAmount}
                                        onChange={(event) => setEditingCommissionAmount(event.target.value)}
                                        className="w-32 rounded border border-white/10 bg-black/20 px-2 py-1 text-white outline-none focus:border-[#87ceeb]"
                                        aria-label="New commission amount"
                                        autoFocus
                                      />
                                      <input
                                        type="text"
                                        value={editingCommissionReason}
                                        onChange={(event) => setEditingCommissionReason(event.target.value)}
                                        placeholder="Correction reason"
                                        className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white outline-none focus:border-[#87ceeb]"
                                        aria-label="Correction reason"
                                      />
                                    </div>
                                  ) : (
                                    <span className="font-bold text-green-400">{formatKSh(commission.commissionAmount)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                  {commission.createdAt?.seconds
                                    ? new Date(commission.createdAt.seconds * 1000).toLocaleString()
                                    : 'Recently'}
                                </td>
                                <td className="px-4 py-3">
                                  {index < 3 && editingCommissionId === commission.id ? (
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => saveCommissionEdit(commission.id)} disabled={commissionSaving} className="text-green-400 hover:text-green-300 disabled:opacity-50" title="Save commission" aria-label="Save commission">
                                        <Check size={16} />
                                      </button>
                                      <button type="button" onClick={cancelCommissionEdit} disabled={commissionSaving} className="text-gray-400 hover:text-white disabled:opacity-50" title="Cancel edit" aria-label="Cancel edit">
                                        <X size={16} />
                                      </button>
                                    </div>
                                  ) : index < 3 ? (
                                    <button type="button" onClick={() => startCommissionEdit(commission)} className="text-gray-400 hover:text-[#87ceeb]" title="Edit commission" aria-label="Edit commission">
                                      <Pencil size={16} />
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-600">Locked</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="rounded border border-white/10 bg-white/5 p-4 text-sm text-gray-500">No commissions recorded.</p>
                    )}
                  </div>

                  {/* Recruited Traders */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={20} className="text-[#87ceeb]" />
                      <h3 className="text-lg font-bold text-white">Recruited Traders ({marketerDetails.tradersCount})</h3>
                    </div>

                    {marketerDetails.tradersCount > 0 ? (
                      <div className="space-y-3 bg-white/5 border border-white/10 rounded p-4 max-h-64 overflow-y-auto">
                        {marketerDetails.traders.map((trader) => (
                          <div key={trader.id} className="flex items-center justify-between p-3 bg-white/[0.02] rounded border border-white/5 hover:border-white/10 transition-colors">
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
                      <div className="text-center py-8 bg-white/5 border border-white/10 rounded">
                        <p className="text-gray-500">No recruited traders yet</p>
                      </div>
                    )}
                  </div>

                  {/* Marketer Info */}
                  <div className="bg-white/5 border border-white/10 rounded p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Email:</span>
                      <span className="text-white font-medium">{selectedMarketer.email}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                      <span className="text-gray-500">UID:</span>
                      <span className="text-white font-medium break-all">{selectedMarketer.uid || selectedMarketer.id || 'N/A'}</span>
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
