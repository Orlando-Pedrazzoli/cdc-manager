// 📄 src/components/configuracoes/ClinicSettingsForm.tsx
// =============================================================================
// CDC Manager — Configurações: Clínica (dados + políticas + horários)
// -----------------------------------------------------------------------------
// Dois formulários independentes por clínica:
//   1. Dados & políticas  → updateClinicAction
//   2. Horário de funcionamento → updateClinicHoursAction
//
// REGRA DE OURO (visível na UI): gravar horários NUNCA altera marcações
// existentes. A action devolve quantas marcações futuras ficam fora do novo
// horário e este componente mostra o aviso persistente — remarcar é decisão
// humana, na agenda, caso a caso.
//
// UX: formulários de settings gravam e FICAM na página (toast + refresh) —
// o aviso de conflitos tem de continuar visível depois de gravar; não há
// "voltar" natural dentro de um separador de Configurações.
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import {
  updateClinicAction,
  updateClinicHoursAction,
  type SettingsActionState,
} from '@/actions/settings';
import { WEEKDAYS_DISPLAY } from '@/lib/labels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Checkbox } from '@/components/ui/Input';

interface DayRange {
  start: string;
  end: string;
}

// Forma serializada vinda do server (page.tsx faz o mapeamento)
export interface ClinicSettings {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  nipc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  maxConcurrentAppointments: number;
  onlineMinNoticeHours: number;
  onlineMaxAdvanceDays: number;
  cancellationMinNoticeHours: number;
  bookableOnline: boolean;
  /** Fração (0.40) — o form apresenta em percentagem */
  defaultDoctorCommission: number;
  openingHours: { weekday: number; ranges: DayRange[] }[];
}

const cardStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '20px',
} as const;

const sectionTitleStyle = {
  margin: 0,
  fontSize: '15px',
  fontWeight: 700,
  color: '#1C2233',
} as const;

const timeInputStyle = {
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  padding: '6px 8px',
  fontSize: '13px',
  color: '#1B2A6B',
} as const;

// =============================================================================
// 1. Dados & políticas
// =============================================================================
function ClinicDataForm({ clinic }: { clinic: ClinicSettings }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    SettingsActionState,
    FormData
  >(updateClinicAction, undefined);
  const handled = useRef<SettingsActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) {
      toast.success('Dados da clínica gravados', { duration: 5000 });
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} style={cardStyle}>
      <input type='hidden' name='clinicId' value={clinic.id} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={sectionTitleStyle}>Dados & políticas</h3>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <Input
              id={`${clinic.slug}-name`}
              name='name'
              label='Nome da clínica'
              defaultValue={clinic.name}
              required
              maxLength={120}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              id={`${clinic.slug}-legal`}
              name='legalName'
              label='Denominação social'
              defaultValue={clinic.legalName ?? ''}
              maxLength={160}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ width: 160 }}>
            <Input
              id={`${clinic.slug}-nipc`}
              name='nipc'
              label='NIPC'
              defaultValue={clinic.nipc ?? ''}
              placeholder='—'
              inputMode='numeric'
              maxLength={9}
              help='Validado com dígito de controlo'
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              id={`${clinic.slug}-address`}
              name='address'
              label='Morada'
              defaultValue={clinic.address ?? ''}
              maxLength={240}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <Input
              id={`${clinic.slug}-phone`}
              name='phone'
              label='Telefone'
              defaultValue={clinic.phone ?? ''}
              maxLength={30}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              id={`${clinic.slug}-email`}
              name='email'
              label='Email'
              type='email'
              defaultValue={clinic.email ?? ''}
            />
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid #F4F6FB',
            paddingTop: '14px',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ width: 130 }}>
            <Input
              id={`${clinic.slug}-cap`}
              name='maxConcurrentAppointments'
              label='Capacidade'
              type='number'
              min={1}
              max={20}
              defaultValue={clinic.maxConcurrentAppointments}
              required
              help='Consultas em simultâneo'
            />
          </div>
          <div style={{ width: 150 }}>
            <Input
              id={`${clinic.slug}-notice`}
              name='onlineMinNoticeHours'
              label='Antecedência (h)'
              type='number'
              min={0}
              max={168}
              defaultValue={clinic.onlineMinNoticeHours}
              required
              help='Mínima p/ marcar online'
            />
          </div>
          <div style={{ width: 150 }}>
            <Input
              id={`${clinic.slug}-advance`}
              name='onlineMaxAdvanceDays'
              label='Horizonte (dias)'
              type='number'
              min={1}
              max={365}
              defaultValue={clinic.onlineMaxAdvanceDays}
              required
              help='Máximo p/ marcar online'
            />
          </div>
          <div style={{ width: 160 }}>
            <Input
              id={`${clinic.slug}-cancel`}
              name='cancellationMinNoticeHours'
              label='Cancelamento (h)'
              type='number'
              min={0}
              max={168}
              defaultValue={clinic.cancellationMinNoticeHours}
              required
              help='Antecedência mínima'
            />
          </div>
          <div style={{ width: 150 }}>
            <Input
              id={`${clinic.slug}-commission`}
              name='defaultDoctorCommission'
              label='Comissão default (%)'
              type='number'
              min={0}
              max={100}
              defaultValue={Math.round(clinic.defaultDoctorCommission * 100)}
              required
              help='Só execuções futuras'
            />
          </div>
        </div>

        <Checkbox
          id={`${clinic.slug}-online`}
          name='bookableOnline'
          label='Aceita marcações online (formulário público)'
          defaultChecked={clinic.bookableOnline}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type='submit' variant='primary' disabled={pending}>
            {pending ? 'A gravar…' : 'Gravar dados'}
          </Button>
        </div>
      </div>
    </form>
  );
}

