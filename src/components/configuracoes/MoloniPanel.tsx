// 📄 src/components/configuracoes/MoloniPanel.tsx
// CDC Manager — Configurações: Integração Moloni (Fase 7A) — estado + teste
'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plug } from 'lucide-react';
import { testMoloniConnectionAction } from '@/actions/moloni';
import { Button } from '@/components/ui/Button';

type Data = NonNullable<
  Awaited<ReturnType<typeof testMoloniConnectionAction>>['data']
>;

export function MoloniPanel({
  configured,
  ready,
  present,
}: {
  configured: boolean;
  ready: boolean;
  present: Record<string, boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const li = (k: string, ok: boolean) => (
    <li key={k} style={{ fontSize: 12.5, color: ok ? '#0F7B4D' : '#B26A00' }}>
      {ok ? '✓' : '○'} {k}
    </li>
  );
  const list = (
    title: string,
    rows: { id: number | string; name: string }[],
  ) => (
    <div
      key={title}
      style={{
        border: '1px solid #EEF1F8',
        borderRadius: 10,
        padding: '8px 12px',
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontSize: 12,
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        {title}
      </p>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9AA1B4' }}>—</p>
      ) : (
        rows.map(r => (
          <p
            key={String(r.id)}
            style={{ margin: 0, fontSize: 12.5, color: '#3D4257' }}
          >
            <code style={{ color: '#2743A6' }}>{r.id}</code> · {r.name}
          </p>
        ))
      )}
    </div>
  );
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: '#1B2A6B',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Plug size={16} /> Integração Moloni (faturação certificada)
        </h2>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 999,
            backgroundColor: ready
              ? '#EDF9F2'
              : configured
                ? '#FFF4E5'
                : '#F4F6FB',
            color: ready ? '#0F7B4D' : configured ? '#9A6700' : '#6A7186',
          }}
        >
          {ready
            ? 'Ativa — emissão automática'
            : configured
              ? 'Credenciais OK — faltam IDs de emissão'
              : 'Não configurada'}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#6A7186' }}>
        As credenciais vivem nas variáveis de ambiente (Vercel), nunca na base
        de dados. Enquanto não estiver ativa, as cobranças ficam «Aguarda
        emissão» e emitem-se depois.
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, columns: 2 }}>
        {Object.entries(present).map(([k, ok]) => li(k, ok))}
      </ul>
      {configured && (
        <div>
          <Button
            size='sm'
            variant='outline'
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await testMoloniConnectionAction();
              setBusy(false);
              if (r.error || !r.data) {
                toast.error(r.error ?? 'Erro');
                return;
              }
              setData(r.data);
              toast.success('Ligação ao Moloni OK.');
            }}
          >
            Testar ligação e listar IDs
          </Button>
        </div>
      )}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10,
          }}
        >
          {list(
            'Empresas → MOLONI_COMPANY_ID',
            data.companies.map(c => ({
              id: c.company_id,
              name: `${c.name} (${c.vat})`,
            })),
          )}
          {list(
            'Séries → MOLONI_DOCUMENT_SET_ID / MOLONI_CREDIT_SET_ID',
            data.documentSets.map(s => ({
              id: s.document_set_id,
              name: s.name,
            })),
          )}
          {list(
            'Categorias → MOLONI_CATEGORY_ID',
            data.categories.map(c => ({ id: c.category_id, name: c.name })),
          )}
          {list(
            'Unidades → MOLONI_UNIT_ID',
            data.units.map(u => ({ id: u.unit_id, name: u.name })),
          )}
          {list(
            'Meios de pagamento → MOLONI_PAYMENT_METHODS (JSON cash/card/mbway/transfer)',
            data.paymentMethods.map(m => ({
              id: m.payment_method_id,
              name: m.name,
            })),
          )}
          {list(
            'Isenções → MOLONI_EXEMPTION_REASON',
            data.exemptions.map(e => ({ id: e.code, name: e.name })),
          )}
        </div>
      )}
    </div>
  );
}
