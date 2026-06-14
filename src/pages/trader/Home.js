import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi } from '../../services/api.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownLeft, RefreshCw, Activity } from 'lucide-react';
import { db } from '../../lib/firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';

export default function TraderHome() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRates, setExchangeRates] = useState({ KES: 1, USD: 0.0076, EUR: 0.007, GBP: 0.006 });
  const [refreshing, setRefreshing] = useState(false);
  const [tradeForm, setTradeForm] = useState({ symbol: 'EURUSD', side: 'buy', amount: 100, accountType: 'real' });
  const [chartStyle, setChartStyle] = useState('4');
  const [chartSymbol, setChartSymbol] = useState('FX:EURUSD');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMessage, setOrderMessage] = useState(null);
  const [now, setNow] = useState(Date.now());
  const chartContainer = useRef();

  const fetchData = async () => {
    try {
      const response = await traderApi.getDashboard();
      setData(response.data);
      
      // Fetch real rates
      const ratesRes = await fetch('https://open.er-api.com/v6/latest/KES');
      const ratesData = await ratesRes.json();
      if (ratesData.result === 'success') {
        setExchangeRates(ratesData.rates);
      }
    } catch (err) {
        console.error(err);
        if (typeof window !== 'undefined' && window.showAppError) window.showAppError(err.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!data?.activeSession || data.activeSession.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.activeSession]);

  // Set up real-time listener for trader data
  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribe = onSnapshot(doc(db, 'traders', profile.uid), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const traderData = docSnapshot.data();

        setData(prev => ({
          ...prev,
          trader: {
            ...(prev?.trader || {}),
            ...traderData,
            tradingBalance: traderData.tradingBalance ?? prev?.trader?.tradingBalance ?? 0,
            depositBalance: traderData.depositBalance ?? prev?.trader?.depositBalance ?? 0,
            activeSessionId: traderData.activeSessionId ?? prev?.trader?.activeSessionId ?? null
          }
        }));
      }
    });

    return () => unsubscribe();
  }, [profile?.uid]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const handleOrderSubmit = async (side) => {
    if (!data?.marketData) return;
    setOrderLoading(true);
    setOrderMessage(null);

    try {
      const payload = {
        symbol: tradeForm.symbol,
        side,
        accountType: 'real'
      };

      if (side === 'buy') {
        payload.amount = Number(tradeForm.amount);
      }

      const response = await traderApi.placeOrder(payload);
      setOrderMessage({ type: 'success', text: response.data.message });
      await fetchData();
    } catch (err) {
      console.error(err);
      if (typeof window !== 'undefined' && window.showAppError) window.showAppError(err.response?.data?.message || err.message || 'Order failed');
      setOrderMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Order failed' });
    } finally {
      setOrderLoading(false);
    }
  };

  // TradingView widget initialization is done after we compute the selected instrument
  // to avoid accessing variables before they're initialized.

  const currency = profile?.preferredCurrency || 'KES';
  const trader = data?.trader || {};
  const accountType = 'real';

  const marketData = data?.marketData || [];
  const selectedInstrument = marketData.find(item => item.symbol === tradeForm.symbol)
    || marketData.find(item => item.symbol === 'EURUSD')
    || marketData[0] || {
    symbol: 'EURUSD',
    displayName: 'EUR / USD',
    chartSymbol: 'FX:EURUSD',
    price: 0,
    spread: '---',
    decimals: 5
  };
  const depositBalance = trader.depositBalance || 0;
  const tradingBalance = trader.tradingBalance || 0;
  const activeSession = data?.activeSession;
  const liveSessionProgress = activeSession && activeSession.status === 'active'
    ? Math.min(100, ((now - activeSession.startedAt) / (activeSession.endsAt - activeSession.startedAt)) * 100)
    : 0;
  const liveEstimatedProfit = activeSession && activeSession.expectedReturn
    ? activeSession.expectedReturn * (liveSessionProgress / 100)
    : 0;
  const liveTradingBalance = tradingBalance + liveEstimatedProfit;
  const openPositions = (data?.openPositions || []).filter((position) => position.accountType === 'real');
  const openValue = openPositions.reduce((sum, position) => sum + (position.marketValue || 0), 0);
  const totalPortfolio = depositBalance + tradingBalance + openValue;
  const estimatedQuantity = selectedInstrument.price ? Number((tradeForm.amount / selectedInstrument.price).toFixed(selectedInstrument.decimals || 5)) : 0;
  const resolvedChartSymbol = selectedInstrument?.chartSymbol || `FX:${selectedInstrument?.symbol || 'EURUSD'}`;

  useEffect(() => {
    setChartSymbol(resolvedChartSymbol || 'FX:EURUSD');
  }, [resolvedChartSymbol]);

  // Initialize the TradingView advanced chart widget on load and keep it live.
  useEffect(() => {
    if (!chartContainer.current) return;

    const container = chartContainer.current;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.id = 'tradingview-advanced-chart';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: chartSymbol,
      interval: '1',
      timezone: 'Africa/Nairobi',
      theme: 'dark',
      style: Number(chartStyle),
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_top_toolbar: false,
      withdateranges: true,
      details: true,
      hide_legend: false,
      save_image: false,
      support_host: 'https://www.tradingview.com'
    });

    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = '';
        const existing = document.getElementById('tradingview-advanced-chart');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      }
    };
  }, [chartSymbol, chartStyle]);

  if (loading) return <SkeletonLoader type="stats" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Trading Dashboard</h1>
          <p className="text-gray-400">Trade live instruments with real funding and production-ready analytics.</p>
        </div>
        <div className="rounded-full bg-[#87ceeb]/10 border border-[#87ceeb]/20 px-4 py-2 text-sm text-[#87ceeb]">Production trading dashboard</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#121212] p-6 rounded-3xl border border-white/5 overflow-hidden">
          <p className="text-gray-400 text-sm font-medium mb-2">Trading Balance</p>
          <h3 className="text-4xl font-bold text-white">{formatCurrency(liveTradingBalance, currency, exchangeRates)}</h3>
          <p className="mt-2 text-xs text-green-400">Live estimate from active bot: +{formatCurrency(liveEstimatedProfit, currency, exchangeRates)}</p>
          <p className="mt-4 text-xs text-gray-500">This shows your current running profit estimate; final returns are credited when the session completes.</p>
        </div>
        <div className="bg-[#121212] p-6 rounded-3xl border border-white/5 overflow-hidden">
          <p className="text-gray-400 text-sm font-medium mb-2">Available Deposit</p>
          <h3 className="text-4xl font-bold text-white">{formatCurrency(depositBalance, currency, exchangeRates)}</h3>
          <p className="mt-4 text-xs text-gray-500">Funds available for new trades</p>
        </div>
        <div className="bg-[#121212] p-6 rounded-3xl border border-white/5 overflow-hidden bg-gradient-to-br from-[#121212] to-[#87ceeb]/5">
          <p className="text-gray-400 text-sm font-medium mb-2">Portfolio Value</p>
          <h3 className="text-4xl font-bold text-white">{formatCurrency(totalPortfolio, currency, exchangeRates)}</h3>
          <p className="mt-4 text-xs text-gray-500">Includes open positions and account balances</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-6">
        <div className="bg-[#121212] rounded-3xl border border-white/5 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Trade Ticket</h2>
              <p className="text-gray-400 text-sm">Place a market order or close an existing position.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setTradeForm((prev) => ({ ...prev, side: 'buy' }))}
                className={`px-4 py-2 rounded-xl font-semibold transition ${tradeForm.side === 'buy' ? 'bg-green-500/15 border border-green-500 text-green-300' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeForm((prev) => ({ ...prev, side: 'sell' }))}
                className={`px-4 py-2 rounded-xl font-semibold transition ${tradeForm.side === 'sell' ? 'bg-red-500/15 border border-red-500 text-red-300' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                Sell
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-gray-500">Instrument</label>
                <select
                  value={tradeForm.symbol}
                  onChange={(e) => setTradeForm((prev) => ({ ...prev, symbol: e.target.value }))}
                  className="mt-2 w-full bg-[#0f0f0f] border border-white/10 rounded-2xl px-4 py-3 text-white"
                >
                  {marketData.map((item) => (
                    <option key={item.symbol} value={item.symbol}>{item.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-gray-500">Order Size ({currency})</label>
                <input
                  type="number"
                  value={tradeForm.amount}
                  onChange={(e) => setTradeForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                  disabled={tradeForm.side === 'sell'}
                  className="mt-2 w-full bg-[#0f0f0f] border border-white/10 rounded-2xl px-4 py-3 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Market Price</p>
                <p className="text-xl font-bold text-white">{selectedInstrument.price ? selectedInstrument.price : '---'}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Spread</p>
                <p className="text-xl font-bold text-white">{selectedInstrument.spread ?? '---'}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Qty Estimate</p>
                <p className="text-xl font-bold text-white">{tradeForm.side === 'buy' ? estimatedQuantity : 'Close all'}</p>
              </div>
            </div>

            {orderMessage && (
              <div className={`rounded-2xl p-4 text-sm ${orderMessage.type === 'success' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
                {orderMessage.text}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-400">
                {tradeForm.side === 'buy'
                  ? 'This order uses your deposit balance to open a new position.'
                  : 'Sell closes all open positions for this symbol on the selected account.'}
              </div>
              <button
                onClick={() => handleOrderSubmit(tradeForm.side)}
                disabled={orderLoading || (tradeForm.side === 'buy' && (!tradeForm.amount || tradeForm.amount <= 0))}
                className="inline-flex items-center justify-center gap-2 bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded-2xl font-bold hover:bg-[#76b9d6] transition-all disabled:opacity-50"
              >
                {orderLoading ? 'Processing...' : tradeForm.side === 'buy' ? 'Place Buy Order' : 'Close Position'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#121212] rounded-3xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Market Watchlist</h2>
              <span className="text-xs uppercase tracking-widest text-gray-500">Live quotes</span>
            </div>
            <div className="space-y-3">
              {marketData.slice(0, 5).map((item) => (
                <div key={item.symbol} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div>
                    <p className="text-sm text-gray-400">{item.displayName}</p>
                    <p className="text-white font-semibold">{item.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">{item.price}</p>
                    <p className="text-xs text-gray-500">{item.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#121212] rounded-3xl border border-white/5 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Open Positions</h2>
            {openPositions.length > 0 ? (
              <div className="space-y-3">
                {openPositions.map((position) => (
                  <div key={`${position.symbol}-${position.accountType}`} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-gray-400">{position.symbol}</p>
                        <p className="text-lg font-bold text-white">{position.displayName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Unrealized P/L</p>
                        <p className={`font-bold ${position.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(position.unrealizedPnl, currency, exchangeRates)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-gray-400">
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
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No open positions in this account yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-[#121212] rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-bold text-white">Live Market Analysis</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs uppercase tracking-widest text-gray-500">Chart</label>
            <select
              value={chartStyle}
              onChange={(e) => setChartStyle(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none"
            >
              <option value="1">Bars</option>
              <option value="2">Candles</option>
              <option value="3">Area</option>
              <option value="4">Line</option>
            </select>
          </div>
        </div>
        <div id="tradingview_chart" ref={chartContainer} className="h-[500px] sm:h-[600px] w-full overflow-hidden" />
      </div>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#121212] rounded-2xl border border-white/5 p-4 min-h-[360px] sm:min-h-[400px]">
           <h3 className="font-bold text-white mb-4">Market Overview</h3>
           <TradingViewMarketOverview />
        </div>
        <div className="bg-[#121212] rounded-2xl border border-white/5 p-4 min-h-[360px] sm:min-h-[400px]">
           <h3 className="font-bold text-white mb-4">Live News Feed</h3>
           <TradingViewNews />
        </div>
      </div>
    </div>
  );
}

function TradingViewMarketOverview() {
  const container = useRef();
  useEffect(() => {
    if (!container.current) return;

    const script = document.createElement('script');
    script.id = 'tradingview-market-overview';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      dateRange: '12M',
      showChart: true,
      locale: 'en',
      width: '100%',
      height: '400',
      largeChartUrl: '',
      isTransparent: true,
      showSymbolLogo: true,
      tabs: [
        {
          title: 'Crypto',
          symbols: [
            { s: 'BINANCE:BTCUSDT', d: 'Bitcoin' },
            { s: 'BINANCE:ETHUSDT', d: 'Ethereum' },
            { s: 'BINANCE:SOLUSDT', d: 'Solana' }
          ]
        },
        {
          title: 'Forex',
          symbols: [
            { s: 'FX:EURUSD' },
            { s: 'FX:GBPUSD' },
            { s: 'FX:USDJPY' }
          ]
        }
      ]
    });

    if (container.current) container.current.innerHTML = '';
    container.current.appendChild(script);

    return () => {
      if (container.current) container.current.innerHTML = '';
      const existing = document.getElementById('tradingview-market-overview');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    };
  }, []);

  return <div ref={container} className="tradingview-widget-container w-full overflow-hidden" style={{ minHeight: '320px' }} />;
}

function TradingViewNews() {
  const container = useRef();
  useEffect(() => {
    if (!container.current) return;

    const script = document.createElement('script');
    script.id = 'tradingview-news-feed';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      feedMode: 'all_symbols',
      colorTheme: 'dark',
      isTransparent: true,
      displayMode: 'regular',
      width: '100%',
      height: '400',
      locale: 'en'
    });

    if (container.current) container.current.innerHTML = '';
    container.current.appendChild(script);

    return () => {
      if (container.current) container.current.innerHTML = '';
      const existing = document.getElementById('tradingview-news-feed');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    };
  }, []);

  return <div ref={container} className="tradingview-widget-container w-full overflow-hidden" style={{ minHeight: '320px' }} />;
}
