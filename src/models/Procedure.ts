// 📄 src/models/Procedure.ts
// =============================================================================
// CDC Manager — Model: Procedure
// -----------------------------------------------------------------------------
// Um ato clínico EXECUTADO num paciente. É a unidade que liga os quatro
// circuitos do sistema:
//
//   CONSULTA  → o médico regista os atos durante/ao fechar a consulta
//   COBRANÇA  → atos 'completed' não faturados = fila de cobrança da receção
//   COMISSÕES → cada ato guarda o snapshot da comissão do médico
//   STOCK     → ao fechar, a BOM do ato gera os StockMovement de saída
//
// PRINCÍPIO CENTRAL — SNAPSHOT, NÃO REFERÊNCIA VIVA:
//   Preço e comissão são COPIADOS para o documento no momento da execução.
//   Se a clínica aumentar a tabela de preços amanhã, os atos de ontem não
//   mudam; o relatório de comissões de março é idêntico em março e em julho.
//   Sistemas que calculam retroativamente a partir da tabela atual produzem
//   relatórios que "mudam sozinhos" — erro clássico e inaceitável em billing.
//
// DENTES — notação FDI (a usada em Portugal e no odontograma):
//   Definitivos: 11-18, 21-28, 31-38, 41-48
//   Decíduos:    51-55, 61-65, 71-75, 81-85
//   toothNumbers vazio = ato não associado a dentes (ex.: destartarização)
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const PROCEDURE_STATUS = [
  'planned', // faz parte de um plano de tratamento, ainda não executado
  'completed', // executado; entra na fila de cobrança
  'invoiced', // faturado (Invoice emitida via Moloni)
  'void', // anulado (registado por engano; nunca apagamos, anulamos)
] as const;
export type ProcedureStatus = (typeof PROCEDURE_STATUS)[number];

// Validação FDI: quadrantes 1-8, posições 1-8 (definitivos) / 1-5 (decíduos)
const FDI_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

const ProcedureSchema = new Schema(
  {
    // MULTI-CLÍNICA (Sprint 3): a faturação, o stock e a fila de cobrança são
    // POR CLÍNICA — todo o ato pertence a uma. Atos 'planned' herdam a clínica
    // do plano; na EXECUÇÃO prevalece a clínica da consulta (o médico pode
    // executar um item do plano em qualquer das duas)
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      required: true,
    },
    // Consulta em que foi executado (null para atos 'planned' de um plano)
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true,
    },
    // Plano de tratamento a que pertence, se aplicável
    treatmentPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentPlan',
      default: null,
    },
    status: {
      type: String,
      enum: PROCEDURE_STATUS,
      default: 'completed',
      index: true,
    },
    // --- SNAPSHOTS (imutáveis após execução) --------------------------------
    // Nome do ato no momento (a clínica pode renomear o catálogo depois)
    nameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    // Categoria do ato congelada na execução (E4/E7 — listagens por
    // categoria imunes a reclassificações futuras do catálogo)
    categorySnapshot: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    // -------------------------------------------------------------------------
    // FINANCEIRO DA LINHA (Fase 1) — fórmula em lib/commissions.ts:
    //   listPriceCents       PVP antes do desconto (null em registos anteriores
    //                        à Fase 1 → ler como = priceCents)
    //   discount*            desconto dado pelo médico (% ou €) em cêntimos
    //   priceCents           VALOR COBRADO ao paciente (PVP − desconto).
    //                        Mantém o significado histórico: cobrança, faturas
    //                        e dashboards continuam a somar este campo.
    //   costCents            custo direto do ato (default do catálogo, editável)
    //   commissionBaseCents  max(0, price − cost): base da comissão percentual
    //   commission*          regra resolvida e congelada (modo, taxa/fixo,
    //                        origem na cadeia) + valor materializado
    // -------------------------------------------------------------------------
    listPriceCents: { type: Number, min: 0, default: null },
    discountMode: {
      type: String,
      enum: ['percent', 'amount', null],
      default: null,
    },
    discountPct: { type: Number, min: 0, max: 100, default: null },
    discountCents: { type: Number, min: 0, default: 0 },
    priceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    costCents: { type: Number, min: 0, default: 0 },
    commissionBaseCents: { type: Number, min: 0, default: null },
    commissionMode: {
      type: String,
      enum: ['percent', 'fixed'],
      default: 'percent',
    },
    commissionRate: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    commissionFixedCents: { type: Number, min: 0, default: null },
    commissionSource: {
      type: String,
      enum: [
        'treatment-override',
        'category-override',
        'doctor-rate',
        'treatment-rate',
        'clinic-default',
        null,
      ],
      default: null,
    },
    // Valor da comissão em cêntimos (banker's rounding), materializado para
    // os relatórios somarem sem recalcular
    commissionCents: {
      type: Number,
      required: true,
      min: 0,
    },
    // --- Detalhe clínico ----------------------------------------------------
    toothNumbers: {
      type: [
        {
          type: String,
          match: [FDI_REGEX, 'Dente inválido (notação FDI)'],
        },
      ],
      default: [],
    },
    // Observações do médico sobre a execução (visíveis à receção na cobrança)
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    executedAt: {
      type: Date,
      default: null, // preenchido quando status passa a 'completed'
    },
    // --- Cobrança / stock ---------------------------------------------------
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    // Baixa de stock já processada? (idempotência: fechar consulta duas
    // vezes por erro de rede nunca abate a BOM em duplicado)
    stockDeductedAt: {
      type: Date,
      default: null,
    },
    // --- Anulação -----------------------------------------------------------
    voidedAt: { type: Date, default: null },
    voidedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    voidReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Fila de cobrança da receção: POR CLÍNICA, completed sem fatura, por execução
ProcedureSchema.index({ clinicId: 1, status: 1, invoiceId: 1, executedAt: -1 });
// Relatórios de produção/comissões: por médico e período
ProcedureSchema.index({ doctorId: 1, executedAt: -1 });

export type ProcedureDoc = InferSchemaType<typeof ProcedureSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Procedure: Model<ProcedureDoc> =
  (mongoose.models.Procedure as Model<ProcedureDoc>) ??
  mongoose.model<ProcedureDoc>('Procedure', ProcedureSchema);

export default Procedure;
