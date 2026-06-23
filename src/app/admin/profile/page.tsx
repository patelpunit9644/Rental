import { getCurrentUser } from '@/lib/auth-session';
import ProfileClient from '@/components/ProfileClient';
import { redirect } from 'next/navigation';

export const revalidate = 0;

export default async function AdminProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Profile Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Update your personal account details and credentials.</p>
      </div>

      <ProfileClient user={user} />
    </div>
  );
}
