// 📄 src/components/odontograma-notas/TreatmentNotesClient.tsx
// =============================================================================
// CDC Manager — Notas do tratamento: lista, nova nota e arquivar (ponto 32)
// =============================================================================

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { NotebookPen } from 'lucide-react';
import {
  addTreatmentNoteAction,
  archiveTreatmentNoteAction,
} from '@/actions/treatment-notes';
import { TREATMENT_NOTE_MAX, cleanTreatmentNote } from '@/lib/treatment-notes';
import { Button } from '@/components/ui/Button';

export interface TreatmentNoteItem {
  id: string;
  text: string;
  author: string;
  when: string;
  /** "Arquivada a … por …" ou null */
  archived: string | null;
}

export function TreatmentNotesClient({
  patientId,
  active,
  archived,
}: {
  patientId: string;
  active: TreatmentNoteItem[];
  archived: TreatmentNoteItem[];
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [pending, startTransition] = useTransition();
  const check = cleanTreatmentNote(text);

  const add = () =>
    startTransition(async () => {
      const r = await addTreatmentNoteAction({ patientId, text });
      if ('error' in r) {
        toast.error(r.error);
        return;
      }
      toast.success('Nota guardada');
      setText('');
      router.refresh();
    });
  const archive = (noteId: string) =>
    startTransition(async () => {
      const r = await archiveTreatmentNoteAction({ noteId });
      if ('error' in r) {
        toast.error(r.error);
        return;
      }
      toast.success('Nota arquivada');
      router.refresh();
    });

  return (
    <section
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: 14,
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: '15px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          <NotebookPen size={16} />
          Notas do tratamento
          {active.length > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6A7186' }}>
              ({active.length})
            </span>
          )}
        </h2>
        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#6A7186' }}>
          Para combinar procedimentos ou deixar uma observação sobre o
          tratamento, sem a pôr num orçamento. Vista pela gestão, pela receção
          e pelos médicos do paciente.
        </p>
      </div>

      {active.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#9AA1B4' }}>
          Sem notas por tratar.
        </p>
      ) : (
        active.map(n => (
          <div
            key={n.id}
            style={{
              borderLeft: '3px solid #2743A6',
              backgroundColor: '#F6F8FD',
              borderRadius: 8,
              padding: '9px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                data-keep-case
                style={{
                  margin: 0,
                  fontSize: '13.5px',
                  color: '#1C2233',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {n.text}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#6A7186' }}>
                {n.author} · {n.when}
              </p>
            </div>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={pending}
              onClick={() => archive(n.id)}
            >
              Arquivar
            </Button>
          </div>
        ))
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          htmlFor='treatment-note-text'
          style={{ fontSize: '12px', fontWeight: 600, color: '#3D4257' }}
        >
          Nova nota
        </label>
        <textarea
          id='treatment-note-text'
          data-keep-case
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          maxLength={TREATMENT_NOTE_MAX + 200}
          placeholder='ex.: combinado com o Dr. X fazer a coroa do 36 depois da endodontia'
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid #D8DEEF',
            borderRadius: 9,
            padding: '8px 10px',
            fontSize: '13.5px',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: '11.5px',
              color:
                text.trim() !== '' && 'error' in check ? '#B3261E' : '#9AA1B4',
            }}
          >
            {text.trim() !== '' && 'error' in check
              ? check.error
              : `${text.trim().length} / ${TREATMENT_NOTE_MAX}`}
          </span>
          <Button
            type='button'
            size='sm'
            disabled={pending || 'error' in check}
            onClick={add}
          >
            {pending ? 'A guardar…' : 'Guardar nota'}
          </Button>
        </div>
      </div>

      {archived.length > 0 && (
        <div>
          <button
            type='button'
            onClick={() => setShowArchived(v => !v)}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              fontSize: '12px',
              fontWeight: 600,
              color: '#2743A6',
              cursor: 'pointer',
            }}
          >
            {showArchived ? 'Esconder' : 'Ver'} notas arquivadas ({archived.length})
          </button>
          {showArchived &&
            archived.map(n => (
              <div
                key={n.id}
                style={{
                  marginTop: 8,
                  borderLeft: '3px solid #D8DEEF',
                  padding: '4px 12px',
                }}
              >
                <p
                  data-keep-case
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#6A7186',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {n.text}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#9AA1B4' }}>
                  {n.author} · {n.when} · {n.archived}
                </p>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
