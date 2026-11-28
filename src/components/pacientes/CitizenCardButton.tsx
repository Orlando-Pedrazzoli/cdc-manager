// 📄 src/components/pacientes/CitizenCardButton.tsx
// =============================================================================
// CDC Manager — Ficha nova: "Ler Cartão de Cidadão" (ponto 36)
// -----------------------------------------------------------------------------
// Pede um código de uso único, acorda o leitor do posto (cdccc://) e espera
// pelos dados (até 3 minutos, de 2 em 2 segundos). Quando chegam, entrega-os
// ao formulário, que os mostra para a receção conferir antes de guardar.
// Só aparece nos postos onde o leitor foi ativado (ver PatientForm).
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { IdCard } from 'lucide-react';
import {
  startCardReadAction,
  takeCardReadAction,
} from '@/actions/citizen-card';
import {
  cardLaunchUrl,
  CARD_TICKET_TTL_SECONDS,
  type CitizenCardData,
} from '@/lib/citizen-card';

export function CitizenCardButton({
  onRead,
}: {
  onRead: (data: CitizenCardData) => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const stop = (text: string | null, isError: boolean) => {
    run.current += 1;
    if (timer.current) clearTimeout(timer.current);
    setWaiting(false);
    setMessage(text);
    setFailed(isError);
  };

  const start = async () => {
    if (waiting) return;
    const mine = (run.current += 1);
    setWaiting(true);
    setFailed(false);
    setMessage('Insira o cartão no leitor…');
    const started = await startCardReadAction();
    if (run.current !== mine) return;
    if ('error' in started) return stop(started.error, true);

    // Acorda o leitor do posto sem sair da página
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = cardLaunchUrl(started.token, window.location.origin);
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 5000);

    const deadline = Date.now() + CARD_TICKET_TTL_SECONDS * 1000;
    const poll = async () => {
      if (run.current !== mine) return;
      const r = await takeCardReadAction(started.token).catch(() => null);
      if (run.current !== mine) return;
      if (r?.status === 'done') {
        onRead(r.data);
        return stop('Dados lidos do cartão — confira antes de guardar.', false);
      }
      if (r?.status === 'error') return stop(r.error, true);
      if (Date.now() > deadline)
        return stop('O leitor não respondeu. Verifique o cartão e tente de novo.', true);
      timer.current = setTimeout(poll, 2000);
    };
    timer.current = setTimeout(poll, 2000);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <button
        type='button'
        onClick={waiting ? () => stop(null, false) : start}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: '8px',
          border: '1px solid #C9D4FF',
          padding: '8px 14px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#2743A6',
          backgroundColor: '#FFFFFF',
          cursor: 'pointer',
        }}
      >
        <IdCard size={16} />
        {waiting ? 'Cancelar leitura' : 'Ler Cartão de Cidadão'}
      </button>
      {message && (
        <span
          role='status'
          style={{ fontSize: '12px', color: failed ? '#B3261E' : '#3D4257' }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
