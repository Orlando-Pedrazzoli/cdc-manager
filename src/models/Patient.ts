// 📄 src/models/Patient.ts
// =============================================================================
// CDC Manager — Model: Patient
// -----------------------------------------------------------------------------
// Ficha administrativa do paciente. Os dados CLÍNICOS (anamnese, odontograma,
// procedimentos, documentos) vivem nos models próprios, referenciando este.
// A conta de acesso ao portal (quando existe) vive no User via User.patientId —
// a esmagadora maioria dos pacientes migrados NÃO terá conta até a receção
// enviar o código de ativação.
//
// Desenhado para a migração do Dentoral: campos espelhados dos prints
// (nº de processo, profissão, foto, contactos) + legacyId para reconciliação.
//
// RGPD (dados de saúde, art. 9.º):
//   - Consentimentos registados com data (prova de conformidade)
//   - Anonimização suportada: status 'anonymized' + limpeza de campos pessoais,
//     preservando o _id para integridade referencial de faturas/históricos
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const PATIENT_STATUS = ['active', 'inactive', 'anonymized'] as const;
export type PatientStatus = (typeof PATIENT_STATUS)[number];

export const CONTACT_CHANNELS = ['whatsapp', 'sms', 'email', 'phone'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

const PatientSchema = new Schema(
  {
    // Nº de processo interno — continuidade com o Dentoral (os prints mostram
    // números até ~86000). Na migração importa-se o existente; novos pacientes
    // recebem o próximo da sequência (gerido em actions/patients.ts).
    processNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 160,
      index: 'text', // pesquisa por nome na receção
    },
    birthDate: {
      type: Date,
      default: null,
    },
    // NIF — essencial: vai nas faturas Moloni para dedução IRS (despesas saúde)
    nif: {
      type: String,
      trim: true,
      match: [/^\d{9}$/, 'NIF deve ter 9 dígitos'],
      default: null,
    },
    // Contactos
    phone: {
      type: String, // E.164 (+3519...) — normalizado na validação Zod
      trim: true,
      default: null,
      index: true, // receção pesquisa por telefone constantemente
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    address: {
      street: { type: String, trim: true, default: null },
      postalCode: {
        type: String,
        trim: true,
        match: [/^\d{4}-\d{3}$/, 'Código postal inválido (0000-000)'],
        default: null,
      },
      city: { type: String, trim: true, default: null },
    },
    profession: {
      type: String,
      trim: true,
      default: null,
    },
    // Foto de perfil (Cloudinary public_id — o Dentoral também tinha foto)
    photoPublicId: {
      type: String,
      default: null,
    },
    // Canal preferido para confirmações/lembretes (cascata de fallback
    // implementada em lib de notificações: preferido → restantes disponíveis)
    preferredChannel: {
      type: String,
      enum: CONTACT_CHANNELS,
      default: 'whatsapp',
    },
    // Médico habitual (preenche por defeito nas marcações; opcional)
    preferredDoctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    // Alertas administrativos da receção (ex.: "faturar em nome do pai").
    // Alertas CLÍNICOS (alergias!) vivem na anamnese/ClinicalRecord.
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    // --- RGPD: consentimentos com data (null = não consentiu) ---------------
    consents: {
      dataProcessingAt: { type: Date, default: null }, // tratamento de dados
      remindersAt: { type: Date, default: null }, // lembretes de consulta
      marketingAt: { type: Date, default: null }, // recalls/campanhas
    },
    status: {
      type: String,
      enum: PATIENT_STATUS,
      default: 'active',
      index: true,
    },
    anonymizedAt: {
      type: Date,
      default: null,
    },
    // Migração Dentoral
    legacyId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Pesquisa da receção: nome (text index acima), telefone, nº processo —
// os três caminhos de pesquisa do QuickBookingCommand

export type PatientDoc = InferSchemaType<typeof PatientSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Patient: Model<PatientDoc> =
  (mongoose.models.Patient as Model<PatientDoc>) ??
  mongoose.model<PatientDoc>('Patient', PatientSchema);

export default Patient;
