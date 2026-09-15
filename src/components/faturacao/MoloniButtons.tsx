// 📄 src/components/faturacao/MoloniButtons.tsx
// CDC Manager — Fatura: emitir no Moloni / abrir PDF certificado (Fase 7A)
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FileBadge2, ExternalLink } from 'lucide-react';
import { emitInvoiceAction, moloniPdfLinkAction } from '@/actions/moloni';
import { Button } from '@/components/ui/Button';

export function MoloniButtons({
  invoiceId,
  emitted,
  ready,
}: {
  invoiceId: string;
  emitted: boolean;
  ready: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  return emitted ? (
    <Button
      size='sm'
      variant='outline'
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await moloniPdfLinkAction(invoiceId);
        setBusy(false);
        if (r.error || !r.url) toast.error(r.error ?? 'Sem PDF');
        else window.open(r.url, '_blank', 'noopener');
      }}
    >
      <ExternalLink size={14} style={{ marginRight: 6 }} /> PDF certificado
      (Moloni)
    </Button>
  ) : (
    <Button
      size='sm'
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await emitInvoiceAction(invoiceId);
        setBusy(false);
        if (r.error) toast.error(r.error);
        else {
          toast.success(`Emitida no Moloni: ${r.number}`);
          router.refresh();
        }
      }}
    >
      <FileBadge2 size={14} style={{ marginRight: 6 }} /> Emitir no Moloni
    </Button>
  );
}
