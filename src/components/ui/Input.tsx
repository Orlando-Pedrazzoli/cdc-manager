// 📄 src/components/ui/Input.tsx
// =============================================================================
// CDC Manager — UI: Input (+ Textarea + Select + Checkbox)
// -----------------------------------------------------------------------------
// Campos de formulário com label, ícone opcional e mensagem de erro,
// no vocabulário visual das páginas de auth. Sem 'use client' — são
// presentacionais e funcionam dentro de qualquer formulário.
// =============================================================================

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const FIELD_BORDER = '#D8DEEF';
const FIELD_TEXT = '#1B2A6B';
const LABEL_COLOR = '#3A3F4A';
const ERROR_COLOR = '#B3261E';
const HELP_COLOR = '#6A7186';

const baseFieldStyle = {
  width: '100%',
  borderRadius: '8px',
  border: `1px solid ${FIELD_BORDER}`,
  padding: '9px 12px',
  fontSize: '14px',
  color: FIELD_TEXT,
  backgroundColor: '#FFFFFF',
} as const;

function FieldShell({
  label,
  htmlFor,
  error,
  help,
  children,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{ fontSize: '13px', fontWeight: 500, color: LABEL_COLOR }}
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p style={{ fontSize: '12px', color: ERROR_COLOR, margin: 0 }}>
          {error}
        </p>
      ) : help ? (
        <p style={{ fontSize: '12px', color: HELP_COLOR, margin: 0 }}>{help}</p>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  help?: string;
  icon?: ReactNode; // ex.: <Mail size={16} />
}

export function Input({
  label,
  error,
  help,
  icon,
  id,
  style,
  ...rest
}: InputProps) {
  return (
    <FieldShell label={label} htmlFor={id} error={error} help={help}>
      <div style={{ position: 'relative' }}>
        {icon && (
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9AA1B4',
              display: 'inline-flex',
              pointerEvents: 'none',
            }}
          >
            {icon}
          </span>
        )}
        <input
          id={id}
          className='outline-none focus:ring-2'
          style={{
            ...baseFieldStyle,
            paddingLeft: icon ? 38 : 12,
            borderColor: error ? ERROR_COLOR : FIELD_BORDER,
            ...style,
          }}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

// -----------------------------------------------------------------------------
// Textarea
// -----------------------------------------------------------------------------
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  help?: string;
}

export function Textarea({
  label,
  error,
  help,
  id,
  style,
  rows = 3,
  ...rest
}: TextareaProps) {
  return (
    <FieldShell label={label} htmlFor={id} error={error} help={help}>
      <textarea
        id={id}
        rows={rows}
        className='outline-none focus:ring-2'
        style={{
          ...baseFieldStyle,
          resize: 'vertical',
          borderColor: error ? ERROR_COLOR : FIELD_BORDER,
          ...style,
        }}
        {...rest}
      />
    </FieldShell>
  );
}

// -----------------------------------------------------------------------------
// Select
// -----------------------------------------------------------------------------
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  help?: string;
  children: ReactNode;
}

export function Select({
  label,
  error,
  help,
  id,
  style,
  children,
  ...rest
}: SelectProps) {
  return (
    <FieldShell label={label} htmlFor={id} error={error} help={help}>
      <select
        id={id}
        className='outline-none focus:ring-2'
        style={{
          ...baseFieldStyle,
          borderColor: error ? ERROR_COLOR : FIELD_BORDER,
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

// -----------------------------------------------------------------------------
// Checkbox (com label à direita — consents RGPD, flags)
// -----------------------------------------------------------------------------
export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  help?: string;
}

export function Checkbox({ label, help, id, style, ...rest }: CheckboxProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <input
        id={id}
        type='checkbox'
        style={{
          width: 16,
          height: 16,
          marginTop: 2,
          accentColor: '#2743A6',
          cursor: 'pointer',
          ...style,
        }}
        {...rest}
      />
      <div>
        <label
          htmlFor={id}
          style={{
            fontSize: '13px',
            color: LABEL_COLOR,
            cursor: 'pointer',
            display: 'block',
          }}
        >
          {label}
        </label>
        {help && (
          <p style={{ fontSize: '12px', color: HELP_COLOR, margin: '2px 0 0' }}>
            {help}
          </p>
        )}
      </div>
    </div>
  );
}
