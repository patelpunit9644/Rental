'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';
import { checkoutCar } from '@/actions/rental-actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { 
  Camera, User, Calendar, Fuel, 
  ArrowRight, ArrowLeft, UploadCloud, CheckCircle, AlertTriangle 
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

function getUniqueFileName(prefix: string, name: string): string {
  return `${prefix}/${Date.now()}_${name}`;
}

interface Rental {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerLicenseNum: string;
  pickupDate: Date;
  expectedReturnDate: Date;
}

interface CheckoutWizardProps {
  car: Car;
  employeeId: string;
  rental?: Rental;
}

export default function CheckoutWizard({ car, employeeId, rental }: CheckoutWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1 State: Customer Information
  const [customerName, setCustomerName] = useState(rental?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(rental?.customerPhone || '');
  const [customerEmail, setCustomerEmail] = useState(rental?.customerEmail || '');
  const [customerLicenseNum, setCustomerLicenseNum] = useState(rental?.customerLicenseNum || '');
  const [licensePhotoFile, setLicensePhotoFile] = useState<File | null>(null);

  // Step 2 State: Rental Details
  const [pickupDate, setPickupDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [depositCollected, setDepositCollected] = useState('200');

  // Calculate total cost expected on the fly to avoid synchronous setState inside useEffect
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

  // Step 3 State: Vehicle Condition
  const [startMileage, setStartMileage] = useState(car.currentOdo.toString());
  const [startFuel, setStartFuel] = useState<'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL'>('FULL');
  const [notes, setNotes] = useState('');
  const [conditionPhotoFiles, setConditionPhotoFiles] = useState<File[]>([]);

  // Initialize dates asynchronously to satisfy react-hooks/set-state-in-effect and avoid SSR mismatch
  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const formatDateStr = (date: Date) => {
      return date.toISOString().split('T')[0];
    };

    const t = setTimeout(() => {
      setPickupDate(rental ? formatDateStr(new Date(rental.pickupDate)) : formatDateStr(today));
      setExpectedReturnDate(rental ? formatDateStr(new Date(rental.expectedReturnDate)) : formatDateStr(tomorrow));
    }, 0);

    return () => clearTimeout(t);
  }, [rental]);

  // File Change Handlers
  const handleLicensePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLicensePhotoFile(e.target.files[0]);
    }
  };

  const handleConditionPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setConditionPhotoFiles(Array.from(e.target.files));
    }
  };

  // Step Navigation Checks
  const validateStep1 = () => {
    if (!customerName.trim()) return 'Customer name is required.';
    if (!customerPhone.trim()) return 'Customer phone number is required.';
    if (customerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail.trim())) {
        return 'Please enter a valid email address.';
      }
    }
    if (!customerLicenseNum.trim()) return 'Driver license number is required.';
    if (!licensePhotoFile) return "Please take or upload a photo of the customer's driver's license.";
    return '';
  };

  const validateStep2 = () => {
    if (!pickupDate) return 'Pickup date is required.';
    if (!expectedReturnDate) return 'Expected return date is required.';
    
    const start = new Date(pickupDate);
    const end = new Date(expectedReturnDate);
    
    if (end <= start) return 'Expected return date must be after the pickup date.';
    if (parseFloat(depositCollected) < 0) return 'Deposit collected must be a positive number.';
    return '';
  };

  const validateStep3 = () => {
    const odo = parseInt(startMileage);
    if (isNaN(odo) || odo < 0) return 'Odometer reading must be a positive number.';
    if (conditionPhotoFiles.length === 0) return 'Please capture at least one photo of the vehicle condition before checkout.';
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

  // Submit Handler
  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      if (!licensePhotoFile) throw new Error('Driver license photo missing.');
      if (conditionPhotoFiles.length === 0) throw new Error('Vehicle condition photos missing.');

      // 1. Upload license photo with fallback
      let licensePhotoUrl = '';
      try {
        const licenseRef = ref(storage, getUniqueFileName('licenses', licensePhotoFile.name));
        const licenseSnapshot = await uploadBytes(licenseRef, licensePhotoFile);
        licensePhotoUrl = await getDownloadURL(licenseSnapshot.ref);
      } catch (uploadErr) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Firebase Storage upload failed, falling back to mock URL for local testing:', uploadErr);
          licensePhotoUrl = 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500';
        } else {
          throw new Error('Firebase Storage upload failed for license photo: ' + (uploadErr as Error).message);
        }
      }

      // 2. Upload vehicle condition photos with fallback
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
          throw new Error('Firebase Storage upload failed for vehicle condition photos: ' + (uploadErr as Error).message);
        }
      }

      // 3. Call server action
      const result = await checkoutCar({
        carId: car.id,
        employeeId,
        customerName,
        customerPhone,
        customerEmail: customerEmail.trim() || null,
        customerLicenseNum,
        licensePhotoUrl,
        pickupDate,
        expectedReturnDate,
        startMileage: parseInt(startMileage) || car.currentOdo,
        startFuel,
        totalCostExpected,
        depositCollected: parseFloat(depositCollected) || 0,
        notes: notes.trim() || null,
        photoUrls,
        reservationId: rental?.id,
      });

      if (!result.success) {
        throw new Error(result.error || 'Server rejected checkout process.');
      }

      // Success, route back to employee dashboard
      router.push('/employee/dashboard');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Checkout failed. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-[-50px] right-[-50px] w-32 h-32 rounded-full bg-blue-500/5 blur-[50px] pointer-events-none" />

      {/* Progress Indicator */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800/80 pb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === i 
                ? 'bg-blue-500 text-white ring-4 ring-blue-500/20' 
                : step > i 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-800 text-slate-500'
            }`}>
              {step > i ? '✓' : i}
            </span>
            <span className={`hidden sm:inline text-xs font-semibold ${step === i ? 'text-slate-200' : 'text-slate-500'}`}>
              {i === 1 && 'Customer'}
              {i === 2 && 'Terms'}
              {i === 3 && 'Condition'}
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

      {/* STEP 1: CUSTOMER DETAILS */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <User className="w-5 h-5 text-blue-400" />
            Customer Registration
          </div>

          <Input
            label="Customer Full Name"
            placeholder="Jane Doe"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number"
              placeholder="+1 (555) 019-2834"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
            <Input
              label="Email Address (Optional)"
              placeholder="jane.doe@example.com"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          <Input
            label="Driver's License Number"
            placeholder="DL-987654321-A"
            required
            value={customerLicenseNum}
            onChange={(e) => setCustomerLicenseNum(e.target.value)}
          />

          <div>
            <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              License Photo Upload
            </label>
            <div className="relative border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/20 rounded-2xl p-6 flex flex-col items-center justify-center transition cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleLicensePhotoChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <UploadCloud className="w-8 h-8 text-slate-500 mb-2" />
              <p className="text-sm font-medium text-slate-300">
                {licensePhotoFile ? licensePhotoFile.name : 'Take Photo or Choose File'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Camera/Gallery accepted</p>
            </div>
            {licensePhotoFile && (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 font-semibold bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg">
                <CheckCircle className="w-4 h-4" /> Ready for upload
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: RENTAL AGREEMENT TERMS */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Rental Schedule & Deposit
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Pickup Date"
              type="date"
              required
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
            />
            <Input
              label="Expected Return Date"
              type="date"
              required
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Security Deposit ($)"
              type="number"
              required
              value={depositCollected}
              onChange={(e) => setDepositCollected(e.target.value)}
            />
            <div className="flex flex-col justify-end p-3 bg-slate-950/40 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Expected Rental Total</span>
              <span className="text-xl font-black text-emerald-400 mt-1">${totalCostExpected.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: VEHICLE CONDITION CHECK */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <Fuel className="w-5 h-5 text-blue-400" />
            Vehicle Condition Logs
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Departure Odometer (km) *"
              type="number"
              required
              value={startMileage}
              onChange={(e) => setStartMileage(e.target.value)}
            />

            <Select
              label="Fuel Level Out"
              options={[
                { value: 'QUARTER', label: '1/4 Tank' },
                { value: 'HALF', label: '1/2 Tank' },
                { value: 'THREE_QUARTERS', label: '3/4 Tank' },
                { value: 'FULL', label: 'Full Tank' },
              ]}
              value={startFuel}
              onChange={(e) => setStartFuel(e.target.value as 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL')}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Departure Condition Notes
            </label>
            <textarea
              placeholder="e.g. Scratches on front passenger bumper. Intermittent squeak on right wheel."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-24 bg-slate-950/40 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition text-sm resize-none"
            />
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

      {/* STEP 4: REVIEW & CONFIRM */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            Verify Rental Checkout
          </div>

          <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 space-y-3.5 text-sm">
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Vehicle</span>
              <span className="font-semibold text-white">{car.year} {car.make} {car.model}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Customer</span>
              <span className="font-semibold text-white">{customerName} ({customerPhone})</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Pickup Date</span>
              <span className="font-semibold text-slate-200">{pickupDate}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Expected Return</span>
              <span className="font-semibold text-slate-200">{expectedReturnDate}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Odometer Out</span>
              <span className="font-semibold text-slate-200">{parseInt(startMileage).toLocaleString()} km</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Fuel Level Out</span>
              <span className="font-semibold text-slate-200">{formatFuelLevel(startFuel)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-500">Security Deposit</span>
              <span className="font-semibold text-emerald-400">${parseFloat(depositCollected).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400 font-bold">Estimated Cost</span>
              <span className="font-black text-emerald-400 text-lg">${totalCostExpected.toFixed(2)}</span>
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
            Complete Checkout & Release
          </Button>
        )}
      </div>
    </div>
  );
}
