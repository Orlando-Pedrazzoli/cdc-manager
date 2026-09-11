// 📄 src/lib/commissions.ts
// =============================================================================
// CDC Manager — Motor financeiro das linhas de tratamento (Fase 1)
// -----------------------------------------------------------------------------
// FÓRMULA (pedido da Isabel, email de 10/09/2026):
//
//   PVP (listPriceCents)
//   − desconto (discountCents, dado em % OU em €)        → priceCents  (valor cobrado)
//   − custo direto do ato (costCents, default do catálogo) → commissionBaseCents
//   × taxa do médico  (ou valor FIXO)                     → commissionCents
//
// NOMENCLATURA (decisão de desenho — ver argumentação na entrega):
//   · `priceCents` MANTÉM o significado que já tinha em todo o sistema:
//     "o que o paciente paga por esta linha". Cobrança, faturas, dashboards
//     e relatórios que somam priceCents continuam corretos sem alterações.
//   · O PVP antes do desconto passa a viver em `listPriceCents`; registos
//     antigos (sem o campo) leem-se como listPrice = price, desconto 0.
//
// CADEIA DE RESOLUÇÃO DA REMUNERAÇÃO (do mais específico ao mais geral):
//   1. override do médico para a LINHA (ato)        → Doctor.commissionOverrides
//   2. override do médico para a CATEGORIA do ato   → Doctor.commissionCategoryOverrides
//   3. taxa base do médico                          → Doctor.commissionRate
//   4. taxa própria do ato                          → TreatmentType.commissionRate
//   5. default da clínica onde o ato é feito        → Clinic.defaultDoctorCommission
// Os degraus 1 e 2 podem ser PERCENTAGEM ou VALOR FIXO por ato (E9).
// Os degraus 3–5 são sempre percentagem (acordo base negociado; o fixo é
// sempre uma exceção pontual, daí viver apenas nos overrides).
//
// BASE DE CÁLCULO nunca é negativa: se desconto + custo ultrapassarem o PVP
// (cortesia total, p. ex.) a base é 0 e a comissão percentual é 0. Um valor
// FIXO aplica-se mesmo assim — é um acordo por ato, não por margem.
//
// ARREDONDAMENTO — banker's rounding (half to even), já em uso no projeto.
// Funções PURAS — sem mongoose; testadas em scripts/tests/commissions.test.ts.
// =============================================================================

export type CommissionMode = 'percent' | 'fixed';

/** Regra de remuneração (override de linha ou de categoria) */
export interface CommissionRule {
  mode: CommissionMode;
  /** Fração 0..1 quando mode = 'percent' */
  rate?: number | null;
  /** Cêntimos inteiros quando mode = 'fixed' */
  fixedCents?: number | null;
}

export interface CommissionOverrideLike extends CommissionRule {
  treatmentTypeId: unknown; // ObjectId ou string — comparado por String()
}

export interface CategoryOverrideLike extends CommissionRule {
  category: string;
}

export type CommissionSource =
  | 'treatment-override'
  | 'category-override'
  | 'doctor-rate'
  | 'treatment-rate'
  | 'clinic-default';

/** Regra RESOLVIDA (o que fica congelado no Procedure) */
export interface ResolvedCommission {
  mode: CommissionMode;
  rate: number; // 0 quando mode = 'fixed' (mantém o campo obrigatório do model)
  fixedCents: number | null;
  source: CommissionSource;
}

export interface ResolveCommissionParams {
  overrides: CommissionOverrideLike[] | null | undefined;
  categoryOverrides?: CategoryOverrideLike[] | null | undefined;
  doctorRate: number | null | undefined;
  treatmentRate?: number | null | undefined;
  clinicDefault: number;
  treatmentTypeId: unknown;
  /** Categoria do ato (TreatmentType.category) — null = sem categoria */
  category?: string | null | undefined;
}

// -----------------------------------------------------------------------------
// Validação de valores
// -----------------------------------------------------------------------------
export function isValidRate(rate: unknown): rate is number {
  return (
    typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1
  );
}

function isValidFixed(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isInteger(cents) && cents >= 0;
}

function ruleIsUsable(rule: CommissionRule | undefined | null): boolean {
  if (!rule) return false;
  if (rule.mode === 'fixed') return isValidFixed(rule.fixedCents);
  return isValidRate(rule.rate);
}

function normalizeCategory(c: string | null | undefined): string {
  return (c ?? '').trim().toUpperCase();
}

