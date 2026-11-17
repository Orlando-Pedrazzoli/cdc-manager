// 📄 src/components/agenda/WaitlistBox.tsx
'use client';
// =============================================================================
// CDC Manager — Agenda: caixa "Lista de espera" (8.ª ronda/10)
// -----------------------------------------------------------------------------
// Victor (17/11/2026): "Quando alguém cancela, falta, ou fica um horário livre
// no dia, o sistema sugere os pacientes que pediram uma vaga mais cedo ou mais
// tarde com aquele médico." A caixa mostra, por médico, quem pediu outro
// horário e encaixa no dia aberto, e as vagas que se abriram nesse dia
// (canceladas e faltas). A receção liga ao paciente e abre a marcação dele
// para remarcar.
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { closeWaitlistAction } from '@/actions/waitlist';
import {
  WAITLIST_PREFERENCE_LABEL,
  type WaitlistPreference,
} from '@/lib/waitlist';

export interface WaitlistBoxEntry {
  id: string;
  doctorName: string;
  preference: WaitlistPreference;
  note: string | null;
  patientName: string;
  phone: string | null;
  appointmentLabel: string;
  /** Abre a agenda no dia da marcação dele, já com a marcação aberta */
  appointmentHref: string;
}

export function WaitlistBox({
  entries,
  totalActive,
  freedByDoctor,
  dateLabel,
}: {
  /** Pedidos que encaixam no dia aberto */
  entries: WaitlistBoxEntry[];
  /** Todos os pedidos ativos da clínica (para o contador) */
  totalActive: number;
  /** Vagas abertas neste dia, por médico: "10:00 (cancelada)" */
  freedByDoctor: Record<string, string[]>;
  dateLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byDoctor = new Map<string, WaitlistBoxEntry[]>();
  for (const e of entries) {
    byDoctor.set(e.doctorName, [...(byDoctor.get(e.doctorName) ?? []), e]);
  }

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await closeWaitlistAction(id, 'cancelled');
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <section
      aria-label='Lista de espera'
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
          Lista de espera ({entries.length})
        </strong>
        <span style={{ fontSize: '11px', color: '#6A7186' }}>
          {totalActive} pedido{totalActive === 1 ? '' : 's'} na clínica
        </span>
      </div>
      {entries.length === 0 ? (
        <p style={{ margin: 0, padding: '12px 14px', fontSize: '12px', color: '#6A7186' }}>
          Ninguém pediu uma vaga que encaixe em {dateLabel}. Para pôr um
          paciente na lista, abra a marcação dele e use &quot;Paciente quer
          outro horário&quot;.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[...byDoctor.entries()].map(([doctor, list]) => {
            const freed = freedByDoctor[doctor] ?? [];
            return (
              <div key={doctor} style={{ padding: '10px 14px', borderBottom: '1px solid #F3F5FA' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C2233' }}>{doctor}</div>
                {freed.length > 0 && (
                  <div
                    style={{
                      margin: '5px 0 2px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      backgroundColor: '#E4F5EA',
                      color: '#125C32',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    Vaga{freed.length === 1 ? '' : 's'} neste dia: {freed.join(' · ')}
                  </div>
                )}
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map(e => (
                    <li key={e.id} style={{ fontSize: '12px', color: '#3D4257' }}>
                      <div style={{ fontWeight: 600, color: '#141B33' }}>{e.patientName}</div>
                      <div>
                        {WAITLIST_PREFERENCE_LABEL[e.preference]} · tem marcação a {e.appointmentLabel}
                        {e.phone ? ` · ${e.phone}` : ''}
                      </div>
                      {e.note && <div style={{ color: '#6A7186' }}>{e.note}</div>}
                      <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                        <Link href={e.appointmentHref} style={{ fontWeight: 600, color: '#2743A6' }}>
                          Abrir a marcação para remarcar →
                        </Link>
                        <button
                          type='button'
                          disabled={pending}
                          onClick={() => remove(e.id)}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#B3261E',
                            cursor: pending ? 'wait' : 'pointer',
                          }}
                        >
                          Tirar da lista
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <p style={{ margin: 0, padding: '8px 14px', fontSize: '12px', color: '#B3261E' }}>{error}</p>
      )}
    </section>
  );
}
