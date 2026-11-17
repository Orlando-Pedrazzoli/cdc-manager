// 📄 src/components/prazos/ExpiryManager.tsx
'use client';
// =============================================================================
// CDC Manager — Prazos de validade: lista + formulário (8.ª ronda/16 e 17)
// Um componente para os dois casos: documentos dos médicos (scope 'doctor')
// e empresas parceiras / renovações (scope 'partner').
// =============================================================================

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import {
  saveExpiryItemAction,
  setExpiryItemActiveAction,
  type ExpiryActionState,
} from '@/actions/expiry-items';
import { daysBetween, formatPtDay } from '@/lib/management-alerts';

export interface ExpiryRow {
  id: string;
  name: string;
  doctorId: string | null;
  doctorName: string | null;
  company: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  expiresIso: string;
}

function statusOf(days: number, warnDays: number) {
  if (days < 0)
    return { label: `Vencido há ${-days} dia${days === -1 ? '' : 's'}`, bg: '#FDECEA', fg: '#8A1C13' };
  if (days <= warnDays)
    return {
      label: days === 0 ? 'Expira hoje' : `Expira em ${days} dia${days === 1 ? '' : 's'}`,
      bg: '#FFF4D6',
      fg: '#6B5200',
    };
  return { label: 'Em dia', bg: '#E4F5EA', fg: '#125C32' };
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#6A7186',
  borderBottom: '1px solid #EEF1F8',
};
const td: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '13px',
  color: '#1C2233',
  borderBottom: '1px solid #F3F5FA',
  verticalAlign: 'top',
};

export function ExpiryManager({
  scope,
  rows,
  today,
  warnDays,
  doctors = [],
}: {
  scope: 'doctor' | 'partner';
  rows: ExpiryRow[];
  today: string;
  warnDays: number;
  doctors?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ExpiryRow | 'new' | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction, saving] = useActionState<ExpiryActionState, FormData>(
    async (prev, fd) => {
      const res = await saveExpiryItemAction(prev, fd);
      if (res && 'success' in res) {
        setEditing(null);
        router.refresh();
      }
      return res;
    },
    undefined,
  );

  const archive = (row: ExpiryRow) => {
    setArchiveError(null);
    startTransition(async () => {
      const res = await setExpiryItemActiveAction(row.id, false);
      if (res && 'error' in res) setArchiveError(res.error);
      else router.refresh();
    });
  };

  const current = editing && editing !== 'new' ? editing : null;
  const isDoctor = scope === 'doctor';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          {isDoctor
            ? 'Ainda não há documentos registados. Registe o nome do documento e a data de validade de cada médico.'
            : 'Ainda não há empresas parceiras nem renovações registadas.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{isDoctor ? 'Médico' : 'O que renova'}</th>
                <th style={th}>{isDoctor ? 'Documento' : 'Empresa e contacto'}</th>
                <th style={th}>Validade</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = statusOf(daysBetween(today, r.expiresIso), warnDays);
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {isDoctor ? r.doctorName : r.name}
                    </td>
                    <td style={td}>
                      {isDoctor ? (
                        r.name
                      ) : (
                        <>
                          {r.company ?? '—'}
                          {(r.contact || r.phone || r.email) && (
                            <div style={{ fontSize: '12px', color: '#6A7186' }}>
                              {[r.contact, r.phone, r.email].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </>
                      )}
                      {r.notes && (
                        <div style={{ fontSize: '12px', color: '#6A7186' }}>{r.notes}</div>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatPtDay(r.expiresIso)}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 9px',
                          borderRadius: '999px',
                          backgroundColor: st.bg,
                          color: st.fg,
                          fontSize: '12px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button variant='outline' onClick={() => setEditing(r)}>
                        Editar / renovar
                      </Button>{' '}
                      <Button variant='outline' disabled={pending} onClick={() => archive(r)}>
                        Arquivar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {archiveError && (
        <p style={{ margin: 0, fontSize: '13px', color: '#B3261E' }}>{archiveError}</p>
      )}

      {editing === null ? (
        <div>
          <Button onClick={() => setEditing('new')}>
            {isDoctor ? 'Registar documento' : 'Registar empresa ou renovação'}
          </Button>
        </div>
      ) : (
        <form
          key={current?.id ?? 'new'}
          action={formAction}
          style={{
            border: '1px solid #E3E7F2',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            backgroundColor: '#FAFBFE',
          }}
        >
          <input type='hidden' name='scope' value={scope} />
          <input type='hidden' name='id' value={current?.id ?? ''} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            {isDoctor && (
              <Select name='doctorId' label='Médico *' defaultValue={current?.doctorId ?? ''} required>
                <option value=''>— Escolher —</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
            <Input
              name='name'
              label={isDoctor ? 'Documento *' : 'O que renova *'}
              placeholder={
                isDoctor
                  ? 'Ex.: Seguro de responsabilidade civil'
                  : 'Ex.: Manutenção dos extintores'
              }
              defaultValue={current?.name ?? ''}
              required
              maxLength={120}
            />
            {!isDoctor && (
              <>
                <Input name='company' label='Empresa' defaultValue={current?.company ?? ''} maxLength={120} />
                <Input name='contact' label='Pessoa de contacto' defaultValue={current?.contact ?? ''} maxLength={120} />
                <Input name='phone' label='Telefone' defaultValue={current?.phone ?? ''} maxLength={40} />
                <Input name='email' type='email' label='Email' defaultValue={current?.email ?? ''} maxLength={120} />
              </>
            )}
            <Input
              name='expiresAt'
              type='date'
              label='Data de validade *'
              defaultValue={current?.expiresIso ?? ''}
              required
            />
            <Input name='notes' label='Observações' defaultValue={current?.notes ?? ''} maxLength={500} />
          </div>
          {state && 'error' in state && (
            <p style={{ margin: 0, fontSize: '13px', color: '#B3261E' }}>{state.error}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type='submit' disabled={saving}>
              {saving ? 'A gravar…' : 'Gravar'}
            </Button>
            <Button variant='outline' onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
