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
// =============================================================================

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import {
  createAppointmentAction,
  type AppointmentFormState,
} from '@/actions/appointments';
import { usePatientSearch } from '@/components/agenda/usePatientSearch';
import { PatientSearchResult } from '@/components/pacientes/PatientSearchResult';
import { getFreeSlotsAction } from '@/actions/agenda';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TreatmentPicker } from '@/components/clinico/TreatmentPicker';

export function NewAppointmentModal({
  open,
  onClose,
  clinicId,
  initialDate,
  doctors,
  treatments,
  rooms = [],
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  initialDate: string; // 'YYYY-MM-DD' — dia atualmente aberto na agenda
  doctors: { id: string; name: string }[];
  /** Gabinetes ativos da clínica (Warehouse kind 'operatory') */
  rooms?: { id: string; name: string }[];
  treatments: { id: string; name: string; category?: string | null }[];
}) {
  const router = useRouter();

  // --- Data da marcação ------------------------------------------------------
  // Estado próprio: abre com o dia da agenda, mas é livremente alterável.
  const [date, setDate] = useState(initialDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  // Reabrir o modal noutro dia da agenda → ressincronizar a data. Padrão
  // "ajustar estado durante o render" (react.dev) em vez de useEffect: o
  // React repete o render de imediato, sem frame intermédio com a data velha.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDate(initialDate);
  }

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
  const [doctorId, setDoctorId] = useState('');
  const [channel, setChannel] = useState<'front-desk' | 'phone' | 'whatsapp'>(
    'front-desk',
  );

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
  const start = startSel.key === slotsKey ? startSel.start : '';
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
    onClose();
    // Reset para a próxima abertura
    resetPatient();
    setTreatmentId('');
    setDoctorId('');
    setStartSel({ key: '', start: '' });
    setChannel('front-desk');
    return result;
  }, undefined);

  return (
    <Modal open={open} onClose={onClose} title='Nova marcação' maxWidth={560}>
      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <input type='hidden' name='clinicId' value={clinicId} />
        <input type='hidden' name='patientId' value={patient?.id ?? ''} />

        {/* Paciente */}
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
        </div>

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
          >
            <option value=''>— Atribuir depois —</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
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
              label='Hora *'
              required
              help='Sem médico — capacidade verificada ao guardar.'
            />
          )}
        </div>

        {/* Gabinete (stock por local, set/2026): no Colombo os 5 são
            rotativos e a receção escolhe; na Buraca há um só e a action
            atribui automaticamente (o select nem aparece) */}
        {rooms.length > 1 && (
          <Select
            id='ap-room'
            name='roomId'
            label='Gabinete'
            help='Quem trabalhou em cada gabinete alimenta as contagens de stock.'
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

        <Textarea
          id='ap-note'
          name='note'
          label='Nota (opcional)'
          maxLength={500}
          rows={2}
          placeholder='Ex.: paciente pede RX recente'
        />

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
          <Button type='submit' loading={pending} disabled={!patient}>
            Criar marcação
          </Button>
        </div>
      </form>
    </Modal>
  );
}
