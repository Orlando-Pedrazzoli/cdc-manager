// 📄 src/components/dashboard/UpcomingCard.tsx
// =============================================================================
// CDC Manager — Dashboard: "A seguir hoje" — o centro operacional
// -----------------------------------------------------------------------------
// Bloco principal da página: quem é o próximo, com que médico, em que clínica
// e em que estado. Uma linha temporal no topo dá a leitura do dia num
// relance: eixo com as horas certas, marca de "agora" e, por cada meia hora,
// um marcador com o NÚMERO de consultas que começam nela (nov. 2026: antes
// era um ponto + hora por consulta e os rótulos sobrepunham-se). Esconde-se
// em ecrãs pequenos (.cdc-hide-sm) — aí a lista chega.
// =============================================================================

import { ActionLink, C, EmptyLine, Pill, Row, Section, type Tone } from './ui';

/** Largura de cada grupo da linha temporal, em minutos */
const BUCKET_MIN = 30;

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

  // Horas certas do eixo (de 2 em 2 h quando o dia é comprido)
  const hourStep = span > 12 * 60 ? 120 : 60;
  const hourMarks: number[] = [];
  for (let h = Math.ceil(dayStartMin / 60) * 60; h <= dayEndMin; h += hourStep) hourMarks.push(h);

  // Consultas agrupadas por meia hora: antes havia um ponto + hora por
  // consulta e, com várias seguidas, os rótulos ficavam uns em cima dos outros
  const byBucket = new Map<number, UpcomingRow[]>();
  for (const r of rows) {
    const start = Math.floor(r.minutes / BUCKET_MIN) * BUCKET_MIN;
    const list = byBucket.get(start);
    if (list) list.push(r);
    else byBucket.set(start, [r]);
  }
  const buckets = [...byBucket].map(([start, list]) => ({ start, rows: list })).sort((a, b) => a.start - b.start);

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
                padding: '12px 22px 8px',
                borderBottom: `1px solid ${C.lineSoft}`,
              }}
            >
              <div style={{ position: 'relative', height: '50px' }}>
                {/* eixo: parte já passada mais clara */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '27px',
                    height: '2px',
                    backgroundColor: '#D5DBEA',
                    borderRadius: '2px',
                  }}
                />
                {/* horas certas: traço + rótulo (escala fixa, nunca se sobrepõe) */}
                {hourMarks.map(h => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      left: pos(h),
                      top: '24px',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <span style={{ width: '1px', height: '8px', backgroundColor: '#C7CEE0' }} />
                    <span
                      style={{
                        fontSize: '10px',
                        color: h < nowMin - 59 ? C.faint : '#3D4257',
                        fontWeight: h < nowMin - 59 ? 400 : 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {String(h / 60).padStart(2, '0')}h
                    </span>
                  </div>
                ))}
                {/* agora */}
                {nowMin >= dayStartMin && nowMin <= dayEndMin && (
                  <div
                    style={{
                      position: 'absolute',
                      left: pos(nowMin),
                      top: '4px',
                      height: '30px',
                      width: '2px',
                      backgroundColor: C.good,
                      transform: 'translateX(-1px)',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '-2px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: C.good,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      agora
                    </span>
                  </div>
                )}
                {/* consultas agrupadas por meia hora: um marcador com a contagem */}
                {buckets.map(bk => {
                  const tone = bk.rows.some(r => r.status.tone === 'warn')
                    ? C.warn
                    : bk.rows.every(r => r.status.tone === 'good')
                      ? C.good
                      : C.action;
                  return (
                    <div
                      key={bk.start}
                      title={bk.rows.map(r => `${r.time} · ${r.patientName} · ${r.doctorName}`).join('\n')}
                      style={{
                        position: 'absolute',
                        left: pos(bk.start + BUCKET_MIN / 2),
                        top: '2px',
                        transform: 'translateX(-50%)',
                        minWidth: '20px',
                        height: '20px',
                        padding: '0 5px',
                        boxSizing: 'border-box',
                        borderRadius: '999px',
                        backgroundColor: tone,
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        lineHeight: '20px',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                        boxShadow: '0 0 0 2px #FFFFFF',
                      }}
                    >
                      {bk.rows.length}
                      <span
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '20px',
                          width: '1px',
                          height: '6px',
                          backgroundColor: tone,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '10.5px', color: C.faint }}>
                Cada marcador mostra quantas consultas começam nessa meia hora — passe o rato para ver quais.
              </p>
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
