// 📄 src/components/relatorios/ExportCsvButton.tsx
// =============================================================================
// CDC Manager — Relatórios: botão "Exportar CSV"
// -----------------------------------------------------------------------------
// Client fino e genérico: recebe cabeçalhos + linhas já calculadas no server
// e descarrega um .csv no browser — sem route handler, sem nova query.
// CSV em ; (padrão Excel PT) com BOM UTF-8 para acentos abrirem bem.
// Valores monetários devem vir como string já formatada ("123,45") para o
// Excel PT reconhecer o decimal.
// =============================================================================

'use client';

import { Download } from 'lucide-react';

function csvEscape(v: string): string {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: string[][];
}) {
  const download = () => {
    const lines = [headers, ...rows]
      .map(r => r.map(csvEscape).join(';'))
      .join('\r\n');
    // BOM para o Excel abrir UTF-8 (acentos) sem passos extra
    const blob = new Blob([`\uFEFF${lines}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type='button'
      onClick={download}
      disabled={rows.length === 0}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: '1px solid #D8DEEF',
        borderRadius: '8px',
        padding: '6px 12px',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1B2A6B',
        backgroundColor: '#FFFFFF',
        cursor: rows.length === 0 ? 'default' : 'pointer',
        opacity: rows.length === 0 ? 0.5 : 1,
      }}
    >
      <Download size={14} />
      Exportar CSV
    </button>
  );
}
