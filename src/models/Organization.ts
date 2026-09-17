// 📄 src/models/Organization.ts
// =============================================================================
// CDC Manager — Organização (o cliente do software)
// -----------------------------------------------------------------------------
// A entidade que possui as clínicas: identidade visual (nome da app, logo,
// cor), dados legais para documentos/emails e remetente de email. Tira o
// "CDC" do código — para um cliente novo, basta um registo aqui.
//
// Singleton por base de dados (caminho 1 do multi-tenancy: uma base por
// cliente). Quando/se migrarmos para `organizationId` em todas as coleções,
// este modelo já é a âncora. `getOrganization()` devolve DEFAULTS (os valores
// que estavam hardcoded) quando ainda não existe registo — a app nunca parte
// por falta de seed.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { cache } from 'react';
import { dbConnect } from '@/lib/mongodb';

const OrganizationSchema = new Schema(
  {
    /** Nome comercial ("Centro Dentário Colombo") — cabeçalhos, emails */
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Nome da aplicação como o utilizador a vê ("CDC Manager") */
    appName: { type: String, required: true, trim: true, maxlength: 60 },
    /** Denominação social para documentos legais */
    legalName: { type: String, default: null, trim: true, maxlength: 160 },
    nipc: { type: String, default: null, trim: true, maxlength: 9 },
    address: { type: String, default: null, trim: true, maxlength: 240 },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    email: { type: String, default: null, trim: true, maxlength: 120 },
    website: { type: String, default: null, trim: true, maxlength: 160 },
    /** URL absoluto ou caminho em /public (ex.: /logo-cdc.png) */
    logoUrl: { type: String, default: null, trim: true, maxlength: 400 },
    /** Cor de marca (hex) — navegação, cabeçalho de emails */
    primaryColor: {
      type: String,
      default: '#1B2A6B',
      match: [/^#[0-9a-fA-F]{6}$/, 'Cor inválida (#RRGGBB)'],
    },
    /** Remetente dos emails: "Nome <noreply@dominio>" — o domínio tem de
        estar verificado no Resend; sem valor cai no EMAIL_FROM do ambiente */
    emailFromName: { type: String, default: null, trim: true, maxlength: 80 },
    emailFromAddress: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    /** Linha de rodapé dos emails (morada curta) */
    emailFooter: { type: String, default: null, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

export type OrganizationDoc = InferSchemaType<typeof OrganizationSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Organization: Model<OrganizationDoc> =
  (mongoose.models.Organization as Model<OrganizationDoc>) ??
  mongoose.model<OrganizationDoc>('Organization', OrganizationSchema);

export default Organization;

/** Forma serializável (sem ObjectId/Date) para passar a Client Components */
export type Brand = {
  id: string | null;
  name: string;
  appName: string;
  legalName: string | null;
  nipc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string;
  emailFromName: string | null;
  emailFromAddress: string | null;
  emailFooter: string | null;
};

/** Os valores que estavam hardcoded — servem de rede até o seed correr */
export const DEFAULT_BRAND: Brand = {
  id: null,
  name: 'Centro Dentário Colombo',
  appName: 'CDC Manager',
  legalName: 'D. Amaral, Assistência Prev. Dentária, Lda.',
  nipc: '505887533',
  address: 'Centro Comercial Colombo, Lisboa',
  phone: null,
  email: null,
  website: null,
  logoUrl: '/logo-cdc.png',
  primaryColor: '#1B2A6B',
  emailFromName: null,
  emailFromAddress: null,
  emailFooter: 'Centro Dentário Colombo · Centro Comercial Colombo, Lisboa',
};

function toBrand(o: OrganizationDoc): Brand {
  return {
    id: String(o._id),
    name: o.name,
    appName: o.appName,
    legalName: o.legalName ?? null,
    nipc: o.nipc ?? null,
    address: o.address ?? null,
    phone: o.phone ?? null,
    email: o.email ?? null,
    website: o.website ?? null,
    logoUrl: o.logoUrl ?? null,
    primaryColor: o.primaryColor ?? DEFAULT_BRAND.primaryColor,
    emailFromName: o.emailFromName ?? null,
    emailFromAddress: o.emailFromAddress ?? null,
    emailFooter: o.emailFooter ?? null,
  };
}

/**
 * A organização desta instalação. `cache()` do React deduplica dentro do
 * mesmo pedido (layout + página + sidebar pedem-na sem custo extra).
 * Nunca lança: sem registo → DEFAULT_BRAND.
 */
export const getOrganization = cache(async (): Promise<Brand> => {
  try {
    await dbConnect();
    const org = await Organization.findOne().lean();
    return org ? toBrand(org as OrganizationDoc) : DEFAULT_BRAND;
  } catch (err) {
    console.error('[organization] leitura falhou — a usar defaults:', err);
    return DEFAULT_BRAND;
  }
});
