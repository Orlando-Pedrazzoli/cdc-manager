// 📄 src/components/clinico/RxRequestPanel.tsx
// =============================================================================
// CDC Manager — Consulta: painel de pedidos de Raio-X
// -----------------------------------------------------------------------------
// O gesto da triagem: o médico pede o RX daqui e o pedido cai NA HORA na
// fila da sala de RX (/admin/rx). O estado volta para este painel
// (Pedido → Em captação → Concluído) — o médico sabe quando o paciente
// está pronto a voltar. Na fase 2, as imagens associadas aparecem aqui.
//
// Padrão do projeto: efeitos do resultado no callback do useActionState
// (sem useEffect a observar o estado); visual 100% inline.
// canEdit = consulta em curso (o pedido nasce na triagem).
// =============================================================================

'use client';

import { useActionState, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  createRxRequestAction,
  cancelRxRequestAction,
  saveRxReportAction,
  type RxActionState,
} from '@/actions/rx';
import { RX_REPORT_MAX } from '@/lib/rx-report';
import { SignaturePad } from '@/components/clinico/SignaturePad';
import { RxLaunchButtons } from '@/components/rx/RxLaunchButton';
import {
  RX_MODALITIES_OFFERED,
  rxModalityUsesTeeth,
  RX_MODALITY_LABEL,
  RX_STATUS_LABEL,
  RX_CONSENT_LEGAL_TEXT,
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
  /** Imagens captadas (URLs assinadas geradas no servidor — lib/storage).
   *  url = abrir em tamanho real (imagem grande ou o próprio PDF);
   *  thumbUrl = miniatura no painel; null (PDF) → mostra um ícone */
  images: { url: string; thumbUrl: string | null; label: string }[];
  /** Ponto 31: relatório escrito pelo médico (null = por escrever).
   *  pdfUrl = o documento na ficha do paciente (URL assinada) */
  report: { text: string; writtenAtLabel: string; pdfUrl: string | null } | null;
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
  patient,
}: {
  appointmentId: string;
  items: RxItem[];
  canEdit: boolean;
  /** Para os botões "Abrir no Kodak" / "Abrir no iRYS" (omitido = sem botões) */
  patient?: {
    processNumber: number | null;
    kodakFolder: string | null;
    name: string;
  };
}) {
  const [modality, setModality] = useState<RxModality>('periapical');
  // B.6: o pedido só sai com consentimento assinado — passo intermédio
  const [consentOpen, setConsentOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [createState, createAction, creating] = useActionState<
    RxActionState,
    FormData
  >(async (prev, formData) => {
    const result = await createRxRequestAction(prev, formData);
    if (result && 'success' in result) {
      // Limpar o formulário após sucesso
      formRef.current?.reset();
      setModality('periapical');
      setConsentOpen(false);
      setSignature(null);
    }
    if (result && 'error' in result) {
      // Erro do servidor: voltar ao formulário para corrigir
      setConsentOpen(false);
      setSignature(null);
    }
    return result;
  }, undefined);
  const [cancelState, cancelAction, cancelling] = useActionState<
    RxActionState,
    FormData
  >(cancelRxRequestAction, undefined);

  const needsTeeth = rxModalityUsesTeeth(modality);
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span>
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
        </span>
        {patient && (
          <span style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
            <RxLaunchButtons
              processNumber={patient.processNumber}
              kodakFolder={patient.kodakFolder}
              name={patient.name}
              size='sm'
            />
          </span>
        )}
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
                  padding: '10px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                  opacity: muted ? 0.55 : 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
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

                {/* Imagens captadas — o médico abre no ecrã e explica ao
                  paciente (clique = tamanho real em nova aba) */}
                {r.images.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      marginTop: '10px',
                    }}
                  >
                    {r.images.map((img, j) => (
                      <a
                        key={j}
                        href={img.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        title={`${img.label} — abrir em tamanho real`}
                        style={{
                          display: 'block',
                          border: '1px solid #D8DEEF',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          backgroundColor: '#0B0F1E',
                          lineHeight: 0,
                        }}
                      >
                        {img.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img.thumbUrl}
                            alt={img.label}
                            style={{
                              height: 140,
                              maxWidth: 240,
                              objectFit: 'contain',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              height: 140,
                              width: 110,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              color: '#C9D1E8',
                              fontSize: 12,
                              lineHeight: 1.2,
                            }}
                          >
                            <FileText size={30} />
                            PDF
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}

                {/* Ponto 31 — relatório da radiografia (interpretação) */}
                {r.status === 'done' && <RxReport item={r} />}
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
              {RX_MODALITIES_OFFERED.map(mo => (
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
          <input
            type='hidden'
            name='consentSignature'
            value={signature ?? ''}
          />
          <button
            type='button'
            onClick={() => setConsentOpen(true)}
            disabled={creating || consentOpen}
            style={{
              borderRadius: '8px',
              border: 'none',
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: creating || consentOpen ? '#8FA0DC' : '#2743A6',
              cursor: creating || consentOpen ? 'default' : 'pointer',
            }}
          >
            Pedir RX
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

          {/* B.6 — Consentimento por exposição: texto legal + assinatura.
              O pedido SÓ é submetido daqui, com a assinatura preenchida. */}
          {consentOpen && (
            <div
              style={{
                width: '100%',
                marginTop: '4px',
                border: '1px solid #C9D4FF',
                borderRadius: '12px',
                backgroundColor: '#F5F8FF',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                }}
              >
                Consentimento informado — {RX_MODALITY_LABEL[modality]}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#3D4257',
                  lineHeight: 1.5,
                }}
              >
                {RX_CONSENT_LEGAL_TEXT}
              </p>
              <SignaturePad onChange={setSignature} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type='submit'
                  disabled={creating || !signature}
                  style={{
                    borderRadius: '8px',
                    border: 'none',
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    backgroundColor:
                      creating || !signature ? '#8FA0DC' : '#0F7B4D',
                    cursor: creating || !signature ? 'default' : 'pointer',
                  }}
                >
                  {creating
                    ? 'A enviar…'
                    : 'Confirmar consentimento e pedir RX'}
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setConsentOpen(false);
                    setSignature(null);
                  }}
                  disabled={creating}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid #D8DEEF',
                    padding: '9px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1B2A6B',
                    backgroundColor: '#FFFFFF',
                    cursor: creating ? 'default' : 'pointer',
                  }}
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Ponto 31 (Giulia, 27/11/2026): relatório da radiografia
// -----------------------------------------------------------------------------
// "Se cobramos a interpretação, devia existir registo dela." O médico escreve
// o que foi detetado; fica no pedido e o PDF vai para os documentos do
// paciente. Escreve-se uma vez — por isso o aviso antes de guardar.
function RxReport({ item }: { item: RxItem }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, action, saving] = useActionState<RxActionState, FormData>(
    async (prev, formData) => {
      const result = await saveRxReportAction(prev, formData);
      if (result && 'success' in result) {
        setOpen(false);
        setText('');
      }
      return result;
    },
    undefined,
  );
  const error = state && 'error' in state ? state.error : null;

  if (item.report) {
    return (
      <div
        style={{
          marginTop: '10px',
          border: '1px solid #E3E8F5',
          borderRadius: '10px',
          backgroundColor: '#F8FAFF',
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#1B2A6B' }}>
            Relatório
            <span style={{ marginLeft: 8, fontWeight: 500, color: '#6A7186' }}>
              {item.report.writtenAtLabel}
            </span>
          </span>
          {item.report.pdfUrl && (
            <a
              href={item.report.pdfUrl}
              target='_blank'
              rel='noopener noreferrer'
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '12px',
                fontWeight: 600,
                color: '#2743A6',
                textDecoration: 'none',
              }}
            >
              <FileText size={14} /> Abrir PDF
            </a>
          )}
        </div>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '13px',
            color: '#1C2233',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {item.report.text}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        style={{
          marginTop: '10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: '8px',
          border: '1px solid #C9D4FF',
          padding: '7px 12px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#2743A6',
          backgroundColor: '#FFFFFF',
          cursor: 'pointer',
        }}
      >
        <FileText size={14} /> Escrever relatório
      </button>
    );
  }

  return (
    <form
      action={action}
      style={{
        marginTop: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <input type='hidden' name='requestId' value={item.id} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: '12px', color: '#6A7186' }}>
          O que foi detetado na radiografia
        </span>
        <textarea
          name='text'
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={RX_REPORT_MAX}
          rows={4}
          autoFocus
          placeholder='ex.: lesão periapical no 36; perda óssea horizontal generalizada; sem outras alterações'
          style={{
            border: '1px solid #D8DEEF',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '13px',
            color: '#1C2233',
            width: '100%',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </label>
      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
        Fica nos documentos do paciente, com o seu nome e cédula. Depois de
        guardado não pode ser alterado.
      </p>
      {error && (
        <p style={{ margin: 0, fontSize: '12px', color: '#B3261E' }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type='submit'
          disabled={saving || text.trim().length === 0}
          style={{
            borderRadius: '8px',
            border: 'none',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor:
              saving || text.trim().length === 0 ? '#8FA0DC' : '#2743A6',
            cursor: saving || text.trim().length === 0 ? 'default' : 'pointer',
          }}
        >
          {saving ? 'A guardar…' : 'Guardar relatório'}
        </button>
        <button
          type='button'
          onClick={() => setOpen(false)}
          disabled={saving}
          style={{
            borderRadius: '8px',
            border: '1px solid #D8DEEF',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#1B2A6B',
            backgroundColor: '#FFFFFF',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
