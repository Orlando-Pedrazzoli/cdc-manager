// 📄 src/models/Employee.ts
// =============================================================================
// CDC Manager — Model: Employee (ficha de colaborador — Fase 6A, E16)
// -----------------------------------------------------------------------------
// Pedido da Isabel: "salário inicial, taxa Seg. Social e taxa de escalão de
// IRS, horário, outras regalias, aumentos e respetiva data, mudança de
// categoria profissional e data, advertências (texto) com data".
// Dados de RH — SÓ administração (RBAC nas actions e nas páginas).
// Históricos (aumentos, categorias, advertências) são APPEND-ONLY: nunca se
// editam nem apagam — corrige-se com uma nova entrada. Colaborador nunca é
// apagado: `active: false` (never delete).
// Opcionalmente ligado a um User (login) e/ou Doctor (médico).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

import {
  EMPLOYEE_CONTRACT_TYPES,
  EMPLOYEE_CONTRACT_LABEL,
  type EmployeeContractType,
} from '@/lib/domain';
export {
  EMPLOYEE_CONTRACT_TYPES,
  EMPLOYEE_CONTRACT_LABEL,
  type EmployeeContractType,
};

const historyOpts = {
  _id: true,
  timestamps: { createdAt: true, updatedAt: false },
} as const;
const RaiseSchema = new Schema(
  {
    at: { type: Date, required: true },
    newSalaryCents: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, maxlength: 500, default: null },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  historyOpts,
);
const CategoryChangeSchema = new Schema(
  {
    at: { type: Date, required: true },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    note: { type: String, trim: true, maxlength: 500, default: null },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  historyOpts,
);
const WarningSchema = new Schema(
  {
    at: { type: Date, required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  historyOpts,
);

const EmployeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Categoria profissional ATUAL (a histórica fica em categoryChanges)
    category: { type: String, required: true, trim: true, maxlength: 80 },
    contractType: {
      type: String,
      enum: EMPLOYEE_CONTRACT_TYPES,
      default: 'sem-termo',
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    nif: {
      type: String,
      trim: true,
      match: [/^\d{9}$/, 'NIF deve ter 9 dígitos'],
      default: null,
    },
    niss: { type: String, trim: true, maxlength: 20, default: null },
    phone: { type: String, trim: true, maxlength: 30, default: null },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: null,
    },
    clinicIds: [{ type: Schema.Types.ObjectId, ref: 'Clinic' }],
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },

    // --- Remuneração (E16) --------------------------------------------------
    initialSalaryCents: { type: Number, min: 0, default: null },
    currentSalaryCents: { type: Number, min: 0, default: null }, // = último aumento
    socialSecurityRate: { type: Number, min: 0, max: 100, default: null }, // % (ex.: 11)
    irsRate: { type: Number, min: 0, max: 100, default: null }, // % do escalão
    schedule: { type: String, trim: true, maxlength: 300, default: null },
    benefits: { type: String, trim: true, maxlength: 1000, default: null }, // outras regalias

    // --- Históricos append-only --------------------------------------------
    raises: { type: [RaiseSchema], default: [] },
    categoryChanges: { type: [CategoryChangeSchema], default: [] },
    warnings: { type: [WarningSchema], default: [] },

    notes: { type: String, trim: true, maxlength: 2000, default: null },
    active: { type: Boolean, default: true, index: true },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

EmployeeSchema.index({ name: 1 }, { collation: { locale: 'pt', strength: 2 } });

export type EmployeeDoc = InferSchemaType<typeof EmployeeSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Employee: Model<EmployeeDoc> =
  (mongoose.models.Employee as Model<EmployeeDoc>) ??
  mongoose.model<EmployeeDoc>('Employee', EmployeeSchema);

export default Employee;
