import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { LogType, RentalStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowLeft, Car } from 'lucide-react';
import PrintButton from './PrintButton';
import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { formatFuelLevel } from '@/lib/utils';

export const revalidate = 0; // Fresh invoice every load

interface InvoicePageProps {
  params: Promise<{
    rentalId: string;
  }>;
  searchParams: Promise<{
    token?: string;
  }>;
}

async function getUserRole() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;
    if (!sessionCookie) return null;

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decodedClaims.role as 'ADMIN' | 'EMPLOYEE' | undefined;
  } catch {
    return null;
  }
}

export default async function InvoicePage({ params, searchParams }: InvoicePageProps) {
  const { rentalId } = await params;
  const { token } = await searchParams;

  const rental = await prisma.rental.findUnique({
    where: { id: rentalId },
    include: {
      car: true,
      employee: true,
      conditionLogs: true,
    },
  });

  if (!rental) {
    notFound();
  }

  // 1. Verify customer bypass token
  const secret = process.env.FIREBASE_PRIVATE_KEY || 'default-secret-key';
  const expectedToken = createHmac('sha256', secret).update(rentalId).digest('hex');
  const isTokenValid = token === expectedToken;

  const role = await getUserRole();
  const isStaff = role === 'ADMIN' || role === 'EMPLOYEE';

  // 2. If token is invalid, verify logged-in staff/admin session
  if (!isTokenValid) {
    if (!isStaff) {
      redirect('/login');
    }
  }

  const backLink = role === 'ADMIN' ? '/admin/ledger' : '/employee/dashboard';
  const backText = role === 'ADMIN' ? 'Back to Ledger' : 'Back to Operations Dashboard';

  // Parse departure and return logs
  const returnLog = rental.conditionLogs.find((log) => log.type === LogType.RETURN);

  // Parse discount out of return notes if present
  let discount = 0;
  let cleanReturnNotes = '';
  if (returnLog && returnLog.notes) {
    const discountMatch = returnLog.notes.match(/^\[DISCOUNT:\s*([\d.]+)\]/);
    if (discountMatch) {
      discount = parseFloat(discountMatch[1]);
      cleanReturnNotes = returnLog.notes.replace(/^\[DISCOUNT:\s*([\d.]+)\]\s*/, '');
    } else {
      cleanReturnNotes = returnLog.notes;
    }
  }

  // Calculations
  const calculatedDays = Math.max(
    1,
    Math.ceil(
      (new Date(rental.actualReturnDate || rental.expectedReturnDate).getTime() - new Date(rental.pickupDate).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );

  const subtotal = rental.car.dailyRate * calculatedDays;
  const kmDriven = rental.endMileage ? rental.endMileage - rental.startMileage : 0;
  const finalCollected = rental.totalCostCollected ?? (rental.totalCostExpected - discount);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 font-sans print:bg-white print:text-slate-900 print:py-0 print:px-0">
      
      {/* Action Header (Hidden during Print) */}
      <div className="max-w-3xl mx-auto flex justify-between items-center mb-6 print:hidden">
        {role ? (
          <Link 
            href={backLink}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> {backText}
          </Link>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <PrintButton />
        </div>
      </div>

      {/* Main Invoice Card */}
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl print:bg-white print:border-none print:shadow-none print:p-0 print:text-slate-900">
        
        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-850 pb-6 print:border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center print:bg-slate-200 print:text-slate-900">
                <Car className="w-4 h-4 text-white print:text-slate-900" />
              </div>
              <span className="font-black text-xl tracking-tight text-white print:text-slate-900">
                Fleet<span className="text-blue-500">Flow</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">Car Rental & Fleet Management System</p>
          </div>
          <div className="text-left sm:text-right">
            <h1 className="text-xl font-bold text-white uppercase tracking-wider print:text-slate-900">Invoice / Bill</h1>
            <p className="text-xs text-slate-500 mt-1 font-mono">ID: #{rental.id.slice(-8).toUpperCase()}</p>
          </div>
        </div>

        {/* Invoice Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-850 print:border-slate-200 text-xs">
          {/* Customer & Staff */}
          <div className="space-y-3">
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Customer Details</span>
              <p className="font-bold text-sm text-slate-200 print:text-slate-900">{rental.customerName}</p>
              <p className="text-slate-400 print:text-slate-600">{rental.customerPhone}</p>
              {rental.customerEmail && <p className="text-slate-400 print:text-slate-600">{rental.customerEmail}</p>}
              <p className="text-slate-400 print:text-slate-600 font-mono mt-0.5">DL: {rental.customerLicenseNum}</p>
            </div>
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Authorized By</span>
              <p className="font-semibold text-slate-350 print:text-slate-800">{rental.employee.name}</p>
            </div>
          </div>

          {/* Dates & Rental Duration */}
          <div className="space-y-3 sm:text-right">
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Dates & Duration</span>
              <table className="w-full sm:w-auto sm:ml-auto text-left sm:text-right border-collapse">
                <tbody>
                  <tr>
                    <td className="text-slate-500 pr-4 py-0.5">Pickup Date:</td>
                    <td className="font-semibold text-slate-250 print:text-slate-900">{new Date(rental.pickupDate).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 pr-4 py-0.5">Returned Date:</td>
                    <td className="font-semibold text-slate-250 print:text-slate-900">
                      {rental.actualReturnDate 
                        ? new Date(rental.actualReturnDate).toLocaleString() 
                        : 'Active / Not returned'
                      }
                    </td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 pr-4 py-0.5">Total Days:</td>
                    <td className="font-bold text-blue-400 print:text-blue-600">{calculatedDays} {calculatedDays === 1 ? 'Day' : 'Days'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Vehicle particulars */}
        <div className="py-6 border-b border-slate-850 print:border-slate-200">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Vehicle Particulars</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850 print:bg-slate-50 print:border-slate-200 print:text-slate-950">
              <span className="text-slate-500 block mb-0.5">Vehicle</span>
              <span className="font-bold text-slate-200 print:text-slate-900">{rental.car.year} {rental.car.make}</span>
              <span className="text-slate-400 print:text-slate-600 block text-[10px]">{rental.car.model}</span>
            </div>
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850 print:bg-slate-50 print:border-slate-200 print:text-slate-950">
              <span className="text-slate-500 block mb-0.5">License Plate</span>
              <span className="font-bold text-slate-200 print:text-slate-900 font-mono uppercase">{rental.car.licensePlate}</span>
            </div>
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850 print:bg-slate-50 print:border-slate-200 print:text-slate-950">
              <span className="text-slate-500 block mb-0.5">Odometer Log</span>
              <span className="font-bold text-slate-200 print:text-slate-900">{rental.startMileage.toLocaleString()} km</span>
              <span className="text-slate-400 print:text-slate-600 block text-[10px]">{rental.endMileage ? `→ ${rental.endMileage.toLocaleString()} km (${kmDriven} km)` : '→ Active'}</span>
            </div>
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850 print:bg-slate-50 print:border-slate-200 print:text-slate-950">
              <span className="text-slate-500 block mb-0.5">Fuel Log</span>
              <span className="font-bold text-slate-200 print:text-slate-900">{formatFuelLevel(rental.startFuel)}</span>
              <span className="text-slate-400 print:text-slate-600 block text-[10px]">{rental.endFuel ? `→ ${formatFuelLevel(rental.endFuel)}` : '→ Active'}</span>
            </div>
          </div>
        </div>

        {/* Charge breakdown table */}
        <div className="py-6 border-b border-slate-850 print:border-slate-200">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Rental Charge Breakdown</h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-450 print:border-slate-250 print:text-slate-600">
                <th className="py-2.5">Description</th>
                <th className="py-2.5 text-center">Unit Price</th>
                <th className="py-2.5 text-center">Quantity</th>
                <th className="py-2.5 text-right">Total Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 print:divide-slate-200 text-slate-300 print:text-slate-800">
              <tr>
                <td className="py-3 font-semibold text-slate-200 print:text-slate-900">
                  Daily Rental Charge <span className="text-[10px] font-normal text-slate-500">({rental.car.year} {rental.car.make} {rental.car.model})</span>
                </td>
                <td className="py-3 text-center">${rental.car.dailyRate.toFixed(2)}/day</td>
                <td className="py-3 text-center">{calculatedDays}</td>
                <td className="py-3 text-right font-bold text-slate-200 print:text-slate-900">${subtotal.toFixed(2)}</td>
              </tr>
              {discount > 0 && (
                <tr className="text-rose-450 print:text-rose-700">
                  <td className="py-3 font-bold">
                    Applied Loyalty/Staff Discount
                  </td>
                  <td className="py-3 text-center">-</td>
                  <td className="py-3 text-center">-</td>
                  <td className="py-3 text-right font-bold">-${discount.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Net totals summary */}
        <div className="pt-6 flex flex-col sm:flex-row justify-between gap-6">
          <div className="flex-1 max-w-sm text-[11px] text-slate-500">
            <span className="font-bold text-slate-400 block mb-1">Notes & Conditions</span>
            {rental.status === RentalStatus.COMPLETED ? (
              <p className="italic">This rental agreement has been completed. Odometer parameters, return photos, and final financial settlement have been validated by the staff. Thank you for your business!</p>
            ) : (
              <p className="italic">Car is currently on rent. Pricing is calculated as an estimate based on expected return dates. Final values subject to return condition log audits.</p>
            )}
            {cleanReturnNotes && (
              <div className="mt-2.5 p-2 bg-slate-950/30 border border-slate-850 rounded-xl print:bg-slate-50 print:border-slate-200">
                <span className="font-bold block text-slate-400 mb-0.5 print:text-slate-700">Inspection Comments:</span>
                <span className="italic block text-slate-350 print:text-slate-800">&ldquo;{cleanReturnNotes}&rdquo;</span>
              </div>
            )}
          </div>

          <div className="w-full sm:w-64 space-y-2 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Rental Charges:</span>
              <span className="font-semibold text-slate-200 print:text-slate-900">${subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-rose-450 print:text-rose-700">
                <span>Discount Applied:</span>
                <span className="font-semibold">-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500 border-b border-slate-800/80 pb-2 print:border-slate-200">
              <span>Security Deposit:</span>
              <span className="font-semibold text-slate-200 print:text-slate-900">${rental.depositCollected.toFixed(2)} ({rental.depositReturned ? 'Returned' : 'Held'})</span>
            </div>
            <div className="flex justify-between text-sm pt-1">
              <span className="font-bold text-white print:text-slate-900">Total Paid/Collected:</span>
              <span className="font-black text-emerald-450 text-base print:text-emerald-700">${finalCollected.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-850 mt-10 pt-6 text-center text-[10px] text-slate-500 print:border-slate-200 print:mt-8">
          <p>Thank you for choosing FleetFlow. Drive safe!</p>
          <p className="mt-1">FleetFlow Inc. • Support: support@fleetflow.com • Web: www.fleetflow.com</p>
        </div>

      </div>
    </div>
  );
}
