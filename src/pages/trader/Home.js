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
  const [exchangeRates, setExchangeRates] = useState({ KES: 1, USD: 0.0076, EUR: 0.007, GBP: 0.006 }); // Mock for initial render
  const [refreshing, setRefreshing] = useState(false);
  const [accountType, setAccountType] = useState('real');
  const [tradeForm, setTradeForm] = useState({ symbol: 'EURUSD', side: 'buy', amount: 100, accountType: 'real' });
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMessage, setOrderMessage] = useState(null);
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

  // Set up real-time listener for trader data
  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribe = onSnapshot(doc(db, 'users', profile.uid), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();
        // Update trader data with latest balance info
        setData(prev => ({
          ...prev,
          trader: {
            ...prev?.trader,
            tradingBalance: userData.tradingBalance || prev?.trader?.tradingBalance || 0,
            depositBalance: userData.depositBalance || prev?.trader?.depositBalance || 0
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

  const handleAccountTypeChange = (type) => {
    setAccountType(type);
    setTradeForm((prev) => ({ ...prev, accountType: type }));
    setOrderMessage(null);
  };

  const handleOrderSubmit = async (side) => {
    if (!data?.marketData) return;
    setOrderLoading(true);
    setOrderMessage(null);

    try {
      const payload = {
        symbol: tradeForm.symbol,
        side,
        accountType: accountType
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

  const marketData = data?.marketData || [];
  const selectedInstrument = marketData.find(item => item.symbol === tradeForm.symbol) || marketData[0] || {
    symbol: 'EURUSD',
    displayName: 'EUR / USD',
    chartSymbol: 'FX:EURUSD',
    price: 0,
    spread: '---',
    decimals: 5
  };
  const depositBalance = accountType === 'demo' ? (trader.demoDepositBalance || 0) : (trader.depositBalance || 0);
  const tradingBalance = accountType === 'demo' ? (trader.demoTradingBalance || 0) : (trader.tradingBalance || 0);
  const openPositions = (data?.openPositions || []).filter((position) => position.accountType === accountType);
  const openValue = openPositions.reduce((sum, position) => sum + (position.marketValue || 0), 0);
  const totalPortfolio = depositBalance + tradingBalance + openValue;
  const estimatedQuantity = selectedInstrument.price ? Number((tradeForm.amount / selectedInstrument.price).toFixed(selectedInstrument.decimals || 5)) : 0;

  // Initialize TradingView widget once `selectedInstrument` is available
  useEffect(() => {
    if (!chartContainer.current) return;
    if (!selectedInstrument || !selectedInstrument.symbol) return;

    // Clear previous widget
    chartContainer.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      try {
        if (window.TradingView) {
          new window.TradingView.widget({
            width: '100%',
            height: 500,
            symbol: selectedInstrument.chartSymbol || `FX:${selectedInstrument.symbol}` || 'FX:EURUSD',
            interval: 'D',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            enable_publishing: false,
            allow_symbol_change: true,
            container_id: 'tradingview_chart'
          });
        }
      } catch (e) {
        // silently ignore chart init errors
        console.error('TradingView init error', e);
      }
    };

    chartContainer.current.appendChild(script);

    return () => {
      // cleanup: remove script and widget container contents
      if (chartContainer.current) chartContainer.current.innerHTML = '';
    };
  }, [marketData.length, tradeForm.symbol]);

  if (loading) return <SkeletonLoader type="stats" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Trading Dashboard</h1>
          <p className="text-gray-400">Trade live instruments with real and demo account support.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleAccountTypeChange('real')}
            className={`px-5 py-3 rounded-full font-semibold transition ${accountType === 'real' ? 'bg-[#87ceeb] text-[#0a0a0a]' : 'bg-white/5 text-white hover:bg-white/10'}`}
          >
            Real Account
          </button>
          <button
            onClick={() => handleAccountTypeChange('demo')}
            className={`px-5 py-3 rounded-full font-semibold transition ${accountType === 'demo' ? 'bg-[#87ceeb] text-[#0a0a0a]' : 'bg-white/5 text-white hover:bg-white/10'}`}
          >
            Demo Account
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#121212] p-6 rounded-3xl border border-white/5 overflow-hidden">
          <p className="text-gray-400 text-sm font-medium mb-2">{accountType === 'demo' ? 'Demo' : 'Real'} Trading Balance</p>
          <h3 className="text-4xl font-bold text-white">{formatCurrency(tradingBalance, currency, exchangeRates)}</h3>
          <p className="mt-4 text-xs text-gray-500">Simulated profit and closed positions</p>
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
          <div className="flex gap-2">
            {/* Simple currency switcher could go here */}
          </div>
        </div>
        <div id="tradingview_chart" ref={chartContainer} className="min-h-[500px]" />
      </div>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#121212] rounded-2xl border border-white/5 p-4 min-h-[400px]">
           <h3 className="font-bold text-white mb-4">Market Overview</h3>
           <TradingViewMarketOverview />
        </div>
        <div className="bg-[#121212] rounded-2xl border border-white/5 p-4 min-h-[400px]">
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
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "colorTheme": "dark",
      "dateRange": "12M",
      "showChart": true,
      "locale": "en",
      "width": "100%",
      "height": "400",
      "largeChartUrl": "",
      "isTransparent": true,
      "showSymbolLogo": true,
      "tabs": [
        {
          "title": "Crypto",
          "symbols": [
            { "s": "BINANCE:BTCUSDT", "d": "Bitcoin" },
            { "s": "BINANCE:ETHUSDT", "d": "Ethereum" },
            { "s": "BINANCE:SOLUSDT", "d": "Solana" }
          ]
        },
        {
          "title": "Forex",
          "symbols": [
            { "s": "FX:EURUSD" },
            { "s": "FX:GBPUSD" },
            { "s": "FX:USDJPY" }
          ]
        }
      ]
    });
    container.current.appendChild(script);
  }, []);
  return <div ref={container} className="tradingview-widget-container" />;
}

function TradingViewNews() {
  const container = useRef();
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "feedMode": "all_symbols",
      "colorTheme": "dark",
      "isTransparent": true,
      "displayMode": "regular",
      "width": "100%",
      "height": "400",
      "locale": "en"
    });
    container.current.appendChild(script);
  }, []);
  return <div ref={container} className="tradingview-widget-container" />;
}
