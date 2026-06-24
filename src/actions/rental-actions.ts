'use server';

import { prisma } from '@/lib/prisma';
import { FuelLevel, RentalStatus, CarStatus, LogType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import nodemailer from 'nodemailer';
import { createHmac } from 'crypto';
import { getCurrentUser } from '@/lib/auth-session';

async function requireAuth() {
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    throw new Error('Unauthorized. Access denied.');
  }
  return user;
}



export interface CheckoutInput {
  carId: string;
  employeeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerLicenseNum: string;
  licensePhotoUrl: string;
  pickupDate: Date | string;
  expectedReturnDate: Date | string;
  startMileage: number;
  startFuel: FuelLevel;
  totalCostExpected: number;
  depositCollected: number;
  notes?: string | null;
  photoUrls: string[];
  reservationId?: string; // Optional ID if transitioning from a booking
}

export interface ReservationInput {
  carId: string;
  employeeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerLicenseNum: string;
  pickupDate: Date | string;
  expectedReturnDate: Date | string;
  totalCostExpected: number;
}

export interface CheckinInput {
  rentalId: string;
  endMileage: number;
  endFuel: FuelLevel;
  actualReturnDate: Date | string;
  totalCostCollected: number;
  depositReturned: boolean;
  notes?: string | null;
  photoUrls: string[];
  customerEmail?: string | null;
}

/**
 * Creates a rental agreement (or transitions an existing RESERVED booking to ACTIVE),
 * updates the car status to ON_RENT, and logs the departure condition.
 */
