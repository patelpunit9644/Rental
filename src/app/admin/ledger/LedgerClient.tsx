'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sendInvoiceEmail, updateRentalBilling, getShareableInvoiceLink } from '@/actions/rental-actions';
import { 
  Search, Eye, Milestone, CheckCircle2, AlertOctagon, X 
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

interface LedgerClientProps {
  initialRentals: Rental[];
}

export default function LedgerClient({ initialRentals }: LedgerClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  
  // Modal state
  const [activeRental, setActiveRental] = useState<Rental | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Email input and billing states
  const [emailInput, setEmailInput] = useState('');
  const [discountInput, setDiscountInput] = useState('0');
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState('');

  // Filter rentals
  const filteredRentals = initialRentals.filter((rental) => {
    const term = search.toLowerCase();
    const matchesSearch = 
      rental.customerName.toLowerCase().includes(term) ||
      rental.car.make.toLowerCase().includes(term) ||
      rental.car.model.toLowerCase().includes(term) ||
      rental.car.licensePlate.toLowerCase().includes(term) ||
      rental.customerLicenseNum.toLowerCase().includes(term);

    const matchesStatus = 
      statusFilter === 'ALL' || 
      rental.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const openAuditModal = (rental: Rental) => {
    setActiveRental(rental);
    setEmailInput(rental.customerEmail || '');
    
    // Parse existing discount from logs
    const returnLog = rental.conditionLogs.find((log) => log.type === 'RETURN');
    const { discount } = parseDiscountAndNotes(returnLog?.notes || null);
    setDiscountInput(discount.toString());

    setEmailStatusMsg('');
    setIsModalOpen(true);
  };

  const getLogByType = (rental: Rental, type: 'DEPARTURE' | 'RETURN') => {
    return rental.conditionLogs.find((log) => log.type === type);
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

  const handleSaveEmail = async () => {
    if (!activeRental) return;

    const email = emailInput.trim();
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setEmailStatusMsg('Error: Please enter a valid email address.');
        return;
      }
    }

    setSavingEmail(true);
    setEmailStatusMsg('');
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

        setEmailStatusMsg('Billing details saved successfully!');
        router.refresh();
      } else {
        alert(res.error || 'Failed to save billing details.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCopyLink = async () => {
    if (!activeRental) return;
    setCopyingLink(true);
    setEmailStatusMsg('');
    try {
      const res = await getShareableInvoiceLink(activeRental.id);
      if (res.success && res.link) {
        await navigator.clipboard.writeText(res.link);
        setEmailStatusMsg('Shareable customer link copied to clipboard!');
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
    setEmailStatusMsg('');
    try {
      const res = await sendInvoiceEmail(activeRental.id);
      if (res.success) {
        setEmailStatusMsg(`Invoice PDF successfully emailed to ${emailInput.trim()}!`);
      } else {
        alert(res.error || 'Failed to dispatch invoice email.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingInvoice(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search renter, car, plate, license..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          />
        </div>

        <div className="flex gap-2">
          {['ALL', 'ACTIVE', 'COMPLETED', 'OVERDUE', 'CANCELLED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                statusFilter === status 
                  ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' 
                  : 'bg-slate-900 text-slate-400 border-slate-850 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl overflow-hidden shadow-lg">
        {filteredRentals.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No rental agreements found in ledger history.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="text-xs uppercase font-semibold text-slate-500 border-b border-slate-850 bg-slate-950/20">
                <tr>
                  <th className="px-6 py-4">Renter</th>
                  <th className="px-6 py-4">Vehicle</th>
                  <th className="px-6 py-4">Pickup Date</th>
                  <th className="px-6 py-4">Return Date</th>
                  <th className="px-6 py-4">Revenue Collected</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60 animate-fade-in">
                {filteredRentals.map((rental) => (
                  <tr key={rental.id} className="hover:bg-slate-850/10 transition">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-200 block">{rental.customerName}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">{rental.customerPhone}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-300 block">{rental.car.year} {rental.car.make} {rental.car.model}</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block uppercase">{rental.car.licensePlate}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-350">
                      {new Date(rental.pickupDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-slate-350">
                      {rental.actualReturnDate 
                        ? new Date(rental.actualReturnDate).toLocaleDateString()
                        : <span className="text-slate-650 italic">Pending return</span>
                      }
                    </td>
                    <td className="px-6 py-4">
                      {rental.totalCostCollected !== null ? (
                        <span className="text-emerald-400 font-bold">${rental.totalCostCollected.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Est: ${rental.totalCostExpected.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                        rental.status === RentalStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        rental.status === RentalStatus.ACTIVE ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        rental.status === RentalStatus.OVERDUE ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {rental.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openAuditModal(rental)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                        title="Audit Condition & Docs"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RENTAL AUDIT MODAL */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={`Rental Audit: ${activeRental?.customerName}`}
      >
        {activeRental && (() => {
          const departureLog = getLogByType(activeRental, 'DEPARTURE');
          const returnLog = getLogByType(activeRental, 'RETURN');
          return (
            <div className="space-y-6 text-sm text-slate-300">
              
              {/* Basic Details */}
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-850 space-y-2">
                <h4 className="font-bold text-white uppercase text-xs tracking-wider text-slate-400 border-b border-slate-850 pb-2">Agreement Info</h4>
                <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block">Customer DL:</span>
                    <span className="font-bold text-slate-200">{activeRental.customerLicenseNum}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Processed By Staff:</span>
                    <span className="font-bold text-slate-200">{activeRental.employee.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Expected Return:</span>
                    <span className="font-bold text-slate-200">{new Date(activeRental.expectedReturnDate).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Security Deposit:</span>
                    <span className="font-bold text-emerald-400">${activeRental.depositCollected.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Customer Email & Billing Dispatch */}
              {/* Customer Email & Billing Dispatch */}
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-850 space-y-3">
                <h4 className="font-bold text-white uppercase text-xs tracking-wider text-slate-400 border-b border-slate-850 pb-2">Billing & Invoicing</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Customer Email"
                    placeholder="customer@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                  {activeRental.status === 'COMPLETED' ? (
                    <Input
                      label="Applied Discount ($)"
                      type="number"
                      placeholder="0"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                    />
                  ) : (
                    <div className="flex flex-col justify-end text-xs text-slate-500 italic pb-2">
                      Discount can be applied during check-in return.
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleSaveEmail}
                    loading={savingEmail}
                  >
                    Save Billing Details
                  </Button>
                </div>
                
                <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-850/60">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      variant="primary" 
                      size="sm" 
                      disabled={!emailInput.trim()}
                      onClick={handleSendInvoice}
                      loading={sendingInvoice}
                      className="flex-1 text-xs"
                    >
                      Send Invoice Email
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyLink}
                      loading={copyingLink}
                      className="flex-1 text-xs"
                    >
                      Copy Shareable Link
                    </Button>
                  </div>
                  <Link 
                    href={`/invoice/${activeRental.id}`} 
                    target="_blank"
                    className="w-full inline-flex items-center justify-center font-semibold rounded-xl text-[10px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition"
                  >
                    Print / View PDF Invoice
                  </Link>
                </div>
                {emailStatusMsg && (
                  <p className="text-xs text-emerald-450 font-bold text-center mt-1 animate-pulse">{emailStatusMsg}</p>
                )}
              </div>

              {/* Document Images (License & Insurance) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Driver's License Image */}
                <div className="space-y-2">
                  <h4 className="font-bold text-white uppercase text-xs tracking-wider text-slate-400">Driver&apos;s License Document</h4>
                  <div className="aspect-video bg-slate-950/50 rounded-2xl border border-slate-850 overflow-hidden relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={activeRental.licensePhotoUrl} 
                      alt="Customer Driver's License" 
                      className="w-full h-full object-cover"
                    />
                    <button 
                      type="button"
                      onClick={() => setPreviewImageUrl(activeRental.licensePhotoUrl)} 
                      className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-white transition cursor-pointer w-full text-center"
                    >
                      Open Document Preview
                    </button>
                  </div>
                </div>

                {/* Insurance Card Image */}
                <div className="space-y-2">
                  <h4 className="font-bold text-white uppercase text-xs tracking-wider text-slate-400">Insurance Card Document</h4>
                  {activeRental.insurancePhotoUrl ? (
                    <div className="aspect-video bg-slate-950/50 rounded-2xl border border-slate-850 overflow-hidden relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={activeRental.insurancePhotoUrl} 
                        alt="Customer Insurance Card" 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        type="button"
                        onClick={() => setPreviewImageUrl(activeRental.insurancePhotoUrl)} 
                        className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-white transition cursor-pointer w-full text-center"
                      >
                        Open Document Preview
                      </button>
                    </div>
                  ) : (
                    <div className="aspect-video bg-slate-950/20 rounded-2xl border border-slate-850 border-dashed flex items-center justify-center text-slate-500 text-xs">
                      No Insurance Document Uploaded
                    </div>
                  )}
                </div>
              </div>

              {/* Departure Inspection Log */}
              {departureLog && (
                <div className="space-y-3 p-4 bg-slate-950/20 border border-slate-850 rounded-2xl">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <h4 className="font-bold text-blue-400 uppercase text-xs tracking-wider flex items-center gap-1.5">
                      <Milestone className="w-4 h-4" /> Departure Condition Log
                    </h4>
                    <span className="text-[10px] text-slate-500">{new Date(activeRental.pickupDate).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block font-semibold">Start Mileage:</span>
                      <span className="text-slate-200">{activeRental.startMileage.toLocaleString()} km</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-semibold">Start Fuel:</span>
                      <span className="text-slate-200">{formatFuelLevel(activeRental.startFuel)}</span>
                    </div>
                  </div>
                  {departureLog.notes && (
                    <div className="text-xs pt-1">
                      <span className="text-slate-500 font-semibold block">Notes:</span>
                      <p className="text-slate-300 mt-1 p-2 bg-slate-900 border border-slate-850 rounded-lg italic">&ldquo;{departureLog.notes}&rdquo;</p>
                    </div>
                  )}
                  {/* Departure Images */}
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {departureLog.photoUrls.map((url, i) => (
                      <button 
                        key={i} 
                        type="button"
                        onClick={() => setPreviewImageUrl(url)}
                        className="aspect-square bg-slate-900 border border-slate-850 rounded-lg overflow-hidden block hover:opacity-85 transition focus:outline-none"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Departure inspection ${i}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Return Inspection Log */}
              {returnLog ? (() => {
                const { discount: parsedDiscount, notes: cleanNotes } = parseDiscountAndNotes(returnLog.notes);
                return (
                  <div className="space-y-3 p-4 bg-emerald-950/5 border border-emerald-500/10 rounded-2xl">
                    <div className="flex justify-between items-center border-b border-emerald-500/15 pb-2">
                      <h4 className="font-bold text-emerald-400 uppercase text-xs tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Return Condition Log
                      </h4>
                      <span className="text-[10px] text-slate-500">
                        {activeRental.actualReturnDate ? new Date(activeRental.actualReturnDate).toLocaleString() : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block font-semibold">End Mileage:</span>
                        <span className="text-slate-200">
                          {activeRental.endMileage ? `${activeRental.endMileage.toLocaleString()} km` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-semibold">Return Fuel:</span>
                        <span className="text-slate-200">{formatFuelLevel(activeRental.endFuel)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-semibold">Deposit Status:</span>
                        <span className={activeRental.depositReturned ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          {activeRental.depositReturned ? 'Returned' : 'Held / Lost'}
                        </span>
                      </div>
                    </div>
                    {parsedDiscount > 0 && (
                      <div className="flex justify-between p-2 bg-rose-500/5 border border-rose-500/10 text-xs rounded-xl">
                        <span className="text-slate-400 font-semibold">Discount applied at return:</span>
                        <span className="font-bold text-rose-450">-${parsedDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    {cleanNotes && (
                      <div className="text-xs pt-1">
                        <span className="text-slate-500 font-semibold block">Notes:</span>
                        <p className="text-slate-300 mt-1 p-2 bg-slate-900 border border-slate-850 rounded-lg italic">&ldquo;{cleanNotes}&rdquo;</p>
                      </div>
                    )}
                    {/* Return Images */}
                    <div className="grid grid-cols-4 gap-2 pt-2">
                      {returnLog.photoUrls.map((url, i) => (
                        <button 
                          key={i} 
                          type="button"
                          onClick={() => setPreviewImageUrl(url)}
                          className="aspect-square bg-slate-900 border border-slate-850 rounded-lg overflow-hidden block hover:opacity-85 transition focus:outline-none"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Return inspection ${i}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <div className="p-4 bg-slate-950/20 border border-slate-850 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-500">
                  <AlertOctagon className="w-4 h-4 text-slate-650" /> Return condition logs pending return check-in.
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Close Audit Log</Button>
              </div>

            </div>
          );
        })()}
      </Modal>

      {/* IMAGE PREVIEW LIGHTBOX */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md transition-all cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button 
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-800 text-white p-2.5 rounded-full border border-slate-750 transition z-10 hover:scale-105"
              aria-label="Close image preview"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={previewImageUrl} 
              alt="Document Preview" 
              className="rounded-2xl max-w-full max-h-[85vh] object-contain border border-slate-800 shadow-2xl"
            />
          </div>
        </div>
      )}

    </div>
  );
}
