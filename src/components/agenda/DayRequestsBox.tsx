// 📄 src/components/agenda/DayRequestsBox.tsx
// =============================================================================
// CDC Manager — Agenda: pedidos para "o médico X no dia X"
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 17, Victor, 17 e 18/11): "para pacientes que ligam e
// querem o médico X no dia X (agenda ainda sem horário): quando surgir o
// horário, aparece um alerta da lista de espera", e "lista de espera para os
// dias com a agenda cheia, gerida pela receção".
//
// A receção regista o pedido (paciente, médico, dia). Cada pedido mostra o
// estado desse dia: ainda sem horário, agenda cheia ou JÁ HÁ VAGA. Os que
// têm vaga ficam em destaque, seja qual for o dia aberto na agenda, com o
// atalho para esse dia.
// =============================================================================

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import { addDayRequestAction, closeWaitlistAction } from '@/actions/waitlist';
import {
  DAY_REQUEST_STATE_LABEL,
  type DayRequestState,
} from '@/lib/waitlist';
import { usePatientSearch } from '@/components/agenda/usePatientSearch';
import { PatientSearchResult } from '@/components/pacientes/PatientSearchResult';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

export interface DayRequestEntry {
  id: string;
  patientName: string;
  phone: string | null;
  doctorName: string;
  dayLabel: string;
  note: string | null;
  state: DayRequestState;
  freeFrom: string | null;
  /** Abre a agenda nesse dia, filtrada pelo médico */
  dayHref: string;
}

const STATE_STYLE: Record<DayRequestState, { bg: string; fg: string }> = {
  free: { bg: '#E4F5EA', fg: '#125C32' },
  full: { bg: '#FDECEA', fg: '#8A1F17' },
  'no-schedule': { bg: '#E6E9F1', fg: '#4A5169' },
};

