// 📄 src/components/agenda/NewAppointmentModal.tsx
// =============================================================================
// CDC Manager — Agenda: modal de nova marcação (balcão)
// -----------------------------------------------------------------------------
// Fluxo da receção: pesquisar paciente (nome/telefone/nº processo, top 8)
// → DATA (o modal tem o seu próprio seletor — abre com o dia da agenda mas
//   a receção marca para QUALQUER dia futuro sem sair do modal; fix pós-demo
//   09/09/2026: antes a data vinha escondida do URL e não era selecionável)
// → ato → médico (opcional) → horário:
//   - COM médico: dropdown alimentado por getFreeSlotsAction — a receção só
//     vê horários realmente livres (camada 1 da defesa anti-dupla-marcação)
//   - SEM médico (fila de atribuição): hora livre em input time; a action
//     valida a capacidade da clínica na transação (camada 2)
//
// 3.ª reunião/04 (Victor): "é fácil esquecer em que agenda se está a
// marcar". O modal mostra a clínica em destaque, com a SUA cor, e o botão
// de gravar diz onde vai marcar ("Criar marcação no Colombo"). A confirmação
// é visual e permanente — um confirm() a mais seria ignorado ao 2.º dia.
//
// 4.ª ronda/03 (Victor, nov. 2026): "clicar num horário livre da agenda e
// abrir logo a nova marcação, já com a hora e o médico preenchidos". A
// grelha abre este modal com `initialDoctorId` e `preferredStart`; o médico
// fica escolhido e, assim que há ato, o horário livre mais próximo da hora
// clicada fica selecionado (a lista continua a mostrar SÓ horários livres).
//
// 5.ª ronda (Victor, nov. 2026):
// · 10 — a lista de médicos acompanha a DATA escolhida no modal: só quem
//   está escalado nesse dia, com o horário ao lado do nome.
// · 13 — pré-marcação sem ficha: nome, apelido e telemóvel chegam para
//   marcar; fica criada uma ficha provisória ("por completar").
// · 09 — depois de criada, a receção pode abrir logo a ficha para a
//   completar; e regista-se como o paciente conheceu a clínica (Instagram,
//   Google, indicação, promoção do mês) — separado do canal do pedido.
// =============================================================================

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MapPin, Search, UserPlus } from 'lucide-react';
import { tint } from '@/lib/branding';
import {
  createAppointmentAction,
  type AppointmentFormState,
} from '@/actions/appointments';
import { usePatientSearch } from '@/components/agenda/usePatientSearch';
import { PatientSearchResult } from '@/components/pacientes/PatientSearchResult';
import {
  getFreeSlotsAction,
  getWorkingDoctorsAction,
} from '@/actions/agenda';
import {
  getPatientAttendanceAction,
  type PatientAttendance,
} from '@/actions/patient-quick';
import {
  REFERRAL_SOURCES,
  REFERRAL_SOURCE_LABEL,
  type ReferralSource,
} from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TreatmentPicker } from '@/components/clinico/TreatmentPicker';

/** 7.ª ronda/B1: o que a agenda precisa para abrir o pedido ao laboratório */
export interface NewAppointmentLabTarget {
  id: string;
  clinicId: string;
  patientId: string;
  patientLabel: string;
  doctorId: string | null;
  date: string; // 'YYYY-MM-DD'
  start: string; // 'HH:mm'
  treatmentName: string;
}

