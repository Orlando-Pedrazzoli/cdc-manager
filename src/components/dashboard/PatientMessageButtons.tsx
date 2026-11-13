// 📄 src/components/dashboard/PatientMessageButtons.tsx
// =============================================================================
// CDC Manager — Dashboard: enviar mensagem ao paciente (7.ª ronda/A1)
// -----------------------------------------------------------------------------
// Dois botões por linha (aniversário ou falta):
//   · WhatsApp — abre o WhatsApp com a conversa do paciente e o texto já
//     escrito; a rececionista só carrega em enviar. O clique fica registado.
//   · Email — enviado pelo sistema, depois de confirmar.
// Depois de usada, a linha mostra por onde e por quem a mensagem saiu.
// O link e o texto vêm prontos do servidor (lib/patient-messages).
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Check, Mail, MessageCircle } from 'lucide-react';
import {
  logWhatsAppMessageAction,
  sendPatientMessageEmailAction,
} from '@/actions/patient-messages';
import type { MessageKind } from '@/lib/patient-messages';

export interface MessageSentInfo {
  channel: 'whatsapp' | 'email';
  byName: string | null;
  /** "14:32" */
  timeLabel: string;
}

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 26,
  padding: '0 9px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

export function PatientMessageButtons({
  patientId,
  kind,
  appointmentId = null,
  text,
  whatsAppUrl,
  email,
  emailBlockedReason = null,
  sent,
}: {
  patientId: string;
  kind: MessageKind;
  appointmentId?: string | null;
  /** Texto final da mensagem (mostrado ao passar o rato e na confirmação) */
  text: string;
  /** null = o paciente não tem telemóvel utilizável */
  whatsAppUrl: string | null;
  email: string | null;
  /** Motivo pelo qual o email não pode sair (ex.: sem consentimento) */
  emailBlockedReason?: string | null;
  /** Mensagens deste tipo já enviadas hoje a este paciente */
  sent: MessageSentInfo[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const input = { patientId, kind, appointmentId };

  const onWhatsApp = () => {
    // o link abre por si (target=_blank); aqui só fica o registo
    void logWhatsAppMessageAction(input).then(res => {
      if ('error' in res) toast.error(res.error);
      else router.refresh();
    });
  };

  const onEmail = async () => {
    if (!email || emailBlockedReason) return;
    if (!window.confirm(`Enviar por email para ${email}?\n\n${text}`)) return;
    setBusy(true);
    const res = await sendPatientMessageEmailAction(input);
    setBusy(false);
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    toast.success('Email enviado.');
    router.refresh();
  };

  const emailDisabled = !email || !!emailBlockedReason || busy;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {sent.map((s, i) => (
        <span
          key={`${s.channel}-${i}`}
          title={`${s.channel === 'email' ? 'Email enviado' : 'WhatsApp aberto'} às ${s.timeLabel}${s.byName ? ` por ${s.byName}` : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '11px', fontWeight: 700, color: '#1B7A3D' }}
        >
          <Check size={12} />
          {s.channel === 'email' ? 'Email' : 'WhatsApp'} {s.timeLabel}
        </span>
      ))}
      {whatsAppUrl ? (
        <a
          href={whatsAppUrl}
          target='_blank'
          rel='noopener noreferrer'
          onClick={onWhatsApp}
          title={`Abrir no WhatsApp com esta mensagem:\n\n${text}`}
          style={{ ...pill, backgroundColor: '#E7F6EC', color: '#12683A', border: '1px solid #A9DDBC' }}
        >
          <MessageCircle size={13} /> WhatsApp
        </a>
      ) : (
        <span
          title='Sem telemóvel válido na ficha'
          style={{ ...pill, backgroundColor: '#F4F6FB', color: '#9AA1B4', border: '1px solid #E3E7F1', cursor: 'not-allowed' }}
        >
          <MessageCircle size={13} /> WhatsApp
        </span>
      )}
      <button
        type='button'
        onClick={onEmail}
        disabled={emailDisabled}
        title={
          !email
            ? 'Sem email na ficha'
            : (emailBlockedReason ?? `Enviar por email para ${email}:\n\n${text}`)
        }
        style={{
          ...pill,
          backgroundColor: emailDisabled ? '#F4F6FB' : '#EEF3FF',
          color: emailDisabled ? '#9AA1B4' : '#22388C',
          border: `1px solid ${emailDisabled ? '#E3E7F1' : '#B9C8F5'}`,
          cursor: emailDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Mail size={13} /> {busy ? 'A enviar…' : 'Email'}
      </button>
    </span>
  );
}
