// 📄 src/app/admin/odontograma/page.tsx
// CDC Manager — Admin/receção: atalho para o odontograma (5.ª ronda/12)
import { OdontogramFinder } from '@/components/clinico/OdontogramFinder';

export const metadata = { title: 'Odontograma' };

export default function AdminOdontogramFinderPage() {
  return <OdontogramFinder basePath='/admin/pacientes' editable={false} />;
}
