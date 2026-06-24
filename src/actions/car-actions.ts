'use server';

import { prisma } from '@/lib/prisma';
import { CarStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth-session';

export interface CarInput {
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string | null;
  color: string;
  dailyRate: number;
  currentOdo: number;
  status?: CarStatus;
  seatingCapacity?: number;
  transmission?: string;
  type?: string;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN' || !user.isActive) {
    throw new Error('Unauthorized. Admin access required.');
  }
  return user;
}

export async function getCars() {
  try {
    return await prisma.car.findMany({
      orderBy: { make: 'asc' },
    });
  } catch (error) {
    console.error('Error fetching cars:', error);
    throw new Error('Failed to fetch cars.');
  }
}

export async function createCar(data: CarInput) {
  try {
    await requireAdmin();

    const car = await prisma.car.create({
      data: {
        make: data.make,
        model: data.model,
        year: data.year,
        licensePlate: data.licensePlate,
        vin: data.vin,
        color: data.color,
        dailyRate: data.dailyRate,
        currentOdo: data.currentOdo,
        status: data.status || CarStatus.AVAILABLE,
        seatingCapacity: data.seatingCapacity ?? 5,
        transmission: data.transmission ?? 'Automatic',
        type: data.type ?? 'Sedan',
      },
    });
    revalidatePath('/admin/fleet');
    revalidatePath('/employee/dashboard');
    return { success: true, car };
  } catch (error) {
    console.error('Error creating car:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create car.' };
  }
}

export async function updateCar(id: string, data: Partial<CarInput> & { needsService?: boolean }) {
  try {
    await requireAdmin();

    const car = await prisma.car.update({
      where: { id },
      data,
    });
    revalidatePath('/admin/fleet');
    revalidatePath('/employee/dashboard');
    return { success: true, car };
  } catch (error) {
    console.error('Error updating car:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update car.' };
  }
}

export async function deleteCar(id: string) {
  try {
    await requireAdmin();

    // Check if the car has any rentals (Active, completed, overdue, etc.)
    const rentalCount = await prisma.rental.count({
      where: { carId: id },
    });
    if (rentalCount > 0) {
      return { 
        success: false, 
        error: `Cannot delete car: It is associated with ${rentalCount} rental record(s).` 
      };
    }

    await prisma.car.delete({
      where: { id },
    });
    revalidatePath('/admin/fleet');
    return { success: true };
  } catch (error) {
    console.error('Error deleting car:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete car.' };
  }
}

export async function resetServiceNeeded(id: string) {
  try {
    await requireAdmin();

    await prisma.car.update({
      where: { id },
      data: { needsService: false },
    });
    revalidatePath('/admin/fleet');
    return { success: true };
  } catch (error) {
    console.error('Error resetting service flag:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reset service flag.' };
  }
}
