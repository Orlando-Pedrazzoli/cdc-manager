// 📄 src/app/admin/dashboard/page.tsx
// =============================================================================
// CDC Manager — Dashboard Admin (placeholder do Sprint 0)
// KPIs e gráficos reais chegam nos próximos sprints.
// =============================================================================

export const metadata = { title: 'Dashboard' };

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className='text-2xl font-bold' style={{ color: '#1B2A6B' }}>
        Dashboard
      </h1>
      <p className='mt-2 text-sm' style={{ color: '#6A7186' }}>
        Sprint 0 concluído — autenticação e RBAC funcionais. Os módulos de
        gestão serão adicionados nos próximos sprints.
      </p>
    </div>
  );
}
