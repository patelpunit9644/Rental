import { prisma } from '@/lib/prisma';
import LedgerClient from './LedgerClient';

export const revalidate = 0;

export default async function LedgerPage() {
  const rentals = await prisma.rental.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      car: true,
      employee: true,
      conditionLogs: true,
    },
  });

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Master Ledger</h1>
        <p className="text-slate-400 text-sm mt-1">Audit complete rental history, check-in values, and condition photos.</p>
      </div>

      <LedgerClient initialRentals={rentals} />
    </div>
  );
}
