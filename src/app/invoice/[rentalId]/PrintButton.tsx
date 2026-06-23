'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function PrintButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Button 
      variant="primary" 
      size="sm" 
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5"
    >
      <Printer className="w-4 h-4" /> Print Invoice
    </Button>
  );
}
