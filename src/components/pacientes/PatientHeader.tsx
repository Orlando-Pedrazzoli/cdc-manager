// 📄 src/components/pacientes/PatientHeader.tsx
// =============================================================================
// CDC Manager — Pacientes: cabeçalho da ficha
// -----------------------------------------------------------------------------
// Identidade do paciente (nome, nº processo, idade, contactos, estado) +
// as duas ações administrativas da ficha:
//   - Desativar / Reativar (com modal de confirmação — never delete)
//   - Convite do portal (modal com email; trata sucesso, conta já ativa,
//     e o caso manualCode quando o email falha)
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Camera,
  Copy,
  KeyRound,
  MessageCircle,
  Phone,
  Mail,
  Trash2,
  UserX,
  UserCheck,
} from 'lucide-react';
import {
  sendPatientInviteAction,
  setPatientStatusAction,
  createPatientPhotoTicketAction,
  setPatientPhotoAction,
  removePatientPhotoAction,
  type InviteFormState,
} from '@/actions/patients';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PatientStatusBadge } from '@/components/ui/Badge';

export interface PatientHeaderData {
  id: string;
  processNumber: number;
  name: string;
  status: string;
  birthDate: string | null; // ISO
  phone: string | null;
  email: string | null;
  portalStatus: 'none' | 'invited' | 'active';
  /** thumbnail assinada da foto (null = sem foto) */
  photoThumbUrl: string | null;
  deceased: boolean;
  firstConsultLabel: string | null;
  lastConsultLabel: string | null;
}

