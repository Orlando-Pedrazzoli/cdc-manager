// 📄 src/components/layout/PostClinicSelect.tsx
// =============================================================================
// CDC Manager — "Este posto": em que unidade está este computador
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 03). Escolhe-se uma vez em cada posto; a partir daí o
// campo "Clínica" abre sempre nessa unidade (agenda, cobrança, faturação,
// sala de espera, Raio-X, vendas, stock…). Continua a poder mudar-se de
// clínica em cada ecrã — isto só define a que aparece primeiro.
// =============================================================================

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import { setPostClinicAction } from '@/actions/post-clinic';

export function PostClinicSelect({
  clinics,
  current,
  chosen,
}: {
  clinics: { slug: string; label: string }[];
  /** Unidade em vigor neste posto */
  current: string;
  /** false = nunca foi escolhida neste posto (está a valer a principal) */
  chosen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (clinics.length < 2) return null;

  return (
    <label
      className='cdc-post-clinic'
      title='Unidade onde este computador está. O campo "Clínica" abre sempre nesta unidade.'
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '12px',
        fontWeight: 600,
        color: chosen ? '#6A7186' : '#8A5A00',
        flexShrink: 0,
      }}
    >
      <MapPin size={14} aria-hidden='true' />
      Este posto:
      <select
        value={current}
        disabled={pending}
        onChange={e => {
          const slug = e.target.value;
          start(async () => {
            const res = await setPostClinicAction(slug);
            if (res.error) {
              toast.error(res.error);
              return;
            }
            toast.success('Unidade deste posto guardada.');
            router.refresh();
          });
        }}
        style={{
          border: chosen ? '1px solid #D8DEEF' : '1px solid #E0B25A',
          borderRadius: '8px',
          padding: '5px 8px',
          fontSize: '13px',
          fontWeight: 700,
          color: '#1B2A6B',
          backgroundColor: chosen ? '#FFFFFF' : '#FFF9EC',
        }}
      >
        {clinics.map(c => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
