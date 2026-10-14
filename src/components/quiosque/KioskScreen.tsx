// 📄 src/components/quiosque/KioskScreen.tsx
// =============================================================================
// CDC Manager — Tablet de assinatura: ecrã do paciente
// -----------------------------------------------------------------------------
// Três estados, sempre em ecrã inteiro e sem navegação:
//   · não ligado   — instruções para o admin (ligação de Configurações)
//   · à espera     — logo + nome da clínica; polling de 3 s por pedidos
//   · pedido       — nome do paciente, texto a assinar (scroll), assinatura
//                    grande, "Confirmar e assinar" → obrigado (4 s) → espera
// Enquanto mostra um pedido continua a verificar (5 s) se a receção o
// cancelou — nesse caso volta à espera sem o paciente ter de fazer nada.
// Tipografia grande e alvos de toque de 56 px: Lenovo Tab M11 (11", 4 GB).
// =============================================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PenLine, ShieldCheck, CheckCircle2, Link2Off } from 'lucide-react';
import {
  kioskStateAction,
  kioskSignAction,
  type KioskState,
} from '@/actions/signature-requests';
import { SignaturePad } from '@/components/clinico/SignaturePad';

const POLL_IDLE_MS = 3000;
const POLL_BUSY_MS = 5000;
const THANKS_MS = 4000;

export function KioskScreen({ initial }: { initial: KioskState }) {
  const [state, setState] = useState<KioskState>(initial);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  // Evita que uma resposta atrasada do polling reabra um pedido já assinado
  const signedIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await kioskStateAction();
      if (s.request && s.request.id === signedIdRef.current) return;
      setState(prev => {
        // Mudou de pedido → assinatura e erro recomeçam do zero
        if (prev.request?.id !== s.request?.id) {
          setSignature(null);
          setError(null);
        }
        return s;
      });
    } catch {
      /* rede instável: tenta no próximo ciclo */
    }
  }, []);

  useEffect(() => {
    if (thanks) return;
    const ms = state.request ? POLL_BUSY_MS : POLL_IDLE_MS;
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
  }, [state.request, thanks, refresh]);

  const sign = async () => {
    if (!state.request || !signature) return;
    setBusy(true);
    setError(null);
    const res = await kioskSignAction({
      requestId: state.request.id,
      signatureDataUrl: signature,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    signedIdRef.current = state.request.id;
    setThanks(true);
    setState(s => ({ ...s, request: null }));
    setSignature(null);
    setTimeout(() => {
      setThanks(false);
      void refresh();
    }, THANKS_MS);
  };

  const color = state.clinic?.color ?? '#1B2A6B';

  // --- Não ligado --------------------------------------------------------------
  if (!state.linked) {
    return (
      <Shell color='#6A7186'>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <Link2Off size={56} color='#9AA1B4' />
          <h1 style={{ fontSize: 28, color: '#1B2A6B', margin: '18px 0 10px' }}>
            Tablet não ligado
          </h1>
          <p style={{ fontSize: 17, color: '#6A7186', lineHeight: 1.5 }}>
            Peça à administração a ligação de ativação em
            <br />
            <strong>Configurações → Clínicas → Ligar tablet</strong> e abra-a
            neste dispositivo.
          </p>
        </div>
      </Shell>
    );
  }

  // --- Obrigado ------------------------------------------------------------------
  if (thanks) {
    return (
      <Shell color={color}>
        <div style={{ textAlign: 'center' }}>
          <CheckCircle2 size={88} color='#0F7B4D' />
          <h1 style={{ fontSize: 34, color: '#1B2A6B', margin: '18px 0 8px' }}>
            Obrigado!
          </h1>
          <p style={{ fontSize: 19, color: '#6A7186' }}>
            A sua assinatura foi registada.
          </p>
        </div>
      </Shell>
    );
  }

  // --- À espera ------------------------------------------------------------------
  if (!state.request) {
    return (
      <Shell color={color}>
        <div style={{ textAlign: 'center' }}>
          {state.org?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.org.logoUrl}
              alt={state.org.name}
              style={{ maxHeight: 96, maxWidth: 280, objectFit: 'contain' }}
            />
          ) : (
            <ShieldCheck size={72} color={color} />
          )}
          <h1 style={{ fontSize: 30, color: '#1B2A6B', margin: '22px 0 6px' }}>
            {state.org?.name ?? 'Clínica'}
          </h1>
          <p style={{ fontSize: 18, color, fontWeight: 700, margin: 0 }}>
            {state.clinic?.name}
          </p>
          <p style={{ fontSize: 16, color: '#9AA1B4', marginTop: 28 }}>
            Aguarde — a receção vai enviar o documento para assinar.
          </p>
        </div>
      </Shell>
    );
  }

  // --- Pedido para assinar -------------------------------------------------------
  const r = state.request;
  return (
    <Shell color={color} align='stretch'>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          height: '100%',
          minHeight: 0,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: color,
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {r.kind === 'gdpr' ? (
              <ShieldCheck size={24} />
            ) : (
              <PenLine size={24} />
            )}
          </span>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: '#6A7186',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontWeight: 700,
              }}
            >
              {state.clinic?.name}
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                color: '#1B2A6B',
                lineHeight: 1.25,
              }}
            >
              {r.title}
            </h1>
          </div>
        </header>

        <p style={{ margin: 0, fontSize: 17, color: '#3D4257' }}>
          Paciente:{' '}
          <strong style={{ color: '#1B2A6B' }}>{r.patientName}</strong>
          <span style={{ color: '#9AA1B4' }}>
            {' '}
            — leia o documento e assine no espaço em baixo.
          </span>
        </p>

        {/* Texto a assinar (scroll próprio; o tablet não faz scroll de página) */}
        <div
          style={{
            flex: '1 1 0',
            minHeight: 140,
            overflowY: 'auto',
            border: '1px solid #E3E8F5',
            borderRadius: 14,
            padding: '16px 18px',
            fontSize: 16,
            lineHeight: 1.55,
            color: '#3D4257',
            whiteSpace: 'pre-wrap',
            backgroundColor: '#FFFFFF',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {r.body}
        </div>

        <div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 15,
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Assinatura do paciente ou representante legal
          </p>
          {/* key: cada pedido começa com o canvas limpo e redimensionado */}
          <SignaturePad key={r.id} onChange={setSignature} height={200} />
        </div>

        {error && (
          <p
            role='alert'
            style={{
              margin: 0,
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: '#FDEDED',
              color: '#B3261E',
              fontSize: 15,
            }}
          >
            {error}
          </p>
        )}

        <button
          type='button'
          onClick={sign}
          disabled={!signature || busy}
          style={{
            height: 60,
            borderRadius: 14,
            border: 'none',
            backgroundColor: signature && !busy ? color : '#C9D2EE',
            color: '#FFFFFF',
            fontSize: 19,
            fontWeight: 800,
            cursor: signature && !busy ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          {busy ? 'A registar…' : 'Confirmar e assinar'}
        </button>
      </div>
    </Shell>
  );
}

/** Moldura de ecrã inteiro com a cor da clínica no topo */
function Shell({
  color,
  align = 'center',
  children,
}: {
  color: string;
  align?: 'center' | 'stretch';
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F4F6FB',
        borderTop: `8px solid ${color}`,
        overflow: 'hidden',
        touchAction: 'manipulation',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: align === 'center' ? 'center' : 'stretch',
          justifyContent: 'center',
          padding: '20px 24px 24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 860,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: align === 'center' ? 'center' : 'stretch',
            alignItems: align === 'center' ? 'center' : 'stretch',
          }}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