// -----------------------------------------------------------------------------
// Resolução
// -----------------------------------------------------------------------------
export function resolveCommission(
  params: ResolveCommissionParams,
): ResolvedCommission {
  const wanted = String(params.treatmentTypeId);

  // 1. override da linha
  const line = (params.overrides ?? []).find(
    o => String(o.treatmentTypeId) === wanted,
  );
  if (ruleIsUsable(line)) {
    return toResolved(line as CommissionRule, 'treatment-override');
  }

  // 2. override da categoria
  const cat = normalizeCategory(params.category);
  if (cat) {
    const catRule = (params.categoryOverrides ?? []).find(
      o => normalizeCategory(o.category) === cat,
    );
    if (ruleIsUsable(catRule)) {
      return toResolved(catRule as CommissionRule, 'category-override');
    }
  }

  // 3. taxa base do médico
  if (isValidRate(params.doctorRate)) {
    return {
      mode: 'percent',
      rate: params.doctorRate,
      fixedCents: null,
      source: 'doctor-rate',
    };
  }

  // 4. taxa do ato
  if (isValidRate(params.treatmentRate)) {
    return {
      mode: 'percent',
      rate: params.treatmentRate,
      fixedCents: null,
      source: 'treatment-rate',
    };
  }

  // 5. default da clínica
  return {
    mode: 'percent',
    rate: params.clinicDefault,
    fixedCents: null,
    source: 'clinic-default',
  };
}

function toResolved(
  rule: CommissionRule,
  source: CommissionSource,
): ResolvedCommission {
  if (rule.mode === 'fixed') {
    return {
      mode: 'fixed',
      rate: 0,
      fixedCents: rule.fixedCents as number,
      source,
    };
  }
  return {
    mode: 'percent',
    rate: rule.rate as number,
    fixedCents: null,
    source,
  };
}

/**
 * Compatibilidade com o código anterior à Fase 1 (seed, etc.): devolve só a
 * fração. Um override FIXO não é representável como fração — devolve 0.
 */
export function resolveCommissionRate(params: ResolveCommissionParams): number {
  return resolveCommission(params).rate;
}

// -----------------------------------------------------------------------------
// Aritmética
// -----------------------------------------------------------------------------

/** Banker's rounding (half to even) para inteiro. */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  const EPS = 1e-9;
  if (diff > 0.5 + EPS) return floor + 1;
  if (diff < 0.5 - EPS) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function assertCents(name: string, cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`${name} inválido: ${cents} (esperado inteiro ≥ 0)`);
  }
}

/** Comissão percentual em cêntimos (compatibilidade). */
export function commissionCentsOf(baseCents: number, rate: number): number {
  assertCents('baseCents', baseCents);
  if (!isValidRate(rate)) {
    throw new Error(`rate inválida: ${rate} (esperado 0..1)`);
  }
  return bankersRound(baseCents * rate);
}

export type DiscountInput =
  | { mode: 'percent'; value: number } // 0..100 (aceita decimais, ex.: 12.5)
  | { mode: 'amount'; cents: number } // cêntimos inteiros
  | null;

/**
 * Desconto em cêntimos a partir do PVP. Percentagem arredondada (banker's)
 * ao cêntimo; valor limitado ao PVP (nunca deixa a linha negativa).
 */
export function discountCentsOf(
  listPriceCents: number,
  discount: DiscountInput,
): number {
  assertCents('listPriceCents', listPriceCents);
  if (!discount) return 0;
  if (discount.mode === 'percent') {
    const pct = discount.value;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new Error(`Desconto % inválido: ${pct}`);
    }
    return Math.min(listPriceCents, bankersRound((listPriceCents * pct) / 100));
  }
  assertCents('discountCents', discount.cents);
  return Math.min(listPriceCents, discount.cents);
}

/** Todos os valores financeiros de uma linha — o que se congela no Procedure */
export interface LineFinancials {
  listPriceCents: number;
  discountMode: 'percent' | 'amount' | null;
  discountPct: number | null;
  discountCents: number;
  priceCents: number; // cobrado ao paciente
  costCents: number;
  commissionBaseCents: number; // max(0, price − cost)
  commissionMode: CommissionMode;
  commissionRate: number;
  commissionFixedCents: number | null;
  commissionSource: CommissionSource;
  commissionCents: number;
}

export function computeLineFinancials(params: {
  listPriceCents: number;
  discount: DiscountInput;
  costCents: number;
  commission: ResolvedCommission;
}): LineFinancials {
  const { listPriceCents, discount, costCents, commission } = params;
  assertCents('listPriceCents', listPriceCents);
  assertCents('costCents', costCents);

  const discountCents = discountCentsOf(listPriceCents, discount);
  const priceCents = listPriceCents - discountCents;
  const commissionBaseCents = Math.max(0, priceCents - costCents);

  const commissionCents =
    commission.mode === 'fixed'
      ? (commission.fixedCents as number)
      : commissionCentsOf(commissionBaseCents, commission.rate);

  return {
    listPriceCents,
    discountMode: discount ? discount.mode : null,
    discountPct:
      discount && discount.mode === 'percent' ? discount.value : null,
    discountCents,
    priceCents,
    costCents,
    commissionBaseCents,
    commissionMode: commission.mode,
    commissionRate: commission.rate,
    commissionFixedCents: commission.fixedCents,
    commissionSource: commission.source,
    commissionCents,
  };
}

/** Formata cêntimos como euros PT ("1 234,50 €") — para UI e resumos */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** "12,5" / "12.5" / "" → número (para % de desconto); null se vazio */
export function parsePercentInput(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
