// 📄 src/app/admin/prazos/page.tsx
// =============================================================================
// CDC Manager — Prazos e avisos da gestão (8.ª ronda/09, 16, 17, 18)
// -----------------------------------------------------------------------------
// Victor (17/11/2026): o controlo das validades dos documentos dos médicos,
// das empresas parceiras e dos fins de contrato é feito em Excel. Esta página
// junta tudo: os avisos de hoje no topo, e por baixo os dois registos que
// não vivem numa ficha (documentos dos médicos e empresas parceiras).
// Aniversários e fins de contrato editam-se na ficha de cada pessoa.
// Só a gestão.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import {
  CONTRACT_WARN_DAYS,
  DOCUMENT_WARN_DAYS,
  PARTNER_WARN_DAYS,
} from '@/lib/management-alerts';
import {
  getManagementAlerts,
  lisbonToday,
  loadExpiryItems,
} from '@/lib/management-alerts-data';
import Doctor from '@/models/Doctor';
import { ExpiryManager } from '@/components/prazos/ExpiryManager';
import { ManagementAlertsBox } from '@/components/prazos/ManagementAlertsBox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prazos e avisos' };

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '20px',
};
const h2: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '16px',
  fontWeight: 700,
  color: '#1C2233',
};
const lead: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '13px',
  color: '#6A7186',
};

export default async function PrazosPage() {
  const session = await requireActiveSession(['admin', 'receptionist'] as const);
  if (!session?.user?.id) return null;
  if (session.user.role !== 'admin') redirect('/admin/dashboard');

  await dbConnect();
  const [alerts, items, doctors] = await Promise.all([
    getManagementAlerts(),
    loadExpiryItems(),
    Doctor.find({ active: true }).select('name').sort({ name: 1 }).lean(),
  ]);
  const today = lisbonToday();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Prazos e avisos
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Aniversários da equipa, fins de contrato, validade dos documentos dos
          médicos e renovações com empresas parceiras. Só a gestão vê esta página.
        </p>
      </div>

      <ManagementAlertsBox alerts={alerts} title='Avisos de hoje' footerHref={null} />

      <section style={card}>
        <h2 style={h2}>Documentos dos médicos</h2>
        <p style={lead}>
          Só o nome do documento e a data de validade (seguro, cédula, ficha de
          aptidão…). Avisa {DOCUMENT_WARN_DAYS} dias antes de expirar, à gestão e ao
          próprio médico; depois de vencido, o aviso aparece todos os dias.
        </p>
        <ExpiryManager
          scope='doctor'
          today={today}
          warnDays={DOCUMENT_WARN_DAYS}
          rows={items.filter(i => i.scope === 'doctor')}
          doctors={doctors.map(d => ({ id: String(d._id), name: d.name }))}
        />
      </section>

      <section style={card}>
        <h2 style={h2}>Empresas parceiras e renovações</h2>
        <p style={lead}>
          Licenças, proteção radiológica, extintores, seguros, manutenções. Dados
          de contacto e data de validade, sem documentos. Avisa{' '}
          {PARTNER_WARN_DAYS} dias antes de cada prazo.
        </p>
        <ExpiryManager
          scope='partner'
          today={today}
          warnDays={PARTNER_WARN_DAYS}
          rows={items.filter(i => i.scope === 'partner')}
        />
      </section>

      <section style={card}>
        <h2 style={h2}>Aniversários e fins de contrato</h2>
        <p style={{ ...lead, margin: 0 }}>
          Estes dois avisos saem das fichas. A data de nascimento preenche-se na
          ficha de cada{' '}
          <Link href='/admin/medicos' style={{ color: '#2743A6', fontWeight: 600 }}>
            médico
          </Link>{' '}
          e de cada{' '}
          <Link href='/admin/colaboradores' style={{ color: '#2743A6', fontWeight: 600 }}>
            colaborador
          </Link>
          ; o aviso aparece na semana do aniversário. As três datas de fim de
          contrato estão na ficha do colaborador; o aviso aparece{' '}
          {CONTRACT_WARN_DAYS} dias antes de cada uma.
        </p>
      </section>
    </div>
  );
}
