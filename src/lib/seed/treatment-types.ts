// 📄 src/lib/seed/treatment-types.ts
// =============================================================================
// CDC Manager — Seed: catálogo de tratamentos (matriz de durações)
// -----------------------------------------------------------------------------
// Fonte: benchmarks clínicos internacionais (source: 'benchmark') — a equipa
// da clínica valida e ajusta no admin, passando cada um a 'clinic-confirmed'.
// priceCents: 0 (tabela de preços é preenchida pela Adriana/Isabel no admin).
// recallIntervalMonths nos atos de higiene/manutenção.
// Idempotente: upsert por slug.
// =============================================================================

import TreatmentType from '@/models/TreatmentType';
import type { Specialty } from '@/models/Doctor';

type SeedTreatment = {
  slug: string;
  name: string;
  specialty: Specialty;
  durationMin: number;
  bufferMin: number;
  bookableOnline: boolean;
  requiresEvaluation: boolean;
  recallIntervalMonths?: number;
  notes?: string;
};

// [slug, nome, especialidade, duração, buffer, online, exigeAvaliação, recall?, notas?]
const T: SeedTreatment[] = [
  // ---- HIGIENE ORAL ----
  {
    slug: 'higiene-consulta-avaliacao',
    name: 'Consulta de Avaliação / Check-up',
    specialty: 'higiene-oral',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
    recallIntervalMonths: 12,
  },
  {
    slug: 'higiene-primeira-consulta',
    name: 'Primeira Consulta (novo paciente)',
    specialty: 'higiene-oral',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
    notes: 'Inclui histórico clínico, RX e plano inicial.',
  },
  {
    slug: 'higiene-destartarizacao',
    name: 'Destartarização / Profilaxia',
    specialty: 'higiene-oral',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
    recallIntervalMonths: 6,
  },
  {
    slug: 'higiene-manutencao-periodontal',
    name: 'Manutenção Periodontal',
    specialty: 'higiene-oral',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
    recallIntervalMonths: 4,
  },
  // ---- DENTISTERIA ----
  {
    slug: 'dentisteria-urgencia',
    name: 'Consulta de Urgência / Dor',
    specialty: 'dentisteria',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
    notes: 'Slot de triagem; tratamento é remarcado.',
  },
  {
    slug: 'dentisteria-restauracao-simples',
    name: 'Restauração Simples (1 dente)',
    specialty: 'dentisteria',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'dentisteria-restauracoes-multiplas',
    name: 'Restaurações Múltiplas (mesmo quadrante)',
    specialty: 'dentisteria',
    durationMin: 75,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- ENDODONTIA ----
  {
    slug: 'endodontia-avaliacao',
    name: 'Avaliação Endodôntica',
    specialty: 'endodontia',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: false,
  },
  {
    slug: 'endodontia-anterior',
    name: 'Desvitalização — Dente Anterior (1 canal)',
    specialty: 'endodontia',
    durationMin: 60,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'endodontia-premolar',
    name: 'Desvitalização — Pré-molar',
    specialty: 'endodontia',
    durationMin: 90,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'endodontia-molar',
    name: 'Desvitalização — Molar (multicanal)',
    specialty: 'endodontia',
    durationMin: 120,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'endodontia-retratamento',
    name: 'Retratamento Endodôntico',
    specialty: 'endodontia',
    durationMin: 120,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- PERIODONTOLOGIA ----
  {
    slug: 'perio-avaliacao',
    name: 'Avaliação Periodontal',
    specialty: 'periodontologia',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
  },
  {
    slug: 'perio-raspagem-quadrante',
    name: 'Raspagem e Alisamento Radicular (quadrante)',
    specialty: 'periodontologia',
    durationMin: 60,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'perio-cirurgia',
    name: 'Cirurgia Periodontal',
    specialty: 'periodontologia',
    durationMin: 90,
    bufferMin: 20,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- IMPLANTOLOGIA ----
  {
    slug: 'implante-consulta-planeamento',
    name: 'Consulta de Planeamento (CBCT / estudo)',
    specialty: 'implantologia',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
  },
  {
    slug: 'implante-unitario',
    name: 'Colocação de Implante Unitário',
    specialty: 'implantologia',
    durationMin: 90,
    bufferMin: 20,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'implante-multiplo',
    name: 'Colocação de 2–3 Implantes',
    specialty: 'implantologia',
    durationMin: 120,
    bufferMin: 20,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'implante-arcada-total',
    name: 'Reabilitação de Arcada Total (All-on-4/6)',
    specialty: 'implantologia',
    durationMin: 240,
    bufferMin: 30,
    bookableOnline: false,
    requiresEvaluation: true,
    notes: 'Bloqueia meio dia de agenda.',
  },
  {
    slug: 'implante-coroa',
    name: 'Colocação de Coroa sobre Implante',
    specialty: 'implantologia',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- ORTODONTIA ----
  {
    slug: 'orto-consulta-inicial',
    name: 'Consulta Ortodôntica Inicial + Registos',
    specialty: 'ortodontia',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
  },
  {
    slug: 'orto-colocacao-aparelho-fixo',
    name: 'Colocação de Aparelho Fixo',
    specialty: 'ortodontia',
    durationMin: 90,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'orto-controlo',
    name: 'Consulta de Controlo / Ajuste',
    specialty: 'ortodontia',
    durationMin: 30,
    bufferMin: 5,
    bookableOnline: true,
    requiresEvaluation: true,
  },
  {
    slug: 'orto-invisalign-entrega',
    name: 'Invisalign — Attachments e Entrega',
    specialty: 'ortodontia',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'orto-invisalign-controlo',
    name: 'Invisalign — Consulta de Controlo',
    specialty: 'ortodontia',
    durationMin: 30,
    bufferMin: 5,
    bookableOnline: true,
    requiresEvaluation: true,
  },
  {
    slug: 'orto-remocao-contencao',
    name: 'Remoção de Aparelho + Contenção',
    specialty: 'ortodontia',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- ODONTOPEDIATRIA ----
  {
    slug: 'pediatria-primeira-consulta',
    name: 'Primeira Consulta Infantil',
    specialty: 'odontopediatria',
    durationMin: 45,
    bufferMin: 15,
    bookableOnline: true,
    requiresEvaluation: false,
  },
  {
    slug: 'pediatria-rotina',
    name: 'Consulta de Rotina / Profilaxia Infantil',
    specialty: 'odontopediatria',
    durationMin: 30,
    bufferMin: 15,
    bookableOnline: true,
    requiresEvaluation: false,
    recallIntervalMonths: 6,
  },
  {
    slug: 'pediatria-selantes',
    name: 'Aplicação de Selantes',
    specialty: 'odontopediatria',
    durationMin: 30,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'pediatria-restauracao',
    name: 'Restauração Infantil',
    specialty: 'odontopediatria',
    durationMin: 45,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- PRÓTESES ----
  {
    slug: 'protese-avaliacao',
    name: 'Consulta de Avaliação Protética',
    specialty: 'proteses-dentarias',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
  },
  {
    slug: 'protese-impressoes',
    name: 'Impressões / Moldes',
    specialty: 'proteses-dentarias',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'protese-prova',
    name: 'Prova',
    specialty: 'proteses-dentarias',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'protese-entrega',
    name: 'Colocação / Entrega',
    specialty: 'proteses-dentarias',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'protese-ajuste',
    name: 'Ajuste de Prótese',
    specialty: 'proteses-dentarias',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: true,
  },
  {
    slug: 'protese-coroa-preparo',
    name: 'Coroa — Preparação e Impressão',
    specialty: 'proteses-dentarias',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'protese-coroa-colocacao',
    name: 'Coroa — Colocação Definitiva',
    specialty: 'proteses-dentarias',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- ESTÉTICA ----
  {
    slug: 'estetica-branqueamento-consultorio',
    name: 'Branqueamento em Consultório',
    specialty: 'estetica-dentaria',
    durationMin: 90,
    bufferMin: 15,
    bookableOnline: true,
    requiresEvaluation: true,
    notes: 'Exige higiene prévia recente.',
  },
  {
    slug: 'estetica-branqueamento-goteiras',
    name: 'Branqueamento — Entrega de Goteiras',
    specialty: 'estetica-dentaria',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'estetica-facetas-preparacao',
    name: 'Facetas — Preparação e Impressões',
    specialty: 'estetica-dentaria',
    durationMin: 120,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'estetica-facetas-colocacao',
    name: 'Facetas — Cimentação',
    specialty: 'estetica-dentaria',
    durationMin: 90,
    bufferMin: 15,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'estetica-bonding',
    name: 'Restauração Estética / Bonding (1 dente)',
    specialty: 'estetica-dentaria',
    durationMin: 60,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  // ---- HARMONIZAÇÃO OROFACIAL ----
  {
    slug: 'hof-avaliacao',
    name: 'Consulta de Avaliação (HOF)',
    specialty: 'harmonizacao-orofacial',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: true,
    requiresEvaluation: false,
  },
  {
    slug: 'hof-toxina-botulinica',
    name: 'Toxina Botulínica',
    specialty: 'harmonizacao-orofacial',
    durationMin: 30,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
  {
    slug: 'hof-preenchimento',
    name: 'Preenchimento com Ácido Hialurónico',
    specialty: 'harmonizacao-orofacial',
    durationMin: 45,
    bufferMin: 10,
    bookableOnline: false,
    requiresEvaluation: true,
  },
];

export async function seedTreatmentTypes(): Promise<void> {
  let created = 0;
  for (const t of T) {
    const res = await TreatmentType.updateOne(
      { slug: t.slug },
      {
        $setOnInsert: {
          ...t,
          priceCents: 0,
          bom: [],
          source: 'benchmark',
          active: true,
          recallIntervalMonths: t.recallIntervalMonths ?? null,
          notes: t.notes ?? null,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) created++;
  }
  console.log(`✔ TreatmentTypes: ${T.length} no catálogo (${created} novos)`);
}
