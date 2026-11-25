// 📄 src/lib/moloni.ts
// =============================================================================
// CDC Manager — Cliente Moloni (faturação certificada AT) — Fase 7A
// -----------------------------------------------------------------------------
// API v1 (https://www.moloni.pt/dev): OAuth "password grant" com a app de
// developer da clínica; chamadas POST JSON a /v1/{modulo}/{acao}/.
// Tudo por variáveis de ambiente — sem elas, `isMoloniConfigured()` = false e
// o CDC Manager continua a funcionar como hoje ('awaiting-emission').
//
//   MOLONI_CLIENT_ID, MOLONI_CLIENT_SECRET, MOLONI_USERNAME, MOLONI_PASSWORD
//   MOLONI_COMPANY_ID          → empresa (Testar ligação lista as empresas)
//   MOLONI_DOCUMENT_SETS       → JSON clínica → série: {"colombo":123,"buraca":456}
//                                (25/11, Victor: UMA série por clínica, registada
//                                na AT para fatura, recibo, NC, ND e orçamento;
//                                em janeiro trocam-se pelos ids das séries do ano)
//   MOLONI_DOCUMENT_SET_ID     → (antigo) série única, usada se a clínica não
//                                estiver em MOLONI_DOCUMENT_SETS
//   MOLONI_CATEGORY_ID         → categoria de artigos onde os atos são criados
//   MOLONI_UNIT_ID             → unidade de medida (ex.: "Unidade")
//   MOLONI_EXEMPTION_REASON    → código de isenção de IVA (default M07 — art. 9.º CIVA)
//   MOLONI_PAYMENT_METHODS     → JSON {"cash":1,"card":2,"mbway":3,"transfer":4}
//   MOLONI_TAX_IDS             → JSON taxa → imposto Moloni: {"23":12345}
//                                (produtos do balcão; os atos são isentos)
//
// Documentos: FATURA + RECIBO em separado (nunca fatura-recibo) e notas de
// crédito totais ou parciais, sempre associadas à fatura.
//
// Ainda não testado contra a conta real (credenciais por criar) — cada
// pressuposto sobre campos obrigatórios está assinalado com "ASSUMIDO".
// =============================================================================

const BASE = 'https://api.moloni.pt/v1';

/** Credenciais da API (chega para "Testar ligação", que lista as empresas
 *  e assim dá o MOLONI_COMPANY_ID) */
