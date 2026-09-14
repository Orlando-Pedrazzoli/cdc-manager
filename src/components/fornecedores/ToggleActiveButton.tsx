// 📄 src/components/fornecedores/ToggleActiveButton.tsx
// CDC Manager — Fornecedores: desativar / reativar (never delete)
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { toggleSupplierActiveAction } from '@/actions/suppliers';
import { Button } from '@/components/ui/Button';

export function ToggleActiveButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size='sm'
      variant={active ? 'danger' : 'primary'}
      loading={busy}
      onClick={async () => {
        if (
          active &&
          !confirm(
            'Desativar este fornecedor? Deixa de aparecer nos seletores; o histórico mantém-se.',
          )
        )
          return;
        setBusy(true);
        const res = await toggleSupplierActiveAction(id);
        setBusy(false);
        if (res.error) toast.error(res.error);
        else {
          toast.success(
            active ? 'Fornecedor desativado.' : 'Fornecedor reativado.',
          );
          router.refresh();
        }
      }}
    >
      {active ? 'Desativar' : 'Reativar'}
    </Button>
  );
}
