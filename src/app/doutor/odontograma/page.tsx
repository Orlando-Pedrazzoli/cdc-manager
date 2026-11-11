// 📄 src/app/doutor/odontograma/page.tsx
// CDC Manager — Médico: atalho para o odontograma (5.ª ronda/12)
import { OdontogramFinder } from '@/components/clinico/OdontogramFinder';

export const metadata = { title: 'Odontograma' };

export default function DoctorOdontogramFinderPage() {
  return <OdontogramFinder basePath='/doutor/pacientes' editable />;
}
