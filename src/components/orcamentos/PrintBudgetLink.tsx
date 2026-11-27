// 📄 src/components/orcamentos/PrintBudgetLink.tsx
// =============================================================================
// CDC Manager — "Imprimir" de um orçamento: abre o PDF A4 num separador novo,
// de onde se imprime ou guarda (pedido do Victor, 27/11/2026).
// `area` decide a rota: gestão/receção (/admin) ou médico (/doutor).
// =============================================================================

import { Printer } from 'lucide-react';

export function PrintBudgetLink({
  planId,
  area,
  label = 'Imprimir',
}: {
  planId: string;
  area: 'admin' | 'doutor';
  label?: string;
}) {
  return (
    <a
      href={`/${area}/orcamentos/${planId}/pdf`}
      target='_blank'
      rel='noopener noreferrer'
      title='Abrir o orçamento em PDF (A4) para imprimir'
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        border: '1px solid #D8DEEF',
        borderRadius: 8,
        padding: '4px 10px',
        fontSize: '12.5px',
        fontWeight: 600,
        color: '#1B2A6B',
        backgroundColor: '#FFFFFF',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <Printer size={13} />
      {label}
    </a>
  );
}
