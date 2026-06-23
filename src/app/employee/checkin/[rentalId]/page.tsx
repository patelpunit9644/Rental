import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import CheckinWizard from './CheckinWizard';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ rentalId: string }>;
}

export default async function CheckinPage({ params }: PageProps) {
  const { rentalId } = await params;

  // 1. Fetch rental details along with the car
  const rental = await prisma.rental.findUnique({
    where: { id: rentalId },
    include: {
      car: true,
      employee: true,
    },
  });

  if (!rental) {
    return notFound();
  }

  // Allow returning active or overdue rentals
  if (rental.status !== 'ACTIVE' && rental.status !== 'OVERDUE') {
    return redirect('/employee/dashboard');
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-2xl font-bold text-white">Vehicle Return Check-In</h1>
        <p className="text-slate-400 text-sm mt-1">
          Complete check-in details for the {rental.car.year} {rental.car.make} {rental.car.model}
        </p>
      </div>

      <CheckinWizard rental={rental} />
    </div>
  );
}
