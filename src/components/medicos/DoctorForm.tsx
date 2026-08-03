// 📄 src/components/medicos/DoctorForm.tsx
// =============================================================================
// CDC Manager — Médicos: formulário partilhado (criar + editar)
// -----------------------------------------------------------------------------
// Inclui o EDITOR DE HORÁRIOS POR CLÍNICA — o componente central da gestão
// multi-clínica: por cada clínica ativa, um bloco com toggle "trabalha aqui",
// semana-tipo (Seg…Dom) com MÚLTIPLOS intervalos por dia (o "10–13 + 14–20"
// com pausa de almoço faz-se com o botão + Período), e flag de marcação
// online nessa clínica.
//
// A estrutura aninhada é serializada continuamente para um <input hidden>
// em JSON — exatamente o formato que validations/doctor.ts espera, incluindo
// a verificação de sobreposição entre clínicas, cuja mensagem legível
// aparece no erro do formulário.
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  createDoctorAction,
  updateDoctorAction,
  type DoctorFormState,
} from '@/actions/doctors';
import { SPECIALTIES, type Specialty } from '@/lib/domain';
import { SPECIALTY_LABEL, WEEKDAYS_DISPLAY } from '@/lib/labels';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

// -----------------------------------------------------------------------------
// Tipos do editor
// -----------------------------------------------------------------------------
interface DayRange {
  start: string;
  end: string;
}
interface ClinicState {
  enabled: boolean;
  bookableOnline: boolean;
  days: Record<number, DayRange[]>; // weekday → intervalos
}

export interface DoctorFormInitial {
  name: string;
  licenseNumber: string;
  specialties: string[];
  commissionPercent: string; // '' = default da clínica
  color: string;
  clinicSchedules: {
    clinicId: string;
    bookableOnline: boolean;
    weeklySchedule: { weekday: number; ranges: DayRange[] }[];
  }[];
}

const sectionTitle = {
  margin: '0 0 4px',
  fontSize: '13px',
  fontWeight: 700 as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: '#6A7186',
};

