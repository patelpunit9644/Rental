import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-session';
import CheckoutWizard from './CheckoutWizard';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ carId: string }>;
}

export default async function CheckoutPage({ params }: PageProps) {
  const { carId } = await params;

  // 1. Fetch car details
  const car = await prisma.car.findUnique({
    where: { id: carId },
  });

  if (!car) {
    return notFound();
  }

  if (car.status !== 'AVAILABLE') {
    return redirect('/employee/dashboard');
  }

  // 2. Identify the logged-in employee securely via database session validation
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return redirect('/login');
  }
  const employeeId = user.firebaseUid;

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-2xl font-bold text-white">Vehicle Checkout</h1>
        <p className="text-slate-400 text-sm mt-1">
          Complete departure check for the {car.year} {car.make} {car.model}
        </p>
      </div>

      <CheckoutWizard car={car} employeeId={employeeId} />
    </div>
  );
}
