import { prisma } from '@/lib/prisma';
import { CarStatus, RentalStatus } from '@prisma/client';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-session';
import { ArrowDownLeft, Fuel, Calendar } from 'lucide-react';
import Link from 'next/link';
import AvailableFleetClient from './AvailableFleetClient';
import ReservationsListClient from './ReservationsListClient';
import EmployeeHistoryClient from './EmployeeHistoryClient';
import { formatFuelLevel } from '@/lib/utils';

export const revalidate = 0; // Disable caching so it's always fresh

export default async function EmployeeDashboardPage() {
  // 1. Authenticate user
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return redirect('/login');
  }

  // 2. Fetch all cars (excluding decommissioned) for filtering
  const cars = await prisma.car.findMany({
    where: {
      status: {
        not: CarStatus.DECOMMISSIONED,
      },
    },
    orderBy: { make: 'asc' },
  });

  // 3. Fetch active and reserved rentals for conflict checks
  const conflictingRentals = await prisma.rental.findMany({
    where: {
      status: {
        in: [RentalStatus.ACTIVE, RentalStatus.OVERDUE, RentalStatus.RESERVED],
      },
    },
    select: {
      id: true,
      carId: true,
      pickupDate: true,
      expectedReturnDate: true,
      status: true,
    },
  });

  // 4. Fetch pending reservations to display
  const reservations = await prisma.rental.findMany({
    where: {
      status: RentalStatus.RESERVED,
    },
    include: {
      car: true,
    },
    orderBy: {
      pickupDate: 'asc',
    },
  });

  // 5. Fetch active rentals expected to return
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

  // 6. Fetch completed rentals for ledger/history
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
        <p className="text-slate-400 text-sm mt-1">Manage departure checkouts, returns, and bookings.</p>
      </div>

      {/* Grid Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left / Main Section: Available Fleet Finder (span 2) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              Find & Reserve Available Fleet
            </h2>
          </div>
          <AvailableFleetClient 
            cars={cars} 
            activeRentals={conflictingRentals} 
            employeeId={user.firebaseUid} 
          />
        </div>

        {/* Right Section: Sidebar (span 1) */}
        <div className="space-y-8">
          
          {/* SIDEBAR SECTION 1: PRE-BOOKINGS / RESERVATIONS */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Upcoming Pre-Bookings
              </h2>
              <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full font-semibold">
                {reservations.length} Booked
              </span>
            </div>
            <ReservationsListClient reservations={reservations} />
          </div>

          {/* SIDEBAR SECTION 2: RETURNING TODAY (CHECKIN) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Returning Today (Active)
              </h2>
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-semibold">
                {activeRentals.length} Out
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
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${isOverdue ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-slate-850 text-slate-450'}`}>
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
                        className="w-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-xl text-xs gap-1.5 transition"
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

        </div>
      </div>

      {/* SECTION 4: COMPLETED HISTORY & INVOICING */}
      <div className="border-t border-slate-850 pt-8 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Recent Billing Transactions
          </h2>
        </div>
        <EmployeeHistoryClient initialRentals={completedRentals} />
      </div>

    </div>
  );
}
