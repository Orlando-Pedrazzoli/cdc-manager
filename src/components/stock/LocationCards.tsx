// 📄 src/components/stock/LocationCards.tsx
// =============================================================================
// CDC Manager — Stock por local: grelha de cartões + modal criar/editar
// -----------------------------------------------------------------------------
// Um cartão por local (armazém central primeiro, depois gabinetes por
// sortOrder). Cada cartão mostra o que a Isabel precisa de ver de relance:
// produtos com saldo, abaixo do mínimo, valor imobilizado, estado da
// contagem quinzenal (em dia / a vencer / em atraso / nunca contado).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Plus,
  Warehouse as WarehouseIcon,
  DoorOpen,
  Sparkles,
  ScanLine,
  Phone,
  Bath,
  Box,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  WAREHOUSE_KINDS,
  WAREHOUSE_KIND_LABEL,
  STOCK_COUNT_INTERVAL_DAYS,
  type WarehouseKind,
} from '@/lib/domain';
import {
  upsertLocationAction,
  type StockLocationActionState,
} from '@/actions/stock-locations';
import type { LocationCard } from '@/lib/stock-locations';

export const KIND_ICON: Record<WarehouseKind, typeof Box> = {
  central: WarehouseIcon,
  operatory: DoorOpen,
  sterilization: Sparkles,
  xray: ScanLine,
  reception: Phone,
  services: Bath,
  other: Box,
};

export function fmtEur(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function lisbonDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso));
}

export function CountStatusBadge({
  status,
  daysUntilDue,
  open,
}: {
  status: LocationCard['countStatus'];
  daysUntilDue: number | null;
  open: boolean;
}) {
  if (open) return <Badge variant='info'>Contagem em curso</Badge>;
  if (status === 'never') return <Badge variant='neutral'>Nunca contado</Badge>;
  if (status === 'overdue')
    return (
      <Badge variant='danger'>
        Contagem em atraso ({Math.abs(daysUntilDue ?? 0)} d)
      </Badge>
    );
  if (status === 'due-soon')
    return <Badge variant='warning'>Contar em {daysUntilDue} d</Badge>;
  return <Badge variant='success'>Contagem em dia</Badge>;
}

