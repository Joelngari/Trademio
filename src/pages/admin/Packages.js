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
    duration: 60
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
      setFormData({ type: 'forex', name: '', price: 0, expectedReturn: 0, duration: 60 });
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
    setFormData({ type: pkg.type, name: pkg.name, price: pkg.price, expectedReturn: pkg.expectedReturn, duration: pkg.duration });
    setShowForm(true);
  };

  if (loading) return <SkeletonLoader type="card" />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Package Management</h1>
          <p className="text-gray-400">Create, edit, or delete trading packages.</p>
        </div>
        <button onClick={() => { setEditingId(null); setShowForm(true); }} className="bg-[#87ceeb] text-[#0a0a0a] px-6 py-3 rounded-xl font-bold hover:bg-[#76b9d6] flex items-center gap-2">
          <Plus size={18} /> Add Package
        </button>
      </div>

      {showForm && (
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-8 space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{editingId ? 'Edit' : 'Create'} Package</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-xl">
                <option value="forex">Forex</option>
                <option value="crypto">Crypto</option>
                <option value="mining">Mining</option>
                <option value="investment">Investment</option>
                <option value="lifespan">Lifespan</option>
                <option value="withdrawal-bot">Withdrawal Bot</option>
              </select>
              <input type="text" placeholder="Package name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-xl" required />
              <input type="number" placeholder="Price" value={formData.price} onChange={(e) => setFormData({...formData, price: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-xl" required />
              <input type="number" placeholder="Expected Return" value={formData.expectedReturn} onChange={(e) => setFormData({...formData, expectedReturn: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-xl" required />
              <input type="number" placeholder="Duration (minutes/days)" value={formData.duration} onChange={(e) => setFormData({...formData, duration: Number(e.target.value)})} className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-xl" required />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 bg-white/5 text-white rounded-xl hover:bg-white/10">Cancel</button>
              <button type="submit" className="px-6 py-2 bg-[#87ceeb] text-[#0a0a0a] rounded-xl font-bold hover:bg-[#76b9d6]">{editingId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {packages.map((pkg) => (
          <div key={pkg.id} className="bg-[#121212] border border-white/5 rounded-2xl p-6 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-400 uppercase">{pkg.type}</p>
              <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
              <p className="text-gray-400 text-sm mt-1">Price: {pkg.price} KES | Return: {pkg.expectedReturn} KES | Duration: {pkg.duration}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(pkg)} className="p-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg"><Edit2 size={18} /></button>
              <button onClick={() => handleDelete(pkg.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
