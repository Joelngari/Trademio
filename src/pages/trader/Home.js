import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi } from '../../services/api.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function TraderHome() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exchangeRates, setExchangeRates] = useState({ KES: 1, USD: 0.0076, EUR: 0.007, GBP: 0.006 }); // Mock for initial render
  const chartContainer = useRef();

  useEffect(() => {
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
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      // Load TradingView Chart
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = () => {
        if (window.TradingView) {
          new window.TradingView.widget({
            "width": "100%",
            "height": 500,
            "symbol": "FX:EURUSD",
            "interval": "D",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#f1f3f6",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "container_id": "tradingview_chart"
          });
        }
      };
      document.head.appendChild(script);
    }
  }, [loading]);

  if (loading) return <SkeletonLoader type="stats" />;

  const currency = profile?.preferredCurrency || 'KES';
  const trader = data?.trader || {};

  return (
    <div className="space-y-8">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-[#87ceeb]/20 group-hover:text-[#87ceeb]/40 transition-colors">
            <Wallet size={48} />
          </div>
          <p className="text-gray-400 text-sm font-medium mb-1">Trading Balance</p>
          <h3 className="text-3xl font-bold text-white">
            {formatCurrency(trader.tradingBalance || 0, currency, exchangeRates)}
          </h3>
          <div className="mt-4 flex items-center gap-2 text-xs text-green-500">
            <TrendingUp size={14} />
            <span>+12.5% this month</span>
          </div>
        </div>

        <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-orange-500/10 group-hover:text-orange-500/20 transition-colors">
            <ArrowUpRight size={48} />
          </div>
          <p className="text-gray-400 text-sm font-medium mb-1">Deposit Balance</p>
          <h3 className="text-3xl font-bold text-white">
            {formatCurrency(trader.depositBalance || 0, currency, exchangeRates)}
          </h3>
          <p className="mt-4 text-xs text-gray-500">Available for bots</p>
        </div>

        <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 relative overflow-hidden group bg-gradient-to-br from-[#121212] to-[#87ceeb]/5">
          <div className="absolute top-0 right-0 p-4 text-[#87ceeb]/20 group-hover:text-[#87ceeb]/40 transition-colors">
            <Activity size={48} />
          </div>
          <p className="text-gray-400 text-sm font-medium mb-1">Total Portfolio</p>
          <h3 className="text-3xl font-bold text-white">
            {formatCurrency((trader.tradingBalance || 0) + (trader.depositBalance || 0), currency, exchangeRates)}
          </h3>
          <p className="mt-4 text-xs text-gray-500">Lifetime net worth</p>
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
        <div id="tradingview_chart" />
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

function Activity(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  );
}
