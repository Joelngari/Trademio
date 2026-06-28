import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.js';
import { 
  Home, TrendingUp, Cpu, Database, PieChart, Activity, RefreshCw, 
  ArrowUpCircle, ArrowDownCircle, ShieldCheck, History, Wallet, 
  LogOut, Users, FileText, Settings, BarChart2, Clock 
} from 'lucide-react';
import { auth } from '../lib/firebase.js';
import { preloadRoute } from '../lib/preload.js';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { role } = useAuth();

  const traderLinks = [
    { name: 'Home', icon: Home, path: '/trader/home' },
    { name: 'Forex Bot', icon: TrendingUp, path: '/trader/forex' },
    { name: 'Crypto Bot', icon: Cpu, path: '/trader/crypto' },
    { name: 'Mining', icon: Database, path: '/trader/mining' },
    { name: 'Investment', icon: PieChart, path: '/trader/investment' },
    { name: 'Lifespan', icon: Activity, path: '/trader/lifespan' },
    { name: 'Trades', icon: RefreshCw, path: '/trader/trades' },
    { name: 'Deposit', icon: ArrowUpCircle, path: '/trader/deposit' },
    { name: 'Payment History', icon: History, path: '/trader/payment-history' },
    { name: 'Earnings History', icon: Wallet, path: '/trader/earnings-history' },
  ];

  const marketerLinks = [
    { name: 'Home', icon: Home, path: '/marketer/home' },
    { name: 'My Traders', icon: Users, path: '/marketer/traders' },
    { name: 'Commission History', icon: FileText, path: '/marketer/commissions' },
    { name: 'Withdraw', icon: ArrowDownCircle, path: '/marketer/withdraw' },
    { name: 'Withdrawal History', icon: History, path: '/marketer/withdrawals' },
  ];

  const adminLinks = [
    { name: 'Home', icon: Home, path: '/admin/home' },
    { name: 'Traders', icon: Users, path: '/admin/traders' },
    { name: 'Marketers', icon: Users, path: '/admin/marketers' },
    { name: 'Active Sessions', icon: Activity, path: '/admin/sessions' },
    { name: 'Withdrawal Requests', icon: ArrowDownCircle, path: '/admin/withdrawals' },
    { name: 'Marketer Payouts', icon: Wallet, path: '/admin/marketer-payouts' },
    { name: 'Bot Purchases', icon: Clock, path: '/admin/bot-purchases' },
    { name: 'Transactions', icon: FileText, path: '/admin/transactions' },
    { name: 'Packages', icon: Database, path: '/admin/packages' },
    { name: 'Settings', icon: Settings, path: '/admin/settings' },
  ];

  const links = role === 'admin' ? adminLinks : role === 'marketer' ? marketerLinks : traderLinks;

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout failed', err);
      window.showAppError?.('Logout failed. Please refresh and try again.');
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 bottom-0 w-64 bg-[#121212] border-r border-white/5 z-50 transform transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center gap-3 border-b border-white/5">
            <div className="w-12 h-12 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] border-2 border-[#ffd700] rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-[#ffd700]">VM</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Velnix</h1>
              <p className="text-[10px] text-[#ffd700] font-semibold">Markets</p>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            {links.map((link) => (
              <NavLink
                key={link.name}
                to={link.path}
                onClick={() => setIsOpen(false)}
                onMouseEnter={() => preloadRoute(link.path)}
                className={({ isActive }) => `
                  flex items-center gap-3 px-4 py-3 rounded text-sm font-medium transition-colors
                  ${isActive ? 'bg-[#87ceeb]/10 text-[#87ceeb]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                `}
              >
                <link.icon size={18} />
                {link.name}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-white/5">
            <button 
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
