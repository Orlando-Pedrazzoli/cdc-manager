// 📄 src/components/dashboard/UpcomingCard.tsx
// =============================================================================
// CDC Manager — Dashboard: "A seguir hoje" — o centro operacional
// -----------------------------------------------------------------------------
// Bloco principal da página: quem é o próximo, com que médico, em que clínica
// e em que estado. Uma linha temporal discreta no topo (posição proporcional
// entre a abertura e o fecho da clínica) dá a leitura do dia num relance;
// esconde-se em ecrãs pequenos (.cdc-hide-sm) — aí a lista chega.
// =============================================================================

import { ActionLink, C, EmptyLine, Pill, Row, Section, type Tone } from './ui';

export type UpcomingRow = {
  id: string;
  time: string;
  /** Minutos desde a meia-noite (para a timeline) */
  minutes: number;
  patientId: string;
  patientName: string;
  doctorName: string;
  clinicLabel: string;
  clinicTone: { bg: string; fg: string };
  status: { label: string; tone: Tone };
};

export function UpcomingCard({
  rows,
  dayStartMin,
  dayEndMin,
  nowMin,
}: {
  rows: UpcomingRow[];
  dayStartMin: number;
  dayEndMin: number;
  nowMin: number;
}) {
  const span = Math.max(60, dayEndMin - dayStartMin);
  const pos = (min: number) =>
    `${Math.min(100, Math.max(0, ((min - dayStartMin) / span) * 100))}%`;
  const showTimeline = rows.length > 1;

  return (
    <Section
      title='A seguir hoje'
      flush
      action={<ActionLink href='/admin/agenda'>Abrir agenda</ActionLink>}
    >
      {rows.length === 0 ? (
        <EmptyLine
          text='Sem mais consultas hoje.'
          action={<ActionLink href='/admin/agenda'>+ Nova marcação</ActionLink>}
        />
      ) : (
        <>
          {showTimeline && (
            <div
              className='cdc-hide-sm'
              aria-hidden='true'
              style={{
                padding: '14px 18px 6px',
                borderBottom: `1px solid ${C.lineSoft}`,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  height: '22px',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '5px',
                    height: '2px',
                    backgroundColor: C.line,
                    borderRadius: '2px',
                  }}
                />
                {nowMin >= dayStartMin && nowMin <= dayEndMin && (
                  <div
                    title='Agora'
                    style={{
                      position: 'absolute',
                      left: pos(nowMin),
                      top: 0,
                      width: '2px',
                      height: '12px',
                      backgroundColor: C.good,
                      transform: 'translateX(-1px)',
                    }}
                  />
                )}
                {rows.map(r => (
                  <div
                    key={r.id}
                    style={{
                      position: 'absolute',
                      left: pos(r.minutes),
                      top: '2px',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '999px',
                        backgroundColor:
                          r.status.tone === 'good'
                            ? C.good
                            : r.status.tone === 'warn'
                              ? C.warn
                              : C.action,
                        border: '2px solid #FFFFFF',
                        boxShadow: `0 0 0 1px ${C.line}`,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '10px',
                        color: C.faint,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {r.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rows.map((r, i) => (
            <Row
              key={r.id}
              first={i === 0}
              time={r.time}
              title={r.patientName}
              titleHref={`/admin/pacientes/${r.patientId}`}
              subtitle={r.doctorName}
              meta={
                <>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '2px 9px',
                      fontSize: '11px',
                      fontWeight: 700,
                      lineHeight: '16px',
                      backgroundColor: r.clinicTone.bg,
                      color: r.clinicTone.fg,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.clinicLabel}
                  </span>
                  <Pill tone={r.status.tone}>{r.status.label}</Pill>
                </>
              }
            />
          ))}
        </>
      )}
    </Section>
  );
}
