'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sendInvoiceEmail, updateRentalBilling, getShareableInvoiceLink } from '@/actions/rental-actions';
import { 
  Eye, CheckCircle2, CreditCard, Mail
} from 'lucide-react';
import { RentalStatus, FuelLevel } from '@prisma/client';
import { formatFuelLevel } from '@/lib/utils';

interface Car {
  make: string;
  model: string;
  year: number;
  licensePlate: string;
}

interface User {
  name: string;
  email: string;
}

interface ConditionLog {
  id: string;
  type: 'DEPARTURE' | 'RETURN';
  notes: string | null;
  photoUrls: string[];
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
  insurancePhotoUrl: string | null;
  pickupDate: Date;
  expectedReturnDate: Date;
  actualReturnDate: Date | null;
  startMileage: number;
  endMileage: number | null;
  startFuel: FuelLevel;
  endFuel: FuelLevel | null;
  totalCostExpected: number;
  totalCostCollected: number | null;
  depositCollected: number;
  depositReturned: boolean;
  status: RentalStatus;
  createdAt: Date;
  car: Car;
  employee: User;
  conditionLogs: ConditionLog[];
}

interface EmployeeHistoryClientProps {
  initialRentals: Rental[];
}

export default function EmployeeHistoryClient({ initialRentals }: EmployeeHistoryClientProps) {
  const router = useRouter();
  const [activeRental, setActiveRental] = useState<Rental | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Email input and billing states
  const [emailInput, setEmailInput] = useState('');
  const [discountInput, setDiscountInput] = useState('0');
  const [savingBilling, setSavingBilling] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const openAuditModal = (rental: Rental) => {
    setActiveRental(rental);
    setEmailInput(rental.customerEmail || '');
    
    // Parse discount
    const returnLog = rental.conditionLogs.find((log) => log.type === 'RETURN');
    const { discount } = parseDiscountAndNotes(returnLog?.notes || null);
    setDiscountInput(discount.toString());
    
    setStatusMsg('');
    setIsModalOpen(true);
  };

  const parseDiscountAndNotes = (logNotes: string | null) => {
    if (!logNotes) return { discount: 0, notes: '' };
    const discountMatch = logNotes.match(/^\[DISCOUNT:\s*([\d.]+)\]/);
    if (discountMatch) {
      const discount = parseFloat(discountMatch[1]);
      const notes = logNotes.replace(/^\[DISCOUNT:\s*([\d.]+)\]\s*/, '');
      return { discount, notes };
    }
    return { discount: 0, notes: logNotes };
  };

  const handleSaveBilling = async () => {
    if (!activeRental) return;

    const email = emailInput.trim();
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setStatusMsg('Error: Please enter a valid email address.');
        return;
      }
    }

    setSavingBilling(true);
    setStatusMsg('');
    try {
      const discVal = parseFloat(discountInput) || 0;
      const res = await updateRentalBilling(activeRental.id, emailInput.trim(), discVal);
      if (res.success) {
        const updatedRental = {
          ...activeRental,
          customerEmail: emailInput.trim() || null,
          totalCostCollected: Math.max(0, activeRental.totalCostExpected - discVal),
          conditionLogs: activeRental.conditionLogs.map((log) => {
            if (log.type === 'RETURN') {
              const { notes: cleanNotes } = parseDiscountAndNotes(log.notes);
              return {
                ...log,
                notes: discVal > 0 ? `[DISCOUNT: ${discVal}] ${cleanNotes}`.trim() : cleanNotes.trim() || null,
              };
            }
            return log;
          }),
        };
        setActiveRental(updatedRental);

        setStatusMsg('Billing details updated successfully!');
        router.refresh();
      } else {
        alert(res.error || 'Failed to save billing details.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while saving details.');
    } finally {
      setSavingBilling(false);
    }
  };

  const handleCopyLink = async () => {
    if (!activeRental) return;
    setCopyingLink(true);
    setStatusMsg('');
    try {
      const res = await getShareableInvoiceLink(activeRental.id);
      if (res.success && res.link) {
        await navigator.clipboard.writeText(res.link);
        setStatusMsg('Shareable customer link copied to clipboard!');
      } else {
        alert(res.error || 'Failed to generate link.');
      }
    } catch (err) {
      console.error(err);
      alert('Could not copy link to clipboard.');
    } finally {
      setCopyingLink(false);
    }
  };

  const handleSendInvoice = async () => {
    if (!activeRental) return;
    setSendingInvoice(true);
    setStatusMsg('');
    try {
      const res = await sendInvoiceEmail(activeRental.id);
      if (res.success) {
        setStatusMsg(`Invoice PDF successfully emailed to ${emailInput.trim()}!`);
      } else {
        alert(res.error || 'Failed to dispatch invoice email.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while sending the invoice.');
    } finally {
      setSendingInvoice(false);
    }
  };

  return (
    <div className="space-y-4">
      {initialRentals.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
          No completed rentals found.
        </div>
      ) : (
        <div className="space-y-3">
          {initialRentals.map((rental) => {
            const returnLog = rental.conditionLogs.find((log) => log.type === 'RETURN');
            const { discount: parsedDiscount } = parseDiscountAndNotes(returnLog?.notes || null);
            return (
              <div 
                key={rental.id}
                className="bg-slate-900 border border-slate-850 hover:border-slate-800 rounded-2xl p-4 transition flex flex-col gap-3 group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white text-sm group-hover:text-blue-400 transition">
                      {rental.customerName}
                    </h3>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {rental.car.year} {rental.car.make} {rental.car.model} • <span className="font-mono uppercase text-[10px]">{rental.car.licensePlate}</span>
                    </p>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-slate-450 uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                    COMPLETED
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-800/60 pt-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500">Revenue Collected</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      ${(rental.totalCostCollected ?? (rental.totalCostExpected - parsedDiscount)).toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => openAuditModal(rental)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-semibold rounded-xl transition"
                  >
                    <Eye className="w-3.5 h-3.5" /> Billing / Audit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BILLING / AUDIT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Rental Invoicing: ${activeRental?.customerName}`}
      >
        {activeRental && (() => {
          const returnLog = activeRental.conditionLogs.find((log) => log.type === 'RETURN');
          const { discount: parsedDiscount, notes: cleanNotes } = parseDiscountAndNotes(returnLog?.notes || null);
          return (
            <div className="space-y-5 text-sm text-slate-350 max-h-[80vh] overflow-y-auto pr-1">
              
              {/* Rental overview info */}
              <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-850 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                  <span className="font-bold text-white text-[10px] uppercase tracking-wider text-slate-400">Agreement Details</span>
                  <span className="font-mono text-[10px] text-slate-500">#{activeRental.id}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Vehicle:</span>
                    <span className="font-semibold text-slate-250">{activeRental.car.year} {activeRental.car.make} {activeRental.car.model}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Staff User:</span>
                    <span className="font-semibold text-slate-250">{activeRental.employee.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Expected Cost:</span>
                    <span className="font-bold text-slate-300">${activeRental.totalCostExpected.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Security Deposit:</span>
                    <span className="font-bold text-slate-300">${activeRental.depositCollected.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Editable Billing Parameters */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-4">
                <h4 className="font-bold text-white uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-850 pb-2">Modify Billing Info</h4>
                
                <div className="space-y-3">
                  <Input
                    label="Customer Email"
                    placeholder="customer@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                  <Input
                    label="Applied Discount ($)"
                    type="number"
                    placeholder="0"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveBilling}
                    loading={savingBilling}
                  >
                    Save Billing Details
                  </Button>
                </div>
                
                <div className="flex flex-col gap-2 pt-3 border-t border-slate-850/60">
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!emailInput.trim()}
                      onClick={handleSendInvoice}
                      loading={sendingInvoice}
                      className="flex-1 text-xs"
                    >
                      <Mail className="w-3.5 h-3.5 mr-1" /> Send Email
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyLink}
                      loading={copyingLink}
                      className="flex-1 text-xs"
                    >
                      Copy Link
                    </Button>
                  </div>
                  <Link
                    href={`/invoice/${activeRental.id}`}
                    target="_blank"
                    className="w-full inline-flex items-center justify-center font-semibold rounded-xl text-xs px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition"
                  >
                    <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Print / View PDF Invoice
                  </Link>
                </div>

                {statusMsg && (
                  <p className="text-xs text-emerald-450 font-bold text-center mt-1 animate-pulse">{statusMsg}</p>
                )}
              </div>

              {/* Return Condition Log Details */}
              {returnLog && (
                <div className="p-4 bg-emerald-950/5 border border-emerald-500/10 rounded-xl space-y-3">
                  <h4 className="font-bold text-emerald-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5 border-b border-emerald-500/10 pb-2">
                    <CheckCircle2 className="w-4 h-4" /> Return Inspection Audit
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block font-semibold">End Mileage:</span>
                      <span className="text-slate-200">{activeRental.endMileage?.toLocaleString()} km</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-semibold">Return Fuel:</span>
                      <span className="text-slate-200">{formatFuelLevel(activeRental.endFuel)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-semibold">Security Deposit:</span>
                      <span className={activeRental.depositReturned ? 'text-emerald-400' : 'text-rose-400'}>
                        {activeRental.depositReturned ? 'Returned' : 'Held / Kept'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-semibold">Revenue Collected:</span>
                      <span className="font-bold text-emerald-400">
                        ${(activeRental.totalCostCollected ?? (activeRental.totalCostExpected - parsedDiscount)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {parsedDiscount > 0 && (
                    <div className="flex justify-between p-2 bg-rose-500/5 border border-rose-500/10 text-xs rounded-xl">
                      <span className="text-slate-400">Current Discount Applied:</span>
                      <span className="font-bold text-rose-400">-${parsedDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {cleanNotes && (
                    <div className="text-xs pt-1">
                      <span className="text-slate-500 font-semibold block">Notes:</span>
                      <p className="text-slate-300 mt-1 p-2 bg-slate-900 border border-slate-850 rounded-lg italic">&ldquo;{cleanNotes}&rdquo;</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-1 border-t border-slate-800">
                <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Close Modal</Button>
              </div>

            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
