// 📄 src/components/agenda/CancelledBox.tsx
// =============================================================================
// CDC Manager — Agenda: caixa "Canceladas" por baixo do calendário
// -----------------------------------------------------------------------------
// Victor (email de 11/11 e áudio de 12/11/2026): "uma caixa abaixo do
// calendário, onde todos podem clicar e ver quem cancelou e porquê, e quem
// apagou e porquê, de acordo com cada médico e dia da agenda. Ainda que o
// cancelamento seja apagado, ali sempre ficará o registo de quem fez e o que
// tinha naquela linha de horário."
//
// Mostra TODAS as canceladas do dia aberto (as que ainda estão na grelha e
// as que já foram retiradas), agrupadas por médico. Só leitura — é um
// registo. Server component (sem estado).
// =============================================================================

import Link from 'next/link';

export interface CancelledEntry {
  id: string;
  doctorName: string;
  time: string; // "15:00–15:30"
  patientName: string;
  treatmentName: string;
  /** "Paciente cancelou" | "Cancelada pela clínica" | "Remarcada" */
  kind: string;
  reason: string | null;
  cancelledByName: string | null;
  cancelledAtLabel: string | null;
  /** Antecedência do cancelamento, já em texto ("3 h antes", "6 dias antes") */
  noticeLabel: string | null;
  /** true = menos de 24 h e cancelada pelo paciente */
  late: boolean;
  /** Ainda ocupa o lugar na grelha */
  onGrid: boolean;
  removedByName: string | null;
  removedAtLabel: string | null;
}

export function CancelledBox({
  entries,
  dateLabel,
  historyHref,
}: {
  entries: CancelledEntry[];
  dateLabel: string;
  historyHref: string;
}) {
  const byDoctor = new Map<string, CancelledEntry[]>();
  for (const e of entries) {
    byDoctor.set(e.doctorName, [...(byDoctor.get(e.doctorName) ?? []), e]);
  }

  return (
    <section
      aria-label='Marcações canceladas neste dia'
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '11px 14px',
          borderBottom: '1px solid #EEF1F8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <strong style={{ fontSize: '13px', color: '#1B2A6B' }}>
          Canceladas ({entries.length})
        </strong>
        <span style={{ fontSize: '11px', color: '#6A7186' }}>{dateLabel}</span>
      </div>

      {entries.length === 0 ? (
        <p style={{ margin: 0, padding: '12px 14px', fontSize: '12px', color: '#6A7186' }}>
          Sem cancelamentos neste dia.
        </p>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {[...byDoctor.entries()].map(([doctor, list]) => (
            <div key={doctor}>
              <p
                style={{
                  margin: 0,
                  padding: '7px 14px',
                  backgroundColor: '#F8F9FD',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#3D4257',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                {doctor}
              </p>
              {list.map(e => (
                <div
                  key={e.id}
                  style={{
                    padding: '9px 14px',
                    borderTop: '1px solid #F4F6FB',
                    fontSize: '12px',
                    color: '#3D4257',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ color: '#1C2233', fontVariantNumeric: 'tabular-nums' }}>
                      {e.time}
                    </strong>
                    <span
                      style={{
                        flexShrink: 0,
                        padding: '0 7px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: e.onGrid ? '#FFE3C2' : '#E6E9F1',
                        color: e.onGrid ? '#8A4B00' : '#4A5169',
                      }}
                    >
                      {e.onGrid ? 'Na agenda' : 'Retirada'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, color: '#1B2A6B' }}>{e.patientName}</div>
                  <div style={{ color: '#6A7186' }}>{e.treatmentName}</div>
                  <div style={{ marginTop: 3 }}>
                    <strong>{e.kind}</strong>
                    {e.reason ? ` — ${e.reason}` : ''}
                  </div>
                  <div style={{ color: '#6A7186' }}>
                    {e.cancelledByName ? `Registado por ${e.cancelledByName}` : 'Registado pelo sistema'}
                    {e.cancelledAtLabel ? `, ${e.cancelledAtLabel}` : ''}
                    {e.noticeLabel && (
                      <span style={{ color: e.late ? '#B3261E' : '#6A7186', fontWeight: e.late ? 700 : 400 }}>
                        {' '}
                        · {e.noticeLabel}
                      </span>
                    )}
                  </div>
                  {!e.onGrid && (e.removedByName || e.removedAtLabel) && (
                    <div style={{ color: '#6A7186' }}>
                      Retirada da agenda
                      {e.removedByName ? ` por ${e.removedByName}` : ''}
                      {e.removedAtLabel ? `, ${e.removedAtLabel}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #EEF1F8' }}>
        <Link href={historyHref} style={{ fontSize: '12px', fontWeight: 700, color: '#2743A6', textDecoration: 'none' }}>
          Histórico completo →
        </Link>
      </div>
    </section>
  );
}
