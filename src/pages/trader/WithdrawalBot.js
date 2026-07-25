import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi, paymentApi } from '../../services/api.js';
import api from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ShieldCheck, ArrowRight, Loader2, Star, Clock, ArrowUpCircle } from 'lucide-react';

export default function WithdrawalBot() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [trader, setTrader] = useState(null);
  // bot purchases removed
  const [depositBalance, setDepositBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [message, setMessage] = useState(null);
  const [flowStep, setFlowStep] = useState('withdrawal');
  const [amountInputs, setAmountInputs] = useState({});
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);


  const fetchTrader = async () => {
    try {
      const response = await traderApi.getDashboard();
      setTrader(response.data.trader);
    } catch (err) {
      console.warn('Failed to refresh trader state:', err);
    }
  };

  const location = useLocation();
  const requestedWithdrawal = location?.state?.requestedWithdrawal;
  const requestedPhoneFromNav = location?.state?.phoneNumber;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        const allPackages = response.data.packages.sort((a, b) => a.price - b.price);
        setPackages(allPackages);
        setTrader(response.data.trader);
        setDepositBalance(response.data.trader?.depositBalance || 0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const currency = profile?.preferredCurrency || 'KES';

  const tradeFamily = trader?.lastTradingFamily || trader?.lastTradingType || null;
  const tradeCategory = trader?.lastTradingCategory || trader?.lastTradingType || null;
  const hasActiveWithdrawalBot = Boolean(trader?.withdrawalBotPackageName || trader?.withdrawalBotFamily || trader?.withdrawalBotPackageId || trader?.withdrawalBotTier);
  const hasActiveVerificationBot = Boolean(trader?.verificationBotPackageName || trader?.verificationBotFamily || trader?.verificationBotPackageId || trader?.verificationBotTier);
  const lastTradingPackageName = trader?.lastTradingPackageName || null;
  const lastWithdrawalPackageName = trader?.withdrawalBotPackageName || null;
  const currentFlowStep = hasActiveWithdrawalBot && !hasActiveVerificationBot ? 'verification' : flowStep;

  const normalizeName = (value) => value?.trim().toUpperCase() || '';
  const getRelatedBaseName = (packageName, kind) => {
    if (!packageName) return null;
    const normalized = normalizeName(packageName)
      .replace(/\s+(WITHDRAWAL|VERIFICATION)\s+BOT$/i, '')
      .replace(/\s+(FOREX|CRYPTO)\s+BOT$/i, '')
      .replace(/\s+RIG$/i, '')
      .replace(/\s+BOT$/i, '')
      .trim();
    if (!normalized) return null;
    return kind === 'withdrawal' ? `${normalized} WITHDRAWAL BOT` : `${normalized} VERIFICATION BOT`;
  };

  const getFamilyFromPackageName = (packageName) => {
    if (!packageName) return null;
    const normalized = normalizeName(packageName)
      .replace(/\s+(WITHDRAWAL|VERIFICATION)\s+BOT$/i, '')
      .replace(/\s+(FOREX|CRYPTO)\s+BOT$/i, '')
      .replace(/\s+RIG$/i, '')
      .replace(/\s+BOT$/i, '')
      .trim();
    return normalized || null;
  };

  const currentWithdrawalName = getRelatedBaseName(lastTradingPackageName, 'withdrawal');
  const expectedWithdrawalName = trader?.withdrawalBotPackageName ? normalizeName(trader.withdrawalBotPackageName) : currentWithdrawalName;
  const expectedWithdrawalFamily = normalizeName(trader?.withdrawalBotFamily || getFamilyFromPackageName(trader?.withdrawalBotPackageName) || tradeFamily || tradeCategory || '');
  const derivedFamily = trader?.withdrawalBotFamily || trader?.verificationBotFamily || expectedWithdrawalFamily;
  const currentStatusLabel = hasActiveWithdrawalBot
    ? hasActiveVerificationBot
      ? 'Withdrawal Path Complete'
      : 'Verification Required'
    : 'Verification Bot Ready';
  const currentFamilyLabel = trader?.verificationBotFamily || trader?.withdrawalBotFamily || expectedWithdrawalFamily || 'Pending';

  const isRelatedPackage = (pkg, expectedName, expectedFamily, kind) => {
    if (!pkg) return false;
    const normalizedName = normalizeName(pkg.name);
    const normalizedFamily = normalizeName(pkg.botFamily || '');
    const normalizedExpectedName = normalizeName(expectedName);
    const normalizedExpectedFamily = normalizeName(expectedFamily);

    if (normalizedExpectedName) {
      if (normalizedName === normalizedExpectedName) return true;
      const baseName = normalizedExpectedName.replace(/ WITHDRAWAL BOT$/i, '').replace(/ VERIFICATION BOT$/i, '');
      if (baseName && normalizedName.includes(baseName) && normalizedName.includes(kind === 'withdrawal' ? 'WITHDRAWAL' : 'VERIFICATION')) return true;
    }

    if (normalizedExpectedFamily) {
      return normalizedFamily === normalizedExpectedFamily || normalizedName.includes(normalizedExpectedFamily) || normalizedFamily.includes(normalizedExpectedFamily);
    }

    return false;
  };

  const eligibleWithdrawalPackages = packages.filter((pkg) => {
    if (pkg.type !== 'withdrawal-bot') return false;
    const normalizedName = normalizeName(pkg.name);
    const normalizedFamily = normalizeName(pkg.botFamily || '');

    if (expectedWithdrawalName) {
      const expectedBaseName = getRelatedBaseName(expectedWithdrawalName, 'withdrawal');
      if (expectedBaseName && normalizedName === expectedBaseName) return true;
      if (normalizedName === expectedWithdrawalName) return true;
    }

    if (expectedWithdrawalFamily) {
      if (normalizedFamily === expectedWithdrawalFamily) return true;
      if (normalizedName.includes(expectedWithdrawalFamily)) return true;
    }

    return false;
  });

  const currentVerificationName = getRelatedBaseName(lastWithdrawalPackageName || expectedWithdrawalName, 'verification');
  const eligibleVerificationPackages = packages.filter((pkg) => {
    if (pkg.type !== 'verification-bot') return false;
    const normalizedName = normalizeName(pkg.name);
    const normalizedFamily = normalizeName(pkg.botFamily || '');

    if (currentVerificationName) {
      const expectedBaseName = getRelatedBaseName(currentVerificationName, 'verification');
      if (expectedBaseName && normalizedName === expectedBaseName) return true;
      if (normalizedName === currentVerificationName) return true;
    }

    if (expectedWithdrawalFamily) {
      if (normalizedFamily === expectedWithdrawalFamily) return true;
      if (normalizedName.includes(expectedWithdrawalFamily)) return true;
    }

    return false;
  });

  const isRelatedWithdrawalPackage = (pkg) => {
    if (!pkg) return false;
    const normalizedName = normalizeName(pkg.name);
    const normalizedFamily = normalizeName(pkg.botFamily || '');

    if (expectedWithdrawalName) {
      const expectedBaseName = getRelatedBaseName(expectedWithdrawalName, 'withdrawal');
      if (expectedBaseName && normalizedName === expectedBaseName) return true;
      if (normalizedName === expectedWithdrawalName) return true;
    }

    if (expectedWithdrawalFamily) {
      if (normalizedFamily === expectedWithdrawalFamily) return true;
      if (normalizedName.includes(expectedWithdrawalFamily)) return true;
    }

    return false;
  };

  const isRelatedVerificationPackage = (pkg) => {
    if (!pkg) return false;
    const normalizedName = normalizeName(pkg.name);
    const normalizedFamily = normalizeName(pkg.botFamily || '');

    if (currentVerificationName) {
      const expectedBaseName = getRelatedBaseName(currentVerificationName, 'verification');
      if (expectedBaseName && normalizedName === expectedBaseName) return true;
      if (normalizedName === currentVerificationName) return true;
    }

    if (expectedWithdrawalFamily) {
      if (normalizedFamily === expectedWithdrawalFamily) return true;
      if (normalizedName.includes(expectedWithdrawalFamily)) return true;
    }

    return false;
  };

  const handlePurchase = async (pkgId) => {
    const pkg = packages.find(p => p.id === pkgId);
    if (!pkg) return;
    
    // Check if user has sufficient balance
    if (depositBalance < pkg.price) {
      const shortfall = pkg.price - depositBalance;
      setMessage({ type: 'error', text: `Insufficient balance. Need ${formatCurrency(shortfall, profile?.preferredCurrency)} more to purchase this bot.` });
      return;
    }
    
    setPurchasing(pkgId);
    setMessage(null);
    try {
      const response = await paymentApi.purchaseBotWithDeposit({ packageId: pkgId });

      const msgText = pkg?.type === 'withdrawal-bot'
        ? 'Payment processed! Your withdrawal bot is now active.'
        : 'Payment processed! Your verification bot is now active.';
      setMessage({ type: 'success', text: msgText });

      if (pkg?.type === 'withdrawal-bot') {
        setFlowStep('verification');
      }

      if (pkg?.type === 'verification-bot' && requestedWithdrawal && Number(requestedWithdrawal) > 0) {
        try {
          const phoneToUse = requestedPhoneFromNav || profile?.phoneNumber || '';
          await api.post('/trader/withdraw', { amount: Number(requestedWithdrawal), phoneNumber: phoneToUse });
          setMessage({ type: 'success', text: 'Congratulations for completing the withdrawal. Check the email you used to create your account for more information' });
        } catch (err) {
          setMessage({ type: 'error', text: err.response?.data?.message || 'Verification succeeded but failed to create withdrawal request' });
        }
      }

      await fetchTrader();
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setMessage({ type: 'error', text: err.userMessage || err.response?.data?.message || 'Failed to complete bot purchase' });
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-2">Withdrawal Bots</h1>
        <p className="text-gray-400">Upgrade your account verification level to unlock higher withdrawal limits. Pay any amount to get started.</p>
      </div>

      {message && (
        <div className={`p-4 rounded border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          {message.text}
        </div>
      )}

      {trader?.lastTradingType && (
        <div className="bg-white/5 border border-white/10 rounded p-4 text-sm text-gray-300">
          Eligible withdrawal packages are filtered for your last trading family: <span className="font-semibold text-white capitalize">{tradeFamily || trader.lastTradingType}</span>.
          Verification packages match your withdrawal bot family/category.
        </div>
      )}

      {(hasActiveWithdrawalBot || hasActiveVerificationBot) && (
        <div className="bg-[#87ceeb]/10 border border-[#87ceeb]/20 p-6 rounded flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#87ceeb]/20 rounded flex items-center justify-center text-[#87ceeb]">
                 <ShieldCheck size={28} />
              </div>
              <div>
                 <p className="text-xs text-[#87ceeb] font-bold uppercase tracking-wider">Current Status</p>
                 <h3 className="text-xl font-bold text-white">{currentStatusLabel}</h3>
              </div>
           </div>
           <div className="text-right">
              <p className="text-xs text-gray-500 uppercase">Related Family</p>
              <p className="text-lg font-bold text-white">
                {currentFamilyLabel}
              </p>
           </div>
        </div>
      )}

      {hasActiveWithdrawalBot && hasActiveVerificationBot && (
        <div className="bg-green-500/10 border border-green-500/20 rounded p-6 text-white">
          <h3 className="text-lg font-semibold text-white mb-2">Congratulations!</h3>
          <p className="text-sm text-gray-200">Congratulations for completing the withdrawal. Check the email you used to create your account for more information.</p>
        </div>
      )}

      {/* bot purchases removed */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {!hasActiveWithdrawalBot && currentFlowStep !== 'verification' && (
          <>
            {eligibleWithdrawalPackages.length === 0 && (
              <div className="col-span-1 md:col-span-3 bg-[#121212] border border-white/10 rounded p-6 text-center text-sm text-gray-400">
                No eligible withdrawal bot packages were found for your active trading path. Please contact support or check back after your next trade.
              </div>
            )}

            {eligibleWithdrawalPackages.map((pkg) => {
              const isCurrent = trader?.withdrawalBotTier === pkg.tier && trader?.withdrawalBotFamily === pkg.botFamily;
              const isRelated = isRelatedWithdrawalPackage(pkg);
              const amount = amountInputs[pkg.id] || pkg.price;

              return (
                <div key={pkg.id} className={`bg-[#121212] border rounded p-8 flex flex-col relative overflow-hidden transition-all duration-300 ${isCurrent ? 'border-[#87ceeb] shadow-[0_0_20px_rgba(135,206,235,0.1)]' : 'border-white/5 hover:border-white/20'}`}>
                   {pkg.tier === 'premium' && (
                     <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                        <Star size={80} />
                     </div>
                   )}
                   
                   <h3 className="text-xl font-bold text-white mb-1 capitalize">{pkg.name}</h3>
                   <p className="text-[#87ceeb] font-bold mb-6">{formatCurrency(pkg.price, profile?.preferredCurrency)}</p>

                   <ul className="space-y-4 mb-8 flex-1">
                     <li className="flex gap-3 text-sm text-gray-400 items-start">
                        <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                        Withdrawals up to {pkg.maxAmount ? formatCurrency(pkg.maxAmount, profile?.preferredCurrency) : 'Unlimited Amount'}
                     </li>
                     <li className="flex gap-3 text-sm text-gray-400 items-start">
                        <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                        Standard processing time
                     </li>
                     <li className="flex gap-3 text-sm text-gray-400 items-start">
                        <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                        Works with {pkg.botFamily || 'your trading family'}
                     </li>
                   </ul>

                  <div className="space-y-4 mt-auto">
                    {!isCurrent && (
                      <>
                        {/* Resume banner: if there's an existing pending purchase for this package, show prompt */}
                        {/* bot purchases removed */}
                        {depositBalance < pkg.price ? (
                          <div className="space-y-3">
                            <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm">
                              <p className="text-yellow-500 font-semibold">Insufficient Balance</p>
                              <p className="text-yellow-400 text-xs mt-1">Need {formatCurrency(pkg.price - depositBalance, profile?.preferredCurrency)} more</p>
                            </div>
                            <button
                              onClick={() => navigate('/trader/deposit')}
                              className="w-full py-4 rounded bg-[#87ceeb] text-[#0a0a0a] font-bold hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
                            >
                              <ArrowUpCircle size={18} /> Deposit Funds
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={isCurrent || purchasing === pkg.id || !isRelated}
                            onClick={() => handlePurchase(pkg.id)}
                            className={`w-full py-4 rounded font-bold transition-all flex items-center justify-center gap-2 ${isCurrent ? 'bg-green-500/10 text-green-500 cursor-not-allowed' : isRelated ? 'bg-[#121212] text-[#87ceeb] border border-[#87ceeb] hover:bg-[#87ceeb] hover:text-[#0a0a0a]' : 'bg-white/5 text-gray-400 border border-white/10 cursor-not-allowed'}`}
                          >
                            {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : isCurrent ? 'Active Tier' : isRelated ? 'Pay Now' : 'Not Related'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {hasActiveWithdrawalBot && currentFlowStep === 'verification' && (
          <div className="col-span-1 md:col-span-3 bg-[#121212] border border-white/10 rounded p-6">
            <h2 className="text-xl font-bold text-white mb-3">Verification Packages</h2>
            <p className="text-gray-400">Complete a verification bot purchase to finalize your withdrawal path and unlock higher confidence for admin review.</p>
          </div>
        )}

        {hasActiveWithdrawalBot && currentFlowStep === 'verification' && eligibleVerificationPackages.length === 0 && (
          <div className="col-span-1 md:col-span-3 bg-[#121212] border border-white/10 rounded p-6 text-center text-sm text-gray-400">
            No verification bot packages match your current withdrawal family. Please contact support or check back later.
          </div>
        )}

        {hasActiveWithdrawalBot && currentFlowStep === 'verification' && eligibleVerificationPackages.map((pkg) => {
          const isCurrentVerification = trader?.verificationBotTier === pkg.tier && trader?.verificationBotFamily === pkg.botFamily;
          const isRelatedVerification = normalizeName(pkg.name) === normalizeName(currentVerificationName);
          const amount = amountInputs[pkg.id] || pkg.price;
          return (
            <div key={pkg.id} className={`bg-[#121212] border rounded p-8 flex flex-col relative overflow-hidden transition-all duration-300 ${isCurrentVerification ? 'border-[#87ceeb] shadow-[0_0_20px_rgba(135,206,235,0.1)]' : 'border-white/5 hover:border-white/20'}`}>
              {pkg.tier === 'premium' && (
                <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                  <Star size={80} />
                </div>
              )}

              <h3 className="text-xl font-bold text-white mb-1 capitalize">{pkg.name}</h3>
              <p className="text-[#87ceeb] font-bold mb-6">{formatCurrency(pkg.price, profile?.preferredCurrency)}</p>

              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex gap-3 text-sm text-gray-400 items-start">
                  <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                  Verification payment for your withdrawal path
                </li>
                <li className="flex gap-3 text-sm text-gray-400 items-start">
                  <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                  Works with {pkg.botFamily || 'your withdrawal family'}
                </li>
                <li className="flex gap-3 text-sm text-gray-400 items-start">
                  <div className="w-1.5 h-1.5 bg-[#87ceeb] rounded-full mt-1.5 shrink-0" />
                  Required before withdrawal finalization
                </li>
              </ul>

              <div className="space-y-4 mt-auto">
                {!isCurrentVerification && (
                  depositBalance < pkg.price ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm">
                        <p className="text-yellow-500 font-semibold">Insufficient Balance</p>
                        <p className="text-yellow-400 text-xs mt-1">Need {formatCurrency(pkg.price - depositBalance, profile?.preferredCurrency)} more</p>
                      </div>
                      <button
                        onClick={() => navigate('/trader/deposit')}
                        className="w-full py-4 rounded bg-[#87ceeb] text-[#0a0a0a] font-bold hover:bg-[#76b9d6] transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowUpCircle size={18} /> Deposit Funds
                      </button>
                    </div>
                  ) : null
                )}
                <button
                  disabled={isCurrentVerification || purchasing === pkg.id || !isRelatedVerification}
                  onClick={() => handlePurchase(pkg.id)}
                  className={`w-full py-4 rounded font-bold transition-all flex items-center justify-center gap-2 ${isCurrentVerification ? 'bg-green-500/10 text-green-500 cursor-not-allowed' : isRelatedVerification ? 'bg-[#121212] text-[#87ceeb] border border-[#87ceeb] hover:bg-[#87ceeb] hover:text-[#0a0a0a]' : 'bg-white/5 text-gray-400 border border-white/10 cursor-not-allowed'}`}
                >
                  {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : isCurrentVerification ? 'Active Verification' : isRelatedVerification ? 'Pay Now' : 'Not Related'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
