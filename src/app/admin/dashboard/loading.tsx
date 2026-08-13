// 📄 src/app/admin/dashboard/loading.tsx
// =============================================================================
// CDC Manager — Dashboard admin: skeleton de carregamento
// -----------------------------------------------------------------------------
// A dashboard corre ~15 queries; num cold start (Vercel + Atlas M0) o primeiro
// paint pode demorar segundos. Sem isto, o utilizador vê um ecrã branco — má
// primeira impressão. O App Router mostra este ficheiro INSTANTANEAMENTE
// enquanto o Server Component resolve; a silhueta imita o layout real (linha
// de KPIs, cartão de lista, cartões por clínica) para a transição ser suave.
// Pulso feito com keyframes injetados localmente — sem dependências.
// =============================================================================

const pulse = {
  backgroundColor: '#E8EBF4',
  borderRadius: '8px',
  animation: 'cdcPulse 1.4s ease-in-out infinite',
} as const;

const card = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
} as const;

export default function DashboardLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`@keyframes cdcPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>

      {/* Cabeçalho: saudação + ações rápidas */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ ...pulse, width: '180px', height: '28px' }} />
          <div
            style={{
              ...pulse,
              width: '240px',
              height: '14px',
              marginTop: '8px',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ ...pulse, width: '140px', height: '38px' }} />
          <div style={{ ...pulse, width: '140px', height: '38px' }} />
        </div>
      </div>

      {/* Linha de KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ ...pulse, width: '56px', height: '26px' }} />
            <div
              style={{
                ...pulse,
                width: '80%',
                height: '12px',
                marginTop: '10px',
              }}
            />
            <div
              style={{
                ...pulse,
                width: '55%',
                height: '10px',
                marginTop: '8px',
              }}
            />
          </div>
        ))}
      </div>

      {/* A seguir hoje */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div
          style={{ padding: '13px 20px', borderBottom: '1px solid #EEF1F8' }}
        >
          <div style={{ ...pulse, width: '120px', height: '16px' }} />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '12px 20px',
              borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
            }}
          >
            <div style={{ ...pulse, width: '42px', height: '16px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...pulse, width: '40%', height: '14px' }} />
              <div
                style={{
                  ...pulse,
                  width: '25%',
                  height: '10px',
                  marginTop: '6px',
                }}
              />
            </div>
            <div style={{ ...pulse, width: '70px', height: '20px' }} />
          </div>
        ))}
      </div>

      {/* Cartões por clínica */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '12px',
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '13px 20px',
                borderBottom: '1px solid #EEF1F8',
              }}
            >
              <div style={{ ...pulse, width: '180px', height: '16px' }} />
              <div style={{ ...pulse, width: '64px', height: '20px' }} />
            </div>
            <div
              style={{
                padding: '14px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ ...pulse, width: '100%', height: '10px' }} />
              <div style={{ ...pulse, width: '60%', height: '14px' }} />
              <div style={{ ...pulse, width: '45%', height: '12px' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
