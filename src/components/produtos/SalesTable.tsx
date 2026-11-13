// 📄 src/components/produtos/SalesTable.tsx
// =============================================================================
// CDC Manager — Produtos: vendas recentes (7.ª ronda/B2b)
// -----------------------------------------------------------------------------
// Cada venda com quem vendeu, o que foi, o total e o IVA. A venda não emite
// fatura: a coluna "Documento" serve para anotar o n.º quando for passada.
// Anular (com motivo) é só da gestão; a venda anulada fica na lista, riscada.
// =============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  setSaleFiscalDocumentAction,
  voidProductSaleAction,
} from '@/actions/product-sales';
import { formatEuro } from '@/lib/product-sales';

export interface SaleRow {
  id: string;
  whenLabel: string;
  clinic: string;
  patientId: string | null;
  patientName: string | null;
  items: string;
  totalCents: number;
  vatCents: number;
  payment: string;
  soldBy: string;
  note: string | null;
  fiscalDocument: string | null;
  voided: { by: string; reason: string } | null;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#8A91A6',
  borderBottom: '1px solid #EEF1F8',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '13px',
  color: '#1C2233',
  borderBottom: '1px solid #F4F6FB',
  verticalAlign: 'top',
};
const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: '12px',
  fontWeight: 700,
  color: '#2743A6',
  cursor: 'pointer',
};

export function SalesTable({ sales, isAdmin }: { sales: SaleRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const setDocument = async (s: SaleRow) => {
    const value = window.prompt(
      'N.º do documento fiscal desta venda (deixe vazio para remover):',
      s.fiscalDocument ?? '',
    );
    if (value === null) return;
    setBusy(s.id);
    const res = await setSaleFiscalDocumentAction(s.id, value);
    setBusy(null);
    if (res.error) toast.error(res.error);
    else router.refresh();
  };

  const voidSale = async (s: SaleRow) => {
    const reason = window.prompt(
      `Anular a venda de ${formatEuro(s.totalCents)}? Escreva o motivo:`,
    );
    if (reason === null) return;
    setBusy(s.id);
    const res = await voidProductSaleAction(s.id, reason);
    setBusy(null);
    if (res.error) toast.error(res.error);
    else {
      toast.success('Venda anulada.');
      router.refresh();
    }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Data</th>
            <th style={th}>Produtos</th>
            <th style={th}>Paciente</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
            <th style={th}>Pagamento</th>
            <th style={th}>Vendido por</th>
            <th style={th}>Documento</th>
            {isAdmin && <th style={th} />}
          </tr>
        </thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id} style={{ opacity: s.voided ? 0.55 : 1 }}>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {s.whenLabel}
                <div style={{ fontSize: '11px', color: '#8A91A6' }}>{s.clinic}</div>
              </td>
              <td style={td}>
                <span style={{ textDecoration: s.voided ? 'line-through' : 'none' }}>
                  {s.items}
                </span>
                {s.note && (
                  <div style={{ fontSize: '12px', color: '#6A7186' }}>Obs.: {s.note}</div>
                )}
                {s.voided && (
                  <div style={{ fontSize: '12px', color: '#B3261E' }}>
                    Anulada por {s.voided.by}: {s.voided.reason}
                  </div>
                )}
              </td>
              <td style={td}>
                {s.patientId ? (
                  <Link
                    href={`/admin/pacientes/${s.patientId}`}
                    style={{ color: '#2743A6', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {s.patientName}
                  </Link>
                ) : (
                  <span style={{ color: '#8A91A6' }}>Sem ficha</span>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <strong>{formatEuro(s.totalCents)}</strong>
                <div style={{ fontSize: '11px', color: '#8A91A6' }}>
                  IVA {formatEuro(s.vatCents)}
                </div>
              </td>
              <td style={td}>{s.payment}</td>
              <td style={td}>{s.soldBy}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {s.voided ? (
                  '—'
                ) : (
                  <>
                    {s.fiscalDocument ? (
                      <span>{s.fiscalDocument} </span>
                    ) : (
                      <span style={{ color: '#9A6700', fontWeight: 700 }}>Por faturar </span>
                    )}
                    <button
                      type='button'
                      style={linkBtn}
                      disabled={busy === s.id}
                      onClick={() => setDocument(s)}
                    >
                      {s.fiscalDocument ? 'alterar' : 'anotar n.º'}
                    </button>
                  </>
                )}
              </td>
              {isAdmin && (
                <td style={{ ...td, textAlign: 'right' }}>
                  {!s.voided && (
                    <button
                      type='button'
                      style={{ ...linkBtn, color: '#B3261E' }}
                      disabled={busy === s.id}
                      onClick={() => voidSale(s)}
                    >
                      Anular
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
