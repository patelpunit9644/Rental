'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase-client';
import { signOut } from 'firebase/auth';
import { Car, LogOut, Activity, User } from 'lucide-react';
import Link from 'next/link';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Mobile Top Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <Link href="/employee/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-white text-base tracking-tight">
            Fleet<span className="text-emerald-400">Flow</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link 
            href="/employee/dashboard" 
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/40 transition"
            title="Dashboard"
          >
            <Activity className="w-5 h-5" />
          </Link>
          <Link 
            href="/employee/profile" 
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/40 transition"
            title="Profile Settings"
          >
            <User className="w-5 h-5" />
          </Link>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800/40 transition"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 pb-12">
        {children}
      </main>
    </div>
  );
}
