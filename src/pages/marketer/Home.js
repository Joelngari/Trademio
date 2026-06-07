import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { formatKSh } from '../../lib/currency.js';
import { db } from '../../lib/firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';
import { Share2, Copy, Check, Users, DollarSign, Award } from 'lucide-react';
import SkeletonLoader from '../../components/SkeletonLoader.js';

export default function MarketerHome() {
  const { user, profile } = useAuth();
  const [marketerData, setMarketerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'marketers', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setMarketerData(docSnap.data());
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user.uid]);

  const referralLink = `https://${window.location.host}/register?ref=${marketerData?.referralCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
     if (navigator.share) {
        try {
           await navigator.share({
              title: 'Velnix Markets',
              text: 'Join the best Kenyan investment platform and start earning!',
              url: referralLink
           });
        } catch (err) {}
     } else {
        copyToClipboard();
     }
  };

  if (loading) return <SkeletonLoader type="stats" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">Marketer Hub</h1>
           <p className="text-gray-400">Track your recruitment performance and commission payouts.</p>
        </div>
        <div className="bg-[#87ceeb]/10 border border-[#87ceeb]/20 p-4 rounded-2xl flex items-center gap-3">
           <div className="w-10 h-10 bg-[#87ceeb]/20 rounded-xl flex items-center justify-center text-[#87ceeb]">
              <Award size={20} />
           </div>
           <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Referral Code</p>
              <p className="text-sm font-bold text-white uppercase tracking-widest">{marketerData?.referralCode || 'PENDING'}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#121212] p-8 rounded-3xl border border-white/5 space-y-4">
           <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500">
              <DollarSign size={24} />
           </div>
           <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Commission Balance</p>
              <h2 className="text-3xl font-bold text-white">{formatKSh(marketerData?.commissionBalance || 0)}</h2>
           </div>
        </div>
        <div className="bg-[#121212] p-8 rounded-3xl border border-white/5 space-y-4">
           <div className="w-12 h-12 bg-[#87ceeb]/10 rounded-2xl flex items-center justify-center text-[#87ceeb]">
              <Award size={24} />
           </div>
           <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Total Earned</p>
              <h2 className="text-3xl font-bold text-white">{formatKSh(marketerData?.totalEarned || 0)}</h2>
           </div>
        </div>
        <div className="bg-[#121212] p-8 rounded-3xl border border-white/5 space-y-4">
           <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500">
              <Users size={24} />
           </div>
           <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Recruited Traders</p>
              <h2 className="text-3xl font-bold text-white">{marketerData?.totalTraders || 0}</h2>
           </div>
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-3xl p-8 md:p-12 relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
            <Share2 size={240} />
         </div>
         
         <div className="max-w-xl space-y-8 relative z-10">
            <div>
               <h3 className="text-2xl font-bold text-white mb-2">Invite Your Network</h3>
               <p className="text-gray-400">Earn 85% commission on every deposit or bot purchase your recruited traders make. There is no limit to your earnings.</p>
            </div>

            <div className="space-y-4">
               <label className="block text-xs font-medium text-gray-500 uppercase tracking-widest">Your Unique Referral Link</label>
               <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 font-mono truncate flex items-center">
                     {referralLink}
                  </div>
                  <div className="flex gap-2">
                     <button 
                        onClick={copyToClipboard}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-3 rounded-xl hover:bg-white/10 transition-colors"
                     >
                        {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                        {copied ? 'Copied' : 'Copy'}
                     </button>
                     <button 
                        onClick={handleShare}
                        className="flex items-center justify-center bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded-xl hover:bg-[#76b9d6] transition-all"
                     >
                        <Share2 size={18} />
                     </button>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6">
               <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Commission</p>
                  <p className="text-lg font-bold text-white">85.0%</p>
               </div>
               <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Payouts</p>
                  <p className="text-lg font-bold text-white">Instant</p>
               </div>
               <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Threshold</p>
                  <p className="text-lg font-bold text-white">KSh 10</p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
