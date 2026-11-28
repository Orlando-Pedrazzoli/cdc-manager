// 📄 src/lib/moloni-payloads.ts
// =============================================================================
// CDC Manager — Moloni: montagem de pedidos (funções puras, com testes)
// -----------------------------------------------------------------------------
// 28/11: conferido com a documentação oficial (moloni.pt/dev).
// · creditNotes/insert: cada linha tem de levar `related_id` = o
//   `document_product_id` da linha correspondente na FATURA associada; o
//   preço não pode passar o da fatura e a linha tem de ter quantidade livre.
//   Por isso as linhas da nota de crédito saem SEMPRE das linhas que o
//   Moloni devolve para a fatura (documents/getOne), nunca de artigos novos.
// · documents/getOne: a série vem em `document_set.name` e o tipo em
//   `document_type.saft_code`.
// =============================================================================

export interface MoloniDocTax {
  tax_id: number;
  value?: number;
  order?: number;
  cumulative?: number;
}
export interface MoloniDocProduct {
  document_product_id?: number;
  product_id: number;
  name: string;
  summary?: string;
  price: number;
  qty: number;
  order?: number;
  discount?: number;
  exemption_reason?: string;
  taxes?: MoloniDocTax[];
}
export interface MoloniDoc {
  number?: number | string;
  atcud?: string;
  document_set_name?: string;
  document_set?: { name?: string } | null;
  document_type?: { saft_code?: string } | null;
  products?: MoloniDocProduct[];
}

/** "FT A/123" — tipo (quando vem), série e número */
export function documentNumberLabel(doc: MoloniDoc): string {
  const set = (doc.document_set?.name ?? doc.document_set_name ?? '').trim();
  const type = (doc.document_type?.saft_code ?? '').trim();
  const num = doc.number == null ? '' : String(doc.number).trim();
  const serie = [set, num].filter(Boolean).join('/');
  return [type, serie].filter(Boolean).join(' ');
}

/** O que creditar: linhas inteiras da fatura (por posição) ou só um valor */
export type CreditRequest =
  | { kind: 'lines'; lineIndexes: number[] }
  | { kind: 'value'; cents: number; skipIndexes?: number[] };

export interface CreditNoteProduct {
  product_id: number;
  related_id: number;
  name: string;
  qty: number;
  price: number;
  discount: number;
  order: number;
  exemption_reason?: string;
  taxes: MoloniDocTax[];
}

const cents = (euros: number) => Math.round(euros * 100);

/** Linhas da fatura pela ordem em que foram enviadas (posição = linha interna) */
export function invoiceProductsInOrder(doc: MoloniDoc): MoloniDocProduct[] {
  return [...(doc.products ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
}

function creditLine(
  p: MoloniDocProduct,
  price: number,
  qty: number,
  order: number,
): CreditNoteProduct {
  if (!p.document_product_id)
    throw new Error(
      'Moloni: a fatura não devolveu o identificador das linhas (document_product_id) — nota de crédito não enviada.',
    );
  const taxes = (p.taxes ?? []).map((t, i) => ({
    tax_id: t.tax_id,
    value: t.value ?? 0,
    order: t.order ?? i,
    cumulative: t.cumulative ?? 0,
  }));
  return {
    product_id: p.product_id,
    related_id: p.document_product_id,
    name: p.name,
    qty,
    price,
    discount: p.discount ?? 0,
    order,
    ...(p.exemption_reason ? { exemption_reason: p.exemption_reason } : {}),
    taxes,
  };
}

/**
 * Linhas da nota de crédito a partir das linhas da fatura no Moloni.
 * · 'lines' → as linhas escolhidas, inteiras (mesma quantidade e preço).
 * · 'value' → o valor é repartido pelas linhas da fatura, pela ordem, sem
 *   nunca passar o preço de cada uma (regra do Moloni); `skipIndexes` são
 *   linhas já creditadas por inteiro, que não podem voltar a ser usadas.
 * Lança Error com mensagem legível quando não é possível.
 */
export function creditNoteProducts(
  invoiceProducts: MoloniDocProduct[],
  req: CreditRequest,
): CreditNoteProduct[] {
  const out: CreditNoteProduct[] = [];
  if (req.kind === 'lines') {
    const seen = new Set<number>();
    for (const i of req.lineIndexes) {
      const p = invoiceProducts[i];
      if (!p || seen.has(i))
        throw new Error(
          `Moloni: a linha ${i + 1} não existe na fatura emitida — nota de crédito não enviada.`,
        );
      seen.add(i);
      out.push(creditLine(p, p.price, p.qty, out.length));
    }
    if (out.length === 0) throw new Error('Nota de crédito sem linhas.');
    return out;
  }

  let left = Math.round(req.cents);
  if (!(left > 0)) throw new Error('Nota de crédito sem valor.');
  const skip = new Set(req.skipIndexes ?? []);
  for (let i = 0; i < invoiceProducts.length && left > 0; i++) {
    if (skip.has(i)) continue;
    const p = invoiceProducts[i];
    // só linhas de quantidade 1 e sem desconto: o valor creditado é exato
    if (p.qty !== 1 || (p.discount ?? 0) !== 0) continue;
    const lineCents = cents(p.price);
    if (lineCents <= 0) continue;
    const take = Math.min(left, lineCents);
    out.push(creditLine(p, take / 100, 1, out.length));
    left -= take;
  }
  if (left > 0)
    throw new Error(
      'Moloni: o valor a creditar é superior ao que as linhas da fatura permitem — nota de crédito não enviada.',
    );
  return out;
}

/** Total (sem IVA) das linhas — para conferir com o valor da associação */
export function creditNoteNetCents(lines: CreditNoteProduct[]): number {
  return lines.reduce((s, l) => s + cents(l.price * l.qty), 0);
}

export interface MoloniMaturityDate {
  maturity_date_id: number;
  name?: string;
  days?: number | string;
}
/** Prazo de vencimento do cliente: o de 0 dias (pronto pagamento) ou o 1.º */
export function pickMaturityDateId(list: MoloniMaturityDate[]): number | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const zero = list.find(m => Number(m.days) === 0);
  return (zero ?? list[0]).maturity_date_id ?? null;
}

interface CreditEntry {
  kind?: string | null;
  lineIndexes?: number[] | null;
}
/**
 * Traduz uma entrada de `invoice.creditNotes` no pedido ao Moloni.
 * · 'lines' → essas linhas.
 * · 'value' → o valor, fora das linhas já creditadas por inteiro.
 * · 'void' / 'total' → o que falta: sem créditos anteriores, todas as
 *   linhas; só com créditos por linhas, as que faltam; havendo créditos por
 *   valor, o valor restante repartido pelas linhas ainda livres.
 */
export function creditRequestFor(
  cn: CreditEntry & { totalCents: number },
  before: CreditEntry[],
  lineCount: number,
): CreditRequest {
  const used = [
    ...new Set(
      before
        .filter(c => c.kind === 'lines')
        .flatMap(c => c.lineIndexes ?? []),
    ),
  ];
  if (cn.kind === 'lines')
    return { kind: 'lines', lineIndexes: [...(cn.lineIndexes ?? [])] };
  if (cn.kind === 'value')
    return { kind: 'value', cents: cn.totalCents, skipIndexes: used };
  const all = Array.from({ length: lineCount }, (_, i) => i);
  if (before.every(c => c.kind === 'lines'))
    return { kind: 'lines', lineIndexes: all.filter(i => !used.includes(i)) };
  return { kind: 'value', cents: cn.totalCents, skipIndexes: used };
}
