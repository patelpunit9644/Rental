import { prisma } from '@/lib/prisma';
import FleetClient from './FleetClient';

export const revalidate = 0;

export default async function FleetPage() {
  const cars = await prisma.car.findMany({
    orderBy: { make: 'asc' },
  });

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Fleet Management</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor, adjust, add, and remove vehicles in your rental inventory.</p>
      </div>

      <FleetClient initialCars={cars} />
    </div>
  );
}
