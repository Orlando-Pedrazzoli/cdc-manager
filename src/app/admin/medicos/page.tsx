// 📄 src/app/admin/medicos/page.tsx
// =============================================================================
// CDC Manager — Admin: Listagem de Médicos
// -----------------------------------------------------------------------------
// Server Component. Com 21+4 médicos não há necessidade de pesquisa/paginação
// — a listagem completa com filtro de estado chega e sobra. Cada linha mostra
// onde o médico trabalha (Colombo/Buraca/ambas), especialidades, comissão
// base e o estado da conta de acesso (a pergunta prática da gerência:
// "ele já consegue entrar?").
// =============================================================================

import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Doctor, { type Specialty } from '@/models/Doctor';
import Clinic from '@/models/Clinic';
import User from '@/models/User';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableEmpty,
} from '@/components/ui/Table';

export const dynamic = 'force-dynamic';

const SPECIALTY_LABEL: Record<Specialty, string> = {
  dentisteria: 'Dentisteria',
  'estetica-dentaria': 'Estética Dentária',
  endodontia: 'Endodontia',
  implantologia: 'Implantologia',
  odontopediatria: 'Odontopediatria',
  ortodontia: 'Ortodontia',
  periodontologia: 'Periodontologia',
  'proteses-dentarias': 'Próteses Dentárias',
  'higiene-oral': 'Higiene Oral',
  'harmonizacao-orofacial': 'Harmonização Orofacial',
  'cirurgia-oral': 'Cirurgia Oral',
  imagiologia: 'Imagiologia',
};

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const showInactive = status === 'all';

  await dbConnect();
  const [doctors, clinics, doctorUsers] = await Promise.all([
    Doctor.find(showInactive ? {} : { active: true })
      .sort({ name: 1 })
      .lean(),
    Clinic.find().select('name slug').lean(),
    User.find({ role: 'doctor' }).select('doctorId status').lean(),
  ]);

  const clinicName = new Map(
    clinics.map(c => [
      String(c._id),
      c.slug === 'colombo' ? 'Colombo' : 'Buraca',
    ]),
  );
  const accountByDoctor = new Map(
    doctorUsers
      .filter(u => u.doctorId)
      .map(u => [String(u.doctorId), u.status]),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            Corpo Clínico
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {doctors.length}{' '}
            {doctors.length === 1 ? 'profissional' : 'profissionais'}
            {showInactive ? ' (incluindo inativos)' : ' ativos'}
            {' · '}
            <Link
              href={
                showInactive ? '/admin/medicos' : '/admin/medicos?status=all'
              }
              style={{ color: '#2743A6', fontWeight: 600 }}
            >
              {showInactive ? 'mostrar só ativos' : 'mostrar todos'}
            </Link>
          </p>
        </div>
        <Link href='/admin/medicos/novo'>
          <Button>
            <UserPlus size={16} style={{ marginRight: 6 }} />
            Novo profissional
          </Button>
        </Link>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Nome</TH>
            <TH>Especialidades</TH>
            <TH width={130}>Clínicas</TH>
            <TH width={110} align='right'>
              Comissão
            </TH>
            <TH width={120}>Conta</TH>
            <TH width={90}>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {doctors.length === 0 ? (
            <TableEmpty
              colSpan={6}
              message='Ainda não existem profissionais registados.'
            />
          ) : (
            doctors.map(d => {
              const id = String(d._id);
              const clinicLabels = d.clinicSchedules
                .map(s => clinicName.get(String(s.clinicId)) ?? '?')
                .join(' + ');
              const account = accountByDoctor.get(id);
              return (
                <TR key={id} hover>
                  <TD>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '999px',
                          backgroundColor: d.color ?? '#2743A6',
                          flexShrink: 0,
                        }}
                      />
                      <Link
                        href={`/admin/medicos/${id}`}
                        style={{
                          color: '#2743A6',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        {d.name}
                      </Link>
                      {!d.licenseNumber && (
                        <Badge variant='warning'>Sem cédula</Badge>
                      )}
                    </span>
                  </TD>
                  <TD>
                    <span
                      style={{
                        display: 'inline-flex',
                        gap: '4px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {d.specialties.slice(0, 3).map(s => (
                        <Badge key={s} variant='info'>
                          {SPECIALTY_LABEL[s as Specialty] ?? s}
                        </Badge>
                      ))}
                      {d.specialties.length > 3 && (
                        <Badge>+{d.specialties.length - 3}</Badge>
                      )}
                    </span>
                  </TD>
                  <TD>{clinicLabels || '—'}</TD>
                  <TD align='right'>
                    <Link
                      href={`/admin/medicos/${id}?tab=comissoes`}
                      title='Abrir comissões e overrides'
                      style={{
                        color: '#2743A6',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {d.commissionRate != null
                        ? `${Math.round(d.commissionRate * 100)}%`
                        : 'default'}
                    </Link>
                  </TD>
                  <TD>
                    {account === 'active' ? (
                      <Badge variant='success'>Ativa</Badge>
                    ) : account === 'invited' ? (
                      <Badge variant='warning'>Convite pendente</Badge>
                    ) : account === 'disabled' ? (
                      <Badge variant='neutral'>Desativada</Badge>
                    ) : (
                      <Badge variant='neutral'>Sem conta</Badge>
                    )}
                  </TD>
                  <TD>
                    {d.active ? (
                      <Badge variant='success'>Ativo</Badge>
                    ) : (
                      <Badge variant='neutral'>Inativo</Badge>
                    )}
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        A comissão “default” usa a taxa da clínica onde cada ato é executado
        (60/40 salvo indicação). Overrides por ato configuram-se na página de
        cada profissional.
      </p>
    </div>
  );
}
