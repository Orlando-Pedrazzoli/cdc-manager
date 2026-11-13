// 📄 src/lib/product-sales.ts
// =============================================================================
// CDC Manager — Venda de produtos ao balcão: contas (7.ª ronda/B2b)
// -----------------------------------------------------------------------------
// Victor (11 e 13/11/2026): a receção precisa de lançar produtos vendidos
// diretamente ao balcão (ex.: bisnaga de branqueamento). "Estes produtos não
// passam pelos médicos, por isso não devem ser lançados por eles nem contar
// para a sua faturação." No menu, "Produtos" por baixo de "Tratamentos".
//
// Regras:
//   · o preço do catálogo é o PVP, COM IVA incluído (é o que a receção diz
//     ao paciente);
//   · cada produto tem a sua taxa de IVA (0, 6, 13 ou 23%), definida pela
//     gestão — os atos médicos são isentos, os produtos normalmente não;
//   · a venda não tem médico nem comissão.
// Contas em cêntimos, sem vírgula flutuante nos totais. Funções puras.
// =============================================================================

export const VAT_RATES = [0, 6, 13, 23] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const VAT_RATE_LABEL: Record<VatRate, string> = {
  0: 'Isento (0%)',
  6: 'Reduzida (6%)',
  13: 'Intermédia (13%)',
  23: 'Normal (23%)',
};

export const SALE_MAX_LINES = 20;
export const SALE_MAX_QTY = 99;

export function isVatRate(v: unknown): v is VatRate {
  return typeof v === 'number' && (VAT_RATES as readonly number[]).includes(v);
}

export interface SaleLineInput {
  unitPriceCents: number;
  quantity: number;
  vatRate: number;
}

export interface SaleLineTotals {
  /** Total da linha, com IVA */
  totalCents: number;
  /** IVA contido no total */
  vatCents: number;
  /** Total sem IVA */
  netCents: number;
}

/** IVA contido num valor que já o inclui: total − total / (1 + taxa) */
export function vatIncluded(totalCents: number, vatRate: number): number {
  if (vatRate <= 0 || totalCents <= 0) return 0;
  return Math.round(totalCents - (totalCents * 100) / (100 + vatRate));
}

export function saleLineTotals(line: SaleLineInput): SaleLineTotals {
  const totalCents = Math.max(0, Math.round(line.unitPriceCents)) * line.quantity;
  const vatCents = vatIncluded(totalCents, line.vatRate);
  return { totalCents, vatCents, netCents: totalCents - vatCents };
}

export function saleTotals(lines: SaleLineInput[]): SaleLineTotals {
  return lines.reduce<SaleLineTotals>(
    (acc, l) => {
      const t = saleLineTotals(l);
      return {
        totalCents: acc.totalCents + t.totalCents,
        vatCents: acc.vatCents + t.vatCents,
        netCents: acc.netCents + t.netCents,
      };
    },
    { totalCents: 0, vatCents: 0, netCents: 0 },
  );
}

/** "12,50" / "12.5" / "12" → 1250; null se não for um preço válido */
export function parsePriceToCents(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
