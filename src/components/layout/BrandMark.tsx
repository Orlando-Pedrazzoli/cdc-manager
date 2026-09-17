// 📄 src/components/layout/BrandMark.tsx
// =============================================================================
// CDC Manager — Layout: marca (logo + nome da app) para sidebars e barras
// -----------------------------------------------------------------------------
// Componente puro (funciona em server e client). Recebe a marca já lida do
// Organization pelo layout. <img> em vez de next/image porque o logo pode
// ser um URL externo (Cloudinary/cliente) sem remotePatterns configurados.
// =============================================================================

import Link from 'next/link';
import { Building2 } from 'lucide-react';

export type BrandMarkProps = {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
};

export function BrandMark({
  brand,
  href,
  subtitle,
  size = 28,
  onClick,
}: {
  brand: BrandMarkProps;
  href: string;
  subtitle?: string;
  size?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 8,
          height: size + 8,
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt=''
            width={size}
            height={size}
            style={{ display: 'block', objectFit: 'contain' }}
          />
        ) : (
          <Building2 size={size - 6} style={{ color: brand.primaryColor }} />
        )}
      </span>
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          lineHeight: 1.2,
          minWidth: 0,
        }}
      >
        <span
          style={{
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {brand.appName}
        </span>
        {subtitle && (
          <span
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
    </Link>
  );
}
