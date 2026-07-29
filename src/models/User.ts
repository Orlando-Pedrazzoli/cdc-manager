// 📄 src/models/User.ts
// =============================================================================
// CDC Manager — Model: User
// -----------------------------------------------------------------------------
// Conta de acesso ao sistema. Um User existe para QUALQUER pessoa que faz
// login: admin, rececionista, médico ou paciente. Os dados de domínio vivem
// nos models próprios (Doctor, Patient) ligados por referência — o User trata
// apenas de identidade, credenciais, role e estado da conta.
//
// Fluxo de vida da conta:
//   invited  → criada pelo admin, sem password, à espera de ativação por código
//   active   → ativada (password definida pelo próprio) ou criada já ativa
//   disabled → desativada pela gerência; login bloqueado imediatamente
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const USER_ROLES = [
  'admin',
  'receptionist',
  'doctor',
  'patient',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUS = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email inválido'],
    },
    // Hash bcrypt (custo 12). Ausente enquanto status === 'invited'.
    // select: false → NUNCA vem em queries por defeito; só com .select('+passwordHash')
    passwordHash: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: USER_STATUS,
      default: 'invited',
      index: true,
    },
    // Referências ao perfil de domínio (preenchida conforme o role)
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
    },
    // Telemóvel para envio de códigos/notificações (formato E.164: +3519...)
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    // Rate limiting de login (protecção brute-force)
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt automáticos
  },
);

// Índice composto: listagens do admin filtram por role+status constantemente
UserSchema.index({ role: 1, status: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Padrão Next.js: em hot-reload o model pode já estar registado
const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>('User', UserSchema);

export default User;
