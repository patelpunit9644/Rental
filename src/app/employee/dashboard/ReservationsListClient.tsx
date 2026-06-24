'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cancelReservation } from '@/actions/rental-actions';
import { Calendar, Trash2, ArrowUpRight } from 'lucide-react';

interface Car {
  make: string;
  model: string;
  year: number;
  licensePlate: string;
}

interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  pickupDate: Date;
  expectedReturnDate: Date;
  totalCostExpected: number;
  car: Car;
}

interface ReservationsListClientProps {
  reservations: Reservation[];
}

export default function ReservationsListClient({ reservations }: ReservationsListClientProps) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to cancel the reservation for ${name}?`)) return;

    setCancellingId(id);
    try {
      const res = await cancelReservation(id);
      if (!res.success) {
        alert(res.error || 'Failed to cancel reservation.');
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      alert('An error occurred while cancelling.');
    } finally {
      setCancellingId(null);
    }
  };

  if (reservations.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
        No active pre-bookings / reservations at the moment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reservations.map((res) => {
        const isToday = new Date(res.pickupDate).toDateString() === new Date().toDateString();
        return (
          <div
            key={res.id}
            className="bg-slate-900 border border-slate-800 hover:border-blue-500/30 rounded-2xl p-4 transition flex flex-col justify-between gap-4 group"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition">
                  {res.car.year} {res.car.make} {res.car.model}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Customer: <span className="text-slate-200 font-semibold">{res.customerName}</span> ({res.customerPhone})
                </p>
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                isToday ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-850 text-slate-400'
              }`}>
                {isToday ? 'Starts Today' : 'Upcoming'}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-slate-800/60 pt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Pickup: {new Date(res.pickupDate).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Return: {new Date(res.expectedReturnDate).toLocaleDateString()}
              </span>
              <span className="font-bold text-emerald-400 text-xs mt-1">
                Estimated Total: ${res.totalCostExpected.toFixed(2)}
              </span>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/employee/checkout/reservation/${res.id}`}
                className="flex-1 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-xl text-xs gap-1.5 transition"
              >
                <ArrowUpRight className="w-4 h-4" />
                Release Car (Checkout)
              </Link>
              <button
                disabled={cancellingId === res.id}
                onClick={() => handleCancel(res.id, res.customerName)}
                className="px-3 bg-slate-950 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 rounded-xl transition flex items-center justify-center"
                title="Cancel Reservation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
