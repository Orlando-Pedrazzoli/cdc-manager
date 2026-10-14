// 📄 src/app/quiosque/page.tsx
// =============================================================================
// CDC Manager — Tablet de assinatura (ecrã do paciente, ao balcão)
// -----------------------------------------------------------------------------
// Rota pública (fora de /admin): a identidade vem da cookie do dispositivo
// (src/lib/kiosk.ts). O servidor só decide o estado inicial; o resto
// (polling, assinatura) é o KioskScreen. Sem navegação, sem menu, sem
// acesso a mais nada — o tablet só vê o pedido que lhe mandaram.
// =============================================================================

import type { Metadata } from 'next';
import { dbConnect } from '@/lib/mongodb';
import { kioskStateAction } from '@/actions/signature-requests';
import { KioskScreen } from '@/components/quiosque/KioskScreen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Assinatura',
  // O tablet fica sempre nesta página; viewport sem zoom para a assinatura
  other: { 'mobile-web-app-capable': 'yes' },
};

export default async function QuiosquePage() {
  await dbConnect();
  const initial = await kioskStateAction();
  return <KioskScreen initial={initial} />;
}
