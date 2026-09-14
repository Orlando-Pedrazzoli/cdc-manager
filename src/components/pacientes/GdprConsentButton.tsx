// 📄 src/components/pacientes/GdprConsentButton.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: botão RGPD (Fase 3, P10)
// -----------------------------------------------------------------------------
// "Conter botão para RGPD". Abre o texto do consentimento (GDPR_CONSENT_TEXT)
// e recolhe a assinatura no ecrã (SignaturePad — o mesmo do consentimento
// RX). A action cria o Document 'consent' com o texto congelado e marca a
// ficha como assinada. Se já estiver assinado, o botão mostra a data e
// permite recolher nova assinatura (ex.: texto atualizado).
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { signGdprConsentAction } from '@/actions/patients';
import { GDPR_CONSENT_TEXT } from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SignaturePad } from '@/components/clinico/SignaturePad';

export function GdprConsentButton({
  patientId,
  signedAtLabel,
}: {
  patientId: string;
  signedAtLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!signature) return;
    setBusy(true);
    const res = await signGdprConsentAction({
      patientId,
      signatureDataUrl: signature,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Consentimento RGPD assinado e guardado nos Documentos.');
    setOpen(false);
    setSignature(null);
    router.refresh();
  };

  return (
    <>
      <Button
        variant={signedAtLabel ? 'outline' : 'secondary'}
        onClick={() => setOpen(true)}
        title={
          signedAtLabel
            ? `Assinado em ${signedAtLabel}`
            : 'Recolher consentimento RGPD'
        }
      >
        <ShieldCheck
          size={15}
          style={{
            marginRight: 6,
            color: signedAtLabel ? '#0F7B4D' : undefined,
          }}
        />
        {signedAtLabel ? `RGPD ✓ ${signedAtLabel}` : 'RGPD'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title='Consentimento RGPD'
        maxWidth={640}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              maxHeight: 260,
              overflowY: 'auto',
              border: '1px solid #EEF1F8',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '12.5px',
              lineHeight: 1.5,
              color: '#3D4257',
              whiteSpace: 'pre-wrap',
              backgroundColor: '#F8F9FD',
            }}
          >
            {GDPR_CONSENT_TEXT}
          </div>
          <div>
            <p
              style={{
                margin: '0 0 6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1B2A6B',
              }}
            >
              Assinatura do paciente (ou representante legal)
            </p>
            <SignaturePad onChange={setSignature} height={150} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              loading={busy}
              disabled={!signature}
              onClick={submit}
            >
              Guardar consentimento
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
