// 📄 src/components/listagens/PrintButton.tsx
// CDC Manager — Listagens: imprimir (o CSS @media print em globals.css só
// mostra a área .print-area)
'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function PrintButton() {
  return (
    <Button size='sm' variant='outline' onClick={() => window.print()}>
      <Printer size={14} style={{ marginRight: 6 }} />
      Imprimir
    </Button>
  );
}
