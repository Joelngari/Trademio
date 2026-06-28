import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth } from '../../lib/firebase.js';
import SkeletonLoader from '../../components/SkeletonLoader.js';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function AdminPackages() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    type: 'forex',
    name: '',
    price: 0,
    expectedReturn: 0,
    duration: 60,
    botFamily: '',
    role: '',
    category: ''
  });
  const [botSetData, setBotSetData] = useState({
    family: 'forex',
    baseName: '',
    price: 0,
    expectedReturn: 0,
    duration: 60,
    tier: 'basic',
    maxAmount: 0
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = await auth.currentUser.getIdToken();
      const endpoint = editingId ? `/api/admin/package/${editingId}` : '/api/admin/package';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('Failed');
      setShowForm(false);
      setEditingId(null);
      setFormData({ type: 'forex', name: '', price: 0, expectedReturn: 0, duration: 60, botFamily: '', role: '', category: '' });
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this package?')) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/package/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEdit = (pkg) => {
    setEditingId(pkg.id);
    setFormData({
      type: pkg.type,
      name: pkg.name,
      price: pkg.price,
      expectedReturn: pkg.expectedReturn,
      duration: pkg.duration,
      botFamily: pkg.botFamily || '',
      role: pkg.role || '',
      category: pkg.category || ''
    });
    setShowForm(true);
  };

  const handleCreateBotSet = async (e) => {
    e.preventDefault();
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/package-set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(botSetData)
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create bot set');
      }
      setBotSetData({ family: 'forex', baseName: '', price: 0, expectedReturn: 0, duration: 60, tier: 'basic', maxAmount: 0 });
      alert('Bot set created successfully');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleResetCatalog = async () => {
    if (!window.confirm('Reset the entire package catalog to the default bot set configuration? This will delete existing packages.')) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/package-catalog/reset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to reset catalog');
      }
      alert('Package catalog reset successfully');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) return <SkeletonLoader type="card" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Package Management</h1>
          <p className="text-gray-400">Create, edit, or delete trading packages.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => { setEditingId(null); setShowForm(true); }} className="bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded font-bold hover:bg-[#76b9d6] flex items-center gap-2">
            <Plus size={18} /> Add Individual Package
          </button>
          <button onClick={handleResetCatalog} className="bg-transparent border border-white/10 text-white px-6 py-3 rounded font-bold hover:bg-white/5">
            Reset Package Catalog
          </button>
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded p-8 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Create Bot Set</h2>
            <p className="text-gray-400 text-sm">Select a bot family and base name to create trading, withdrawal, and verification packages together.</p>
          </div>
        </div>
        <form onSubmit={handleCreateBotSet} className="grid gap-4 md:grid-cols-2">
          <select value={botSetData.family} onChange={(e) => setBotSetData({...botSetData, family: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded">
            <option value="forex">Forex</option>
            <option value="crypto">Crypto</option>
            <option value="mining">Mining</option>
            <option value="investment">Investment</option>
            <option value="lifespan">Lifespan</option>
          </select>
          <input type="text" placeholder="Base name (e.g. Silver)" value={botSetData.baseName} onChange={(e) => setBotSetData({...botSetData, baseName: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
          <input type="number" placeholder="Price" value={botSetData.price} onChange={(e) => setBotSetData({...botSetData, price: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
          <input type="number" placeholder="Expected Return" value={botSetData.expectedReturn} onChange={(e) => setBotSetData({...botSetData, expectedReturn: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
          <input type="number" placeholder="Duration" value={botSetData.duration} onChange={(e) => setBotSetData({...botSetData, duration: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
          <input type="number" placeholder="Withdrawal/Verification Max Amount" value={botSetData.maxAmount} onChange={(e) => setBotSetData({...botSetData, maxAmount: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
          <input type="text" placeholder="Tier (e.g. basic)" value={botSetData.tier} onChange={(e) => setBotSetData({...botSetData, tier: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
          <button type="submit" className="md:col-span-2 bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded font-bold hover:bg-[#76b9d6]">Create Bot Set</button>
        </form>
      </div>

      {showForm && (
        <div className="bg-[#121212] border border-white/5 rounded p-8 space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{editingId ? 'Edit' : 'Create'} Package</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded">
                <option value="forex">Forex Trading Bot</option>
                <option value="crypto">Crypto Trading Bot</option>
                <option value="mining">Mining Trading Bot</option>
                <option value="investment">Investment Trading Bot</option>
                <option value="lifespan">Lifespan Trading Bot</option>
                <option value="withdrawal-bot">Withdrawal Bot</option>
                <option value="verification-bot">Verification Bot</option>
              </select>
              <input type="text" placeholder="Package name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
              <input type="number" placeholder="Price" value={formData.price} onChange={(e) => setFormData({...formData, price: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
              <input type="number" placeholder="Expected Return" value={formData.expectedReturn} onChange={(e) => setFormData({...formData, expectedReturn: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
              <input type="number" placeholder="Duration (minutes/days)" value={formData.duration} onChange={(e) => setFormData({...formData, duration: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" required />
              <input type="text" placeholder="Bot family (e.g. Synapse)" value={formData.botFamily} onChange={(e) => setFormData({...formData, botFamily: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded" />
              <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded">
                <option value="">Select role</option>
                <option value="trading">Trading</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="verification">Verification</option>
              </select>
              <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded">
                <option value="">Select category</option>
                <option value="forex">Forex</option>
                <option value="crypto">Crypto</option>
                <option value="mining">Mining</option>
                <option value="investment">Investment</option>
                <option value="lifespan">Lifespan</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 bg-white/5 text-white rounded hover:bg-white/10">Cancel</button>
              <button type="submit" className="px-6 py-2 bg-[#87ceeb] text-[#0a0a0a] rounded font-bold hover:bg-[#76b9d6]">{editingId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {packages.map((pkg) => (
          <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded p-6 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-400 uppercase">{pkg.type}</p>
              <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
              <p className="text-gray-400 text-sm mt-1">Price: {pkg.price} KES | Return: {pkg.expectedReturn} KES | Duration: {pkg.duration}</p>
              <p className="text-gray-500 text-xs mt-1">Family: {pkg.botFamily || 'n/a'} | Role: {pkg.role || 'n/a'} | Category: {pkg.category || 'n/a'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(pkg)} className="p-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded"><Edit2 size={18} /></button>
              <button onClick={() => handleDelete(pkg.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
