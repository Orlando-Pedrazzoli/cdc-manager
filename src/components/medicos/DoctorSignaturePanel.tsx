// 📄 src/components/medicos/DoctorSignaturePanel.tsx
// =============================================================================
// CDC Manager — Assinatura do médico para os documentos (respostas de 25/11, A8)
// -----------------------------------------------------------------------------
// Na ficha do médico, só para a gestão: carregar, ver e remover a imagem da
// assinatura que sai impressa nos documentos. Fechado por omissão.
// =============================================================================

'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  removeDoctorSignatureAction,
  uploadDoctorSignatureAction,
  type DoctorSignatureState,
} from '@/actions/doctor-signature';

export default function DoctorSignaturePanel({
  doctorId,
  signatureDataUrl,
  updatedAtLabel,
}: {
  doctorId: string;
  /** Imagem guardada (data URL), ou null se ainda não há */
  signatureDataUrl: string | null;
  updatedAtLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, startRemove] = useTransition();
  const [, action, pending] = useActionState<DoctorSignatureState, FormData>(
    async (prev, formData) => {
      const result = await uploadDoctorSignatureAction(prev, formData);
      if (result && 'error' in result) toast.error(result.error, { duration: 7000 });
      if (result && 'success' in result) {
        toast.success('Assinatura guardada. Sai nos próximos documentos deste médico.', {
          duration: 6000,
        });
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  const remove = () => {
    startRemove(async () => {
      const res = await removeDoctorSignatureAction(doctorId);
      if ('error' in res) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      toast.success('Assinatura removida.');
      router.refresh();
    });
  };

  const has = !!signatureDataUrl;
  return (
    <div
      style={{
        marginTop: '14px',
        border: '1px solid #EEF1F8',
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1B2A6B' }}>
            Assinatura nos documentos
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6A7186' }}>
            {has
              ? `Carregada${updatedAtLabel ? ` a ${updatedAtLabel}` : ''}. Sai impressa nos documentos emitidos por este médico.`
              : 'Sem assinatura carregada: os documentos saem com a linha para assinar à mão.'}
          </p>
        </div>
        <button
          type='button'
          onClick={() => setOpen(o => !o)}
          style={{
            border: '1px solid #D8DEEF',
            backgroundColor: '#FFFFFF',
            color: '#1B2A6B',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {open ? 'Fechar' : has ? 'Ver ou substituir' : 'Carregar assinatura'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {has && (
            <div
              style={{
                border: '1px dashed #D8DEEF',
                borderRadius: '10px',
                padding: '10px',
                backgroundColor: '#FFFFFF',
                textAlign: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureDataUrl ?? ''}
                alt='Assinatura guardada'
                style={{ maxWidth: '100%', maxHeight: 110 }}
              />
            </div>
          )}
          <form action={action} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type='hidden' name='doctorId' value={doctorId} />
            <input
              type='file'
              name='signature'
              accept='image/png,image/jpeg,image/webp'
              required
              style={{ fontSize: '12px', flex: 1, minWidth: 220 }}
            />
            <button
              type='submit'
              disabled={pending}
              style={{
                border: 'none',
                backgroundColor: '#2743A6',
                color: '#FFFFFF',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: pending ? 'default' : 'pointer',
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? 'A guardar…' : has ? 'Substituir' : 'Guardar'}
            </button>
            {has && (
              <button
                type='button'
                onClick={remove}
                disabled={removing}
                style={{
                  border: '1px solid #F1C7C7',
                  backgroundColor: '#FFFFFF',
                  color: '#B42318',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: removing ? 'default' : 'pointer',
                }}
              >
                {removing ? 'A remover…' : 'Remover'}
              </button>
            )}
          </form>
          <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
            Fotografia ou digitalização da assinatura em papel branco, a caneta
            escura (PNG ou JPEG, até 800 KB). As margens são aparadas
            automaticamente. Documentos já emitidos não mudam.
          </p>
        </div>
      )}
    </div>
  );
}