function ageFrom(iso: string | null): number | null {
  if (!iso) return null;
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// -----------------------------------------------------------------------------
// Avatar com foto (paridade Dentoral). Clique na câmara: carrega/substitui;
// no lixo: remove. Fluxo em 3 passos dos documentos (upload direto).
// -----------------------------------------------------------------------------
function PatientPhoto({
  patientId,
  name,
  photoThumbUrl,
}: {
  patientId: string;
  name: string;
  photoThumbUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const upload = async (file: File | null) => {
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Foto com mais de 10 MB — reduza a resolução.');
      return;
    }
    setBusy(true);
    try {
      const t = await createPatientPhotoTicketAction({ patientId });
      if (!t.ok) {
        toast.error(t.error);
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      for (const [k, v] of Object.entries(t.ticket.fields)) {
        fd.append(k, String(v));
      }
      const res = await fetch(t.ticket.uploadUrl, { method: 'POST', body: fd });
      if (!res.ok) {
        toast.error('O upload falhou — tente novamente.');
        return;
      }
      const set = await setPatientPhotoAction({ patientId });
      if (!set.ok) {
        toast.error(set.error);
        return;
      }
      toast.success('Foto atualizada');
      router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await removePatientPhotoAction({ patientId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Foto removida');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: '2px solid #E4EBFF',
          backgroundColor: '#F4F6FB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {photoThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica
          <img
            src={photoThumbUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#8A93B0' }}>
            {initials || '?'}
          </span>
        )}
      </div>
      <input
        ref={fileRef}
        type='file'
        accept='image/*'
        style={{ display: 'none' }}
        onChange={e => upload(e.target.files?.[0] ?? null)}
      />
      <span style={{ display: 'flex', gap: '8px' }}>
        <button
          type='button'
          title={photoThumbUrl ? 'Substituir foto' : 'Adicionar foto'}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            cursor: busy ? 'default' : 'pointer',
            color: '#2743A6',
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Camera size={15} />
        </button>
        {photoThumbUrl && (
          <button
            type='button'
            title='Remover foto'
            onClick={remove}
            disabled={busy}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: busy ? 'default' : 'pointer',
              color: '#B3261E',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Trash2 size={15} />
          </button>
        )}
      </span>
    </div>
  );
}

export function PatientHeader({ patient }: { patient: PatientHeaderData }) {
  const router = useRouter();
  const age = ageFrom(patient.birthDate);

  // --- Desativar / Reativar --------------------------------------------------
  const [statusModal, setStatusModal] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const isActive = patient.status === 'active';

  const toggleStatus = async () => {
    setStatusBusy(true);
    const res = await setPatientStatusAction(
      patient.id,
      isActive ? 'inactive' : 'active',
    );
    setStatusBusy(false);
    setStatusModal(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(isActive ? 'Paciente desativado.' : 'Paciente reativado.');
      router.refresh();
    }
  };

  // --- Convite do portal -----------------------------------------------------
  const [inviteModal, setInviteModal] = useState(false);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const inviteAction = sendPatientInviteAction.bind(null, patient.id);
  const [inviteState, inviteFormAction, invitePending] = useActionState<
    InviteFormState,
    FormData
  >(inviteAction, undefined);
  const handledInvite = useRef<InviteFormState>(undefined);

  useEffect(() => {
    if (!inviteState || inviteState === handledInvite.current) return;
    handledInvite.current = inviteState;
    if ('error' in inviteState) return; // mostrado inline no modal
    if (inviteState.manualCode) {
      setManualCode(inviteState.manualCode);
      if (inviteState.warning) toast(inviteState.warning, { icon: '⚠️' });
    } else {
      toast.success('Convite enviado por email.');
      setInviteModal(false);
      router.refresh();
    }
  }, [inviteState, router]);

  const closeManualCode = () => {
    setManualCode(null);
    setInviteModal(false);
    router.refresh();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '12px',
        padding: '20px 24px',
      }}
    >
      {/* Identidade */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <PatientPhoto
          patientId={patient.id}
          name={patient.name}
          photoThumbUrl={patient.photoThumbUrl}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: '22px',
                fontWeight: 700,
                color: '#1B2A6B',
              }}
            >
              {patient.name}
            </h1>
            <PatientStatusBadge status={patient.status} />
            {patient.deceased && (
              <span
                style={{
                  borderRadius: '999px',
                  padding: '2px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#3D4257',
                  color: '#FFFFFF',
                }}
              >
                Falecido
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
            Processo nº <strong>{patient.processNumber}</strong>
            {age !== null ? ` · ${age} anos` : ''}
            {patient.portalStatus === 'active'
              ? ' · Portal ativo'
              : patient.portalStatus === 'invited'
                ? ' · Convite do portal pendente'
                : ''}
          </p>
          {(patient.firstConsultLabel || patient.lastConsultLabel) && (
            <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
              {patient.firstConsultLabel &&
                `1.ª consulta: ${patient.firstConsultLabel}`}
              {patient.firstConsultLabel && patient.lastConsultLabel && ' · '}
              {patient.lastConsultLabel &&
                `Última: ${patient.lastConsultLabel}`}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              fontSize: '13px',
              color: '#3A3F4A',
              marginTop: '2px',
            }}
          >
            {patient.phone && (
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Phone size={14} style={{ color: '#9AA1B4' }} />
                <a
                  href={`tel:${patient.phone}`}
                  style={{ color: '#3A3F4A', textDecoration: 'none' }}
                >
                  {patient.phone}
                </a>
                {/* WhatsApp direto — convite/contacto v1 é manual (padrão Recalls) */}
                <a
                  href={`https://wa.me/${patient.phone.replace(/\D/g, '')}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  title='Abrir conversa no WhatsApp'
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: '#0F7B4D',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </a>
              </span>
            )}
            {patient.email && (
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Mail size={14} style={{ color: '#9AA1B4' }} />
                {patient.email}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {patient.portalStatus !== 'active' && patient.status === 'active' && (
          <Button variant='secondary' onClick={() => setInviteModal(true)}>
            <KeyRound size={15} style={{ marginRight: 6 }} />
            {patient.portalStatus === 'invited'
              ? 'Reenviar convite'
              : 'Convidar para o portal'}
          </Button>
        )}
        {patient.status !== 'anonymized' && (
          <Button
            variant={isActive ? 'outline' : 'primary'}
            onClick={() => setStatusModal(true)}
          >
            {isActive ? (
              <>
                <UserX size={15} style={{ marginRight: 6 }} />
                Desativar
              </>
            ) : (
              <>
                <UserCheck size={15} style={{ marginRight: 6 }} />
                Reativar
              </>
            )}
          </Button>
        )}
      </div>

      {/* Modal: confirmação de estado */}
      <Modal
        open={statusModal}
        onClose={() => setStatusModal(false)}
        title={isActive ? 'Desativar paciente' : 'Reativar paciente'}
        footer={
          <>
            <Button variant='outline' onClick={() => setStatusModal(false)}>
              Cancelar
            </Button>
            <Button
              variant={isActive ? 'danger' : 'primary'}
              loading={statusBusy}
              onClick={toggleStatus}
            >
              {isActive ? 'Desativar' : 'Reativar'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: '14px', color: '#3A3F4A' }}>
          {isActive
            ? 'O paciente deixa de aparecer nas listagens ativas e não pode receber novas marcações. Todo o histórico é preservado e a operação é reversível.'
            : 'O paciente volta às listagens ativas e pode receber marcações.'}
        </p>
      </Modal>

      {/* Modal: convite do portal */}
      <Modal
        open={inviteModal && manualCode === null}
        onClose={() => setInviteModal(false)}
        title='Convite do portal do paciente'
      >
        <form
          action={inviteFormAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: '#3A3F4A' }}>
            O paciente recebe por email um código de uso único (válido 7 dias)
            para definir a password e aceder ao portal.
          </p>
          <Input
            id='invite-email'
            name='email'
            type='email'
            label='Email do paciente'
            defaultValue={patient.email ?? ''}
            placeholder='paciente@exemplo.pt'
            required
            help={
              patient.email
                ? 'Alterar aqui atualiza também o email da ficha.'
                : 'A ficha não tem email — será gravado ao enviar.'
            }
          />
          {inviteState && 'error' in inviteState && (
            <p
              style={{
                margin: 0,
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '14px',
                backgroundColor: '#FDEDED',
                color: '#B3261E',
              }}
            >
              {inviteState.error}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button
              type='button'
              variant='outline'
              onClick={() => setInviteModal(false)}
              disabled={invitePending}
            >
              Cancelar
            </Button>
            <Button type='submit' loading={invitePending}>
              Enviar convite
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: código para envio manual (email falhou) */}
      <Modal
        open={manualCode !== null}
        onClose={closeManualCode}
        title='Enviar código manualmente'
        footer={<Button onClick={closeManualCode}>Continuar</Button>}
      >
        <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#3A3F4A' }}>
          O email não foi entregue. Envie este código ao paciente (WhatsApp, por
          exemplo) — uso único, válido 7 dias:
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            backgroundColor: '#F4F6FB',
            border: '1px solid #D8DEEF',
            borderRadius: '10px',
            padding: '14px 16px',
          }}
        >
          <code
            style={{
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '2px',
              color: '#1B2A6B',
            }}
          >
            {manualCode}
          </code>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              if (manualCode) {
                navigator.clipboard.writeText(manualCode);
                toast.success('Código copiado.');
              }
            }}
          >
            <Copy size={14} style={{ marginRight: 4 }} />
            Copiar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
