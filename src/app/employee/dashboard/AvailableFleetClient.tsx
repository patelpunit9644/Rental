'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowUpRight, Milestone, Calendar, 
  AlertCircle, Search, SlidersHorizontal, Users
} from 'lucide-react';
import { Select } from '@/components/ui/Select';
import ReservationModal from '@/components/ReservationModal';
import { CarStatus } from '@prisma/client';

interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  color: string;
  dailyRate: number;
  currentOdo: number;
  status: string;
  needsService: boolean;
  seatingCapacity: number;
  transmission: string;
  type: string;
}

interface Rental {
  id: string;
  carId: string;
  pickupDate: Date;
  expectedReturnDate: Date;
  status: string;
}

interface AvailableFleetClientProps {
  cars: Car[];
  activeRentals: Rental[];
  employeeId: string;
}

export default function AvailableFleetClient({
  cars,
  activeRentals,
  employeeId,
}: AvailableFleetClientProps) {
  // Date check states
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');

  // Spec filters
  const [seatsFilter, setSeatsFilter] = useState('ALL');
  const [transFilter, setTransFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Booking Modal States
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);

  // Initialize dates asynchronously to satisfy react-hooks/set-state-in-effect and avoid SSR mismatch
  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const formatDateStr = (date: Date) => {
      return date.toISOString().split('T')[0];
    };

    const t = setTimeout(() => {
      setPickupDate(formatDateStr(today));
      setReturnDate(formatDateStr(tomorrow));
    }, 0);

    return () => clearTimeout(t);
  }, []);

  // Filtering Logic
  const filteredCars = cars.filter((car) => {
    // 1. Text Search query
    const term = searchQuery.toLowerCase();
    const matchesSearch = 
      car.make.toLowerCase().includes(term) ||
      car.model.toLowerCase().includes(term) ||
      car.licensePlate.toLowerCase().includes(term);
    
    if (!matchesSearch) return false;

    // 2. Seating Capacity Filter
    if (seatsFilter !== 'ALL') {
      if (seatsFilter === '2-4' && (car.seatingCapacity < 2 || car.seatingCapacity > 4)) return false;
      if (seatsFilter === '5' && car.seatingCapacity !== 5) return false;
      if (seatsFilter === '7+' && car.seatingCapacity < 7) return false;
    }

    // 3. Transmission Filter
    if (transFilter !== 'ALL' && car.transmission !== transFilter) return false;

    // 4. Car Type Filter
    if (typeFilter !== 'ALL' && car.type !== typeFilter) return false;

    // 5. Ignore decommissioned cars
    if (car.status === CarStatus.DECOMMISSIONED) return false;

    return true;
  });

  // Calculate availability for each car during selected date range
  const carsWithAvailability = filteredCars.map((car) => {
    let isAvailableForDates = true;
    let conflictReason = '';

    // If car status is MAINTENANCE, it cannot go out today
    if (car.status === CarStatus.MAINTENANCE) {
      isAvailableForDates = false;
      conflictReason = 'Under Maintenance';
    }

    // Check scheduling conflicts
    if (pickupDate && returnDate) {
      const selectedStart = new Date(pickupDate + 'T00:00:00');
      const selectedEnd = new Date(returnDate + 'T23:59:59');

      if (!isNaN(selectedStart.getTime()) && !isNaN(selectedEnd.getTime())) {
        const hasConflict = activeRentals.some((rental) => {
          if (rental.carId !== car.id) return false;
          
          const rentalStart = new Date(rental.pickupDate);
          const rentalEnd = new Date(rental.expectedReturnDate);
          
          // Overlap check: rental starts before selected ends AND rental ends after selected starts
          return rentalStart < selectedEnd && rentalEnd > selectedStart;
        });

        if (hasConflict) {
          isAvailableForDates = false;
          conflictReason = 'Booked / Rented Out';
        }
      }
    }

    return {
      ...car,
      isAvailableForDates,
      conflictReason,
    };
  });

  const handleOpenBookModal = (car: Car) => {
    setSelectedCar(car);
    setIsBookOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* FILTER PANEL */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-slate-800 pb-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-400" />
          Filter Fleet & Check Date Availability
        </div>

        {/* Date Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Pickup Date</label>
            <input 
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Expected Return Date</label>
            <input 
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Specs & Capacity Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search make, model, plate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <Select
            options={[
              { value: 'ALL', label: 'All Capacities' },
              { value: '2-4', label: '2-4 Seats' },
              { value: '5', label: '5 Seats' },
              { value: '7+', label: '7+ Seats' },
            ]}
            value={seatsFilter}
            onChange={(e) => setSeatsFilter(e.target.value)}
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Transmissions' },
              { value: 'Automatic', label: 'Automatic' },
              { value: 'Manual', label: 'Manual' },
            ]}
            value={transFilter}
            onChange={(e) => setTransFilter(e.target.value)}
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Car Types' },
              { value: 'Sedan', label: 'Sedan' },
              { value: 'SUV', label: 'SUV' },
              { value: 'Hatchback', label: 'Hatchback' },
              { value: 'Coupe', label: 'Coupe' },
              { value: 'Convertible', label: 'Convertible' },
              { value: 'Minivan', label: 'Minivan' },
              { value: 'Pickup Truck', label: 'Pickup Truck' },
            ]}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          />
        </div>
      </div>

      {/* RENDER AVAILABLE VEHICLES */}
      <div className="space-y-3">
        {carsWithAvailability.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-sm">
            No vehicles match your selected specifications.
          </div>
        ) : (
          carsWithAvailability.map((car) => {
            const isToday = pickupDate === new Date().toISOString().split('T')[0];
            const canDirectCheckout = car.isAvailableForDates && isToday && car.status === CarStatus.AVAILABLE;

            return (
              <div
                key={car.id}
                className={`bg-slate-900 border rounded-2xl p-4 transition flex flex-col justify-between gap-4 group ${
                  car.isAvailableForDates 
                    ? 'border-slate-800 hover:border-blue-500/50' 
                    : 'border-slate-800/40 opacity-70 hover:border-rose-500/20'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition">
                      {car.year} {car.make} {car.model}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 items-center mt-1 text-slate-500 text-xs">
                      <span className="uppercase font-mono font-bold text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-850">
                        {car.licensePlate}
                      </span>
                      <span>•</span>
                      <span>{car.color}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        {car.seatingCapacity} seats
                      </span>
                      <span>•</span>
                      <span>{car.transmission}</span>
                      <span>•</span>
                      <span>{car.type}</span>
                    </div>
                  </div>

                  {!car.isAvailableForDates ? (
                    <span className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {car.conflictReason}
                    </span>
                  ) : car.needsService ? (
                    <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Service Required
                    </span>
                  ) : (
                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                      Available
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {canDirectCheckout ? (
                    <Link
                      href={`/employee/checkout/${car.id}`}
                      className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl text-xs gap-1.5 transition"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Start Checkout (Release)
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="w-full flex items-center justify-center bg-slate-800 text-slate-500 font-semibold py-2 rounded-xl text-xs gap-1.5 transition cursor-not-allowed"
                      title="Checkout is only available if car is free starting today"
                    >
                      Checkout Unavailable
                    </button>
                  )}

                  <button
                    disabled={!car.isAvailableForDates}
                    onClick={() => handleOpenBookModal(car)}
                    className={`w-full flex items-center justify-center font-semibold py-2 rounded-xl text-xs gap-1.5 transition border ${
                      car.isAvailableForDates
                        ? 'bg-slate-950 hover:bg-slate-850 text-blue-400 border-blue-500/20 hover:border-blue-500/50 cursor-pointer'
                        : 'bg-slate-900/10 text-slate-600 border-slate-800/20 cursor-not-allowed'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    Pre-Book (Reserve)
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* BOOKING MODAL */}
      {selectedCar && (
        <ReservationModal
          car={selectedCar}
          employeeId={employeeId}
          isOpen={isBookOpen}
          onClose={() => setIsBookOpen(false)}
          initialPickupDate={pickupDate}
          initialReturnDate={returnDate}
        />
      )}
    </div>
  );
}
