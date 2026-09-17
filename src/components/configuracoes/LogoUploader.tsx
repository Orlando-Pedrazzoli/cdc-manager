// 📄 src/components/configuracoes/LogoUploader.tsx
// =============================================================================
// CDC Manager — Configurações › Organização: upload do logo
// -----------------------------------------------------------------------------
// Client Component com o SEU PRÓPRIO <form> (separado do OrganizationForm,
// que grava os campos de texto): escolher ficheiro → submete logo, sem
// botão extra. Pré-visualização local antes do upload terminar; toast no
// fim e router.refresh() para o BrandMark das sidebars apanhar o novo URL.
// Regras espelhadas do servidor: PNG/JPEG/WebP/SVG, ≤ 800 KB.
// =============================================================================

'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Building2, Upload, Trash2 } from 'lucide-react';
import {
  uploadOrganizationLogoAction,
  removeOrganizationLogoAction,
  type OrganizationActionState,
} from '@/actions/organization';

const MAX_BYTES = 800 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export function LogoUploader({
  logoUrl,
  primaryColor,
}: {
  logoUrl: string | null;
  primaryColor: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  const [, upload, uploading] = useActionState<
    OrganizationActionState,
    FormData
  >(async (prev, formData) => {
    const result = await uploadOrganizationLogoAction(prev, formData);
    if (result && 'error' in result) {
      toast.error(result.error, { duration: 7000 });
      setLocalPreview(null);
    }
    if (result && 'success' in result) {
      toast.success('Logo atualizado', { duration: 4000 });
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = '';
    return result;
  }, undefined);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('O logo tem de ter no máximo 800 KB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setLocalPreview(URL.createObjectURL(file));
    formRef.current?.requestSubmit();
  };

  const shown = localPreview ?? logoUrl;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        padding: '16px 20px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 72,
          height: 72,
          borderRadius: '14px',
          backgroundColor: primaryColor,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
          }}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt='Logo'
              style={{
                width: 44,
                height: 44,
                objectFit: 'contain',
                opacity: uploading ? 0.5 : 1,
              }}
            />
          ) : (
            <Building2 size={24} style={{ color: primaryColor }} />
          )}
        </span>
      </span>

      <div style={{ flex: 1, minWidth: 200 }}>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          Logo
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6A7186' }}>
          PNG, JPEG, WebP ou SVG · quadrado, fundo transparente · até 800 KB
        </p>
      </div>

      <form ref={formRef} action={upload} style={{ display: 'contents' }}>
        <input
          ref={inputRef}
          type='file'
          name='logo'
          accept={ACCEPT}
          onChange={e => onPick(e.target.files?.[0])}
          style={{ display: 'none' }}
          id='org-logo-file'
        />
        <button
          type='button'
          onClick={() => inputRef.current?.click()}
          disabled={uploading || removing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#2743A6',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading || removing ? 0.6 : 1,
          }}
        >
          <Upload size={15} />
          {uploading ? 'A carregar…' : logoUrl ? 'Substituir' : 'Carregar logo'}
        </button>
      </form>

      {logoUrl && (
        <button
          type='button'
          disabled={uploading || removing}
          onClick={() =>
            startRemove(async () => {
              const r = await removeOrganizationLogoAction();
              if (r && 'error' in r) toast.error(r.error);
              else {
                toast.success('Logo removido');
                setLocalPreview(null);
                router.refresh();
              }
            })
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: '10px',
            border: '1px solid #D8DEEF',
            backgroundColor: '#FFFFFF',
            color: '#B3261E',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            opacity: uploading || removing ? 0.6 : 1,
          }}
        >
          <Trash2 size={15} />
          {removing ? 'A remover…' : 'Remover'}
        </button>
      )}
    </div>
  );
}