function emptyDays(): Record<number, DayRange[]> {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function DoctorForm({
  mode,
  doctorId,
  initial,
  clinics,
}: {
  mode: 'create' | 'edit';
  doctorId?: string;
  initial?: DoctorFormInitial;
  clinics: { id: string; name: string }[];
}) {
  const router = useRouter();

  // --- Estado do editor de horários -----------------------------------------
  const [schedules, setSchedules] = useState<Record<string, ClinicState>>(
    () => {
      const base: Record<string, ClinicState> = {};
      for (const c of clinics) {
        base[c.id] = {
          enabled: false,
          bookableOnline: true,
          days: emptyDays(),
        };
      }
      for (const cs of initial?.clinicSchedules ?? []) {
        const days = emptyDays();
        for (const w of cs.weeklySchedule) days[w.weekday] = [...w.ranges];
        base[cs.clinicId] = {
          enabled: true,
          bookableOnline: cs.bookableOnline,
          days,
        };
      }
      return base;
    },
  );

  const setClinic = (id: string, patch: Partial<ClinicState>) =>
    setSchedules(s => ({ ...s, [id]: { ...s[id], ...patch } }));

  const setDay = (id: string, weekday: number, ranges: DayRange[]) =>
    setSchedules(s => ({
      ...s,
      [id]: { ...s[id], days: { ...s[id].days, [weekday]: ranges } },
    }));

  // Serialização contínua → hidden input (formato do schema Zod)
  const schedulesJson = useMemo(() => {
    const out = clinics
      .filter(c => schedules[c.id]?.enabled)
      .map(c => ({
        clinicId: c.id,
        bookableOnline: schedules[c.id].bookableOnline,
        weeklySchedule: WEEKDAYS_DISPLAY.map(w => ({
          weekday: w.value,
          ranges: schedules[c.id].days[w.value].filter(r => r.start && r.end),
        })).filter(w => w.ranges.length > 0),
      }));
    return JSON.stringify(out);
  }, [schedules, clinics]);

  // --- Action ----------------------------------------------------------------
  const action =
    mode === 'edit' && doctorId
      ? updateDoctorAction.bind(null, doctorId)
      : createDoctorAction;
  const [state, formAction, pending] = useActionState<
    DoctorFormState,
    FormData
  >(action, undefined);

  const [manualCode, setManualCode] = useState<string | null>(null);
  const handled = useRef<DoctorFormState>(undefined);

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;

    if (state.conflictCount && state.conflictCount > 0 && state.warning) {
      toast(state.warning, { icon: '⚠️', duration: 8000 });
    } else if (state.warning) {
      toast(state.warning, { icon: '⚠️', duration: 6000 });
    }

    if (state.manualCode) {
      setManualCode(state.manualCode);
      return;
    }
    if (mode === 'create') {
      toast.success('Médico criado.');
      router.push(`/admin/medicos/${state.doctorId}`);
    } else {
      toast.success('Médico atualizado.');
      router.refresh();
    }
  }, [state, mode, router]);

  const closeManualCode = () => {
    const navId = state && 'success' in state ? state.doctorId : null;
    setManualCode(null);
    if (mode === 'create' && navId) router.push(`/admin/medicos/${navId}`);
    else router.refresh();
  };

  return (
    <>
      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        {/* --- Dados base ----------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Identificação</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
            }}
          >
            <Input
              id='name'
              name='name'
              label='Nome *'
              required
              minLength={3}
              defaultValue={initial?.name ?? ''}
              placeholder='Dr(a). Nome Apelido'
            />
            <Input
              id='licenseNumber'
              name='licenseNumber'
              label='Cédula profissional (OMD)'
              defaultValue={initial?.licenseNumber ?? ''}
            />
            <Input
              id='commissionRate'
              name='commissionRate'
              label='Comissão base do médico (%)'
              type='number'
              min={0}
              max={100}
              step={1}
              defaultValue={initial?.commissionPercent ?? ''}
              placeholder='vazio = default da clínica (40)'
              help='Fração que o MÉDICO recebe. Overrides por ato na página do médico.'
            />
            <div>
              <label
                htmlFor='color'
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#3A3F4A',
                  marginBottom: '6px',
                }}
              >
                Cor nas agendas
              </label>
              <input
                id='color'
                name='color'
                type='color'
                defaultValue={initial?.color ?? '#2743A6'}
                style={{
                  width: 56,
                  height: 38,
                  border: '1px solid #D8DEEF',
                  borderRadius: '8px',
                  padding: 2,
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                }}
              />
            </div>
          </div>
        </section>

        {/* --- Especialidades -------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          <h3 style={sectionTitle}>Especialidades *</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '8px',
            }}
          >
            {SPECIALTIES.map(s => (
              <Checkbox
                key={s}
                id={`sp-${s}`}
                name='specialties'
                value={s}
                label={SPECIALTY_LABEL[s as Specialty]}
                defaultChecked={initial?.specialties.includes(s) ?? false}
              />
            ))}
          </div>
        </section>

        {/* --- Editor de horários por clínica ---------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Horários por clínica *</h3>
          {clinics.map(c => {
            const cs = schedules[c.id];
            return (
              <div
                key={c.id}
                style={{
                  border: '1px solid #EEF1F8',
                  borderRadius: '10px',
                  padding: '16px',
                  backgroundColor: cs.enabled ? '#FFFFFF' : '#FAFBFE',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Checkbox
                    id={`clinic-${c.id}`}
                    label={`Trabalha em ${c.name}`}
                    checked={cs.enabled}
                    onChange={e =>
                      setClinic(c.id, { enabled: e.target.checked })
                    }
                  />
                  {cs.enabled && (
                    <Checkbox
                      id={`online-${c.id}`}
                      label='Aceita marcações online nesta clínica'
                      checked={cs.bookableOnline}
                      onChange={e =>
                        setClinic(c.id, { bookableOnline: e.target.checked })
                      }
                    />
                  )}
                </div>

                {cs.enabled && (
                  <div
                    style={{
                      marginTop: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {WEEKDAYS_DISPLAY.map(w => {
                      const ranges = cs.days[w.value];
                      return (
                        <div
                          key={w.value}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                          }}
                        >
                          <span
                            style={{
                              width: 76,
                              paddingTop: 8,
                              fontSize: '13px',
                              fontWeight: 600,
                              color: ranges.length ? '#1B2A6B' : '#9AA1B4',
                              flexShrink: 0,
                            }}
                          >
                            {w.label}
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              flex: 1,
                            }}
                          >
                            {ranges.length === 0 && (
                              <span
                                style={{
                                  fontSize: '13px',
                                  color: '#9AA1B4',
                                  paddingTop: 8,
                                }}
                              >
                                Folga — clique em + Período para definir o
                                horário
                              </span>
                            )}
                            {ranges.map((r, i) => (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                }}
                              >
                                <input
                                  type='time'
                                  value={r.start}
                                  onChange={e => {
                                    const next = [...ranges];
                                    next[i] = { ...r, start: e.target.value };
                                    setDay(c.id, w.value, next);
                                  }}
                                  style={{
                                    border: '1px solid #D8DEEF',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    fontSize: '13px',
                                    color: '#1B2A6B',
                                  }}
                                />
                                <span style={{ color: '#9AA1B4' }}>–</span>
                                <input
                                  type='time'
                                  value={r.end}
                                  onChange={e => {
                                    const next = [...ranges];
                                    next[i] = { ...r, end: e.target.value };
                                    setDay(c.id, w.value, next);
                                  }}
                                  style={{
                                    border: '1px solid #D8DEEF',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    fontSize: '13px',
                                    color: '#1B2A6B',
                                  }}
                                />
                                <button
                                  type='button'
                                  aria-label='Remover período'
                                  onClick={() =>
                                    setDay(
                                      c.id,
                                      w.value,
                                      ranges.filter((_, j) => j !== i),
                                    )
                                  }
                                  style={{
                                    display: 'inline-flex',
                                    padding: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#B3261E',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            ))}
                            <button
                              type='button'
                              onClick={() =>
                                setDay(c.id, w.value, [
                                  ...ranges,
                                  { start: '', end: '' },
                                ])
                              }
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                alignSelf: 'flex-start',
                                border: 'none',
                                background: 'transparent',
                                color: '#2743A6',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '2px 0',
                              }}
                            >
                              <Plus size={14} />
                              Período
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '12px',
                        color: '#9AA1B4',
                      }}
                    >
                      Cada período é um bloco de trabalho (das X às Y). Para
                      pausa de almoço, adicione dois períodos: 10:00–13:00 e
                      14:00–20:00 → almoço 13h–14h.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          <input type='hidden' name='clinicSchedules' value={schedulesJson} />
        </section>

        {/* --- Conta de acesso (só na criação) --------------------------------- */}
        {mode === 'create' && (
          <section
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <h3 style={sectionTitle}>Conta de acesso</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
              }}
            >
              <Input
                id='email'
                name='email'
                type='email'
                label='Email do médico'
                placeholder='medico@exemplo.pt'
              />
            </div>
            <Checkbox
              id='sendActivationInvite'
              name='sendActivationInvite'
              label='Enviar convite de ativação por email'
              help='O médico recebe um código para definir a password e aceder à sua área.'
            />
          </section>
        )}

        {/* Erro (inclui a mensagem de sobreposição entre clínicas) */}
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

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button type='submit' loading={pending}>
            {mode === 'create' ? 'Criar médico' : 'Guardar alterações'}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {/* Modal: código para envio manual */}
      <Modal
        open={manualCode !== null}
        onClose={closeManualCode}
        title='Enviar código manualmente'
        footer={<Button onClick={closeManualCode}>Continuar</Button>}
      >
        <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#3A3F4A' }}>
          O email do convite não foi entregue. Envie este código ao médico — uso
          único, válido 7 dias:
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            backgroundColor: '#F4F6FB',
            border: '1px solid #D8DEEF',
            borderRadius: '10px',
            padding: '14px 16px',
          }}
        >
          <code
            style={{
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '2px',
              color: '#1B2A6B',
            }}
          >
            {manualCode}
          </code>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              if (manualCode) {
                navigator.clipboard.writeText(manualCode);
                toast.success('Código copiado.');
              }
            }}
          >
            <Copy size={14} style={{ marginRight: 4 }} />
            Copiar
          </Button>
        </div>
      </Modal>
    </>
  );
}
