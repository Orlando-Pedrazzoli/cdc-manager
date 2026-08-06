// 📄 src/app/admin/pacientes/page.tsx
// =============================================================================
// CDC Manager — Admin: Listagem de Pacientes
// -----------------------------------------------------------------------------
// Server Component puro: a pesquisa e a paginação vivem nos URL params
// (?q=&status=&page=), o que dá URLs partilháveis/bookmarkáveis, back/forward
// do browser a funcionar, e ZERO estado de cliente na listagem — essencial
// para performar com os ~86.000 registos do Dentoral.
//
// Pesquisa (os 3 caminhos da receção, como no Dentoral):
//   - Nome: regex case-insensitive por termo (todos os termos têm de bater)
//   - Telefone: se o termo tiver 6+ dígitos, pesquisa nos dígitos do E.164
//   - Nº de processo: termo 100% numérico até 6 dígitos → match exato
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { searchPatientsSchema } from '@/lib/validations/patient';
import { PatientSearch } from '@/components/pacientes/PatientSearch';
import { Button } from '@/components/ui/Button';
import { PatientStatusBadge } from '@/components/ui/Badge';
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableEmpty,
} from '@/components/ui/Table';

export const dynamic = 'force-dynamic'; // listagem sempre fresca

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** dd/mm/aaaa (Lisboa) — desambiguação de homónimos na receção */
const birthFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

type Search = { q?: string; status?: string; page?: string };

export default async function PatientsPage({
  searchParams,
}: {
  // Next 15+: searchParams é uma Promise
  searchParams: Promise<Search>;
}) {
  const raw = await searchParams;
  const parsed = searchPatientsSchema.safeParse(raw);
  const { q, status, page, perPage } = parsed.success
    ? parsed.data
    : { q: '', status: 'active' as const, page: 1, perPage: 25 };

  await dbConnect();

  // --- Construção do filtro -------------------------------------------------
  const filter: Record<string, unknown> = {};
  if (status === 'all') {
    filter.status = { $ne: 'anonymized' };
  } else {
    filter.status = status;
  }

  const term = q.trim();
  if (term) {
    const digits = term.replace(/\D/g, '');
    const or: Record<string, unknown>[] = [];

    // Nº de processo: termo totalmente numérico (nºs até ~86000 → 6 dígitos)
    if (/^\d{1,6}$/.test(term)) {
      or.push({ processNumber: Number(term) });
    }
    // Telefone: 6+ dígitos no termo → procura na cauda do E.164
    if (digits.length >= 6) {
      or.push({ phone: { $regex: `${escapeRegex(digits)}` } });
    }
    // Nome: todos os termos têm de aparecer (ordem livre)
    const words = term
      .split(/\s+/)
      .filter(Boolean)
      .map(w => ({ name: { $regex: escapeRegex(w), $options: 'i' } }));
    if (words.length > 0) {
      or.push(words.length === 1 ? words[0] : { $and: words });
    }

    if (or.length > 0) filter.$or = or;
  }

  // --- Query paginada -------------------------------------------------------
  const [total, patients] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.find(filter)
      .sort({ processNumber: -1 }) // mais recentes primeiro
      .skip((page - 1) * perPage)
      .limit(perPage)
      .select('processNumber name phone email status birthDate deceasedAt')
      .lean(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (term) sp.set('q', term);
    if (status !== 'active') sp.set('status', status);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return qs ? `/admin/pacientes?${qs}` : '/admin/pacientes';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho da página */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
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
            Pacientes
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {total.toLocaleString('pt-PT')}{' '}
            {total === 1 ? 'paciente' : 'pacientes'}
            {term ? ` para “${term}”` : ''}
          </p>
        </div>
        <Link href='/admin/pacientes/novo'>
          <Button>
            <UserPlus size={16} style={{ marginRight: 6 }} />
            Novo paciente
          </Button>
        </Link>
      </div>

      {/* Pesquisa + filtro de estado (client, escreve nos URL params) */}
      <PatientSearch initialQ={term} initialStatus={status} />

      {/* Tabela */}
      <Table>
        <THead>
          <TR>
            <TH width={90}>Nº Proc.</TH>
            <TH>Nome</TH>
            <TH width={110}>Nascimento</TH>
            <TH width={150}>Telefone</TH>
            <TH>Email</TH>
            <TH width={110}>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {patients.length === 0 ? (
            <TableEmpty
              colSpan={6}
              message={
                term
                  ? 'Nenhum paciente corresponde à pesquisa.'
                  : 'Ainda não existem pacientes registados.'
              }
            />
          ) : (
            patients.map(p => (
              <TR key={String(p._id)} hover>
                <TD>
                  <span style={{ fontWeight: 600 }}>{p.processNumber}</span>
                </TD>
                <TD>
                  <Link
                    href={`/admin/pacientes/${String(p._id)}`}
                    style={{
                      color: '#2743A6',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {p.name}
                  </Link>
                </TD>
                <TD>{p.birthDate ? birthFmt.format(p.birthDate) : '—'}</TD>
                <TD>{p.phone ?? '—'}</TD>
                <TD>{p.email ?? '—'}</TD>
                <TD>
                  <span
                    style={{
                      display: 'inline-flex',
                      gap: '4px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <PatientStatusBadge status={p.status} />
                    {p.deceasedAt && (
                      <span
                        style={{
                          borderRadius: '999px',
                          padding: '2px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: '#3D4257',
                          color: '#FFFFFF',
                        }}
                      >
                        Falecido
                      </span>
                    )}
                  </span>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
          }}
        >
          {page > 1 ? (
            <Link href={pageHref(page - 1)}>
              <Button variant='outline' size='sm'>
                <ChevronLeft size={15} style={{ marginRight: 4 }} />
                Anterior
              </Button>
            </Link>
          ) : (
            <Button variant='outline' size='sm' disabled>
              <ChevronLeft size={15} style={{ marginRight: 4 }} />
              Anterior
            </Button>
          )}
          <span style={{ fontSize: '13px', color: '#6A7186' }}>
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)}>
              <Button variant='outline' size='sm'>
                Seguinte
                <ChevronRight size={15} style={{ marginLeft: 4 }} />
              </Button>
            </Link>
          ) : (
            <Button variant='outline' size='sm' disabled>
              Seguinte
              <ChevronRight size={15} style={{ marginLeft: 4 }} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
