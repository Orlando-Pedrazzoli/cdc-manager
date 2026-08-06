// 📄 src/components/pacientes/DocumentsTab.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: separador Documentos
// -----------------------------------------------------------------------------
// Upload em 3 passos (ver actions/documents.ts): ticket → POST direto ao
// Cloudinary (fora da Vercel — sem limite de body) → registo verificado.
// Grelha de cartões com thumbnail assinada (gerada server-side na página),
// "Ver" (preview assinado em novo separador), "Transferir" (URL com
// expiração 10 min, pedida on-demand — fica auditada) e "Anular" com
// motivo obrigatório (never delete).
//
// Partilhado: a ficha admin E a área do doutor renderizam este componente.
// =============================================================================

'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Ban,
  Download,
  ExternalLink,
  FileText,
  UploadCloud,
} from 'lucide-react';
import {
  createDocumentUploadTicketAction,
  registerDocumentAction,
  getDocumentDownloadUrlAction,
  voidDocumentAction,
} from '@/actions/documents';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  type DocumentCategory,
} from '@/lib/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/Input';

// Limite do plano free do Cloudinary (image e raw): ficheiros maiores
// falhariam no upload — avisar ANTES com mensagem útil
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface DocumentItem {
  id: string;
  category: DocumentCategory;
  title: string;
  /** thumbnail assinada (só image; null para raw/DICOM) */
  thumbUrl: string | null;
  /** preview grande assinado (só image; null para raw/DICOM) */
  previewUrl: string | null;
  format: string | null;
  bytes: number;
  visibleToPatient: boolean;
  uploadedByName: string;
  createdAtLabel: string;
  note: string | null;
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// =============================================================================
// Modal de upload
// =============================================================================
function UploadModal({
  patientId,
  open,
  onClose,
}: {
  patientId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('xray');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [visibleToPatient, setVisibleToPatient] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error(
        `Ficheiro com ${humanSize(f.size)} — o máximo é 10 MB. Reduza a resolução ou exporte em JPEG.`,
        { duration: 8000 },
      );
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    setNote('');
    setCategory('xray');
    setVisibleToPatient(false);
  };

  const submit = async () => {
    if (!file || pending) return;
    setPending(true);
    try {
      // 1. Ticket assinado (documentId + assinatura)
      const ticket = await createDocumentUploadTicketAction({ patientId });
      if (!ticket.ok) {
        toast.error(ticket.error, { duration: 8000 });
        return;
      }

      // 2. Upload DIRETO ao Cloudinary
      const fd = new FormData();
      fd.append('file', file);
      for (const [key, value] of Object.entries(ticket.ticket.fields)) {
        fd.append(key, String(value));
      }
      const upload = await fetch(ticket.ticket.uploadUrl, {
        method: 'POST',
        body: fd,
      });
      if (!upload.ok) {
        toast.error('O upload falhou — verifique a ligação e tente de novo.', {
          duration: 8000,
        });
        return;
      }

      // 3. Registo verificado (o server confirma o asset no Cloudinary)
      const reg = new FormData();
      reg.append('documentId', ticket.documentId);
      reg.append('patientId', patientId);
      reg.append('category', category);
      reg.append('title', title);
      reg.append('note', note);
      reg.append('visibleToPatient', visibleToPatient ? 'true' : 'false');
      const result = await registerDocumentAction(reg);
      if (!result.ok) {
        toast.error(result.error, { duration: 8000 });
        return;
      }

      toast.success('Documento carregado', { duration: 4000 });
      reset();
      onClose();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title='Carregar documento'
      footer={
        <>
          <Button variant='ghost' onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!file || pending}>
            {pending ? 'A carregar…' : 'Carregar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? '#2743A6' : '#D8DEEF'}`,
            borderRadius: '10px',
            padding: '22px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: dragOver ? '#F5F8FF' : '#FAFBFE',
          }}
        >
          <input
            ref={fileInputRef}
            type='file'
            accept='image/*,application/pdf,.dcm'
            style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              pickFile(e.target.files?.[0] ?? null)
            }
          />
          <UploadCloud
            size={26}
            style={{ color: '#2743A6', marginBottom: 6 }}
          />
          {file ? (
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: '#1B2A6B',
              }}
            >
              {file.name}{' '}
              <span style={{ color: '#6A7186', fontWeight: 400 }}>
                ({humanSize(file.size)})
              </span>
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
              Arraste um ficheiro ou clique para escolher
              <br />
              <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
                Imagens, PDF ou DICOM (.dcm) · máx. 10 MB
              </span>
            </p>
          )}
        </div>

        <Select
          label='Categoria'
          value={category}
          onChange={e => setCategory(e.target.value as DocumentCategory)}
        >
          {DOCUMENT_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>

        <Input
          label='Título'
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={160}
          placeholder='Ex.: RX periapical 21 — controlo'
          help='Se ficar vazio, usa-se o nome do ficheiro'
        />

        <Textarea
          label='Nota (opcional)'
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={300}
          rows={2}
        />

        <Checkbox
          label='Visível ao paciente no portal'
          checked={visibleToPatient}
          onChange={e => setVisibleToPatient(e.target.checked)}
        />
      </div>
    </Modal>
  );
}

