// 📄 src/components/faturacao/MoloniButtons.tsx
// CDC Manager — Fatura: emitir no Moloni / abrir PDF certificado (Fase 7A)
// 25/11: emite a FATURA e os RECIBOS dos pagamentos (nunca fatura-recibo);
// se faltar o recibo de algum pagamento, mostra "Emitir recibo".
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FileBadge2, ExternalLink } from 'lucide-react';
import { emitInvoiceAction, moloniPdfLinkAction } from '@/actions/moloni';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function MoloniButtons({
  invoiceId,
  emitted,
  ready,
  missingReceipts = 0,
  summary = [],
}: {
  invoiceId: string;
  emitted: boolean;
  ready: boolean;
  /** pagamentos registados ainda sem recibo no Moloni */
  missingReceipts?: number;
  /** 5.ª ronda/05: resumo do documento para confirmar antes de emitir */
  summary?: { label: string; value: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // 5.ª ronda/05 (Victor): confirmação antes de emitir — um documento
  // certificado não se apaga, só se anula com nota de crédito
  const [confirming, setConfirming] = useState(false);
  if (!ready) return null;
  return emitted ? (
    <>
    {missingReceipts > 0 && (
      <Button
        size='sm'
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await emitInvoiceAction(invoiceId);
          setBusy(false);
          if (r.error) toast.error(r.error);
          else {
            toast.success(`Recibo emitido no Moloni: ${r.number}`);
            router.refresh();
          }
        }}
      >
        <FileBadge2 size={14} style={{ marginRight: 6 }} /> Emitir recibo
        {missingReceipts > 1 ? `s (${missingReceipts})` : ''}
      </Button>
    )}
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
    </>
  ) : (
    <>
      <Button size='sm' disabled={busy} onClick={() => setConfirming(true)}>
        <FileBadge2 size={14} style={{ marginRight: 6 }} /> Emitir no Moloni
      </Button>
      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title='Emitir documento fiscal'
        maxWidth={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#3D4257', lineHeight: 1.5 }}>
            Confirme os dados. É emitida a fatura e, para cada pagamento já
            registado, o respetivo recibo. Depois de emitido, o documento é
            certificado e não pode ser apagado — só anulado (no próprio dia)
            ou corrigido com nota de crédito.
          </p>
          {summary.length > 0 && (
            <div
              style={{
                border: '1px solid #C9D6F5',
                backgroundColor: '#F4F7FF',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: '13px',
              }}
            >
              {summary.map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: '#6A7186' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: '#1C2233', textAlign: 'right' }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size='sm' variant='outline' disabled={busy} onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
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
                  if (r.warning) toast.error(r.warning);
                  setConfirming(false);
                  router.refresh();
                }
              }}
            >
              Confirmar e emitir
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
