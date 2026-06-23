'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';
import { checkinRental, sendInvoiceEmail } from '@/actions/rental-actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { 
  Camera, Milestone, CreditCard, 
  ArrowRight, ArrowLeft, AlertTriangle, CheckCircle 
} from 'lucide-react';
import { formatFuelLevel } from '@/lib/utils';

interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin: string | null;
  color: string;
  dailyRate: number;
  currentOdo: number;
  status: string;
  needsService: boolean;
}

interface Rental {
  id: string;
  carId: string;
  employeeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerLicenseNum: string;
  licensePhotoUrl: string;
  pickupDate: Date;
  expectedReturnDate: Date;
  startMileage: number;
  startFuel: string;
  totalCostExpected: number;
  depositCollected: number;
  status: string;
  car: Car;
}

function getUniqueFileName(prefix: string, name: string): string {
  return `${prefix}/${Date.now()}_${name}`;
}

interface CheckinWizardProps {
  rental: Rental;
}

export default function CheckinWizard({ rental }: CheckinWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Return Status
  const [endMileage, setEndMileage] = useState(rental.car.currentOdo.toString());
  const [endFuel, setEndFuel] = useState<'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL'>('FULL');
  const [notes, setNotes] = useState('');

  // Step 2: Photos
  const [conditionPhotoFiles, setConditionPhotoFiles] = useState<File[]>([]);

  // Step 3: Financial Settlement
  const [depositReturned, setDepositReturned] = useState(true);
  const [discount, setDiscount] = useState('0');
  const [totalCostCollected, setTotalCostCollected] = useState(rental.totalCostExpected.toString());
  const [customerEmail, setCustomerEmail] = useState(rental.customerEmail || '');

  const handleDiscountChange = (val: string) => {
    setDiscount(val);
    const discVal = parseFloat(val) || 0;
    const finalCost = Math.max(0, rental.totalCostExpected - discVal);
    setTotalCostCollected(finalCost.toString());
  };

  const handleConditionPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setConditionPhotoFiles(Array.from(e.target.files));
    }
  };

  const validateStep1 = () => {
    const odo = parseInt(endMileage);
    if (isNaN(odo)) return 'End mileage is required and must be a valid number.';
    if (odo < rental.startMileage) {
      return `Odometer Safety Catch: Return mileage (${odo}) cannot be less than start mileage (${rental.startMileage}).`;
    }
    return '';
  };

  const validateStep2 = () => {
    if (conditionPhotoFiles.length === 0) return 'Please capture at least one return photo for the condition logs.';
    return '';
  };

  const validateStep3 = () => {
    const collected = parseFloat(totalCostCollected);
    if (isNaN(collected) || collected < 0) return 'Total cost collected must be a positive number.';
    if (customerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail.trim())) {
        return 'Please enter a valid email address.';
      }
    }
    return '';
  };

  const handleNext = () => {
    let validationError = '';
    if (step === 1) validationError = validateStep1();
    if (step === 2) validationError = validateStep2();
    if (step === 3) validationError = validateStep3();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const odo = parseInt(endMileage);
      if (odo < rental.startMileage) {
        throw new Error(`Odometer Safety Catch: Return mileage cannot be less than start mileage (${rental.startMileage}).`);
      }

      // 1. Upload Return Condition Photos with fallback
      const photoUrls: string[] = [];
      try {
        for (const file of conditionPhotoFiles) {
          const fileRef = ref(storage, getUniqueFileName('conditions', file.name));
          const snapshot = await uploadBytes(fileRef, file);
          const downloadUrl = await getDownloadURL(snapshot.ref);
          photoUrls.push(downloadUrl);
        }
      } catch (uploadErr) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Firebase Storage upload failed, falling back to mock URLs for local testing:', uploadErr);
          photoUrls.push('https://images.unsplash.com/photo-1617788138017-80ad40651399?w=500');
        } else {
          throw new Error('Firebase Storage upload failed for return condition photos: ' + (uploadErr as Error).message);
        }
      }

      // Save discount details inside return condition log notes string
      const discountVal = parseFloat(discount) || 0;
      const formattedNotes = discountVal > 0 
        ? `[DISCOUNT: ${discountVal}] ${notes}` 
        : notes;

      // 2. Trigger Server Action
      const result = await checkinRental({
        rentalId: rental.id,
        endMileage: odo,
        endFuel,
        actualReturnDate: new Date(),
        totalCostCollected: parseFloat(totalCostCollected) || 0,
        depositReturned,
        notes: formattedNotes.trim() || null,
        photoUrls,
        customerEmail: customerEmail.trim() || null,
      });

      if (!result.success) {
        throw new Error(result.error || 'Server rejected check-in process.');
      }

      // 3. Send Invoice Email if email is present
      if (customerEmail.trim()) {
        try {
          const emailRes = await sendInvoiceEmail(rental.id);
          if (!emailRes.success) {
            console.warn('Failed to send invoice email on checkin:', emailRes.error);
          }
        } catch (emailErr) {
          console.error('Error triggering invoice email on checkin:', emailErr);
        }
      }

      router.push('/employee/dashboard');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Check-in failed. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-[-50px] right-[-50px] w-32 h-32 rounded-full bg-emerald-500/5 blur-[50px] pointer-events-none" />

      {/* Progress Indicator */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800/80 pb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === i 
                ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/20' 
                : step > i 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-slate-800 text-slate-500'
            }`}>
              {step > i ? '✓' : i}
            </span>
            <span className={`hidden sm:inline text-xs font-semibold ${step === i ? 'text-slate-200' : 'text-slate-500'}`}>
              {i === 1 && 'Status'}
              {i === 2 && 'Photos'}
              {i === 3 && 'Financials'}
              {i === 4 && 'Review'}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 mb-6 text-sm text-rose-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: RETURN ODO & FUEL */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <Milestone className="w-5 h-5 text-emerald-400" />
            Odometer & Fuel Details
          </div>

          <div className="bg-slate-950/20 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-2 text-slate-400 mb-2">
            <div className="flex justify-between">
              <span>Checkout Mileage:</span>
              <span className="font-semibold text-slate-200">{rental.startMileage.toLocaleString()} km</span>
            </div>
            <div className="flex justify-between">
              <span>Checkout Fuel Level:</span>
              <span className="font-semibold text-slate-200">{formatFuelLevel(rental.startFuel)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Return Odometer Reading (km)"
              type="number"
              required
              value={endMileage}
              onChange={(e) => setEndMileage(e.target.value)}
            />
            <Select
              label="Return Fuel Level"
              options={[
                { value: 'QUARTER', label: '1/4 Tank' },
                { value: 'HALF', label: '1/2 Tank' },
                { value: 'THREE_QUARTERS', label: '3/4 Tank' },
                { value: 'FULL', label: 'Full Tank' },
              ]}
              value={endFuel}
              onChange={(e) => setEndFuel(e.target.value as 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL')}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Return Condition Notes (Optional)
            </label>
            <textarea
              placeholder="e.g. Scuffed driver door handle. Interior returned clean."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-24 bg-slate-950/40 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition text-sm resize-none"
            />
          </div>
        </div>
      )}

      {/* STEP 2: CONDITION PHOTOS */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            Return Condition Photos
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Vehicle Photos (Capture 360 Walkaround)
            </label>
            <div className="relative border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/20 rounded-2xl p-6 flex flex-col items-center justify-center transition cursor-pointer">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                required
                onChange={handleConditionPhotosChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Camera className="w-8 h-8 text-slate-500 mb-2" />
              <p className="text-sm font-medium text-slate-300">
                {conditionPhotoFiles.length > 0 
                  ? `${conditionPhotoFiles.length} photos selected` 
                  : 'Open Smartphone Camera'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Requires camera capture of 4 corners</p>
            </div>
            {conditionPhotoFiles.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {conditionPhotoFiles.map((f, index) => (
                  <div key={index} className="aspect-square bg-slate-800/40 border border-slate-800 rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-semibold p-1 truncate">
                    Photo {index + 1}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: FINANCIAL SETTLEMENT */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            Financial Settlement
          </div>

          <div className="bg-slate-950/20 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-2 text-slate-400">
            <div className="flex justify-between">
              <span>Expected Rental Cost:</span>
              <span className="font-semibold text-slate-200">${rental.totalCostExpected.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Security Deposit Collected:</span>
              <span className="font-semibold text-emerald-400">${rental.depositCollected.toFixed(2)}</span>
            </div>
          </div>

          {/* Toggle Deposit Returned */}
          <div className="flex items-center justify-between p-4 bg-slate-950/40 border border-slate-800 rounded-xl">
            <div>
              <span className="text-xs font-bold text-white uppercase tracking-wider block">Return Security Deposit</span>
              <span className="text-xs text-slate-500 mt-0.5">Toggle off if holding deposit for repairs</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={depositReturned}
                onChange={(e) => setDepositReturned(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Applied Discount ($)"
              type="number"
              value={discount}
              onChange={(e) => handleDiscountChange(e.target.value)}
            />
            <Input
              label="Total Cost Collected ($) *"
              type="number"
              required
              value={totalCostCollected}
              onChange={(e) => setTotalCostCollected(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Customer Email (for Invoice PDF)"
              type="email"
              placeholder="customer@example.com"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW & CONFIRM */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            Verify Return Details
          </div>

          <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 space-y-3.5 text-sm">
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Vehicle</span>
              <span className="font-semibold text-white">{rental.car.make} {rental.car.model}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Customer</span>
              <span className="font-semibold text-white">{rental.customerName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Start Mileage</span>
              <span className="font-semibold text-slate-200">{rental.startMileage.toLocaleString()} km</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">End Mileage</span>
              <span className="font-semibold text-white">{parseInt(endMileage).toLocaleString()} km</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Distance Driven</span>
              <span className="font-semibold text-emerald-400">
                {(parseInt(endMileage) - rental.startMileage).toLocaleString()} km
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Return Fuel Level</span>
              <span className="font-semibold text-slate-200">{formatFuelLevel(endFuel)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Deposit Returned?</span>
              <span className={`font-semibold ${depositReturned ? 'text-emerald-400' : 'text-rose-400'}`}>
                {depositReturned ? 'Yes' : 'No'}
              </span>
            </div>
            {parseFloat(discount) > 0 && (
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-500">Discount Applied</span>
                <span className="font-semibold text-rose-400">-${parseFloat(discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Customer Email</span>
              <span className="font-semibold text-white">
                {customerEmail.trim() ? customerEmail : <span className="text-slate-500 italic">None (Send bill later)</span>}
              </span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400 font-bold">Total Cost Collected</span>
              <span className="font-black text-emerald-400 text-lg">
                ${parseFloat(totalCostCollected).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION CONTROLS */}
      <div className="flex justify-between items-center border-t border-slate-800/80 pt-6 mt-8">
        {step > 1 ? (
          <Button 
            variant="secondary" 
            onClick={handleBack}
            disabled={submitting}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        ) : (
          <div /> // Spacer
        )}

        {step < 4 ? (
          <Button variant="primary" onClick={handleNext}>
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button 
            variant="success" 
            onClick={handleSubmit}
            loading={submitting}
          >
            Complete Check-In Return
          </Button>
        )}
      </div>
    </div>
  );
}