export function hasMoloniCredentials(): boolean {
  return !!(
    process.env.MOLONI_CLIENT_ID &&
    process.env.MOLONI_CLIENT_SECRET &&
    process.env.MOLONI_USERNAME &&
    process.env.MOLONI_PASSWORD
  );
}
export function isMoloniConfigured(): boolean {
  return !!(
    process.env.MOLONI_CLIENT_ID &&
    process.env.MOLONI_CLIENT_SECRET &&
    process.env.MOLONI_USERNAME &&
    process.env.MOLONI_PASSWORD &&
    process.env.MOLONI_COMPANY_ID
  );
}
export function isMoloniEmissionReady(): boolean {
  return (
    isMoloniConfigured() &&
    hasAnyDocumentSet() &&
    !!process.env.MOLONI_CATEGORY_ID &&
    !!process.env.MOLONI_UNIT_ID &&
    !!process.env.MOLONI_PAYMENT_METHODS
  );
}
export const companyId = () => Number(process.env.MOLONI_COMPANY_ID) || 0;
const exemption = () => process.env.MOLONI_EXEMPTION_REASON || 'M07';
function jsonMap(raw: string | undefined): Record<string, number> {
  try {
    const m = JSON.parse(raw ?? '{}') as unknown;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}
export function paymentMethodId(method: string): number | null {
  return jsonMap(process.env.MOLONI_PAYMENT_METHODS)[method] ?? null;
}
/** Série (document_set_id) da clínica — uma por clínica, todos os tipos */
export function documentSetFor(clinicSlug: string): number | null {
  const bySlug = jsonMap(process.env.MOLONI_DOCUMENT_SETS)[clinicSlug];
  if (bySlug) return bySlug;
  const single = Number(process.env.MOLONI_DOCUMENT_SET_ID);
  return Number.isInteger(single) && single > 0 ? single : null;
}
function hasAnyDocumentSet(): boolean {
  return (
    Object.keys(jsonMap(process.env.MOLONI_DOCUMENT_SETS)).length > 0 ||
    Number(process.env.MOLONI_DOCUMENT_SET_ID) > 0
  );
}
/** Imposto Moloni (tax_id) para uma taxa de IVA em % */
export function taxIdFor(rate: number): number | null {
  return jsonMap(process.env.MOLONI_TAX_IDS)[String(rate)] ?? null;
}

// --- Token (cache em memória por instância; a Vercel reinicia, renova) ------
let cached: { token: string; expiresAt: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const p = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.MOLONI_CLIENT_ID ?? '',
    client_secret: process.env.MOLONI_CLIENT_SECRET ?? '',
    username: process.env.MOLONI_USERNAME ?? '',
    password: process.env.MOLONI_PASSWORD ?? '',
  });
  const res = await fetch(`${BASE}/grant/?${p}`, { cache: 'no-store' });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !j.access_token) {
    throw new Error(
      `Moloni: autenticação falhou (${j.error_description ?? j.error ?? res.status})`,
    );
  }
  cached = {
    token: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

export async function moloni<T = unknown>(
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const t = await token();
  const res = await fetch(`${BASE}/${endpoint}/?access_token=${t}&json=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const j = (await res.json().catch(() => null)) as unknown;
  if (!res.ok)
    throw new Error(
      `Moloni ${endpoint}: HTTP ${res.status} ${JSON.stringify(j).slice(0, 300)}`,
    );
  // Erros de validação vêm como array [{code, field, description}] ou {valid:0,...}
  if (
    Array.isArray(j) &&
    j.length > 0 &&
    typeof j[0] === 'object' &&
    j[0] &&
    'code' in (j[0] as object) &&
    'description' in (j[0] as object)
  ) {
    const e = j[0] as { description?: string; field?: string };
    throw new Error(
      `Moloni ${endpoint}: ${e.description ?? 'erro'}${e.field ? ` (${e.field})` : ''}`,
    );
  }
  if (
    j &&
    typeof j === 'object' &&
    'valid' in (j as object) &&
    (j as { valid: number }).valid === 0
  ) {
    throw new Error(
      `Moloni ${endpoint}: pedido inválido ${JSON.stringify(j).slice(0, 300)}`,
    );
  }
  return j as T;
}

// --- Descoberta (para "Testar ligação") ---------------------------------------
export async function discover() {
  const cid = companyId();
  const [companies, sets, categories, units, methods, exemptions, taxes] =
    await Promise.all([
      moloni<{ company_id: number; name: string; vat: string }[]>(
        'companies/getAll',
      ),
      cid
        ? moloni<{ document_set_id: number; name: string }[]>(
            'documentSets/getAll',
            { company_id: cid },
          )
        : [],
      cid
        ? moloni<{ category_id: number; name: string }[]>(
            'productCategories/getAll',
            { company_id: cid, parent_id: 0 },
          )
        : [],
      cid
        ? moloni<{ unit_id: number; name: string }[]>(
            'measurementUnits/getAll',
            { company_id: cid },
          )
        : [],
      cid
        ? moloni<{ payment_method_id: number; name: string }[]>(
            'paymentMethods/getAll',
            { company_id: cid },
          )
        : [],
      cid
        ? moloni<{ code: string; name: string }[]>('taxExemptions/getAll', {
            company_id: cid,
          }).catch(() => [])
        : [],
      cid
        ? moloni<{ tax_id: number; name: string; value: number }[]>(
            'taxes/getAll',
            { company_id: cid },
          ).catch(() => [])
        : [],
    ]);
  return {
    companies,
    documentSets: sets,
    categories,
    units,
    paymentMethods: methods,
    exemptions,
    taxes,
  };
}

// --- Cliente (paciente) ---------------------------------------------------------
const CONSUMIDOR_FINAL_VAT = '999999990';
export async function ensureCustomer(p: {
  name: string;
  nif: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): Promise<number> {
  const cid = companyId();
  const vat = p.nif ?? CONSUMIDOR_FINAL_VAT;
  const found = await moloni<{ customer_id: number; name: string }[]>(
    'customers/getByVat',
    { company_id: cid, vat },
  );
  const exact = found.find(
    c =>
      vat !== CONSUMIDOR_FINAL_VAT ||
      c.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
  );
  if (exact) return exact.customer_id;
  const next = await moloni<{ number: string }>('customers/getNextNumber', {
    company_id: cid,
  });
  const ins = await moloni<{ valid: number; customer_id: number }>(
    'customers/insert',
    {
      company_id: cid,
      vat,
      number: next.number,
      name: p.name,
      language_id: 1, // ASSUMIDO: 1 = Português
      address: p.address ?? 'Desconhecida',
      zip_code: p.postalCode ?? '0000-000',
      city: p.city ?? 'Desconhecida',
      country_id: 1, // ASSUMIDO: 1 = Portugal
      email: p.email ?? '',
      phone: p.phone ?? '',
      maturity_date_id: 0,
      payment_day: 0,
      discount: 0,
      credit_limit: 0,
      payment_method_id: 0,
      delivery_method_id: 0,
      salesperson_id: 0,
    },
  );
  return ins.customer_id;
}

// --- Artigo (ato) ---------------------------------------------------------------
export async function ensureProduct(p: {
  reference: string;
  name: string;
  priceCents: number;
  vatRate?: number;
}): Promise<number> {
  const cid = companyId();
  const rate = p.vatRate ?? 0;
  const taxId = rate > 0 ? taxIdFor(rate) : null;
  const found = await moloni<{ product_id: number; reference: string }[]>(
    'products/getByReference',
    { company_id: cid, reference: p.reference, exact: 1 },
  );
  if (found[0]) return found[0].product_id;
  const ins = await moloni<{ valid: number; product_id: number }>(
    'products/insert',
    {
      company_id: cid,
      category_id: Number(process.env.MOLONI_CATEGORY_ID),
      type: 2, // ASSUMIDO: 2 = serviço
      name: p.name.slice(0, 200),
      reference: p.reference.slice(0, 30),
      price: p.priceCents / 100,
      unit_id: Number(process.env.MOLONI_UNIT_ID),
      has_stock: 0,
      stock: 0,
      ...(taxId != null
        ? { taxes: [{ tax_id: taxId, value: rate, order: 0, cumulative: 0 }] }
        : { exemption_reason: exemption(), taxes: [] }),
    },
  );
  return ins.product_id;
}

// --- Linhas de produto (IVA) ---------------------------------------------------
// Atos clínicos: isentos (M07, art. 9.º CIVA). Produtos do balcão: taxa do
// catálogo (normalmente 23%) — o tax_id do Moloni vem de MOLONI_TAX_IDS.
export interface EmitLine {
  reference: string;
  name: string;
  /** preço unitário SEM IVA (os atos são isentos: sem IVA = com IVA) */
  priceCents: number;
  qty: number;
  /** taxa de IVA em % (0 = isento). Default 0. */
  vatRate?: number;
}

async function productLines(lines: EmitLine[]) {
  const products = [];
  let order = 0;
  for (const l of lines) {
    const rate = l.vatRate ?? 0;
    const product_id = await ensureProduct({
      reference: l.reference,
      name: l.name,
      priceCents: l.priceCents,
      vatRate: rate,
    });
    const taxId = rate > 0 ? taxIdFor(rate) : null;
    if (rate > 0 && taxId == null)
      throw new Error(
        `Moloni: falta o imposto de ${rate}% em MOLONI_TAX_IDS (Testar ligação lista-os).`,
      );
    products.push({
      product_id,
      name: l.name.slice(0, 200),
      qty: l.qty,
      price: l.priceCents / 100,
      discount: 0,
      order: order++,
      ...(taxId != null
        ? { taxes: [{ tax_id: taxId, value: rate, order: 0, cumulative: 0 }] }
        : { exemption_reason: exemption(), taxes: [] }),
    });
  }
  return products;
}

async function docLabel(documentId: number) {
  const doc = await moloni<{
    document_set_name?: string;
    number?: number;
    atcud?: string;
  }>('documents/getOne', { company_id: companyId(), document_id: documentId });
  return {
    number: `${doc.document_set_name ?? ''}/${doc.number ?? ''}`.trim(),
    atcud: doc.atcud ?? null,
  };
}

// --- Fatura (FT) ------------------------------------------------------------------
// 25/11 (Victor): sempre FATURA, com o RECIBO em separado — nunca fatura-recibo.
export async function insertInvoice(input: {
  clinicSlug: string;
  customerId: number;
  date: string; // YYYY-MM-DD
  lines: EmitLine[];
  notes?: string | null;
}): Promise<{
  documentId: number;
  number: string;
  atcud: string | null;
  setId: number;
}> {
  const setId = documentSetFor(input.clinicSlug);
  if (setId == null)
    throw new Error(`Moloni: sem série para a clínica "${input.clinicSlug}".`);
  const ins = await moloni<{ valid: number; document_id: number }>(
    'invoices/insert',
    {
      company_id: companyId(),
      date: input.date,
      expiration_date: input.date, // ASSUMIDO: vencimento a pronto
      document_set_id: setId,
      customer_id: input.customerId,
      products: await productLines(input.lines),
      notes: input.notes ?? '',
      status: 1, // fechado (emitido e comunicado)
    },
  );
  const l = await docLabel(ins.document_id);
  return { documentId: ins.document_id, ...l, setId };
}

// --- Recibo (RC) — um por pagamento, associado à fatura ------------------------------
export async function insertReceipt(input: {
  clinicSlug: string;
  customerId: number;
  date: string;
  invoiceDocumentId: number;
  method: string;
  valueCents: number;
  notes?: string | null;
}): Promise<{ documentId: number; number: string }> {
  const setId = documentSetFor(input.clinicSlug);
  if (setId == null)
    throw new Error(`Moloni: sem série para a clínica "${input.clinicSlug}".`);
  const pm = paymentMethodId(input.method);
  if (pm == null)
    throw new Error(
      `Moloni: meio de pagamento "${input.method}" sem correspondência em MOLONI_PAYMENT_METHODS.`,
    );
  const value = input.valueCents / 100;
  const ins = await moloni<{ valid: number; document_id: number }>(
    'receipts/insert',
    {
      company_id: companyId(),
      date: input.date,
      document_set_id: setId,
      customer_id: input.customerId,
      net_value: value,
      associated_documents: [
        { associated_id: input.invoiceDocumentId, value },
      ],
      payments: [{ payment_method_id: pm, date: input.date, value }],
      notes: input.notes ?? '',
      status: 1,
    },
  );
  const l = await docLabel(ins.document_id);
  return { documentId: ins.document_id, number: l.number };
}

// --- Nota de crédito (NC) — total ou parcial, associada à fatura ---------------------
export async function insertCreditNote(input: {
  clinicSlug: string;
  customerId: number;
  date: string;
  associatedDocumentId: number;
  totalCents: number;
  lines: EmitLine[];
  notes?: string | null;
}): Promise<{ documentId: number; number: string }> {
  const setId = documentSetFor(input.clinicSlug);
  if (setId == null)
    throw new Error(`Moloni: sem série para a clínica "${input.clinicSlug}".`);
  const ins = await moloni<{ valid: number; document_id: number }>(
    'creditNotes/insert',
    {
      company_id: companyId(),
      date: input.date,
      document_set_id: setId,
      customer_id: input.customerId,
      associated_documents: [
        {
          associated_id: input.associatedDocumentId,
          value: input.totalCents / 100,
        },
      ],
      products: await productLines(input.lines),
      notes: input.notes ?? '',
      status: 1,
    },
  );
  const l = await docLabel(ins.document_id);
  return { documentId: ins.document_id, number: l.number };
}

export async function documentPdfLink(
  documentId: number,
): Promise<string | null> {
  const r = await moloni<{ url?: string }>('documents/getPDFLink', {
    company_id: companyId(),
    document_id: documentId,
  });
  return r.url ?? null;
}
