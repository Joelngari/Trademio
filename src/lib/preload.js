export const preloadRoute = (path) => {
  const routes = {
    '/trader/home': () => import('../pages/trader/Home.js'),
    '/trader/forex': () => import('../pages/trader/ForexBot.js'),
    '/trader/crypto': () => import('../pages/trader/CryptoBot.js'),
    '/trader/mining': () => import('../pages/trader/Mining.js'),
    '/trader/investment': () => import('../pages/trader/Investment.js'),
    '/trader/lifespan': () => import('../pages/trader/Lifespan.js'),
    '/trader/trades': () => import('../pages/trader/Trades.js'),
    '/trader/deposit': () => import('../pages/trader/Deposit.js'),
    '/trader/payment-history': () => import('../pages/trader/PaymentHistory.js'),
    '/trader/earnings-history': () => import('../pages/trader/EarningsHistory.js'),
    '/marketer/home': () => import('../pages/marketer/Home.js'),
    '/marketer/traders': () => import('../pages/marketer/MyTraders.js'),
    '/marketer/commissions': () => import('../pages/marketer/CommissionHistory.js'),
    '/marketer/withdraw': () => import('../pages/marketer/Withdraw.js'),
    '/marketer/withdrawals': () => import('../pages/marketer/WithdrawalHistory.js'),
    '/admin/home': () => import('../pages/admin/Home.js'),
    '/admin/traders': () => import('../pages/admin/Traders.js'),
    '/admin/marketers': () => import('../pages/admin/Marketers.js'),
    '/admin/sessions': () => import('../pages/admin/ActiveSessions.js'),
    '/admin/withdrawals': () => import('../pages/admin/WithdrawalRequests.js'),
    '/admin/marketer-payouts': () => import('../pages/admin/MarketerPayouts.js'),
    '/admin/transactions': () => import('../pages/admin/Transactions.js'),
    '/admin/packages': () => import('../pages/admin/Packages.js'),
    // bot purchases route removed
    '/admin/settings': () => import('../pages/admin/Settings.js'),
  };

  if (routes[path]) {
    routes[path]().catch(() => {});
  }
};
