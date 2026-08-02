// 📄 src/components/medicos/DoctorExceptions.tsx
// =============================================================================
// CDC Manager — Médicos: exceções de agenda (férias / dia especial)
// -----------------------------------------------------------------------------
// Lista as exceções existentes (com remoção) e adiciona novas:
//   - Indisponível (férias/baixa) — âmbito 'ambas as clínicas' ou só uma
//   - Horário especial — um intervalo start–end nessa data (serializado
//     para o campo hidden 'ranges' em JSON, como o schema espera)
// O aviso de conflitos (marcações futuras afetadas) vem da action e sai
// em toast destacado — nada é remarcado automaticamente.
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CalendarOff, Trash2 } from 'lucide-react';
import {
  addDoctorExceptionAction,
  removeDoctorExceptionAction,
  type DoctorFormState,
} from '@/actions/doctors';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export interface ExceptionRow {
  date: string;
  clinicId: string | null;
  type: 'unavailable' | 'custom';
  ranges: { start: string; end: string }[];
  reason: string | null;
}

export function DoctorExceptions({
  doctorId,
  clinics,
  exceptions,
}: {
  doctorId: string;
  clinics: { id: string; name: string }[];
  exceptions: ExceptionRow[];
}) {
  const router = useRouter();
  const clinicName = (id: string | null) =>
    id ? (clinics.find(c => c.id === id)?.name ?? '?') : 'Ambas as clínicas';

  // --- Adicionar -------------------------------------------------------------
  const [type, setType] = useState<'unavailable' | 'custom'>('unavailable');
  const [range, setRange] = useState({ start: '', end: '' });
  const action = addDoctorExceptionAction.bind(null, doctorId);
  const [state, formAction, pending] = useActionState<
    DoctorFormState,
    FormData
  >(action, undefined);
  const handled = useRef<DoctorFormState>(undefined);

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;
    if (state.warning) toast(state.warning, { icon: '⚠️', duration: 8000 });
    toast.success('Exceção adicionada.');
    setRange({ start: '', end: '' });
    router.refresh();
  }, [state, router]);

  const remove = async (date: string, clinicId: string | null) => {
    const res = await removeDoctorExceptionAction(doctorId, date, clinicId);
    if (res.error) toast.error(res.error);
    else {
      toast.success('Exceção removida.');
      router.refresh();
    }
  };

  const rangesJson =
    type === 'custom' && range.start && range.end
      ? JSON.stringify([range])
      : '[]';

  const sorted = [...exceptions].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Formulário de nova exceção */}
      <form
        action={formAction}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          alignItems: 'end',
        }}
      >
        <Input id='ex-date' name='date' type='date' label='Data *' required />
        <Select id='ex-clinic' name='clinicId' label='Âmbito' defaultValue=''>
          <option value=''>Ambas as clínicas</option>
          {clinics.map(c => (
            <option key={c.id} value={c.id}>
              Só {c.name}
            </option>
          ))}
        </Select>
        <Select
          id='ex-type'
          name='type'
          label='Tipo'
          value={type}
          onChange={e => setType(e.target.value as 'unavailable' | 'custom')}
        >
          <option value='unavailable'>Indisponível (férias/baixa)</option>
          <option value='custom'>Horário especial</option>
        </Select>
        {type === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <Input
              id='ex-start'
              type='time'
              label='Das'
              value={range.start}
              onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
              required
            />
            <Input
              id='ex-end'
              type='time'
              label='Às'
              value={range.end}
              onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
              required
            />
          </div>
        )}
        <Input
          id='ex-reason'
          name='reason'
          label='Motivo (opcional)'
          maxLength={200}
          placeholder='Férias, congresso…'
        />
        <input type='hidden' name='ranges' value={rangesJson} />
        <Button type='submit' loading={pending}>
          <CalendarOff size={15} style={{ marginRight: 6 }} />
          Adicionar
        </Button>
      </form>

      {state && 'error' in state && (
        <p
          style={{
            margin: 0,
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '14px',
            backgroundColor: '#FDEDED',
            color: '#B3261E',
          }}
        >
          {state.error}
        </p>
      )}

      {/* Lista */}
      {sorted.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#9AA1B4' }}>
          Sem exceções registadas.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sorted.map(e => (
            <div
              key={`${e.date}|${e.clinicId ?? 'all'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                border: '1px solid #EEF1F8',
                borderRadius: '10px',
                padding: '10px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <strong style={{ color: '#1B2A6B', fontSize: '14px' }}>
                  {e.date.split('-').reverse().join('/')}
                </strong>
                {e.type === 'unavailable' ? (
                  <Badge variant='danger'>Indisponível</Badge>
                ) : (
                  <Badge variant='warning'>
                    {e.ranges.map(r => `${r.start}–${r.end}`).join(', ')}
                  </Badge>
                )}
                <Badge variant='neutral'>{clinicName(e.clinicId)}</Badge>
                {e.reason && (
                  <span style={{ fontSize: '13px', color: '#6A7186' }}>
                    {e.reason}
                  </span>
                )}
              </div>
              <button
                type='button'
                aria-label='Remover exceção'
                onClick={() => remove(e.date, e.clinicId)}
                style={{
                  display: 'inline-flex',
                  padding: 6,
                  border: 'none',
                  background: 'transparent',
                  color: '#B3261E',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