export function NewAppointmentModal({
  open,
  onClose,
  clinicId,
  clinic,
  initialDate,
  initialDoctorId = '',
  preferredStart = '',
  doctors,
  treatments,
  rooms = [],
  promo = null,
  labEnabled = false,
  onCreatedWithLab,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  /** 3.ª reunião/04: nome curto + cor da clínica onde se está a marcar */
  clinic?: { label: string; color: string };
  initialDate: string; // 'YYYY-MM-DD' — dia atualmente aberto na agenda
  /** 4.ª ronda/03: médico da coluna onde se clicou na grelha */
  initialDoctorId?: string;
  /** 4.ª ronda/03: hora clicada na grelha ('HH:mm') */
  preferredStart?: string;
  doctors: { id: string; name: string }[];
  /** Gabinetes ativos da clínica (Warehouse kind 'operatory') */
  rooms?: { id: string; name: string }[];
  treatments: { id: string; name: string; category?: string | null }[];
  /** 5.ª ronda/09: promoção do mês em vigor (Configurações) */
  promo?: string | null;
  /** 7.ª ronda/B1: há laboratórios configurados → mostra a opção */
  labEnabled?: boolean;
  /**
   * 7.ª ronda/B1: marcação criada com "trabalho de laboratório" assinalado —
   * a agenda abre logo o pedido ao laboratório ligado a esta marcação
   */
  onCreatedWithLab?: (target: NewAppointmentLabTarget) => void;
}) {
  const router = useRouter();

  // --- 5.ª ronda/13: pré-marcação sem ficha ---------------------------------
  const [newMode, setNewMode] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [samePhoneOk, setSamePhoneOk] = useState(false);
  /** Ficha provisória acabada de criar → convite para a completar (09) */
  const [created, setCreated] = useState<{ id: string; name: string } | null>(
    null,
  );
  // --- 5.ª ronda/09: como nos conheceu --------------------------------------
  // --- 7.ª ronda/B1: trabalho de laboratório ligado à marcação ---------------
  const [withLab, setWithLab] = useState(false);
  const [referral, setReferral] = useState<ReferralSource | ''>('');
  const [referralOther, setReferralOther] = useState('');

  // --- Data da marcação ------------------------------------------------------
  // Estado próprio: abre com o dia da agenda, mas é livremente alterável.
  const [date, setDate] = useState(initialDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  // Reabrir o modal noutro dia da agenda → ressincronizar a data. Padrão
  // "ajustar estado durante o render" (react.dev) em vez de useEffect: o
  // React repete o render de imediato, sem frame intermédio com a data velha.
  const [prevOpen, setPrevOpen] = useState(open);

  // --- Pesquisa de paciente (hook partilhado com WalkInModal) ---------------
  const {
    patientQuery,
    setPatientQuery,
    patient,
    setPatient,
    patientResults,
    reset: resetPatient,
  } = usePatientSearch();

  // --- Ato / médico / slots --------------------------------------------------
  const [treatmentId, setTreatmentId] = useState('');
  const [doctorId, setDoctorId] = useState(initialDoctorId);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(initialDate);
      setDoctorId(initialDoctorId);
    }
  }
  const [channel, setChannel] = useState<'front-desk' | 'phone' | 'whatsapp'>(
    'front-desk',
  );

  // Faltas do paciente escolhido (Victor, 12/11/2026): "ter um controle,
  // quando a gente for remarcar esse paciente, se ele é faltoso ou não".
  // O resultado guarda o id do pedido; só se mostra o do paciente atual.
  const [attendance, setAttendance] = useState<{
    patientId: string;
    data: PatientAttendance;
  } | null>(null);
  const patientId = patient?.id ?? null;
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;
    getPatientAttendanceAction(patientId)
      .then(data => {
        if (!cancelled && data) setAttendance({ patientId, data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, patientId]);
  const faltas =
    attendance && attendance.patientId === patientId ? attendance.data : null;

  // 5.ª ronda/10: médicos escalados no DIA ESCOLHIDO. Enquanto o pedido não
  // chega (ou se falhar) usa-se a lista do dia aberto na agenda, que é a
  // certa quando a data não foi mexida.
  const [dayDoctors, setDayDoctors] = useState<{
    date: string;
    list: { id: string; name: string; hours: string }[];
  } | null>(null);
  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    getWorkingDoctorsAction({ clinicId, date })
      .then(list => {
        if (!cancelled) setDayDoctors({ date, list });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, clinicId, date]);
  const doctorsLoaded = dayDoctors?.date === date;
  const doctorOptions: { id: string; name: string; hours?: string }[] =
    doctorsLoaded ? dayDoctors.list : date === initialDate ? doctors : [];
  // Médico escolhido que não trabalha na nova data → volta a "atribuir depois"
  if (doctorsLoaded && doctorId && !doctorOptions.some(d => d.id === doctorId)) {
    setDoctorId('');
  }

  // Slots livres: o resultado guarda a CHAVE do pedido (médico|ato|dia).
  // `slots`, `slotsLoading` e `start` são derivados no render a partir dessa
  // chave — mudar de médico/ato/dia invalida-os de imediato sem setState em
  // effect. O effect só dispara o pedido ao servidor.
  const slotsKey =
    doctorId && treatmentId && date ? `${doctorId}|${treatmentId}|${date}` : '';
  const [slotsResult, setSlotsResult] = useState<{
    key: string;
    slots: { start: string }[];
  } | null>(null);
  const [startSel, setStartSel] = useState<{ key: string; start: string }>({
    key: '',
    start: '',
  });

  useEffect(() => {
    if (!slotsKey) return;
    let cancelled = false;
    getFreeSlotsAction({
      clinicId,
      doctorId,
      treatmentTypeId: treatmentId,
      date,
    })
      .then(s => {
        if (!cancelled) setSlotsResult({ key: slotsKey, slots: s });
      })
      .catch(() => {
        if (!cancelled) setSlotsResult({ key: slotsKey, slots: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [slotsKey, clinicId, doctorId, treatmentId, date]);

  const slots = slotsResult?.key === slotsKey ? slotsResult.slots : [];
  const slotsLoading = !!slotsKey && slotsResult?.key !== slotsKey;
  // Hora clicada na grelha → horário livre mais próximo (até 30 min de
  // diferença), enquanto a receção não escolher outro
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const suggested =
    preferredStart && doctorId === initialDoctorId && date === initialDate && slots.length > 0
      ? slots.reduce((best, sl) =>
          Math.abs(toMin(sl.start) - toMin(preferredStart)) < Math.abs(toMin(best.start) - toMin(preferredStart)) ? sl : best,
        )
      : null;
  const suggestedStart =
    suggested && Math.abs(toMin(suggested.start) - toMin(preferredStart)) <= 30 ? suggested.start : '';
  const start = startSel.key === slotsKey ? startSel.start : suggestedStart;
  const setStart = (value: string) =>
    setStartSel({ key: slotsKey, start: value });

  // --- Submit ----------------------------------------------------------------
  // Efeitos do resultado (toast, fechar, refresh, reset) corridos no
  // próprio callback da action — sem useEffect a observar `state`
  const [state, formAction, pending] = useActionState<
    AppointmentFormState,
    FormData
  >(async (prev, formData) => {
    const result = await createAppointmentAction(prev, formData);
    if (result && 'error' in result) return result;
    toast.success('Marcação criada.');
    router.refresh();
    const provisionalId =
      result && 'provisionalPatientId' in result
        ? result.provisionalPatientId
        : undefined;
    if (provisionalId) {
      // 09: a marcação está feita; oferecer completar a ficha já
      setCreated({
        id: provisionalId,
        name: `${newFirst} ${newLast}`.replace(/\s+/g, ' ').trim(),
      });
    } else {
      onClose();
      // 7.ª ronda/B1: abrir já o pedido ao laboratório desta marcação
      if (withLab && patient && result && 'appointmentId' in result) {
        const fdDoctor = String(formData.get('doctorId') ?? '');
        onCreatedWithLab?.({
          id: result.appointmentId,
          clinicId,
          patientId: patient.id,
          patientLabel: patient.label,
          doctorId: fdDoctor || null,
          date: String(formData.get('date') ?? date),
          start: String(formData.get('start') ?? ''),
          treatmentName:
            treatments.find(t => t.id === treatmentId)?.name ?? 'Consulta',
        });
      }
    }
    setWithLab(false);
    // Reset para a próxima abertura
    resetPatient();
    setTreatmentId('');
    setDoctorId('');
    setStartSel({ key: '', start: '' });
    setChannel('front-desk');
    setNewMode(false);
    setNewFirst('');
    setNewLast('');
    setNewPhone('');
    setSamePhoneOk(false);
    setReferral('');
    setReferralOther('');
    return result;
  }, undefined);

  const closeAll = () => {
    setCreated(null);
    onClose();
  };
  const referralDetail =
    referral === 'promocao' ? (promo ?? '') : referral ? referralOther : '';
  const canSubmit = newMode
    ? newFirst.trim().length >= 2 &&
      newLast.trim().length >= 2 &&
      newPhone.replace(/\D/g, '').length >= 9
    : !!patient && !faltas?.blockReason;

  if (created) {
    return (
      <Modal open={open} onClose={closeAll} title='Marcação criada' maxWidth={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#3A3F4A', lineHeight: 1.5 }}>
            A marcação de <strong>{created.name}</strong> ficou registada. A
            ficha foi criada só com o nome e o telemóvel e fica assinalada como{' '}
            <strong>por completar</strong>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <Button type='button' variant='outline' onClick={closeAll}>
              Completar depois
            </Button>
            <a
              href={`/admin/pacientes/${created.id}?tab=dados`}
              target='_blank'
              rel='noopener'
              onClick={closeAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: '10px',
                padding: '9px 16px',
                fontSize: '14px',
                fontWeight: 700,
                textDecoration: 'none',
                color: '#FFFFFF',
                backgroundColor: '#1B2A6B',
              }}
            >
              <UserPlus size={15} /> Completar a ficha agora
            </a>
          </div>
        </div>
      </Modal>
    );
  }

  const clinicColor = clinic?.color ?? '#1B2A6B';

  return (
    <Modal open={open} onClose={onClose} title='Nova marcação' maxWidth={940}>
      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        <input type='hidden' name='clinicId' value={clinicId} />
        <input type='hidden' name='patientId' value={patient?.id ?? ''} />

        {/* 3.ª reunião/04: a clínica em destaque, com a sua cor */}
        {clinic && (
          <div
            role='status'
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: tint(clinicColor, 0.1),
              border: `1px solid ${tint(clinicColor, 0.35)}`,
              borderLeft: `5px solid ${clinicColor}`,
              color: clinicColor,
            }}
          >
            <MapPin size={18} />
            <span style={{ fontSize: '14px', fontWeight: 700 }}>
              Vai marcar em {clinic.label}
            </span>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>
              — mude a clínica no topo da agenda se não for esta
            </span>
          </div>
        )}

        {/* 7.ª ronda/B1 (Victor, 13/11/2026): "mais compacto, sem tela de
            rolagem — ao abrir a caixinha, tudo visível de uma vez". Duas
            colunas: quem/quando à esquerda, o resto à direita. Em ecrãs
            estreitos as colunas empilham sozinhas. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
            gap: '12px 22px',
            alignItems: 'start',
          }}
        >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
        {/* Paciente */}
        {newMode ? (
          <div
            style={{
              border: '1px solid #D8DEEF',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              backgroundColor: '#FAFBFE',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1B2A6B' }}>
                Paciente sem ficha — pré-marcação
              </span>
              <button
                type='button'
                onClick={() => setNewMode(false)}
                style={{ all: 'unset', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#2743A6' }}
              >
                Procurar ficha existente
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input
                id='ap-new-first'
                name='newFirstName'
                label='Nome *'
                value={newFirst}
                onChange={e => setNewFirst(e.target.value)}
                maxLength={60}
                autoComplete='off'
              />
              <Input
                id='ap-new-last'
                name='newLastName'
                label='Apelido *'
                value={newLast}
                onChange={e => setNewLast(e.target.value)}
                maxLength={90}
                autoComplete='off'
              />
            </div>
            <Input
              id='ap-new-phone'
              name='newPhone'
              type='tel'
              label='Telemóvel *'
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder='9 dígitos'
              autoComplete='off'
              help='A ficha completa cria-se depois, ou quando o paciente chegar — a marcação não se perde.'
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: '#3D4257' }}>
              <input
                type='checkbox'
                name='samePhoneOk'
                checked={samePhoneOk}
                onChange={e => setSamePhoneOk(e.target.checked)}
              />
              É outra pessoa (o telemóvel já existe noutra ficha, ex.: familiar)
            </label>
          </div>
        ) : (
        <div style={{ position: 'relative' }}>
          <Input
            id='ap-patient'
            label='Paciente *'
            icon={<Search size={15} />}
            value={patient ? patient.label : patientQuery}
            onChange={e => {
              setPatient(null);
              setPatientQuery(e.target.value);
            }}
            placeholder='Nome, telemóvel, NIF, utente, nascimento ou nº de processo…'
            autoComplete='off'
          />
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
                  onSelect={() => setPatient(r)} // a lista some sozinha (derivada de `patient`)
                />
              ))}
            </div>
          )}
          {patient && faltas?.warning && (
            <p
              role='status'
              style={{
                margin: '8px 0 0',
                padding: '8px 12px',
                borderRadius: '10px',
                backgroundColor: '#FFF1DF',
                border: '1px solid #E8890C',
                color: '#8A4B00',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Atenção: {faltas.warning}
              {faltas.lastNoShowLabel ? ` (última falta a ${faltas.lastNoShowLabel})` : ''}.
            </p>
          )}
          {/* 7.ª ronda/B4: paciente bloqueado pela gestão — não se marca */}
          {faltas?.blockReason && (
            <div
              role='alert'
              style={{
                margin: '8px 0 0',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: '#FDECEA',
                border: '1px solid #D92D20',
                color: '#7A1C13',
                fontSize: '13px',
                lineHeight: 1.45,
              }}
            >
              <strong>Paciente bloqueado para marcações.</strong>
              <br />
              Motivo: {faltas.blockReason}
              <br />
              <span style={{ fontSize: '12px' }}>
                Só a gestão pode desbloquear, na ficha do paciente.
              </span>
            </div>
          )}
          {!patient && (
            <button
              type='button'
              onClick={() => {
                // aproveita o que já foi escrito na pesquisa
                const q = patientQuery.trim();
                if (/^[+\d\s]+$/.test(q) && q.replace(/\D/g, '').length >= 9) {
                  setNewPhone(q);
                } else if (q && !/\d/.test(q)) {
                  const parts = q.split(/\s+/);
                  setNewFirst(parts[0] ?? '');
                  setNewLast(parts.slice(1).join(' '));
                }
                setNewMode(true);
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                marginTop: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '13px',
                fontWeight: 600,
                color: '#2743A6',
              }}
            >
              <UserPlus size={14} /> Sem ficha — marcar só com nome e telemóvel
            </button>
          )}
          {/* Pedido do Victor (11/11/2026): criar a ficha COMPLETA a partir
              daqui, sem perder o horário escolhido. Abre noutro separador;
              esta janela fica como está e a ficha nova aparece na pesquisa. */}
          {!patient && (
            <a
              href='/admin/pacientes/novo'
              target='_blank'
              rel='noopener'
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
                fontSize: '13px',
                fontWeight: 600,
                color: '#2743A6',
                textDecoration: 'none',
              }}
              title='Abre a ficha nova noutro separador. Depois de guardar, volte a esta janela e procure o paciente — o horário fica guardado.'
            >
              <UserPlus size={14} /> Criar ficha completa agora (noutro separador)
            </a>
          )}
        </div>
        )}

        {/* Data + Ato */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
          }}
        >
          <Input
            id='ap-date'
            name='date'
            type='date'
            label='Data *'
            value={date}
            min={todayStr}
            onChange={e => setDate(e.target.value)}
            required
          />
          {/* Ato com lupa (mesmo picker da consulta e da urgência): a
              receção escreve "coroa", "limpeza", categoria ou código */}
          <TreatmentPicker
            name='treatmentTypeId'
            options={treatments.map(t => ({
              id: t.id,
              name: t.name,
              category: t.category ?? null,
            }))}
            value={treatmentId}
            onChange={setTreatmentId}
            placeholder='Pesquisar ato…'
          />
        </div>

        {/* Médico + horário */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
          }}
        >
          <Select
            id='ap-doctor'
            name='doctorId'
            label='Médico'
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
            help={
              doctorsLoaded && doctorOptions.length === 0
                ? 'Nenhum médico escalado neste dia nesta clínica.'
                : 'Só aparecem os médicos escalados neste dia.'
            }
          >
            <option value=''>— Atribuir depois —</option>
            {doctorOptions.map(d => (
              <option key={d.id} value={d.id}>
                {d.hours ? `${d.name} · ${d.hours}` : d.name}
              </option>
            ))}
          </Select>

          {doctorId ? (
            <Select
              id='ap-start'
              name='start'
              label={`Horário livre * ${slotsLoading ? '(a carregar…)' : ''}`}
              value={start}
              onChange={e => setStart(e.target.value)}
              required
              disabled={!treatmentId || slotsLoading}
              help={
                treatmentId && !slotsLoading && slots.length === 0
                  ? 'Sem horários livres neste dia — escolha outra data.'
                  : preferredStart && doctorId === initialDoctorId && date === initialDate
                    ? !treatmentId
                      ? `Clicou nas ${preferredStart} — escolha o ato para ver os horários livres.`
                      : !slotsLoading && startSel.key !== slotsKey
                        ? suggestedStart === preferredStart
                          ? `Horário das ${preferredStart}, escolhido na agenda.`
                          : suggestedStart
                            ? `As ${preferredStart} não estão livres para este ato — sugerido o mais próximo.`
                            : `As ${preferredStart} não estão livres para este ato — escolha outro horário.`
                        : undefined
                    : undefined
              }
            >
              <option value=''>— Selecionar —</option>
              {slots.map(s => (
                <option key={s.start} value={s.start}>
                  {s.start}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id='ap-start-free'
              name='start'
              type='time'
              defaultValue={preferredStart || undefined}
              label='Hora *'
              required
              help='Sem médico — capacidade verificada ao guardar.'
            />
          )}
        </div>

        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
        {/* Gabinete (stock por local, set/2026): no Colombo os 5 são
            rotativos e a receção escolhe; na Buraca há um só e a action
            atribui automaticamente (o select nem aparece) */}
        {rooms.length > 1 && (
          <Select
            id='ap-room'
            name='roomId'
            label='Gabinete'
            title='Quem trabalhou em cada gabinete alimenta as contagens de stock.'
          >
            <option value=''>— Atribuir depois —</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}

        {/* Origem do pedido — de onde chegou a marcação. Alimenta a
            estatística de canais; 'website'/'system' são reservados a
            fluxos automáticos futuros */}
        <div>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#3A3F4A',
            }}
          >
            Origem do pedido
          </p>
          <input type='hidden' name='channel' value={channel} />
          <div style={{ display: 'flex', gap: '8px' }}>
            {(
              [
                ['front-desk', 'Balcão'],
                ['phone', 'Telefone'],
                ['whatsapp', 'WhatsApp'],
              ] as const
            ).map(([value, label]) => {
              const active = channel === value;
              return (
                <button
                  key={value}
                  type='button'
                  onClick={() => setChannel(value)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    borderRadius: '10px',
                    border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#3A3F4A',
                    padding: '8px 0',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 5.ª ronda/09: como o paciente conheceu a clínica */}
        <div>
          <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: '#3A3F4A' }}>
            Como nos conheceu <span style={{ fontWeight: 400, color: '#9AA1B4' }}>(opcional)</span>
          </p>
          <input type='hidden' name='referralSource' value={referral} />
          <input type='hidden' name='referralDetail' value={referralDetail} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {REFERRAL_SOURCES.filter(v => v !== 'promocao' || !!promo).map(value => {
              const active = referral === value;
              return (
                <button
                  key={value}
                  type='button'
                  onClick={() => setReferral(active ? '' : value)}
                  aria-pressed={active}
                  style={{
                    borderRadius: '10px',
                    border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#3A3F4A',
                    padding: '7px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {value === 'promocao' ? `Promoção: ${promo}` : REFERRAL_SOURCE_LABEL[value]}
                </button>
              );
            })}
          </div>
          {(referral === 'indicacao' || referral === 'outro') && (
            <div style={{ marginTop: 8 }}>
              <Input
                id='ap-referral-detail'
                label={referral === 'indicacao' ? 'Indicado por' : 'Qual'}
                value={referralOther}
                onChange={e => setReferralOther(e.target.value)}
                maxLength={120}
                autoComplete='off'
              />
            </div>
          )}
        </div>

        <Textarea
          id='ap-note'
          name='note'
          label='Observações (opcional)'
          maxLength={500}
          rows={2}
          placeholder='Ex.: avisar a Dra. para trazer procaína'
          help='Aparece na linha da marcação, na agenda.'
        />

        {/* 7.ª ronda/B1: "não tem a opção de adicionar trabalhos de
            laboratório ao fazer marcação". Assinalado, o pedido ao
            laboratório abre logo a seguir, já ligado a esta marcação. */}
        {labEnabled && !newMode && (
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '9px 12px',
              border: withLab ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
              borderRadius: '10px',
              backgroundColor: withLab ? '#F2F5FC' : '#FFFFFF',
              fontSize: '13px',
              color: '#1C2233',
              cursor: 'pointer',
            }}
          >
            <input
              type='checkbox'
              checked={withLab}
              onChange={e => setWithLab(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>Tem trabalho de laboratório</strong>
              <span style={{ display: 'block', fontSize: '12px', color: '#6A7186' }}>
                Ao criar a marcação abre o pedido ao laboratório, já ligado a
                ela.
              </span>
            </span>
          </label>
        )}
        </div>
        </div>

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button
            type='button'
            variant='outline'
            onClick={onClose}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type='submit'
            loading={pending}
            disabled={!canSubmit}
            style={
              clinic
                ? {
                    backgroundColor: clinicColor,
                    border: `1px solid ${clinicColor}`,
                  }
                : undefined
            }
          >
            {clinic ? `Criar marcação em ${clinic.label}` : 'Criar marcação'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
