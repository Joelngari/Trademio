import React, { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    platformName: '',
    adminReferralCode: '',
    marketerMinWithdrawal: 10,
    marketerCommissionPercent: 85,
    adminCutPercent: 15
  });
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSettings({
        platformName: data.platformName || '',
        adminReferralCode: data.adminReferralCode || '',
        marketerMinWithdrawal: data.marketerMinWithdrawal ?? 10,
        marketerCommissionPercent: data.marketerCommissionPercent ?? 85,
        adminCutPercent: data.adminCutPercent ?? 15
      });
    } catch (err) {
      console.error('Fetch settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Save failed');
      setStatusMessage('Settings saved successfully');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      setStatusMessage('Error: ' + err.message);
    }
  };

  if (loading) return <SkeletonLoader type="card" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Platform Settings</h1>
        <p className="text-gray-400">Update the application defaults and referral configuration.</p>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded border ${statusMessage.startsWith('Error') ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}>
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-[#121212] border border-white/5 rounded p-8 grid gap-4 max-w-3xl">
        <label className="space-y-2 text-white">
          <span className="font-semibold">Platform Name</span>
          <input
            type="text"
            value={settings.platformName}
            onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded text-white"
          />
        </label>

        <label className="space-y-2 text-white">
          <span className="font-semibold">Admin Referral Code</span>
          <input
            type="text"
            value={settings.adminReferralCode}
            onChange={(e) => setSettings({ ...settings, adminReferralCode: e.target.value })}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded text-white"
          />
        </label>

        <label className="space-y-2 text-white">
          <span className="font-semibold">Marketer Minimum Withdrawal</span>
          <input
            type="number"
            value={settings.marketerMinWithdrawal}
            onChange={(e) => setSettings({ ...settings, marketerMinWithdrawal: Number(e.target.value) })}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded text-white"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-2 text-white">
            <span className="font-semibold">Marketer Commission %</span>
            <input
              type="number"
              value={settings.marketerCommissionPercent}
              onChange={(e) => setSettings({ ...settings, marketerCommissionPercent: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded text-white"
            />
          </label>
          <label className="space-y-2 text-white">
            <span className="font-semibold">Admin Cut %</span>
            <input
              type="number"
              value={settings.adminCutPercent}
              onChange={(e) => setSettings({ ...settings, adminCutPercent: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded text-white"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="submit" className="px-6 py-3 bg-[#87ceeb] text-[#0a0a0a] rounded font-bold hover:bg-[#76b9d6]">Save Settings</button>
        </div>
      </form>
    </div>
  );
}
