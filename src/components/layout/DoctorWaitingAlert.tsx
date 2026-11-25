// 📄 src/components/layout/DoctorWaitingAlert.tsx
// =============================================================================
// CDC Manager — Médico: aviso luminoso de paciente lançado
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 10, Victor, 17 e 18/11). Vive no layout da área do médico,
// por isso aparece em QUALQUER página (agenda, consulta, odontograma…).
// Pergunta ao servidor de 20 em 20 segundos (pausa com o separador oculto)
// se a receção já lançou algum paciente ("Chegou"). Havendo, mostra um botão
// fixo a pulsar; um paciente → abre a consulta dele; vários → "O meu dia".
// Quando chega alguém novo, refresca também a página aberta, para a agenda
// do médico deixar de mostrar o estado antigo.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';
import {
  doctorWaitingAction,
  type WaitingPatient,
} from '@/actions/doctor-waiting';

const POLL_MS = 20_000;

export function DoctorWaitingAlert() {
  const router = useRouter();
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<WaitingPatient[]>([]);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    const check = async () => {
      const res = await doctorWaitingAction();
      if (!alive) return;
      const ids = res.waiting.map(w => w.appointmentId);
      const before = known.current;
      known.current = new Set(ids);
      setWaiting(res.waiting);
      // Estado mudou desde a última volta (chegou alguém, ou foi chamado) →
      // refrescar a página aberta. A primeira volta só toma nota: a página
      // acabou de ser servida com dados frescos.
      if (
        before &&
        (ids.length !== before.size || ids.some(id => !before.has(id)))
      ) {
        router.refresh();
      }
    };
    const start = () => {
      if (timer === null) timer = setInterval(check, POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void check();
        start();
      } else {
        stop();
      }
    };

    void check();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router]);

  if (waiting.length === 0) return null;

  const one = waiting.length === 1 ? waiting[0] : null;
  const href = one ? `/doutor/consulta/${one.appointmentId}` : '/doutor/dashboard';
  // Já está na consulta do único paciente à espera: o aviso só atrapalhava
  if (one && pathname === href) return null;

  const label = one
    ? `${one.name} chegou — chamar`
    : `${waiting.length} pacientes à espera — ver`;

  return (
    <Link
      href={href}
      className='cdc-doctor-alert'
      role='status'
      aria-live='polite'
      title={waiting.map(w => w.name).join(', ')}
    >
      <BellRing size={20} aria-hidden='true' />
      <span>{label}</span>
    </Link>
  );
}
