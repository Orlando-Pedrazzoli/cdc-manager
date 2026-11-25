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
//
// AVISOS DE CAMPOS INCORRETOS: o formulário valida no browser antes de enviar
// (as mesmas regras do servidor — lib/doctor-form-errors.ts) e mostra TODOS os
// problemas de uma vez: resumo no topo (cada linha leva ao campo), mensagem
// junto de cada campo e, nos horários, junto da clínica e do dia. O envio é
// feito por onSubmit + startTransition (e não por <form action>), porque o
// React limpa os campos de um <form action> quando a action termina — com um
// erro, o utilizador perdia tudo o que tinha escrito.
// =============================================================================

'use client';

import {
  startTransition,
  useActionState,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertCircle, Copy, Plus, Trash2 } from 'lucide-react';
import {
  createDoctorAction,
  updateDoctorAction,
  type DoctorFormState,
} from '@/actions/doctors';
import {
  DOCTOR_FIELDS,
  DOCTOR_FIELD_LABEL,
  countDoctorFormErrors,
  doctorErrorsSummary,
  doctorFormRaw,
  emptyDoctorFormErrors,
  validateCreateDoctor,
  validateUpdateDoctor,
  type DoctorField,
  type DoctorFormErrors,
  type DoctorScheduleError,
} from '@/lib/doctor-form-errors';
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
  /** 5.ª ronda/07: weekday → data de referência do turno quinzenal */
  biweekly: Record<number, string | null>;
}