export function DayRequestsBox({
  entries,
  clinicId,
  doctors,
  date,
  minDate,
}: {
  entries: DayRequestEntry[];
  clinicId: string;
  doctors: { id: string; name: string }[];
  /** Dia aberto na agenda: o formulário abre com ele */
  date: string;
  minDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [day, setDay] = useState(date < minDate ? minDate : date);
  const [note, setNote] = useState('');
  const { patientQuery, setPatientQuery, patient, setPatient, patientResults, reset } =
    usePatientSearch();

  const free = entries.filter(e => e.state === 'free');
  const waiting = entries.filter(e => e.state !== 'free');

  const submit = () => {
    if (!patient || !doctorId || !day) {
      toast.error('Escolha o paciente, o médico e o dia.');
      return;
    }
    startTransition(async () => {
      const res = await addDayRequestAction({
        clinicId,
        patientId: patient.id,
        doctorId,
        date: day,
        note,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Pedido posto na lista de espera.');
      setAdding(false);
      setNote('');
      setDoctorId('');
      reset();
      router.refresh();
    });
  };
  const remove = (id: string, outcome: 'fulfilled' | 'cancelled') => {
    startTransition(async () => {
      const res = await closeWaitlistAction(id, outcome);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  };

  const row = (e: DayRequestEntry) => {
    const st = STATE_STYLE[e.state];
    return (
      <li key={e.id} style={{ fontSize: '12px', color: '#3D4257' }}>
        <div style={{ fontWeight: 600, color: '#141B33' }}>{e.patientName}</div>
        <div>
          {e.doctorName} · dia {e.dayLabel}
          {e.phone ? ` · ${e.phone}` : ''}
        </div>
        <span
          style={{
            display: 'inline-block',
            margin: '3px 0',
            padding: '1px 8px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: st.bg,
            color: st.fg,
          }}
        >
          {DAY_REQUEST_STATE_LABEL[e.state]}
          {e.state === 'free' && e.freeFrom ? ` a partir das ${e.freeFrom}` : ''}
        </span>
        {e.note && <div style={{ color: '#6A7186' }}>{e.note}</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
          <Link href={e.dayHref} style={{ fontWeight: 600, color: '#2743A6' }}>
            Abrir esse dia →
          </Link>
          <button
            type='button'
            disabled={pending}
            onClick={() => remove(e.id, 'fulfilled')}
            style={linkBtn('#125C32', pending)}
          >
            Já marcado
          </button>
          <button
            type='button'
            disabled={pending}
            onClick={() => remove(e.id, 'cancelled')}
            style={linkBtn('#B3261E', pending)}
          >
            Tirar da lista
          </button>
        </div>
      </li>
    );
  };

  return (
    <section
      aria-label='Pedidos para um dia'
      style={{
        backgroundColor: '#FFFFFF',
        border: free.length > 0 ? '2px solid #2E9B5B' : '1px solid #EEF1F8',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <details className='cdc-fold' open={free.length > 0 || adding}>
        <summary
          style={{
            padding: '11px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ChevronRight size={14} color='#1B2A6B' className='cdc-fold-chevron' />
          <strong style={{ fontSize: '13px', color: '#1B2A6B' }}>
            Pedidos para um dia
          </strong>
          <span
            style={{
              marginLeft: 'auto',
              minWidth: 22,
              padding: '1px 8px',
              borderRadius: '999px',
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              backgroundColor: free.length > 0 ? '#E4F5EA' : '#E6E9F1',
              color: free.length > 0 ? '#125C32' : '#4A5169',
            }}
            title={
              free.length > 0
                ? 'Pedidos que já têm vaga'
                : 'Pedidos à espera de horário'
            }
          >
            {free.length > 0 ? `${free.length} com vaga` : entries.length}
          </span>
        </summary>

        <div style={{ borderTop: '1px solid #EEF1F8', padding: '10px 14px' }}>
          {entries.length === 0 && !adding && (
            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6A7186' }}>
              O paciente quer um médico num dia que ainda não tem horário, ou
              que está cheio? Registe o pedido: a agenda avisa quando houver
              vaga.
            </p>
          )}
          {free.length > 0 && (
            <ul style={listStyle}>{free.map(row)}</ul>
          )}
          {waiting.length > 0 && (
            <ul
              style={{
                ...listStyle,
                marginTop: free.length > 0 ? 10 : 0,
                paddingTop: free.length > 0 ? 10 : 0,
                borderTop: free.length > 0 ? '1px solid #F3F5FA' : 'none',
              }}
            >
              {waiting.map(row)}
            </ul>
          )}

          {adding ? (
            <div
              style={{
                marginTop: entries.length > 0 ? 12 : 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ position: 'relative' }}>
                <Input
                  id='dr-patient'
                  label='Paciente *'
                  icon={<Search size={15} />}
                  value={patient ? patient.label : patientQuery}
                  onChange={e => {
                    setPatient(null);
                    setPatientQuery(e.target.value);
                  }}
                  placeholder='Nome, telemóvel ou n.º do paciente…'
                  autoComplete='off'
                />
                {patient && (
                  <button
                    type='button'
                    aria-label='Retirar o paciente'
                    onClick={() => reset()}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 30,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#6A7186',
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
                {patientResults.length > 0 && !patient && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 10,
                      marginTop: 4,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D8DEEF',
                      borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(27,42,107,0.12)',
                      overflow: 'hidden',
                    }}
                  >
                    {patientResults.map((r, i) => (
                      <PatientSearchResult
                        key={r.id}
                        hit={r}
                        first={i === 0}
                        onSelect={() => setPatient(r)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <Select
                id='dr-doctor'
                label='Médico *'
                value={doctorId}
                onChange={e => setDoctorId(e.target.value)}
              >
                <option value=''>— Escolher —</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Input
                id='dr-day'
                type='date'
                label='Dia pedido *'
                min={minDate}
                value={day}
                onChange={e => setDay(e.target.value)}
              />
              <Input
                id='dr-note'
                label='Observação'
                value={note}
                maxLength={300}
                onChange={e => setNote(e.target.value)}
                placeholder='ex.: só de manhã'
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => setAdding(false)}
                >
                  Cancelar
                </Button>
                <Button size='sm' loading={pending} onClick={submit}>
                  Guardar pedido
                </Button>
              </div>
            </div>
          ) : (
            <button
              type='button'
              onClick={() => setAdding(true)}
              style={{
                marginTop: entries.length > 0 ? 10 : 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px dashed #B9C3E0',
                borderRadius: '10px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#2743A6',
                backgroundColor: '#FBFCFF',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Pedido para um dia
            </button>
          )}
        </div>
      </details>
    </section>
  );
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const linkBtn = (color: string, pending: boolean): React.CSSProperties => ({
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: '12px',
  fontWeight: 600,
  color,
  cursor: pending ? 'wait' : 'pointer',
});
