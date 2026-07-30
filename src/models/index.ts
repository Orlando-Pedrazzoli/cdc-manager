// 📄 src/models/index.ts
// =============================================================================
// CDC Manager — Registo central de models
// -----------------------------------------------------------------------------
// Importar de '@/models' garante que TODOS os schemas ficam registados no
// Mongoose antes de qualquer populate() — evita o clássico
// "MissingSchemaError: Schema hasn't been registered for model X"
// quando um populate toca um model ainda não importado nesse request.
// =============================================================================

export { default as User } from './User';
export { default as ActivationCode } from './ActivationCode';
export { default as Patient } from './Patient';
export { default as Doctor } from './Doctor';
export { default as Appointment } from './Appointment';
export { default as TreatmentType } from './TreatmentType';
export { default as TreatmentPlan } from './TreatmentPlan';
export { default as Procedure } from './Procedure';
export { default as ClinicalRecord } from './ClinicalRecord';
export { default as Odontogram } from './Odontogram';
export { default as Document } from './Document';
export { default as Invoice } from './Invoice';
export { default as Product } from './Product';
export { default as Warehouse } from './Warehouse';
export { default as StockMovement } from './StockMovement';
export { default as Waitlist } from './Waitlist';
export { default as Recall } from './Recall';
export { default as Notification } from './Notification';
export { default as AuditLog } from './AuditLog';
export {
  default as Clinic,
  getActiveClinics,
  getClinicBySlug,
  getClinicById,
} from './Clinic';
