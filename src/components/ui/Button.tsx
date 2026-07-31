// 📄 src/components/ui/Button.tsx
// =============================================================================
// CDC Manager — UI: Button
// -----------------------------------------------------------------------------
// Botão base do sistema. SEM 'use client': não tem hooks, por isso funciona
// em Server e Client Components (formulários com formAction incluídos).
//
// Convenção do projeto: cores/padding/radius INLINE (style) — o Tailwind v4
// com Next 16 dropa classes utilitárias em produção de forma silenciosa.
// =============================================================================

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_STYLES: Record<
  ButtonVariant,
  { backgroundColor: string; color: string; border: string }
> = {
  primary: {
    backgroundColor: '#2743A6',
    color: '#FFFFFF',
    border: '1px solid #2743A6',
  },
  secondary: {
    backgroundColor: '#EAF0FF',
    color: '#1B2A6B',
    border: '1px solid #EAF0FF',
  },
  outline: {
    backgroundColor: '#FFFFFF',
    color: '#1B2A6B',
    border: '1px solid #D8DEEF',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#2743A6',
    border: '1px solid transparent',
  },
  danger: {
    backgroundColor: '#B3261E',
    color: '#FFFFFF',
    border: '1px solid #B3261E',
  },
};

const SIZE_STYLES: Record<
  ButtonSize,
  { padding: string; fontSize: string; borderRadius: string; gap: string }
> = {
  sm: {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '8px',
    gap: '6px',
  },
  md: {
    padding: '9px 18px',
    fontSize: '14px',
    borderRadius: '8px',
    gap: '8px',
  },
  lg: {
    padding: '12px 24px',
    fontSize: '15px',
    borderRadius: '10px',
    gap: '8px',
  },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  type = 'button',
  ...rest
}: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className='inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2'
      style={{
        ...v,
        ...s,
        width: fullWidth ? '100%' : undefined,
        opacity: isDisabled ? 0.6 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <Loader2
          className='animate-spin'
          style={{ width: 16, height: 16, marginRight: 6 }}
        />
      )}
      {children}
    </button>
  );
}
