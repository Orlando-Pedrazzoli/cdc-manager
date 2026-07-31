// 📄 src/components/ui/Table.tsx
// =============================================================================
// CDC Manager — UI: Table
// -----------------------------------------------------------------------------
// Tabela composável para as listagens do admin (estilo Dentoral melhorado:
// densa, legível, com hover). Presentacional — funciona em Server Components,
// por isso a listagem de pacientes pode ser 100% server-rendered.
//
// Uso:
//   <Table>
//     <THead><TR><TH>Nº</TH><TH>Nome</TH></TR></THead>
//     <TBody>
//       <TR hover><TD>861</TD><TD>Maria Silva</TD></TR>
//     </TBody>
//   </Table>
// =============================================================================

import type { ReactNode, HTMLAttributes } from 'react';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '12px',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px',
        }}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead style={{ backgroundColor: '#F4F6FB' }}>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  hover = false,
  ...rest
}: {
  children: ReactNode;
  hover?: boolean;
} & HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={hover ? 'transition-colors hover:bg-[#F8FAFF]' : undefined}
      style={{
        borderBottom: '1px solid #F0F2F7',
        cursor: rest.onClick ? 'pointer' : undefined,
      }}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  align = 'left',
  width,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
}) {
  return (
    <th
      style={{
        padding: '10px 14px',
        textAlign: align,
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        color: '#6A7186',
        whiteSpace: 'nowrap',
        width,
      }}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  align = 'left',
  ...rest
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
} & HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      style={{
        padding: '11px 14px',
        textAlign: align,
        color: '#1B2A6B',
        verticalAlign: 'middle',
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

/** Estado vazio consistente para todas as listagens */
export function TableEmpty({
  colSpan,
  message = 'Sem resultados.',
}: {
  colSpan: number;
  message?: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: '40px 14px',
          textAlign: 'center',
          color: '#9AA1B4',
          fontSize: '14px',
        }}
      >
        {message}
      </td>
    </tr>
  );
}
