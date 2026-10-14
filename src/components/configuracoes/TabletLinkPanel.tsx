// 📄 src/components/configuracoes/TabletLinkPanel.tsx
// =============================================================================
// CDC Manager — Configurações → Clínicas: tablet de assinatura
// -----------------------------------------------------------------------------
// Admin liga o tablet da clínica: gera o token e mostra a ligação de
// ativação (uma vez; abrir no tablet grava a cookie e leva a /quiosque).
// "Gerar nova ligação" invalida o tablet anterior; "Desligar" remove o
// tablet (os botões "Enviar para o tablet" deixam de aparecer).
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { TabletSmartphone, Copy, Unlink } from 'lucide-react';
import {
  linkTabletAction,
  unlinkTabletAction,
} from '@/actions/signature-requests';
import { Button } from '@/components/ui/Button';

export function TabletLinkPanel({
  clinicId,
  clinicName,
  linkedAtLabel,
}: {
  clinicId: string;
  clinicName: string;
  /** null = sem tablet ligado */
  linkedAtLabel: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = async () => {
    if (
      linkedAtLabel &&
      !confirm(
        `Gerar nova ligação para ${clinicName}? O tablet atualmente ligado deixa de funcionar até abrir a nova ligação.`,
      )
    )
      return;
    setBusy(true);
    const r = await linkTabletAction(clinicId);
    setBusy(false);
    if (r.error || !r.url) {
      toast.error(r.error ?? 'Erro');
      return;
    }
    setUrl(`${window.location.origin}${r.url}`);
    router.refresh();
  };

  const unlink = async () => {
    if (!confirm(`Desligar o tablet de ${clinicName}?`)) return;
    setBusy(true);
    const r = await unlinkTabletAction(clinicId);
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setUrl(null);
    toast.success('Tablet desligado.');
    router.refresh();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ligação copiada.');
    } catch {
      toast.error('Não foi possível copiar — selecione e copie manualmente.');
    }
  };

  return (
    <section
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TabletSmartphone size={18} color='#2743A6' />
        <h2
          style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1B2A6B' }}
        >
          Tablet de assinatura
        </h2>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 999,
            backgroundColor: linkedAtLabel ? '#E6F4EC' : '#F1F3F9',
            color: linkedAtLabel ? '#0F7B4D' : '#6A7186',
          }}
        >
          {linkedAtLabel ? `Ligado · ${linkedAtLabel}` : 'Sem tablet'}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#6A7186', lineHeight: 1.5 }}>
        O paciente assina o RGPD e os consentimentos no tablet ao balcão. Gere a
        ligação, abra-a <strong>uma vez</strong> no Chrome do tablet e adicione
        a página <code>/quiosque</code> ao ecrã inicial. Um tablet por clínica.
      </p>

      {url && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            backgroundColor: '#FFF7E6',
            border: '1px solid #F5C77A',
          }}
        >
          <code
            style={{
              flex: 1,
              fontSize: 12,
              color: '#7A4B00',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {url}
          </code>
          <Button size='sm' variant='outline' onClick={copy}>
            <Copy size={14} style={{ marginRight: 6 }} />
            Copiar
          </Button>
        </div>
      )}
      {url && (
        <p style={{ margin: 0, fontSize: 12, color: '#9A6700' }}>
          Esta ligação só é mostrada agora. Quem a tiver consegue ligar um
          tablet a esta clínica — não a partilhe fora da equipa.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size='sm' onClick={link} loading={busy}>
          <TabletSmartphone size={14} style={{ marginRight: 6 }} />
          {linkedAtLabel ? 'Gerar nova ligação' : 'Ligar tablet'}
        </Button>
        {linkedAtLabel && (
          <Button size='sm' variant='outline' onClick={unlink} disabled={busy}>
            <Unlink size={14} style={{ marginRight: 6 }} />
            Desligar
          </Button>
        )}
      </div>
    </section>
  );
}
