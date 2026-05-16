import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi } from '../../services/api.js';
import { db } from '../../lib/firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { RefreshCw, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Trades() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setData(response.data);
        setLoading(false);
        
        if (response.data.activeSession) {
          // Listen for real-time changes to the session
          const sessionRef = doc(db, 'sessions', response.data.activeSession.id);
          const unsub = onSnapshot(sessionRef, (docSnap) => {
            if (docSnap.exists()) {
              setActiveSession(docSnap.data());
            } else {
              setActiveSession(null);
            }
          });
          return () => unsub();
        }
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = activeSession.endsAt - now;

      if (diff <= 0) {
        setTimeLeft('Processing...');
        clearInterval(timer);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      let str = '';
      if (days > 0) str += `${days}d `;
      if (hours > 0 || days > 0) str += `${hours}h `;
      str += `${mins}m ${secs}s`;
      
      setTimeLeft(str);
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession]);

  if (loading) return <SkeletonLoader type="card" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Live Activations</h1>
        <p className="text-gray-400">Monitor your active trading sessions and mining rigs in real-time.</p>
      </div>

      {!activeSession ? (
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-12 text-center space-y-6">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-500">
            <RefreshCw size={40} className="opacity-20" />
          </div>
          <div className="max-w-xs mx-auto">
            <h3 className="text-xl font-bold text-white mb-2">No Active Session</h3>
            <p className="text-gray-500 text-sm mb-8">You don't have any bots or investment plans running at the moment.</p>
            <Link 
              to="/trader/forex" 
              className="inline-flex items-center gap-2 bg-[#87ceeb] text-[#0a0a0a] px-8 py-3 rounded-xl font-bold hover:bg-[#76b9d6] transition-all"
            >
              Browse Bots <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          <div className="bg-[#121212] border border-white/5 rounded-3xl p-8 md:p-12 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
              <RefreshCw size={200} className="animate-spin-slow" />
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
              <div className="space-y-6">
                <div>
                  <span className="bg-[#87ceeb]/10 text-[#87ceeb] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-4 inline-block">
                    {activeSession.type} - Running
                  </span>
                  <h2 className="text-4xl md:text-5xl font-bold text-white">{activeSession.planName}</h2>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Purchase Amount</p>
                    <p className="text-2xl font-bold text-white">{formatCurrency(activeSession.amountPaid, profile?.preferredCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Expected Return</p>
                    <p className="text-2xl font-bold text-green-500">{formatCurrency(activeSession.expectedReturn, profile?.preferredCurrency)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center min-w-[240px] flex flex-col justify-center items-center">
                {activeSession.status === 'completed' ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <CheckCircle2 size={64} className="text-green-500" />
                    <div>
                      <p className="text-xl font-bold text-white">Session Complete</p>
                      <p className="text-xs text-gray-400 mt-1">Returns credited to balance</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 uppercase mb-4">Time Remaining</p>
                    <div className="flex items-center gap-3 text-4xl md:text-5xl font-mono font-bold text-[#87ceeb] mb-4">
                      <Clock size={32} />
                      {timeLeft}
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                       <div 
                        className="h-full bg-[#87ceeb] transition-all duration-1000"
                        style={{ width: `${Math.max(0, Math.min(100, ((Date.now() - activeSession.startedAt) / (activeSession.endsAt - activeSession.startedAt)) * 100))}%` }}
                       />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400">
                    <History size={18} />
                 </div>
                 <div>
                    <p className="text-xs text-gray-500">Started At</p>
                    <p className="text-sm font-medium text-white">{new Date(activeSession.startedAt).toLocaleString()}</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400">
                    <Clock size={18} />
                 </div>
                 <div>
                    <p className="text-xs text-gray-500">Scheduled End</p>
                    <p className="text-sm font-medium text-white">{new Date(activeSession.endsAt).toLocaleString()}</p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function History(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
      <path d="M3 3v5h5"></path>
      <path d="M12 7v5l4 2"></path>
    </svg>
  );
}
