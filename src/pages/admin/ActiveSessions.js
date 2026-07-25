import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { formatKSh } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Activity, Clock, CheckCircle2, MoreVertical } from 'lucide-react';

export default function ActiveSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const q = query(collection(db, 'sessions'), where('status', '==', 'active'));
        const snapshot = await getDocs(q);
        setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('Failed to load active sessions', err);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, []);

  const handleManualComplete = async (session) => {
     if (!window.confirm('Manually complete this session and credit the trader?')) return;
     
     try {
       await updateDoc(doc(db, 'sessions', session.id), { status: 'completed', creditedAt: new Date() });
       await updateDoc(doc(db, 'traders', session.traderId), { 
         tradingBalance: increment(session.expectedReturn),
         activeSessionId: null 
       });
     } catch (err) {
       alert('Failed to complete session');
     }
  };

  if (loading) return <SkeletonLoader type="table" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Active Trading Sessions</h1>
        <p className="text-gray-400">Live monitoring of all currently running platform activations.</p>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-medium">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-5">Trader ID</th>
                <th className="px-6 py-5">Plan</th>
                <th className="px-6 py-5">Return Amount</th>
                <th className="px-6 py-5">Ends In</th>
                <th className="px-6 py-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-gray-500">
                    No active sessions right now.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-white font-bold">{s.traderId.slice(-8)}</td>
                    <td className="px-6 py-4 capitalize text-gray-400">
                      <span className="text-[#87ceeb] block font-bold text-[10px] uppercase">{s.type}</span>
                      {s.planName}
                    </td>
                    <td className="px-6 py-4 font-bold text-green-500">{formatKSh(s.expectedReturn)}</td>
                    <td className="px-6 py-4">
                       <SessionCountdown endsAt={s.endsAt} />
                    </td>
                    <td className="px-6 py-4">
                       <button 
                        onClick={() => handleManualComplete(s)}
                        className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded transition-colors border border-white/10 text-xs font-bold"
                       >
                         Force Complete
                       </button>
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

function SessionCountdown({ endsAt }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = endsAt - Date.now();
      if (diff <= 0) {
        setTimeLeft('Completed');
        clearInterval(timer);
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  return (
    <div className="flex items-center gap-2 text-xs font-mono text-[#87ceeb]">
      <Clock size={12} />
      {timeLeft}
    </div>
  );
}
