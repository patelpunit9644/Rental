import { prisma } from '@/lib/prisma';
import StaffClient from './StaffClient';

export const revalidate = 0;

export default async function StaffPage() {
  const staff = await prisma.user.findMany({
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Staff Management</h1>
        <p className="text-slate-400 text-sm mt-1">Add, update roles, and toggle access for rental office employees.</p>
      </div>

      <StaffClient initialStaff={staff} />
    </div>
  );
}
