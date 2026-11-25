// 📄 src/components/agenda/CalendarDoctorSelect.tsx
'use client';
// =============================================================================
// CDC Manager — Agenda: de quem é a ocupação que o calendário mostra
// -----------------------------------------------------------------------------
// 25/11/2026: em vez de um calendário por médico (11 a 24 calendários não
// cabem no ecrã), um só calendário com este seletor por cima. "Todos os
// médicos" mostra a ocupação da clínica; escolher um médico pinta os dias
// pela agenda dele — para a receção encontrar um dia livre com esse médico
// sem tirar os outros da grelha.
//
// Os endereços vêm prontos do servidor (preservam clínica, dia, vista e
// filtros); aqui só se navega, sem saltar para o topo da página.
// =============================================================================

import { useRouter } from 'next/navigation';

export interface CalendarDoctorOption {
  /** '' = todos os médicos */
  value: string;
  label: string;
  href: string;
}

export function CalendarDoctorSelect({
  value,
  options,
}: {
  value: string;
  options: CalendarDoctorOption[];
}) {
  const router = useRouter();
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#6A7186' }}>
        Ocupação de
      </span>
      <select
        value={value}
        onChange={e => {
          const next = options.find(o => o.value === e.target.value);
          if (next) router.push(next.href, { scroll: false });
        }}
        style={{
          width: '100%',
          padding: '7px 8px',
          borderRadius: '8px',
          border: '1px solid #D8DEEF',
          backgroundColor: value ? '#F2F5FC' : '#FFFFFF',
          color: '#1B2A6B',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        {options.map(o => (
          <option key={o.value || 'todos'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
