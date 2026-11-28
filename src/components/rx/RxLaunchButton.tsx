// 📄 src/components/rx/RxLaunchButton.tsx
// =============================================================================
// CDC Manager — Raio-X: botões "Abrir no iRYS" e "Abrir no Kodak"
// -----------------------------------------------------------------------------
// Abrem o paciente no software de imagem do posto, como os botões MyRay e
// Kodak do Dentoral. São ligações `cdcrx://` — quem as executa é o lançador
// instalado no posto (public/rx-agent). Num posto sem lançador o clique não
// faz nada; por isso o texto de ajuda no `title`.
//
//   · iRYS  — precisa do n.º de processo (o código é P + processo)
//   · Kodak — precisa da pasta do paciente (Patient.kodakFolder, migrada da
//             rx_kodak do Dentoral). Sem pasta usa a pasta nova do CDC
//             Manager (lib/rx-launch.kodakNewFolder) — 1.ª radiografia.
//
// SEM 'use client': não têm hooks, servem em Server e Client Components.
// Visual 100% inline (convenção do projeto).
// =============================================================================

import type { ReactNode } from 'react';
import { Scan, ScanLine } from 'lucide-react';
import { irysLaunchUrl, kodakFolderFor, kodakLaunchUrl } from '@/lib/rx-launch';

type Size = 'sm' | 'md';

function LaunchLink({
  href,
  title,
  size,
  children,
}: {
  href: string;
  title: string;
  size: Size;
  children: ReactNode;
}) {
  const sm = size === 'sm';
  return (
    <a
      href={href}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sm ? '6px' : '8px',
        padding: sm ? '6px 12px' : '9px 18px',
        fontSize: sm ? '13px' : '14px',
        fontWeight: 600,
        borderRadius: '8px',
        backgroundColor: '#EAF0FF',
        color: '#1B2A6B',
        border: '1px solid #EAF0FF',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </a>
  );
}

/** Abre o paciente no iRYS (MyRay). Sem n.º de processo não aparece. */
export function RxLaunchButton({
  processNumber,
  name,
  size = 'md',
}: {
  processNumber: number | null;
  name: string;
  size?: Size;
}) {
  const url = irysLaunchUrl({ processNumber, name });
  if (!url) return null;
  return (
    <LaunchLink
      href={url}
      size={size}
      title='Abre este paciente no iRYS (MyRay) deste posto. Requer o lançador CDC RX instalado.'
    >
      <ScanLine size={size === 'sm' ? 14 : 15} />
      Abrir no iRYS
    </LaunchLink>
  );
}

/**
 * Abre o paciente no Kodak (CS Imaging). Com pasta do Dentoral abre essa;
 * sem pasta usa a pasta nova do CDC Manager (1.ª radiografia) — precisa do
 * n.º de processo. Sem um nem outro, não aparece.
 */
export function KodakLaunchButton({
  kodakFolder,
  processNumber = null,
  name,
  size = 'md',
}: {
  kodakFolder: string | null;
  processNumber?: number | null;
  name: string;
  size?: Size;
}) {
  const target = kodakFolderFor({ folder: kodakFolder, processNumber });
  const url = kodakLaunchUrl({ folder: kodakFolder, processNumber, name });
  if (!url || !target) return null;
  return (
    <LaunchLink
      href={url}
      size={size}
      title={
        target.isNew
          ? `Abre este paciente no Kodak (CS Imaging) deste posto — pasta nova ${target.folder}, criada pelo Kodak na 1.ª radiografia. Requer o lançador CDC RX instalado.`
          : `Abre este paciente no Kodak (CS Imaging) deste posto — pasta ${target.folder}. Requer o lançador CDC RX instalado.`
      }
    >
      <Scan size={size === 'sm' ? 14 : 15} />
      Abrir no Kodak
    </LaunchLink>
  );
}

/** Os dois botões lado a lado (cada um só aparece se tiver dados) */
export function RxLaunchButtons({
  processNumber,
  kodakFolder,
  name,
  size = 'md',
}: {
  processNumber: number | null;
  kodakFolder: string | null;
  name: string;
  size?: Size;
}) {
  return (
    <>
      <KodakLaunchButton
        kodakFolder={kodakFolder}
        processNumber={processNumber}
        name={name}
        size={size}
      />
      <RxLaunchButton processNumber={processNumber} name={name} size={size} />
    </>
  );
}