// =============================================================================
// Modal de anulação (motivo obrigatório — never delete)
// =============================================================================
function VoidModal({
  doc,
  onClose,
}: {
  doc: DocumentItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!doc || pending) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.append('documentId', doc.id);
      fd.append('reason', reason);
      const res = await voidDocumentAction(fd);
      if (!res.ok) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      toast.success('Documento anulado', { duration: 4000 });
      setReason('');
      onClose();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={Boolean(doc)}
      onClose={() => {
        if (!pending) onClose();
      }}
      title='Anular documento'
      footer={
        <>
          <Button variant='ghost' onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant='danger' onClick={submit} disabled={pending}>
            {pending ? 'A anular…' : 'Anular'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#3D4257' }}>
          Anular <strong style={{ color: '#1B2A6B' }}>{doc?.title}</strong>?
          Nada é apagado — o documento sai da ficha e a anulação fica registada
          com autor e motivo.
        </p>
        <Textarea
          label='Motivo'
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder='Ex.: carregado na ficha errada'
        />
      </div>
    </Modal>
  );
}

// =============================================================================
// Tab principal
// =============================================================================
export function DocumentsTab({
  patientId,
  documents,
}: {
  patientId: string;
  documents: DocumentItem[];
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [voiding, setVoiding] = useState<DocumentItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (doc: DocumentItem) => {
    if (downloadingId) return;
    setDownloadingId(doc.id);
    try {
      const res = await getDocumentDownloadUrlAction({ documentId: doc.id });
      if (!res.ok) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      window.location.href = res.url; // attachment → transfere sem navegar
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          {documents.length === 0
            ? 'Sem documentos nesta ficha.'
            : `${documents.length} documento${documents.length === 1 ? '' : 's'}`}
        </p>
        <Button size='sm' onClick={() => setUploadOpen(true)}>
          <UploadCloud size={15} />
          Carregar
        </Button>
      </div>

      {documents.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '12px',
          }}
        >
          {documents.map(doc => (
            <div
              key={doc.id}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EEF1F8',
                borderRadius: '12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Thumbnail / ícone */}
              <div
                style={{
                  height: '140px',
                  backgroundColor: '#F4F6FB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {doc.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica; next/image não se aplica
                  <img
                    src={doc.thumbUrl}
                    alt={doc.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <FileText size={34} style={{ color: '#9AA1B4' }} />
                )}
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  flex: 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Badge variant='info'>
                    {DOCUMENT_CATEGORY_LABEL[doc.category]}
                  </Badge>
                  {doc.visibleToPatient && (
                    <Badge variant='success'>Portal</Badge>
                  )}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1B2A6B',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={doc.title}
                >
                  {doc.title}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
                  {[
                    doc.format ? doc.format.toUpperCase() : null,
                    doc.bytes > 0 ? humanSize(doc.bytes) : null,
                    doc.createdAtLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  <br />
                  {doc.uploadedByName}
                </p>
                {doc.note && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                    {doc.note}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: 'auto',
                    paddingTop: '4px',
                  }}
                >
                  {doc.previewUrl && (
                    <a
                      href={doc.previewUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#2743A6',
                        textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={14} />
                      Ver
                    </a>
                  )}
                  <button
                    type='button'
                    onClick={() => download(doc)}
                    disabled={downloadingId === doc.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#2743A6',
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      cursor: downloadingId === doc.id ? 'default' : 'pointer',
                      opacity: downloadingId === doc.id ? 0.5 : 1,
                    }}
                  >
                    <Download size={14} />
                    {downloadingId === doc.id ? 'A gerar…' : 'Transferir'}
                  </button>
                  <button
                    type='button'
                    onClick={() => setVoiding(doc)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#B3261E',
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      marginLeft: 'auto',
                    }}
                  >
                    <Ban size={14} />
                    Anular
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadModal
        patientId={patientId}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
      <VoidModal doc={voiding} onClose={() => setVoiding(null)} />
    </div>
  );
}
