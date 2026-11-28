// 📄 src/lib/rx-report-issue.ts
// =============================================================================
// CDC Manager — Emissão do relatório da radiografia em PDF (ponto 31)
// -----------------------------------------------------------------------------
// NÃO é server action (sem 'use server'): é chamada por actions/rx.ts depois
// de a sessão e a posse da consulta terem sido verificadas.
// Gera o PDF com o layout dos documentos da clínica (cabeçalho, médico,
// cédula, assinatura em imagem) e regista-o na ficha, na categoria
// "Radiografia", ligado à consulta do pedido.
// =============================================================================

import mongoose from 'mongoose';
import ClinicalDocument from '@/models/Document';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import { renderDocumentPdf } from '@/lib/document-pdf';
import { documentLogoDataUrl } from '@/lib/document-logo';
import { doctorSignatureDataUrl } from '@/lib/document-signature';
import { longDatePt, placeFromAddress, shortDatePt } from '@/lib/document-merge';
import { patientDocumentKey, uploadPdf } from '@/lib/storage';
import { RX_MODALITY_LABEL } from '@/lib/domain';
import { rxReportBody, rxReportTitle } from '@/lib/rx-report';

type Id = mongoose.Types.ObjectId | string;

export async function issueRxReportDocument(params: {
  request: {
    patientId: Id;
    clinicId: Id;
    doctorId: Id;
    appointmentId: Id;
    modality: string;
    toothNumbers?: string[] | null;
    notes?: string | null;
    completedAt?: Date | null;
    requestedAt?: Date | null;
  };
  findings: string;
  userId: string;
}): Promise<{ documentId: string; title: string }> {
  const r = params.request;
  const [patient, doctor, clinics] = await Promise.all([
    Patient.findById(r.patientId).select('name processNumber').lean(),
    Doctor.findById(r.doctorId)
      .select('name fullName licenseNumber signatureUpdatedAt')
      .lean(),
    getActiveClinics(),
  ]);
  if (!patient) throw new Error('Paciente não encontrado.');
  const clinic =
    clinics.find(c => String(c._id) === String(r.clinicId)) ?? clinics[0];

  const modalityLabel =
    RX_MODALITY_LABEL[r.modality as keyof typeof RX_MODALITY_LABEL] ?? r.modality;
  const teeth = (r.toothNumbers ?? []) as string[];
  const title = rxReportTitle(modalityLabel, teeth);
  const now = new Date();
  const examDate = r.completedAt ?? r.requestedAt ?? now;

  const pdf = await renderDocumentPdf({
    logoDataUrl: await documentLogoDataUrl(),
    clinic: {
      name: clinic?.name ?? 'Centro Dentário Colombo',
      legalName: clinic?.legalName ?? null,
      nipc: clinic?.nipc ?? null,
      address: clinic?.address ?? null,
      phone: clinic?.phone ?? null,
      email: clinic?.email ?? null,
    },
    title,
    body: rxReportBody({
      patientName: patient.name,
      processNumber: patient.processNumber ?? null,
      modalityLabel,
      teeth,
      examDateLabel: longDatePt(examDate),
      requestNotes: r.notes ?? null,
      findings: params.findings,
    }),
    doctorName: doctor ? doctor.fullName || doctor.name : null,
    doctorLicense: doctor?.licenseNumber ?? null,
    doctorSignatureDataUrl: doctor?.signatureUpdatedAt
      ? await doctorSignatureDataUrl(String(doctor._id))
      : null,
    issuedAtLabel: `${placeFromAddress(clinic?.address)}, ${longDatePt(now)}`,
  });

  const docId = new mongoose.Types.ObjectId();
  const publicId = patientDocumentKey(String(docId));
  const asset = await uploadPdf(publicId, pdf);
  await ClinicalDocument.create({
    _id: docId,
    patientId: patient._id,
    category: 'xray',
    title: `${title} — ${shortDatePt(examDate)}`,
    publicId,
    resourceType: 'image',
    format: asset.format ?? 'pdf',
    bytes: asset.bytes,
    visibleToPatient: false,
    uploadedByUserId: params.userId,
    appointmentId: r.appointmentId,
    note: `Relatório da radiografia${doctor ? ` por ${doctor.name}` : ''}`,
  });
  return { documentId: String(docId), title };
}
