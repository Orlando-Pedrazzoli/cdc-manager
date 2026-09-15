// 📄 src/lib/document-pdf.tsx
// =============================================================================
// CDC Manager — Geração de PDF A4 de documentos clínicos (Fase 5A)
// -----------------------------------------------------------------------------
// @react-pdf/renderer no servidor: cabeçalho da clínica, título, corpo
// (texto já com placeholders substituídos e editado pelo médico), rodapé
// com médico + cédula, linha de assinatura e, se existir, a assinatura do
// paciente (PNG). Devolve um Buffer para subir ao Cloudinary.
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

export interface ClinicHeader {
  name: string;
  legalName: string | null;
  nipc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}
export interface DocPdfInput {
  clinic: ClinicHeader;
  title: string;
  body: string;
  doctorName: string | null;
  doctorLicense: string | null;
  issuedAtLabel: string; // "Lisboa, 15 de setembro de 2026"
  patientSignatureDataUrl?: string | null;
  patientSignatureLabel?: string | null; // "O paciente" / "O representante legal"
  footerNote?: string | null;
}

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#1C2233',
    lineHeight: 1.45,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: '#1B2A6B',
    paddingBottom: 10,
    marginBottom: 22,
  },
  clinicName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#1B2A6B' },
  clinicMeta: { fontSize: 8.5, color: '#6A7186', marginTop: 2 },
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1B2A6B',
    textAlign: 'center',
    marginBottom: 18,
    letterSpacing: 0.5,
  },
  para: { marginBottom: 8, textAlign: 'justify' },
  bullet: { marginBottom: 3, paddingLeft: 10 },
  signatures: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
  },
  sigBox: { width: '45%', alignItems: 'center' },
  sigLine: {
    borderTopWidth: 0.8,
    borderTopColor: '#1C2233',
    width: '100%',
    marginTop: 44,
    paddingTop: 4,
  },
  sigLabel: { fontSize: 9, color: '#6A7186', textAlign: 'center' },
  sigName: { fontSize: 10, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  sigImg: { width: 150, height: 56, objectFit: 'contain', marginBottom: -40 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 56,
    right: 56,
    fontSize: 8,
    color: '#9AA1B4',
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#EEF1F8',
    paddingTop: 6,
  },
});

function Body({ text }: { text: string }) {
  // Primeira linha em maiúsculas repetida como título? Não — o título vem
  // separado; aqui só parágrafos. Linhas "• " viram bullets.
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every(l => l.trim().startsWith('•'))) {
          return (
            <View key={i} style={{ marginBottom: 8 }}>
              {lines.map((l, j) => (
                <Text key={j} style={s.bullet}>
                  {l.trim()}
                </Text>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={s.para}>
            {lines.join('\n')}
          </Text>
        );
      })}
    </>
  );
}

export function DocPdf({ input }: { input: DocPdfInput }) {
  const c = input.clinic;
  const meta = [
    c.legalName,
    c.nipc ? `NIPC ${c.nipc}` : null,
    c.address,
    [c.phone, c.email].filter(Boolean).join(' · ') || null,
  ].filter(Boolean);
  return (
    <Document title={input.title} author={c.name} language='pt-PT'>
      <Page size='A4' style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.clinicName}>{c.name}</Text>
            {meta.map((m, i) => (
              <Text key={i} style={s.clinicMeta}>
                {m}
              </Text>
            ))}
          </View>
        </View>

        <Text style={s.title}>{input.title.toUpperCase()}</Text>
        <Body text={input.body} />

        <View style={s.signatures} wrap={false}>
          <View style={s.sigBox}>
            <View style={s.sigLine}>
              <Text style={s.sigName}>{input.doctorName ?? c.name}</Text>
              <Text style={s.sigLabel}>
                {input.doctorLicense
                  ? `Médico(a) dentista · Cédula n.º ${input.doctorLicense}`
                  : 'Médico(a) dentista'}
              </Text>
            </View>
          </View>
          {(input.patientSignatureDataUrl || input.patientSignatureLabel) && (
            <View style={s.sigBox}>
              {input.patientSignatureDataUrl && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={input.patientSignatureDataUrl} style={s.sigImg} />
              )}
              <View style={s.sigLine}>
                <Text style={s.sigLabel}>
                  {input.patientSignatureLabel ?? 'O(a) paciente'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <Text style={{ marginTop: 18, fontSize: 10, color: '#6A7186' }}>
          {input.issuedAtLabel}
        </Text>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${input.footerNote ?? 'Documento emitido pelo CDC Manager'} · página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(input: DocPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<DocPdf input={input} />);
  return Buffer.from(buf);
}
