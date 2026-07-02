import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext.js';
import { traderApi, paymentApi } from '../../services/api.js';
import api from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { ShieldCheck, ArrowRight, Loader2, Star, Clock } from 'lucide-react';

export default function WithdrawalBot() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [trader, setTrader] = useState(null);
  const [botPurchases, setBotPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phoneInputs, setPhoneInputs] = useState({});
  const [amountInputs, setAmountInputs] = useState({});
  const [message, setMessage] = useState(null);
  const [flowStep, setFlowStep] = useState('withdrawal');
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);

  const fetchPendingPurchases = async () => {
    try {
      const purchasesRes = await traderApi.getBotPurchases();
      setBotPurchases(purchasesRes.data.botPurchases || []);
    } catch (err) {
      console.warn('Failed to fetch bot purchases:', err);
    }
  };

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
        
        const initialAmounts = {};
        allPackages.forEach(p => {
          initialAmounts[p.id] = p.price;
        });
        setAmountInputs(initialAmounts);
        
        await fetchPendingPurchases();
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

  const handlePurchase = async (pkgId, isResume = false, botPurchaseId = null) => {
    setPurchasing(pkgId);
    setMessage(null);
    try {
      const amount = amountInputs[pkgId];
      
      if (!amount || amount <= 0) {
        setMessage({ type: 'error', text: 'Please enter a valid amount' });
        setPurchasing(null);
        return;
      }

      const pkg = packages.find(p => p.id === pkgId);
      if (amount > pkg.price) {
        setMessage({ type: 'error', text: `Amount cannot exceed ${formatCurrency(pkg.price, profile?.preferredCurrency)}` });
        setPurchasing(null);
        return;
      }

      const response = await paymentApi.initiateStkPush({ 
        packageId: pkgId, 
        amount: amount,
        phoneNumber: phoneInputs[pkgId] || profile?.phoneNumber || '',
        botPurchaseId: isResume ? botPurchaseId : undefined
      });

      const isPartial = amount < pkg.price;
      const msgText = isPartial 
        ? `STK push sent for ${formatCurrency(amount, profile?.preferredCurrency)}. Complete payment for ${formatCurrency(pkg.price, profile?.preferredCurrency)} ${pkg.name}.`
        : pkg?.type === 'withdrawal-bot'
          ? 'STK push sent! Complete the payment to activate this withdrawal bot.'
          : 'STK push sent! Complete the payment to activate this verification bot.';
      
      if (isPartial && response.data.botPurchaseId && !isResume) {
        setBotPurchases((prev) => [
          {
            id: response.data.botPurchaseId,
            packageInfo: { id: pkg.id, name: pkg.name, price: pkg.price, type: pkg.type },
            requiredAmount: pkg.price,
            amountPaid: amount,
            outstandingAmount: Math.max(pkg.price - amount, 0),
            status: 'pending'
          },
          ...prev.filter((purchase) => purchase.id !== response.data.botPurchaseId)
        ]);
      }

      setMessage({ type: 'success', text: msgText });
      paymentWatchRef.current?.();
      paymentWatchRef.current = watchPaymentStatus(response.data.checkoutRequestId, async (status) => {
        if (status === 'success') {
          const successMsg = isPartial
            ? 'Payment recorded! Your mentor will reconcile the remaining amount.'
            : pkg?.type === 'verification-bot'
              ? 'Verification bot activated. Completing your withdrawal request now.'
              : 'Withdrawal bot activated. Please complete the related verification bot.';
          setMessage({ type: 'success', text: successMsg });

          if (!isPartial && pkg?.type === 'withdrawal-bot') {
            setFlowStep('verification');
            setTimeout(async () => {
              await fetchTrader();
              window.location.reload();
            }, 1200);
            return;
          }

          if (!isPartial && pkg?.type === 'verification-bot' && requestedWithdrawal && Number(requestedWithdrawal) > 0) {
            try {
              const phoneToUse = requestedPhoneFromNav || phoneInputs[pkg.id] || profile?.phoneNumber || '';
              await api.post('/trader/withdraw', { amount: Number(requestedWithdrawal), phoneNumber: phoneToUse });
              setMessage({ type: 'success', text: 'Congratulations for completing the withdrawal. Check the email you used to create your account for more information' });
            } catch (err) {
              setMessage({ type: 'error', text: err.response?.data?.message || 'Verification succeeded but failed to create withdrawal request' });
            }
          }

          if (isPartial) {
            await fetchPendingPurchases();
          } else if (!isPartial && pkg?.type === 'verification-bot') {
            await fetchTrader();
          } else if (pkg?.type !== 'verification-bot' || !requestedWithdrawal) {
            setTimeout(() => window.location.reload(), 2000);
          }
        }
        if (status === 'failed') {
          setMessage({ type: 'error', text: 'Payment failed or was cancelled. Please try again.' });
        }
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.userMessage || err.response?.data?.message || 'Failed to initiate payment' });
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

      {/* Pending Purchases */}
      {botPurchases.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-6">
          <div className="flex items-start gap-3 mb-4">
            <Clock className="text-yellow-500 mt-1" size={24} />
            <div>
              <h3 className="text-lg font-bold text-white">Pending Purchases</h3>
              <p className="text-sm text-gray-400">Complete these purchases or wait for your mentor to reconcile the remainder.</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {botPurchases.map((purchase) => (
              <div key={purchase.id} className="bg-black/30 border border-white/10 rounded p-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-white font-semibold">{purchase.packageInfo?.name || 'Bot'}</p>
                  <p className="text-sm text-gray-400">
                    {formatCurrency(purchase.amountPaid, profile?.preferredCurrency)} of {formatCurrency(purchase.requiredAmount, profile?.preferredCurrency)} paid
                  </p>
                  <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                    <div 
                      className="bg-[#87ceeb] h-2 rounded-full transition-all" 
                      style={{ width: `${(purchase.amountPaid / purchase.requiredAmount) * 100}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAmountInputs(prev => ({ ...prev, [purchase.packageInfo?.id]: purchase.outstandingAmount }));
                    setPhoneInputs(prev => ({ ...prev, [purchase.packageInfo?.id]: phoneInputs[purchase.packageInfo?.id] || profile?.phoneNumber || '' }));
                    handlePurchase(purchase.packageInfo?.id, true, purchase.id);
                  }}
                  disabled={purchasing === purchase.packageInfo?.id}
                  className="ml-4 px-4 py-2 bg-[#87ceeb] text-[#0a0a0a] rounded font-semibold hover:bg-[#76b9d6] transition-all whitespace-nowrap disabled:opacity-50"
                >
                  {purchasing === purchase.packageInfo?.id ? 'Processing...' : 'Complete Payment'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                             <input 
                              type="text" 
                              value={phoneInputs[pkg.id] ?? ''}
                              onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                              placeholder="M-Pesa Number"
                              className="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                             />
                             {/* Resume banner: if there's an existing pending purchase for this package, show prompt */}
                             {botPurchases.some(bp => bp.packageInfo?.id === pkg.id) && (
                               <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-sm text-yellow-200">
                                 You have a pending purchase for this plan. Resume it from the Pending Purchases panel above to avoid creating duplicates.
                               </div>
                             )}
                         <div>
                           <label className="text-xs text-gray-400 block mb-2">Payment Amount</label>
                           <input 
                            type="number" 
                            value={amount}
                            onChange={(e) => setAmountInputs((prev) => ({ ...prev, [pkg.id]: parseFloat(e.target.value) || 0 }))}
                            min="1"
                            max={pkg.price}
                            className="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                           />
                           <p className="text-xs text-gray-500 mt-1">1 - {formatCurrency(pkg.price, profile?.preferredCurrency)}</p>
                         </div>
                       </>
                     )}
                     <button
                       disabled={isCurrent || purchasing === pkg.id || !isRelated}
                       onClick={() => handlePurchase(pkg.id)}
                       className={`w-full py-4 rounded font-bold transition-all flex items-center justify-center gap-2 ${isCurrent ? 'bg-green-500/10 text-green-500 cursor-not-allowed' : isRelated ? 'bg-[#121212] text-[#87ceeb] border border-[#87ceeb] hover:bg-[#87ceeb] hover:text-[#0a0a0a]' : 'bg-white/5 text-gray-400 border border-white/10 cursor-not-allowed'}`}
                     >
                       {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : isCurrent ? 'Active Tier' : isRelated ? 'Pay Now' : 'Not Related'}
                     </button>
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
                  <>
                    <input
                      type="text"
                      value={phoneInputs[pkg.id] ?? ''}
                      onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                      placeholder="M-Pesa Number"
                      className="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                    />
                    <div>
                      <label className="text-xs text-gray-400 block mb-2">Payment Amount</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmountInputs((prev) => ({ ...prev, [pkg.id]: parseFloat(e.target.value) || 0 }))}
                        min="1"
                        max={pkg.price}
                        className="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">1 - {formatCurrency(pkg.price, profile?.preferredCurrency)}</p>
                    </div>
                  </>
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
