import { prisma } from '@/lib/prisma';
import { RentalStatus } from '@prisma/client';
import { 
  Car, AlertTriangle, TrendingUp, 
  CalendarClock, ClipboardList 
} from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0; // Always fetch fresh database stats

export default async function AdminDashboard() {
  // Aggregate KPIs
  const totalFleet = await prisma.car.count();
  
  const activeRentals = await prisma.rental.count({
    where: { status: RentalStatus.ACTIVE },
  });

  const overdueRentals = await prisma.rental.count({
    where: {
      OR: [
        { status: RentalStatus.OVERDUE },
        {
          status: RentalStatus.ACTIVE,
          expectedReturnDate: { lt: new Date() },
        },
      ],
    },
  });

  const needsServiceCount = await prisma.car.count({
    where: { needsService: true },
  });

  const financials = await prisma.rental.aggregate({
    _sum: {
      totalCostExpected: true,
      totalCostCollected: true,
      depositCollected: true,
    },
  });

  const expectedRevenue = financials._sum.totalCostExpected || 0;
  const collectedRevenue = financials._sum.totalCostCollected || 0;

  // Fetch recent rentals (last 5)
  const recentRentals = await prisma.rental.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      car: true,
      employee: true,
    },
  });

  // Fetch cars needing service
  const serviceAlertCars = await prisma.car.findMany({
    where: { needsService: true },
    take: 5,
  });

  const kpis = [
    {
      title: 'Total Fleet',
      value: totalFleet,
      description: 'Vehicles in database',
      icon: Car,
      colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      link: '/admin/fleet',
    },
    {
      title: 'Active Rentals',
      value: activeRentals,
      description: 'Vehicles currently out',
      icon: ClipboardList,
      colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
      link: '/admin/ledger',
    },
    {
      title: 'Overdue Returns',
      value: overdueRentals,
      description: 'Past expected return date',
      icon: CalendarClock,
      colorClass: overdueRentals > 0 
        ? 'text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse' 
        : 'text-slate-400 bg-slate-800/40 border-slate-800',
      link: '/admin/ledger',
    },
    {
      title: 'Service Alerts',
      value: needsServiceCount,
      description: 'Pushed past 7,500km check',
      icon: AlertTriangle,
      colorClass: needsServiceCount > 0 
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' 
        : 'text-slate-400 bg-slate-800/40 border-slate-800',
      link: '/admin/fleet',
    },
  ];

  return (
    <div className="space-y-8 font-sans">
      
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-white">System Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time health, operations, and financial summary.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link 
              key={kpi.title} 
              href={kpi.link}
              className={`p-6 bg-slate-900 border rounded-3xl flex flex-col justify-between hover:border-slate-700 transition group`}
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{kpi.title}</span>
                <div className={`p-2.5 rounded-xl border ${kpi.colorClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white group-hover:text-blue-400 transition">{kpi.value}</span>
                <span className="text-xs text-slate-500 block mt-1">{kpi.description}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Financials Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expected vs Collected revenue */}
        <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-[-50px] right-[-50px] w-32 h-32 rounded-full bg-blue-500/5 blur-[50px] pointer-events-none" />
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Financial Operations
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Collected Revenue</span>
              <span className="text-2xl font-black text-emerald-400 block mt-2">${collectedRevenue.toLocaleString()}</span>
              <span className="text-xs text-slate-500 block mt-1">Settled return invoices</span>
            </div>
            <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Expected Revenue</span>
              <span className="text-2xl font-black text-blue-400 block mt-2">${expectedRevenue.toLocaleString()}</span>
              <span className="text-xs text-slate-500 block mt-1">Active + completed rental values</span>
            </div>
          </div>
        </div>

        {/* Maintenance Service Alerts */}
        <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Maintenance & Service Warnings
          </h2>
          {serviceAlertCars.length === 0 ? (
            <div className="bg-slate-950/30 border border-slate-850 rounded-2xl p-6 text-center text-slate-500 text-xs">
              All vehicles are cleared. No vehicles require immediate 7,500km interval service.
            </div>
          ) : (
            <div className="space-y-3">
              {serviceAlertCars.map((car) => (
                <div key={car.id} className="flex justify-between items-center p-3 bg-slate-950/40 border border-slate-850 rounded-2xl text-sm">
                  <div>
                    <span className="font-bold text-slate-200">{car.make} {car.model}</span>
                    <span className="text-slate-500 text-xs font-mono ml-2">({car.licensePlate})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">{car.currentOdo.toLocaleString()} km</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      Service Required
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Ledger Logs */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white">Recent Activities</h2>
          <Link href="/admin/ledger" className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition">
            View Master Ledger
          </Link>
        </div>
        {recentRentals.length === 0 ? (
          <div className="text-center p-8 text-slate-500 text-sm">
            No rental activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="text-xs uppercase font-semibold text-slate-500 border-b border-slate-850">
                <tr>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Vehicle</th>
                  <th className="pb-3">Employee</th>
                  <th className="pb-3">Dates</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                {recentRentals.map((rental) => (
                  <tr key={rental.id} className="hover:bg-slate-850/10 transition">
                    <td className="py-3 font-semibold text-slate-200">{rental.customerName}</td>
                    <td className="py-3">{rental.car.make} {rental.car.model}</td>
                    <td className="py-3 text-slate-300">{rental.employee.name}</td>
                    <td className="py-3 text-xs">
                      {new Date(rental.pickupDate).toLocaleDateString()} - {new Date(rental.expectedReturnDate).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                        rental.status === RentalStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        rental.status === RentalStatus.ACTIVE ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        rental.status === RentalStatus.OVERDUE ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {rental.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
    </div>
  );
}
