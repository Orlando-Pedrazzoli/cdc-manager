// 📄 src/components/agenda/usePatientSearch.ts
// =============================================================================
// CDC Manager — Hook partilhado: pesquisa de paciente com debounce (300 ms)
// -----------------------------------------------------------------------------
// Usado por NewAppointmentModal e WalkInModal (antes cada um tinha a sua
// cópia). Sem setState síncrono dentro de useEffect (regra do React
// Compiler): a lista mostrada é DERIVADA no render — só aparece se a
// pesquisa ainda corresponde ao texto atual e não há paciente escolhido —
// e o effect limita-se a agendar o pedido ao servidor.
// =============================================================================

'use client';

import { useEffect, useState, useTransition } from 'react';
import { findPatientsAction } from '@/actions/appointments';

export interface FoundPatient {
  id: string;
  label: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/** `initialPatient`: paciente já escolhido à partida (ex.: modal aberto a
 *  partir da ficha) — `reset()` volta a ele, não a null. */
export function usePatientSearch(initialPatient: FoundPatient | null = null) {
  const [patientQuery, setPatientQuery] = useState('');
  const [patient, setPatient] = useState<FoundPatient | null>(initialPatient);
  const [fetched, setFetched] = useState<{
    query: string;
    items: FoundPatient[];
  } | null>(null);
  const [, startSearch] = useTransition();

  const active = !patient && patientQuery.trim().length >= MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    const query = patientQuery;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const items = await findPatientsAction(query);
        setFetched({ query, items });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, patientQuery]);

  const patientResults: FoundPatient[] =
    active && fetched?.query === patientQuery ? fetched.items : [];

  const reset = () => {
    setPatient(initialPatient);
    setPatientQuery('');
  };

  return {
    patientQuery,
    setPatientQuery,
    patient,
    setPatient,
    patientResults,
    reset,
  };
}
