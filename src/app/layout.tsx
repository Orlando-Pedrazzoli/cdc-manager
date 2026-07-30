// 📄 src/app/layout.tsx
// =============================================================================
// CDC Manager — Layout raiz da aplicação
// Metadata global (título da tab, descrição, favicon) + fonte + Toaster.
// =============================================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'CDC Manager — Centro Dentário Colombo',
    template: '%s · CDC Manager',
  },
  description:
    'Sistema de gestão do Centro Dentário Colombo: pacientes, agendas, consultas, faturação e stocks.',
  robots: { index: false, follow: false }, // sistema interno: fora dos motores de busca
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='pt-PT'>
      <body className={`${inter.className} antialiased`}>
        {children}
        <Toaster position='top-right' />
      </body>
    </html>
  );
}
