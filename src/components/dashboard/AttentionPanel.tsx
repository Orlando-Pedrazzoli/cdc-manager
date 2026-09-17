// 📄 src/components/dashboard/AttentionPanel.tsx
// =============================================================================
// CDC Manager — Dashboard: "Requer atenção"
// -----------------------------------------------------------------------------
// Centraliza as pendências que antes eram 5 cards espalhados (RX, próteses,
// recalls, stock, catálogo). A dashboard deixa de dizer "aqui estão os dados"
// e passa a dizer "aqui está o que precisa ser feito". Só aparecem itens
// com contagem > 0; a zero, uma linha "Tudo em dia". Tarefas administrativas
// (catálogo) entram no fim, em cinza — nunca competem com um problema.
// =============================================================================

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react';
import { C, Section, type Tone, TONE } from './ui';

export type AttentionItem = {
  count: number;
  /** "4 pacientes sem RX anexado" — já com o número dentro */
  label: string;
  href: string;
  tone: Tone;
  /** true = tarefa administrativa, listada discreta no fim */
  admin?: boolean;
};

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const problems = items.filter(i => !i.admin && i.count > 0);
  const admin = items.filter(i => i.admin && i.count > 0);
  const total = problems.reduce((s, i) => s + i.count, 0);

  return (
    <Section
      title='Requer atenção'
      flush
      action={
        total > 0 ? (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: C.bad,
              backgroundColor: C.badBg,
              borderRadius: '999px',
              padding: '2px 9px',
            }}
          >
            {problems.length}
          </span>
        ) : undefined
      }
    >
      {problems.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '16px 18px',
          }}
        >
          <CheckCircle2 size={18} style={{ color: C.good, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
            Tudo em dia. Sem pendências operacionais.
          </p>
        </div>
      ) : (
        problems.map((it, i) => {
          const t = TONE[it.tone];
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '11px 18px',
                borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}`,
                textDecoration: 'none',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  backgroundColor: t.bg,
                  color: t.fg,
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={15} />
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: C.text,
                }}
              >
                {it.label}
              </span>
              <span
                style={{ fontSize: '12px', fontWeight: 600, color: C.action }}
              >
                Ver
              </span>
            </Link>
          );
        })
      )}

      {admin.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${C.line}`,
            backgroundColor: '#FAFBFE',
          }}
        >
          {admin.map(it => (
            <Link
              key={it.href}
              href={it.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 18px',
                textDecoration: 'none',
              }}
            >
              <ClipboardList
                size={15}
                style={{ color: C.faint, flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '12px',
                  color: C.muted,
                }}
              >
                {it.label}
              </span>
              <span
                style={{ fontSize: '12px', fontWeight: 600, color: C.action }}
              >
                Rever
              </span>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
