// 📄 src/components/clinico/DoctorAnamnesisPanel.tsx
// =============================================================================
// CDC Manager — Ficha do médico: separador Anamnese (Fase 3B)
// -----------------------------------------------------------------------------
// Ordem pensada para o médico ("anamnese de fácil acesso", P12):
//   1. Estado (em falta / desatualizada / por validar / válida) + Validar
//   2. Leitura compacta do que o paciente/receção preencheu
//   3. Ficha completa (colapsada) para preencher/atualizar
//   4. Observações privadas (só médicos — P12)
//   5. Resumo clínico rápido (alergias/medicação/condições — já existia)
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import {
  reviewQuestionnaireAction,
  saveDoctorPrivateNotesAction,
  type AnamnesisActionState,
} from '@/actions/anamnesis';
import type { QuestionnaireData } from '@/lib/anamnesis';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { AnamnesisQuestionnaire } from '@/components/clinico/AnamnesisQuestionnaire';
import { AnamnesisReadView } from '@/components/clinico/AnamnesisReadView';

export function DoctorAnamnesisPanel({
  patientId,
  data,
  needsReview,
  isMinor,
  privateNotes,
  children,
}: {
  patientId: string;
  data: QuestionnaireData | null;
  needsReview: boolean;
  isMinor: boolean;
  privateNotes: string | null;
  /** Resumo clínico rápido (AnamneseForm existente) */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(data == null);
  const [reviewing, setReviewing] = useState(false);

  const [notesState, notesAction, notesPending] = useActionState<
    AnamnesisActionState,
    FormData
  >(saveDoctorPrivateNotesAction, undefined);
  const handled = useRef<AnamnesisActionState>(undefined);
  useEffect(() => {
    if (!notesState || notesState === handled.current) return;
    handled.current = notesState;
    if ('error' in notesState) toast.error(notesState.error);
    else toast.success('Observações privadas guardadas.');
  }, [notesState]);

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '16px 18px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {needsReview && (
        <div
          style={{
            ...card,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: '#EEF2FF',
          }}
        >
          <span style={{ flex: 1, fontSize: '13.5px', color: '#2743A6' }}>
            O paciente preencheu a ficha no portal. Reveja as respostas e
            valide.
          </span>
          <Button
            size='sm'
            loading={reviewing}
            onClick={async () => {
              setReviewing(true);
              const r = await reviewQuestionnaireAction(patientId);
              setReviewing(false);
              if (r.error) toast.error(r.error);
              else {
                toast.success('Anamnese validada.');
                router.refresh();
              }
            }}
          >
            Validar anamnese
          </Button>
        </div>
      )}

      {data && (
        <div style={card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: '#1B2A6B',
              }}
            >
              Ficha de anamnese — resumo
            </h3>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setEditing(e => !e)}
            >
              {editing ? (
                <ChevronUp size={14} style={{ marginRight: 4 }} />
              ) : (
                <ChevronDown size={14} style={{ marginRight: 4 }} />
              )}
              {editing ? 'Fechar ficha completa' : 'Abrir ficha completa'}
            </Button>
          </div>
          <AnamnesisReadView data={data} />
        </div>
      )}

      {editing && (
        <div style={card}>
          <h3
            style={{
              margin: '0 0 12px',
              fontSize: '15px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            {data
              ? 'Atualizar ficha de anamnese'
              : 'Preencher ficha de anamnese'}
          </h3>
          <AnamnesisQuestionnaire
            mode='doctor'
            patientId={patientId}
            initial={data}
            isMinor={isMinor}
            onSaved={() => setEditing(false)}
          />
        </div>
      )}

      {/* Observações só para médicos (P12) */}
      <form action={notesAction} style={{ ...card, borderColor: '#D8DEEF' }}>
        <input type='hidden' name='patientId' value={patientId} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Lock size={15} color='#6A7186' />
          <h3
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Observações gerais — só médicos
          </h3>
          <span style={{ fontSize: '12px', color: '#6A7186' }}>
            invisível para receção, administração e portal
          </span>
        </div>
        <Textarea
          name='doctorPrivateNotes'
          rows={4}
          maxLength={3000}
          defaultValue={privateNotes ?? ''}
          placeholder='ex.: paciente ansioso, prefere anestesia sem vasoconstritor; sensível a comentários sobre a estética…'
        />
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}
        >
          <Button type='submit' size='sm' loading={notesPending}>
            Guardar observações
          </Button>
        </div>
      </form>

      {children}
    </div>
  );
}