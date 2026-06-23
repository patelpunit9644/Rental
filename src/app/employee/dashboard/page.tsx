import { prisma } from '@/lib/prisma';
import { CarStatus, RentalStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownLeft, Fuel, Milestone, Calendar, AlertCircle } from 'lucide-react';
import EmployeeHistoryClient from './EmployeeHistoryClient';
import { formatFuelLevel } from '@/lib/utils';

export const revalidate = 0; // Disable caching so it's always fresh

export default async function EmployeeDashboardPage() {
  // Fetch available cars (ready to go out)
  const availableCars = await prisma.car.findMany({
    where: { status: CarStatus.AVAILABLE },
    orderBy: { make: 'asc' },
  });

  // Fetch active rentals (expected to return)
  const activeRentals = await prisma.rental.findMany({
    where: {
      status: {
        in: [RentalStatus.ACTIVE, RentalStatus.OVERDUE],
      },
    },
    include: {
      car: true,
    },
    orderBy: {
      expectedReturnDate: 'asc',
    },
  });

  // Fetch completed rentals (past history/ledger) for invoicing
  const completedRentals = await prisma.rental.findMany({
    where: {
      status: RentalStatus.COMPLETED,
    },
    include: {
      car: true,
      employee: true,
      conditionLogs: true,
    },
    orderBy: {
      actualReturnDate: 'desc',
    },
    take: 10,
  });

  return (
    <div className="flex flex-col gap-8 py-2">
      {/* Welcome Banner */}
      <div>
        <h1 className="text-2xl font-bold text-white">Operations Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Manage departure checkouts and return checkins.</p>
      </div>

      {/* Grid Split View */}
      <div className="grid grid-cols-1 gap-8">
        
        {/* SECTION 1: GOING OUT TODAY (CHECKOUT) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              Going Out Today (Available Fleet)
            </h2>
            <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2.5 py-1 rounded-full font-semibold">
              {availableCars.length} Ready
            </span>
          </div>

          {availableCars.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
              No vehicles available for checkout at this moment.
            </div>
          ) : (
            <div className="space-y-3">
              {availableCars.map((car) => (
                <div
                  key={car.id}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 transition flex flex-col justify-between gap-4 group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition">
                        {car.year} {car.make} {car.model}
                      </h3>
                      <span className="text-slate-500 text-xs uppercase font-mono mt-0.5 block">
                        {car.licensePlate} • {car.color}
                      </span>
                    </div>
                    {car.needsService && (
                      <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Service Required
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800/60 pt-3 text-xs text-slate-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Milestone className="w-3.5 h-3.5 text-slate-500" />
                      {car.currentOdo.toLocaleString()} km
                    </span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${car.dailyRate.toFixed(2)}/day
                    </span>
                  </div>

                  <Link
                    href={`/employee/checkout/${car.id}`}
                    className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-xs gap-1.5 transition"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Start Checkout Wizard
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 2: RETURNING TODAY (CHECKIN) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Returning Today (Active Rentals)
            </h2>
            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-2.5 py-1 rounded-full font-semibold">
              {activeRentals.length} Active
            </span>
          </div>

          {activeRentals.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
              No vehicles currently rented out.
            </div>
          ) : (
            <div className="space-y-3">
              {activeRentals.map((rental) => {
                const isOverdue = rental.status === RentalStatus.OVERDUE || new Date(rental.expectedReturnDate) < new Date();
                return (
                  <div
                    key={rental.id}
                    className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 transition flex flex-col justify-between gap-4 group"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-base group-hover:text-emerald-400 transition">
                          {rental.car.make} {rental.car.model}
                        </h3>
                        <p className="text-slate-400 text-xs mt-1">
                          Renter: <span className="text-slate-200 font-semibold">{rental.customerName}</span>
                        </p>
                      </div>
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${isOverdue ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                        {isOverdue ? 'Overdue' : 'Active'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 border-t border-slate-800/60 pt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Expected: {new Date(rental.expectedReturnDate).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Fuel className="w-3.5 h-3.5 text-slate-500" />
                        Fuel Out: {formatFuelLevel(rental.startFuel)}
                      </span>
                    </div>

                    <Link
                      href={`/employee/checkin/${rental.id}`}
                      className="w-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-xs gap-1.5 transition"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      Start Check-In Return
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 3: COMPLETED & BILLING (HISTORY) */}
        <div>
          <div className="flex items-center justify-between mb-4 border-t border-slate-800/60 pt-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              Completed History & Invoicing
            </h2>
            <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2.5 py-1 rounded-full font-semibold">
              Recent 10
            </span>
          </div>

          <EmployeeHistoryClient initialRentals={completedRentals} />
        </div>

      </div>
    </div>
  );
}
