// 📄 src/lib/domain.ts
// =============================================================================
// CDC Manager — Constantes de DOMÍNIO partilhadas client ↔ server
// -----------------------------------------------------------------------------
// CONVENÇÃO (obrigatória): qualquer enum/constante de domínio que um Client
// Component precise em RUNTIME vive AQUI — nunca num model. Os models importam
// mongoose, e importar um VALOR de um model num 'use client' arrasta o
// mongoose inteiro para o bundle do browser (rebenta com "Can't resolve
// 'async_hooks'", porque mongoose só corre em Node).
//
// Regras:
//   · Este ficheiro tem ZERO imports — importável de qualquer lado
//   · Os models importam daqui e RE-EXPORTAM (código server continua a poder
//     importar do model; nada quebra)
//   · `import type { X } from '@/models/...'` em client components é SEGURO
//     (tipos são apagados na compilação) — o problema são só os VALORES
//
// À medida que o Sprint 3 avança, TOOTH_STATUS / FACE_CONDITIONS / etc.
// migram para aqui quando o Odontograma (client) precisar deles.
// =============================================================================

/** Especialidades praticadas nas clínicas (valores canónicos do domínio) */
export const SPECIALTIES = [
  'dentisteria',
  'estetica-dentaria',
  'endodontia',
  'implantologia',
  'odontopediatria',
  'ortodontia',
  'periodontologia',
  'proteses-dentarias',
  'higiene-oral',
  'harmonizacao-orofacial',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];
