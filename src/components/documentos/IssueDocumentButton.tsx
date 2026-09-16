// 📄 src/components/documentos/IssueDocumentButton.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: "Emitir documento" (Fase 5A, E14/P14)
// -----------------------------------------------------------------------------
// 1. Escolher o modelo (só os que o utilizador pode emitir)
// 2. Campos extra quando o modelo os usa: dias (atestado), acompanhante,
//    tratamento, consulta (para hora de início/fim)
// 3. Texto já preenchido, EDITÁVEL — o médico escreve o que falta
// 4. Assinatura no ecrã se o modelo exigir
// 5. Gerar PDF → fica nos Documentos do paciente (e abre)
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FilePlus2, FileCheck2 } from 'lucide-react';
import {
  prepareDocumentAction,
  issueDocumentAction,
  type PreparedDocument,
} from '@/actions/document-templates';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SignaturePad } from '@/components/clinico/SignaturePad';

export interface IssueTemplateOption {
  id: string;
  title: string;
  kind: string;
  needs: string[]; // placeholders usados (para mostrar campos extra)
}
export interface IssueAppointmentOption {
  id: string;
  label: string; // "15/09/2026 14:00 — Consulta de medicina dentária"
}

export function IssueDocumentButton({
  patientId,
  clinicId,
  templates,
  appointments,
  size = 'md',
}: {
  patientId: string;
  clinicId: string | null;
  templates: IssueTemplateOption[];
  appointments: IssueAppointmentOption[];
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [appointmentId, setAppointmentId] = useState(appointments[0]?.id ?? '');
  const [dias, setDias] = useState('1');
  const [acompanhante, setAcompanhante] = useState('');
  const [tratamento, setTratamento] = useState('');
  const [prepared, setPrepared] = useState<PreparedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const tpl = templates.find(t => t.id === templateId) ?? null;
  const needs = (k: string) => tpl?.needs.includes(k) ?? false;

  const prepare = async () => {
    if (!templateId) return;
    setBusy(true);
    const r = await prepareDocumentAction({
      templateId,
      patientId,
      clinicId,
      appointmentId:
        needs('consulta.inicio') ||
        needs('consulta.fim') ||
        needs('consulta.data')
          ? appointmentId || null
          : null,
      extra: { dias, 'acompanhante.nome': acompanhante, tratamento },
    });
    setBusy(false);
    if (r.error || !r.doc) {
      toast.error(r.error ?? 'Erro');
      return;
    }
    setPrepared(r.doc);
    setTitle(r.doc.title);
    // O título do modelo já vai no cabeçalho do PDF; se a 1.ª linha do
    // texto for esse mesmo título em maiúsculas, retira-se para não repetir
    const lines = r.doc.body.split('\n');
    const first = lines[0]?.trim() ?? '';
    setBody(
      first &&
        first === first.toUpperCase() &&
        first.length < 80 &&
        lines[1]?.trim() === ''
        ? lines.slice(2).join('\n')
        : r.doc.body,
    );
    setSignature(null);
  };

  const issue = async () => {
    if (!prepared) return;
    setBusy(true);
    const r = await issueDocumentAction({
      templateId: prepared.templateId,
      patientId,
      clinicId,
      title,
      body,
      signatureDataUrl: signature,
      visibleToPatient: visible,
    });
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success('Documento emitido e guardado nos Documentos do paciente.');
    setOpen(false);
    setPrepared(null);
    router.refresh();
  };

  const reset = () => {
    setPrepared(null);
    setSignature(null);
  };

  return (
    <>
      <Button
        size={size}
        onClick={() => setOpen(true)}
        disabled={templates.length === 0}
        title={
          templates.length === 0
            ? 'Sem modelos disponíveis para o seu perfil'
            : undefined
        }
      >
        <FilePlus2 size={15} style={{ marginRight: 6 }} />
        Emitir documento
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title={
          prepared ? `Rever e emitir — ${prepared.title}` : 'Emitir documento'
        }
        maxWidth={820}
      >
        {!prepared ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Select
              label='Modelo'
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
            {(needs('consulta.data') ||
              needs('consulta.inicio') ||
              needs('consulta.fim')) && (
              <Select
                label='Consulta a que se refere'
                value={appointmentId}
                onChange={e => setAppointmentId(e.target.value)}
                help='Preenche data, hora de início e de fim'
              >
                <option value=''>— Hoje, sem consulta associada —</option>
                {appointments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
              }}
            >
              {needs('dias') && (
                <Input
                  label='Nº de dias'
                  inputMode='numeric'
                  value={dias}
                  onChange={e => setDias(e.target.value)}
                />
              )}
              {needs('acompanhante.nome') && (
                <Input
                  label='Nome do acompanhante'
                  value={acompanhante}
                  onChange={e => setAcompanhante(e.target.value)}
                />
              )}
              {needs('tratamento') && (
                <Input
                  label='Tratamento / ato'
                  value={tratamento}
                  onChange={e => setTratamento(e.target.value)}
                  placeholder='ex.: extração do dente 48'
                />
              )}
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}
            >
              <Button variant='secondary' onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button loading={busy} onClick={prepare} disabled={!templateId}>
                Preencher e rever
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prepared.missing.length > 0 && (
              <p
                style={{
                  margin: 0,
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: '#FFF4E5',
                  color: '#9A6700',
                  fontSize: '12.5px',
                }}
              >
                Campos sem valor na ficha (ficaram como &quot;________&quot;):{' '}
                {prepared.missing.join(', ')}. Complete no texto.
              </p>
            )}
            <Input
              label='Título'
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
            />
            <Textarea
              label='Texto do documento (editável)'
              rows={16}
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ fontSize: '13px', lineHeight: 1.5 }}
            />
            {prepared.requiresSignature && (
              <div>
                <p
                  style={{
                    margin: '0 0 6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1B2A6B',
                  }}
                >
                  Assinatura do paciente / representante legal *
                </p>
                <SignaturePad onChange={setSignature} height={140} />
              </div>
            )}
            <Checkbox
              id='doc-visible'
              label='Visível ao paciente no portal'
              checked={visible}
              onChange={e => setVisible(e.target.checked)}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Button variant='secondary' onClick={reset}>
                ← Voltar
              </Button>
              <Button
                loading={busy}
                onClick={issue}
                disabled={prepared.requiresSignature && !signature}
              >
                <FileCheck2 size={15} style={{ marginRight: 6 }} />
                Gerar PDF e guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
