import React from 'react';
import { Menu, User, Bell } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.js';

export default function TopBar({ setIsOpen }) {
  const { user, profile } = useAuth();

  return (
    <header className="h-16 bg-[#121212]/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden"
        >
          <Menu size={20} />
        </button>
        
        {/* Logo */}
        <div className="hidden md:flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] border border-[#ffd700] rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-[#ffd700]">VM</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-white">Velnix Markets</h1>
            <p className="text-[10px] text-gray-400">Trading Platform</p>
          </div>
        </div>

        <div className="md:hidden">
          <div className="w-8 h-8 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] border border-[#ffd700] rounded-full flex items-center justify-center">
            <span className="text-[10px] font-bold text-[#ffd700]">VM</span>
          </div>
        </div>

        <div className="hidden md:block">
          <h2 className="text-sm font-medium text-gray-400">Welcome back,</h2>
          <p className="text-sm font-bold text-white">{profile?.name || user?.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#87ceeb] rounded-full border-2 border-[#121212]" />
        </button>
        <div className="h-8 w-px bg-white/5 mx-2" />
        <div className="flex items-center gap-3 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-white uppercase">{profile?.role}</p>
            <p className="text-[10px] text-gray-500">{profile?.status}</p>
          </div>
          <div className="w-9 h-9 bg-[#87ceeb]/10 border border-[#87ceeb]/20 rounded-full flex items-center justify-center text-[#87ceeb]">
            <User size={20} />
          </div>
        </div>
      </div>
    </header>
  );
}
