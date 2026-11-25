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
// 3.ª reunião (out/2026): nos modelos com assinatura, "Enviar para o
// tablet" manda o texto já revisto para o tablet da clínica; o PDF é gerado
// quando o paciente assina lá (mesmo núcleo: src/lib/signing.ts).
// =============================================================================

'use client';

import { stripTitleLine } from '@/lib/document-merge';
import { isTimeLockedKind } from '@/lib/data/document-templates';
import { useCallback, useState } from 'react';
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
import {
  TEMPLATE_FOLDER_LABEL,
  type TemplateFolder,
} from '@/lib/data/document-templates';
import { TabletSignature } from '@/components/documentos/TabletSignature';
import { createTemplateSignatureRequestAction } from '@/actions/signature-requests';

export interface IssueTemplateOption {
  id: string;
  title: string;
  kind: string;
  /** 8.ª ronda/06: pasta (especialidade); sem pasta = Geral */
  folder?: TemplateFolder;
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
  // 8.ª ronda/06 (Victor, 17/11/2026): o modelo abre em "Padrão" — o texto
  // tal como a clínica o definiu, só para imprimir ou assinar. A aba
  // "Editável" deixa acrescentar ou tirar informação para este paciente
  // (um dente, uma orientação específica) sem mexer no modelo.
  const [mode, setMode] = useState<'padrao' | 'editavel'>('padrao');
  const [standard, setStandard] = useState({ title: '', body: '' });
  const [signature, setSignature] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const tpl = templates.find(t => t.id === templateId) ?? null;
  const needs = (k: string) => tpl?.needs.includes(k) ?? false;

  const usesAppointment =
    needs('consulta.inicio') ||
    needs('consulta.fim') ||
    needs('consulta.data') ||
    isTimeLockedKind(tpl?.kind);
  const extra = { dias, 'acompanhante.nome': acompanhante, tratamento };
  const prepare = async () => {
    if (!templateId) return;
    setBusy(true);
    const r = await prepareDocumentAction({
      templateId,
      patientId,
      clinicId,
      appointmentId: usesAppointment ? appointmentId || null : null,
      extra,
    });
    setBusy(false);
    if (r.error || !r.doc) {
      toast.error(r.error ?? 'Erro');
      return;
    }
    setPrepared(r.doc);
    setTitle(r.doc.title);
    // O título do modelo já vai no cabeçalho do PDF (não repetir)
    const cleanBody = stripTitleLine(r.doc.body);
    setBody(cleanBody);
    setStandard({ title: r.doc.title, body: cleanBody });
    // Campos em falta na ficha têm de ser completados à mão → Editável
    // (os comprovativos de presença nunca são editáveis — 9.ª ronda/20)
    setMode(r.doc.missing.length > 0 && !r.doc.locked ? 'editavel' : 'padrao');
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
      // 9.ª ronda/20: o servidor refaz o texto dos comprovativos de presença
      appointmentId: usesAppointment ? appointmentId || null : null,
      extra,
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
    setMode('padrao');
  };

  /** Voltar a "Padrão" repõe o texto do modelo (o que foi escrito perde-se) */
  const switchMode = (next: 'padrao' | 'editavel') => {
    if (next === mode) return;
    if (next === 'padrao') {
      setTitle(standard.title);
      setBody(standard.body);
      // a assinatura foi dada sobre outro texto
      setSignature(null);
    }
    setMode(next);
  };
  const edited =
    mode === 'editavel' &&
    (title !== standard.title || body !== standard.body);

  // Modelos agrupados por pasta, pela ordem em que chegam
  const folderGroups: { folder: TemplateFolder; items: IssueTemplateOption[] }[] = [];
  for (const t of templates) {
    const f = t.folder ?? 'geral';
    const g = folderGroups.find(x => x.folder === f);
    if (g) g.items.push(t);
    else folderGroups.push({ folder: f, items: [t] });
  }

  // Tablet: envia o texto JÁ REVISTO; o documento é gerado ao assinar lá
  const sendToTablet = useCallback(
    (tabletClinicId: string) =>
      prepared
        ? createTemplateSignatureRequestAction({
            templateId: prepared.templateId,
            patientId,
            clinicId: tabletClinicId,
            title,
            body,
            visibleToPatient: visible,
          })
        : Promise.resolve({ error: 'Prepare o documento primeiro.' }),
    [prepared, patientId, title, body, visible],
  );
  const onTabletSigned = useCallback(() => {
    toast.success('Documento assinado no tablet e guardado nos Documentos.');
    setOpen(false);
    setPrepared(null);
    setSignature(null);
    router.refresh();
  }, [router]);

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
              {folderGroups.map(g => (
                <optgroup key={g.folder} label={TEMPLATE_FOLDER_LABEL[g.folder]}>
                  {g.items.map(t => (
                    <option key={t.id} value={t.id}>
                      ({TEMPLATE_FOLDER_LABEL[g.folder]}) {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {usesAppointment && (
              <Select
                label='Consulta a que se refere'
                value={appointmentId}
                onChange={e => setAppointmentId(e.target.value)}
                help='Preenche a data e as horas de entrada e de saída registadas no sistema'
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
                {prepared.missing.join(', ')}.{' '}
                {prepared.locked
                  ? 'Corrija na ficha do paciente e volte a preparar.'
                  : 'Complete no texto.'}
              </p>
            )}
            {/* 9.ª ronda/20: comprovativo de presença — horas do sistema */}
            {prepared.locked && (
              <p
                role='note'
                style={{
                  margin: 0,
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: prepared.recordedTimes ? '#EEF1F8' : '#FFF4E5',
                  color: prepared.recordedTimes ? '#1B2A6B' : '#9A6700',
                  fontSize: '12.5px',
                }}
              >
                {prepared.recordedTimes
                  ? 'As horas de entrada e de saída são as registadas no sistema. Este comprovativo não pode ser editado.'
                  : 'Esta consulta não tem a entrada e a saída registadas no sistema: o comprovativo usa o horário marcado. Não pode ser editado.'}
              </p>
            )}
            {/* 8.ª ronda/06: Padrão (texto fixo) ou Editável */}
            {!prepared.locked && (
            <div
              role='tablist'
              aria-label='Modo do documento'
              style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
            >
              {(
                [
                  ['padrao', 'Modelo padrão'],
                  ['editavel', 'Editável'],
                ] as const
              ).map(([value, label]) => {
                const active = mode === value;
                return (
                  <button
                    key={value}
                    type='button'
                    role='tab'
                    aria-selected={active}
                    onClick={() => switchMode(value)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '10px',
                      border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                      backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#3A3F4A',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <span style={{ fontSize: '12px', color: '#6A7186' }}>
                {mode === 'padrao'
                  ? 'Texto do modelo, sem alterações. Para acrescentar ou tirar informação, use "Editável".'
                  : edited
                    ? 'Texto alterado só para este documento. O modelo não muda.'
                    : 'Pode alterar o título e o texto só para este documento.'}
              </span>
            </div>
            )}
            {mode === 'padrao' ? (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
                  {title}
                </p>
                <div
                  style={{
                    maxHeight: 380,
                    overflowY: 'auto',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #E3E7F2',
                    backgroundColor: '#F7F8FC',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: '#1C2233',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {body}
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
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
                <div style={{ marginTop: 10 }}>
                  <TabletSignature
                    onCreate={sendToTablet}
                    onSigned={onTabletSigned}
                    disabled={busy || title.trim().length < 3}
                  />
                </div>
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
