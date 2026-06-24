import React, { useState, useEffect, useRef } from 'react';
import api, { traderApi, paymentApi } from '../../services/api.js';
import { watchPaymentStatus } from '../../lib/paymentStatus.js';
import { formatCurrency } from '../../lib/currency.js';
import { useAuth } from '../../lib/AuthContext.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Database, AlertCircle, Loader2, Zap } from 'lucide-react';

export default function Mining() {
  const { profile } = useAuth();
  const [packages, setPackages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [phoneInputs, setPhoneInputs] = useState({});
  const [amountInputs, setAmountInputs] = useState({});
  const [message, setMessage] = useState(null);
  const paymentWatchRef = useRef(null);

  useEffect(() => () => paymentWatchRef.current?.(), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await traderApi.getDashboard();
        setPackages(response.data.packages.filter(p => p.type === 'mining'));
        setActiveSession(response.data.activeSession);
      } catch (err) {
        console.error(err);
        // Silently log fetch errors
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handlePurchase = async (pkgId) => {
    if (activeSession) return;
    const pkg = packages.find((item) => item.id === pkgId);
    const amount = amountInputs[pkgId] || pkg?.price || 0;
    if (!pkg) return;
    if (amount <= 0 || amount > pkg.price) {
      setMessage({ type: 'error', text: `Amount must be between 1 and ${formatCurrency(pkg.price, profile?.preferredCurrency)}` });
      return;
    }
    setPurchasing(pkgId);
    setMessage(null);
    try {
      const response = await paymentApi.initiateStkPush({ packageId: pkgId, amount, phoneNumber: phoneInputs[pkg.id] || profile?.phoneNumber || '' });
      setMessage({ type: 'success', text: 'STK push sent! Complete the payment to activate this mining rig.' });
      paymentWatchRef.current?.();
      paymentWatchRef.current = watchPaymentStatus(response.data.checkoutRequestId, (status) => {
        if (status === 'success') {
          setMessage({ type: 'success', text: 'Payment completed successfully. Your mining rig is now active.' });
          setTimeout(() => window.location.reload(), 1000);
        }
        if (status === 'failed') {
          setMessage({ type: 'error', text: 'Payment failed or was cancelled. Please try again.' });
        }
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to initiate payment' });
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Cloud Mining Rigs</h1>
          <p className="text-gray-400">Institutional-grade hashpower delivered to your dashboard.</p>
        </div>
        {activeSession && (
          <div className="bg-orange-500/10 border border-orange-500/20 text-orange-500 px-4 py-2 rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            You have an active session running.
          </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
          {message.text}
        </div>
      )}

      {packages.length === 0 ? (
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-12 text-center">
          <p className="text-gray-400 text-lg">No mining packages available at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-full bg-[#87ceeb]/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 mb-6">
                <Database size={24} />
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{pkg.name}</h3>
              <p className="text-gray-400 text-sm mb-6 flex-1">
                Secure a portion of our data center hashpower for high-yield mining blocks.
              </p>

              <div className="space-y-3 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Hashrate</span>
                  <span className="text-white font-medium flex items-center gap-1">
                    <Zap size={14} className="text-yellow-500" /> {pkg.hashrate}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Price</span>
                  <span className="text-white font-bold">{formatCurrency(pkg.price, profile?.preferredCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Expected Block Reward</span>
                  <span className="text-green-500 font-bold">{formatCurrency(pkg.expectedReturn, profile?.preferredCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cycle Duration</span>
                  <span className="text-white">{pkg.duration} Minutes</span>
                </div>
              </div>

              <div className="space-y-4 relative z-10">
                <input
                  type="number"
                  min="1"
                  max={pkg.price}
                  value={amountInputs[pkg.id] ?? pkg.price}
                  onChange={(e) => setAmountInputs((prev) => ({ ...prev, [pkg.id]: Number(e.target.value) }))}
                  placeholder={`Amount (max ${formatCurrency(pkg.price, profile?.preferredCurrency)})`}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-[#87ceeb] outline-none"
                />
                <input
                  type="text"
                  value={phoneInputs[pkg.id] ?? ''}
                  onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                  placeholder="2547XXXXXXXX"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-[#87ceeb] outline-none"
                />
                <button
                  disabled={activeSession || purchasing === pkg.id}
                  onClick={() => handlePurchase(pkg.id)}
                  className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${activeSession ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-[#87ceeb] text-[#0a0a0a] hover:bg-[#76b9d6]'}`}
                >
                  {purchasing === pkg.id ? <Loader2 className="animate-spin" /> : activeSession ? 'Active Rig Running' : 'Rent Rig'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}