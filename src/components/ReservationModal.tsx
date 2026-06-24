'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createReservation } from '@/actions/rental-actions';
import { Calendar, CreditCard, AlertTriangle, CheckCircle } from 'lucide-react';

interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  dailyRate: number;
}

interface ReservationModalProps {
  car: Car;
  employeeId: string;
  isOpen: boolean;
  onClose: () => void;
  initialPickupDate?: string;
  initialReturnDate?: string;
}

export default function ReservationModal({
  car,
  employeeId,
  isOpen,
  onClose,
  initialPickupDate = '',
  initialReturnDate = '',
}: ReservationModalProps) {
  const router = useRouter();

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerLicenseNum, setCustomerLicenseNum] = useState('');
  const [pickupDate, setPickupDate] = useState(initialPickupDate);
  const [expectedReturnDate, setExpectedReturnDate] = useState(initialReturnDate);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Sync date fields if initial dates change
  useEffect(() => {
    const t = setTimeout(() => {
      if (initialPickupDate) setPickupDate(initialPickupDate);
      if (initialReturnDate) setExpectedReturnDate(initialReturnDate);
    }, 0);
    return () => clearTimeout(t);
  }, [initialPickupDate, initialReturnDate]);

  // Expected cost calculations
  let totalCostExpected = 0;
  if (pickupDate && expectedReturnDate) {
    const start = new Date(pickupDate);
    const end = new Date(expectedReturnDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const days = diffDays > 0 ? diffDays : 0;
      totalCostExpected = days * car.dailyRate;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (!customerName.trim() || !customerPhone.trim() || !customerLicenseNum.trim() || !pickupDate || !expectedReturnDate) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    const start = new Date(pickupDate);
    const end = new Date(expectedReturnDate);
    if (end <= start) {
      setError('Return date must be after pickup date.');
      setLoading(false);
      return;
    }

    if (customerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail.trim())) {
        setError('Please enter a valid email address.');
        setLoading(false);
        return;
      }
    }

    try {
      const result = await createReservation({
        carId: car.id,
        employeeId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || null,
        customerLicenseNum: customerLicenseNum.trim(),
        pickupDate,
        expectedReturnDate,
        totalCostExpected,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create reservation.');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        // Reset states
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setCustomerLicenseNum('');
        onClose();
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Book Vehicle: ${car.make} ${car.model}`}>
      {success ? (
        <div className="space-y-4 py-4 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-6 h-6 animate-bounce" />
          </div>
          <h4 className="text-white font-bold text-base">Booking Confirmed!</h4>
          <p className="text-slate-400 text-xs">
            Vehicle has been successfully reserved for {customerName}.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-white font-bold text-sm flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            Schedule Details
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Pickup Date *"
              type="date"
              required
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
            />
            <Input
              label="Expected Return *"
              type="date"
              required
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
            />
          </div>

          <div className="text-white font-bold text-sm flex items-center gap-1.5 border-b border-slate-800 pb-2 pt-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            Customer Information
          </div>

          <Input
            label="Customer Full Name *"
            placeholder="Jane Doe"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Phone Number *"
              placeholder="+1 (555) 012-3456"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
            <Input
              label="Email (Optional)"
              placeholder="jane.doe@example.com"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          <Input
            label="Driver's License Number *"
            placeholder="DL-12345678"
            required
            value={customerLicenseNum}
            onChange={(e) => setCustomerLicenseNum(e.target.value)}
          />

          <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 flex justify-between items-center text-xs mt-4">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Rental Rate</span>
              <span className="font-bold text-slate-350">${car.dailyRate.toFixed(2)} / day</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Estimated Total</span>
              <span className="text-base font-black text-emerald-400">${totalCostExpected.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
            <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              Confirm Reservation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
