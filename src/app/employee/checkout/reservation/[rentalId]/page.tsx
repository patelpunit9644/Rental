import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-session';
import CheckoutWizard from '../../[carId]/CheckoutWizard';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ rentalId: string }>;
}

export default async function ReservationCheckoutPage({ params }: PageProps) {
  const { rentalId } = await params;

  // 1. Fetch rental details along with the car specs
  const rental = await prisma.rental.findUnique({
    where: { id: rentalId },
    include: {
      car: true,
    },
  });

  if (!rental) {
    return notFound();
  }

  // Double check that it is indeed a RESERVED pending booking
  if (rental.status !== 'RESERVED') {
    return redirect('/employee/dashboard');
  }

  // 2. Identify the logged-in employee securely
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return redirect('/login');
  }
  const employeeId = user.firebaseUid;

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-2xl font-bold text-white">Release Reserved Vehicle</h1>
        <p className="text-slate-400 text-sm mt-1">
          Complete departure checkout checklist to release the {rental.car.year} {rental.car.make} {rental.car.model}
        </p>
      </div>

      <CheckoutWizard 
        car={rental.car} 
        employeeId={employeeId} 
        rental={rental} 
      />
    </div>
  );
}
