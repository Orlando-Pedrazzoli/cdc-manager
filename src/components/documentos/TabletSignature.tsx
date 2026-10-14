// 📄 src/components/documentos/TabletSignature.tsx
// =============================================================================
// CDC Manager — Receção: "Enviar para o tablet" (3.ª reunião, out/2026)
// -----------------------------------------------------------------------------
// Bloco reutilizável dentro dos modais que recolhem assinatura (RGPD na
// ficha, Emitir documento). Em vez de o paciente assinar no ecrã da
// receção, o pedido vai para o tablet da clínica:
//   1. carrega os tablets ligados (listTabletsAction); sem nenhum, não aparece
//   2. "Enviar para o tablet {clínica}" → onCreate(clinicId) cria o pedido
//   3. polling de 3 s até signed / cancelled / expired; "Cancelar pedido"
//   4. signed → onSigned() (o modal fecha e a ficha atualiza)
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import { TabletSmartphone, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  listTabletsAction,
  getSignatureRequestStatusAction,
  cancelSignatureRequestAction,
  type TabletOption,
  type SignatureRequestState,
} from '@/actions/signature-requests';
import { Button } from '@/components/ui/Button';

const POLL_MS = 3000;

export function TabletSignature({
  onCreate,
  onSigned,
  disabled,
}: {
  /** Cria o pedido para a clínica escolhida (RGPD ou modelo) */
  onCreate: (
    clinicId: string,
  ) => Promise<{ error?: string; request?: SignatureRequestState }>;
  onSigned: (documentId: string | null) => void;
  disabled?: boolean;
}) {
  const [tablets, setTablets] = useState<TabletOption[] | null>(null);
  const [clinicId, setClinicId] = useState('');
  const [request, setRequest] = useState<SignatureRequestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listTabletsAction().then(t => {
      if (!alive) return;
      setTablets(t);
      if (t.length === 1) setClinicId(t[0].clinicId);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Polling enquanto o pedido está pendente
  useEffect(() => {
    if (!request || request.status !== 'pending') return;
    const id = request.id;
    const t = setInterval(async () => {
      const r = await getSignatureRequestStatusAction(id);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.request) {
        setRequest(r.request);
        if (r.request.status === 'signed') onSigned(r.request.documentId);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [request, onSigned]);

  if (!tablets || tablets.length === 0) return null;

  const send = async () => {
    if (!clinicId) return;
    setBusy(true);
    setError(null);
    const r = await onCreate(clinicId);
    setBusy(false);
    if (r.error || !r.request) {
      setError(r.error ?? 'Erro ao enviar para o tablet.');
      return;
    }
    setRequest(r.request);
  };

  const cancel = async () => {
    if (!request) return;
    setBusy(true);
    await cancelSignatureRequestAction(request.id);
    setBusy(false);
    setRequest(null);
  };

  const tablet = tablets.find(t => t.clinicId === clinicId);
  const box: React.CSSProperties = {
    borderRadius: 10,
    border: '1px dashed #C9D2EE',
    backgroundColor: '#F8F9FD',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };

  // --- Pedido em curso / terminado ---------------------------------------------
  if (request) {
    const pending = request.status === 'pending';
    return (
      <div style={box} aria-live='polite'>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pending ? (
            <Loader2
              size={16}
              className='animate-spin'
              color={tablet?.color ?? '#2743A6'}
            />
          ) : request.status === 'signed' ? (
            <CheckCircle2 size={16} color='#0F7B4D' />
          ) : (
            <XCircle size={16} color='#B3261E' />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2A6B' }}>
            {pending
              ? `À espera da assinatura no tablet ${tablet?.label ?? ''}…`
              : request.status === 'signed'
                ? 'Assinado no tablet — documento guardado.'
                : request.status === 'expired'
                  ? 'O pedido expirou (30 min) sem assinatura.'
                  : 'Pedido cancelado.'}
          </span>
        </div>
        {request.lastError && (
          <span style={{ fontSize: 12, color: '#B3261E' }}>
            {request.lastError}
          </span>
        )}
        {pending ? (
          <div>
            <Button size='sm' variant='outline' onClick={cancel} loading={busy}>
              Cancelar pedido
            </Button>
          </div>
        ) : request.status !== 'signed' ? (
          <div>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setRequest(null)}
            >
              Tentar de novo
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  // --- Escolher tablet + enviar -------------------------------------------------
  return (
    <div style={box}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <TabletSmartphone size={16} color='#2743A6' />
        <span style={{ fontSize: 13, color: '#3D4257' }}>
          Ou o paciente assina no <strong>tablet</strong> ao balcão:
        </span>
        {tablets.length > 1 && (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            {tablets.map(t => {
              const active = t.clinicId === clinicId;
              return (
                <button
                  key={t.clinicId}
                  type='button'
                  onClick={() => setClinicId(t.clinicId)}
                  aria-pressed={active}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: `1px solid ${t.color}`,
                    backgroundColor: active ? t.color : '#FFFFFF',
                    color: active ? '#FFFFFF' : t.color,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </span>
        )}
        <Button
          size='sm'
          onClick={send}
          loading={busy}
          disabled={disabled || !clinicId}
          style={
            tablet
              ? {
                  backgroundColor: tablet.color,
                  border: `1px solid ${tablet.color}`,
                }
              : undefined
          }
        >
          <TabletSmartphone size={14} style={{ marginRight: 6 }} />
          Enviar para o tablet{tablet ? ` ${tablet.label}` : ''}
        </Button>
      </div>
      {error && <span style={{ fontSize: 12, color: '#B3261E' }}>{error}</span>}
    </div>
  );
}
