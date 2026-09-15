// 📄 src/app/admin/listagens/[key]/page.tsx
// =============================================================================
// CDC Manager — Uma listagem (Fase 5B): filtros por URL, tabela genérica,
// totais, CSV e impressão. A lógica de cada listagem está em lib/listagens.ts.
// =============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import {
  LISTINGS,
  runListing,
  type ListingKey,
  type ListingParams,
} from '@/lib/listagens';
import { formatCents } from '@/lib/commissions';
import { todayLisbon } from '@/lib/availability';
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton';
import { PrintButton } from '@/components/listagens/PrintButton';

export const dynamic = 'force-dynamic';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export default async function ListagemPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const def = LISTINGS.find(l => l.key === key);
  if (!def) notFound();
  const session = await auth();
  if (
    !session?.user ||
    session.user.role === 'patient' ||
    session.user.role === 'doctor'
  )
    return null;

  await dbConnect();
  const clinics = await getActiveClinics();
  const today = todayLisbon();
  const p: ListingParams = {
    mes: /^\d{4}-\d{2}$/.test(sp.mes ?? '')
      ? (sp.mes as string)
      : today.slice(0, 7),
    from: /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '')
      ? (sp.from as string)
      : `${today.slice(0, 7)}-01`,
    to: /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '') ? (sp.to as string) : today,
    clinicId: clinics.some(c => String(c._id) === sp.clinica)
      ? (sp.clinica as string)
      : null,
    ageMin: sp.idadeMin ? Number(sp.idadeMin) : null,
    ageMax: sp.idadeMax ? Number(sp.idadeMax) : null,
    inactiveMonths: sp.inativo ? Number(sp.inativo) : null,
  };
  const result = await runListing(def.key as ListingKey, p);

  const fmt = (v: string | number | null, kind?: string) =>
    v == null
      ? '—'
      : kind === 'cents'
        ? formatCents(Number(v))
        : kind === 'int'
          ? Number(v).toLocaleString('pt-PT')
          : String(v);
  const csvRows = result.rows.map(r =>
    result.columns.map(c =>
      c.kind === 'cents'
        ? (Number(r[c.key] ?? 0) / 100).toFixed(2).replace('.', ',')
        : String(r[c.key] ?? ''),
    ),
  );
  const subtitle = (() => {
    const parts: string[] = [];
    if (def.filters.includes('mes'))
      parts.push(
        `${MONTHS[Number(p.mes.slice(5, 7)) - 1]} de ${p.mes.slice(0, 4)}`,
      );
    if (def.filters.includes('periodo'))
      parts.push(
        `${p.from.split('-').reverse().join('/')} a ${p.to.split('-').reverse().join('/')}`,
      );
    if (def.filters.includes('clinica'))
      parts.push(
        p.clinicId
          ? (clinics.find(c => String(c._id) === p.clinicId)?.name ?? '')
          : 'ambas as clínicas',
      );
    return parts.join(' · ');
  })();

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
  };
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
  };
  const field: React.CSSProperties = {
    border: '1.5px solid #B9C3E0',
    borderRadius: '8px',
    padding: '7px 10px',
    fontSize: '13px',
    color: '#1B2A6B',
    backgroundColor: '#FBFCFF',
  };
  const btn: React.CSSProperties = {
    border: 'none',
    borderRadius: '8px',
    padding: '8px 14px',
    backgroundColor: '#2743A6',
    color: '#FFFFFF',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '13px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className='no-print'>
        <Link
          href='/admin/listagens'
          style={{ fontSize: '13px', color: '#6A7186', textDecoration: 'none' }}
        >
          ← Listagens
        </Link>
      </div>

      {/* Filtros */}
      {def.filters.length > 0 && (
        <form
          method='get'
          className='no-print'
          style={{
            ...card,
            padding: '12px 16px',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          {def.filters.includes('mes') && (
            <label style={{ fontSize: '12px', color: '#6A7186' }}>
              Mês
              <br />
              <input
                type='month'
                name='mes'
                defaultValue={p.mes}
                style={field}
              />
            </label>
          )}
          {def.filters.includes('periodo') && (
            <>
              <label style={{ fontSize: '12px', color: '#6A7186' }}>
                De
                <br />
                <input
                  type='date'
                  name='from'
                  defaultValue={p.from}
                  style={field}
                />
              </label>
              <label style={{ fontSize: '12px', color: '#6A7186' }}>
                Até
                <br />
                <input
                  type='date'
                  name='to'
                  defaultValue={p.to}
                  style={field}
                />
              </label>
            </>
          )}
          {def.filters.includes('clinica') && (
            <label style={{ fontSize: '12px', color: '#6A7186' }}>
              Clínica
              <br />
              <select
                name='clinica'
                defaultValue={p.clinicId ?? ''}
                style={field}
              >
                <option value=''>Ambas</option>
                {clinics.map(c => (
                  <option key={String(c._id)} value={String(c._id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {def.filters.includes('idade') && (
            <>
              <label style={{ fontSize: '12px', color: '#6A7186' }}>
                Idade mín.
                <br />
                <input
                  type='number'
                  name='idadeMin'
                  min={0}
                  max={120}
                  defaultValue={p.ageMin ?? ''}
                  style={{ ...field, width: 80 }}
                />
              </label>
              <label style={{ fontSize: '12px', color: '#6A7186' }}>
                Idade máx.
                <br />
                <input
                  type='number'
                  name='idadeMax'
                  min={0}
                  max={120}
                  defaultValue={p.ageMax ?? ''}
                  style={{ ...field, width: 80 }}
                />
              </label>
            </>
          )}
          {def.filters.includes('inatividade') && (
            <label style={{ fontSize: '12px', color: '#6A7186' }}>
              Sem vir há (meses)
              <br />
              <input
                type='number'
                name='inativo'
                min={0}
                max={240}
                defaultValue={p.inactiveMonths ?? ''}
                style={{ ...field, width: 90 }}
                placeholder='ex.: 12'
              />
            </label>
          )}
          <button type='submit' style={btn}>
            Aplicar
          </button>
        </form>
      )}

      {/* Área imprimível */}
      <div
        className='print-area'
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 700,
                color: '#1B2A6B',
              }}
            >
              {def.title}
            </h1>
            <p
              style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}
            >
              {subtitle}
              {subtitle ? ' · ' : ''}
              {result.rows.length} linha{result.rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className='no-print' style={{ display: 'flex', gap: 8 }}>
            <PrintButton />
            <ExportCsvButton
              filename={`${def.key}-${p.from}.csv`}
              headers={result.columns.map(c => c.label)}
              rows={csvRows}
            />
          </div>
        </div>
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {result.columns.map(c => (
                  <th
                    key={c.key}
                    style={{ ...th, textAlign: c.align ?? 'left' }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 && (
                <tr>
                  <td
                    style={{ ...td, color: '#6A7186' }}
                    colSpan={result.columns.length}
                  >
                    Sem dados para estes filtros.
                  </td>
                </tr>
              )}
              {result.rows.map((r, i) => (
                <tr key={i}>
                  {result.columns.map(c => (
                    <td
                      key={c.key}
                      style={{
                        ...td,
                        textAlign: c.align ?? 'left',
                        fontVariantNumeric: c.kind ? 'tabular-nums' : undefined,
                        whiteSpace: c.kind ? 'nowrap' : undefined,
                      }}
                    >
                      {fmt(r[c.key] ?? null, c.kind)}
                    </td>
                  ))}
                </tr>
              ))}
              {result.totals && result.rows.length > 0 && (
                <tr style={{ backgroundColor: '#F8F9FD' }}>
                  {result.columns.map((c, i) => (
                    <td
                      key={c.key}
                      style={{
                        ...td,
                        fontWeight: 700,
                        textAlign: c.align ?? 'left',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {i === 0
                        ? 'Total'
                        : result.totals && c.key in result.totals
                          ? fmt(result.totals[c.key], c.kind)
                          : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {result.note && (
          <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
            {result.note}
          </p>
        )}
      </div>
    </div>
  );
}
