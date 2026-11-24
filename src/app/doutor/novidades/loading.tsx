// 📄 src/app/doutor/novidades/loading.tsx
// Novidades científicas: ao entrar pelo menu a página aparece logo com a
// silhueta da lista, em vez de ficar parada na página anterior.
import { BookOpenText } from 'lucide-react';
import { NovidadesSkeleton } from '@/components/novidades/NovidadesResults';

export default function NovidadesLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1
        style={{
          margin: 0,
          fontSize: '22px',
          fontWeight: 700,
          color: '#1B2A6B',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <BookOpenText size={22} />
        Novidades científicas
      </h1>
      <NovidadesSkeleton />
    </div>
  );
}
