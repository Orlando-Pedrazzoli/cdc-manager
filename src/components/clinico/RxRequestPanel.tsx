// 📄 src/components/clinico/RxRequestPanel.tsx
// =============================================================================
// CDC Manager — Consulta: painel de pedidos de Raio-X
// -----------------------------------------------------------------------------
// O gesto da triagem: o médico pede o RX daqui e o pedido cai NA HORA na
// fila da sala de RX (/admin/rx). O estado volta para este painel
// (Pedido → Em captação → Concluído) — o médico sabe quando o paciente
// está pronto a voltar. Na fase 2, as imagens associadas aparecem aqui.
//
// Padrão do projeto: useActionState + handled useRef; visual 100% inline.
// canEdit = consulta em curso (o pedido nasce na triagem).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  createRxRequestAction,
  cancelRxRequestAction,
  type RxActionState,
} from '@/actions/rx';
import {
  RX_MODALITIES,
  RX_MODALITY_LABEL,
  RX_STATUS_LABEL,
  type RxModality,
  type RxStatus,
} from '@/lib/domain';

export type RxItem = {
  id: string;
  modality: RxModality;
  toothNumbers: string[];
  notes: string | null;
  status: RxStatus;
  requestedAtLabel: string; // HH:mm já formatado no servidor (Lisboa)
};

const STATUS_STYLE: Record<RxStatus, { bg: string; fg: string }> = {
  requested: { bg: '#FFF4DE', fg: '#8A5A00' },
  'in-progress': { bg: '#E4EBFF', fg: '#2743A6' },
  done: { bg: '#E0F5EA', fg: '#0F7B4D' },
  cancelled: { bg: '#EAECF3', fg: '#3D4257' },
};

export function RxRequestPanel({
  appointmentId,
  items,
  canEdit,
}: {
  appointmentId: string;
  items: RxItem[];
  canEdit: boolean;
}) {
  const [createState, createAction, creating] = useActionState<
    RxActionState,
    FormData
  >(createRxRequestAction, undefined);
  const [cancelState, cancelAction, cancelling] = useActionState<
    RxActionState,
    FormData
  >(cancelRxRequestAction, undefined);

  const [modality, setModality] = useState<RxModality>('periapical');
  const formRef = useRef<HTMLFormElement>(null);
  const handledRef = useRef<RxActionState>(undefined);

  // Limpar o formulário após sucesso (padrão handled useRef do projeto)
  useEffect(() => {
    if (createState && createState !== handledRef.current) {
      handledRef.current = createState;
      if ('success' in createState) {
        formRef.current?.reset();
        setModality('periapical');
      }
    }
  }, [createState]);

  const needsTeeth = modality !== 'panoramica';
  const error =
    (createState && 'error' in createState && createState.error) ||
    (cancelState && 'error' in cancelState && cancelState.error) ||
    null;

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid #EEF1F8',
          fontSize: '14px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        Raio-X
        <span
          style={{
            marginLeft: '8px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6A7186',
          }}
        >
          — o pedido entra na fila da sala de RX ao enviar
        </span>
      </div>

      {/* Pedidos desta consulta */}
      {items.length > 0 && (
        <div>
          {items.map((r, i) => {
            const st = STATUS_STYLE[r.status];
            const muted = r.status === 'cancelled';
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '10px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                  opacity: muted ? 0.55 : 1,
                }}
              >
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                    width: 46,
                    flexShrink: 0,
                  }}
                >
                  {r.requestedAtLabel}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1C2233',
                      textDecoration: muted ? 'line-through' : 'none',
                    }}
                  >
                    {RX_MODALITY_LABEL[r.modality]}
                    {r.toothNumbers.length > 0 && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#6A7186',
                        }}
                      >
                        Dentes {r.toothNumbers.join(', ')}
                      </span>
                    )}
                  </p>
                  {r.notes && (
                    <p
                      style={{
                        margin: '1px 0 0',
                        fontSize: '12px',
                        color: '#6A7186',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.notes}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    borderRadius: '999px',
                    padding: '2px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: st.bg,
                    color: st.fg,
                    flexShrink: 0,
                  }}
                >
                  {RX_STATUS_LABEL[r.status]}
                </span>
                {canEdit && r.status === 'requested' && (
                  <form action={cancelAction} style={{ flexShrink: 0 }}>
                    <input type='hidden' name='requestId' value={r.id} />
                    <button
                      type='submit'
                      disabled={cancelling}
                      style={{
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#B3261E',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Cancelar
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Novo pedido — só com consulta em curso */}
      {canEdit && (
        <form
          ref={formRef}
          action={createAction}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '10px',
            padding: '14px 20px',
            borderTop: items.length > 0 ? '1px solid #EEF1F8' : 'none',
            backgroundColor: '#FAFBFE',
          }}
        >
          <input type='hidden' name='appointmentId' value={appointmentId} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '12px', color: '#6A7186' }}>
              Modalidade
            </span>
            <select
              name='modality'
              value={modality}
              onChange={e => setModality(e.target.value as RxModality)}
              style={{
                border: '1px solid #D8DEEF',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '13px',
                color: '#1C2233',
                backgroundColor: '#FFFFFF',
              }}
            >
              {RX_MODALITIES.map(mo => (
                <option key={mo} value={mo}>
                  {RX_MODALITY_LABEL[mo]}
                </option>
              ))}
            </select>
          </label>
          {needsTeeth && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '12px', color: '#6A7186' }}>
                Dentes (FDI, ex. 36, 37)
              </span>
              <input
                name='toothNumbers'
                placeholder='36, 37'
                style={{
                  border: '1px solid #D8DEEF',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  color: '#1C2233',
                  width: 130,
                }}
              />
            </label>
          )}
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              flex: 1,
              minWidth: 180,
            }}
          >
            <span style={{ fontSize: '12px', color: '#6A7186' }}>
              Nota ao operador (opcional)
            </span>
            <input
              name='notes'
              maxLength={300}
              placeholder='ex.: suspeita de fratura radicular'
              style={{
                border: '1px solid #D8DEEF',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '13px',
                color: '#1C2233',
                width: '100%',
              }}
            />
          </label>
          <button
            type='submit'
            disabled={creating}
            style={{
              borderRadius: '8px',
              border: 'none',
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: creating ? '#8FA0DC' : '#2743A6',
              cursor: creating ? 'default' : 'pointer',
            }}
          >
            {creating ? 'A enviar…' : 'Pedir RX'}
          </button>
          {error && (
            <p
              style={{
                margin: 0,
                width: '100%',
                fontSize: '12px',
                color: '#B3261E',
              }}
            >
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