export async function checkoutCar(data: CheckoutInput) {
  try {
    await requireAuth();

    // 1. Validate inputs
    if (!data.carId || !data.employeeId || !data.customerName || !data.customerLicenseNum || !data.licensePhotoUrl) {
      return { success: false, error: 'Required fields are missing.' };
    }

    const pickupDate = new Date(data.pickupDate);
    const expectedReturnDate = new Date(data.expectedReturnDate);

    if (isNaN(pickupDate.getTime()) || isNaN(expectedReturnDate.getTime())) {
      return { success: false, error: 'Invalid dates provided.' };
    }

    // 2. Fetch car and verify status
    const car = await prisma.car.findUnique({
      where: { id: data.carId },
    });

    if (!car) {
      return { success: false, error: 'Car not found.' };
    }

    // If direct checkout (not from reservation), the car must be AVAILABLE
    if (!data.reservationId && car.status !== CarStatus.AVAILABLE) {
      return { success: false, error: `Car is not available for direct checkout. Status: ${car.status}` };
    }

    // 3. Double-Booking Overlap Validation
    const overlaps = await prisma.rental.findFirst({
      where: {
        carId: data.carId,
        status: {
          in: [RentalStatus.ACTIVE, RentalStatus.OVERDUE, RentalStatus.RESERVED],
        },
        NOT: data.reservationId ? { id: data.reservationId } : undefined,
        pickupDate: {
          lt: expectedReturnDate,
        },
        expectedReturnDate: {
          gt: pickupDate,
        },
      },
    });

    if (overlaps) {
      return { success: false, error: 'This vehicle has an overlapping rental or reservation during the selected date range.' };
    }

    // 4. Process checkout transaction
    const rental = await prisma.$transaction(async (tx) => {
      let activeRental;

      if (data.reservationId) {
        // Upgrade reservation to active rental
        activeRental = await tx.rental.update({
          where: { id: data.reservationId },
          data: {
            employeeId: data.employeeId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerLicenseNum: data.customerLicenseNum,
            licensePhotoUrl: data.licensePhotoUrl,
            pickupDate,
            expectedReturnDate,
            startMileage: data.startMileage,
            startFuel: data.startFuel,
            totalCostExpected: data.totalCostExpected,
            depositCollected: data.depositCollected,
            status: RentalStatus.ACTIVE,
          },
        });
      } else {
        // Create new direct checkout record
        activeRental = await tx.rental.create({
          data: {
            carId: data.carId,
            employeeId: data.employeeId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerLicenseNum: data.customerLicenseNum,
            licensePhotoUrl: data.licensePhotoUrl,
            pickupDate,
            expectedReturnDate,
            startMileage: data.startMileage,
            startFuel: data.startFuel,
            totalCostExpected: data.totalCostExpected,
            depositCollected: data.depositCollected,
            status: RentalStatus.ACTIVE,
          },
        });
      }

      // Create ConditionLog for Departure
      await tx.conditionLog.create({
        data: {
          rentalId: activeRental.id,
          type: LogType.DEPARTURE,
          notes: data.notes,
          photoUrls: data.photoUrls,
        },
      });

      // Update Car Status and Odometer
      await tx.car.update({
        where: { id: data.carId },
        data: {
          status: CarStatus.ON_RENT,
          currentOdo: data.startMileage,
        },
      });

      return activeRental;
    });

    // Revalidate paths
    revalidatePath('/admin/dashboard');
    revalidatePath('/employee/dashboard');
    revalidatePath('/admin/fleet');
    revalidatePath('/admin/ledger');

    return { success: true, rentalId: rental.id };
  } catch (error) {
    console.error('Checkout error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred during checkout.';
    return { success: false, error: message };
  }
}

/**
 * Creates a pre-booking reservation (RESERVED) for a car with double-booking validation.
 */
export async function createReservation(data: ReservationInput) {
  try {
    await requireAuth();

    // 1. Validate inputs
    if (!data.carId || !data.employeeId || !data.customerName || !data.customerLicenseNum) {
      return { success: false, error: 'Required fields are missing.' };
    }

    const pickupDate = new Date(data.pickupDate);
    const expectedReturnDate = new Date(data.expectedReturnDate);

    if (isNaN(pickupDate.getTime()) || isNaN(expectedReturnDate.getTime())) {
      return { success: false, error: 'Invalid dates provided.' };
    }

    if (expectedReturnDate <= pickupDate) {
      return { success: false, error: 'Return date must be after pickup date.' };
    }

    // 2. Fetch car details
    const car = await prisma.car.findUnique({
      where: { id: data.carId },
    });

    if (!car) {
      return { success: false, error: 'Vehicle not found.' };
    }

    if (car.status === CarStatus.DECOMMISSIONED) {
      return { success: false, error: 'Decommissioned vehicles cannot be reserved.' };
    }

    // 3. Double-Booking Overlap Validation
    const overlaps = await prisma.rental.findFirst({
      where: {
        carId: data.carId,
        status: {
          in: [RentalStatus.ACTIVE, RentalStatus.OVERDUE, RentalStatus.RESERVED],
        },
        pickupDate: {
          lt: expectedReturnDate,
        },
        expectedReturnDate: {
          gt: pickupDate,
        },
      },
    });

    if (overlaps) {
      return { success: false, error: 'This vehicle has an overlapping rental or reservation during the selected date range.' };
    }

    // 4. Create reservation
    const rental = await prisma.rental.create({
      data: {
        carId: data.carId,
        employeeId: data.employeeId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        customerLicenseNum: data.customerLicenseNum,
        licensePhotoUrl: '', // To be filled during check-out release
        pickupDate,
        expectedReturnDate,
        startMileage: car.currentOdo, // Default placeholder
        startFuel: FuelLevel.FULL, // Default placeholder
        totalCostExpected: data.totalCostExpected,
        depositCollected: 0, // Deposit is collected when vehicle is released
        status: RentalStatus.RESERVED,
      },
    });

    // Revalidate paths
    revalidatePath('/admin/dashboard');
    revalidatePath('/employee/dashboard');
    revalidatePath('/admin/fleet');
    revalidatePath('/admin/ledger');

    return { success: true, rentalId: rental.id };
  } catch (error) {
    console.error('Reservation error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred during reservation.';
    return { success: false, error: message };
  }
}

/**
 * Cancels a pre-booked reservation.
 */
export async function cancelReservation(rentalId: string) {
  try {
    await requireAuth();

    const rental = await prisma.rental.findUnique({
      where: { id: rentalId },
    });

    if (!rental) {
      return { success: false, error: 'Reservation record not found.' };
    }

    if (rental.status !== RentalStatus.RESERVED) {
      return { success: false, error: 'Only pending reservations can be cancelled.' };
    }

    await prisma.rental.update({
      where: { id: rentalId },
      data: {
        status: RentalStatus.CANCELLED,
      },
    });

    // Revalidate paths
    revalidatePath('/admin/dashboard');
    revalidatePath('/employee/dashboard');
    revalidatePath('/admin/fleet');
    revalidatePath('/admin/ledger');

    return { success: true };
  } catch (error) {
    console.error('Cancel reservation error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred while cancelling the reservation.';
    return { success: false, error: message };
  }
}

/**
 * Completes a rental agreement, performs odometer safety checks, updates car status/odometer,
 * calculates maintenance needs, and logs the return condition.
 */
export async function checkinRental(data: CheckinInput) {
  try {
    await requireAuth();

    // 1. Validate inputs
    if (!data.rentalId || data.endMileage === undefined || !data.endFuel) {
      return { success: false, error: 'Required fields are missing.' };
    }

    const actualReturnDate = new Date(data.actualReturnDate);
    if (isNaN(actualReturnDate.getTime())) {
      return { success: false, error: 'Invalid return date.' };
    }

    // 2. Fetch rental with car
    const rental = await prisma.rental.findUnique({
      where: { id: data.rentalId },
      include: { car: true },
    });

    if (!rental) {
      return { success: false, error: 'Rental record not found.' };
    }

    if (rental.status !== RentalStatus.ACTIVE && rental.status !== RentalStatus.OVERDUE) {
      return { success: false, error: 'This rental has already been checked in or cancelled.' };
    }

    // 3. Odometer Safety Catch
    if (data.endMileage < rental.startMileage) {
      throw new Error(`Odometer Safety Catch: End mileage (${data.endMileage}) cannot be less than start mileage (${rental.startMileage}).`);
    }

    // 4. Maintenance / Wrench Flag Check
    const oldOdo = rental.car.currentOdo;
    const newOdo = data.endMileage;
    
    // Check if the distance driven pushed the car past a 7,500km interval threshold
    const crossedServiceInterval = Math.floor(oldOdo / 7500) < Math.floor(newOdo / 7500);
    const needsService = crossedServiceInterval ? true : rental.car.needsService;

    // 5. Process checkin transaction
    await prisma.$transaction(async (tx) => {
      // Update Rental status to COMPLETED and save return metrics
      await tx.rental.update({
        where: { id: data.rentalId },
        data: {
          status: RentalStatus.COMPLETED,
          actualReturnDate,
          endMileage: data.endMileage,
          endFuel: data.endFuel,
          totalCostCollected: data.totalCostCollected,
          depositReturned: data.depositReturned,
          customerEmail: data.customerEmail !== undefined ? data.customerEmail : undefined,
        },
      });

      // Create ConditionLog for Return
      await tx.conditionLog.create({
        data: {
          rentalId: data.rentalId,
          type: LogType.RETURN,
          notes: data.notes,
          photoUrls: data.photoUrls,
        },
      });

      // Update Car: status = AVAILABLE, currentOdo = endMileage, set needsService
      await tx.car.update({
        where: { id: rental.carId },
        data: {
          status: CarStatus.AVAILABLE,
          currentOdo: newOdo,
          needsService,
        },
      });
    });

    // Revalidate paths
    revalidatePath('/admin/dashboard');
    revalidatePath('/employee/dashboard');
    revalidatePath('/admin/fleet');
    revalidatePath('/admin/ledger');

    return { success: true };
  } catch (error) {
    console.error('Checkin error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred during check-in.';
    return { success: false, error: message };
  }
}


/**
 * Simulates generating and sending an invoice PDF to the customer.
 */
// Node-mailer transporter configuration
const getTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true for port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

export async function sendInvoiceEmail(rentalId: string) {
  try {
    await requireAuth();
    const rental = await prisma.rental.findUnique({
      where: { id: rentalId },
      include: { 
        car: true,
        conditionLogs: true,
      },
    });

    if (!rental) {
      return { success: false, error: 'Rental record not found.' };
    }

    if (!rental.customerEmail) {
      return { success: false, error: 'No email address associated with this rental contract.' };
    }

    // Parse discount from return condition log notes if COMPLETED
    const returnLog = rental.conditionLogs.find((log) => log.type === LogType.RETURN);
    let discount = 0;
    if (returnLog && returnLog.notes) {
      const discountMatch = returnLog.notes.match(/^\[DISCOUNT:\s*([\d.]+)\]/);
      if (discountMatch) {
        discount = parseFloat(discountMatch[1]);
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const secret = process.env.FIREBASE_PRIVATE_KEY || 'default-secret-key';
    const token = createHmac('sha256', secret).update(rental.id).digest('hex');
    const invoiceUrl = `${appUrl}/invoice/${rental.id}?token=${token}`;

    // Generate Invoice Summary for the email log
    console.log('====================================================');
    console.log(`SENDING INVOICE EMAIL TO: ${rental.customerEmail}`);
    console.log(`SUBJECT: Invoice for Rental Agreement #${rental.id}`);
    console.log(`VEHICLE: ${rental.car.year} ${rental.car.make} ${rental.car.model}`);
    console.log(`TOTAL COST: $${rental.totalCostCollected || rental.totalCostExpected}`);
    console.log('====================================================');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; color: #1a202c; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 16px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">FleetFlow</h2>
          <p style="font-size: 14px; color: #4b5563; margin: 4px 0 0 0;">Official Rental Bill / Invoice</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.5; color: #374151;">Dear <strong>${rental.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5; color: #374151;">Thank you for renting with FleetFlow. Your vehicle return has been successfully processed. Here is your final billing breakdown:</p>
        
        <div style="background-color: #f3f4f6; padding: 18px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #4b5563; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; letter-spacing: 0.5px;">Vehicle Details</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr><td style="color: #6b7280; padding: 4px 0; width: 40%;">Vehicle Model:</td><td style="font-weight: 600; color: #1f2937;">${rental.car.year} ${rental.car.make} ${rental.car.model}</td></tr>
            <tr><td style="color: #6b7280; padding: 4px 0;">License Plate:</td><td style="font-weight: 600; color: #1f2937; font-family: monospace;">${rental.car.licensePlate}</td></tr>
            <tr><td style="color: #6b7280; padding: 4px 0;">Start Odometer:</td><td style="color: #1f2937;">${rental.startMileage.toLocaleString()} km</td></tr>
            <tr><td style="color: #6b7280; padding: 4px 0;">End Odometer:</td><td style="color: #1f2937;">${rental.endMileage ? `${rental.endMileage.toLocaleString()} km` : 'N/A'}</td></tr>
          </table>
        </div>
        
        <div style="background-color: #f3f4f6; padding: 18px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #4b5563; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; letter-spacing: 0.5px;">Financial Settlement</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Expected Cost:</td><td style="text-align: right; color: #1f2937;">$${rental.totalCostExpected.toFixed(2)}</td></tr>
            ${discount > 0 ? `<tr><td style="padding: 6px 0; color: #dc2626; font-weight: 600;">Discount Applied:</td><td style="text-align: right; color: #dc2626; font-weight: 600;">-$${discount.toFixed(2)}</td></tr>` : ''}
            <tr style="border-top: 1px solid #d1d5db; font-weight: bold;"><td style="padding: 10px 0; font-size: 15px; color: #111827;">Total Paid:</td><td style="text-align: right; font-size: 18px; color: #16a34a;">$${(rental.totalCostCollected ?? (rental.totalCostExpected - discount)).toFixed(2)}</td></tr>
            <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 0; color: #6b7280; font-size: 12px;">Security Deposit:</td><td style="text-align: right; color: #4b5563; font-size: 12px;">$${rental.depositCollected.toFixed(2)} (${rental.depositReturned ? 'Returned' : 'Held / Kept'})</td></tr>
          </table>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invoiceUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2);">Print or View PDF Invoice</a>
        </div>
        
        <p style="font-size: 15px; line-height: 1.5; color: #374151;">If you have any questions regarding your bill, please feel free to reach out to our service team.</p>
        
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 36px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          This is an automated invoice billing receipt. Please do not reply directly to this mail.
        </p>
      </div>
    `;

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"FleetFlow Billing" <${process.env.SMTP_USER}>`,
      to: rental.customerEmail,
      subject: `Invoice for FleetFlow Rental`,
      html: htmlContent,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending invoice email:', error);
    const message = error instanceof Error ? error.message : 'Failed to send invoice email.';
    return { success: false, error: message };
  }
}

/**
 * Updates a customer's email and discount on an existing rental record (post-return).
 * Recalculates totalCostCollected.
 */
export async function updateRentalBilling(rentalId: string, email: string, discount: number) {
  try {
    await requireAuth();
    if (!rentalId) {
      return { success: false, error: 'Rental ID is required.' };
    }

    // 1. Fetch rental and RETURN condition log
    const rental = await prisma.rental.findUnique({
      where: { id: rentalId },
      include: { conditionLogs: true },
    });

    if (!rental) {
      return { success: false, error: 'Rental record not found.' };
    }

    const returnLog = rental.conditionLogs.find((log) => log.type === LogType.RETURN);

    // Recalculate totalCostCollected
    const newTotalCostCollected = Math.max(0, rental.totalCostExpected - discount);

    await prisma.$transaction(async (tx) => {
      // Update customerEmail and totalCostCollected
      await tx.rental.update({
        where: { id: rentalId },
        data: {
          customerEmail: email.trim() || null,
          totalCostCollected: rental.status === RentalStatus.COMPLETED ? newTotalCostCollected : null,
        },
      });

      // Update return ConditionLog notes
      if (returnLog) {
        let cleanNotes = '';
        if (returnLog.notes) {
          cleanNotes = returnLog.notes.replace(/^\[DISCOUNT:\s*([\d.]+)\]\s*/, '');
        }
        
        const formattedNotes = discount > 0 
          ? `[DISCOUNT: ${discount}] ${cleanNotes}`.trim()
          : cleanNotes.trim();

        await tx.conditionLog.update({
          where: { id: returnLog.id },
          data: {
            notes: formattedNotes || null,
          },
        });
      }
    });

    revalidatePath('/admin/dashboard');
    revalidatePath('/employee/dashboard');
    revalidatePath('/admin/fleet');
    revalidatePath('/admin/ledger');

    return { success: true };
  } catch (error) {
    console.error('Error updating rental billing details:', error);
    const message = error instanceof Error ? error.message : 'Failed to update billing details.';
    return { success: false, error: message };
  }
}

/**
 * Generates a secure bypass token link for customers to view their invoices.
 */
export async function getShareableInvoiceLink(rentalId: string) {
  try {
    await requireAuth();
    if (!rentalId) {
      return { success: false, error: 'Rental ID is required.' };
    }
    const secret = process.env.FIREBASE_PRIVATE_KEY || 'default-secret-key';
    const token = createHmac('sha256', secret).update(rentalId).digest('hex');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const link = `${appUrl}/invoice/${rentalId}?token=${token}`;
    return { success: true, link };
  } catch (error) {
    console.error('Error generating shareable link:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate link.';
    return { success: false, error: message };
  }
}

