// 📄 src/components/configuracoes/OperationsPanel.tsx
// =============================================================================
// CDC Manager — Configurações → Operação (5.ª ronda, Victor, nov. 2026)
// -----------------------------------------------------------------------------
// Dois cartões: Promoção do mês (09) e Acesso só dentro da clínica (14).
// Convenção do projeto: visual crítico em inline style.
// =============================================================================

'use client';

import { useActionState } from 'react';
import {
  updateMonthlyPromoAction,
  updateNetworkRestrictionAction,
  type OperationsActionState,
} from '@/actions/operations';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '22px',
  maxWidth: 720,
};
const h2: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 700,
  color: '#1C2233',
};
const lead: React.CSSProperties = {
  margin: '6px 0 16px',
  fontSize: '13px',
  color: '#6A7186',
  lineHeight: 1.5,
};

function Feedback({ state }: { state: OperationsActionState }) {
  if (!state) return null;
  const ok = 'success' in state;
  return (
    <p
      role={ok ? 'status' : 'alert'}
      style={{
        margin: 0,
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '13px',
        backgroundColor: ok ? '#E7F6EC' : '#FDEDED',
        color: ok ? '#1B7A3D' : '#B3261E',
      }}
    >
      {ok ? state.message : state.error}
    </p>
  );
}

const ROLE_LABEL: Record<string, string> = {
  receptionist: 'Receção',
  doctor: 'Médicos',
};

export function OperationsPanel({
  monthlyPromo,
  network,
  currentIp,
}: {
  monthlyPromo: string | null;
  network: { enabled: boolean; allowedIps: string[]; roles: string[] };
  /** IP público deste computador, visto pelo servidor */
  currentIp: string | null;
}) {
  const [promoState, promoAction, promoPending] = useActionState<
    OperationsActionState,
    FormData
  >(updateMonthlyPromoAction, undefined);
  const [netState, netAction, netPending] = useActionState<
    OperationsActionState,
    FormData
  >(updateNetworkRestrictionAction, undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* --- Promoção do mês ------------------------------------------------ */}
      <div style={card}>
        <h2 style={h2}>Promoção do mês</h2>
        <p style={lead}>
          Aparece como opção em “Como nos conheceu”, na nova marcação, para
          saber quantas marcações vieram da promoção. Atualize no início de
          cada mês; vazio = sem promoção em vigor.
        </p>
        <form
          action={promoAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <Input
            id='monthlyPromo'
            name='monthlyPromo'
            label='Promoção em vigor'
            defaultValue={monthlyPromo ?? ''}
            maxLength={80}
            placeholder='Ex.: Branqueamento'
          />
          <Feedback state={promoState} />
          <div>
            <Button type='submit' loading={promoPending}>
              Guardar promoção
            </Button>
          </div>
        </form>
      </div>

      {/* --- Acesso só dentro da clínica ------------------------------------ */}
      <div style={card}>
        <h2 style={h2}>Acesso só dentro da clínica</h2>
        <p style={lead}>
          Com a restrição ligada, os perfis escolhidos só conseguem entrar e
          usar o sistema a partir da internet da clínica. De casa, no telemóvel
          ou noutro local, o login é recusado e uma sessão aberta é
          interrompida. A administração nunca é limitada, para poder corrigir
          a lista se o IP da clínica mudar.
        </p>
        <form
          action={netAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '14px',
              fontWeight: 600,
              color: '#1C2233',
            }}
          >
            <input
              type='checkbox'
              name='enabled'
              defaultChecked={network.enabled}
            />
            Limitar o acesso à rede da clínica
          </label>

          <div>
            <p
              style={{
                margin: '0 0 6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#3A3F4A',
              }}
            >
              Perfis limitados
            </p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {Object.entries(ROLE_LABEL).map(([role, label]) => (
                <label
                  key={role}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '13px',
                    color: '#3A3F4A',
                  }}
                >
                  <input
                    type='checkbox'
                    name={`role-${role}`}
                    defaultChecked={network.roles.includes(role)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <Textarea
            id='allowedIps'
            name='allowedIps'
            label='IP públicos permitidos (um por linha)'
            rows={4}
            defaultValue={network.allowedIps.join('\n')}
            placeholder={'Colombo: 203.0.113.25\nBuraca: 198.51.100.7'}
            help='O IP público de cada clínica (Colombo e Buraca). Tem de ser um IP fixo — com IP dinâmico o acesso deixa de funcionar quando o operador o muda.'
          />

          <p
            style={{
              margin: 0,
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: '#F8F9FD',
              border: '1px solid #EEF1F8',
              fontSize: '13px',
              color: '#3D4257',
            }}
          >
            Este computador está a aceder com o IP{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
              {currentIp ?? 'não identificado'}
            </strong>
            . Abra esta página num computador de cada clínica para saber o IP
            a escrever na lista.
          </p>

          <Feedback state={netState} />
          <div>
            <Button type='submit' loading={netPending}>
              Guardar acessos
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
