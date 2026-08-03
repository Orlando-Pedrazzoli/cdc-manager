// 📄 src/components/clinico/AnamneseForm.tsx
// =============================================================================
// CDC Manager — Clínico: Anamnese estruturada (Client Component)
// -----------------------------------------------------------------------------
// A secção de saúde da ficha clínica, editável pelo médico:
//   · ALERGIAS e MEDICAÇÃO como chips (adicionar/remover) — vermelho para
//     alergias: são o alerta de segurança nº 1 e alimentam o banner da
//     consulta
//   · CONDIÇÕES SISTÉMICAS como checklist clínica (lib/domain) com campo de
//     detalhe por condição marcada
//   · Fumador sim/não/não perguntado + notas livres
//
// Os arrays viajam em hidden inputs JSON (padrão do projeto, ver
// clinicSchedules no DoctorForm). Gravação substitui a secção inteira —
// a anamnese é o RETRATO ATUAL de saúde (o histórico de notas é que é
// append-only).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import {
  updateAnamnesisAction,
  type ConsultationActionState,
} from '@/actions/procedures';
import {
  SYSTEMIC_CONDITIONS,
  SYSTEMIC_CONDITION_LABEL,
  type SystemicCondition,
} from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';

export interface AnamnesisData {
  allergies: string[];
  currentMedications: string[];
  systemicConditions: { condition: string; detail: string | null }[];
  smoker: boolean | null;
  anamnesisNotes: string | null;
  updatedAtLabel: string | null; // "há 3 dias por Dr. X" (server formata)
}

// --- Chips editáveis ----------------------------------------------------------
function ChipListEditor({
  label,
  items,
  onChange,
  accent,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  accent: 'danger' | 'neutral';
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const colors =
    accent === 'danger'
      ? { bg: '#F6E4E3', fg: '#B3261E', border: '#E5B9B5' }
      : { bg: '#E4EBFF', fg: '#1B2A6B', border: '#C9D4FF' };

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some(i => i.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  };

  return (
    <div>
      <p
        style={{
          margin: '0 0 6px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#3D4257',
        }}
      >
        {label}
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: '8px',
        }}
      >
        {items.length === 0 && (
          <span style={{ fontSize: '13px', color: '#9AA1B4' }}>
            — Nenhuma registada —
          </span>
        )}
        {items.map(item => (
          <span
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '999px',
              padding: '3px 6px 3px 12px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: colors.bg,
              color: colors.fg,
              border: `1px solid ${colors.border}`,
            }}
          >
            {item}
            <button
              type='button'
              onClick={() => onChange(items.filter(i => i !== item))}
              aria-label={`Remover ${item}`}
              style={{
                display: 'inline-flex',
                border: 'none',
                background: 'transparent',
                color: colors.fg,
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button type='button' variant='secondary' onClick={add}>
          <Plus size={14} style={{ marginRight: 4 }} />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

// --- Form principal ------------------------------------------------------------
export function AnamneseForm({
  patientId,
  initial,
}: {
  patientId: string;
  initial: AnamnesisData;
}) {
  const [allergies, setAllergies] = useState<string[]>(initial.allergies);
  const [medications, setMedications] = useState<string[]>(
    initial.currentMedications,
  );
  const [conditions, setConditions] = useState<
    { condition: string; detail: string | null }[]
  >(initial.systemicConditions);
  const [smoker, setSmoker] = useState<string>(
    initial.smoker === true ? 'yes' : initial.smoker === false ? 'no' : '',
  );

  const [state, action, pending] = useActionState<
    ConsultationActionState,
    FormData
  >(updateAnamnesisAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) toast.success('Anamnese gravada');
  }, [state]);

  const toggleCondition = (c: SystemicCondition) => {
    setConditions(prev =>
      prev.some(x => x.condition === c)
        ? prev.filter(x => x.condition !== c)
        : [...prev, { condition: c, detail: null }],
    );
  };
  const setDetail = (c: string, detail: string) => {
    setConditions(prev =>
      prev.map(x => (x.condition === c ? { ...x, detail: detail || null } : x)),
    );
  };

  const box: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '18px 20px',
  };

  return (
    <form
      action={action}
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <input type='hidden' name='patientId' value={patientId} />
      <input type='hidden' name='allergies' value={JSON.stringify(allergies)} />
      <input
        type='hidden'
        name='currentMedications'
        value={JSON.stringify(medications)}
      />
      <input
        type='hidden'
        name='systemicConditions'
        value={JSON.stringify(conditions)}
      />
      <input type='hidden' name='smoker' value={smoker} />

      {/* Alergias + medicação */}
      <div
        style={{
          ...box,
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <ChipListEditor
          label='⚠️ Alergias (destacadas em todas as consultas)'
          items={allergies}
          onChange={setAllergies}
          accent='danger'
          placeholder='ex.: Penicilina'
        />
        <ChipListEditor
          label='Medicação atual'
          items={medications}
          onChange={setMedications}
          accent='neutral'
          placeholder='ex.: Varfarina 5mg'
        />
      </div>

      {/* Condições sistémicas */}
      <div style={box}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#3D4257',
          }}
        >
          Condições sistémicas
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '8px 16px',
          }}
        >
          {SYSTEMIC_CONDITIONS.map(c => {
            const entry = conditions.find(x => x.condition === c);
            return (
              <div key={c}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: '#1B2A6B',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type='checkbox'
                    checked={!!entry}
                    onChange={() => toggleCondition(c)}
                    style={{ width: 15, height: 15, accentColor: '#2743A6' }}
                  />
                  {SYSTEMIC_CONDITION_LABEL[c]}
                </label>
                {entry && (
                  <input
                    value={entry.detail ?? ''}
                    onChange={e => setDetail(c, e.target.value)}
                    placeholder='Detalhe (ex.: tipo 2, controlada)'
                    style={{
                      marginTop: '4px',
                      width: '100%',
                      border: '1px solid #D8DEEF',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      color: '#3D4257',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fumador + notas */}
      <div
        style={{
          ...box,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#3D4257',
            }}
          >
            Fumador
          </p>
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { v: 'yes', l: 'Sim' },
              { v: 'no', l: 'Não' },
              { v: '', l: 'Não perguntado' },
            ].map(o => (
              <label
                key={o.v}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  color: '#1B2A6B',
                  cursor: 'pointer',
                }}
              >
                <input
                  type='radio'
                  name='smoker-radio'
                  checked={smoker === o.v}
                  onChange={() => setSmoker(o.v)}
                  style={{ accentColor: '#2743A6' }}
                />
                {o.l}
              </label>
            ))}
          </div>
        </div>
        <Textarea
          name='anamnesisNotes'
          label='Notas da anamnese'
          rows={3}
          defaultValue={initial.anamnesisNotes ?? ''}
          placeholder='Outras informações de saúde relevantes…'
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
          {initial.updatedAtLabel ?? 'Anamnese ainda não preenchida.'}
        </span>
        <Button type='submit' disabled={pending}>
          {pending ? 'A gravar…' : 'Gravar anamnese'}
        </Button>
      </div>
    </form>
  );
}
