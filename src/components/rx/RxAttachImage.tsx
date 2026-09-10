// 📄 src/components/rx/RxAttachImage.tsx
// =============================================================================
// CDC Manager — Sala de RX: anexar a imagem captada ao pedido
// -----------------------------------------------------------------------------
// O elo que faltava no circuito clínico (auditoria pós-demo 09/09/2026): o
// operador capta no RVG/Carestream, exporta e anexa AQUI — a imagem entra
// na ficha do paciente (Document 'xray') e no pedido (imageRefs), e o
// médico passa a vê-la no painel de RX da consulta para mostrar ao
// paciente. Anexar também conclui o pedido se ainda estiver aberto.
//
// Upload nos MESMOS 3 passos dos documentos (padrão DocumentsTab):
//   1. ticket assinado  2. POST direto ao Cloudinary  3. registo verificado
// =============================================================================

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { createDocumentUploadTicketAction } from '@/actions/documents';
import { registerRxImageAction } from '@/actions/rx';

export function RxAttachImage({
  requestId,
  patientId,
}: {
  requestId: string;
  patientId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // 1. Ticket assinado (documentId + assinatura)
      const ticket = await createDocumentUploadTicketAction({ patientId });
      if (!ticket.ok) {
        setError(ticket.error);
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
        setError('O upload falhou — verifique a ligação e tente de novo.');
        return;
      }

      // 3. Registo verificado: Document 'xray' + imageRef no pedido + done
      const reg = new FormData();
      reg.append('requestId', requestId);
      reg.append('documentId', ticket.documentId);
      const result = await registerRxImageAction(reg);
      if (result && 'error' in result) {
        setError(result.error);
        return;
      }

      router.refresh();
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}
    >
      <input
        ref={inputRef}
        type='file'
        accept='image/*,.pdf'
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type='button'
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '8px',
          border: '1px solid #C9D4FF',
          padding: '7px 12px',
          fontSize: '13px',
          fontWeight: 600,
          color: pending ? '#8FA0DC' : '#2743A6',
          backgroundColor: '#F5F8FF',
          cursor: pending ? 'default' : 'pointer',
        }}
      >
        <ImagePlus size={14} />
        {pending ? 'A carregar…' : 'Anexar imagem'}
      </button>
      {error && (
        <span style={{ fontSize: '12px', color: '#B3261E' }}>{error}</span>
      )}
    </div>
  );
}
