// 📄 src/lib/labels.ts
// =============================================================================
// CDC Manager — Labels partilhados (PT) para enums do domínio
// Usados por formulários, listagens e (futuro) documentos/emails.
// =============================================================================

import type { Specialty } from '@/lib/domain';

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  dentisteria: 'Dentisteria',
  'estetica-dentaria': 'Estética Dentária',
  endodontia: 'Endodontia',
  implantologia: 'Implantologia',
  odontopediatria: 'Odontopediatria',
  ortodontia: 'Ortodontia',
  periodontologia: 'Periodontologia',
  'proteses-dentarias': 'Próteses Dentárias',
  'higiene-oral': 'Higiene Oral',
  'harmonizacao-orofacial': 'Harmonização Orofacial',
};

/** Ordem de exibição da semana nas UIs (Seg…Dom) */
export const WEEKDAYS_DISPLAY: { value: number; label: string }[] = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];
