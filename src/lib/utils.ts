import { FuelLevel } from '@prisma/client';

export function formatFuelLevel(level: FuelLevel | string | null | undefined): string {
  if (!level) return 'N/A';
  switch (level) {
    case 'FULL':
      return 'Full Tank';
    case 'THREE_QUARTERS':
      return '3/4 Tank';
    case 'HALF':
      return '1/2 Tank';
    case 'QUARTER':
      return '1/4 Tank';
    default:
      return String(level);
  }
}