// =============================================================================
// 2. Horário de funcionamento
// =============================================================================
function ClinicHoursForm({ clinic }: { clinic: ClinicSettings }) {
  const router = useRouter();

  // Estado local: os 7 dias sempre presentes (vazio = encerrado)
  const [days, setDays] = useState<Record<number, DayRange[]>>(() => {
    const init: Record<number, DayRange[]> = {};
    for (const w of WEEKDAYS_DISPLAY) init[w.value] = [];
    for (const d of clinic.openingHours) init[d.weekday] = [...d.ranges];
    return init;
  });

  const setDay = (weekday: number, ranges: DayRange[]) =>
    setDays(s => ({ ...s, [weekday]: ranges }));

  // Serialização p/ o campo hidden — 7 dias obrigatórios, ranges incompletos
  // (ainda a preencher) ficam de fora
  const serialized = useMemo(
    () =>
      JSON.stringify(
        WEEKDAYS_DISPLAY.map(w => ({
          weekday: w.value,
          ranges: days[w.value].filter(r => r.start && r.end),
        })),
      ),
    [days],
  );

  const [state, action, pending] = useActionState<
    SettingsActionState,
    FormData
  >(updateClinicHoursAction, undefined);
  const handled = useRef<SettingsActionState>(undefined);
  const [conflictInfo, setConflictInfo] = useState<{
    count: number;
    samples: string[];
  } | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) {
      toast.error(state.error, { duration: 7000 });
      return;
    }
    if ('success' in state) {
      const conflicts = state.conflicts ?? 0;
      if (conflicts > 0) {
        setConflictInfo({
          count: conflicts,
          samples: state.conflictSamples ?? [],
        });
        toast(
          `Horário gravado — ${conflicts} ${
            conflicts === 1 ? 'marcação futura fica' : 'marcações futuras ficam'
          } fora do novo horário`,
          { icon: '⚠️', duration: 8000 },
        );
      } else {
        setConflictInfo(null);
        toast.success('Horário gravado', { duration: 5000 });
      }
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} style={cardStyle}>
      <input type='hidden' name='clinicId' value={clinic.id} />
      <input type='hidden' name='openingHours' value={serialized} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <h3 style={sectionTitleStyle}>Horário de funcionamento</h3>
          <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
            Sem períodos = encerrado
          </span>
        </div>

        {/* Regra de ouro, sempre visível */}
        <div
          style={{
            backgroundColor: '#EAF0FF',
            border: '1px solid #C9D6F5',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#2743A6',
          }}
        >
          Alterar o horário nunca cancela nem move marcações existentes — o novo
          horário aplica-se a marcações futuras. Se alguma ficar de fora, é
          avisado aqui e remarca-se na agenda.
        </div>

        {/* Aviso de conflitos devolvido pela action (persiste após gravar) */}
        {conflictInfo && (
          <div
            style={{
              backgroundColor: '#FEF3E0',
              border: '1px solid #F2D9AE',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '13px',
              color: '#B06000',
            }}
          >
            {conflictInfo.count === 1
              ? '1 marcação futura fica fora do novo horário'
              : `${conflictInfo.count} marcações futuras ficam fora do novo horário`}
            {conflictInfo.samples.length > 0 && (
              <> (ex.: {conflictInfo.samples.join(' · ')})</>
            )}
            . Nada foi alterado — reveja na agenda e remarque se necessário.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {WEEKDAYS_DISPLAY.map(w => {
            const ranges = days[w.value];
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
                    paddingTop: 7,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: ranges.length ? '#1B2A6B' : '#9AA1B4',
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
                        paddingTop: 7,
                      }}
                    >
                      Encerrado
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
                          setDay(w.value, next);
                        }}
                        style={timeInputStyle}
                      />
                      <span style={{ color: '#9AA1B4' }}>–</span>
                      <input
                        type='time'
                        value={r.end}
                        onChange={e => {
                          const next = [...ranges];
                          next[i] = { ...r, end: e.target.value };
                          setDay(w.value, next);
                        }}
                        style={timeInputStyle}
                      />
                      <button
                        type='button'
                        aria-label='Remover período'
                        onClick={() =>
                          setDay(
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
                      setDay(w.value, [...ranges, { start: '', end: '' }])
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
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type='submit' variant='primary' disabled={pending}>
            {pending ? 'A gravar…' : 'Gravar horário'}
          </Button>
        </div>
      </div>
    </form>
  );
}

// =============================================================================
// Painel completo de uma clínica
// =============================================================================
export function ClinicSettingsForm({ clinic }: { clinic: ClinicSettings }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '17px',
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          {clinic.name}
        </h2>
        <Badge variant='neutral'>{clinic.slug}</Badge>
      </div>
      <ClinicDataForm clinic={clinic} />
      <ClinicHoursForm clinic={clinic} />
    </div>
  );
}
