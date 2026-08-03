// 📄 src/lib/commissions.ts
// =============================================================================
// CDC Manager — Resolução e cálculo de comissões
// -----------------------------------------------------------------------------
// CADEIA DE RESOLUÇÃO (decisão firme do cliente):
//   1. override por (médico × tipo de ato)   → Doctor.commissionOverrides
//   2. taxa base do médico                   → Doctor.commissionRate
//   3. default da clínica ONDE O ATO É FEITO → Clinic.defaultDoctorCommission
//
// A taxa resolvida é uma FRAÇÃO da parte do MÉDICO (0.40 = 40% para o médico).
// É resolvida UMA vez, no momento da execução do ato, e congelada no
// Procedure (snapshot) — mudanças futuras nunca afetam histórico.
//
// ARREDONDAMENTO — banker's rounding (half to even):
//   Dinheiro é sempre cêntimos inteiros. No meio exato (x.5 cêntimos),
//   arredonda para o PAR mais próximo — elimina o viés sistemático do
//   "round half up" em milhares de atos (padrão em sistemas financeiros;
//   é o comportamento IEEE 754 e o do Math.Round de bancos).
//   Ex.: 12.5 → 12 · 13.5 → 14 · 12.4 → 12 · 12.6 → 13
//
// Funções PURAS — sem mongoose, testáveis em sandbox e importáveis de
// qualquer lado (server actions, relatórios, futuros scripts).
// =============================================================================

export interface CommissionOverrideLike {
  treatmentTypeId: unknown; // ObjectId ou string — comparado por String()
  rate: number;
}

export interface ResolveCommissionParams {
  /** Overrides do médico ([{treatmentTypeId, rate}]) */
  overrides: CommissionOverrideLike[] | null | undefined;
  /** Taxa base do médico (null = não definida) */
  doctorRate: number | null | undefined;
  /** Default da clínica onde o ato é executado (ex.: 0.40) */
  clinicDefault: number;
  /** Ato em execução */
  treatmentTypeId: unknown;
}

/**
 * Resolve a fração do médico para um ato, seguindo a cadeia
 * override > taxa base > default da clínica.
 */
export function resolveCommissionRate(params: ResolveCommissionParams): number {
  const wanted = String(params.treatmentTypeId);

  const override = (params.overrides ?? []).find(
    o => String(o.treatmentTypeId) === wanted,
  );
  if (override && isValidRate(override.rate)) return override.rate;

  if (isValidRate(params.doctorRate)) return params.doctorRate as number;

  return params.clinicDefault;
}

function isValidRate(rate: unknown): rate is number {
  return (
    typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1
  );
}

/**
 * Banker's rounding (half to even) para inteiro.
 * Só é chamada com valores já em cêntimos (priceCents * rate).
 */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  const EPS = 1e-9; // tolerância a erro binário de vírgula flutuante
  if (diff > 0.5 + EPS) return floor + 1;
  if (diff < 0.5 - EPS) return floor;
  // Meio exato → par mais próximo
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Comissão do médico em cêntimos inteiros para um ato.
 * priceCents DEVE ser inteiro (convenção do projeto: dinheiro em cêntimos).
 */
export function commissionCentsOf(priceCents: number, rate: number): number {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new Error(
      `priceCents inválido: ${priceCents} (esperado inteiro ≥ 0)`,
    );
  }
  if (!isValidRate(rate)) {
    throw new Error(`rate inválida: ${rate} (esperado 0..1)`);
  }
  return bankersRound(priceCents * rate);
}

/** Formata cêntimos como euros PT ("1 234,50 €") — para UI e resumos */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