export interface DoctorFormInitial {
  name: string;
  /** 9.ª ronda/19: nome completo para documentos */
  fullName?: string;
  licenseNumber: string;
  /** 8.ª ronda/09 */
  birthDate?: string;
  specialties: string[];
  commissionPercent: string; // '' = default da clínica
  monthlyGoalEuros: string; // '' = sem objetivo (E18)
  color: string;
  clinicSchedules: {
    clinicId: string;
    bookableOnline: boolean;
    weeklySchedule: {
      weekday: number;
      ranges: DayRange[];
      biweeklyAnchor?: string | null;
    }[];
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

/** Próxima data (hoje incluído) que calha no dia da semana indicado */
function nextDateOfWeekday(weekday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const ERROR_COLOR = '#B3261E';
const errorText = { margin: 0, fontSize: '12px', color: ERROR_COLOR };

/** Onde fica cada campo no ecrã (o resumo dos erros leva lá) */
const FIELD_TARGET: Record<DoctorField, string> = {
  name: 'name',
  fullName: 'fullName',
  licenseNumber: 'licenseNumber',
  birthDate: 'birthDate',
  commissionRate: 'commissionRate',
  monthlyGoalCents: 'monthlyGoalCents',
  color: 'color',
  specialties: 'specialties-section',
  email: 'email',
};

function goTo(targetId: string) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

function emptyDays(): Record<number, DayRange[]> {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function DoctorForm({
  mode,
  doctorId,
  initial,
  clinics,
  showFinancials = true,
}: {
  mode: 'create' | 'edit';
  doctorId?: string;
  initial?: DoctorFormInitial;
  clinics: { id: string; name: string }[];
  /** Comissão base e objetivo mensal — só administração (as actions de
   *  gravação já são admin-only; aqui evita-se mostrar os valores). */
  showFinancials?: boolean;
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
          biweekly: {},
        };
      }
      for (const cs of initial?.clinicSchedules ?? []) {
        const days = emptyDays();
        const biweekly: Record<number, string | null> = {};
        for (const w of cs.weeklySchedule) {
          days[w.weekday] = [...w.ranges];
          biweekly[w.weekday] = w.biweeklyAnchor ?? null;
        }
        base[cs.clinicId] = {
          enabled: true,
          bookableOnline: cs.bookableOnline,
          days,
          biweekly,
        };
      }
      return base;
    },
  );

  // --- Erros do formulário (validação no browser + resposta do servidor) ----
  const [errors, setErrors] = useState<DoctorFormErrors | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const showErrors = (found: DoctorFormErrors) => {
    setErrors(found);
    // id fixo: um novo aviso substitui o anterior em vez de empilhar
    toast.error(doctorErrorsSummary(found), { id: 'doctor-form-errors' });
    // Depois de o resumo estar no ecrã: trazê-lo à vista e dar-lhe o foco
    requestAnimationFrame(() => {
      summaryRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      summaryRef.current?.focus({ preventScroll: true });
    });
  };

  /** O aviso de um campo sai assim que o utilizador mexe nele */
  const clearFieldError = (field: DoctorField) =>
    setErrors(e => {
      if (!e?.fields[field]) return e;
      const fields = { ...e.fields };
      delete fields[field];
      return { ...e, fields };
    });

  /** Mexer no horário de uma clínica limpa os avisos dessa clínica e os gerais */
  const clearScheduleErrors = (clinicId: string) =>
    setErrors(e => {
      if (!e || e.schedule.length === 0) return e;
      return {
        ...e,
        schedule: e.schedule.filter(
          x => x.clinicId !== null && x.clinicId !== clinicId,
        ),
      };
    });

  const setClinic = (id: string, patch: Partial<ClinicState>) => {
    clearScheduleErrors(id);
    setSchedules(s => ({ ...s, [id]: { ...s[id], ...patch } }));
  };

  const setDay = (id: string, weekday: number, ranges: DayRange[]) => {
    clearScheduleErrors(id);
    setSchedules(s => ({
      ...s,
      [id]: { ...s[id], days: { ...s[id].days, [weekday]: ranges } },
    }));
  };

  const setBiweekly = (id: string, weekday: number, anchor: string | null) => {
    clearScheduleErrors(id);
    setSchedules(s => ({
      ...s,
      [id]: { ...s[id], biweekly: { ...s[id].biweekly, [weekday]: anchor } },
    }));
  };

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
          biweeklyAnchor: schedules[c.id].biweekly[w.value] || null,
        })).filter(w => w.ranges.length > 0),
      }));
    return JSON.stringify(out);
  }, [schedules, clinics]);

  // --- Action ----------------------------------------------------------------
  const action =
    mode === 'edit' && doctorId
      ? updateDoctorAction.bind(null, doctorId)
      : createDoctorAction;
  const [manualCode, setManualCode] = useState<string | null>(null);

  // Efeitos do resultado (avisos, código manual, navegação) no próprio
  // callback da action — sem useEffect a observar `state`
  const [state, formAction, pending] = useActionState<
    DoctorFormState,
    FormData
  >(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result) return result;
    if ('error' in result) {
      showErrors(
        result.formErrors ?? { fields: {}, schedule: [], form: result.error },
      );
      return result;
    }
    setErrors(null);

    if (result.conflictCount && result.conflictCount > 0 && result.warning) {
      toast(result.warning, { icon: '⚠️', duration: 8000 });
    } else if (result.warning) {
      toast(result.warning, { icon: '⚠️', duration: 6000 });
    }

    if (result.manualCode) {
      setManualCode(result.manualCode);
      return result;
    }
    if (mode === 'create') {
      toast.success('Médico criado.');
      router.push(`/admin/medicos/${result.doctorId}`);
    } else {
      toast.success('Médico atualizado.');
      router.refresh();
    }
    return result;
  }, undefined);

  // --- Envio: valida no browser e só depois chama o servidor -----------------
  /** Períodos com só uma das horas preenchida (o JSON enviado ignora-os) */
  const incompletePeriods = (): DoctorScheduleError[] => {
    const found: DoctorScheduleError[] = [];
    for (const c of clinics) {
      const cs = schedules[c.id];
      if (!cs?.enabled) continue;
      for (const w of WEEKDAYS_DISPLAY) {
        if (cs.days[w.value].some(r => !r.start || !r.end)) {
          found.push({
            clinicId: c.id,
            weekday: w.value,
            message:
              'Período incompleto — preencha a hora de início e a de fim, ou remova-o.',
          });
        }
      }
    }
    return found;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(e.currentTarget);
    const raw = doctorFormRaw(formData);
    const result =
      mode === 'edit' ? validateUpdateDoctor(raw) : validateCreateDoctor(raw);
    const found = result.ok ? emptyDoctorFormErrors() : result.errors;

    const incomplete = incompletePeriods();
    if (incomplete.length > 0) {
      // O período incompleto já explica porque a clínica "não tem horário"
      const withIncomplete = new Set(incomplete.map(x => x.clinicId));
      found.schedule = [
        ...incomplete,
        ...found.schedule.filter(
          x => !(x.weekday === null && withIncomplete.has(x.clinicId)),
        ),
      ];
    }

    if (countDoctorFormErrors(found) > 0) {
      showErrors(found);
      return;
    }
    setErrors(null);
    startTransition(() => formAction(formData));
  };

  // --- Erros prontos a mostrar ----------------------------------------------
  const fieldError = (f: DoctorField) => errors?.fields[f];
  const weekdayLabel = (weekday: number) =>
    WEEKDAYS_DISPLAY.find(w => w.value === weekday)?.label ?? '';
  const generalScheduleErrors =
    errors?.schedule.filter(x => x.clinicId === null) ?? [];
  const clinicErrors = (clinicId: string) =>
    errors?.schedule.filter(
      x => x.clinicId === clinicId && x.weekday === null,
    ) ?? [];
  const dayErrors = (clinicId: string, weekday: number) =>
    errors?.schedule.filter(
      x => x.clinicId === clinicId && x.weekday === weekday,
    ) ?? [];

  const summaryItems: {
    key: string;
    label: string;
    message: string;
    target: string;
  }[] = [];
  if (errors) {
    for (const f of DOCTOR_FIELDS) {
      const message = errors.fields[f];
      if (message) {
        summaryItems.push({
          key: f,
          label: DOCTOR_FIELD_LABEL[f],
          message,
          target: FIELD_TARGET[f],
        });
      }
    }
    errors.schedule.forEach((x, i) => {
      const clinicName = clinics.find(c => c.id === x.clinicId)?.name;
      const where = [
        'Horários',
        clinicName,
        x.weekday !== null ? weekdayLabel(x.weekday) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      summaryItems.push({
        key: `schedule-${i}`,
        label: where,
        message: x.message,
        target:
          x.clinicId && clinicName
            ? `clinic-block-${x.clinicId}`
            : 'schedules-section',
      });
    });
  }
  const errorCount = errors ? countDoctorFormErrors(errors) : 0;

  const closeManualCode = () => {
    const navId = state && 'success' in state ? state.doctorId : null;
    setManualCode(null);
    if (mode === 'create' && navId) router.push(`/admin/medicos/${navId}`);
    else router.refresh();
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        // Os avisos são os nossos (em português, junto ao campo) — sem os
        // balões nativos do browser, que só mostram um campo de cada vez
        noValidate
        onChange={e => {
          // o evento vem do campo alterado (delegação no <form>)
          const name = (e.target as unknown as { name?: string }).name ?? '';
          if ((DOCTOR_FIELDS as readonly string[]).includes(name)) {
            clearFieldError(name as DoctorField);
          }
          // marcar/desmarcar o convite muda se o email é obrigatório
          if (name === 'sendActivationInvite') clearFieldError('email');
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        {/* --- Resumo do que falta corrigir ----------------------------------- */}
        {errors && errorCount > 0 && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role='alert'
            style={{
              borderRadius: '10px',
              border: `1px solid ${ERROR_COLOR}`,
              backgroundColor: '#FDEDED',
              padding: '14px 16px',
              outline: 'none',
            }}
          >
            <p
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 700,
                color: ERROR_COLOR,
              }}
            >
              <AlertCircle size={16} />
              {mode === 'create'
                ? 'O profissional ainda não foi criado.'
                : 'As alterações ainda não foram guardadas.'}{' '}
              {errorCount === 1
                ? 'Falta corrigir 1 ponto:'
                : `Faltam corrigir ${errorCount} pontos:`}
            </p>
            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '13px',
                color: '#3A3F4A',
              }}
            >
              {summaryItems.map(item => (
                <li key={item.key}>
                  <button
                    type='button'
                    onClick={() => goTo(item.target)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      font: 'inherit',
                      fontWeight: 700,
                      color: ERROR_COLOR,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                  {' — '}
                  {item.message}
                </li>
              ))}
              {errors.form && <li>{errors.form}</li>}
            </ul>
          </div>
        )}

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
              error={fieldError('name')}
              aria-invalid={fieldError('name') ? true : undefined}
            />
            {/* 9.ª ronda/19: é este o nome que sai nos atestados e relatórios */}
            <Input
              id='fullName'
              name='fullName'
              label='Nome completo (documentos)'
              maxLength={160}
              defaultValue={initial?.fullName ?? ''}
              placeholder='Nome completo, como na cédula'
              error={fieldError('fullName')}
              aria-invalid={fieldError('fullName') ? true : undefined}
              help='Sai nos atestados, relatórios e consentimentos. Vazio: usa-se o nome acima.'
            />
            <Input
              id='licenseNumber'
              name='licenseNumber'
              label='N.º da OMD (cédula profissional)'
              inputMode='numeric'
              pattern='\d{1,10}'
              defaultValue={initial?.licenseNumber ?? ''}
              error={fieldError('licenseNumber')}
              aria-invalid={fieldError('licenseNumber') ? true : undefined}
              help='Apenas dígitos. Sai nos atestados e relatórios; necessária para receitas e consentimentos — profissionais sem cédula ficam sinalizados na listagem.'
            />
            {/* 8.ª ronda/09: aviso à gestão na semana do aniversário */}
            <Input
              id='birthDate'
              name='birthDate'
              type='date'
              label='Data de nascimento'
              defaultValue={initial?.birthDate ?? ''}
              error={fieldError('birthDate')}
              aria-invalid={fieldError('birthDate') ? true : undefined}
            />
            {showFinancials && (
              <>
                <Input
                  id='commissionRate'
                  name='commissionRate'
                  label='Comissão base do profissional (%)'
                  type='number'
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={initial?.commissionPercent ?? ''}
                  placeholder='vazio = default da clínica (40)'
                  error={fieldError('commissionRate')}
                  aria-invalid={fieldError('commissionRate') ? true : undefined}
                  help='Fração que o PROFISSIONAL recebe. Overrides por ato na ficha do profissional.'
                />
                <Input
                  id='monthlyGoalCents'
                  name='monthlyGoalCents'
                  label='Objetivo mensal de produção (€)'
                  inputMode='decimal'
                  defaultValue={initial?.monthlyGoalEuros ?? ''}
                  placeholder='ex.: 15000'
                  error={fieldError('monthlyGoalCents')}
                  aria-invalid={
                    fieldError('monthlyGoalCents') ? true : undefined
                  }
                  help='Aparece no dashboard do médico como barra de progresso (objetivo vs faturado). Vazio = sem objetivo.'
                />
              </>
            )}
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
              {fieldError('color') && (
                <p style={{ ...errorText, marginTop: 6 }}>
                  {fieldError('color')}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* --- Especialidades -------------------------------------------------- */}
        <section
          id='specialties-section'
          tabIndex={-1}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            outline: 'none',
          }}
        >
          <h3 style={sectionTitle}>Especialidades *</h3>
          {fieldError('specialties') && (
            <p role='alert' style={errorText}>
              {fieldError('specialties')}
            </p>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '8px',
              ...(fieldError('specialties')
                ? {
                    border: `1.5px solid ${ERROR_COLOR}`,
                    borderRadius: '10px',
                    padding: '12px',
                  }
                : {}),
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
          id='schedules-section'
          tabIndex={-1}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            outline: 'none',
          }}
        >
          <h3 style={sectionTitle}>Horários por clínica *</h3>
          {generalScheduleErrors.map((x, i) => (
            <p key={i} role='alert' style={errorText}>
              {x.message}
            </p>
          ))}
          {clinics.map(c => {
            const cs = schedules[c.id];
            const blockErrors = clinicErrors(c.id);
            const hasErrors =
              generalScheduleErrors.length > 0 ||
              (errors?.schedule.some(x => x.clinicId === c.id) ?? false);
            return (
              <div
                key={c.id}
                id={`clinic-block-${c.id}`}
                tabIndex={-1}
                style={{
                  border: hasErrors
                    ? `1.5px solid ${ERROR_COLOR}`
                    : '1px solid #EEF1F8',
                  borderRadius: '10px',
                  padding: '16px',
                  backgroundColor: cs.enabled ? '#FFFFFF' : '#FAFBFE',
                  outline: 'none',
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

                {blockErrors.map((x, i) => (
                  <p
                    key={i}
                    role='alert'
                    style={{ ...errorText, marginTop: '10px' }}
                  >
                    {x.message}
                  </p>
                ))}

                {cs.enabled && (
                  <>
                    {/* Atalhos (Fase 4B): o horário típico repete-se de 2.ª a
                      6.ª e tem almoço — dois cliques em vez de 10 campos */}
                    <div
                      style={{
                        marginTop: '12px',
                        display: 'flex',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type='button'
                        onClick={() => {
                          const src = cs.days[1] ?? [];
                          if (src.length === 0) {
                            toast.error('Defina primeiro a segunda-feira.');
                            return;
                          }
                          for (const d of [2, 3, 4, 5]) {
                            setDay(
                              c.id,
                              d,
                              src.map(r => ({ ...r })),
                            );
                          }
                          toast.success('Segunda copiada para terça a sexta.');
                        }}
                        style={shortcutBtn}
                      >
                        Copiar segunda → 3.ª a 6.ª
                      </button>
                      <button
                        type='button'
                        onClick={() => {
                          // Divide cada dia com UM período em dois (almoço 13–14)
                          let changed = 0;
                          for (const w of WEEKDAYS_DISPLAY) {
                            const r = cs.days[w.value] ?? [];
                            if (r.length !== 1 || !r[0].start || !r[0].end)
                              continue;
                            if (r[0].start >= '13:00' || r[0].end <= '14:00')
                              continue;
                            setDay(c.id, w.value, [
                              { start: r[0].start, end: '13:00' },
                              { start: '14:00', end: r[0].end },
                            ]);
                            changed++;
                          }
                          toast.success(
                            changed
                              ? `Almoço 13h–14h aplicado a ${changed} dia(s).`
                              : 'Nenhum dia com um só período que abranja 13h–14h.',
                          );
                        }}
                        style={shortcutBtn}
                      >
                        Adicionar almoço 13h–14h
                      </button>
                      <button
                        type='button'
                        onClick={() => {
                          for (const w of WEEKDAYS_DISPLAY)
                            setDay(c.id, w.value, []);
                        }}
                        style={{ ...shortcutBtn, color: '#B3261E' }}
                      >
                        Limpar semana
                      </button>
                    </div>
                    <div
                      style={{
                        marginTop: '10px',
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
                                color:
                                  dayErrors(c.id, w.value).length > 0
                                    ? ERROR_COLOR
                                    : ranges.length
                                      ? '#1B2A6B'
                                      : '#9AA1B4',
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
                              {dayErrors(c.id, w.value).map((x, i) => (
                                <p key={i} role='alert' style={errorText}>
                                  {x.message}
                                </p>
                              ))}
                              {/* 5.ª ronda/07: turno quinzenal */}
                              {ranges.length > 0 && (
                                <label
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    fontSize: '12px',
                                    color: '#3D4257',
                                  }}
                                >
                                  <input
                                    type='checkbox'
                                    checked={cs.biweekly[w.value] != null}
                                    onChange={e =>
                                      setBiweekly(
                                        c.id,
                                        w.value,
                                        e.target.checked
                                          ? nextDateOfWeekday(w.value)
                                          : null,
                                      )
                                    }
                                  />
                                  Quinzenal (semana sim, semana não)
                                  {cs.biweekly[w.value] != null && (
                                    <>
                                      <span style={{ color: '#6A7186' }}>
                                        — trabalha a
                                      </span>
                                      <input
                                        type='date'
                                        value={cs.biweekly[w.value] ?? ''}
                                        onChange={e =>
                                          setBiweekly(
                                            c.id,
                                            w.value,
                                            e.target.value || null,
                                          )
                                        }
                                        style={{
                                          border: '1px solid #D8DEEF',
                                          borderRadius: '8px',
                                          padding: '4px 8px',
                                          fontSize: '12px',
                                          color: '#1B2A6B',
                                        }}
                                      />
                                    </>
                                  )}
                                </label>
                              )}
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
                  </>
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
                label='Email do profissional'
                placeholder='medico@exemplo.pt'
                error={fieldError('email')}
                aria-invalid={fieldError('email') ? true : undefined}
                help='Serve para o convite de acesso. Sem convite assinalado, o email não fica guardado — pode dar o acesso mais tarde, na ficha do profissional.'
              />
            </div>
            <Checkbox
              id='sendActivationInvite'
              name='sendActivationInvite'
              label='Enviar convite de ativação por email'
              help='O profissional recebe um código para definir a password e aceder à sua área.'
            />
          </section>
        )}

        {/* Junto ao botão: lembra que há avisos mais acima */}
        {errors && errorCount > 0 && (
          <p
            role='status'
            style={{
              margin: 0,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '14px',
              backgroundColor: '#FDEDED',
              color: ERROR_COLOR,
            }}
          >
            {doctorErrorsSummary(errors)}{' '}
            <button
              type='button'
              onClick={() =>
                summaryRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                })
              }
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                font: 'inherit',
                fontWeight: 700,
                color: ERROR_COLOR,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Ver a lista
            </button>
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button type='submit' loading={pending}>
            {mode === 'create' ? 'Criar profissional' : 'Guardar alterações'}
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
          O email do convite não foi entregue. Envie este código ao profissional
          — uso único, válido 7 dias:
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

const shortcutBtn: React.CSSProperties = {
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#2743A6',
  backgroundColor: '#FFFFFF',
  cursor: 'pointer',
};
