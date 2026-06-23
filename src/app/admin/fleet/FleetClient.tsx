'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCar, updateCar, deleteCar, resetServiceNeeded } from '@/actions/car-actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { 
  Plus, Edit2, Trash2, Wrench, AlertTriangle, 
  Search 
} from 'lucide-react';
import { CarStatus } from '@prisma/client';

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
  status: CarStatus;
  needsService: boolean;
}

interface FleetClientProps {
  initialCars: Car[];
}

export default function FleetClient({ initialCars }: FleetClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  
  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);

  // Form states
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2024');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [color, setColor] = useState('');
  const [dailyRate, setDailyRate] = useState('50');
  const [currentOdo, setCurrentOdo] = useState('1000');
  const [status, setStatus] = useState<CarStatus>(CarStatus.AVAILABLE);

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Filtering
  const filteredCars = initialCars.filter((car) => {
    const term = search.toLowerCase();
    return (
      car.make.toLowerCase().includes(term) ||
      car.model.toLowerCase().includes(term) ||
      car.licensePlate.toLowerCase().includes(term) ||
      (car.vin && car.vin.toLowerCase().includes(term))
    );
  });

  const openAddModal = () => {
    setMake('');
    setModel('');
    setYear('2024');
    setLicensePlate('');
    setVin('');
    setColor('');
    setDailyRate('50');
    setCurrentOdo('1000');
    setStatus(CarStatus.AVAILABLE);
    setFormError('');
    setIsAddOpen(true);
  };

  const openEditModal = (car: Car) => {
    setSelectedCar(car);
    setMake(car.make);
    setModel(car.model);
    setYear(car.year.toString());
    setLicensePlate(car.licensePlate);
    setVin(car.vin || '');
    setColor(car.color);
    setDailyRate(car.dailyRate.toString());
    setCurrentOdo(car.currentOdo.toString());
    setStatus(car.status);
    setFormError('');
    setIsEditOpen(true);
  };

  // Add Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');

    if (!make.trim() || !model.trim() || !licensePlate.trim() || !color.trim()) {
      setFormError('Please fill out all required fields.');
      setLoading(false);
      return;
    }

    try {
      const res = await createCar({
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year) || 2024,
        licensePlate: licensePlate.trim().toUpperCase(),
        vin: vin.trim() || null,
        color: color.trim(),
        dailyRate: parseFloat(dailyRate) || 0,
        currentOdo: parseInt(currentOdo) || 0,
        status,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to create vehicle.');
      }

      setIsAddOpen(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCar) return;
    setLoading(true);
    setFormError('');

    if (!make.trim() || !model.trim() || !licensePlate.trim() || !color.trim()) {
      setFormError('Please fill out all required fields.');
      setLoading(false);
      return;
    }

    try {
      const res = await updateCar(selectedCar.id, {
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year) || 2024,
        licensePlate: licensePlate.trim().toUpperCase(),
        vin: vin.trim() || null,
        color: color.trim(),
        dailyRate: parseFloat(dailyRate) || 0,
        currentOdo: parseInt(currentOdo) || 0,
        status,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to update vehicle.');
      }

      setIsEditOpen(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Action
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this vehicle from the fleet?')) return;

    try {
      const res = await deleteCar(id);
      if (!res.success) {
        alert(res.error || 'Failed to delete vehicle.');
      }
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Reset Service Wrench
  const handleResetService = async (id: string) => {
    if (!confirm('Are you sure you want to mark service as completed and clear the warning?')) return;

    try {
      const res = await resetServiceNeeded(id);
      if (!res.success) {
        alert(res.error || 'Failed to clear warning.');
      }
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Controls: Search and Add */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search make, model, plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          />
        </div>

        <Button variant="primary" onClick={openAddModal}>
          <Plus className="w-4 h-4 mr-1" /> Add Vehicle
        </Button>
      </div>

      {/* Fleet Table */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl overflow-hidden shadow-lg">
        {filteredCars.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No vehicles matching the filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="text-xs uppercase font-semibold text-slate-500 border-b border-slate-850 bg-slate-950/20">
                <tr>
                  <th className="px-6 py-4">Vehicle</th>
                  <th className="px-6 py-4">License Plate</th>
                  <th className="px-6 py-4">Odometer</th>
                  <th className="px-6 py-4">Daily Rate</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Flags</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                {filteredCars.map((car) => (
                  <tr key={car.id} className="hover:bg-slate-850/10 transition">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-200 block">{car.year} {car.make} {car.model}</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{car.color} {car.vin ? `• VIN: ${car.vin}` : ''}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-950/60 border border-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded font-mono font-bold uppercase">
                        {car.licensePlate}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-medium">
                      {car.currentOdo.toLocaleString()} km
                    </td>
                    <td className="px-6 py-4 text-emerald-400 font-bold">
                      ${car.dailyRate.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                        car.status === CarStatus.AVAILABLE ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        car.status === CarStatus.ON_RENT ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        car.status === CarStatus.MAINTENANCE ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {car.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {car.needsService ? (
                        <span className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Needs Service
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {car.needsService && (
                        <button
                          onClick={() => handleResetService(car.id)}
                          className="p-1.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/20 text-amber-400 hover:text-amber-200 rounded-lg transition"
                          title="Complete Service check"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(car)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                        title="Edit Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(car.id)}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 hover:text-rose-200 rounded-lg transition"
                        title="Remove Car"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD CAR MODAL */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Fleet Vehicle">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Make *" required value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
            <Input label="Model *" required value={model} onChange={(e) => setModel(e.target.value)} placeholder="Camry" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Year *" required type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            <Input label="Color *" required value={color} onChange={(e) => setColor(e.target.value)} placeholder="Silver" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="License Plate *" required value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} placeholder="XYZ-9876" />
            <Input label="VIN" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17-char VIN" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Daily Rate ($) *" required type="number" step="0.01" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
            <Input label="Starting Odo (km) *" required type="number" value={currentOdo} onChange={(e) => setCurrentOdo(e.target.value)} />
          </div>

          <Select
            label="Initial Status *"
            options={[
              { value: CarStatus.AVAILABLE, label: 'Available' },
              { value: CarStatus.MAINTENANCE, label: 'Under Maintenance' },
              { value: CarStatus.DECOMMISSIONED, label: 'Decommissioned' },
            ]}
            value={status}
            onChange={(e) => setStatus(e.target.value as CarStatus)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={loading}>Save Vehicle</Button>
          </div>
        </form>
      </Modal>

      {/* EDIT CAR MODAL */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Vehicle Details">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Make *" required value={make} onChange={(e) => setMake(e.target.value)} />
            <Input label="Model *" required value={model} onChange={(e) => setModel(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Year *" required type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            <Input label="Color *" required value={color} onChange={(e) => setColor(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="License Plate *" required value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
            <Input label="VIN" value={vin} onChange={(e) => setVin(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Daily Rate ($) *" required type="number" step="0.01" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
            <Input label="Odometer Reading (km) *" required type="number" value={currentOdo} onChange={(e) => setCurrentOdo(e.target.value)} />
          </div>

          <Select
            label="Status *"
            options={[
              { value: CarStatus.AVAILABLE, label: 'Available' },
              { value: CarStatus.ON_RENT, label: 'On Rent (Locked)' },
              { value: CarStatus.MAINTENANCE, label: 'Under Maintenance' },
              { value: CarStatus.DECOMMISSIONED, label: 'Decommissioned' },
            ]}
            disabled={status === CarStatus.ON_RENT} // block editing status if it is currently on rent
            value={status}
            onChange={(e) => setStatus(e.target.value as CarStatus)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={loading}>Update Vehicle</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
