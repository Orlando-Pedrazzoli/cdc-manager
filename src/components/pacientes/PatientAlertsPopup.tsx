// 📄 src/components/pacientes/PatientAlertsPopup.tsx
// =============================================================================
// CDC Manager — Janela de avisos do paciente (7.ª ronda/B5)
// -----------------------------------------------------------------------------
// Victor (13/11/2026): pop-up com observações importantes ao tentar marcar e
// ao abrir o odontograma; "que todos possam editar e colocar estas
// observações".
//
// · Com `patientId` definido, vai buscar os avisos. Se houver algum, a janela
//   abre sozinha (uma vez por paciente escolhido).
// · `showButton`: mostra também o botão "Avisos", para reabrir a janela ou
//   escrever uma observação num paciente que ainda não tem nenhuma.
// · A observação escrita aqui é o mesmo "alerta administrativo" da ficha.
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Ban, Info } from 'lucide-react';
import {
  getPatientAlertsAction,
  updatePatientAlertNoteAction,
  type PatientAlertsResult,
} from '@/actions/patient-alerts';
import { ALERT_NOTE_MAX, type PatientAlertLevel } from '@/lib/patient-alerts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const LEVEL: Record<PatientAlertLevel, { bg: string; border: string; fg: string }> = {
  danger: { bg: '#FDECEA', border: '#D92D20', fg: '#7A1C13' },
  warning: { bg: '#FFF6DB', border: '#E0B100', fg: '#6B5200' },
  info: { bg: '#EEF3FF', border: '#B9C8F5', fg: '#22388C' },
};

export function PatientAlertsPopup({
  patientId,
  showButton = false,
}: {
  patientId: string | null;
  showButton?: boolean;
}) {
  const [loaded, setLoaded] = useState<{
    id: string;
    data: PatientAlertsResult;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    let alive = true;
    getPatientAlertsAction(patientId).then(res => {
      if (!alive || 'error' in res) return;
      setLoaded({ id: patientId, data: res });
      setNote(res.note);
      // abre sozinha só quando há alguma coisa para dizer
      if (res.alerts.length > 0) setOpen(true);
    });
    return () => {
      alive = false;
    };
  }, [patientId]);

  const data = patientId && loaded?.id === patientId ? loaded.data : null;
  // os avisos automáticos (tudo menos a observação, que se edita em baixo)
  const auto = data?.alerts.filter(a => a.kind !== 'note') ?? [];
  const count = data?.alerts.length ?? 0;

  const save = async () => {
    if (!patientId || !data) return;
    setSaving(true);
    const res = await updatePatientAlertNoteAction(patientId, note);
    setSaving(false);
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    toast.success('Observação guardada.');
    const trimmed = note.trim();
    setLoaded({
      id: patientId,
      data: {
        ...data,
        note: trimmed,
        alerts: [
          ...data.alerts.filter(a => a.kind !== 'note'),
          ...(trimmed
            ? [{ kind: 'note' as const, level: 'warning' as const, text: trimmed }]
            : []),
        ],
      },
    });
    setOpen(false);
  };

  return (
    <>
      {showButton && data && (
        <button
          type='button'
          onClick={() => setOpen(true)}
          title='Observações importantes e avisos deste paciente'
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 11px',
            borderRadius: '9px',
            border: `1px solid ${count > 0 ? '#E0B100' : '#D8DEEF'}`,
            backgroundColor: count > 0 ? '#FFF6DB' : '#FFFFFF',
            color: count > 0 ? '#6B5200' : '#3D4257',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <AlertTriangle size={15} />
          {count > 0 ? `Avisos (${count})` : 'Avisos'}
        </button>
      )}
      <Modal
        open={open && !!data}
        onClose={() => setOpen(false)}
        title={data ? `Atenção — ${data.patientName}` : 'Atenção'}
        maxWidth={520}
      >
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {auto.map((a, i) => {
              const c = LEVEL[a.level];
              const Icon = a.kind === 'blocked' ? Ban : a.level === 'info' ? Info : AlertTriangle;
              return (
                <div
                  key={`${a.kind}-${i}`}
                  role='alert'
                  style={{
                    display: 'flex',
                    gap: 9,
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: c.bg,
                    border: `1px solid ${c.border}`,
                    color: c.fg,
                    fontSize: '14px',
                    lineHeight: 1.4,
                  }}
                >
                  <Icon size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{a.text}</span>
                </div>
              );
            })}

            <label
              htmlFor='alert-note'
              style={{ fontSize: '13px', fontWeight: 700, color: '#1C2233', marginTop: 2 }}
            >
              Observações importantes
              <span style={{ fontWeight: 400, color: '#6A7186' }}>
                {' '}
                — qualquer pessoa da equipa pode escrever ou alterar
              </span>
            </label>
            <textarea
              id='alert-note'
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={ALERT_NOTE_MAX}
              rows={4}
              placeholder='Ex.: encaminhar para o Dr. … para avaliação.'
              style={{
                width: '100%',
                padding: '9px 11px',
                border: '1px solid #D8DEEF',
                borderRadius: '10px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                backgroundColor: note.trim() ? '#FFFBEA' : '#FFFFFF',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {note.trim() !== data.note && (
                <Button size='sm' variant='outline' loading={saving} onClick={save}>
                  Guardar observação
                </Button>
              )}
              <Button size='sm' disabled={saving} onClick={() => setOpen(false)}>
                Entendido
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
