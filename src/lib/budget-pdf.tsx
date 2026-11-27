// 📄 src/lib/budget-pdf.tsx
// =============================================================================
// CDC Manager — PDF A4 do orçamento para entregar ao paciente (27/11/2026)
// Cabeçalho igual ao dos documentos clínicos (logo + clínica). As contas vêm
// feitas de lib/budget-print.ts; aqui só se desenha.
// =============================================================================

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import {
  type BudgetPrintRow,
  type BudgetPrintTotals,
  budgetHasPhases,
  eurPdf,
} from '@/lib/budget-print';

export interface BudgetPdfInput {
  clinic: {
    name: string;
    legalName: string | null;
    nipc: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  logoDataUrl?: string | null;
  /** "n.º 123" ou null (rascunho) */
  numberLabel: string | null;
  isDraft: boolean;
  title: string;
  patientName: string;
  patientNumber: string | null;
  doctorName: string | null;
  doctorLicense: string | null;
  dateLabel: string; // data do orçamento (entrega ou criação)
  validUntilLabel: string | null;
  rows: BudgetPrintRow[];
  totals: BudgetPrintTotals;
  notes: string | null;
  issuedAtLabel: string; // "Lisboa, 27 de novembro de 2026"
}

const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 60,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1C2233',
    lineHeight: 1.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#1B2A6B',
    paddingBottom: 10,
    marginBottom: 16,
  },
  logo: { width: 46, height: 46, marginRight: 12, objectFit: 'contain' },
  clinicName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
    marginBottom: 5,
  },
  clinicMeta: { fontSize: 8.5, color: '#6A7186' },
  title: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
    marginBottom: 6,
  },
  draft: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#B3261E',
    marginTop: 2,
  },
  infoRow: { flexDirection: 'row', marginTop: 12, marginBottom: 14 },
  infoBox: { flex: 1, paddingRight: 10 },
  label: { fontSize: 8, color: '#6A7186', textTransform: 'uppercase' },
  value: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  small: { fontSize: 9, color: '#3D4257' },
  th: {
    flexDirection: 'row',
    backgroundColor: '#EEF1F8',
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#3D4257',
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E3E7F2',
  },
  phase: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
    backgroundColor: '#F6F8FD',
  },
  cDesc: { flex: 1, paddingRight: 8 },
  cNum: { width: 68, textAlign: 'right' },
  note: { fontSize: 8.5, color: '#6A7186' },
  totals: { marginTop: 10, alignSelf: 'flex-end', width: 240 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1B2A6B',
    marginTop: 4,
    paddingTop: 5,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
  },
  notes: { marginTop: 18 },
  footer: {
    position: 'absolute',
    bottom: 26,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#9AA1B4',
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#EEF1F8',
    paddingTop: 6,
  },
});

export function BudgetPdf({ input }: { input: BudgetPdfInput }) {
  const c = input.clinic;
  const meta = [
    c.legalName,
    c.nipc ? `NIPC ${c.nipc}` : null,
    c.address,
    [c.phone, c.email].filter(Boolean).join(' · ') || null,
  ].filter(Boolean);
  const phases = budgetHasPhases(input.rows);
  const hasDiscount = input.rows.some(r => r.discountCents > 0);
  return (
    <Document title={`Orçamento ${input.numberLabel ?? ''}`.trim()} author={c.name} language='pt-PT'>
      <Page size='A4' style={s.page}>
        <View style={s.header} fixed>
          {input.logoDataUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={input.logoDataUrl} style={s.logo} />
          )}
          <View>
            <Text style={s.clinicName}>{c.name}</Text>
            {meta.map((m, i) => (
              <Text key={i} style={s.clinicMeta}>
                {m}
              </Text>
            ))}
          </View>
        </View>

        <Text style={s.title}>
          ORÇAMENTO{input.numberLabel ? ` ${input.numberLabel}` : ''}
        </Text>
        {input.isDraft && (
          <Text style={s.draft}>RASCUNHO — ainda não entregue ao paciente</Text>
        )}
        <Text style={s.small}>{input.title}</Text>

        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.label}>Paciente</Text>
            <Text style={s.value}>{input.patientName}</Text>
            {input.patientNumber && (
              <Text style={s.small}>N.º do paciente: {input.patientNumber}</Text>
            )}
          </View>
          <View style={s.infoBox}>
            <Text style={s.label}>Médico(a) dentista</Text>
            <Text style={s.value}>{input.doctorName ?? '—'}</Text>
            {input.doctorLicense && (
              <Text style={s.small}>OMD n.º {input.doctorLicense}</Text>
            )}
          </View>
          <View style={{ width: 120 }}>
            <Text style={s.label}>Data</Text>
            <Text style={s.value}>{input.dateLabel}</Text>
            {input.validUntilLabel && (
              <Text style={s.small}>Válido até {input.validUntilLabel}</Text>
            )}
          </View>
        </View>

        <View style={s.th} fixed>
          <Text style={s.cDesc}>Tratamento</Text>
          {hasDiscount && <Text style={s.cNum}>Preço</Text>}
          {hasDiscount && <Text style={s.cNum}>Desconto</Text>}
          <Text style={s.cNum}>Valor</Text>
        </View>
        {input.rows.map((r, i) => {
          const showPhase =
            phases && (i === 0 || input.rows[i - 1].phase !== r.phase);
          return (
            <View key={i} wrap={false}>
              {showPhase && <Text style={s.phase}>Fase {r.phase}</Text>}
              <View style={s.tr}>
                <View style={s.cDesc}>
                  <Text>{r.description}</Text>
                  {r.note && <Text style={s.note}>{r.note}</Text>}
                </View>
                {hasDiscount && (
                  <Text style={s.cNum}>
                    {r.listCents != null ? eurPdf(r.listCents) : ''}
                  </Text>
                )}
                {hasDiscount && (
                  <Text style={s.cNum}>
                    {r.discountCents > 0 ? `-${eurPdf(r.discountCents)}` : ''}
                  </Text>
                )}
                <Text style={s.cNum}>{eurPdf(r.valueCents)}</Text>
              </View>
            </View>
          );
        })}

        <View style={s.totals} wrap={false}>
          {input.totals.discountCents > 0 && (
            <>
              <View style={s.totalRow}>
                <Text>Soma dos tratamentos</Text>
                <Text>{eurPdf(input.totals.grossCents)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text>Desconto</Text>
                <Text>-{eurPdf(input.totals.discountCents)}</Text>
              </View>
            </>
          )}
          <View style={s.grand}>
            <Text>Total</Text>
            <Text>{eurPdf(input.totals.totalCents)}</Text>
          </View>
        </View>

        {input.notes && (
          <View style={s.notes} wrap={false}>
            <Text style={s.label}>Observações</Text>
            <Text>{input.notes}</Text>
          </View>
        )}

        <Text style={{ marginTop: 22, fontSize: 9.5, color: '#6A7186' }}>
          {input.issuedAtLabel}
        </Text>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Orçamento emitido pelo CDC Manager · página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderBudgetPdf(input: BudgetPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<BudgetPdf input={input} />);
  return Buffer.from(buf);
}
