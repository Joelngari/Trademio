import React, { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { RefreshCw } from 'lucide-react';

export default function MarketerPayouts() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/marketer-payouts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setPayouts(data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const filteredPayouts = statusFilter === 'all' 
    ? payouts 
    : payouts.filter(p => p.status === statusFilter);

  const getStatusColor = (status) => {
    switch(status) {
      case 'paid': return 'bg-green-500/10 text-green-500';
      case 'processing': return 'bg-blue-500/10 text-blue-500';
      case 'failed': return 'bg-red-500/10 text-red-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  const formatDate = (value) => {
    if (!value) return 'N/A';
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleString();
    if (typeof value === 'string') return new Date(value).toLocaleString();
    if (value?.seconds) return new Date(value.seconds * 1000).toLocaleString();
    return 'N/A';
  };

  if (loading) return <SkeletonLoader type="card" />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Marketer Payouts</h1>
          <p className="text-gray-400">View all marketer withdrawal requests and payout history.</p>
        </div>
        <button onClick={fetchPayouts} className="bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded font-bold hover:bg-[#76b9d6] flex items-center gap-2">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'paid', 'processing', 'failed'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded font-semibold transition ${
              statusFilter === status
                ? 'bg-[#87ceeb] text-[#0a0a0a]'
                : 'bg-white/5 text-white hover:bg-white/10'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        {filteredPayouts.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No payouts found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/5">
                  <th className="px-6 py-3 text-left text-gray-400">Marketer Name</th>
                  <th className="px-6 py-3 text-left text-gray-400">Amount</th>
                  <th className="px-6 py-3 text-left text-gray-400">Status</th>
                  <th className="px-6 py-3 text-left text-gray-400">Requested Date</th>
                  <th className="px-6 py-3 text-left text-gray-400">Phone Number</th>
                  <th className="px-6 py-3 text-left text-gray-400">Receipt / Note</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayouts.map((payout) => (
                  <tr key={payout.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-6 py-4 text-white font-medium">{payout.marketerName || 'Unknown'}</td>
                    <td className="px-6 py-4 text-white">KES {payout.amount?.toLocaleString() || 0}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(payout.status)}`}>
                        {payout.status?.toUpperCase() || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{formatDate(payout.requestedAt)}</td>
                    <td className="px-6 py-4 text-gray-400">{payout.phoneNumber || 'N/A'}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {payout.mpesaReceiptNumber || payout.failReason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
