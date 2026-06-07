import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi } from '../../services/api.js';
import { db } from '../../lib/firebase.js';
import { collection, query, where, doc, onSnapshot } from 'firebase/firestore';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { RefreshCw, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Trades() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [marketData, setMarketData] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');

  const aggregatePositions = (orderDocs, marketQuotes) => {
    const positions = {};
    const marketMap = new Map((marketQuotes || []).map((item) => [item.symbol, item]));

    orderDocs.filter((order) => order.status === 'open').forEach((order) => {
      const key = `${order.symbol}-${order.accountType}`;
      const currentPrice = marketMap.get(order.symbol)?.price || order.price || 0;

      if (!positions[key]) {
        positions[key] = {
          symbol: order.symbol,
          displayName: order.displayName || order.symbol,
          accountType: order.accountType,
          quantity: 0,
          totalCost: 0,
          avgEntryPrice: 0,
          currentPrice
        };
      }

      positions[key].quantity += order.quantity;
      positions[key].totalCost += order.quantity * order.price;
      positions[key].avgEntryPrice = positions[key].totalCost / positions[key].quantity;
      positions[key].currentPrice = currentPrice;
    });

    return Object.values(positions).map((position) => ({
      ...position,
      marketValue: Number((position.quantity * position.currentPrice).toFixed(2)),
      unrealizedPnl: Number(((position.currentPrice - position.avgEntryPrice) * position.quantity).toFixed(2))
    }));
  };

  const buildDashboardFromOrders = (orderDocs, marketQuotes) => ({
    openPositions: aggregatePositions(orderDocs, marketQuotes),
    tradeHistory: orderDocs.filter((order) => order.status !== 'open').slice(0, 10)
  });

  const fetchData = useCallback(async () => {
    try {
      const response = await traderApi.getDashboard();
      setData((prev) => ({
        ...prev,
        ...response.data
      }));
      setMarketData(response.data.marketData || []);
      setLoading(false);
    } catch (err) {
        console.error(err);
        if (typeof window !== 'undefined' && window.showAppError) window.showAppError(err.message || err);
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let sessionUnsub = null;
    if (data?.activeSession) {
      const sessionRef = doc(db, 'sessions', data.activeSession.id);
      sessionUnsub = onSnapshot(sessionRef, (docSnap) => {
        if (docSnap.exists()) {
          setActiveSession(docSnap.data());
        } else {
          setActiveSession(null);
        }
      });
    }

    return () => {
      if (sessionUnsub) sessionUnsub();
    };
  }, [data?.activeSession]);

  useEffect(() => {
    if (!profile?.uid) return;

    const ordersQuery = query(
      collection(db, 'tradeOrders'),
      where('traderId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const newOrders = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setOrders(newOrders);
      setData((prev) => ({
        ...prev,
        ...buildDashboardFromOrders(newOrders, marketData)
      }));
    });

    return () => unsubscribe();
  }, [profile?.uid, marketData]);

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

  const positions = data?.openPositions || [];
  const tradeHistory = data?.tradeHistory || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Live Trading</h1>
        <p className="text-gray-400">Track open positions, recent trade history, and active sessions.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Open Positions</h2>
              <p className="text-sm text-gray-500">Your current live positions across accounts.</p>
            </div>
          </div>
          {positions.length > 0 ? (
            <div className="space-y-4">
              {positions.map((position) => (
                <div key={`${position.symbol}-${position.accountType}`} className="bg-white/5 border border-white/10 rounded-3xl p-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="text-sm text-gray-400">Real · {position.symbol}</p>
                      <p className="text-lg font-bold text-white">{position.displayName || position.symbol}</p>
                    </div>
                    <div className={`text-sm font-semibold ${position.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {position.unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnl, profile?.preferredCurrency)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                    <div>
                      <p>Qty</p>
                      <p className="text-white font-medium">{position.quantity}</p>
                    </div>
                    <div>
                      <p>Entry</p>
                      <p className="text-white font-medium">{position.avgEntryPrice}</p>
                    </div>
                    <div>
                      <p>Market</p>
                      <p className="text-white font-medium">{position.currentPrice}</p>
                    </div>
                    <div>
                      <p>Value</p>
                      <p className="text-white font-medium">{formatCurrency(position.marketValue, profile?.preferredCurrency)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p>No open positions yet. Place a trade from the home dashboard to start.</p>
            </div>
          )}
        </div>

        <div className="bg-[#121212] border border-white/5 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Trade History</h2>
              <p className="text-sm text-gray-500">Closed trades and completed orders.</p>
            </div>
            <span className="text-xs uppercase tracking-widest text-gray-500">Recent</span>
          </div>
          {tradeHistory.length > 0 ? (
            <div className="space-y-4">
              {tradeHistory.slice(0, 10).map((trade) => (
                <div key={trade.id} className="bg-white/5 border border-white/10 rounded-3xl p-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <p className="text-sm text-gray-400">{trade.symbol} · {trade.side.toUpperCase()}</p>
                      <p className="text-lg font-bold text-white">{trade.displayName || trade.symbol}</p>
                    </div>
                    <div className={`text-sm font-semibold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl || 0, profile?.preferredCurrency)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                    <div>
                      <p>Qty</p>
                      <p className="text-white font-medium">{trade.quantity}</p>
                    </div>
                    <div>
                      <p>Price</p>
                      <p className="text-white font-medium">{trade.price}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p>No trade history yet. Your completed positions will appear here.</p>
            </div>
          )}
        </div>
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
