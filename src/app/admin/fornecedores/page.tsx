// 📄 src/app/admin/fornecedores/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Fornecedores e Laboratórios (E3)
// -----------------------------------------------------------------------------
// "Esta entidade 'Laboratórios' pode ser criada no separador FORNECEDORES
// mas na ficha ter um campo que permita colocar um pisco em 'laboratório'."
// Lista com filtro Todos / Laboratórios / Outros; criar, editar, desativar.
// Na Fase 6 o mesmo módulo recebe as faturas de fornecedor (IA → stock).
// =============================================================================

import Link from 'next/link';
import { FlaskConical, Truck } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Supplier from '@/models/Supplier';
import LabCase from '@/models/LabCase';
import { Badge } from '@/components/ui/Badge';
import {
  NewSupplierButton,
  EditSupplierButton,
} from '@/components/fornecedores/SupplierModal';
import { ToggleActiveButton } from '@/components/fornecedores/ToggleActiveButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fornecedores' };

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'labs', label: 'Laboratórios' },
  { key: 'outros', label: 'Outros fornecedores' },
  { key: 'inativos', label: 'Inativos' },
] as const;

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;
  const filtro = FILTERS.some(f => f.key === sp.filtro) ? sp.filtro! : 'todos';

  await dbConnect();
  const query =
    filtro === 'labs'
      ? { isLab: true, active: true }
      : filtro === 'outros'
        ? { isLab: false, active: true }
        : filtro === 'inativos'
          ? { active: false }
          : { active: true };
  const suppliers = await Supplier.find(query)
    .sort({ isLab: -1, name: 1 })
    .collation({ locale: 'pt', strength: 2 })
    .lean();

  // Nº de pedidos em curso por laboratório (contexto rápido)
  const openCounts = await LabCase.aggregate<{ _id: string; n: number }>([
    { $match: { status: 'sent', supplierId: { $ne: null } } },
    { $group: { _id: '$supplierId', n: { $sum: 1 } } },
  ]);
  const openBySupplier = new Map(openCounts.map(c => [String(c._id), c.n]));

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    overflow: 'hidden',
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
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
    verticalAlign: 'middle',
  };
  const navBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid #D8DEEF',
    borderRadius: '10px',
    padding: '7px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1B2A6B',
    backgroundColor: '#FFFFFF',
    textDecoration: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Fornecedores
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            Laboratórios (protésicos, alinhadores, biópsias…) e fornecedores de
            material. Os laboratórios aparecem nos pedidos na ficha do paciente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <NewSupplierButton defaultIsLab />
          <NewSupplierButton />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <Link
            key={f.key}
            href={`/admin/fornecedores?filtro=${f.key}`}
            style={{
              ...navBtn,
              ...(filtro === f.key
                ? { backgroundColor: '#2743A6', color: '#FFFFFF' }
                : {}),
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Tipo</th>
              <th style={th}>Contacto</th>
              <th style={th}>Prazo</th>
              <th style={th}>Em curso</th>
              <th style={{ ...th, textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td style={{ ...td, color: '#6A7186' }} colSpan={6}>
                  Ainda não há fornecedores neste filtro. Comece por «Novo
                  laboratório».
                </td>
              </tr>
            )}
            {suppliers.map(s => {
              const open = openBySupplier.get(String(s._id)) ?? 0;
              return (
                <tr key={String(s._id)} style={{ opacity: s.active ? 1 : 0.6 }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>
                      {s.isLab ? (
                        <FlaskConical
                          size={14}
                          style={{
                            marginRight: 6,
                            verticalAlign: -2,
                            color: '#2743A6',
                          }}
                        />
                      ) : (
                        <Truck
                          size={14}
                          style={{
                            marginRight: 6,
                            verticalAlign: -2,
                            color: '#9AA1B4',
                          }}
                        />
                      )}
                      {s.name}
                    </div>
                    {s.nif && (
                      <div style={{ fontSize: '11px', color: '#9AA1B4' }}>
                        NIF {s.nif}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    {s.isLab ? (
                      <Badge variant='info'>Laboratório</Badge>
                    ) : (
                      <Badge variant='neutral'>Fornecedor</Badge>
                    )}
                    {!s.active && (
                      <span style={{ marginLeft: 6 }}>
                        <Badge variant='danger'>Inativo</Badge>
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: '12px', color: '#3D4257' }}>
                    {[s.contactName, s.phone, s.email]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td style={td}>
                    {s.defaultLeadDays != null
                      ? `${s.defaultLeadDays} dias`
                      : '—'}
                  </td>
                  <td style={td}>
                    {s.isLab ? (
                      open > 0 ? (
                        <Link
                          href='/admin/proteses?filtro=em-curso'
                          style={{
                            color: '#2743A6',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          {open} pedido{open === 1 ? '' : 's'}
                        </Link>
                      ) : (
                        <span style={{ color: '#9AA1B4' }}>0</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}
                  >
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <EditSupplierButton
                        initial={{
                          id: String(s._id),
                          name: s.name,
                          isLab: !!s.isLab,
                          nif: s.nif ?? null,
                          contactName: s.contactName ?? null,
                          phone: s.phone ?? null,
                          email: s.email ?? null,
                          address: s.address ?? null,
                          defaultLeadDays: s.defaultLeadDays ?? null,
                          notes: s.notes ?? null,
                        }}
                      />
                      <ToggleActiveButton
                        id={String(s._id)}
                        active={!!s.active}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
