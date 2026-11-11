// 📄 src/components/agenda/PatientQuickView.tsx
// =============================================================================
// CDC Manager — Agenda: ficha rápida do paciente (Client Component)
// -----------------------------------------------------------------------------
// 4.ª ronda (Victor, nov. 2026), ponto 05. Abre por cima da agenda ao clicar
// no nome do paciente: contacto, alertas, saldo e próximas marcações, com
// edição rápida do telemóvel, email e alerta administrativo. Para o resto,
// "Abrir ficha completa" abre a ficha numa nova aba — a agenda não se perde.
// Os dados são pedidos ao abrir (actions/patient-quick.ts); nada é carregado
// para os pacientes em que não se clica.
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertTriangle, ExternalLink, Mail, Pencil, Phone, ReceiptEuro } from 'lucide-react';
import {
  getPatientQuickViewAction,
  updatePatientContactAction,
  type PatientQuickView as QuickView,
} from '@/actions/patient-quick';
import { formatCents } from '@/lib/commissions';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  'checked-in': 'Chegou',
};

const label: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#6A7186',
};
const box: React.CSSProperties = {
  border: '1px solid #EEF1F8',
  borderRadius: '10px',
  padding: '10px 12px',
};

export function PatientQuickView({
  patientId,
  fallbackName,
  onClose,
}: {
  /** null = fechada */
  patientId: string | null;
  /** Nome a mostrar no título enquanto os dados carregam */
  fallbackName?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  // O resultado guarda o id a que pertence: mudar de paciente invalida-o no
  // render, sem setState em effect (mesmo padrão do NewAppointmentModal)
  const [result, setResult] = useState<{ id: string; data: QuickView | null; error: string | null } | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', email: '', adminNote: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    getPatientQuickViewAction(patientId)
      .then(res => {
        if (cancelled) return;
        if ('error' in res) setResult({ id: patientId, data: null, error: res.error });
        else setResult({ id: patientId, data: res, error: null });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: patientId, data: null, error: 'Não foi possível carregar os dados do paciente.' });
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, reload]);

  const current = patientId && result?.id === patientId ? result : null;
  const data = current?.data ?? null;
  const loading = !!patientId && !current;

  const close = () => {
    setEditing(false);
    onClose();
  };
  const startEdit = () => {
    if (!data) return;
    setForm({ phone: data.phone ?? '', email: data.email ?? '', adminNote: data.adminNote ?? '' });
    setEditing(true);
  };
  const save = async () => {
    if (!patientId) return;
    setSaving(true);
    const res = await updatePatientContactAction(patientId, form);
    setSaving(false);
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    toast.success('Ficha atualizada.');
    setEditing(false);
    setResult(null);
    setReload(n => n + 1);
    router.refresh();
  };

  return (
    <Modal
      open={patientId !== null}
      onClose={close}
      title={data ? data.name : (fallbackName ?? 'Paciente')}
      maxWidth={560}
    >
      {loading && <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>A carregar…</p>}
      {current?.error && <p style={{ margin: 0, fontSize: '13px', color: '#B3261E' }}>{current.error}</p>}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
            Processo n.º <strong style={{ color: '#1B2A6B' }}>{String(data.processNumber)}</strong>
            {data.age !== null && ` · ${data.age} anos`}
            {data.birthDateLabel && ` · nasc. ${data.birthDateLabel}`}
            {data.nif && ` · NIF ${data.nif}`}
          </p>

          {/* Alertas: alergias (clínico) + alerta administrativo */}
          {(data.allergies.length > 0 || data.adminNote || !data.hasAnamnesis) && !editing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.allergies.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: '10px', backgroundColor: '#FDE7E5', border: '1px solid #F2B8B3', color: '#8E1F19', fontSize: '13px' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong>Alergias:</strong> {data.allergies.join(', ')}
                  </span>
                </div>
              )}
              {data.adminNote && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: '10px', backgroundColor: '#FFF4D6', border: '1px solid #F1D48A', color: '#6B4A00', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong>Alerta:</strong> {data.adminNote}
                  </span>
                </div>
              )}
              {!data.hasAnamnesis && (
                <p style={{ margin: 0, fontSize: '12.5px', color: '#9A5B00' }}>Anamnese em falta — preencher antes da consulta.</p>
              )}
            </div>
          )}

          {/* Contacto */}
          {editing ? (
            <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input id='qv-phone' label='Telemóvel' value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder='912 345 678' autoComplete='off' />
                <Input id='qv-email' label='Email' type='email' value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete='off' />
              </div>
              <Textarea
                id='qv-note'
                label='Alerta administrativo (visível para a receção)'
                rows={2}
                maxLength={2000}
                value={form.adminNote}
                onChange={e => setForm(f => ({ ...f, adminNote: e.target.value }))}
                placeholder='Ex.: faturar em nome do pai'
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button type='button' variant='secondary' onClick={() => setEditing(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button type='button' onClick={save} disabled={saving}>
                  {saving ? 'A gravar…' : 'Gravar'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '14px', color: '#1B2A6B' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Phone size={14} style={{ color: '#6A7186' }} />
                  {data.phone ? (
                    <a href={`tel:${data.phone}`} style={{ color: '#1B2A6B', fontWeight: 700, textDecoration: 'none' }}>
                      {data.phone}
                    </a>
                  ) : (
                    <span style={{ color: '#9AA1B4' }}>Sem telemóvel</span>
                  )}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={14} style={{ color: '#6A7186' }} />
                  {data.email ?? <span style={{ color: '#9AA1B4' }}>Sem email</span>}
                </span>
              </div>
              <Button type='button' variant='secondary' onClick={startEdit}>
                <Pencil size={14} style={{ marginRight: 6 }} />
                Editar
              </Button>
            </div>
          )}

          {/* Saldo */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...box, flex: '1 1 150px' }}>
              <p style={label}>Em dívida</p>
              <p style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color: data.dueCents > 0 ? '#B3261E' : '#0F7B4D' }}>{formatCents(data.dueCents)}</p>
            </div>
            <div style={{ ...box, flex: '1 1 150px' }}>
              <p style={label}>Por faturar</p>
              <p style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color: data.unbilledCents > 0 ? '#B26A00' : '#1B2A6B' }}>
                {formatCents(data.unbilledCents)}
                {data.unbilledCount > 0 && (
                  <span style={{ marginLeft: 6, fontSize: '12px', fontWeight: 500, color: '#6A7186' }}>
                    {data.unbilledCount} ato{data.unbilledCount === 1 ? '' : 's'}
                  </span>
                )}
              </p>
            </div>
            <div style={{ ...box, flex: '1 1 150px' }}>
              <p style={label}>Última consulta</p>
              <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 700, color: '#1B2A6B' }}>{data.lastVisitLabel ?? '—'}</p>
            </div>
          </div>

          {/* Próximas marcações */}
          <div>
            <p style={{ ...label, marginBottom: 6 }}>Próximas marcações</p>
            {data.upcoming.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>Sem marcações futuras.</p>
            ) : (
              <div style={{ border: '1px solid #EEF1F8', borderRadius: '10px', overflow: 'hidden' }}>
                {data.upcoming.map((a, i) => (
                  <div key={a.id} style={{ padding: '8px 12px', fontSize: '13px', borderTop: i === 0 ? 'none' : '1px solid #F4F6FB', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: '#1B2A6B', fontWeight: 700 }}>{a.whenLabel}</span>
                    <span style={{ color: '#3D4257' }}>
                      {a.treatmentName} · {a.doctorName}
                      {a.clinicLabel && ` · ${a.clinicLabel}`} · {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Atalhos — nova aba: a agenda fica aberta */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
            <Link
              href={`/admin/pacientes/${data.id}`}
              target='_blank'
              rel='noopener'
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: '10px', border: '1px solid #D8DEEF', fontSize: '13px', fontWeight: 600, color: '#1B2A6B', textDecoration: 'none' }}
            >
              <ExternalLink size={14} /> Abrir ficha completa
            </Link>
            <Link
              href={`/admin/pacientes/${data.id}?tab=conta`}
              target='_blank'
              rel='noopener'
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: '10px', border: '1px solid #D8DEEF', fontSize: '13px', fontWeight: 600, color: '#1B2A6B', textDecoration: 'none' }}
            >
              <ReceiptEuro size={14} /> Conta-corrente
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
