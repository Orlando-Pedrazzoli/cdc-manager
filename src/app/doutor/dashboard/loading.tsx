// 📄 src/app/doutor/dashboard/loading.tsx
// =============================================================================
// CDC Manager — Dashboard médico: skeleton de carregamento
// -----------------------------------------------------------------------------
// Mesmo racional da admin: várias queries (dia + mês + sparkline) num cold
// start podem demorar; o App Router mostra isto instantaneamente com a
// silhueta real da página (cabeçalho, destaque, KPIs do dia, "O meu mês",
// lista). Pulso via keyframes locais — sem dependências.
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

export default function DoctorDashboardLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`@keyframes cdcPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>

      {/* Cabeçalho */}
      <div>
        <div style={{ ...pulse, width: '140px', height: '26px' }} />
        <div
          style={{ ...pulse, width: '240px', height: '14px', marginTop: '8px' }}
        />
      </div>

      {/* Destaque */}
      <div
        style={{
          ...card,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ ...pulse, width: '120px', height: '12px' }} />
          <div
            style={{
              ...pulse,
              width: '45%',
              height: '20px',
              marginTop: '10px',
            }}
          />
          <div
            style={{ ...pulse, width: '60%', height: '14px', marginTop: '8px' }}
          />
        </div>
        <div style={{ ...pulse, width: '90px', height: '24px' }} />
      </div>

      {/* KPIs do dia */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ ...pulse, width: '44px', height: '26px' }} />
            <div
              style={{
                ...pulse,
                width: '75%',
                height: '12px',
                marginTop: '8px',
              }}
            />
          </div>
        ))}
      </div>

      {/* O meu mês */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ ...pulse, width: '110px', height: '26px' }} />
            <div
              style={{
                ...pulse,
                width: '65%',
                height: '12px',
                marginTop: '8px',
              }}
            />
            <div
              style={{
                ...pulse,
                width: '100%',
                height: '30px',
                marginTop: '10px',
              }}
            />
          </div>
        ))}
      </div>

      {/* Lista do dia */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div
          style={{ padding: '14px 20px', borderBottom: '1px solid #EEF1F8' }}
        >
          <div style={{ ...pulse, width: '120px', height: '16px' }} />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 20px',
              borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
            }}
          >
            <div style={{ ...pulse, width: '92px', height: '16px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...pulse, width: '35%', height: '14px' }} />
              <div
                style={{
                  ...pulse,
                  width: '55%',
                  height: '11px',
                  marginTop: '6px',
                }}
              />
            </div>
            <div style={{ ...pulse, width: '72px', height: '20px' }} />
            <div style={{ ...pulse, width: '84px', height: '20px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
