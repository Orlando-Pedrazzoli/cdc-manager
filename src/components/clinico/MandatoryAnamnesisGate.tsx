// 📄 src/components/clinico/MandatoryAnamnesisGate.tsx
// =============================================================================
// CDC Manager — Anamnese obrigatória ao chamar o paciente (5.ª ronda/04)
// -----------------------------------------------------------------------------
// Victor, nov. 2026: "Quando o médico chama da sala de espera um paciente sem
// anamnese, a ficha abre automaticamente e só fecha depois de preenchidos os
// campos obrigatórios." E a revisão anual: "com mais de 12 meses, abre com as
// respostas anteriores para o médico rever e confirmar."
//
// Janela que NÃO se fecha (sem X, Escape e clique fora não fazem nada): a
// única saída é "Guardar anamnese", que só fica ativo com os campos
// obrigatórios todos a verde. Ao guardar, a página da consulta recarrega e a
// janela deixa de ser desenhada (o servidor já não devolve motivo).
// =============================================================================

'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck } from 'lucide-react';
import type { QuestionnaireData } from '@/lib/anamnesis';
import { AnamnesisQuestionnaire } from '@/components/clinico/AnamnesisQuestionnaire';

const subscribeNoop = () => () => {};

const REASON_TEXT: Record<'missing' | 'expired' | 'incomplete', { title: string; lead: string }> = {
  missing: {
    title: 'Anamnese em falta',
    lead: 'Este paciente ainda não tem anamnese. Preencha os campos obrigatórios (*) para continuar a consulta.',
  },
  expired: {
    title: 'Revisão anual da anamnese',
    lead: 'A anamnese tem mais de 12 meses. Estão abaixo as respostas anteriores — reveja com o paciente, corrija o que mudou e confirme.',
  },
  incomplete: {
    title: 'Anamnese incompleta',
    lead: 'Faltam respostas obrigatórias (*) na anamnese deste paciente. Complete-as para continuar a consulta.',
  },
};

export function MandatoryAnamnesisGate({
  reason,
  patientId,
  patientName,
  initial,
  isMinor,
}: {
  reason: 'missing' | 'expired' | 'incomplete';
  patientId: string;
  patientName: string;
  /** Respostas anteriores (revisão anual / ficha incompleta) */
  initial: QuestionnaireData | null;
  isMinor: boolean;
}) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // Página por trás sem scroll enquanto a janela está aberta
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;
  const text = REASON_TEXT[reason];

  return createPortal(
    <div
      role='dialog'
      aria-modal='true'
      aria-label={text.title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(27, 42, 107, 0.55)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow: '0 20px 50px rgba(27, 42, 107, 0.3)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #EEF1F8',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <ClipboardCheck size={22} style={{ color: '#9A6700', flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1B2A6B' }}>
              {text.title} — {patientName}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#3D4257', lineHeight: 1.45 }}>
              {text.lead} Os restantes campos são opcionais.
            </p>
          </div>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          <AnamnesisQuestionnaire
            mode='doctor'
            patientId={patientId}
            initial={initial}
            isMinor={isMinor}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
