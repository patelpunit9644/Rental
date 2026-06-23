'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth } from '@/lib/firebase-client';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { 
  Car, LayoutDashboard, Database, Users, 
  Menu, X, LogOut, ArrowRightLeft, User 
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.refresh();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Fleet Manager', href: '/admin/fleet', icon: Car },
    { name: 'Master Ledger', href: '/admin/ledger', icon: Database },
    { name: 'Staff Management', href: '/admin/staff', icon: Users },
    { name: 'Profile Settings', href: '/admin/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      
      {/* MOBILE HEADER */}
      <header className="md:hidden sticky top-0 z-40 bg-slate-900 border-b border-slate-850 px-4 py-3 flex items-center justify-between">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-white text-base tracking-tight">
            Fleet<span className="text-emerald-400">Flow</span>
          </span>
          <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded">
            Admin
          </span>
        </Link>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* SIDEBAR (Desktop & Mobile drawer) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-850 flex flex-col transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-screen
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand */}
        <div className="p-6 border-b border-slate-850 hidden md:flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/10">
            <Car className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-white text-lg tracking-tight block">
              Fleet<span className="text-emerald-400">Flow</span>
            </span>
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
              Management Portal
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition
                  ${isActive 
                    ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500' 
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area */}
        <div className="p-4 border-t border-slate-850 space-y-2">
          {/* Quick Switch to Employee View */}
          <Link
            href="/employee/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center justify-center gap-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-slate-100 font-semibold py-2.5 rounded-xl text-xs border border-slate-800 transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Switch to Operations
          </Link>
          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-rose-600/10 hover:bg-rose-600 border border-rose-600/20 hover:border-transparent text-rose-400 hover:text-white font-semibold py-2.5 rounded-xl text-xs transition"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* BACKDROP FOR MOBILE DRAW */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden"
        />
      )}

      {/* MAIN VIEW */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-h-screen">
        {children}
      </main>
    </div>
  );
}
