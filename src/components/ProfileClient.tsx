'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserProfile } from '@/actions/staff-actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ShieldCheck, UserCheck, AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react';

interface User {
  firebaseUid: string;
  name: string;
  email: string;
  role: string;
}

interface ProfileClientProps {
  user: User;
}

export default function ProfileClient({ user }: ProfileClientProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('Name is required.');
      setSaving(false);
      return;
    }

    if (password) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        setSaving(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        setSaving(false);
        return;
      }
    }

    try {
      const res = await updateUserProfile(user.firebaseUid, {
        name: name.trim(),
        password: password.trim() || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to update profile details.');
      }

      setSuccess('Profile updated successfully!');
      setPassword('');
      setConfirmPassword('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md bg-slate-900 border border-slate-850 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
      <div className="absolute top-[-50px] right-[-50px] w-32 h-32 rounded-full bg-blue-500/5 blur-[50px] pointer-events-none" />

      <div className="flex items-center gap-3 border-b border-slate-850 pb-4 mb-6">
        <div className="w-10 h-10 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
          <UserCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Account Profile</h2>
          <p className="text-xs text-slate-500 font-medium">Update your name or secure your account access.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-450 text-xs flex items-center gap-1.5 animate-pulse">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <Input
          label="Full Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="E.g. David Miller"
        />

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Email Address (Locked)</span>
          <div className="w-full bg-slate-950/40 border border-slate-850 rounded-xl py-2.5 px-3 text-slate-500 text-sm font-mono cursor-not-allowed select-none">
            {user.email}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Account Role</span>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950/60 border border-slate-850 text-xs text-slate-350 font-semibold rounded-lg select-none">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            {user.role}
          </div>
        </div>

        <div className="border-t border-slate-850 pt-4 mt-6 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-slate-500" /> Change Password
          </h3>

          <Input
            label="New Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 characters"
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-850 mt-6">
          <Button variant="primary" type="submit" loading={saving}>
            Save Profile Details
          </Button>
        </div>
      </form>
    </div>
  );
}
