import React, { useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import Sidebar from './components/Sidebar.js';
import TopBar from './components/TopBar.js';
import TickerTape from './components/TickerTape.js';
import SkeletonLoader from './components/SkeletonLoader.js';
import Footer from './components/Footer.js';

// Auth Pages
const Login = lazy(() => import('./pages/auth/Login.js'));
const Register = lazy(() => import('./pages/auth/Register.js'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.js'));

// Trader Pages
const TraderHome = lazy(() => import('./pages/trader/Home.js'));
const ForexBot = lazy(() => import('./pages/trader/ForexBot.js'));
const CryptoBot = lazy(() => import('./pages/trader/CryptoBot.js'));
const Mining = lazy(() => import('./pages/trader/Mining.js'));
const Investment = lazy(() => import('./pages/trader/Investment.js'));
const Lifespan = lazy(() => import('./pages/trader/Lifespan.js'));
const Trades = lazy(() => import('./pages/trader/Trades.js'));
const Deposit = lazy(() => import('./pages/trader/Deposit.js'));
const Withdraw = lazy(() => import('./pages/trader/Withdraw.js'));
const WithdrawalBot = lazy(() => import('./pages/trader/WithdrawalBot.js'));
const PaymentHistory = lazy(() => import('./pages/trader/PaymentHistory.js'));
const EarningsHistory = lazy(() => import('./pages/trader/EarningsHistory.js'));

// Marketer Pages
const MarketerHome = lazy(() => import('./pages/marketer/Home.js'));
const MyTraders = lazy(() => import('./pages/marketer/MyTraders.js'));
const CommissionHistory = lazy(() => import('./pages/marketer/CommissionHistory.js'));
const MarketerWithdraw = lazy(() => import('./pages/marketer/Withdraw.js'));
const WithdrawalHistory = lazy(() => import('./pages/marketer/WithdrawalHistory.js'));

// Admin Pages
const AdminHome = lazy(() => import('./pages/admin/Home.js'));
const AdminTraders = lazy(() => import('./pages/admin/Traders.js'));
const AdminMarketers = lazy(() => import('./pages/admin/Marketers.js'));
const ActiveSessions = lazy(() => import('./pages/admin/ActiveSessions.js'));
const WithdrawalRequests = lazy(() => import('./pages/admin/WithdrawalRequests.js'));
const MarketerPayouts = lazy(() => import('./pages/admin/MarketerPayouts.js'));
const AdminTransactions = lazy(() => import('./pages/admin/Transactions.js'));
const AdminPackages = lazy(() => import('./pages/admin/Packages.js'));
const AdminSettings = lazy(() => import('./pages/admin/Settings.js'));

function DashboardLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const isTrader = location.pathname.startsWith('/trader');

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] flex-col">
      <div className="flex flex-1">
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        <div className="flex-1 flex flex-col min-w-0 md:pl-64">
          {isTrader && <TickerTape />}
          <TopBar setIsOpen={setIsSidebarOpen} />
          <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            <Suspense fallback={<SkeletonLoader type="card" />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function PrivateRoute({ allowedRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) return <SkeletonLoader type="card" />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Only redirect if role is known; don't redirect to /null/home or /undefined/home
    if (role) {
      return <Navigate to={`/${role}/home`} replace />;
    }
    // If role is not yet available, show loading state instead of redirecting
    return <SkeletonLoader type="card" />;
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

export default function App() {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <SkeletonLoader type="card" />;

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<SkeletonLoader type="card" />}>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={user && role ? <Navigate to={`/${role}/home`} replace /> : <Login />} />
          <Route path="/register" element={user && role ? <Navigate to={`/${role}/home`} replace /> : <Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Trader Routes */}
          <Route path="/trader/*" element={<PrivateRoute allowedRoles={['trader']} />}>
            <Route path="home" element={<TraderHome />} />
            <Route path="forex" element={<ForexBot />} />
            <Route path="crypto" element={<CryptoBot />} />
            <Route path="mining" element={<Mining />} />
            <Route path="investment" element={<Investment />} />
            <Route path="lifespan" element={<Lifespan />} />
            <Route path="trades" element={<Trades />} />
            <Route path="deposit" element={<Deposit />} />
            <Route path="withdraw" element={<Withdraw />} />
            <Route path="withdrawal-bot" element={<WithdrawalBot />} />
            <Route path="payment-history" element={<PaymentHistory />} />
            <Route path="earnings-history" element={<EarningsHistory />} />
          </Route>

          {/* Marketer Routes */}
          <Route path="/marketer/*" element={<PrivateRoute allowedRoles={['marketer']} />}>
            <Route path="home" element={<MarketerHome />} />
            <Route path="traders" element={<MyTraders />} />
            <Route path="commissions" element={<CommissionHistory />} />
            <Route path="withdraw" element={<MarketerWithdraw />} />
            <Route path="withdrawals" element={<WithdrawalHistory />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin/*" element={<PrivateRoute allowedRoles={['admin']} />}>
            <Route path="home" element={<AdminHome />} />
            <Route path="traders" element={<AdminTraders />} />
            <Route path="marketers" element={<AdminMarketers />} />
            <Route path="sessions" element={<ActiveSessions />} />
            <Route path="withdrawals" element={<WithdrawalRequests />} />
            <Route path="marketer-payouts" element={<MarketerPayouts />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="packages" element={<AdminPackages />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          {/* Default Route */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
