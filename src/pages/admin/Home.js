import React, { useState, useEffect } from 'react';
import { adminApi } from '../../services/api.js';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { 
  DollarSign, ShieldCheck, Users, Activity, FileText, 
  ArrowUpRight, TrendingUp, Clock, AlertTriangle 
} from 'lucide-react';

export default function AdminHome() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await adminApi.getDashboard();
        setData(response.data);
      } catch (err) {
          console.error(err);
          if (typeof window !== 'undefined' && window.showAppError) window.showAppError(err.message || err.response?.data?.message || 'Failed to load admin dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <SkeletonLoader type="stats" />;

  const { stats, recentTransactions } = data || {};

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Platform Overview</h1>
        <p className="text-gray-400">Real-time statistics across all user segments.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#121212] p-8 rounded border border-white/5 space-y-4">
           <div className="flex justify-between items-start">
             <div className="w-12 h-12 bg-[#87ceeb]/10 rounded flex items-center justify-center text-[#87ceeb]">
                <TrendingUp size={24} />
             </div>
             <span className="text-[10px] text-[#87ceeb] font-bold bg-[#87ceeb]/5 px-3 py-1 rounded-full uppercase tracking-widest">Revenue</span>
           </div>
           <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Total Platform Volume</p>
              <h2 className="text-3xl font-bold text-white">{formatKSh(stats.totalRevenue)}</h2>
           </div>
        </div>

        <div className="bg-[#121212] p-8 rounded border border-white/5 space-y-4">
           <div className="flex justify-between items-start">
             <div className="w-12 h-12 bg-green-500/10 rounded flex items-center justify-center text-green-500">
                <ShieldCheck size={24} />
             </div>
             <span className="text-[10px] text-green-500 font-bold bg-green-500/5 px-3 py-1 rounded-full uppercase tracking-widest">Admin Profit</span>
           </div>
           <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Admin 15% Net Cut</p>
              <h2 className="text-3xl font-bold text-white">{formatKSh(stats.adminCut)}</h2>
           </div>
        </div>

        <div className="bg-[#121212] p-8 rounded border border-white/5 space-y-4">
           <div className="flex justify-between items-start">
             <div className="w-12 h-12 bg-purple-500/10 rounded flex items-center justify-center text-purple-500">
                <Activity size={24} />
             </div>
             <span className="text-[10px] text-purple-500 font-bold bg-purple-500/5 px-3 py-1 rounded-full uppercase tracking-widest">Sessions</span>
           </div>
           <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Live Active Sessions</p>
              <h2 className="text-3xl font-bold text-white">{stats.activeSessions}</h2>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-orange-500/5 border border-orange-500/20 p-6 rounded flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-orange-500/10 rounded flex items-center justify-center text-orange-500">
                <Clock size={24} />
             </div>
             <div>
                <p className="text-orange-500 font-bold text-xl">{stats.pendingWithdrawals}</p>
                <p className="text-xs text-orange-500/60 uppercase font-bold tracking-wider">Pending Trader Withdrawals</p>
             </div>
           </div>
           <ArrowUpRight className="text-orange-500/40" />
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 p-6 rounded flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-blue-500/10 rounded flex items-center justify-center text-blue-500">
                <Users size={24} />
             </div>
             <div>
                <p className="text-blue-500 font-bold text-xl">{stats.totalMarketers}</p>
                <p className="text-xs text-blue-500/60 uppercase font-bold tracking-wider">Active Marketers</p>
             </div>
           </div>
           <ArrowUpRight className="text-blue-500/40" />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
           <h3 className="font-bold text-white">Recent Transactions</h3>
           <FileText size={18} className="text-gray-600" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">User</th>
                <th className="px-6 py-5">Type</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {recentTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-bold uppercase text-[10px]">USER #{t.traderId.slice(-6)}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-400 capitalize">{t.type}</td>
                  <td className="px-6 py-4 font-bold text-white">{formatKSh(t.totalAmount)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${t.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString()}
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
