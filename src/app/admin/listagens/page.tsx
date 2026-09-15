// 📄 src/app/admin/listagens/page.tsx
// CDC Manager — Admin/Receção: hub de listagens (Fase 5B — P8 + X2)
import Link from 'next/link';
import { ListChecks, Receipt, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { LISTINGS } from '@/lib/listagens';

export const metadata = { title: 'Listagens' };

export default async function ListagensHub() {
  const session = await auth();
  if (!session?.user) return null;
  const groups = [
    {
      key: 'operador',
      title: 'Listagens de operador',
      icon: Users,
      desc: 'Pacientes, tratamentos e catálogo',
    },
    {
      key: 'faturacao',
      title: 'Listagens de faturação',
      icon: Receipt,
      desc: 'Caixa, documentos, por cobrar, categorias, planos',
    },
  ] as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ListChecks size={22} /> Listagens
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
          Cada listagem tem filtros, exportação CSV (Excel) e impressão.
          Produção e comissões por médico continuam em Relatórios.
        </p>
      </div>
      {groups.map(g => (
        <div key={g.key}>
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: '15px',
              fontWeight: 700,
              color: '#1B2A6B',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <g.icon size={16} /> {g.title}
            <span
              style={{ fontSize: '12px', fontWeight: 500, color: '#9AA1B4' }}
            >
              {g.desc}
            </span>
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
            }}
          >
            {LISTINGS.filter(l => l.group === g.key).map(l => (
              <Link
                key={l.key}
                href={`/admin/listagens/${l.key}`}
                style={{
                  display: 'block',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #EEF1F8',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  textDecoration: 'none',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                  }}
                >
                  {l.title}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '12.5px',
                    color: '#6A7186',
                  }}
                >
                  {l.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
