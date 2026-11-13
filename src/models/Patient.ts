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
import { MARITAL_STATUSES, SEXES, RELATIONSHIPS } from '@/lib/domain';

export const PATIENT_STATUS = ['active', 'inactive', 'anonymized'] as const;
export type PatientStatus = (typeof PATIENT_STATUS)[number];

export const CONTACT_CHANNELS = ['whatsapp', 'sms', 'email', 'phone'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

const PatientSchema = new Schema(
  {
    // Nº de processo interno — continuidade com o Dentoral (os prints mostram
    // números até ~86000). Na migração importa-se o existente; novos pacientes
    // recebem o próximo da sequência (gerido em actions/patients.ts).
    //
    // 6.ª ronda/01 (Victor, nov. 2026): a PRÉ-MARCAÇÃO não recebe número —
    // a pessoa pode não vir à consulta. Fica null enquanto `provisional`; o
    // número é atribuído quando a ficha completa é gravada. Por isso a
    // unicidade passou a índice PARCIAL (só números), declarado em baixo.
    processNumber: {
      type: Number,
      default: null,
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
      index: true, // pesquisa por data de nascimento (apontamento 02)
    },
    // NIF — essencial: vai nas faturas Moloni para dedução IRS (despesas saúde)
    nif: {
      type: String,
      trim: true,
      match: [/^\d{9}$/, 'NIF deve ter 9 dígitos'],
      default: null,
      index: true, // pesquisa por NIF (apontamento 02) + verificação de duplicados
    },
    // --- Fase 3 (ficha de anamnese / P10 / E12 / E11) ------------------------
    sex: { type: String, enum: [...SEXES, null], default: null },
    // Nº de utente do SNS (9 dígitos) — pedido do Victor (P10)
    snsNumber: {
      type: String,
      trim: true,
      match: [/^\d{9}$/, 'Nº de utente deve ter 9 dígitos'],
      default: null,
      index: true, // pesquisa por nº de utente (apontamento 02)
    },
    homePhone: { type: String, trim: true, maxlength: 30, default: null },
    emergencyContact: {
      name: { type: String, trim: true, maxlength: 120, default: null },
      phone: { type: String, trim: true, maxlength: 30, default: null },
    },
    // E12 (Isabel): seguradora + nº do cartão — vai no cabeçalho da fatura
    // para o paciente pedir o reembolso (a clínica não trabalha com seguros)
    insurance: {
      company: { type: String, trim: true, maxlength: 120, default: null },
      cardNumber: { type: String, trim: true, maxlength: 60, default: null },
    },
    // E11 (Isabel): familiares / pessoas de referência — outro paciente da
    // clínica (patientId) OU contacto livre; ajuda quando o paciente não
    // responde às confirmações ou o número está errado
    relatives: {
      type: [
        new Schema(
          {
            patientId: {
              type: Schema.Types.ObjectId,
              ref: 'Patient',
              default: null,
            },
            name: { type: String, required: true, trim: true, maxlength: 120 },
            phone: { type: String, trim: true, maxlength: 30, default: null },
            relationship: {
              type: String,
              enum: RELATIONSHIPS,
              required: true,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
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
    maritalStatus: {
      type: String,
      enum: MARITAL_STATUSES,
      default: null,
    },
    nationality: {
      type: String,
      trim: true,
      maxlength: 60,
      default: null, // texto livre; "Portuguesa" sugerido no form
    },
    // "Indicado por" — fonte de referência (Dentoral): outro paciente,
    // Google, seguradora... Dado comercial: alimenta o futuro relatório
    // de origem de pacientes.
    referredBy: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    // 5.ª ronda/09 (Victor, nov. 2026): COMO o paciente conheceu a clínica
    // (Instagram, Google, indicação, promoção do mês). Fica na ficha na
    // primeira marcação; `referralDetail` guarda a promoção em vigor ou o
    // texto livre. Valores canónicos em lib/domain REFERRAL_SOURCES.
    referralSource: { type: String, trim: true, maxlength: 30, default: null },
    referralDetail: { type: String, trim: true, maxlength: 120, default: null },
    // 5.ª ronda/13: PRÉ-MARCAÇÃO — ficha criada na agenda só com nome,
    // apelido e telemóvel, para não perder a marcação de quem liga pela
    // primeira vez. true até a ficha ser completada (gravar a ficha
    // completa limpa a marca).
    provisional: { type: Boolean, default: false, index: true },
    // 6.ª ronda/07: campos obrigatórios que o paciente declarou NÃO ter ou
    // não querer indicar — é o que deixa terminar a ficha sem os preencher
    // (fatura sem NIF sai como Consumidor final).
    declared: {
      noNif: { type: Boolean, default: false },
      noSnsNumber: { type: Boolean, default: false },
      noPhone: { type: Boolean, default: false },
      noEmail: { type: Boolean, default: false },
    },
    // Falecido (Dentoral: flag "Falecido"). Data em vez de boolean (quando
    // se soube). Efeitos: badge na ficha/lista, recalls suprimidos
    // (spawnRecallForProcedure) e ciclos abertos dispensados ao marcar.
    deceasedAt: {
      type: Date,
      default: null,
    },
    // 7.ª ronda/B4: bloqueio de marcações pela gestão (lib/booking-block).
    // Com data preenchida, nenhuma action de marcação aceita este paciente;
    // a receção vê o motivo. Só a gestão bloqueia e desbloqueia.
    bookingBlockedAt: { type: Date, default: null },
    bookingBlockReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    bookingBlockedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
      // P10: consentimento RGPD ASSINADO (Document 'consent' com o texto)
      gdprSignedAt: { type: Date, default: null },
      gdprDocumentId: {
        type: Schema.Types.ObjectId,
        ref: 'Document',
        default: null,
      },
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
    // Campos Dentoral sem lugar no modelo (profissão-código, nº beneficiário,
    // indicado-por, autorizações de contacto…) — consulta/auditoria
    legacyData: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Pesquisa da receção: nome (text index acima), telefone, nº processo —
// os três caminhos de pesquisa do QuickBookingCommand

// Nº de processo único entre as fichas que o têm (pré-marcações = null).
// Bases criadas antes da 6.ª ronda têm o índice único antigo, não parcial:
// correr scripts/fix-process-number-index.ts uma vez em cada base.
PatientSchema.index(
  { processNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { processNumber: { $type: 'number' } },
  },
);

export type PatientDoc = InferSchemaType<typeof PatientSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Patient: Model<PatientDoc> =
  (mongoose.models.Patient as Model<PatientDoc>) ??
  mongoose.model<PatientDoc>('Patient', PatientSchema);

export default Patient;
