// 📄 src/lib/pay-statement-pdf.tsx
// =============================================================================
// CDC Manager — PDF do extrato de pagamento a um médico (8.ª ronda/14)
// -----------------------------------------------------------------------------
// A4 ao baixo: uma linha por ato ou estorno, os ajustes manuais e o total a
// pagar. Os valores vêm já calculados (lib/pay-statement-data.ts): o PDF não
// faz contas além das somas do rodapé.
// =============================================================================

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

export interface StatementRow {
  date: string;
  processNumber: string;
  patientName: string;
  description: string;
  priceCents: number;
  costCents: number;
  baseCents: number;
  rule: string;
  commissionCents: number;
  isAdjustment: boolean;
}

export interface StatementPdfInput {
  organization: string;
  legalLine: string | null;
  doctorName: string;
  monthLabel: string;
  /** null = as duas clínicas */
  clinicName: string | null;
  issuedAtLabel: string;
  rows: StatementRow[];
  manual: { description: string; amountCents: number }[];
  commissionCents: number;
  adjustmentsCents: number;
  payableCents: number;
}

// A fonte Helvetica do PDF não tem o sinal "−" nem o ponto "·": com eles o
// valor negativo saía sem sinal. Aqui usa-se sempre o hífen simples.
const eur = (c: number) =>
  `${c < 0 ? '-' : ''}${(Math.abs(c) / 100).toFixed(2).replace('.', ',')} €`;
const signed = (c: number) => `${c < 0 ? '-' : '+'} ${eur(Math.abs(c))}`;

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 46,
    paddingHorizontal: 36,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#1C2233',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: '#1B2A6B',
    paddingBottom: 8,
    marginBottom: 12,
  },
  org: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1B2A6B' },
  small: { fontSize: 8, color: '#6A7186', marginTop: 2 },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E4E8F3',
    paddingVertical: 3.5,
  },
  head: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1B2A6B',
    paddingBottom: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#4A5169',
  },
  cDate: { width: 52 },
  cNum: { width: 44 },
  cPatient: { width: 150, paddingRight: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cMoney: { width: 58, textAlign: 'right' },
  cRule: { width: 96, paddingLeft: 8 },
  section: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
  },
  totals: { marginTop: 14, alignSelf: 'flex-end', width: 260 },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  payable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    borderTopColor: '#1B2A6B',
    marginTop: 4,
    paddingTop: 6,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: '#9AA1B4',
    textAlign: 'center',
  },
});

function StatementPdf({ input }: { input: StatementPdfInput }) {
  return (
    <Document title={`Extrato ${input.doctorName} ${input.monthLabel}`}>
      <Page size='A4' orientation='landscape' style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.org}>{input.organization}</Text>
            {input.legalLine && <Text style={s.small}>{input.legalLine}</Text>}
          </View>
          <View>
            <Text style={s.title}>Extrato de pagamento</Text>
            <Text style={{ ...s.small, textAlign: 'right' }}>
              {input.doctorName} | {input.monthLabel}
            </Text>
            <Text style={{ ...s.small, textAlign: 'right' }}>
              {input.clinicName ?? 'Todas as clínicas'} | emitido a{' '}
              {input.issuedAtLabel}
            </Text>
          </View>
        </View>

        <View style={s.head} fixed>
          <Text style={s.cDate}>Data</Text>
          <Text style={s.cNum}>N.º</Text>
          <Text style={s.cPatient}>Paciente</Text>
          <Text style={s.cDesc}>Descrição</Text>
          <Text style={s.cMoney}>Cobrado</Text>
          <Text style={s.cMoney}>Custo</Text>
          <Text style={s.cMoney}>Valor real</Text>
          <Text style={s.cRule}>Regra</Text>
          <Text style={s.cMoney}>Remuneração</Text>
        </View>
        {input.rows.length === 0 && (
          <Text style={{ marginTop: 8, color: '#6A7186' }}>
            Sem atos nem estornos neste mês.
          </Text>
        )}
        {input.rows.map((r, i) => (
          <View
            key={i}
            style={{
              ...s.row,
              ...(r.isAdjustment ? { backgroundColor: '#FDF3F2' } : {}),
            }}
            wrap={false}
          >
            <Text style={s.cDate}>{r.date}</Text>
            <Text style={s.cNum}>{r.processNumber}</Text>
            <Text style={s.cPatient}>{r.patientName}</Text>
            <Text style={s.cDesc}>{r.description}</Text>
            <Text style={s.cMoney}>{eur(r.priceCents)}</Text>
            <Text style={s.cMoney}>{eur(r.costCents)}</Text>
            <Text style={s.cMoney}>{eur(r.baseCents)}</Text>
            <Text style={s.cRule}>{r.rule}</Text>
            <Text style={{ ...s.cMoney, fontFamily: 'Helvetica-Bold' }}>
              {eur(r.commissionCents)}
            </Text>
          </View>
        ))}

        {input.manual.length > 0 && (
          <View wrap={false}>
            <Text style={s.section}>Ajustes manuais</Text>
            {input.manual.map((m, i) => (
              <View key={i} style={s.row}>
                <Text style={s.cDesc}>{m.description}</Text>
                <Text style={{ ...s.cMoney, width: 90, fontFamily: 'Helvetica-Bold' }}>
                  {signed(m.amountCents)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.totals} wrap={false}>
          <View style={s.totalLine}>
            <Text>Remuneração dos atos</Text>
            <Text>{eur(input.commissionCents)}</Text>
          </View>
          <View style={s.totalLine}>
            <Text>Ajustes manuais</Text>
            <Text>{eur(input.adjustmentsCents)}</Text>
          </View>
          <View style={s.payable}>
            <Text>A pagar</Text>
            <Text>{eur(input.payableCents)}</Text>
          </View>
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Valor real = valor cobrado menos custo direto. Estornos são anulações, feitas neste mês, de atos de meses já fechados. Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderStatementPdf(
  input: StatementPdfInput,
): Promise<Buffer> {
  const buf = await renderToBuffer(<StatementPdf input={input} />);
  return Buffer.from(buf);
}
