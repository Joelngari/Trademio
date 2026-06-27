import React, { useState, useEffect } from 'react';
import { adminApi } from '../../services/api.js';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Search, CheckCircle, Zap, X, AlertCircle } from 'lucide-react';
import { auth } from '../../lib/firebase.js';

const getErrorMessage = (error) => {
  return error?.response?.data?.message || error?.message || 'An unexpected error occurred';
};

export default function AdminBotPurchases() {
  const [botPurchases, setBotPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpNote, setTopUpNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchBotPurchases();
  }, []);

  const fetchBotPurchases = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getBotPurchases({ status: 'pending' });
      setBotPurchases(res.data.botPurchases || []);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load bot purchases: ' + getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    if (!selectedPurchase || !topUpAmount || parseFloat(topUpAmount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    setActionLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await adminApi.topUpBotPurchase(selectedPurchase.id, parseFloat(topUpAmount), topUpNote);
      setMessage({ type: 'success', text: res.data.message });
      setSelectedPurchase(null);
      setTopUpAmount('');
      setTopUpNote('');
      setTimeout(() => {
        fetchBotPurchases();
      }, 1000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Top-up failed: ' + getErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedPurchase) return;

    setActionLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await adminApi.markBotPurchasePaid(selectedPurchase.id, `Admin approved - ${new Date().toLocaleString()}`);
      setMessage({ type: 'success', text: res.data.message });
      setSelectedPurchase(null);
      setTopUpAmount('');
      setTopUpNote('');
      setTimeout(() => {
        fetchBotPurchases();
      }, 1000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Mark paid failed: ' + getErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = botPurchases.filter(bp =>
    !searchTerm ||
    bp.traderInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bp.traderInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bp.packageInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Bot Purchases</h1>
          <p className="text-gray-400">Manage {botPurchases.length} pending bot purchase(s).</p>
        </div>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Search traders or packages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#121212] border border-white/5 rounded pl-12 pr-6 py-3 text-white placeholder:text-gray-600 focus:border-[#87ceeb] outline-none transition-all w-full md:w-80"
          />
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded border flex items-start gap-3 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <p>{message.text}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No pending bot purchases</p>
        </div>
      ) : (
        <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-medium">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                  <th className="px-6 py-5">Trader</th>
                  <th className="px-6 py-5">Package</th>
                  <th className="px-6 py-5">Progress</th>
                  <th className="px-6 py-5">Outstanding</th>
                  <th className="px-6 py-5">Contributors</th>
                  <th className="px-6 py-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filtered.map((bp) => (
                  <tr key={bp.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white font-bold">{bp.traderInfo?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{bp.traderInfo?.email || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white font-medium">{bp.packageInfo?.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{bp.packageInfo?.type || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">{formatKSh(bp.amountPaid)}</span>
                          <span className="text-xs text-gray-400">{formatKSh(bp.requiredAmount)}</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-2">
                          <div
                            className="bg-[#87ceeb] h-2 rounded-full transition-all"
                            style={{ width: `${(bp.amountPaid / bp.requiredAmount) * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {Math.round((bp.amountPaid / bp.requiredAmount) * 100)}%
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-lg font-bold text-yellow-500">{formatKSh(bp.outstandingAmount)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-500">
                        {bp.contributors?.length || 0} payment(s)
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          setSelectedPurchase(bp);
                          setTopUpAmount(bp.outstandingAmount.toString());
                          setTopUpNote('');
                        }}
                        className="px-3 py-1 bg-[#87ceeb]/10 text-[#87ceeb] hover:bg-[#87ceeb]/20 rounded text-xs font-semibold transition-colors"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#121212] border border-white/10 rounded max-w-md w-full p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedPurchase.packageInfo?.name}</h2>
                <p className="text-sm text-gray-400 mt-1">{selectedPurchase.traderInfo?.name}</p>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-4 mb-6 bg-white/5 rounded p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Required Amount:</span>
                <span className="text-white font-bold">{formatKSh(selectedPurchase.requiredAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Already Paid:</span>
                <span className="text-green-400 font-bold">{formatKSh(selectedPurchase.amountPaid)}</span>
              </div>
              <div className="border-t border-white/10 pt-4 flex justify-between text-sm">
                <span className="text-gray-400">Outstanding:</span>
                <span className="text-yellow-500 font-bold text-lg">{formatKSh(selectedPurchase.outstandingAmount)}</span>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Top-up Amount</label>
                <input
                  type="number"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  min="0"
                  max={selectedPurchase.outstandingAmount}
                  className="w-full bg-white/10 border border-white/20 rounded px-4 py-2 text-white font-semibold focus:border-[#87ceeb] outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max: {formatKSh(selectedPurchase.outstandingAmount)}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Note (Optional)</label>
                <input
                  type="text"
                  value={topUpNote}
                  onChange={(e) => setTopUpNote(e.target.value)}
                  placeholder="Admin note or reason"
                  className="w-full bg-white/10 border border-white/20 rounded px-4 py-2 text-white text-sm focus:border-[#87ceeb] outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTopUp}
                disabled={actionLoading || !topUpAmount || parseFloat(topUpAmount) <= 0}
                className="flex-1 bg-[#87ceeb] text-[#0a0a0a] py-3 rounded font-bold hover:bg-[#76b9d6] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? 'Processing...' : (
                  <>
                    <Zap size={18} />
                    Top-up
                  </>
                )}
              </button>

              <button
                onClick={handleMarkPaid}
                disabled={actionLoading}
                className="flex-1 bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? 'Processing...' : (
                  <>
                    <CheckCircle size={18} />
                    Mark Paid
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => setSelectedPurchase(null)}
              className="w-full mt-3 bg-white/5 text-gray-400 py-2 rounded font-semibold hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