// =============================================================================
// Modal criar/editar local
// =============================================================================
export function LocationModal({
  clinics,
  users,
  editing,
  defaultClinicId,
  onClose,
}: {
  clinics: { id: string; name: string }[];
  users: { id: string; name: string }[];
  editing: LocationCard | null;
  defaultClinicId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    StockLocationActionState,
    FormData
  >(upsertLocationAction, undefined);
  const handled = useRef<StockLocationActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 8000 });
    if ('success' in state) {
      toast.success(editing ? 'Local atualizado' : 'Local criado');
      onClose();
      router.refresh();
    }
  }, [state, editing, onClose, router]);

  const kinds = WAREHOUSE_KINDS.filter(k => k !== 'central');

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Editar — ${editing.name}` : 'Novo local de stock'}
      maxWidth={520}
    >
      <form action={formAction}>
        {editing && <input type='hidden' name='id' value={editing.id} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            <Select
              id='loc-clinic'
              name='clinicId'
              label='Clínica'
              defaultValue={
                editing?.clinicId ?? defaultClinicId ?? clinics[0]?.id
              }
              disabled={!!editing}
              required
            >
              {clinics.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {editing && (
              <input type='hidden' name='clinicId' value={editing.clinicId} />
            )}
            <Select
              id='loc-kind'
              name='kind'
              label='Tipo'
              defaultValue={editing?.kind ?? 'operatory'}
              required
            >
              {kinds.map(k => (
                <option key={k} value={k}>
                  {WAREHOUSE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </div>
          <Input
            id='loc-name'
            name='name'
            label='Nome'
            placeholder='Ex.: Gabinete 3'
            defaultValue={editing?.name ?? ''}
            maxLength={80}
            required
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px',
              gap: 12,
            }}
          >
            <Select
              id='loc-resp'
              name='responsibleUserId'
              label='Responsável'
              defaultValue={editing?.responsibleUserId ?? ''}
              help='Quem conta e recebe as requisições. Vazio = administrador.'
            >
              <option value=''>— Administrador —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Input
              id='loc-order'
              name='sortOrder'
              label='Ordem'
              type='number'
              min={0}
              max={999}
              defaultValue={editing?.sortOrder ?? 0}
            />
          </div>
          <Textarea
            id='loc-desc'
            name='description'
            label='Descrição (opcional)'
            placeholder='Ex.: gabinete de cirurgia — 1.º piso'
            defaultValue={editing?.description ?? ''}
            maxLength={300}
            rows={2}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit' variant='primary' disabled={pending}>
              {pending ? 'A gravar…' : editing ? 'Guardar' : 'Criar local'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Grelha por clínica
// =============================================================================
export function LocationCards({
  cards,
  clinics,
  users,
  isAdmin,
}: {
  cards: LocationCard[];
  clinics: { id: string; name: string }[];
  users: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [modal, setModal] = useState<{
    editing: LocationCard | null;
    clinicId?: string;
  } | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <label
          style={{
            fontSize: 13,
            color: '#454C63',
            display: 'flex',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <input
            type='checkbox'
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          Mostrar locais inativos
        </label>
        <span style={{ fontSize: 12, color: '#6A7186' }}>
          Contagem quinzenal ({STOCK_COUNT_INTERVAL_DAYS} dias) por local.
        </span>
        {isAdmin && (
          <div style={{ marginLeft: 'auto' }}>
            <Button
              variant='primary'
              onClick={() => setModal({ editing: null })}
            >
              <Plus size={16} style={{ marginRight: 6 }} />
              Novo local
            </Button>
          </div>
        )}
      </div>

      {clinics.map(clinic => {
        const list = cards
          .filter(c => c.clinicId === clinic.id && (showInactive || c.active))
          .sort((a, b) =>
            a.isCentral !== b.isCentral
              ? a.isCentral
                ? -1
                : 1
              : a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt'),
          );
        return (
          <section key={clinic.id}>
            <h2
              style={{
                margin: '0 0 10px',
                fontSize: 15,
                fontWeight: 700,
                color: '#1C2233',
              }}
            >
              {clinic.name}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {list.map(card => {
                const Icon = KIND_ICON[card.kind];
                return (
                  <Link
                    key={card.id}
                    href={`/admin/stock/locais/${card.id}`}
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      background: card.active ? '#fff' : '#F7F8FB',
                      border: `1px solid ${card.belowMinCount > 0 ? '#F3C4C1' : '#EEF1F8'}`,
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      opacity: card.active ? 1 : 0.7,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: card.isCentral ? '#1B2A6B' : '#EEF1F8',
                          color: card.isCentral ? '#fff' : '#1B2A6B',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon size={18} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: '#1C2233',
                          }}
                        >
                          {card.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#6A7186' }}>
                          {WAREHOUSE_KIND_LABEL[card.kind]}
                          {card.responsibleName
                            ? ` · ${card.responsibleName}`
                            : ''}
                        </div>
                      </div>
                      {!card.active && (
                        <span style={{ marginLeft: 'auto' }}>
                          <Badge variant='neutral'>Inativo</Badge>
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 6,
                      }}
                    >
                      <Kpi label='Produtos' value={String(card.productCount)} />
                      <Kpi
                        label='A repor'
                        value={String(card.belowMinCount)}
                        danger={card.belowMinCount > 0}
                      />
                      <Kpi label='Valor' value={fmtEur(card.valueCents)} />
                    </div>

                    {!card.isCentral && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <CountStatusBadge
                          status={card.countStatus}
                          daysUntilDue={card.daysUntilDue}
                          open={!!card.openCountId}
                        />
                        {card.lastCountAt && (
                          <span style={{ fontSize: 11, color: '#6A7186' }}>
                            última: {lisbonDate(card.lastCountAt)}
                          </span>
                        )}
                      </div>
                    )}
                    {card.belowMinCount > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#B3261E',
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        <AlertTriangle size={14} />
                        {card.belowMinCount === 1
                          ? '1 produto abaixo do mínimo'
                          : `${card.belowMinCount} produtos abaixo do mínimo`}
                      </div>
                    )}
                    {card.openCountId && (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#1B2A6B',
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        <ClipboardCheck size={14} />
                        Contagem por fechar
                      </div>
                    )}
                  </Link>
                );
              })}
              {isAdmin && (
                <button
                  type='button'
                  onClick={() =>
                    setModal({ editing: null, clinicId: clinic.id })
                  }
                  style={{
                    border: '1px dashed #C9D0E3',
                    borderRadius: 14,
                    background: 'transparent',
                    color: '#1B2A6B',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: 120,
                  }}
                >
                  + Adicionar local em {clinic.name}
                </button>
              )}
            </div>
          </section>
        );
      })}

      {modal && (
        <LocationModal
          clinics={clinics}
          users={users}
          editing={modal.editing}
          defaultClinicId={modal.clinicId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div style={{ background: '#F7F8FB', borderRadius: 8, padding: '6px 8px' }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: '#6A7186',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: danger ? '#B3261E' : '#1C2233',
        }}
      >
        {value}
      </div>
    </div>
  );
}
